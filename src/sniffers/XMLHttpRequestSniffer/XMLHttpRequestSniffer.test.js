import XMLHttpRequestSniffer from './XMLHttpRequestSniffer';

const DUMMY_DATA = {
    url: 'dummy.com',
    method: 'GET',
    requestHeaders: {
        accept: 'application/json',
    },
    responseHeaders: {
        'content-type': 'application/json',
    },
    duration: 13.37,
    pageRef: 'page_0',
    status: 200,
    responseBody: JSON.stringify({ dummy: 'content' }),
};

const EVENT_KEY = 'performance';

const originalXMLHttpRequestOpen = XMLHttpRequest.prototype.open;
const originalXMLHttpRequestSetHeaders = XMLHttpRequest.prototype.setRequestHeader;
const originalXMLHttpRequestSend = XMLHttpRequest.prototype.send;

const makeRequest = (
    waitForPerformance = 0,
    waitForResponse = 0,
    url = DUMMY_DATA.url
) => {
    const xhr = new XMLHttpRequest();
    xhr.open(DUMMY_DATA.method, url);
    Object.keys(DUMMY_DATA.requestHeaders).forEach((headerKey) => {
        xhr.setRequestHeader(headerKey, DUMMY_DATA.requestHeaders[headerKey]);
    });
    const onreadystatechange = jest.fn();
    xhr.onreadystatechange = onreadystatechange;
    xhr.send({ waitForPerformance, waitForResponse });

    return { onreadystatechange };
};

const mockPerformanceList = (url) => ({
    getEntries: () => [
        {
            duration: DUMMY_DATA.duration,
            name: url,
            initiatorType: 'xmlhttprequest',
        },
    ],
});

describe('XMLHttpRequestSniffer', () => {
    const setup = () => {
        const setRequestHeader = jest.fn();
        const open = jest.fn();

        const send = jest.fn(function ({
            waitForPerformance,
            waitForResponse,
        }) {
            setTimeout(() => {
                const event = new Event(EVENT_KEY);
                event.payload = mockPerformanceList(this.url);
                dispatchEvent(event);
            }, waitForPerformance);

            setTimeout(() => {
                Object.defineProperty(this, 'readyState', {
                    value: 4,
                    enumerable: true,
                });

                Object.defineProperty(this, 'responseURL', {
                    value: this.url,
                    enumerable: true,
                });

                Object.defineProperty(this, 'responseText', {
                    value: DUMMY_DATA.responseBody,
                    enumerable: true,
                });

                Object.defineProperty(this, 'status', {
                    value: DUMMY_DATA.status,
                    enumerable: true,
                });

                Object.defineProperty(this, 'getAllResponseHeaders', {
                    value: () => Object.keys(DUMMY_DATA.responseHeaders).reduce(
                        (acc, current) => {
                            let newAcc = acc;
                            newAcc += `${current}: `;
                            newAcc += `${DUMMY_DATA.responseHeaders[current]}\r\n`;
                            return newAcc;
                        },
                        ''
                    ),
                    enumerable: true,
                });
                this.onreadystatechange();
            }, waitForResponse);
        });
        const onreadystatechange = jest.fn();

        XMLHttpRequest.prototype.setRequestHeader = setRequestHeader;
        XMLHttpRequest.prototype.open = open;
        XMLHttpRequest.prototype.send = send;

        const performanceObserverMock = {
            observe: jest.fn(),
        };

        window.PerformanceObserver = jest.fn((cb) => {
            window.addEventListener(EVENT_KEY, ({ payload }) => {
                cb(payload);
            });
            return performanceObserverMock;
        });

        const addResource = jest.fn();
        const getCurentPageRef = jest.fn(() => DUMMY_DATA.pageRef);

        const service = new XMLHttpRequestSniffer({ addResource, getCurentPageRef });

        return {
            service,
            addResource,
            getCurentPageRef,
            xhrMock: {
                setRequestHeader, open, send, onreadystatechange,
            },
            performanceObserverMock,
        };
    };

    beforeEach(() => {
        XMLHttpRequest.prototype.open = originalXMLHttpRequestOpen;
        XMLHttpRequest.prototype.setRequestHeader = originalXMLHttpRequestSetHeaders;
        XMLHttpRequest.prototype.send = originalXMLHttpRequestSend;
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.runAllTimers();
    });

    afterAll(() => {
        jest.useRealTimers();
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        const { service } = setup();
        expect(service).toBeDefined();
    });

    it('original XMLHttpRequest open shoud be called', () => {
        const { xhrMock } = setup();
        makeRequest();
        expect(xhrMock.open).toBeCalled();
    });

    it('original XMLHttpRequest send shoud be called', () => {
        const { xhrMock } = setup();
        makeRequest();
        expect(xhrMock.send).toBeCalled();
    });

    it('original XMLHttpRequest setRequestHeader shoud be called', () => {
        const { xhrMock } = setup();
        makeRequest();
        expect(xhrMock.setRequestHeader).toBeCalled();
    });
    it('original XMLHttpRequest onreadystatechange shoud be called', () => {
        setup();
        const { onreadystatechange } = makeRequest();
        jest.runAllTimers();
        expect(onreadystatechange).toBeCalled();
    });

    it('when only request is ended but performance not yet, should collect data in onProcess', () => {
        const { service } = setup();
        makeRequest(500, 100);
        jest.advanceTimersByTime(200);
        expect(service.resourcesToProcess.length).toBe(1);
        expect(service.resourcesToProcess[0]).toHaveProperty('request');
        expect(service.resourcesToProcess[0]).toHaveProperty('response');
        expect(service.resourcesToProcess[0]).toHaveProperty('pageRef');
        expect(service.resourcesToProcess[0]).not.toHaveProperty('performance');
    });

    it('when only performance is ended but request not yet, should collect data in onProcess', () => {
        const { service } = setup();
        makeRequest(100, 500);
        jest.advanceTimersByTime(200);
        expect(service.resourcesToProcess.length).toBe(1);
        expect(service.resourcesToProcess[0]).toHaveProperty('performance');
        expect(service.resourcesToProcess[0]).not.toHaveProperty('request');
        expect(service.resourcesToProcess[0]).not.toHaveProperty('response');
        expect(service.resourcesToProcess[0]).not.toHaveProperty('pageRef');
    });

    it('when both request and performance are ready it should call addResouce', () => {
        const { addResource } = setup();
        makeRequest(100, 500);
        jest.runAllTimers();
        expect(addResource).toBeCalled();
    });

    it('when both request and performance are ready it should remove from on process', () => {
        const { service } = setup();
        makeRequest(100, 500);
        jest.runAllTimers();
        expect(service.resourcesToProcess.length).toBe(0);
    });

    it('should not merge performance and request with different url', () => {
        const { service } = setup();
        makeRequest(1000, 500);
        makeRequest(100, 5000, 'dummy.eu');
        jest.advanceTimersByTime(600);
        expect(service.resourcesToProcess.length).toBe(2);
    });

    it('addResouce should be called with properData', () => {
        const { addResource } = setup();
        makeRequest(100, 500);
        jest.runAllTimers();
        expect(addResource).toBeCalledWith(
            expect.objectContaining({
                pageRef: DUMMY_DATA.pageRef,
                performance: expect.objectContaining({
                    duration: DUMMY_DATA.duration,
                    name: DUMMY_DATA.url,
                }),
                request: expect.objectContaining({
                    headers: DUMMY_DATA.requestHeaders,
                    method: DUMMY_DATA.method,
                    url: DUMMY_DATA.url,
                }),
                response: expect.objectContaining({
                    headers: DUMMY_DATA.responseHeaders,
                    body: DUMMY_DATA.responseBody,
                    status: DUMMY_DATA.status,
                    url: DUMMY_DATA.url,
                }),
            })
        );
    });
});

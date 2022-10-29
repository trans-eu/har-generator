const REQUEST_KEYS_MAP = {
    headers: 'headers',
    body: 'body',
    responseURL: 'url',
    method: 'method',
};

const RESPONSE_KEYS_MAP = {
    responseText: 'body',
    responseURL: 'url',
    status: 'status',
    responseHeaders: 'headers',
};

const parse = (resource) => {
    const props = [];

    for (const prop in resource) { // eslint-disable-line no-restricted-syntax
        if (
            [
                ...Object.keys(REQUEST_KEYS_MAP),
                ...Object.keys(RESPONSE_KEYS_MAP),
            ].indexOf(prop) > -1
        ) {
            props.push(prop);
        }
    }

    const parsedResource = JSON.parse(JSON.stringify(resource, props));
    const request = {};
    const response = {};

    Object.keys(REQUEST_KEYS_MAP).forEach((key) => {
        request[REQUEST_KEYS_MAP[key]] = parsedResource[key];
    });
    Object.keys(RESPONSE_KEYS_MAP).forEach((key) => {
        response[RESPONSE_KEYS_MAP[key]] = parsedResource[key];
    });

    request.headers = { ...resource.headers };
    response.headers = resource
        .getAllResponseHeaders()
        .split('\r\n')
        .reduce((acc, current) => {
            const [key, value] = current.split(': ');
            acc[key] = value;
            return acc;
        }, {});

    return { request, response };
};

class XMLHttpRequestSniffer {
    resourcesToProcess = [];

    constructor({ addResource, getCurentPageRef }) {
        this.addResource = addResource;
        this.getCurentPageRef = getCurentPageRef;

        this.originalSetHeaders = XMLHttpRequest.prototype.setRequestHeader;
        this.originalOpen = XMLHttpRequest.prototype.open;
        this.originalSend = XMLHttpRequest.prototype.send;

        this.startObservingPerformance();
        this.sniffHeaders();
        this.sniffOpen();
        this.sniffSend();
    }

    startObservingPerformance() {
        this.performanceObserver = new PerformanceObserver((list) => {
            list.getEntries()
                .filter(
                    (resource) => resource.initiatorType === 'xmlhttprequest'
                )
                .forEach((performanceEntry) => {
                    this.handlePerformance(performanceEntry);
                });
        });
        this.performanceObserver.observe({ entryTypes: ['resource'] });
    }

    sniffHeaders() {
        const prevThis = this;

        window.XMLHttpRequest.prototype.setRequestHeader = function (
            header,
            value
        ) {
            prevThis.originalSetHeaders.call(this, header, value);
            if (!this.headers) {
                this.headers = {};
            }

            this.headers[header.toLowerCase()] = value;
        };
    }

    sniffOpen() {
        const prevThis = this;

        window.XMLHttpRequest.prototype.open = function (method, url, ...rest) {
            prevThis.originalOpen.call(this, method, url, ...rest);

            this.method = method;
            this.url = url;
        };
    }

    sniffSend() {
        const prevThis = this;
        window.XMLHttpRequest.prototype.send = function (data) {
            const pageRef = prevThis.getCurentPageRef();
            this.body = data;

            const prevOnreadystatechange = this.onreadystatechange;

            this.onreadystatechange = (ev) => {
                if (this.readyState === 4) {
                    const { request, response } = parse(this);
                    prevThis.handleRequest({
                        request,
                        response,
                        pageRef,
                    });
                }

                if (prevOnreadystatechange) prevOnreadystatechange(ev);
            };

            prevThis.originalSend.call(this, data);
        };
    }

    handleRequest(request) {
        const performanceIndex = this.resourcesToProcess.findIndex(
            ({ performance }) => performance?.name === request.request.url
        );
        if (performanceIndex > -1) {
            this.addResource({
                ...this.resourcesToProcess[performanceIndex],
                ...request,
                createdAt: new Date(),
            });
            this.resourcesToProcess.splice(performanceIndex, 1);
        } else {
            this.resourcesToProcess.push(request);
        }
    }

    handlePerformance(performanceEntry) {
        const requestIndex = this.resourcesToProcess.findIndex(
            ({ request }) => request?.url === performanceEntry.name
        );
        if (requestIndex > -1) {
            this.addResource({
                ...this.resourcesToProcess[requestIndex],
                performance: performanceEntry,
                createdAt: new Date(),
            });
            this.resourcesToProcess.splice(requestIndex, 1);
        } else {
            this.resourcesToProcess.push({ performance: performanceEntry });
        }
    }
}

export default XMLHttpRequestSniffer;

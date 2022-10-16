import HarGenerator from './HarGenerator';

const EVENT_KEY = 'mutate';

const LIFE_LIMIT = 10 * 60 * 1000;
const MAX_RESORCE_COUNT = 50;

const DUMMY_RESOURCE = {
    createdAt: new Date(),
};

describe('HarGenerator', () => {
    const setup = () => {
        const changePage = jest.fn((url, title) => {
            Object.defineProperty(window, 'location', {
                value: {
                    href: url,
                },
                writable: true,
            });
            document.title = title;
            const event = new Event(EVENT_KEY);
            dispatchEvent(event);
        });

        window.MutationObserver = jest.fn((cb) => {
            window.addEventListener(EVENT_KEY, () => {
                cb();
            });
            return {
                observe: jest.fn(),
            };
        });

        const snifferMock = jest.fn().mockImplementation(() => ({}));

        const service = new HarGenerator(
            [snifferMock],
            {
                resourceLifeLimit: 10000,
                maxResourceCount: MAX_RESORCE_COUNT,
            }
        );

        return {
            service,
            changePage,
        };
    };

    afterEach(() => {
        jest.clearAllMocks();
        Object.defineProperty(window, 'location', {
            value: {
                href: null,
            },
            writable: true,
        });
        document.title = null;
    });

    it('should be defined', () => {
        const { service } = setup();
        expect(service).toBeDefined();
    });

    it('should add resource if addResouce is called', () => {
        const { service } = setup();
        service.addResource(DUMMY_RESOURCE);

        expect(service.resourceData.resources.length).toBe(1);
    });

    it('should add recorded resource if addResouce is called and service is recording', () => {
        const { service } = setup();
        service.startRecording();
        service.addResource(DUMMY_RESOURCE);

        expect(service.resourceData.resources.length).toBe(1);
        expect(service.resourceData.recordedResources.length).toBe(1);
    });

    it('should limit resources to count limit', () => {
        const { service } = setup();

        for (let i = 0; i < 2 * MAX_RESORCE_COUNT; i += 1) {
            service.addResource(DUMMY_RESOURCE);
        }

        expect(service.resourceData.resources.length).toBe(MAX_RESORCE_COUNT);
    });

    it('should limit resources to time limit', () => {
        const { service } = setup();

        service.addResource({
            createdAt: new Date(new Date() - 2 * LIFE_LIMIT),
        });

        expect(service.resourceData.resources.length).toBe(0);
    });

    it('should not limit recorded resources', () => {
        const { service } = setup();
        service.startRecording();

        for (let i = 0; i < 2 * MAX_RESORCE_COUNT; i += 1) {
            service.addResource({
                createdAt: new Date(new Date() - 2 * LIFE_LIMIT),
            });
        }

        expect(service.resourceData.recordedResources.length).toBe(
            2 * MAX_RESORCE_COUNT
        );
    });

    it('should apply FIFO in resources', () => {
        const { service } = setup();
        service.addResource({ createdAt: new Date() });
        for (let i = 0; i < MAX_RESORCE_COUNT; i += 1) {
            service.addResource(DUMMY_RESOURCE);
        }
        const resourceToExist = { createdAt: new Date() };
        service.addResource(resourceToExist);

        expect(service.resourceData.resources[0].createdAt.getTime()).toBe(
            DUMMY_RESOURCE.createdAt.getTime()
        );

        expect(
            service.resourceData.resources[
                service.resourceData.resources.length - 1
            ].createdAt.getTime()
        ).toBe(resourceToExist.createdAt.getTime());
    });

    it('should add page if url changes', () => {
        const { service, changePage } = setup();
        changePage('dummy.com', 'Dummy page');
        changePage('dummy.com/dummy', 'Dummier page');
        expect(service.resourceData.pages.length).toBe(2);
    });

    it('should add recorded page if url changes and recording', () => {
        const { service, changePage } = setup();

        changePage('dummy.com', 'Dummy page');
        service.startRecording();
        changePage('dummy.com/dummy', 'Dummier page');

        expect(service.resourceData.recordedPages.length).toBe(1);
    });

    it('should remove page if there is no resource with page ref', () => {
        const { service, changePage } = setup();

        changePage('dummy.com', 'Dummy page');
        changePage('dummy.com/dummy', 'Dummier page');

        service.addResource({});

        expect(service.resourceData.recordedPages.length).toBe(0);
    });

    it('should not remove page if there are resources with page ref', () => {
        const { service, changePage } = setup();

        changePage('dummy.com', 'Dummy page');
        service.addResource({ ...DUMMY_RESOURCE, pageRef: service.resourceData.pages[0].pageRef });

        changePage('dummy.com/dummy', 'Dummier page');
        service.addResource({ ...DUMMY_RESOURCE, pageRef: service.resourceData.pages[1].pageRef });

        expect(service.resourceData.pages.length).toBe(2);
    });

    it('should stop adding recorded resources if recording is stopped', () => {
        const { service, changePage } = setup();

        service.startRecording();
        changePage('dummy.com', 'Dummy page');
        service.addResource({ ...DUMMY_RESOURCE, pageRef: service.resourceData.pages[0].pageRef });

        service.stopRecording();

        changePage('dummy.com/dummy', 'Dummier page');
        service.addResource({ ...DUMMY_RESOURCE, pageRef: service.resourceData.pages[1].pageRef });

        expect(service.resourceData.recordedPages.length).toBe(1);
        expect(service.resourceData.recordedResources.length).toBe(1);
    });

    it('should clean recordings when staring new reccording', () => {
        const { service, changePage } = setup();

        service.startRecording();
        changePage('dummy.com', 'Dummy page');
        service.addResource({ ...DUMMY_RESOURCE, pageRef: service.resourceData.pages[0].pageRef });

        service.startNewRecording();

        changePage('dummy.com/dummy', 'Dummier page');
        service.addResource({ ...DUMMY_RESOURCE, pageRef: service.resourceData.pages[1].pageRef });

        expect(service.resourceData.recordedPages.length).toBe(1);
        expect(service.resourceData.recordedResources.length).toBe(1);
    });

    it('should provide proper current page ref', () => {
        const { service, changePage } = setup();

        changePage('dummy.com', 'Dummy page');
        expect(service.getCurentPageRef()).toBe(service.resourceData.pages[0].pageRef);

        changePage('dummy.com/dummy', 'Dummier page');
        expect(service.getCurentPageRef()).toBe(service.resourceData.pages[1].pageRef);

        service.addResource({});

        changePage('dummy.com/dummy/dumb', 'Dummiest page');
        expect(service.getCurentPageRef()).toBe(service.resourceData.pages[0].pageRef);
    });
});

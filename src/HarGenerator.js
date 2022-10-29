import createHar from './createHar';

class HarRecorderService {
    resourceData = {
        resources: [],
        recordedResources: [],
        isRecording: false,
        pages: [],
        recordedPages: [],
    };

    constructor(sniffers, { resourceLifeLimit, maxResourceCount }) {
        this.sniffers = sniffers.map((Sniffer) => new Sniffer({
            addResource: this.addResource.bind(this),
            getCurentPageRef: this.getCurentPageRef.bind(this),
        }));
        this.maxResourceCount = maxResourceCount;
        this.resourceLifeLimit = resourceLifeLimit;

        const observer = new MutationObserver(() => {
            if (window.location.href !== this.previousUrl) {
                this.previousUrl = window.location.href;
                this.onPageChange();
            }
        });
        const config = { subtree: true, childList: true };
        observer.observe(document, config);
    }

    addResource(resource) {
        const { resources, isRecording, recordedResources } = this.resourceData;
        resources.push(resource);
        if (isRecording) recordedResources.push(resource);
        this.removeRedundantResources();
    }

    removeRedundantResources() {
        let { resources } = this.resourceData;
        const currentDate = new Date();
        resources = resources.filter(
            ({ createdAt }) => currentDate - createdAt < this.resourceLifeLimit
        );
        if (resources.length > this.maxResourceCount) {
            const toRemoveCount = resources.length - this.maxResourceCount;
            resources.splice(0, toRemoveCount);
        }
        this.resourceData = { ...this.resourceData, resources };
        this.removeRedundantPages();
    }

    removeRedundantPages() {
        const { resources, pages } = this.resourceData;

        const existingPageRefs = [
            ...new Set(resources.map(({ pageRef }) => pageRef)),
        ];

        const pagesLeft = pages.filter(({ pageRef }) => existingPageRefs.includes(pageRef));

        this.resourceData = { ...this.resourceData, pages: pagesLeft };
    }

    getCurentPageRef() {
        const { pages } = this.resourceData;
        return pages[pages.length - 1].pageRef;
    }

    onPageChange() {
        const { pages, recordedPages, isRecording } = this.resourceData;

        const page = {
            url: window.location.href,
            title: document.title,
            pageRef: `page_${new Date().getTime()}`,
            startTime: new Date(),
        };
        pages.push(page);
        if (isRecording) recordedPages.push(page);
    }

    startNewRecording() {
        this.clearRecording();
        this.startRecording();

        this.resourceData = {
            ...this.resourceData,
            recordDate: new Date().toISOString(),
        };
    }

    clearRecording() {
        let { recordedResources, recordedPages } = this.resourceData;

        recordedResources = [];
        recordedPages = [];

        this.resourceData = {
            ...this.resourceData,
            recordedResources,
            recordedPages,
        };
    }

    startRecording() {
        let { isRecording } = this.resourceData;
        isRecording = true;
        this.resourceData = {
            ...this.resourceData,
            isRecording,
        };
    }

    stopRecording() {
        let { isRecording } = this.resourceData;
        isRecording = false;
        this.resourceData = {
            ...this.resourceData,
            isRecording,
        };
    }

    getResourceData() {
        this.removeRedundantResources();
        return this.resourceData;
    }

    getCurrentHar() {
        const { resources, pages } = this.getResourceData();

        return createHar(resources, pages);
    }

    getRecordedHar() {
        const { recordedResources, recordedPages } = this.resourceData;

        return createHar(recordedResources, recordedPages);
    }
}

export default HarRecorderService;

import { version, name } from '../package.json';

const paramsToObject = (entries) => {
    const result = {};
    Object.entries(entries).forEach(([key, value]) => {
        result[key] = value;
    });
    return result;
};

export default (resources, pages) => {
    const entries = resources.map(
        ({
            request, response, performance, pageRef,
        }) => {
            const entryPage = pages.find((page) => page.pageRef === pageRef);

            if (!request || !performance || !response || !pageRef || !entryPage) return null;

            if (request.url.match(/(^data:image\/.*)/i)) return null;

            const requestQs = paramsToObject(new URLSearchParams(request.url.split('?')[1]).entries());

            return {
                pageref: pageRef,
                startedDateTime: new Date(
                    new Date(
                        entryPage.startTime
                    ).getTime() + performance.startTime
                ).toISOString(),
                time: performance.duration,
                request: {
                    method: request.method,
                    url: request.url,
                    httpVersion: 'HTTP/1.1',
                    cookies: [],
                    headers: Object.keys(request.headers).map((key) => ({
                        name: key,
                        value: request.headers[key],
                        comment: '',
                    })),
                    queryString: Object.keys(requestQs).map((key) => ({
                        name: key,
                        value: requestQs[key],
                        comment: '',
                    })),
                    headersSize: -1,
                    bodySize: request.headers['content-length']
                        ? parseInt(request.headers['content-length'], 10)
                        : 0,
                    ...(request.body && {
                        postData: {
                            mimeType: request.headers['content-type'],
                            text: request.body,
                        },
                    }),
                },
                response: {
                    status: response.status,
                    statusText: response.statusText,
                    httpVersion: 'HTTP/1.1',
                    cookies: [],
                    headers: Object.keys(response.headers).map((key) => ({
                        name: key,
                        value: response.headers[key],
                        comment: '',
                    })),
                    redirectURL: '',
                    headersSize: -1,
                    bodySize: response.headers['content-length']
                        ? parseInt(response.headers['content-length'], 10)
                        : 0,
                    content: {
                        size: response.headers['content-length']
                            ? parseInt(response.headers['content-length'], 10)
                            : 0,
                        mimeType: response.headers['content-type'],
                        text: response.body,
                    },
                },
                cache: {},
                timings: {
                    blocked: 0,
                    dns:
                        performance.domainLookupEnd
                        - performance.domainLookupStart,
                    connect: performance.connectEnd - performance.connectStart,
                    send: 0,
                    wait: 0,
                    receive: 0,
                    ssl:
                        performance.secureConnectionStart > 0
                            ? performance.connectEnd
                              - performance.secureConnectionStart
                            : 0,
                },
            };
        }
    ).filter((entry) => entry);

    const pagesFormated = pages.map(({
        url, pageRef, startTime, title,
    }) => ({
        startedDateTime: startTime,
        id: pageRef,
        title: `${title} (${url})`,
    }));

    return {
        log: {
            version: '1.0.0',
            creator: {
                name,
                version,
            },
            pages: pagesFormated,
            entries,
        },
    };
};

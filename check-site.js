const puppeteer = require('puppeteer');

async function crawlUrl(page, url) {
    const succeeded = [];
    const failed = [];

    function failedListener(request) {
        console.log("failed request", request.url());
        failed.push({
            url: request.url(),
            errorText: request.failure().errorText
        });
    }

    function requestFinishedListener(request) {
        console.log("request finished", request.url())
    }

    function responseListener(response) {
        console.log("response", response.url());
        if([200].includes(response.status())) {
            succeeded.push(response.url());
        } else {
            failed.push(response.url());
        }
    }

    page.on('requestfailed', failedListener);
    page.on('response', responseListener);

    page.on('requestfinished', requestFinishedListener);


//    page.on('request', request => { console.log("REQ: " + request.url()); });

    try {
        await page.goto(url, {waitUntil: 'networkidle0'});
    } finally {
        page.removeListener('requestfailed', failedListener);
        page.removeListener('requestfinished', requestFinishedListener);
        page.removeListener('response', responseListener);
    }
    const hrefs = await page.evaluate(() => {
        const anchors = document.querySelectorAll('a');
        return [].map.call(anchors, a => a.href);
    });
//    await page.screenshot({path: 'example.png'});

    let ret = {url: url};
    if (succeeded.length > 0) {
        ret.succeeded = succeeded;
    }
    if (failed.length > 0) {
        ret.failed = failed;
    }
    if (hrefs.length > 0) {
        ret.hrefs = hrefs;
    }
    return ret;
}

function urlToPrefix(url) {
    let s = url.protocol + "//";
    if (url.auth) {
        s = s + url.auth + "@";
    }
    return s + url.host;
}

function updateTodo(todo, results, checked, currentUrl, hrefs, root) {
    let rootUrl = new URL(root);
    const rootUrlStart = urlToPrefix(rootUrl);

    for (let href of hrefs) {
        let url = new URL(href, currentUrl);
        let urlString = url.toString();
        if (!checked.hasOwnProperty(urlString) && !todo.includes(urlString)) {
            let urlStart = urlToPrefix(url);
            if (rootUrlStart.valueOf() === urlStart.valueOf()) {
                todo.push(urlString)
            }
        }
    }
}

async function crawlUrls(page, root) {
    const todo = [root];
    const checked = {};
    const results = [];
    do {
        const url = todo.pop();
        let urlResults = await crawlUrl(page, url);
        results.push(urlResults);
        if (urlResults.hrefs) {
            updateTodo(todo, results, checked, url, urlResults.hrefs, root)
        }
    } while (todo.length !== 0);
    return results;
}

async function crawl(url) {
    const browser = await puppeteer.launch({headless: true});
    const page = await browser.newPage();

    try {
        return await crawlUrls(page, url);
    } finally {
        await browser.close();
    }
}

if (module) {
    module.exports = {
        crawl: crawl
    }
}

const puppeteer = require('puppeteer');

function debug(...args) {
//  info(...args)
}

function info(...args) {
  console.log(...args);
}

async function scrollToEnd(page) {
  let scroll = true;
  let originalPosition = await page.evaluate('window.pageYOffset');
  while (scroll) {
    await page.evaluate('window.scrollBy(0, window.innerHeight)');
    let currentPosition = await page.evaluate('window.pageYOffset');
    if (currentPosition != originalPosition) {
      await page.waitFor(100);
      originalPosition = currentPosition;
    } else {
      scroll = false
    }
  }
  return 1;
}

async function waitUntilEmpty(arr) {
  return new Promise((resolve, reject) => {
      const f = () => {
        if (arr.length === 0) {
          resolve();
        } else {
          debug("Waiting for request to finish", arr)
          setTimeout(f, 1000);
        }
      }
      setTimeout(f, 100);
    }
  );
}

async function crawlUrl(page, crawlUrl) {
  const succeeded = [];
  const failed = [];
  const openRequestUrls = [];

  function isExcludedUrl(url) {
    return url.includes('linkedin');
  }

  const requestListener = request => {
    const url = request.url();
    debug("request started", url)
    if (isExcludedUrl(url)) {
      request.abort();
    } else {
      openRequestUrls.push(url);
      request.continue();
    }
  };

  function requestFailedListener(request) {
    const url = request.url();
    debug("request failed", url)
    removeFromArray(openRequestUrls, url);
    if (!isExcludedUrl(url)) {
      info("- failed", url, "errorText", request.failure().errorText)
      failed.push({
        url: url,
        errorText: request.failure().errorText
      });
    }
  }

  function requestFinishedListener(request) {
    const url = request.url();
    debug("request finished", url)
    removeFromArray(openRequestUrls, url);
  }

  function responseListener(response) {
    debug("response", response.url())
    if ([200, 204, 206, 301, 302, 304].includes(response.status())) {
      succeeded.push(response.url());
    } else {
      info("- failed", response.url(), "status", response.status())
      failed.push({url: response.url(), status: response.status()});
    }
  }

  page.setRequestInterception(true);
  page.on('request', requestListener);
  page.on('requestfailed', requestFailedListener);
  page.on('response', responseListener);
  page.on('requestfinished', requestFinishedListener);
//    page.on('request', request => { console.log("REQ: " + request.url()); });

  try {
    await page.goto(crawlUrl, {waitUntil: 'networkidle0'});
    await waitUntilEmpty(openRequestUrls);
    await scrollToEnd(page);
    await waitUntilEmpty(openRequestUrls);
  } finally {
    page.removeListener('request', requestListener);
    page.removeListener('requestfailed', requestFailedListener);
    page.removeListener('requestfinished', requestFinishedListener);
    page.removeListener('response', responseListener);
  }
  const hrefs = await page.evaluate(() => {
    const anchors = document.querySelectorAll('a');
    return [].map.call(anchors, a => a.href);
  });
//    await page.screenshot({path: 'example.png'});

  let ret = {url: crawlUrl};
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

function updateTodo(state, currentUrl, hrefs, root) {
  const rootUrl = new URL(root);
  const rootUrlStart = urlToPrefix(rootUrl);

  for (const href of hrefs) {
    const url = new URL(href, currentUrl);
    const urlString = url.toString();
    const urlStart = urlToPrefix(url);
    if (!state.checked.hasOwnProperty(urlString) && !state.todo.includes(urlString)) {
      if (rootUrlStart.valueOf() === urlStart.valueOf()) {
        state.todo.push(urlString)
      }
    }
  }
}

function collectErrors(result) {
  const ret = {}
  for (const pageResult of result) {
    for (const failed of pageResult.failed || []) {
      const failedUrl = failed.url
      if (!ret.failedUrl) {
        ret[failedUrl] = {}
      }
      if (pageResult.url !== failedUrl) {
        if (!ret[failedUrl].loadedBy) {
          ret[failedUrl].loadedBy = []
        }
        ret[failedUrl].loadedBy.push(pageResult.url)
      }
    }
  }
  for (const pageResult of result) {
    for (const href of pageResult.hrefs || []) {
      if (ret.hasOwnProperty(href)) {
        if (!ret[href].linkedBy) {
          ret[href].linkedBy = []
        }
        ret[href].linkedBy.push(pageResult.url)
      }
    }
  }
  return ret;
}

function uniqueErrors(state) {
  return Object.keys(collectErrors(state)).length
}

function removeFromArray(arr, obj) {
  arr.splice(arr.indexOf(obj), 1);
}

async function crawlUrls(state, page, root) {
  do {
    const url = state.todo.shift();
    info("check", url, "checked", Object.keys(state.checked).length, "todo", state.todo.length, "unique errors", uniqueErrors(state.results))
    state.processing.push(url)
    const urlResults = await crawlUrl(page, url);
    removeFromArray(state.processing, url);
    state.results.push(urlResults);
    state.checked[url] = true;
    if (urlResults.hrefs) {
      updateTodo(state, url, urlResults.hrefs, root)
    }
    info("errors", pretty(collectErrors(state.results)))
  } while (state.todo.length !== 0);
  info("checked", Object.keys(state.checked).length, "unique errors", uniqueErrors(state.results))
  info("errors", collectErrors(state.results))
  info("results", state.results)
  return state.results;
}

function pretty(obj) {
  return JSON.stringify(obj, null, 2)
}

async function crawl(url) {
  return crawler().crawl(url)
}

function crawler() {
  let browser, page;
  return {
    todo: [],
    results: [],
    checked: {},
    processing: [],
    crawl: async function (root) {
      if (!browser) {
        browser = await puppeteer.launch({headless: true});
      }
      if (!page) {
        page = await browser.newPage();
      }

      this.todo.push(root);
      try {
        return await crawlUrls(this, page, root);
      } finally {
        await browser.close();
      }
    }
  };
}

if (module) {
  module.exports = {
    crawl: crawl,
    crawler: crawler
  }
}

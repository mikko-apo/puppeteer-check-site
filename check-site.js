const puppeteer = require('puppeteer');

function debug(...args) {
  //info(...args)
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
      };
      setTimeout(f, 100);
    }
  );
}

async function crawlUrl(page, crawlUrl, params) {
  const succeeded = [];
  const failed = [];
  const openRequestUrls = [];
  const pageErrors = [];
  const errors = [];
  const ignored = []

  function matches(pattern, string) {
    if (typeof pattern === "function") {
      return pattern(string)
    }
    if (pattern instanceof RegExp) {
      return pattern.test(string)
    }
    return string.includes(pattern);
  }

  function isIgnored(url) {
    for (ignore of params.ignore || []) {
      if (matches(ignore, url)) {
        if (!ignored.includes(url)) {
          ignored.push(url)
        }
        return true;
      }
    }
    return false;
  }

  const requestListener = request => {
    const url = request.url();
    debug("request started", url)
    if (isIgnored(url)) {
      request.abort();
      info(" - aborting request because url is ignored", url)
    } else {
      openRequestUrls.push(url);
      request.continue();
    }
  };

  function requestFailedListener(request) {
    const url = request.url();
    debug("request failed", url)
    removeFromArray(openRequestUrls, url);
    if (!isIgnored(url)) {
      info("- failed", url, "errorText", request.failure().errorText)
      failed.push({
        url: url,
        errorText: request.failure().errorText
      });
    }
  }

  function requestFinishedListener(request) {
    const url = request.url();
    removeFromArray(openRequestUrls, url);
    debug("request finished", url, "unfinished", openRequestUrls)
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

  function errorListener(error) {
    const ret = {}
    const message = error.message;
    const stack = error.stack;
    if (message && message !== "") {
      ret.message = message;
    }
    if (stack && stack !== "") {
      ret.stack = stack;
    }
    pageErrors.push(ret);
    info("- error", error.message)
  }

  function pageErrorListener(error) {
    const ret = {}
    const message = error.message;
    const stack = error.stack;
    if (message && message !== "") {
      ret.message = message;
    }
    if (stack && stack !== "") {
      ret.stack = stack;
    }
    pageErrors.push(ret);
    info("- pageerror", error.message)
  }

  page.setRequestInterception(true);
  page.on('request', requestListener);
  page.on('requestfailed', requestFailedListener);
  page.on('response', responseListener);
  page.on('requestfinished', requestFinishedListener);
  page.on('pageerror', pageErrorListener);
  page.on('error', errorListener);
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
    page.removeListener('pageerror', pageErrorListener);
    page.removeListener('error', errorListener);
  }

  const finalUrl = page.url();
  let pageResult = {url: finalUrl};
  if (finalUrl != crawlUrl) {
    pageResult.originalUrl = crawlUrl;
  }

  const hrefs = [];
  const pageHrefs = await page.evaluate(() => {
    const anchors = document.querySelectorAll('a');
    return [].map.call(anchors, a => a.href);
  });
  for (const href of pageHrefs) {
    const url = new URL(href, finalUrl);
    const urlString = url.toString();
    if (isIgnored(urlString)) {
      info("- ignoring href", urlString)
    } else {
      hrefs.push(href)
    }
  }
  ;

  if (hrefs.length > 0) {
    pageResult.hrefs = hrefs;
  }
  if (succeeded.length > 0) {
    pageResult.succeeded = succeeded;
  }
  if (failed.length > 0) {
    pageResult.failed = failed;
  }
  if (ignored.length > 0) {
    pageResult.ignored = ignored;
  }
  if (pageErrors.length > 0) {
    pageResult.pageErrors = pageErrors;
  }
  if (errors.length > 0) {
    pageResult.errors = errors;
  }
  return pageResult;
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
      if (!ret[failedUrl]) {
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
    const urlResults = await crawlUrl(page, url, state.params);
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

async function crawl(url, params = {ignore: []}) {
  return crawler(params).crawl(url)
}

function crawler(params = {ignore: []}) {
  let browser, page;
  return {
    todo: [],
    results: [],
    checked: {},
    processing: [],
    params: params,
    crawl: async function (root) {
      if (!browser) {
        browser = await puppeteer.launch({headless: true, devtools: false});
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

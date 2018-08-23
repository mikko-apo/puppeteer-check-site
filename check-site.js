const puppeteer = require('puppeteer');
const Handlebars = require('handlebars');
const fs = require('fs');

function debug(...args) {
  if (debug.debugOn) {
    info(...args)
  }
}

debug.debugOn = false;

function info(...args) {
  console.log(...args);
}

async function scrollToEnd(page) {
  let scroll = true;
  let originalPosition = await page.evaluate('window.pageYOffset');
  while (scroll) {
    await page.evaluate('window.scrollBy(0, window.innerHeight)');
    let currentPosition = await page.evaluate('window.pageYOffset');
    if (currentPosition !== originalPosition) {
      await page.waitFor(100);
      originalPosition = currentPosition;
    } else {
      scroll = false
    }
  }
  return 1;
}

async function waitUntilEmpty(arr) {
  return new Promise((resolve) => {
      const waitForRequestToFinish = () => {
        if (arr.length === 0) {
          resolve();
        } else {
          debug("Waiting for request to finish", arr);
          setTimeout(waitForRequestToFinish, 1000);
        }
      };
      setTimeout(waitForRequestToFinish, 100);
    }
  );
}

function matches(pattern, string) {
  if (typeof(pattern) === "function") {
    return pattern(string)
  }
  if (pattern instanceof RegExp) {
    return pattern.test(string)
  }
  return string.includes(pattern);
}

Handlebars.registerHelper('link', function (url) {
  return new Handlebars.SafeString(
    '<a href="' + url + '">'
    + url
    + '</a>');
});

async function crawlUrl(page, crawlUrl, params) {
  const succeeded = [];
  const failed = [];
  const openRequestUrls = [];
  const pageErrors = [];
  const errors = [];
  const ignored = [];

  function isIgnored(url) {
    for (const ignore of params.ignore || []) {
      if (matches(ignore, url)) {
        if (!ignored.includes(url)) {
          ignored.push(url)
        }
        return true;
      }
    }
    return false;
  }

  function requestListener(request) {
    const url = request.url();
    debug("request started", url);
    if (isIgnored(url)) {
      request.abort();
      info(" - aborting request because url is ignored", url)
    } else {
      openRequestUrls.push(url);
      request.continue();
    }
  }

  function requestFailedListener(request) {
    const url = request.url();
    debug("request failed", url);
    removeFromArray(openRequestUrls, url);
    if (!isIgnored(url)) {
      info("- failed", url, "errorText", request.failure().errorText);
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
    debug("response", response.url());
    if ([200, 204, 206, 301, 302, 304].includes(response.status())) {
      succeeded.push(response.url());
    } else {
      info("- failed", response.url(), "status", response.status());
      failed.push({url: response.url(), status: response.status()});
    }
  }

  function errorListener(error) {
    const ret = {};
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
    const ret = {};
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

  async function processPage(page) {
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
  }

  async function createResult(page) {
    const finalUrl = page.url();
    let pageResult = {url: finalUrl};
    if (finalUrl !== crawlUrl) {
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

    if (errors.length > 0) {
      pageResult.errors = errors;
    }
    if (pageErrors.length > 0) {
      pageResult.pageErrors = pageErrors;
    }
    if (failed.length > 0) {
      pageResult.failed = failed;
    }
    if (ignored.length > 0) {
      pageResult.ignored = ignored;
    }
    if (hrefs.length > 0) {
      pageResult.hrefs = hrefs;
    }
    if (succeeded.length > 0) {
      pageResult.succeeded = succeeded;
    }
    return pageResult;
  }

  await processPage(page);
  return await createResult(page);
}

function collectIssues(result) {
  const lookup = {};
  const ret = [];
  for (const pageResult of result) {
    for (const failed of pageResult.failed || []) {
      const failedUrl = failed.url;
      let issue = lookup[failedUrl];
      if (!issue) {
        lookup[failedUrl] = issue = {failedUrl};
        ret.push(issue)
      }
      if (pageResult.url !== failedUrl) {
        let loadedBy = issue.loadedBy
        if (!loadedBy) {
          issue.loadedBy = loadedBy = []
        }
        loadedBy.push({url: pageResult.url, status: failed.status})
      } else {
        issue.status = failed.status
      }
    }
  }
  for (const pageResult of result) {
    for (const href of pageResult.hrefs || []) {
      if (lookup.hasOwnProperty(href)) {
        if (!lookup[href].linkedBy) {
          lookup[href].linkedBy = []
        }
        lookup[href].linkedBy.push(pageResult.url)
      }
    }
  }

  return ret;
}

function uniqueErrors(state) {
  return collectIssues(state).length
}

function removeFromArray(arr, obj) {
  arr.splice(arr.indexOf(obj), 1);
}

async function crawlUrls(state, page, root) {
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

  do {
    const url = state.todo.shift();
    info("check", url, "checked", Object.keys(state.checked).length, "todo", state.todo.length, "unique errors", uniqueErrors(state.results));
    state.processing.push(url);
    const urlResults = await crawlUrl(page, url, state.params);
    removeFromArray(state.processing, url);
    state.results.push(urlResults);
    state.checked[url] = true;
    if (urlResults.hrefs) {
      updateTodo(state, url, urlResults.hrefs, root)
    }
    info("issues", pretty(collectIssues(state.results)))
  } while (state.todo.length !== 0);
}

function pretty(obj) {
  return JSON.stringify(obj, null, 2)
}

const defaultParameters = {report: undefined, ignore: [], headless: true, devtools: false, debug: false};

async function crawl(url, params = defaultParameters) {
  return crawler(params).crawl(url)
}

function crawler(params = defaultParameters) {
  let browser, page;
  if (params.debug) {
    debug.debugOn = true;
  }
  return {
    todo: [],
    results: [],
    checked: {},
    processing: [],
    params: params,
    crawl: async function (root) {
      if (!browser) {
        browser = await puppeteer.launch(this.params);
      }
      if (!page) {
        page = await browser.newPage();
      }

      this.todo.push(root);
      try {
        await crawlUrls(this, page, root);
        info("checked", Object.keys(this.checked).length, "unique errors", uniqueErrors(this.results));
        info("issues", pretty(collectIssues(this.results)));
        info("results", pretty(this.results));
        return this.results;
      } finally {
        await browser.close();
      }
    },
    createReport: function () {
      const context = {params: this.params};
      if (this.todo.length > 0) {
        context.todo = this.todo;
      }
      if (this.results.length > 0) {
        context.results = this.results;
        const issues = collectIssues(this.results);
        if (issues.length > 0) {
          context.issues = issues;
        }
      }
      if (this.checked.size > 0) {
        context.checked = this.checked;
      }
      if (this.processing.length > 0) {
        context.prosessing = this.prosessing;
      }
      const source = __dirname + "/reports/default.html"
      const template = Handlebars.compile(readFile(source));
      return template(context);
    }
  };
}

async function startCommandLine(argv, crawlerF, defaultParameters) {
  const urls = [];
  const params = {};
  for (const arg of argv) {
    if (arg.includes(":") && defaultParameters.hasOwnProperty(arg.split(":")[0])) {
      const [key, ...rest] = arg.split(":");
      const defaultValue = defaultParameters[key];
      let value = rest.join(":");
      if (key === "ignore") {
        value = value.split(",").map(s => /^\/.*\/$/.test(s) ? new RegExp(s.substr(1, s.length - 2)) : s)
      } else if (typeof(defaultValue) === "boolean") {
        value = JSON.parse(value)
      }
      params[key] = value
    } else {
      urls.push(arg)
    }
  }
  if (urls.length > 0) {
    const crawler = crawlerF(params);
    for (const url of urls) {
      await crawler.crawl(url)
    }
    if (params.report) {
      writeTextFile(params.report, crawler.createReport());
      info("wrote report to", params.report)
    }
  }
}

function writeTextFile(filepath, output) {
  fs.writeFileSync(filepath, output)
}

function readFile(filepath) {
  return fs.readFileSync(filepath, "utf8")
}

if (module) {
  module.exports = {
    crawl: crawl,
    crawler: crawler,
    startCommandLine: async (argv) => startCommandLine(argv, module.exports.crawler, defaultParameters)
  }
}

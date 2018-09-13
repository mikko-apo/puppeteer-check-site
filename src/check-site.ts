import {URL} from "url";
import {Browser, Headers, launch, LaunchOptions, Page, PageEventObj, Request, Response} from "puppeteer";
import {debug, info, pretty, pushUnique, removeFromArray, writeTextFile} from "./util";
import {createReportHtml, createReportText, createReportTextShort} from "./reporting";

export interface PageResult {
  url: string
  external?: boolean
  originalUrl?: string
  errors?: ErrorInfo[]
  pageErrors?: ErrorInfo[]
  failed?: FailUrlStatus[]
  ignored?: string[]
  hrefs?: string[]
  succeeded?: string[]
}

interface FailUrlStatus {
  url: string
  status?: number | string
  errorText?: string
}

interface ErrorInfo {
  message?: string
  stack?: string
}

export interface Issue {
  failedUrl?: string
  status?: number | string
  error?: string
  stack?: string
  urls?: string[]
  loadedBy?: FailUrlStatus[]
  linkedBy?: string[]
}

export interface Parameters {
  [index: string]: any

  report?: string
  resultJson?: string
}

export class State {
  todo: string[] = [];
  todoExternal: string[] = [];
  referers: { [index: string]: string } = {};
  results: PageResult[] = [];
  checked: { [index: string]: boolean } = {};
  processing: string[] = [];
  params: Parameters;
  constructor(params: Parameters) { this.params = params; }
}

export interface Crawler {
  crawl: (root: string) => Promise<PageResult[]>
  state: State
}

async function scrollToEnd(page: Page) {
  let scroll = true;
  let originalPosition = await page.evaluate('window.pageYOffset');
  while (scroll) {
    await page.evaluate('window.scrollBy(0, window.innerHeight)');
    let currentPosition = await page.evaluate('window.pageYOffset');
    if (currentPosition !== originalPosition) {
      await page.waitFor(50);
      originalPosition = currentPosition;
    } else {
      scroll = false
    }
  }
  return 1;
}

async function waitUntilEmpty(arr: Request[], timeoutMs: number, handleTimeout: (arr: Request[], msDiff: number, resolve: () => void, reject?: (err: any) => void) => void) {
  const startMs = new Date().getTime();
  return new Promise((resolve, reject) => {
      const waitForRequestToFinish = () => {
        if (arr.length === 0) {
          resolve();
        } else {
          const msDiff = new Date().getTime() - startMs;
          debug("Waiting for requests to finish", msDiff, timeoutMs, arr);
          if (msDiff > timeoutMs) {
            handleTimeout(arr, msDiff, resolve, reject)
          } else {
            setTimeout(waitForRequestToFinish, 1000);
          }
        }
      };
      setTimeout(waitForRequestToFinish, 500);
    }
  );
}

function matches(pattern: ((s: string) => boolean | RegExp | string), string: string) {
  if (typeof(pattern) === "function") {
    return pattern(string)
  }
  if ((pattern as RegExp) instanceof RegExp) {
    return (pattern as RegExp).test(string)
  }
  return string.includes(pattern);
}

function errorToObject(error: ErrorInfo): ErrorInfo {
  const ret: ErrorInfo = {};
  const message = error.message;
  const stack = error.stack;
  if (message && message !== "") {
    ret.message = message;
  }
  if (stack && stack !== "") {
    ret.stack = stack;
  }
  return ret;
}

async function crawlUrl(page: Page, crawlUrl: string, isInternal: boolean, state: State): Promise<PageResult> {
  const {params, referers} = state;
  const openRequests: Request[] = [];
  const pageResult: PageResult = {
    url: crawlUrl,
    originalUrl: crawlUrl,
    errors: [],
    pageErrors: [],
    failed: [],
    ignored: [],
    hrefs: [],
    succeeded: []
  };
  if (!isInternal) {
    pageResult.external = true
  }
  await processPage(page, pageResult, openRequests);
  pageResult.url = page.url();
  pageResult.hrefs.push(...await getHrefs(page, pageResult.url));
  cleanResult(pageResult);
  return pageResult;

  function isIgnored(url: string) {
    for (const ignore of params.ignore || []) {
      if (matches(ignore, url)) {
        pushUnique(pageResult.ignored, url);
        return true;
      }
    }
    return false;
  }

  function handleRequestTimeout(arr: Request[], msDiff: number, resolve: () => void) {
    info("- timeout at", msDiff, "ms. Unfinished resource requests", arr.length);
    for (const request of arr) {
      pageResult.failed.push({status: "timeout", url: request.url()})
    }
    arr.length = 0;
    resolve();
  }

  function createListeners(pageResult: PageResult, openRequests: Request[]) {
    const listeners = new Map<keyof PageEventObj, any>();
    listeners.set('request', (request: Request) => {
      const url = request.url();
      debug("request started", url);
      if (isIgnored(url)) {
        request.abort();
        info("- aborting request because url is ignored", url)
      } else {
        openRequests.push(request);
        request.continue();
      }
    });
    listeners.set('requestfailed', (request: Request) => {
      const url = request.url();
      debug("request failed", url);
      removeFromArray(openRequests, request);
      if (!isIgnored(url)) {
        info("- failed", url, "errorText", request.failure().errorText);
        pageResult.failed.push({
          url: url,
          errorText: request.failure().errorText
        });
      }
    });
    listeners.set('response', (response: Response) => {
      debug("response", response.url());
      if ([200, 204, 206, 301, 302, 304].includes(response.status())) {
        pageResult.succeeded.push(response.url());
      } else {
        info("- failed", response.url(), "status", response.status());
        pageResult.failed.push({url: response.url(), status: response.status()});
      }
    });
    listeners.set('requestfinished', (request: Request) => {
      removeFromArray(openRequests, request);
      debug("request finished", request.url(), "unfinished", openRequests)
    });
    listeners.set('pageerror', (error: ErrorInfo) => {
      pageResult.pageErrors.push(errorToObject(error));
      info("- pageerror", error.message)
    });
    listeners.set('error', (error: ErrorInfo) => {
      pageResult.errors.push(errorToObject(error));
      info("- error", error.message)
    });
    return listeners;
  }

  async function processPage(page: Page, pageResult: PageResult, openRequests: Request[]): Promise<void> {
    await page.setRequestInterception(true);
    const listeners = createListeners(pageResult, openRequests);

    listeners.forEach((value, key) => page.on(key, value));

    try {
      const headers: Headers = {};
      if (referers[crawlUrl]) {
        headers.referer = referers[crawlUrl]
      }
      await page.setExtraHTTPHeaders(headers);
      await page.goto(crawlUrl, {waitUntil: 'domcontentloaded', timeout: params.timeout});
      await waitUntilEmpty(openRequests, params.timeout, handleRequestTimeout);
      await scrollToEnd(page);
      await waitUntilEmpty(openRequests, params.timeout, handleRequestTimeout);
    } finally {
      listeners.forEach((value, key) => page.removeListener(key, value));
    }
  }

  async function getHrefs(page: Page, finalUrl: string) {
    const hrefs: string[] = [];
    const pageHrefs = await page.evaluate(() => {
      const anchors = document.querySelectorAll('a');
      return [].map.call(anchors, (a: any) => a.href);
    });
    for (const href of pageHrefs) {
      const url = new URL(href, finalUrl);
      const urlString = url.toString();
      if (isIgnored(urlString)) {
        info("- ignoring href", urlString)
      } else {
        if (href.length > 0) {
          pushUnique(hrefs, href)
        }
      }
    }
    return hrefs;
  }

  function cleanResult(pageResult: PageResult) {
    if (pageResult.url === pageResult.originalUrl) {
      delete pageResult.originalUrl;
    }
    if (pageResult.errors.length === 0) {
      delete pageResult.errors;
    }
    if (pageResult.pageErrors.length === 0) {
      delete pageResult.pageErrors;
    }
    if (pageResult.failed.length === 0) {
      delete pageResult.failed;
    }
    if (pageResult.ignored.length === 0) {
      delete pageResult.ignored;
    }
    if (pageResult.hrefs.length === 0) {
      delete pageResult.hrefs;
    }
    if (pageResult.succeeded.length === 0) {
      delete pageResult.succeeded;
    }
    return pageResult;
  }
}

export function collectIssues(results: PageResult[]) {
  const lookup: { [index: string]: Issue } = {};
  const ret: Issue[] = [];

  function addIssue(key: string, base: Issue): Issue {
    let issue = lookup[key];
    if (!issue) {
      lookup[key] = issue = base;
      ret.push(issue)
    }
    return issue;
  }

  for (const pageResult of results) {
    for (const failed of pageResult.failed || []) {
      const failedUrl = failed.url;
      const issue = addIssue(failed.url, {failedUrl});
      if (pageResult.url === failedUrl) {
        issue.status = failed.status
      } else {
        let loadedBy = issue.loadedBy;
        if (!loadedBy) {
          issue.loadedBy = loadedBy = []
        }
        loadedBy.push({url: pageResult.url, status: failed.status})
      }
    }
    const allErrors = [...(pageResult.errors || []), ...(pageResult.pageErrors || [])];
    for (const error of allErrors) {
      addIssue(error.message || error.stack, {
        error: error.message,
        stack: error.stack,
        urls: []
      }).urls.push(pageResult.url)
    }
  }
  for (const pageResult of results) {
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

function okToAddUrl(state: State, url: URL, urlString: string) {
  const protocolAllowed = ["http:", "https:"].includes(url.protocol);
  const hasNotBeenChecked = !state.checked.hasOwnProperty(urlString);
  const isAlreadyInTodo = !state.todo.includes(urlString);
  const isAlreadyInExternalTodo = state.todoExternal.includes(urlString);
  const isNotEmpty = urlString.length > 0;
  return protocolAllowed && hasNotBeenChecked && isAlreadyInTodo && !isAlreadyInExternalTodo && isNotEmpty;
}

function urlToPrefix(url: URL) {
  let s = url.protocol + "//";
  if ((url as any).auth) {
    s = s + (url as any).auth + "@";
  }
  return s + url.host;
}

function addHrefsToState(hrefs: string[], state: State, currentUrl: string, currentIsInternal: boolean, root: string) {
  const rootUrl = new URL(root);
  const rootUrlStart = urlToPrefix(rootUrl);

  for (const href of hrefs) {
    const url = new URL(href, currentUrl);
    const urlString = url.toString();
    const urlStart = urlToPrefix(url);
    if (okToAddUrl(state, url, urlString)) {
      const hrefIsInternal = rootUrlStart.valueOf() === urlStart.valueOf();
      if (hrefIsInternal) {
        state.todo.push(urlString)
      } else {
        if (currentIsInternal) {
          state.todoExternal.push(urlString)
        }
      }
      state.referers[urlString] = currentUrl
    }
  }
}

async function crawlUrls(state: State, page: Page, root: string) {
  do {
    const isInternal = state.todo.length > 0;
    const url = isInternal ? state.todo.shift() : state.todoExternal.shift();
    info("check", url, "checked", Object.keys(state.checked).length, "todo", state.todo.length, "todo external", state.todoExternal.length, "unique issues", collectIssues(state.results).length);
    state.processing.push(url);
    let pageResult: PageResult = undefined;
    try {
      pageResult = await crawlUrl(page, url, isInternal, state);
    } catch (e) {
      if (e.name === "TimeoutError") {
        pageResult = {url, failed: [{status: "timeout", url}]};
      } else {
        pageResult = {url, errors: [errorToObject(e)]};
      }
    }
    removeFromArray(state.processing, url);
    state.results.push(pageResult);
    state.checked[url] = true;
    if (pageResult.hrefs) {
      addHrefsToState(pageResult.hrefs, state, pageResult.url, isInternal, root)
    }
    const issues = collectIssues([pageResult]);
    if (issues.length > 0) {
      info(createReportTextShort([pageResult]));
    }
    if (state.params.report) {
      writeTextFile(state.params.report, createReportHtml(state));
    }
    if (state.params.resultJson) {
      writeTextFile(state.params.resultJson, JSON.stringify(state.results));
    }
  } while (state.todo.length !== 0 || state.todoExternal.length !== 0);
}

export const defaultParameters: Parameters = {
  report: undefined,
  resultJson: undefined,
  ignore: [],
  headless: true,
  devtools: false,
  debug: false,
  timeout: 10000
};

export async function crawl(url: string, params = defaultParameters): Promise<PageResult[]> {
  return createCrawler(params).crawl(url)
}

export function createCrawler(params = defaultParameters): Crawler {
  params = {...defaultParameters, ...params};
  let browser: Browser, page: Page;
  if (params.debug) {
    (debug as any).debugOn = true;
  }
  const state = new State(params);
  return {
    state: state,
    crawl: async function (root: string): Promise<PageResult[]> {
      if (!browser) {
        browser = await launch(state.params as LaunchOptions);
      }
      if (!page) {
        page = await browser.newPage();
      }

      state.todo.push(root);
      try {
        await crawlUrls(state, page, root);
        const issues = collectIssues(state.results);
        info("checked", Object.keys(state.checked).length, "unique errors", issues.length);
        info(createReportText(state.results));
        info("results", pretty(state.results));
        return state.results;
      } finally {
        await browser.close();
      }
    }
  };
}

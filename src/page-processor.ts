import {Headers, Page, PageEventObj, Request, Response} from "puppeteer";
import {URL} from "url";
import {ErrorInfo, MatcherType, PageCheckReadyHandler, PageResult, ScanListener, State} from "./check-site";
import {debug, info, pushUnique, removeFromArray} from "./util";

export class PageProcessor {
  public page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  public async process(url: string, isInternal: boolean, state: State): Promise<PageResult> {
    const pageResult: PageResult = createPageResult(url, isInternal);
    const isIgnored = createIsIgnored(state, pageResult);
    const handleRequestTimeout = createRequestTimeoutHandler(pageResult);
    const openRequests: Request[] = [];
    const listeners = createListeners(pageResult, openRequests, isIgnored);
    await this.processPage(url, pageResult, state, listeners, openRequests, handleRequestTimeout);
    const pageHrefs = await getHrefs(this.page);
    pageResult.url = this.page.url();
    pageResult.hrefs.push(...collectHrefs(pageHrefs, pageResult.url, isIgnored));
    cleanResult(pageResult);
    return pageResult;
  }

  private async processPage(
    url: string,
    pageResult: PageResult,
    state: State,
    listeners: Map<keyof PageEventObj, any>,
    openRequests: Request[],
    handleRequestTimeout: (arr: Request[], msDiff: number, resolve: () => void) => void,
  ): Promise<void> {
    const {params} = state;
    const page = this.page;
    const headers: Headers = {};
    if (state.referers[url]) {
      headers.referer = state.referers[url];
    }
    await page.setExtraHTTPHeaders(headers);
    await page.setRequestInterception(true);

    listeners.forEach((value, key) => page.on(key, value));

    try {
      await page.goto(url, {waitUntil: "domcontentloaded", timeout: params.timeout});
      await waitUntilEmpty(openRequests, params.timeout, handleRequestTimeout);
      await scrollToEnd(page);
      await scrollToTop(page);
      await waitUntilEmpty(openRequests, params.timeout, handleRequestTimeout);
      if (await this.handleOnPageLoad("onPageCheckReady", state, pageResult)) {
        await waitUntilEmpty(openRequests, params.timeout, handleRequestTimeout);
      }
    } finally {
      listeners.forEach((value, key) => page.removeListener(key, value));
    }
  }

  private getListeners(state: State, key: keyof ScanListener, url: string) {
    return state.params.require.filter(
      (listener) => listener[key]
        && (!listener.urls
          || listener.urls.length === 0
          || matchesAnyPartially(url, listener.urls)),
    );
  }

  private async handleOnPageLoad(listenerKey: keyof ScanListener, state: State, pageResult: PageResult) {
    const pageReadyHandlers: ScanListener[] = this.getListeners(state, listenerKey, this.page.url());
    if (pageReadyHandlers.length === 0) {
      return false;
    }
    for (const handler of pageReadyHandlers) {
      try {
        await this.callHandler(handler.onPageCheckReady, pageResult, state);
      } catch (err) {
        const parts: string[] = [handler.path, listenerKey];
        if (handler.name) {
          parts.push(handler.name);
        }
        const str = `${parts.join(":")} threw an error`;
        info(`- ${str}`, err);
        err.message = `${str}: ${err.message}`;
        pageResult.errors.push(errorToObject(err));
      }
    }
    return true;
  }

  private async callHandler(handler: PageCheckReadyHandler, pageResult: PageResult, state: State) {
    const p = handler(this.page, pageResult, state);
    if (p instanceof Promise) {
      return p;
    }
    return Promise.resolve(p);
  }
}

function createPageResult(url: string, isInternal: boolean): PageResult {
  const pageResult: PageResult = {
    url,
    originalUrl: url,
    errors: [],
    pageErrors: [],
    failed: [],
    ignored: [],
    hrefs: [],
    succeeded: [],
  };
  if (!isInternal) {
    pageResult.external = true;
  }
  return pageResult;
}

function createIsIgnored(state: State, pageResult: PageResult) {
  return (url: string) => {
    if (matchesAnyPartially(url, state.params.ignore || [])) {
      pushUnique(pageResult.ignored, url);
      return true;
    }
    return false;
  };
}

function createRequestTimeoutHandler(pageResult: PageResult) {
  return (arr: Request[], msDiff: number, resolve: () => void) => {
    info("- timeout at", msDiff, "ms. Unfinished resource requests", arr.length);
    for (const request of arr) {
      pageResult.failed.push({status: "timeout", url: request.url()});
    }
    arr.length = 0;
    resolve();
  };
}

function createListeners(pageResult: PageResult, openRequests: Request[], isIgnored: (url: string) => boolean) {
  const listeners = new Map<keyof PageEventObj, any>();
  listeners.set("request", (request: Request) => {
    const url = request.url();
    debug("request started", url);
    if (isIgnored(url)) {
      request.abort();
      info("- aborting request because url is ignored", url);
    } else {
      openRequests.push(request);
      request.continue();
    }
  });
  listeners.set("requestfailed", (request: Request) => {
    const url = request.url();
    debug("request failed", url);
    removeFromArray(openRequests, request);
    if (!isIgnored(url)) {
      info("- failed", url, "errorText", request.failure().errorText);
      pageResult.failed.push({
        url,
        errorText: request.failure().errorText,
      });
    }
  });
  listeners.set("response", (response: Response) => {
    debug("response", response.url());
    if ([200, 204, 206, 301, 302, 304].includes(response.status())) {
      pageResult.succeeded.push(response.url());
    } else {
      info("- failed", response.url(), "status", response.status());
      pageResult.failed.push({url: response.url(), status: response.status()});
    }
  });
  listeners.set("requestfinished", (request: Request) => {
    removeFromArray(openRequests, request);
    debug("request finished", request.url(), "unfinished", openRequests);
  });
  listeners.set("pageerror", (error: ErrorInfo) => {
    pageResult.pageErrors.push(errorToObject(error));
    info("- pageerror", error.message);
  });
  listeners.set("error", (error: ErrorInfo) => {
    pageResult.errors.push(errorToObject(error));
    info("- error", error.message);
  });
  return listeners;
}

function matchesAnyPartially(s: string, patterns: MatcherType[]) {
  for (const pattern of patterns) {
    if (typeof (pattern) === "function" && pattern(s)) {
      return true;
    }
    if ((pattern instanceof (RegExp)) && (pattern as RegExp).test(s)) {
      return true;
    } else if (s.includes(pattern as string)) {
      return true;
    }
  }
  return false;
}

async function waitUntilEmpty(arr: Request[],
                              timeoutMs: number,
                              handleTimeout: (arr: Request[],
                                              msDiff: number,
                                              resolve: () => void,
                                              reject?: (err: any) => void,
                              ) => void) {
  const startMs = new Date().getTime();
  return new Promise((resolve, reject) => {
      const waitForRequestToFinish = () => {
        if (arr.length === 0) {
          resolve();
        } else {
          const msDiff = new Date().getTime() - startMs;
          debug("Waiting for requests to finish", msDiff, timeoutMs, arr);
          if (msDiff > timeoutMs) {
            handleTimeout(arr, msDiff, resolve, reject);
          } else {
            setTimeout(waitForRequestToFinish, 1000);
          }
        }
      };
      setTimeout(waitForRequestToFinish, 500);
    },
  );
}

async function scrollToTop(page: Page) {
  return await page.evaluate("window.scrollTo(0,0)");
}

async function scrollToEnd(page: Page) {
  let scroll = true;
  let originalPosition = await page.evaluate("window.pageYOffset");
  while (scroll) {
    await page.evaluate("window.scrollBy(0, window.innerHeight)");
    const currentPosition = await page.evaluate("window.pageYOffset");
    if (currentPosition !== originalPosition) {
      await page.waitFor(50);
      originalPosition = currentPosition;
    } else {
      scroll = false;
    }
  }
  return 1;
}

async function getHrefs(page: Page) {
  return await page.evaluate(() => {
    const anchors = document.querySelectorAll("a");
    return [].map.call(anchors, (a: any) => a.href);
  });
}

export function errorToObject(error: ErrorInfo): ErrorInfo {
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

function collectHrefs(pageHrefs: string[], finalUrl: string, isIgnored: (url: string) => boolean) {
  const hrefs: string[] = [];
  for (const href of pageHrefs) {
    const url = new URL(href, finalUrl);
    const urlString = url.toString();
    if (isIgnored(urlString)) {
      info("- ignoring href", urlString);
    } else {
      if (href.length > 0) {
        pushUnique(hrefs, href);
      }
    }
  }
  return hrefs;
}

function cleanResult(pageResult: PageResult) {
  if (pageResult.url === pageResult.originalUrl) {
    delete pageResult.originalUrl;
  }
  for (const key of Object.keys(pageResult)) {
    const e: any = pageResult[key];
    if (Array.isArray(e) && e.length === 0) {
      delete pageResult[key];
    }
  }
}

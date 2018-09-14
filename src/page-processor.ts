import {Headers, Page, PageEventObj, Request, Response} from "puppeteer";
import {debug, info, pushUnique, removeFromArray} from "./util";
import {URL} from "url";
import {ErrorInfo, PageResult, State} from "./check-site";

export class PageProcessor {
  page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async process(url: string, isInternal: boolean, state: State): Promise<PageResult> {
    const pageResult: PageResult = PageProcessor.createPageResult(url, isInternal);
    const isIgnored = PageProcessor.createIsIgnored(state, pageResult);
    const handleRequestTimeout = PageProcessor.createRequestTimeoutHandler(pageResult);
    const openRequests: Request[] = [];
    const listeners = PageProcessor.createListeners(pageResult, openRequests, isIgnored);
    await this.processPage(url, state, listeners, openRequests, handleRequestTimeout);
    const pageHrefs = await this.getHrefs();
    pageResult.url = this.page.url();
    pageResult.hrefs.push(...PageProcessor.collectHrefs(pageHrefs, pageResult.url, isIgnored));
    PageProcessor.cleanResult(pageResult);
    return pageResult;
  }

  private static createPageResult(url: string, isInternal: boolean): PageResult {
    const pageResult: PageResult = {
      url: url,
      originalUrl: url,
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
    return pageResult;
  }

  private static collectHrefs(pageHrefs: string[], finalUrl: string, isIgnored: (url: string) => boolean) {
    const hrefs: string[] = [];
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

  private static createListeners(pageResult: PageResult, openRequests: Request[], isIgnored: (url: string) => boolean) {
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
      pageResult.pageErrors.push(PageProcessor.errorToObject(error));
      info("- pageerror", error.message)
    });
    listeners.set('error', (error: ErrorInfo) => {
      pageResult.errors.push(PageProcessor.errorToObject(error));
      info("- error", error.message)
    });
    return listeners;
  }

  private static createIsIgnored(state: State, pageResult: PageResult) {
    return (url: string) => {
      for (const ignore of state.params.ignore || []) {
        if (PageProcessor.matches(ignore, url)) {
          pushUnique(pageResult.ignored, url);
          return true;
        }
      }
      return false;
    };
  }

  private async getHrefs() {
    return await this.page.evaluate(() => {
      const anchors = document.querySelectorAll('a');
      return [].map.call(anchors, (a: any) => a.href);
    });
  }

  private async processPage(url: string, state: State, listeners: Map<keyof PageEventObj, any>, openRequests: Request[], handleRequestTimeout: (arr: Request[], msDiff: number, resolve: () => void) => void): Promise<void> {
    const {params} = state;
    const page = this.page;
    const headers: Headers = {};
    if (state.referers[url]) {
      headers.referer = state.referers[url]
    }
    await page.setExtraHTTPHeaders(headers);
    await page.setRequestInterception(true);

    listeners.forEach((value, key) => page.on(key, value));

    try {
      await page.goto(url, {waitUntil: 'domcontentloaded', timeout: params.timeout});
      await PageProcessor.waitUntilEmpty(openRequests, params.timeout, handleRequestTimeout);
      await PageProcessor.scrollToEnd(page);
      await PageProcessor.waitUntilEmpty(openRequests, params.timeout, handleRequestTimeout);
    } finally {
      listeners.forEach((value, key) => page.removeListener(key, value));
    }
  }

  private static createRequestTimeoutHandler(pageResult: PageResult) {
    return (arr: Request[], msDiff: number, resolve: () => void) => {
      info("- timeout at", msDiff, "ms. Unfinished resource requests", arr.length);
      for (const request of arr) {
        pageResult.failed.push({status: "timeout", url: request.url()})
      }
      arr.length = 0;
      resolve();
    }
  }

  private static matches(pattern: ((s: string) => boolean | RegExp | string), string: string) {
    if (typeof(pattern) === "function") {
      return pattern(string)
    }
    if ((pattern as RegExp) instanceof RegExp) {
      return (pattern as RegExp).test(string)
    }
    return string.includes(pattern);
  }


  private static cleanResult(pageResult: PageResult) {
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
  }

  private static async waitUntilEmpty(arr: Request[], timeoutMs: number, handleTimeout: (arr: Request[], msDiff: number, resolve: () => void, reject?: (err: any) => void) => void) {
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

  private static async scrollToEnd(page: Page) {
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

  static errorToObject(error: ErrorInfo): ErrorInfo {
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
}
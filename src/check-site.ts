import {URL} from "url";
import {Browser, launch, LaunchOptions, Page} from "puppeteer";
import {debug, info, pretty, removeFromArray, writeTextFile} from "./util";
import {createReportHtml, createReportText, createReportTextShort} from "./reporting";
import {errorToObject, PageProcessor} from "./page-processor";

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

export interface ErrorInfo {
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

  constructor(params: Parameters) {
    this.params = params;
  }

  private static urlToPrefix(url: URL) {
    let s = url.protocol + "//";
    if ((url as any).auth) {
      s = s + (url as any).auth + "@";
    }
    return s + url.host;
  }

  private okToAddUrl(url: URL, urlString: string) {
    const protocolAllowed = ["http:", "https:"].includes(url.protocol);
    const hasNotBeenChecked = !this.checked.hasOwnProperty(urlString);
    const isAlreadyInTodo = !this.todo.includes(urlString);
    const isAlreadyInExternalTodo = this.todoExternal.includes(urlString);
    const isNotEmpty = urlString.length > 0;
    return protocolAllowed && hasNotBeenChecked && isAlreadyInTodo && !isAlreadyInExternalTodo && isNotEmpty;
  }

  addHrefs(hrefs: string[], currentUrl: string, currentIsInternal: boolean, root: string) {
    const rootUrl = new URL(root);
    const rootUrlStart = State.urlToPrefix(rootUrl);

    for (const href of hrefs) {
      const url = new URL(href, currentUrl);
      const urlString = url.toString();
      const urlStart = State.urlToPrefix(url);
      if (this.okToAddUrl(url, urlString)) {
        const hrefIsInternal = rootUrlStart.valueOf() === urlStart.valueOf();
        if (hrefIsInternal) {
          this.todo.push(urlString)
        } else {
          if (currentIsInternal) {
            this.todoExternal.push(urlString)
          }
        }
        this.referers[urlString] = currentUrl
      }
    }
  }
}

export class Crawler {
  browser: Browser;
  page: Page;
  state: State;

  constructor(state: State) {
    this.state = state;
  }

  async crawl(root: string): Promise<PageResult[]> {
    if (!this.browser) {
      this.browser = await launch(this.state.params as LaunchOptions);
    }
    if (!this.page) {
      this.page = await this.browser.newPage();
    }

    this.state.todo.push(root);
    try {
      await crawlUrls(this.state, this.page, root);
      const issues = collectIssues(this.state.results);
      info("checked", Object.keys(this.state.checked).length, "unique errors", issues.length);
      info(createReportText(this.state.results));
      info("results", pretty(this.state.results));
      return this.state.results;
    } finally {
      await this.browser.close();
    }
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

async function crawlUrls(state: State, page: Page, root: string) {
  do {
    const isInternal = state.todo.length > 0;
    const url = isInternal ? state.todo.shift() : state.todoExternal.shift();
    info("check", url, "checked", Object.keys(state.checked).length, "todo", state.todo.length, "todo external", state.todoExternal.length, "unique issues", collectIssues(state.results).length);
    state.processing.push(url);
    let pageResult: PageResult = undefined;
    try {
      const pageProcessor = new PageProcessor(page);
      pageResult = await pageProcessor.process(url, isInternal, state);
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
      state.addHrefs(pageResult.hrefs, pageResult.url, isInternal, root)
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
  if (params.debug) {
    (debug as any).debugOn = true;
  }
  const state = new State({...defaultParameters, ...params});
  return new Crawler(state);
}

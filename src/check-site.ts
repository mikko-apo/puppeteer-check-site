import { debug } from './util'
import { defaultParameters, Parameters } from './parameters'
import { FailUrlStatus, PageResult } from './page-result'
import { Crawler } from './crawler/crawler'
import { CrawlerState } from './crawler/crawler-state'

export interface Issue {
  failedUrl?: string;
  status?: number | string;
  error?: string;
  stack?: string;
  urls?: string[];
  loadedBy?: FailUrlStatus[];
  linkedBy?: string[];
}

export function collectIssues(results: PageResult[]) {
  const lookup: { [index: string]: Issue } = {}
  const ret: Issue[] = []

  function addIssue(key: string, base: Issue): Issue {
    let issue = lookup[key]
    if (!issue) {
      lookup[key] = issue = base
      ret.push(issue)
    }
    return issue
  }

  for (const pageResult of results) {
    for (const failed of pageResult.failed || []) {
      const failedUrl = failed.url
      const issue = addIssue(failed.url, {failedUrl})
      if (pageResult.url === failedUrl) {
        issue.status = failed.status
      } else {
        let loadedBy = issue.loadedBy
        if (!loadedBy) {
          issue.loadedBy = loadedBy = []
        }
        loadedBy.push({url: pageResult.url, status: failed.status})
      }
    }
    const allErrors = [...(pageResult.errors || []), ...(pageResult.pageErrors || [])]
    for (const error of allErrors) {
      addIssue(error.message || error.stack, {
        error: error.message,
        stack: error.stack,
        urls: [],
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

  return ret
}

export async function crawl(url: string, params = defaultParameters): Promise<PageResult[]> {
  return createCrawler(params).crawl(url)
}

export function createCrawler(params = defaultParameters): Crawler {
  if (params.debug) {
    (debug as any).debugOn = true
  }
  const state = new CrawlerState({...defaultParameters, ...params})
  return new Crawler(state)
}

import { Browser, launch, LaunchOptions, Page } from 'puppeteer'
import { PageResult } from '../page-result'
import { info, pretty, removeFromArray, writeTextFile } from '../util'
import { createReportHtml, createReportText, createReportTextShort } from '../reporting'
import { errorToObject, PageProcessor } from './page-processor'
import { collectIssues } from '../check-site'
import { CrawlerState } from './crawler-state'

export class Crawler {
  public browser: Browser
  public page: Page
  public state: CrawlerState

  constructor(state: CrawlerState) {
    this.state = state
  }

  public async crawl(root: string): Promise<PageResult[]> {
    if (!this.browser) {
      let params = this.state.params as LaunchOptions
      if (process.env.NO_SANDBOX) {
        params = {...params, args: ['--no-sandbox']}
      }
      this.browser = await launch(params)
    }
    if (!this.page) {
      this.page = await this.browser.newPage()
    }

    this.state.todo.push(root)
    try {
      await crawlUrls(this.state, this.page, root)
      const issues = collectIssues(this.state.results)
      info('checked', Object.keys(this.state.checked).length, 'unique errors', issues.length)
      info(createReportText(this.state.results))
      info('results', pretty(this.state.results))
      return this.state.results
    } finally {
      await this.browser.close()
    }
  }
}

async function crawlUrls(state: CrawlerState, page: Page, root: string) {
  do {
    const isInternal = state.todo.length > 0
    const url = isInternal ? state.todo.shift() : state.todoExternal.shift()
    info('check', url,
      'internal', isInternal,
      'checked', Object.keys(state.checked).length,
      'todo', state.todo.length,
      'todo external', state.todoExternal.length,
      'unique issues', collectIssues(state.results).length)
    state.processing.push(url)
    let pageResult: PageResult
    try {
      const pageProcessor = new PageProcessor(page)
      pageResult = await pageProcessor.process(url, isInternal, state)
    } catch (e) {
      if (e.name === 'TimeoutError') {
        pageResult = {url, failed: [{status: 'timeout', url}]}
      } else {
        pageResult = {url, errors: [errorToObject(e)]}
      }
    }
    removeFromArray(state.processing, url)
    state.results.push(pageResult)
    state.checked[url] = true
    if (pageResult.hrefs) {
      state.addHrefs(pageResult.hrefs, pageResult.url, isInternal, root, state)
    }
    const issues = collectIssues([pageResult])
    if (issues.length > 0) {
      info(createReportTextShort([pageResult]))
    }
    if (state.params.report) {
      writeTextFile(state.params.report, createReportHtml(state))
    }
    if (state.params.resultJson) {
      writeTextFile(state.params.resultJson, JSON.stringify(state.results))
    }
  } while (state.todo.length !== 0 || state.todoExternal.length !== 0)
}
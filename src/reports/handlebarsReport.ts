import * as fs from 'fs'
import * as Handlebars from 'handlebars'
import { collectIssues, Issue } from '../check-site'
import { PageResult } from '../page-result'
import { CrawlerState } from '../crawler/crawler-state'

Handlebars.registerHelper('link', (url) => new Handlebars.SafeString(
  '<a href="' + url + '">'
  + url
  + '</a>'))

interface RenderContext {
  todo?: string[];
  todoExternal?: string[];
  referers?: { [index: string]: string };
  results?: PageResult[];
  checked?: { [index: string]: boolean };
  processing?: string[];
  params?: any;
  issues?: Issue[];
}

export function createReportHtml(state: CrawlerState) {
  const context: RenderContext = {params: state.params}
  if (state.todo.length > 0) {
    context.todo = state.todo
  }
  if (state.results.length > 0) {
    context.results = state.results
    const issues = collectIssues(state.results)
    if (issues.length > 0) {
      context.issues = issues
    }
  }
  if (Object.keys(state.checked).length > 0) {
    context.checked = state.checked
  }
  if (state.processing.length > 0) {
    context.processing = state.processing
  }
  const source = __dirname + '/default.html'
  const template = Handlebars.compile(readFile(source))
  return template(context)
}

function readFile(filepath: string) {
  return fs.readFileSync(filepath, 'utf8')
}

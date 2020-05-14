import { PageResult } from '../page-result'
import { collectIssues } from '../check-site'

export function createReportText(results: PageResult[]) {
  const ret = []
  const issues = collectIssues(results)
  for (const issue of issues) {
    const firstLine = []
    if (issue.error) {
      firstLine.push('Error:', issue.error)
    }
    if (issue.failedUrl) {
      firstLine.push('Url:', issue.failedUrl)
    }
    if (issue.status) {
      firstLine.push('Status:', issue.status)
    }
    ret.push(firstLine.join(' '))
    if (issue.stack) {
      ret.push('- Stack: ' + issue.stack)
    }
    if (issue.urls) {
      ret.push(...issue.urls.map((u) => ' - Url: ' + u))
    }
    if (issue.loadedBy) {
      ret.push(...issue.loadedBy.map((l) => ' - Loaded by: ' + l.url + ' fail status: ' + l.status))
    }
    if (issue.linkedBy) {
      ret.push(...issue.linkedBy.map((u) => ' - Linked by: ' + u))
    }
  }
  return ret.join('\n')
}

export function createReportTextShort(results: PageResult[]) {
  const ret = []
  const issues = collectIssues(results)
  for (const issue of issues) {
    const firstLine: (string | number)[] = ['-']
    if (issue.status) {
      firstLine.push(issue.status)
    }
    if (issue.error) {
      firstLine.push('error:', issue.error)
    }
    if (issue.failedUrl) {
      firstLine.push(issue.failedUrl)
    }
    ret.push(firstLine.join(' '))
  }
  return ret.join('\n')
}
import { URL } from 'url'
import { PageResult } from '../page-result'
import { Parameters } from '../parameters'

export class CrawlerState {

  public todo: string[] = []
  public todoExternal: string[] = []
  public referers: { [index: string]: string } = {}
  public results: PageResult[] = []
  public checked: { [index: string]: boolean } = {}
  public processing: string[] = []
  public params: Parameters

  constructor(params: Parameters) {
    this.params = {...params}
  }

  private static siteUrlAsString(url: URL) {
    const parts = []
    if ((url as any).auth) {
      parts.push((url as any).auth, '@')
    }
    parts.push(url.host)
    return parts.join('')
  }

  private static pageUrlAsString(url: URL) {
    const parts = []
    if ((url as any).auth) {
      parts.push((url as any).auth, '@')
    }
    parts.push(url.host, ':', url.port, url.pathname)
    return parts.join()
  }

  private static pathAsDir(url: URL) {
    const s = url.toString()
    return s.endsWith('/') ? s : `${s}/`
  }

  public addHrefs(hrefs: string[], currentUrl: string, currentIsInternal: boolean, root: string, state: CrawlerState) {
    const rootUrl = new URL(root)

    for (const href of hrefs) {
      const url = new URL(href, currentUrl)
      const urlString = url.toString()
      if (this.okToAddUrl(url, urlString)) {
        if (this.urlIsScanned(rootUrl, url)) {
          this.todo.push(urlString)
        } else {
          if (currentIsInternal && !state.params.ignoreExternals) {
            this.todoExternal.push(urlString)
          }
        }
        this.referers[urlString] = currentUrl
      }
    }
  }

  private okToAddUrl(url: URL, urlString: string) {
    const protocolAllowed = ['http:', 'https:'].includes(url.protocol)
    const hasNotBeenChecked = !this.checked.hasOwnProperty(urlString)
    const isAlreadyInTodo = !this.todo.includes(urlString)
    const isAlreadyInExternalTodo = this.todoExternal.includes(urlString)
    const isNotEmpty = urlString.length > 0
    return protocolAllowed && hasNotBeenChecked && isAlreadyInTodo && !isAlreadyInExternalTodo && isNotEmpty
  }

  private urlIsScanned(rootUrl: URL, url: URL) {
    switch (this.params.scan) {
      case 'site': {
        return CrawlerState.siteUrlAsString(rootUrl).valueOf() === CrawlerState.siteUrlAsString(url).valueOf()
      }
      case 'page': {
        return CrawlerState.pageUrlAsString(rootUrl).valueOf() === CrawlerState.pageUrlAsString(url).valueOf()
      }
      case 'section': {
        const isSamePage = CrawlerState.pageUrlAsString(rootUrl).valueOf() === CrawlerState.pageUrlAsString(url).valueOf()
        const isChild = url.toString().startsWith(CrawlerState.pathAsDir(rootUrl))
        return isSamePage || isChild
      }
      default: {
        return this.params.scan.test(url.toString())
      }
    }
  }
}
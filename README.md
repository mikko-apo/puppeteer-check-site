# check-site.ts

Site checker that uses a real browser (Chrome with Puppeteer) to check your site for errors.

Features:
* Checks for broken links, timeouts and javascript errors.
* Makes sure that external links work also. 
* Generates HTML report
* Simulates a real browser session and user activity
  * Supports lazy loading of elements by scrolling through the whole page.
  * Referer header is sent for referenced pages
* Checks the whole site or a segment or just a page or urls matching a regexp pattern 
* Easy automation: headless browser + error exit code + report in console log => easy scripting for scheduled runs
* Custom `onPageCheckReady()` javascript/typescript functions. Support custom operations like test logins or dynamic app use. The custom code has access to the page once it has been processed.
* Configuration can be stored in json files

# Upcoming features
* Commandline report
* Support redirects
* headers
* retries
* external links check
* possible to (--require) custom javascript files:
  * onPageCheckReady should have: access to browser, href collection
  * intercept page parsing: onCrawl(crawl: (url: string, isInternal: boolean, state: State) => Promise<PageResult>)
* incorrect url is saved: https://www.reaktor.com/blog/youre-hired-in-other-words-how-to-get-a-job-at-reaktor/#finnishVersion
* close tab and reopen tab after n operations
* parallel operations: tabs & browsers
* npm publish: https://medium.com/cameron-nokes/the-30-second-guide-to-publishing-a-typescript-package-to-npm-89d93ff7bccd
* app packaging: https://github.com/nexe/nexe or https://github.com/zeit/pkg
* site checker: https://www.npmjs.com/package/bs-broken-links-checker

# Command line parameters

* scan - limit search to a specific part of the site. default: site
  * [site|page|section|/regexp/]
  * `site`: same auth and host, http or https, any port, any path - (auth@)host
  * `page`: same auth, host, port and path - (auth@)host:port/path
  * `section`: page or any path below it: When root is http://localhost/a
    * following urls are scanned: http://localhost/a/b, http://localhost/a?123
    * following urls are considered external: http://localhost/aB  
  * `regexp`: Define a regexp pattern, for example: `/blog/`
  
* require - comma separated list of files that are loaded and contain onPageCheckReady handler functions:

      export async function onPageCheckReady(page: Page, pageResult: PageResult):Promise<void> {
        return await page.click('button')
      }
      
* config - load json files as parameters. See [exampleParams.json](exampleParams.json)
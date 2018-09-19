# check-site.ts

Site checker that uses a real browser (Chrome with Puppeteer) to check your site for errors.

Features:
* Checks for broken and dead links, timeouts, page resource load errors and javascript errors.
* Makes sure that external links work. 
* Generates HTML report
* Easy automation: headless browser + error exit code + report in console log => easy scripting for scheduled runs
* Simulates a real browser session and user activity
  * Supports lazy loading of elements by scrolling through the whole page.
  * Referer header is sent for referenced pages
* Checks the whole site or a segment or just a page or urls matching a regexp pattern 

# Upcoming features
* Commandline report
* Support redirects
* headers
* retries
* config file
* incorrect url is saved: https://www.reaktor.com/blog/youre-hired-in-other-words-how-to-get-a-job-at-reaktor/#finnishVersion
* close tab and reopen tab after n operations
* parallel operations: tabs & browsers
* app packaging: https://github.com/nexe/nexe or https://github.com/zeit/pkg
* site checker: https://www.npmjs.com/package/bs-broken-links-checker

# Command line parameters

* scan: [site|page|section|/regexp/]
  * site: same auth and host, http or https, any port, any path - (auth@)host
  * page: same auth, host, port and path - (auth@)host:port/path
  * section: page or any path below it: When root is http://localhost/a
    * following urls are scanned: http://localhost/a/b, http://localhost/a?123
    * following urls are considered external: http://localhost/aB  
  * regexp: Define a regexp pattern, for example: `/blog/` 
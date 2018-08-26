# check-site.js

Site checker that uses a real browser (Chrome with Puppeteer) to check your site for errors.

Features:
* Checks for broken and dead links, page resource load errors and javascript errors.
* Supports lazy loading of elements by scrolling through the whole page.
* Generates HTML report
* Easy automation: headless browser + error exit code + report in console log => easy scripting for scheduled runs 

# Upcoming features
* External link checking
* Commandline report
* Support redirects: 
* Link check strategies: Page, Site, Segment
* maintain-referrer
* close tab and reopen tab after n operations
* parallel operations: tabs & browsers
* app packaging: https://github.com/nexe/nexe or https://github.com/zeit/pkg
* site checker: https://www.npmjs.com/package/bs-broken-links-checker

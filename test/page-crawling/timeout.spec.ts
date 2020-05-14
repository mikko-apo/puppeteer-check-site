import {createCrawler} from "../../src/check-site";
import {createReportHtml} from "../../src/reports/handlebarsReport";
import {app, containsInOrder, eq} from "../test-util";

describe('Crawl timeout', () => {
  it('Main url', async () => {
    app.siteData = {
      a: {
        sleepMs: 20000
      }
    };
    const crawler = createCrawler({timeout: 750});
    const res = await crawler.crawl(app.makeUrl("a"));
    eq(res, [{
      "url": app.makeUrl("a"),
      "failed": [{
        status: "timeout",
        url: app.makeUrl("a")
      }]
    }]);
    containsInOrder(createReportHtml(crawler.state),
      "Issues: 1", app.makeUrl("a"), "status: timeout",
      "Checked 1 pages", app.makeUrl("a"), "Failed resources 1:", app.makeUrl("a"))
  });

  it('Resource', async () => {
    app.siteData = {
      a: {
        headInlineScript: [['window.onload=function(){fetch("', app.makeUrl("b"), '")}']]
      },
      b: {
        sleepMs: 20000
      }
    };
    const crawler = createCrawler({timeout: 750});
    const res = await crawler.crawl(app.makeUrl("a"));
    eq(res, [
      {
        "url": app.makeUrl("a"),
        "failed": [{
          status: "timeout",
          url: app.makeUrl("b")
        }],
        "succeeded": [
          app.makeUrl("a")
        ]
      }
    ]);
    containsInOrder(createReportHtml(crawler.state),
      "Issues: 1", app.makeUrl("b"), app.makeUrl("a"), "status: timeout",
      "Checked 1 pages", app.makeUrl("a"), "Failed resources 1:", app.makeUrl("b"), "Loaded resources 1:", app.makeUrl("a"))
  })
});
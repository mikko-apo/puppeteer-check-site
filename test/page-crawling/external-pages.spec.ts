import {createCrawler} from "../../src/check-site";
import {deepStrictEqual} from "assert";
import {createReportHtml} from "../../src/reports/handlebarsReport";
import {app, app2, app3, containsInOrder} from "../test-util";

describe("External pages", () => {
  it('third host is not crawled', async () => {
    app.siteData = {
      a: {
        hrefs: app2.makeUrl("b")
      }
    };
    app2.siteData = {
      b: {
        hrefs: app3.makeUrl("c")
      }
    };
    const crawler = createCrawler();
    const res = await crawler.crawl(app.makeUrl("a"));
    deepStrictEqual(res, [
      {
        "url": app.makeUrl("a"),
        "hrefs": [
          app2.makeUrl("b")
        ],
        "succeeded": [
          app.makeUrl("a")
        ]
      },
      {
        "external": true,
        "url": app2.makeUrl("b"),
        "hrefs": [
          app3.makeUrl("c")
        ],
        "succeeded": [
          app2.makeUrl("b")
        ]
      }
    ]);
    containsInOrder(createReportHtml(crawler.state),
      "Checked 2 pages"
    );
  })
});
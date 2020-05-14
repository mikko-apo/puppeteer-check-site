import {deepStrictEqual} from "assert";
import {createCrawler} from "../../src/check-site";
import {app, containsInOrder} from "../test-util";
import {createReportHtml} from "../../src/reports/handlebarsReport";

describe('Should crawl linked pages', () => {
  const pages = {
    a: {
      hrefs: ["b", "c"]
    },
    b: {}
  };
  const expectedResult = [{
    "url": app.makeUrl("a"),
    "succeeded": [app.makeUrl("a")],
    "hrefs": [app.makeUrl("b"), app.makeUrl("c")]
  }, {
    "url": app.makeUrl("b"),
    "succeeded": [app.makeUrl("b")]
  }, {
    "url": app.makeUrl("c"),
    "failed": [
      {
        "status": 404,
        "url": app.makeUrl("c")
      }
    ]
  }];

  it('Two pages, three links, one link that does not exist', async () => {
    app.siteData = pages;
    const crawler = createCrawler();
    const res = await crawler.crawl(app.makeUrl("a"));
    deepStrictEqual(res, expectedResult);
    containsInOrder(createReportHtml(crawler.state),
      "Issues: 1", app.makeUrl("c"), "status: 404", "Linked by", app.makeUrl("a"),
      "Checked 3 pages",
      app.makeUrl("a"), "Links 2", app.makeUrl("b"), app.makeUrl("c"), "Loaded resources 1", app.makeUrl("a"),
      app.makeUrl("b"), "Loaded resources 1", app.makeUrl("b"),
      app.makeUrl("c"), "Failed resources 1", app.makeUrl("c"), "status: 404",
    )
  })
});


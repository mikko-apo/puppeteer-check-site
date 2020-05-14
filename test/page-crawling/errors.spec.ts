import {createCrawler} from "../../src/check-site";
import {createReportHtml} from "../../src/reports/handlebarsReport";
import {containsInOrder, eq} from "../test-util";

describe('Catch error for non-existing page', () => {
  const expectedResult = [
    {
      "url": "http://localhost:33",
      "errors": [
        {
          "message": "net::ERR_CONNECTION_REFUSED at http://localhost:33"
        }
      ]
    }
  ];

  it('Catch error', async () => {
    const crawler = createCrawler();
    const res = await crawler.crawl("http://localhost:33");
    delete res[0].errors[0].stack;
    eq(res, expectedResult);
    containsInOrder(createReportHtml(crawler.state),
      "Issues: 1", "net::ERR_CONNECTION_REFUSED at http://localhost:33", //"Error stack:","http://localhost:33",
      "Checked 1 pages", "Errors 1:"
    )

  })
});

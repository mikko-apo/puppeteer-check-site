import {crawl} from "../../src/check-site";
import {app, eq} from "../test-util";

describe('Catch javascript errors', () => {
  const pages = {
    a: {
      headInlineScript: "pow();"
    }
  };
  const expectedResult = [{
    "url": app.makeUrl("a"),
    "pageErrors": [{"message": "ReferenceError: pow is not defined\n    at " + app.makeUrl("a") + ":3:9"}],
    "succeeded": [app.makeUrl("a")]
  }];

  it('Catch error', async () => {
    app.siteData = pages;
    const res = await crawl(app.makeUrl("a"));
    eq(res, expectedResult)
  })
});

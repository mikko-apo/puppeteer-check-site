import {crawl} from "../../src/check-site";
import {app, eq} from "../test-util";

it('ignoreExternals', async () => {
  app.siteData = {
    a: {
      hrefs: "b"
    }
  };
  const res = await crawl(app.makeUrl("a"), {ignoreExternals: true, scan: 'page'});
  eq(res, [{
    "url": app.makeUrl("a"),
    "hrefs": [app.makeUrl("b")],
    "succeeded": [app.makeUrl("a")]
  }])
});

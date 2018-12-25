import {crawl} from "../../src/check-site";
import {app, eq} from "../test-util";

describe('Ignore urls', () => {
  it('Ignore internal href', async () => {
    app.siteData = {
      a: {
        hrefs: "twitter"
      }
    };
    const res = await crawl(app.makeUrl("a"), {ignore: ["twitter"]});
    eq(res, [{
      "url": app.makeUrl("a"),
      "ignored": [app.makeUrl("twitter")],
      "succeeded": [app.makeUrl("a")]
    }])
  });

  it('Ignore external href', async () => {
    app.siteData = {
      a: {
        hrefs: "http://twitter.com/"
      }
    };
    const res = await crawl(app.makeUrl("a"), {ignore: ["http://twitter.com"]});
    eq(res, [{
      "url": app.makeUrl("a"),
      "ignored": ["http://twitter.com/"],
      "succeeded": [app.makeUrl("a")]
    }])
  });

  it('Ignore resource load', async () => {
    app.siteData = {
      a: {
        script: "test.js"
      }
    };
    const res = await crawl(app.makeUrl("a"), {ignore: ["test.js"]});
    eq(res, [{
      "url": app.makeUrl("a"),
      "ignored": [app.makeUrl("test.js")],
      "succeeded": [app.makeUrl("a")]
    }])
  })
});

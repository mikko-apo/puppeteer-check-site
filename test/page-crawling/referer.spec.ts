import {crawl} from "../../src/check-site";
import {app, eq} from "../test-util";

describe('Referer', () => {
  it('Referer is passed to second page', async () => {
    const ref: string[] = [];
    app.siteData = {
      a: {
        hrefs: "b"
      },
      b: {
        txtFn: (req) => {
          ref.push(req.get("Referer"));
          return "pow"
        }
      }
    };
    const res = await crawl(app.makeUrl("a"));
    eq(ref, [app.makeUrl("a")]);
    eq(res, [
      {
        "url": app.makeUrl("a"),
        "hrefs": [
          app.makeUrl("b")
        ],
        "succeeded": [
          app.makeUrl("a")
        ]
      },
      {
        "url": app.makeUrl("b"),
        "succeeded": [
          app.makeUrl("b")
        ]
      }
    ])
  })
});

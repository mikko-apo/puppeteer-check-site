const assert = require('assert');
const app = require('./testApp');
const checkSite = require('../check-site');

/*
function eq(was, expected) {
    was = JSON.stringify(was);
    expected = JSON.stringify(expected);
    if (was !== expected) {
        throw new Error(was + " is not equal to expected " + expected);
    }
}
*/

describe('Three pages, two links, one page that does not exist', () => {
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

  it('Should crawl linked pages', async () => {
    app.setPageData(pages);
    const res = await checkSite.crawl(app.makeUrl("a"));
    assert.deepStrictEqual(res, expectedResult)
  })
})

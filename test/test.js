const assert = require('assert').strict;
const app = require('./testApp');
const checkSite = require('../check-site');

function eq(was, expected) {
  was = JSON.stringify(was);
  expected = JSON.stringify(expected);
  if (was !== expected) {
    throw new Error(was + " is not equal to expected " + expected);
  }
}

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
    assert.deepEqual(res, expectedResult)
  })
});

describe('Catch javascript errors', () => {
  const pages = {
    a: {
      headInlineScript: ["pow();"]
    }
  };
  const expectedResult = [{
    "url": app.makeUrl("a"),
    "succeeded": [app.makeUrl("a")],
    "pageErrors": [{"message": "ReferenceError: pow is not defined\n    at " + app.makeUrl("a") + ":3:9"}]
  }];

  it('Catch error', async () => {
    app.setPageData(pages);
    const res = await checkSite.crawl(app.makeUrl("a"));
    eq(res, expectedResult)
  })
});

describe('Ignore urls', () => {
  it('Ignore internal href', async () => {
    app.setPageData({
      a: {
        hrefs: ["twitter"]
      }
    });
    const res = await checkSite.crawl(app.makeUrl("a"), {ignore: ["twitter"]});
    eq(res, [{
      "url": app.makeUrl("a"),
      "succeeded": [app.makeUrl("a")],
      "ignored": [app.makeUrl("twitter")]
    }])
  });

  it('Ignore external href', async () => {
    app.setPageData({
      a: {
        hrefs: ["http://twitter.com/"]
      }
    });
    const res = await checkSite.crawl(app.makeUrl("a"), {ignore: ["http://twitter.com"]});
    eq(res, [{
      "url": app.makeUrl("a"),
      "succeeded": [app.makeUrl("a")],
      "ignored": ["http://twitter.com/"]
    }])
  });

  it('Ignore resource load', async () => {
    app.setPageData({
      a: {
        script: ["test.js"]
      }
    });
    const res = await checkSite.crawl(app.makeUrl("a"), {ignore: ["test.js"]});
    eq(res, [{
      "url": app.makeUrl("a"),
      "succeeded": [app.makeUrl("a")],
      "ignored": [app.makeUrl("test.js")]
    }])
  })
});
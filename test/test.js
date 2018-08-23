const assert = require('assert').strict;
const app = require('./testApp');
const checkSite = require('../check-site');

function eq(was, expected) {
  was = JSON.stringify(was, null, 2);
  expected = JSON.stringify(expected, null, 2);
  if (was !== expected) {
    throw new Error(was + " is not equal to expected " + expected);
  }
}

function containsInOrder(txt, ...rest) {
  let prevIndex = undefined;
  const found = []
  for (const s of rest) {
    const index = txt.indexOf(s, prevIndex ? prevIndex + 1 : 0);
    if (index > (prevIndex || -1)) {
      prevIndex = index;
      found.push(s);
    } else {
      if (found.length > 0) {
        throw new Error(`Could not find '${s}'. Found ${found.length} items in order: [${found.map(s => `'${s}'`)}] from '${txt}'`)
      } else {
        throw new Error(`Could not find '${s}' from '${txt}'`)
      }
    }
  }
}

describe('Two pages, three links, one link that does not exist', () => {
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
    const crawler = checkSite.crawler();
    const res = await crawler.crawl(app.makeUrl("a"));
    assert.deepEqual(res, expectedResult);
    containsInOrder(crawler.createReport(),
      "Issues: 1", app.makeUrl("c"), "status: 404", "Linked by", app.makeUrl("a"),
      "Checked 3 pages",
      app.makeUrl("a"), "Links 2", app.makeUrl("b"), app.makeUrl("c"), "Loaded resources 1", app.makeUrl("a"),
      app.makeUrl("b"), "Loaded resources 1", app.makeUrl("b"),
      app.makeUrl("c"), "Failed resources 1", app.makeUrl("c"), "status: 404",
    )
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
    "pageErrors": [{"message": "ReferenceError: pow is not defined\n    at " + app.makeUrl("a") + ":3:9"}],
    "succeeded": [app.makeUrl("a")]
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
      "ignored": [app.makeUrl("twitter")],
      "succeeded": [app.makeUrl("a")]
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
      "ignored": ["http://twitter.com/"],
      "succeeded": [app.makeUrl("a")]
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
      "ignored": [app.makeUrl("test.js")],
      "succeeded": [app.makeUrl("a")]
    }])
  })
});

describe("Commandline", () => {
  const cmd = require('../check-site');
  let collectectedUrls;
  let expectedParams;

  beforeEach(() => {
    cmd.crawler = (params) => {
      eq(params, expectedParams);
      return {
        crawl: (url) => {
          collectectedUrls.push(url)
        }
      }
    };

    collectectedUrls = [];
    expectedParams = {}
  });

  it('single host', async () => {
    cmd.startCommandLine(["localhost"]);
    await eq(collectectedUrls, ["localhost"])
  });

  it('single host debug', async () => {
    expectedParams = {"debug": true};
    await cmd.startCommandLine(["localhost", "debug:true"]);
    eq(collectectedUrls, ["localhost"])
  });

  it('two hosts ignore', async () => {
    expectedParams = {"ignore": ["test", /pow:pow/]};
    await cmd.startCommandLine(["localhost", "foo", "ignore:test,/pow:pow/"]);
    eq(collectectedUrls, ["localhost", "foo"])
  })
});

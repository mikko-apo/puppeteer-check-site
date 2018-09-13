import {launch} from "./testApp";
import {deepStrictEqual} from "assert";
import {crawl, Crawler, createCrawler, createState, PageResult, Parameters} from "../src/check-site";
import {createReportHtml} from "../src/reporting";
import {startCommandLine} from "../src/commandline";

const app = launch();
const app2 = launch();
const app3 = launch();

function eq<T>(was: T, expected: T) {
  const wasJson = JSON.stringify(was, null, 2);
  const expectedJson = JSON.stringify(expected, null, 2);
  if (wasJson !== expectedJson) {
    throw new Error(wasJson + " is not equal to expected " + expectedJson);
  }
}

function containsInOrder(txt: string, ...rest: string[]) {
  let prevIndex = undefined;
  const found = [];
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

describe('Timeout', () => {
  it('Main url', async () => {
    app.siteData = {
      a: {
        sleepMs: 20000
      }
    };
    const crawler = createCrawler({timeout: 750});
    const res = await crawler.crawl(app.makeUrl("a"));
    eq(res, [{
      "url": app.makeUrl("a"),
      "failed": [{
        status: "timeout",
        url: app.makeUrl("a")
      }]
    }]);
    containsInOrder(createReportHtml(crawler.state),
      "Issues: 1", app.makeUrl("a"), "status: timeout",
      "Checked 1 pages", app.makeUrl("a"), "Failed resources 1:", app.makeUrl("a"))
  });

  it('Resource', async () => {
    app.siteData = {
      a: {
        headInlineScript: [['window.onload=function(){fetch("', app.makeUrl("b"), '")}']]
      },
      b: {
        sleepMs: 20000
      }
    };
    const crawler = createCrawler({timeout: 750});
    const res = await crawler.crawl(app.makeUrl("a"));
    eq(res, [
      {
        "url": app.makeUrl("a"),
        "failed": [{
          status: "timeout",
          url: app.makeUrl("b")
        }],
        "succeeded": [
          app.makeUrl("a")
        ]
      }
    ]);
    containsInOrder(createReportHtml(crawler.state),
      "Issues: 1", app.makeUrl("b"), app.makeUrl("a"), "status: timeout",
      "Checked 1 pages", app.makeUrl("a"), "Failed resources 1:", app.makeUrl("b"), "Loaded resources 1:", app.makeUrl("a"))
  })
});

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

describe('Catch error for non-existing page', () => {
  const expectedResult = [
    {
      "url": "http://reaktor2234.com",
      "errors": [
        {
          "message": "net::ERR_NAME_NOT_RESOLVED at http://reaktor2234.com"
        }
      ]
    }
  ];

  it('Catch error', async () => {
    const crawler = createCrawler();
    const res = await crawler.crawl("http://reaktor2234.com");
    delete res[0].errors[0].stack;
    eq(res, expectedResult);
    containsInOrder(createReportHtml(crawler.state),
      "Issues: 1", "net::ERR_NAME_NOT_RESOLVED at http://reaktor2234.com", //"Error stack:","https://reaktor2234.com",
      "Checked 1 pages", "Errors 1:"
    )

  })
});

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

describe("Commandline", () => {
  let collectectedUrls: string[];
  let expectedParams: Parameters;
  const createCrawlerF: (params: Parameters) => Crawler = (params: Parameters) => {
    eq(params, expectedParams);
    return {
      crawl: (root: string): Promise<PageResult[]> => {
        collectectedUrls.push(root)
        return null
      },
      state: createState(params)
    }
  }

  beforeEach(() => {
    collectectedUrls = [];
    expectedParams = {}
  });

  it('single host', async () => {
    await startCommandLine(["localhost"], createCrawlerF);
    eq(collectectedUrls, ["localhost"])
  });

  it('single host debug', async () => {
    expectedParams = {"debug": true};
    await startCommandLine(["localhost", "debug:true"], createCrawlerF);
    eq(collectectedUrls, ["localhost"])
  });

  it('two hosts ignore', async () => {
    expectedParams = {"ignore": ["test", /pow:pow/]};
    await startCommandLine(["localhost", "foo", "ignore:test,/pow:pow/"], createCrawlerF);
    eq(collectectedUrls, ["localhost", "foo"])
  })
});

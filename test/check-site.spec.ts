import {launch} from "./testApp";
import {deepStrictEqual} from "assert";
import {crawl, createCrawler, defaultParameters, State} from "../src/check-site";
import {createReportHtml} from "../src/reporting";
import {parseParams} from "../src/commandline";

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
})

describe('scan', () => {
  it('site', () => {
    const state = new State(defaultParameters);
    state.params.scan = 'site';
    state.addHrefs([
      "a",
      "a/b",
      "http://localhost:8080" // external
    ], "http://localhost/c", true, "http://localhost/d", new State(defaultParameters));
    eq(state.todo, [
      "http://localhost/a",
      "http://localhost/a/b"
    ]);
    eq(state.todoExternal, ["http://localhost:8080/"])
  });
  it('page', () => {
    const state = new State(defaultParameters);
    state.params.scan = 'page';
    state.addHrefs([
      "?567",
      "#foo",
      "a",
    ], "http://localhost/d?123", true, "http://localhost/d", new State(defaultParameters));
    eq(state.todo, [
      "http://localhost/d?567",
      "http://localhost/d?123#foo"
    ]);
    eq(state.todoExternal, [
      "http://localhost/a"
    ])
  });
  it('section', () => {
    const state = new State(defaultParameters);
    state.params.scan = 'section';
    state.addHrefs([
      "http://localhost/a/b",
      "?123",
      "http://localhost/aB",
    ], "http://localhost/a", true, "http://localhost/a", new State(defaultParameters));
    eq(state.todo, [
      "http://localhost/a/b",
      "http://localhost/a?123"
    ]);
    eq(state.todoExternal, [
      "http://localhost/aB"
    ])
  });
  it('regexp', () => {
    const state = new State(defaultParameters);
    state.params.scan = /.*a$/;
    state.addHrefs([
      "http://localhost/a/a",
      "?123",
      "?12a",
      "http://localhost/aB",
    ], "http://localhost/a", true, "http://localhost/", new State(defaultParameters));
    eq(state.todo, [
      "http://localhost/a/a",
      "http://localhost/a?12a"
    ]);
    eq(state.todoExternal, [
      "http://localhost/a?123",
      "http://localhost/aB"
    ])
  })
});

describe('require', () => {
  it('function that returns promise', async () => {
    const expectedResult = [{
      "url": app.makeUrl("a"),
      "ignored": ["123"]
    }];

    app.siteData = {
      a: {}
    };
    const params = parseParams([`require:${__dirname}/pageReadyTest.ts`]);
    const crawler = createCrawler(params);
    const res = await crawler.crawl(app.makeUrl("a"));
    eq(res, expectedResult)
  });

  it('async function', async () => {
    const expectedResult = [{
      "url": app.makeUrl("a"),
      "ignored": ["2"]
    }];

    app.siteData = {
      a: {}
    };
    const params = parseParams([`require:${__dirname}/pageReadyTestAsync.ts`])
    const crawler = createCrawler(params);
    const res = await crawler.crawl(app.makeUrl("a"));
    eq(res, expectedResult)
  });

  it('async function that returns an error', async () => {
    app.siteData = {
      a: {}
    };
    const params = parseParams([`require:${__dirname}/pageReadyTestError.ts`]);
    const crawler = createCrawler(params);
    const res = await crawler.crawl(app.makeUrl("a"));
    eq(res[0].errors[0].message, `${__dirname}/pageReadyTestError.ts:onPageCheckReady threw an error: Evaluation failed: SyntaxError: Unexpected number`)
  })

  it('async function that works for pages that end with /a', async () => {
    const params = parseParams([`require:${__dirname}/pageReadyA.ts`]);
    const crawler = createCrawler(params);
    app.siteData = {
      a: {hrefs: "b"},
      b: {}
    };
    eq(await crawler.crawl(app.makeUrl("a")), [
      {
        "url": app.makeUrl("a"),
        "ignored": ["2"],
        "hrefs": [app.makeUrl("b")]
      },
      {
        "url": app.makeUrl("b"),
        "succeeded": [app.makeUrl("b")]
      }
    ])
  })
});

describe("Commandline parsing", () => {
  it('single host', () => {
    eq(parseParams(["localhost"]).urls, ["localhost"])
  });

  it('single host debug', () => {
    const params = parseParams(["localhost", "debug:true"]);
    eq(params, {urls: ["localhost"], "debug": true});
  });

  it('two hosts ignore', () => {
    const params = parseParams(["localhost", "foo", "ignore:test,/pow:pow/"]);
    eq(params, {urls: ["localhost", "foo"], "ignore": ["test", /pow:pow/]});
  });

  it('scan', () => {
    eq(parseParams(["scan:page"]), {"scan": "page"});
    eq(parseParams(["scan:/pow/"]), {"scan": /pow/})
  })

  it('config', () => {
    eq(parseParams([`config:${__dirname}/testParams.json`]), {"pow": "POW"});
  })

  it('ignoreExternals', () => {
    eq(parseParams(['ignoreExternals:true']), {ignoreExternals: true});
  })
});

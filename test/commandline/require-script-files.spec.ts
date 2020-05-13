import {parseParams} from "../../src/commandline";
import {createCrawler} from "../../src/check-site";
import {app, eq} from "../test-util";

describe('require', () => {
  it('function that returns promise', async () => {
    const expectedResult = [{
      "url": app.makeUrl("a"),
      "ignored": ["123"]
    }];

    app.siteData = {
      a: {}
    };
    const params = parseParams([`require:${__dirname}/require-scripts/pageReadyTest.ts`]);
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
    const params = parseParams([`require:${__dirname}/require-scripts/pageReadyTestAsync.ts`]);
    const crawler = createCrawler(params);
    const res = await crawler.crawl(app.makeUrl("a"));
    eq(res, expectedResult)
  });

  it('async function that returns an error', async () => {
    app.siteData = {
      a: {}
    };
    const params = parseParams([`require:${__dirname}/require-scripts/pageReadyTestError.ts`]);
    const crawler = createCrawler(params);
    const res = await crawler.crawl(app.makeUrl("a"));
    eq(res[0].errors[0].message, `${__dirname}/require-scripts/pageReadyTestError.ts:onPageCheckReady threw an error: Evaluation failed: POW!`)
  });

  it('async function that works for pages that end with /a', async () => {
    const params = parseParams([`require:${__dirname}/require-scripts/pageReadyA.ts`]);
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

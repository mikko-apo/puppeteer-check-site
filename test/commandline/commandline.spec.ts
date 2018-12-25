import {parseParams} from "../../src/commandline";
import {eq} from "../test-util";

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
  });

  it('config', () => {
    eq(parseParams([`config:${__dirname}/testParams.json`]), {"pow": "POW"});
  });

  it('ignoreExternals', () => {
    eq(parseParams(['ignoreExternals:true']), {ignoreExternals: true});
  })
});

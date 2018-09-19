import * as path from "path";
import {collectIssues, Crawler, createCrawler, defaultParameters, Parameters, RequiredInterceptor} from "./check-site";
import {info} from "./util";

function isRegExp(s: string) {
  return /^\/.*\/$/.test(s);
}

function parseRegexpFromString(s: string) {
  return new RegExp(s.substr(1, s.length - 2));
}

function resolvePath(filePath: string) {
  return filePath.startsWith("/") ? filePath : path.join(process.cwd(), filePath);
}

function loadInterceptor(filePath: string): RequiredInterceptor {
  const interceptor = require(resolvePath(filePath))
   interceptor.path = filePath
  return interceptor;
}

export function parseParams(argv: string[], urls: string[]) {
  const params: Parameters = {};
  for (const arg of argv) {
    if (arg.includes(":") && defaultParameters.hasOwnProperty(arg.split(":")[0])) {
      const [key, ...rest] = arg.split(":");
      const defaultValue = defaultParameters[key];
      let value: string | number | (string | RegExp)[] | RegExp | RequiredInterceptor[] = rest.join(":");
      if (key === "scan") {
        value = isRegExp(value) ? parseRegexpFromString(value) : value
      } else if (key === "ignore") {
        value = value.split(",").map(s => /^\/.*\/$/.test(s) ? new RegExp(s.substr(1, s.length - 2)) : s)
      } else if (key === "require") {
        value = value.split(",").map((path) => loadInterceptor(path))
      } else if (typeof(defaultValue) === "boolean") {
        value = JSON.parse(value)
      } else if (typeof(defaultValue) === "number") {
        value = parseInt(value)
      }
      params[key] = value
    } else {
      urls.push(arg)
    }
  }
  return params;
}

export async function startCommandLine(argv: string[], createCrawlerF: (params: Parameters) => Crawler = createCrawler) {
  const urls: string[] = [];
  const params = parseParams(argv, urls);
  if (urls.length > 0) {
    const crawler = createCrawlerF(params);
    for (const url of urls) {
      await crawler.crawl(url)
    }
    if (params.report) {
      info("wrote report to", params.report)
    }
    if (params.resultJson) {
      info("wrote results as json to", params.resultJson)
    }
    const issues = collectIssues(crawler.state.results);
    if (issues.length > 0) {
      info("Exiting with error...");
      process.exit(1)
    }
  }
}

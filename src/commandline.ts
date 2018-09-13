import {collectIssues, Crawler, createCrawler, defaultParameters, Parameters} from "./check-site";
import {info} from "./util";

export async function startCommandLine(argv: string[], createCrawlerF: (params: Parameters) => Crawler = createCrawler) {
  const urls = [];
  const params: Parameters = {};
  for (const arg of argv) {
    if (arg.includes(":") && defaultParameters.hasOwnProperty(arg.split(":")[0])) {
      const [key, ...rest] = arg.split(":");
      const defaultValue = defaultParameters[key];
      let value: string | number | (string | RegExp)[] = rest.join(":");
      if (key === "ignore") {
        value = value.split(",").map(s => /^\/.*\/$/.test(s) ? new RegExp(s.substr(1, s.length - 2)) : s)
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

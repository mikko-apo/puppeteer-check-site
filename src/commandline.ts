import * as path from "path";
import {
  collectIssues,
  Crawler,
  createCrawler
} from "./check-site";
import {info, readFile} from "./util";
import { defaultParameters, Parameters, ScanListener } from './parameters'

function isRegExp(s: string) {
  return /^\/.*\/$/.test(s);
}

function parseRegexpFromString(s: string) {
  return new RegExp(s.substr(1, s.length - 2));
}

function resolvePath(filePath: string) {
  return filePath.startsWith("/") ? filePath : path.join(process.cwd(), filePath);
}

export interface ScanListenerDef extends ScanListener {
  listeners?: ScanListener[];
}
function loadListeners(filePath: string): ScanListener[] {
  const listeners: ScanListener[] = [];
  const listenerDef: ScanListenerDef = require(resolvePath(filePath));
  if (listenerDef.onPageCheckReady) {
    listenerDef.path = filePath;
    listeners.push(listenerDef);
  }
  if (listenerDef.listeners) {
    listenerDef.listeners.forEach((listener: ScanListener, i) => {
      listener.path = filePath;
      if (!listener.name) {
        listener.name = `${i}`;
      }
      listeners.push(listener);
    });
  }
  listenerDef.path = filePath;
  return listeners;
}

function baseValue<T>(map: any, key: string, base: T): T {
  if (map[key]) {
    return map[key] as T;
  }
  map[key] = base;
  return base;
}

export function parseParams(argv: string[]) {
  const params: Parameters = {};
  for (const arg of argv) {
    if (arg.includes(":") && defaultParameters.hasOwnProperty(arg.split(":")[0])) {
      const [key, ...rest] = arg.split(":");
      const defaultValue = defaultParameters[key];
      const v = rest.join(":");
      let value: string | number | (string | RegExp)[] | RegExp | ScanListener[];
      if (key === "scan") {
        value = isRegExp(v) ? parseRegexpFromString(v) : v;
      } else if (key === "ignore") {
        value = v.split(",").map((s) => /^\/.*\/$/.test(s) ? new RegExp(s.substr(1, s.length - 2)) : s);
      } else if (key === "require") {
        v.split(",").map((s) => baseValue(params, key, [] as ScanListener[]).push(...loadListeners(s)));
      } else if (key === "config") {
        v.split(",").forEach((s) => Object.assign(params, JSON.parse(readFile(s))));
      } else if (typeof (defaultValue) === "boolean") {
        value = JSON.parse(v);
      } else if (typeof (defaultValue) === "number") {
        value = parseInt(v, 10);
      }
      if (value !== undefined) {
        params[key] = value;
      }
    } else {
      baseValue(params, "urls", [] as string[]).push(arg);
    }
  }
  return params;
}

export async function startCommandLine(argv: string[],
                                       createCrawlerF: (params: Parameters) => Crawler = createCrawler) {
  const params = parseParams(argv);
  if (params.urls.length > 0) {
    const crawler = createCrawlerF(params);
    for (const url of params.urls) {
      await crawler.crawl(url);
    }
    if (params.report) {
      info("wrote report to", params.report);
    }
    if (params.resultJson) {
      info("wrote results as json to", params.resultJson);
    }
    const issues = collectIssues(crawler.state.results);
    if (issues.length > 0) {
      info("Exiting with error...");
      process.exit(1);
    }
  }
}

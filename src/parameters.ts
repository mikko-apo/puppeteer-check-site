import { Page } from 'puppeteer'
import { PageResult } from './page-result'
import { CrawlerState } from './crawler/crawler-state'

interface ScanOptions {
  'page': true;
  'site': true;
  'section': true;
}

export interface Parameters {
  report?: string;
  resultJson?: string;
  scan?: keyof ScanOptions | RegExp;
  require?: ScanListener[];
  config?: string;
  urls?: string[];
  ignoreExternals?: boolean;

  [index: string]: any;
}

export const defaultParameters: Parameters = {
  scan: 'site',
  report: undefined,
  resultJson: undefined,
  ignore: [],
  headless: true,
  devtools: false,
  debug: false,
  timeout: 10000,
  require: [],
  config: undefined,
  urls: [],
  ignoreExternals: false,
}


export type MatcherType = string | RegExp | ((s: string) => boolean);

export type PageAttachHandler = <T> (page: Page, state: CrawlerState) => Promise<T>;
export type PageCheckReadyHandler = <T> (page: Page, pageResult: PageResult, state: CrawlerState) => Promise<T>;
export type PageDetachHandler = <T> (page: Page, state: CrawlerState) => Promise<T>;

export interface ScanListener {
  urls?: MatcherType[];
  path?: string;
  name?: string;
  onPageAttach?: PageAttachHandler;
  onPageCheckReady?: PageCheckReadyHandler;
  onPageDetach?: PageDetachHandler;
}

import {Page} from "puppeteer";
import {PageResult} from "../src/check-site";

export function onPageReady(page: Page, pageResult: PageResult): Promise<number> {
  pageResult.ignored.push("123");
  pageResult.succeeded.length = 0;
  return page.evaluate("1+1");
}
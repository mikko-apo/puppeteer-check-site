import {Page} from "puppeteer";
import { PageResult } from '../../../src/page-result'

export function onPageCheckReady(page: Page, pageResult: PageResult): Promise<number> {
  pageResult.ignored.push("123");
  pageResult.succeeded.length = 0;
  return page.evaluate(() => 1+1);
}
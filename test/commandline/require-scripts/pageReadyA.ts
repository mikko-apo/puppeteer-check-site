import {Page} from "puppeteer";
import { PageResult } from '../../../src/page-result'

export const urls: string[] = ['/a']
export async function onPageCheckReady(page: Page, pageResult: PageResult):Promise<void> {
  pageResult.succeeded.length = 0;
  pageResult.ignored.push(await page.evaluate(() => (1+1).toString()));
}
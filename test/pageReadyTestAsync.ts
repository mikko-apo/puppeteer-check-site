import {Page} from "puppeteer";
import {PageResult} from "../src/check-site";

export async function onPageReady(page: Page, pageResult: PageResult):Promise<void> {
  pageResult.succeeded.length = 0;
  pageResult.ignored.push(await page.evaluate("(1+1).toString()"));
}
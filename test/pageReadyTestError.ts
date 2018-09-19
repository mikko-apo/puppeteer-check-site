import {Page} from "puppeteer";
import {PageResult} from "../src/check-site";

export async function onPageReady(page: Page, pageResult: PageResult):Promise<number> {
  return await page.evaluate("null.1")
}
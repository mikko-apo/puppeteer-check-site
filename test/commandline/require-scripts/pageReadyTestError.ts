import {Page} from "puppeteer";
import {PageResult} from "../../../src/check-site";

export async function onPageCheckReady(page: Page, pageResult: PageResult):Promise<number> {
  return await page.evaluate(() => {if(1 === 1 )throw "POW!"; return 3})
}
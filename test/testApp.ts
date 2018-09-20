import * as express from "express";

export interface PageData {
  txtFn?: (req: express.Request, res: express.Response, pageData: PageData) => string
  js?: string | string[]
  text?: string | string[]
  script?: string | string[]
  headInlineScript?: string | string[] | string[][]
  hrefs?: string | string[]
  sleepMs?: number
}

export interface SiteData {
  [index: string]: PageData
}

export interface TestServer {
  siteData: SiteData
  makeUrl: (path: string) => string
}

function wrap(a: any): any[] {
  return Array.isArray(a) ? a : [a]
}

function createResponse(req: express.Request, res: express.Response, pageData: PageData) {
  if (pageData.txtFn) {
    return pageData.txtFn(req, res, pageData);
  }
  if (pageData.js) {
    return wrap(pageData.js).join("\n");
  }
  if (pageData.text) {
    return wrap(pageData.text).join("\n");
  }
  let html = ["<html>"];
  if (pageData.headInlineScript || pageData.script) {
    html.push("<head>");
    if (pageData.script) {
      html = html.concat(wrap(pageData.script).map(src => '<script src="' + src + '"></script>'));
    }
    if (pageData.headInlineScript) {
      html = html.concat(wrap(pageData.headInlineScript).map(txt => ('<script>' + wrap(txt).join(" ") + '</script>')));
    }
    html.push("</head>");
  }
  if (pageData.hrefs) {
    html.push("<body>");
    html = html.concat(wrap(pageData.hrefs).map(href => '<a href="' + href + '">' + href + "</a>"));
    html.push("</body>");
  }
  html.push("</html>");
  return html.join("\n")
}

export function launch(): TestServer {
  const app = express();
  const server = app.listen(0);
  const testServer: TestServer = {
    siteData: {},
    makeUrl: (path) => `http://localhost:${(server.address() as any).port}/${path}`
  };
  app.use((req, res, next) => {
    let path = req.url.substring(1);
    if (testServer.siteData.hasOwnProperty(path)) {
      const pageData = testServer.siteData[path];
      const sleepMs = pageData.sleepMs ? pageData.sleepMs : 1;
      const txt = createResponse(req, res, pageData);
      setTimeout(() => res.send(txt), sleepMs);
      return;
    }
    next();
  });
  return testServer
}
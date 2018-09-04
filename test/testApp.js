const express = require('express');

function wrap(a) {
  return Array.isArray(a) ? a : [a]
}

function createResponse(req, res, pageData) {
  if(pageData.txtFn) {
    return pageData.txtFn(req, res, pageData);
  }
  if(pageData.js) {
    return wrap(pageData.js).join("\n");
  }
  if(pageData.text) {
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

function launch() {
  const app = express();
  const data = {
    pageData: {}
  };
  app.use((req, res, next) => {
    let path = req.url.substring(1);
    if (data.pageData.hasOwnProperty(path)) {
      const pageData = data.pageData[path];
      const sleepMs = pageData.sleepMs ? pageData.sleepMs : 1;
      const txt = createResponse(req, res, pageData);
      setTimeout(() => res.send(txt), sleepMs);
      return;
    }
    next();
  });
  const server = app.listen();
  data.makeUrl = path => "http://localhost:" + server.address().port + "/" + path;
  return data;
}


if (module) {
  module.exports = {launch};
}
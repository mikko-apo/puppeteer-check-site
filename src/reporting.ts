import * as fs from "fs";
import * as Handlebars from "handlebars";
import {collectIssues, Issue, PageResult, State} from "./check-site";

Handlebars.registerHelper("link", (url) => new Handlebars.SafeString(
  '<a href="' + url + '">'
  + url
  + "</a>"));

interface RenderContext {
  todo?: string[];
  todoExternal?: string[];
  referers?: { [index: string]: string };
  results?: PageResult[];
  checked?: { [index: string]: boolean };
  processing?: string[];
  params?: any;
  issues?: Issue[];
}

export function createReportHtml(state: State) {
  const context: RenderContext = {params: state.params};
  if (state.todo.length > 0) {
    context.todo = state.todo;
  }
  if (state.results.length > 0) {
    context.results = state.results;
    const issues = collectIssues(state.results);
    if (issues.length > 0) {
      context.issues = issues;
    }
  }
  if (Object.keys(state.checked).length > 0) {
    context.checked = state.checked;
  }
  if (state.processing.length > 0) {
    context.processing = state.processing;
  }
  const source = __dirname + "/reports/default.html";
  const template = Handlebars.compile(readFile(source));
  return template(context);
}

export function createReportText(results: PageResult[]) {
  const ret = [];
  const issues = collectIssues(results);
  for (const issue of issues) {
    const firstLine = [];
    if (issue.error) {
      firstLine.push("Error:", issue.error);
    }
    if (issue.failedUrl) {
      firstLine.push("Url:", issue.failedUrl);
    }
    if (issue.status) {
      firstLine.push("Status:", issue.status);
    }
    ret.push(firstLine.join(" "));
    if (issue.stack) {
      ret.push("- Stack: " + issue.stack);
    }
    if (issue.urls) {
      ret.push(...issue.urls.map((u) => " - Url: " + u));
    }
    if (issue.loadedBy) {
      ret.push(...issue.loadedBy.map((l) => " - Loaded by: " + l.url + " fail status: " + l.status));
    }
    if (issue.linkedBy) {
      ret.push(...issue.linkedBy.map((u) => " - Linked by: " + u));
    }
  }
  return ret.join("\n");
}

export function createReportTextShort(results: PageResult[]) {
  const ret = [];
  const issues = collectIssues(results);
  for (const issue of issues) {
    const firstLine: (string | number)[] = ["-"];
    if (issue.status) {
      firstLine.push(issue.status);
    }
    if (issue.error) {
      firstLine.push("error:", issue.error);
    }
    if (issue.failedUrl) {
      firstLine.push(issue.failedUrl);
    }
    ret.push(firstLine.join(" "));
  }
  return ret.join("\n");
}

function readFile(filepath: string) {
  return fs.readFileSync(filepath, "utf8");
}

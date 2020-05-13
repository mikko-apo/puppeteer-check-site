import {eq} from "../test-util";
import { defaultParameters } from '../../src/parameters'
import { CrawlerState } from '../../src/crawler/crawler-state'

describe('scan', () => {
  it('site', () => {
    const state = new CrawlerState(defaultParameters);
    state.params.scan = 'site';
    state.addHrefs([
      "a",
      "a/b",
      "http://localhost:8080" // external
    ], "http://localhost/c", true, "http://localhost/d", new CrawlerState(defaultParameters));
    eq(state.todo, [
      "http://localhost/a",
      "http://localhost/a/b"
    ]);
    eq(state.todoExternal, ["http://localhost:8080/"])
  });
  it('page', () => {
    const state = new CrawlerState(defaultParameters);
    state.params.scan = 'page';
    state.addHrefs([
      "?567",
      "#foo",
      "a",
    ], "http://localhost/d?123", true, "http://localhost/d", new CrawlerState(defaultParameters));
    eq(state.todo, [
      "http://localhost/d?567",
      "http://localhost/d?123#foo"
    ]);
    eq(state.todoExternal, [
      "http://localhost/a"
    ])
  });
  it('section', () => {
    const state = new CrawlerState(defaultParameters);
    state.params.scan = 'section';
    state.addHrefs([
      "http://localhost/a/b",
      "?123",
      "http://localhost/aB",
    ], "http://localhost/a", true, "http://localhost/a", new CrawlerState(defaultParameters));
    eq(state.todo, [
      "http://localhost/a/b",
      "http://localhost/a?123"
    ]);
    eq(state.todoExternal, [
      "http://localhost/aB"
    ])
  });
  it('regexp', () => {
    const state = new CrawlerState(defaultParameters);
    state.params.scan = /.*a$/;
    state.addHrefs([
      "http://localhost/a/a",
      "?123",
      "?12a",
      "http://localhost/aB",
    ], "http://localhost/a", true, "http://localhost/", new CrawlerState(defaultParameters));
    eq(state.todo, [
      "http://localhost/a/a",
      "http://localhost/a?12a"
    ]);
    eq(state.todoExternal, [
      "http://localhost/a?123",
      "http://localhost/aB"
    ])
  })
});
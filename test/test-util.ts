import {launch} from "./testApp";

export const app = launch();
export const app2 = launch();
export const app3 = launch();

export function eq<T>(was: T, expected: T) {
  const wasJson = JSON.stringify(was, null, 2);
  const expectedJson = JSON.stringify(expected, null, 2);
  if (wasJson !== expectedJson) {
    throw new Error(wasJson + " is not equal to expected " + expectedJson);
  }
}

export function containsInOrder(txt: string, ...rest: string[]) {
  let prevIndex = undefined;
  const found = [];
  for (const s of rest) {
    const index = txt.indexOf(s, prevIndex ? prevIndex + 1 : 0);
    if (index > (prevIndex || -1)) {
      prevIndex = index;
      found.push(s);
    } else {
      if (found.length > 0) {
        throw new Error(`Could not find '${s}'. Found ${found.length} items in order: [${found.map(s => `'${s}'`)}] from '${txt}'`)
      } else {
        throw new Error(`Could not find '${s}' from '${txt}'`)
      }
    }
  }
}

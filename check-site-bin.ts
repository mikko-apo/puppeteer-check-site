#!/usr/bin/env node --require ts-node/register

import {startCommandLine} from "./src/commandline";

(async () => {
  const [node, script, ...rest] = process.argv;
  await startCommandLine(rest)
})();

#!/usr/bin/env node

const checkSite = require('./check-site');

(async () => {
  const [node, script, ...rest] = process.argv;
  await checkSite.startCommandLine(rest)
})();

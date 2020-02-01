#!/usr/bin/env node

require('../dist/cli')
  .default()
  .catch((err) => {
    // The prompts dependency throws undefined when the user SIGINTs or closes stdin.
    if (err) {
      console.error(err.stack);
    }
    process.exit(1);
  });

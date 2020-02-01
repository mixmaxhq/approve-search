import debugFn from 'debug';
import yargs from 'yargs';
import { prompts } from 'prompts';
import fs from 'fs';
import { promisify } from 'util';
import { addQueryOptions, mergeQueryOptions } from './query-options';

const debug = debugFn('approve-github-search');

const readFile = promisify(fs.readFile);

async function getAuthFromFile() {
  const home = process.env.HOME;
  if (!home) {
    return null;
  }
  try {
    return (
      (JSON.parse(await readFile(`${home}/.githubrc.json`, 'utf-8')) || {}).github_token || null
    );
  } catch (err) {
    if (err.code === 'ENOENT') {
      return null;
    }
    if (err.name === 'SyntaxError') {
      throw new Error('unable to parse ~/.githubrc.json - invalid JSON syntax');
    }
    throw err;
  }
}

async function getAuth() {
  return process.env.GH_TOKEN || process.env.GITHUB_TOKEN || getAuthFromFile();
}

export default async function cli() {
  const { argv } = addQueryOptions(
    yargs
      .strict()
      .command('$0 [query..]', 'approve pull requests on github that match a given query')
      .option('debug', {
        type: 'boolean',
        description: 'Output debugging information',
      })
      .option('require-auth', {
        type: 'boolean',
        description:
          'When enabled, causes approve-github-search to fail when not provided with auth info',
      })
      .option('assumeyes', {
        alias: 'y',
        type: 'boolean',
        description: 'Assume yes; assume acceptance of the search check',
      })
      .option('concurrency', {
        type: 'number',
        default: 8,
        description:
          'How many PRs to approve concurrently; note that a concurrency > 1 may cause other systems to misbehave due if they have internal race conditions',
      })
  );

  const rawQuery = mergeQueryOptions(argv);

  if (argv.debug) {
    debugFn.enable('approve-github-search');
  }

  debug(`formatted query: ${JSON.stringify(rawQuery)}`);

  // For --debug, we need to load this _after_ enabling the namespace.
  const { default: Query } = require('./query');
  const query = new Query(rawQuery, { auth: await getAuth(), concurrency: argv.concurrency });
  if (!argv.y) {
    const { total, statuses } = await query.getCounts();
    if (total === 0) {
      console.warn('no PRs matched the given search');
      return;
    }
    if (statuses) {
      console.warn('commit status breakdown:');
      let found = 0,
        distinct = 0;
      for (const [status, count] of statuses) {
        found += count;
        if (count) {
          console.warn(`  [${status}] ${count}`);
          ++distinct;
        }
      }
      if (found < total) {
        console.warn(`  [unknown] ${total - found}`);
      }
      if (distinct > 1) {
        console.warn('limit commit statuses with the `status:` qualifier');
      }
      console.warn();
    }
    const value = await prompts.confirm({
      name: 'value',
      message: `approve ${total} PRs?`,
    });
    if (!value) {
      console.warn(`see search at https://github.com/pulls?q=${encodeURIComponent(rawQuery)}`);
      return;
    }
  }

  await query.approve();
}

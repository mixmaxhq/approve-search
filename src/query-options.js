export function addQueryOptions(yargs) {
  return yargs.array('query').options({
    user: {
      type: 'string',
      description: 'Add a `user:` qualifier to the query, which can be the name of an organization',
    },
    repo: {
      type: 'string',
      description: 'Add a `repo:` qualifier to the query',
    },
    label: {
      array: true,
      string: true,
      description:
        'Add a `label:` qualifier to the query; pass --no-label to match PRs that have no label',
    },
    language: {
      type: 'string',
      description: 'Add a `language:` qualifier to the query',
    },
    state: {
      type: 'string',
      default: 'open',
      description:
        'Specify the state of the PRs to include - defaults to open, pass --no-state to disable this filter or --state closed to only include closed PRs',
    },
    not: {
      array: true,
      string: true,
    },
  });
}

export function mergeQueryOptions(argv) {
  if (argv.user && argv.repo) {
    console.warn(
      'warning: specifying both user and repo will result in the union of the two qualifiers!'
    );
  }
  const query = argv.query || [];
  if (argv.label) {
    for (const label of argv.label) {
      query.push(`label:${label}`);
    }
  } else if (argv.label === false) {
    query.push('no:label');
  }
  for (const field of ['language', 'state', 'user', 'repo']) {
    const value = argv[field];
    if (value) {
      query.push(`${field}:${value}`);
    }
  }
  if (argv.not) {
    for (const item of argv.not) {
      query.push(`-${item}`);
    }
  }
  // TODO: warn about @ becoming repo:
  return `${query.map((v) => (v.includes(' ') ? `"${v}"` : v)).join(' ')} is:pr archived:false`;
}

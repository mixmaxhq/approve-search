# approve-github-search

Approve all PRs identified by a GitHub search.

## Usage

Caveat emptor: this is pretty hacky.

Write a GitHub access token with repository permissions to `~/.githubrc.json`:

```json
{
  "github_token": "<token>"
}
```

Then:

```sh
$ git clone git@github.com:mixmaxhq/approve-search && cd approve-search
$ npm ci && npm run build
$ node bin --debug \
  org:mixmaxhq \
  in:title 'chore(deps-dev): bump eslint-config-mixmax' \
  label:dependencies \
  status:success
```

When prompted, you may choose to not approve the PRs and you'll get a link to the search page on
GitHub to peruse at your leisure.

N.B. avoid the `--label` option as it's very weird.

N.B. use `--not label:whatever` instead of trying to just write `-label:whatever`.

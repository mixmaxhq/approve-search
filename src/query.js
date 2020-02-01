import debugFn from 'debug';
import Octokit from '@octokit/rest';
import PromisePool from '@mixmaxhq/promise-pool';
import { defer } from 'promise-callbacks';

const debug = debugFn('approve-github-search');

async function* concatIterators(...iters) {
  for (const iter of iters) {
    yield* iter;
  }
}

// Seems to be case-sensitive.
const rQueryHasStatus = /\bstatus:/;

export default class Query {
  constructor(query, { auth = null, concurrency = 8 } = {}) {
    this._octokit = new Octokit({
      auth,
      log: {
        warn(...args) {
          const [err] = args;
          if (
            args.length !== 1 ||
            err.constructor.name !== 'Deprecation' ||
            !(err instanceof Error)
          ) {
            console.warn(...args);
          }
        },
      },
    });
    this._inputQuery = query;
    this._query = query;

    this._totalCount = null;
    this._totalCountDefer = defer();
    this._firstItems = null;
    this._iterator = null;
    // TODO: configuration option
    this._concurrency = concurrency;
  }

  async getCounts() {
    if (this._totalCount !== null) {
      return this._totalCount;
    }

    // TODO: unhandled rejections?
    const iterator = this._getSearchResults();
    this._firstItems = iterator.next().then(({ value }) => [value], this._totalCountDefer.reject);
    this._iterator = this._firstItems.then((values) => concatIterators(values, iterator));

    debug('computing counts');
    return {
      statuses: rQueryHasStatus.test(this._query)
        ? null
        : await Promise.all(
            ['pending', 'success', 'failure'].map(async (status) => [
              status,
              (
                await this._octokit.search.issuesAndPullRequests({
                  q: `${this._query} status:${status}`,
                })
              ).data.total_count,
            ])
          ),
      total: await this._totalCountDefer.promise,
    };
  }

  async approve({ message = null } = {}) {
    const pool = new PromisePool(this._concurrency);
    let approved = 0;
    debug(`approving PRs with a concurrency of ${this._concurrency}`);
    for await (const url of this.getPRs()) {
      await pool.start(async () => {
        debug(`approving ${url}`);
        const { data: pull } = await this._octokit.request(url),
          params = {
            owner: pull.base.repo.owner.login,
            repo: pull.base.repo.name,
            pull_number: pull.number,
          };
        const shortForm = `${params.owner}/${params.repo}#${params.pull_number}`;
        if (!pull.mergeable) {
          if (pull.state === 'closed') {
            debug(`cannot merge ${shortForm} - the PR is closed`);
          } else {
            debug(`cannot merge ${shortForm} - not mergeable`);
          }
          return;
        }
        debug(`creating review object for ${shortForm}`);
        try {
          const { data: review } = await this._octokit.pulls.createReview(
            message
              ? {
                  ...params,
                  body: message,
                }
              : params
          );
          debug(`submitting review object ${review.id} for ${shortForm}`);
          await this._octokit.pulls.submitReview({
            ...params,
            review_id: review.id,
            event: 'APPROVE',
          });
          debug(`approved ${shortForm}`);
          ++approved;
        } catch (err) {
          if (
            err.status === 422 &&
            err.errors.find(
              (err) => err === 'User can only have one pending review per pull request'
            )
          ) {
            debug(`unable to submit review for ${shortForm} - you have a review in progress!`);
          } else {
            throw err;
          }
        }
      });
    }
    debug('approval iteration finished, waiting for completion');
    for (const err of await pool.flush()) {
      throw err;
    }
    debug(`approved ${approved} PRs`);
    return approved;
  }

  async *getPRs() {
    for await (const item of await this._getSearchResultsOrIterator()) {
      yield item.pull_request.url;
    }
  }

  _getSearchResultsOrIterator() {
    if (this._iterator) {
      const iter = this._iterator;
      this._iterator = null;
      return iter;
    }
    return this._getSearchResults();
  }

  async *_getSearchResults() {
    debug('initializing query');
    const options = this._octokit.search.issuesAndPullRequests.endpoint.merge({ q: this._query });
    for await (const { data } of this._octokit.paginate.iterator(options)) {
      if (this._totalCount === null) {
        const count = data.total_count;
        this._totalCount = count;
        this._totalCountDefer.resolve(count);
      }
      yield* data;
    }
  }
}

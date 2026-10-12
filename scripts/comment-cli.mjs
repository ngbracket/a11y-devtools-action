// Comments on the pull request with the body summary-cli.mjs wrote. A token
// without write access (e.g. a pull request from a fork) gets a warning, not
// a failure.
import { readFileSync } from 'node:fs';

import { upsertComment } from './comment.mjs';

async function main() {
  const env = process.env;
  try {
    const { action, url } = await upsertComment({
      api: env.GITHUB_API_URL || 'https://api.github.com',
      token: env.GITHUB_TOKEN,
      repo: env.GITHUB_REPOSITORY,
      pr: env.PR_NUMBER,
      body: readFileSync(env.COMMENT_FILE, 'utf8'),
    });
    console.log(`${action === 'updated' ? 'Updated' : 'Posted'} comment ${url}`);
  } catch (error) {
    if (error.status === 403 || error.status === 404) {
      console.log(
        `::warning title=Accessibility scan::Couldn't comment on the pull request (${error.status}). ` +
          'Give the job "permissions: pull-requests: write". Pull requests from forks get a read-only token, ' +
          'so the result is in the job summary instead.',
      );
    } else {
      console.log(`::warning title=Accessibility scan::Couldn't comment on the pull request: ${error.message}`);
    }
  }
}

await main();

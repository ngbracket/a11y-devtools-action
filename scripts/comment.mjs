// Posts the scan result on the pull request, or updates the comment this
// action posted before (found by the marker on its first line). A token without
// write access (e.g. a pull request from a fork) gets a warning, not a failure.
import { readFileSync } from 'node:fs';

const { GITHUB_TOKEN, COMMENT_FILE, PR_NUMBER, GITHUB_REPOSITORY } = process.env;
const api = process.env.GITHUB_API_URL || 'https://api.github.com';
const body = readFileSync(COMMENT_FILE, 'utf8');
const marker = body.split('\n', 1)[0];

async function github(method, path, payload) {
  const res = await fetch(`${api}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${GITHUB_TOKEN}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      ...(payload && { 'content-type': 'application/json' }),
    },
    body: payload && JSON.stringify(payload),
  });
  if (!res.ok) {
    const error = new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
    error.status = res.status;
    throw error;
  }
  return res.json();
}

async function findOwnComment() {
  for (let page = 1; page <= 20; page++) {
    const comments = await github(
      'GET',
      `/repos/${GITHUB_REPOSITORY}/issues/${PR_NUMBER}/comments?per_page=100&page=${page}`,
    );
    const own = comments.find((c) => c.body?.startsWith(marker));
    if (own) return own;
    if (comments.length < 100) return undefined;
  }
  return undefined;
}

try {
  const existing = await findOwnComment();
  if (existing) {
    await github('PATCH', `/repos/${GITHUB_REPOSITORY}/issues/comments/${existing.id}`, { body });
    console.log(`Updated comment ${existing.html_url}`);
  } else {
    const created = await github('POST', `/repos/${GITHUB_REPOSITORY}/issues/${PR_NUMBER}/comments`, { body });
    console.log(`Posted comment ${created.html_url}`);
  }
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

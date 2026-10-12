// Posts the scan result on the pull request, or updates the comment this
// action posted before (a bot comment starting with the same marker). A token
// without write access (e.g. a pull request from a fork) gets a warning, not a
// failure.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** GitHub rejects comments over 65,536 characters. */
export const MAX_COMMENT_CHARS = 60_000;

/** The body, cut to fit a comment. */
export function clampBody(body) {
  if (body.length <= MAX_COMMENT_CHARS) return body;
  return `${body.slice(0, MAX_COMMENT_CHARS)}\n\n(Cut short. The job summary and the artifact have the whole result.)\n`;
}

/** This action's earlier comment: a bot's comment that starts with the marker. */
export function isOwnComment(comment, marker) {
  return comment.user?.type === 'Bot' && typeof comment.body === 'string' && comment.body.startsWith(marker);
}

/**
 * Creates or updates the comment. Returns `{ action, url }`.
 * Throws an Error with `status` set when the API refuses.
 */
export async function upsertComment({ api, token, repo, pr, body, fetchImpl = fetch }) {
  const marker = body.split('\n', 1)[0];
  const text = clampBody(body);

  async function github(method, path, payload) {
    const res = await fetchImpl(`${api}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
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

  let existing;
  for (let page = 1; page <= 20 && !existing; page++) {
    const comments = await github('GET', `/repos/${repo}/issues/${pr}/comments?per_page=100&page=${page}`);
    existing = comments.find((c) => isOwnComment(c, marker));
    if (comments.length < 100) break;
  }

  if (existing) {
    const updated = await github('PATCH', `/repos/${repo}/issues/comments/${existing.id}`, { body: text });
    return { action: 'updated', url: updated.html_url };
  }
  const created = await github('POST', `/repos/${repo}/issues/${pr}/comments`, { body: text });
  return { action: 'posted', url: created.html_url };
}

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

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();

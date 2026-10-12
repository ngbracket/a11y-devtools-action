import assert from 'node:assert/strict';
import { test } from 'node:test';

import { clampBody, isOwnComment, MAX_COMMENT_CHARS, upsertComment } from '../scripts/comment.mjs';

const marker = '<!-- ngbr-a11y-devtools-action:a11y-report -->';
const body = `${marker}\n### Accessibility scan`;

/** A fake fetch over an in-memory comment list; records each call. */
function fakeGitHub(comments, { status } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push(`${init.method} ${new URL(url).pathname}`);
    const reply = (code, data) => ({ ok: code < 300, status: code, json: async () => data, text: async () => '' });
    if (init.method === 'GET') return reply(200, comments);
    if (status) return reply(status, {});
    const sent = JSON.parse(init.body).body;
    if (init.method === 'PATCH') return reply(200, { html_url: `c/${url.split('/').at(-1)}`, body: sent });
    return reply(201, { html_url: 'c/new', body: sent });
  };
  return { calls, fetchImpl };
}
const args = (fetchImpl) => ({ api: 'https://api.test', token: 't', repo: 'o/r', pr: 5, body, fetchImpl });

test('posts a new comment when there is none', async () => {
  const gh = fakeGitHub([{ id: 1, body: 'hello', user: { type: 'User' } }]);
  assert.deepEqual(await upsertComment(args(gh.fetchImpl)), { action: 'posted', url: 'c/new' });
  assert.deepEqual(gh.calls, ['GET /repos/o/r/issues/5/comments', 'POST /repos/o/r/issues/5/comments']);
});

test("updates the bot's earlier comment", async () => {
  const gh = fakeGitHub([{ id: 42, body: `${marker}\nold`, user: { type: 'Bot' } }]);
  assert.deepEqual(await upsertComment(args(gh.fetchImpl)), { action: 'updated', url: 'c/42' });
  assert.deepEqual(gh.calls.at(-1), 'PATCH /repos/o/r/issues/comments/42');
});

test("doesn't take over a person's comment that copies the marker", () => {
  assert.equal(isOwnComment({ body: `${marker}\nx`, user: { type: 'User' } }, marker), false);
  assert.equal(isOwnComment({ body: `${marker}\nx`, user: { type: 'Bot' } }, marker), true);
  assert.equal(isOwnComment({ body: '<!-- ngbr-a11y-devtools-action:other -->', user: { type: 'Bot' } }, marker), false);
});

test('a refused write throws with the status, for the fork warning', async () => {
  const gh = fakeGitHub([], { status: 403 });
  await assert.rejects(upsertComment(args(gh.fetchImpl)), (error) => error.status === 403);
});

test('long bodies are cut to fit a comment', () => {
  const long = clampBody('x'.repeat(MAX_COMMENT_CHARS + 10));
  assert.ok(long.length < 65_536);
  assert.match(long, /Cut short/);
  assert.equal(clampBody('short'), 'short');
});

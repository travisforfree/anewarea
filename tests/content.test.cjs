'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../source/admin/model.js');
const {GitHubStore} = require('../source/admin/github.js');
test('round-trip Chinese, hierarchy, media and stable permalinks', () => {
  const data = {title: '海边：夏天', date: '2026-08-01T12:00:00.000Z', kind: 'photo', categories: M.categoryPaths('生活 / 旅行 / 深圳\n摄影 / 胶片'), tags: ['夏天'], permalink: 'entries/stable-id/', photos: ['/media/test/a.jpg'], comments: false};
  const parsed = M.parsePost(M.serializePost(data, '正文\n\n---\n\n更多正文'));
  assert.deepEqual(parsed.data, data);
  assert.match(parsed.body, /---/);
  assert.equal(M.categoryText(data.categories), '生活 / 旅行 / 深圳\n摄影 / 胶片');
  assert.deepEqual(M.categoryPaths('生活 / 旅行 / 深圳'), ['生活', '旅行', '深圳']);
  assert.deepEqual(M.categoryPaths(''), []);
});
test('reject unsafe URLs, invalid media and paths outside content', () => {
  for (const url of ['javascript:alert(1)', '//evil.example/x', 'http://example.com', 'https://user:pass@example.com', '/media/../x', 'data:text/html,hello']) assert.throws(() => M.safeUrl(url));
  assert.equal(M.safeUrl('https://example.com/song?id=123'), 'https://example.com/song?id=123');
  assert.equal(M.safeUrl('/media/a/b.mp4'), '/media/a/b.mp4');
  assert.throws(() => M.contentPath('../escape', false));
  assert.throws(() => M.assertContentPath('source/admin/app.js'));
  assert.throws(() => M.mediaPath('good', 'bad.html', 'image', 20, 10));
  assert.throws(() => M.mediaPath('good', 'a.jpg', 'image', 20, 21));
  assert.throws(() => M.validate({title: '照片', date: '2026-01-01', kind: 'photo', photos: []}));
  assert.throws(() => M.validate({title: '音乐', date: '2026-01-01', kind: 'music', media: {}}));
  assert.throws(() => M.categoryPaths('a/b/c/d/e/f/g/h/i'));
});
test('base64 preserves binary and Chinese Markdown', () => {
  const text = '中文，音乐 🎵\n第二行';
  assert.equal(M.decodeText(M.encode64(new TextEncoder().encode(text))), text);
  const bytes = Uint8Array.from([0, 128, 255, 13, 10]);
  assert.equal(M.encode64(bytes), Buffer.from(bytes).toString('base64'));
});
test('publish content and attachments together in one non-forced commit', async () => {
  const calls = [];
  const store = new GitHubStore({owner: 'o', repo: 'r', branch: 'main'}, 'test-only', async (url, options) => {
    const path = url.replace('https://api.github.com/repos/o/r', '');
    const body = options.body && JSON.parse(options.body);
    calls.push({path, method: options.method, body});
    let data = {};
    if (path === '/git/ref/heads/main') data = {object: {sha: 'head'}};
    else if (path === '/git/blobs') data = {sha: 'blob-' + calls.length};
    else if (path === '/git/trees') data = {sha: 'new-tree'};
    else if (path === '/git/commits') data = {sha: 'new-commit'};
    return {ok: true, status: 200, json: async () => data};
  });
  await store.commit({head: 'head', tree: 'base-tree', files: [{path: 'source/_drafts/test.md'}]}, [
    {path: 'source/media/test/a.jpg', content: 'aGVsbG8=', encoding: 'base64'},
    {path: 'source/_posts/test.md', content: '正文'},
    {path: 'source/_drafts/test.md', remove: true}
  ], '发布');
  const tree = calls.find(c => c.path === '/git/trees').body;
  assert.equal(tree.base_tree, 'base-tree');
  assert.equal(tree.tree.length, 3);
  assert.equal(tree.tree[2].sha, null);
  assert.deepEqual(calls.find(c => c.path === '/git/commits').body.parents, ['head']);
  assert.deepEqual(calls.at(-1).body, {sha: 'new-commit', force: false});
  assert.equal(calls.filter(c => c.method === 'PATCH').length, 1);
});
test('concurrent changes prevent writes', async () => {
  const calls = [];
  const store = new GitHubStore({owner: 'o', repo: 'r', branch: 'main'}, 'test-only', async (url, options) => {
    calls.push(options.method);
    return {ok: true, status: 200, json: async () => ({object: {sha: 'newer-head'}})};
  });
  await assert.rejects(store.commit({head: 'old', tree: 'old', files: []}, [{path: 'source/_posts/a.md', content: 'x'}], 'save'), /新修改/);
  assert.deepEqual(calls, ['GET']);
});
test('a failed upload never updates the branch', async () => {
  const calls = [];
  const store = new GitHubStore({owner: 'o', repo: 'r', branch: 'main'}, 'test-only', async (url, options) => {
    calls.push(options.method);
    return url.includes('/git/ref/') ? {ok: true, status: 200, json: async () => ({object: {sha: 'head'}})} : {ok: false, status: 500};
  });
  await assert.rejects(store.commit({head: 'head', tree: 'base', files: []}, [{path: 'source/_posts/a.md', content: 'x'}], 'save'));
  assert.ok(!calls.includes('PATCH'));
});

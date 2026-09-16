'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const {chromium} = require(process.env.BLOG_PLAYWRIGHT || 'playwright');
const M = require('../source/admin/model.js');
const publicDir = path.resolve(__dirname, '../public');
const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.woff2':'font/woff2', '.ttf':'font/ttf'};
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let relative;
  try { relative = decodeURIComponent(url.pathname).replace(/^\/anewarea\//, ''); } catch { res.writeHead(400); return res.end(); }
  if (!relative || relative.endsWith('/')) relative += 'index.html';
  const file = path.resolve(publicDir, relative);
  if (!file.startsWith(publicDir + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, {'Content-Type': types[path.extname(file)] || 'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({headless: true, ...(process.env.BLOG_BROWSER ? {executablePath: process.env.BLOG_BROWSER} : {channel: 'chrome'})});
    const context = await browser.newContext({viewport: {width: 1280, height: 900}});
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const origin = 'http://127.0.0.1:' + server.address().port + '/anewarea';
    await page.goto(origin + '/');
    await page.locator('.empty-state').waitFor();
    assert.equal(await page.locator('.content-card').count(), 0);
    await page.setViewportSize({width: 390, height: 844});
    await page.locator('#main-nav-toggle').click();
    assert.equal(await page.locator('#main-nav-toggle').getAttribute('aria-expanded'), 'true');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#main-nav-toggle').getAttribute('aria-expanded'), 'false');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.setViewportSize({width: 1280, height: 900});

    const blobs = new Map(), trees = new Map(), commits = new Map();
    let head = 'head-0', treeId = 'tree-0', serial = 0;
    trees.set(treeId, new Map()); commits.set(head, {tree: {sha: treeId}});
    const calls = [];
    await page.route('https://api.github.com/**', async route => {
      const req = route.request();
      const endpoint = new URL(req.url()).pathname.replace('/repos/travisforfree/anewarea', '');
      const body = req.postDataJSON();
      calls.push({endpoint, method: req.method()});
      const respond = data => route.fulfill({status: 200, headers: {'Access-Control-Allow-Origin': '*'}, contentType: 'application/json', body: JSON.stringify(data)});
      if (req.method() === 'OPTIONS') return route.fulfill({status: 204, headers: {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS', 'Access-Control-Allow-Headers': '*'}});
      if (endpoint === '') return respond({permissions: {push: true}});
      if (endpoint === '/git/ref/heads/main') return respond({object: {sha: head}});
      if (req.method() === 'GET' && endpoint.startsWith('/git/commits/')) return respond(commits.get(endpoint.split('/').pop()));
      if (req.method() === 'GET' && endpoint.startsWith('/git/trees/')) return respond({tree: [...trees.get(endpoint.split('/').pop())].map(([path, sha]) => ({path, sha, type: 'blob'})), truncated: false});
      if (req.method() === 'GET' && endpoint.startsWith('/git/blobs/')) return respond({content: blobs.get(endpoint.split('/').pop())});
      if (endpoint === '/git/blobs') {
        const sha = 'blob-' + ++serial;
        blobs.set(sha, body.encoding === 'base64' ? body.content : Buffer.from(body.content).toString('base64'));
        return respond({sha});
      }
      if (endpoint === '/git/trees') {
        assert.ok(body.base_tree);
        const tree = new Map(trees.get(body.base_tree));
        for (const item of body.tree) item.sha === null ? tree.delete(item.path) : tree.set(item.path, item.sha);
        const sha = 'tree-' + ++serial; trees.set(sha, tree); return respond({sha});
      }
      if (endpoint === '/git/commits') {
        assert.deepEqual(body.parents, [head]);
        const sha = 'commit-' + ++serial;
        commits.set(sha, {tree: {sha: body.tree}});
        return respond({sha});
      }
      if (endpoint === '/git/refs/heads/main') {
        assert.equal(body.force, false);
        head = body.sha; treeId = commits.get(head).tree.sha;
        return respond({object: {sha: head}});
      }
      return route.fulfill({status: 404, body: '{}'});
    });
    await page.goto(origin + '/admin/');
    await page.locator('#token').fill('test-token-not-real');
    await page.getByRole('button', {name: '登录', exact: true}).click();
    await page.locator('#workspace').waitFor({timeout: 10000}).catch(async error => { console.log({status: await page.locator('#status').innerText(), errors, calls}); throw error; });
    assert.equal(await page.locator('#token').inputValue(), '');
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    await page.locator('#kind').selectOption('photo');
    await page.locator('#title').fill('海边照片');
    await page.locator('#categories').fill('生活 / 旅行 / 深圳');
    await page.locator('#files').setInputFiles({name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4i8AAAAASUVORK5CYII=', 'base64')});
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('文件已选好'));
    await page.locator('#publish').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('内容已提交'));
    let postPath = [...trees.get(treeId).keys()].find(p => p.startsWith('source/_posts/'));
    let post = M.parsePost(M.decodeText(blobs.get(trees.get(treeId).get(postPath))));
    assert.deepEqual(post.data.categories, ['生活', '旅行', '深圳']);
    assert.equal(post.data.photos.length, 1);
    assert.ok(trees.get(treeId).has('source' + post.data.photos[0]));
    const permalink = post.data.permalink;
    await page.locator('#title').fill('改名后的海边照片');
    await page.locator('#publish').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('内容已提交') && !document.querySelector('#publish').disabled);
    post = M.parsePost(M.decodeText(blobs.get(trees.get(treeId).get(postPath))));
    assert.equal(post.data.permalink, permalink);
    assert.equal(post.data.title, '改名后的海边照片');
    page.on('dialog', dialog => dialog.accept());
    await page.locator('#save-draft').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent === '草稿已保存。');
    assert.ok(!trees.get(treeId).has(postPath));
    assert.ok(trees.get(treeId).has(postPath.replace('/_posts/', '/_drafts/')));
    await page.locator('#publish').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('内容已提交') && !document.querySelector('#publish').disabled);
    assert.ok(trees.get(treeId).has(postPath));

    await page.locator('#new-entry').click();
    await page.locator('#kind').selectOption('music');
    await page.locator('#title').fill('音乐分享');
    await page.locator('#share-link').fill('https://music.example.com/song/1');
    await page.locator('#publish').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('内容已提交') && !document.querySelector('#publish').disabled);
    await page.locator('#new-entry').click();
    await page.locator('#kind').selectOption('video');
    await page.locator('#title').fill('视频上传');
    await page.locator('#files').setInputFiles({name: 'clip.mp4', mimeType: 'video/mp4', buffer: Buffer.from('test-upload-bytes')});
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('文件已选好'));
    await page.locator('#publish').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('内容已提交') && !document.querySelector('#publish').disabled);
    const videoEntry = [...trees.get(treeId)].find(([p, sha]) => p.startsWith('source/_posts/') && M.parsePost(M.decodeText(blobs.get(sha))).data.kind === 'video');
    assert.ok(videoEntry);
    assert.ok(trees.get(treeId).has('source' + M.parsePost(M.decodeText(blobs.get(videoEntry[1]))).data.media.src));
    await page.locator('#delete-entry').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('删除已提交'));
    assert.ok(!trees.get(treeId).has(videoEntry[0]));
    await page.setViewportSize({width: 390, height: 844});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (process.env.BLOG_SCREENSHOT) await page.screenshot({path: process.env.BLOG_SCREENSHOT, fullPage: true});
    await page.locator('#logout').click();
    await page.locator('#login-panel').waitFor();
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    assert.deepEqual(errors, []);
    console.log('PASS: empty site, mobile menu, login/logout, photo upload, edit, draft/publish, music link, video upload, deletion, narrow layout; GitHub calls mocked.');
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

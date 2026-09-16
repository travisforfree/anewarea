'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Hexo = require('hexo');
const yaml = require('js-yaml');
const root = path.resolve(__dirname, '..');
test('empty/populated site routes, media, hierarchy and scoped comments', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-blog-test-'));
  const source = path.join(dir, 'source');
  fs.mkdirSync(path.join(source, '_posts'), {recursive: true});
  fs.mkdirSync(path.join(source, '_drafts'), {recursive: true});
  fs.cpSync(path.join(root, 'source/admin'), path.join(source, 'admin'), {recursive: true});
  const config = yaml.load(fs.readFileSync(path.join(root, '_config.yml'), 'utf8'));
  config.source_dir = source;
  config.public_dir = path.join(dir, 'public');
  const configFile = path.join(dir, 'config.yml');
  fs.writeFileSync(configFile, yaml.dump(config));
  const read = name => fs.readFileSync(path.join(dir, 'public', name), 'utf8');
  const build = async () => {
    const hexo = new Hexo(root, {config: configFile, output: dir, silent: true});
    try { await hexo.init(); await hexo.call('generate', {}); } finally { await hexo.exit(); }
  };
  try {
    await build();
    for (const route of ['index.html', 'articles/index.html', 'gallery/index.html', 'music/index.html', 'videos/index.html', 'categories/index.html', 'archives/index.html']) {
      assert.ok(read(route).includes('/anewarea/css/style.css'), route);
      assert.ok(!read(route).includes('giscus.app/client.js'), route + ' comments off');
      assert.ok(!read(route).includes('mathjax/tex-chtml.js'), route + ' math off');
    }
    assert.match(read('index.html'), /这里还没有内容/);
    assert.ok(read('admin/index.html').startsWith('<!doctype html>'));
    assert.ok(!read('admin/index.html').includes('giscus.app'));
    assert.match(read('admin/config.js'), /travisforfree/);
    const post = (name, data, body = '') => fs.writeFileSync(path.join(source, '_posts', name + '.md'), '---\n' + yaml.dump({title: name, date: '2026-08-01 12:00:00', permalink: 'entries/' + name + '/', ...data}) + '---\n\n' + body);
    post('photo-test', {kind: 'photo', photos: ['/media/test/a.jpg'], categories: ['生活', '旅行', '深圳'], comments: true});
    post('video-test', {kind: 'video', media: {src: '/media/test/video.mp4'}, comments: false});
    post('article-test', {kind: 'article', math: true, toc: true}, "# 标题\n\n    const x = '中文，标点。';\n\n![插图](/anewarea/media/test/a.jpg)\n");
    for (let i = 0; i < 13; i++) post('music-' + i, {kind: 'music', media: {src: '/media/test/song.mp3', link: 'https://example.com/listen'}, comments: false, categories: [['音乐', '爵士'], ['收藏']]});
    fs.writeFileSync(path.join(source, '_drafts', 'hidden.md'), '---\ntitle: hidden-draft\ndate: 2026-08-01\n---\nDRAFT_NOT_PUBLISHED');
    await build();
    assert.match(read('entries/photo-test/index.html'), /src="\/anewarea\/media\/test\/a.jpg"/);
    assert.equal((read('entries/photo-test/index.html').match(/giscus.app\/client.js/g) || []).length, 1);
    assert.equal((read('entries/photo-test/index.html').match(/src="\/anewarea\/media\/test\/a.jpg"/g) || []).length, 1);
    assert.match(read('entries/video-test/index.html'), /<video controls playsinline/);
    assert.ok(!read('entries/video-test/index.html').includes('giscus.app'));
    assert.match(read('entries/music-0/index.html'), /<audio controls preload="none"/);
    assert.match(read('entries/music-0/index.html'), /https:\/\/example.com\/listen/);
    assert.match(read('entries/article-test/index.html'), /mathjax\/tex-chtml.js/);
    assert.match(read('entries/article-test/index.html'), /中文，标点。/);
    assert.ok(!read('entries/article-test/index.html').includes('<h-char'));
    assert.match(read('categories/index.html'), /深圳/);
    assert.match(read('categories/生活/旅行/深圳/index.html'), /photo-test/);
    assert.match(read('music/page/2/index.html'), /music-/);
    assert.ok(!read('index.html').includes('DRAFT_NOT_PUBLISHED'));
    assert.ok(!fs.existsSync(path.join(dir, 'public', '2026/08/01/hidden/index.html')));
  } finally {
    const resolved = fs.realpathSync(dir);
    const temp = fs.realpathSync(os.tmpdir());
    assert.ok(resolved.startsWith(temp + path.sep) && path.basename(resolved).startsWith('codex-blog-test-'));
    fs.rmSync(resolved, {recursive: true, force: true});
  }
});

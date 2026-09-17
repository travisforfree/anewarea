'use strict';

const fs = require('node:fs');
const path = require('node:path');
const pagination = require('hexo-pagination');
const sections = [
  {kinds: ['article'], directory: 'articles', title: 'WRITING', titleZh: '文章'},
  {kinds: ['photo', 'video'], directory: 'album', title: 'ALBUM', titleZh: '相册'},
  {kinds: ['music'], directory: 'music', title: 'MUSIC', titleZh: '音乐'}
];

hexo.extend.filter.register('before_post_render', function(data) {
  if (data.password) throw new Error('当前站点不支持密码文章。请移除私密内容后再发布，不要把密码和正文提交到公开仓库。');
  return data;
});

hexo.extend.helper.register('content_kind', post =>
  sections.find(section => section.kinds.includes(post.kind || 'article'))?.title || 'WRITING');

hexo.extend.helper.register('media_url', function(value) {
  if (typeof value !== 'string' || /[\u0000-\u0020\\]/.test(value)) return '';
  if (/^https:\/\//i.test(value)) {
    try { const u = new URL(value); return u.username || u.password ? '' : u.href; } catch { return ''; }
  }
  if (/^\/(?!\/)/.test(value) && !value.split('/').includes('..')) return this.url_for(value);
  return '';
});

hexo.extend.generator.register('content-sections', function(locals) {
  const posts = locals.posts.sort('-date');
  const routes = sections.flatMap(section => {
    const selected = posts.filter(post => section.kinds.includes(post.kind || 'article'));
    return pagination(section.directory + '/', selected, {
    perPage: selected.length ? 12 : 0,
    layout: 'content-index',
    format: 'page/%d/',
    data: {title: section.title, title_zh: section.titleZh, kind: section.directory, comments: false}
  }); });
  routes.push({path: 'categories/index.html', layout: 'categories', data: {title: '分类', comments: false}});
  if (!posts.length) {
    routes.push({path: 'archives/index.html', layout: 'archive', data: {posts, archive: true, total: 1}});
    routes.push({path: 'index.html', layout: 'index', data: {posts, __index: true, total: 1}});
  }
  const admin = this.config.content_admin;
  routes.push({path: 'admin/config.js', data: 'window.BLOG_ADMIN = ' + JSON.stringify({
    ...admin, root: this.config.root, site_url: this.config.url
  }) + ';'});
  routes.push({path: 'admin/vendor/js-yaml.min.js', data: () => fs.createReadStream(path.join(path.dirname(require.resolve('js-yaml/package.json')), 'dist/js-yaml.min.js'))});
  routes.push({path: 'admin/vendor/js-yaml-LICENSE.txt', data: () => fs.createReadStream(path.join(path.dirname(require.resolve('js-yaml/package.json')), 'LICENSE'))});
  const interDirectory = path.dirname(require.resolve('@fontsource-variable/inter/package.json'));
  routes.push({path: 'css/fonts/inter-latin-opsz-normal.woff2', data: () => fs.createReadStream(path.join(interDirectory, 'files/inter-latin-opsz-normal.woff2'))});
  routes.push({path: 'css/fonts/Inter-LICENSE.txt', data: () => fs.createReadStream(path.join(interDirectory, 'LICENSE'))});
  return routes;
});

(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('js-yaml'));
  else root.BlogModel = factory(root.jsyaml);
})(typeof globalThis !== 'undefined' ? globalThis : this, function(yaml) {
  'use strict';
  const kinds = {article: '文章', photo: '相册 · 照片', music: '音乐', video: '相册 · 视频'};
  const extensions = {
    image: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'],
    audio: ['mp3', 'm4a', 'ogg', 'wav', 'flac', 'aac'],
    video: ['mp4', 'webm', 'ogv', 'mov']
  };
  function safeUrl(value, local = true) {
    const text = String(value || '').trim();
    if (!text) return '';
    if (/[\u0000-\u0020\\]/.test(text)) throw new Error('链接不能包含空格或控制字符。');
    if (local && /^\/media\/[a-zA-Z0-9/_\-.%]+$/.test(text) && !text.split('/').includes('..')) return text;
    let url;
    try { url = new URL(text); } catch { throw new Error('请输入完整的 HTTPS 链接。'); }
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('仅支持不含用户名和密码的 HTTPS 链接。');
    return url.href;
  }
  function parsePost(text) {
    const match = String(text).replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
    if (!match) throw new Error('内容缺少 Markdown 开头的 YAML 信息。');
    const data = yaml.load(match[1]) || {};
    if (typeof data !== 'object' || Array.isArray(data)) throw new Error('内容信息应为字段对象。');
    return {data, body: match[2].replace(/^\r?\n/, '')};
  }
  function categoryPaths(text) {
    const rows = String(text || '').split(/\r?\n/).map(line => line.split('/').map(s => s.trim()).filter(Boolean)).filter(row => row.length);
    if (rows.some(row => row.length > 8)) throw new Error('单条分类路径最多 8 层。');
    if (rows.some(row => row.some(s => s.length > 60))) throw new Error('分类名称请控制在 60 字以内。');
    return rows.length <= 1 ? rows[0] || [] : rows;
  }
  function categoryText(categories) {
    if (!categories) return '';
    if (typeof categories === 'string') return categories;
    if (!Array.isArray(categories)) throw new Error('分类格式无法识别。');
    if (!categories.some(Array.isArray)) return categories.join(' / ');
    return categories.map(row => (Array.isArray(row) ? row : [row]).join(' / ')).join('\n');
  }
  function validate(data) {
    if (!String(data.title || '').trim()) throw new Error('请填写标题。');
    if (!kinds[data.kind || 'article']) throw new Error('内容类型无法识别。');
    if (!data.date || Number.isNaN(new Date(data.date).getTime())) throw new Error('请选择有效的日期。');
    if (data.password) throw new Error('当前后台不支持密码文章；请勿通过公开仓库保存私密内容。');
    if (data.cover) safeUrl(data.cover);
    if (data.photos && !Array.isArray(data.photos)) throw new Error('照片列表格式不正确。');
    for (const photo of data.photos || []) safeUrl(photo);
    if (data.media?.src) safeUrl(data.media.src);
    if (data.media?.link) safeUrl(data.media.link, false);
    if (data.kind === 'photo' && !data.photos?.length) throw new Error('请至少选择一张照片。');
    if (['music', 'video'].includes(data.kind) && !data.media?.src && !data.media?.link) throw new Error('请上传媒体文件，或填写分享链接。');
    return data;
  }
  function serializePost(data, body) {
    validate(data);
    return '---\n' + yaml.dump(data, {noRefs: true, lineWidth: 120, quotingType: '"'}).trimEnd() + '\n---\n\n' + String(body || '').trim() + '\n';
  }
  function contentPath(id, draft) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}$/.test(id)) throw new Error('内容标识不正确。');
    return 'source/' + (draft ? '_drafts' : '_posts') + '/' + id + '.md';
  }
  function assertContentPath(path) {
    if (!/^source\/_(posts|drafts)\/[^/\\]+\.md$/.test(path) || path.includes('..')) throw new Error('只能修改文章或草稿目录中的 Markdown。');
    return path;
  }
  function mediaPath(id, filename, category, maxBytes, size) {
    contentPath(id, false);
    const ext = String(filename).split('.').pop().toLowerCase();
    if (!extensions[category]?.includes(ext)) throw new Error('不支持这个文件格式。图片请用 JPG、PNG、WebP 等；视频优先使用 MP4。');
    if (!Number.isFinite(size) || size <= 0 || size > maxBytes) throw new Error('文件为空或超过单文件上传上限。大视频可以填写平台分享链接。');
    return 'source/media/' + id + '/' + crypto.randomUUID() + '.' + ext;
  }
  function encode64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return btoa(binary);
  }
  function decodeText(base64) {
    return new TextDecoder().decode(Uint8Array.from(atob(base64.replace(/\s/g, '')), c => c.charCodeAt(0)));
  }
  return {kinds, extensions, safeUrl, parsePost, categoryPaths, categoryText, validate, serializePost, contentPath, assertContentPath, mediaPath, encode64, decodeText};
});

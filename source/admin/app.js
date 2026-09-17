'use strict';

(() => {
  const $ = id => document.getElementById(id);
  const M = window.BlogModel;
  const config = window.BLOG_ADMIN;
  let store, snapshot, entries = [], selected = null, pending = [], original = {};
  let editorHead = '', dirty = false, busy = false, lastUploadError = '';
  let id = crypto.randomUUID();
  const maxBytes = (config.max_file_mb || 20) * 1024 * 1024;
  const maxBatchBytes = (config.max_batch_mb || 60) * 1024 * 1024;
  const cache = new Map();
  const fields = ['kind', 'date', 'title', 'description', 'categories', 'tags', 'artist', 'share-link', 'media-src', 'cover', 'photo-urls', 'body', 'comments', 'toc', 'math'];

  $('repo-name').textContent = '博客仓库：' + config.owner + '/' + config.repo;
  $('site-link').href = config.site_url + '/';
  $('actions-link').href = 'https://github.com/' + config.owner + '/' + config.repo + '/actions';

  function status(message, error = false) {
    $('status').textContent = message;
    $('status').classList.toggle('error', error);
  }
  function setBusy(value) {
    busy = value;
    document.querySelectorAll('button, input, textarea, select').forEach(el => { el.disabled = value; });
    $('editor-form').setAttribute('aria-busy', String(value));
  }
  async function task(work) {
    if (busy) return;
    setBusy(true);
    try { await work(); }
    catch (error) {
      status(error.name === 'TimeoutError' ? '请求超时，保存结果尚未确认。请先检查仓库内容，再决定是否重试；编辑内容仍保留在本页。'
        : error instanceof TypeError ? '连接失败，请检查网络后重试。编辑内容仍保留在本页。' : error.message, true);
    } finally { setBusy(false); }
  }
  function localDate(value = new Date()) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
  function mayDiscard() { return !dirty || confirm('当前编辑尚未保存，确定放弃这些修改吗？'); }
  function updateType() {
    const kind = $('kind').value;
    $('music-fields').hidden = kind !== 'music';
    $('link-fields').hidden = !['music', 'video'].includes(kind);
    $('photo-fields').hidden = kind !== 'photo';
    const category = kind === 'music' ? 'audio' : kind === 'video' ? 'video' : 'image';
    $('files').accept = M.extensions[category].map(ext => '.' + ext).join(',');
    $('files').multiple = category === 'image';
    $('upload-label').textContent = kind === 'music' ? '选择音频文件（可选）' : kind === 'video' ? '选择视频文件（可选）' : '选择照片';
    $('upload-hint').textContent = '单文件最多 ' + config.max_file_mb + ' MiB，单次总量最多 ' + config.max_batch_mb + ' MiB。' + (kind === 'video' ? '推荐 MP4（H.264/AAC）；更大的视频请填写平台链接。' : kind === 'article' ? '图片会插入正文，不需要 PicGo。' : '选择后点击发布或保存草稿才会上传。');
  }
  function resetEditor() {
    selected = null; pending = []; original = {}; lastUploadError = ''; id = crypto.randomUUID();
    $('editor-form').reset();
    $('date').value = localDate();
    $('photo-urls').value = '';
    editorHead = snapshot?.head || '';
    dirty = false;
    $('editor-title').textContent = '新建内容';
    $('delete-entry').hidden = true;
    $('publish').textContent = '发布内容';
    renderAttachments(); updateType();
  }
  function renderAttachments() {
    $('attachments').replaceChildren();
    pending.forEach(item => {
      const row = document.createElement('div');
      row.className = 'attachment';
      row.textContent = '待上传：' + item.name + '（' + (item.bytes.length / 1024 / 1024).toFixed(2) + ' MiB）';
      const remove = document.createElement('button');
      remove.type = 'button'; remove.textContent = '移除';
      remove.addEventListener('click', () => {
        const url = item.path.slice('source'.length);
        pending = pending.filter(p => p !== item);
        if ($('cover').value === url) $('cover').value = '';
        if ($('media-src').value === url) $('media-src').value = '';
        $('photo-urls').value = $('photo-urls').value.split('\n').filter(p => p.trim() !== url).join('\n');
        $('body').value = $('body').value.replaceAll('![图片](' + config.root.replace(/\/$/, '') + url + ')', '');
        dirty = true; renderAttachments();
      });
      row.append(remove);
      $('attachments').append(row);
    });
  }
  async function refreshEntries() {
    status('正在读取内容列表…');
    const next = await store.snapshot();
    const paths = next.files.filter(f => /^source\/_(posts|drafts)\/[^/]+\.md$/.test(f.path));
    const results = [];
    let cursor = 0;
    await Promise.all(Array.from({length: Math.min(4, paths.length)}, async () => {
      while (cursor < paths.length) {
        const file = paths[cursor++];
        let parsed = cache.get(file.sha);
        if (!parsed) {
          parsed = M.parsePost(M.decodeText((await store.loadBlob(file.sha)).content));
          cache.set(file.sha, parsed);
        }
        results.push({...file, ...parsed, draft: file.path.startsWith('source/_drafts/')});
      }
    }));
    entries = results.sort((a, b) => new Date(b.data.date) - new Date(a.data.date));
    snapshot = next;
    renderEntries();
    status('已连接。共有 ' + entries.length + ' 条内容。');
  }
  function renderEntries() {
    $('entries').replaceChildren();
    const needle = $('search').value.toLowerCase();
    for (const entry of entries) {
      const category = M.categoryText(entry.data.categories);
      const label = M.kinds[entry.data.kind || 'article'] || '文章';
      if (!(entry.data.title + label + category).toLowerCase().includes(needle)) continue;
      const button = document.createElement('button');
      button.className = 'entry';
      button.type = 'button';
      button.append(document.createTextNode(entry.data.title || '未命名内容'));
      const meta = document.createElement('small');
      meta.textContent = (entry.draft ? '草稿' : '已发布') + ' · ' + label + (category ? ' · ' + category : '');
      button.append(meta);
      button.addEventListener('click', () => { if (!busy && mayDiscard()) openEntry(entry); });
      $('entries').append(button);
    }
    if (!$('entries').children.length) $('entries').textContent = entries.length ? '没有匹配的内容。' : '还没有内容，点击上方新建。';
  }
  function openEntry(entry) {
    resetEditor();
    selected = entry;
    original = {...entry.data};
    // Existing filenames and permalinks are preserved on edit.
    id = entry.path.split('/').pop().replace(/\.md$/, '');
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}$/.test(id)) id = crypto.randomUUID();
    const d = entry.data;
    $('kind').value = d.kind || 'article';
    $('title').value = d.title || '';
    $('date').value = localDate(d.date);
    $('description').value = d.description || '';
    $('categories').value = M.categoryText(d.categories);
    $('tags').value = (Array.isArray(d.tags) ? d.tags : d.tags ? [d.tags] : []).join(', ');
    $('artist').value = d.artist || '';
    $('share-link').value = d.media?.link || '';
    $('media-src').value = d.media?.src || '';
    $('cover').value = d.cover || '';
    $('photo-urls').value = (d.photos || []).join('\n');
    $('body').value = entry.body;
    $('comments').checked = d.comments !== false;
    $('toc').checked = d.toc === true;
    $('math').checked = d.math === true;
    $('delete-entry').hidden = false;
    $('editor-title').textContent = '编辑：' + d.title;
    $('publish').textContent = entry.draft ? '发布内容' : '保存并发布';
    updateType();
  }
  function collect() {
    if (!$('date').value || Number.isNaN(new Date($('date').value).getTime())) throw new Error('请选择有效的发布日期。');
    const kind = $('kind').value;
    const data = {
      ...original,
      title: $('title').value.trim(),
      date: new Date($('date').value).toISOString(),
      kind,
      categories: M.categoryPaths($('categories').value),
      tags: $('tags').value.split(/[,，]/).map(x => x.trim()).filter(Boolean),
      description: $('description').value.trim(),
      comments: $('comments').checked,
      toc: $('toc').checked,
      math: $('math').checked
    };
    if (!selected) data.permalink = 'entries/' + id + '/';
    delete data.photos; delete data.media; delete data.artist; delete data.cover;
    if ($('cover').value.trim()) data.cover = M.safeUrl($('cover').value);
    if (kind === 'photo') data.photos = $('photo-urls').value.split(/\r?\n/).map(x => x.trim()).filter(Boolean).map(x => M.safeUrl(x));
    if (['music', 'video'].includes(kind)) {
      data.media = {src: M.safeUrl($('media-src').value), link: M.safeUrl($('share-link').value, false)};
      if (kind === 'music') data.artist = $('artist').value.trim();
    }
    return {data: M.validate(data), body: $('body').value};
  }
  async function addFiles(files, cover = false) {
    const kind = $('kind').value;
    const category = cover || ['article', 'photo'].includes(kind) ? 'image' : kind === 'music' ? 'audio' : 'video';
    if (pending.length + files.length > 12) throw new Error('一次最多上传 12 个附件。请先保存当前内容。');
    const additions = [];
    for (const file of files) {
      const path = M.mediaPath(id, file.name, category, maxBytes, file.size);
      additions.push({path, bytes: new Uint8Array(await file.arrayBuffer()), name: file.name});
    }
    if ([...pending, ...additions].reduce((n, item) => n + item.bytes.length, 0) > maxBatchBytes) throw new Error('一次上传总量最多 ' + config.max_batch_mb + ' MiB，请分次添加。');
    for (const item of additions) {
      const url = item.path.slice('source'.length);
      pending.push(item);
      if (cover) $('cover').value = url;
      else if (kind === 'photo') $('photo-urls').value = [$('photo-urls').value.trim(), url].filter(Boolean).join('\n');
      else if (kind === 'article') {
        const base = config.root.replace(/\/$/, '');
        $('body').value += '\n\n![图片](' + base + url + ')\n';
      } else $('media-src').value = url;
    }
    lastUploadError = '';
    dirty = true;
    renderAttachments();
    status('文件已选好，发布或保存草稿时会上传。');
  }
  async function save(draft) {
    if (!$('editor-form').reportValidity()) return;
    if (['music', 'video'].includes($('kind').value) && !$('media-src').value.trim() && !$('share-link').value.trim() && lastUploadError) throw new Error(lastUploadError);
    const value = collect();
    if (!draft && new Date(value.data.date) > new Date()) throw new Error('发布日期在未来；请改为当前时间或先保存草稿。');
    if (draft && selected && !selected.draft && !confirm('保存为草稿会将这条内容从博客下架，确定继续吗？')) return;
    if (editorHead !== snapshot.head) throw new Error('编辑期间列表已更新。请下载编辑备份后，重新打开最新内容再保存。');
    const destination = selected ? selected.path.replace(/\/_(posts|drafts)\//, draft ? '/_drafts/' : '/_posts/') : M.contentPath(id, draft);
    M.assertContentPath(destination);
    if ((!selected || destination !== selected.path) && snapshot.files.some(file => file.path === destination)) throw new Error('目标位置已有同名内容，保存已停止。');
    const text = M.serializePost(value.data, value.body);
    const changes = pending.filter(item => text.includes(item.path.slice('source'.length))).map(item => ({path: item.path, content: M.encode64(item.bytes), encoding: 'base64'}));
    changes.push({path: destination, content: text});
    if (selected && selected.path !== destination) changes.push({path: selected.path, remove: true});
    await store.commit(snapshot, changes, (draft ? '保存草稿：' : '发布内容：') + value.data.title, (i, n) => status('正在保存 ' + i + ' / ' + n + ' …请保持页面打开。'));
    dirty = false;
    pending = [];
    resetEditor();
    $('deployment').hidden = false;
    await refreshEntries();
    const fresh = entries.find(entry => entry.path === destination);
    if (fresh) openEntry(fresh);
    status(draft ? '草稿已保存。' : '内容已提交，正在等待网站自动发布。');
  }

  $('login-form').addEventListener('submit', event => {
    event.preventDefault();
    task(async () => {
      const token = $('token').value.trim();
      if (!token) throw new Error('请填写访问令牌。');
      const candidate = new BlogGitHub.GitHubStore(config, token);
      $('token').value = '';
      const repo = await candidate.request('');
      if (repo.permissions && !repo.permissions.push) throw new Error('当前授权没有仓库写入权限。');
      store = candidate;
      await refreshEntries();
      $('login-panel').hidden = true; $('workspace').hidden = false; $('logout').hidden = false;
      resetEditor();
    });
  });
  $('logout').addEventListener('click', () => {
    if (!mayDiscard()) return;
    store?.logout(); store = null; snapshot = null; entries = []; cache.clear();
    resetEditor(); $('entries').replaceChildren();
    $('login-panel').hidden = false; $('workspace').hidden = true; $('logout').hidden = true; $('deployment').hidden = true;
    status('已退出登录。');
  });
  $('new-entry').addEventListener('click', () => { if (mayDiscard()) resetEditor(); });
  $('refresh').addEventListener('click', () => {
    if (!mayDiscard()) return;
    task(async () => { await refreshEntries(); resetEditor(); });
  });
  $('search').addEventListener('input', renderEntries);
  $('editor-form').addEventListener('input', () => { dirty = true; });
  $('kind').addEventListener('change', updateType);
  $('files').addEventListener('change', () => {
    const files = [...$('files').files];
    $('files').value = '';
    task(async () => {
      try { await addFiles(files); }
      catch (error) { lastUploadError = error.message; throw error; }
    });
  });
  $('cover-file').addEventListener('change', () => {
    const files = [...$('cover-file').files];
    $('cover-file').value = '';
    task(async () => {
      try { await addFiles(files, true); }
      catch (error) { lastUploadError = error.message; throw error; }
    });
  });
  $('editor-form').addEventListener('submit', event => { event.preventDefault(); task(() => save(false)); });
  $('save-draft').addEventListener('click', () => task(() => save(true)));
  $('download').addEventListener('click', () => {
    try {
      const data = Object.fromEntries(fields.map(name => [name, $(name).type === 'checkbox' ? $(name).checked : $(name).value]));
      // Recovery backup is available even before required fields are complete.
      const blob = new Blob([JSON.stringify({fields: data, original, source: selected?.path, pendingFiles: pending.map(p => p.name)}, null, 2)], {type: 'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'blog-editor-backup.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status('已下载编辑文字备份，未上传的附件请保留原文件。');
    } catch (error) { status(error.message, true); }
  });
  $('delete-entry').addEventListener('click', () => {
    if (!selected || !confirm('确定删除“' + selected.data.title + '”吗？删除将保存到仓库，并在自动发布后从网站移除。')) return;
    task(async () => {
      if (editorHead !== snapshot.head) throw new Error('请重新打开最新内容后再删除。');
      await store.commit(snapshot, [{path: M.assertContentPath(selected.path), remove: true}], '删除内容：' + selected.data.title);
      dirty = false; resetEditor();
      $('deployment').hidden = false;
      await refreshEntries();
      resetEditor();
      status('删除已提交，等待网站自动发布。');
    });
  });
  window.addEventListener('beforeunload', event => { if (dirty || busy) { event.preventDefault(); event.returnValue = ''; } });
  resetEditor();
})();

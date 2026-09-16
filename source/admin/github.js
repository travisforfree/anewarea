(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BlogGitHub = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  class GitHubStore {
    constructor(config, token, fetcher = (url, options) => fetch(url, options)) {
      if (!/^[\w.-]+$/.test(config.owner) || !/^[\w.-]+$/.test(config.repo)) throw new Error('仓库配置无效。');
      this.config = config;
      this.token = token;
      this.fetcher = fetcher;
      this.base = 'https://api.github.com/repos/' + config.owner + '/' + config.repo;
    }
    async request(path, method = 'GET', body) {
      const response = await this.fetcher(this.base + path, {
        method,
        headers: {'Accept': 'application/vnd.github+json', 'Authorization': 'Bearer ' + this.token, 'X-GitHub-Api-Version': '2022-11-28', ...(body ? {'Content-Type': 'application/json'} : {})},
        ...(body ? {body: JSON.stringify(body)} : {}),
        signal: AbortSignal.timeout(120000)
      });
      if (!response.ok) {
        const message = response.status === 401 ? '登录授权无效或已过期，请重新登录。'
          : response.status === 403 ? '权限不足或请求过于频繁。请检查令牌的 Contents 读写权限，稍后重试。'
          : response.status === 404 ? '找不到仓库或分支，或令牌没有这个仓库的访问权限。'
          : [409, 422].includes(response.status) ? '保存被拒绝，可能有新的仓库修改或分支保护。请刷新内容列表、重新打开内容后再试。'
          : 'GitHub 请求失败（' + response.status + '），请稍后重试。';
        throw new Error(message);
      }
      return response.status === 204 ? null : response.json();
    }
    async snapshot() {
      const ref = await this.request('/git/ref/heads/' + encodeURIComponent(this.config.branch));
      const commit = await this.request('/git/commits/' + ref.object.sha);
      const tree = await this.request('/git/trees/' + commit.tree.sha + '?recursive=1');
      if (tree.truncated) throw new Error('仓库文件数量过多，暂时无法安全读取完整列表。');
      return {head: ref.object.sha, tree: commit.tree.sha, files: tree.tree.filter(f => f.type === 'blob')};
    }
    async loadBlob(sha) { return this.request('/git/blobs/' + sha); }
    async commit(snapshot, changes, message, progress = () => {}) {
      const current = await this.request('/git/ref/heads/' + encodeURIComponent(this.config.branch));
      if (current.object.sha !== snapshot.head) throw new Error('仓库已有新修改。为避免覆盖，请刷新列表并重新打开内容后再保存。');
      const entries = [];
      for (let i = 0; i < changes.length; i++) {
        const item = changes[i];
        if (!/^source\/(?:(?:_posts|_drafts)\/[^/\\]+\.md|media\/[a-zA-Z0-9/_\-.]+)$/.test(item.path) || item.path.includes('..')) throw new Error('保存路径不在允许的内容目录中。');
        progress(i + 1, changes.length);
        if (item.remove) {
          if (!snapshot.files.some(file => file.path === item.path)) throw new Error('待删除内容已经不存在，请刷新后重试。');
          entries.push({path: item.path, mode: '100644', type: 'blob', sha: null});
        } else {
          const blob = await this.request('/git/blobs', 'POST', {content: item.content, encoding: item.encoding || 'utf-8'});
          entries.push({path: item.path, mode: '100644', type: 'blob', sha: blob.sha});
        }
      }
      const tree = await this.request('/git/trees', 'POST', {base_tree: snapshot.tree, tree: entries});
      const commit = await this.request('/git/commits', 'POST', {message, tree: tree.sha, parents: [snapshot.head]});
      // Never force a ref: a concurrent commit must fail instead of overwriting it.
      await this.request('/git/refs/heads/' + encodeURIComponent(this.config.branch), 'PATCH', {sha: commit.sha, force: false});
      return commit.sha;
    }
    logout() { this.token = ''; }
  }
  return {GitHubStore};
});

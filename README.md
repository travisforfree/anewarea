# A NEW AREA

基于 Hexo 和 GitHub Pages 的个人内容站点，支持文章、照片、音乐、视频和多级分类。

## 使用方式

网站发布后，从页脚的「管理」进入后台。首次使用创建仅授权此博客仓库的 GitHub 细粒度令牌，之后可在网页内选择文件、编辑、保存草稿、发布和删除内容，不再需要 PicGo。

完整操作说明见 [内容管理与维护指南](bolg_log/内容管理与维护指南.md)。

## 本地开发

使用 Node.js 24：

~~~sh
npm ci
npm test
npm run build
npm run server
~~~

本地预览通常为 http://localhost:4000/anewarea/，以终端输出为准。后台即使在本地预览，登录真实令牌后仍连接真实 GitHub 仓库。

## 项目组织

- `source/_posts/`：已发布内容，每条内容一个 Markdown 文件。
- `source/_drafts/`：草稿。
- `source/media/`：通过后台上传的公开附件。
- `source/admin/`：静态管理后台，令牌仅保留在当前页面内存。
- `scripts/content.js`：内容分区、空页面、公开后台配置与辅助函数。
- `themes/mashiro/`：基于 Mashiro 定制的页面和样式。
- `tests/`：内容验证、发布协议和隔离构建测试。
- `.github/workflows/deploy.yml`：检查与发布；拉取请求只检查，main 分支推送会发布。

## 内容结构

`kind` 为 `article`、`photo`、`music` 或 `video`。不同类型共享标题、日期、分类、标签、说明和评论开关。后台生成稳定的 `entries/<id>/` 链接，改名或改分类不改变链接。

分类列表按顺序表示父子层级；多个数组表示多条分类路径。照片使用 `photos` 列表，音视频使用 `media.src`（文件地址）或 `media.link`（平台分享链接）。

## 验证

`npm test` 包括空站点与有内容站点构建，测试资料写到隔离临时目录并自动清理，不向博客插入示例文章。浏览器流程检查位于 `tests/browser-check.cjs`；需要本机 Playwright 与 Chrome，可通过 `BLOG_PLAYWRIGHT` 指定 Playwright 安装路径。该检查模拟 GitHub API，不使用真实令牌、不发布测试内容。

主题来源：[bill-xia/hexo-theme-mashiro](https://github.com/bill-xia/hexo-theme-mashiro)。当前目录已包含项目定制，请按差异更新。

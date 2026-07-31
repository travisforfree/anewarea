hexo.extend.injector.register('body_end', () => {
  return `
  <div id="giscus-container" style="max-width: 800px; margin: 40px auto; padding: 0 20px;">
    <script src="https://giscus.app/client.js"
            data-repo="travisforfree/anewarea"
            data-repo-id="R_kgDOToWFVQ"
            data-category="General"
            data-category-id="DIC_kwDOToWFVc4DCUMR"
            data-mapping="pathname"
            data-strict="0"
            data-reactions-enabled="1"
            data-emit-metadata="0"
            data-input-position="bottom"
            data-theme="preferred_color_scheme"
            data-lang="zh-CN"
            crossorigin="anonymous"
            async>
    </script>
  </div>
  `;
}, 'post');
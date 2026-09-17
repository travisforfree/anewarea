'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const homeExperience = document.querySelector('[data-home-experience]');
  if (homeExperience) {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let framePending = false;
    const clamp = value => Math.max(0, Math.min(1, value));

    const updateHome = () => {
      framePending = false;
      if (reducedMotion.matches) {
        document.body.classList.add('home-past-intro', 'home-directory-ready');
        return;
      }
      const scrollRange = Math.max(homeExperience.offsetHeight - window.innerHeight, 1);
      const progress = clamp(-homeExperience.getBoundingClientRect().top / scrollRange);
      const heroOpacity = clamp(1 - progress / .48);
      const directoryOpacity = clamp((progress - .30) / .42);
      homeExperience.style.setProperty('--hero-opacity', heroOpacity.toFixed(3));
      homeExperience.style.setProperty('--hero-y', `${(-progress * 54).toFixed(1)}px`);
      homeExperience.style.setProperty('--hero-scale', (1 - progress * .055).toFixed(3));
      homeExperience.style.setProperty('--directory-opacity', directoryOpacity.toFixed(3));
      homeExperience.style.setProperty('--directory-y', `${((1 - directoryOpacity) * 56).toFixed(1)}px`);
      document.body.classList.toggle('home-past-intro', progress > .42);
      document.body.classList.toggle('home-directory-ready', directoryOpacity > .55);
    };
    const scheduleHomeUpdate = () => {
      if (framePending) return;
      framePending = true;
      requestAnimationFrame(updateHome);
    };
    window.addEventListener('scroll', scheduleHomeUpdate, {passive: true});
    window.addEventListener('resize', scheduleHomeUpdate);
    reducedMotion.addEventListener?.('change', scheduleHomeUpdate);
    updateHome();
  }

  const container = document.getElementById('container');
  const toggle = document.getElementById('main-nav-toggle');
  const wrap = document.getElementById('wrap');
  function closeMenu() {
    container?.classList.remove('mobile-nav-on');
    toggle?.setAttribute('aria-expanded', 'false');
  }
  toggle?.addEventListener('click', event => {
    event.stopPropagation();
    const open = container.classList.toggle('mobile-nav-on');
    toggle.setAttribute('aria-expanded', String(open));
  });
  wrap?.addEventListener('click', closeMenu);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });

  document.querySelectorAll('figure.highlight .code').forEach(code => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'copy-button';
    button.textContent = '复制';
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(code.innerText);
        button.textContent = '已复制';
      } catch {
        button.textContent = '请选中文字复制';
      }
      setTimeout(() => { button.textContent = '复制'; }, 1800);
    });
    code.parentElement.insertBefore(button, code);
  });

  const dialog = document.createElement('dialog');
  dialog.className = 'image-viewer';
  dialog.setAttribute('aria-label', '查看照片');
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '关闭';
  close.addEventListener('click', () => dialog.close());
  const fullImage = document.createElement('img');
  dialog.append(close, fullImage);
  document.body.append(dialog);
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  document.querySelectorAll('.article-entry img').forEach(img => {
    if (img.closest('a') && !img.closest('.photo-link')) return;
    const target = img.closest('.photo-link') || img;
    if (target === img) {
      img.tabIndex = 0;
      img.setAttribute('role', 'button');
      img.setAttribute('aria-label', '放大图片：' + (img.alt || '文章图片'));
    }
    const open = event => {
      if (typeof dialog.showModal !== 'function') return;
      event.preventDefault();
      fullImage.src = img.currentSrc || img.src;
      fullImage.alt = img.alt;
      dialog.showModal();
    };
    target.addEventListener('click', open);
    target.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') open(event);
    });
  });
});

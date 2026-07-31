---
title: Gallery
date: 2026-07-31 00:00:00
type: "gallery"
---

<style>
.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  padding: 10px 0;
}
.gallery-item {
  overflow: hidden;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
  transition: transform 0.3s ease;
}
.gallery-item:hover {
  transform: translateY(-4px);
}
.gallery-item img {
  width: 100%;
  height: 220px;
  object-fit: cover;
  display: block;
}
</style>

<div class="gallery-grid">
  <!-- 每一张照片的卡片示例，后续用你的图片链接替换 src 即可 -->
  <div class="gallery-item">
    <img src="https://picsum.photos/800/600?random=1" alt="照片1">
  </div>
  <div class="gallery-item">
    <img src="https://picsum.photos/800/600?random=2" alt="照片2">
  </div>
  <div class="gallery-item">
    <img src="https://picsum.photos/800/600?random=3" alt="照片3">
  </div>
</div>
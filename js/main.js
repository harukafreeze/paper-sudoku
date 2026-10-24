/* main.js — 启动 */
(function () {
  'use strict';
  function boot() {
    if (!window.SD || !window.SD.ui) {
      document.body.innerHTML = '<p style="padding:40px;font:16px/1.7 sans-serif">加载失败：找不到 js/core.js 等脚本。请确认整个 sudoku 文件夹是一起复制的。</p>';
      return;
    }
    window.SD.ui.init();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

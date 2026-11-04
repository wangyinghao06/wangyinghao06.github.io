/* Aivaro · 液态玻璃透镜选择器组件（零依赖）
   由 experiments/liquid-selector.html 实验版移植。
   接口：window.AivaroLens.init(trackEl, onSelect) -> { select(key), value }
   - trackEl：.lg-track 轨道（含 .lg-lens/.lg-row 与 .lg-seg 按钮，段以 data-model 标识）
   - onSelect(key, index)：每次选中变化时回调，key 为段的 data-model 值
   - track.dataset.value 始终同步当前选中 key（生产构建时业务层的状态读取点）
   语义：radiogroup/radio + 漫游 tabindex；←/→/↑/↓ 移动并选中，Home/End 跳首尾；
   reduced-motion 下过渡为 0s（CSS），点击瞬时对位。 */
(function () {
  "use strict";

  function initLensTrack(track, onSelect) {
    if (!track) return null;
    var lens = track.querySelector(".lg-lens");
    var row = track.querySelector(".lg-row");
    var segs = Array.prototype.slice.call(track.querySelectorAll(".lg-seg"));
    if (!lens || !row || !segs.length) return null;
    track.classList.add("js");
    var current = 0;
    segs.forEach(function (s, i) { if (s.getAttribute("aria-checked") === "true") current = i; });
    track.dataset.value = segs[current].getAttribute("data-model");

    function buildRow() {
      row.innerHTML = "";
      row.style.width = track.clientWidth + "px";
      segs.forEach(function (s) {
        var cell = document.createElement("div");
        cell.className = "lg-cell";
        cell.style.width = s.offsetWidth + "px";
        cell.setAttribute("aria-hidden", "true");
        cell.innerHTML = s.querySelector(".seg-in").outerHTML;
        row.appendChild(cell);
      });
      fitClones();
    }
    /* 克隆防裁切：量每格克隆文字的自然宽，若 CSS 放大倍率（桌面 1.13× / 移动 1.05×）
       会让它超出本格宽度（留 4px 总余量），就把该格倍率等比收小——宁可少放大，不许裁切。
       宽裕时不干预，保持 CSS 定版倍率。 */
    function fitClones() {
      Array.prototype.forEach.call(row.children, function (cell) {
        var inn = cell.querySelector(".seg-in");
        if (!inn) return;
        inn.style.transform = "";
        var nat = inn.offsetWidth;
        if (!nat) return;
        var cur = inn.getBoundingClientRect().width / nat;
        var maxS = (cell.offsetWidth - 4) / nat;
        if (maxS < cur) inn.style.transform = "scale(" + Math.max(maxS, 0.85).toFixed(3) + ")";
      });
    }
    function place(animate) {
      var s = segs[current];
      var x = s.offsetLeft, w = s.offsetWidth;
      if (!animate) {
        lens.style.transition = "none"; row.style.transition = "none";
      }
      lens.style.width = w + "px";
      lens.style.transform = "translateX(" + x + "px)";
      row.style.transform = "translateX(" + (-x) + "px)";
      if (!animate) {
        void lens.offsetWidth; /* reflow 后恢复 CSS 过渡 */
        lens.style.transition = ""; row.style.transition = "";
      }
    }
    function select(i, focus) {
      current = ((i % segs.length) + segs.length) % segs.length;
      segs.forEach(function (s, j) {
        s.setAttribute("aria-checked", j === current ? "true" : "false");
        s.tabIndex = j === current ? 0 : -1;
      });
      track.dataset.value = segs[current].getAttribute("data-model");
      place(true);
      if (focus) segs[current].focus();
      if (onSelect) onSelect(track.dataset.value, current);
    }
    segs.forEach(function (s, i) { s.addEventListener("click", function () { select(i, false); }); });
    track.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); select(current + 1, true); }
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); select(current - 1, true); }
      else if (e.key === "Home") { e.preventDefault(); select(0, true); }
      else if (e.key === "End") { e.preventDefault(); select(segs.length - 1, true); }
    });
    var rsz;
    window.addEventListener("resize", function () {
      clearTimeout(rsz);
      rsz = setTimeout(function () { buildRow(); place(false); }, 120);
    });
    buildRow();
    place(false);
    return {
      select: function (key) {
        for (var i = 0; i < segs.length; i++) {
          if (segs[i].getAttribute("data-model") === key) { select(i, false); return; }
        }
      },
      get value() { return track.dataset.value; }
    };
  }

  window.AivaroLens = { init: initLensTrack };
})();

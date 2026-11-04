/* Aivaro · 分段选择器组件（零依赖，真机修订版，取代液态透镜版）
   接口：window.AivaroModelSelector.init(trackEl, onSelect) -> { select(key), value }
   - trackEl：.ms-track 轨道（含 .ms-thumb 白色滑块与 .ms-seg 按钮，段以 data-model 标识）
   - onSelect(key, index)：每次选中变化时回调，key 为段的 data-model 值
   - track.dataset.value 始终同步当前选中 key（业务层的状态读取点）
   语义：radiogroup/radio + 漫游 tabindex；←/→/↑/↓ 移动并选中，Home/End 跳首尾。
   性能：动画由 CSS transition 承担，JS 只在选中变化/尺寸变化时写一次
   滑块的 width 与 transform，不做逐帧计算；零滤镜、零克隆层。
   reduced-motion 下过渡为 0s（CSS），点击瞬时对位。 */
(function () {
  "use strict";

  function initSegTrack(track, onSelect) {
    if (!track) return null;
    var thumb = track.querySelector(".ms-thumb");
    var segs = Array.prototype.slice.call(track.querySelectorAll(".ms-seg"));
    if (!thumb || !segs.length) return null;
    track.classList.add("js");
    var current = 0;
    segs.forEach(function (s, i) { if (s.getAttribute("aria-checked") === "true") current = i; });
    track.dataset.value = segs[current].getAttribute("data-model");

    function place(animate) {
      var s = segs[current];
      if (!animate) thumb.style.transition = "none";
      thumb.style.width = s.offsetWidth + "px";
      thumb.style.transform = "translateX(" + s.offsetLeft + "px)";
      if (!animate) {
        void thumb.offsetWidth; /* reflow 后恢复 CSS 过渡 */
        thumb.style.transition = "";
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
      rsz = setTimeout(function () { place(false); }, 120);
    });
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

  window.AivaroModelSelector = { init: initSegTrack };
})();

/* Aivaro 定版子页脚本：仅移动端导航开合，不发起任何业务请求。
   状态页的网关查询脚本仍保留在 status.html 页内（与生产同源逻辑，逐字沿用）。 */
(function () {
  "use strict";
  var btn = document.getElementById("navToggle");
  var nav = document.getElementById("mobileNav");
  if (!btn || !nav) return;
  btn.addEventListener("click", function () {
    var open = nav.classList.toggle("open");
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.setAttribute("aria-label", open ? "关闭导航菜单" : "打开导航菜单");
  });
  nav.addEventListener("click", function (e) {
    if (e.target.closest("a")) {
      nav.classList.remove("open");
      btn.setAttribute("aria-expanded", "false");
      btn.setAttribute("aria-label", "打开导航菜单");
    }
  });
})();

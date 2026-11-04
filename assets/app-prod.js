/* Aivaro 对话型首页 · 生产版逻辑（U1 甲案，2026-11-03 用户拍板）：
首页只承载对话外壳（可看、可打字、可选模型）；发送与登录不在本站完成——
点「发送」时把当前草稿经?q= 参数带去工作台（8080），在那边登录、
草稿预填、由用户点真发送。本文件不包含任何演示门控/假登录/罐头回复。
与演示版 app.js 分开保存；演示版保持不动。
WORKSPACE_URL 为工作台正式地址；部署时按当时入口复核。
本地/TEST 验证可通过 window.AIVARO_WORKSPACE_URL 覆盖（仅测试注入，
生产页面不设置该变量）。 */
(function () {
"use strict";

var WORKSPACE_URL = window.AIVARO_WORKSPACE_URL ||
"https://8080-agqyuuzd3ejtzmhsnnby2wcjxm.instabox.tech/";
var Q_MAX = 2000; /* 与工作台单条消息上限一致（服务端按 2000 字符拒绝超长） */

var MODELS = {
"cohere": "cohere/north-mini-code:free",
"deepseek": "deepseek-flash",
"deepseek-none": "deepseek-flash-none"
};

var entryBtn = document.getElementById("entryBtn");
var topSheet = document.getElementById("topSheet");
var loginOpenBtn = document.getElementById("loginOpenBtn");
var track = document.getElementById("modelTrack");
var scroll = document.getElementById("msgScroll");
var input = document.getElementById("composerInput");
var form = document.getElementById("composerForm");

/* ---------- 模型选择：分段选择器（仅本地状态，不在本站发送） ---------- */
var modelKey = "cohere";
if (track) {
track.dataset.value = modelKey;
if (window.AivaroModelSelector) {
window.AivaroModelSelector.init(track, function (key) { modelKey = key;});
} else {
track.querySelectorAll(".ms-seg").forEach(function (b) {
b.addEventListener("click", function () {
track.querySelectorAll(".ms-seg").forEach(function (x) {
var on = x === b;
x.setAttribute("aria-checked", String(on));
x.tabIndex = on? 0: -1;
});
modelKey = b.getAttribute("data-model");
track.dataset.value = modelKey;
});
});
}
}

/* ---------- 顶栏收纳 sheet（访客态：链接 + 登录） ---------- */
function setSheet(open) {
topSheet.hidden =!open;
entryBtn.setAttribute("aria-expanded", String(open));
if (open) {
var f = topSheet.querySelector("a, button");
if (f) f.focus();
}
}
if (entryBtn && topSheet) {
entryBtn.addEventListener("click", function (e) {
e.stopPropagation();
setSheet(topSheet.hidden);
});
document.addEventListener("click", function (e) {
if (!topSheet.hidden &&!topSheet.contains(e.target)) setSheet(false);
});
topSheet.addEventListener("click", function (e) {
if (e.target.closest("a")) setSheet(false);
});
document.addEventListener("keydown", function (e) {
if (e.key === "Escape" &&!topSheet.hidden) { setSheet(false); entryBtn.focus();}
});
}

/* ---------- 跳转工作台（甲案衔接） ---------- */
function truncateDraft(text) {
var cps = Array.from(text);
return cps.length > Q_MAX? cps.slice(0, Q_MAX).join(""): text;
}
function goWorkspace(withDraft) {
var url = WORKSPACE_URL;
if (withDraft) {
var draft = input.value;
if (draft.trim()) url += "?q=" + encodeURIComponent(truncateDraft(draft));
}
window.location.href = url;
}
if (loginOpenBtn) {
loginOpenBtn.addEventListener("click", function () { setSheet(false); goWorkspace(false);});
}

/* ---------- 建议问题：点击填入输入框 ---------- */
document.querySelectorAll(".suggest button").forEach(function (b) {
b.addEventListener("click", function () {
input.value = b.getAttribute("data-fill") || "";
autoGrow();
input.focus();
});
});

/* ---------- 输入区：Enter 发送（= 带草稿跳转）/ 自动增高 ---------- */
function autoGrow() {
input.style.height = "auto";
input.style.height = Math.min(input.scrollHeight, 140) + "px";
}
input.addEventListener("input", autoGrow);
input.addEventListener("keydown", function (e) {
if (e.key === "Enter" &&!e.shiftKey) {
e.preventDefault();
form.requestSubmit();
}
});
form.addEventListener("submit", function (e) {
e.preventDefault();
goWorkspace(true);
});

if (scroll) scroll.scrollTop = scroll.scrollHeight;
})();

/* 收费标准页数据层（pricing-page 暂存构建）。
 *
 * 数据源优先级：① 实时源（网关 /api/pricing，同构字段）② 同源快照
 * assets/pricing.snapshot.json（发布时由 generate-snapshot.py 实读生成）
 * ③ 页面内置静态保底卡（两级读取都失败时保留，不替换 DOM）。
 * 现阶段实时源在浏览器端不可读（网关响应无 CORS 许可头，见
 * data-source-investigation.md），页面实际走快照并标注数据时间；
 * 将来 8081 代理落地后，只需把 LIVE_URL 改为代理地址即可切实时。
 *
 * 测试钩子（仅本地点验用）：?plive=<url|off>、?psnap=<url>。
 * 对外 API：window.AivaroPricing.filterModels(models, {query, vendor, group, type, sort})
 */
(function () {
  "use strict";

  var qs = new URLSearchParams(location.search);
  var LIVE_URL = qs.get("plive") === "off" ? null
    : (qs.get("plive") || "https://3000-agqyuuzd3ejtzmhsnnby2wcjxm.instabox.tech/api/pricing");
  var SNAP_URL = qs.get("psnap") || "assets/pricing.snapshot.json";
  var FETCH_TIMEOUT_MS = 4000;

  var state = { source: "static", data: null, generatedAtLabel: null };

  function fmt(n) {
    if (n === null || n === undefined || isNaN(n)) return "—";
    return Math.round(n).toLocaleString("zh-CN");
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fetchJson(url) {
    var ctl = new AbortController();
    var t = setTimeout(function () { ctl.abort(); }, FETCH_TIMEOUT_MS);
    return fetch(url, { signal: ctl.signal, headers: { "Accept": "application/json" } })
      .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); })
      .finally(function () { clearTimeout(t); });
  }

  /* 网关原始 JSON -> 内部 schema（编辑层以快照同 ID 模型为底合并）。 */
  function normalizeGateway(json, base) {
    if (!json || json.success !== true || !Array.isArray(json.data)) return null;
    var vendors = {};
    (json.vendors || []).forEach(function (v) { vendors[v.id] = v.name; });
    var groupRatio = {};
    Object.keys(json.group_ratio || {}).forEach(function (k) { groupRatio[k] = json.group_ratio[k]; });
    if (base && base.group_ratio) {
      Object.keys(base.group_ratio).forEach(function (k) {
        if (!(k in groupRatio)) groupRatio[k] = base.group_ratio[k]; /* 补 trial 等接口未回的已核实倍率 */
      });
    }
    var baseById = {};
    ((base && base.models) || []).forEach(function (m) { baseById[m.id] = m; });
    var dgr = groupRatio["default"] || 1;
    var models = json.data.map(function (row) {
      var ed = baseById[row.model_name] || {};
      var mr = row.model_ratio, cr = row.completion_ratio, cache = row.cache_ratio;
      var typicalRaw = (30 + 500 * cr) * mr * dgr;
      return {
        id: row.model_name,
        vendor: ed.vendor || vendors[row.vendor_id] || "",
        dot: ed.dot || "",
        desc: ed.desc || "",
        context: ed.context || null,
        free: !!ed.free,
        billing_tag: ed.billing_tag || "按量 · 额度计量",
        quota_type: row.quota_type,
        model_ratio: mr, completion_ratio: cr, cache_ratio: (cache === undefined ? null : cache),
        groups: (row.enable_groups || []).map(function (g) { return { name: g, ratio: groupRatio[g] }; }),
        per_1m: {
          input: mr * 1000000 * dgr,
          output: mr * cr * 1000000 * dgr,
          cache_read: (cache === undefined || cache === null) ? null : mr * cache * 1000000 * dgr
        },
        typical_chat: { prompt_tokens: 30, completion_tokens: 500, quota_raw: typicalRaw, quota_display: Math.round(typicalRaw) },
        status: ed.status || { label: "可用", basis: "", success_rate: null, window_label: null, sample_count: null, avg_latency_ms: null }
      };
    });
    return { models: models, group_ratio: groupRatio };
  }

  /* 数据层过滤/排序：UI 当前只接搜索框，其余维度预留给模型变多时用。 */
  function filterModels(models, opts) {
    opts = opts || {};
    var out = models.slice();
    if (opts.query) {
      var q = String(opts.query).toLowerCase();
      out = out.filter(function (m) {
        return (m.id + " " + (m.vendor || "")).toLowerCase().indexOf(q) !== -1;
      });
    }
    if (opts.vendor) out = out.filter(function (m) { return m.vendor === opts.vendor; });
    if (opts.group) out = out.filter(function (m) {
      return m.groups.some(function (g) { return g.name === opts.group; });
    });
    if (opts.type === "free") out = out.filter(function (m) { return m.free; });
    if (opts.type === "paid") out = out.filter(function (m) { return !m.free; });
    if (opts.sort === "name") out.sort(function (a, b) { return a.id < b.id ? -1 : 1; });
    if (opts.sort === "input-asc") out.sort(function (a, b) { return a.per_1m.input - b.per_1m.input; });
    return out;
  }

  function priceCell(label, value, unit) {
    return '<div class="p-price-cell"><span class="p-price-label">' + esc(label) + "</span>" +
      '<span class="p-price-value num">' + esc(value) + "</span>" +
      '<span class="p-price-unit">' + esc(unit) + "</span></div>";
  }

  function cardHtml(m) {
    var cells;
    if (m.free) {
      cells = priceCell("输入", "0", "免费 · 额度 / 1M tokens") +
              priceCell("输出", "0", "免费 · 额度 / 1M tokens") +
              priceCell("缓存读", "0", "免费 · 额度 / 1M tokens");
    } else {
      cells = priceCell("输入", fmt(m.per_1m.input), "额度 / 1M tokens") +
              priceCell("输出", fmt(m.per_1m.output), "额度 / 1M tokens") +
              (m.per_1m.cache_read === null
                ? priceCell("缓存读", "—", "未单列（按输入口径计）")
                : priceCell("缓存读", fmt(m.per_1m.cache_read), "额度 / 1M tokens"));
    }
    var human = m.free
      ? "上游免费，<strong>现金费用为 0</strong>；本卡额度数字按 0 呈现，计量口径见下方典型对话与页内「测试标定」说明。"
      : "按当前倍率，1M 输入约耗 <strong class=\"num\">" + fmt(m.per_1m.input) + "</strong> 额度，1M 输出约耗 <strong class=\"num\">" + fmt(m.per_1m.output) + "</strong> 额度。";
    var groups = m.groups.map(function (g) {
      return '<span class="p-chip">' + esc(g.name) + (g.ratio != null ? " · ×" + g.ratio : "") + "</span>";
    }).join("");
    var metrics = "";
    if (m.status && m.status.success_rate !== null && m.status.success_rate !== undefined && m.status.sample_count) {
      metrics = '<span class="p-status-metrics num">' + esc(m.status.window_label || "") +
        "成功率 " + m.status.success_rate + "%" +
        (m.status.avg_latency_ms ? " · 平均延迟 " + fmt(m.status.avg_latency_ms) + " ms" : "") +
        "（基于 " + fmt(m.status.sample_count) + " 次调用）</span>";
    }
    var typical = m.free
      ? "<strong>0（免费）</strong> <span class=\"p-typical-note\">计量验证按 1:1 标定记 " + fmt(m.typical_chat.quota_display) + " 额度，不产生费用。</span>"
      : "<strong>约 " + fmt(m.typical_chat.quota_display) + " 额度</strong> <span class=\"p-typical-note\">（网关结算取整）</span>";
    return '<article class="pcard" data-model-id="' + esc(m.id) + '">' +
      '<div class="pcard-head">' +
        (m.dot ? '<span class="mdot" data-model="' + esc(m.dot) + '" aria-hidden="true"></span>' : "") +
        '<code class="pcard-name">' + esc(m.id) + "</code>" +
        (m.vendor ? '<span class="pcard-vendor">' + esc(m.vendor) + "</span>" : "") +
        (m.context ? '<span class="pcard-context">上下文 ' + esc(m.context) + "</span>" : "") +
      "</div>" +
      (m.desc ? '<p class="pcard-desc">' + esc(m.desc) + "</p>" : "") +
      '<div class="pcard-tags"><span class="badge' + (m.free ? " test" : "") + '">' + esc(m.billing_tag) + "</span></div>" +
      '<div class="p-price">' + cells + "</div>" +
      '<p class="p-human">' + human + "</p>" +
      '<div class="p-groups"><span class="p-groups-label">可用分组</span>' + groups + "</div>" +
      '<div class="p-status"><span class="p-status-label">' + esc(m.status.label) + "</span>" +
        (m.status.basis ? '<span class="p-status-basis">' + esc(m.status.basis) + "</span>" : "") + metrics + "</div>" +
      '<p class="p-typical">一次典型对话（约 30 输入 ＋ 500 输出 Token）：' + typical + "</p>" +
      "</article>";
  }

  function render(models) {
    var box = document.getElementById("pcards");
    if (!box) return;
    box.innerHTML = models.map(cardHtml).join("");
    var count = document.getElementById("modelCount");
    if (count) count.textContent = models.length;
    var total = document.getElementById("modelTotal");
    if (total) total.textContent = state.data ? state.data.models.length : models.length;
  }

  function setFreshness(text) {
    var el = document.getElementById("dataFreshness");
    if (el) el.textContent = text;
  }

  function nowLabel() {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false
    }).format(new Date()) + " CST";
  }

  function load() {
    var snapP = fetchJson(SNAP_URL).catch(function () { return null; });
    var liveP = LIVE_URL ? fetchJson(LIVE_URL).catch(function () { return null; }) : Promise.resolve(null);
    return Promise.all([snapP, liveP]).then(function (res) {
      var snap = res[0], liveRaw = res[1];
      var live = liveRaw ? normalizeGateway(liveRaw, snap) : null;
      if (live && live.models.length) {
        state.source = "live"; state.data = live;
        render(live.models);
        setFreshness("费率数据：已实时读取网关配置（" + nowLabel() + "）。");
      } else if (snap && Array.isArray(snap.models) && snap.models.length) {
        state.source = "snapshot"; state.data = snap;
        state.generatedAtLabel = snap.generated_at_label || snap.generated_at || "";
        render(snap.models);
        setFreshness("费率数据截至 " + state.generatedAtLabel + "（随发布更新的快照，非实时）。");
      } else {
        state.source = "static";
        setFreshness("暂时无法读取最新费率数据，以下为发布时数据（截至 2026-11-03）。");
      }
      return state;
    });
  }

  function wireSearch() {
    var input = document.getElementById("modelSearch");
    var noresult = document.getElementById("noResult");
    if (!input) return;
    input.addEventListener("input", function () {
      var q = input.value.trim();
      if (state.data) {
        var out = filterModels(state.data.models, { query: q });
        render(out);
        var total = document.getElementById("modelTotal");
        if (total) total.textContent = state.data.models.length;
        if (noresult) noresult.hidden = out.length !== 0;
      } else {
        var cards = document.querySelectorAll("#pcards .pcard");
        var visible = 0;
        cards.forEach(function (c) {
          var hit = !q || c.textContent.toLowerCase().indexOf(q.toLowerCase()) !== -1;
          c.hidden = !hit; if (hit) visible++;
        });
        if (noresult) noresult.hidden = visible !== 0;
      }
    });
  }

  window.AivaroPricing = { filterModels: filterModels, state: state, load: load };

  document.addEventListener("DOMContentLoaded", function () {
    wireSearch();
    load();
  });
})();

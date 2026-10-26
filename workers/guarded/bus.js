// gildongmu-bus - bus API proxy (data.go.kr / Seoul TOPIS)
// 2026-10-05: shared server cache + in-flight request merging (protects Seoul 10k/day quota)
// 2026-10-05: per-day call counters by API type (D1 table live_usage, shared with route-v2) + /usage page (per portal API, per key, from 2026-09-01)
var ALLOWED_HOSTS = [
  "apis.data.go.kr",   // TAGO bus stops/arrivals, small-business store info
  "api.odcloud.kr",    // some new data.go.kr APIs
  "ws.bus.go.kr",      // Seoul TOPIS (Seoul is not in TAGO)
  "apis.data.go.kr."   // guard for trailing-dot variant
];
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};
function hostAllowed(hostname) {
  const h = String(hostname || "").toLowerCase().replace(/\.$/, "");
  return ALLOWED_HOSTS.some((a) => h === a.replace(/\.$/, ""));
}

// -- shared response cache --
// Many users on the same stop cost one upstream call per TTL.
// Only arrival / nearby-stop lookups are cached; every other request passes through unchanged.
var MEM = new Map();        // key -> { ts, res }
var INFLIGHT = new Map();   // key -> Promise<res>  (merge identical concurrent requests)
var MEM_MAX = 1500;

function ttlSecFor(u) {
  const h = String(u.hostname || "").toLowerCase().replace(/\.$/, "");
  const p = u.pathname || "";
  if (h === "ws.bus.go.kr") {
    if (/getStationByUid/i.test(p)) return 20;   // Seoul stop arrivals
    if (/getStationByPos/i.test(p)) return 60;   // Seoul nearby stops
    return 0;
  }
  if (h === "apis.data.go.kr" && /ArvlInfo|busarrivalservice/i.test(p)) return 15; // TAGO / Gyeonggi arrivals
  return 0;
}
// cache only normal responses (never freeze errors / auth failures)
function okBody(u, text) {
  const t = String(text || "");
  if (!t) return false;
  if (/(^|\.)ws\.bus\.go\.kr$/i.test(u.hostname)) {
    return /<headerCd>\s*[04]\s*<\/headerCd>/.test(t);
  }
  return /"resultCode"\s*:\s*"?(0|00|4)"?\s*[,}]/.test(t) || /<resultCode>\s*(0|00|4)\s*<\/resultCode>/.test(t);
}
function cacheKeyOf(cleaned) {
  const pairs = [];
  cleaned.searchParams.forEach((v, k) => { pairs.push(k + "=" + v); });
  pairs.sort();
  return cleaned.origin + cleaned.pathname + "?" + pairs.join("&");
}

// -- per-day call counters by API type --
// Counts every real upstream call (quota is spent per call) and every call saved by the cache.
// Stored in D1 table live_usage (day TEXT, k TEXT, n INTEGER) - the same table route-v2 writes to.
var USAGE = { n: {}, last: 0, ready: false };
var USAGE_GAP_MS = 30000;
var _ctx = null;
function usageAdd(k) { USAGE.n[k] = (USAGE.n[k] || 0) + 1; }
function usageDay(ms) {
  return new Date((ms || Date.now()) + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
function usageKeyOf(u) {
  const h = String(u.hostname || "").toLowerCase().replace(/\.$/, "");
  const p = String(u.pathname || "");
  if (h === "ws.bus.go.kr") {
    if (p.indexOf("getStationByUid") >= 0) return "bus.seoul.arr";
    if (p.indexOf("getStationByPos") >= 0) return "bus.seoul.pos";
    return "bus.seoul.other";
  }
  if (h === "apis.data.go.kr") {
    if (p.indexOf("/6410000/") >= 0) return "bus.gbis";
    if (p.indexOf("ArvlInfo") >= 0) return "bus.tago.arr";
    if (p.indexOf("BusSttnInfo") >= 0) return "bus.tago.stop";
    if (p.indexOf("BusRouteInfo") >= 0) return "bus.tago.route";
    if (p.indexOf("BusLcInfo") >= 0) return "bus.tago.loc";
    if (p.indexOf("BusInfo") >= 0 || p.indexOf("/1613000/") >= 0) return "bus.tago.other";
    return "bus.datago.other";
  }
  if (h === "api.odcloud.kr") return "bus.odcloud";
  return "bus.other";
}
function usageFlush(env, force) {
  try {
    if (!env || !env.DB) return;
    const now = Date.now();
    if (!force && now - USAGE.last < USAGE_GAP_MS) return;
    const keys = Object.keys(USAGE.n);
    if (!keys.length) return;
    USAGE.last = now;
    const snap = USAGE.n;
    USAGE.n = {};
    const day = usageDay(now);
    const run = (async () => {
      try {
        if (!USAGE.ready) {
          await env.DB.prepare("CREATE TABLE IF NOT EXISTS live_usage (day TEXT, k TEXT, n INTEGER, PRIMARY KEY (day, k))").run();
          USAGE.ready = true;
        }
        await env.DB.batch(keys.map((k) => env.DB.prepare("INSERT INTO live_usage (day, k, n) VALUES (?, ?, ?) ON CONFLICT(day, k) DO UPDATE SET n = n + excluded.n").bind(day, k, snap[k])));
      } catch (e) {
        for (const k of keys) USAGE.n[k] = (USAGE.n[k] || 0) + snap[k];
      }
    })();
    if (_ctx && _ctx.waitUntil) _ctx.waitUntil(run);
  } catch (e) {
  }
}
var USAGE_START = "2026-09-01";
async function usageJson(env, url) {
  const todayStr = usageDay(Date.now());
  const list = [];
  for (let i = 0; i < 400; i++) {
    const d = usageDay(Date.now() - i * 86400000);
    if (d < USAGE_START) break;
    list.push(d);
  }
  const usage = {};
  let error = "";
  if (!env.DB) {
    error = "DB not bound";
  } else {
    try {
      await env.DB.prepare("CREATE TABLE IF NOT EXISTS live_usage (day TEXT, k TEXT, n INTEGER, PRIMARY KEY (day, k))").run();
      const rs = await env.DB.prepare("SELECT day, k, n FROM live_usage WHERE day >= ? ORDER BY day DESC, k").bind(USAGE_START).all();
      for (const r of (rs && rs.results) || []) (usage[r.day] = usage[r.day] || {})[r.k] = r.n;
    } catch (e) {
      error = String((e && e.message) || e);
    }
  }
  const body = JSON.stringify({ ok: !error, error: error, start: USAGE_START, today: todayStr, days: list, usage: usage, pending: USAGE.n });
  return new Response(body, { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...CORS } });
}

// Browser-side renderer. Written as a real function and embedded with toString().
function usagePageClient() {
  var KEYS = {
    k1: "키1 (TAGO_KEY)",
    k2: "키2 (TAGO_KEY2)",
    relay: "중계서버 키 (gentle-lab)",
    app: "앱 버스서버 키 (gildongmu-bus)",
    etc: "기타 키",
    u: "키 미구분 (집계 초기분)"
  };
  function ldCols(svc) {
    return [
      { s: "k1", k: ["ld." + svc + ".env-key"], e: ["ld." + svc + ".env-key.err"] },
      { s: "k2", k: ["ld." + svc + ".env-key2"], e: ["ld." + svc + ".env-key2.err"] },
      { s: "relay", k: ["gl.ld." + svc], fb: ["ld." + svc + ".binding"], e: ["gl.ld." + svc + ".err"], fe: ["ld." + svc + ".binding.err"] }
    ];
  }
  function xCols(p) {
    return [
      { s: "k1", k: [p + ".env-key"] },
      { s: "k2", k: [p + ".env-key2"] },
      { s: "etc", k: [p + ".data-go-kr", p + ".xfer-key", p + ".xfer-key2", p + ".other"] }
    ];
  }
  var SEC = [
    { id: "tago-arr", grp: "공공데이터포털 · 국토교통부 TAGO", title: "버스도착정보", op: "ArvlInfoInqireService / getSttnAcctoArvlPrearngeInfoList (정류소별 도착예정정보 목록 조회)", use: "경로탐색 + 앱 버스 화면", limit: 500000, cols: [
      { s: "k1", k: ["tago.env-key"], e: ["tago.env-key.err"] },
      { s: "k2", k: ["tago.env-key2"], e: ["tago.env-key2.err"] },
      { s: "relay", k: ["gl.tago.arr"], fb: ["tago.binding"], e: ["gl.tago.arr.err"], fe: ["tago.binding.err"] },
      { s: "app", k: ["bus.tago.arr"] }
    ] },
    { id: "tago-bus", grp: "공공데이터포털 · 국토교통부 TAGO", title: "버스정류소·노선·위치 정보", op: "BusSttnInfoInqireService / BusRouteInfoInqireService / BusLcInfoInqireService 등", use: "앱 버스 화면", cols: [
      { s: "app", k: ["bus.tago.stop", "bus.tago.route", "bus.tago.loc", "bus.tago.other"] }
    ] },
    { id: "tago-train", grp: "공공데이터포털 · 국토교통부 TAGO", title: "열차정보", op: "TrainInfo / GetStrtpntAlocFndTrainInfo (출·도착지 기반 열차정보 조회)", use: "경로탐색 (장거리)", cols: ldCols("TrainInfo") },
    { id: "tago-exp", grp: "공공데이터포털 · 국토교통부 TAGO", title: "고속버스정보", op: "ExpBusInfo / GetStrtpntAlocFndExpbusInfo (출·도착지 기반 고속버스정보 조회)", use: "경로탐색 (장거리)", cols: ldCols("ExpBusInfo") },
    { id: "tago-sub", grp: "공공데이터포털 · 국토교통부 TAGO", title: "시외버스정보", op: "SuburbsBusInfo / GetStrtpntAlocFndSuberbsBusInfo (출·도착지 기반 시외버스정보 조회)", use: "경로탐색 (장거리)", cols: ldCols("SuburbsBusInfo") },
    { id: "gbis", grp: "공공데이터포털 · 경기도", title: "버스도착정보 조회", op: "busarrivalservice/v2 / getBusArrivalListv2", use: "경로탐색 + 앱 버스 화면", cols: [
      { s: "k1", k: ["gbis.env-key"], e: ["gbis.env-key.err"] },
      { s: "k2", k: ["gbis.env-key2"], e: ["gbis.env-key2.err"] },
      { s: "relay", k: ["gl.gbis"], fb: ["gbis.binding"], e: ["gl.gbis.err"], fe: ["gbis.binding.err"] },
      { s: "app", k: ["bus.gbis"] }
    ] },
    { id: "seoul-arr", grp: "공공데이터포털 · 서울특별시", title: "버스도착정보조회 (정류소 기준)", op: "ws.bus.go.kr/api/rest/arrive / getLowArrInfoByStId", use: "경로탐색", limit: 10000, cols: [
      { s: "k1", k: ["seoul.k1"] },
      { s: "k2", k: ["seoul.k2"] },
      { s: "u", f: function(o) { return Math.max(0, (o["seoul.call"] || 0) - (o["seoul.k1"] || 0) - (o["seoul.k2"] || 0)); } },
      { t: "오류", x: 1, k: ["seoul.err"] },
      { t: "한도 초과 응답", x: 1, k: ["seoul.quota"] }
    ] },
    { id: "seoul-stn", grp: "공공데이터포털 · 서울특별시", title: "정류소정보조회", op: "ws.bus.go.kr/api/rest/stationinfo / getStationByUid, getStationByPos", use: "앱 버스 화면", limit: 10000, cols: [
      { s: "app", k: ["bus.seoul.arr", "bus.seoul.pos", "bus.seoul.other"] }
    ] },
    { id: "xfer", grp: "공공데이터포털 · 환승/출구", title: "환승 이동 데이터 (odcloud 15098252)", op: "api.odcloud.kr/api/15098252/v1/uddi:... (주기적 수집)", use: "경로탐색", cols: xCols("xfer.xfer") },
    { id: "exit", grp: "공공데이터포털 · 환승/출구", title: "출구 정보", op: "apis.data.go.kr/B553766/inout / getFstExit (주기적 수집)", use: "경로탐색", cols: xCols("xfer.exit") },
    { id: "ntce", grp: "공공데이터포털 · 철도 공지", title: "운행 공지", op: "apis.data.go.kr/B553766/ntce / getNtceList", use: "경로탐색", cols: xCols("ntce") },
    { id: "kric", grp: "포털 외 · 철도 시간표", title: "KRIC 역 시간표", op: "openapi.kric.go.kr / convenientInfo/stationTimetable (주기적 수집)", use: "경로탐색 데이터 수집", cols: [
      { t: "호출", k: ["kric.stationTimetable"] }
    ] },
    { id: "est", grp: "포털 외 · 서울 열린데이터광장", title: "지하철 실시간 열차위치", op: "swopenapi.seoul.go.kr / realtimePosition (중계서버 경유, 요청 수 기준)", use: "경로탐색 (실시간 보정)", cols: [
      { t: "요청", k: ["est.seoul-position"] }
    ] },
    { id: "sw", grp: "포털 외 · 서울 열린데이터광장", title: "지하철 실시간 (중계서버가 서울시 API를 실제로 부른 횟수)", op: "swopenapi.seoul.go.kr/api/subway (SEOUL_API_KEY 키별, 방식 재시도 포함)", use: "경로탐색 (실시간 보정) + 앱", cols: [
      { t: "서울 열린데이터 키 1", k: ["gl.sw.k1"], e: ["gl.sw.k1.err"] },
      { t: "서울 열린데이터 키 2", k: ["gl.sw.k2"], e: ["gl.sw.k2.err"] },
      { t: "서울 열린데이터 키 3", k: ["gl.sw.k3"], e: ["gl.sw.k3.err"] },
      { t: "캐시·한국 중계로 처리 (상위 호출 아님)", x: 1, k: ["gl.sw.saved", "gl.sw.relay"] }
    ] },
    { id: "kakao", grp: "포털 외 · 카카오", title: "카카오 로컬 API", op: "dapi.kakao.com/v2/local (장소·주소 검색, 좌표 변환)", use: "앱 검색", cols: [
      { t: "장소·주소 검색", k: ["gl.kakao.search"] },
      { t: "좌표 변환", k: ["gl.kakao.geo"] },
      { t: "오류", x: 1, k: ["gl.kakao.err"] },
      { t: "캐시로 아낌", x: 1, k: ["gl.kakao.saved"] }
    ] },
    { id: "glo", grp: "공공데이터포털 · 중계서버", title: "중계서버 기타 호출", op: "gentle-lab /tago 로 나간 위 분류 외 호출", use: "경로탐색", cols: [
      { t: "서울 TOPIS", k: ["gl.seoul-bus"] },
      { t: "odcloud", k: ["gl.odcloud"] },
      { t: "기타", k: ["gl.datago.other", "gl.gbis-alt", "gl.other"] }
    ] }
  ];
  var SAVE = { id: "save", grp: "절약", title: "캐시로 아낀 호출", op: "같은 요청을 합쳐서 상위 API를 부르지 않은 횟수", use: "", cols: [
    { t: "경로탐색 서버 공유 캐시", k: ["share.hit"] },
    { t: "앱 버스서버 캐시", f: function(o) { var s = 0; for (var k in o) if (k.slice(-6) === ".saved") s += o[k]; return s; } }
  ] };
  var known = {};
  SEC.concat([SAVE]).forEach(function(sc) {
    sc.cols.forEach(function(c) {
      (c.k || []).concat(c.e || [], c.fb || [], c.fe || []).forEach(function(k) { known[k] = 1; known[k + ".saved"] = 1; });
    });
  });
  known["seoul.call"] = 1;

  function num(x) { return (x || 0).toLocaleString("ko-KR"); }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
  function sum(o, ks) { var s = 0; (ks || []).forEach(function(k) { s += (o && o[k]) || 0; }); return s; }
  function val(o, c) { if (c.f) return c.f(o || {}); var s = sum(o, c.k); if (!s && c.fb) s = sum(o, c.fb); return s; }
  function errOf(o, c) { var s = c.e ? sum(o, c.e) : 0; if (!s && c.fe) s = sum(o, c.fe); return s; }
  function colTitle(c) { return c.t || KEYS[c.s] || c.s; }
  function secTotal(o, sc) { var s = 0; sc.cols.forEach(function(c) { if (!c.x) s += val(o, c); }); return s; }

  function render(d) {
    var u = d.usage || {}, days = d.days || [], today = d.today;
    var first = null;
    Object.keys(u).forEach(function(day) { if (!first || day < first) first = day; });
    if (!first) first = today;
    // unclassified keys
    var other = {};
    Object.keys(u).forEach(function(day) { Object.keys(u[day]).forEach(function(k) { if (!known[k] && k.slice(-6) !== ".saved") other[k] = 1; }); });
    var okeys = Object.keys(other).sort();
    var secs = SEC.slice();
    if (okeys.length) secs.push({ id: "other", grp: "기타", title: "분류되지 않은 항목", op: "", use: "", cols: okeys.map(function(k) { return { t: k, k: [k] }; }) });
    secs.push(SAVE);

    var h = "";
    // overview matrix
    var real = secs.filter(function(sc) { return sc.id !== "save"; });
    h += "<h2>일자별 종합</h2><div class='wrap'><table><tr><th>날짜</th>" + real.map(function(sc) { return "<th>" + esc(sc.title) + "<br><span class='mu'>" + esc(sc.grp.split(" · ").pop()) + "</span></th>"; }).join("") + "</tr>";
    var tot = real.map(function() { return 0; });
    var pre = days.filter(function(x) { return x < first; });
    var preRow = pre.length ? "<tr><td>" + pre[pre.length - 1] + " ~ " + pre[0] + "</td><td class='z' colspan='" + real.length + "'>집계 전 (" + pre.length + "일) - 이 서버가 호출 수를 기록하기 전이라 값이 없습니다</td></tr>" : "";
    days.forEach(function(day) {
      if (day < first) return;
      var o = u[day] || {};
      h += "<tr><td>" + day + "</td>" + real.map(function(sc, i) {
        var v = secTotal(o, sc); tot[i] += v;
        return v ? "<td>" + num(v) + "</td>" : "<td class='z'>-</td>";
      }).join("") + "</tr>";
    });
    h += preRow + "<tr class='tot'><td>합계</td>" + tot.map(function(v) { return "<td>" + num(v) + "</td>"; }).join("") + "</tr></table></div>";

    // per-API details
    h += "<h2>호출명별 상세 (키별)</h2>";
    secs.forEach(function(sc) {
      var cols = sc.cols;
      var todayV = secTotal(u[today] || {}, sc), mx = 0, all = 0;
      days.forEach(function(day) { if (day >= first) { var v = secTotal(u[day] || {}, sc); all += v; if (v > mx) mx = v; } });
      h += "<details" + (all ? " open" : "") + "><summary><b>" + esc(sc.title) + "</b> <span class='mu'>" + esc(sc.grp) + "</span><span class='sm'>오늘 " + num(todayV) + " · 최대 " + num(mx) + " · 합계 " + num(all) + (sc.limit ? " · 일 한도 " + num(sc.limit) : "") + "</span></summary>";
      if (sc.op) h += "<div class='mu op'>" + esc(sc.op) + (sc.use ? " · 사용처: " + esc(sc.use) : "") + "</div>";
      h += "<div class='wrap'><table><tr><th>날짜</th>" + cols.map(function(c) { return "<th>" + esc(colTitle(c)) + "</th>"; }).join("") + "<th>합계</th></tr>";
      var ct = cols.map(function() { return 0; }), ce = cols.map(function() { return 0; }), gt = 0;
      var rows = "";
      days.forEach(function(day) {
        var o = u[day] || {};
        if (day < first) return;
        var rt = 0;
        rows += "<tr><td>" + day + "</td>" + cols.map(function(c, i) {
          var v = val(o, c); ct[i] += v; if (!c.x) rt += v;
          var er = errOf(o, c); ce[i] += er;
          if (!v) return "<td class='z'>-</td>";
          return "<td>" + num(v) + (er ? " <small class='er'>오류 " + num(er) + "</small>" : "") + "</td>";
        }).join("") + "<td><b>" + (rt ? num(rt) : "-") + "</b></td></tr>";
        gt += rt;
      });
      h += "<tr class='tot'><td>합계</td>" + cols.map(function(c, i) { return "<td>" + num(ct[i]) + (ce[i] ? " <small class='er'>오류 " + num(ce[i]) + "</small>" : "") + "</td>"; }).join("") + "<td>" + num(gt) + "</td></tr>" + rows + (pre.length ? "<tr><td>" + pre[pre.length - 1] + " ~ " + pre[0] + "</td><td class='z' colspan='" + (cols.length + 1) + "'>집계 전 (" + pre.length + "일)</td></tr>" : "") + "</table></div></details>";
    });
    document.getElementById("main").innerHTML = h;
    document.getElementById("sub").textContent = "집계 시작: " + first + " · 표시 기간: " + d.start + " ~ " + today + " (한국 시간)" + (d.error ? " · 오류: " + d.error : "");
    window.__csv = function() {
      var lines = ["date,group,api,operation,key_source,count,errors"];
      secs.forEach(function(sc) {
        days.slice().reverse().forEach(function(day) {
          if (day < first) return;
          var o = u[day] || {};
          sc.cols.forEach(function(c) {
            var v = val(o, c), er = errOf(o, c);
            if (!v && !er) return;
            function q(s) { return '"' + String(s).replace(/"/g, '""') + '"'; }
            lines.push([day, q(sc.grp), q(sc.title), q(sc.op), q(colTitle(c)), v, er].join(","));
          });
        });
      });
      var blob = new Blob([String.fromCharCode(65279) + lines.join(String.fromCharCode(13, 10))], { type: "text/csv;charset=utf-8" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "api-usage.csv"; document.body.appendChild(a); a.click(); a.remove();
    };
    document.getElementById("csv").style.display = "inline-block";
  }
  document.getElementById("csv").onclick = function() { if (window.__csv) window.__csv(); };
  fetch("/usage.json", { cache: "no-store" }).then(function(r) { return r.json(); }).then(render).catch(function(e) {
    document.getElementById("sub").textContent = "불러오기 실패: " + e;
  });
}

var USAGE_PAGE = [
  "<!doctype html><html lang='ko'><head><meta charset='utf-8'>",
  "<meta name='viewport' content='width=device-width,initial-scale=1'>",
  "<title>API 호출량</title>",
  "<style>",
  ":root{--bg:#f6f7f9;--card:#fff;--tx:#1b1f24;--mu:#6b7480;--ln:#e3e6ea;--ac:#2b7cff;--bd:#d33a24}",
  "@media (prefers-color-scheme:dark){:root{--bg:#14171a;--card:#1d2126;--tx:#e8ebee;--mu:#98a1ab;--ln:#2d333a;--ac:#5b9bff;--bd:#ff6a4f}}",
  "*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:14px/1.5 -apple-system,'Segoe UI',Roboto,'Noto Sans KR',sans-serif}",
  "main,header{max-width:1200px;margin:0 auto;padding:0 16px}header{padding-top:16px}h1{font-size:18px;margin:4px 0 2px}h2{font-size:15px;margin:22px 0 8px}",
  ".sub{color:var(--mu);font-size:12px;margin-bottom:8px}.mu{color:var(--mu);font-size:12px;font-weight:400}",
  "button{border:1px solid var(--ln);background:var(--card);color:var(--tx);border-radius:8px;padding:6px 10px;font:inherit;cursor:pointer;display:none}",
  ".wrap{overflow-x:auto;background:var(--card);border:1px solid var(--ln);border-radius:10px;margin:6px 0 10px}",
  "table{border-collapse:collapse;width:100%}th,td{padding:7px 10px;border-bottom:1px solid var(--ln);text-align:right;white-space:nowrap}",
  "th{font-size:12px;color:var(--mu);font-weight:600;vertical-align:bottom;white-space:normal;word-break:keep-all;min-width:92px}",
  "th:first-child,td:first-child{text-align:left;position:sticky;left:0;background:var(--card)}",
  "tr.tot td{font-weight:700;background:var(--bg)}tr.tot td:first-child{background:var(--bg)}td.z{color:var(--mu)}td[colspan]{text-align:left}",
  "details{margin:6px 0}summary{cursor:pointer;padding:8px 2px}summary .sm{display:block;color:var(--mu);font-size:12px;font-weight:400}",
  ".op{margin:0 2px 4px;word-break:break-all}small.er{color:var(--bd)}",
  "</style></head><body><header>",
  "<h1>API 호출량 (호출명별 · 키별 · 날짜별)</h1>",
  "<div class='sub' id='sub'>불러오는 중...</div>",
  "<button id='csv'>CSV 내려받기</button>",
  "</header><main id='main'></main><main>",
  "<p class='mu'>상위 API를 실제로 부른 횟수입니다(캐시로 처리된 요청은 제외). 서버 메모리에 모았다가 약 1분 단위로 기록하므로 최근 수치는 조금 늦게 반영됩니다. ",
  "'집계 전'은 이 서버가 호출 수를 기록하기 시작하기 전 날짜입니다.</p>",
  "</main><script>(" + usagePageClient.toString() + ")();</script></body></html>"
].join("\n");

function reply(res, tag) {
  const headers = { "Content-Type": res.ct || "text/xml; charset=utf-8", ...CORS };
  if (tag) headers["x-gm-cache"] = tag;
  if (res.cfs) headers["x-gm-up"] = res.cfs;
  return new Response(res.text, { status: res.status, headers });
}

var index_default = {
  async fetch(request, env, ctx) {
    _ctx = ctx || null;
    const reqUrl = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }
    if (reqUrl.pathname === "/" || reqUrl.pathname === "/health") {
      return new Response(
        JSON.stringify({
          ok: true,
          service: "gildongmu-bus-proxy",
          keySet: !!env.DATA_GO_KR_KEY,
          keyLen: (env.DATA_GO_KR_KEY || "").length,
          keyType: env.DATA_GO_KR_KEY ? (/%[0-9A-Fa-f]{2}/.test(env.DATA_GO_KR_KEY) ? "encoding" : "decoding") : "none",
          keyTail: (env.DATA_GO_KR_KEY || "").slice(-4),
          allowed: ALLOWED_HOSTS,
          cache: { entries: MEM.size, inflight: INFLIGHT.size }
        }),
        { headers: { "Content-Type": "application/json; charset=utf-8", ...CORS } }
      );
    }
    if (reqUrl.pathname === "/usage") {
      return new Response(USAGE_PAGE, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...CORS } });
    }
    if (reqUrl.pathname === "/usage.json") {
      usageFlush(env, true);
      return usageJson(env, reqUrl);
    }
    if (reqUrl.pathname !== "/tago") {
      return new Response("Not found", { status: 404, headers: CORS });
    }
    const target = reqUrl.searchParams.get("url");
    if (!target) {
      return new Response("Missing url", { status: 400, headers: CORS });
    }
    let u;
    try {
      u = new URL(target);
    } catch (e) {
      return new Response("Bad url", { status: 400, headers: CORS });
    }
    if (!hostAllowed(u.hostname)) {
      return new Response("Forbidden host: " + u.hostname, { status: 403, headers: CORS });
    }
    if (!env.DATA_GO_KR_KEY) {
      return new Response("Server key not configured", { status: 500, headers: CORS });
    }
    const rawKey = String(env.DATA_GO_KR_KEY || "");
    let decodedKey = rawKey;
    if (/%[0-9A-Fa-f]{2}/.test(rawKey)) {
      try {
        decodedKey = decodeURIComponent(rawKey);
      } catch (e) {
        decodedKey = rawKey;
      }
    }
    const encodedKey = encodeURIComponent(decodedKey);
    const isSeoulTopis = /(^|\.)ws\.bus\.go\.kr$/.test(u.hostname);
    const KEY_PARAM = isSeoulTopis ? "ServiceKey" : "serviceKey";
    const cleaned = new URL(u.toString());
    [...cleaned.searchParams.keys()].forEach((k) => {
      if (k.toLowerCase() === "servicekey") cleaned.searchParams.delete(k);
    });
    const base = cleaned.origin + cleaned.pathname;
    const qs = [];
    cleaned.searchParams.forEach((v, k) => {
      qs.push(encodeURIComponent(k) + "=" + encodeURIComponent(v));
    });
    const ttl = ttlSecFor(cleaned);
    const cfOpt = ttl > 0
      ? { cacheTtlByStatus: { "200-299": ttl, "400-599": 0 }, cacheEverything: true }
      : { cacheTtl: 5, cacheEverything: false };

    const ukey = usageKeyOf(cleaned);
    const tryFetch = async (urlStr) => {
      usageAdd(ukey);
      usageFlush(env);
      return await fetch(urlStr, {
        method: "GET",
        headers: { "Accept": "*/*", "User-Agent": "gildongmu/1.0" },
        cf: cfOpt
      });
    };
    const isKeyError = (t) => /SERVICE_?\s?KEY_?\s?IS_?\s?NOT_?\s?REGISTERED|인증모듈 에러코드|Key인증실패|SERVICE_KEY_IS_NOT_REGISTERED_ERROR/i.test(t || "");
    const attempt = async (target2) => {
      try {
        const r = await tryFetch(target2);
        const t = await r.text();
        return { status: r.status, text: t, ct: r.headers.get("Content-Type"), cfs: r.headers.get("cf-cache-status") };
      } catch (e) {
        const alt = target2.startsWith("https:") ? target2.replace(/^https:/, "http:") : target2.replace(/^http:/, "https:");
        const r2 = await tryFetch(alt);
        const t2 = await r2.text();
        return { status: r2.status, text: t2, ct: r2.headers.get("Content-Type"), cfs: r2.headers.get("cf-cache-status") };
      }
    };
    const buildCandidates = () => {
      const names = isSeoulTopis ? ["ServiceKey", "serviceKey"] : ["serviceKey", "ServiceKey"];
      const out = [];
      for (const name of names) {
        const a = new URL(cleaned.toString());
        a.searchParams.set(name, decodedKey);
        out.push(a.toString());
        out.push(base + "?" + name + "=" + encodedKey + (qs.length ? "&" + qs.join("&") : ""));
      }
      return out;
    };
    const fetchUpstream = async () => {
      const candidates = buildCandidates();
      let res;
      for (let i = 0; i < candidates.length; i++) {
        res = await attempt(candidates[i]);
        if (!isKeyError(res.text)) break;
      }
      return res;
    };

    // not cacheable: original behavior
    if (ttl <= 0) {
      let res;
      try {
        res = await fetchUpstream();
      } catch (e) {
        return new Response("Upstream error: " + (e.message || e), { status: 502, headers: CORS });
      }
      return reply(res, "");
    }

    // cacheable: (1) memory hit (2) join in-flight request (3) fetch upstream
    const ckey = cacheKeyOf(cleaned);
    const hit = MEM.get(ckey);
    if (hit && Date.now() - hit.ts < ttl * 1000) {
      usageAdd(ukey + ".saved");
      usageFlush(env);
      return reply(hit.res, "HIT");
    }
    let p = INFLIGHT.get(ckey);
    let tag = "JOIN";
    if (!p) {
      tag = "MISS";
      p = fetchUpstream()
        .then((r) => {
          if (r.status === 200 && !isKeyError(r.text) && okBody(cleaned, r.text)) {
            if (MEM.size >= MEM_MAX) MEM.clear();
            MEM.set(ckey, { ts: Date.now(), res: r });
          }
          return r;
        })
        .finally(() => { INFLIGHT.delete(ckey); });
      INFLIGHT.set(ckey, p);
    }
    let res;
    try {
      res = await p;
    } catch (e) {
      return new Response("Upstream error: " + (e.message || e), { status: 502, headers: CORS });
    }
    if (tag === "JOIN") {
      usageAdd(ukey + ".saved");
      usageFlush(env);
    }
    return reply(res, tag);
  }
};
// ===== GUARD BEGIN (API abuse protection, tools/guard-wrap.js) =====
// \uae38\ub3d9\ubb34 \u2014 API \ub0a8\uc6a9 \u00b7 \ub9e4\ud06c\ub85c \ubc29\uc5b4 \uc5d4\uc9c4 \ubaa8\ub4c8 (route-v2 Worker \uc785\uad6c\uc5d0 \ubd99\uc774\ub294 \uc21c\uc218 \ud568\uc218) \u2014 2026-10-26 (s226)
//
// \u2605 \uc6d0\uce59(YJ): "API \ub0a8\uc6a9\u00b7\ub9e4\ud06c\ub85c \uacf5\uaca9\uc73c\ub85c \uc11c\ube44\uc2a4\uac00 \uacfc\ubd80\ud558\ub418\uc9c0 \uc54a\uac8c, \uc0ac\uc6a9\uc790\ub294 \ubd88\ud3b8\ud568\uc774 \uc5c6\uac8c."
//   - \ubcf4\ud1b5 \uc0ac\uc6a9\uc790\ub294 \uc808\ub300 \uac78\ub9ac\uc9c0 \uc54a\uc744 \ub109\ub109\ud55c \ud55c\ub3c4(\ubc84\ud0b7)\ub9cc \ub454\ub2e4. \ud55c\ub3c4\uc5d0 \uac78\ub824\ub3c4 \uc571\uc774 '\uc870\uc6a9\ud788 \ud55c \ubc88 \ub2e4\uc2dc' \ubcf4\ub0b4\uc11c \ud654\uba74\uc5d0\ub294 \uc544\ubb34 \uc77c\ub3c4 \uc548 \ubcf4\uc778\ub2e4(NetPost).
//   - \uc694\uccad\ub9c8\ub2e4 \uc571\uc774 \uc124\uce58 \ub54c \ub9cc\ub4e0 \ubb34\uc791\uc704 \ubc88\ud638(X-Gdm-Id)\ub97c \uc2e4\uc5b4 \ubcf4\ub0b8\ub2e4. \ud55c \uae30\uae30 = \ud55c \ud1b5. \uc774\ub3d9\ud1b5\uc2e0 \uacf5\uc720 IP(CGNAT) \ub4a4\uc758 \uc5ec\ub7ec \uc0ac\uc6a9\uc790\uac00 \uc11c\ub85c\uc758 \ud55c\ub3c4\ub97c \uac09\uc544\uba39\uc9c0 \uc54a\ub294\ub2e4.
//     \ubc88\ud638\ub97c \uc694\uccad\ub9c8\ub2e4 \ubc14\uafd4 \uac00\uba70 \uc6b0\ud68c\ud558\ub824\ub294 \uc2dc\ub3c4(\ud55c IP \uc5d0\uc11c 1\ubd84\uc5d0 \ubc88\ud638 120\uac1c \ub118\uac8c)\ub294 \ubc88\ud638\ub97c \ubb34\uc2dc\ud558\uace0 IP \ud558\ub098\ub85c \ubb36\ub294\ub2e4.
//   - \uc0c1\ud55c\uc774 \ud55c \uad70\ub370\ub85c\ub9cc \uc624\uc9c0 \uc54a\uac8c \uc138 \uacb9: \u2460 IP \uc804\uccb4 \uc0c1\ud55c(\uc544\uc8fc \ub109\ub109) \u2461 \uc885\ub958\ubcc4 \ud1b5(\uac00\ubcbc\uc6b4 \ud654\uba74 \u00b7 \ubb34\uac70\uc6b4 \uc870\ud68c \u00b7 \uad00\ub9ac/\uc9c4\ub2e8\uc6a9) \u2462 \uc5f0\uc774\uc5b4 \ud55c\ub3c4\ub97c \ub118\uc73c\uba74 \uc7a0\uae50(60\ucd08\ubd80\ud130 \ucd5c\ub300 10\ubd84) \ucc28\ub2e8.
//   - \uad00\ub9ac\u00b7\uc9c4\ub2e8 \uc8fc\uc18c(debug \u00b7 probe \u00b7 fill \u00b7 live-test \u2026)\ub294 \uc571\uc774 \uc548 \uc4f4\ub2e4 \u2192 \uc544\uc8fc \uc791\uc740 \ud55c\ub3c4 + \ube44\ubc00\uac12(env.ADMIN_KEY)\uc774 \uc788\uc73c\uba74 \uadf8\uac83 \uc5c6\uc774\ub294 403.
//   - \ubb34\uac70\uc6b4 \uc870\ud68c\uac00 \ud55c \uc778\uc2a4\ud134\uc2a4\uc5d0 \ub3d9\uc2dc\uc5d0 \ub108\ubb34 \ubab0\ub9ac\uba74(64) \ub300\uae30\uc2dc\ud0a4\uc9c0 \uc54a\uace0 \ubc14\ub85c 503 + Retry-After(\uc571\uc774 \uc870\uc6a9\ud788 \ud55c \ubc88 \ub2e4\uc2dc).
//   - \uc774 \ubaa8\ub4c8\uc774 \ud2c0\ub824\ub3c4 \uc0ac\uc6a9\uc790 \uc694\uccad\uc744 \ub9c9\uc9c0 \uc54a\ub294\ub2e4(\uc6cc\ucee4 \uc5f0\uacb0\ubd80\uac00 \uc608\uc678\ub294 \ud1b5\uacfc\uc2dc\ud0a8\ub2e4).
// \ud55c\uacc4(\uc815\uc9c1): \uc6cc\ucee4 \uc778\uc2a4\ud134\uc2a4\ub9c8\ub2e4 \ub530\ub85c \uc13c\ub2e4(\ud55c \uc778\uc2a4\ud134\uc2a4 \uc548\uc5d0\uc11c\ub9cc \uc815\ud655). \uc5ec\ub7ec \uc778\uc2a4\ud134\uc2a4\uc5d0 \ud769\uc5b4\uc9c4 \ubd84\uc0b0 \uacf5\uaca9\uc740 Cloudflare \uc18d\ub3c4 \uc81c\ud55c \ubc14\uc778\ub529(GDM_RL)\uc774 \uc788\uc73c\uba74 \uadf8\uac83\uc73c\ub85c \ud55c \ubc88 \ub354 \ub9c9\ub294\ub2e4.
'use strict';

var GD_V = 1;
// \uc885\ub958\ubcc4 \ud1b5: cap = \ud55c \ubc88\uc5d0 \ubab0\uc544 \ubcf4\ub0bc \uc218 \uc788\ub294 \uc591(\ubc84\uc2a4\ud2b8) \u00b7 rate = \ucd08\ub2f9 \ucc44\uc6cc\uc9c0\ub294 \uc591
var GD_CFG = {
  light: { cap: 60, rate: 4 },          // \ud654\uba74 \u00b7 \ud0ed \u00b7 \uce69 \ub204\ub974\uae30 \u2026 (1\ucd08\uc5d0 4\ubc88\uc744 \uacc4\uc18d \ub20c\ub7ec\ub3c4 \uc548 \uac78\ub9b0\ub2e4)
  heavy: { cap: 40, rate: 2 },          // \uc678\ubd80 \uc870\ud68c\uac00 \ub4dc\ub294 \uac83: \uae38\ucc3e\uae30 \u00b7 \ubc84\uc2a4/\uc9c0\ud558\ucca0 \ub3c4\ucc29 \u00b7 AI \ubb38\uad6c \u00b7 \uc9c0\ub3c4 (\ubd84\ub2f9 120\ubc88)
  write: { cap: 20, rate: 0.5 },        // \uae00 \u00b7 \ub313\uae00 \u00b7 \uc81c\ubcf4 \u00b7 \ucc44\ud305 \uc4f0\uae30(\ub3c4\ubc30 \ubc29\uc9c0): \ud55c \ubc88\uc5d0 20\uac1c, \uc774\ud6c4 \ubd84\ub2f9 30\uac1c (\uc0ac\ub78c\uc774 \uce58\ub294 \uc18d\ub3c4\ub294 \uac78\ub9ac\uc9c0 \uc54a\ub294\ub2e4)
  admin: { cap: 5, rate: 1 / 12 },      // \uad00\ub9ac\u00b7\uc9c4\ub2e8 \uc8fc\uc18c: \ubd84\ub2f9 5\ubc88
  total: { cap: 600, rate: 30 }         // IP \ud558\ub098\uc758 \uc804\uccb4(\uacf5\uc720 IP \ub3c4 \ub109\ub109): \ud55c \ubc88\uc5d0 600 \u00b7 \ucd08\ub2f9 30
};
var GD_BAN_VIO = 8;                     // 30\ucd08 \uc548\uc5d0 \ud55c\ub3c4\ub97c 8\ubc88 \ub118\uc73c\uba74
var GD_BAN_MS = 60000, GD_BAN_MAX_MS = 600000;
var GD_SPOOF_IDS = 120;                 // \ud55c IP \uac00 1\ubd84\uc5d0 \ubc88\ud638\ub97c \uc774\ub9cc\ud07c \ub118\uac8c \ubc14\uafb8\uba74 \ubc88\ud638\ub97c \ubb34\uc2dc\ud55c\ub2e4
var GD_BATCH_COST = 3;                  // \ubb36\uc74c \uc694\uccad(/screen/batch)\uc740 \uc548\uc5d0 \ucd5c\ub300 16\uac1c\uac00 \ub4e0\ub2e4 \u2192 3\uce78

var GD_ADMIN_PATHS = ['/stops-near', '/debug-shared-nostop', '/debug-ghost-routes', '/live-usage', '/live-test', '/bt-verify', '/bt-fill', '/ld-pairs-warm',
  '/kric-rederive', '/kric-status', '/kric-ingest', '/kric-probe', '/kric-derive', '/est-status', '/xfer-status', '/xfer-probe', '/tago-probe', '/bus-split-test'];
var GD_HEAVY_PATHS = ['/route-v2', '/route-v2-app', '/route-v2-debug', '/warm', '/ride/start', '/ride/buspick', '/reco-text', '/commute-brief', '/widget-say', '/suggest',
  '/food-pub', '/bus-tago', '/screen/map', '/next-train', '/board-live', '/home-brief', '/scene', '/ride-eta', '/ride-track', '/ride-standby', '/pos-fuse'];

var GD_ST = { b: new Map(), ban: new Map(), vio: new Map(), ids: new Map(), gcAt: 0, stat: { ok: 0, limited: 0, banned: 0, admin: 0, spoof: 0 } };

// \ub2e4\ub978 \uc6cc\ucee4(\uac8c\uc2dc\ud310 \u00b7 \ubc84\uc2a4 \u00b7 \uc74c\uc2dd \u00b7 \uc1fc\ud551 \u00b7 \uc911\uacc4)\ub294 o.cls(\uc885\ub958 \uc774\ub984 \u00b7 'free' \uba74 \uac80\uc0ac \uc5c6\uc774 \ud1b5\uacfc)\uc640 o.cfg(\uc885\ub958\ubcc4 \ud1b5 \ud06c\uae30 \ub36e\uc5b4\uc4f0\uae30)\ub97c \ub118\uae34\ub2e4.
function gdClass(path) {
  var p = String(path || '');
  if (GD_ADMIN_PATHS.indexOf(p) >= 0) return 'admin';
  if (GD_HEAVY_PATHS.indexOf(p) >= 0) return 'heavy';
  return 'light';
}
function gdIid(s) { s = String(s == null ? '' : s); return /^[A-Za-z0-9_-]{8,48}$/.test(s) ? s : ''; }

// \ud1b5\uc5d0\uc11c cost \uce78\uc744 \uaebc\ub0b8\ub2e4. { ok, waitMs }
function gdTake(key, cap, rate, cost, now) {
  var b = GD_ST.b.get(key);
  if (!b) { b = { v: cap, t: now }; GD_ST.b.set(key, b); }
  else { b.v = Math.min(cap, b.v + (now - b.t) / 1000 * rate); b.t = now; }
  if (b.v >= cost) { b.v -= cost; return { ok: true, waitMs: 0 }; }
  return { ok: false, waitMs: Math.ceil((cost - b.v) / rate * 1000) };
}

function gdGc(now) {
  if (now - GD_ST.gcAt < 30000 && GD_ST.b.size < 20000) return;
  GD_ST.gcAt = now;
  GD_ST.b.forEach(function (b, k) { if (now - b.t > 300000) GD_ST.b.delete(k); });
  GD_ST.ban.forEach(function (x, k) { if (x.until < now - 600000) GD_ST.ban.delete(k); });
  GD_ST.vio.forEach(function (x, k) { if (now - x.t0 > 600000) GD_ST.vio.delete(k); });
  GD_ST.ids.forEach(function (x, k) { if (now - x.t0 > 120000) GD_ST.ids.delete(k); });
  if (GD_ST.b.size > 50000) GD_ST.b.clear();                       // \uba54\ubaa8\ub9ac \ubc29\uc5b4(\uacf5\uaca9\uc73c\ub85c \ud0a4\uac00 \ud3ed\uc99d\ud574\ub3c4)
  if (GD_ST.ids.size > 20000) GD_ST.ids.clear();
}

function gdCfgOf(o, cls) { return (o.cfg && o.cfg[cls]) || GD_CFG[cls] || GD_CFG.light; }

// \ud55c \uc694\uccad\uc744 \ud1b5\uacfc\uc2dc\ud0ac\uae4c. o = { ip, iid, path, method, now, adminSet, adminOk }
//   \u2192 { ok:true, cls } | { ok:false, status, retryS, reason, cls }
function gdDecide(o) {
  var now = Number(o.now) || 0, ip = String(o.ip || 'unknown'), method = String(o.method || 'GET').toUpperCase();
  var path = String(o.path || '/'), cls = o.cls ? String(o.cls) : gdClass(path);
  if (method === 'OPTIONS' || cls === 'free') return { ok: true, cls: cls };
  gdGc(now);
  if (cls === 'admin') {
    if (o.adminSet && !o.adminOk) { GD_ST.stat.admin++; return { ok: false, status: 403, retryS: 0, reason: 'admin', cls: cls }; }
    var ca = gdCfgOf(o, 'admin');
    var ta = gdTake('A|' + ip, ca.cap, ca.rate, 1, now);
    if (!ta.ok) { GD_ST.stat.limited++; return { ok: false, status: 429, retryS: Math.max(1, Math.ceil(ta.waitMs / 1000)), reason: 'admin-rate', cls: cls }; }
    return { ok: true, cls: cls };
  }
  // \ubc88\ud638(\uae30\uae30) \uad6c\ubd84 \u2014 \ud55c IP \uac00 \ubc88\ud638\ub97c \ub9c8\uad6c \ubc14\uafb8\uba74 \ubb34\uc2dc
  var iid = gdIid(o.iid), spoof = false;
  if (iid) {
    var rec = GD_ST.ids.get(ip);
    if (!rec || now - rec.t0 > 60000) { rec = { t0: now, set: new Set() }; GD_ST.ids.set(ip, rec); }
    rec.set.add(iid);
    if (rec.set.size > GD_SPOOF_IDS) { spoof = true; iid = ''; GD_ST.stat.spoof++; }
  }
  var who = ip + '|' + iid;
  var ban = GD_ST.ban.get(who);
  if (ban && ban.until > now) { GD_ST.stat.banned++; return { ok: false, status: 429, retryS: Math.max(1, Math.ceil((ban.until - now) / 1000)), reason: 'ban', cls: cls }; }
  var cost = path === '/screen/batch' ? GD_BATCH_COST : 1;
  var c = gdCfgOf(o, cls), ct = gdCfgOf(o, 'total');
  var t1 = gdTake('T|' + ip, ct.cap, ct.rate, cost, now);
  var t2 = t1.ok ? gdTake(cls + '|' + who, spoof ? Math.ceil(c.cap / 2) : c.cap, spoof ? c.rate / 2 : c.rate, cost, now) : t1;
  if (t2.ok) { GD_ST.stat.ok++; return { ok: true, cls: cls }; }
  // \ud55c\ub3c4 \ucd08\uacfc \u2014 \uc5f0\uc774\uc5b4 \ub118\uc73c\uba74 \uc7a0\uae50 \ucc28\ub2e8(60\ucd08 \u2192 120\ucd08 \u2026 \ucd5c\ub300 10\ubd84)
  GD_ST.stat.limited++;
  var v = GD_ST.vio.get(who);
  if (!v || now - v.t0 > 30000) { v = { n: 0, t0: now, lvl: v ? v.lvl : 0 }; GD_ST.vio.set(who, v); }
  v.n++;
  if (v.n >= GD_BAN_VIO) {
    var ms = Math.min(GD_BAN_MAX_MS, GD_BAN_MS * Math.pow(2, Math.min(4, v.lvl)));
    GD_ST.ban.set(who, { until: now + ms }); v.lvl++; v.n = 0; v.t0 = now;
    return { ok: false, status: 429, retryS: Math.ceil(ms / 1000), reason: 'ban', cls: cls };
  }
  return { ok: false, status: 429, retryS: Math.max(1, Math.ceil(t2.waitMs / 1000)), reason: 'rate', cls: cls };
}
// API \ub0a8\uc6a9 \ubc29\uc5b4 Worker \uc5f0\uacb0\ubd80 \u2014 route-v2 \uc758 fetch \ub9e8 \uc55e\uc5d0\uc11c guardEnter \ub97c \ubd80\ub978\ub2e4(engine/guard.js \uc758 gdDecide \ub97c \uc4f4\ub2e4).
//   guardEnter(request, env) \u2192 { res, done } \u2014 res \uac00 \uc788\uc73c\uba74 \uadf8 \uc751\ub2f5(429/403/503)\uc744 \uadf8\ub300\ub85c \ub3cc\ub824\uc8fc\uace0, \uc5c6\uc73c\uba74 \ud1b5\uacfc(\ub05d\ub098\uba74 done() \uc744 \ubd80\ub978\ub2e4).
//   \uc774 \uc5f0\uacb0\ubd80\ub294 \uc5b4\ub5a4 \uc624\ub958\uac00 \ub098\ub3c4 \uc694\uccad\uc744 \ub9c9\uc9c0 \uc54a\ub294\ub2e4(\ud1b5\uacfc). \uc120\ud0dd: env.GDM_RL(Cloudflare \uc18d\ub3c4 \uc81c\ud55c \ubc14\uc778\ub529, .limit({key}))\uc774 \uc788\uc73c\uba74 \ud55c \ubc88 \ub354 \uac74\ub2e4.
var GD_HEAVY_MAX = 64;                   // \ud55c \uc778\uc2a4\ud134\uc2a4\uc5d0\uc11c \ub3d9\uc2dc\uc5d0 \ucc98\ub9ac \uc911\uc778 \ubb34\uac70\uc6b4 \uc870\ud68c \uc0c1\ud55c \u2014 \ub118\uc73c\uba74 \uc904 \uc138\uc6b0\uc9c0 \uc54a\uace0 \ubc14\ub85c 503
var GD_INFLIGHT = { heavy: 0 };
function gdReject(d) {
  var h = { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" };
  if (d.retryS > 0) h["Retry-After"] = String(d.retryS);
  return new Response(JSON.stringify({ ok: false, error: d.status === 403 ? "forbidden" : d.status === 503 ? "busy" : "rate", retry: d.retryS || 0 }), { status: d.status, headers: h });
}
//   opt(\uc120\ud0dd \u00b7 \ub2e4\ub978 \uc6cc\ucee4\uc6a9) = { cls: function (path, method) \u2192 'light'|'heavy'|'write'|'admin'|'free', cfg: { \uc885\ub958: { cap, rate } }, heavyMax }
//   CF-Connecting-IP \uac00 \uc5c6\ub294 \uc694\uccad(\uc6cc\ucee4\ub07c\ub9ac \uc11c\ube44\uc2a4 \ubc14\uc778\ub529\uc73c\ub85c \ubd80\ub974\ub294 \ub0b4\ubd80 \ud638\ucd9c)\uc740 \uac80\uc0ac\ud558\uc9c0 \uc54a\ub294\ub2e4 \u2014 \ubc14\uae65\uc5d0\uc11c \uc624\ub294 \uc694\uccad\uc5d0\ub294 \ud074\ub77c\uc6b0\ub4dc\ud50c\ub808\uc5b4\uac00 \ud56d\uc0c1 \ubd99\uc778\ub2e4.
async function guardEnter(request, env, opt) {
  var none = { res: null, done: function () { } };
  try {
    var url = new URL(request.url), hd = request.headers;
    if (!(hd.get("CF-Connecting-IP") || hd.get("cf-connecting-ip"))) return none;
    opt = opt || {};
    var adminSet = !!(env && env.ADMIN_KEY && typeof env.ADMIN_KEY === "string");
    var adminOk = adminSet && (hd.get("x-admin-key") === env.ADMIN_KEY || url.searchParams.get("k") === env.ADMIN_KEY);
    var d = gdDecide({ ip: hd.get("CF-Connecting-IP") || hd.get("cf-connecting-ip"), iid: hd.get("X-Gdm-Id"), path: url.pathname, method: request.method, now: Date.now(), adminSet: adminSet, adminOk: adminOk, cls: opt.cls ? opt.cls(url.pathname, request.method) : undefined, cfg: opt.cfg });
    if (!d.ok) return { res: gdReject(d), done: none.done };
    if (request.method !== "OPTIONS" && d.cls !== "admin" && d.cls !== "free" && env && env.GDM_RL && typeof env.GDM_RL.limit === "function") {
      try {
        var r = await env.GDM_RL.limit({ key: (hd.get("CF-Connecting-IP") || "unknown") + "|" + d.cls });
        if (r && r.success === false) return { res: gdReject({ status: 429, retryS: 10, reason: "rl" }), done: none.done };
      } catch (e2) { }
    }
    if (d.cls === "heavy") {
      if (GD_INFLIGHT.heavy >= (opt.heavyMax || GD_HEAVY_MAX)) return { res: gdReject({ status: 503, retryS: 2, reason: "busy" }), done: none.done };
      GD_INFLIGHT.heavy++;
      var fin = false;
      return { res: null, done: function () { if (!fin) { fin = true; GD_INFLIGHT.heavy = Math.max(0, GD_INFLIGHT.heavy - 1); } } };
    }
    return none;
  } catch (e) { return none; }
}
var GD_OPT = { cls: function (p, m) { if (p === "/tago") return "heavy"; if (p === "/usage" || p === "/usage.json") return "admin"; return "light"; }, cfg: {"heavy":{"cap":80,"rate":4},"admin":{"cap":10,"rate":0.2}}, heavyMax: 64 };
function gdWrap(inner) {
  var out = {};
  for (var k in inner) out[k] = inner[k];
  out.fetch = async function (request, env, ctx) {
    var g = await guardEnter(request, env, GD_OPT);
    if (g.res) return g.res;
    try { return await inner.fetch(request, env, ctx); } finally { g.done(); }
  };
  return out;
}
// ===== GUARD END =====
export default gdWrap(index_default);

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
export {
  index_default as default
};

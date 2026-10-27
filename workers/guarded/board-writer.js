var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
// 2026-10-01: \uc608\uc804\uc5d4 \uad00\ub9ac \ud1a0\ud070\uc774 \uc18c\uc2a4\uc5d0 \uc788\uc5c8\uace0, \uac19\uc740 \uac12\uc774 \uacf5\uac1c \uc571(www/index.html)\uc758 /react \ud638\ucd9c\uc5d0\ub3c4
//   \ub4e4\uc5b4 \uc788\uc5b4 \ub204\uad6c\ub098 /gen\u00b7/gentalk\u00b7/news(Gemini \ud638\ucd9c\u00b7\uae00 \uc0dd\uc131)\ub97c \ubd80\ub97c \uc218 \uc788\uc5c8\ub2e4.
//   \u2192 \uad00\ub9ac \uacbd\ub85c\ub294 \uc2dc\ud06c\ub9bf ADMIN_TOKEN \uc73c\ub85c\ub9cc \uc5f4\ub9ac\uace0(\uc5c6\uc73c\uba74 \ub2eb\ud798), \uc571\uc774 \uc4f0\ub294 /react \ub294 \ud1a0\ud070 \ub300\uc2e0
//     IP\u00b7\uc804\uccb4 \uc2dc\uac04\ub2f9 \ud638\ucd9c \uc81c\ud55c\uc73c\ub85c \ub9c9\ub294\ub2e4.
function adminOk(url, env) {
  const want = env && env.ADMIN_TOKEN;
  return !!want && url.searchParams.get("token") === want;
}
var MSG_PER_IP_HR = 40;      // \ud55c IP \uac00 \ud55c \uc2dc\uac04\uc5d0 \ub300\ud654\ub85c \ub0a8\uae38 \uc218 \uc788\ub294 \uc0ac\uc6a9\uc790 \uba54\uc2dc\uc9c0 \uc218
async function msgAllowed(req, env) {
  try {
    const ip = req.headers.get("CF-Connecting-IP") || "?";
    const hr = Math.floor(Date.now() / 36e5);
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS react_rl (k TEXT, hr INTEGER, n INTEGER, PRIMARY KEY (k, hr))").run();
    await env.DB.prepare("INSERT INTO react_rl (k,hr,n) VALUES (?1,?2,1) ON CONFLICT(k,hr) DO UPDATE SET n = n + 1").bind("msg:" + ip, hr).run();
    const r = await env.DB.prepare("SELECT n FROM react_rl WHERE k=?1 AND hr=?2").bind("msg:" + ip, hr).first();
    return ((r && r.n) || 1) <= MSG_PER_IP_HR;
  } catch (e) { return false; }
}
var REACT_PER_IP_HR = 12;    // \ud55c IP \uac00 \ud55c \uc2dc\uac04\uc5d0 \ubcf4\ub0bc \uc218 \uc788\ub294 /react \uc218
var REACT_ALL_HR = 400;      // \uc11c\ubc84 \uc804\uccb4 \ud55c \uc2dc\uac04 \uc0c1\ud55c(Gemini \ube44\uc6a9 \ubcf4\ud638)
async function reactAllowed(req, env) {
  try {
    const ip = req.headers.get("CF-Connecting-IP") || "?";
    const hr = Math.floor(Date.now() / 36e5);
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS react_rl (k TEXT, hr INTEGER, n INTEGER, PRIMARY KEY (k, hr))").run();
    const bump = async (k) => {
      await env.DB.prepare("INSERT INTO react_rl (k,hr,n) VALUES (?1,?2,1) ON CONFLICT(k,hr) DO UPDATE SET n = n + 1").bind(k, hr).run();
      const r = await env.DB.prepare("SELECT n FROM react_rl WHERE k=?1 AND hr=?2").bind(k, hr).first();
      return (r && r.n) || 1;
    };
    if ((await bump("ip:" + ip)) > REACT_PER_IP_HR) return false;
    if ((await bump("all")) > REACT_ALL_HR) return false;
    if (hr % 6 === 0) await env.DB.prepare("DELETE FROM react_rl WHERE hr < ?1").bind(hr - 48).run();
    return true;
  } catch (e) { return false; }
}
// \u2605 2026-10-03 (\uac1c\uc120\uc548 4\u00b75): \ub178\uc120\ubcc4 \ucd9c\ud1f4\uadfc \ubc29 + \uc9c0\uc5f0\u00b7\ud63c\uc7a1 \uc81c\ubcf4.
//   \u2605 2026-10-04: \ubc29\uc758 \uc77c\uc0c1 \ub300\ud654(chat)\ub294 AI \uac00 \ucc44\uc6b0\uae30\ub3c4 \ud55c\ub2e4(generateLineTalks, ipk='ai'). \uc9c0\uc5f0\u00b7\ud63c\uc7a1 \uc81c\ubcf4(delay/crowd)\ub294 \uc2e4\uc81c \uc0ac\uc6a9\uc790 \uac83\ub9cc \uc13c\ub2e4.
//   \u00b7 line_msgs: \ub178\uc120(\ub610\ub294 \ubc84\uc2a4\ubc88\ud638)\ubcc4 \ud55c \uc904 \ub300\ud654(chat)\uc640 \uc81c\ubcf4(delay=\uc9c0\uc5f0, crowd=\ud63c\uc7a1). IP \ub294 \ud574\uc2dc(ipk)\ub9cc \uc800\uc7a5\ud55c\ub2e4.
//   \u00b7 \uac19\uc740 \uc0ac\ub78c\uc774 \uac19\uc740 \ub178\uc120\u00b7\uc5ed\uc5d0 \uac19\uc740 \uc81c\ubcf4\ub97c 20\ubd84 \uc548\uc5d0 \ub610 \ubcf4\ub0b4\ub3c4 \ud55c \ubc88\uc73c\ub85c \uc13c\ub2e4(\uacbd\ubcf4 \ubd80\ud480\ub9ac\uae30 \ubc29\uc9c0).
var LR_PER_IP_HR = 30;
// \u2605 2026-10-03: \uc2e0\uace0\uac00 \uc11c\ub85c \ub2e4\ub978 3\uba85 \uc774\uc0c1 \ubaa8\uc778 \uae00\uc740 \ubcf4\uc774\uc9c0 \uc54a\uac8c \ud55c\ub2e4(\uc790\ub3d9 \uc228\uae40). \uc2e0\uace0\ud55c \uae30\uae30 \uc2dd\ubcc4 \ucf54\ub4dc\ub3c4 14\uc77c \ub4a4 \uac19\uc774 \uc9c0\uc6b4\ub2e4.
var LR_HIDE_N = 3;
// \u2605 2026-10-10: AI \uac00 \ub9cc\ub4e0 "\uce58\ub9e5\u2026 \ud83c\udf57\u2026 \ud83e\udd24" \uc2dd \ub9d0\uc904\uc784\ud45c \uc870\uac01 \uae00\uc740 \ud654\uba74\uc5d0\uc11c \uac00\ub9b0\ub2e4(\ud589\uc740 \uc9c0\uc6b0\uc9c0 \uc54a\uc74c \u2014 2\uc77c \ub4a4 \uc790\ub3d9 \uc0ad\uc81c). \uc2e4\uc81c \uc774\uc6a9\uc790 \uae00(ipk\u2260'ai')\uc740 \ub300\uc0c1\uc774 \uc544\ub2c8\ub2e4.
var LR_HIDDEN_SQL = " AND id NOT IN (SELECT msg_id FROM line_reports GROUP BY msg_id HAVING COUNT(*) >= " + LR_HIDE_N + ") AND NOT (ipk = 'ai' AND (LENGTH(text) - LENGTH(REPLACE(text, '\u2026', ''))) >= 2)";
var LR_KINDS_OK = ["chat"];   // \u2605 2026-10-05 (YJ): \uc9c0\uc5f0\u00b7\ubd90\ubcbc\uc694 \uc81c\ubcf4 \ubc84\ud2bc \uc0ad\uc81c(\uc545\uc6a9 \uc6b0\ub824) \u2014 \uc11c\ubc84\ub3c4 \uc77c\ubc18 \ub300\ud654\ub9cc \ubc1b\ub294\ub2e4
// \u2605 2026-10-03 (\uc775\uba85 \uc815\ud655\ub3c4 \uae30\ub85d): \uc571\uc774 \uc608\uc0c1\ud55c '\ud0d1\uc2b9~\ud558\ucc28' \ubd84\uacfc \uc2e4\uc81c\ub85c \uac78\ub9b0 \ubd84\uc744 \ubaa9\uc801\uc9c0 \ub3c4\ucc29 \ub54c \ud55c \ubc88 \ubcf4\ub0b8\ub2e4.
//   \uc800\uc7a5\ud558\ub294 \uac83: \ub0a0\uc9dc(\uc77c \ub2e8\uc704), \uc608\uc0c1\ubd84, \uc2e4\uc81c\ubd84, \ud658\uc2b9 \ud69f\uc218, \ub178\uc120\uba85, \uc2dc\uac04\ub300(\uc2dc), \ud3c9\uc77c \uc5ec\ubd80, \uc218\ub2e8 \uad6c\ubd84, \uc571 \ubc84\uc804.
//   \uc800\uc7a5\ud558\uc9c0 \uc54a\ub294 \uac83: \uc5ed \uc774\ub984\u00b7\uc88c\ud45c\u00b7\uc0ac\uc6a9\uc790 \uc2dd\ubcc4\uac12\u00b7IP. IP \ub294 \uc2dc\uac04\ub2f9 \ud69f\uc218 \uc81c\ud55c\uc5d0\ub9cc \uc4f0\uace0 \uc81c\ud55c\ud45c\ub294 24\uc2dc\uac04 \ub4a4 \uc9c0\uc6b4\ub2e4. \uae30\ub85d\uc740 1\ub144 \ub4a4 \uc0ad\uc81c.
var RIDE_PER_IP_HR = 12;
var RIDE_KEEP_DAYS = 365;
var _rideReady = false;
async function ensureRideLog(env) {
  if (_rideReady) return;
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS ride_log (id INTEGER PRIMARY KEY AUTOINCREMENT, day INTEGER NOT NULL, pred REAL NOT NULL, act REAL NOT NULL, xf INTEGER NOT NULL, lines TEXT, hr INTEGER, wk INTEGER, mode TEXT, av TEXT)").run();
  _rideReady = true;
}
async function rideAllowed(req, env) {
  try {
    const ip = req.headers.get("CF-Connecting-IP") || "?";
    const hr = Math.floor(Date.now() / 36e5);
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS react_rl (k TEXT, hr INTEGER, n INTEGER, PRIMARY KEY (k, hr))").run();
    await env.DB.prepare("INSERT INTO react_rl (k,hr,n) VALUES (?1,?2,1) ON CONFLICT(k,hr) DO UPDATE SET n = n + 1").bind("rd:" + ip, hr).run();
    const r = await env.DB.prepare("SELECT n FROM react_rl WHERE k=?1 AND hr=?2").bind("rd:" + ip, hr).first();
    return ((r && r.n) || 1) <= RIDE_PER_IP_HR;
  } catch (e) { return false; }
}
function rideClean(b) {
  const num = (v) => (typeof v === "number" && isFinite(v)) ? v : NaN;
  const pred = num(b.pred), act = num(b.act), xf = num(b.xf), hr = num(b.hr), wk = num(b.wk);
  if (!(pred >= 3 && pred <= 300 && act >= 3 && act <= 300)) return null;
  const ratio = act / pred;
  if (ratio < 0.3 || ratio > 3) return null;
  if (!(xf >= 0 && xf <= 6) || !(hr >= 0 && hr <= 23) || !(wk === 0 || wk === 1)) return null;
  const lines = String(b.lines == null ? "" : b.lines);
  if (lines.length > 40 || !/^[0-9A-Za-z\uac00-\ud7a3,\u00b7\s\-]*$/.test(lines)) return null;
  const mode = ["sub", "bus", "mix"].indexOf(b.mode) >= 0 ? b.mode : "sub";
  const av = String(b.av || "").slice(0, 16).replace(/[^0-9A-Za-z._\-]/g, "");
  return { pred: Math.round(pred * 10) / 10, act: Math.round(act * 10) / 10, xf: Math.round(xf), hr: Math.round(hr), wk, lines, mode, av };
}
async function rideHandle(req, env, cors) {
  let body = {};
  try { body = await req.json(); } catch (e) {}
  const c = rideClean(body || {});
  if (!c) return new Response(JSON.stringify({ ok: false, error: "invalid" }), { status: 400, headers: cors });
  try {
    await ensureRideLog(env);
    if (!await rideAllowed(req, env)) return new Response(JSON.stringify({ ok: false, error: "rate limited" }), { status: 429, headers: cors });
    const day = Math.floor(Date.now() / 864e5);
    await env.DB.prepare("INSERT INTO ride_log (day, pred, act, xf, lines, hr, wk, mode, av) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)").bind(day, c.pred, c.act, c.xf, c.lines, c.hr, c.wk, c.mode, c.av).run();
    if (Math.random() < 0.02) {   // \uac00\ub054 \uc624\ub798\ub41c \uae30\ub85d\u00b7\uc81c\ud55c\ud45c \uc815\ub9ac(1\ub144 / 24\uc2dc\uac04)
      try {
        await env.DB.prepare("DELETE FROM ride_log WHERE day < ?1").bind(day - RIDE_KEEP_DAYS).run();
        await env.DB.prepare("DELETE FROM react_rl WHERE hr < ?1").bind(Math.floor(Date.now() / 36e5) - 24).run();
      } catch (e) {}
    }
    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: cors });
  }
}
var _lrReady = false;
// \u2605 2026-10-10 (YJ: \uac8c\uc2dc\ud310\u00b7\uc2e4\uc2dc\uac04\uc18c\ud1b5 \ub85c\ub529\uc774 \uae38\ub2e4): \ud45c\ub294 \uc774\ubbf8 \uc788\ub2e4. \uc608\uc804\uc5d4 \uaca9\ub9ac(isolate)\uac00 \uc0c8\ub85c \ub730 \ub54c\ub9c8\ub2e4
//   \ud45c \ub9cc\ub4e4\uae30 3\ubc88\uc744 \ucc28\ub840\ub85c \uae30\ub2e4\ub9b0 \ub4a4\uc5d0\uc57c \uc77d\uae30\ub97c \uc2dc\uc791\ud588\ub2e4(D1 \uc655\ubcf5 3\ubc88 = \uccab \uc694\uccad\uc774 \uadf8\ub9cc\ud07c \ub2a6\uc74c).
//   \uc774\uc81c \ud55c \ubc88\uc5d0 \ubb36\uc5b4(batch) \uc751\ub2f5\uacfc \ubcc4\uac1c\ub85c \ubcf4\ub0b4\uace0, \uc77d\uae30\ub294 \ubc14\ub85c \uc2dc\uc791\ud55c\ub2e4.
var _CTX = null;
var _cmtIdxDone = false;
var _MEM = Object.create(null);
function memGet(k, ttl) { var h = _MEM[k]; return h && Date.now() - h.at < ttl ? h.v : null; }
function memPut(k, v) { _MEM[k] = { at: Date.now(), v: v }; }
var _lrRetry = false;
async function ensureLineRoom(env, wait) {
  if (_lrReady) return;
  _lrReady = true;
  const stmts = [
    env.DB.prepare("CREATE TABLE IF NOT EXISTS line_msgs (id INTEGER PRIMARY KEY AUTOINCREMENT, line TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'chat', nick TEXT, text TEXT, stn TEXT, ipk TEXT, ts INTEGER NOT NULL)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_line_msgs ON line_msgs (line, ts)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS line_reports (msg_id INTEGER NOT NULL, ipk TEXT NOT NULL, ts INTEGER NOT NULL, PRIMARY KEY (msg_id, ipk))")
  ];
  const p = (typeof env.DB.batch === "function"
    ? env.DB.batch(stmts)
    : stmts.reduce(function (c, st) { return c.then(function () { return st.run(); }); }, Promise.resolve())
  ).catch(function () { _lrReady = false; });
  try { if (_CTX && !wait) { _CTX.waitUntil(p); return; } } catch (e) {}
  await p;
}
function lrLineOk(line) {
  return typeof line === "string" && line.length >= 1 && line.length <= 24 && /^[0-9A-Za-z\uac00-\ud7a3\s\-\u00b7()_]+$/.test(line);
}
async function lrIpHash(req) {
  try {
    const ip = req.headers.get("CF-Connecting-IP") || "?";
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("lr|" + ip));
    return Array.from(new Uint8Array(buf)).slice(0, 6).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch (e) { return "?"; }
}
async function lrAllowed(req, env) {
  try {
    const ip = req.headers.get("CF-Connecting-IP") || "?";
    const hr = Math.floor(Date.now() / 36e5);
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS react_rl (k TEXT, hr INTEGER, n INTEGER, PRIMARY KEY (k, hr))").run();
    await env.DB.prepare("INSERT INTO react_rl (k,hr,n) VALUES (?1,?2,1) ON CONFLICT(k,hr) DO UPDATE SET n = n + 1").bind("lr:" + ip, hr).run();
    const r = await env.DB.prepare("SELECT n FROM react_rl WHERE k=?1 AND hr=?2").bind("lr:" + ip, hr).first();
    return ((r && r.n) || 1) <= LR_PER_IP_HR;
  } catch (e) { return false; }
}
async function lrAlerts(env, lines) {
  const since = Date.now() - 30 * 60 * 1000;
  const out = {};
  for (const ln of lines) out[ln] = { reporters: 0, stations: [] };
  if (!lines.length) return out;
  const ph = lines.map(() => "?").join(",");
  const aP = env.DB.prepare("SELECT line, COUNT(DISTINCT ipk) AS n FROM line_msgs WHERE kind='delay' AND ts > ? AND ts <= ? AND line IN (" + ph + ")" + LR_HIDDEN_SQL + " GROUP BY line").bind(since, Date.now(), ...lines).all();
  const bP = env.DB.prepare("SELECT line, stn, COUNT(DISTINCT ipk) AS n, MAX(ts) AS last FROM line_msgs WHERE kind='delay' AND stn IS NOT NULL AND stn <> '' AND ts > ? AND ts <= ? AND line IN (" + ph + ")" + LR_HIDDEN_SQL + " GROUP BY line, stn ORDER BY n DESC, last DESC").bind(since, Date.now(), ...lines).all();
  const [a, b] = await Promise.all([aP, bP]);
  (a.results || []).forEach((r) => { if (out[r.line]) out[r.line].reporters = r.n; });
  (b.results || []).forEach((r) => { if (out[r.line] && out[r.line].stations.length < 5) out[r.line].stations.push({ stn: r.stn, n: r.n, last: r.last }); });
  return out;
}
var MAX_POSTS = 500;
var NICKS = [
  "\ud68c\uc2dd\uac70\uc808\ub9c8\uc2a4\ud130",
  "\uc9c0\ud558\ucca0\ub355\ud6c4",
  "\uc9c0\ud558\ucca0\ud3d0\uc778",
  "\ub300\ud559\uc6d0\ub178\uc608",
  "\ucd9c\uadfc\uc9c0\uc625\ub7ec",
  "\uc790\ucde8N\ub144\ucc28",
  "\uc0bc\uc131\uc5ed\ucd9c\ud1f4\uadfc",
  "\ud310\uad50\uc154\ud2c0\ubc84\uc2a4",
  "\uc5ec\uc758\ub3c4\uae08\uc735\ub9e8",
  "\uad6c\ub85c\uacf5\ub2e8\uc544\uc7ac",
  "\uc131\uc218\ub3d9\ud799\uc2a4\ud130",
  "\uce7c\ud1f4\uc694\uc815",
  "\uc6d4\uae09\ub8e8\ud321\uafc8\ub098\ubb34",
  "\ud658\uc2b9\uc758\ub2ec\uc778",
  "\uae09\ud589\ub9cc\ud0c0\ub294\uc0ac\ub78c",
  "\ub9c9\ucc28\uc758\uc804\uc124",
  "\uccab\ucc28\ud0c0\ub294\uc0ac\ub78c",
  "9\ud638\uc120\uc0dd\uc874\uc790",
  "\uc810\uc2ec\uba54\ub274\uace0\ubbfc\uc911",
  "\ud1f4\uc0ac\uac01\uc7ac\ub294\uc911",
  "\uc2e0\uc785\uc0ac\uc6d01\uc77c\ucc28",
  "\ubd80\uc7a5\ub2d8\ud53c\ud558\uae30\ub2ec\uc778",
  "\uc7ac\ud0dd\ud76c\ub9dd\uc790",
  "\uc57c\uadfc\uc218\ub2f9\ub7ec\ubc84",
  "\uc8fc\ub9d0\ucd9c\uadfc\uc2eb\uc5b4",
  "\ubd88\uae08\uae30\ub2e4\ub9bc",
  "\uce74\ud398\uc778\uc218\ud608\uc911",
  "\ub2e4\uc774\uc5b4\ud2b8\ub0b4\uc77c\ubd80\ud130",
  "\uc6b4\ub3d9\uac04\ub2e4\ub9d0\ub9cc",
  "\uc9d1\uc774\ucd5c\uace0\uc57c"
];
var LINES = [
  { name: "1\ud638\uc120", stns: ["\uc11c\uc6b8\uc5ed", "\uc2dc\uccad", "\uc885\uac01", "\uad6c\ub85c", "\ubd80\ud3c9", "\uc778\ucc9c"] },
  { name: "2\ud638\uc120", stns: ["\uac15\ub0a8", "\ud64d\ub300\uc785\uad6c", "\uc2e0\ucd0c", "\uc7a0\uc2e4", "\uc131\uc218", "\uc0ac\ub2f9", "\uac74\ub300\uc785\uad6c"] },
  { name: "3\ud638\uc120", stns: ["\uad50\ub300", "\uace0\uc18d\ud130\ubbf8\ub110", "\uc555\uad6c\uc815", "\uc5f0\uc2e0\ub0b4", "\uc591\uc7ac"] },
  { name: "4\ud638\uc120", stns: ["\uc0ac\ub2f9", "\uba85\ub3d9", "\ub3d9\ub300\ubb38", "\ud61c\ud654", "\uc11c\uc6b8\uc5ed"] },
  { name: "5\ud638\uc120", stns: ["\uc5ec\uc758\ub3c4", "\uad11\ud654\ubb38", "\ucc9c\ud638", "\uc655\uc2ed\ub9ac", "\uae40\ud3ec\uacf5\ud56d"] },
  { name: "7\ud638\uc120", stns: ["\uac00\uc0b0\ub514\uc9c0\ud138\ub2e8\uc9c0", "\uac74\ub300\uc785\uad6c", "\uc0c1\ubd09", "\uc628\uc218", "\ub17c\ud604"] },
  { name: "9\ud638\uc120", stns: ["\uae40\ud3ec\uacf5\ud56d", "\uc5ec\uc758\ub3c4", "\ub178\ub7c9\uc9c4", "\uc2e0\ub17c\ud604", "\uac00\uc591"] },
  { name: "\uc2e0\ubd84\ub2f9\uc120", stns: ["\uac15\ub0a8", "\ud310\uad50", "\uc815\uc790", "\uad11\uad50", "\uc591\uc7ac"] },
  { name: "\uacf5\ud56d\ucca0\ub3c4", stns: ["\uc11c\uc6b8\uc5ed", "\ud64d\ub300\uc785\uad6c", "\uae40\ud3ec\uacf5\ud56d", "\uac80\uc554", "\uacc4\uc591"] },
  { name: "\uc218\uc778\ubd84\ub2f9\uc120", stns: ["\uc655\uc2ed\ub9ac", "\uc11c\uc6b8\uc232", "\uc815\uc790", "\uc778\ud558\ub300", "\uc218\uc6d0"] },
  { name: "\uacbd\uc758\uc911\uc559\uc120", stns: ["\ud64d\ub300\uc785\uad6c", "\uacf5\ub355", "\uc655\uc2ed\ub9ac", "\uc6a9\uc0b0", "\uc77c\uc0b0"] },
  { name: "\uc778\ucc9c1\ud638\uc120", stns: ["\ubd80\ud3c9", "\uc778\ucc9c\uc2dc\uccad", "\uacc4\uc591", "\uc1a1\ub3c4"] },
  { name: "\uc778\ucc9c2\ud638\uc120", stns: ["\uac80\ub2e8\uc624\ub958", "\uc8fc\uc548", "\uc11d\ub0a8", "\uc778\ucc9c\uc2dc\uccad"] },
  { name: "\uae40\ud3ec\uace8\ub4dc\ub77c\uc778", stns: ["\uae40\ud3ec\uacf5\ud56d", "\uac78\ud3ec\ubd81\ubcc0", "\uad6c\ub798", "\ud48d\ubb34"] }
];
var CHAT_POSTS = [
  { t: "\ucd9c\uadfc\uae38\uc5d0 \uc774\uc5b4\ud3f0 \uc548 \ucc59\uae34 \ub0a0\uc758 \uacf5\ud5c8\ud568", b: "\uc624\ub298\ub530\ub77c \uc9c0\ud558\ucca0\uc774 \uc65c \uc774\ub807\uac8c \uae34\uc9c0\n\uadc0\uac00 \uc2ec\uc2ec\ud558\ub2c8\uae4c \ub0a8\uc758 \ud1b5\ud654 \uc18c\ub9ac\ub9cc \ub4e4\ub9bc\n\ub2e4\ub4e4 \uc774\uc5b4\ud3f0\uc740 \ubaa9\uc228\ucc98\ub7fc \ucc59\uae30\uc790" },
  { t: "\ud68c\uc0ac \ud0d5\ube44\uc2e4 \ucee4\ud53c \ub2e4 \ub5a8\uc5b4\uc84c\uc744 \ub54c \uc808\ub9dd\uac10 \uc54c\uc9c0", b: "\uc6d4\uc694\uc77c \uc544\uce68\uc5d0 \uc774\uac70 \uc5c6\uc73c\uba74 \uc9c4\uc9dc \ud798 \uc548 \ub0a8\n\ucd1d\ubb34\ub2d8 \uc5b8\uc81c \ucc44\uc6cc\uc8fc\uc2dc\ub098\uc694 \uac04\uc808\ud569\ub2c8\ub2e4" },
  { t: "\uc810\uc2ec \ubb50 \uba39\uc744\uc9c0 \uc815\ud558\ub294 \uac8c \ud68c\uc0ac \ucd5c\ub300 \ub09c\uc81c", b: "\ub9e4\uc77c \uc774 \uace0\ubbfc \ud558\ub294\ub370 \uc65c \uc548 \uc775\uc219\ud574\uc9c0\uc9c0\n\uc624\ub298\ub3c4 \uacb0\uad6d \uae40\uce58\ucc0c\uac1c \uac01\uc778\uac00" },
  { t: "\uc9c0\ud558\ucca0\uc5d0\uc11c \uc870\ub294\ub370 \ub531 \ub0b4\ub9b4 \uc5ed\uc5d0\uc11c \uae68\ub294 \ucd08\ub2a5\ub825", b: "\uc54c\ub78c\ub3c4 \uc548 \ub9de\ucdc4\ub294\ub370 \uc2e0\uae30\ud558\uac8c \ub208 \ub5a0\uc9d0\n\uadfc\ub370 \uac00\ub054 \ud55c \uc815\uac70\uc7a5 \uc9c0\ub098\uccd0\uc11c \uc2ac\ud514" },
  { t: "\ud1f4\uadfc\ud558\uace0 \uc9d1 \uc624\uba74 \uc544\ubb34\uac83\ub3c4 \ud558\uae30 \uc2eb\uc74c", b: "\ubd84\uba85 \ud558\uace0 \uc2f6\uc740 \uac70 \ub9ce\uc558\ub294\ub370\n\uc18c\ud30c\uc5d0 \uc549\ub294 \uc21c\uac04 \ub2e4 \ub9ac\uc14b\ub428\n\ub098\ub9cc \uc774\ub7f0 \uac70 \uc544\ub2c8\uc9c0?" },
  { t: "\ub2e4\uc774\uc5b4\ud2b8\ub294 \ud56d\uc0c1 \ub0b4\uc77c\ubd80\ud130\ub77c\ub294 \ub9c8\ubc95\uc758 \ub2e8\uc5b4", b: "\uc624\ub298 \uc800\ub141\ub3c4 \uce58\ud0a8 \uc2dc\ucf1c\ubc84\ub9bc\u314b\u314b\n\ub0b4\uc77c\uc758 \ub098\uc57c \ubbf8\uc548\ud574" },
  { t: "\uc8fc\ub9d0\uc5d0 \ub2a6\uc7a0 \uc790\uba74 \uc624\ud788\ub824 \ub354 \ud53c\uace4\ud55c \uc774\uc720\uac00 \ubb58\uae4c", b: "\ubd84\uba85 \ud479 \uc7a4\ub294\ub370 \ubab8\uc774 \ub354 \ubb34\uac70\uc6c0\n\uc801\ub2f9\ud788 \uc790\ub294 \uac8c \ub2f5\uc778\uac00\ubd04" },
  { t: "\ud3b8\uc758\uc810 \uc2e0\uc0c1 \ub098\uc624\uba74 \uc77c\ub2e8 \uc0ac\ubcf4\ub294 \ud3b8", b: "\uc774\ubc88\uc5d0 \ub098\uc628 \uadf8\uac70 \uba39\uc5b4\ubcf8 \uc0ac\ub78c?\n\ub9db\uc788\uc73c\uba74 \uc54c\ub824\uc918 \uc7ac\uad6c\ub9e4 \uac01 \ubcfc\uac8c" },
  { t: "\ud68c\uc758 \uc911\uc5d0 \ub534\uc0dd\uac01\ud558\ub2e4 \uac11\uc790\uae30 \uc774\ub984 \ubd88\ub9b4 \ub54c", b: '\uc2ec\uc7a5 \ucca0\ub801\ud558\ub294 \uac70 \ub098\ub9cc \uadf8\ub7f0\uac00\n"\uc5b4\ub5bb\uac8c \uc0dd\uac01\ud558\uc138\uc694?" \u2192 \uba38\ub9bf\uc18d \ubc31\uc9c0' },
  { t: "\uae08\uc694\uc77c \uc624\ud6c4\uc758 \uadf8 \uc124\ub808\ub294 \uae30\ubd84 \ubb54\uc9c0 \uc54c\uc9c0", b: "\uc77c\uc740 \uc190\uc5d0 \uc548 \uc7a1\ud788\uace0 \ub9c8\uc74c\uc740 \uc774\ubbf8 \uc8fc\ub9d0\n\uc774 \ub9db\uc5d0 \uc77c\uc8fc\uc77c \ubc84\ud300" },
  { t: "\ubc30\ub2ec \uc74c\uc2dd \uc2dc\ud0a4\uace0 \uae30\ub2e4\ub9ac\ub294 \uc2dc\uac04\uc774 \uc81c\uc77c \ud589\ubcf5\ud568", b: "\ub77c\uc774\ub354\ub2d8 \uc9c0\uae08 \uc5b4\ub514\ucbe4 \uc624\uc2dc\ub098 \uacc4\uc18d \ud655\uc778\n\ub3c4\ucc29 \uc54c\ub9bc \ub730 \ub54c \uc138\uc0c1 \ub2e4 \uac00\uc9c4 \uae30\ubd84" },
  { t: "\uc544\uce68\uc5d0 5\ubd84\ub9cc \ub354 \uc790\ub824\ub2e4 \uc9c0\uac01\ud560 \ubed4\ud55c \uc370", b: "\uadf8 5\ubd84\uc774 \uc0ac\ub78c \uc7a1\ub294\ub2e4 \uc9c4\uc9dc\n\uacb0\uad6d \ud0dd\uc2dc \ud0c0\uace0 \ucd9c\uadfc\ube44 \ub9cc\uc6d0 \uc21c\uc0ad" },
  { t: "\ub0c9\uc7a5\uace0\uc5d0 \ubb50 \uc788\ub294\uc9c0 \uae4c\uba39\uace0 \ub610 \uc0ac\uc624\ub294 \uc0ac\ub78c?", b: "\uc9d1\uc5d0 \uc624\ub2c8 \ub611\uac19\uc740 \uac8c \ub450 \uac1c\n\uacc4\ub780 \uc774\ub7ec\ub2e4 \uacc4\ub780\ud0d1 \uc313\uaca0\uc74c" },
  { t: "\ub178\ub798 \ud558\ub098 \uaf42\ud788\uba74 \uc77c\uc8fc\uc77c \ub0b4\ub0b4 \uadf8\uac83\ub9cc \ub4e3\ub294 \ud3b8", b: "\uc9c0\uae08 \uadf8 \ub178\ub798 \ubb34\ud55c\ubc18\ubcf5 \uc911\n\uc9c8\ub9b4 \ub54c\uae4c\uc9c0 \ub4e3\uace0 \uac08\uc544\ud0d0" },
  { t: "\ud1f4\uadfc\uae38\uc5d0 \ubd95\uc5b4\ube75 \uc0ac\uba74 \uadf8\ub0a0 \ud558\ub8e8 \uc131\uacf5", b: "\uc694\uc998 \uc138 \uac1c \uc774\ucc9c\uc6d0\uc774\ub358\ub370\n\ube44\uc2f8\ub3c4 \uaca8\uc6b8\uc5d4 \ubabb \ucc38\uc9c0" },
  { t: "\uc8fc\ub9d0\uc5d0 \uc9d1\uc5d0\ub9cc \uc788\uc5c8\ub294\ub370 \uc65c \uc774\ub807\uac8c \ud53c\uace4\ud558\uc9c0", b: "\ub098\uac00\uc9c0\ub3c4 \uc54a\uc558\ub294\ub370 \ubc29\uc804\ub428\n\uc9d1\ucf55\ub3c4 \uccb4\ub825 \uc18c\ubaa8\ub77c\ub294 \uac70 \uc778\uc815" },
  { t: "\ud68c\uc0ac \uadfc\ucc98 \ub9db\uc9d1 \ud558\ub098 \ubc1c\uacac\ud558\uba74 \uadf8\ub807\uac8c \ubfcc\ub4ef\ud568", b: "\uc810\uc2ec \uba54\ub274 \ud558\ub098 \ub298\uc5c8\ub2e4\ub294 \uc548\uc815\uac10\n\uadfc\ub370 \ub0a8\ud55c\ud14c \uc54c\ub824\uc8fc\uae34 \uc2eb\uc740 \uc774 \ub9c8\uc74c\u314b\u314b" },
  { t: "\ud0dd\ubc30 \uc624\ub294 \ub0a0\uc740 \uc544\uce68\ubd80\ud130 \uae30\ubd84\uc774 \uc88b\uc74c", b: "\ubb50 \uc2dc\ucf30\ub294\uc9c0 \uae30\uc5b5\ub3c4 \uc548 \ub098\ub294\ub370 \uc124\ub818\n\ubb38 \uc55e\uc5d0 \ubc15\uc2a4 \uc788\uc73c\uba74 \uadf8\ub0a0\uc740 \uc774\uae34 \ub0a0" },
  { t: "\uc5d8\ub9ac\ubca0\uc774\ud130\uc5d0\uc11c \uc544\ub294 \uc0ac\ub78c \ub9cc\ub098\uba74 \uc5b4\uc0c9\ud55c \uc815\uc801", b: "\uc778\uc0ac\ub294 \ud588\ub294\ub370 \uadf8 \ub2e4\uc74c\uc774 \ubb38\uc81c\n\uce35\uc218\ub9cc \ub6ab\uc5b4\uc838\ub77c \uccd0\ub2e4\ubcf4\ub294 \uc911" },
  { t: "\ubbf9\uc2a4\ucee4\ud53c\uac00 \uc81c\uc77c \ub9db\uc788\ub2e4\ub294 \uac70 \uc778\uc815\ud558\ub294 \uc0ac\ub78c?", b: "\ube44\uc2fc \uc6d0\ub450\ucee4\ud53c\ubcf4\ub2e4 \uc774\uac8c \ub354 \uc88b\uc744 \ub54c\uac00 \uc788\uc74c\n\ud2b9\ud788 \ub098\ub978\ud55c \uc624\ud6c4\uc5d4 \ubb34\uc870\uac74 \ubbf9\uc2a4\uc9c0" },
  { t: "\uc790\uae30 \uc804\uc5d0 \ud3f0 \ubcf4\ub2e4\uac00 \uc2dc\uac04 \uc21c\uc0ad\ub418\ub294 \ub9c8\ubc95", b: "10\ubd84\ub9cc \ubd10\uc57c\uc9c0 \ud588\ub294\ub370 \ub450 \uc2dc\uac04\n\ub0b4\uc77c \ub610 \ud53c\uace4\ud558\uaca0\ub124 \uc54c\uba74\uc11c\ub3c4 \ubabb \ub04a\uc74c" },
  { t: "\ube44 \uc624\ub294 \ub0a0 \ubd80\uce68\uac1c \uc0dd\uac01\ub098\ub294 \uac74 \uad6d\ub8f0\uc778\uac00", b: "\ucc3d\ubc16\uc5d0 \ube44 \uc624\ub2c8\uae4c \uac11\uc790\uae30 \ub2f9\uae40\n\uc624\ub298 \uc800\ub141\uc740 \uc774\uac78\ub85c \uc815\ud588\ub2e4" },
  { t: "\ucd9c\uadfc \uccab \ucee4\ud53c \ud55c \ubaa8\uae08\uc758 \uadf8 \uac01\uc131 \ud6a8\uacfc", b: "\uc774\uac70 \uc5c6\uc73c\uba74 \uc624\uc804 \uc5c5\ubb34 \ubd88\uac00\ub2a5\n\uce74\ud398\uc778\uc740 \uc9c1\uc7a5\uc778\uc758 \uc5f0\ub8cc\uac00 \ub9de\ub2e4" },
  { t: "\uc8fc\ub9d0\uc5d0 \ubb50 \ud588\ub0d0 \ubb3c\uc73c\uba74 \ub531\ud788 \ud560 \ub9d0 \uc5c6\ub294 \uc0ac\ub78c", b: "\ubd84\uba85 \ubc14\ube74\ub294\ub370 \ubb50 \ud588\ub294\uc9c0 \uc124\uba85\uc774 \uc548 \ub428\n\uadf8\ub0e5 \uc26c\uc5c8\uc5b4\uc694\ub85c \ud241\uce58\ub294 \uc911" },
  { t: "\ud1f4\uadfc \ud6c4 \uc6b4\ub3d9 \uac00\ub824\ub2e4 \uacb0\uad6d \uc9d1\uc73c\ub85c \uc9c1\ud589", b: "\ud5ec\uc2a4\uc7a5 \ub4f1\ub85d\ub9cc \ud558\uace0 \uc720\ub839\ud68c\uc6d0 \ub428\n\uc758\uc9c0\uac00 \uc57d\ud55c \uac8c \uc544\ub2c8\ub77c \ubab8\uc774 \ubb34\uac70\uc6b4 \uac70\uc57c" }
];
var POOLS = {
  // \uc0c8\ubcbd 0~5\uc2dc: \ub4dc\ubb3e, \uac10\uc131/\uc57c\uadfc/\uccab\ucc28
  dawn: [
    { t: "\uc0c8\ubcbd {stn}\uc5ed \uadfc\ucc98\uc778\ub370 \uc138\uc0c1\uc774 \ub108\ubb34 \uc870\uc6a9\ud558\ub2e4", b: "\uc57c\uadfc \ub05d\ub098\uace0 \uac78\uc5b4\uac00\ub294 \uc911\n\ub0ae\uc5d0 \uadf8\ub807\uac8c \ubd90\ube44\ub358 \uac70\ub9ac\uac00 \ud145 \ube44\uc5b4\uc788\uc73c\ub2c8\uae4c \uae30\ubd84\uc774 \uc774\uc0c1\ud558\ub124\n\ub2e4\ub4e4 \uc5b4\ub514\uc120\uac00 \uc790\uace0 \uc788\uaca0\uc9c0", cat: "\uc77c\uc0c1" },
    { t: "\uccab\ucc28 \uae30\ub2e4\ub9ac\ub294 \uc0ac\ub78c \uc788\uc74c?", b: "{line} \uccab\ucc28 \uae30\ub2e4\ub9ac\ub294 \uc911\uc778\ub370 \ud50c\ub7ab\ud3fc\uc5d0 \ub098 \ud3ec\ud568 \uc138 \uba85 \uc788\uc74c\n\ub2e4\ub4e4 \ubb34\uc2a8 \uc0ac\uc5f0\uc73c\ub85c \uc774 \uc2dc\uac04\uc5d0 \ub098\uc640\uc788\ub294 \uac78\uae4c\n\uad1c\ud788 \ub3d9\uc9c0\uc560 \ub290\uaef4\uc9c4\ub2e4", cat: "\uc77c\uc0c1" },
    { t: "\uc57c\uadfc \ub05d. \ud0dd\uc2dc\ube44\uac00 \uc544\uae4c\uc6cc\uc11c \uccab\ucc28 \uae30\ub2e4\ub9bc", b: "\uc0c8\ubcbd\uae4c\uc9c0 \uc77c\ud55c \uac83\ub3c4 \uc11c\ub7ec\uc6b4\ub370 \ud0dd\uc2dc\ube44 3\ub9cc\uc6d0\uc740 \ub3c4\uc800\ud788 \ubabb \uc4f0\uaca0\uc5b4\uc11c\n{stn}\uc5ed \uc55e \ud3b8\uc758\uc810\uc5d0\uc11c \ucef5\ub77c\uba74 \uba39\uc73c\uba74\uc11c \ubc84\ud2f0\ub294 \uc911\n\uc774\uac8c \uc0ac\ub294 \uac74\uac00 \uc2f6\ub2e4\uac00\ub3c4 \ub77c\uba74\uc740 \ub9db\uc788\ub124", cat: "\uc77c\uc0c1" },
    { t: "\uc0c8\ubcbd \uc9c0\ud558\ucca0\uc740 \uc65c \uc774\ub807\uac8c \uac10\uc131\uc801\uc774\ub0d0", b: "\ucc3d\ubc16\uc5d0 \uc5b4\ub460\ubfd0\uc778\ub370 \uad1c\ud788 \ub178\ub798 \ub4e4\uc73c\uba74\uc11c \uc13c\uce58\ud574\uc9d0\n\ub0ae\uc5d0 \ubabb \ud558\ub358 \uc0dd\uac01\ub4e4\uc774 \ub2e4 \ubab0\ub824\uc628\ub2e4\n\ub0b4\uc77c\uc758 \ub098\uc57c \ubbf8\uc548\ud574 \uc624\ub298\ub3c4 \ub2a6\uac8c \uc794\ub2e4", cat: "\uc77c\uc0c1" },
    { t: "\uc774 \uc2dc\uac04\uc5d0 \uae68\uc5b4\uc788\ub294 \uc0ac\ub78c \ub098\ubfd0\uc778\uac00", b: "\uc7a0\uc774 \uc548 \uc640\uc11c \uadf8\ub0e5 \ud3f0\ub9cc \ubcf4\ub294 \uc911\n\uccab\ucc28 \ub728\uba74 \uadf8\ub0a0 \uc5b4\ub514\ub77c\ub3c4 \uac14\ub2e4\uc62c\uae4c \uc2f6\uae30\ub3c4 \ud558\uace0\n\ub2e4\ub4e4 \uc798 \uc790\uc694", cat: "\uc77c\uc0c1" },
    { t: "\uc0c8\ubcbd \uadfc\ubb34 \ub05d\ub098\uace0 \uc9d1 \uac00\ub294 \uae38", b: "\ub0a8\ub4e4 \ucd9c\uadfc\ud560 \ub54c \ud1f4\uadfc\ud558\ub294 \uc0b6 \ubc8c\uc368 \uba87 \ub144\uc9f8\uc778\uc9c0\n\uadf8\ub798\ub3c4 \ud145 \ube48 {line} \uc549\uc544\uc11c \uac00\ub294 \ub9db\uc5d0 \ubc84\ud2f4\ub2e4\n\uad50\ub300 \uadfc\ubb34\uc790\ub4e4 \ub2e4\ub4e4 \ud798\ub0b4\uc694", cat: "\uc77c\uc0c1" }
  ],
  // \ud3c9\uc77c \ucd9c\uadfc\uae38 6~9\uc2dc
  mornRushWd: [
    { t: "{line} \uc624\ub298\ub530\ub77c \uc65c \uc774\ub807\uac8c \uc0ac\ub78c \ub9ce\ub0d0", b: "\ud3c9\uc18c\ubcf4\ub2e4 \ud55c \ub300 \ub2a6\uac8c \ud0d4\ub354\ub2c8 \uc9c0\uc625\uc774\ub2e4\n{stn}\uc5d0\uc11c \uaca8\uc6b0 \ud0d4\ub294\ub370 \ubb38\uc5d0 \ub080 \uc904 \uc54c\uc558\uc74c\n\ub0b4\uc77c\ubd80\ud130 10\ubd84 \uc77c\ucc0d \ub098\uc628\ub2e4 \uc9c4\uc9dc", cat: "\uc77c\uc0c1" },
    { t: "{stn}\uc5ed\uc5d0\uc11c \ub6f0\ub294 \uc0ac\ub78c\ub4e4 \ubcf4\uba74 \ub098\ub3c4 \ubaa8\ub974\uac8c \uac19\uc774 \ub700", b: "\ubd84\uba85 \ub2e4\uc74c \uc5f4\ucc28 \uae08\ubc29 \uc624\ub294\ub370\n\uc55e\uc0ac\ub78c\uc774 \ub6f0\ub2c8\uae4c \ub098\ub3c4 \ubc18\uc0ac\uc801\uc73c\ub85c \ub6f0\uace0 \uc788\uc74c \u314b\u314b\n\ucd9c\uadfc\uae38 \ub2e8\uccb4 \ub2ec\ub9ac\uae30 \ubb34\uc5c7", cat: "\uc77c\uc0c1" },
    { t: "\ucd9c\uadfc\uae38 \uc9c0\ud558\ucca0\uc5d0\uc11c \uc790\ub9ac \ub098\uba74 \uadf8\ub0a0 \uc6b4\uc138 \uc88b\uc740 \uac70\uc784", b: "{stn}\uc5d0\uc11c \uc549\uc558\ub2e4\n\uc624\ub298 \ubb54\uac00 \uc798 \ud480\ub9b4 \uac83 \uac19\uc740 \uc608\uac10\n\ub2e4\ub4e4 \uc624\ub298 \ud558\ub8e8 \ud654\uc774\ud305", cat: "\uc77c\uc0c1" },
    { t: "\ud658\uc2b9 \uad6c\uac04\uc5d0\uc11c \uae38 \ub9c9\ub294 \uc0ac\ub78c\ub4e4 \uc9c4\uc9dc \ubb50\ub0d0", b: "{stn} \ud658\uc2b9\ud1b5\ub85c \ud55c\uac00\uc6b4\ub370\uc11c \ud3f0 \ubcf4\uba74\uc11c \ucc9c\ucc9c\ud788 \uac77\ub294 \uc0ac\ub78c\ub4e4\n\ub4a4\uc5d0 \uc218\ubc31 \uba85\uc774 \ubc00\ub824\uc624\ub294 \uac8c \uc548 \ubcf4\uc774\ub098\n\uc81c\ubc1c \ud55c\ucabd\uc73c\ub85c \ube44\ucf1c\uc11c \ubd10\uc694", cat: "\uc77c\uc0c1" },
    { t: "\uae09\ud589 \ud0c8\uae4c \uc644\ud589 \ud0c8\uae4c \ub9e4\uc77c \uace0\ubbfc\ud568", b: "\uae09\ud589\uc740 \ube60\ub978\ub370 \uc0ac\ub78c\uc774 \ubbf8\uc5b4\ud130\uc9c0\uace0\n\uc644\ud589\uc740 \uc549\uc544\uac08 \uc218 \uc788\ub294\ub370 15\ubd84 \ub354 \uac78\ub9ac\uace0\n\ub2e4\ub4e4 \ubb50 \ud0c0\uace0 \ub2e4\ub2d8?", cat: "\uc9c8\ubb38" },
    { t: "\uc624\ub298 {line} \uc9c0\uc5f0 \uc788\uc5c8\uc74c?", b: "{stn}\uc5d0\uc11c 5\ubd84 \ub118\uac8c \uc548 \uc640\uc11c \uc9c0\uac01 \uc9c1\uc804\uae4c\uc9c0 \uac10\n\uc571\uc5d0\ub294 \uc815\uc0c1\uc6b4\ud589\uc774\ub77c\ub294\ub370 \uccb4\uac10\uc740 \uc544\ub2c8\uc5c8\uc74c\n\ub098\ub9cc \uadf8\ub7ac\ub098", cat: "\uc9c8\ubb38" },
    { t: "\ucd9c\uadfc\uae38\uc5d0 \ucee4\ud53c \ubabb \uc0ac\uba74 \ud558\ub8e8\uac00 \uc548 \uc2dc\uc791\ub428", b: "{stn}\uc5ed \uc55e \uce74\ud398 \uc904\uc774 \ub108\ubb34 \uae38\uc5b4\uc11c \uadf8\ub0e5 \uc654\ub294\ub370\n\uc9c0\uae08 \uba38\ub9ac\uac00 \uc548 \ub3cc\uc544\uac10\n\ud68c\uc0ac \ucee4\ud53c\uba38\uc2e0\uc740 \uc65c \ub9db\uc774 \uc5c6\uc744\uae4c", cat: "\uc77c\uc0c1" },
    { t: "\ub9cc\uc6d0 \uc9c0\ud558\ucca0\uc5d0\uc11c \ubc31\ud329 \uc55e\uc73c\ub85c \uba54\ub294 \uac70 \uad6d\ub8f0 \uc544\ub2c8\ub0d0", b: "\ub4a4\uc5d0 \ubc31\ud329 \uadf8\ub300\ub85c \uba54\uace0 \ud0c0\ub294 \uc0ac\ub78c \ub54c\ubb38\uc5d0 \uacc4\uc18d \ucc0d\ud798\n\ubcf8\uc778\uc740 \ubaa8\ub974\uaca0\uc9c0\ub9cc \ub4a4\ub294 \uc9c0\uc625\uc784\n\ub2e4\ub4e4 \uc55e\uc73c\ub85c \uba65\uc2dc\ub2e4", cat: "\uc77c\uc0c1" }
  ],
  // \uc8fc\ub9d0 \uc544\uce68
  mornWe: [
    { t: "\uc8fc\ub9d0 \uc544\uce68 \uc9c0\ud558\ucca0 \uc774 \uc5ec\uc720 \ubb50\ub0d0", b: "\ud3c9\uc77c\uc5d4 \uc804\uc7c1\ud130\uc778 {line}\uc774 \ud145\ud145 \ube44\uc5c8\uc74c\n\uc549\uc544\uc11c \ucc3d\ubc16 \ubcf4\uba74\uc11c \uac00\ub2c8\uae4c \uc5ec\ud589 \uac00\ub294 \uae30\ubd84\n\uc8fc\ub9d0 \uc544\uce68 \uc77c\ucc0d \ub098\uc628 \ubcf4\ub78c \uc788\ub2e4", cat: "\uc77c\uc0c1" },
    { t: "\ud1a0\uc694\uc77c \uc544\uce68\ubd80\ud130 \uc5b4\ub514 \uac00\ub294 \uc0ac\ub78c\ub4e4 \ub9ce\ub124", b: "{stn}\uc5ed\uc778\ub370 \ub4f1\uc0b0\ubcf5 \ubd80\ub300\uac00 \uc794\ub729\uc774\ub2e4\n\ub2e4\ub4e4 \ubd80\uc9c0\ub7f0\ud558\uc2dc\ub124 \ub098\ub294 \ub180\ub7ec \uac00\ub294 \uac74\ub370\n\uc8fc\ub9d0\uc740 \uc5ed\uc2dc \uc544\uce68\ubd80\ud130 \uc6c0\uc9c1\uc5ec\uc57c \uae40", cat: "\uc77c\uc0c1" },
    { t: "\uc8fc\ub9d0 \ucd9c\uadfc\ud558\ub294 \uc0ac\ub78c \uc5ec\uae30 \ubd99\uc5b4\ub77c", b: "{line} \ud0c0\uace0 \ud68c\uc0ac \uac00\ub294 \uc911\n\ub180\ub7ec \uac00\ub294 \uc0ac\ub78c\ub4e4 \uc0ac\uc774\uc5d0\uc11c \ub098\ub9cc \ub178\ud2b8\ubd81 \uac00\ubc29\n\uc218\ub2f9\uc774\ub77c\ub3c4 \ub450\ub451\ud558\uba74 \uc88b\uaca0\ub2e4", cat: "\uc77c\uc0c1" },
    { t: "\uc544\uce68 \uc77c\ucc0d {stn} \uc654\ub294\ub370 \ubc8c\uc368 \uc0ac\ub78c \ub9ce\uc74c", b: "\ub9db\uc9d1 \uc624\ud508\ub7f0 \ud558\ub824\uace0 \uc654\ub294\ub370 \uc774\ubbf8 \uc904 \uc11c \uc788\uc74c \u3137\u3137\n\ub2e4\ub4e4 \uc815\ubcf4\ub825\uc774 \ub300\ub2e8\ud558\ub2e4\n\uc8fc\ub9d0\uc5d4 \ubd80\uc9c0\ub7f0\ud55c \uc790\uac00 \ub2e4 \uba39\ub294\uad6c\ub098", cat: "\uc77c\uc0c1" }
  ],
  // \ud3c9\uc77c \uc624\uc804 9~11\uc2dc
  forenoonWd: [
    { t: "\uc624\uc804 \ud68c\uc758 3\uac1c \uc5f0\uc18d\uc778 \uc0ac\ub78c \uc788\uc74c?", b: "\ucd9c\uadfc\ud558\uc790\ub9c8\uc790 \ud68c\uc758\uc2e4 \uc21c\ud68c \uc911\n\ub0b4 \uc77c\uc740 \ub300\uccb4 \uc5b8\uc81c \ud558\ub77c\ub294 \uac74\uc9c0\n\ud68c\uc758\ub97c \uc704\ud55c \ud68c\uc758\ub294 \uc774\uc81c \uadf8\ub9cc", cat: "\uc77c\uc0c1" },
    { t: "\ucd9c\uadfc\ud558\uace0 \ub450 \uc2dc\uac04 \uc9c0\ub0ac\ub294\ub370 \ubc8c\uc368 \ud1f4\uadfc \ub9c8\ub824\uc6c0", b: "\ubaa8\ub2c8\ud130 \ubcf4\ub294\ub370 \ub208\uc5d0 \ud558\ub098\ub3c4 \uc548 \ub4e4\uc5b4\uc634\n\uc810\uc2ec\uc2dc\uac04\ub9cc \uae30\ub2e4\ub9ac\ub294 \uc911\n\ub2e4\ub4e4 \uc624\uc804 \uc5b4\ub5bb\uac8c \ubc84\ud300?", cat: "\uc77c\uc0c1" },
    { t: "\uc624\uc804\uc5d0 \ud0c0\ub294 \uc9c0\ud558\ucca0\uc740 \ud3c9\ud654\ub86d\ub124", b: "\ub2a6\uc740 \ucd9c\uadfc\uc774\ub77c {line} \ud0d4\ub294\ub370 \uc790\ub9ac \ub110\ub110\n\ub7ec\uc2dc\uc544\uc6cc \ud53c\ud558\ub2c8\uae4c \uc0b6\uc758 \uc9c8\uc774 \ub2e4\ub974\ub2e4\n\uc2dc\ucc28\ucd9c\ud1f4\uadfc\uc81c \uc804\uad6d \ud655\ub300 \uae30\uc6d0", cat: "\uc77c\uc0c1" },
    { t: "\uc7ac\ud0dd \ud558\ub2e4\uac00 \uc624\ub79c\ub9cc\uc5d0 \uc0ac\ubb34\uc2e4 \ub098\uc654\ub354\ub2c8 \uc801\uc751 \uc548 \ub428", b: "\uc9c0\ud558\ucca0 \ud0c0\ub294 \uac83\ubd80\ud130\uac00 \ub178\ub3d9\uc774\uc5c8\ub2e4\ub294 \uac78 \uc78a\uace0 \uc788\uc5c8\uc74c\n{stn}\uc5ed \uc778\ud30c \ub6ab\uace0 \uc624\ub2c8\uae4c \uc774\ubbf8 \uc9c0\uce68\n\uc7ac\ud0dd\uc774 \uadf8\ub9bd\ub2e4", cat: "\uc77c\uc0c1" }
  ],
  // \uc8fc\ub9d0 \uc624\uc804
  forenoonWe: [
    { t: "\uc8fc\ub9d0 \uc624\uc804 \uce74\ud398\uc5d0\uc11c \uc5ec\uc720 \ubd80\ub9ac\ub294 \uc911", b: "{stn}\uc5ed \uadfc\ucc98 \uce74\ud398 \ucc3d\uac00 \uc790\ub9ac \uc7a1\uc74c\n\ube0c\ub7f0\uce58\uc5d0 \ucee4\ud53c\uc5d0 \uc774\uac8c \uc0ac\ub294 \uac70\uc9c0\n\ud3c9\uc77c\uc758 \ub098\uc5d0\uac8c \uc8fc\ub294 \ubcf4\uc0c1", cat: "\uc77c\uc0c1" },
    { t: "\uc624\ub298 \ub098\ub4e4\uc774 \uac00\uae30 \uc88b\uc740 \ub0a0\uc528\ub124", b: "{line} \ud0c0\uace0 \uad50\uc678\ub85c \ub098\uac00\ub294 \uc911\n\uc8fc\ub9d0\uc5d4 \uc5ed\uc2dc \uc5b4\ub514\ub4e0 \ub098\uac00\uc57c \ud568\n\uc9d1\uc5d0\ub9cc \uc788\uc73c\uba74 \uc8fc\ub9d0\uc774 \uc21c\uc0ad\ub428", cat: "\uc77c\uc0c1" },
    { t: "\uc8fc\ub9d0 \ub2a6\uc7a0 \uc790\ub2e4\uac00 \ud558\ub8e8 \ub2e4 \uac10", b: "\uc77c\uc5b4\ub098\ub2c8\uae4c 11\uc2dc\n\ubb50\ub77c\ub3c4 \ud574\uc57c \ud560 \uac83 \uac19\uc544\uc11c \uc77c\ub2e8 \ub098\uc634\n{stn} \uadfc\ucc98 \uac08\ub9cc\ud55c \ub370 \ucd94\ucc9c \uc880", cat: "\uc9c8\ubb38" }
  ],
  // \uc810\uc2ec 11~14\uc2dc
  lunch: [
    { t: "\uc810\uc2ec \uba54\ub274 \uc815\ud558\ub294 \uac8c \uc81c\uc77c \uc5b4\ub824\uc6b4 \uc77c\uc784", b: "\ud68c\uc0ac \uadfc\ucc98 \uc2dd\ub2f9 \ub2e4 \uc9c8\ub838\uc74c\n\uc624\ub298\ub3c4 \uacb0\uad6d \uad6d\ubc25 \uc544\ub2c8\uba74 \uae40\uce58\ucc0c\uac1c\uaca0\uc9c0\n\ub2e4\ub4e4 \uc624\ub298 \ubb50 \uba39\uc74c?", cat: "\uc9c8\ubb38" },
    { t: "{stn}\uc5ed \uadfc\ucc98 \uc9c1\uc7a5\uc778 \uc810\uc2ec \uc6e8\uc774\ud305 \uc2e4\ud654\ub0d0", b: "12\uc2dc \ub561 \uce58\uc790\ub9c8\uc790 \ub098\uc654\ub294\ub370 \uc774\ubbf8 \uc904\uc774 \uac74\ubb3c \ubc16\uae4c\uc9c0\n\uc810\uc2ec\uc2dc\uac04 1\uc2dc\uac04\uc73c\ub85c\ub294 \ubd80\uc871\ud558\ub2e4\n1\uc2dc\uac04 \ubc18\uc73c\ub85c \ub298\ub824\uc8fc\uba74 \uc548 \ub418\ub098", cat: "\uc77c\uc0c1" },
    { t: "\uc810\uc2ec \ud63c\ubc25 \ud558\ub294 \uc0ac\ub78c \ub9ce\uc544\uc9c4 \ub4ef", b: "\uc624\ub298 \ud63c\uc790 \uba39\uc73c\ub7ec \uac14\ub294\ub370 1\uc778\uc11d\uc774 \uaf49 \ucc38\n\ud63c\ubc25\uc774 \ud3b8\ud560 \ub54c\uac00 \uc788\uc74c \ub208\uce58 \uc548 \ubcf4\uace0\n\ub2e4\ub4e4 \ud63c\ubc25 \uc5b4\ub514\uae4c\uc9c0 \uac00\ub2a5\ud568?", cat: "\uc77c\uc0c1" },
    { t: "\uc810\uc2ec \uba39\uace0 \uc0b0\ucc45\ud558\ub294 \uac8c \ud558\ub8e8 \uc720\uc77c\ud55c \ub099", b: "{stn} \uadfc\ucc98 \ud55c \ubc14\ud034 \ub3cc\uace0 \ucee4\ud53c \uc0ac\uc11c \ub4e4\uc5b4\uac00\ub294 \ucf54\uc2a4\n\uc774 20\ubd84\uc774 \uc624\ud6c4\ub97c \ubc84\ud2f0\uac8c \ud574\uc90c\n\uc2dd\ud6c4 \uc0b0\ucc45 \ud558\ub294 \uc0ac\ub78c \uac1c\ucd94", cat: "\uc77c\uc0c1" },
    { t: "\uad6c\ub0b4\uc2dd\ub2f9 vs \ub098\uac00\uc11c \uc0ac\uba39\uae30", b: "\uad6c\ub0b4\uc2dd\ub2f9\uc740 \uc2f8\uace0 \ube60\ub978\ub370 \ub9db\uc774 \uc544\uc27d\uace0\n\ub098\uac00\uba74 \ub9db\uc788\ub294\ub370 \uc2dc\uac04\uacfc \ub3c8\uc774\u2026\n\uc601\uc6d0\ud55c \ub51c\ub808\ub9c8\ub2e4", cat: "\uc9c8\ubb38" }
  ],
  // \ud3c9\uc77c \uc624\ud6c4 14~17\uc2dc
  afternoonWd: [
    { t: "\uc624\ud6c4 3\uc2dc \uc878\uc74c\uc740 \uacfc\ud559\uc774\ub2e4", b: "\uc810\uc2ec \uba39\uace0 \ub098\uba74 \uc5b4\uae40\uc5c6\uc774 \ub208\uc774 \uac10\uae40\n\ucee4\ud53c\ub97c \ub9c8\uc154\ub3c4 \uc18c\uc6a9\uc5c6\uc74c\n\ub0ae\uc7a0 \uc81c\ub3c4 \ub3c4\uc785\uc774 \uc2dc\uae09\ud569\ub2c8\ub2e4", cat: "\uc77c\uc0c1" },
    { t: "\uac11\uc790\uae30 \uc7a1\ud78c \uc624\ud6c4 \ud68c\uc758 \ub54c\ubb38\uc5d0 \uacc4\ud68d \ub2e4 \ud2c0\uc5b4\uc9d0", b: "\uc624\ub298 \uc77c\ucc0d \ub05d\ub0b4\uace0 \uce7c\ud1f4\ud558\ub824 \ud588\ub294\ub370\n4\uc2dc \ud68c\uc758\ub77c\ub2c8 \uc774\uac8c \ubb34\uc2a8 \uc18c\ub9ac\uc57c\n\uce7c\ud1f4\ub294 \ub2e4\uc74c \uc0dd\uc5d0", cat: "\uc77c\uc0c1" },
    { t: "\uc624\ud6c4\uc5d0 \uc9c0\ud558\ucca0 \ud0c0\uba74 \uc138\uc0c1 \ud55c\uac00\ud558\ub2e4", b: "\uc678\uadfc \ub098\uc640\uc11c {line} \ud0d4\ub294\ub370 \uc790\ub9ac\uac00 \ud145\ud145\n\uc774 \uc2dc\uac04\ub300\ub9cc \ub2e4\ub2c8\uba74 \uc9c0\ud558\ucca0 \ud0c8\ub9cc \ud55c\ub370\n\ub7ec\uc2dc\uc544\uc6cc\uac00 \ubb38\uc81c\uc57c", cat: "\uc77c\uc0c1" },
    { t: "\ud1f4\uadfc\uae4c\uc9c0 \ub450 \uc2dc\uac04, \ubc8c\uc368 \uac00\ubc29 \uc30c\uc74c", b: "\ub9c8\uc74c\uc740 \uc774\ubbf8 \uc9d1\uc5d0 \uac00 \uc788\uc74c\n\uc77c\uc740 \uc190\uc5d0 \uc548 \uc7a1\ud788\uace0 \uc2dc\uacc4\ub9cc \ubcf4\ub294 \uc911\n\ub2e4\ub4e4 \ub9c8\uc9c0\ub9c9 \ub450 \uc2dc\uac04 \uc5b4\ub5bb\uac8c \ubc84\ud300?", cat: "\uc77c\uc0c1" }
  ],
  // \uc8fc\ub9d0 \uc624\ud6c4
  afternoonWe: [
    { t: "\uc8fc\ub9d0 \uc624\ud6c4 {stn} \uc0ac\ub78c \uc9c4\uc9dc \ub9ce\ub2e4", b: "\uc57d\uc18d \uc788\uc5b4\uc11c \ub098\uc654\ub294\ub370 \ubc1c \ub514\ub51c \ud2c0\uc774 \uc5c6\uc74c\n\ub2e4\ub4e4 \uc57d\uc18d\uc774 \uc5ec\uae30\uc600\ub0d0\n\uadf8\ub798\ub3c4 \uc624\ub79c\ub9cc\uc5d0 \ub098\uc624\ub2c8\uae4c \uc88b\uae34 \ud558\ub2e4", cat: "\uc77c\uc0c1" },
    { t: "\uc8fc\ub9d0\uc5d0 \uc804\uc2dc \ubcf4\ub7ec \ub2e4\ub2c8\ub294 \uc0ac\ub78c \uc788\uc74c?", b: "\uc624\ub298 {stn} \uadfc\ucc98 \uc804\uc2dc \uac14\ub2e4 \uc654\ub294\ub370 \uc0dd\uac01\ubcf4\ub2e4 \uc88b\uc558\uc74c\n\uc8fc\ub9d0\uc5d0 \uc774\ub7f0 \ubb38\ud654\uc0dd\ud65c \ud558\ub098\uc529 \ud558\uba74 \ud55c \uc8fc\uac00 \ub9ac\uc14b\ub418\ub294 \ub290\ub08c\n\ucd94\ucc9c\ud560\ub9cc\ud55c \uc804\uc2dc \uc788\uc73c\uba74 \uacf5\uc720 \uc880", cat: "\uc9c8\ubb38" },
    { t: "\uc77c\uc694\uc77c \uc624\ud6c4\ub9cc \ub418\uba74 \ub9c8\uc74c\uc774 \uc2f1\uc22d\uc0dd\uc22d", b: "\uc544\uc9c1 \ubc18\ub098\uc808 \ub0a8\uc558\ub294\ub370 \ubc8c\uc368 \uc6d4\uc694\uc77c \uac71\uc815 \uc911\n\uc774 \uc2dc\uac04\uc744 \uc990\uae30\uc9c0 \ubabb\ud558\ub294 \ub0b4\uac00 \uc2eb\ub2e4\n\uc77c\uc694\uc77c \uc624\ud6c4 \uc99d\ud6c4\uad70 \ub098\ub9cc \uc788\ub294 \uac70 \uc544\ub2c8\uc9c0?", cat: "\uc77c\uc0c1" }
  ],
  // \ud3c9\uc77c \ud1f4\uadfc\uae38 17~20\uc2dc
  eveRushWd: [
    { t: "\ud1f4\uadfc\uae38 {line} \uc9c0\uc625\ucca0 \uc2e4\ud654\ub0d0", b: "{stn}\uc5d0\uc11c \ud0d4\ub294\ub370 \uc228\uc744 \ubabb \uc26c\uaca0\uc74c\n\uc138 \ub300 \ubcf4\ub0b4\uace0 \uaca8\uc6b0 \ud0d0\n\ub2e4\ub4e4 \ubb34\uc0ac\uadc0\ud658 \ud558\uc2dc\uae38", cat: "\uc77c\uc0c1" },
    { t: "\uce7c\ud1f4 \uc131\uacf5\ud55c \ub0a0\uc740 \uc9c0\ud558\ucca0\ub3c4 \uc990\uac81\ub2e4", b: "6\uc2dc \uc815\uac01\uc5d0 \ub098\uc640\uc11c {line} \ud0d4\uc74c\n\uc0ac\ub78c \ub9ce\uc544\ub3c4 \uae30\ubd84\uc774 \uc88b\uc73c\ub2c8\uae4c \uacac\ub51c\ub9cc \ud568\n\uce7c\ud1f4\ub294 \ucd5c\uace0\uc758 \ubcf5\uc9c0\ub2e4", cat: "\uc77c\uc0c1" },
    { t: "\ud1f4\uadfc\uae38\uc5d0 \ud3f0 \ubc30\ud130\ub9ac 1%\uba74 \uc9c4\uc9dc \ubd88\uc548\ud568", b: "{stn}\uae4c\uc9c0 40\ubd84 \ub0a8\uc558\ub294\ub370 \ubc30\ud130\ub9ac\uac00 \uac04\ub2f9\uac04\ub2f9\n\ub178\ub798\ub3c4 \ubabb \ub4e3\uace0 \uba4d\ub54c\ub9ac\ub294 \uc911\n\ubcf4\uc870\ubc30\ud130\ub9ac \ucc59\uae38\uac78", cat: "\uc77c\uc0c1" },
    { t: "\uc800\ub141 \uc57d\uc18d \uc788\ub294 \ub0a0 \ud1f4\uadfc\uae38\uc740 \uc65c \uc774\ub9ac \uc124\ub808\ub0d0", b: "{stn2}\uc5d0\uc11c \uce5c\uad6c \ub9cc\ub098\uae30\ub85c \ud568\n\uac19\uc740 \uc9c0\ud558\ucca0\uc778\ub370 \ud68c\uc0ac \uac08 \ub54c\ub791 \uae30\ubd84\uc774 \uc774\ub807\uac8c \ub2e4\ub984\n\ubaa9\uc801\uc9c0\uac00 \uc911\uc694\ud55c \uac70\uc600\uc5b4", cat: "\uc77c\uc0c1" },
    { t: "\ud658\uc2b9 \ub450 \ubc88 \ud558\ub294 \ud1f4\uadfc\uae38, \uc774\uc9c1\ud558\uba74 \ub098\uc544\uc9c8\uae4c", b: "\uc9d1\uae4c\uc9c0 \ub3c4\uc5b4\ud22c\ub3c4\uc5b4 1\uc2dc\uac04 20\ubd84\n\ud658\uc2b9\ud560 \ub54c\ub9c8\ub2e4 \uc601\ud63c\uc774 \uac08\ub824\ub098\uac10\n\ucd9c\ud1f4\uadfc \uac70\ub9ac\ub3c4 \uc5f0\ubd09\uc774\ub2e4 \uc9c4\uc9dc", cat: "\uc77c\uc0c1" },
    { t: "{stn}\uc5ed \ud1f4\uadfc\uc2dc\uac04 \uc5d0\uc2a4\uceec\ub808\uc774\ud130 \uc904 \ubb34\uc5c7", b: "\uc5d0\uc2a4\uceec\ub808\uc774\ud130 \ud0c0\ub824\ub294 \uc904\uc774 \ud50c\ub7ab\ud3fc \ub05d\uae4c\uc9c0 \uc774\uc5b4\uc9d0\n\uacc4\ub2e8\uc73c\ub85c \uc62c\ub77c\uac00\ub294 \uac8c \ud6e8\uc52c \ube60\ub978\ub370 \ub2e4\ub4e4 \uc65c \uae30\ub2e4\ub9ac\uc9c0\n\uc624\ub298\ub3c4 \uacc4\ub2e8\uc73c\ub85c \uc6b4\ub3d9\ud588\ub2e4 \uce58\uc790", cat: "\uc77c\uc0c1" }
  ],
  // \uc8fc\ub9d0 \uc800\ub141
  eveWe: [
    { t: "\uc8fc\ub9d0 \uc800\ub141 \uc9d1 \uac00\ub294 \uae38, \uc544\uc27d\ub2e4", b: "\ud558\ub8e8 \uc885\uc77c \uc798 \ub180\uace0 {line} \ud0c0\uace0 \uadc0\uac00 \uc911\n\ub0b4\uc77c \ud558\ub8e8 \ub354 \ub0a8\uc558\ub2e4\ub294 \uac8c \uc720\uc77c\ud55c \uc704\uc548\n\uc8fc\ub9d0\uc740 \uc65c \uc774\ub807\uac8c \ube60\ub974\ub0d0", cat: "\uc77c\uc0c1" },
    { t: "{stn} \uadfc\ucc98 \uc800\ub141 \uba39\uc744 \uacf3 \ucd94\ucc9c \uc880", b: "\uac00\uc871\ub4e4\uc774\ub791 \uc678\uc2dd\ud558\ub824\ub294\ub370 \uc6e8\uc774\ud305 \uc5c6\ub294 \uacf3 \uc5c6\ub098\n\uc8fc\ub9d0 \uc800\ub141\uc740 \uc5b4\ub51c \uac00\ub098 \ub9cc\uc11d\uc774\ub124\n\uc228\uc740 \ub9db\uc9d1 \uc544\uc2dc\ub294 \ubd84?", cat: "\uc9c8\ubb38" },
    { t: "\uc8fc\ub9d0 \uc800\ub141 \uc9c0\ud558\ucca0\uc5d4 \ud53c\uace4\ud55c \uc5bc\uad74\ub4e4\ubfd0", b: "\ub2e4\ub4e4 \ud558\ub8e8 \uc885\uc77c \ub180\uc558\ub294\uc9c0 \uafb8\ubc85\uafb8\ubc85 \uc878\uace0 \uc788\uc74c\n\ub098\ub3c4 \uadf8 \uc911 \ud558\ub098\n\uc798 \ub180\uc558\ub2e4\ub294 \uc99d\uac70\uaca0\uc9c0", cat: "\uc77c\uc0c1" }
  ],
  // \ud3c9\uc77c \ubc24 20~24\uc2dc
  nightWd: [
    { t: "\uc57c\uadfc \ub05d\ub098\uace0 \ud0c0\ub294 \uc9c0\ud558\ucca0\uc740 \uc720\ub3c5 \uc870\uc6a9\ud558\ub2e4", b: "9\uc2dc \ub118\uc5b4\uc11c {line} \ud0d4\ub294\ub370 \ub2e4\ub4e4 \uc9c0\uccd0 \ubcf4\uc784\n\ub0ae\uc758 \uc18c\uc74c\uc774 \uc5c6\uc73c\ub2c8\uae4c \uc624\ud788\ub824 \ub9c8\uc74c\uc774 \ud3b8\ud558\ub124\n\uc57c\uadfc\ub7ec\ub4e4 \ub2e4\ub4e4 \uc218\uace0\ud588\uc5b4\uc694", cat: "\uc77c\uc0c1" },
    { t: "\ud68c\uc2dd \ub05d\ub098\uace0 \ub9c9\ucc28 \uc2dc\uac04 \uacc4\uc0b0\ud558\ub294 \uc911", b: "\ubd80\uc7a5\ub2d8\uc740 3\ucc28 \uac00\uc790\ub294\ub370 \ub9c9\ucc28\uac00 40\ubd84 \ub0a8\uc558\uc74c\n\uc9c0\uae08 \uc77c\uc5b4\ub098\uc57c {stn} \ud658\uc2b9 \uac00\ub2a5\n\ud0c8\ucd9c \uac01 \uc7ac\ub294 \uc911", cat: "\uc77c\uc0c1" },
    { t: "\ubc24\uc5d0 \ud0c0\ub294 \uc9c0\ud558\ucca0\uc5d0\uc11c \ud558\ub8e8\ub97c \ub3cc\uc544\ubd04", b: "\uc624\ub298 \ud558\ub8e8\ub3c4 \uc815\uc2e0\uc5c6\uc774 \uc9c0\ub098\uac14\ub124\n\ucc3d\ubb38\uc5d0 \ube44\uce5c \ub0b4 \uc5bc\uad74 \ubcf4\ub2c8\uae4c \ud53c\uace4\uc774 \uadf8\ub300\ub85c \ubcf4\uc784\n\ub2e4\ub4e4 \uc624\ub298 \ud558\ub8e8 \uc218\uace0 \ub9ce\uc558\uc5b4\uc694", cat: "\uc77c\uc0c1" },
    { t: "\ud1f4\uadfc\uc774 \ub2a6\uc5b4\uc11c \uc800\ub141\uc744 \uc9d1 \uadfc\ucc98\uc5d0\uc11c \ud574\uacb0\ud568", b: "{stn}\uc5ed \uc55e \ubd84\uc2dd\uc9d1\uc5d0\uc11c \uae40\ubc25\uc5d0 \ub77c\uba74\n\ub2a6\uc740 \uc2dc\uac04\uc774\ub77c \uadf8\ub7f0\uc9c0 \uc720\ub3c5 \ub9db\uc788\uc74c\n\uc18c\uc18c\ud558\uc9c0\ub9cc \ud655\uc2e4\ud55c \ud589\ubcf5", cat: "\uc77c\uc0c1" },
    { t: "\ub9c9\ucc28 \ub193\uce60 \ubed4\ud55c \uc0ac\ub78c\uc758 \uc804\ub825\uc9c8\uc8fc", b: "{stn} \uacc4\ub2e8\uc744 \uc778\uc0dd \ucd5c\uace0 \uc18d\ub3c4\ub85c \ub6f0\uc5b4\ub0b4\ub824\uac10\n\ubb38 \ub2eb\ud788\uae30 3\ucd08 \uc804\uc5d0 \ud0d1\uc2b9 \uc131\uacf5\n\uc2ec\uc7a5\uc774 \uc544\uc9c1\ub3c4 \ub6f4\ub2e4 \u314b\u314b", cat: "\uc77c\uc0c1" }
  ],
  // \uc8fc\ub9d0 \ubc24
  nightWe: [
    { t: "\uc8fc\ub9d0 \ubc24 \uc9c0\ud558\ucca0\uc5d4 \uc774\uc57c\uae30\uac00 \ub9ce\ub2e4", b: "\ub2e4\ub4e4 \uc5b4\ub514\uc11c \ubb58 \ud558\uace0 \uc654\ub294\uc9c0 \ud45c\uc815\uc774 \ub2e4\uc591\ud568\n\uc6c3\ub294 \uc0ac\ub78c, \uc870\ub294 \uc0ac\ub78c, \ud1b5\ud654\ud558\ub294 \uc0ac\ub78c\n\uc8fc\ub9d0 \ubc24 \ud2b9\uc720\uc758 \ubd84\uc704\uae30\uac00 \uc788\uc74c", cat: "\uc77c\uc0c1" },
    { t: "\ub0b4\uc77c \ucd9c\uadfc \uc0dd\uac01\uc5d0 \uc7a0\uc774 \uc548 \uc634", b: "\uc77c\uc694\uc77c \ubc24\ub9c8\ub2e4 \ubc18\ubcf5\ub418\ub294 \ubd88\uba74\n\uc8fc\ub9d0\uc774 \ub05d\ub0ac\ub2e4\ub294 \uac78 \ubab8\uc774 \uac70\ubd80\ud558\ub294 \uc911\n\ub2e4\ub4e4 \uc77c\uc694\uc77c \ubc24 \uc5b4\ub5bb\uac8c \ubcf4\ub0c4?", cat: "\uc77c\uc0c1" },
    { t: "\uc8fc\ub9d0 \ub9c8\uc9c0\ub9c9 \ubc24\uc5d0\ub294 \uc57c\uc2dd\uc774 \uad6d\ub8f0", b: "\uce58\ud0a8 \uc2dc\ucf1c\ub193\uace0 \uae30\ub2e4\ub9ac\ub294 \uc911\n\ub2e4\uc774\uc5b4\ud2b8\ub294 \ub0b4\uc77c\ubd80\ud130 \ud558\uae30\ub85c \ud568 (\ub9e4\uc8fc \ubc18\ubcf5)\n\uc8fc\ub9d0\uc758 \ub9c8\ubb34\ub9ac\ub294 \uc5ed\uc2dc \uc57c\uc2dd\uc774\uc9c0", cat: "\uc77c\uc0c1" }
  ]
};
var WEATHER_POOLS = {
  rain: [
    { t: "\ube44 \uc624\ub294 \ub0a0 \uc9c0\ud558\ucca0\uc5ed \uc785\uad6c \uc6b0\uc0b0 \uc815\uccb4 \uc2e4\ud654\ub0d0", b: "{stn}\uc5ed \ucd9c\uad6c\uc5d0\uc11c \ub2e4\ub4e4 \uc6b0\uc0b0 \ud3b4\ub290\ub77c \ubcd1\ubaa9\ud604\uc0c1\n\ub4a4\uc5d0\uc11c \ubc00\ub824\uc624\ub294\ub370 \ub098\uac08 \uc218\uac00 \uc5c6\uc74c\n\ube44 \uc624\ub294 \ub0a0 \ucd9c\uad6c\ub294 \uc804\uc7c1\ud130\ub2e4", cat: "\uc77c\uc0c1" },
    { t: "\uc6b0\uc0b0 \uc548 \ucc59\uae34 \ub0a0\uc5d0\ub9cc \uaf2d \ube44\uac00 \uc634", b: "\uc544\uce68\uc5d0 \ud558\ub298 \uba40\uca61\ud588\ub294\ub370 \uc9c0\uae08 \uc3df\uc544\uc9c0\ub294 \uc911\n{stn}\uc5ed\uc5d0\uc11c \ud3b8\uc758\uc810 \uc6b0\uc0b0 \uc0ac\uc57c \ud558\ub098 \uace0\ubbfc\n\uc9d1\uc5d0 \ud3b8\uc758\uc810 \uc6b0\uc0b0\ub9cc \ub2e4\uc12f \uac1c\ub2e4", cat: "\uc77c\uc0c1" },
    { t: "\ube44 \uc624\ub294 \ub0a0 \uc9c0\ud558\ucca0 \ub0c4\uc0c8 \ub098\ub9cc \uc2e0\uacbd \uc4f0\uc784?", b: "\uc816\uc740 \uc6b0\uc0b0\uc774\ub791 \uc0ac\ub78c\ub4e4 \uc2b5\uae30\uac00 \ud569\uccd0\uc838\uc11c\n\ud2b9\uc720\uc758 \uafc9\uafc9\ud55c \ub0c4\uc0c8\uac00 \ub0a8\n\ucc3d\ubb38\uc774\ub77c\ub3c4 \uc5f4\uace0 \uc2f6\ub2e4", cat: "\uc77c\uc0c1" },
    { t: "\ube57\uc18c\ub9ac \ub4e4\uc73c\uba74\uc11c \ud1f4\uadfc\ud558\ub294 \uac83\ub3c4 \ub098\uc058\uc9c0 \uc54a\ub124", b: "\uc9c0\uc0c1 \uad6c\uac04\uc5d0\uc11c \ucc3d\ubc16\uc5d0 \ube44 \ub0b4\ub9ac\ub294 \uac70 \ubcf4\ub294 \uc911\n\ub178\ub798 \ud2c0\uc5b4\ub193\uc73c\ub2c8\uae4c \ubba4\uc9c1\ube44\ub514\uc624\uac00 \ub530\ub85c \uc5c6\uc74c\n\ube44 \uc624\ub294 \ub0a0\uc758 \ub0ad\ub9cc\uc740 \uc2e4\ub0b4\uc5d0\uc11c\ub9cc \uc720\ud6a8\ud568", cat: "\uc77c\uc0c1" },
    { t: "\uc7a5\ub9c8\ucca0 \uc9c0\ud558\ucca0 \uc5d0\uc5b4\ucee8+\uc2b5\uae30 \uc870\ud569 \ucd5c\uc545\uc774\ub2e4", b: "\ucda5\uae34 \ud55c\ub370 \uafc9\uafc9\ud558\uace0 \ub048\uc801\uc784\n\uac89\uc637\uc744 \uc785\uc744 \uc218\ub3c4 \ubc97\uc744 \uc218\ub3c4 \uc5c6\ub294 \uc0c1\ud0dc\n\uc7a5\ub9c8 \ube68\ub9ac \ub05d\ub098\ub77c", cat: "\uc77c\uc0c1" }
  ],
  snow: [
    { t: "\ub208 \uc624\ub2c8\uae4c \uc9c0\ud558\ucca0\uc774 \uc815\ub2f5\uc774\ub2e4", b: "\ub3c4\ub85c\ub294 \ubc8c\uc368 \uac70\ubd81\uc774\uac78\uc74c\uc774\ub77c\ub294\ub370\n{line}\uc740 \uadf8\ub7f0 \uac70 \uc5c6\uc774 \uc815\uc2dc \ub3c4\ucc29\n\ub208 \uc624\ub294 \ub0a0 \ucc28 \ub04c\uace0 \ub098\uc628 \uc0ac\ub78c\ub4e4 \uc874\ubc84\ud558\uc138\uc694", cat: "\uc77c\uc0c1" },
    { t: "\uccab\ub208 \uc624\ub294 \uac70 \uc9c0\ud558\ucca0 \uc9c0\uc0c1\uad6c\uac04\uc5d0\uc11c \ubd04", b: "\ucc3d\ubc16\uc5d0 \ub208 \ub0b4\ub9ac\ub294 \uac70 \ubcf4\ub2c8\uae4c \uac11\uc790\uae30 \uae30\ubd84 \uc88b\uc544\uc9d0\n\uc606\uc790\ub9ac \uc0ac\ub78c\ub3c4 \ud3f0 \ub0b4\ub824\ub193\uace0 \ucc3d\ubc16 \ubcf4\ub294 \uc911\n\ub2e4 \uac19\uc740 \ub9c8\uc74c\uc774\uad6c\ub098", cat: "\uc77c\uc0c1" },
    { t: "\ub208\uae38\uc5d0 {stn}\uc5ed\uae4c\uc9c0 \uac78\uc5b4\uac00\ub294 \uac8c \uace0\ud589\uc774\ub2e4", b: "\ube59\ud310\uae38\uc5d0 \ud3ad\uadc4\ucc98\ub7fc \ub4a4\ub6b1\ub4a4\ub6b1 \uac77\ub294 \uc911\n\uc624\ub298 \uba87 \uba85 \ub118\uc5b4\uc9c0\ub294 \uac70 \ubd24\ub294\uc9c0 \ubaa8\ub984\n\ub2e4\ub4e4 \uc870\uc2ec\ud788 \ub2e4\ub2c8\uc138\uc694", cat: "\uc77c\uc0c1" }
  ],
  hot: [
    { t: "\uc624\ub298 {temp}\ub3c4 \uc2e4\ud654\ub0d0 \ubc16\uc5d0 \ub098\uac00\uba74 \uc775\ub294\ub2e4", b: "\uc5ed\uae4c\uc9c0 5\ubd84 \uac77\ub294\ub370 \ub4f1\uc774 \ub2e4 \uc816\uc74c\n\uc9c0\ud558\ucca0 \uc5d0\uc5b4\ucee8\uc774 \uc720\uc77c\ud55c \uad6c\uc6d0\n\uc5ec\ub984\uc5d4 \uc9c0\ud558\uac00 \ucd5c\uace0\ub2e4", cat: "\uc77c\uc0c1" },
    { t: "\ud3ed\uc5fc\uc5d0 \uc9c0\ud558\ucca0 \uacc4\ub2e8 \uc62c\ub77c\uac00\uba74 \uc0ac\uc6b0\ub098 \uc9c1\ud589", b: "{stn}\uc5ed \ucd9c\uad6c \uacc4\ub2e8\uc5d0\uc11c \uc774\ubbf8 \uccb4\ub825 \uc18c\uc9c4\n\uc9c0\uc0c1\uc73c\ub85c \ub098\uac00\ub294 \uc21c\uac04 \ud6c5 \ub07c\uce58\ub294 \uc5f4\uae30\n\ub2e4\ub4e4 \ubb3c \ucc59\uaca8 \ub2e4\ub2c8\uc138\uc694", cat: "\uc77c\uc0c1" },
    { t: "\ub354\uc704 \ub54c\ubb38\uc5d0 \uc57d\ub0c9\ubc29\uce78 vs \uc77c\ubc18\uce78 \ub17c\uc7c1 \uc911", b: "\ub098\ub294 \ubb34\uc870\uac74 \uc77c\ubc18\uce78\ud30c, \uc2dc\uc6d0\ud574\uc57c \uc0b4 \uac83 \uac19\uc74c\n\uadfc\ub370 \ucda5\ub2e4\ub294 \uc0ac\ub78c\ub3c4 \uc774\ud574\ub294 \uac10\n\ub2e4\ub4e4 \uc5b4\ub290 \uce78 \ud0c0\uc2ec?", cat: "\uc9c8\ubb38" }
  ],
  cold: [
    { t: "\ud55c\ud30c\uc5d0 \uc9c0\ud558\ucca0 \uae30\ub2e4\ub9ac\ub294 5\ubd84\uc774 50\ubd84 \uac19\ub2e4", b: "\ud50c\ub7ab\ud3fc\uc5d0 \ubc14\ub78c \ub4e4\uc774\uce58\ub294\ub370 \ubc1c\uc774 \uc5bc\uc5b4\ubd99\ub294 \uc904\n{line} \ub3c4\ucc29 \uc548\ub0b4\ub9cc \ub6ab\uc5b4\uc838\ub77c \ubcf4\ub294 \uc911\n\uaca8\uc6b8\uc5d4 \uc2a4\ud06c\ub9b0\ub3c4\uc5b4 \uc788\ub294 \uc5ed\uc774 \ucd5c\uace0\ub2e4", cat: "\uc77c\uc0c1" },
    { t: "\ucd94\uc6b4 \ub0a0 \uc9c0\ud558\ucca0 \ud788\ud130 \uc790\ub9ac\ub294 \uba85\ub2f9\uc774\ub2e4", b: "\uc88c\uc11d \uc544\ub798 \ud788\ud130 \ub098\uc624\ub294 \uc790\ub9ac \uc549\uc73c\uba74 \uc5c9\ub369\uc774\uac00 \ub530\ub73b\ud568\n\ub0b4\ub9b4 \ub54c\uac00 \uc544\uc26c\uc6b8 \uc815\ub3c4\n\uaca8\uc6b8 \uc9c0\ud558\ucca0\uc758 \uc228\uc740 \ub099", cat: "\uc77c\uc0c1" },
    { t: "\uc601\ud558 \ub0a0\uc528\uc5d4 \ubaa9\ub3c4\ub9ac\uac00 \uc0dd\uc874\ud15c\uc774\ub2e4", b: "\uc624\ub298 \ubaa9\ub3c4\ub9ac \uc548 \ud558\uace0 \ub098\uc654\ub2e4\uac00 \ud6c4\ud68c \uc911\n{stn}\uae4c\uc9c0 \uac78\uc5b4\uac00\ub294\ub370 \ubaa9\uc774 \uc2dc\ub824\uc11c \ud63c\ub0a8\n\ub0b4\uc77c\ubd80\ud130 \ubb34\uc870\uac74 \ucc59\uae34\ub2e4", cat: "\uc77c\uc0c1" }
  ]
};
var NEWS_FEEDS = [
  { cat: "\uc0ac\ud68c\xB7\uc815\uce58", badge: "\uc77c\uc0c1", urls: [
    "https://news.google.com/rss/headlines/section/topic/NATION?hl=ko&gl=KR&ceid=KR:ko",
    "https://www.yna.co.kr/rss/politics.xml",
    "https://www.yna.co.kr/rss/society.xml"
  ] },
  { cat: "\uacbd\uc81c\xB7\uc8fc\uc2dd", badge: "\uc815\ubcf4", urls: [
    "https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=ko&gl=KR&ceid=KR:ko",
    "https://www.yna.co.kr/rss/economy.xml"
  ] },
  { cat: "\uc5f0\uc608", badge: "\uc77c\uc0c1", urls: [
    "https://news.google.com/rss/headlines/section/topic/ENTERTAINMENT?hl=ko&gl=KR&ceid=KR:ko",
    "https://www.yna.co.kr/rss/entertainment.xml"
  ] },
  { cat: "\uc2a4\ud3ec\uce20", badge: "\uc77c\uc0c1", urls: [
    "https://news.google.com/rss/headlines/section/topic/SPORTS?hl=ko&gl=KR&ceid=KR:ko",
    "https://www.yna.co.kr/rss/sports.xml"
  ] },
  { cat: "IT", badge: "\uc815\ubcf4", urls: [
    "https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=ko&gl=KR&ceid=KR:ko",
    "https://rss.etnews.com/Section901.xml"
  ] }
];
var _gemStat = { ok: 0, fail: 0, last: "", model: "", ctxRej: 0 };
// \u2605 2026-10-05: Gemini \ubb34\ub8cc \ud55c\ub3c4 \ub300\uc751. \ubaa8\ub378\ub9c8\ub2e4 \ud558\ub8e8 \ud55c\ub3c4\uac00 \ub530\ub85c\ub77c\uc11c, flash-lite \uac00 429(\ud55c\ub3c4)\uba74 \ub2e4\uc74c \ubaa8\ub378\ub85c \ub118\uc5b4\uac04\ub2e4.
//   \ud55c\ub3c4\uc5d0 \uac78\ub9b0 \ubaa8\ub378\uc740 20\ubd84(404 \uba74 6\uc2dc\uac04) \ub3d9\uc548 \uac74\ub108\ub6f4\ub2e4 \u2192 \ud55c\ub3c4 \ub09c \ub4a4\uc5d0\ub3c4 20\ubd84\ub9c8\ub2e4 \ud5db\ud638\ucd9c\uc744 \uc3df\uc544\ubd93\uc9c0 \uc54a\ub294\ub2e4.
// \u2605 2026-10-10 (YJ: \uac8c\uc2dc\uae00\u00b7\ub313\uae00\u00b7\uc18c\ud1b5\ubc29\uc774 \ud558\ub8e8 \ub9cc\uc5d0 \uba48\ucd98\ub2e4 / \uc18c\ud1b5\ubc29 \ubb38\uc7a5\uc774 "\uce58\ub9e5\u2026 \ud83c\udf57\u2026 \ud83e\udd24" \ucc98\ub7fc \uae68\uc9c4\ub2e4):
//   \uc6d0\uc778\u2460 \ubb34\ub8cc \ud0a4\uc758 gemini-2.5-flash-lite \ub294 \ud558\ub8e8 \uc57d 20\ud68c\ubfd0\uc774\ub77c \uc624\ud6c4 \uba87 \uc2dc\uac04 \ub9cc\uc5d0 \uc18c\uc9c4 \u2192 \ub2e4\uc74c \ub0a0 \uc624\ud6c4\uae4c\uc9c0 429. (\ub2e4\ub978 gemini \ubaa8\ub378\uc740 \uc774 \ud0a4\uc5d0\uc11c 404)
//   \uc6d0\uc778\u2461 temperature 1.15 \uac00 flash-lite \uc5d0\uc11c \ub9d0\uc904\uc784\ud45c \uc870\uac01\uc744 \ub0b3\uc558\ub2e4.
//   \u2192 \u24d0 \ucffc\ud130\uac00 \ub530\ub85c \uc7a1\ud788\ub294 Gemma(gemma-3-27b-it \ub4f1, \ubb34\ub8cc \ud558\ub8e8 \uc218\ucc9c \ud68c)\ub97c \uc608\ube44 \ubaa8\ub378\ub85c \ucd94\uac00\ud558\uace0, \uc18c\ud1b5\ubc29 \ub300\ub7c9 \uc0dd\uc131\uc740 Gemma \ub97c \uba3c\uc800 \uc4f4\ub2e4.
//     \u24d1 404/429 \uc678\uc758 400\u00b7403 \ub3c4 \uba48\ucd94\uc9c0 \uc54a\uace0 \ub2e4\uc74c \ubaa8\ub378\ub85c \ub118\uc5b4\uac04\ub2e4. \u24d2 ListModels \ub85c \uc774 \ud0a4\uc5d0\uc11c \uc2e4\uc81c \uc4f8 \uc218 \uc788\ub294 \ubaa8\ub378\uc744 \ucc3e\uc544 \ubaa9\ub85d\uc5d0 \ubcf4\ud0e0\ub2e4(bw_diag 'gemmodels' \uc5d0 \uae30\ub85d).
var GEM_MODELS = ["gemini-2.5-flash-lite", "gemini-flash-lite-latest", "gemini-2.5-flash", "gemini-2.0-flash", "gemma-3-27b-it", "gemma-3-12b-it"];
var GEM_BULK_ORDER = ["gemma-3-27b-it", "gemma-3-12b-it", "gemini-2.5-flash-lite", "gemini-flash-lite-latest", "gemini-2.5-flash", "gemini-2.0-flash"];   // \uc18c\ud1b5\ubc29(\ub300\ub7c9) \u2014 Gemini \ucffc\ud130\ub294 \uac8c\uc2dc\ud310\uc6a9\uc73c\ub85c \uc544\ub080\ub2e4
var _gemDownUntil = {};
var _gemLast = { status: 0, model: "", tried: "" };
var _gemUse = {};          // \uc774 \uc2e4\ud589\uc5d0\uc11c \uc131\uacf5 \ud638\ucd9c\ud55c \ubaa8\ub378\ubcc4 \ud69f\uc218(\ub05d\ub098\uba74 bw_diag 'gemuse' \ub85c \uae30\ub85d \u2192 \ud558\ub8e8 \uc608\uc0b0 \uacc4\uc0b0)
var _gemExtra = [];        // ListModels \ub85c \ucc3e\uc740 \ucd94\uac00 \ubaa8\ub378
var _gemDiscAt = 0;
function gemOrder(base) {
  const out = base.slice();
  _gemExtra.forEach((m) => { if (out.indexOf(m) < 0) out.push(m); });
  return out;
}
__name(gemOrder, "gemOrder");
async function gemDiscover(env) {
  if (Date.now() - _gemDiscAt < 3 * 3600e3 || !env.GEMINI_KEY) return;
  _gemDiscAt = Date.now();
  try {
    const r = await fetchT("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=" + env.GEMINI_KEY, 8e3, { method: "GET" });
    if (!r.ok) { await bwDiag(env, "gemmodels", { http: r.status }); return; }
    const d = await r.json();
    const names = (d.models || []).filter((m) => (m.supportedGenerationMethods || []).indexOf("generateContent") >= 0).map((m) => String(m.name || "").replace(/^models\//, ""));
    const usable = names.filter((n) => /^(gemini-[\d.]+-flash(-lite)?|gemini-flash(-lite)?-latest|gemma-3-(27b|12b|4b)-it)$/.test(n));
    usable.forEach((n) => { if (GEM_MODELS.indexOf(n) < 0 && _gemExtra.indexOf(n) < 0) _gemExtra.push(n); });
    await bwDiag(env, "gemmodels", { n: names.length, use: usable.join(",").slice(0, 400) });
  } catch (e) { await bwDiag(env, "gemmodels", { err: String((e && e.message) || e).slice(0, 80) }); }
}
__name(gemDiscover, "gemDiscover");
async function flushGemUse(env) {
  const keys = Object.keys(_gemUse);
  if (!keys.length) return;
  const snap = _gemUse; _gemUse = {};
  await bwDiag(env, "gemuse", snap);
}
__name(flushGemUse, "flushGemUse");
// \ucd5c\uadfc 24\uc2dc\uac04 \ub3d9\uc548 Gemini(gemini-*) \ubaa8\ub378\uc744 \ubd80\ub978 \ud69f\uc218 \u2014 \uc18c\ud1b5\ubc29\uc774 \uac8c\uc2dc\ud310 \ubaab\uae4c\uc9c0 \uc368 \ubc84\ub9ac\uc9c0 \uc54a\uac8c \uc608\uc0b0\uc744 \uac00\ub978\ub2e4
async function geminiUsed24h(env) {
  let n = 0;
  try {
    const rs = await env.DB.prepare("SELECT v FROM bw_diag WHERE k='gemuse' AND ts > ?1").bind(Date.now() - 24 * 3600e3).all();
    (rs.results || []).forEach((r) => { try { const o = JSON.parse(r.v); Object.keys(o).forEach((m) => { if (m.indexOf("gemini-") === 0) n += o[m] | 0; }); } catch (e) {} });
  } catch (e) {}
  Object.keys(_gemUse).forEach((m) => { if (m.indexOf("gemini-") === 0) n += _gemUse[m]; });
  return n;
}
__name(geminiUsed24h, "geminiUsed24h");
var GEMINI_TALK_BUDGET = 40;   // \uc18c\ud1b5\ubc29\uc774 24\uc2dc\uac04\uc5d0 \uc4f8 \uc218 \uc788\ub294 gemini-* \ud638\ucd9c \uc218. \ubc30\ud3ec \ub4a4 \uc2e4\uce21: gemini-flash-lite-latest \uac00 \ub530\ub85c \uc7a1\ud78c \ud55c\ub3c4\ub85c \uc751\ub2f5(Gemma \ub294 \uc774 \ud0a4\uc5d0\uc11c \uc4f0\uc774\uc9c0 \uc54a\uc74c) \u2192 8\ud68c\ub294 \ub108\ubb34 \ube61\ube61\ud574 \uc18c\ud1b5\ubc29\uc774 \ub2e4\uc2dc \uba48\ucd9c \uc218 \uc788\ub2e4. \ubaa8\ub378\ubcc4 429 \ub294 \ub2e4\uc74c \ubaa8\ub378\ub85c \ub118\uc5b4\uac04\ub2e4
async function gemFetch(env, ms, init, order) {
  let last = null, attempted = 0;
  const tried = [];
  for (const m of gemOrder(order || GEM_MODELS)) {
    if ((_gemDownUntil[m] || 0) > Date.now()) continue;
    attempted++;
    let r;
    try {
      r = await fetchT("https://generativelanguage.googleapis.com/v1beta/models/" + m + ":generateContent?key=" + env.GEMINI_KEY, ms, init);
    } catch (e) {
      _gemDownUntil[m] = Date.now() + 30e3;
      tried.push(m.replace("gemini-", "") + ":timeout");
      continue;
    }
    tried.push(m.replace("gemini-", "") + ":" + r.status);
    if (r.ok) { _gemStat.model = m; _gemUse[m] = (_gemUse[m] || 0) + 1; _gemLast = { status: 200, model: m, tried: tried.join(",") }; return r; }
    last = r;
    // \u2605 2026-10-05: 503(\uacfc\ubd80\ud558)\ub3c4 \ub2e4\uc74c \ubaa8\ub378\ub85c \ub118\uc5b4\uac04\ub2e4 \u2014 16:00 \uc5d0 flash-lite \uac00 503 \uc774\ub77c 13\uac1c \ubc29\uc774 \ube44\uc5c8\ub2e4. 5xx \ub294 1\ubd84\ub9cc \uc270\ub2e4.
    if (r.status === 429) _gemDownUntil[m] = Date.now() + 20 * 60e3;
    else if (r.status === 404) _gemDownUntil[m] = Date.now() + 6 * 3600e3;
    else if (r.status >= 500) _gemDownUntil[m] = Date.now() + 60e3;
    else _gemDownUntil[m] = Date.now() + 30 * 60e3;   // 400\u00b7403 \ub4f1: \uc774 \ubaa8\ub378\uc740 30\ubd84 \uc26c\uace0 \ub2e4\uc74c \ubaa8\ub378\uc744 \uc2dc\ub3c4\ud55c\ub2e4(Gemma \uac00 \uc9c0\uc6d0 \uc548 \ud558\ub294 \uc635\uc158 \ub4f1)
  }
  _gemLast = { status: last ? last.status : (attempted ? 504 : 429), model: "", tried: tried.join(",") };
  return last || { ok: false, status: attempted ? 504 : 429, json: async () => ({}), text: async () => "" };
}
__name(gemFetch, "gemFetch");
function fetchT(url, ms, opts) {
  const o = opts || { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Accept": "application/rss+xml, application/xml, text/xml, */*" }, redirect: "follow" };
  return Promise.race([
    fetch(url, o),
    new Promise(function(_, rej) {
      setTimeout(function() {
        rej(new Error("timeout"));
      }, ms);
    })
  ]);
}
__name(fetchT, "fetchT");
var NEWSFEED_SRC = [
  { cat: "\uc0ac\ud68c", url: "https://www.yna.co.kr/rss/society.xml" },
  { cat: "\uc815\uce58", url: "https://www.yna.co.kr/rss/politics.xml" },
  { cat: "\uacbd\uc81c", url: "https://www.yna.co.kr/rss/economy.xml" },
  { cat: "\uc5f0\uc608", url: "https://www.yna.co.kr/rss/entertainment.xml" },
  { cat: "\uc2a4\ud3ec\uce20", url: "https://www.yna.co.kr/rss/sports.xml" },
  { cat: "IT", url: "https://rss.etnews.com/Section901.xml" }
];
function _unesc(t) {
  return String(t).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}
__name(_unesc, "_unesc");
function parseItemsFull(xml) {
  const out = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) !== null && out.length < 30) {
    const blk = m[1];
    const tm = blk.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
    const lm = blk.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/);
    const dm = blk.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    const sm = blk.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/);
    if (!tm || !lm) continue;
    let t = _unesc(tm[1]);
    const cut = t.lastIndexOf(" - ");
    if (cut > 10) t = t.slice(0, cut).trim();
    const l = _unesc(lm[1]);
    let d = 0;
    if (dm) {
      const p = Date.parse(dm[1].trim());
      if (!isNaN(p)) d = p;
    }
    let s = "";
    if (sm) {
      s = _unesc(sm[1].replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
      if (s.length > 320) s = s.slice(0, 320) + "\u2026";
    }
    if (t.length >= 8 && l.indexOf("http") === 0) out.push({ t, l, d, s });
  }
  return out;
}
__name(parseItemsFull, "parseItemsFull");
function parseTitles(xml) {
  const out = [];
  const re = /<item>[\s\S]*?<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/g;
  let m;
  while ((m = re.exec(xml)) !== null && out.length < 12) {
    let t = m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
    const cut = t.lastIndexOf(" - ");
    if (cut > 10) t = t.slice(0, cut).trim();
    if (t.length >= 8 && t.length <= 90) out.push(t);
  }
  return out;
}
__name(parseTitles, "parseTitles");
async function fetchHeadlines(feed, debug) {
  const tries = [];
  for (const u of feed.urls) {
    try {
      const r = await fetchT(u, 6e3);
      if (!r.ok) {
        tries.push({ url: u, status: r.status });
        continue;
      }
      const xml = await r.text();
      const titles = parseTitles(xml);
      tries.push({ url: u, status: r.status, titles: titles.length });
      if (titles.length) {
        return debug ? { titles, tries } : titles;
      }
    } catch (e) {
      tries.push({ url: u, error: e.message });
    }
  }
  return debug ? { titles: [], tries } : [];
}
__name(fetchHeadlines, "fetchHeadlines");
function tplRegex(t) {
  const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("^" + esc.replace(/\\\{line\\\}|\\\{stn2?\\\}|\\\{temp\\\}/g, ".+") + "$");
}
__name(tplRegex, "tplRegex");
function rnd(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
__name(rnd, "rnd");
function rndInt(a, b) {
  return a + Math.floor(Math.random() * (b - a + 1));
}
__name(rndInt, "rndInt");
function kstNow() {
  return new Date(Date.now() + 9 * 3600 * 1e3);
}
__name(kstNow, "kstNow");
// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
// \u2605 2026-10-05 (YJ): \uae00\u00b7\ub313\uae00\u00b7\ub300\ud654\uac00 '\uc624\ub298\uc774 \ubb34\uc2a8 \ub0a0\uc778\uc9c0'\uc640 \uc5b4\uae0b\ub098\ub294 \ubb38\uc81c \u2014 \uac1c\ucc9c\uc808 \ub300\uccb4\uacf5\ud734\uc77c(\uc6d4\uc694\uc77c)\uc778\ub370 \uc77c\uc694\uc77c \ubc24\uc5d0 "\ub0bc \uc6d4\uc694\uc77c \ucd9c\uadfc"\uc774\ub77c\uace0
//   \uc4f0\uace0, \uac8c\uc2dc\ud310\uc5d4 "\ub0b4\uc77c\ubd80\ud130 \uc6d4\uc694\uc77c \uc2dc\uc791"\uc774\ub77c\uace0 \uc37c\ub2e4. \uc694\uc77c \uc774\ub984\uacfc \uc26c\ub294 \ub0a0 \uc5ec\ubd80\ub97c \ub530\ub85c \uacc4\uc0b0\ud558\ub358 \uac83\uc774 \uc6d0\uc778(\uc2ac\ub86f \ub77c\ubca8\uc740 '\uc6d4\uc694\uc77c (\ud3c9\uc77c)').
//   \uace0\uce5c \uac83: \u2460 \uacf5\ud734\uc77c \ud45c(\ub300\uccb4\uacf5\ud734\uc77c \ud3ec\ud568)\ub85c \uc624\ub298\u00b7\ub0b4\uc77c\u00b7\ub2e4\uc74c \ucd9c\uadfc\uc77c\u00b7\uac00\uae4c\uc6b4 \uacf5\ud734\uc77c\uc744 \uacc4\uc0b0(dayCtx) \u2461 \ubaa8\ub4e0 Gemini \ud504\ub86c\ud504\ud2b8\uc5d0 \uadf8 \uc0ac\uc2e4\uacfc \uacc4\uc808\u00b7\ub0a0\uc528\ub97c
//   \ub123\ub294\ub2e4(ctxBlock) \u2462 \ud15c\ud50c\ub9bf(\uc815\ud574\uc9c4 \ubb38\uad6c)\uacfc Gemini \uacb0\uacfc \ubaa8\ub450 \uc694\uc77c\u00b7\ud734\uc77c\u00b7\uacc4\uc808\u00b7\uae30\uc628\u00b7\ube44/\ub208\uacfc \uc5b4\uae0b\ub098\uba74 \ubc84\ub9b0\ub2e4(ctxReject).
//   \uacf5\ud734\uc77c \ud45c\ub294 \ub9e4\ub144 \uac31\uc2e0\ud574\uc57c \ud55c\ub2e4 \u2014 \ud45c\uc5d0 \uc5c6\ub294 \ud574\ub294 \uace0\uc815\uc77c \uacf5\ud734\uc77c(\uc2e0\uc815\u00b7\uc0bc\uc77c\uc808\u00b7\uc5b4\ub9b0\uc774\ub0a0\u00b7\ud604\ucda9\uc77c\u00b7\uad11\ubcf5\uc808\u00b7\uac1c\ucc9c\uc808\u00b7\ud55c\uae00\ub0a0\u00b7\uc131\ud0c4\uc808)\ub9cc \uc801\uc6a9\ud55c\ub2e4.
//   \uc784\uc2dc\uacf5\ud734\uc77c\uc774 \uc0dd\uae30\uba74 HOLIDAY_NAMES \uc5d0 \ud55c \uc904 \ucd94\uac00.
// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
var HOLIDAY_NAMES = {
  "2026-01-01": "\uc2e0\uc815", "2026-02-16": "\uc124\ub0a0 \uc5f0\ud734", "2026-02-17": "\uc124\ub0a0", "2026-02-18": "\uc124\ub0a0 \uc5f0\ud734", "2026-03-01": "\uc0bc\uc77c\uc808", "2026-03-02": "\uc0bc\uc77c\uc808 \ub300\uccb4\uacf5\ud734\uc77c",
  "2026-05-05": "\uc5b4\ub9b0\uc774\ub0a0", "2026-05-24": "\ubd80\ucc98\ub2d8\uc624\uc2e0\ub0a0", "2026-05-25": "\ubd80\ucc98\ub2d8\uc624\uc2e0\ub0a0 \ub300\uccb4\uacf5\ud734\uc77c", "2026-06-03": "\uc9c0\ubc29\uc120\uac70\uc77c", "2026-06-06": "\ud604\ucda9\uc77c",
  "2026-08-15": "\uad11\ubcf5\uc808", "2026-08-17": "\uad11\ubcf5\uc808 \ub300\uccb4\uacf5\ud734\uc77c", "2026-09-24": "\ucd94\uc11d \uc5f0\ud734", "2026-09-25": "\ucd94\uc11d", "2026-09-26": "\ucd94\uc11d \uc5f0\ud734",
  "2026-10-03": "\uac1c\ucc9c\uc808", "2026-10-05": "\uac1c\ucc9c\uc808 \ub300\uccb4\uacf5\ud734\uc77c", "2026-10-09": "\ud55c\uae00\ub0a0", "2026-12-25": "\uc131\ud0c4\uc808",
  // 2027 \u2014 \ubbf8\ub9ac \uacc4\uc0b0\ud55c \uac12(\ud655\uc815 \uacf5\uace0\uac00 \ub098\uc624\uba74 \ud655\uc778)
  "2027-01-01": "\uc2e0\uc815", "2027-02-05": "\uc124\ub0a0 \uc5f0\ud734", "2027-02-06": "\uc124\ub0a0", "2027-02-07": "\uc124\ub0a0 \uc5f0\ud734", "2027-02-08": "\uc124\ub0a0 \ub300\uccb4\uacf5\ud734\uc77c", "2027-03-01": "\uc0bc\uc77c\uc808",
  "2027-05-05": "\uc5b4\ub9b0\uc774\ub0a0", "2027-05-13": "\ubd80\ucc98\ub2d8\uc624\uc2e0\ub0a0", "2027-06-06": "\ud604\ucda9\uc77c", "2027-08-15": "\uad11\ubcf5\uc808", "2027-08-16": "\uad11\ubcf5\uc808 \ub300\uccb4\uacf5\ud734\uc77c",
  "2027-09-14": "\ucd94\uc11d \uc5f0\ud734", "2027-09-15": "\ucd94\uc11d", "2027-09-16": "\ucd94\uc11d \uc5f0\ud734", "2027-10-03": "\uac1c\ucc9c\uc808", "2027-10-04": "\uac1c\ucc9c\uc808 \ub300\uccb4\uacf5\ud734\uc77c",
  "2027-10-09": "\ud55c\uae00\ub0a0", "2027-10-11": "\ud55c\uae00\ub0a0 \ub300\uccb4\uacf5\ud734\uc77c", "2027-12-25": "\uc131\ud0c4\uc808", "2027-12-27": "\uc131\ud0c4\uc808 \ub300\uccb4\uacf5\ud734\uc77c"
};
var HOLIDAY_FIXED = { "01-01": "\uc2e0\uc815", "03-01": "\uc0bc\uc77c\uc808", "05-05": "\uc5b4\ub9b0\uc774\ub0a0", "06-06": "\ud604\ucda9\uc77c", "08-15": "\uad11\ubcf5\uc808", "10-03": "\uac1c\ucc9c\uc808", "10-09": "\ud55c\uae00\ub0a0", "12-25": "\uc131\ud0c4\uc808" };
var HOLIDAY_TABLE_YEARS = { "2026": 1, "2027": 1 };
var HOLIDAYS = Object.keys(HOLIDAY_NAMES);
var DOW_KO = ["\uc77c", "\uc6d4", "\ud654", "\uc218", "\ubaa9", "\uae08", "\ud1a0"];
function _p2(n) { return ("0" + n).slice(-2); }
function ymdOf(d) { return d.getUTCFullYear() + "-" + _p2(d.getUTCMonth() + 1) + "-" + _p2(d.getUTCDate()); }
// \u2605 2026-10-09: \uacf5\ud734\uc77c \ub2e8\uc77c \ucd9c\ucc98 \u2014 \uc5d4\uc9c4(route-v2)\uc758 /holidays \uac00 \ub9e4\uc77c \uc0c8\ubcbd \uc815\ubd80 \ud2b9\uc77c API \ub4f1\uc744 \ub300\uc870\ud574 \uac31\uc2e0\ud55c\ub2e4.
//   \uc5ec\uae30 \ud45c(HOLIDAY_NAMES)\ub294 \uadf8 \uc790\ub8cc\ub97c \ubabb \ubc1b\uc744 \ub54c\uc758 \uc608\ube44\ub2e4. \ubc1b\uc740 \uc790\ub8cc\uc5d0 \uc788\ub294 \ud574\ub294 \uadf8\uac83\ub9cc \ubbff\ub294\ub2e4(\ub300\uccb4\uacf5\ud734\uc77c\u00b7\uc784\uc2dc\uacf5\ud734\uc77c \ud3ec\ud568).
var HOLIDAY_LIVE = null, HOLIDAY_LIVE_AT = 0, HOLIDAY_LIVE_TRY = 0;
// \uac19\uc740 \uacc4\uc815\uc758 \uc6cc\ucee4\ub07c\ub9ac\ub294 workers.dev \uc8fc\uc18c\ub85c \ubd80\ub97c \uc218 \uc5c6\uc5b4(404) \uc5d4\uc9c4\uc744 \uc9c1\uc811 \ubd80\ub974\uc9c0 \uc54a\ub294\ub2e4. \ub300\uc2e0 \uac31\uc2e0 \uc6cc\ud06c\ud50c\ub85c(refresh-holidays.yml)\uac00 KV \uc5d0 \uc62c\ub9b4 \ub54c
// D1(subway-db)\uc758 holidays_live \ud45c\uc5d0\ub3c4 \uac19\uc740 JSON \uc744 \ub123\uc5b4 \ub450\uace0, \uc5ec\uae30\uc11c\ub294 \uadf8\uac83\uc744 \uc77d\ub294\ub2e4.
async function holRefresh(env) {
  const now = Date.now();
  if (now - HOLIDAY_LIVE_AT < 6 * 3600e3 || now - HOLIDAY_LIVE_TRY < 10 * 60e3) return;
  HOLIDAY_LIVE_TRY = now;
  try {
    if (!env || !env.DB) return;
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS holidays_live (k TEXT PRIMARY KEY, v TEXT NOT NULL, ts INTEGER)").run();
    const row = await env.DB.prepare("SELECT v FROM holidays_live WHERE k = 'nt:holidays:v1'").first();
    if (!row || !row.v) { await bwDiag(env, "holidays", { ok: false, bad: "nodata" }); return; }
    const o = JSON.parse(row.v);
    if (!o || !o.years || typeof o.years !== "object") { await bwDiag(env, "holidays", { ok: false, bad: "shape" }); return; }
    const yrs = {};
    for (const y in o.years) { const ye = o.years[y]; if (ye && ye.dates && typeof ye.dates === "object") yrs[y] = ye.dates; }
    if (!Object.keys(yrs).length) { await bwDiag(env, "holidays", { ok: false, bad: "empty" }); return; }
    HOLIDAY_LIVE = yrs; HOLIDAY_LIVE_AT = now;
    await bwDiag(env, "holidays", { ok: true, src: o.src, ver: o.version, years: Object.keys(yrs) });
  } catch (e) { try { await bwDiag(env, "holidays", { ok: false, err: String(e && e.message || e).slice(0, 120) }); } catch (e2) {} /* \uc608\ube44 \ud45c\ub97c \uadf8\ub300\ub85c \uc4f4\ub2e4 */ }
}
__name(holRefresh, "holRefresh");
function holidayName(ymd) {
  const ly = HOLIDAY_LIVE && HOLIDAY_LIVE[ymd.slice(0, 4)];
  if (ly) return ly[ymd] || "";
  if (HOLIDAY_NAMES[ymd]) return HOLIDAY_NAMES[ymd];
  if (HOLIDAY_TABLE_YEARS[ymd.slice(0, 4)]) return "";
  return HOLIDAY_FIXED[ymd.slice(5)] || "";
}
__name(holidayName, "holidayName");
function isRestDay(kst) {
  const day = kst.getUTCDay();
  if (day === 0 || day === 6) return true;
  return !!holidayName(ymdOf(kst));
}
__name(isRestDay, "isRestDay");
function dayShift(kst, n) { return new Date(kst.getTime() + n * 86400e3); }
function dayInfo(d) {
  const dow = d.getUTCDay(), ymd = ymdOf(d), hol = holidayName(ymd);
  return { ymd: ymd, dow: dow, m: d.getUTCMonth() + 1, d: d.getUTCDate(), md: (d.getUTCMonth() + 1) * 100 + d.getUTCDate(), hol: hol, rest: dow === 0 || dow === 6 || !!hol };
}
__name(dayInfo, "dayInfo");
function dayCtx(kst) {
  const t = dayInfo(kst), tm = dayInfo(dayShift(kst, 1)), y = dayInfo(dayShift(kst, -1));
  let nw = null, nm = null, i;
  for (i = 1; i <= 14 && !nw; i++) { const x = dayInfo(dayShift(kst, i)); if (!x.rest) { nw = x; nw.after = i; } }   // \ub2e4\uc74c \ucd9c\uadfc\u00b7\ub4f1\uad50\uc77c
  for (i = 1; i <= 7 && !nm; i++) { const x = dayInfo(dayShift(kst, i)); if (x.dow === 1) { nm = x; nm.after = i; } }   // \ub2e4\uc74c \uc6d4\uc694\uc77c(\uc624\ub298 \uc81c\uc678)
  const hols = [];
  for (i = 1; i <= 14; i++) { const x = dayInfo(dayShift(kst, i)); if (x.hol && x.dow >= 1 && x.dow <= 5) { x.after = i; hols.push(x); } }   // \ud3c9\uc77c\uc5d0 \ub080 \uacf5\ud734\uc77c
  return { t: t, tm: tm, y: y, nw: nw, nm: nm, hols: hols, hw: !!(t.hol && t.dow >= 1 && t.dow <= 5) };
}
__name(dayCtx, "dayCtx");
function seasonText(md) {
  if (md >= 301 && md <= 320) return "\ucd08\ubd04(\uc544\uc9c1 \uc300\uc300, \uaf43\uc0d8\ucd94\uc704)";
  if (md >= 321 && md <= 430) return "\ubd04(\ubc9a\uaf43\ucca0, \uc77c\uad50\ucc28 \ud07c)";
  if (md >= 501 && md <= 531) return "\ub2a6\ubd04\u00b7\ucd08\uc5ec\ub984(\uc2e0\ub85d, \ub0ae\uc5d4 \ub354\uc6c0)";
  if (md >= 601 && md <= 620) return "\ucd08\uc5ec\ub984(\ub354\uc6cc\uc9c0\ub294 \uc911)";
  if (md >= 621 && md <= 720) return "\uc7a5\ub9c8\ucca0(\ub365\uace0 \uc2b5\ud568)";
  if (md >= 721 && md <= 820) return "\ud55c\uc5ec\ub984(\ubb34\ub354\uc704\u00b7\uc5f4\ub300\uc57c)";
  if (md >= 821 && md <= 920) return "\ub2a6\uc5ec\ub984~\ucd08\uac00\uc744(\ub2a6\ub354\uc704 \ub0a8\uc544 \uc788\uc74c)";
  if (md >= 921 && md <= 1020) return "\uac00\uc744(\uc120\uc120\ud568, \ub2e8\ud48d\uc774 \ub4e4\uae30 \uc2dc\uc791, \uc77c\uad50\ucc28 \ud07c)";
  if (md >= 1021 && md <= 1120) return "\ub2a6\uac00\uc744(\uc300\uc300, \ub2e8\ud48d\u00b7\ub099\uc5fd, \uaca8\uc6b8\uc637 \uaebc\ub0b4\ub294 \uc2dc\uae30)";
  if (md >= 1121 && md <= 1220) return "\ucd08\uaca8\uc6b8(\ucd94\uc6cc\uc9c0\ub294 \uc911, \uccab\ub208\u00b7\ubd95\uc5b4\ube75 \ucca0)";
  return "\ud55c\uaca8\uc6b8(\ucd94\uc704)";
}
__name(seasonText, "seasonText");
function tempWord(t) {
  if (t <= -5) return "\ub9e4\uc6b0 \ucd94\uc6c0(\ud55c\ud30c)";
  if (t <= 2) return "\ud55c\uaca8\uc6b8 \ucd94\uc704";
  if (t <= 9) return "\ucda5\ub2e4";
  if (t <= 15) return "\uc300\uc300\ud558\ub2e4";
  if (t <= 21) return "\uc120\uc120\ud558\uace0 \ud65c\ub3d9\ud558\uae30 \uc88b\ub2e4";
  if (t <= 25) return "\ud3ec\uadfc\ud558\uac70\ub098 \uc57d\uac04 \ub530\ub73b\ud558\ub2e4";
  if (t <= 29) return "\ub365\ub2e4";
  return "\ubb34\ub354\uc704(\ud3ed\uc5fc)";
}
__name(tempWord, "tempWord");
function skyWord(w) {
  const c = w.code || 0;
  if (c === 0) return "\ub9d1\uc74c";
  if (c <= 3) return "\uad6c\ub984 \uc870\uae08~\ud750\ub9bc(\ube44\u00b7\ub208 \uc5c6\uc74c)";
  if (c === 45 || c === 48) return "\uc548\uac1c";
  if (c >= 51 && c <= 57) return "\uc774\uc2ac\ube44(\ube44 \uc634)";
  if (c >= 61 && c <= 67) return "\ube44 \uc634";
  if (c >= 71 && c <= 77 || c === 85 || c === 86) return "\ub208 \uc634";
  if (c >= 80 && c <= 82) return "\uc18c\ub098\uae30(\ube44 \uc634)";
  if (c >= 95) return "\ucc9c\ub465\ubc88\uac1c\u00b7\ube44";
  return "\ubcf4\ud1b5(\ube44\u00b7\ub208 \uc5c6\uc74c)";
}
__name(skyWord, "skyWord");
var DAY_RULES = "\uaddc\uce59: \u2460 \uc694\uc77c\u00b7\ud734\uc77c\uc744 \uc815\ud655\ud788. \uc26c\ub294 \ub0a0(\uc8fc\ub9d0\u00b7\uacf5\ud734\uc77c)\uc5d0\ub294 '\ucd9c\uadfc\uae38\u00b7\ub4f1\uad50\u00b7\ud68c\uc0ac\u00b7\uc218\uc5c5\u00b7\uc6d4\uc694\ubcd1' \uac19\uc740 \ub9d0\uc744 \uc624\ub298\uc758 \uc77c\uc0c1\uc73c\ub85c \uc4f0\uc9c0 \ub9c8\ub77c(\ud734\uc77c \ucd9c\uadfc\u00b7\ud2b9\uadfc\u00b7\uc54c\ubc14\ub97c \uc77c\ubd80\ub7ec \ub9d0\ud558\ub294 \uacbd\uc6b0\ub9cc \uac00\ub2a5). \u2461 \ub0b4\uc77c\uc774 \uc26c\ub294 \ub0a0\uc774\uba74 '\ub0b4\uc77c \ucd9c\uadfc\u00b7\ub0b4\uc77c \uc6d4\uc694\uc77c\u00b7\uc6d4\uc694\ubcd1' \uae08\uc9c0, \ub0b4\uc77c\uc774 \ud3c9\uc77c\uc774\uba74 '\ub0b4\uc77c\ub3c4 \uc27c' \uae08\uc9c0. \uc6d4\uc694\uc77c\uc774\uc5b4\ub3c4 \uacf5\ud734\uc77c\uc774\uba74 \uc6d4\uc694\uc77c \ucd9c\uadfc \uc598\uae30 \uae08\uc9c0. \u2462 \uacc4\uc808\u00b7\uae30\uc628\uc5d0 \uc548 \ub9de\ub294 \uc18c\uc7ac \uae08\uc9c0(\uac00\uc744\uc5d0 \uc7a5\ub9c8\u00b7\ube59\uc218\u00b7\ud55c\uaca8\uc6b8 \ud328\ub529 \uac19\uc740 \uac83). \u2463 \ube44\u00b7\ub208\uc774 \uc548 \uc624\uba74 \ube44\u00b7\ub208 \uc598\uae30 \uae08\uc9c0, \ube44\uac00 \uc624\uba74 '\ub0a0\uc528 \uc88b\ub2e4' \uae08\uc9c0. \u2464 \uc624\ub298\uc774 \ud3c9\uc77c \uacf5\ud734\uc77c\uc774\uba74 '\uc8fc\ub9d0' \ub300\uc2e0 '\ud734\uc77c\u00b7\uacf5\ud734\uc77c'\uc774\ub77c\uace0 \ub9d0\ud55c\ub2e4.";
function ctxBlock(kst, w, wcat) {
  const c = dayCtx(kst), t = c.t, tm = c.tm;
  const dn = function(x) { return x.m + "\uc6d4 " + x.d + "\uc77c " + DOW_KO[x.dow] + "\uc694\uc77c"; };
  const kindOf = function(x) { return x.hol ? (x.dow >= 1 && x.dow <= 5 ? x.hol + "\uc774\ub77c \ud3c9\uc77c\uc774\uc9c0\ub9cc \uc26c\ub294 \ub0a0(\ucd9c\uadfc\u00b7\ub4f1\uad50 \uc5c6\uc74c)" : x.hol + "(\uc26c\ub294 \ub0a0)") : x.dow === 0 || x.dow === 6 ? "\uc8fc\ub9d0(\uc26c\ub294 \ub0a0)" : "\ud3c9\uc77c(\ucd9c\uadfc\u00b7\ub4f1\uad50\ud558\ub294 \ub0a0)"; };
  const today = "\uc624\ub298: " + dn(t) + " \u2014 " + kindOf(t);
  const tomo = "\ub0b4\uc77c: " + DOW_KO[tm.dow] + "\uc694\uc77c \u2014 " + kindOf(tm);
  const nw = c.nw ? "\ub2e4\uc74c \ucd9c\uadfc\u00b7\ub4f1\uad50\uc77c: " + (c.nw.after === 1 ? "\ub0b4\uc77c" : c.nw.after + "\uc77c \ub4a4") + " " + DOW_KO[c.nw.dow] + "\uc694\uc77c" : "";
  const up = c.hols.length ? "\uac00\uae4c\uc6b4 \uacf5\ud734\uc77c: " + c.hols.slice(0, 2).map(function(h) { return h.m + "/" + h.d + "(" + DOW_KO[h.dow] + ") " + h.hol + " \u2014 " + h.after + "\uc77c \ub4a4"; }).join(", ") : "";
  const wx = w ? "\uc11c\uc6b8 \ud604\uc7ac " + w.temp + "\ub3c4(" + tempWord(w.temp) + "), \ud558\ub298: " + skyWord(w) : "\ub0a0\uc528 \uc815\ubcf4 \uc5c6\uc74c(\ub0a0\uc528 \uc598\uae30\ub294 \ud558\uc9c0 \ub9c8\ub77c)";
  return "\n[\ub0a0\uc9dc\u00b7\uacc4\uc808\u00b7\ub0a0\uc528 \u2014 \uc0ac\uc2e4\uc774\ub2e4. \uc774\uc640 \uc5b4\uae0b\ub098\ub294 \ub9d0\uc740 \uc4f0\uc9c0 \ub9c8\ub77c]\n" + [today, tomo, nw, up, "\uacc4\uc808: " + seasonText(t.md), wx].filter(Boolean).join("\n") + "\n" + DAY_RULES;
}
__name(ctxBlock, "ctxBlock");
// \ud3c9\uc77c \uacf5\ud734\uc77c\uc5d0 '\uc8fc\ub9d0'\uc774\ub77c\uace0 \uc4f4 \uac83\uc740 '\ud734\uc77c'\ub85c \ubc14\uafbc\ub2e4(\uc774\ubc88 \uc8fc\ub9d0\u00b7\ub2e4\uc74c \uc8fc\ub9d0\ucc98\ub7fc \ub2e4\ub978 \uc8fc\ub9d0\uc744 \uac00\ub9ac\ud0a4\ub294 \ub9d0\uc740 \uadf8\ub300\ub85c).
function holFix(text, kst) {
  const s = String(text == null ? "" : text);
  if (!dayCtx(kst).hw) return s;
  return s.replace(/(\uc774\ubc88 |\ub2e4\uc74c |\ub2f4 |\uc9c0\ub09c |\ub2e4\uac00\uc624\ub294 )?\uc8fc\ub9d0/g, function(m, pre) { return pre ? m : "\ud734\uc77c"; });
}
__name(holFix, "holFix");
// \uacc4\uc808\uc5b4 \u2014 [\uc815\uaddc\uc2dd, [[\uc2dc\uc791 MMDD, \ub05d MMDD], ...]] \uc774 \uae30\uac04 \ubc16\uc5d0\uc11c \ub098\uc624\uba74 \uc5b4\uc0c9\ud558\ub2e4
var SEASON_RULES = [
  [/\uc7a5\ub9c8/, [[615, 731]]], [/\ud3ed\uc5fc|\uc5f4\ub300\uc57c|\ubb34\ub354\uc704|\ucc1c\ud1b5|\uc0bc\ubcf5|\ubcf5\ub0a0/, [[601, 915]]], [/\ube59\uc218|\ubb3c\ub180\uc774|\uc6cc\ud130\ud30c\ud06c|\ud574\uc218\uc695/, [[501, 930]]],
  [/\uc5d0\uc5b4\ucee8/, [[501, 1015]]], [/\ubaa8\uae30/, [[601, 1010]]], [/\ud788\ud130/, [[1020, 415]]], [/\ubd95\uc5b4\ube75|\ud638\ube75|\uad70\uace0\uad6c\ub9c8/, [[1001, 430]]],
  [/\ud328\ub529|\ubaa9\ub3c4\ub9ac|\uc7a5\uac11|\ud56b\ud329|\ud138\uc7a5\ud654/, [[1020, 415]]], [/\ud55c\ud30c|\ud639\ud55c/, [[1115, 315]]], [/\uccab\ub208|\ub208\uc0ac\ub78c|\ud3ed\uc124|\ub208\uae38|\ube59\ud310/, [[1101, 331]]],
  [/\ubc9a\uaf43|\uaf43\uad6c\uacbd/, [[320, 515]]], [/\ud669\uc0ac/, [[301, 531]]], [/\ub2e8\ud48d|\ub099\uc5fd/, [[925, 1205]]], [/\uc740\ud589\uc78e/, [[1001, 1130]]],
  [/\ud06c\ub9ac\uc2a4\ub9c8\uc2a4|\uc0b0\ud0c0|\uce90\ub864/, [[1115, 1231]]], [/\uc1a1\ub144|\uc5f0\ub9d0/, [[1201, 1231]]], [/\uc0c8\ud574|\uc2e0\ub144|\uc0c8\ud574\ubcf5/, [[1226, 131]]],
  [/\uac1c\uac15/, [[225, 325], [825, 925]]], [/\uc885\uac15/, [[610, 705], [1205, 1231]]], [/\ubc29\ud559/, [[620, 831], [1215, 229]]],
  [/\uc218\ub2a5/, [[1001, 1130]]], [/\uc911\uac04\uace0\uc0ac/, [[405, 505], [1005, 1031]]], [/\uae30\ub9d0\uace0\uc0ac/, [[601, 701], [1201, 1231]]]
];
// \uba85\uc808\u00b7\uae30\ub150\uc77c\uc5b4 \u2014 \uadf8 \uacf5\ud734\uc77c \uc55e\ub4a4 10\uc77c \uc548\uc5d0\uc11c\ub9cc
var HOLIDAY_WORDS = [
  [/\ucd94\uc11d|\ud55c\uac00\uc704|\uadc0\uc131|\uadc0\uacbd/, ["\ucd94\uc11d"]], [/\uc124\ub0a0|\uc138\ubc30|\uc138\ubc43\ub3c8/, ["\uc124\ub0a0"]], [/\uba85\uc808/, ["\ucd94\uc11d", "\uc124\ub0a0"]], [/\uac1c\ucc9c\uc808/, ["\uac1c\ucc9c\uc808"]], [/\ud55c\uae00\ub0a0/, ["\ud55c\uae00\ub0a0"]],
  [/\uc5b4\ub9b0\uc774\ub0a0/, ["\uc5b4\ub9b0\uc774\ub0a0"]], [/\uad11\ubcf5\uc808/, ["\uad11\ubcf5\uc808"]], [/\uc0bc\uc77c\uc808/, ["\uc0bc\uc77c\uc808"]], [/\ud604\ucda9\uc77c/, ["\ud604\ucda9\uc77c"]], [/\ubd80\ucc98\ub2d8\uc624\uc2e0\ub0a0|\uc11d\uac00\ud0c4\uc2e0\uc77c/, ["\ubd80\ucc98\ub2d8\uc624\uc2e0\ub0a0"]]
];
function _inRange(md, r) { return r[0] <= r[1] ? (md >= r[0] && md <= r[1]) : (md >= r[0] || md <= r[1]); }
// \uc5b4\uae0b\ub098\ub294 \uc810\uc774 \uc788\uc73c\uba74 \uc774\uc720(\uc9e7\uc740 \ubb38\uc790\uc5f4), \uc5c6\uc73c\uba74 "" \u2014 \ud15c\ud50c\ub9bf\uc744 \uace0\ub97c \ub54c\uc640 Gemini \uacb0\uacfc\ub97c \uac70\ub97c \ub54c \ubaa8\ub450 \uc4f4\ub2e4.
function ctxReject(text, kst, w, cOpt) {
  const s = String(text == null ? "" : text);
  if (!s) return "";
  const c = cOpt || dayCtx(kst), t = c.t, tm = c.tm;
  let m;
  const NEG = /\uc544\ub2c8|\uc5c6|\uc548 ?(\uac00|\ud574|\ud558|\uac04|\ub098|\uc640|\uac08)|\uc26c|\uc270|\ud734\uc77c|\uacf5\ud734\uc77c|\uc5f0\ud734|\ub300\uccb4|\ub178\ub294|\ub180|\ubd80\ub7fd/;
  // \ub0b4\uc77c\uc774 \uc26c\ub294 \ub0a0\uc778\ub370 \ub0b4\uc77c \ucd9c\uadfc\u00b7\uc6d4\uc694\uc77c\u00b7\uc218\uc5c5 \uc598\uae30
  const re1 = /(\ub0b4\uc77c|\ub0bc)[^.!?\n]{0,10}?(\ucd9c\uadfc|\ub4f1\uad50|\uc6d4\uc694|\uc6d4\uc69c|\ud68c\uc0ac|\ud559\uad50|\uc218\uc5c5|\uc77c\uac00|\uc77c \uac00|\uadfc\ubb34|\uc57c\uadfc|\uc9c0\uac01|\uac1c\uac15|\uc77c \ud574|\uc77c\ud574)/g;
  while ((m = re1.exec(s))) { if (tm.rest && !NEG.test(s.slice(m.index, m.index + m[0].length + 8))) return "\ub0b4\uc77c\uc740 \uc26c\ub294 \ub0a0\uc778\ub370 \ucd9c\uadfc\u00b7\uc6d4\uc694\uc77c \uc598\uae30"; }
  // \ub0b4\uc77c\uc774 \ud3c9\uc77c\uc778\ub370 \ub0b4\uc77c\ub3c4 \uc270\ub2e4\uace0
  if (!tm.rest && /(\ub0b4\uc77c|\ub0bc)(\ub3c4|\uae4c\uc9c0)? ?(\ud558\ub8e8 \ub354 )?(\uc26c\ub294|\uc270\ub2e4|\uc27c|\ud734\uc77c|\uacf5\ud734\uc77c|\uc5f0\ud734)/.test(s) && !/\uc548 ?\uc26c|\ubabb ?\uc26c/.test(s)) return "\ub0b4\uc77c\uc740 \ud3c9\uc77c\uc778\ub370 \uc270\ub2e4\uace0 \ud568";
  // '\ub0b4\uc77c X\uc694\uc77c'\u00b7'\uc624\ub298 X\uc694\uc77c' \uc774 \uc2e4\uc81c\uc640 \ub2e4\ub984
  m = /(\ub0b4\uc77c|\ub0bc)(\ubd80\ud130|\uc740|\ub3c4|\uc774)?\s*([\uc77c\uc6d4\ud654\uc218\ubaa9\uae08\ud1a0])(\uc694\uc77c|\uc69c)/.exec(s);
  if (m && DOW_KO.indexOf(m[3]) !== tm.dow) return "\ub0b4\uc77c \uc694\uc77c\uc774 \ud2c0\ub9bc";
  m = /\uc624\ub298\s*(\uc740|\ub3c4)?\s*([\uc77c\uc6d4\ud654\uc218\ubaa9\uae08\ud1a0])(\uc694\uc77c|\uc69c)/.exec(s);
  if (m && DOW_KO.indexOf(m[2]) !== t.dow) return "\uc624\ub298 \uc694\uc77c\uc774 \ud2c0\ub9bc";
  // \uc694\uc77c \uc774\ub984 \u2014 \uc5b4\uc81c\u00b7\uc624\ub298\u00b7\ub0b4\uc77c \uc694\uc77c\uc774 \uc544\ub2c8\uba74 '\uc774\ubc88\u00b7\ub2e4\uc74c\u00b7\uc9c0\ub09c' \uac19\uc740 \ub9d0\uc774 \ubd99\uc5b4\uc57c \ud55c\ub2e4(\ud654\uc694\uc77c\uc5d0 "\uae08\uc694\uc77c \uc624\ud6c4\uc758 \uc124\ub818" \uac19\uc740 \uae00 \ubc29\uc9c0)
  if (!/\uc774\ubc88|\ub2e4\uc74c|\ub2f4\uc8fc|\ub2f4 |\uc9c0\ub09c|\uc800\ubc88|\uc8fc /.test(s)) {
    const reD = /([\uc77c\uc6d4\ud654\uc218\ubaa9\uae08\ud1a0])(\uc694\uc77c|\uc69c)/g;
    while ((m = reD.exec(s))) { const d = DOW_KO.indexOf(m[1]); if (d !== t.dow && d !== tm.dow && d !== c.y.dow) return "\uc694\uc77c \uc548 \ub9de\uc74c:" + m[1]; }
    if (/\ubd88\uae08/.test(s) && t.dow !== 5 && t.dow !== 4) return "\ubd88\uae08\uc778\ub370 \uae08\uc694\uc77c\uc774 \uc544\ub2d8";
  }
  // \ub2e4\uc74c \uc6d4\uc694\uc77c\uc774 \uacf5\ud734\uc77c\uc778\ub370 '\ub2f4\uc8fc \uc6d4\uc694\uc77c'
  if (c.nm && c.nm.rest && /(\ub2f4|\ub2e4\uc74c)\s*\uc8fc?\s*(\uc6d4\uc694\uc77c|\uc6d4\uc69c|\uc6d4\uc694)/.test(s)) return "\ub2e4\uc74c \uc6d4\uc694\uc77c\uc740 \ud734\uc77c";
  // \uc6d4\uc694\ubcd1 \u2014 \ub2e4\uc74c \ucd9c\uadfc\uc77c\uc774 \uc6d4\uc694\uc77c(\ub610\ub294 \uc624\ub298\uc774 \uadfc\ubb34\ud558\ub294 \uc6d4\uc694\uc77c)\uc77c \ub54c\ub9cc
  if (/\uc6d4\uc694\ubcd1/.test(s)) {
    const ok = (t.dow === 1 && !t.rest) || (c.nw && c.nw.dow === 1 && c.nw.after <= 3);
    if (!ok) return "\uc6d4\uc694\ubcd1\uc778\ub370 \ub2e4\uc74c \ucd9c\uadfc\uc77c\uc774 \uc6d4\uc694\uc77c\uc774 \uc544\ub2d8";
  }
  // \uc26c\ub294 \ub0a0\uc5d0 \ucd9c\ud1f4\uadfc\u00b7\uc218\uc5c5 \uc77c\uc0c1
  if (t.rest && /\ucd9c\uadfc\uae38|\ud1f4\uadfc\uae38|\ucd9c\uadfc ?\uc2dc\uac04|\ud1f4\uadfc ?\uc2dc\uac04|\ucd9c\uadfc ?\ub7ec\uc2dc|\ud1f4\uadfc ?\ub7ec\uc2dc|\ub4f1\uad63\uae38|\ud558\uad63\uae38|\ub4f1\uad50|\uae09\uc2dd|1\uad50\uc2dc|\uc57c\uc790|\uc9c0\uc625\ucca0|\uc6d4\uae09\ub8e8\ud321/.test(s) && !/\ud734\uc77c|\uacf5\ud734\uc77c|\uc8fc\ub9d0|\ud2b9\uadfc|\uc54c\ubc14|\ub0b4\uc77c|\ub0bc|\ub2f4|\ub2e4\uc74c|\uc5f0\ud734|\uc5b4\uc81c|\uc9c0\ub09c|\ubd80\ub7fd|\uc26c/.test(s)) return "\uc26c\ub294 \ub0a0\uc5d0 \ucd9c\ud1f4\uadfc \uc598\uae30";
  // \uc6d4\uc694\uc77c\uc774 \uacf5\ud734\uc77c\uc778\ub370 \ud3c9\uc18c \uc6d4\uc694\uc77c\ucc98\ub7fc \ub9d0\ud568
  if (t.dow === 1 && t.rest && /\uc6d4\uc694\uc77c|\uc6d4\uc69c|\uc6d4\uc694\ubcd1/.test(s) && !/\ud734\uc77c|\uacf5\ud734\uc77c|\ub300\uccb4|\uc26c|\uc5f0\ud734|\uac1c\ucc9c\uc808|\ub2f4|\ub2e4\uc74c|\uc9c0\ub09c/.test(s)) return "\ud734\uc77c\uc778 \uc6d4\uc694\uc77c\uc744 \ud3c9\uc18c \uc6d4\uc694\uc77c\ucc98\ub7fc \ub9d0\ud568";
  // \ud3c9\uc77c\uc778\ub370 '\uc624\ub298 \uc8fc\ub9d0/\ud734\uc77c'
  if (!t.rest && /(\uc624\ub298|\uc9c0\uae08)[^.!?\n]{0,6}(\uc8fc\ub9d0|\ud734\uc77c|\uacf5\ud734\uc77c|\uc5f0\ud734)/.test(s) && !/\ub0b4\uc77c|\ub0bc|\ub2f4|\ub2e4\uc74c|\uc774\ubc88|\uc5b8\uc81c|\ucc98\ub7fc|\uac19/.test(s)) return "\ud3c9\uc77c\uc5d0 \ud734\uc77c \uc598\uae30";
  // \uacc4\uc808\uc5b4
  for (let i = 0; i < SEASON_RULES.length; i++) {
    if (SEASON_RULES[i][0].test(s) && !SEASON_RULES[i][1].some(function(r) { return _inRange(t.md, r); })) return "\uacc4\uc808 \uc548 \ub9de\uc74c:" + SEASON_RULES[i][0].source.slice(0, 8);
  }
  // \uba85\uc808\u00b7\uae30\ub150\uc77c\uc5b4
  for (let i = 0; i < HOLIDAY_WORDS.length; i++) {
    if (!HOLIDAY_WORDS[i][0].test(s)) continue;
    let near = false;
    for (let k = -10; k <= 10 && !near; k++) { const h = holidayName(ymdOf(dayShift(kst, k))); if (h && HOLIDAY_WORDS[i][1].some(function(n) { return h.indexOf(n) >= 0; })) near = true; }
    if (!near) return "\uae30\ub150\uc77c \uc548 \ub9de\uc74c:" + HOLIDAY_WORDS[i][0].source.slice(0, 8);
  }
  // \uae30\uc628\u00b7\ub0a0\uc528
  if (w && typeof w.temp === "number") {
    if (w.temp >= 24 && /\ud55c\ud30c|\ud328\ub529|\ud56b\ud329|\ubaa9\ub3c4\ub9ac|\uc7a5\uac11|\ubd95\uc5b4\ube75|\ud638\ube75|\uad70\uace0\uad6c\ub9c8|\ud788\ud130/.test(s)) return "\uae30\uc628\uc774 \ub192\uc740\ub370 \ucd94\uc704 \uc598\uae30";
    if (w.temp <= 10 && /\ud3ed\uc5fc|\uc5f4\ub300\uc57c|\ubb34\ub354\uc704|\ucc1c\ud1b5|\ub540 ?(\ubed8\ubed8|\uc904\uc904|\ubc94\ubc85)|\uc5d0\uc5b4\ucee8 ?(\ube75\ube75|\uc138|\ucf1c)|\ube59\uc218|\ub365\ub2e4|\ub354\uc6cc|\ub354\uc6b4/.test(s)) return "\uae30\uc628\uc774 \ub0ae\uc740\ub370 \ub354\uc704 \uc598\uae30";
    const cat = weatherCat(w);
    if (cat !== "rain" && /\ube44\s?(\uac00\s?)?(\uc624|\uc640|\uc634|\uc628\ub2e4|\ub0b4\ub824|\ub0b4\ub9ac|\uc3df)|\ube57\uae38|\ube57\uc18c\ub9ac|\uc7a5\ub300\ube44|\uc18c\ub098\uae30|\uc6b0\uc0b0/.test(s)) return "\ube44\uac00 \uc548 \uc624\ub294\ub370 \ube44 \uc598\uae30";
    if (cat !== "snow" && /\ub208\s?(\uc774\s?)?(\uc624|\uc640|\uc634|\uc628\ub2e4|\ub0b4\ub824|\ub0b4\ub9ac)|\uccab\ub208|\ud3ed\uc124/.test(s)) return "\ub208\uc774 \uc548 \uc624\ub294\ub370 \ub208 \uc598\uae30";
    if ((cat === "rain" || cat === "snow") && /\ub9d1|\ud654\ucc3d|\ud587\ube5b|\ud587\uc0b4|\ub0a0\uc528 ?(\uac00 )?(\ub108\ubb34 |\uc9c4\uc9dc )?\uc88b/.test(s)) return "\ube44\u00b7\ub208\uc774 \uc624\ub294\ub370 \ub9d1\ub2e4\uace0 \ud568";
  }
  return "";
}
__name(ctxReject, "ctxReject");
function pickPool(kst) {
  const h = kst.getUTCHours();
  const weekend = isRestDay(kst);
  if (h < 6) return { key: "dawn", prob: 0.15, extra: 0 };
  if (h < 9) return weekend ? { key: "mornWe", prob: 0.5, extra: 0 } : { key: "mornRushWd", prob: 1, extra: 0.4 };
  if (h < 11) return weekend ? { key: "forenoonWe", prob: 0.6, extra: 0 } : { key: "forenoonWd", prob: 0.7, extra: 0 };
  if (h < 14) return { key: "lunch", prob: 0.9, extra: 0.2 };
  if (h < 17) return weekend ? { key: "afternoonWe", prob: 0.7, extra: 0 } : { key: "afternoonWd", prob: 0.7, extra: 0 };
  if (h < 20) return weekend ? { key: "eveWe", prob: 0.7, extra: 0 } : { key: "eveRushWd", prob: 1, extra: 0.4 };
  return weekend ? { key: "nightWe", prob: 0.7, extra: 0 } : { key: "nightWd", prob: 0.8, extra: 0 };
}
__name(pickPool, "pickPool");
var _wxCache = { at: 0, v: null }, _wxCoolUntil = 0;     // s251: \ud55c\ub3c4 \ucd08\uacfc(429)\uba74 10\ubd84\uc740 \ubd80\ub974\uc9c0 \uc54a\uace0 \ub0a0\uc528 \uc5c6\uc774(\uc61b \uac12\ub3c4 \uc4f0\uc9c0 \uc54a\ub294\ub2e4)
async function getWeather() {
  if (Date.now() < _wxCoolUntil) return null;
  // \u2605 2026-10-05: 10\ubd84 \uce90\uc2dc \u2014 \uae00\u00b7\ub313\uae00\u00b7\ub300\ud654\u00b7\ubc18\uc751\uc774 \ubaa8\ub450 \ub0a0\uc528\ub97c \uc4f0\uac8c \ub410\ub2e4(\ud638\ucd9c\uc774 \ubab0\ub9ac\uc9c0 \uc54a\uac8c). \uc2e4\ud328\ud558\uba74 3\uc2dc\uac04 \uc548\uc758 \uc61b \uac12\uc744 \uc4f4\ub2e4.
  if (_wxCache.v && Date.now() - _wxCache.at < 10 * 60e3) return _wxCache.v;
  try {
    const u = "https://api.open-meteo.com/v1/forecast?latitude=37.57&longitude=126.98&current=temperature_2m,weather_code&timezone=Asia%2FSeoul";
    const r = await fetch(u, { signal: AbortSignal.timeout(5e3) });
    if (r.status === 429) { _wxCoolUntil = Date.now() + 6e5; _wxCache = { at: 0, v: null }; return null; }
    if (!r.ok) throw new Error("http");
    const d = await r.json();
    if (!d || !d.current) throw new Error("nodata");
    _wxCache = { at: Date.now(), v: { temp: Math.round(d.current.temperature_2m), code: d.current.weather_code || 0 } };
    return _wxCache.v;
  } catch (e) {
    return (_wxCache.v && Date.now() - _wxCache.at < 3 * 3600e3) ? _wxCache.v : null;
  }
}
__name(getWeather, "getWeather");
function weatherCat(w) {
  if (!w) return null;
  const c = w.code;
  if (c >= 51 && c <= 67 || c >= 80 && c <= 82 || c >= 95) return "rain";
  if (c >= 71 && c <= 77 || c === 85 || c === 86) return "snow";
  if (w.temp >= 30) return "hot";
  if (w.temp <= 0) return "cold";
  return null;
}
__name(weatherCat, "weatherCat");
function fill(s, ctx) {
  return s.replace(/\{line\}/g, ctx.line).replace(/\{stn\}/g, ctx.stn).replace(/\{stn2\}/g, ctx.stn2).replace(/\{temp\}/g, ctx.temp);
}
__name(fill, "fill");
// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
// \u2605 2026-09-24: \uac8c\uc2dc\uae00\ub3c4 \uc2e4\uc2dc\uac04\uc18c\ud1b5(generateTalks/geminiTalks)\ucc98\ub7fc Gemini\ub85c
//   \uba3c\uc800 \uc0c8 \uae00\uc744 \uc2dc\ub3c4\ud55c\ub2e4. \uadf8\ub3d9\uc548 \uac8c\uc2dc\uae00\uc740 CHAT_POSTS(25\uac1c)+POOLS(\uc2ac\ub86f\ub2f9 3~8\uac1c)
//   \ubfd0\uc778 \uace0\uc815 \ud15c\ud50c\ub9bf\uc774\ub77c \uc2e4\uc2dc\uac04\uc18c\ud1b5\ubcf4\ub2e4 \ud6e8\uc52c \ube68\ub9ac \uc18c\uc7ac\uac00 \ubc14\ub2e5\ub0ac\ub2e4.
//   GEMINI_KEY\uac00 \uc5c6\uac70\ub098 \ud638\ucd9c\uc774 \uc2e4\ud328\ud558\uba74 \uae30\uc874 \ud15c\ud50c\ub9bf \uacbd\ub85c\ub85c 100% \uadf8\ub300\ub85c \ud3f4\ubc31\ud55c\ub2e4
//   (generatePosts \uc548\uc758 \uae30\uc874 \ubd84\uae30\ub294 \uc190\ub300\uc9c0 \uc54a\uc74c \u2014 \uae30\uc874 \ub3d9\uc791 \ubcf4\uc874).
// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
async function geminiPosts(env, n, recentTitles, kst, w, wcat, topics, hotWords) {
  if (!env.GEMINI_KEY || n <= 0) return null;
  try {
    // \u2605 2026-10-03: '\ub9d1\uc74c! \uc660\uc9c0 \u25cb\u25cb \ub561\uae30\ub124' \ud2c0\uc774 \uac70\uc758 \ub9e4 \uae00\uc5d0 \ub098\uc654\ub2e4(\ubd95\uc5b4\ube75\u00b7\ubee5\ud280\uae30\u00b7\uc19c\uc0ac\ud0d5 \ubc18\ubcf5).
    //   \uc6d0\uc778: \ud504\ub86c\ud504\ud2b8\uc5d0 \uae30\uc628\u00b7\ub0a0\uc528\ub97c \ub9e4\ubc88 \ub123\uace0, \uc18c\uc7ac \uc9c0\uc2dc\uac00 \uc5c6\uc5b4 \ubaa8\ub378\uc774 \uac19\uc740 \ud2c0\ub85c \uc218\ub834.
    //   \u2192 \ub0a0\uc528\ub294 \ube44\u00b7\ub208\u00b7\ud3ed\uc5fc\u00b7\ud55c\ud30c\ucc98\ub7fc \ud2b9\uc774\ud560 \ub54c\ub9cc \uc54c\ub824\uc8fc\uace0, \uae00\ub9c8\ub2e4 \uc11c\ub85c \ub2e4\ub978 \uc18c\uc7ac(topics)\ub97c \ubc30\uc815\ud55c\ub2e4.
    const wtxt = (wcat === "rain" ? "\ube44 \uc634" : wcat === "hot" ? "\ud3ed\uc5fc" : wcat === "cold" ? "\ud55c\ud30c" : wcat === "snow" ? "\ub208 \uc634" : "");
    const avoid = recentTitles.slice(0, 60).join(" / ") || "(\uc5c6\uc74c)";
    const tp = (topics && topics.length) ? topics.slice(0, n) : [];
    const topicTxt = tp.length ? "\n\uac01 \uae00\uc758 \uc18c\uc7ac(\uc21c\uc11c\ub300\ub85c \ud558\ub098\uc529, \ubc18\ub4dc\uc2dc \uc774 \uc18c\uc7ac\ub85c): " + tp.map(function(t, i) { return (i + 1) + ") " + t; }).join(" ") : "";
    const hotTxt = (hotWords && hotWords.length) ? "\n\ucd5c\uadfc \ub108\ubb34 \ub9ce\uc774 \uc4f4 \ub2e8\uc5b4(\uc774\ubc88\uc5d4 \uc4f0\uc9c0 \ub9c8): " + hotWords.join(", ") : "";
    const prompt = "\ub108\ub294 \ud55c\uad6d \uc9c0\ud558\ucca0\xB7\ubc84\uc2a4\ub85c \ucd9c\ud1f4\uadfc\xB7\ud1b5\ud559\ud558\ub294 \uc0ac\ub78c\ub4e4\uc774 \ubaa8\uc778 \uc628\ub77c\uc778 \ucee4\ubba4\ub2c8\ud2f0 \uac8c\uc2dc\ud310\uc5d0 \uae00\uc744 \uc4f0\ub294 \uc5ec\ub7ec \uba85\uc758 \ud3c9\ubc94\ud55c \uc774\uc6a9\uc790\ub2e4.\n\uc9c0\uae08: " + slotLabel(kst) + (wtxt ? ", \ub0a0\uc528: " + wtxt : "") + ctxBlock(kst, w, wcat) + topicTxt + hotTxt + "\n\uc11c\ub85c \ub2e4\ub978 \uc0ac\ub78c\uc774 \uc4f4 \uac83\ucc98\ub7fc, \uc9e7\uc740 \uac8c\uc2dc\uae00 " + n + "\uac1c\ub97c \uc0c8\ub85c \uc368\ub77c.\n\uaddc\uce59:\n1. \uc2e4\uc81c \ucee4\ubba4\ub2c8\ud2f0 \uac8c\uc2dc\uae00\ud22c \u2014 \uc81c\ubaa9\uc740 15~40\uc790, \ubcf8\ubb38\uc740 2~4\ubb38\uc7a5(\uc904\ubc14\uafc8\uc740 \\n\uc73c\ub85c \uad6c\ubd84), \ubc18\ub9d0\xB7\ud3b8\ud55c \ub9d0\ud22c, \uac00\ub054 \u314b\u314b\xB7\u3160\u3160\xB7\uc904\uc784\ub9d0.\n2. \uc9c0\ud558\ucca0\xB7\ubc84\uc2a4\xB7\ud1b5\uadfc\xB7\ud1b5\ud559\ubfd0 \uc544\ub2c8\ub77c \uce74\ud398\xB7\uc74c\uc2dd\xB7\uc6b4\ub3d9\xB7\ucde8\ubbf8\xB7\ub0a0\uc528\xB7\uacc4\uc808 \ub4f1 \uc0dd\ud65c \uc18c\uc7ac\ub3c4 \uc11e\uc5b4\ub77c.\n3. \uc544\ub798 '\ucd5c\uadfc\uc5d0 \ub098\uc628 \uae00 \uc81c\ubaa9'\uacfc \uacb9\uce58\ub294 \uc8fc\uc81c\xB7\ud45c\ud604\xB7\ubb38\uc7a5 \ud2c0\uc740 \ud53c\ud558\uace0 \ub9e4\ubc88 \uc0c8\ub85c\uc6b4 \uac01\ub3c4\ub85c \uc368\ub77c. \ud2b9\ud788 \"\ub0a0\uc528 \ud55c\ub9c8\ub514 + \uc660\uc9c0 \u25cb\u25cb \ub561\uae34\ub2e4\" \uac19\uc740 \uacf5\uc2dd \uae08\uc9c0, \uae00\ub9c8\ub2e4 \ubb38\uc7a5 \uad6c\uc870\uc640 \uccab \ub2e8\uc5b4\ub97c \ub2e4\ub974\uac8c: " + avoid + "\n4. \ub0a0\uc528\xB7\uae30\uc628\xB7\uc694\uc77c \uc5b8\uae09\uc740 \uaf2d \ud544\uc694\ud560 \ub54c\ub9cc, \uc804\uccb4 \uae00\uc758 1/5 \uc774\ud558\ub85c. \uc22b\uc790 \uae30\uc628\uc744 \uc81c\ubaa9\uc5d0 \uc4f0\uc9c0 \ub9c8\ub77c.\n5. \uc815\uce58\xB7\uc120\uac70\xB7\ud610\uc624\xB7\uc695\uc124\xB7\uc2e4\uc874\uc778\ubb3c \ube44\ubc29 \uae08\uc9c0. \uc5ed\xB7\ub178\uc120 \uc774\ub984\uc740 \uc790\uc720\ub86d\uac8c \uc9c0\uc5b4\ub0b4\ub3c4 \ub428.\nJSON \ubc30\uc5f4\ub9cc \ucd9c\ub825: [{\"t\":\"\uc81c\ubaa9\",\"b\":\"\ubcf8\ubb38\"}]";
    const r = await gemFetch(env, 12e3, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.95, topP: 0.95, maxOutputTokens: 4e3 } })
    });
    if (!r.ok) return null;
    const d = await r.json();
    let txt = "";
    try {
      txt = d.candidates[0].content.parts.map((p) => p.text || "").join("");
    } catch (e) {
      return null;
    }
    const arr = parseJsonArr(txt);
    if (!arr || !arr.length) return null;
    const rej = [];
    const out = arr.filter((x) => x && x.t && x.b && !aiJunk(x.t)).map((x) => ({ t: holFix(String(x.t).slice(0, 60), kst), b: holFix(String(x.b).slice(0, 400), kst) }))
      .filter((x) => { const why = ctxReject(x.t + "\n" + x.b, kst, w); if (why) { rej.push("ctx:" + why); return false; } return true; }).slice(0, n);
    out.rej = rej;
    return out;
  } catch (e) {
    return null;
  }
}
__name(geminiPosts, "geminiPosts");

// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
// \u2605 2026-10-03: 6\uac1c\uc6d4(183\uc77c) \uc911\ubcf5 \uae08\uc9c0 \uc6d0\uc7a5 (post_ledger)
//   YJ \uc9c0\uc2dc: "\ucd5c\uc18c 6\uac1c\uc6d4 \ub3d9\uc548 \uc911\ubcf5\ub418\ub294 \ub9d0\uc774\ub098 \uac8c\uc2dc\uae00\uc740 \uc62c\ub77c\uc624\uba74 \uc548 \ub3fc".
//   \uae30\uc874\uc5d4 \u2460 \uc81c\ubaa9\uc774 '\uc644\uc804\ud788 \uac19\uc740\uc9c0'\ub9cc \u2461 \ucd5c\uadfc 60\uc77c(\uadf8\ub098\ub9c8 posts 500\uac1c \uc0c1\ud55c \uc548)\uc5d0\uc11c\ub9cc \ubd24\ub2e4 \u2014
//   \uadf8\ub798\uc11c '\ub9d1\uc74c! \uc660\uc9c0 \u25cb\u25cb \ub561\uae30\ub124'\ucc98\ub7fc \uc81c\ubaa9\ub9cc \uc870\uae08\uc529 \ub2e4\ub978 \uac19\uc740 \ud2c0\uc774 \ub9e4\uc77c \uc62c\ub77c\uc654\ub2e4.
//   \uc6d0\uc7a5\uc740 posts \uc758 500\uac1c \uc0c1\ud55c\uacfc \ubb34\uad00\ud558\uac8c 183\uc77c\uce58\ub97c \ub530\ub85c \ubcf4\uad00\ud558\uace0, \uc544\ub798 \ub124 \uac00\uc9c0\ub97c \ub9c9\ub294\ub2e4.
//     \u2460 \uc815\uaddc\ud654 \uc81c\ubaa9 \ub3d9\uc77c  \u2461 \uc5ed\u00b7\uc22b\uc790\u00b7\ub0a0\uc528\u00b7\uc694\uc77c\uc744 \uc9c0\uc6b4 '\uace8\uaca9' \ub3d9\uc77c
//     \u2462 \uae00\uc790 2-gram \uc720\uc0ac\ub3c4 \ub192\uc74c(\uc81c\ubaa9 0.5\u2191 / \uc81c\ubaa9+\ubcf8\ubb38 0.55\u2191)
//     \u2463 \uac19\uc740 \ub2e8\uc5b4 \ud3ec\ud654 \u2014 \ucd5c\uadfc 10\uc77c \uc81c\ubaa9\uc5d0 \uc774\ubbf8 3\ubc88 \uc4f4 \ub2e8\uc5b4(\ubd95\uc5b4\ube75\u00b7\uc660\uc9c0 \uac19\uc740 \uac83)\ub294 \ub2f9\ubd84\uac04 \uae08\uc9c0
//   \uc6d0\uc7a5\uc774 \ube44\uc5b4 \uc788\uc73c\uba74 \ud604\uc7ac posts \ub85c \ud55c \ubc88 \ucc44\uc6b4\ub2e4(\ub9c8\uc774\uadf8\ub808\uc774\uc158).
// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
var LEDGER_DAYS = 183;
var _ledgerReady = false;
async function ensureLedger(env) {
  if (_ledgerReady) return;
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS post_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, title TEXT NOT NULL, body TEXT)").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_post_ledger_ts ON post_ledger(ts)").run();
  const c = await env.DB.prepare("SELECT COUNT(*) AS n FROM post_ledger").first();
  if (c && c.n === 0) {
    await env.DB.prepare("INSERT INTO post_ledger (ts, title, body) SELECT ts, title, substr(body,1,160) FROM posts").run();
  }
  _ledgerReady = true;
}
__name(ensureLedger, "ensureLedger");
var _STN_RE = null;
function stnRe() {
  if (_STN_RE) return _STN_RE;
  const set = {};
  LINES.forEach(function(L) { set[L.name] = 1; L.stns.forEach(function(x) { set[x] = 1; }); });
  const words = Object.keys(set).sort(function(a, b) { return b.length - a.length; });
  _STN_RE = new RegExp(words.join("|"), "g");
  return _STN_RE;
}
// \uace8\uaca9: \uc5ed\u00b7\ub178\uc120\u00b7\uc22b\uc790\u00b7\ub0a0\uc528\u00b7\uc2dc\uac04\ub300\u00b7\uc694\uc77c\u00b7\uae30\ud638\ub97c \uc9c0\uc6b4 \uae00\uc790\uc5f4
var _FRAME_STRIP = /(\ub9d1\uc74c|\ub9d1\uc740|\ub9d1\uace0|\ub9d1\ub2e4|\ud750\ub9bc|\ud750\ub9b0|\ube44\uc624\ub294|\ube44\uac00|\ub208\uc624\ub294|\ub0a0\uc528|\uae30\uc628|\uc624\ub298\uc740|\uc624\ub298|\uc5b4\uc81c|\ub0b4\uc77c|\uc544\uce68|\uc810\uc2ec|\uc800\ub141|\uc0c8\ubcbd|\uc624\uc804|\uc624\ud6c4|\ud1f4\uadfc\uae38|\ucd9c\uadfc\uae38|\ud1f4\uadfc|\ucd9c\uadfc|\uc6d4\uc694\uc77c|\ud654\uc694\uc77c|\uc218\uc694\uc77c|\ubaa9\uc694\uc77c|\uae08\uc694\uc77c|\ud1a0\uc694\uc77c|\uc77c\uc694\uc77c|\uc6d4\uc69c|\ud654\uc69c|\uc218\uc69c|\ubaa9\uc69c|\uae08\uc69c|\ubd88\uae08|\uc8fc\ub9d0|\ud3c9\uc77c|\uc9c0\ud558\ucca0|\ubc84\uc2a4)/g;
function skelText(t) {
  return String(t == null ? "" : t)
    .replace(stnRe(), "")
    .replace(/[0-9]+/g, "")
    .replace(_FRAME_STRIP, "")
    .replace(/[^\uac00-\ud7a3a-zA-Z]/g, "")
    .replace(/[\u314b\u314e\u3160\u315c]/g, "")
    .toLowerCase();
}
__name(skelText, "skelText");
function bigrams(t) {
  const set = {};
  const n = t.length;
  if (n < 2) { if (n === 1) set[t] = 1; return set; }
  for (let i = 0; i < n - 1; i++) set[t.substr(i, 2)] = 1;
  return set;
}
__name(bigrams, "bigrams");
function jaccard(a, b) {
  let inter = 0, na = 0, nb = 0;
  for (const k in a) { na++; if (b[k]) inter++; }
  for (const k in b) nb++;
  const uni = na + nb - inter;
  return uni ? inter / uni : 0;
}
__name(jaccard, "jaccard");
var _TOK_STOP = {};
"\uc9c0\ud558\ucca0 \ubc84\uc2a4 \uc0ac\ub78c \uc9c4\uc9dc \ub108\ubb34 \uc815\ub9d0 \ub2e4\ub4e4 \uc774\ubc88 \uc6b0\ub9ac \uc694\uc998 \uc5ed\uc2dc \uadf8\ub0e5 \uc624\ub79c \ud558\ub8e8 \uc624\ub298 \ub0b4\uc77c \uc5b4\uc81c \uc544\uce68 \uc810\uc2ec \uc800\ub141 \uc0c8\ubcbd \ud1f4\uadfc \ucd9c\uadfc \ub0a0\uc528 \uc774\uc81c \uc9c0\uae08 \uacc4\uc18d \uc644\uc804 \uac11\uc790 \ud639\uc2dc \ub2e4\uc74c \ub9c8\uc9c0 \ucc98\uc74c \ud558\ub098 \uadf8\ub9ac \ud558\uc9c0 \uadf8\ub798 \uadfc\ub370 \uadf8\ub7f0 \uc774\ub7f0 \uc800\ub7f0 \uc5b4\ub5a4 \ubaa8\ub4e0 \uac19\uc740 \uc544\uc9c1 \ub2e4\uc2dc \uacb0\uad6d \uac00\ub054 \uc790\uc8fc \ud56d\uc0c1 \ub9e4\uc77c \uac19\uc774 \ub9ce\uc774 \uc870\uae08 \uc5f4\ucc28 \ud658\uc2b9 \uc2b9\uac15 \uc774\uc6a9 \uc2b9\uac1d \uc6b4\ud589".split(" ").forEach(function(w) { _TOK_STOP[w] = 1; });
// \uc81c\ubaa9 \u2192 \uc5b4\uac04 \ud1a0\ud070(\uc55e 2\uae00\uc790). \uc870\uc0ac\u00b7\uc5b4\ubbf8 \ub54c\ubb38\uc5d0 '\ubd95\uc5b4\ube75\uc744/\ubd95\uc5b4\ube75\uc774'\uac00 \uac08\ub77c\uc9c0\uc9c0 \uc54a\uac8c \uc55e 2\uae00\uc790\ub85c \ubb36\ub294\ub2e4.
function titleToks(title) {
  const out = [];
  String(title || "").replace(stnRe(), " ").replace(/[0-9]+/g, " ").split(/[^\uac00-\ud7a3]+/).forEach(function(w) {
    if (w.length < 2) return;
    const k = w.slice(0, 2);
    if (_TOK_STOP[k] || _TOK_STOP[w]) return;
    out.push(k);
  });
  return out;
}
__name(titleToks, "titleToks");
// \uae00\uba38\ub9ac 4\uae00\uc790(\uc5ed\u00b7\uc22b\uc790 \uc81c\uac70) \u2014 "\uc624\ub298 \ub0a0\uc528 N\ub3c4!"\ucc98\ub7fc \uac19\uc740 \uccab\uba38\ub9ac\uac00 \uacc4\uc18d \ubc18\ubcf5\ub418\ub294 \uac78 \ub9c9\ub294 \uc6a9\ub3c4
function openerKey(t) {
  return String(t || "").replace(stnRe(), "").replace(/[0-9]+/g, "").replace(/[^\uac00-\ud7a3]/g, "").slice(0, 4);
}
var OPENER_MAX = 2;
function normExact(t) {
  return String(t).replace(/[\s.,!?~\u2026\u00b7\u314b\u314e\u3160\u315c()]/g, "");
}
async function loadLedger(env) {
  await ensureLedger(env);
  const cut = Date.now() - LEDGER_DAYS * 24 * 3600 * 1e3;
  try { await env.DB.prepare("DELETE FROM post_ledger WHERE ts < ?").bind(cut).run(); } catch (e) {}
  const rs = await env.DB.prepare("SELECT ts, title, body FROM post_ledger WHERE ts >= ? ORDER BY id DESC LIMIT 20000").bind(cut).all();
  const rows = rs.results || [];
  const idx = { exact: {}, skel: {}, items: [], tokCount: {}, openCount: {} };
  const tokCut = Date.now() - 10 * 24 * 3600 * 1e3;
  rows.forEach(function(r) { ledgerAdd(idx, r.title, r.body, r.ts >= tokCut); });
  return { idx, rows };
}
__name(loadLedger, "loadLedger");
function ledgerAdd(idx, title, body, recent) {
  idx.exact[normExact(title)] = 1;
  const sk = skelText(title);
  if (sk) idx.skel[sk] = 1;
  idx.items.push({ tb: bigrams(sk), fb: bigrams(skelText(String(title) + " " + String(body || ""))) });
  if (recent) {
    const seenHere = {};
    titleToks(title).forEach(function(k) { if (!seenHere[k]) { seenHere[k] = 1; idx.tokCount[k] = (idx.tokCount[k] || 0) + 1; } });
    const ok = openerKey(title);
    if (ok.length >= 3) idx.openCount[ok] = (idx.openCount[ok] || 0) + 1;
  }
}
__name(ledgerAdd, "ledgerAdd");
var TOK_SATURATION = 3;
// \uc911\ubcf5\uc774\uba74 \uc0ac\uc720 \ubb38\uc790\uc5f4, \uc544\ub2c8\uba74 null
function titleSane(t, b) {
  // \uae68\uc9c4 \uae00 \ucc28\ub2e8(\uc2e4\uc81c\ub85c "estranho...", "\ud551\uacc4 \ub300\uace0  }+" \uac19\uc740 \uc81c\ubaa9\uc774 \uc62c\ub77c\uc628 \uc801 \uc788\uc74c)
  const s = String(t || "") + " " + String(b || "");
  if (/[{}\[\]<>|\\]/.test(s)) return false;
  if (/[A-Za-z]{5,}/.test(s)) return false;
  if (/\s{2,}/.test(String(t || ""))) return false;
  if (String(t || "").replace(/[^\uac00-\ud7a3]/g, "").length < 4) return false;
  return true;
}
__name(titleSane, "titleSane");
function ledgerDupReason(idx, title, body) {
  if (!titleSane(title, body)) return "garbled";
  if (idx.exact[normExact(title)]) return "same-title";
  const sk = skelText(title);
  if (sk && idx.skel[sk]) return "same-skeleton";
  const tb = bigrams(sk), fb = bigrams(skelText(String(title) + " " + String(body || "")));
  for (let i = 0; i < idx.items.length; i++) {
    const it = idx.items[i];
    if (sk.length >= 4 && jaccard(tb, it.tb) >= 0.5) return "similar-title";
    if (jaccard(fb, it.fb) >= 0.55) return "similar-body";
  }
  const ok = openerKey(title);
  if (ok.length >= 3 && (idx.openCount[ok] || 0) >= OPENER_MAX) return "opener-repeated:" + ok;
  const toks = titleToks(title), seenHere = {};
  for (let j = 0; j < toks.length; j++) {
    const k = toks[j];
    if (seenHere[k]) continue;
    seenHere[k] = 1;
    if ((idx.tokCount[k] || 0) >= TOK_SATURATION) return "word-saturated:" + k;
  }
  return null;
}
__name(ledgerDupReason, "ledgerDupReason");
function hotTokens(idx) {
  return Object.keys(idx.tokCount).filter(function(k) { return idx.tokCount[k] >= 2; }).sort(function(a, b) { return idx.tokCount[b] - idx.tokCount[a]; }).slice(0, 25);
}
__name(hotTokens, "hotTokens");
// \uae00\ub9c8\ub2e4 \ub2e4\ub978 \uc18c\uc7ac\ub97c \ubc30\uc815\ud574 \uac19\uc740 \ud2c0\ub85c \uc218\ub834\ud558\uc9c0 \uc54a\uac8c \ud55c\ub2e4
var POST_TOPICS = [
  "\uc774\uc5b4\ud3f0\u00b7\ud5e4\ub4dc\ud3f0 \uace0\ub974\ub294 \ubc95", "\ub9cc\uc6d0 \uc9c0\ud558\ucca0\uc5d0\uc11c \uac00\ubc29 \uba54\ub294 \ubc95", "\uc790\ub9ac \uc591\ubcf4 \uacbd\ud5d8", "\ud658\uc2b9 \ud1b5\ub85c \uac77\ub294 \uc18d\ub3c4 \ucc28\uc774", "\ud3b8\uc758\uc810 \uc2e0\uc0c1 \ud6c4\uae30",
  "\ud68c\uc0ac \uc810\uc2ec \uba54\ub274 \uc815\ud558\uae30 \uc2a4\ud2b8\ub808\uc2a4", "\ud559\uad50\u00b7\ud559\uc6d0 \ub05d\ub098\uace0 \uadc0\uac00", "\ucd9c\uadfc\uae38 \ud31f\uce90\uc2a4\ud2b8\u00b7\uc624\ub514\uc624\ubd81 \ucd94\ucc9c", "\ucc45\u00b7\uc6f9\ud230 \uc77d\ub2e4 \ub0b4\ub9b4 \uc5ed \ub193\uce5c \uc774\uc57c\uae30", "\uce74\ud398 \uc790\ub9ac \uc804\uc7c1",
  "\uc6b4\ub3d9 \uc2dc\uc791\ud588\ub2e4\uac00 \uc0ac\ud758 \ub9cc\uc5d0 \ud3ec\uae30", "\ub7ec\ub2dd\u00b7\ud5ec\uc2a4 \ud6c4\uae30", "\uc790\ucde8 \uc694\ub9ac \uc2e4\ud328\ub2f4", "\ubc30\ub2ec\uc74c\uc2dd vs \uc9d1\ubc25", "\ubc18\ub824\ub3d9\ubb3c \uc774\uc57c\uae30",
  "\ub137\ud50c\ub9ad\uc2a4\u00b7\ub4dc\ub77c\ub9c8 \uc815\uc8fc\ud589 \ud6c4\uae30", "\uac8c\uc784 \uc774\uc57c\uae30(\ubaa8\ubc14\uc77c\u00b7\ucf58\uc194)", "\uc6d4\uc694\ubcd1 \uadf9\ubcf5\ubc95", "\uc5f0\ucc28 \uc4f0\ub294 \ub0a0\uc758 \uc544\uce68", "\uc57c\uadfc \ud6c4 \uadc0\uac00\uae38 \uac10\uc131",
  "\uc54c\ubc14 \uccab \ucd9c\uadfc \uae30\uc5b5", "\ucde8\uc5c5 \uc900\ube44\ud558\ub294 \uc694\uc998 \uc77c\uc0c1", "\uc2dc\ud5d8\uae30\uac04 \ub3c4\uc11c\uad00 \ud48d\uacbd", "\ud300 \ud68c\uc2dd \ubb38\ud654 \uc774\uc57c\uae30", "\uc0c1\uc0ac\u00b7\ub3d9\ub8cc\uc640\uc758 \uc18c\uc18c\ud55c \uc5d0\ud53c\uc18c\ub4dc",
  "\uc2a4\ub9c8\ud2b8\ud3f0 \ubc30\ud130\ub9ac \uc808\uc57d", "\ucda9\uc804\uae30\u00b7\ubcf4\uc870\ubc30\ud130\ub9ac \ubd84\uc2e4\ub2f4", "\uad50\ud1b5\uce74\ub4dc\u00b7\ud2f0\uba38\ub2c8 \uc794\uc561 \ubd80\uc871 \uc0ac\uac74", "\uc2a4\ud06c\ub9b0\ub3c4\uc5b4 \uad11\uace0 \uac10\uc0c1", "\ubc84\uc2a4 \uae30\uc0ac\ub2d8 \uce5c\uc808 \uc0ac\uc5f0",
  "\uc9c0\ud558\ucca0 \uc878\ub2e4\uac00 \uc885\uc810\uae4c\uc9c0 \uac04 \uc774\uc57c\uae30", "\uc549\uc544\uc11c \uac00\uae30 \uc704\ud55c \ub098\ub9cc\uc758 \uc694\ub839", "\ud658\uc2b9 \ud560\uc778 \uc54c\ub730 \ud301", "\ub9c9\ucc28 \ub193\uce5c \ub0a0", "\uc0c8\ubcbd \uccab\ucc28 \ud48d\uacbd",
  "\ube44 \uc624\ub294 \ub0a0 \uc6b0\uc0b0 \uc774\uc57c\uae30", "\ubbf8\uc138\uba3c\uc9c0\u00b7\ub9c8\uc2a4\ud06c \uace0\ubbfc", "\uacc4\uc808 \uc637\ucc28\ub9bc \uace0\ubbfc", "\uc81c\ucca0 \uc74c\uc2dd \uc598\uae30", "\ub3d9\ub124 \ube75\uc9d1\u00b7\ub9db\uc9d1 \ubc1c\uacac",
  "\ud1f4\uadfc \ud6c4 \ucde8\ubbf8\uc0dd\ud65c(\uadf8\ub9bc\u00b7\uc545\uae30\u00b7\ub728\uac1c\uc9c8)", "\uc8fc\ub9d0 \ub098\ub4e4\uc774 \ucf54\uc2a4", "\uc5ec\ud589 \uacc4\ud68d\u00b7\ub2e4\ub140\uc628 \ud6c4\uae30", "\uc911\uace0\uac70\ub798 \ud6c4\uae30", "\uc774\uc0ac\u00b7\uc790\ucde8\ubc29 \uad6c\ud558\uae30",
  "\uc6d4\uae09\ub0a0\u00b7\uc6d4\ub9d0 \uc9c0\uac11 \uc0ac\uc815", "\uc7ac\ubc0c\ub294 \uc548\ub0b4\ubc29\uc1a1 \ubb38\uad6c", "\uc5ed \uadfc\ucc98 \uae38\ub0e5\uc774", "\ucd9c\uadfc\uae38 \ub9c8\uc8fc\uce58\ub294 \ub2e8\uace8 \uc5bc\uad74\ub4e4", "\ud50c\ub7ab\ud3fc \ubca4\uce58\uc5d0\uc11c \ubcf8 \uc7a5\uba74",
  "\uc5d0\uc2a4\uceec\ub808\uc774\ud130 \uc5d0\ud2f0\ucf13", "\uc9c0\ud558\ucca0 \uc18c\ub9ac \uc5d0\ud2f0\ucf13", "\uc9c0\ud558\ucca0\uc5d0\uc11c \ubcf8 \ub3c5\ud2b9\ud55c \ud328\uc158", "\ud558\ub8e8 \uac78\uc74c \uc218 \ucc59\uae30\uae30", "\uce74\ud1a1 \uc77d\uc539 \uace0\ubbfc",
  "SNS \ud53c\ub4dc \uad6c\uacbd", "\uc0c8\ub85c \uc0b0 \ubb3c\uac74 \uc790\ub791", "\ucee4\ud53c\u00b7\ucc28 \ucde8\ud5a5", "\uc774\ubc88 \uc8fc \uc18c\uc18c\ud55c \ud589\ubcf5", "\ud559\uc0dd \uc2dc\uc808 \ud1b5\ud559 \ucd94\uc5b5",
  "\uc5b4\ub9b4 \uc801 \uc9c0\ud558\ucca0 \ud0c0\ub358 \uae30\uc5b5", "\uacf5\uc5f0\u00b7\uc804\uc2dc \ub2e4\ub140\uc628 \ud6c4\uae30", "\uc601\ud654\uad00 \ub2e4\ub140\uc628 \ud6c4\uae30", "\uc544\uce68\ud615 \uc778\uac04 \ub3c4\uc804\uae30", "\uc218\uba74 \ubd80\uc871 \ud574\uacb0\ubc95",
  "\uc810\uc2ec\uc2dc\uac04 \uc0b0\ucc45 \ucf54\uc2a4", "\ud68c\uc0ac \uadfc\ucc98 \uc228\uc740 \uc7a5\uc18c", "\ub3c4\uc2dc\ub77d \uc2f8\uae30 \ub3c4\uc804", "\ub2e4\uc774\uc5b4\ud2b8 \uc911 \uc720\ud639"
];
function pickTopics(n) {
  return POST_TOPICS.slice().sort(function() { return Math.random() - 0.5; }).slice(0, n);
}
__name(pickTopics, "pickTopics");
async function generatePosts(env) {
  const kst = kstNow();
  const dc = dayCtx(kst);
  const slot = pickPool(kst);
  let count = 0;
  if (Math.random() < slot.prob) count++;
  if (slot.extra && Math.random() < slot.extra) count++;
  if (count === 0) return { made: 0, slot: slot.key };
  const w = await getWeather();
  const wcat = weatherCat(w);
  let recent = [];
  // \u2605 2026-09-27 (YJ \uc9c0\uc2dc\ub85c \uc2e4\uce21 \uc810\uac80 \uc911 \ubc1c\uacac): \uc544\ub798 D1 \uc870\ud68c\uac00 \uc2e4\ud328\ud558\uba74 catch\uac00 \uc544\ubb34 \ub9d0 \uc5c6\uc774
  //   \uc0bc\ucf1c\uc11c recent=[]\ub85c \uacc4\uc18d \uc9c4\ud589\ud588\ub2e4 \u2014 \uadf8\ub7ec\uba74 \uc774\ubc88 \uc8fc\uae30\ub294 '\ucd5c\uadfc \uae00\uc774 \ud558\ub098\ub3c4 \uc5c6\ub294 \uac83\ucc98\ub7fc'
  //   \ub3d9\uc791\ud574 \uc911\ubcf5\ubc29\uc9c0(seen/recent \uac80\uc0ac)\uac00 \ud1b5\uc9f8\ub85c \uaebc\uc9c4 \ucc44\ub85c \uc0c8 \uae00\uc744 \ub9cc\ub4e4\uac8c \ub41c\ub2e4. \uc2e4\uc81c\ub85c
  //   "\uce7c\ud1f4 \uc131\uacf5\ud55c \ub0a0\uc740 \uc9c0\ud558\ucca0\ub3c4 \uc990\uac81\ub2e4"(id 2107\u21922108) \uac19\uc740 \uc644\uc804\ud788 \ub3d9\uc77c\ud55c \uc81c\ubaa9\uc774 20\ubd84
  //   \uac04\uaca9(\ud06c\ub860 \uc8fc\uae30\uc640 \uc77c\uce58)\uc73c\ub85c \ub450 \ubc88 \uc62c\ub77c\uc628 \uac78 \uc2e4\uce21 \ud655\uc778\ud588\ub294\ub370, \uc774 \uc870\uc6a9\ud55c \ud3f4\ubc31\uc774
  //   \uc720\ub825\ud55c \uc6d0\uc778\uc774\ub2e4(\ub2e4\ub978 \uc2a4\ud0b5 \uc870\uac74\ub4e4\ucc98\ub7fc \uc870\uc6a9\ud788 \ub118\uc5b4\uac00\ub294 \ub300\uc2e0, \uc5ec\uae30\uc120 \uc911\ubcf5\ubc29\uc9c0 \uc5c6\uc774
  //   \uae00\uc744 \uc4f0\ub290\ub2c8 \uc774\ubc88 \uc8fc\uae30\ub97c \uac74\ub108\ub6f0\ub294 \uac8c \ub0ab\ub2e4 \u2014 09-22 \ubc29\uce68\uacfc \uac19\uc740 \ubc29\ud5a5).
  let recentOk = false;
  let ledger = null;
  try {
    ledger = await loadLedger(env);
  } catch (e) {
    // \u2605 \uc6d0\uc7a5\uc744 \ubabb \uc77d\uc73c\uba74 6\uac1c\uc6d4 \uc911\ubcf5 \uac80\uc0ac\ub97c \ubabb \ud558\ubbc0\ub85c \uc774\ubc88 \uc8fc\uae30\ub294 \uc4f0\uc9c0 \uc54a\ub294\ub2e4(\uc870\uc6a9\ud788 \uc911\ubcf5\uc744 \ub9cc\ub4dc\ub294 \uac83\ubcf4\ub2e4 \ub0ab\ub2e4)
    console.log("[board-writer][posts] \uc6d0\uc7a5 \ub85c\ub4dc \uc2e4\ud328, \uc774\ubc88 \uc8fc\uae30\ub294 \uac74\ub108\ub700:", e.message);
    return { made: 0, slot: slot.key, skipped: "ledger-failed" };
  }
  try {
    // \u2605 2026-09-22: 150\uac1c \u2192 500\uac1c(MAX_POSTS \uc804\uccb4) \u2014 \uc5ec\uae30\uae4c\uc9c0\ub294 \uc774\ubbf8 \ubc30\ud3ec\ub3fc \uc788\ub358 \uc218\uc815.
    // \u2605 2026-09-24: \uac1c\uc218(500\uac1c) \ucc3d \u2192 60\uc77c(\uc2dc\uac04) \ucc3d\uc73c\ub85c \ub2e4\uc2dc \uc804\ud658.
    //   \ud15c\ud50c\ub9bf \ud480\uc774 CHAT_POSTS+POOLS \ud569\uccd0 90\uac1c \uc548\ud30e\ubfd0\uc774\ub77c, \uae00\uc774 \ud65c\ubc1c\ud788 \uc313\uc774\ub294
    //   \uc2dc\uae30\uc5d4 \ucd5c\uadfc 500\uac1c '\uc548'\uc5d0 90\uac1c \ud15c\ud50c\ub9bf\uc774 \uc804\ubd80 \ub4e4\uc5b4\ucc28\ubc84\ub9b0\ub2e4 \u2014 \uadf8\ub7ec\uba74 \uadf8 \ub4a4\ub85c\ub294
    //   \ub9e4 \uc8fc\uae30 '\uc2e0\uc120\ud55c \ud15c\ud50c\ub9bf \uc5c6\uc74c'\uc73c\ub85c \uacc4\uc18d \uac74\ub108\ub6f0\uae30\ub9cc \ubc18\ubcf5\ud558\uace0, \uc0c8 \uae00\uc774 \uc601\uc6d0\ud788
    //   \uc548 \uc62c\ub77c\uc628\ub2e4(\uc624\ub798\ub41c \uae00\uc774 \ubc00\ub824\ub098\ub824\uba74 \uc0c8 \uae00\uc774 \uacc4\uc18d \ub4e4\uc5b4\uc640\uc57c \ud558\ub294\ub370, \uc0c8 \uae00\uc774
    //   \uc548 \ub9cc\ub4e4\uc5b4\uc9c0\ub2c8 \ucc3d\uc774 \uc808\ub300 \uc548 \ube44\uc6cc\uc9c0\ub294 \uc21c\ud658). \uc2dc\uac04 \ucc3d\uc740 \uba70\uce60\ub9cc \uc9c0\ub098\ub3c4
    //   \uc624\ub798\ub41c \uae00\uc774 \uc790\uc5f0\ud788 '\ub2e4\uc2dc \uc368\ub3c4 \ub418\ub294' \uc0c1\ud0dc\ub85c \ud480\ub824\uc11c \uc774 \uad50\ucc29\uc744 \ub9c9\ub294\ub2e4.
    //   (\uc544\ub798 geminiPosts \ucd94\uac00\ub85c \ud15c\ud50c\ub9bf \ud480 \uc790\uccb4\ub3c4 \uc0ac\uc2e4\uc0c1 \ubb34\ud55c\ud574\uc9c0\uc9c0\ub9cc, Gemini\uac00
    //   \uc2e4\ud328/\ubbf8\uc124\uc815\uc77c \ub54c\uc758 \ud15c\ud50c\ub9bf \ud3f4\ubc31 \uacbd\ub85c\ub97c \uc704\ud574 \uc774 \uc548\uc804\uc7a5\uce58\ub294 \uadf8\ub300\ub85c \ub454\ub2e4.)
    const cut = Date.now() - 60 * 24 * 3600 * 1e3;
    const rs = await env.DB.prepare("SELECT title FROM posts WHERE ts > ? ORDER BY id DESC LIMIT 2000").bind(cut).all();
    recent = (rs.results || []).map((r) => r.title);
    // \u2605 \ud15c\ud50c\ub9bf \uc7ac\uc0ac\uc6a9 \uac80\uc0ac\u00b7\ud504\ub86c\ud504\ud2b8 \ud68c\ud53c \ubaa9\ub85d\ub3c4 \uc6d0\uc7a5(183\uc77c)\uc744 \uae30\uc900\uc73c\ub85c \ud55c\ub2e4
    ledger.rows.forEach(function(r) { if (recent.indexOf(r.title) < 0) recent.push(r.title); });
    recentOk = true;
  } catch (e) {
    console.log("[board-writer][posts] recent-titles \uc870\ud68c \uc2e4\ud328, \uc774\ubc88 \uc8fc\uae30\ub294 \uac74\ub108\ub700:", e.message);
  }
  if (!recentOk) return { made: 0, slot: slot.key, skipped: "recent-fetch-failed" };
  const norm = /* @__PURE__ */ __name(function(s) {
    return String(s).replace(/[\s.,!?~\u2026\u00b7\u314b\u314e\u3160\u315c()]/g, "");
  }, "norm");
  const seen = {};
  recent.forEach(function(t) {
    var k = norm(t);
    if (k) seen[k] = 1;
  });
  // \u2605 2026-09-24: Gemini(\uc124\uc815\ub3fc \uc788\uc73c\uba74)\ub85c \uba3c\uc800 \uc0c8 \uae00\uc744 \uc2dc\ub3c4\ud55c\ub2e4. \uc2e4\ud328/\ubbf8\uc124\uc815\uc774\uba74
  //   \uc544\ub798 \uae30\uc874 \ubd84\uae30(CHAT_POSTS 60% / POOLS\u00b7WEATHER_POOLS 40%)\ub85c \uadf8\ub300\ub85c \ud3f4\ubc31\ud55c\ub2e4.
  let aiPosts = null, aiAsked = 0;
  try {
    // \ud6c4\ubcf4\ub97c \ub109\ub109\ud788(\ud544\uc694\ud55c \uc218\uc758 3\ubc30, \ucd5c\ub300 9) \ubc1b\uc544 \uc6d0\uc7a5 \uac80\uc0ac\ub97c \ud1b5\uacfc\ud55c \uac83\ub9cc \uc4f4\ub2e4
    const want = Math.min(9, count * 3);
    aiAsked = want;
    aiPosts = await geminiPosts(env, want, ledger.rows.slice(0, 60).map(function(r) { return r.title; }), kst, w, wcat, pickTopics(want), hotTokens(ledger.idx));
  } catch (e) {
    aiPosts = null;
  }
  if (!aiPosts) { try { await gemDiscover(env); } catch (e) {} }
  let made = 0, kinds = [], rejected = (aiPosts && aiPosts.rej) ? aiPosts.rej.slice() : [];
  const aiQ = aiPosts ? aiPosts.slice() : [];
  for (let i = 0; i < count; i++) {
    let title = "", body = "", kind = "", usedStn = "";
    let aiCand = null;
    while (aiQ.length) {
      const c = aiQ.shift();
      if (!c || !c.t) continue;
      const why = seen[norm(c.t)] ? "same-title" : ledgerDupReason(ledger.idx, c.t, c.b);
      if (!why) { aiCand = c; break; }
      rejected.push(why);
    }
    if (aiCand) {
      kind = "ai";
      title = aiCand.t;
      body = aiCand.b;
    } else if (Math.random() < 0.6) {
      kind = "chat";
      var order = CHAT_POSTS.slice().sort(() => Math.random() - 0.5);
      var pick = null;
      for (const c of order) {
        if (!seen[norm(c.t)] && !ctxReject(holFix(c.t + "\n" + c.b, kst), kst, w, dc)) {
          pick = c;
          break;
        }
      }
      // \u2605 2026-09-22: \uc608\uc804\uc5d4 \uc2e0\uc120\ud55c \uae00\uc774 \uc5c6\uc73c\uba74 rnd(CHAT_POSTS)\ub85c '\ubb34\uc870\uac74' \uc544\ubb34\uac70\ub098
      //   \uace8\ub77c\uc11c \uc774\ubbf8 \uc37c\ub358 \uae00\uc744 \uadf8\ub300\ub85c \ub2e4\uc2dc \uc62c\ub838\ub2e4(YJ \uc81c\ubcf4 \uc6d0\uc778 1). \uc5b5\uc9c0\ub85c \ubc18\ubcf5\ud574\uc11c
      //   \ubcf4\uc5ec\uc8fc\ub290\ub2c8, \uc774\ubc88 \uc8fc\uae30\uc5d4 \uadf8\ub0e5 \uac74\ub108\ub6f4\ub2e4 \u2014 20\ubd84 \ub4a4 \ub2e4\uc74c \uc8fc\uae30\uc5d0 \ub2e4\uc2dc \uc2dc\ub3c4\ub41c\ub2e4.
      if (!pick) { continue; }
      title = holFix(pick.t, kst);
      body = holFix(pick.b, kst);
    } else {
      kind = "daily:" + slot.key;
      let pool = POOLS[slot.key] || POOLS.lunch;
      if (wcat && WEATHER_POOLS[wcat] && Math.random() < 0.35) {
        pool = WEATHER_POOLS[wcat];
        kind = "weather:" + wcat;
      }
      const L = rnd(LINES);
      const stn = rnd(L.stns);
      let stn2 = rnd(L.stns);
      if (stn2 === stn) stn2 = L.stns[(L.stns.indexOf(stn) + 1) % L.stns.length];
      const ctx = { line: L.name, stn, stn2, temp: w ? String(w.temp) : "30" };
      usedStn = stn;   // \u2605 2026-09-27: \uc544\ub798 \uc81c\ubaa9 \uc911\ubcf5 \ud0dc\uadf8\uac00 \uc774 \uac12\uc744 \uadf8\ub300\ub85c \uc4f0\uac8c \ud55c\ub2e4(\ubcf8\ubb38\uacfc \ud56d\uc0c1 \uac19\uc740 \uc5ed\uc774 \ub418\ub3c4\ub85d)
      let tpl = null;
      const ord2 = pool.slice().sort(() => Math.random() - 0.5);
      for (const cand of ord2) {
        const rx = tplRegex(cand.t);
        if (!recent.some((t) => rx.test(t || "")) && !ctxReject(holFix(fill(cand.t, ctx) + "\n" + fill(cand.b, ctx), kst), kst, w, dc)) {
          tpl = cand;
          break;
        }
      }
      // \u2605 2026-09-22: \uc5ec\uae30\ub3c4 \ub3d9\uc77c \u2014 \uc5b5\uc9c0 rnd(pool) \ubc18\ubcf5 \ub300\uc2e0 \uc774\ubc88\uc5d4 \uac74\ub108\ub6f4\ub2e4(YJ \uc81c\ubcf4 \uc6d0\uc778 2).
      if (!tpl) { continue; }
      title = holFix(fill(tpl.t, ctx), kst);
      body = holFix(fill(tpl.b, ctx), kst);
    }
    if (!title) continue;
    if (seen[norm(title)]) {
      if (kind.indexOf("daily:") === 0 || kind.indexOf("weather:") === 0) {
        // \u2605 2026-09-27 (YJ \uc9c0\uc2dc\ub85c \uc2e4\uce21 \ud655\uc778 \uc911 \ubc1c\uacac): \uc5ec\uae30\uc11c \ubd99\uc774\ub358 \uad6c\ubd84\uc6a9 \uc5ed\uba85\uc774 \ubcf8\ubb38\uc744
        //   \ucc44\uc6b4 \uc5ed(usedStn/ctx.stn)\uacfc \ubb34\uad00\ud558\uac8c \uc0c8\ub85c \ubb34\uc791\uc704\ub85c \ubf51\ud600\uc11c, \uc2e4\uc81c\ub85c \uc81c\ubaa9\uc5d4
        //   "(\uae40\ud3ec\uacf5\ud56d)"\uc778\ub370 \ubcf8\ubb38\uc740 "\uc778\ucc9c\uc2dc\uccad \uacc4\ub2e8\uc744..."\ucc98\ub7fc \uc11c\ub85c \ub2e4\ub978 \uc5ed\uc774 \ub098\uc624\ub294 \uae00\uc774
        //   production\uc5d0 \uc2e4\uc81c\ub85c \uc62c\ub77c\uac04 \uac78 \ud655\uc778\ud568(id 2112\u00b72113). \uad6c\ubd84 \ud0dc\uadf8\ub294 \ubc18\ub4dc\uc2dc
        //   \uc774 \uae00\uc774 \uc2e4\uc81c\ub85c \uc4f4 \uc5ed(usedStn)\uc774\uc5b4\uc57c \ubcf8\ubb38\uacfc \uc5b4\uae0b\ub098\uc9c0 \uc54a\ub294\ub2e4.
        var s2 = usedStn || rnd(rnd(LINES).stns);
        if (title.indexOf(s2) < 0) title = title + " (" + s2 + ")";
        if (seen[norm(title)]) continue;
      } else continue;
    }
    {
      // \u2605 \ud15c\ud50c\ub9bf \uae00\ub3c4 \uac19\uc740 \uc6d0\uc7a5 \uac80\uc0ac\ub97c \ud1b5\uacfc\ud574\uc57c \ud55c\ub2e4(AI \uae00\uc740 \uc704\uc5d0\uc11c \uc774\ubbf8 \ud1b5\uacfc)
      const why2 = kind === "ai" ? null : ledgerDupReason(ledger.idx, title, body);
      if (why2) { rejected.push(why2); continue; }
    }
    seen[norm(title)] = 1;
    const nick = rnd(NICKS);
    const views = rndInt(15, 350);
    const likes = rndInt(0, Math.max(1, Math.floor(views / 25)));
    try {
      const info = await env.DB.prepare("SELECT name FROM pragma_table_info('posts')").all();
      const cols = (info.results || []).map((r) => r.name);
      const data = {
        nick,
        title,
        body,
        cat: "\uc7a1\ub2f4",
        ts: Date.now(),
        views,
        likes,
        lols: 0,
        sads: 0,
        link: ""
      };
      const use = Object.keys(data).filter((k) => cols.indexOf(k) >= 0);
      if (!use.length) throw new Error("posts \ud14c\uc774\ube14 \uceec\ub7fc \ubd88\uc77c\uce58");
      const sql = "INSERT INTO posts (" + use.join(",") + ") VALUES (" + use.map(() => "?").join(",") + ")";
      await env.DB.prepare(sql).bind(...use.map((k) => data[k])).run();
      try {
        await env.DB.prepare("INSERT INTO post_ledger (ts, title, body) VALUES (?, ?, ?)").bind(data.ts, title, String(body).slice(0, 160)).run();
        ledgerAdd(ledger.idx, title, body, true);
      } catch (e) {
        console.log("[board-writer] \uc6d0\uc7a5 \uae30\ub85d \uc2e4\ud328:", e.message);
      }
      made++;
      kinds.push(kind);
    } catch (e) {
      console.log("[board-writer] INSERT \uc2e4\ud328:", e.message);
    }
  }
  try {
    await env.DB.prepare("DELETE FROM posts WHERE id NOT IN (SELECT id FROM posts ORDER BY id DESC LIMIT " + MAX_POSTS + ")").run();
  } catch (e) {
  }
  const pres = { made, slot: slot.key, weather: wcat || "normal", kinds, rejected };
  await bwDiag(env, "posts", { day: dc.t.ymd + (dc.t.hol ? ":" + dc.t.hol : ""), slot: slot.key, count: count, made: made, kinds: kinds, asked: aiAsked, aiGot: aiPosts ? aiPosts.length : 0, rej: rejected.slice(0, 4).map((x) => String(x).slice(0, 32)), gem: _gemLast });
  return pres;
}
__name(generatePosts, "generatePosts");

// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
// \u2605 2026-10-03: \uae00 \ub313\uae00\ub3c4 \uc11c\ubc84\uac00 \ub9cc\ub4e4\uc5b4 \ubaa8\ub4e0 \uc0ac\uc6a9\uc790\uc5d0\uac8c \ub611\uac19\uc774 \ubcf4\uc5ec\uc900\ub2e4 (generateComments)
//   \uadf8\ub3d9\uc548 \uc11c\ubc84 \uae00(isServer)\uc758 \ub313\uae00\uc740 \uc571\uc774 \uae30\uae30\ub9c8\ub2e4 \ud15c\ud50c\ub9bf\uc73c\ub85c \ub530\ub85c \ubd99\uc600\ub2e4(\uae30\uae30\ub9c8\ub2e4 \ub2e4\ub974\uace0, \uc6d0\uc7a5\uc740 30\uc77c).
//   \u00b7 \ucd5c\uadfc 36\uc2dc\uac04 \uc548\uc758 \uae00 \uc911 \ub313\uae00\uc774 \uc801\uc740 \uae00\uc5d0 \uc0ac\uc774\ud074\ub9c8\ub2e4 \ucd5c\ub300 10\uac1c\ub97c \ubd99\uc778\ub2e4.
//   \u00b7 \ub313\uae00 \uc2dc\uac01(ts)\uc740 \ub2e4\uc74c 19\ubd84 \uc548\uc5d0 \ud769\ubfcc\ub824 \uc800\uc7a5\ud558\uace0, GET /comments \ub294 ts<=\uc9c0\uae08 \uc778 \uac83\ub9cc \ub0b4\ub824\uc900\ub2e4.
//   \u00b7 6\uac1c\uc6d4 \uc911\ubcf5 \uae08\uc9c0: \ucc44\ud305(talks)\uacfc \uac19\uc740 talk_ledger \ub97c \uc4f4\ub2e4 \u2014 \ucc44\ud305\u00b7\ub313\uae00\uc744 \ud1b5\ud2c0\uc5b4 \uac19\uc740 \ub9d0\uc774 183\uc77c \uc548\uc5d0 \ub2e4\uc2dc \uc548 \ub098\uc628\ub2e4.
//     (3\uae00\uc790 \ubbf8\ub9cc \ucd94\uc784\uc0c8\ub294 \uc81c\uc678 \u2014 \uc704 talk_ledger \uc124\uba85 \ucc38\uace0)
//   \u00b7 Gemini \uac00 \uc5c6\uac70\ub098 \uc2e4\ud328\ud558\uba74 \uc774\ubc88 \uc8fc\uae30\ub294 \ub313\uae00\uc744 \uc548 \ub9cc\ub4e0\ub2e4(\ud15c\ud50c\ub9bf \ubc18\ubcf5\uc73c\ub85c \uc911\ubcf5\uc744 \ub9cc\ub4e4\uc9c0 \uc54a\uae30 \uc704\ud574).
// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
var CMT_TARGET_MAX = 12;       // \uae00\ub2f9 \uc11c\ubc84 \ub313\uae00 \uc0c1\ud55c
var CMT_PER_CYCLE = 10;        // \ud55c \uc0ac\uc774\ud074\uc5d0 \uc0c8\ub85c \ubd99\uc774\ub294 \ucd5c\ub300 \ub313\uae00 \uc218
async function geminiComments(env, posts, perPost, kst, w, wcat) {
  if (!env.GEMINI_KEY || !posts.length) return null;
  try {
    const list = posts.map(function(p) { return "[" + p.id + "] \uc81c\ubaa9: " + p.title + "\n\ubcf8\ubb38: " + String(p.body || "").slice(0, 160).replace(/\n/g, " / "); }).join("\n\n");
    const personas = NICKS.slice().sort(() => Math.random() - 0.5).slice(0, 12).join(", ");
    const prompt = "\ud55c\uad6d \uc9c0\ud558\ucca0\xB7\ubc84\uc2a4 \uc774\uc6a9\uc790 \ucee4\ubba4\ub2c8\ud2f0 \uac8c\uc2dc\ud310\uc758 \uae00\uc5d0 \ub2ec\ub9ac\ub294 \ub313\uae00\uc744 \uc4f4\ub2e4. \uc9c0\uae08: " + slotLabel(kst) + ctxBlock(kst, w, wcat) + "\n\uc544\ub798 \uae00\ub9c8\ub2e4 \uc11c\ub85c \ub2e4\ub978 \uc0ac\ub78c\uc774 \ub2e8 \uac83\ucc98\ub7fc \ub313\uae00\uc744 " + perPost + "\uac1c\uc529 \uc368\ub77c.\n" + list + "\n\uaddc\uce59:\n1. \uadf8 \uae00\uc758 \ub0b4\uc6a9\uc5d0 \uc9c1\uc811 \ubc18\uc751(\uacf5\uac10\xB7\ub418\ubb3b\uae30\xB7\ub18d\ub2f4\xB7\uacbd\ud5d8\ub2f4\xB7\ucd94\ucc9c). \uae00 \uc81c\ubaa9\uc744 \uadf8\ub300\ub85c \ub530\ub77c \uc4f0\uc9c0 \ub9c8\ub77c.\n2. 5~40\uc790, \ubc18\ub9d0\xB7\ud3b8\ud55c \ub9d0\ud22c, \u314b\u314b\xB7\u3160\u3160 \uac00\ub054. \uac19\uc740 \ubb38\uc7a5 \ud2c0\xB7\uac19\uc740 \uccab \ub2e8\uc5b4 \ubc18\ubcf5 \uae08\uc9c0(\ud2b9\ud788 \"\u3147\u3148\", \"\uacf5\uac10\", \"\ub9de\uc544\uc694\"\ub85c\ub9cc \uc2dc\uc791\ud558\uc9c0 \ub9d0 \uac83).\n3. \ub2c9\ub124\uc784\uc740 \uc774 \uc911\uc5d0\uc11c: " + personas + "\n4. \uc815\uce58\xB7\ud610\uc624\xB7\uc695\uc124\xB7\uc2e4\uc874\uc778\ubb3c \ube44\ubc29 \uae08\uc9c0.\nJSON \ubc30\uc5f4\ub9cc \ucd9c\ub825: [{\"p\":\uae00\ubc88\ud638,\"n\":\"\ub2c9\",\"t\":\"\ub313\uae00\"}]";
    const r = await gemFetch(env, 12e3, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.95, topP: 0.95, maxOutputTokens: 4e3 } })
    });
    if (!r.ok) return null;
    const d = await r.json();
    let txt = "";
    try {
      txt = d.candidates[0].content.parts.map((p) => p.text || "").join("");
    } catch (e) {
      return null;
    }
    const arr = parseJsonArr(txt);
    if (!arr) return null;
    const ids = {};
    posts.forEach(function(p) { ids[p.id] = 1; });
    return arr.filter((x) => x && x.p != null && ids[parseInt(x.p, 10)] && x.n && x.t).map((x) => ({ post_id: parseInt(x.p, 10), nick: String(x.n).slice(0, 16), text: holFix(String(x.t).slice(0, 80).trim(), kst) })).filter((x) => !aiJunk(x.text) && !ctxReject(x.text, kst, w));
  } catch (e) {
    return null;
  }
}
__name(geminiComments, "geminiComments");
async function generateComments(env) {
  const kst = kstNow();
  const cols = await getCols(env, "comments");
  if (!cols.length) return { made: 0, skipped: "no-comments-table" };
  const cut = Date.now() - 36 * 3600e3;
  const ps = await env.DB.prepare("SELECT id, title, body FROM posts WHERE ts > ? ORDER BY id DESC LIMIT 14").bind(cut).all();
  const posts = ps.results || [];
  if (!posts.length) return { made: 0, skipped: "no-recent-posts" };
  const cnt = {};
  const cs = await env.DB.prepare("SELECT post_id, COUNT(*) AS n FROM comments WHERE post_id IN (" + posts.map(function() { return "?"; }).join(",") + ") GROUP BY post_id").bind(...posts.map(function(p) { return p.id; })).all();
  (cs.results || []).forEach(function(r) { cnt[r.post_id] = r.n; });
  // \ub313\uae00\uc774 \uc801\uc740 \uae00\uc744 \uc6b0\uc120, \uac19\uc73c\uba74 \ucd5c\uc2e0 \uae00 \uc6b0\uc120. \uc0c8 \uae00\uc77c\uc218\ub85d \ubaa9\ud45c \uac1c\uc218\ub97c \ub192\uac8c(3~12) \uc7a1\ub294\ub2e4.
  const cand = posts.map(function(p, i) { return { p: p, n: cnt[p.id] || 0, want: Math.max(3, CMT_TARGET_MAX - i) }; })
    .filter(function(x) { return x.n < x.want; })
    .sort(function(a, b) { return a.n - b.n; })
    .slice(0, 5);
  if (!cand.length) return { made: 0, skipped: "enough" };
  const cw = await getWeather();
  const gen = await geminiComments(env, cand.map(function(x) { return x.p; }), 3, kst, cw, weatherCat(cw));
  if (!gen || !gen.length) { await bwDiag(env, "comments", { skipped: "gemini-none", gem: _gemLast }); return { made: 0, skipped: "gemini-none" }; }
  let kept;
  try {
    const clean = gen.filter(function(g) { return g.text && !containsBadWord(g.text) && !containsBadWord(g.nick); });
    kept = await talkLedgerFilter(env, clean);
  } catch (e) {
    console.log("[board-writer][comments] \uc6d0\uc7a5 \ucc98\ub9ac \uc2e4\ud328, \uc774\ubc88 \uc8fc\uae30\ub294 \uac74\ub108\ub700:", e.message);
    return { made: 0, skipped: "ledger-failed" };
  }
  // \uae00\ub9c8\ub2e4 \uc0c1\ud55c\uc744 \ub118\uae30\uc9c0 \uc54a\uac8c \uc790\ub974\uace0, \ud55c \uc0ac\uc774\ud074 \ucd1d\ub7c9\ub3c4 \uc81c\ud55c
  const per = {};
  kept = kept.filter(function(g) {
    const have = (cnt[g.post_id] || 0) + (per[g.post_id] || 0);
    if (have >= CMT_TARGET_MAX) return false;
    per[g.post_id] = (per[g.post_id] || 0) + 1;
    return true;
  }).slice(0, CMT_PER_CYCLE);
  const SPAN = 19 * 60e3;
  let made = 0;
  for (const g of kept) {
    const ts = Date.now() + 20e3 + Math.floor(Math.random() * SPAN);
    try {
      const data = { post_id: g.post_id, nick: g.nick, body: g.text, ts };
      const use = Object.keys(data).filter((k) => cols.indexOf(k) >= 0);
      await env.DB.prepare("INSERT INTO comments (" + use.join(",") + ") VALUES (" + use.map(() => "?").join(",") + ")").bind(...use.map((k) => data[k])).run();
      made++;
    } catch (e) {
      console.log("[board-writer] \ub313\uae00 INSERT \uc2e4\ud328:", e.message);
      break;
    }
  }
  await bwDiag(env, "comments", { made: made, asked: gen.length, kept: kept.length, gem: _gemLast });
  return { made, asked: gen.length, kept: kept.length };
}
__name(generateComments, "generateComments");
var MAX_TALKS = 400;
function talkCount(kst) {
  const h = kst.getUTCHours();
  const weekend = isRestDay(kst);
  let n;
  if (h < 6) n = rndInt(8, 20);
  else if (h < 9) n = weekend ? rndInt(40, 70) : rndInt(140, 200);
  else if (h < 11) n = weekend ? rndInt(50, 80) : rndInt(80, 120);
  else if (h < 14) n = weekend ? rndInt(70, 110) : rndInt(130, 190);
  else if (h < 17) n = weekend ? rndInt(60, 100) : rndInt(80, 120);
  else if (h < 20) n = weekend ? rndInt(70, 110) : rndInt(140, 200);
  else if (h < 23) n = rndInt(70, 110);
  else n = rndInt(20, 40);
  return n;
}
__name(talkCount, "talkCount");
function slotLabel(kst) {
  const h = kst.getUTCHours();
  const c = dayCtx(kst), t = c.t;
  let tm;
  if (h < 6) tm = "\uc0c8\ubcbd";
  else if (h < 9) tm = "\ucd9c\uadfc \uc2dc\uac04";
  else if (h < 11) tm = "\uc624\uc804";
  else if (h < 14) tm = "\uc810\uc2ec\uc2dc\uac04";
  else if (h < 17) tm = "\uc624\ud6c4";
  else if (h < 20) tm = "\ud1f4\uadfc \uc2dc\uac04";
  else tm = "\ubc24";
  // \u2605 2026-10-05: '\uc6d4\uc694\uc77c (\ud3c9\uc77c)'\ub85c \ub098\uac00\ub358 \uac1c\ucc9c\uc808 \ub300\uccb4\uacf5\ud734\uc77c \u2014 \ub0a0\uc9dc\u00b7\uc694\uc77c\u00b7\uacf5\ud734\uc77c \uc774\ub984\u00b7\uc26c\ub294 \ub0a0 \uc5ec\ubd80\ub97c \ud568\uaed8 \uc801\ub294\ub2e4. \uc26c\ub294 \ub0a0\uc774\uba74 '\ucd9c\uadfc \uc2dc\uac04'\uc740 '\uc774\ub978 \uc544\uce68'.
  if (t.rest && tm === "\ucd9c\uadfc \uc2dc\uac04") tm = "\uc774\ub978 \uc544\uce68";
  if (t.rest && tm === "\ud1f4\uadfc \uc2dc\uac04") tm = "\uc800\ub141 \ubb34\ub835";
  return t.m + "\uc6d4 " + t.d + "\uc77c " + DOW_KO[t.dow] + "\uc694\uc77c" + (t.hol ? "(" + t.hol + ")" : "") + " " + tm + (t.rest ? " (\uc26c\ub294 \ub0a0)" : " (\ud3c9\uc77c)");
}
__name(slotLabel, "slotLabel");
var TALK_DIALOGS = {
  rush: [
    ["{stn} \uc9c0\uae08 \uc0ac\ub78c \ud130\uc9d0", "\u3139\u3147 \ubc29\uae08 \ub450 \ub300 \ubcf4\ub0c4", "\ub2e4\ub4e4 \ud798\ub0b4\ub77c\u2026", "\uae09\ud589\uc740 \uc880 \ub0ab\ub0d0", "\uae09\ud589\uc774 \ub354 \uc2ec\ud568 \u314b\u314b", "\uc624\ub298\ub530\ub77c \uc65c \uc774\ub7fc"],
    ["{line} \ub610 \uc9c0\uc5f0\uc774\ub0d0", "\uc548\ub0b4\ubc29\uc1a1 \ub098\uc634?", "\uc55e \uc5f4\ucc28 \uac04\uaca9 \uc870\uc815\uc774\ub798", "\ub9e8\ub0a0 \uac04\uaca9 \uc870\uc815 \u314b\u314b", "\uc9c0\uac01\uc774\ub2e4 \uc9c0\uac01"],
    ["\uc790\ub9ac \uc549\uc740 \uc0ac\ub78c \uc624\ub298 \uc6b4\uc138 \ubb34\uc5c7", "\ubd80\ub7fd\ub2e4", "\ub098\ub294 \uc138 \uc815\uac70\uc7a5\uc9f8 \uc11c\uc788\uc74c", "{stn}\ucbe4 \ub418\uba74 \uc880 \ube60\uc9d0", "\uac70\uae30\uae4c\uc9c0\uac00 \uace0\ube44\uc9c0"],
    ["\uc5d0\uc5b4\ucee8 \ube75\ube75\ud55c \uce78 \ucc3e\uc74c", "\uba87 \ubc88\uc9f8 \uce78?", "\uc911\uac04\ucbe4\uc774 \uc2dc\uc6d0\ud568", "\uc57d\ub0c9\ubc29\uce78\uc740 \ud53c\ud574\ub77c", "\u3147\u3148 \uac70\uae34 \uc0ac\uc6b0\ub098"]
  ],
  lunch: [
    ["\uc810\uc2ec \ubb50 \uba39\uc9c0", "\uad6d\ubc25 \u3131?", "\uc5b4\uc81c\ub3c4 \uad6d\ubc25\uc774\uc5c8\uc796\uc544 \u314b\u314b", "\uadf8\ub7fc \ub3c8\uae4c\uc2a4", "{stn} \uadfc\ucc98 \ub3c8\uae4c\uc2a4 \ub9db\uc9d1 \uc788\uc74c?", "\uc5ed 3\ubc88\ucd9c\uad6c \ucabd\uc5d0 \ud558\ub098 \uc788\uc74c"],
    ["\uc6e8\uc774\ud305 30\ubd84\uc774\ub798\u2026", "\ub2e4\ub978 \ub370 \uac00\uc790", "\uc774 \uc2dc\uac04\uc5d0\ub294 \uc5b4\ub51c \uac00\ub098 \ub611\uac19\uc74c", "\ud3b8\uc758\uc810 \ub3c4\uc2dc\ub77d \uac01", "\uadf8\uac83\ub3c4 \ub098\uc058\uc9c0 \uc54a\uc9c0"],
    ["\uc2dd\ud6c4 \ucee4\ud53c\ub294 \uad6d\ub8f0", "\uc544\uc544 vs \ub77c\ub5bc", "\uc774 \ub0a0\uc528\uc5d4 \ubb34\uc870\uac74 \uc544\uc544", "\uc778\uc815", "\ucee4\ud53c \uc5c6\uc778 \uc624\ud6c4 \ubabb \ubc84\ud300"]
  ],
  day: [
    ["\uc624\ud6c4 \ub418\ub2c8\uae4c \uc878\ub9ac\ub2e4", "\ucee4\ud53c \ub9c8\uc168\ub294\ub370\ub3c4 \uc7a0\uc634", "3\uc2dc\uac00 \uc81c\uc77c \uace0\ube44", "\ud1f4\uadfc\uae4c\uc9c0 \uc138 \uc2dc\uac04\u2026", "\ud30c\uc774\ud305"],
    ["\uc678\uadfc \ub098\uc654\ub294\ub370 \uc9c0\ud558\ucca0 \ud55c\uc0b0\ud574\uc11c \uc88b\ub2e4", "\uc774 \uc2dc\uac04\uc774 \uafc0\uc774\uc9c0", "\uc549\uc544\uc11c \uac00\ub294 \uc9c0\ud558\ucca0 \uc624\ub79c\ub9cc", "\ubd80\ub7fd", "\ub7ec\uc2dc\uc544\uc6cc\ub9cc \ud53c\ud558\uba74 \uc0b4\ub9cc\ud568"]
  ],
  evening: [
    ["\uce7c\ud1f4 \uc131\uacf5", "\ubd80\ub7fd\ub2e4 \ub09c \uc544\uc9c1 \ud68c\uc0ac", "\uc624\ub298\uc740 \uc77c\ucc0d \ub4e4\uc5b4\uac00\uc11c \uc26c\uc5b4\uc57c\uc9c0", "{stn}\ucabd \ubc8c\uc368 \ubd90\ube54?", "\ubd90\ube44\uae30 \uc2dc\uc791\ud568 \uc11c\ub458\ub7ec"],
    ["\uc800\ub141 \uc57d\uc18d \uac00\ub294 \uae38", "\ubb50 \uba39\uc73c\ub7ec \uac10?", "\uace0\uae30 \uba39\uc73c\ub7ec \u314b\u314b", "\uc88b\uaca0\ub2e4 \ub09c \uc9d1\ubc25", "\uc9d1\ubc25\uc774 \ucd5c\uace0\uc784 \uc0ac\uc2e4"],
    ["\ud1f4\uadfc\uae38 \ub178\ub798 \ucd94\ucc9c \uc880", "\uc694\uc998 \ucc28\ud2b8 \ud2c0\uc5b4\ub193\uc73c\uba74 \ubb34\ub09c\ud568", "\ud31f\uce90\uc2a4\ud2b8\ub3c4 \uad1c\ucc2e\uc74c", "\ub0b4\uc77c \ucd9c\uadfc \uc0dd\uac01\ud558\uba74 \ubc8c\uc368 \ud53c\uace4", "\uadf8 \uc0dd\uac01\uc740 \ub0b4\uc77c \ud558\uc790"]
  ],
  night: [
    ["\uc774\uc81c \uc9d1 \uac00\ub294 \uc0ac\ub78c?", "\uc57c\uadfc \ub05d\ub0ac\ub2e4\u2026", "\uc218\uace0\ud588\uc5b4\uc694", "\ub9c9\ucc28 \uc2dc\uac04 \ud655\uc778\ub4e4 \ud558\uc148", "\uc544\uc9c1 \uc5ec\uc720 \uc788\uc74c"],
    ["\uc624\ub298 \ud558\ub8e8 \uc21c\uc0ad", "\ub0b4\uc77c\uc774 \ubc8c\uc368 \ubb34\uc12d\ub2e4", "\uc790\uae30 \uc804\uc5d0 \ubb50\ub77c\ub3c4 \ud558\ub098 \ud558\uc790", "\uce58\ub9e5 \uac01\uc778\ub370", "\ucc38\uc544\ub77c \u314b\u314b"]
  ],
  dawn: [
    ["\uc774 \uc2dc\uac04\uc5d0 \uae68\uc788\ub294 \uc0ac\ub78c \uc788\uc74c?", "\uc57c\uadfc \ub05d\ub098\uace0 \uc9d1 \uac00\ub294 \uc911", "\uace0\uc0dd\ud588\ub2e4 \uc9c4\uc9dc", "\uccab\ucc28\uae4c\uc9c0 \ubc84\ud2f4\ub2e4", "\ub2e4\ub4e4 \ubb34\uc0ac\uadc0\uac00"],
    ["\uc0c8\ubcbd \uc9c0\ud558\ucca0\uc740 \uc870\uc6a9\ud574\uc11c \uc88b\uc74c", "\uc57d\uac04 \uac10\uc131\uc801\uc774 \ub428", "\ub178\ub798 \ub4e4\uc73c\uba74\uc11c \uac00\ub294 \uc911", "\ud479 \uc26c\uc5b4\uc694 \ub2e4\ub4e4"]
  ],
  weekendNight: [
    ["\uc8fc\ub9d0 \uc798 \ubcf4\ub0c8\ub0d0", "\u3147\u3147 \ud558\ub8e8 \uc21c\uc0ad", "\ub098\ub294 \uc9d1\uc5d0\uc11c \ub4b9\uad74", "\uadf8\uac83\ub3c4 \uc644\ubcbd\ud55c \uc8fc\ub9d0\uc774\uc9c0", "\ub0b4\uc77c \uac71\uc815\uc740 \ub0b4\uc77c \ud558\uc790"],
    ["\uc77c\uc694\uc77c \ubc24 \ud2b9\uc720\uc758 \uc2f1\uc22d\uc0dd\uc22d\ud568", "\uc774 \uae30\ubd84 \ubb54\uc9c0 \ub2e4 \uc54c\uc796\uc544 \u314b\u314b", "\uc57c\uc2dd\uc774\ub098 \uc2dc\ud0a4\uc790", "\uce58\ud0a8 \ucf5c?", "\uc0b4\uc740 \uc8fc\ub9d0\uc5d0 \uc548 \ucc10\ub2e4\ub294 \uc124"],
    ["\uc8fc\ub9d0 \ub9c8\ubb34\ub9ac \ubb50\ud568?", "\ub137\ud50c \ubcf4\ub294 \uc911", "\ub098\ub294 \uc77c\ucc0d \uc798 \uc900\ube44", "\ubd80\uc9c0\ub7f0\ud558\ub124", "\ub0b4\uc77c\uc744 \uc704\ud55c \ud22c\uc790\uc784"]
  ],
  weekendDay: [
    ["\uc8fc\ub9d0\uc778\ub370 \ub2e4\ub4e4 \uc5b4\ub514 \uac10?", "{stn} \ub098\ub4e4\uc774 \uc911", "\ub0a0\uc528 \uc88b\uc544\uc11c \ub098\uc634", "\uc9d1\uc774 \ucd5c\uace0\uc778 \uc0ac\ub78c\ub3c4 \uc788\uc74c \u314b\u314b", "\uadf8\uac83\ub3c4 \uc778\uc815"],
    ["\uc8fc\ub9d0 \uc9c0\ud558\ucca0 \uc5ec\uc720\ub86d\ub2e4", "\ud3c9\uc77c\uc774\ub791 \uc644\uc804 \ub2e4\ub984", "\uc549\uc544\uc11c \uac00\ub294 \uac8c \uc774\ub807\uac8c \uc88b\uc740 \uac70\uc600\ub098", "\uc8fc\ub9d0\uc5d4 \uc2dc\uac04\ub3c4 \ucc9c\ucc9c\ud788 \uac00\ub294 \ub290\ub08c"]
  ],
  rain: [
    ["\ube44 \uc3df\uc544\uc9c4\ub2e4", "\uc6b0\uc0b0 \uc5c6\ub294\ub370 \u3160\u3160", "\ud3b8\uc758\uc810 \uc6b0\uc0b0 \uc0ac\uc148", "\uc9d1\uc5d0 \ud3b8\uc758\uc810 \uc6b0\uc0b0\ub9cc \ub2e4\uc12f \uac1c\uc784 \u314b\u314b", "{stn} \ucd9c\uad6c \uc6b0\uc0b0 \uc815\uccb4 \uc2ec\ud568"],
    ["\ube44 \uc624\ub2c8\uae4c \uc9c0\ud558\ucca0\uc774 \uafc9\uafc9\ud558\ub124", "\uc2b5\uae30 \uc7a5\ub09c \uc544\ub2d8", "\uadf8\ub798\ub3c4 \ubc84\uc2a4\ubcf4\ub2e4 \ub0ab\ub2e4", "\u3147\u3148 \ub3c4\ub85c \ub9c9\ud790 \ub4ef"]
  ],
  hot: [
    ["\ubc16\uc5d0 {temp}\ub3c4 \uc2e4\ud654\ub0d0", "\uc775\ub294\ub2e4 \uc775\uc5b4", "\uc9c0\ud558\ucca0 \uc5d0\uc5b4\ucee8\uc774 \uad6c\uc6d0\uc784", "\ub0b4\ub9ac\uae30 \uc2eb\ub2e4 \u314b\u314b", "\ubb3c \ucc59\uaca8 \ub2e4\ub2c8\uc148"],
    ["\ub4f1\uc5d0 \ub540 \uc904\uc904", "\uc624\ub298 \ucd5c\uace0\uae30\uc628 \uba87 \ub3c4\ub798?", "{temp}\ub3c4 \ub118\ub294\ub300", "\uc5ec\ub984 \uc2eb\ub2e4\u2026", "\uaca8\uc6b8\uc5d4 \uc5ec\ub984\uc774 \uadf8\ub9ac\uc6b8\uac78"]
  ],
  cold: [
    ["\ud50c\ub7ab\ud3fc \uac1c\ucd94\uc6c0", "\ubc1c \uc5bc\uaca0\ub2e4", "\ud788\ud130 \uc790\ub9ac \uc549\uc73c\uba74 \ucc9c\uad6d", "\uadf8 \uc790\ub9ac \uacbd\uc7c1 \uce58\uc5f4\ud568 \u314b\u314b", "\ubaa9\ub3c4\ub9ac \ud544\uc218"],
    ["\ud55c\ud30c\uc5d0 \uc9c0\ud558\ucca0 \uae30\ub2e4\ub9ac\ub294 \uac70 \uace0\ubb38\uc784", "\uc2a4\ud06c\ub9b0\ub3c4\uc5b4 \uc788\ub294 \uc5ed\uc774 \ucd5c\uace0", "{line}\uc740 \uc880 \ub098\uc740 \ud3b8", "\uaca8\uc6b8\uc544 \ube68\ub9ac \uac00\ub77c"]
  ]
};
function pickDialogKey(kst, wcat) {
  if (wcat === "rain") return Math.random() < 0.5 ? "rain" : null;
  if (wcat === "hot") return Math.random() < 0.4 ? "hot" : null;
  if (wcat === "cold") return Math.random() < 0.4 ? "cold" : null;
  return null;
}
__name(pickDialogKey, "pickDialogKey");
function slotDialogKey(kst) {
  const h = kst.getUTCHours();
  const weekend = isRestDay(kst);
  if (h < 6) return "dawn";
  if (weekend) return h < 18 ? "weekendDay" : "weekendNight";
  if (h < 9) return "rush";
  if (h < 14) return "lunch";
  if (h < 17) return "day";
  if (h < 20) return "evening";
  return "night";
}
__name(slotDialogKey, "slotDialogKey");
function _slotTopicsBase(kst) {
  const h = kst.getUTCHours();
  const we = isRestDay(kst);
  if (h < 6) return { ok: "\uc0c8\ubcbd \uac10\uc131, \uc57c\uac04 \uc54c\ubc14\xB7\uc57c\uadfc \uadc0\uac00, \uc7a0 \uc548 \uc634, \uccab\ucc28 \uae30\ub2e4\ub9bc", no: "\uc810\uc2ec \uba54\ub274, \ud1f4\uadfc \ub7ec\uc2dc" };
  if (we) {
    if (h < 11) return { ok: "\uc8fc\ub9d0 \ub2a6\uc7a0, \ube0c\ub7f0\uce58, \ub098\ub4e4\uc774 \uc900\ube44, \uc57d\uc18d \uc7a1\uae30", no: "\ucd9c\uadfc, \uc218\uc5c5, \ud68c\uc0ac, \ud559\uad50" };
    if (h < 14) return { ok: "\uc8fc\ub9d0 \uc810\uc2ec, \ub098\ub4e4\uc774 \uc911, \uce74\ud398, \uc57d\uc18d\xB7\ub370\uc774\ud2b8", no: "\ud68c\uc0ac, \uc218\uc5c5, \uc57c\uadfc" };
    if (h < 18) return { ok: "\uc8fc\ub9d0 \uc624\ud6c4 \ub098\ub4e4\uc774, \uce74\ud398, \uc1fc\ud551, \uc9d1\ucf55, \ub0ae\uc7a0", no: "\uc810\uc2ec \uba54\ub274 \uace0\ub974\uae30(\uc9c0\ub0a8), \ud68c\uc0ac, \uc218\uc5c5" };
    return { ok: "\uc8fc\ub9d0 \uc800\ub141 \uadc0\uac00, \uc800\ub141 \uc57d\uc18d, \uc77c\uc694\uc77c \ubc24 \uc6d4\uc694\ubcd1, \uc57c\uc2dd", no: "\uc810\uc2ec, \ucd9c\uadfc, \uc218\uc5c5" };
  }
  if (h < 9) return { ok: "\ucd9c\uadfc\xB7\ub4f1\uad50 \ub7ec\uc2dc, \uc9c0\uac01 \uc704\uae30, \ub9cc\uc6d0 \uc9c0\ud558\ucca0\xB7\ubc84\uc2a4, \uc544\uce68\uc7a0, 1\uad50\uc2dc \uac71\uc815", no: "\uc810\uc2ec \uba54\ub274, \ud1f4\uadfc" };
  if (h < 11) return { ok: "\uc624\uc804 \uc218\uc5c5\xB7\uc5c5\ubb34, \ud68c\uc758, \uc878\ub9bc, \ucee4\ud53c \uc218\ud608, \uacfc\uc81c \ub9c8\uac10", no: "\ud1f4\uadfc, \ud558\uad50" };
  if (h < 14) return { ok: "\uc810\uc2ec \uba54\ub274, \ud559\uc2dd\xB7\uad6c\ub0b4\uc2dd\ub2f9, \uae09\uc2dd, \uc2dd\ud6c4 \ucee4\ud53c\xB7\uc0b0\ucc45", no: "\ucd9c\uadfc \ub7ec\uc2dc, \ud1f4\uadfc \ub7ec\uc2dc" };
  if (h < 17) return { ok: "\uc624\ud6c4 \uc2ac\ub7fc\ud504, \uc878\ub9bc, \uac04\uc2dd, \ub0a8\uc740 \uc218\uc5c5\xB7\uc5c5\ubb34, \ud1f4\uadfc\xB7\ud558\uad50 \uce74\uc6b4\ud2b8\ub2e4\uc6b4, \uc57c\uc790\xB7\ud559\uc6d0 \uac71\uc815", no: "\uc810\uc2ec \uba54\ub274 \uc598\uae30(\uc774\ubbf8 \uc9c0\ub0a8), \uc544\uce68 \ucd9c\uadfc" };
  if (h < 20) return { ok: "\ud1f4\uadfc\xB7\ud558\uad50 \ub7ec\uc2dc, \uc800\ub141 \uba54\ub274, \uc800\ub141 \uc57d\uc18d, \ud559\uc6d0 \uc774\ub3d9, \uc9c0\uc625\ucca0", no: "\uc810\uc2ec \uba54\ub274, \uc544\uce68 \ucd9c\uadfc" };
  return { ok: "\uc57c\uadfc, \uacfc\uc81c\xB7\uc2dc\ud5d8\uacf5\ubd80, \uc57c\uc790 \ub05d \uadc0\uac00, \ud558\ub8e8 \ub9c8\ubb34\ub9ac, \ub0b4\uc77c \uac71\uc815, \ud734\uc2dd", no: "\uc810\uc2ec \uba54\ub274, \ucd9c\uadfc \ub7ec\uc2dc" };
}
__name(_slotTopicsBase, "_slotTopicsBase");
function slotTopics(kst) {
  const r = _slotTopicsBase(kst);
  const c = dayCtx(kst), h = kst.getUTCHours();
  let ok = r.ok, no = r.no;
  if (c.hw) ok = ok.replace(/\uc8fc\ub9d0/g, "\ud734\uc77c");
  if (c.t.rest && h >= 18) {
    // \uc26c\ub294 \ub0a0 \uc800\ub141: \ub0b4\uc77c\ub3c4 \uc26c\uba74 \uc6d4\uc694\ubcd1\u00b7\ucd9c\uadfc \uac71\uc815 \uae08\uc9c0, \ub0b4\uc77c\uc774 \ud3c9\uc77c\uc774\uba74 \ud734\uc77c\uc758 \ub9c8\uc9c0\ub9c9 \uc800\ub141
    ok = ok.replace("\uc77c\uc694\uc77c \ubc24 \uc6d4\uc694\ubcd1", c.tm.rest ? "\ub0b4\uc77c\ub3c4 \uc26c\ub294 \ub0a0\uc774\ub77c \ub290\uae0b\ud55c \uc800\ub141" : "\ud734\uc77c \ub9c8\uc9c0\ub9c9 \uc800\ub141, \ub0b4\uc77c \ucd9c\uadfc\u00b7\ub4f1\uad50 \uac71\uc815");
    if (c.tm.rest) no += ", \uc6d4\uc694\ubcd1, \ub0b4\uc77c \ucd9c\uadfc\u00b7\ub4f1\uad50";
  } else if (!c.t.rest && h >= 20 && c.tm.rest) {
    ok = ok.replace("\ub0b4\uc77c \uac71\uc815", "\ub0b4\uc77c \uc26c\ub294 \ub0a0\uc774\ub77c \uc5ec\uc720(\uc57d\uc18d\u00b7\ud55c\uc794\u00b7\uc57c\uc2dd\u00b7\ub2a6\uc7a0 \uacc4\ud68d)");
    no += ", \uc6d4\uc694\ubcd1, \ub0b4\uc77c \ucd9c\uadfc\u00b7\ub4f1\uad50";
  }
  if (c.t.rest) no += ", \uc624\ub298 \ucd9c\uadfc\u00b7\ub4f1\uad50\ud558\ub294 \uac83\ucc98\ub7fc \ub9d0\ud558\uae30";
  return { ok: ok, no: no };
}
__name(slotTopics, "slotTopics");
// \u2605 2026-10-10: \ubaa8\ub378 \ucd9c\ub825\uc5d0\uc11c JSON \ubc30\uc5f4\ub9cc \ubf51\ub294\ub2e4(Gemma \ub294 \uc55e\ub4a4\uc5d0 \uc124\uba85\uc744 \ubd99\uc774\uae30\ub3c4 \ud55c\ub2e4) / \ub9d0\uc904\uc784\ud45c \uc870\uac01\u00b7\uc774\ubaa8\uc9c0 \ubc94\ubc85 \uac19\uc740 \uae68\uc9c4 \ubb38\uc7a5 \ud310\ubcc4
function parseJsonArr(txt) {
  let t = String(txt || "").replace(/```json|```/g, "").trim();
  try { const a = JSON.parse(t); if (Array.isArray(a)) return a; } catch (e) {}
  const i = t.indexOf("["), j = t.lastIndexOf("]");
  if (i >= 0 && j > i) { try { const a = JSON.parse(t.slice(i, j + 1)); if (Array.isArray(a)) return a; } catch (e) {} }
  return null;
}
__name(parseJsonArr, "parseJsonArr");
function aiJunk(text) {
  const t = String(text || "");
  const ell = (t.match(/\u2026|\.{3,}/g) || []).length;
  const emo = (t.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || []).length;
  if (ell >= 2) return true;                 // "\uce58\ub9e5\u2026 \ud83c\udf57\u2026 \ud83e\udd24" \uac19\uc740 \uc870\uac01
  if (emo >= 2) return true;                 // \uc774\ubaa8\uc9c0 \uac70\uc758 \uc548 \uc4f0\ub294 \ubc29\uc774\ub2e4
  if (t.replace(/[\s.,!?~\u2026\u00b7\u314b\u314e\u3160\u315c]/g, "").length < 2) return true;   // \uc758\ubbf8 \uc788\ub294 \uae00\uc790\uac00 \uc5c6\uc74c
  return false;
}
__name(aiJunk, "aiJunk");
var PERSONA_ROLES = ["\uc9c1\uc7a5\uc778", "\ub300\ud559\uc0dd", "\uace0\ub4f1\ud559\uc0dd", "\ucde8\uc900\uc0dd", "\uc54c\ubc14\uc0dd", "\ub300\ud559\uc6d0\uc0dd", "\uc2e0\uc785\uc0ac\uc6d0"];
async function geminiTalks(env, n, recentTalks, kst, w, wcat, room, order) {
  if (!env.GEMINI_KEY) { _gemStat.fail++; _gemStat.last = "nokey"; return null; }
  try {
    const personas = NICKS.slice().sort(() => Math.random() - 0.5).slice(0, 8);
    recentTalks.slice(-5).forEach((t) => {
      if (t.nick && personas.indexOf(t.nick) < 0) personas.push(t.nick);
    });
    const ctx = recentTalks.slice(-20).map((t) => t.nick + ": " + t.text).join("\n") || "(\ub300\ud654 \uc2dc\uc791)";
    const wtxt = w ? "\uae30\uc628 " + w.temp + "\ub3c4" + (wcat === "rain" ? ", \ube44" : wcat === "hot" ? ", \ud3ed\uc5fc" : wcat === "cold" ? ", \ud55c\ud30c" : wcat === "snow" ? ", \ub208" : ", \ub9d1\uc740 \ud3b8") : "\ubcf4\ud1b5";
    const tp = slotTopics(kst);
    // \u2605 2026-10-04 \ub178\uc120\ubcc4 \ubc29: \uadf8 \ub178\uc120 \uc774\uc6a9\uc790 \uc785\uc7a5\uc5d0\uc11c \ub9d0\ud558\ub418, \uc2e4\uc2dc\uac04 \uc6b4\ud589 \uc0c1\ud669\uc740 \uc9c0\uc5b4\ub0b4\uc9c0 \uc54a\ub294\ub2e4(\uc9c0\uc5f0\u00b7\ud63c\uc7a1\uc740 \uc774\uc6a9\uc790 \uc81c\ubcf4 \uae30\ub2a5\uc774 \ub530\ub85c \ub2e4\ub8ec\ub2e4).
    const lineRule = room ? "\n\uc774 \ubc29\uc740 '" + room.name + "' \uc774\uc6a9\uc790 \ubc29\uc774\ub2e4. \uc774 \ub178\uc120\uc744 \uc790\uc8fc \ud0c0\ub294 \uc0ac\ub78c\ub4e4\uc758 \ub9d0\ud22c\uc640 \uc77c\uc0c1(\uc790\uc8fc \uac00\ub294 \uc5ed: " + room.stns.join("\xB7") + ")\uc73c\ub85c \uc4f4\ub2e4. \uc774 \ub178\uc120\uc758 \uc9c0\uae08 \uc6b4\ud589 \uc0c1\ud669(\uc9c0\uc5f0\xB7\uc0ac\uace0\xB7\uace0\uc7a5\xB7\uc6b4\ud589\uc911\ub2e8\xB7\uc5bc\ub9c8\ub098 \ubd90\ube44\ub294\uc9c0)\uc744 \uc0ac\uc2e4\ucc98\ub7fc \ub9d0\ud558\uac70\ub098 \uc9c0\uc5b4\ub0b4\uc9c0 \ub9c8\ub77c." + " \uc774 \ub300\ud654\ub294 \uc55e\uc73c\ub85c \uc57d 6\uc2dc\uac04\uc5d0 \uac78\uccd0 \uc62c\ub77c\uac00\ub2c8 \ud2b9\uc815 \uc2dc\uac01\u00b7\uc2dd\uc0ac \uc2dc\uac04\u00b7'\uc9c0\uae08 \ub9c9'\uc744 \ub2e8\uc815\ud558\uc9c0 \ub9d0\uace0 " + (kst.getUTCHours() >= 20 ? "\uc790\uc815\uc744 \ub118\uae30\ub294 \ud45c\ud604(\ub0b4\uc77c \uc544\uce68 \ub4f1)\ub3c4 \ud53c\ud55c\ub2e4." : "\uc2dc\uac04\ub300\uac00 \uc870\uae08 \ubc14\ub00c\uc5b4\ub3c4 \uc5b4\uc0c9\ud558\uc9c0 \uc54a\uac8c \uc4f4\ub2e4.") : "";
    const personaStr = personas.map(function(p, i) {
      return p + "(" + PERSONA_ROLES[i % PERSONA_ROLES.length] + ")";
    }).join(", ");
    const prompt = "\ub108\ub294 \ud55c\uad6d\uc758 \uc9c0\ud558\ucca0\xB7\ubc84\uc2a4\ub85c \ucd9c\ud1f4\uadfc\ud558\uace0 \ub4f1\ud558\uad50\ud558\ub294 \uc0ac\ub78c\ub4e4\uc774 \ubaa8\uc778 \uc2e4\uc2dc\uac04 \ub2e8\uccb4 \uc624\ud508\ucc44\ud305\ubc29\uc744 \uc7ac\ud604\ud55c\ub2e4. \uc9c4\uc9dc \uce74\ud1a1 \uc624\ud508\ucc44\ud305\ucc98\ub7fc \uc790\uc5f0\uc2a4\ub7fd\uac8c." + lineRule + "\n\uc9c0\uae08: " + slotLabel(kst) + ", \ub0a0\uc528: " + wtxt + ctxBlock(kst, w, wcat) + "\n\ubc29\uae08 \uc804 \ub300\ud654:\n" + ctx + "\n\n\uc774 \ud750\ub984\uc744 \uc790\uc5f0\uc2a4\ub7fd\uac8c \uc774\uc5b4\uc11c \ucc44\ud305 " + n + "\uac1c\ub97c \uc368\ub77c.\n\ucc38\uc5ec\uc790(\uc5ed\ud560 \uace0\uc815): " + personaStr + "\n\uaddc\uce59:\n1. \uc9c4\uc9dc \uc0ac\ub78c\ucc98\ub7fc. \uc644\uacb0\ub41c \ubb38\uc7a5 \ub9d0\uace0 \uc2e4\uc81c \ucc44\ud305\ud22c \u2014 \uc9e7\uac8c \ud22d\ud22d, \uc624\ud0c0\ud2f1\ud55c \uc904\uc784\ub9d0(\u3131\u3131,\u3147\u3147,\u3147\u3148,\u3139\u3147,\u314b\u314b,\u3160,\u3137\u3137,\ub2f4,\ub0bc,\uac4d,\ub118,\ucacc), \ud55c \uba85\uc774 \ub450\uc138 \uc904 \uc5f0\ub2ec\uc544 \uce58\uae30\ub3c4 \ud568.\n2. \uc11c\ub85c \uc9c4\uc9dc \ub300\ud654. \uc55e\uc0ac\ub78c \ub9d0\uc5d0 \ub300\ub2f5/\ub9de\uc7a5\uad6c/\ub418\ubb3b\uae30/\ub534\uc9c0/\ubd80\ub7ec\uc6c0/\ud22c\uc815. \uac01\uc790 \ud63c\uc7a3\ub9d0 \ub098\uc5f4 \uc808\ub300 \uae08\uc9c0.\n3. \uc9c1\uc7a5\uc778\uc740 \ud68c\uc0ac\xB7\uc57c\uadfc\xB7\uc0c1\uc0ac\xB7\uc6d4\uae09, \ud559\uc0dd\uc740 \uc218\uc5c5\xB7\uacfc\uc81c\xB7\uc2dc\ud5d8\xB7\uae09\uc2dd \uc598\uae30\ub85c \uc11c\ub85c \ud2f0\ud0a4\ud0c0\uce74 (\ubd80\ub7ec\uc6cc\ud558\uac70\ub098 \ub180\ub9ac\uac70\ub098).\n4. \uc9c0\uae08 \uc2dc\uac04\ub300 \uc598\uae30\ub9cc: " + tp.ok + ". \uae08\uc9c0: " + tp.no + '\n5. \ubc29\uae08 \uc804 \ub300\ud654\uc5d0 \ub098\uc628 \ub9d0\xB7\uc18c\uc7ac\ub294 \uc808\ub300 \ubc18\ubcf5\ud558\uc9c0 \ub9c8. \uc0c8 \uba54\uc2dc\uc9c0\uc5d0\ub07c\ub9ac\ub3c4 \uac19\uc740 \ub9d0 \ubc18\ubcf5 \uae08\uc9c0.\n6. \uac00\ub054 \uc0c8 \ud654\uc81c\ub97c \ub204\uac00 \ud22d \ub358\uc838\uc11c \uc8fc\uc81c\uac00 \uc790\uc5f0\uc2a4\ub7fd\uac8c \ubc14\ub00c\uc5b4\ub3c4 \ub428.\n7. \uc815\uce58 \ud3b8\ub4e4\uae30\xB7\uc695\uc124\xB7\ud610\uc624\xB7\uc2e4\uc874\uc778\ubb3c \ube44\ubc29 \uae08\uc9c0. \uc774\ubaa8\uc9c0\ub294 \uc4f0\uc9c0 \uc54a\ub294\ub2e4.\n8. \ubaa8\ub4e0 \ucc44\ud305\uc740 \ub9d0\uc774 \ub418\ub294 \ud55c \ubb38\uc7a5 \uc774\uc0c1. "\u2026"\ub85c \ub04a\uae34 \ub2e8\uc5b4 \uc870\uac01\uc774\ub098 \ub2e8\uc5b4\ub9cc \ub098\uc5f4\ud55c \uc904 \uae08\uc9c0.\nJSON \ubc30\uc5f4\ub9cc: [{"n":"\ub2c9","t":"\ucc44\ud305\ub0b4\uc6a9","d":\uc9c0\uc5f0\ucd08(3~15)}]';
    const r = await gemFetch(env, 25e3, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.9, topP: 0.95, maxOutputTokens: 8e3 } })
    }, order || GEM_BULK_ORDER);
    if (!r.ok) { _gemStat.fail++; _gemStat.last = "http " + r.status; return null; }
    const d = await r.json();
    let txt = "";
    try {
      txt = d.candidates[0].content.parts.map((p) => p.text || "").join("");
    } catch (e) {
      _gemStat.fail++; _gemStat.last = "noparts"; return null;
    }
    const arr = parseJsonArr(txt);
    if (!arr || !arr.length) { _gemStat.fail++; _gemStat.last = "parse"; if (_gemLast.model) _gemDownUntil[_gemLast.model] = Date.now() + 15 * 60e3; return null; }
    _gemStat.ok++;
    return arr.filter((x) => x && x.n && x.t).map((x) => ({ nick: String(x.n).slice(0, 16), text: holFix(String(x.t).slice(0, 120), kst), d: Math.max(3, Math.min(90, parseInt(x.d, 10) || 20)) }))
      .filter((m) => { if (aiJunk(m.text)) { _gemStat.junk = (_gemStat.junk || 0) + 1; return false; } const why = ctxReject(m.text, kst, w); if (why) { _gemStat.ctxRej++; return false; } return true; }).slice(0, n);
  } catch (e) {
    _gemStat.fail++; _gemStat.last = "ex " + String((e && e.message) || e).slice(0, 40);
    return null;
  }
}
__name(geminiTalks, "geminiTalks");
function fallbackTalks(n, kst, w, wcat, room) {
  const out = [];
  const L = room || rnd(LINES);
  const ctx = { line: L.name, stn: rnd(L.stns), stn2: "", temp: w ? String(w.temp) : "30" };
  const dc = dayCtx(kst);
  let guard = 0;
  // \u2605 2026-10-05: \uc815\ud574\uc9c4 \ub300\uc0ac\ub3c4 \uc624\ub298 \ub0a0\uc9dc\u00b7\uacc4\uc808\u00b7\ub0a0\uc528\uc640 \ub9de\ub294 \uac83\ub9cc \uc4f4\ub2e4(\uc77c\uc694\uc77c \ubc24 \ub300\uc0ac\uac00 \uc6d4\uc694\uc77c \ud734\uc77c\uc5d0 \ub098\uc624\ub294 \uc77c \ubc29\uc9c0). \ub9de\ub294 \uac8c \uc5c6\uc73c\uba74 \ub35c \ub9cc\ub4e0\ub2e4.
  while (out.length < n && guard++ < 60) {
    let key = pickDialogKey(kst, wcat) || slotDialogKey(kst);
    const pool = TALK_DIALOGS[key] || TALK_DIALOGS.day;
    const dlg = rnd(pool);
    const lines = dlg.map((line) => holFix(fill(line, ctx), kst));
    if (ctxReject(lines.join("\n"), kst, w, dc)) continue;
    const who = NICKS.slice().sort(() => Math.random() - 0.5).slice(0, rndInt(3, 5));
    lines.forEach((text, i) => {
      if (out.length >= n) return;
      out.push({ nick: who[i % who.length], text: text, d: rndInt(6, 45) });
    });
  }
  return out.slice(0, n);
}
__name(fallbackTalks, "fallbackTalks");

// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
// \u2605 2026-10-03: \uc2e4\uc2dc\uac04\uc18c\ud1b5(talks) 6\uac1c\uc6d4(183\uc77c) \uc911\ubcf5 \uae08\uc9c0 \uc6d0\uc7a5 (talk_ledger)
//   YJ \uc9c0\uc2dc: \uc0ac\uc6a9\uc790 \ubaa8\ub450\uac00 \uac19\uc740 \ub300\ud654\ub97c \ubcf4\uac8c \ud558\uace0(GET /talks), \uadf8 \ub300\ud654\uc5d0\uc11c\ub3c4 \uac19\uc740 \ub9d0\uc774
//   6\uac1c\uc6d4 \uc548\uc5d0 \ub2e4\uc2dc \ub098\uc624\uba74 \uc548 \ub41c\ub2e4. \uae30\uc874\uc5d4 '\ucd5c\uadfc 400\uc904'\ub9cc \ubd10\uc11c \uc57d 1\uc2dc\uac04\uc774\uba74 \uac19\uc740 \ub9d0\uc774 \ub3cc\uc544\uc654\ub2e4.
//   \u00b7 \ud0a4 = \uc5ed\u00b7\ub178\uc120\u00b7\uc22b\uc790\u00b7\uae30\ud638\u00b7\u314b\u314e\u3160\u315c\u00b7\uc790\ubaa8(\u3147\u3148 \ub4f1)\ub97c \uc9c0\uc6b4 \ud55c\uae00/\uc601\ubb38 \uae00\uc790\uc5f4(\uc55e 60\uc790)
//   \u00b7 \ud0a4\uac00 3\uae00\uc790 \ubbf8\ub9cc\uc778 \uc9e7\uc740 \ucd94\uc784\uc0c8("\u3147\u3148", "\u3139\u3147", "\u314b\u314b \ub9de\uc74c")\ub294 6\uac1c\uc6d4 \uaddc\uce59\uc5d0\uc11c \uc81c\uc678\ud55c\ub2e4
//     (\uc81c\uc678\ud558\uc9c0 \uc54a\uc73c\uba74 \ucd94\uc784\uc0c8\uac00 \ud55c \ubc88\uc529 \uc4f0\uc774\uace0 \ub098\uba74 \ucc44\ud305\uc774 \ub9d0\ub77c \ubc84\ub9b0\ub2e4). \uc774\ub7f0 \uac83\uc740 \uae30\uc874
//     '\ucd5c\uadfc 400\uc904' \uac80\uc0ac\ub9cc \ubc1b\ub294\ub2e4.
//   \u00b7 \uc6d0\uc7a5\uc744 \ubabb \uc77d\uac70\ub098 \uc4f0\uc9c0 \ubabb\ud558\uba74 \uc774\ubc88 \uc8fc\uae30\ub294 \ub300\ud654\ub97c \ub9cc\ub4e4\uc9c0 \uc54a\ub294\ub2e4(\uc870\uc6a9\ud788 \uc911\ubcf5\uc744 \ub9cc\ub4e4\uc9c0 \uc54a\uae30 \uc704\ud574).
// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
var TALK_LEDGER_DAYS = 183;
var _talkLedgerReady = false;
var _talkLedgerPurgedAt = 0;
async function ensureTalkLedger(env) {
  if (_talkLedgerReady) return;
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS talk_ledger (k TEXT PRIMARY KEY, ts INTEGER NOT NULL)").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_talk_ledger_ts ON talk_ledger(ts)").run();
  _talkLedgerReady = true;
}
__name(ensureTalkLedger, "ensureTalkLedger");
function talkKey(text) {
  return String(text == null ? "" : text)
    .replace(stnRe(), "")
    .replace(/[0-9]+/g, "")
    .replace(/[^\uac00-\ud7a3a-zA-Z]/g, "")
    .toLowerCase()
    .slice(0, 60);
}
__name(talkKey, "talkKey");
async function talkLedgerFilter(env, msgs) {
  await ensureTalkLedger(env);
  const now = Date.now();
  if (now - _talkLedgerPurgedAt > 3600e3) {
    _talkLedgerPurgedAt = now;
    try { await env.DB.prepare("DELETE FROM talk_ledger WHERE ts < ?").bind(now - TALK_LEDGER_DAYS * 24 * 3600e3).run(); } catch (e) {}
  }
  const keyed = msgs.map(function(m) { return { m: m, k: talkKey(m.text) }; });
  const uniq = {};
  keyed.forEach(function(x) { if (x.k.length >= 3) uniq[x.k] = 1; });
  const keys = Object.keys(uniq);
  const have = {};
  for (let i = 0; i < keys.length; i += 90) {
    const part = keys.slice(i, i + 90);
    const rs = await env.DB.prepare("SELECT k FROM talk_ledger WHERE k IN (" + part.map(function() { return "?"; }).join(",") + ")").bind(...part).all();
    (rs.results || []).forEach(function(r) { have[r.k] = 1; });
  }
  const batchSeen = {};
  const kept = [];
  const toMark = [];
  keyed.forEach(function(x) {
    if (x.k.length < 3) { kept.push(x.m); return; }
    if (have[x.k] || batchSeen[x.k]) return;
    batchSeen[x.k] = 1;
    toMark.push(x.k);
    kept.push(x.m);
  });
  for (let i = 0; i < toMark.length; i += 50) {
    const stmts = toMark.slice(i, i + 50).map(function(k) {
      return env.DB.prepare("INSERT OR IGNORE INTO talk_ledger (k, ts) VALUES (?, ?)").bind(k, now);
    });
    await env.DB.batch(stmts);
  }
  return kept;
}
__name(talkLedgerFilter, "talkLedgerFilter");
async function generateTalks(env) {
  const kst = kstNow();
  const n = talkCount(kst);
  if (n === 0) return { made: 0, reason: "dawn-quiet" };
  const w = await getWeather();
  const wcat = weatherCat(w);
  let recent = [];
  try {
    // \u2605 2026-09-22: 60\uac1c \u2192 400\uac1c(MAX_TALKS \uc804\uccb4). Gemini \ud504\ub86c\ud504\ud2b8\uc6a9 \ubb38\ub9e5\uc740 \uc544\ub798\uc5d0\uc11c
    //   \uc5b4\ucc28\ud53c slice(-20)/slice(-5)\ub85c \ucd5c\uadfc \uac83\ub9cc \uc798\ub77c \uc4f0\ubbc0\ub85c \uc601\ud5a5 \uc5c6\uace0, \ubc18\ubcf5 \ubc29\uc9c0\uc6a9
    //   _seenT \ud310\uc815\ub9cc \ud6e8\uc52c \ub354 \uc624\ub798 \uc804 \ub300\ud654\uae4c\uc9c0 \uae30\uc5b5\ud558\uac8c \ub41c\ub2e4(YJ \uc81c\ubcf4: \ucc44\ud305\uc774
    //   \uac19\uc740 \ub9d0\uc744 \ubc18\ubcf5\ud568 \u2014 \ud2b9\ud788 Gemini \uc2e4\ud328 \uc2dc \ud3f4\ubc31 \ub300\uc0ac\uac00 60\uac1c\uc9dc\ub9ac \ucc3d \ubc16\uc73c\ub85c
    //   \ubc00\ub824\ub098\uc790\ub9c8\uc790 \uc544\ubb34 \ubc29\uc9c0 \uc5c6\uc774 \uc7ac\uc0ac\uc6a9\ub410\ub2e4).
    const rs = await env.DB.prepare("SELECT nick, text FROM talks ORDER BY id DESC LIMIT " + MAX_TALKS).all();
    recent = (rs.results || []).reverse();
  } catch (e) {
  }
  let script = [];
  let usedAi = false;
  const BATCH = 40;
  let ctxTalks = recent.slice();
  let remaining = n;
  let batches = 0;
  while (remaining > 0 && batches < 6) {
    const take = Math.min(BATCH, remaining);
    const part = await geminiTalks(env, take, ctxTalks, kst, w, wcat);
    if (part && part.length) {
      usedAi = true;
      script = script.concat(part);
      ctxTalks = ctxTalks.concat(part.map(function(p) {
        return { nick: p.nick, text: p.text };
      })).slice(-30);
      remaining -= part.length;
    } else {
      break;
    }
    batches++;
  }
  if (script.length < n) {
    const fb = fallbackTalks(n - script.length, kst, w, wcat);
    script = script.concat(fb);
  }
  const _normT = /* @__PURE__ */ __name(function(s) {
    return String(s).replace(/[\s.,!?~\u2026\u00b7\u314b\u314e\u3160\u315czZ]/g, "");
  }, "_normT");
  const _seenT = {};
  recent.forEach(function(t) {
    const k = _normT(t.text);
    if (k) _seenT[k] = 1;
  });
  script = script.filter(function(m) {
    const k = _normT(m.text);
    if (!k || _seenT[k]) return false;
    _seenT[k] = 1;
    return true;
  });
  try {
    script = await talkLedgerFilter(env, script);
  } catch (e) {
    console.log("[board-writer][talks] \uc6d0\uc7a5 \ucc98\ub9ac \uc2e4\ud328, \uc774\ubc88 \uc8fc\uae30\ub294 \uac74\ub108\ub700:", e.message);
    return { made: 0, skipped: "ledger-failed" };
  }
  const SPAN = 19 * 60;
  const perMsg = script.length ? SPAN / script.length : 8;
  let cols = [];
  try {
    const info = await env.DB.prepare("SELECT name FROM pragma_table_info('talks')").all();
    cols = (info.results || []).map((r) => r.name);
  } catch (e) {
  }
  let made = 0;
  let ts = Date.now() + rndInt(2, 6) * 1e3;
  for (const msg of script) {
    var gap = Math.max(3, perMsg * (0.6 + Math.random() * 0.8));
    ts += Math.floor(gap * 1e3);
    try {
      const data = { nick: msg.nick, text: msg.text, ts };
      const use = Object.keys(data).filter((k) => cols.indexOf(k) >= 0);
      if (!use.length) break;
      const sql = "INSERT INTO talks (" + use.join(",") + ") VALUES (" + use.map(() => "?").join(",") + ")";
      await env.DB.prepare(sql).bind(...use.map((k) => data[k])).run();
      made++;
    } catch (e) {
      console.log("[board-writer] talk INSERT \uc2e4\ud328:", e.message);
      break;
    }
  }
  try {
    await env.DB.prepare(
      "DELETE FROM talks WHERE id NOT IN (SELECT id FROM talks ORDER BY id DESC LIMIT " + MAX_TALKS + ")"
    ).run();
  } catch (e) {
  }
  return { made, planned: n, ai: usedAi, weather: wcat || "normal" };
}
__name(generateTalks, "generateTalks");
// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
// \u2605 2026-10-04 (YJ): \ub178\uc120\ubcc4 \uc2e4\uc2dc\uac04\uc18c\ud1b5 \u2014 \uac01 \ud638\uc120 \ubc29\uc5d0 AI \uac00 \ub300\ud654\ub97c \uc62c\ub9b0\ub2e4. \uc774\uc6a9\uc790\uac00 \ub9ce\uc740 \ub178\uc120\uc77c\uc218\ub85d \uae00\uc774 \ub9ce\ub2e4.
//   \u00b7 \ubc29\ubcc4 \ube44\uc911(w)\uc740 \ub300\ub7b5\uc801\uc778 \ub178\uc120 \uc774\uc6a9 \uaddc\ubaa8\ub2e4. \ud55c \uc8fc\uae30(20\ubd84)\uc758 \uc804\uccb4 \uc904 \uc218(talkCount)\ub97c \ube44\uc911\ub300\ub85c \ub098\ub208\ub2e4.
//   \u00b7 \uc800\uc7a5\uc740 line_msgs(kind='chat', ipk='ai'). \uc9c0\uc5f0\u00b7\ud63c\uc7a1 \uc81c\ubcf4(kind delay/crowd)\ub294 \ub9cc\ub4e4\uc9c0 \uc54a\ub294\ub2e4 \u2192 \uacbd\ubcf4 \uc9d1\uacc4(lrAlerts)\uc5d0 \uc11e\uc774\uc9c0 \uc54a\ub294\ub2e4.
//   \u00b7 \ub300\ud654 \ub0b4\uc6a9\uc5d0\uc11c\ub3c4 \uadf8 \ub178\uc120\uc758 '\uc9c0\uae08 \uc6b4\ud589 \uc0c1\ud669'\uc744 \uc9c0\uc5b4\ub0b4\uc9c0 \uc54a\ub3c4\ub85d \ud504\ub86c\ud504\ud2b8\uc5d0\uc11c \ub9c9\ub294\ub2e4(geminiTalks \uc758 lineRule).
//   \u00b7 \uc804\uccb4 \ud0ed(GET /talks)\uc740 \uc774 \ubc29\ub4e4\uc758 \ub300\ud654\ub97c \uc2dc\uac04\uc21c\uc73c\ub85c \ubaa8\uc544\uc11c \ub0b4\ub824\uc900\ub2e4. AI \uae00\uc740 2\uc77c \ub4a4 \uc9c0\uc6b4\ub2e4(\uc2e4\uc81c \uc774\uc6a9\uc790 \uae00\uc740 14\uc77c).
//   \u00b7 6\uac1c\uc6d4 \uc911\ubcf5 \uc6d0\uc7a5(talkLedgerFilter)\uc740 \ubc29 \uad6c\ubd84 \uc5c6\uc774 \ud568\uaed8 \uc4f4\ub2e4.
// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
var LR_MAX_AI_ROOMS = 9;
var LR_AI_ROOMS = [
  { name: "2\ud638\uc120", w: 10, stns: ["\uac15\ub0a8", "\ud64d\ub300\uc785\uad6c", "\uc2e0\ucd0c", "\uc7a0\uc2e4", "\uc131\uc218", "\uc0ac\ub2f9", "\uac74\ub300\uc785\uad6c"] },
  { name: "1\ud638\uc120", w: 6, stns: ["\uc11c\uc6b8\uc5ed", "\uc2dc\uccad", "\uc885\uac01", "\uad6c\ub85c", "\ubd80\ud3c9", "\uc778\ucc9c"] },
  { name: "5\ud638\uc120", w: 6, stns: ["\uc5ec\uc758\ub3c4", "\uad11\ud654\ubb38", "\ucc9c\ud638", "\uc655\uc2ed\ub9ac", "\uae40\ud3ec\uacf5\ud56d"] },
  { name: "3\ud638\uc120", w: 5.5, stns: ["\uad50\ub300", "\uace0\uc18d\ud130\ubbf8\ub110", "\uc555\uad6c\uc815", "\uc5f0\uc2e0\ub0b4", "\uc591\uc7ac"] },
  { name: "4\ud638\uc120", w: 5.5, stns: ["\uc0ac\ub2f9", "\uba85\ub3d9", "\ub3d9\ub300\ubb38", "\ud61c\ud654", "\uc11c\uc6b8\uc5ed"] },
  { name: "7\ud638\uc120", w: 5.5, stns: ["\uac00\uc0b0\ub514\uc9c0\ud138\ub2e8\uc9c0", "\uac74\ub300\uc785\uad6c", "\uc0c1\ubd09", "\uc628\uc218", "\ub17c\ud604"] },
  { name: "9\ud638\uc120", w: 4, stns: ["\uae40\ud3ec\uacf5\ud56d", "\uc5ec\uc758\ub3c4", "\ub178\ub7c9\uc9c4", "\uc2e0\ub17c\ud604", "\uac00\uc591"] },
  { name: "6\ud638\uc120", w: 3.5, stns: ["\uacf5\ub355", "\uc774\ud0dc\uc6d0", "\ud569\uc815", "\uc6d4\ub4dc\ucef5\uacbd\uae30\uc7a5", "\uc2e0\ub0b4"] },
  { name: "\uc218\uc778\ubd84\ub2f9\uc120", w: 3.5, stns: ["\uc655\uc2ed\ub9ac", "\uc11c\uc6b8\uc232", "\uc815\uc790", "\uc778\ud558\ub300", "\uc218\uc6d0"] },
  { name: "\uacbd\uc758\uc911\uc559\uc120", w: 3, stns: ["\ud64d\ub300\uc785\uad6c", "\uacf5\ub355", "\uc655\uc2ed\ub9ac", "\uc6a9\uc0b0", "\uc77c\uc0b0"] },
  { name: "8\ud638\uc120", w: 2.5, stns: ["\uc7a0\uc2e4", "\ucc9c\ud638", "\uac00\ub77d\uc2dc\uc7a5", "\ubcf5\uc815", "\uc554\uc0ac"] },
  { name: "\uc2e0\ubd84\ub2f9\uc120", w: 2, stns: ["\uac15\ub0a8", "\ud310\uad50", "\uc815\uc790", "\uad11\uad50", "\uc591\uc7ac"] },
  { name: "\uacf5\ud56d\ucca0\ub3c4", w: 1.5, stns: ["\uc11c\uc6b8\uc5ed", "\ud64d\ub300\uc785\uad6c", "\uae40\ud3ec\uacf5\ud56d", "\uac80\uc554", "\uacc4\uc591"] },
  { name: "\uc778\ucc9c1\ud638\uc120", w: 1.5, stns: ["\ubd80\ud3c9", "\uc778\ucc9c\uc2dc\uccad", "\uacc4\uc591", "\uc1a1\ub3c4"] },
  { name: "\uae40\ud3ec\uace8\ub4dc\ub77c\uc778", w: 1.5, stns: ["\uae40\ud3ec\uacf5\ud56d", "\uac78\ud3ec\ubd81\ubcc0", "\uad6c\ub798", "\ud48d\ubb34"] },
  { name: "\uacbd\ucd98\uc120", w: 1, stns: ["\uccad\ub7c9\ub9ac", "\uc0c1\ubd09", "\ud3c9\ub0b4\ud638\ud3c9", "\uac00\ud3c9", "\ucd98\ucc9c"] },
  { name: "GTX-A", w: 1, stns: ["\uc218\uc11c", "\uc131\ub0a8", "\ub3d9\ud0c4", "\uc6b4\uc815", "\uc11c\uc6b8\uc5ed"] },
  { name: "\uc778\ucc9c2\ud638\uc120", w: 1, stns: ["\uac80\ub2e8\uc624\ub958", "\uc8fc\uc548", "\uc11d\ub0a8", "\uc778\ucc9c\uc2dc\uccad"] }
];
async function generateLineTalks(env) {
  const kst = kstNow();
  const total = talkCount(kst);
  if (total === 0) return { made: 0, reason: "dawn-quiet" };
  await ensureLineRoom(env);
  const w = await getWeather();
  const wcat = weatherCat(w);
  const wsum = LR_AI_ROOMS.reduce((a, r) => a + r.w, 0);
  // \u2605 2026-10-05 (YJ): \ud638\uc120 \ubc29\uc774 \ube44\uc5b4 \ubcf4\uc774\ub294 \ubb38\uc81c \u2014 \ub450 \uac00\uc9c0\ub97c \uace0\ucce4\ub2e4.
  //   \u2460 \ud638\uc120\ub9c8\ub2e4 \uc2dc\uac04\ub2f9 \ucd5c\uc18c \uae00 \uc218(\ub0ae 9\uac1c, \uc0c8\ubcbd 2\uac1c)\ub97c \ubcf4\uc7a5\ud55c\ub2e4. \uc791\uc740 \ud638\uc120\uc740 \uac00\uc911\uce58\ub9cc\uc73c\ub85c\ub294 \ud68c\ucc28\ub9c8\ub2e4 0~1\uac1c\ub77c \ubc29\uc774 \ube44\uc5c8\ub2e4.
  //   \u2461 \uae00\uc744 '\uc55e\uc73c\ub85c 4\uc2dc\uac04\uce58' \ubbf8\ub9ac \ub9cc\ub4e4\uc5b4 \ubbf8\ub798 \uc2dc\uac01(ts)\uc73c\ub85c \ub123\ub294\ub2e4(\ud654\uba74\uc740 ts<=\uc9c0\uae08 \uc778 \uae00\ub9cc \ubcf4\uc5ec \uc900\ub2e4).
  //      \ubc29\ub9c8\ub2e4 "\uc544\uc9c1 \uc548 \ub098\uc628 \uae00"\uc774 \ubaa9\ud45c\uc758 35% \ubc11\uc73c\ub85c \uc904\uc5c8\uc744 \ub54c\ub9cc AI \ub97c \ubd80\ub978\ub2e4 \u2192 AI \ud638\ucd9c\uc774 \ud68c\ucc28\u00d7\ubc29 \uc218\uc5d0\uc11c \ubc29\ub2f9 1~2\uc2dc\uac04\uc5d0 \ud55c \ubc88\uc73c\ub85c \uc900\ub2e4
  //      (\uc804\uc5d0\ub294 \ub9e4 20\ubd84\ub9c8\ub2e4 \ubc29\ub9c8\ub2e4 \ubd88\ub7ec\uc11c \ud558\ub8e8 \ud55c\ub3c4\ub97c \uba87 \uc2dc\uac04 \ub9cc\uc5d0 \ub2e4 \uc4f0\uace0, \uadf8 \ub4a4\uc5d4 \uba87 \uac1c \uc548 \ub418\ub294 \uc815\ud615 \ubb38\uad6c\uac00 \uc911\ubcf5 \uac80\uc0ac\uc5d0 \uac78\ub824 \ubc29\uc774 \ube44\uc5c8\ub2e4).
  const nowMs = Date.now();
  const floorPerHour = kst.getUTCHours() < 5 ? 2 : 6;
  const HORIZON_MIN = 360;
  const haveMap = {};
  try {
    const hs = await env.DB.prepare("SELECT line, COUNT(*) AS n, MAX(ts) AS mx FROM line_msgs WHERE kind='chat' AND ts > ?1 GROUP BY line").bind(nowMs).all();
    (hs.results || []).forEach((r) => { haveMap[r.line] = { n: r.n || 0, mx: r.mx || 0 }; });
  } catch (e) {}
  const plan = [];
  for (const room of LR_AI_ROOMS) {
    const perHour = Math.max(floorPerHour, total * 3 * room.w / wsum);
    const target = Math.round(perHour * HORIZON_MIN / 60);
    const have = (haveMap[room.name] && haveMap[room.name].n) || 0;
    if (target < 1 || have >= target * 0.35) continue;
    plan.push({ room, k: Math.min(60, Math.max(1, target - have)), perHour, ratio: have / target, startTs: Math.max(nowMs, (haveMap[room.name] && haveMap[room.name].mx) || 0) });
  }
  // \u2605 2026-10-05: \ud55c \ud68c\ucc28\uc5d0 AI \ub97c \ubd80\ub974\ub294 \ubc29\uc740 \uac00\uc7a5 \ube44\uc5b4 \uc788\ub294 9\uac1c\uae4c\uc9c0 \u2014 \ub098\uba38\uc9c0\ub294 \ub2e4\uc74c \ud68c\ucc28(20\ubd84 \ub4a4). Gemini \uac00 \ud55c\uaebc\ubc88\uc5d0 \ubab0\ub824 \uacfc\ubd80\ud558\u00b7\ud55c\ub3c4\uc5d0 \uac78\ub9ac\ub294 \uac83\uc744 \uc904\uc778\ub2e4.
  plan.sort((a, b) => a.ratio - b.ratio);
  if (plan.length > LR_MAX_AI_ROOMS) plan.length = LR_MAX_AI_ROOMS;
  _gemStat.ok = 0; _gemStat.fail = 0; _gemStat.last = ""; _gemStat.ctxRej = 0; _gemStat.junk = 0;
  // \u2605 2026-10-10: Gemma \uba3c\uc800, gemini-* \ub294 \ud558\ub8e8 \uc608\uc0b0(GEMINI_TALK_BUDGET) \uc548\uc5d0\uc11c\ub9cc \u2014 \uac8c\uc2dc\uae00\u00b7\ub313\uae00\uc774 \uc4f8 \ud55c\ub3c4\ub97c \ub0a8\uae34\ub2e4
  let talkOrder = GEM_BULK_ORDER;
  const usedG = await geminiUsed24h(env);
  if (usedG >= GEMINI_TALK_BUDGET) talkOrder = GEM_BULK_ORDER.filter((m) => m.indexOf("gemma-") === 0);
  if (plan.length) await gemDiscover(env);
  const scripts = [];
  let usedAi = 0;
  for (let i = 0; i < plan.length; i += 3) {
    const part = await Promise.all(plan.slice(i, i + 3).map(async (p) => {
      let recent = [];
      try {
        const rs = await env.DB.prepare("SELECT nick, text FROM line_msgs WHERE line=?1 AND kind='chat' ORDER BY id DESC LIMIT 30").bind(p.room.name).all();
        recent = (rs.results || []).reverse();
      } catch (e) {}
      let script = [];
      if (p.k >= 4) {
        const g = await geminiTalks(env, Math.min(p.k, 60), recent, kst, w, wcat, p.room, talkOrder);
        if (g && g.length) { script = g; usedAi++; }
      }
      if (script.length < p.k) script = script.concat(fallbackTalks(p.k - script.length, kst, w, wcat, p.room));
      const seen = {};
      recent.forEach((t) => { seen[String(t.text).replace(/[\s.,!?~\u2026\u00b7\u314b\u314e\u3160\u315czZ]/g, "")] = 1; });
      script = script.filter((m) => {
        const k = String(m.text).replace(/[\s.,!?~\u2026\u00b7\u314b\u314e\u3160\u315czZ]/g, "");
        if (!k || seen[k] || containsBadWord(m.text) || containsBadWord(m.nick)) return false;
        seen[k] = 1;
        return true;
      });
      script.forEach((m) => { m.line = p.room.name; });
      return script;
    }));
    part.forEach((sc) => sc.forEach((m) => scripts.push(m)));
  }
  let kept;
  try {
    kept = await talkLedgerFilter(env, scripts);
  } catch (e) {
    console.log("[board-writer][linetalks] \uc6d0\uc7a5 \ucc98\ub9ac \uc2e4\ud328, \uc774\ubc88 \uc8fc\uae30\ub294 \uac74\ub108\ub700:", e.message);
    await bwDiag(env, "linetalks", { err: "ledger-failed", m: String((e && e.message) || e).slice(0, 80) });
    return { made: 0, skipped: "ledger-failed" };
  }
  const byLine = {};
  kept.forEach((m) => { (byLine[m.line] = byLine[m.line] || []).push(m); });
  const stmts = [];
  const planBy = {};
  plan.forEach((p) => { planBy[p.room.name] = p; });
  for (const ln of Object.keys(byLine)) {
    const arr = byLine[ln];
    const pl = planBy[ln];
    const gapSec = Math.max(20, Math.min(900, 3600 / Math.max(1, pl ? pl.perHour : 9)));   // \uae00 \uc0ac\uc774 \ud3c9\uade0 \uac04\uaca9(\ucd08). \uc774\ubbf8 \uc608\uc57d\ub41c \ub9c8\uc9c0\ub9c9 \uae00 \ub4a4\ubd80\ud130 \uc774\uc5b4 \ubd99\uc778\ub2e4
    let ts = (pl ? pl.startTs : nowMs) + rndInt(2, 6) * 1e3;
    for (const m of arr) {
      ts += Math.floor(gapSec * (0.6 + Math.random() * 0.8) * 1e3);
      stmts.push(env.DB.prepare("INSERT INTO line_msgs (line,kind,nick,text,stn,ipk,ts) VALUES (?1,'chat',?2,?3,NULL,'ai',?4)").bind(ln, m.nick, m.text, ts));
    }
  }
  let made = 0, insErr = "";
  for (let i = 0; i < stmts.length; i += 50) {
    try { await env.DB.batch(stmts.slice(i, i + 50)); made += Math.min(50, stmts.length - i); }
    catch (e) { insErr = String((e && e.message) || e).slice(0, 80); console.log("[board-writer][linetalks] INSERT \uc2e4\ud328:", e.message); break; }
  }
  const res = { made, planned: total, rooms: Object.keys(byLine).length, planRooms: plan.length, scripts: scripts.length, kept: kept.length, aiRooms: usedAi, gem: { ok: _gemStat.ok, fail: _gemStat.fail, last: _gemStat.last, model: _gemStat.model, rej: _gemStat.ctxRej, junk: _gemStat.junk || 0, tried: _gemLast.tried, usedG: usedG }, weather: wcat || "normal" };
  if (insErr) res.insErr = insErr;
  await bwDiag(env, "linetalks", res);
  await flushGemUse(env);
  return res;
}
__name(generateLineTalks, "generateLineTalks");
// \uc9c4\ub2e8 \uae30\ub85d \u2014 \uc11c\ubc84 \ub85c\uadf8\ub97c \ubcfc \uc218 \uc5c6\uc5b4\uc11c D1 \uc5d0 \ub0a8\uae34\ub2e4(\ucd5c\uadfc 3\uc77c\uce58\ub9cc \uc720\uc9c0). \uc870\ud68c: SELECT * FROM bw_diag ORDER BY ts DESC
var _bwDiagReady = false, _bwDiagPurgedAt = 0;
async function bwDiag(env, k, v) {
  try {
    if (!_bwDiagReady) { await env.DB.prepare("CREATE TABLE IF NOT EXISTS bw_diag (ts INTEGER NOT NULL, k TEXT, v TEXT)").run(); _bwDiagReady = true; }
    const now = Date.now();
    await env.DB.prepare("INSERT INTO bw_diag (ts, k, v) VALUES (?1, ?2, ?3)").bind(now, k, JSON.stringify(v).slice(0, 600)).run();
    if (now - _bwDiagPurgedAt > 6 * 3600e3) { _bwDiagPurgedAt = now; await env.DB.prepare("DELETE FROM bw_diag WHERE ts < ?1").bind(now - 3 * 24 * 3600e3).run(); }
  } catch (e) {}
}
__name(bwDiag, "bwDiag");
var REACT_FALLBACK = [
  "\u3147\u3148",
  "\u3139\u3147?",
  "\u314b\u314b\u314b \ub9de\uc74c",
  "\uc624 \uadf8\ub798?",
  "\ud5d0 \uc9c4\uc9dc?",
  "\ub098\ub3c4 \uadf8 \uc0dd\uac01\ud568",
  "\uadf8\uac74 \uc880 \ubd80\ub7fd\ub124",
  "\uace0\uc0dd\uc774 \ub9ce\ub2e4",
  "\uc790\uc138\ud788 \uc880 \u314b\u314b",
  "\uc5b4\ub514\ucabd\uc778\ub370?",
  "\uc778\uc815\ud569\ub2c8\ub2e4"
];
async function generateReaction(env, userNick, userText, line) {
  let recent = [];
  try {
    const rs = line
      ? await env.DB.prepare("SELECT nick, text FROM line_msgs WHERE line=?1 AND kind='chat' AND ts <= ?2 ORDER BY ts DESC, id DESC LIMIT 12").bind(line, Date.now()).all()
      : await env.DB.prepare("SELECT nick, text FROM talks WHERE ts <= ? ORDER BY ts DESC, id DESC LIMIT 12").bind(Date.now()).all();   // \uc544\uc9c1 \ud654\uba74\uc5d0 \uc548 \ub098\uc628(\ubbf8\ub798 \uc2dc\uac01) \uc904\uc740 \ubb38\ub9e5\uc5d0\uc11c \ube80\ub2e4
    recent = (rs.results || []).reverse();
  } catch (e) {
  }
  const kst = kstNow();
  const rw = await getWeather();
  let replies = null;
  if (env.GEMINI_KEY) {
    try {
      const personas = NICKS.slice().sort(() => Math.random() - 0.5).slice(0, 6).map(function(p, i) {
        return p + "(" + PERSONA_ROLES[i % PERSONA_ROLES.length] + ")";
      });
      const ctx = recent.map((t) => t.nick + ": " + t.text).join("\n");
      const prompt = "\ud55c\uad6d \uc9c0\ud558\ucca0/\ucd9c\ud1f4\uadfc \ucee4\ubba4\ub2c8\ud2f0 \uc2e4\uc2dc\uac04 \ub2e8\uccb4\ucc44\ud305\uc785\ub2c8\ub2e4. \uc0c1\ud669: " + slotLabel(kst) + ctxBlock(kst, rw, weatherCat(rw)) + "\n\ucd5c\uadfc \ub300\ud654:\n" + ctx + "\n" + userNick + ": " + userText + '\n\ub9c8\uc9c0\ub9c9\uc5d0 "' + userNick + '"\uac00 \ubc29\uae08 \ubcf4\ub0b8 \uba54\uc2dc\uc9c0\uc5d0 \uc790\uc5f0\uc2a4\ub7fd\uac8c \ubc18\uc751\ud558\ub294 \ub2f5\uc7a5\uc744 1~3\uac1c \ub9cc\ub4dc\uc138\uc694.\n- \ubc18\ub4dc\uc2dc \uadf8 \uba54\uc2dc\uc9c0 \ub0b4\uc6a9\uc5d0 \uc9c1\uc811 \ubc18\uc751\ud560 \uac83 (\uc9c8\ubb38\uc774\uba74 \ub2f5\ud558\uace0, \uc598\uae30\uba74 \ub9de\uc7a5\uad6c/\ub418\ubb3b\uae30/\ub18d\ub2f4)\n- \ucc38\uc5ec\uc790 \ub2c9\ub124\uc784\uc740 \uc774 \uc911\uc5d0\uc11c\ub9cc: ' + personas.join(", ") + '\n- \uc704 \ucd5c\uadfc \ub300\ud654\uc5d0 \ub098\uc628 \ubb38\uc7a5\xB7\ud45c\ud604 \ubc18\ubcf5 \uae08\uc9c0\n- \uc9e7\uac8c(5~35\uc790), \ubc18\ub9d0, \u314b\u314b/\u3137\u3137 \uc790\uc5f0\uc2a4\ub7fd\uac8c. \uc815\uce58/\ud610\uc624/\uc695\uc124 \uae08\uc9c0\n- JSON \ubc30\uc5f4\ub9cc \ucd9c\ub825: [{"n":"\ub2c9","t":"\ub0b4\uc6a9","d":\uc9c0\uc5f0\ucd08(4~40)}]';
      const r = await gemFetch(env, 1e4, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 1, maxOutputTokens: 500 } })
      });
      if (r.ok) {
        const d = await r.json();
        let txt = "";
        try {
          txt = d.candidates[0].content.parts.map((p) => p.text || "").join("");
        } catch (e) {
        }
        txt = txt.replace(/```json|```/g, "").trim();
        const arr = JSON.parse(txt);
        if (Array.isArray(arr) && arr.length) {
          replies = arr.filter((x) => x && x.n && x.t).map((x) => ({ nick: String(x.n).slice(0, 16), text: holFix(String(x.t).slice(0, 120), kst), d: Math.max(4, Math.min(40, parseInt(x.d, 10) || 12)) })).filter((m) => !ctxReject(m.text, kst, rw)).slice(0, 3);
        }
      }
    } catch (e) {
    }
  }
  // \u2605 2026-10-03: \ubc18\uc751 \ubb38\uad6c\ub3c4 6\uac1c\uc6d4 \uc6d0\uc7a5\uc744 \ud1b5\uacfc\ud574\uc57c \ud55c\ub2e4. \ub2e4 \uac78\ub7ec\uc9c0\uba74 6\uac1c\uc6d4 \uaddc\uce59\uc5d0\uc11c \ube60\uc9c0\ub294 \uc9e7\uc740 \ucd94\uc784\uc0c8\ub85c \ub300\uc2e0\ud55c\ub2e4.
  if (replies && replies.length) {
    try { replies = await talkLedgerFilter(env, replies); } catch (e) { replies = null; }
  }
  const usedAi = !!(replies && replies.length);
  if (!usedAi) {
    const fb = REACT_FALLBACK.filter(function(t) { return talkKey(t).length < 3; });
    replies = [{ nick: rnd(NICKS), text: rnd(fb.length ? fb : ["\u3147\u3148"]), d: rndInt(5, 20) }];
  }
  let cols = [];
  try {
    const info = await env.DB.prepare("SELECT name FROM pragma_table_info('talks')").all();
    cols = (info.results || []).map((r) => r.name);
  } catch (e) {
  }
  let made = 0;
  let ts = Date.now();
  for (const msg of replies) {
    ts += msg.d * 1e3;
    if (line) {
      try {
        await env.DB.prepare("INSERT INTO line_msgs (line,kind,nick,text,stn,ipk,ts) VALUES (?1,'chat',?2,?3,NULL,'ai',?4)").bind(line, msg.nick, msg.text, ts).run();
        made++;
      } catch (e) { break; }
      continue;
    }
    try {
      const data = { nick: msg.nick, text: msg.text, ts };
      const use = Object.keys(data).filter((k) => cols.indexOf(k) >= 0);
      if (!use.length) break;
      const sql = "INSERT INTO talks (" + use.join(",") + ") VALUES (" + use.map(() => "?").join(",") + ")";
      await env.DB.prepare(sql).bind(...use.map((k) => data[k])).run();
      made++;
    } catch (e) {
      break;
    }
  }
  return { made, ai: usedAi };
}
__name(generateReaction, "generateReaction");
var BAD_WORDS = [
  "\uc2dc\ubc1c", "\uc528\ubc1c", "\uc2dc\ud314", "\uc528\ud314", "\u3145\u3142", "\u3142\u3145", "\ubcd1\uc2e0", "\u3142\u3145", "\uac1c\uc0c8", "\uc0c8\ub07c", "\uc0c8\uae30", "\uc0c9\ub07c",
  "\uc88c", "\uc874\ub098", "\uc874\ub9c8", "\uc754\ub0e8", "\uc9c0\ub791", "\u3148\u3139", "\uafa0\uc838", "\ub2e5\uccd0", "\uc5ff\uba39", "\ubbf8\uce5c\ub193", "\ubbf8\uce5c\ub144", "\ub610\ub77c\uc774",
  "\ub4f1\uc2e0", "\uba4d\uccad", "\ubc84\ub7ec\uc9c0", "\uc4f0\ub808\uae30\uac19", "\uc8fd\uc5b4", "\ub4a4\uc838", "\ub4c8\uc838", "\uac1c\uac19", "\uac1c\uc18c\ub9ac", "\uac78\ub808", "\ucc3d\ub140",
  "\ub290\uae08", "\ub2c8\uc560\ubbf8", "\ub2c8\ubbf8", "\uc560\ubbf8", "\uc560\ube44", "\ubcf4\uc9c0", "\uc790\uc9c0", "\uc12c\uc2a4", "\uac15\uac04", "fuck", "shit", "bitch", "asshole",
  "\ud55c\ub0a8", "\ud55c\ub140", "\uae40\uce58\ub140", "\ub41c\uc7a5\ub140", "\ub9cc\ucda9", "\ud2c0\ub531", "\uae09\uc2dd\ucda9", "\ub178\uce5c\ub124", "\uc815\uc2e0\ubcd1\uc790", "\uc7a5\uc560\uc778\uac19"
];
function containsBadWord(text) {
  if (!text) return false;
  const t = String(text).toLowerCase().replace(/\s+/g, "");
  for (let i = 0; i < BAD_WORDS.length; i++) {
    if (t.indexOf(BAD_WORDS[i].toLowerCase()) >= 0) return true;
  }
  return false;
}
__name(containsBadWord, "containsBadWord");
// \u2605 2026-09-25: "\uac8c\uc2dc\ud310 \ub4e4\uc5b4\uac00\uba74 2~3\ucd08 \uc788\ub2e4\uac00 \ub72c\ub2e4" \uc81c\ubcf4 \uc6d0\uc778 \u2014 /posts\u00b7/comment\u00b7/comments\uac00
//   \uc694\uccad\ub9c8\ub2e4 pragma_table_info\ub85c \uceec\ub7fc\uc744 \ub9e4\ubc88 \uc0c8\ub85c \ubb3c\uc5b4\ubcf8 \ub4a4(D1 \uc655\ubcf5 1\ud68c) \ubcf8 \ucffc\ub9ac(\uc655\ubcf5 1\ud68c)\ub97c
//   \ub610 \ub0a0\ub824\uc11c, \ub9e4 \uc694\uccad\uc774 D1\uc744 \uc9c1\ub82c\ub85c \ub450 \ubc88 \uc655\ubcf5\ud588\ub2e4(\ucf5c\ub4dc\uc77c \ub54c \uc655\ubcf5\ub2f9 \uc218\ubc31ms~1\ucd08+, route-v2
//   D1 \ucf54\ub9ac\ub3c4\uc870\ud68c\uac00 \ub290\ub838\ub358 \uac83\uacfc \uac19\uc740 \ubaa8\uc591\uc758 \ubb38\uc81c). \uc2a4\ud0a4\ub9c8\ub294 \uc6b4\uc601 \uc911 \uac70\uc758 \uc548 \ubc14\ub00c\ubbc0\ub85c
//   route-v2\uc758 L1 \uba54\ubaa8\ub9ac\uce90\uc2dc(ROWS_CACHE)\uc640 \uac19\uc740 \ubc29\uc2dd\uc73c\ub85c 10\ubd84\ub9cc \uce90\uc2dc\ud574 \ub450 \ubc88\uc9f8 \uc655\ubcf5\uc744 \uc5c6\uc564\ub2e4.
var _colsCache = {};
var _COLS_TTL_MS = 10 * 60 * 1000;
async function getCols(env, table) {
  var hit = _colsCache[table];
  if (hit && Date.now() - hit.at < _COLS_TTL_MS) return hit.cols;
  var info = await env.DB.prepare("SELECT name FROM pragma_table_info('" + table + "')").all();
  var cols = (info.results || []).map(function(r) { return r.name; });
  _colsCache[table] = { cols: cols, at: Date.now() };
  return cols;
}
__name(getCols, "getCols");
// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
// \u2605 2026-10-08 (YJ: "\ub0b4\uac00 \uc4f4 \uae00\uc740 \uc571 \uc0ac\uc6a9\uc790 \ubaa8\ub450 \ubcf4\uac8c \ud574\uc918"): \uc0ac\uc6a9\uc790 \uae00 \ub4f1\ub85d \u00b7 \uc2e0\uace0 \u00b7 \uad00\ub9ac\uc790 \uc0ad\uc81c
//   \u00b7 POST /post   {nick,title,body,cat}  \u2192 posts \uc5d0 user=1 \ub85c \uc800\uc7a5 \u2192 GET /posts \ub85c \ubaa8\ub450\uc5d0\uac8c \ub0b4\ub824\uac04\ub2e4
//   \u00b7 POST /report {post_id}               \u2192 \uc0ac\uc6a9\uc790 \uae00\ub9cc \uc2e0\uace0 \uac00\ub2a5, \uc11c\ub85c \ub2e4\ub978 3\uacf3(IP)\uc774 \uc2e0\uace0\ud558\uba74 hidden=1
//   \u00b7 GET  /post/delete?id=&token=         \u2192 \uad00\ub9ac\uc790 \uc0ad\uc81c(\uae00+\ub313\uae00),  GET /reports?token= \u2192 \uc2e0\uace0\ub41c \uae00 \ubaa9\ub85d
//   \uc545\uc6a9 \ubc29\uc9c0: \uc695\uc124 \ud544\ud130(\uae30\uc874 BAD_WORDS) \u00b7 \ub9c1\ud06c/\uc804\ud654\ubc88\ud638 \ucc28\ub2e8 \u00b7 IP\ub2f9 \uc2dc\uac04 5\uac74/\ud558\ub8e8 15\uac74 \u00b7 \uac19\uc740 \ub2c9+\uc81c\ubaa9 \ud558\ub8e8 1\uac74 \u00b7 \uae38\uc774 \uc81c\ud55c
// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
var USER_POST_CATS = ["\uc7a1\ub2f4", "\ud604\uc7a5\uc81c\ubcf4", "\uc77c\uc0c1", "\uc815\ubcf4", "\uc81c\ubcf4", "\uc9c0\uc5f0", "\ud63c\uc7a1"];
var POST_PER_IP_HR = 5, POST_PER_IP_DAY = 15, REPORT_PER_IP_HR = 30, REPORT_HIDE_AT = 3;
function hasLinkOrPhone(t) {
  t = String(t || "");
  if (/(https?:\/\/|www\.|t\.me\/|open\.kakao|bit\.ly)/i.test(t)) return true;
  if (/[a-z0-9-]{2,}\.(com|net|kr|co\.kr|io|me|ly|xyz|site|info|org|app|shop|top)(\/|\b)/i.test(t)) return true;
  if (/0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/.test(t)) return true;
  return false;
}
__name(hasLinkOrPhone, "hasLinkOrPhone");
async function bumpLimit(env, key, bucket, max) {
  try {
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS react_rl (k TEXT, hr INTEGER, n INTEGER, PRIMARY KEY (k, hr))").run();
    await env.DB.prepare("INSERT INTO react_rl (k,hr,n) VALUES (?1,?2,1) ON CONFLICT(k,hr) DO UPDATE SET n = n + 1").bind(key, bucket).run();
    const r = await env.DB.prepare("SELECT n FROM react_rl WHERE k=?1 AND hr=?2").bind(key, bucket).first();
    return ((r && r.n) || 1) <= max;
  } catch (e) { return false; }
}
__name(bumpLimit, "bumpLimit");
async function ownerHash(k) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("bw-owner:" + String(k)));
  return Array.from(new Uint8Array(d)).map((x) => x.toString(16).padStart(2, "0")).join("");
}
__name(ownerHash, "ownerHash");
var _userColsOk = false;
async function ensureUserPostCols(env) {
  if (_userColsOk) return;
  let cols = await getCols(env, "posts");
  for (const [c, ddl] of [["user", "ALTER TABLE posts ADD COLUMN user INTEGER DEFAULT 0"], ["hidden", "ALTER TABLE posts ADD COLUMN hidden INTEGER DEFAULT 0"], ["owner", "ALTER TABLE posts ADD COLUMN owner TEXT"]]) {
    if (cols.indexOf(c) < 0) { try { await env.DB.prepare(ddl).run(); } catch (e) {} }
  }
  delete _colsCache["posts"];
  cols = await getCols(env, "posts");
  _userColsOk = cols.indexOf("user") >= 0 && cols.indexOf("hidden") >= 0 && cols.indexOf("owner") >= 0;
}
__name(ensureUserPostCols, "ensureUserPostCols");
async function purgePostsCache(url) {
  _MEM = Object.create(null);
  try {
    await caches.default.delete(new Request(url.origin + "/posts?limit=50"));
    for (const c of USER_POST_CATS) await caches.default.delete(new Request(url.origin + "/posts?limit=50&cat=" + encodeURIComponent(c)));
  } catch (e) {}
}
__name(purgePostsCache, "purgePostsCache");
var worker_default = {
  // \ud06c\ub860 (20\ubd84\ub9c8\ub2e4)
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => { try { await ensureLineRoom(env); await env.DB.prepare("DELETE FROM line_msgs WHERE ts < ?1").bind(Date.now() - 14 * 24 * 3600 * 1000).run(); await env.DB.prepare("DELETE FROM line_reports WHERE ts < ?1").bind(Date.now() - 14 * 24 * 3600 * 1000).run(); await env.DB.prepare("DELETE FROM line_msgs WHERE ipk = 'ai' AND ts < ?1").bind(Date.now() - 2 * 24 * 3600 * 1000).run(); } catch (e) {} })());
    // \u2605 2026-10-05: \uac8c\uc2dc\ud310 \uae00\u00b7\ub313\uae00\uc744 \uba3c\uc800, \ud638\uc120 \ubc29\uc740 \uadf8 \ub2e4\uc74c \u2014 Gemini \uac00 \ubaa8\uc790\ub784 \ub54c \uac8c\uc2dc\ud310\uc774 \uad76\uc9c0 \uc54a\uac8c \ud55c\ub2e4. \ud558\ub098\uac00 \uc2e4\ud328\ud574\ub3c4 \ub2e4\uc74c \ub2e8\uacc4\ub294 \uacc4\uc18d\ud55c\ub2e4.
    ctx.waitUntil((async () => {
      await holRefresh(env);
      try { console.log("[board-writer][posts]", JSON.stringify(await generatePosts(env))); } catch (e) { console.log("[board-writer][posts] \uc2e4\ud328:", e && e.message); }
      try { console.log("[board-writer][comments]", JSON.stringify(await generateComments(env))); } catch (e) { console.log("[board-writer][comments] \uc2e4\ud328:", e && e.message); }
      try { await flushGemUse(env); } catch (e) {}
      try { console.log("[board-writer][linetalks]", JSON.stringify(await generateLineTalks(env))); } catch (e) { console.log("[board-writer][linetalks] \uc2e4\ud328:", e && e.message); }
    })());
  },
  // \uc218\ub3d9 \ud14c\uc2a4\ud2b8/\uc0c1\ud0dc \ud655\uc778
  async fetch(req, env, ctx) {
    _CTX = ctx || null;
    if (req.method === "POST") _MEM = Object.create(null);   // \uae00\u00b7\uc81c\ubcf4\u00b7\ub313\uae00\uc744 \uc4f0\uba74 \uc774 \uaca9\ub9ac\uc758 \uba54\ubaa8\ub9ac \uc2a4\ub0c5\uc0f7\uc740 \ubaa8\ub450 \ubc84\ub9b0\ub2e4(\ubc14\ub85c \ubcf4\uc774\uac8c)
    const url = new URL(req.url);
    // \u2605 2026-10-10: \uacf5\ud734\uc77c \uc790\ub8cc \uc77d\uae30(D1 \uc655\ubcf5 3\ubc88)\uac00 \ubaa8\ub4e0 \uccab \uc694\uccad\uc744 \ub9c9\uace0 \uc788\uc5c8\ub2e4 \u2192 \uc751\ub2f5\uacfc \ubcc4\uac1c\ub85c \ucc98\ub9ac\ud55c\ub2e4
    try { if (ctx) ctx.waitUntil(holRefresh(env)); else holRefresh(env).catch(function () {}); } catch (e) {}
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json; charset=utf-8"
    };
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (url.pathname === "/gen") {
      if (!adminOk(url, env))
        return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401, headers: cors });
      const n = Math.min(10, parseInt(url.searchParams.get("n") || "3", 10));
      let total = 0, runs = [];
      for (let i = 0; i < n; i++) {
        const r = await generatePosts(env);
        total += r.made;
        runs.push(r);
      }
      return new Response(JSON.stringify({ ok: true, made: total, runs }), { headers: cors });
    }
    if (url.pathname === "/newsfeed") {
      const cacheKey = new Request(url.origin + "/newsfeed");
      try {
        const hit = await caches.default.match(cacheKey);
        if (hit) return hit;
      } catch (e) {
      }
      const items = [];
      await Promise.all(NEWSFEED_SRC.map(async function(f) {
        try {
          const r = await fetchT(f.url, 6e3);
          if (!r.ok) return;
          const xml = await r.text();
          parseItemsFull(xml).forEach(function(it) {
            items.push({ cat: f.cat, title: it.t, link: it.l, ts: it.d, desc: it.s || "" });
          });
        } catch (e) {
        }
      }));
      const cut3d = Date.now() - 3 * 24 * 3600 * 1e3;
      const out = items.filter(function(i) {
        return i.title && i.link && (!i.ts || i.ts >= cut3d);
      }).sort(function(a, b) {
        return (b.ts || 0) - (a.ts || 0);
      }).slice(0, 200);
      const res = new Response(JSON.stringify({ ok: true, ts: Date.now(), items: out }), {
        headers: Object.assign({}, cors, { "Cache-Control": "public, s-maxage=600, max-age=300" })
      });
      try {
        await caches.default.put(cacheKey, res.clone());
      } catch (e) {
      }
      return res;
    }
    // \u2605 2026-09-24 \uc2e0\uc124: generatePosts(\ud06c\ub860, 20\ubd84\ub9c8\ub2e4)\uac00 D1 posts \ud14c\uc774\ube14\uc5d0 \uacc4\uc18d
    //   \uc313\uc544\uc654\uc9c0\ub9cc, \uc815\uc791 \uc774\uac78 \uc571\uc5d0 \ub3cc\ub824\uc8fc\ub294 GET \uc5d4\ub4dc\ud3ec\uc778\ud2b8\uac00 \uc5ec\ud0dc \uc5c6\uc5c8\ub2e4.
    //   \uadf8\ub798\uc11c \uc571\uc740 (\uc5c9\ub6b1\ud55c \uc6cc\ucee4 \uc8fc\uc18c\ub85c /posts\ub97c \uc2dc\ub3c4\ud558\ub2e4 \uc2e4\ud328\ud558\uace0) \ub9e4\ubc88 \uae30\uae30\ubcc4
    //   \ub85c\uceec \uc0dd\uc131\uc73c\ub85c \ub5a8\uc5b4\uc84c\uc5c8\ub2e4 \u2014 \uc11c\ubc84\uac00 \uc560\uc368 \ub9cc\ub4e0 \uae00\uc774 \uc0ac\uc6a9\uc790\uc5d0\uac8c \uc804\ud600 \ub3c4\ub2ec\ud558\uc9c0
    //   \ubabb\ud558\uace0 \uc788\uc5c8\ub358 \uac83. \uc774 \ub77c\uc6b0\ud2b8\ub97c \ucd94\uac00\ud558\uace0 \uc571 index.html\uc758 \uc694\uccad \uc8fc\uc18c\ub97c
    //   board-writer\ub85c \uace0\uccd0\uc57c \uc2e4\uc81c\ub85c \uc5f0\uacb0\ub41c\ub2e4.
    if (url.pathname === "/posts") {
      const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));
      const cat = url.searchParams.get("cat");
      // \u2605 2026-09-25: \uae00\uc740 20\ubd84 cron(generatePosts)\uc73c\ub85c\ub9cc \ubc14\ub00c\ubbc0\ub85c \uc9e7\uc740 \uc5e3\uc9c0\uce90\uc2dc\ub97c \ub46c\ub3c4
      //   \uc2e0\uc120\ub3c4 \uc190\ud574\uac00 \uc5c6\ub2e4. newsfeed \ub77c\uc6b0\ud2b8\uc640 \ub3d9\uc77c\ud55c \ubc29\uc2dd(caches.default)\uc73c\ub85c \uc2e4\uc81c \uce90\uc2f1\uc744
      //   \uc801\uc6a9\ud55c\ub2e4(\uc774\uc804\uc5d4 Cache-Control \ud5e4\ub354\ub9cc \uc788\uace0 caches.default \uc800\uc7a5/\uc870\ud68c\uac00 \uc5c6\uc5b4 \ub9e4\ubc88
      //   D1\uae4c\uc9c0 \uac14\uc5c8\uc74c \u2014 \uac8c\uc2dc\ud310 \uc9c4\uc785 2~3\ucd08 \uc9c0\uc5f0\uc758 \uc8fc\uc6d0\uc778).
      const cacheKey = new Request(url.origin + "/posts?limit=" + limit + (cat ? "&cat=" + encodeURIComponent(cat) : ""));
      // \u2605 2026-10-10: workers.dev \uc5d0\uc11c\ub294 \uc5e3\uc9c0 \uce90\uc2dc\uac00 \ub3d9\uc791\ud558\uc9c0 \uc54a\uc544 \ub9e4 \uc694\uccad D1 \uae4c\uc9c0 \uac14\ub2e4 \u2192 \uac19\uc740 \uaca9\ub9ac \uc548\uc5d0\uc11c 15\ucd08 \uba54\ubaa8\ub9ac \uce90\uc2dc
      const memBody = memGet("posts:" + limit + ":" + (cat || ""), 15000);
      if (memBody) return new Response(memBody, { headers: Object.assign({}, cors, { "Cache-Control": "public, s-maxage=30, max-age=15" }) });
      try {
        const hit = await caches.default.match(cacheKey);
        if (hit) return hit;
      } catch (e) {
      }
      try {
        // \u2605 2026-09-24: \uc2e4\uc81c posts \ud14c\uc774\ube14\uc5d0 \uc5c6\ub294 \uceec\ub7fc(views \ub4f1)\uc744 \ud558\ub4dc\ucf54\ub529\ud574\uc11c
        //   SELECT\ud558\uba74 \uc2a4\ud0a4\ub9c8\uac00 \uc870\uae08\ub9cc \ub2ec\ub77c\ub3c4 500 \uc5d0\ub7ec\uac00 \ub09c\ub2e4. generatePosts\uc758
        //   INSERT\ucc98\ub7fc pragma_table_info\ub85c \uc2e4\uc81c \uc874\uc7ac\ud558\ub294 \uceec\ub7fc\ub9cc \uace8\ub77c\uc11c SELECT\ud55c\ub2e4.
        //   (2026-09-25: \ub9e4 \uc694\uccad D1 \uc655\ubcf5\uc774\ub358 \uac78 getCols\ub85c 10\ubd84 \uba54\ubaa8\ub9ac\uce90\uc2dc\ud568)
        const [cols, cmtCols] = await Promise.all([getCols(env, "posts"), getCols(env, "comments").catch(function () { return []; })]);   // \u2605 2026-10-10: \ucc28\ub840\ub85c \u2192 \ub3d9\uc2dc\uc5d0
        const want = ["id", "nick", "title", "body", "cat", "ts", "views", "likes", "lols", "sads", "link", "user"];
        const use = want.filter((c) => cols.indexOf(c) >= 0);
        if (!use.length) throw new Error("posts \ud14c\uc774\ube14 \uceec\ub7fc\uc744 \ucc3e\uc744 \uc218 \uc5c6\uc74c");
        // \u2605 2026-10-03: \ubaa9\ub85d\uc758 \ud83d\udcac \uc22b\uc790\uac00 \uae00\uc744 \ud3bc\uce58\uae30 \uc804\uc5d4 \ud56d\uc0c1 0\uc774\uc5c8\ub2e4 \u2192 \uc62c \ub54c\uac00 \ub41c \uc11c\ubc84 \ub313\uae00 \uc218\ub97c \uac19\uc774 \ub0b4\ub824\uc900\ub2e4
        const hasCmt = cmtCols.length > 0;
        // \u2605 2026-10-10: \ubaa9\ub85d\uc758 \ud83d\udcac \uc22b\uc790(\uae00\ub9c8\ub2e4 \ub313\uae00 \uc218 \uc138\uae30)\uac00 \ube60\ub974\ub3c4\ub85d \ub313\uae00 \ud45c\uc5d0 \uc0c9\uc778\uc744 \ud55c \ubc88 \ub9cc\ub4e4\uc5b4 \ub454\ub2e4(\uc774\ubbf8 \uc788\uc73c\uba74 \uc544\ubb34 \uc77c \uc5c6\uc74c)
        if (hasCmt && !_cmtIdxDone) { _cmtIdxDone = true; try { const pi = env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_comments_post ON comments (post_id, ts)").run().catch(function () {}); if (_CTX) _CTX.waitUntil(pi); } catch (e) {} }
        let sql = "SELECT " + use.join(",") + (hasCmt ? ", (SELECT COUNT(*) FROM comments c WHERE c.post_id = posts.id AND c.ts <= " + Date.now() + ") AS cmts" : "") + " FROM posts";
        const binds = [];
        const conds = [];
        if (cat && cat !== "all" && cols.indexOf("cat") >= 0) {
          conds.push("cat = ?");
          binds.push(cat);
        }
        // \u2605 2026-10-08: \uc2e0\uace0\uac00 \uc313\uc5ec \uc228\uae40 \ucc98\ub9ac\ub41c \uc0ac\uc6a9\uc790 \uae00\uc740 \ub0b4\ub824\uc8fc\uc9c0 \uc54a\ub294\ub2e4
        if (cols.indexOf("hidden") >= 0) conds.push("(hidden IS NULL OR hidden = 0)");
        if (conds.length) sql += " WHERE " + conds.join(" AND ");
        sql += " ORDER BY id DESC LIMIT ?";
        binds.push(limit);
        const rs = await env.DB.prepare(sql).bind(...binds).all();
        const bodyStr = JSON.stringify({ ok: true, posts: rs.results || [] });
        memPut("posts:" + limit + ":" + (cat || ""), bodyStr);
        const res = new Response(bodyStr, {
          headers: Object.assign({}, cors, { "Cache-Control": "public, s-maxage=30, max-age=15" })
        });
        try { await caches.default.put(cacheKey, res.clone()); } catch (e) {}
        return res;
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: cors });
      }
    }
    // \u2605 2026-09-25 \uc2e0\uc124: \uc2e4\uc81c \uc720\uc800\uac00 \uae00\uc5d0 \ub2ec\ub294 \ub313\uae00\uc744 D1\uc5d0 \uc800\uc7a5\ud558\uace0, \uac19\uc740 \uae00\uc744 \ubcf4\ub294 \ub2e4\ub978
    //   \uae30\uae30/\uc0ac\uc6a9\uc790\uc5d0\uac8c\ub3c4 \uadf8\ub300\ub85c \ubcf4\uc5ec\uc900\ub2e4. \ud1a0\ud070 \uac8c\uc774\ud305 \uc5c6\uc74c \u2014 /react(\uac00\uc9dc \ubc18\uc751 \uc0dd\uc131)\uacfc\ub2ec\ub9ac
    //   \uc2e4\uc81c \uc720\uc800 \uc561\uc158\uc774\ub77c \uc571\uc774 \ud1a0\ud070 \uc5c6\uc774 \ud638\ucd9c\ud568(subway-api\uc758 \uc2e4\uc81c \uc0ac\uc6a9\uc790 /react\uc640 \uac19\uc740 \uacb0).
    // \u2605 2026-10-08: \uc0ac\uc6a9\uc790 \uae00 \ub4f1\ub85d
    if (url.pathname === "/post" && req.method === "POST") {
      const J = (o, st) => new Response(JSON.stringify(o), { status: st || 200, headers: cors });
      let b = {};
      try { b = await req.json(); } catch (e) {}
      const nick = String(b.nick || "").replace(/\s+/g, " ").trim().slice(0, 16);
      const title = String(b.title || "").replace(/\s+/g, " ").trim().slice(0, 60);
      const body = String(b.body || "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, 800);
      const cat = USER_POST_CATS.indexOf(b.cat) >= 0 ? b.cat : "\uc7a1\ub2f4";
      if (!nick) return J({ ok: false, error: "\ucee4\ubba4\ub2c8\ud2f0 \uc544\uc774\ub514\uac00 \ud544\uc694\ud574\uc694" }, 400);
      if (!title || !body) return J({ ok: false, error: "\uc81c\ubaa9\uacfc \ub0b4\uc6a9\uc744 \uc785\ub825\ud574\uc8fc\uc138\uc694" }, 400);
      if (containsBadWord(nick) || containsBadWord(title) || containsBadWord(body)) return J({ ok: false, error: "\uc695\uc124\u00b7\ube44\ubc29\uc774 \ud3ec\ud568\ub418\uc5b4 \ub4f1\ub85d\ud560 \uc218 \uc5c6\uc5b4\uc694" }, 400);
      if (hasLinkOrPhone(title) || hasLinkOrPhone(body)) return J({ ok: false, error: "\ub9c1\ud06c\u00b7\uc804\ud654\ubc88\ud638\ub294 \uc62c\ub9b4 \uc218 \uc5c6\uc5b4\uc694" }, 400);
      try {
        await ensureUserPostCols(env);
        const ip = (await ownerHash("ip:" + (req.headers.get("CF-Connecting-IP") || "?"))).slice(0, 24);   // IP \uc6d0\ubb38\uc740 \uc800\uc7a5\ud558\uc9c0 \uc54a\ub294\ub2e4
        const hr = Math.floor(Date.now() / 36e5), day = Math.floor(Date.now() / 864e5);
        if (!(await bumpLimit(env, "post:" + ip, hr, POST_PER_IP_HR)) || !(await bumpLimit(env, "postd:" + ip, day, POST_PER_IP_DAY)))
          return J({ ok: false, error: "\uae00\uc744 \ub108\ubb34 \uc790\uc8fc \uc62c\ub9ac\uace0 \uc788\uc5b4\uc694. \uc7a0\uc2dc \ub4a4 \ub2e4\uc2dc \uc368\uc8fc\uc138\uc694" }, 429);
        const dup = await env.DB.prepare("SELECT id FROM posts WHERE nick = ?1 AND title = ?2 AND ts > ?3 LIMIT 1").bind(nick, title, Date.now() - 864e5).first();
        if (dup) return J({ ok: false, error: "\uac19\uc740 \uc81c\ubaa9\uc758 \uae00\uc744 \uc774\ubbf8 \uc62c\ub838\uc5b4\uc694" }, 400);
        const ts = Date.now();
        const cols = await getCols(env, "posts");
        const ok = String(b.owner_key || "");
        const data = { nick, title, body, cat, ts, likes: 0, lols: 0, sads: 0, user: 1, hidden: 0, owner: ok.length >= 16 ? await ownerHash(ok) : null };
        const use = Object.keys(data).filter((k) => cols.indexOf(k) >= 0);
        const res = await env.DB.prepare("INSERT INTO posts (" + use.join(",") + ") VALUES (" + use.map(() => "?").join(",") + ")").bind(...use.map((k) => data[k])).run();
        const id = res && res.meta ? res.meta.last_row_id : null;
        await purgePostsCache(url);
        return J({ ok: true, id, ts });
      } catch (e) {
        return J({ ok: false, error: "\uc11c\ubc84 \uc624\ub958: " + e.message }, 500);
      }
    }
    // \u2605 2026-10-08: \uc791\uc131\uc790 \ubcf8\uc778 \uc0ad\uc81c \u2014 \ub4f1\ub85d\ud560 \ub54c \ubcf4\ub0b8 \uae30\uae30 \ube44\ubc00\ud0a4(owner_key)\uac00 \ub9de\uc544\uc57c \ud55c\ub2e4(\uac1c\uc778\uc815\ubcf4\ucc98\ub9ac\ubc29\uce68\uc758 '\uc9c1\uc811 \uc0ad\uc81c' \uc57d\uc18d)
    if (url.pathname === "/post/mine-delete" && req.method === "POST") {
      const J = (o, st) => new Response(JSON.stringify(o), { status: st || 200, headers: cors });
      let b = {};
      try { b = await req.json(); } catch (e) {}
      const pid = parseInt(b.post_id, 10), ok = String(b.owner_key || "");
      if (!pid || ok.length < 16) return J({ ok: false, error: "post_id\u00b7owner_key \ud544\uc694" }, 400);
      try {
        await ensureUserPostCols(env);
        const row = await env.DB.prepare("SELECT owner FROM posts WHERE id = ?1 AND user = 1").bind(pid).first();
        if (!row) return J({ ok: true, deleted: false });   // \uc774\ubbf8 \uc5c6\uc74c
        if (!row.owner || row.owner !== (await ownerHash(ok))) return J({ ok: false, error: "\ubcf8\uc778 \uae00\ub9cc \uc0ad\uc81c\ud560 \uc218 \uc788\uc5b4\uc694" }, 403);
        await env.DB.prepare("DELETE FROM posts WHERE id = ?1").bind(pid).run();
        try { await env.DB.prepare("DELETE FROM comments WHERE post_id = ?1").bind(pid).run(); } catch (e) {}
        await purgePostsCache(url);
        return J({ ok: true, deleted: true });
      } catch (e) {
        return J({ ok: false, error: e.message }, 500);
      }
    }
    // \u2605 2026-10-08: \uc0ac\uc6a9\uc790 \uae00 \uc2e0\uace0 \u2014 \uc11c\ub85c \ub2e4\ub978 3\uacf3\uc774 \uc2e0\uace0\ud558\uba74 \uc228\uae34\ub2e4
    if (url.pathname === "/report" && req.method === "POST") {
      const J = (o, st) => new Response(JSON.stringify(o), { status: st || 200, headers: cors });
      let b = {};
      try { b = await req.json(); } catch (e) {}
      const pid = parseInt(b.post_id, 10);
      if (!pid) return J({ ok: false, error: "post_id \ud544\uc694" }, 400);
      try {
        await ensureUserPostCols(env);
        const ip = (await ownerHash("ip:" + (req.headers.get("CF-Connecting-IP") || "?"))).slice(0, 24);   // IP \uc6d0\ubb38\uc740 \uc800\uc7a5\ud558\uc9c0 \uc54a\ub294\ub2e4
        if (!(await bumpLimit(env, "rep:" + ip, Math.floor(Date.now() / 36e5), REPORT_PER_IP_HR))) return J({ ok: false, error: "too many" }, 429);
        const post = await env.DB.prepare("SELECT id, user FROM posts WHERE id = ?1").bind(pid).first();
        if (!post || !post.user) return J({ ok: false, error: "\uc2e0\uace0\ud560 \uc218 \uc5c6\ub294 \uae00\uc774\uc5d0\uc694" }, 400);
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS post_reports (post_id INTEGER, k TEXT, ts INTEGER, PRIMARY KEY (post_id, k))").run();
        if (Math.random() < 0.05) { try { await env.DB.prepare("DELETE FROM post_reports WHERE ts < ?1").bind(Date.now() - 14 * 864e5).run(); } catch (e) {} }   // 14\uc77c \uc9c0\ub09c \uc2e0\uace0 \uae30\ub85d \uc0ad\uc81c(\ubc29\uce68\uacfc \ub3d9\uc77c)
        await env.DB.prepare("INSERT OR IGNORE INTO post_reports (post_id,k,ts) VALUES (?1,?2,?3)").bind(pid, ip, Date.now()).run();
        const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM post_reports WHERE post_id = ?1").bind(pid).first();
        let hidden = false;
        if (n && n.n >= REPORT_HIDE_AT) { await env.DB.prepare("UPDATE posts SET hidden = 1 WHERE id = ?1").bind(pid).run(); hidden = true; await purgePostsCache(url); }
        return J({ ok: true, hidden });
      } catch (e) {
        return J({ ok: false, error: e.message }, 500);
      }
    }
    // \u2605 2026-10-08: \uad00\ub9ac\uc790 \u2014 \uae00 \uc0ad\uc81c / \uc2e0\uace0\ub41c \uae00 \ubcf4\uae30 (ADMIN_TOKEN)
    if (url.pathname === "/post/delete" || url.pathname === "/reports") {
      if (!adminOk(url, env)) return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401, headers: cors });
      try {
        if (url.pathname === "/post/delete") {
          const id = parseInt(url.searchParams.get("id"), 10);
          if (!id) return new Response(JSON.stringify({ ok: false, error: "id \ud544\uc694" }), { status: 400, headers: cors });
          await env.DB.prepare("DELETE FROM posts WHERE id = ?1").bind(id).run();
          try { await env.DB.prepare("DELETE FROM comments WHERE post_id = ?1").bind(id).run(); } catch (e) {}
          await purgePostsCache(url);
          return new Response(JSON.stringify({ ok: true, deleted: id }), { headers: cors });
        }
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS post_reports (post_id INTEGER, k TEXT, ts INTEGER, PRIMARY KEY (post_id, k))").run();
        const rs = await env.DB.prepare("SELECT r.post_id, COUNT(*) AS n, p.nick, p.title, p.hidden FROM post_reports r LEFT JOIN posts p ON p.id = r.post_id GROUP BY r.post_id ORDER BY n DESC LIMIT 50").all();
        return new Response(JSON.stringify({ ok: true, reports: rs.results || [] }), { headers: cors });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: cors });
      }
    }
    if (url.pathname === "/comment" && req.method === "POST") {
      let body = {};
      try {
        body = await req.json();
      } catch (e) {
      }
      const postId = parseInt(body.post_id, 10);
      const nick = String(body.nick || "\ub098").slice(0, 16).trim() || "\ub098";
      const text = String(body.body || "").slice(0, 300).trim();
      if (!postId) return new Response(JSON.stringify({ ok: false, error: "post_id \ud544\uc694" }), { status: 400, headers: cors });
      if (!text) return new Response(JSON.stringify({ ok: false, error: "empty" }), { status: 400, headers: cors });
      if (containsBadWord(nick) || containsBadWord(text)) {
        return new Response(JSON.stringify({ ok: false, error: "\ubd80\uc801\uc808\ud55c \ub0b4\uc6a9\uc774 \ud3ec\ud568\ub418\uc5b4 \uc788\uc2b5\ub2c8\ub2e4" }), { status: 400, headers: cors });
      }
      try {
        const ts = Date.now();
        const cols = await getCols(env, "comments");
        if (!cols.length) throw new Error("comments \ud14c\uc774\ube14\uc774 \uc5c6\uc2b5\ub2c8\ub2e4 (D1\uc5d0 CREATE TABLE \ud544\uc694)");
        const data = { post_id: postId, nick, body: text, ts };
        const use = Object.keys(data).filter((k) => cols.indexOf(k) >= 0);
        const sql = "INSERT INTO comments (" + use.join(",") + ") VALUES (" + use.map(() => "?").join(",") + ")";
        const res = await env.DB.prepare(sql).bind(...use.map((k) => data[k])).run();
        const id = res && res.meta ? res.meta.last_row_id : null;
        return new Response(JSON.stringify({ ok: true, id, ts }), { headers: cors });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: cors });
      }
    }
    if (url.pathname === "/comments") {
      const postId = parseInt(url.searchParams.get("post_id"), 10);
      const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));
      if (!postId) return new Response(JSON.stringify({ ok: false, error: "post_id \ud544\uc694" }), { status: 400, headers: cors });
      try {
        const cols = await getCols(env, "comments");
        if (!cols.length) {
          return new Response(JSON.stringify({ ok: true, comments: [] }), { headers: cors });
        }
        const want = ["id", "nick", "body", "ts"];
        const use = want.filter((c) => cols.indexOf(c) >= 0);
        // \u2605 2026-10-03: \uc544\uc9c1 \uc62c \ub54c\uac00 \uc548 \ub41c(ts \uac00 \ubbf8\ub798\uc778) \uc11c\ubc84 \ub313\uae00\uc740 \uc228\uae34\ub2e4 \u2014 \uc2e4\uc81c \ub313\uae00\ucc98\ub7fc \ud558\ub098\uc529 \ub098\ud0c0\ub09c\ub2e4
        const sql = "SELECT " + use.join(",") + " FROM comments WHERE post_id = ? AND ts <= ? ORDER BY ts ASC, id ASC LIMIT ?";
        const rs = await env.DB.prepare(sql).bind(postId, Date.now(), limit).all();
        return new Response(JSON.stringify({ ok: true, now: Date.now(), comments: rs.results || [] }), {
          headers: Object.assign({}, cors, { "Cache-Control": "no-store" })
        });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: cors });
      }
    }
    // \u2605 2026-10-03: \ubaa8\ub4e0 \uc0ac\uc6a9\uc790\uac00 \uac19\uc740 \ub300\ud654\ub97c \ubcf8\ub2e4. \uc571\uc774 6\ucd08\ub9c8\ub2e4 \uc774 \ub77c\uc6b0\ud2b8\ub97c \ubd88\ub7ec \uc0c8 \uc904\ub9cc \ubc1b\uc544 \uac04\ub2e4.
    //   \u00b7 ts \uac00 '\uc9c0\uae08 \uc774\uc804'\uc778 \uc904\ub9cc \ub0b4\ub824\uc900\ub2e4(generateTalks \ub294 19\ubd84\uc5d0 \uac78\uccd0 \uc2dc\uac01\uc744 \ubbf8\ub9ac \ud769\ubfcc\ub824 \uc800\uc7a5\ud558\ubbc0\ub85c,
    //     \uc544\uc9c1 \uc62c \ub54c\uac00 \uc548 \ub41c \uc904\uc740 \uc228\uaca8\uc838\uc57c \uc2e4\uc81c \ucc44\ud305\ucc98\ub7fc \ud55c \uc904\uc529 \ub098\ud0c0\ub09c\ub2e4).
    //   \u00b7 \ucee4\uc11c\ub294 id \uac00 \uc544\ub2c8\ub77c ts(since)\ub2e4 \u2014 \uc0ac\uc6a9\uc790 \uba54\uc2dc\uc9c0\u00b7\ubc18\uc751\uc774 \uac19\uc740 \ubc30\uce58 \uc0ac\uc774\uc0ac\uc774 \ub07c\uc5b4\ub4e4\uc5b4 id \uc21c\uc11c\uc640
    //     \uc2dc\uac01 \uc21c\uc11c\uac00 \ub2e4\ub974\ub2e4. \uac19\uc740 ts \uc904\uc744 \ub2e4\uc2dc \ubc1b\uc744 \uc218 \uc788\uc73c\ub2c8 \uc571\uc774 id \ub85c \uc911\ubcf5\uc744 \uac78\ub7ec\ub0b8\ub2e4.
    //   \u00b7 \ucd5c\uadfc 100\uc904 \uc2a4\ub0c5\uc0f7\uc744 5\ucd08\ub9cc \uc5e3\uc9c0\uce90\uc2dc\ud574 \uc0ac\uc6a9\uc790\uac00 \ubab0\ub824\ub3c4 D1 \uc740 \uba87 \ucd08\uc5d0 \ud55c \ubc88\ub9cc \uc77d\ub294\ub2e4.
    if (url.pathname === "/talks") {
      const since = parseInt(url.searchParams.get("since") || "0", 10) || 0;
      const limit = Math.min(60, Math.max(1, parseInt(url.searchParams.get("limit") || "30", 10)));
      const snapKey = new Request(url.origin + "/talks?snap=1");
      // \u2605 2026-10-10: workers.dev \uc5d0\uc11c\ub294 \uc5e3\uc9c0 \uce90\uc2dc(caches.default)\uac00 \ub3d9\uc791\ud558\uc9c0 \uc54a\ub294\ub2e4(Cloudflare \ubb38\uc11c: \uc0ac\uc6a9\uc790 \uc9c0\uc815 \ub3c4\uba54\uc778\uc5d0\uc11c\ub9cc) \u2192
      //   \uac19\uc740 \uaca9\ub9ac \uc548\uc5d0\uc11c 5\ucd08\uac04\uc740 \uba54\ubaa8\ub9ac \uc2a4\ub0c5\uc0f7\uc744 \uc4f4\ub2e4.
      let snap = memGet("talks", 5000);
      try {
        if (!snap) {
          const hit = await caches.default.match(snapKey);
          if (hit) snap = await hit.json();
        }
      } catch (e) {
      }
      if (!snap) {
        try {
          // \u2605 2026-10-04: \uc804\uccb4 = \uac01 \ub178\uc120 \ubc29(line_msgs \uc758 chat)\uc744 \uc2dc\uac04\uc21c\uc73c\ub85c \ubaa8\uc740 \uac83. \uac01 \uc904\uc5d0 line(\ub178\uc120\uba85)\uc774 \ubd99\ub294\ub2e4.
          //   \uc61b talks(\uc804\uccb4\uc5d0\uc11c \ub178\uc120 \uc5c6\uc774 \ubcf4\ub0b8 \ub9d0\u00b7\uc608\uc804 \ubc18\uc751)\ub3c4 \ucd5c\uadfc 6\uc2dc\uac04\ubd84\uc740 \ud568\uaed8 \uc11e\ub294\ub2e4(line \uc740 null).
          await ensureLineRoom(env);
          const nowT = Date.now();
          const rs = await env.DB.prepare("SELECT * FROM (SELECT 'L' || id AS id, nick, text, ts, line FROM line_msgs WHERE kind='chat' AND ts <= ?1 AND ts > ?2" + LR_HIDDEN_SQL + " UNION ALL SELECT id, nick, text, ts, NULL AS line FROM talks WHERE ts <= ?1 AND ts > ?2) ORDER BY ts DESC LIMIT 100").bind(nowT, nowT - 6 * 3600 * 1000).all();
          snap = { talks: (rs.results || []).reverse() };
          memPut("talks", snap);
          try {
            await caches.default.put(snapKey, new Response(JSON.stringify(snap), { headers: { "Content-Type": "application/json", "Cache-Control": "public, s-maxage=5" } }));
          } catch (e) {
          }
        } catch (e) {
          if (/no such table/i.test(String(e && e.message)) && !_lrRetry) { _lrRetry = true; _lrReady = false; try { await ensureLineRoom(env, true); return await worker_default.fetch(req, env, ctx); } finally { _lrRetry = false; } }
          return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: cors });
        }
      }
      let rows = snap.talks || [];
      rows = since > 0 ? rows.filter(function(t) { return t.ts >= since; }) : rows.slice(-limit);
      return new Response(JSON.stringify({ ok: true, now: Date.now(), talks: rows }), { headers: Object.assign({}, cors, { "Cache-Control": "no-store" }) });
    }
    // \u2605 2026-10-03 (\uac1c\uc120\uc548 4\u00b75): \ub178\uc120\ubcc4 \ubc29. \ub300\ud654 \uc77d\uae30/\uc4f0\uae30 + \uc9c0\uc5f0 \uc81c\ubcf4 \uc9d1\uacc4.
    if (url.pathname === "/lroom" && req.method === "POST") {
      let body = {};
      try { body = await req.json(); } catch (e) {}
      const line = String(body.line || "").trim();
      const kind = LR_KINDS_OK.indexOf(body.kind) >= 0 ? body.kind : "chat";
      const nick = String(body.nick || "\ub098").slice(0, 16).trim() || "\ub098";
      const stn = String(body.stn || "").slice(0, 20).trim();
      let text = String(body.text || "").slice(0, 120).trim();
      if (!lrLineOk(line)) return new Response(JSON.stringify({ ok: false, error: "line" }), { status: 400, headers: cors });
      if (!text) text = kind === "delay" ? (stn ? stn + " \ucabd \uc9c0\uc5f0\ub3fc\uc694" : "\uc9c0\uc5f0\ub3fc\uc694") : kind === "crowd" ? (stn ? stn + " \ub9ce\uc774 \ubd90\ubcbc\uc694" : "\ub9ce\uc774 \ubd90\ubcbc\uc694") : "";
      if (!text) return new Response(JSON.stringify({ ok: false, error: "empty" }), { status: 400, headers: cors });
      if (containsBadWord(nick) || containsBadWord(text) || containsBadWord(stn)) return new Response(JSON.stringify({ ok: false, error: "filtered" }), { status: 400, headers: cors });
      try {
        await ensureLineRoom(env);
        if (!await lrAllowed(req, env)) return new Response(JSON.stringify({ ok: false, error: "rate limited" }), { status: 429, headers: cors });
        const ipk = await lrIpHash(req);
        const now = Date.now();
        // \uac19\uc740 \uc0ac\ub78c\uc758 \uac19\uc740 \uae00\u00b7\uc81c\ubcf4\ub294 \uc9e7\uc740 \uc2dc\uac04 \uc548\uc5d0 \ud55c \ubc88\ub9cc \uc800\uc7a5\ud55c\ub2e4
        const dupWin = kind === "chat" ? 60 * 1000 : 20 * 60 * 1000;
        const dup = kind === "chat"
          ? await env.DB.prepare("SELECT id FROM line_msgs WHERE line=?1 AND ipk=?2 AND text=?3 AND ts > ?4 LIMIT 1").bind(line, ipk, text, now - dupWin).first()
          : await env.DB.prepare("SELECT id FROM line_msgs WHERE line=?1 AND ipk=?2 AND kind=?3 AND IFNULL(stn,'')=?4 AND ts > ?5 LIMIT 1").bind(line, ipk, kind, stn, now - dupWin).first();
        if (dup) return new Response(JSON.stringify({ ok: true, dup: true, id: dup.id }), { headers: cors });
        const res = await env.DB.prepare("INSERT INTO line_msgs (line,kind,nick,text,stn,ipk,ts) VALUES (?1,?2,?3,?4,?5,?6,?7)").bind(line, kind, nick, text, stn || null, ipk, now).run();
        return new Response(JSON.stringify({ ok: true, id: res && res.meta ? res.meta.last_row_id : null, ts: now }), { headers: cors });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: cors });
      }
    }
    if (url.pathname === "/ridelog" && req.method === "POST") return rideHandle(req, env, cors);
    if (url.pathname === "/lreport" && req.method === "POST") {
      let body = {};
      try { body = await req.json(); } catch (e) {}
      const id = parseInt(body.id, 10);
      if (!isFinite(id) || id <= 0) return new Response(JSON.stringify({ ok: false, error: "id" }), { status: 400, headers: cors });
      try {
        await ensureLineRoom(env);
        if (!await lrAllowed(req, env)) return new Response(JSON.stringify({ ok: false, error: "rate limited" }), { status: 429, headers: cors });
        const ipk = await lrIpHash(req);
        const m = await env.DB.prepare("SELECT id, ipk FROM line_msgs WHERE id=?1").bind(id).first();
        if (!m) return new Response(JSON.stringify({ ok: true, gone: true }), { headers: cors });
        if (m.ipk === ipk) return new Response(JSON.stringify({ ok: true, own: true }), { headers: cors });   // \ub0b4 \uae00\uc740 \uc2e0\uace0 \ub300\uc0c1\uc774 \uc544\ub2c8\ub2e4
        await env.DB.prepare("INSERT OR IGNORE INTO line_reports (msg_id, ipk, ts) VALUES (?1,?2,?3)").bind(id, ipk, Date.now()).run();
        const c = await env.DB.prepare("SELECT COUNT(*) AS n FROM line_reports WHERE msg_id=?1").bind(id).first();
        return new Response(JSON.stringify({ ok: true, hidden: ((c && c.n) || 0) >= LR_HIDE_N }), { headers: cors });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: cors });
      }
    }
    if (url.pathname === "/lroom") {
      const line = String(url.searchParams.get("line") || "").trim();
      if (!lrLineOk(line)) return new Response(JSON.stringify({ ok: false, error: "line" }), { status: 400, headers: cors });
      const since = parseInt(url.searchParams.get("since") || "0", 10) || 0;
      const snapKey = new Request(url.origin + "/lroom?snap=1&line=" + encodeURIComponent(line));
      let snap = memGet("lroom:" + line, 5000);
      if (!snap) { try { const hit = await caches.default.match(snapKey); if (hit) snap = await hit.json(); } catch (e) {} }
      if (!snap) {
        try {
          await ensureLineRoom(env);
          const now = Date.now();
          const alP = lrAlerts(env, [line]);   // \u2605 2026-10-10: \ub300\ud654\uc640 \uc9c0\uc5f0 \uc81c\ubcf4 \uc9d1\uacc4\ub97c \ub3d9\uc2dc\uc5d0 \uc77d\ub294\ub2e4
          alP.catch(function () {});
          const rs = await env.DB.prepare("SELECT id, kind, nick, text, stn, ts FROM line_msgs WHERE line=?1 AND ts <= ?2 AND ts > ?3" + LR_HIDDEN_SQL + " ORDER BY ts DESC, id DESC LIMIT 80").bind(line, now, now - 24 * 3600 * 1000).all();   // \u2605 2026-10-05: \ud654\uba74\uc5d0 \ubcf4\uc774\ub294 \uae30\uac04 12\uc2dc\uac04\u219224\uc2dc\uac04(\uc0c8\ubcbd\uc5d0\ub3c4 \uc804\ub0a0 \uc800\ub141 \ub300\ud654\uac00 \ub0a8\uc544 \ubc29\uc774 \ube44\uc5b4 \ubcf4\uc774\uc9c0 \uc54a\uac8c)
          const al = await alP;
          snap = { msgs: (rs.results || []).reverse(), alert: al[line] || { reporters: 0, stations: [] } };
          memPut("lroom:" + line, snap);
          try { await caches.default.put(snapKey, new Response(JSON.stringify(snap), { headers: { "Content-Type": "application/json", "Cache-Control": "public, s-maxage=5" } })); } catch (e) {}
        } catch (e) {
          if (/no such table/i.test(String(e && e.message)) && !_lrRetry) { _lrRetry = true; _lrReady = false; try { await ensureLineRoom(env, true); return await worker_default.fetch(req, env, ctx); } finally { _lrRetry = false; } }
          return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: cors });
        }
      }
      const rows = since > 0 ? (snap.msgs || []).filter((m) => m.ts >= since) : (snap.msgs || []);
      return new Response(JSON.stringify({ ok: true, now: Date.now(), msgs: rows, alert: snap.alert }), { headers: Object.assign({}, cors, { "Cache-Control": "no-store" }) });
    }
    if (url.pathname === "/lalerts") {
      const lines = String(url.searchParams.get("lines") || "").split(",").map((x) => x.trim()).filter(lrLineOk).slice(0, 8);
      if (!lines.length) return new Response(JSON.stringify({ ok: true, lines: {} }), { headers: cors });
      const key = new Request(url.origin + "/lalerts?lines=" + encodeURIComponent(lines.join(",")));
      try { const hit = await caches.default.match(key); if (hit) return hit; } catch (e) {}
      try {
        await ensureLineRoom(env);
        const al = await lrAlerts(env, lines);
        const res = new Response(JSON.stringify({ ok: true, now: Date.now(), lines: al }), { headers: Object.assign({}, cors, { "Cache-Control": "public, s-maxage=20" }) });
        try { await caches.default.put(key, res.clone()); } catch (e) {}
        return res;
      } catch (e) {
        if (/no such table/i.test(String(e && e.message)) && !_lrRetry) { _lrRetry = true; _lrReady = false; try { await ensureLineRoom(env, true); return await worker_default.fetch(req, env, ctx); } finally { _lrRetry = false; } }
        return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: cors });
      }
    }
    if (url.pathname === "/react" && req.method === "POST") {
      let body = {};
      try {
        body = await req.json();
      } catch (e) {
      }
      const nick = String(body.nick || "\ub098").slice(0, 16);
      const text = String(body.text || "").slice(0, 200).trim();
      const rline = body.line == null ? "" : String(body.line).trim();   // \u2605 2026-10-04: \ub178\uc120 \ubc29\uc5d0\uc11c \ubcf4\ub0b8 \ub9d0\uc774\uba74 \uadf8 \ubc29\uc5d0 \uc800\uc7a5\ud558\uace0 \uadf8 \ubc29\uc5d0\uc11c \ubc18\uc751\ud55c\ub2e4
      if (rline && !lrLineOk(rline)) return new Response(JSON.stringify({ ok: false, error: "line" }), { status: 400, headers: cors });
      if (!text) return new Response(JSON.stringify({ ok: false, error: "empty" }), { status: 400, headers: cors });
      if (containsBadWord(nick) || containsBadWord(text)) return new Response(JSON.stringify({ ok: false, error: "filtered" }), { status: 400, headers: cors });
      // \u2605 2026-10-03: \uc0ac\uc6a9\uc790\uac00 \uce5c \ub9d0\uc744 \ub300\ud654\uc5d0 \uc800\uc7a5\ud574\uc57c \ub2e4\ub978 \uc0ac\uc6a9\uc790\uc5d0\uac8c\ub3c4 \ubcf4\uc778\ub2e4(\uc804\uc5d0\ub294 AI \ubc18\uc751\ub9cc \uc800\uc7a5).
      //   \uc695\uc124\u00b7\ube44\ubc29\uc740 \uc800\uc7a5\ud558\uc9c0 \uc54a\ub294\ub2e4. \uc0ac\uc6a9\uc790 \ub9d0 \uc800\uc7a5\uc740 AI \ubc18\uc751\uacfc \ubcc4\ub3c4\uc758 \ud55c\ub3c4(IP\ub2f9 \uc2dc\uac04\ub2f9 40\uc904)\ub97c \uc4f4\ub2e4.
      let stored = false;
      try {
        if (rline && !containsBadWord(nick) && !containsBadWord(text) && await msgAllowed(req, env)) {
          await ensureLineRoom(env);
          const ipk = await lrIpHash(req);
          await env.DB.prepare("INSERT INTO line_msgs (line,kind,nick,text,stn,ipk,ts) VALUES (?1,'chat',?2,?3,NULL,?4,?5)").bind(rline, nick, text.slice(0, 120), ipk, Date.now()).run();
          stored = true;
        } else if (!rline && !containsBadWord(nick) && !containsBadWord(text) && await msgAllowed(req, env)) {
          const info = await getCols(env, "talks");
          const data = { nick, text: text.slice(0, 120), ts: Date.now() };
          const use = Object.keys(data).filter((k) => info.indexOf(k) >= 0);
          if (use.length) {
            await env.DB.prepare("INSERT INTO talks (" + use.join(",") + ") VALUES (" + use.map(() => "?").join(",") + ")").bind(...use.map((k) => data[k])).run();
            stored = true;
          }
        }
      } catch (e) {
      }
      if (!await reactAllowed(req, env))
        return new Response(JSON.stringify({ ok: false, error: "rate limited", stored }), { status: 429, headers: cors });
      const r = await generateReaction(env, nick, text, rline || null);
      return new Response(JSON.stringify({ ok: true, stored, result: r }), { headers: cors });
    }
    if (url.pathname === "/gentalk") {
      if (!adminOk(url, env))
        return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401, headers: cors });
      const r = await generateTalks(env);
      return new Response(JSON.stringify({ ok: true, result: r }), { headers: cors });
    }
    if (url.pathname === "/news") {
      if (!adminOk(url, env))
        return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401, headers: cors });
      const report = [];
      for (const feed of NEWS_FEEDS) {
        const r = await fetchHeadlines(feed, true);
        report.push({ cat: feed.cat, got: r.titles.length, sample: r.titles.slice(0, 2), tries: r.tries });
      }
      return new Response(JSON.stringify({ ok: true, feeds: report }, null, 1), { headers: cors });
    }
    if (url.pathname === "/status") {
      try {
        const c = await env.DB.prepare("SELECT COUNT(*) AS n, MIN(id) AS oldest, MAX(id) AS newest FROM posts").first();
        let tk = null;
        try {
          tk = await env.DB.prepare("SELECT COUNT(*) AS n, MAX(ts) AS lastTs FROM talks").first();
        } catch (e) {
        }
        return new Response(JSON.stringify({ ok: true, posts: { count: c.n, oldest: c.oldest, newest: c.newest }, talks: tk }), { headers: cors });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: cors });
      }
    }
    return new Response(JSON.stringify({ ok: true, name: "board-writer", endpoints: ["/gen?token=..&n=3", "/posts?limit=50&cat=all", "/comment (POST)", "/comments?post_id=&limit=50", "/newsfeed", "/talks?since=<ts>", "/lroom?line=<\ub178\uc120>&since=<ts>", "/lroom (POST)", "/lalerts?lines=a,b", "/react (POST)", "/status"] }), { headers: cors });
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
var GD_OPT = { cls: function (p, m) { if (p === "/gen" || p === "/post/delete" || p === "/reports") return "admin"; if (m === "POST") return "write"; if (p === "/newsfeed") return "heavy"; return "light"; }, cfg: {"light":{"cap":80,"rate":6},"heavy":{"cap":20,"rate":1},"write":{"cap":20,"rate":0.5},"admin":{"cap":10,"rate":0.1}}, heavyMax: 64 };
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
export default gdWrap(worker_default);
//# sourceMappingURL=worker.js.map

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// food-worker.js
var VERSION = "gildongmu-content-2026-09-20d";
var CORS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Token"
};
function json(o, status) {
  return new Response(JSON.stringify(o), { status: status || 200, headers: CORS });
}
__name(json, "json");
var KEY_DEFAULT = "";   // 2026-10-01: 소스에 키를 두지 않는다 — 시크릿 DATA_GO_KR_KEY(또는 TAGO_KEY)를 쓴다
function apiKey(env) {
  return env && (env.DATA_GO_KR_KEY || env.TAGO_KEY) || KEY_DEFAULT;
}
__name(apiKey, "apiKey");
var SDSC = "https://apis.data.go.kr/B553077/api/open/sdsc2";
var FETCH_TIMEOUT_MS = 9e3;
var ROWS = 1e3;
var RUN_CALLS = 24;
var CONCURRENCY = 6;
var ONDEMAND_PAGES = 2;
var REFRESH_DAYS = 7;
var REFRESH_AGE_D = 20;
var DAILY_DEFAULT = 900;
function today() {
  return new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 10);
}
__name(today, "today");
async function quotaLeft(env) {
  const lim = parseInt(await metaGet(env, "dailyLimit") || String(DAILY_DEFAULT), 10);
  const d = await metaGet(env, "usedDate");
  const n = d === today() ? parseInt(await metaGet(env, "usedN") || "0", 10) : 0;
  return { limit: lim, used: n, left: Math.max(0, lim - n) };
}
__name(quotaLeft, "quotaLeft");
async function quotaAdd(env, n) {
  const d = await metaGet(env, "usedDate");
  const cur = d === today() ? parseInt(await metaGet(env, "usedN") || "0", 10) : 0;
  await metaSet(env, "usedDate", today());
  await metaSet(env, "usedN", cur + n);
}
__name(quotaAdd, "quotaAdd");
var CELL = 0.01;
function cellOf(lat, lng) {
  return Math.floor(lat / CELL) * 1e5 + Math.floor(lng / CELL);
}
__name(cellOf, "cellOf");
function cellsAround(lat, lng, r) {
  const dLat = r / 111e3, dLng = r / (111e3 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
  const out = [];
  const y0 = Math.floor((lat - dLat) / CELL), y1 = Math.floor((lat + dLat) / CELL);
  const x0 = Math.floor((lng - dLng) / CELL), x1 = Math.floor((lng + dLng) / CELL);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push(y * 1e5 + x);
  return out;
}
__name(cellsAround, "cellsAround");
function hav(y1, x1, y2, x2) {
  const R = 6371e3, t = Math.PI / 180;
  const dy = (y2 - y1) * t, dx = (x2 - x1) * t;
  const a = Math.sin(dy / 2) ** 2 + Math.cos(y1 * t) * Math.cos(y2 * t) * Math.sin(dx / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}
__name(hav, "hav");
async function ensure(env) {
  if (ensure._done) return;
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS food (id TEXT PRIMARY KEY, nm TEXT, cat TEXT, addr TEXT, lat REAL, lng REAL, cell INTEGER, src TEXT, upd INTEGER)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_food_cell ON food(cell)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS food_task (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, k1 TEXT, k2 TEXT, page INTEGER, state TEXT, got INTEGER, note TEXT)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_task_state ON food_task(state)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS food_meta (k TEXT PRIMARY KEY, v TEXT)"),
    // ★ 2026-09-14: 한 번 받아 온 구역은 서버에 남겨 다음 사람이 그대로 쓴다.
    //   같은 자리를 여러 사람이 볼 때마다 공공 API 를 다시 부르지 않기 위한 표시다.
    env.DB.prepare("CREATE TABLE IF NOT EXISTS food_cell (cell INTEGER PRIMARY KEY, upd INTEGER, n INTEGER)"),
    // ★ 2026-09-15: 기지국 ↔ 역 대응표 공유.
    //   앱은 2026-08-30 부터 /cells 를 부르고 있었는데 서버에 만든 적이 없었다(HTTP 404).
    //   그래서 학습한 매핑이 기기 밖으로 나가지 못했고, 앱을 지우면 사라졌다.
    //   개인 위치 이력이 아니라 '셀 ID → 역 이름' 대응표라 공유해도 개인이 드러나지 않는다.
    env.DB.prepare("CREATE TABLE IF NOT EXISTS cell_map (k TEXT PRIMARY KEY, s TEXT, l TEXT, n INTEGER, lat REAL, lng REAL, upd INTEGER)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_cell_n ON cell_map(n)"),
    // ★ 2026-09-20: 앱 업데이트 없이 서버에서 운영하기 위한 두 테이블.
    //   app_config = 앱이 켜질 때 받아가는 설정 뭉치(쇼핑 추천 규칙 등). 값은 JSON.
    //   content_pool = 게시판 글감·실시간 대화 소재. 6개월치를 미리 채워 두고
    //     날짜로 갈라 쓴다 — 매일 같은 얘기만 도는 걸 막으려는 것이다.
    env.DB.prepare("CREATE TABLE IF NOT EXISTS app_config (k TEXT PRIMARY KEY, v TEXT, upd INTEGER)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS content_pool (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, bucket INTEGER, body TEXT, upd INTEGER)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_pool_kb ON content_pool(kind, bucket)")
  ]);
  ensure._done = true;
}
__name(ensure, "ensure");
async function metaGet(env, k) {
  try {
    const r = await env.DB.prepare("SELECT v FROM food_meta WHERE k=?1").bind(k).first();
    return r ? r.v : null;
  } catch (e) {
    return null;
  }
}
__name(metaGet, "metaGet");
async function metaSet(env, k, v) {
  await env.DB.prepare("INSERT INTO food_meta (k,v) VALUES (?1,?2) ON CONFLICT(k) DO UPDATE SET v=?2").bind(k, String(v)).run();
}
__name(metaSet, "metaSet");
async function callApi(env, path, qs) {
  const url = SDSC + "/" + path + "?serviceKey=" + encodeURIComponent(apiKey(env)) + "&type=json&" + qs;
  const res = await Promise.race([
    fetch(url, { headers: { "Accept": "application/json" } }),
    new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), FETCH_TIMEOUT_MS))
  ]);
  const txt = await res.text();
  let body = null;
  try {
    body = JSON.parse(txt);
  } catch (e) {
    return { ok: false, why: "not-json:" + txt.slice(0, 120), items: [] };
  }
  const cmm = body && body.OpenAPI_ServiceResponse && body.OpenAPI_ServiceResponse.cmmMsgHeader;
  if (cmm) {
    return {
      ok: false,
      items: [],
      why: (cmm.errMsg || "") + (cmm.returnAuthMsg ? " / " + cmm.returnAuthMsg : "") + (cmm.returnReasonCode ? " [" + cmm.returnReasonCode + "]" : "")
    };
  }
  const b = body && body.body || body && body.response && body.response.body || null;
  let items = b && b.items || [];
  if (items && !Array.isArray(items) && items.item) items = items.item;
  if (!Array.isArray(items)) items = items ? [items] : [];
  const hdr = body && body.header || body && body.response && body.response.header || {};
  const code = hdr.resultCode != null ? String(hdr.resultCode) : "";
  if (items.length === 0 && code && code !== "00" && code !== "0") {
    return { ok: false, why: code + ":" + (hdr.resultMsg || "").slice(0, 60), items: [] };
  }
  if (!items.length && !b) return { ok: false, items: [], why: "body 없음: " + txt.slice(0, 100) };
  return { ok: true, items, total: b && b.totalCount || 0 };
}
__name(callApi, "callApi");
function mapItem(it) {
  const nm = it.bizesNm || it.bizesNm1 || it.storeNm || "";
  const lat = parseFloat(it.lat != null ? it.lat : it.lati);
  const lng = parseFloat(it.lon != null ? it.lon : it.lng != null ? it.lng : it.longi);
  if (!nm || !isFinite(lat) || !isFinite(lng)) return null;
  if (lat < 32 || lat > 39.6 || lng < 124 || lng > 132.5) return null;
  const cat = [it.indsMclsNm, it.indsSclsNm].filter(Boolean).join(" ");
  const addr = it.rdnmAdr || it.lnoAdr || "";
  const id = it.bizesId || nm + "@" + lat.toFixed(5) + "," + lng.toFixed(5);
  return { id, nm, cat, addr, lat, lng, cell: cellOf(lat, lng), src: "sdsc2" };
}
__name(mapItem, "mapItem");
var FOOD_RE = /음식|식당|한식|중식|일식|양식|분식|카페|커피|제과|주점|치킨|피자|패스트푸드|뷔페|기타간이|비알콜/;
function isFood(it) {
  const s = [it.indsLclsNm, it.indsMclsNm, it.indsSclsNm].filter(Boolean).join(" ");
  return !s || FOOD_RE.test(s);
}
__name(isFood, "isFood");
async function saveItems(env, rows) {
  if (!rows.length) return 0;
  const now = Math.floor(Date.now() / 1e3);
  const st = env.DB.prepare(
    "INSERT INTO food (id,nm,cat,addr,lat,lng,cell,src,upd) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9) ON CONFLICT(id) DO UPDATE SET nm=?2,cat=?3,addr=?4,lat=?5,lng=?6,cell=?7,upd=?9"
  );
  let n = 0;
  for (let i = 0; i < rows.length; i += 25) {
    const chunk = rows.slice(i, i + 25).map((r) => st.bind(r.id, r.nm, r.cat, r.addr, r.lat, r.lng, r.cell, r.src, now));
    await env.DB.batch(chunk);
    n += chunk.length;
  }
  return n;
}
__name(saveItems, "saveItems");
var SIDO = [
  "11",
  "26",
  "27",
  "28",
  "29",
  "30",
  "31",
  "36",
  "41",
  "42",
  "51",
  "43",
  "44",
  "45",
  "52",
  "46",
  "47",
  "48",
  "50"
];
async function planSido(env, mode) {
  const rows = [];
  for (const s of SIDO) rows.push({ kind: mode || "dong", k1: "ctprvnCd", k2: s, page: 1 });
  return addTasks(env, rows);
}
__name(planSido, "planSido");
async function planStops(env, limit) {
  if (!env.SUBDB) return { added: 0, err: "SUBDB 바인딩이 없다(wrangler.toml 확인)" };
  const q = await env.SUBDB.prepare(
    "SELECT lat, lng FROM bus_stops WHERE lat IS NOT NULL LIMIT 300000"
  ).all();
  const seen = /* @__PURE__ */ new Set(), rows = [];
  for (const r of q.results || []) {
    const la = parseFloat(r.lat), ln = parseFloat(r.lng);
    if (!isFinite(la) || !isFinite(ln)) continue;
    const k = Math.round(la / 0.02) + ":" + Math.round(ln / 0.02);
    if (seen.has(k)) continue;
    seen.add(k);
    rows.push({ kind: "radius", k1: la.toFixed(5), k2: ln.toFixed(5), page: 1 });
    if (limit && rows.length >= limit) break;
  }
  return addTasks(env, rows);
}
__name(planStops, "planStops");
async function addTasks(env, rows) {
  const st = env.DB.prepare("INSERT INTO food_task (kind,k1,k2,page,state,got) VALUES (?1,?2,?3,?4,'todo',0)");
  for (let i = 0; i < rows.length; i += 25) {
    await env.DB.batch(rows.slice(i, i + 25).map((r) => st.bind(r.kind, r.k1, r.k2, r.page)));
  }
  return { added: rows.length };
}
__name(addTasks, "addTasks");
function taskQs(t, mode) {
  if (t.kind === "radius") {
    return {
      path: "storeListInRadius",
      qs: "radius=1500&cx=" + t.k2 + "&cy=" + t.k1 + "&numOfRows=" + ROWS + "&pageNo=" + t.page + (mode ? "&indsLclsCd=" + mode : "")
    };
  }
  return {
    path: "storeListInDong",
    qs: "divId=" + t.k1 + "&key=" + t.k2 + "&numOfRows=" + ROWS + "&pageNo=" + t.page + (mode ? "&indsLclsCd=" + mode : "")
  };
}
__name(taskQs, "taskQs");
async function runTasks(env, n) {
  await ensure(env);
  const mode = await metaGet(env, "indsLclsCd") || "";
  const qt = await quotaLeft(env);
  if (qt.left <= 0) return { quota: "exhausted", used: qt.used, limit: qt.limit, ran: 0 };
  const want = Math.min(n || RUN_CALLS, qt.left);
  const q = await env.DB.prepare(
    "SELECT * FROM food_task WHERE state='todo' ORDER BY id LIMIT ?1"
  ).bind(want).all();
  const tasks = q.results || [];
  if (!tasks.length) return { done: true, ran: 0 };
  const out = { ran: 0, saved: 0, more: 0, fail: 0, errs: [] };
  const next = [];
  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    const slice = tasks.slice(i, i + CONCURRENCY);
    const got = await Promise.all(slice.map(async (t) => {
      const { path, qs } = taskQs(t, mode);
      try {
        return { t, r: await callApi(env, path, qs) };
      } catch (e) {
        return { t, r: { ok: false, why: String(e && e.message || e).slice(0, 60), items: [] } };
      }
    }));
    for (const g of got) {
      out.ran++;
      if (!g.r.ok) {
        out.fail++;
        if (out.errs.length < 3) out.errs.push(g.r.why);
        await env.DB.prepare("UPDATE food_task SET state='fail', note=?2 WHERE id=?1").bind(g.t.id, String(g.r.why).slice(0, 90)).run();
        continue;
      }
      const rows = g.r.items.filter(isFood).map(mapItem).filter(Boolean);
      out.saved += await saveItems(env, rows);
      await env.DB.prepare("UPDATE food_task SET state='done', got=?2 WHERE id=?1").bind(g.t.id, g.r.items.length).run();
      if (g.r.items.length >= ROWS) {
        next.push({ kind: g.t.kind, k1: g.t.k1, k2: g.t.k2, page: (g.t.page || 1) + 1 });
      }
    }
  }
  if (next.length) {
    await addTasks(env, next);
    out.more = next.length;
  }
  await quotaAdd(env, out.ran);
  await metaSet(env, "lastRun", (/* @__PURE__ */ new Date()).toISOString());
  const q2 = await quotaLeft(env);
  out.used = q2.used;
  out.limit = q2.limit;
  return out;
}
__name(runTasks, "runTasks");
async function refreshOld(env) {
  const qt = await quotaLeft(env);
  if (qt.left <= 4) return 0;
  const cut = Math.floor(Date.now() / 1e3) - REFRESH_AGE_D * 86400;
  const q = await env.DB.prepare(
    "SELECT cell FROM food_cell WHERE upd < ?1 ORDER BY upd LIMIT ?2"
  ).bind(cut, Math.max(1, Math.floor(Math.min(RUN_CALLS, qt.left) / ONDEMAND_PAGES))).all();
  const cells = (q.results || []).map((r) => r.cell);
  if (!cells.length) return 0;
  let n = 0;
  for (const c of cells) {
    const y = Math.floor(c / 1e5), x = c - y * 1e5;
    const lat = (y + 0.5) * CELL, lng = (x + 0.5) * CELL;
    if (lat < 32 || lat > 39.6 || lng < 124 || lng > 132.5) {
      await markCells(env, [c], 0);
      continue;
    }
    n += await fetchAround(env, lat, lng, 1e3, null);
    const left = await quotaLeft(env);
    if (left.left <= 2) break;
  }
  await metaSet(env, "lastRefresh", (/* @__PURE__ */ new Date()).toISOString());
  return cells.length;
}
__name(refreshOld, "refreshOld");
async function probe(env, lat, lng) {
  const y = lat || 37.3476, x = lng || 126.628;
  const cases = [
    ["radius/Q", "storeListInRadius", "radius=1000&cx=" + x + "&cy=" + y + "&numOfRows=10&pageNo=1&indsLclsCd=Q"],
    ["radius/I2", "storeListInRadius", "radius=1000&cx=" + x + "&cy=" + y + "&numOfRows=10&pageNo=1&indsLclsCd=I2"],
    ["radius/-", "storeListInRadius", "radius=1000&cx=" + x + "&cy=" + y + "&numOfRows=10&pageNo=1"],
    ["dong/ctprvnCd=28", "storeListInDong", "divId=ctprvnCd&key=28&numOfRows=10&pageNo=1"],
    ["dong/ctprvnCd=28/Q", "storeListInDong", "divId=ctprvnCd&key=28&numOfRows=10&pageNo=1&indsLclsCd=Q"],
    ["dong/signguCd=28185", "storeListInDong", "divId=signguCd&key=28185&numOfRows=10&pageNo=1"],
    ["upjong/Q", "storeListInUpjong", "divId=indsLclsCd&key=Q&numOfRows=10&pageNo=1"]
  ];
  const res = [];
  for (const [name, path, qs] of cases) {
    try {
      const r = await callApi(env, path, qs);
      const sample = r.items && r.items[0] ? (r.items[0].bizesNm || "") + " / " + (r.items[0].indsMclsNm || "") : "";
      res.push({ name, ok: r.ok, n: (r.items || []).length, total: r.total || 0, why: r.why || null, sample });
    } catch (e) {
      res.push({ name, ok: false, n: 0, why: String(e && e.message || e).slice(0, 80) });
    }
  }
  await quotaAdd(env, cases.length);
  const best = res.filter((r) => r.ok && r.n > 0).sort((a, b) => b.n - a.n)[0];
  if (best) {
    const m = /\/(Q|I2)$/.exec(best.name);
    await metaSet(env, "indsLclsCd", m ? m[1] : "");
    await metaSet(env, "probeBest", best.name);
  }
  return { best: best ? best.name : null, saved: best ? await metaGet(env, "indsLclsCd") : null, cases: res };
}
__name(probe, "probe");
async function upjongList(env) {
  const tries = [
    ["largeUpjongList", "pageNo=1&numOfRows=50"],
    ["upjongList", "divId=indsLclsCd&pageNo=1&numOfRows=50"],
    ["baseInfo", "pageNo=1&numOfRows=50"]
  ];
  const out = [];
  for (const [path, qs] of tries) {
    try {
      const r = await callApi(env, path, qs);
      out.push({
        path,
        ok: r.ok,
        n: (r.items || []).length,
        why: r.why || null,
        items: (r.items || []).slice(0, 30).map((x) => (x.indsLclsCd || x.code || x.cd || "?") + " " + (x.indsLclsNm || x.name || x.nm || ""))
      });
    } catch (e) {
      out.push({ path, ok: false, why: String(e && e.message || e).slice(0, 60) });
    }
  }
  await quotaAdd(env, tries.length);
  return { tries: out };
}
__name(upjongList, "upjongList");
async function cellsCovered(env, cells) {
  if (!cells.length) return /* @__PURE__ */ new Set();
  const ph = cells.map((_, i) => "?" + (i + 1)).join(",");
  const q = await env.DB.prepare("SELECT cell FROM food_cell WHERE cell IN (" + ph + ")").bind(...cells).all();
  return new Set((q.results || []).map((r) => r.cell));
}
__name(cellsCovered, "cellsCovered");
async function markCells(env, cells, n) {
  if (!cells.length) return;
  const now = Math.floor(Date.now() / 1e3);
  const st = env.DB.prepare(
    "INSERT INTO food_cell (cell,upd,n) VALUES (?1,?2,?3) ON CONFLICT(cell) DO UPDATE SET upd=?2,n=?3"
  );
  for (let i = 0; i < cells.length; i += 25) {
    await env.DB.batch(cells.slice(i, i + 25).map((c) => st.bind(c, now, n)));
  }
}
__name(markCells, "markCells");
async function fetchAround(env, lat, lng, r, stat) {
  const qt = await quotaLeft(env);
  if (qt.left <= 0) {
    if (stat) stat.quota = "exhausted";
    return 0;
  }
  const mode = await metaGet(env, "indsLclsCd") || "";
  const rad = Math.min(2e3, Math.max(500, Math.round(r)));
  let saved = 0, calls = 0;
  for (let page = 1; page <= ONDEMAND_PAGES; page++) {
    const r1 = await callApi(
      env,
      "storeListInRadius",
      "radius=" + rad + "&cx=" + lng + "&cy=" + lat + "&numOfRows=" + ROWS + "&pageNo=" + page + (mode ? "&indsLclsCd=" + mode : "")
    );
    calls++;
    if (!r1.ok) {
      if (stat) stat.err = r1.why;
      break;
    }
    const rows = r1.items.filter(isFood).map(mapItem).filter(Boolean);
    saved += await saveItems(env, rows);
    if (r1.items.length < ROWS) break;
  }
  await quotaAdd(env, calls);
  await markCells(env, cellsAround(lat, lng, rad), saved);
  if (stat) {
    stat.fetched = saved;
    stat.calls = calls;
  }
  return saved;
}
__name(fetchAround, "fetchAround");
var KIND_RE = {
  cafe: /카페|커피|제과|베이커리|디저트|아이스크림|빙수|도넛|스무디|밀크티|차전문|주스/,
  bar: /주점|호프|술집|포차|포장마차|맥주|생맥주|와인|칵테일|위스키|사케|이자카야|펍|유흥|요리주점|간이주점/,
  raw: /회\/초밥|회\s*전문|횟집|물회|생선회|해산물|조개|오징어|장어|해물|수산|스시|초밥|사시미|대게|킹크랩|낙지|문어|전복|굴|참치|연어|광어|우럭|방어|아구|복어/,
  meat: /고기|육류|구이|삼겹|목살|갈비|곱창|막창|대창|치킨|닭|오리|스테이크|바비큐|숯불|훈제|족발|보쌈|돼지|소고기|한우|양꼬치|육회|햄버거|버거|정육|샤브|불고기|돈가스|부대찌개|감자탕/
};
function kindOf(cat) {
  const s = String(cat || "");
  if (KIND_RE.cafe.test(s)) return "cafe";
  if (KIND_RE.bar.test(s)) return "bar";
  if (KIND_RE.raw.test(s)) return "raw";
  if (KIND_RE.meat.test(s)) return "meat";
  return "food";
}
__name(kindOf, "kindOf");
var CAT_ALIAS = {
  "카페": "cafe",
  "주점": "bar",
  "술집": "bar",
  "회집": "raw",
  "회": "raw",
  "육식": "meat",
  "고기": "meat",
  "밥집": "food"
};
async function queryFood(env, p) {
  const lat = parseFloat(p.get("lat")), lng = parseFloat(p.get("lng"));
  if (!isFinite(lat) || !isFinite(lng)) return json({ error: "lat,lng 필요" }, 400);
  if (lat < 32 || lat > 39.6 || lng < 124 || lng > 132.5) return json({ error: "국내 좌표가 아니다" }, 400);
  const r = Math.min(3e3, Math.max(100, parseInt(p.get("r") || "1200", 10)));
  const limit = Math.min(500, Math.max(1, parseInt(p.get("limit") || "200", 10)));
  const cat = p.get("cat") || "";
  const cells = cellsAround(lat, lng, r);
  if (cells.length > 400) return json({ error: "반경이 너무 넓다" }, 400);
  const src = {};
  const seenCells = await cellsCovered(env, cells);
  const center = cellOf(lat, lng);
  if (!seenCells.has(center)) {
    src.new = true;
    try {
      await fetchAround(env, lat, lng, r, src);
    } catch (e) {
      src.err = String(e && e.message || e).slice(0, 80);
    }
  }
  const ph = cells.map((_, i) => "?" + (i + 1)).join(",");
  const q = await env.DB.prepare(
    "SELECT nm,cat,addr,lat,lng FROM food WHERE cell IN (" + ph + ") LIMIT 4000"
  ).bind(...cells).all();
  let rows = (q.results || []).map((x) => {
    const d = Math.round(hav(lat, lng, x.lat, x.lng));
    return { n: x.nm, c: x.cat, a: x.addr, la: x.lat, lo: x.lng, d };
  }).filter((x) => x.d <= r);
  const want = CAT_ALIAS[cat] || cat;
  if (want && want !== "all") rows = rows.filter((x) => kindOf(x.c) === want);
  rows.sort((a, b) => a.d - b.d);
  const seen = /* @__PURE__ */ new Set(), out = [];
  for (const x of rows) {
    const k = String(x.n).replace(/\s/g, "") + "@" + x.la.toFixed(4) + "," + x.lo.toFixed(4);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
    if (out.length >= limit) break;
  }
  return json({ v: VERSION, count: out.length, r, src, items: out });
}
__name(queryFood, "queryFood");
var POOL_DAYS = 183;
var POOL_GEN_MAX = 60;
function dayIndexKST(dateStr) {
  const d = dateStr ? /* @__PURE__ */ new Date(dateStr + "T00:00:00+09:00") : new Date(Date.now() + 324e5);
  const y0 = Date.UTC(d.getUTCFullYear(), 0, 1);
  const doy = Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - y0) / 864e5);
  return ((doy + d.getUTCFullYear() * 37) % POOL_DAYS + POOL_DAYS) % POOL_DAYS;
}
__name(dayIndexKST, "dayIndexKST");
async function configGet(env, p) {
  const k = String(p.get("k") || "").trim();
  if (k) {
    const r = await env.DB.prepare("SELECT v,upd FROM app_config WHERE k=?1").bind(k).first();
    if (!r) return json({ ok: true, k, v: null });
    let v = null;
    try {
      v = JSON.parse(r.v);
    } catch (e) {
      v = r.v;
    }
    return json({ ok: true, k, v, upd: r.upd });
  }
  const q = await env.DB.prepare("SELECT k,v,upd FROM app_config").all();
  const out = {};
  for (const r of q.results || []) {
    try {
      out[r.k] = JSON.parse(r.v);
    } catch (e) {
      out[r.k] = r.v;
    }
  }
  return json({ ok: true, all: out });
}
__name(configGet, "configGet");
async function configSet(env, req) {
  let b = null;
  try {
    b = await req.json();
  } catch (e) {
    return json({ ok: false, why: "bad json" }, 400);
  }
  const k = String(b && b.k || "").trim();
  if (!k) return json({ ok: false, why: "k 필요" }, 400);
  const v = JSON.stringify(b.v == null ? null : b.v);
  if (v.length > 2e5) return json({ ok: false, why: "너무 큼" }, 400);
  await env.DB.prepare(
    "INSERT INTO app_config (k,v,upd) VALUES (?1,?2,?3) ON CONFLICT(k) DO UPDATE SET v=?2,upd=?3"
  ).bind(k, v, Math.floor(Date.now() / 1e3)).run();
  return json({ ok: true, k, bytes: v.length });
}
__name(configSet, "configSet");
async function contentGet(env, p) {
  const kind = String(p.get("kind") || "").trim();
  if (!kind) return json({ ok: false, why: "kind 필요" }, 400);
  const n = Math.max(1, Math.min(50, parseInt(p.get("n") || "12", 10)));
  const day = dayIndexKST(p.get("date"));
  const got = [], seen = /* @__PURE__ */ new Set();
  for (let off = 0; off < 6 && got.length < n; off++) {
    const b = (day + off * 7) % POOL_DAYS;
    const q = await env.DB.prepare(
      "SELECT id,body FROM content_pool WHERE kind=?1 AND bucket=?2 LIMIT ?3"
    ).bind(kind, b, n * 2).all();
    for (const r of q.results || []) {
      if (got.length >= n || seen.has(r.id)) continue;
      seen.add(r.id);
      try {
        got.push(JSON.parse(r.body));
      } catch (e) {
      }
    }
  }
  return json({ ok: true, kind, day, count: got.length, items: got });
}
__name(contentGet, "contentGet");
async function contentGen(env, p) {
  const kind = String(p.get("kind") || "").trim();
  const n = Math.max(1, Math.min(POOL_GEN_MAX, parseInt(p.get("n") || "30", 10)));
  const theme = String(p.get("theme") || "").trim();
  if (!kind) return json({ ok: false, why: "kind 필요" }, 400);
  const key = env && env.GEMINI_API_KEY;
  if (!key) return json({ ok: false, why: "GEMINI_API_KEY 시크릿이 없습니다" }, 400);
  const spec = kind === "chat" ? "한국 수도권 출퇴근 대중교통 이용자들이 단톡방에서 주고받을 법한 짧은 한 줄 대화" : "한국 수도권 대중교통 이용자가 커뮤니티 게시판에 올릴 법한 글";
  const shape = kind === "chat" ? '[{"t":"한 줄 대화(30자 이내)"}]' : '[{"title":"제목(25자 이내)","body":"본문(3~5줄, 줄바꿈은 \\n)"}]';
  const prompt = spec + " " + n + "개를 JSON 배열로만 출력하세요. 형식: " + shape + "\n조건:\n- 정치\xB7종교\xB7특정인 비방\xB7차별\xB7혐오\xB7광고 금지\n- 노선명이나 역명은 넣지 마세요(앱이 알아서 채웁니다)\n- 서로 소재가 겹치지 않게 하세요" + (theme ? "\n- 이번 묶음의 소재 방향: " + theme : "") + "\n- 설명 없이 JSON 배열만 출력";
  const MODELS = ["gemini-flash-latest", "gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.0-flash"];
  const want = String(p.get("model") || "").trim();
  let known = null;
  try {
    const r0 = await env.DB.prepare("SELECT v FROM app_config WHERE k='geminiModel'").first();
    if (r0) known = JSON.parse(r0.v);
  } catch (e) {
  }
  const order = [];
  for (const m of [want, known, ...MODELS]) {
    if (m && typeof m === "string" && order.indexOf(m) < 0) order.push(m);
  }
  let txt = "", usedModel = null, lastErr = "";
  for (const m of order) {
    try {
      const res = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(m) + ":generateContent?key=" + encodeURIComponent(key),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        }
      );
      const j = await res.json();
      if (j && j.error) {
        lastErr = m + ": " + String(j.error.message || "").slice(0, 90);
        continue;
      }
      const t = (((j.candidates || [])[0] || {}).content || {}).parts?.[0]?.text || "";
      if (!t) {
        lastErr = m + ": 빈 응답";
        continue;
      }
      txt = t;
      usedModel = m;
      break;
    } catch (e) {
      lastErr = m + ": " + String(e && e.message || e).slice(0, 90);
    }
  }
  if (!txt) return json({ ok: false, why: "생성 실패", tried: order, last: lastErr }, 502);
  if (usedModel && usedModel !== known) {
    try {
      await env.DB.prepare(
        "INSERT INTO app_config (k,v,upd) VALUES ('geminiModel',?1,?2) ON CONFLICT(k) DO UPDATE SET v=?1,upd=?2"
      ).bind(JSON.stringify(usedModel), Math.floor(Date.now() / 1e3)).run();
    } catch (e) {
    }
  }
  let arr = [];
  try {
    arr = JSON.parse(txt.replace(/```json|```/g, "").trim());
  } catch (e) {
    return json({ ok: false, why: "JSON 아님", raw: txt.slice(0, 200) }, 502);
  }
  if (!Array.isArray(arr) || !arr.length) return json({ ok: false, why: "배열 아님" }, 502);
  const q = await env.DB.prepare("SELECT body FROM content_pool WHERE kind=?1").bind(kind).all();
  const have = new Set((q.results || []).map((r) => {
    try {
      const o = JSON.parse(r.body);
      return String(o.title || o.t || "").replace(/\s/g, "");
    } catch (e) {
      return "";
    }
  }));
  const now = Math.floor(Date.now() / 1e3);
  const st = env.DB.prepare("INSERT INTO content_pool (kind,bucket,body,upd) VALUES (?1,?2,?3,?4)");
  const rows = [];
  let seq = (await env.DB.prepare("SELECT COUNT(*) AS n FROM content_pool WHERE kind=?1").bind(kind).first() || {}).n || 0;
  let dup = 0;
  for (const it of arr) {
    const keyTxt = String(it && (it.title || it.t) || "").replace(/\s/g, "");
    if (!keyTxt) continue;
    if (have.has(keyTxt)) {
      dup++;
      continue;
    }
    have.add(keyTxt);
    rows.push(st.bind(kind, seq++ % POOL_DAYS, JSON.stringify(it), now));
  }
  for (let i = 0; i < rows.length; i += 25) await env.DB.batch(rows.slice(i, i + 25));
  return json({ ok: true, kind, model: usedModel, added: rows.length, dup, total: seq });
}
__name(contentGen, "contentGen");
var POST_NICKS = [
  "출근전사",
  "지옥철탈출",
  "9호선급행",
  "2호선시민",
  "환승의달인",
  "칼퇴志望",
  "막차사수",
  "판교러",
  "강남직장인",
  "수도권러",
  "지각방지위원",
  "첫차족",
  "광역버스대기자",
  "신도시통근자",
  "용산주민",
  "정시퇴근파",
  "편의점도시락",
  "환승지옥탈출러"
];
function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
__name(hash32, "hash32");
async function postsFeed(env, p) {
  const n = Math.max(1, Math.min(60, parseInt(p.get("limit") || "30", 10)));
  const cat = String(p.get("cat") || "").trim();
  const day = dayIndexKST(null);
  const got = [], seen = /* @__PURE__ */ new Set();
  for (let off = 0; off < 20 && got.length < n; off++) {
    const b = (day + off * 7) % POOL_DAYS;
    const q = await env.DB.prepare(
      "SELECT id,body FROM content_pool WHERE kind='post' AND bucket=?1 LIMIT ?2"
    ).bind(b, n).all();
    for (const r of q.results || []) {
      if (got.length >= n || seen.has(r.id)) continue;
      seen.add(r.id);
      let o = null;
      try {
        o = JSON.parse(r.body);
      } catch (e) {
        continue;
      }
      if (!o || !o.title) continue;
      const h = hash32(String(o.title));
      const c = o.cat || "잡담";
      if (cat && cat !== "all" && c !== cat) continue;
      const nowMs = Date.now();
      const spread = Math.min(14 * 36e5, 20 * 6e4 * got.length + h % (37 * 6e4));
      got.push({
        id: r.id,
        cat: c,
        title: o.title,
        body: o.body || "",
        nick: POST_NICKS[h % POST_NICKS.length],
        ts: nowMs - spread,
        views: 8 + h % 420,
        likes: h % 17,
        lols: (h >> 3) % 9,
        sads: (h >> 6) % 5,
        link: o.link || ""
      });
    }
  }
  return json({ ok: true, day, posts: got });
}
__name(postsFeed, "postsFeed");
var CELL_PULL_MAX = 4e3;
var CELL_PUSH_MAX = 300;
var CELL_N_CAP = 50;
async function cellsGet(env, p) {
  const min = Math.max(1, Math.min(20, parseInt(p.get("min") || "2", 10)));
  const lim = Math.max(1, Math.min(CELL_PULL_MAX, parseInt(p.get("limit") || String(CELL_PULL_MAX), 10)));
  const q = await env.DB.prepare(
    "SELECT k,s,l,n,lat,lng FROM cell_map WHERE n >= ?1 AND (?3 = '' OR k LIKE ?3) ORDER BY n DESC LIMIT ?2"
  ).bind(min, lim, /^\d{3}-\d{1,3}$/.test(p.get("plmn") || "") ? p.get("plmn") + "-%" : "").all();
  const cells = {};
  for (const r of q.results || []) {
    cells[r.k] = { s: r.s, l: r.l || "", n: r.n, lat: r.lat, lng: r.lng };
  }
  return json({ ok: true, min, count: Object.keys(cells).length, cells });
}
__name(cellsGet, "cellsGet");
async function cellsReport(env, req) {
  let body = null;
  try {
    body = await req.json();
  } catch (e) {
    return json({ ok: false, why: "bad json" }, 400);
  }
  const src = body && body.cells || {};
  const keys = Object.keys(src).slice(0, CELL_PUSH_MAX);
  if (!keys.length) return json({ ok: true, saved: 0 });
  const now = Math.floor(Date.now() / 1e3);
  const st = env.DB.prepare(
    "INSERT INTO cell_map (k,s,l,n,lat,lng,upd) VALUES (?1,?2,?3,?4,?5,?6,?7) ON CONFLICT(k) DO UPDATE SET   s   = CASE WHEN excluded.n > cell_map.n THEN excluded.s ELSE cell_map.s END,  l   = CASE WHEN excluded.n > cell_map.n THEN excluded.l ELSE cell_map.l END,  lat = COALESCE(cell_map.lat, excluded.lat),  lng = COALESCE(cell_map.lng, excluded.lng),  n   = MIN(?8, MAX(cell_map.n, excluded.n)),  upd = ?7"
  );
  const rows = [];
  for (const k of keys) {
    const v = src[k];
    if (!v || !v.s || String(k).length > 64) continue;
    const n = Math.max(1, Math.min(CELL_N_CAP, parseInt(v.n || 1, 10) || 1));
    const lat = v.lat != null && isFinite(v.lat) ? +v.lat : null;
    const lng = v.lng != null && isFinite(v.lng) ? +v.lng : null;
    rows.push(st.bind(String(k), String(v.s).slice(0, 40), String(v.l || "").slice(0, 20), n, lat, lng, now, CELL_N_CAP));
  }
  if (!rows.length) return json({ ok: true, saved: 0 });
  for (let i = 0; i < rows.length; i += 25) await env.DB.batch(rows.slice(i, i + 25));
  return json({ ok: true, saved: rows.length });
}
__name(cellsReport, "cellsReport");
async function loadFile(env, req) {
  const body = await req.json();
  const arr = Array.isArray(body) ? body : body.items || [];
  const rows = arr.map((it) => {
    if (it.bizesNm || it.lon != null) return mapItem(it);
    const lat = parseFloat(it.la != null ? it.la : it.lat), lng = parseFloat(it.lo != null ? it.lo : it.lng);
    const nm = it.n || it.nm || it.name;
    if (!nm || !isFinite(lat) || !isFinite(lng)) return null;
    return {
      id: it.id || nm + "@" + lat.toFixed(5) + "," + lng.toFixed(5),
      nm,
      cat: it.c || it.cat || "",
      addr: it.a || it.addr || "",
      lat,
      lng,
      cell: cellOf(lat, lng),
      src: it.src || "file"
    };
  }).filter(Boolean);
  const n = await saveItems(env, rows);
  return json({ got: arr.length, saved: n });
}
__name(loadFile, "loadFile");
async function health(env) {
  await ensure(env);
  const c = await env.DB.prepare("SELECT COUNT(*) AS n FROM food").first().catch(() => null);
  const t = await env.DB.prepare(
    "SELECT state, COUNT(*) AS n FROM food_task GROUP BY state"
  ).all().catch(() => ({ results: [] }));
  const task = {};
  for (const r of t.results || []) task[r.state] = r.n;
  return json({
    ok: true,
    version: VERSION,
    rows: c ? c.n : 0,
    task,
    indsLclsCd: await metaGet(env, "indsLclsCd"),
    probeBest: await metaGet(env, "probeBest"),
    lastRun: await metaGet(env, "lastRun"),
    lastRefresh: await metaGet(env, "lastRefresh"),
    cells: (await env.DB.prepare("SELECT COUNT(*) AS n FROM food_cell").first().catch(() => null) || {}).n || 0,
    cellMap: (await env.DB.prepare("SELECT COUNT(*) AS n FROM cell_map").first().catch(() => null) || {}).n || 0,
    pool: (await env.DB.prepare("SELECT kind, COUNT(*) AS n FROM content_pool GROUP BY kind").all().catch(() => ({ results: [] }))).results || [],
    config: (await env.DB.prepare("SELECT COUNT(*) AS n FROM app_config").first().catch(() => null) || {}).n || 0,
    geminiSet: !!(env && env.GEMINI_API_KEY),
    today: dayIndexKST(null),
    quota: await quotaLeft(env),
    keySet: !!(env.DATA_GO_KR_KEY || env.TAGO_KEY),
    subdb: !!env.SUBDB,
    routes: ["/food", "/health", "/admin/food-probe", "/admin/food-plan", "/admin/food-run", "/admin/food-file", "/admin/food-reset", "/admin/upjong", "/admin/food-limit", "/admin/food-refresh", "/cells", "/cells/report", "/app-config", "/content", "/posts", "/react", "/admin/app-config", "/admin/content-gen", "/admin/content-stat", "/admin/gemini-probe"]
  });
}
__name(health, "health");
function authed(req, env) {
  // 2026-10-01: 시크릿이 없으면 예전엔 관리 API 전체가 열려 있었다(app-config 쓰기·데이터 삭제 포함).
  //   이제 FOOD_ADMIN_TOKEN 이 설정돼 있지 않으면 거절한다(fail closed).
  const want = env && env.FOOD_ADMIN_TOKEN;
  if (!want) return false;
  const got = req.headers.get("X-Admin-Token") || new URL(req.url).searchParams.get("token");
  return got === want;
}
__name(authed, "authed");
var food_worker_default = {
  async fetch(req, env) {
    const url = new URL(req.url), path = url.pathname, p = url.searchParams;
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    try {
      if (path === "/health" || path === "/") return await health(env);
      if (path === "/food") {
        await ensure(env);
        return await queryFood(env, p);
      }
      if (path === "/cells") {
        await ensure(env);
        return await cellsGet(env, p);
      }
      if (path === "/app-config") {
        await ensure(env);
        return await configGet(env, p);
      }
      if (path === "/content") {
        await ensure(env);
        return await contentGet(env, p);
      }
      if (path === "/posts") {
        await ensure(env);
        return await postsFeed(env, p);
      }
      if (path === "/react") return json({ ok: true });
      if (path === "/cells/report" && req.method === "POST") {
        await ensure(env);
        return await cellsReport(env, req);
      }
      if (path.startsWith("/admin/")) {
        if (!authed(req, env)) return json({ error: "token" }, 401);
        await ensure(env);
        if (path === "/admin/food-probe")
          return json(await probe(env, parseFloat(p.get("lat")), parseFloat(p.get("lng"))));
        if (path === "/admin/food-plan") {
          const mode = p.get("mode") || "sido";
          const r = mode === "stops" ? await planStops(env, parseInt(p.get("limit") || "0", 10)) : await planSido(env, "dong");
          return json(Object.assign({ mode }, r));
        }
        if (path === "/admin/app-config" && req.method === "POST") return await configSet(env, req);
        if (path === "/admin/content-gen") return await contentGen(env, p);
        if (path === "/admin/gemini-probe") {
          const key2 = env && env.GEMINI_API_KEY;
          if (!key2) return json({ ok: false, why: "GEMINI_API_KEY 시크릿이 없습니다" }, 400);
          const cand = [
            "gemini-flash-latest",
            "gemini-3.5-flash",
            "gemini-2.5-flash",
            "gemini-2.0-flash",
            "gemini-pro-latest"
          ];
          const out = [];
          for (const m of cand) {
            try {
              const res = await fetch(
                "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(m) + ":generateContent?key=" + encodeURIComponent(key2),
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ contents: [{ parts: [{ text: "안녕" }] }] })
                }
              );
              const j = await res.json();
              out.push({ model: m, ok: !j.error, why: j.error ? String(j.error.message).slice(0, 80) : null });
            } catch (e) {
              out.push({ model: m, ok: false, why: String(e && e.message || e).slice(0, 60) });
            }
          }
          const best = out.find((x) => x.ok);
          if (best) await env.DB.prepare(
            "INSERT INTO app_config (k,v,upd) VALUES ('geminiModel',?1,?2) ON CONFLICT(k) DO UPDATE SET v=?1,upd=?2"
          ).bind(JSON.stringify(best.model), Math.floor(Date.now() / 1e3)).run();
          return json({ best: best ? best.model : null, tried: out });
        }
        if (path === "/admin/content-stat") {
          const q = await env.DB.prepare(
            "SELECT kind, COUNT(*) AS n, COUNT(DISTINCT bucket) AS days FROM content_pool GROUP BY kind"
          ).all();
          return json({ pool: q.results || [], poolDays: POOL_DAYS, today: dayIndexKST(null) });
        }
        if (path === "/admin/content-clear") {
          const k = p.get("kind");
          if (!k) return json({ ok: false, why: "kind 필요" }, 400);
          await env.DB.prepare("DELETE FROM content_pool WHERE kind=?1").bind(k).run();
          return json({ ok: true, cleared: k });
        }
        if (path === "/admin/upjong") return json(await upjongList(env));
        if (path === "/admin/food-refresh") return json({ cells: await refreshOld(env), quota: await quotaLeft(env) });
        if (path === "/admin/food-limit") {
          const v = parseInt(p.get("n") || "0", 10);
          if (v > 0) await metaSet(env, "dailyLimit", v);
          return json(await quotaLeft(env));
        }
        if (path === "/admin/food-mode") {
          await metaSet(env, "indsLclsCd", p.get("cd") || "");
          return json({ indsLclsCd: await metaGet(env, "indsLclsCd") });
        }
        if (path === "/admin/food-run")
          return json(await runTasks(env, parseInt(p.get("n") || String(RUN_CALLS), 10)));
        if (path === "/admin/food-file" && req.method === "POST")
          return await loadFile(env, req);
        if (path === "/admin/food-reset") {
          const what = p.get("what") || "task";
          if (what === "all") await env.DB.prepare("DELETE FROM food").run();
          if (what === "fail") await env.DB.prepare("UPDATE food_task SET state='todo' WHERE state='fail'").run();
          else if (what === "task") await env.DB.prepare("DELETE FROM food_task").run();
          return json({ ok: true, what });
        }
      }
      return json({ error: "not found", version: VERSION }, 404);
    } catch (e) {
      return json({ error: String(e && e.message || e).slice(0, 200), version: VERSION }, 500);
    }
  },
  async scheduled(ev, env, ctx) {
    ctx.waitUntil((async () => {
      try {
        await ensure(env);
        const d = new Date(Date.now() + 324e5);
        if (d.getUTCDate() <= REFRESH_DAYS) {
          const did = await refreshOld(env);
          if (did > 0) return;
        }
        await runTasks(env, RUN_CALLS);
      } catch (e) {
      }
    })());
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
var GD_OPT = { cls: function (p, m) { if (p.indexOf("/admin/") === 0) return "admin"; if (p === "/cells/report") return "write"; if (p === "/food" || p === "/health" || p === "/") return "heavy"; return "light"; }, cfg: {"light":{"cap":120,"rate":10},"heavy":{"cap":40,"rate":2},"admin":{"cap":30,"rate":0.5}}, heavyMax: 64 };
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
export default gdWrap(food_worker_default);
//# sourceMappingURL=food-worker.js.map

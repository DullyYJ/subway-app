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
export {
  food_worker_default as default
};
//# sourceMappingURL=food-worker.js.map

// 중계 프로그램 ↔ gentle-lab 워커 종단 시험 (서울 서버·D1 모의, 네트워크 없음).  실행: node tools/seoul-relay/relay.test.js
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const { DatabaseSync } = require('node:sqlite');
const R = require('./relay.js');
const tmp = path.join(os.tmpdir(), 'relay-e2e-' + process.pid + '.mjs');
fs.writeFileSync(tmp, fs.readFileSync(path.join(__dirname, '..', '..', 'worker', 'index.js'), 'utf8'));
let pass = 0; const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { console.log('  FAIL', name, '\n      ', e.stack.split('\n').slice(0, 3).join('\n       ')); process.exitCode = 1; } };
function mkDB() {
  const db = new DatabaseSync(':memory:');
  const wrap = (sql) => { let args = []; const o = { bind(...a) { args = a; return o; }, async run() { db.prepare(sql).run(...args); return {}; }, async first() { return db.prepare(sql).get(...args) || null; }, async all() { return { results: db.prepare(sql).all(...args) }; }, _exec() { db.prepare(sql).run(...args); } }; return o; };
  return { prepare: wrap, async batch(l) { l.forEach((s) => s._exec()); return []; }, raw: db };
}
(async () => {
  const store = new Map();
  globalThis.caches = { default: { async match(k) { return store.get(k.url); }, async put(k, v) { store.set(k.url, v); } } };
  const W = (await import(tmp)).default;
  const TOKEN = 'relay-token-0123456789abcdef', WURL = 'https://worker.test';
  const env = { DB: mkDB(), RELAY_TOKEN: TOKEN };
  let seoulCalls = [], seoulMode = 'ok';
  const arrivalBody = (st) => JSON.stringify({ errorMessage: { code: 'INFO-000' }, realtimeArrivalList: [{ statnNm: st, arvlMsg2: '3분 후' }] });
  const fakeFetch = async (url, init) => {
    url = String(url);
    if (url.startsWith(WURL)) return W.fetch(new Request(url, init), env);
    seoulCalls.push(url);
    const key = decodeURIComponent(url.split('/subway/')[1].split('/')[0]);
    if (seoulMode === 'dead:' + key) return new Response(JSON.stringify({ status: 500, code: 'ERROR-337', message: 'quota' }), { status: 200 });
    if (seoulMode === 'down') throw new Error('ECONNRESET');
    const p = decodeURIComponent(url.split('/json/')[1]);
    return new Response(arrivalBody(p.split('/').pop()), { status: 200 });
  };
  const cfg = R.makeConfig({ WORKER_URL: WURL, RELAY_TOKEN: TOKEN, SEOUL_API_KEYS: 'KEYONE1,KEYTWO2', STATE_FILE: path.join(os.tmpdir(), 'relay-state-' + process.pid + '.json') });
  const mk = (over) => { const r = new R.Relay(Object.assign({}, cfg, { serviceStartHour: 0, serviceEndHour: 24, burstMax: 12 }, over || {}), { fetch: fakeFetch, log: () => {} }); r.budget.tokens = 12; return r; };
  const app = (p) => W.fetch(new Request(WURL + '/seoul?path=' + encodeURIComponent(p)), env);
  const clearEdge = () => store.clear();
  const P = (s) => 'realtimeStationArrival/0/10/' + encodeURIComponent(s);

  await t('종단: 앱 요청 → 준비 중(503) → 중계가 서울에서 한 번 불러 올림 → 앱이 값을 받는다', async () => {
    const relay = mk();
    await relay.cycle();                       // 첫 조회로 중계 생존 표시(찾는 경로 없음)
    let r = await app(P('합정')); assert.strictEqual(r.status, 503);
    seoulCalls = []; const out = await relay.cycle(); assert.strictEqual(out.fetched, 1); assert.strictEqual(out.pushed, 1); assert.strictEqual(seoulCalls.length, 1);
    clearEdge(); const real = Date.now; Date.now = () => real() + 30000;   // 메모리 캐시 만료
    try { r = await app(P('합정')); } finally { Date.now = real; }
    assert.strictEqual(r.status, 200); assert.strictEqual(r.headers.get('x-seoul-cache'), 'RELAY'); assert.ok(/합정/.test(await r.text()));
  });
  await t('사용자가 몇만 명이어도 서울 호출은 늘지 않는다(같은 경로 3,000건 요청 → 서울 호출 0~1건)', async () => {
    const relay = mk(); await relay.cycle();
    clearEdge(); seoulCalls = [];
    const reqs = []; for (let i = 0; i < 3000; i++) reqs.push(app(P('홍대입구')));
    const rs = await Promise.all(reqs); assert.ok(rs.every((r) => r.status === 503 || r.status === 200));
    await relay.cycle(); await relay.cycle(); await relay.cycle();
    assert.ok(seoulCalls.length <= 2, '서울 호출 ' + seoulCalls.length);
    const rows = env.DB.raw.prepare("SELECT n FROM relay_want WHERE path = ?").get(P('홍대입구')); assert.ok(rows.n <= 30, '찾는 경로 기록은 isolate 당 20초 1회로 제한 n=' + rows.n);
  });
  await t('최근에 받은 값은 다시 부르지 않고(25초), 오래되면 찾는 동안 갱신한다', async () => {
    const relay = mk(); seoulCalls = [];
    await relay.cycle(); await relay.cycle(); assert.strictEqual(seoulCalls.length, 0, '값이 신선한데 또 부름');
    env.DB.raw.prepare('UPDATE relay_cache SET at = ?').run(Date.now() - 40000);
    clearEdge(); const real = Date.now; Date.now = () => real() + 30000;
    try { await app(P('합정')); await app(P('홍대입구')); } finally { Date.now = real; }
    seoulCalls = []; await relay.cycle(); assert.ok(seoulCalls.length >= 1, '낡은 값을 갱신하지 않음');
  });
  await t('키가 한도(ERROR-337)면 그 키를 쓰지 않고 다음 키로 넘어간다', async () => {
    const relay = mk(); await relay.cycle();
    seoulMode = 'dead:KEYONE1'; seoulCalls = []; clearEdge();
    await app(P('신촌')); await relay.cycle();
    assert.ok(relay.budget.dead[0] === true || relay.budget.dead[1] === true, '죽은 키 표시 없음');
    await app(P('이대')); seoulCalls = []; await relay.cycle();
    assert.ok(seoulCalls.every((u) => !/KEYONE1/.test(u)) || relay.budget.dead[1] === true, '죽은 키를 또 씀');
    seoulMode = 'ok';
  });
  await t('오늘 예산이 바닥나면 서울을 부르지 않는다(앱은 시각표로)', async () => {
    const relay = mk({ perKeyDaily: 0 }); relay.budget.tokens = 12; await app(P('상수')); seoulCalls = [];
    await relay.cycle(); assert.strictEqual(seoulCalls.length, 0);
    assert.strictEqual(relay.budget.remaining(Date.now()), 0);
  });
  await t('호출 예산: 남은 호출을 남은 운행 시간에 고르게 나눈다 / 날짜가 바뀌면 초기화', async () => {
    const b = new R.Budget(['a'], 950, null); b.roll(Date.parse('2026-10-04T05:00:00+09:00')); b.spend(0); b.spend(0);
    assert.strictEqual(b.remaining(Date.parse('2026-10-04T12:00:00+09:00')), 948);
    assert.strictEqual(b.remaining(Date.parse('2026-10-05T00:10:00+09:00')), 950, '자정 지나면 초기화');
    assert.ok(R.serviceSecondsLeft(Date.parse('2026-10-04T12:00:00+09:00')) > 11 * 3600 && R.serviceSecondsLeft(Date.parse('2026-10-04T12:00:00+09:00')) < 13 * 3600);
    assert.ok(R.serviceSecondsLeft(Date.parse('2026-10-04T03:00:00+09:00')) >= 19 * 3600, '새벽에는 운행 시작 기준');
    const b2 = new R.Budget(['a'], 1000, null, { burst: 12 }); b2.last = Date.parse('2026-10-04T12:00:00+09:00') - 100000; b2.tokens = 0;
    b2.refill(Date.parse('2026-10-04T12:00:00+09:00')); assert.ok(b2.tokens > 1 && b2.tokens < 4, '100초 동안 쌓인 토큰 ' + b2.tokens);
  });
  await t('하루 1,000건을 05~24시(19시간)에 고르게: 약 68초에 1건, 00~05시에는 호출하지 않는다', async () => {
    const b = new R.Budget(['a'], 1000, null); const T = (h) => Date.parse('2026-10-04T' + h + '+09:00');
    b.roll(T('05:00:00')); b.last = T('05:00:00');
    let calls = 0;
    // 05:00~24:00 을 30초 간격으로 돌리며 토큰이 허락하는 만큼 호출
    for (let ms = T('05:00:30'); ms < T('23:59:59'); ms += 30000) { b.refill(ms); while (b.tokens >= 1) { b.spend(b.pickKey(ms)); calls++; } }
    assert.ok(calls >= 990 && calls <= 1000, '하루 호출 ' + calls);
    // 한 시간 동안의 호출이 시간대 전체에서 고르다(대략 52건/시간)
    const b2 = new R.Budget(['a'], 1000, null); b2.roll(T('05:00:00')); b2.last = T('05:00:00'); let perH = {};
    for (let ms = T('05:00:30'); ms < T('23:59:59'); ms += 30000) { b2.refill(ms); while (b2.tokens >= 1) { b2.spend(0); const h = new Date(ms + 9 * 3600000).getUTCHours(); perH[h] = (perH[h] || 0) + 1; } }
    const vals = Object.values(perH); assert.ok(Math.min(...vals) >= 48 && Math.max(...vals) <= 58, '시간별 ' + JSON.stringify(perH));
    // 시간대 밖(00:30)에는 토큰이 쌓이지 않는다
    const b3 = new R.Budget(['a'], 1000, null); b3.last = T('00:20:00'); b3.tokens = 3; b3.refill(T('00:30:00')); assert.strictEqual(b3.tokens, 0);
    assert.strictEqual(R.inService(T('04:59:00')), false); assert.strictEqual(R.inService(T('05:00:00')), true); assert.strictEqual(R.inService(T('23:59:00')), true); assert.strictEqual(R.inService(T('00:00:00') + 86400000), false);
  });
  await t('찾는 경로 고르기: 값이 없는 것 먼저, 많이 찾는 것 먼저, 신선한 것 제외, 토큰만큼만', async () => {
    const now = 1e12, c = cfg;
    const w = [{ path: P('a'), n: 5, have: now - 1000 }, { path: P('b'), n: 9, have: now - 60000 }, { path: P('c'), n: 1, have: 0 }, { path: P('d'), n: 7, have: now - 90000 }];
    assert.deepStrictEqual(R.pickWork(c, w, now, 10).map((x) => x.path), [P('c'), P('b'), P('d')].sort((x, y) => 0 || (x === P('c') ? -1 : y === P('c') ? 1 : (w.find(q => q.path === y).n - w.find(q => q.path === x).n))));
    assert.strictEqual(R.pickWork(c, w, now, 1.9).length, 1); assert.strictEqual(R.pickWork(c, w, now, 0.9).length, 0);
  });
  await t('서울에 닿지 않으면(오류) 올리지 않고 계속 돈다 / 토큰이 틀리면 알기 쉬운 오류', async () => {
    const relay = mk(); await relay.cycle(); seoulMode = 'down'; clearEdge(); await app(P('망원')); const o = await relay.cycle(); assert.strictEqual(o.pushed, 0); assert.ok(relay.stats.errors >= 1); seoulMode = 'ok';
    const bad = new R.Relay(Object.assign({}, cfg, { token: 'wrong-token-0123456789abcdef' }), { fetch: fakeFetch, log: () => {} });
    await assert.rejects(() => bad.cycle(), /401|거부/);
  });
  await t('.env 파싱(따옴표·주석·빈 줄)', async () => {
    const f = path.join(os.tmpdir(), 'relay-env-' + process.pid); fs.writeFileSync(f, '# c\r\nRELAY_TOKEN="abc123"\r\n\r\nSEOUL_API_KEYS = k1, k2\r\n');
    const e = R.loadEnv(f); assert.strictEqual(e.RELAY_TOKEN, 'abc123'); assert.strictEqual(R.makeConfig(e).keys.length, 2);
  });
  console.log('통과', pass, '건');
})();

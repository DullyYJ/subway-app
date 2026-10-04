// gentle-lab 한국 IP 중계(D1 경유) 시험 — node:sqlite 로 D1 을 흉내 낸다. 실행: node worker/test/relay_push.test.js
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const { DatabaseSync } = require('node:sqlite');
const tmp = path.join(os.tmpdir(), 'gentle-lab-relay-test-' + process.pid + '.mjs');
fs.writeFileSync(tmp, fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8'));
let pass = 0; const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { console.log('  FAIL', name, '\n      ', e.message); process.exitCode = 1; } };
function mkDB() {
  const db = new DatabaseSync(':memory:');
  const wrap = (sql) => { let args = []; const o = {
    bind(...a) { args = a; return o; },
    async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: r.changes } }; },
    async first() { return db.prepare(sql).get(...args) || null; },
    async all() { return { results: db.prepare(sql).all(...args) }; },
    _exec() { db.prepare(sql).run(...args); } }; return o; };
  return { prepare: wrap, async batch(list) { list.forEach((s) => s._exec()); return []; }, raw: db };
}
(async () => {
  const store = new Map();
  globalThis.caches = { default: { async match(k) { return store.get(k.url); }, async put(k, v) { store.set(k.url, v); } } };
  let upstream = 0;
  globalThis.fetch = async () => { upstream++; return new Response('', { status: 400 }); };
  const W = (await import(tmp)).default;
  const TOKEN = 'relay-token-0123456789abcdef';
  const env = { DB: mkDB(), RELAY_TOKEN: TOKEN };
  const seoul = (p) => W.fetch(new Request('https://x.test/seoul?path=' + encodeURIComponent(p)), env);
  const wanted = (tok) => W.fetch(new Request('https://x.test/relay/wanted?info=t', { headers: tok === undefined ? {} : { 'x-relay-token': tok } }), env);
  const push = (items, tok) => W.fetch(new Request('https://x.test/relay/push', { method: 'POST', headers: { 'x-relay-token': tok === undefined ? TOKEN : tok, 'content-type': 'application/json' }, body: JSON.stringify({ items }) }), env);
  const ok = (extra) => JSON.stringify(Object.assign({ errorMessage: { code: 'INFO-000' }, realtimeArrivalList: [{ trainLineNm: 'x' }] }, extra || {}));
  const P1 = 'realtimeStationArrival/0/10/' + encodeURIComponent('합정');

  await t('중계가 한 번도 안 왔으면 옛 동작(직접 호출, 키 없으면 500)', async () => {
    let r = await seoul(P1); assert.strictEqual(r.status, 500);
    env.SEOUL_API_KEY = 'KEYAAAA1'; r = await seoul('realtimeStationArrival/0/10/' + encodeURIComponent('신촌')); assert.strictEqual(r.status, 400); assert.ok(upstream >= 1);
    delete env.SEOUL_API_KEY;
  });
  await t('토큰이 없거나 틀리면 401, 짧은 토큰 설정이면 항상 401', async () => {
    assert.strictEqual((await wanted()).status, 401); assert.strictEqual((await wanted('wrong-token-0123456789abcdef')).status, 401);
    assert.strictEqual((await push([], 'x')).status, 401);
    const e2 = { DB: mkDB(), RELAY_TOKEN: 'short' };
    const r = await W.fetch(new Request('https://x.test/relay/wanted', { headers: { 'x-relay-token': 'short' } }), e2); assert.strictEqual(r.status, 401);
  });
  await t('노트북이 /relay/wanted 를 부르면 중계가 살아 있는 것으로 보고, 값이 없으면 503 준비 중 + 찾는 경로로 기록', async () => {
    const w = await wanted(TOKEN); assert.strictEqual(w.status, 200);
    upstream = 0; const r = await seoul(P1);
    assert.strictEqual(r.status, 503); const j = await r.json(); assert.strictEqual(j.relay, true); assert.strictEqual(upstream, 0, '직접 호출하지 않는다');
    const w2 = await (await wanted(TOKEN)).json();
    assert.ok(w2.wanted.some((x) => x.path === P1 && x.have === 0), JSON.stringify(w2));
  });
  await t('노트북이 올리면 /seoul 이 그 값을 돌려준다(x-seoul-cache: RELAY), 직접 호출 없음', async () => {
    const r0 = await push([{ path: P1, status: 200, body: ok() }]); const j0 = await r0.json(); assert.strictEqual(j0.stored, 1);
    store.clear(); upstream = 0;
    const r = await seoul(P1); assert.strictEqual(r.status, 200); assert.strictEqual(r.headers.get('x-seoul-cache'), 'RELAY');
    assert.ok(/realtimeArrivalList/.test(await r.text())); assert.strictEqual(upstream, 0);
    const w = await (await wanted(TOKEN)).json(); assert.ok(w.wanted.some((x) => x.path === P1 && x.have > 0));
  });
  await t('오래된 값(75초 초과)은 쓰지 않고 다시 준비 중', async () => {
    const real = Date.now; Date.now = () => real() + 80000; store.clear();   // 메모리 캐시(10초)도 지나게 시계를 80초 앞으로
    try { const r = await seoul(P1); assert.strictEqual(r.status, 503); } finally { Date.now = real; }
  });
  await t('한도·키 오류 응답, JSON 아닌 본문, 허용 안 된 경로는 저장하지 않는다', async () => {
    const r = await push([
      { path: P1, status: 200, body: JSON.stringify({ errorMessage: { code: 'ERROR-337' } }) },
      { path: P1, status: 200, body: 'not json' },
      { path: 'evil/path', status: 200, body: ok() },
      { path: P1, status: 200, body: JSON.stringify({ status: 500, code: 'INFO-100' }) },
    ]);
    const j = await r.json(); assert.strictEqual(j.stored, 0); assert.strictEqual(j.skipped, 4);
  });
  await t('INFO-200(해당 데이터 없음)은 정상 값으로 저장된다', async () => {
    const body = JSON.stringify({ status: 200, code: 'INFO-200', message: '해당하는 데이터가 없습니다.' });
    const r = await push([{ path: P1, status: 200, body }]); assert.strictEqual((await r.json()).stored, 1);
  });
  await t('중계 소식이 3분 넘게 없으면 옛 동작으로 돌아간다', async () => {
    env.DB.raw.prepare("UPDATE relay_state SET at = ? WHERE k='hb'").run(Date.now() - 200000);
    // isolate 메모리의 살아있음 표시(20초)를 지나게 한다
    const real = Date.now; Date.now = () => real() + 30000;
    try { env.SEOUL_API_KEY = 'KEYAAAA1'; upstream = 0; store.clear(); const r = await seoul('realtimeStationArrival/0/10/' + encodeURIComponent('망원')); assert.ok(upstream >= 1); assert.notStrictEqual(r.status, 503); }
    finally { Date.now = real; delete env.SEOUL_API_KEY; }
  });
  console.log('통과', pass, '건');
})();

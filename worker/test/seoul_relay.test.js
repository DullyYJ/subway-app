// gentle-lab /seoul 중계 시험 — 모의 업스트림(fetch)·caches 사용, 네트워크 없음.  실행: node worker/test/seoul_relay.test.js
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const tmp = path.join(os.tmpdir(), 'gentle-lab-seoul-test-' + process.pid + '.mjs');
fs.writeFileSync(tmp, fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8'));
let pass = 0; const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { console.log('  FAIL', name, '\n      ', e.message); process.exitCode = 1; } };
const SECRET = 'AbCd1234SecretKeyZ';          // 시험용 가짜 키
(async () => {
  const store = new Map();
  globalThis.caches = { default: { async match(k) { return store.get(k.url); }, async put(k, v) { store.set(k.url, v); } } };
  let calls = [];   // { url, headers, scheme }
  let handler = () => new Response('', { status: 400 });
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), hasHeaders: !!(init && init.headers) }); return handler(String(url), init); };
  const mod = await import(tmp); const W = mod.default;
  const call = async (q, env) => { const r = await W.fetch(new Request('https://x.test/seoul?' + q), env); return { status: r.status, text: await r.text(), h: r.headers }; };
  let n = 0; const P = () => 'realtimeStationArrival/0/5/' + encodeURIComponent('역' + (++n));   // 경로마다 캐시·쿨다운이 겹치지 않게
  const ok200 = JSON.stringify({ errorMessage: { code: 'INFO-000' }, realtimeArrivalList: [] });

  await t('정상(200)은 그대로 통과하고 캐시된다', async () => {
    handler = () => new Response(ok200, { status: 200 }); calls = [];
    const p = P(); const r1 = await call('path=' + encodeURIComponent(p), { SEOUL_API_KEY: SECRET });
    assert.strictEqual(r1.status, 200); assert.strictEqual(calls.length, 1); assert.ok(calls[0].url.startsWith('https://') && calls[0].hasHeaders);
    const r2 = await call('path=' + encodeURIComponent(p), { SEOUL_API_KEY: SECRET }); assert.strictEqual(calls.length, 1); assert.strictEqual(r2.status, 200);
  });
  await t('std 가 본문 없는 400 이면 plain 으로 재시도해 성공하고, 통한 방식을 기억한다', async () => {
    calls = []; handler = (u, init) => (init && init.headers) ? new Response('', { status: 400 }) : new Response(ok200, { status: 200 });
    const r = await call('path=' + encodeURIComponent(P()), { SEOUL_API_KEY: SECRET });
    assert.strictEqual(r.status, 200); assert.strictEqual(calls.length, 2); assert.strictEqual(calls[0].hasHeaders, true); assert.strictEqual(calls[1].hasHeaders, false);
    calls = []; const r2 = await call('path=' + encodeURIComponent(P()), { SEOUL_API_KEY: SECRET });
    assert.strictEqual(r2.status, 200); assert.strictEqual(calls.length, 1); assert.strictEqual(calls[0].hasHeaders, false);   // 이제 plain 부터
  });
  await t('https 가 모두 본문 없는 400 이면 http 로도 시도한다', async () => {
    calls = []; handler = (u) => u.startsWith('http://') ? new Response(ok200, { status: 200 }) : new Response('', { status: 400 });
    const r = await call('path=' + encodeURIComponent(P()), { SEOUL_API_KEY: SECRET });
    assert.strictEqual(r.status, 200); assert.ok(calls.some((c) => c.url.startsWith('http://')));
  });
  await t('모든 방식이 본문 없는 400 이면 본문 있는 JSON 오류를 돌려주고 같은 경로는 30초 쉰다', async () => {
    handler = () => new Response('', { status: 400 }); calls = [];
    const p = P(); const r = await call('path=' + encodeURIComponent(p), { SEOUL_API_KEY: SECRET });
    const j = JSON.parse(r.text); assert.strictEqual(r.status, 400); assert.strictEqual(j.ok, false); assert.strictEqual(j.upstream, 400); assert.ok(/empty body/.test(j.error)); assert.strictEqual(calls.length, 3);
    calls = []; const r2 = await call('path=' + encodeURIComponent(p), { SEOUL_API_KEY: SECRET });
    assert.strictEqual(calls.length, 0); assert.strictEqual(JSON.parse(r2.text).upstream, 400);
    assert.strictEqual(r.text.includes(SECRET), false);
  });
  await t('본문이 있는 4xx 는 재시도 없이 그대로', async () => {
    calls = []; handler = () => new Response(JSON.stringify({ status: 400, message: 'bad' }), { status: 400 });
    const r = await call('path=' + encodeURIComponent(P()), { SEOUL_API_KEY: SECRET });
    assert.strictEqual(r.status, 400); assert.strictEqual(calls.length, 1); assert.strictEqual(JSON.parse(r.text).message, 'bad');
  });
  await t('키 앞뒤 따옴표·공백·줄바꿈은 걷어내서 URL 에 넣는다', async () => {
    calls = []; handler = () => new Response(ok200, { status: 200 });
    await call('path=' + encodeURIComponent(P()), { SEOUL_API_KEY: ' "' + SECRET + '"\r\n' });
    assert.ok(calls[0].url.includes('/subway/' + SECRET + '/json/'), calls[0].url.replace(SECRET, '<KEY>'));
  });
  await t('ERROR-337 이면 다음 키로 넘어간다(키 2개)', async () => {
    calls = []; handler = (u) => u.includes('/KEYONE1/') ? new Response(JSON.stringify({ errorMessage: { code: 'ERROR-337' } }), { status: 200 }) : new Response(ok200, { status: 200 });
    const r = await call('path=' + encodeURIComponent(P()), { SEOUL_API_KEY: 'KEYONE1,KEYTWO2' });
    assert.strictEqual(r.status, 200); assert.strictEqual(r.h.get('x-seoul-key'), '2');
  });
  await t('debug: SEOUL_DEBUG 가 꺼져 있으면 403, 업스트림을 부르지 않는다', async () => {
    calls = []; const r = await call('path=' + encodeURIComponent(P()) + '&debug=1', { SEOUL_API_KEY: SECRET });
    assert.strictEqual(r.status, 403); assert.strictEqual(calls.length, 0);
  });
  await t('debug: 켜면 상태코드·본문 앞부분·키 모양을 내고 키 값은 어디에도 없다', async () => {
    calls = []; handler = (u) => u.includes('/sample/') ? new Response(ok200, { status: 200 }) : new Response('Bad Request ' + SECRET + ' ' + encodeURIComponent(SECRET), { status: 400 });
    const r = await call('path=' + encodeURIComponent(P()) + '&debug=1', { SEOUL_API_KEY: SECRET, SEOUL_DEBUG: '1' });
    const j = JSON.parse(r.text); assert.strictEqual(r.status, 200); assert.ok(j.probes.length >= 4);
    assert.ok(j.probes.some((p) => p.label === 'sample-key-https' && p.status === 200)); assert.ok(j.probes.some((p) => p.label === 'std-https' && p.status === 400));
    assert.strictEqual(j.firstKeyShape.len, SECRET.length);
    assert.strictEqual(r.text.includes(SECRET), false, '키 값이 응답에 있음'); assert.ok(r.text.includes('***'));
  });
  await t('debug: 20초 안에 다시 부르면 429', async () => {
    const r = await call('path=' + encodeURIComponent(P()) + '&debug=1', { SEOUL_API_KEY: SECRET, SEOUL_DEBUG: '1' });
    assert.strictEqual(r.status, 429);
  });
  await t('허용되지 않은 경로는 그대로 400(본문 있음)', async () => {
    const r = await call('path=' + encodeURIComponent('foo/bar'), { SEOUL_API_KEY: SECRET }); assert.strictEqual(r.status, 400); assert.ok(r.text.length > 0);
  });
  fs.unlinkSync(tmp);
  console.log('\n통과', pass, '건' + (process.exitCode ? ' — 실패 있음' : ''));
})();

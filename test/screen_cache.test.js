// 화면 캐시 규칙(engine/screen-cache.js) 시험 — ETag · max-age · 304 · 묶음 요청 · 워커 내장 사본 · 워커 끝에서 끝까지
//   실행: node test/screen_cache.test.js
const fs = require('fs'), path = require('path');
const E = require('../engine/screen-cache.js');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  FAIL', n); } };
// 순수 규칙
const a = E.scCond('/screen/news', '{"x":1}', null), b = E.scCond('/screen/news', '{"x":1}', a.etag), c = E.scCond('/screen/news', '{"x":2}', a.etag);
ok(a.etag === b.etag && a.etag !== c.etag && /^"[0-9a-z]+\.[0-9a-z]+"$/.test(a.etag), 'ETag: 같은 글이면 같고 다르면 다르다');
ok(!a.notModified && b.notModified && !c.notModified, '304 판단: 같은 ETag 만');
ok(E.scMatches('W/' + a.etag, a.etag) && E.scMatches('"zzz", ' + a.etag, a.etag) && E.scMatches('*', a.etag) && !E.scMatches('', a.etag) && !E.scMatches(null, a.etag), 'If-None-Match: 약한 표시 · 목록 · *');
ok(E.scMaxAge('/screen/tabs') === 600 && E.scMaxAge('/screen/chat') === 4 && E.scMaxAge('/screen/home') === 15 && E.scMaxAge('/screen/result') === 0 && E.scMaxAge('/nope') === 0, 'max-age 표');
ok(E.scEtag('') !== E.scEtag(' ') && E.scEtag(null) === E.scEtag(''), '빈 글 · null 안전');
// 워커 내장 사본이 같다
{
  const w = fs.readFileSync(path.join(__dirname, '../engine/route-v2-worker.ascii.js'), 'utf8');
  const esc = s => s.replace(/[\u0080-￿]/g, ch => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'));
  const cut = t => t.slice(0, t.indexOf('if (typeof module')).trimEnd();
  const src = esc(cut(fs.readFileSync(path.join(__dirname, '../engine/screen-cache.js'), 'utf8'))), glue = esc(fs.readFileSync(path.join(__dirname, '../engine/screen-cache-worker.js'), 'utf8').trimEnd());
  ok(w.includes('// ===== SCACHE ENGINE BEGIN =====\n' + src + '\n' + glue + '\n// ===== SCACHE ENGINE END ====='), '워커 내장 사본이 같다');
  ok(w.includes('if (url.pathname === "/screen/batch") return handleScreenBatch(request);') && w.includes('serverTimed(await handleFetchCond(request, env, ctx), _t0)') && !/return await handleFetch\(request, env, ctx\);/.test(w), '워커 경로 · fetch 연결');
}
(async () => {
  const tmp = path.join(require('os').tmpdir(), 'rv2_sc_' + process.pid + '.mjs');
  fs.copyFileSync(path.join(__dirname, '../engine/route-v2-worker.ascii.js'), tmp);
  try {
    const mod = await import(tmp), F = (u, init) => mod.default.fetch(new Request('https://x' + u, init), {}, { waitUntil() {} });
    // GET 화면: ETag + max-age, 같은 ETag 로 다시 물으면 304(빈 본문)
    let r1 = await F('/screen/hdr?tz=540&now=1790000000000');
    const e1 = r1.headers.get('ETag'), t1 = await r1.text();
    ok(r1.status === 200 && e1 && r1.headers.get('Cache-Control') === 'private, max-age=300' && JSON.parse(t1).ok, 'GET: ETag + Cache-Control');
    let r2 = await F('/screen/hdr?tz=540&now=1790000000000', { headers: { 'If-None-Match': e1 } });
    ok(r2.status === 304 && (await r2.text()) === '' && r2.headers.get('ETag') === e1, 'GET: 같은 ETag → 304');
    let r3 = await F('/screen/hdr?tz=540&now=1790000000000', { headers: { 'If-None-Match': '"other"' } });
    ok(r3.status === 200 && (await r3.text()) === t1, 'GET: 다른 ETag → 200 전체');
    // POST 화면
    const body = '{"cap":18,"f":{"mode":"chat"}}';
    let p1 = await F('/screen/cchips', { method: 'POST', body }), pe = p1.headers.get('ETag');
    ok(p1.status === 200 && pe && p1.headers.get('Cache-Control') === 'private, max-age=600', 'POST: ETag + max-age');
    let p2 = await F('/screen/cchips', { method: 'POST', body, headers: { 'If-None-Match': pe } });
    ok(p2.status === 304, 'POST: 같은 ETag → 304');
    let p3 = await F('/screen/cchips', { method: 'POST', body: '{"cap":18,"f":{"mode":"board"}}', headers: { 'If-None-Match': pe } });
    ok(p3.status === 200, 'POST: 다른 본문이면 ETag 가 달라 200');
    // 오류 응답에는 캐시 헤더를 붙이지 않는다
    let bad = await F('/screen/cchips', { method: 'POST', body: 'zzz' });
    ok(bad.status === 400 && !bad.headers.get('ETag'), '오류 응답은 그대로');
    // 묶음
    const batch = async (r) => { const x = await F('/screen/batch', { method: 'POST', body: JSON.stringify({ r }) }); return { st: x.status, j: await x.json() }; };
    let B = await batch([
      { k: 'tabs|home', u: '/screen/tabs', b: '{"cap":18,"f":{"tab":"home"}}' },
      { k: 'cchips|chat', u: '/screen/cchips', b: body },
      { k: 'hdr', u: '/screen/hdr?tz=540&now=1790000000000', m: 'GET' },
      { k: 'cchips|chat2', u: '/screen/cchips', b: body, t: pe },
      { k: 'nested', u: '/screen/batch', b: '{}' },
      { k: 'outside', u: '/ride-eta', b: '{}' },
      { k: 'badjson', u: '/screen/cchips', b: 'zzz' }
    ]);
    ok(B.st === 200 && B.j.ok, '묶음: 한 번에 200');
    ok(B.j.res['tabs|home'].s === 200 && JSON.parse(B.j.res['tabs|home'].b).screen === 'tabs' && B.j.res['tabs|home'].m === 600 && B.j.res['tabs|home'].e, '묶음: 탭 막대');
    ok(B.j.res['cchips|chat'].s === 200 && B.j.res['cchips|chat'].e === pe, '묶음: 칩 줄이 단독 요청과 같은 ETag(같은 화면)');
    const direct = await (await F('/screen/cchips', { method: 'POST', body })).text();
    ok(B.j.res['cchips|chat'].b === direct, '묶음: 단독 요청과 글자 하나까지 같다');
    ok(B.j.res['hdr'].s === 200 && JSON.parse(B.j.res['hdr'].b).screen === 'hdr', '묶음: GET 도 된다');
    ok(B.j.res['cchips|chat2'].s === 304 && B.j.res['cchips|chat2'].b === undefined, '묶음: 앱이 가진 ETag 와 같으면 항목만 304');
    ok(B.j.res['nested'].s === 400 && B.j.res['outside'].s === 400 && B.j.res['badjson'].s === 400, '묶음: 묶음 안의 묶음 · /screen 밖 · 엉터리 본문은 그 항목만 거절');
    let tooMany = await batch(Array.from({ length: 30 }, (_, i) => ({ k: 'k' + i, u: '/screen/hdr', m: 'GET' })));
    ok(Object.keys(tooMany.j.res).length === 16, '묶음: 최대 16개');
    let nb = await F('/screen/batch', { method: 'POST', body: 'zzz' }), nb2 = await F('/screen/batch', { method: 'GET' });
    ok(nb.status === 400 && nb2.status === 405, '묶음: 엉터리 본문 400 · POST 만 405');
  } catch (e) { fail++; console.log('  FAIL 워커 시험 예외', e && e.stack || e); }
  try { fs.unlinkSync(tmp); } catch (e) { }
  console.log(`screen_cache: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();

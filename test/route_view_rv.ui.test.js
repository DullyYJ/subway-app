// 경로 정리를 엔진이 하기(설정 스위치 gdm_e2 · 요청 &rv=1) ↔ 앱(JS) 연결 시험 — 2026-10-19 (s66)
//   진짜 index.html 의 '예전 웹 규칙'(_dedupPaths · _parseRouteOptions · _routeWhyText · _routeTimeSplit)과 진짜 엔진 모듈(engine/route-view.js)을
//   무작위 경로 묶음 600개에 똑같이 태워 결과(남는 경로 · 탭 · 왜 이 경로 · 승차/대기/도보)가 같은지 본다.
//   · _rvApply: 엔진 값이 맞는 모양일 때만 쓰고(아니면 null → 예전 방식) · 그림(_renderSplitRow)은 엔진 값을 그대로 쓴다
// 실행: node test/route_view_rv.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const RV = require('../engine/route-view');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 1800)); } };

// 무작위(씨앗 고정)
let seed = 20261019; const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let x = seed; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
const pick = a => a[Math.floor(rnd() * a.length)];
const STN = ['강남', '시청', '서울역', '홍대', '신촌', '종로3가'];
function leg() {
  const k = rnd(), a = pick(STN), b = pick(STN);
  if (k < 0.45) { const o = { trafficType: 1, lane: [{ name: pick(['1호선', '2호선', '9호선', '공항철도']) }], startName: a, endName: b, sectionTime: 3 + Math.floor(rnd() * 35) };
    if (rnd() < 0.5) { o.startSec = Math.floor(rnd() * 600); o.endSec = o.startSec + Math.floor(rnd() * o.sectionTime * 60); }
    if (rnd() < 0.2) o.xpWaitSec = Math.floor(rnd() * 400); if (rnd() < 0.15) o.waitSec = Math.floor(rnd() * 300); return o; }
  if (k < 0.7) { const o = { trafficType: 2, lane: [{ busNo: pick(['146', '472', '9401']) }], startName: a, endName: b, sectionTime: 3 + Math.floor(rnd() * 30) };
    if (rnd() < 0.6) o.waitSec = Math.floor(rnd() * 500); if (rnd() < 0.3) { o.startSec = 0; o.endSec = Math.floor(rnd() * o.sectionTime * 60); } return o; }
  if (k < 0.74) return { trafficType: 4, lane: [{ name: 'KTX' }], startName: a, endName: b, sectionTime: 60 + Math.floor(rnd() * 120), waitSec: rnd() < 0.5 ? 600 : null };
  const o = { trafficType: 3, sectionTime: 1 + Math.floor(rnd() * 12) }; if (rnd() < 0.3) o.xferWaitSec = Math.floor(rnd() * 400); return o;
}
function fixture() {
  const n = 1 + Math.floor(rnd() * 6), ps = [], base = 20 + Math.floor(rnd() * 60), sigPool = [];
  for (let i = 0; i < n; i++) {
    let sp; if (sigPool.length && rnd() < 0.3) sp = JSON.parse(JSON.stringify(pick(sigPool))); else { sp = []; const m = 1 + Math.floor(rnd() * 5); for (let j = 0; j < m; j++) sp.push(leg()); sigPool.push(sp); }
    const info = { id: i, tab: pick(['fast', 'less', 'walk', 'sub', 'bus', 'direct', 'longdist', 'fast', 'less', null]), totalTime: rnd() < 0.05 ? undefined : base + Math.floor(rnd() * 6) * 3, transferCount: rnd() < 0.1 ? undefined : Math.floor(rnd() * 4), pathType: pick([1, 2, 3, 3, 4]) };
    if (rnd() < 0.15) { info.longDist = true; info.ldGrade = pick(['KTX', '', undefined]); info.ldDepTs = 100; if (rnd() < 0.7) info.ldFastRide = { rideMin: 100, depTs: rnd() < 0.5 ? 200 : 50, depLabel: '10:30' }; }
    ps.push({ info, subPath: sp });
  }
  return ps;
}
const FIX = []; for (let i = 0; i < 600; i++) FIX.push(fixture());
const ENGINE = FIX.map(f => RV.rvAnnotate({ result: { path: JSON.parse(JSON.stringify(f)) } }));

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul' });
  await ctx.addInitScript(() => { try { localStorage.setItem('gdm_loc_disclosed', '1'); } catch (e) {} window.Capacitor = { isNativePlatform: () => false, getPlatform: () => 'web', Plugins: {} }; });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => { const u = new URL(r.request().url()); if (u.protocol === 'file:' || u.protocol === 'data:') return r.continue(); return r.fulfill({ status: 200, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: '{}' }); });
  await page.goto('file://' + html); await sleep(1500);
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // 예전 웹 규칙으로 정리한 결과(남은 경로 번호 · 탭 · 왜 · 나누기)
  const OLD = await page.evaluate((fix) => fix.map(f => {
    var paths = JSON.parse(JSON.stringify(f));
    var allPaths = _dedupPaths(paths.slice());
    var seen = {};
    allPaths = allPaths.filter(function (p) { var key = (p.info || {}).totalTime + '_' + (p.info || {}).transferCount + '_' + (p.info || {}).pathType; if (seen[key]) return false; seen[key] = true; return true; });
    _allRouteResults = _parseRouteOptions({ result: { path: allPaths } });
    return allPaths.map(function (p) {
      var route = _convertSinglePathToRoute(p), tot = Math.round(((route.summary || {}).duration || 0) / 60);
      var sp = _routeTimeSplit(route.sections || [], tot);
      return { id: p.info.id, valid: route.why !== undefined, tabs: (p.info._tabs || []).slice(), why: route.why, split: sp ? { ride: sp.ride, wait: sp.wait, walk: sp.walk, text: _routeSplitText(sp) } : null, tot: tot };
    });
  }), FIX);
  await t('무작위 600묶음: 남는 경로 · 탭 · 왜 이 경로 · 승차/대기/도보가 예전 웹 규칙과 같다', async () => {
    let bad = [], npaths = 0, nsplit = 0, nwhy = 0;
    FIX.forEach((f, i) => {
      const rv = ENGINE[i], old = OLD[i];
      const mine = rv.keep.map(k => ({ id: f[k].info.id, tabs: rv.tabs[k], why: rv.why[k], split: rv.split[k] ? { ride: rv.split[k].ride, wait: rv.split[k].wait, walk: rv.split[k].walk, text: rv.split[k].text } : null, tot: rv.split[k] ? rv.split[k].tot : null }));
      npaths += mine.length;
      try {
        assert.deepStrictEqual(mine.map(x => x.id), old.map(x => x.id), '남는 경로');
        mine.forEach((m, j) => { assert.deepStrictEqual(m.tabs, old[j].tabs, '탭 ' + m.id); if (!old[j].valid) return;   // 탈것이 없는 경로는 앱이 그리지 않는다(변환에서 무효)
          assert.strictEqual(m.why, old[j].why, '왜 ' + m.id); assert.deepStrictEqual(m.split, old[j].split, '나누기 ' + m.id); if (m.split) { nsplit++; assert.strictEqual(m.tot, old[j].tot); } if (m.why) nwhy++; });
      } catch (e) { bad.push('#' + i + ' ' + e.message.split('\n').slice(0, 6).join(' | ')); }
    });
    assert.ok(npaths > 1200 && nsplit > 500 && nwhy > 500, 'npaths=' + npaths + ' nsplit=' + nsplit + ' nwhy=' + nwhy);
    assert.strictEqual(bad.length, 0, bad.slice(0, 4).join('\n'));
  });

  console.log('[_rvApply: 맞는 모양일 때만 쓴다]');
  const mkRes = (paths, rv) => ({ result: { path: paths, rv } });
  const ap = (res, paths, on) => page.evaluate(([res, paths, on]) => { try { localStorage.setItem('gdm_e2', on ? '1' : '0'); } catch (e) {} var r = _rvApply(res, paths); return r ? r.map(function (p) { return { id: p.info.id, tabs: p.info._tabs, why: p.info._rvWhy, split: p.info._rvSplit }; }) : null; }, [res, paths, on]);
  const f0 = FIX.find((f, i) => ENGINE[i].keep.length >= 2 && f.length >= 3), i0 = FIX.indexOf(f0), rv0 = ENGINE[i0];
  await t('맞으면 엔진이 고른 번호 순서대로 · 탭 · 문장 · 나누기를 그대로 쓴다', async () => {
    const r = await ap(mkRes(f0, rv0), f0, true);
    assert.deepStrictEqual(r.map(x => x.id), rv0.keep.map(k => f0[k].info.id));
    r.forEach((x, j) => { assert.deepStrictEqual(x.tabs, rv0.tabs[rv0.keep[j]]); assert.strictEqual(x.why, rv0.why[rv0.keep[j]]); assert.deepStrictEqual(x.split, rv0.split[rv0.keep[j]]); });
  });
  await t('스위치 꺼짐 · rv 없음 · 옛 버전 · 개수 불일치 · 범위 밖 번호 · 겹친 번호 · 이상한 값 → null(예전 방식)', async () => {
    assert.strictEqual(await ap(mkRes(f0, rv0), f0, false), null);
    assert.strictEqual(await ap({ result: { path: f0 } }, f0, true), null);
    assert.strictEqual(await ap(null, f0, true), null);
    const bad = o => JSON.parse(JSON.stringify(Object.assign({}, rv0, o)));
    assert.strictEqual(await ap(mkRes(f0, bad({ v: 2 })), f0, true), null);
    assert.strictEqual(await ap(mkRes(f0, bad({ n: rv0.n + 1 })), f0, true), null);
    assert.strictEqual(await ap(mkRes(f0, bad({ keep: [0, 99] })), f0, true), null);
    assert.strictEqual(await ap(mkRes(f0, bad({ keep: [0, 0] })), f0, true), null);
    assert.strictEqual(await ap(mkRes(f0, bad({ keep: [] })), f0, true), null);
    assert.strictEqual(await ap(mkRes(f0, bad({ keep: [0.5] })), f0, true), null);
    assert.strictEqual(await ap(mkRes(f0, bad({ why: { 0: 5 } })), f0, true), null);
    assert.strictEqual(await ap(mkRes(f0, bad({ tabs: { 0: 'x' } })), f0, true), null);
    const rvBadSplit = bad({}); rvBadSplit.split[rvBadSplit.keep[0]] = { ride: 'x', wait: 1, walk: 1, tot: 3, text: 'a' };
    const r = await ap(mkRes(f0, rvBadSplit), f0, true); assert.ok(r && r[0].split === null, '이상한 나누기만 버리고 나머지는 쓴다');
  });

  console.log('[그리기: 엔진 나누기 그대로 · 맞지 않으면 예전 방식]');
  const render = (route) => page.evaluate((route) => {
    var el = document.getElementById('transitSplitRow'); if (!el) { el = document.createElement('div'); el.id = 'transitSplitRow'; document.body.appendChild(el); }
    window._htlTlTotalMin = null; route.sections = route.sections || []; _renderSplitRow(route); return { h: el.innerHTML, now: window._routeSplitNow };
  }, route);
  const secs = [{ transportation: { type: 1, name: '2호선' }, duration: 1200, startSec: 0, endSec: 1200, waitSec: null }, { transportation: { type: 3, name: '도보' }, duration: 240 }];
  await t('엔진이 나눈 값이 있고 총 소요가 같으면 그 글자 그대로', async () => {
    const r = await render({ summary: { duration: 1440 }, sections: secs, why: '', rvSplit: { ride: 20, wait: 0, walk: 4, tot: 24, text: '엔진 문장' } });
    assert.ok(/전체 24분 · 엔진 문장/.test(r.h), r.h); assert.deepStrictEqual(r.now, { ride: 20, wait: 0, walk: 4 });
  });
  await t('엔진 값의 총 소요가 지금 보이는 값과 다르면 예전 방식으로 계산', async () => {
    const r = await render({ summary: { duration: 1500 }, sections: secs, why: '', rvSplit: { ride: 20, wait: 0, walk: 4, tot: 24, text: '엔진 문장' } });
    assert.ok(/전체 25분 · 승차 /.test(r.h) && !/엔진 문장/.test(r.h), r.h);
  });
  await t('엔진 값이 없으면(옛 엔진) 예전 방식 · 경로 정보 없는 경로(why 없음)는 안 그린다', async () => {
    const r = await render({ summary: { duration: 1440 }, sections: secs, why: '' });
    assert.ok(/전체 24분 · 승차 20분 · 도보·환승 4분/.test(r.h), r.h);
    const r2 = await render({ summary: { duration: 1440 }, sections: secs }); assert.ok(!/전체/.test(r2.h), r2.h); assert.strictEqual(r2.now, null);
  });
  await t('화면 오류 없음', async () => { assert.deepStrictEqual(errs, []); });
  await b.close();
  console.log('route_view_rv.ui: ' + pass + ' pass ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();

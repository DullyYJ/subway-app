// 홈 카드 묶음 엔진(engine/hcards.js) 시험.  실행: node test/hcards_engine.test.js   (javac · java 필요)
const fs = require('fs'), path = require('path');
const E = require('../engine/hcards'), screenCheck = require('./helpers/screen_check');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  FAIL', m); } }
const R = p => path.join(__dirname, '..', p);
const now = Date.UTC(2026, 9, 20, 23, 30, 0);              // KST 08:30 (출근 피크)
const walk = t => ({ trafficType: 3, sectionTime: t, distance: t * 70 });
const sub = (a, b, n, t) => ({ trafficType: 1, lane: [{ name: n }], sectionTime: t, distance: t * 600, startName: a, endName: b, passStopList: { stations: [{ stationName: a, y: 37.49, x: 126.72 }, { stationName: '중간', y: 37.5, x: 126.8 }, { stationName: b, y: 37.52, x: 126.9 }] } });
const bus = (no, t) => ({ trafficType: 2, lane: [{ busNo: no }], sectionTime: t, distance: t * 400, startName: '정류장A', endName: '정류장B', passStopList: { stations: [{ stationName: '정류장A' }, { stationName: '정류장B' }] } });
const mk = subPath => ({ result: { path: [{ info: { totalTime: 24, totalDistance: 9000, transferCount: 0, tab: 'fast' }, subPath }] } });
const base = (extra) => Object.assign({ now, tz: 540, th: 'dark', hol: false, gps: null, r: { data: mk([walk(3), sub('부평', '강남', '수도권 1호선', 18), walk(3)]), tab: 'fast', a: '부평', b: '강남', bt: null, rb: now }, ai: { nextAt: now + 300000, busy: false, rnd: 0.2 }, tk: { m: [['하늘', '오늘 2호선 괜찮아요', now - 60000, 0], ['나', '출근 중', now - 30000, 1]], fold: 0, tzo: -540 } }, extra || {});
const call = f => E.hcardsScreen({ cap: 18 }, f);
const flat = ns => { const o = []; (function f(a) { a.forEach(n => { o.push(n); if (n.kids) f(n.kids); }); })(ns); return o; };
const txt = ns => flat(ns).map(n => n.s || '').join('\n');

ok(E.hcardsScreen({ cap: 17 }, base()).ok === false && call({}).ok === false, 'cap 18 미만 · now 없으면 만들지 않는다');
let o = call(base());
ok(o.ok && o.screen === 'hcards' && o.body.length === 3 && o.body.every(p => p.t === 'panel') && /^h1:/.test(o.rev), '카드 세 장(AI · 혼잡도 · 대화)');
const nodes = flat(o.body);
const aih = nodes.find(n => n.t === 'aih');
ok(aih && /부평 → 강남 · 남은시간: 24분/.test(aih.s) && aih.act.v === 'ai.refresh' && aih.to === now + 300000, 'AI 제목: 출발 → 도착 · 남은시간, 새로고침, 다음 갱신 시각');
ok(o.info.ai === 'brief' && /24분/.test(txt(o.body)) && /1호선/.test(txt(o.body)), 'AI 본문: 소요·노선 문장을 엔진이 만든다');
const cgh = nodes.find(n => n.t === 'cgh');
ok(cgh && /부평/.test(cgh.nm + cgh.lab) && nodes.some(n => n.t === 'gauge') && nodes.some(n => n.t === 'chart') && o.info.cong === 'sub' && o.info.stn === '부평', '혼잡도: 처음 타는 역(부평) 기준 게이지·24시간 막대');
ok(nodes.some(n => n.t === 'ltr' && n.nick === '하늘') && nodes.some(n => n.t === 'inbar' && n.key === 'talk.in') && nodes.some(n => n.t === 'lth' && n.act.v === 'tk.open'), '대화: 최근 줄 · 입력줄 · 머리줄 누름');
// 기준시각을 정한 탐색 → 예상 브리핑
o = call(base({ r: { data: mk([sub('부평', '강남', '수도권 1호선', 18)]), tab: 'fast', a: '부평', b: '강남', bt: now + 3 * 3600000, rb: now } }));
ok(o.info.ai === 'preview' && /예상/.test(flat(o.body).find(n => n.t === 'aih').s), '기준시각을 정하면 예상 브리핑');
// 첫 구간이 버스 → 버스 혼잡도 모드
o = call(base({ r: { data: mk([walk(2), bus('6', 20)]), tab: 'fast', a: '집', b: '회사', bt: null, rb: now } }));
ok(o.info.cong === 'bus' && o.info.stn === '정류장A' && flat(o.body).some(n => n.t === 'cgh'), '첫 구간이 버스면 버스 혼잡도 안내');
// 경로 없음 + 위치 → 가까운 역 기준
o = call(base({ r: null, gps: [37.4979, 127.0276] }));
ok(o.info.near === '강남' && o.info.cong === 'sub' && o.info.stn === '강남' && o.info.ai === 'brief' && flat(o.body).some(n => n.t === 'aih' && /강남/.test(n.s)), '경로 없이 위치만: 가까운 역(강남) 기준 브리핑·혼잡도');
// 아무 사실도 없음
o = call(base({ r: null, gps: null }));
ok(o.ok && o.info.ai === 'empty' && o.info.cong === 'none' && o.body.length === 3, '아무것도 없으면 안내 문구');
ok(E.hcNearest(0, 0) === null && E.hcNearest(37.4979, 127.0276)[0] === '강남', '가까운 역 3km 안');
// 앱 검증기
{
  const screens = [call(base()), call(base({ th: 'pastel', r: { data: mk([walk(2), bus('6', 20)]), tab: 'fast', a: '집', b: '회사', bt: null, rb: now } })), call(base({ r: null, gps: [37.4979, 127.0276] })), call(base({ r: null }))];
  const r = screenCheck(screens);
  ok(!r.err && r.out.length === 4 && r.out.every(l => /^OK/.test(l)), '앱 검증기 통과: ' + (r.err || r.out.join(' | ')));
}
{
  const w = fs.readFileSync(R('engine/route-v2-worker.ascii.js'), 'utf8');
  ok(/\/\/ ===== HCARDS ENGINE BEGIN =====/.test(w) && w.indexOf('if (url.pathname === "/screen/hcards") return handleScreenHcards(request);') > 0, '워커에 내장됨');
}
(async () => {
  const os = require('os'), tmp = path.join(os.tmpdir(), 'rv2_hc_' + process.pid + '.mjs');
  fs.copyFileSync(R('engine/route-v2-worker.ascii.js'), tmp);
  try {
    const mod = await import(tmp), wk = mod.default;
    const res = await wk.fetch(new Request('https://x/screen/hcards', { method: 'POST', body: JSON.stringify({ cap: 18, f: base() }), headers: { 'Content-Type': 'text/plain;charset=UTF-8' } }), {}, { waitUntil() { } });
    const j = await res.json();
    ok(res.status === 200 && j.ok && j.body.length === 3 && JSON.stringify(j.body) === JSON.stringify(call(base()).body), '워커 안에서 직접 계산과 같은 카드 세 장');
    const r2 = await wk.fetch(new Request('https://x/screen/hcards', { method: 'POST', body: JSON.stringify({ cap: 3, f: {} }) }), {}, { waitUntil() { } });
    ok(r2.status === 400, '워커: cap 부족은 400');
  } catch (e) { fail++; console.log('  FAIL 워커 예외', e && e.stack || e); }
  try { fs.unlinkSync(tmp); } catch (e) { }
  console.log(pass + ' 통과 / ' + fail + ' 실패');
if (fail) process.exit(1);
})();

// 미리보기 라벨 엔진(engine/pvlabel.js) 시험.  실행: node test/pvlabel_engine.test.js   (javac · java 필요)
//  ① cap 17 미만 · 모르는 kind/mode 거절 ② 글(예상 · 노선도 · 기준 시각 · 이모지 제거) ③ 앱 검증기 ④ 워커 내장 ⑤ 웹 연결 글
const fs = require('fs'), path = require('path');
const E = require('../engine/pvlabel'), screenCheck = require('./helpers/screen_check');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  FAIL', m); } }
const R = p => path.join(__dirname, '..', p);
const html = fs.readFileSync(R('www/index.html'), 'utf8');
const EMOJI = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
const G = (f, cap) => E.pvlScreen({ cap: cap == null ? 17 : cap }, f);

ok(G({ kind: 'route', mode: 'custom' }, 16).error === 'cap' && G({ kind: 'route', mode: 'custom' }, 17).ok === true, 'cap 17 미만이면 만들지 않는다');
ok(G({ kind: 'x', mode: 'custom' }).error === 'kind' && G({ kind: 'route', mode: '' }).error === 'mode' && G({ kind: 'route', mode: 'zz' }).error === 'mode' && G(null).error === 'kind', '모르는 kind / mode 는 거절');

{
  const s = o => G(o).head[0].s;
  ok(s({ kind: 'route', mode: 'custom', lbl: '오후 2:30' }) === '예상 경로 · 오후 2:30', '경로 예상 글');
  ok(s({ kind: 'cong', mode: 'custom', lbl: '오후 2:30' }) === '예상 혼잡도 · 오후 2:30' && s({ kind: 'ai', mode: 'custom', lbl: '오후 2:30' }) === '예상 브리핑 · 오후 2:30', '혼잡도 · 브리핑 예상 글');
  ok(['route', 'cong', 'ai'].every(k => s({ kind: k, mode: 'metro', lbl: '무시' }) === '노선도에서 설정한 경로'), '노선도 글(기준 시각은 쓰지 않는다)');
  ok(s({ kind: 'route', mode: 'custom', lbl: '' }) === '예상 경로' && s({ kind: 'route', mode: 'custom' }) === '예상 경로', '기준 시각 글이 없으면 단어만');
  ok(s({ kind: 'route', mode: 'custom', lbl: '  🔮  오후   2:30 ✅ ' }) === '예상 경로 · 오후 2:30', '이모지 제거 · 공백 정리');
  ok(s({ kind: 'route', mode: 'custom', lbl: 'x'.repeat(200) }).length === '예상 경로 · '.length + 40, '기준 시각 글은 40자까지');
  const o = G({ kind: 'route', mode: 'custom', lbl: '오후 2:30' }), p = o.head[0];
  ok(p.t === 'pill' && p.tc === '#ff9500' && p.fill === 'rgba(255,149,0,0.14)' && p.size === 11 && p.bold === true && p.ph === 11 && p.pv === 4 && p.r === 9 && p.pad[3] === 10, '웹 CSS(11px 굵게 · #ff9500 · 여백 4/11 · 둥글기 9 · 아래 10)와 같다');
  ok(o.screen === 'pvl' && o.cover === 'tab' && o.bg === 'card' && o.info.kind === 'route' && !EMOJI.test(JSON.stringify(o)), '겉틀 · 이모지 없음');
  ok(G({ kind: 'route', mode: 'custom', lbl: 'a' }).rev === G({ kind: 'route', mode: 'custom', lbl: 'a' }).rev && G({ kind: 'route', mode: 'custom', lbl: 'a' }).rev !== G({ kind: 'route', mode: 'custom', lbl: 'b' }).rev, 'rev');
  ok(/font-size:11px;font-weight:800;color:#ff9500;background:rgba\(255,149,0,\.14\);padding:4px 11px;border-radius:9px;margin-bottom:10px/.test(html), '웹 라벨 CSS 값이 엔진 값과 같다');
}
{
  const cases = [G({ kind: 'route', mode: 'custom', lbl: '오후 2:30' }), G({ kind: 'ai', mode: 'metro' }), G({ kind: 'cong', mode: 'custom', lbl: '아주 긴 글 '.repeat(8) })];
  const r = screenCheck(cases);
  ok(!r.err && r.out.length === 3 && r.out.every(l => /^OK/.test(l)), '앱 검증기 통과 ' + (r.err || r.out.join(' / ')));
}
{
  const W = fs.readFileSync(R('engine/route-v2-worker.ascii.js'), 'utf8');
  ok(/handleScreenPvl/.test(W) && /function pvlScreen/.test(W) && /url\.pathname === "\/screen\/pvl"/.test(W), '워커에 /screen/pvl 이 내장돼 있다');
  const names = [...fs.readFileSync(R('engine/pvlabel.js'), 'utf8').matchAll(/^(?:function|var) ([A-Za-z0-9_]+)/gm)].map(m => m[1]);
  const others = W.replace(/\/\/ ===== PVLABEL ENGINE BEGIN =====[\s\S]*?\/\/ ===== PVLABEL ENGINE END =====/, '');
  names.forEach(n => { const re = new RegExp('(?:^|\\n)(?:async )?(?:function|var|let|const) ' + n + '\\b', 'g'); ok(!re.test(others), '이름 충돌 없음 ' + n); });
  const vm = require('vm'), ctx = { Response: class { constructor(b, o) { this.b = b; this.status = (o && o.status) || 200; } }, console, ENGINE_VERSION: 'x' };
  vm.createContext(ctx);
  const blk = (W.match(/\/\/ ===== PVLABEL ENGINE BEGIN =====[\s\S]*?\/\/ ===== PVLABEL ENGINE END =====/) || [''])[0];
  ok(blk.length > 300, '워커 사본이 있다');
  try {
    vm.runInContext(blk + '\nthis.__h = handleScreenPvl;', ctx);
    const rq = (obj, method) => ({ method: method || 'POST', text: () => Promise.resolve(typeof obj === 'string' ? obj : JSON.stringify(obj)) });
    Promise.all([ctx.__h(rq({ cap: 17, f: { kind: 'cong', mode: 'custom', lbl: '오후 2:30' } })), ctx.__h(rq({ cap: 16, f: { kind: 'cong', mode: 'custom' } })), ctx.__h(rq('{bad')), ctx.__h(rq({}, 'GET'))]).then(([a, b2, c, d]) => {
      const ja = JSON.parse(a.b);
      ok(a.status === 200 && ja.ok && JSON.stringify(Object.assign({}, ja, { ver: undefined })) === JSON.stringify(G({ kind: 'cong', mode: 'custom', lbl: '오후 2:30' })), '워커 사본이 요청을 끝까지 처리하고 엔진 파일과 같다');
      ok(b2.status === 400 && c.status === 400 && d.status === 405, '규격 낮음 400 · 나쁜 JSON 400 · GET 405');
      done();
    }, e => { ok(false, '워커 요청 오류 ' + e.message); done(); });
  } catch (e) { ok(false, '워커 블록 실행 오류 ' + e.message); done(); }
}
function done() {
  ok(/kp: 'gdm_scrp', ep: '\/screen\/pvl'/.test(html) && /id="scrpSetCard"/.test(html) && /key === 'f\.scrp'/.test(html) && /window\._scrpSetUse = /.test(html) && /window\._ndpvl\.changed\(\)/.test(html), '웹: 틀 · 설정 카드 · 스위치 · 바뀜 알림');
  console.log(fail ? ('pvlabel_engine: ' + pass + ' pass, ' + fail + ' FAIL') : ('pvlabel_engine: ' + pass + ' pass, 0 fail'));
  process.exit(fail ? 1 : 0);
}

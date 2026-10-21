// 맨 위 감성 문구 엔진(engine/hdr.js) 시험 — 시간대 · 섞기 · 이모지 제거 · 화면 모양 · 워커 내장 사본 · 워커 끝에서 끝까지
//   실행: node test/hdr_engine.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const E = require('../engine/hdr.js');
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log('  FAIL', n); } };
const at = (h, d) => Date.UTC(2026, 9, d || 21, h - 9, 5);                       // 한국 시각 h 시 05분
// 시간대 경계(웹 _pickMarqueeCat 과 같다)
const cats = { 6: 'night', 7: 'morning', 9: 'morning', 10: 'noon', 14: 'noon', 15: 'afternoon', 17: 'afternoon', 18: 'evening', 19: 'evening', 20: 'night', 23: 'night', 0: 'night' };
for (const h of Object.keys(cats)) ok(E.hdrScreen({ nowMs: at(+h), tzOffsetMin: 540 }).info.cat === cats[h], h + '시 → ' + cats[h]);
// 문구 묶음: 시간대마다 50개 이상, 이모지 없음, 80자 이하, 중복 없음
for (const c of ['morning', 'noon', 'afternoon', 'evening', 'night']) ok(E.HDR_MSGS[c].length >= 50, c + ' 50개 이상');
const sc = E.hdrScreen({ nowMs: at(9), tzOffsetMin: 540 }), mq = sc.body[0];
ok(sc.ok && sc.v === 1 && sc.screen === 'hdr' && sc.cover === 'tab' && sc.head.length === 0 && mq.t === 'marq', '화면 모양');
ok(mq.msgs.length >= 50 && mq.msgs.length <= 60 && new Set(mq.msgs).size === mq.msgs.length && mq.msgs.every(s => s.length > 0 && s.length <= 80), '문구 개수 · 중복 · 길이');
ok(mq.msgs.every(s => !/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u.test(s)), '이모지 없음');
ok(E.hdrStripEmoji('오늘도 화이팅! 💪') === '오늘도 화이팅!' && E.hdrStripEmoji('a  b ☕') === 'a b' && E.hdrStripEmoji(null) === '', '이모지 제거');
// 섞기: 같은 시각이면 같은 순서, 날짜가 다르면 다른 순서, 같은 문구 집합
const a = E.hdrScreen({ nowMs: at(9, 21), tzOffsetMin: 540 }).body[0].msgs, b = E.hdrScreen({ nowMs: at(9, 21), tzOffsetMin: 540 }).body[0].msgs, c = E.hdrScreen({ nowMs: at(9, 22), tzOffsetMin: 540 }).body[0].msgs;
ok(JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(a) !== JSON.stringify(c) && JSON.stringify(a.slice().sort()) === JSON.stringify(c.slice().sort()), '섞기: 같은 날 같은 순서 · 날마다 다른 순서');
ok(E.hdrScreen({ nowMs: at(9), tzOffsetMin: 540 }).rev !== E.hdrScreen({ nowMs: at(11), tzOffsetMin: 540 }).rev, '시간대가 바뀌면 rev 가 바뀐다');
ok(E.hdrScreen({}).ok && E.hdrScreen({ nowMs: NaN, tzOffsetMin: 99999 }).ok, '엉터리 입력도 기본값으로');
// 워커 내장 사본이 같다
{
  const w = fs.readFileSync(path.join(__dirname, '../engine/route-v2-worker.ascii.js'), 'utf8');
  const esc = s => s.replace(/[\u0080-￿]/g, ch => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'));
  const cut = t => t.slice(0, t.indexOf('if (typeof module')).trimEnd();
  const src = esc(cut(fs.readFileSync(path.join(__dirname, '../engine/hdr.js'), 'utf8'))), glue = esc(fs.readFileSync(path.join(__dirname, '../engine/hdr-worker.js'), 'utf8').trimEnd());
  ok(w.includes('// ===== HDR ENGINE BEGIN =====\n' + src + '\n' + glue + '\n// ===== HDR ENGINE END ====='), '워커 내장 사본이 같다');
  ok(w.includes('if (url.pathname === "/screen/hdr") return handleScreenHdr(request);'), '워커 경로 등록');
}
// 워커 끝에서 끝까지
(async () => {
  const tmp = path.join(require('os').tmpdir(), 'rv2_hdr_' + process.pid + '.mjs');
  fs.copyFileSync(path.join(__dirname, '../engine/route-v2-worker.ascii.js'), tmp);
  try {
    const mod = await import(tmp);
    const r = await mod.default.fetch(new Request('https://x/screen/hdr?tz=540&now=' + at(19)), {}, { waitUntil() {} });
    const j = await r.json();
    ok(r.status === 200 && j.ok && j.info.cat === 'evening' && j.body[0].msgs.length >= 50 && /route-v2-2026-10-\d\ds\d\d/.test(j.ver), '워커 응답');
  } catch (e) { fail++; console.log('  FAIL 워커 시험 예외', e && e.stack || e); }
  try { fs.unlinkSync(tmp); } catch (e) { }
  console.log(`hdr_engine: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();

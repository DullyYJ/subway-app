// 엔진 /next-train?op=late — '탑승을 늦게 눌렀다' 판정(지금 분 기준 시각표상 1분 전까지 이미 떠난 차가 있는가). 앱은 이 답만 따른다.
// 실행: node test/next_train_late.test.js
const path = require('path'), fs = require('fs');
const W = require('./helpers/nt_load')();
const { ntCreate, NT_INCHEON_TT, NT_STNORDER } = W;
const bundle = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'tt_bundle.json'), 'utf8'));
const nt = ntCreate({ _REAL_TT: bundle.data._REAL_TT, _GIMPO_TT: bundle.data._GIMPO_TT, _INCHEON_TT: NT_INCHEON_TT, _BUILTIN_TT: bundle.data._BUILTIN_TT, LINE_SCHEDULE: bundle.data.LINE_SCHEDULE, _REAL_SEG: bundle.data._REAL_SEG, _TT_ORDER_HARD: bundle.data._TT_ORDER_HARD, STNORDER: NT_STNORDER });
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
// 평일 아침(2026-10-13 화요일 06:30 KST) — 인천1호선 부평구청 하행: …06:24(384) · 06:29(389) · 06:34(394) …
const baseMs = new Date('2026-10-13T06:30:00+09:00').getTime();
const ask = (atMin, extra) => W.ntAnswer(nt, Object.assign({ op: 'late', line: '인천1호선', from: '부평구청', to: '부평시장', atMin, baseMs }, extra || {}));
const b = ask(390.8);   // 06:30:48 — 06:29 차가 1분 48초 전에 떠남
ok(b.late === 389, '06:30:48 에 눌렀을 때 06:29(389) 차를 인정 ' + JSON.stringify(b));
ok(ask(389.2).late === 389, '06:29:12(출발한 분)에도 인정');
ok(ask(391.5).late === null, '06:31:30 — 06:29 차는 2분 전(분 단위로 2) → 인정 안 함 ' + JSON.stringify(ask(391.5)));
ok(ask(391.5, { back: 2 }).late === 389, 'back=2 면 2분 전까지 인정');
ok(ask(392.5).late === null, '06:32:30 — 06:34 차는 아직 안 왔고 06:29 는 3분 전 → null');
ok(ask(394.1).late === 394, '06:34:06 — 지금 분에 떠난 차');
ok(ask(390.8, { back: 0 }).late === null, 'back=0 이면 지금 분에 떠난 차만 — 06:30 에 출발한 차가 없으므로 null');
ok(ask(390.8).depMin === 389, '응답에 depMin 도 있다');
ok(W.ntAnswer(nt, { op: 'late', line: '인천1호선', from: '부평구청', baseMs }).error, 'atMin 없으면 오류');
console.log('next_train_late: pass', pass, 'fail', fail); process.exit(fail ? 1 : 0);

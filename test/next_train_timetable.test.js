// 엔진 /next-train?op=timetable — 노선도에서 역을 눌렀을 때 보여 줄 역 시간표 (앱은 그리기만, 계산은 엔진)
// 실행: node test/next_train_timetable.test.js
const path = require('path'), fs = require('fs');
const W = require('./helpers/nt_load')();
const { ntCreate, NT_INCHEON_TT, NT_STNORDER } = W;
const bundle = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'tt_bundle.json'), 'utf8'));
const nt = ntCreate({ _REAL_TT: bundle.data._REAL_TT, _GIMPO_TT: bundle.data._GIMPO_TT, _INCHEON_TT: NT_INCHEON_TT, _BUILTIN_TT: bundle.data._BUILTIN_TT, LINE_SCHEDULE: bundle.data.LINE_SCHEDULE, _REAL_SEG: bundle.data._REAL_SEG, _TT_ORDER_HARD: bundle.data._TT_ORDER_HARD, STNORDER: NT_STNORDER });
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const at = (s) => new Date(s).getTime();
const WED = at('2026-10-14T13:00:00+09:00'), SAT = at('2026-10-17T13:00:00+09:00'), SUN = at('2026-10-18T13:00:00+09:00');
const tt = (line, from, baseMs, extra) => W.ntAnswer(nt, Object.assign({ op: 'timetable', line, from, baseMs }, extra || {}));

// 1) 기본 모양 — 서울 1~9호선
const a = tt('1호선', '서울역', WED);
ok(!a.error && a.line === '1호선' && a.stn === '서울역', JSON.stringify(a).slice(0, 80));
ok(a.dayCode === 'DAY' && a.today === 'DAY' && a.nowMin === 13 * 60, '수요일 13:00 → 평일, nowMin 780: ' + a.dayCode + ' ' + a.nowMin);
ok(a.dirs.length === 2 && a.dirs.map(d => d.dk).join() === '상,하' && !a.noData, '두 방향');
for (const d of a.dirs) {
  ok(d.times.length > 100 && d.times.every((t, i) => i === 0 || t >= d.times[i - 1]), d.dk + ' 시각은 오름차순 ' + d.times.length);
  ok(d.first === d.times[0] && d.last === d.times[d.times.length - 1], d.dk + ' 첫차·막차');
  ok(d.first >= 270 && d.first <= 420, d.dk + ' 첫차는 새벽 5~7시: ' + d.first);
  ok(d.last >= 1380, d.dk + ' 막차는 밤 11시 이후(자정 넘으면 1440+): ' + d.last);
  ok(d.nextMin >= 780 && d.tomorrow === false && d.nextMin === d.times.find(t => t >= 780), d.dk + ' 다음 열차 = 13:00 이후 첫 열차 ' + d.nextMin);
}
ok(a.dirs[0].toward && a.dirs[1].toward && a.dirs[0].toward !== a.dirs[1].toward, '방향 이름이 서로 다르다: ' + a.dirs.map(d => d.toward));

// 2) 날짜 구분 — 평일/토·일 두 갈래(토요일 자료가 없는 노선)
ok(a.days.map(d => d.code).join() === 'DAY,SUN' && a.days[1].label === '토·일·공휴일', JSON.stringify(a.days));
const sat = tt('1호선', '서울역', SAT);
ok(sat.dayCode === 'SUN' && sat.today === 'SUN', '토요일은 자료가 없어 휴일 시각표(SUN)로: ' + sat.dayCode);
const sun = tt('1호선', '서울역', SUN);
ok(sun.dayCode === 'SUN' && sun.dirs[0].times.length < a.dirs[0].times.length, '휴일은 평일보다 운행 횟수가 적다 ' + sun.dirs[0].times.length + ' < ' + a.dirs[0].times.length);
const wdOnSun = tt('1호선', '서울역', SUN, { day: 'DAY' });
ok(wdOnSun.dayCode === 'DAY' && wdOnSun.today === 'SUN' && wdOnSun.dirs[0].times.length === a.dirs[0].times.length, '일요일에 평일 탭을 누르면 평일 시각표');
ok(wdOnSun.dirs[0].nextMin === null, '오늘이 아닌 날 표에는 "다음 열차" 표시를 하지 않는다');
const wdAsSat = tt('1호선', '서울역', WED, { day: 'SAT' });
ok(wdAsSat.dayCode === 'SUN', 'SAT 요청도 토요일 자료가 없으면 SUN');
const bad = tt('1호선', '서울역', WED, { day: '엉뚱' });
ok(bad.dayCode === 'DAY', '모르는 day 값은 오늘 기준');

// 3) 공휴일 — 2026-10-09 한글날(금요일)은 휴일 시각표
const hol = tt('1호선', '서울역', at('2026-10-09T13:00:00+09:00'));
ok(hol.dayCode === 'SUN' && hol.today === 'SUN', '한글날(금)은 휴일 시각표: ' + hol.dayCode);

// 4) 막차 이후 → 내일 첫차
const late = tt('1호선', '서울역', at('2026-10-14T23:50:00+09:00'));
const dl = late.dirs[0];
ok(dl.nextMin === null || dl.tomorrow === true || dl.nextMin >= 1430, '23:50 이후: 남은 막차 또는 내일 첫차 ' + dl.nextMin + ' ' + dl.tomorrow);
const after = tt('1호선', '서울역', at('2026-10-15T01:45:00+09:00'));   // 자정 넘은 새벽: 전날 영업일의 1440+ 열차까지 본다
const da = after.dirs.find(d => d.last >= 1440);
ok(!da || da.tomorrow === true || da.nextMin >= 1440, '새벽 1:45 에는 전날 영업일 막차(1440+) 또는 내일 첫차: ' + (da && da.nextMin));
const early = tt('1호선', '서울역', at('2026-10-14T04:30:00+09:00'));
ok(early.dirs[0].nextMin === early.dirs[0].first && early.dirs[0].tomorrow === false, '04:30 → 오늘 첫차');

// 5) 인천·김포 / 시각표 없는 노선
const inc = tt('인천1호선', '부평구청', WED);
ok(!inc.noData && inc.dirs.length === 2 && inc.dirs[0].times.length > 100, '인천1호선 부평구청: ' + inc.dirs.map(d => d.times.length));
const gm = tt('김포골드라인', '양촌', WED);
ok(!gm.noData && gm.dirs.length >= 1, '김포골드라인 양촌');
const none = tt('신분당선', '강남', WED);
ok(none.noData === true && none.dirs.length === 0, '시각표 자료 없는 노선은 비워서 돌려준다(지어내지 않음)');
const unk = tt('1호선', '없는역', WED);
ok(unk.noData === true && unk.dirs.length === 0, '없는 역');
ok(tt('', '서울역', WED).error && tt('1호선', '', WED).error, '인자 없으면 오류');

// 6) 종점 — 한쪽 방향만
const ends = bundle.data._REAL_TT;
let oneWay = 0, checked = 0;
Object.keys(ends).forEach(k => { const [l, s] = k.split('|'); const r = nt.timetable({ line: l, from: s, baseMs: WED, day: 'DAY' }); checked++; if (r.dirs.length === 1) oneWay++; ok(r.dirs.every(d => d.times.length > 0), k + ' 빈 방향 없음'); });
ok(checked > 400 && oneWay >= 5, '종점은 한 방향만: ' + oneWay + '/' + checked);

// 7) 방향 이름 일관성: 이름이 붙으면 두 방향이 서로 다르고, 2호선(순환)은 붙이지 않는다
let namedBad = 0;
Object.keys(ends).forEach(k => { const [l, s] = k.split('|'); const r = nt.timetable({ line: l, from: s, baseMs: WED }); if (r.dirs.length === 2 && r.dirs[0].toward && r.dirs[0].toward === r.dirs[1].toward) namedBad++; if (l === '2호선' && r.dirs.some(d => d.toward)) namedBad++; });
ok(namedBad === 0, '같은 이름 두 방향/2호선 이름 붙임 ' + namedBad);

// 8) 앱의 기존 계산과 일치 — boardTimes / boardTable 과 같은 시각배열·다음 열차
const bt = nt.boardTimes({ line: '1호선', from: '서울역', to: '남영', baseMs: WED });
const mine = a.dirs.find(d => d.dk === bt.dk);
ok(mine && JSON.stringify(mine.times) === JSON.stringify(bt.times), '다음 역(남영) 방향의 시각배열이 boardTimes 와 같다');
const bd = nt.boardTable({ line: '1호선', from: '서울역', to: '남영', atMin: 780, baseMs: WED });
ok(mine && mine.nextMin === bd.depMin, '다음 열차가 boardTable 과 같다 ' + (mine && mine.nextMin) + ' vs ' + bd.depMin);

// 9) 조용한 입력: 응답은 JSON 직렬화 가능
ok(JSON.parse(JSON.stringify(a)).dirs[0].times.length === a.dirs[0].times.length, '직렬화');
console.log('next_train_timetable: pass', pass, 'fail', fail); process.exit(fail ? 1 : 0);

// 실시간소통 화면 엔진(engine/chat.js) 시험.  실행: node test/chat_engine.test.js   (javac · java 필요)
//  ① cap 6 미만이면 만들지 않는다 ② 노선 목록·시각·'N분 전'이 웹과 같다 ③ 칩 순서·색·내 노선 ④ 공식 공지/지연 제보 배너 ⑤ 말풍선(전체 방·노선 방) ⑥ 빈/불러오는/실패 상태 ⑦ 아래 입력줄·anchor
//  ⑧ 앱 검증기 통과 ⑨ 워커 내장 ⑩ 워커 끝에서 끝까지
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm');
const E = require('../engine/chat'), screenCheck = require('./helpers/screen_check');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  FAIL', m); } }
const R = p => path.join(__dirname, '..', p);
const html = fs.readFileSync(R('ios-reference/index.html'), 'utf8');
const NOW = Date.UTC(2026, 9, 18, 3, 0, 0), MIN = 60000, HR = 3600000;

// ── ② 웹 대조 ──
{
  const grab = (re, label) => { const m = re.exec(html); ok(!!m, '웹에서 찾았다: ' + label); return m ? m[0] : ''; };
  const src = grab(/var _LR_COMMON = \[[^\]]*\];/, '_LR_COMMON') + '\n' + grab(/var _LR_KNOWN = [^;]*;/, '_LR_KNOWN') + '\n' + grab(/function _offAgo\(ts\)\{[^\n]*\}/, '_offAgo');
  const ctx = { Date, Math, console }; vm.createContext(ctx);
  vm.runInContext(src + ';this.W={known:_LR_KNOWN,common:_LR_COMMON,ago:_offAgo}', ctx);
  ok(JSON.stringify(ctx.W.known) === JSON.stringify(E.CHT_KNOWN), '노선 목록이 웹 _LR_KNOWN 과 같다');
  // 웹 _offAgo 는 Date.now() 를 쓴다 → 같은 기준 시각으로 대조
  const real = Date.now; Date.now = () => NOW;
  try {
    [0, 20e3, 61e3, 5 * MIN, 59 * MIN, 61 * MIN, 5 * HR, 23 * HR].forEach(d => {
      const el = E.chtOfficial('2호선', { offOk: 1, off: { text: '운행 지연', ts: NOW - d } }, NOW).s;
      ok(el.indexOf('(' + ctx.W.ago(NOW - d) + ')') >= 0, '지난 시간 문구가 웹 _offAgo 와 같다: ' + d);
    });
  } finally { Date.now = real; }
  const lt = grab(/function _lrTime\(ts\)\{[^\n]*\}/, '_lrTime');
  [Date.UTC(2026, 9, 18, 0, 5), Date.UTC(2026, 9, 18, 14, 59), Date.UTC(2026, 9, 18, 23, 59, 59)].forEach(ts => {
    const c2 = { Date }; vm.createContext(c2); vm.runInContext(lt + ';this.t=_lrTime', c2);
    [-540, 0, 300].forEach(tzo => {
      // 웹 _lrTime 은 기기 시간대(getHours)로 그린다 → 같은 tzo 를 흉내 내는 Date 로 대조
      const D = class extends Date { getHours() { return new Date(this.getTime() - tzo * 60000).getUTCHours(); } getMinutes() { return new Date(this.getTime() - tzo * 60000).getUTCMinutes(); } };
      const c3 = { Date: D }; vm.createContext(c3); vm.runInContext(lt + ';this.t=_lrTime', c3);
      ok(c3.t(ts) === E.chtTime(ts, tzo), '시각 문구 같음 tzo=' + tzo + ' ' + ts);
    });
  });
}
const G = [['빨간모자', '안녕하세요', NOW - 5 * MIN, 0, '2호선'], ['나', '내 글', NOW - 4 * MIN, 1, ''], ['', '닉 없는 글', NOW - 6 * MIN, 0, ''], ['x', '', NOW, 0, ''], '이상한 줄'];
const Rm = [['m1', NOW - 5 * MIN, '출근러', '지금 지연이에요', 'delay'], ['m2', NOW - 3 * MIN, '나', '저도요', ''], ['m3', NOW - 9 * MIN, '혼잡러', '사람 많아요', 'crowd'], ['m4', NOW - 2 * MIN, '숨김', '숨길 글', ''], ['m5', NOW, 'x', '', '']];
const base = { sel: 'all', mine: ['2호선', '9호선'], lc: { '2호선': '#00a84d', '9호선': '#bdb092', '1호선': 'bad' }, tzo: -540, me: '나', hid: ['m4'] };
const chat = (f, d) => E.chatScreen({ cap: 6, now: NOW }, Object.assign({}, base, f), d);

// s273: 순환표(sw.t · sw.k) — 칸마다의 다음·이전이 칩 순서와 같고, 이 화면의 l·r 과 같은 표에서 나온다(앱은 '고른 칸'으로 찾아보기만 한다)
function swTableOk(S, chips, m) {
  const n = chips.length, t = S.sw && S.sw.t, on = chips.find(c => c.on);
  ok(!!t && Object.keys(t).length === n && S.sw.k === on.act.v, m + ': 표 크기 · 이 화면의 칸(k)');
  ok(chips.every((c, i) => t[c.act.v] && t[c.act.v].l.v === chips[(i + 1) % n].act.v && t[c.act.v].r.v === chips[(i - 1 + n) % n].act.v && t[c.act.v].l.a === 'cat'), m + ': 칸마다 왼쪽 = 다음 · 오른쪽 = 이전(끝없이 돈다)');
  ok(S.sw.l.v === t[S.sw.k].l.v && S.sw.r.v === t[S.sw.k].r.v, m + ': l·r 은 표의 k 칸과 같다');
  // 다음 칸 화면이 오기 전에 계속 밀어도 한 바퀴 돌아 제자리
  let k = S.sw.k; for (let i = 0; i < n; i++) k = t[k].l.v; ok(k === S.sw.k, m + ': 왼쪽으로 n 번 = 제자리');
}
// ── s241 좌우 밀기(sw): 호선 칩을 끝없이 돈다 — 마지막 호선에서 왼쪽으로 밀면 전체, 전체에서 오른쪽으로 밀면 마지막 호선 ──
{
  const labels = c => c.head.find(n => n.t === 'chips').items;
  const all0 = chat({ sel: 'all' }, {}), its = labels(all0), last = its[its.length - 1];
  ok(all0.sw && all0.sw.l.v === its[1].act.v && all0.sw.r.v === last.act.v && all0.sw.r.a === 'cat', 'sw: 전체에서 왼쪽 = 다음 칩 · 오른쪽 = 마지막 호선으로 돈다');
  const lastSel = chat({ sel: last.act.v }, {});
  ok(lastSel.sw.l.v === 'all' && lastSel.sw.r.v === its[its.length - 2].act.v, 'sw: 마지막 호선(' + last.act.v + ')에서 왼쪽으로 밀면 전체');
  ok(!lastSel.sw.lh && !lastSel.sw.rh && !('lc' in lastSel.sw), 'sw: 본문 쪽 행동(머리 탭 아님)');
  swTableOk(all0, its, 'chat 전체'); swTableOk(lastSel, labels(lastSel), 'chat 마지막 호선');
}

// ── ① ③ ──
ok(E.chatScreen({ cap: 5, now: NOW }, base, {}).ok === false && E.chatScreen({}, base, {}).ok === false && E.chatScreen(null, null, null).ok === false, 'cap 6 미만이면 만들지 않는다');
{
  const s = chat({}, { g: G });
  ok(s.ok && s.v === 1 && s.screen === 'chat' && s.cover === 'tab' && s.anchor === 'bottom' && /^c3:/.test(s.rev), '기본 모양 · anchor bottom');
  const chips = s.head[0].items;
  ok(chips.map(c => c.label).slice(0, 4).join() === '전체,📍 2호선,📍 9호선,1호선' && chips.length === 1 + E.CHT_KNOWN.length, '칩 순서: 전체 → 내 노선 → 나머지(웹 _chatItems)');
  ok(chips[0].on && chips.filter(c => c.on).length === 1 && chips[0].act.a === 'cat' && chips[0].act.v === 'all' && chips[1].act.v === '2호선', '고른 칩 · 행동 cat');
  ok(chips[1].c === '#00a84d' && chips[0].c === undefined && /^#[0-9a-f]{6}$/i.test(chips[3].c), '노선 색은 올바른 #rrggbb 만(앱이 안 준 노선은 엔진 기본 색)');
  ok(s.head.length === 2 && s.head[1].t === 'divider' && !s.head.some(h => h.t === 'text'), '내 노선이 있으면 안내 글 없음(머리 구분선만)');
  ok(chat({ mine: [] }, { g: G }).head[1].s === '📍 내가 탄 노선은 앞에 표시돼요', '내 노선이 없으면 안내 글');
  ok(chat({ mine: ['2호선', '2호선', '없는선', '9호선'] }, {}).head[0].items.length === chips.length, '중복·모르는 노선은 무시');
  ok(chat({ sel: '없는방' }, {}).info.sel === 'all', '모르는 방은 전체');
  // 내 노선이 아닌 방을 열면 그 칩이 켜진다
  const r5 = chat({ sel: '5호선' }, { r: [] });
  ok(r5.head[0].items.find(c => c.on).label === '5호선', '내 노선이 아닌 방 칩도 켜진다');
}
// ── ⑤ 말풍선 ──
{
  const s = chat({}, { g: G }), m = s.body.filter(n => n.t === 'msg');
  ok(m.length === 3 && s.info.n === 3, '전체 방: 빈 글·이상한 줄 제외 ' + m.length);
  ok(m[0].s === '닉 없는 글' && m[0].nick === '익명' && m[1].nick === '빨간모자' && m[1].pre === undefined && m[2].mine === true && m[2].nick === undefined, '시간순 · 닉 없으면 익명 · 전체 방에선 (노선) 접두를 달지 않는다(YJ 10-29) · 내 글');
{   // 2026-10-29 (YJ): 아이디는 호선마다 다르고(겹치지 않음) · 같은 호선 안에선 사람마다 다르며 같은 사람은 늘 같고 · 직접 정한 아이디는 그대로
  const L = E.CHT_KNOWN, P = E.CHT_PERSONAS, seen = new Map(); let dupe = '', stable = true, inLine = true, len = true;
  for (const ln of L) { const inL = new Set(); for (const p of P) { const d = E.chtLineNick(ln, p); if (seen.has(d)) dupe = d + ' (' + seen.get(d) + ' / ' + ln + ')'; seen.set(d, ln); if (inL.has(d)) inLine = false; inL.add(d); if (E.chtLineNick(ln, p) !== d) stable = false; if (d.length < 3 || d.length > 16 || d === p) len = false; } }
  ok(!dupe && inLine && seen.size === L.length * P.length, '아이디: ' + L.length + '개 호선 × ' + P.length + '명 = ' + seen.size + '개가 하나도 겹치지 않는다 ' + dupe);
  ok(stable && len, '아이디: 같은 호선·같은 사람은 늘 같은 아이디 · 길이 3~16 · 옛 공용 이름이 남지 않는다');
  ok(E.chtLineNick('2호선', '빨간모자') === '빨간모자' && E.chtLineNick('', '지하철폐인') === '지하철폐인' && E.chtLineNick('없는선', '지하철폐인') === '지하철폐인', '아이디: 이용자가 직접 정한 이름·알 수 없는 노선은 그대로');
  const gm = chat({ sel: 'all' }, { g: [['지하철폐인', 'a', NOW - 3 * MIN, 0, '2호선'], ['지하철폐인', 'b', NOW - 2 * MIN, 0, '7호선'], ['신입사원1일차', 'c', NOW - 1 * MIN, 0, '3호선'], ['신입사원1일차', 'd', NOW, 0, '2호선']] }).body.filter(x => x.t === 'msg');
  ok(gm.length === 4 && gm.every(x => x.pre === undefined) && gm[0].nick !== gm[1].nick && gm[2].nick !== gm[3].nick && gm[0].nick === E.chtLineNick('2호선', '지하철폐인') && gm.every(x => x.nick !== '지하철폐인' && x.nick !== '신입사원1일차'), '전체 방: 같은 사람이 다른 호선에서 말해도 아이디가 다르고, 호선 접두는 없다');
  const rm = chat({ sel: '2호선', me: '나' }, { r: [['q1', NOW - 3 * MIN, '지하철폐인', '가', ''], ['q2', NOW - 2 * MIN, '신입사원1일차', '나', ''], ['q3', NOW - 1 * MIN, '지하철폐인', '다', ''], ['q4', NOW, '나', '내글', '']] }).body.filter(x => x.t === 'msg');
  ok(rm.length === 4 && rm[0].nick === rm[2].nick && rm[0].nick !== rm[1].nick && rm[0].nick === E.chtLineNick('2호선', '지하철폐인') && rm[3].mine === true && rm[3].nick === undefined, '호선 방: 같은 사람은 같은 아이디, 다른 사람은 다른 아이디, 내 글은 그대로 · 전체 방과 같은 이름');
}
  ok(m[1].time === '11:55' && m[2].time === '11:56', '시각: 기기 시간대(tzo=-540 → KST) ' + m[1].time);
  ok(m.every(x => x.act === undefined), '전체 방 글에는 신고 없음');
  ok(s.body[0].t === 'spacer' && s.body[s.body.length - 1].t === 'spacer', '위아래 여백');
  const rs = chat({ sel: '2호선' }, { r: Rm }), rm = rs.body.filter(n => n.t === 'msg');
  ok(rm.length === 3 && rs.info.n === 3 && rm.map(x => x.s).join() === '사람 많아요,지금 지연이에요,저도요', '노선 방: 숨긴 글·빈 글 제외 · 시간순');
  ok(rm[0].badge === '혼잡' && rm[0].bc === '#ff9f0a' && rm[1].badge === '지연' && rm[1].bc === '#ff453a' && rm[2].badge === undefined, '지연/혼잡 딱지');
  ok(rm[1].go === '신고' && rm[1].act.v === 'ch.x.0' && rm[0].act.v === 'ch.x.2' && rm[2].mine && rm[2].act === undefined && rm[2].go === undefined, '신고 단추: 남의 글만 · 번호 = 보낸 배열의 원래 위치');
  ok(rm[1].act.id && rm[0].act.id && rm[1].act.id !== rm[0].act.id && rm[2].act === undefined, '신고 단추에 글 고유 id');
  const many = []; for (let i = 0; i < 400; i++) many.push(['n' + i, NOW - (400 - i) * MIN, '닉', '글 ' + i, '']);
  const ml = chat({ sel: '2호선' }, { r: many }).body.filter(n => n.t === 'msg');
  ok(ml.length === 150 && ml[ml.length - 1].s === '글 399', '노선 방은 최근 150개');
  const mg = []; for (let i = 0; i < 400; i++) mg.push(['닉', '글 ' + i, NOW - (400 - i) * MIN, 0, '']);
  const gl = chat({}, { g: mg }).body.filter(n => n.t === 'msg');
  ok(gl.length === 120 && gl[gl.length - 1].s === '글 399', '전체 방은 최근 120개');
}
// ── ④ 배너 ──
{
  const head = (line, d) => chat({ sel: line }, Object.assign({ r: [] }, d)).head.filter(n => n.t === 'box');
  ok(head('2호선', { offOk: 0 }).length === 0, '공지 조회가 안 됐으면 배너 없음');
  const ok2 = head('2호선', { offOk: 1, off: null, offAt: NOW - 3 * MIN })[0];
  ok(ok2.s === '2호선 정상 운행 중입니다 (3분 전 확인)' && JSON.stringify(ok2.hl) === '[[0,14]]' && /142,142,147/.test(ok2.fill), '1~8호선 공지 없음: 정상 운행 중(회색) ' + ok2.s);
  ok(head('경의중앙선', { offOk: 1 })[0].s.startsWith('경의중앙선은(는) 서울교통공사 환승역 관련 공지만 가끔'), '경의중앙선 문구');
  ok(head('신분당선', { offOk: 1 })[0].s === '신분당선은(는) 공식 공지 연동 전이에요 · 아래 이용자 제보로 알려 드려요', '연동 전 노선 문구');
  ok(head('인천1호선', { offOk: 1 }).length === 0 || /연동 전/.test(head('인천1호선', { offOk: 1 })[0].s), '인천1호선');
  const off = head('2호선', { offOk: 1, off: { text: '2호선 신도림역 열차 지연\n  안내', ts: NOW - 10 * MIN } })[0];
  ok(off.s === '서울교통공사 공지 · 2호선 신도림역 열차 지연 안내 (10분 전)' && JSON.stringify(off.hl) === '[[0,9]]' && /10,132,255/.test(off.fill), '공식 공지(파랑): 노선명이 이미 있으면 안 붙임 ' + off.s);
  ok(head('3호선', { offOk: 1, off: { text: '신사역 정차', ts: NOW } })[0].s === '서울교통공사 공지 · 3호선 — 신사역 정차 (방금)', '노선명이 없으면 붙임');
  const long = head('2호선', { offOk: 1, off: { text: '가나다라 '.repeat(60), ts: NOW } })[0];
  ok(long.s.length < 140 && /…/.test(long.s), '긴 공지는 줄임');
  const est = head('2호선', { offOk: 1, off: { estimated: true, suspect: true, text: '배차 간격 길어짐', ts: NOW - 2 * MIN } })[0];
  ok(est.s === '2호선 지연 의심 (도착 간격 기준 추정) · 배차 간격 길어짐 (2분 전 · 공식 공지 아님)' && /255,159,10/.test(est.fill), '추정 지연 의심(주황)');
  const est2 = head('2호선', { offOk: 1, off: { estimated: true, text: '', ts: NOW } })[0];
  ok(est2.s === '2호선 정상 운행 중으로 보여요 (도착 간격 기준) (방금)' && /142,142,147/.test(est2.fill), '추정 정상(회색)');
  const al = head('2호선', { offOk: 0, al: { reporters: 2, stations: [{ stn: '강남', n: 2 }] } });
  ok(al.length === 1 && al[0].s === '지연 제보가 있어요 · 최근 30분 2명 (강남 2명) — 아직 확인 중이에요' && /255,159,10/.test(al[0].fill), '지연 제보(2명): 주황');
  const al3 = head('2호선', { offOk: 0, al: { reporters: 5, stations: [] } })[0];
  ok(al3.s === '지연 제보가 모이고 있어요 · 최근 30분 5명' && /255,69,58/.test(al3.fill), '지연 제보(3명 이상): 빨강');
  ok(head('2호선', { offOk: 0, al: { reporters: 0 } }).length === 0, '제보 0명이면 배너 없음');
  ok(chat({}, { g: G, offOk: 1, off: { text: 'x', ts: NOW }, al: { reporters: 9 } }).head.filter(n => n.t === 'box').length === 0, '전체 방에는 배너 없음');
  const all = [...head('2호선', { offOk: 1, off: { text: '가', ts: NOW } }), ...head('2호선', { offOk: 1, off: { estimated: true, suspect: true, text: '나', ts: NOW } })];
  ok(all.every(b => !/[\u{1F300}-\u{1FAFF}☀-➿]/u.test(b.s)), '배너에 이모지가 없다');
}
// ── ⑥ 상태 글 ──
{
  const t = (f, d) => chat(f, d).body.map(n => n.s || '').filter(Boolean).join('|');
  ok(t({}, { g: [] }) === '대화를 불러오는 중...' && t({ st: 'fail' }, {}) === '연결이 불안정해요. 잠시 후 다시 불러올게요.', '전체 방: 불러오는 중 · 실패');
  ok(t({ sel: '2호선' }, { r: [] }) === '아직 2호선 방에 글이 없어요.\n첫 글을 남겨보세요! 지금 타고 계신다면 한마디 어때요?' && t({ sel: '2호선', st: 'loading' }, {}) === '불러오는 중…' && t({ sel: '2호선', st: 'fail' }, {}) === '연결이 불안정해요. 잠시 후 다시 불러올게요.', '노선 방: 빈 방 · 불러오는 중 · 실패');
  ok(t({}, null) === '대화를 불러오는 중...', 'data 없어도 안 죽는다');
}
// ── ⑦ 아래 입력줄 ──
{
  const a = chat({}, {}).foot[1], r = chat({ sel: '2호선' }, {}).foot[1];
  ok(chat({}, {}).foot[0].t === 'divider' && a.bh === 38 && a.inh === 37 && a.bicon.length > 10, '입력줄: 위 구분선 · 입력 37 + 동그라미 보내기 38');
  ok(a.t === 'inbar' && a.key === 'chat.all' && a.btn === '전송' && a.act.v === 'ch.send' && a.hint === '메시지를 입력하세요...' && a.maxlen === 200, '전체 방 입력줄');
  ok(r.key === 'chat.room' && r.act.v === 'ch.send' && r.maxlen === 120 && /한마디/.test(r.hint), '노선 방 입력줄');
  ok(chat({}, { g: G }).rev !== chat({ sel: '2호선' }, { g: G }).rev && chat({}, { g: G }).rev === chat({}, { g: G }).rev, '같은 입력 → 같은 rev');
}
// ── ⑧ 앱 검증기 ──
{
  const sc = [chat({}, { g: G }), chat({ sel: '2호선' }, { r: Rm, offOk: 1, off: { text: '지연', ts: NOW }, al: { reporters: 4, stations: [{ stn: '강남', n: 4 }] } }), chat({}, {}), chat({ sel: '9호선', st: 'fail' }, {})];
  const mg = []; for (let i = 0; i < 400; i++) mg.push(['긴닉네임' + i, '아주 긴 대화 '.repeat(25) + i, NOW - (400 - i) * MIN, i % 7 === 0 ? 1 : 0, i % 3 ? '2호선' : '']);
  sc.push(chat({}, { g: mg }));
  const r = screenCheck(sc);
  ok(!r.err && r.out.length === sc.length && r.out.every(l => l.startsWith('OK ')), '모든 화면이 앱 검증기를 통과 ' + (r.err || r.out.filter(l => !l.startsWith('OK ')).slice(0, 3).join('|')));
  ok(r.out.every(l => Number(l.split(' ')[2]) === 0), '건너뛴 노드 없음');
}
// ── ⑨ 워커 내장 ──
{
  const w = fs.readFileSync(R('engine/route-v2-worker.ascii.js'), 'utf8');
  const ms = '// ===== CHAT ENGINE BEGIN =====', me = '// ===== CHAT ENGINE END =====', i = w.indexOf(ms), j = w.indexOf(me);
  ok(i > 0 && j > i, '워커에 실시간소통 엔진이 내장돼 있다');
  const esc = t => t.replace(/[\u0080-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  let src = fs.readFileSync(R('engine/chat.js'), 'utf8'); src = src.slice(0, src.indexOf('if (typeof module')).trimEnd();
  const body = w.slice(i + ms.length, j);
  ok(body.indexOf(esc(src)) >= 0 && body.indexOf(esc(fs.readFileSync(R('engine/chat-worker.js'), 'utf8').trimEnd())) >= 0, '워커 내장 사본이 소스와 같다');
  ok(w.indexOf('if (url.pathname === "/screen/chat") return handleScreenChat(request);') > 0, '경로 등록');
  ok(!/[^\x00-\x7f]/.test(body), '내장 블록은 ASCII 만');
  const other = w.slice(0, i) + w.slice(j);
  const names = [...src.matchAll(/^(?:function|var)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]).concat(['handleScreenChat']);
  ok(names.every(n => !new RegExp('^(async\\s+)?(function|var)\\s+' + n + '\\b', 'm').test(other)), '다른 엔진과 이름이 겹치지 않는다 (' + names.length + '개)');
}
// ── ⑩ 워커 끝에서 끝까지 ──
// ── ⑪ s67: 한 요청으로 여러 방 화면(alts) ──
{
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const R2 = [['m1', NOW - 5 * MIN, '남', '안녕', ''], ['m2', NOW - 4 * MIN, '나', '내 글', ''], ['m3', NOW - 3 * MIN, '철수', '지연돼요', 'delay']];
  const rooms = { '2호선': { f: Object.assign({}, base, { sel: '2호선', st: 'ready' }), d: { r: R2, off: null, offOk: 1, offAt: 0, al: null } },
                  '9호선': { f: Object.assign({}, base, { sel: '9호선', st: 'loading' }), d: { r: [], off: null, offOk: 0, offAt: 0, al: null } },
                  all: { f: Object.assign({}, base, { sel: 'all' }), d: { g: G } } };
  const out = E.chatScreens({ cap: 6, now: NOW }, Object.assign({}, base, { sel: '1호선', st: 'ready' }), { r: [] }, rooms);
  ok(out.ok && Object.keys(out.alts).join() === '2호선,9호선,all', 'alts: 앱이 보낸 방 키 그대로');
  Object.keys(rooms).forEach(k => ok(same(out.alts[k], E.chatScreen({ cap: 6, now: NOW }, rooms[k].f, rooms[k].d)), 'alts[' + k + '] = 그 방으로 따로 요청한 화면과 글자 하나까지 같다'));
  ok(out.alts['2호선'].info.sel === '2호선' && out.alts['9호선'].body.some(x => /불러오는 중/.test(x.s || '')), '방마다 자기 방 화면(자료가 없는 방은 불러오는 중)');
  ok(E.chatScreens({ cap: 6, now: NOW }, base, { g: G }).alts === undefined, 'alts 를 달라고 하지 않으면 없다');
  // s274: 앱이 방 하나하나를 한 요청에 모아 보낼 때 노선 방 항목에는 전체 방 줄(g)을 싣지 않는다 — 노선 방 화면은 g 를 쓰지 않으므로 있든 없든 글자 하나까지 같다
  ok(same(E.chatScreen({ cap: 6, now: NOW }, rooms['2호선'].f, Object.assign({}, rooms['2호선'].d, { g: G })), E.chatScreen({ cap: 6, now: NOW }, rooms['2호선'].f, Object.assign({}, rooms['2호선'].d, { g: [] }))), '노선 방 화면은 전체 방 줄(g)과 무관');
  const many = {}; for (let i = 0; i < 60; i++) many['k' + i] = { f: base, d: { g: G } };
  ok(Object.keys(E.chatScreens({ cap: 6, now: NOW }, base, { g: G }, many).alts).length === 24, 'alts 개수 상한 24');
  const ex = E.chatScreens({ cap: 6, now: NOW }, base, { g: G }, { a: 3, b: { f: base, d: { g: G } } });
  ok(Object.keys(ex.alts).join() === 'b', '이상한 alts 항목은 건너뜀');
}

// ── 내 노선(웹 _routeSubLines + _myLinesList) · 기본 노선 색 · 글 붙일 노선 ──
{
  const ml = E.chtMineLines;
  ok(JSON.stringify(ml(['수도권1호선', '수도권 2호선', '신분당선', '수도권1호선'], [])) === JSON.stringify(['1호선', '2호선', '신분당선']), '경로 노선: 이름 속 노선을 찾고 순서대로 · 중복 한 번');
  ok(JSON.stringify(ml(['2호선'], [{ l: '1호선', n: 5, t: 1 }, { l: '9호선', n: 5, t: 9 }, { l: '2호선', n: 9, t: 1 }])) === JSON.stringify(['2호선']), 's318: 탄 기록은 칩 순서에 끼지 않는다(경로가 끝나면 호선 순서 원래대로)');
  ok(ml(null, null).length === 0 && ml(['x'], 'zz').length === 0, '엉터리 입력은 빈 목록');
  ok(ml(['1호선', '2호선', '3호선', '4호선', '5호선', '6호선', '7호선', '8호선', '9호선', '신분당선'], []).length === 8, '최대 8개');
  const o = E.chatScreen({ cap: 6, now: 1 }, { sel: 'all', sec: ['수도권 4호선'], my: [{ l: '2호선', n: 3, t: 1 }], th: 'pastel' }, {});
  const chips = o.head.find(n => n.t === 'chips').items;
  ok(chips[1].label === '📍 4호선' && chips[2].label === '1호선' && /^#/.test(chips[1].c), '칩: 지금 경로 노선만 앞 · 탄 기록은 앞에 두지 않는다 · 노선 색 기본값 ' + chips[1].c);
  {                                                                // s318: 탑승 중 지금 타는 노선부터 남은 노선만 앞에 · 끝나면 원래 순서
    const nodes = [{ isOrigin: true }, { isSub: true, lineName: '1호선', name: 'a' }, { isSub: true, lineName: '1호선', name: 'b' }, { isSub: true, lineName: '2호선', name: 'c' }, { isSub: true, lineName: '2호선', name: 'd' }, { isSub: true, lineName: '3호선', name: 'e' }, { isSub: true, lineName: '3호선', name: 'f' }];
    const sec = ['수도권1호선', '수도권2호선', '수도권3호선'], R = h => ({ here: h, boarded: true, nodes });
    const j = x => JSON.stringify(x);
    ok(j(ml(sec, [], R(1))) === j(['1호선', '2호선', '3호선']) && j(ml(sec, [], R(2))) === j(['1호선', '2호선', '3호선']), '1호선 타는 동안 1·2·3호선');
    ok(j(ml(sec, [], R(3))) === j(['2호선', '3호선']) && j(ml(sec, [], R(4))) === j(['2호선', '3호선']), '2호선으로 갈아타면 2·3호선');
    ok(j(ml(sec, [], R(5))) === j(['3호선']) && j(ml(sec, [], R(6))) === j(['3호선']), '3호선이면 3호선만');
    ok(j(ml(sec, [], R(0))) === j(['1호선', '2호선', '3호선']) && j(ml(sec, [], { here: 'x', nodes })) === j(['1호선', '2호선', '3호선']), '타기 전(0)·엉터리 here 는 전부');
    ok(j(ml([], [], R(5))) === '[]' && j(ml(null, [], R(5))) === '[]', '경로가 없으면(안내 종료) 탑승 정보가 와도 비어 — 원래 호선 순서');
    ok(j(ml(sec, [], { here: 3, nodes: 'zz' })) === j(['1호선', '2호선', '3호선']) && j(ml(sec, [], { here: 99, nodes })) === j(['1호선', '2호선', '3호선']), '엉터리 탑승 정보는 경로 순서 그대로');
    const items = E.chatScreen({ cap: 6, now: 1 }, { sel: 'all', sec, ride: R(5), th: 'pastel' }, {}).head.find(n => n.t === 'chips').items.map(x => x.label);
    ok(items[1] === '📍 3호선' && items[2] === '1호선' && items.indexOf('📍 2호선') < 0, '칩 줄: 3호선만 앞 · 나머지는 원래 순서(' + items.slice(0, 5).join(',') + ')');
    const none = E.chatScreen({ cap: 6, now: 1 }, { sel: 'all', sec: [], ride: R(5), my: [{ l: '인천1호선', n: 9, t: 1 }], th: 'pastel' }, {}).head.find(n => n.t === 'chips').items.map(x => x.label);
    ok(none[1] === '1호선' && none.every(x => x.indexOf('📍') < 0), '경로 종료 뒤: 앞에 붙은 호선이 없다(탄 기록이 있어도)');
  }
  ok(o.info.pl === '2호선', '글을 붙일 노선은 많이 탄 노선(경로와 무관)');
  const dk = E.chatScreen({ cap: 6, now: 1 }, { sel: 'all', th: 'dark' }, {}).head.find(n => n.t === 'chips').items.find(x => x.label === '2호선').c;
  const pa = E.chatScreen({ cap: 6, now: 1 }, { sel: 'all', th: 'pastel' }, {}).head.find(n => n.t === 'chips').items.find(x => x.label === '2호선').c;
  ok(typeof dk === 'string' && typeof pa === 'string', '테마별 색');
}
// s330: 방금 보낸 글(전송 중) — 서버 글에 아직 없으면 내 말풍선으로 맨 끝에 · 서버 글에 생기면 빠진다 · 앱은 틀(info.echo)만 쓴다
{
  const pend = (sel, p, d) => E.chatScreen({ cap: 6, now: NOW }, Object.assign({}, base, { sel, me: '나', pend: p }), d);
  const all1 = pend('all', [['방금 친 글', NOW]], { g: [['다른이', '안녕', NOW - 5000, 0, '1호선']] });
  const msgs = all1.body.filter(n => n.t === 'msg');
  ok(msgs.length === 2 && msgs[1].s === '방금 친 글' && msgs[1].mine === true && msgs[1].time === '전송 중', '전체 방: 전송 중인 글이 맨 끝 내 말풍선으로');
  const all2 = pend('all', [['방금 친 글', NOW]], { g: [['다른이', '안녕', NOW - 5000, 0, '1호선'], ['나', '방금 친 글', NOW + 500, 1, '1호선']] });
  ok(all2.body.filter(n => n.t === 'msg').length === 2 && !all2.body.some(n => n.time === '전송 중'), '서버 글에 같은 글이 생기면 전송 중 말풍선은 빠진다');
  const room1 = pend('1호선', [['hi', NOW]], { r: [] });
  ok(room1.body.filter(n => n.t === 'msg').length === 1 && room1.body.find(n => n.t === 'msg').time === '전송 중' && !room1.body.some(n => n.t === 'text'), '빈 노선 방: 안내 글 대신 내 말풍선');
  const room2 = pend('1호선', [['hi', NOW]], { r: [['m1', NOW + 100, '나', 'hi', 'chat']] });
  ok(!room2.body.some(n => n.time === '전송 중'), '노선 방: 서버 글(내 아이디 · 같은 글)이 생기면 빠진다');
  const echo = all1.info.echo;
  ok(echo && echo.t === 'msg' && echo.mine === true && echo.s === '' && echo.time === '전송 중' && Array.isArray(echo.pad), '화면에 내 말풍선 틀(info.echo)을 담는다 — 앱은 글만 채운다');
  ok(pend('all', [['x'.repeat(500), NOW], ['a', 1], ['b', 2], ['c', 3], ['d', 4], ['e', 5], ['f', 6]], { g: [] }).body.filter(n => n.time === '전송 중').length === 5, '전송 중 글은 최대 5개 · 400자');
}
(async () => {
  const tmp = path.join(os.tmpdir(), 'rv2_chat_' + process.pid + '.mjs');
  fs.copyFileSync(R('engine/route-v2-worker.ascii.js'), tmp);
  try {
    const w = (await import(tmp)).default, call = (u, init) => w.fetch(new Request(u, init), {}, { waitUntil() { } });
    const post = b => call('https://x/screen/chat', { method: 'POST', body: b, headers: { 'Content-Type': 'text/plain;charset=UTF-8' } });
    const r = await post(JSON.stringify({ cap: 6, f: base, d: { g: G } })), j = await r.json();
    ok(r.status === 200 && j.ok && j.screen === 'chat' && j.anchor === 'bottom' && /route-v2-2026-10-\d\ds\d\d/.test(j.ver), '워커 응답 200 ' + j.ver);
    const ra = await (await post(JSON.stringify({ cap: 6, f: base, d: { g: G }, alts: { '2호선': { f: Object.assign({}, base, { sel: '2호선' }), d: { r: [] } } } }))).json();
    ok(ra.ok && ra.alts && ra.alts['2호선'].info.sel === '2호선', '워커: alts 응답(방 화면이 함께 온다)');
    ok((await (await post(JSON.stringify({ cap: 5, f: {}, d: {} }))).json()).ok === false, '워커: cap 부족이면 거절');
    ok((await post('{oops')).status === 400 && (await post('x'.repeat(1500001))).status === 413 && (await call('https://x/screen/chat')).status === 405, '워커: 깨진 본문 400 · 큰 본문 413 · GET 405');
    const ro = await call('https://x/screen/chat', { method: 'OPTIONS' });
    ok(ro.status === 204 && r.headers.get('access-control-allow-origin') === '*' && /^private, max-age=\d+$/.test(r.headers.get('cache-control')), '워커: OPTIONS 204 · CORS · no-store');
  } catch (e) { fail++; console.log('  FAIL 워커 시험 예외', e && e.stack || e); }
  try { fs.unlinkSync(tmp); } catch (e) { }
  console.log(`chat_engine: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();

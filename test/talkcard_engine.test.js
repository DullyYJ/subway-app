// 홈 '실시간 대화' 게시판 엔진(engine/talkcard.js) 시험.  실행: node test/talkcard_engine.test.js   (javac · java 필요)
//  ① cap 15 미만 거절 ② 줄 고르기(최근 5줄 · 접힘 · 빈 글 건너뜀 · 공백 정리) · 시각 글(HH:MM, 기기 시간대) ③ 높이(120/95/70/45 + 머리 21 + 입력 48)가 웹 CSS 와 같다
//  ④ 머리줄·입력줄 문구와 행동 이름 · 이모지 없음 ⑤ 앱 검증기(ScreenCore) 통과 ⑥ 워커 내장 사본·이름 충돌·끝에서 끝 ⑦ 웹 연결 글 확인
const fs = require('fs'), path = require('path');
const E = require('../engine/talkcard'), screenCheck = require('./helpers/screen_check');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  FAIL', m); } }
const R = p => path.join(__dirname, '..', p);
const html = fs.readFileSync(R('ios-reference/index.html'), 'utf8');
const EMOJI = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
const T0 = Date.UTC(2026, 9, 20, 5, 41);
const ROWS = ['가', '나', '다', '라', '마', '바', '사'].map((n, i) => [n + '닉', '글 ' + (i + 1), T0 + i * 60000, i === 2 ? 1 : 0]);
const G = (f, cap) => E.talkScreen({ cap: cap == null ? 15 : cap }, f);
const rowsOf = (o) => o.head.filter(n => n.t === 'ltr');
const sum = (o) => o.head.reduce((s, n) => s + (n.t === 'lth' ? 21 : n.t === 'ltr' ? 20 + n.pad[3] : n.t === 'spacer' ? n.h : 0), 0);

// ① 거절
ok(G({ m: ROWS }, 14).error === 'cap' && G({ m: ROWS }, 0).error === 'cap' && G({ m: ROWS }, 15).ok === true, 'cap 15 미만이면 만들지 않는다');
ok(G(null).ok === true && G(undefined).head.length === 2 && G('x').ok === true, '사실이 이상해도 빈 게시판으로 만든다');

// ② 줄 고르기 · 시각
{
  const o = G({ m: ROWS, fold: 0, tzo: -540 }), rs = rowsOf(o);
  ok(rs.length === 5 && rs[0].s === '글 3' && rs[4].s === '글 7', '최근 5줄(오래된 것부터)');
  ok(rs[0].time === '14:43' && rs[4].time === '14:47', '시각은 기기 시간대(KST) HH:MM ' + rs[0].time);
  ok(G({ m: ROWS, tzo: 0 }).head[1].time === '05:43' && G({ m: ROWS, tzo: 300 }).head[1].time === '00:43', '시간대에 따라 시각이 달라진다(UTC·미국 동부)');
  ok(rs.every(r => r.nick && r.pad[3] === (r === rs[4] ? 0 : 5)), '줄 사이 5 · 마지막 줄은 0');
  ok(rs.map(r => r.fo).join() === '1,2,3,0,0', '접을 수 있는 줄(fo): 오래된 3줄만 1·2·3 — 앱이 잰 남는 세로로 몇 줄 접을지 정한다(웹 _sceneFit)');
  ok(rowsOf(G({ m: ROWS.slice(0, 3) })).map(r => r.fo).join() === '1,0,0' && rowsOf(G({ m: ROWS.slice(0, 2) })).map(r => r.fo).join() === '0,0', '줄이 적으면 2줄은 늘 남긴다');
  ok(G({ m: ROWS }).foot[0].inh === 35 && G({ m: ROWS }).foot[0].r === 18, '입력 상자 높이 35 · 모서리 18(웹 입력칸)');
  const o2 = G({ m: [['a', '  공백   많은   글  ', T0], ['b', '', T0], ['c', '   ', T0], ['d', null, T0], 5, ['e', '정상', T0]] });
  ok(rowsOf(o2).map(r => r.s).join('|') === '공백 많은 글|정상', '빈 글은 건너뛰고 공백은 정리한다 ' + rowsOf(o2).map(r => r.s));
  ok(rowsOf(G({ m: [['x'.repeat(100), 'y'.repeat(500), T0]] }))[0].nick.length === 40 && rowsOf(G({ m: [['x', 'y'.repeat(500), T0]] }))[0].s.length === 200, '닉네임 40자 · 글 200자까지');
  ok(rowsOf(G({ m: new Array(50).fill(['n', 't', T0]) })).length === 5, '많이 보내도 5줄');
}

// ③ 접힘과 높이
{
  [[0, 120, 5], [1, 95, 4], [2, 70, 3], [3, 45, 2], [9, 45, 2], [-4, 120, 5], ['2', 70, 3], [NaN, 120, 5]].forEach(([fold, h, n]) => {
    const o = G({ m: ROWS, fold }); ok(rowsOf(o).length === n && sum(o) === 21 + h, '접힘 ' + fold + ': 줄 ' + n + ' · 높이 ' + h + ' (얻은 ' + rowsOf(o).length + ', ' + (sum(o) - 21) + ')');
  });
  [0, 1, 2, 3].forEach(fold => { const o = G({ m: [], fold }); ok(sum(o) === 21 + 120 - fold * 25, '빈 대화도 높이는 같다 fold ' + fold); });
  ok(G({ m: ROWS.slice(0, 2) }).info.n === 2 && sum(G({ m: ROWS.slice(0, 2) })) === 141, '줄이 모자라면 남는 자리는 빈 칸으로 채워 높이를 지킨다');
  // 웹 CSS: .livetalk-list height 120, data-hf 1/2/3 → 95/70/45
  ok(/\.livetalk-list\{[^}]*height:120px/.test(html) && /data-hf="1"\] \.livetalk-list\{height:95px/.test(html) && /data-hf="2"\] \.livetalk-list\{height:70px/.test(html) && /data-hf="3"\] \.livetalk-list\{height:45px/.test(html), '웹 CSS 높이 120/95/70/45 와 같다');
}

// ④ 문구 · 행동
{
  const o = G({ m: ROWS }), h = o.head[0], inb = o.foot[0];
  ok(h.t === 'lth' && h.s === '실시간 대화' && h.tail === '›' && h.dot === '#ff3b30' && h.live === true && h.act.v === 'tk.open' && h.act.a === 'call', '머리줄 문구 · 색 점 · 행동');
  ok(inb.t === 'inbar' && inb.key === 'talk.in' && inb.hint === '실시간 대화 남기기...' && inb.maxlen === 100 && inb.act.v === 'tk.send' && inb.h === 38 && inb.bh === 38 && /^M2\.01 21L23 12/.test(inb.bicon), '입력줄 문구 · 최대 100자 · 보내기 행동 · 둥근 단추');
  ok(/placeholder="실시간 대화 남기기\.\.\." maxlength="100"/.test(html) && />실시간 대화 <span/.test(html), '문구가 웹과 같다');
  ok(o.cover === 'tab' && o.bg === 'card' && o.screen === 'talk' && o.body.length === 1 && o.body[0].h === 0, '화면 겉틀');
  ok(!EMOJI.test(JSON.stringify(o)), '이모지 없음');
  ok(G({ m: ROWS }).rev === o.rev && G({ m: ROWS.slice(0, 6) }).rev !== o.rev && G({ m: ROWS, fold: 1 }).rev !== o.rev, 'rev: 같으면 같고 바뀌면 달라진다');
}

// ⑤ 앱 검증기
{
  const cases = [G({ m: ROWS }), G({ m: [] }), G({ m: ROWS, fold: 3 }), G({ m: ROWS.slice(0, 1), fold: 2 }), G({ m: [['긴'.repeat(40), '아주 '.repeat(60), T0]] })];
  const r = screenCheck(cases);
  ok(!r.err && r.out.length === cases.length && r.out.every(l => /^OK/.test(l)), '앱 검증기 통과 ' + (r.err || r.out.join(' / ')));
}

// ⑥ 워커 내장
{
  const W = fs.readFileSync(R('engine/route-v2-worker.ascii.js'), 'utf8');
  ok(/handleScreenTalk/.test(W) && /function talkScreen/.test(W) && /url\.pathname === "\/screen\/talk"/.test(W), '워커에 /screen/talk 가 내장돼 있다');
  const names = [...fs.readFileSync(R('engine/talkcard.js'), 'utf8').matchAll(/^(?:function|var) ([A-Za-z0-9_]+)/gm)].map(m => m[1]);
  const others = W.replace(/\/\/ ===== TALKCARD ENGINE BEGIN =====[\s\S]*?\/\/ ===== TALKCARD ENGINE END =====/, '');
  names.forEach(n => { const re = new RegExp('(?:^|\\n)(?:async )?(?:function|var|let|const) ' + n + '\\b', 'g'); ok(!re.test(others), '이름 충돌 없음 ' + n); });
  const vm = require('vm'), ctx = { Response: class { constructor(b, o) { this.b = b; this.status = (o && o.status) || 200; } }, console, ENGINE_VERSION: 'x' };
  vm.createContext(ctx);
  const blk = (W.match(/\/\/ ===== TALKCARD ENGINE BEGIN =====[\s\S]*?\/\/ ===== TALKCARD ENGINE END =====/) || [''])[0];
  ok(blk.length > 500, '워커 사본이 있다');
  try {
    vm.runInContext(blk + '\nthis.__h = handleScreenTalk;', ctx);
    const rq = (obj, method) => ({ method: method || 'POST', text: () => Promise.resolve(typeof obj === 'string' ? obj : JSON.stringify(obj)) });
    Promise.all([ctx.__h(rq({ cap: 15, f: { m: ROWS, fold: 1, tzo: -540 } })), ctx.__h(rq({ cap: 14, f: { m: ROWS } })), ctx.__h(rq('{bad')), ctx.__h(rq({}, 'GET'))]).then(([a, b2, c, d]) => {
      const ja = JSON.parse(a.b);
      ok(a.status === 200 && ja.ok && ja.ver === 'x' && ja.head[0].t === 'lth' && ja.head.filter(n => n.t === 'ltr').length === 4, '워커 사본이 요청을 끝까지 처리한다');
      ok(JSON.stringify(Object.assign({}, ja, { ver: undefined })) === JSON.stringify(G({ m: ROWS, fold: 1, tzo: -540 })), '워커 사본의 답이 엔진 파일과 같다');
      ok(b2.status === 400 && c.status === 400 && d.status === 405, '규격 낮음 400 · 나쁜 JSON 400 · GET 405');
      done();
    }, e => { ok(false, '워커 요청 오류 ' + e.message); done(); });
  } catch (e) { ok(false, '워커 블록 실행 오류 ' + e.message); done(); }
}

function done() {
  // ⑦ 웹 연결 글
  ok(/id="homeTalkInner"/.test(html) && /id: 'talk', kp: 'gdm_sclt', ep: '\/screen\/talk'/.test(html) && /id="scltSetCard"/.test(html) && /key === 'f\.sclt'/.test(html) && /window\._scltSetUse = /.test(html), '웹: 감싸개 · 틀 · 설정 카드 · 스위치 연결');
  ok(/'tk\.open'/.test(html) && /'tk\.send'/.test(html) && /function _homeTalkSend\(txtIn\)/.test(html) && /window\._scrTalk\.changed\(\)/.test(html), '웹: 허용 행동 · 글 직접 넘기기 · 새 줄 알림');
  console.log(fail ? ('talkcard_engine: ' + pass + ' pass, ' + fail + ' FAIL') : ('talkcard_engine: ' + pass + ' pass, 0 fail'));
  process.exit(fail ? 1 : 0);
}

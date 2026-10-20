// 안내창(대화상자) 엔진(engine/dialog.js) 시험.  실행: node test/dialog_engine.test.js   (javac · java 필요)
//  ① cap 16 미만·모르는 종류 거절 ② 권한 안내(문구·단추·흐린 곳 누르면 취소) ③ 진단 기록(최신이 위·긴 기록 쪼개기·복사 글자) ④ 알림(두 모양·이모지 제거)
//  ⑤ 앱 검증기 통과 ⑥ 워커 내장 사본·이름 충돌·끝에서 끝 ⑦ 웹 연결 글 확인
const fs = require('fs'), path = require('path');
const E = require('../engine/dialog'), screenCheck = require('./helpers/screen_check');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  FAIL', m); } }
const R = p => path.join(__dirname, '..', p);
const html = fs.readFileSync(R('ios-reference/index.html'), 'utf8');
const EMOJI = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
const G = (f, cap) => E.dialogScreen({ cap: cap == null ? 16 : cap }, f);
const btns = o => [].concat(o.head, o.foot || []).filter(n => n.t === 'btnrow').reduce((a, n) => a.concat(n.items), []);

// ① 거절
ok(G({ kind: 'perm' }, 15).error === 'cap' && G({ kind: 'perm' }, 0).error === 'cap' && G({ kind: 'perm' }, 16).ok === true, 'cap 16 미만이면 만들지 않는다');
ok(G({ kind: 'x' }).error === 'kind' && G({}).error === 'kind' && G(null).error === 'kind' && G('perm').error === 'kind', '모르는 종류는 거절');

// ② 권한 안내
{
  const o = G({ kind: 'perm' }), b = btns(o);
  ok(o.screen === 'dlg' && o.dlg.dim === 0.5 && o.dlg.tap.v === 'dl.no' && o.dlg.w === 340 && o.dlg.r === 18, '권한: 카드 모양과 흐린 곳 누르면 취소');
  ok(b.length === 2 && b[0].label === '취소' && b[0].act.v === 'dl.no' && b[1].label === '설정 열기' && b[1].act.v === 'dl.ok', '권한: 단추 이름과 행동');
  ok(JSON.stringify(o).includes('다른 앱 위에 표시') && JSON.stringify(o).includes('설정 화면을 열까요?') && !EMOJI.test(JSON.stringify(o)), '권한: 문구 · 이모지 없음');
  ok(/설정 화면을 열까요\?/.test(html) && /다른 앱 위에 표시/.test(html), '권한: 문구가 웹과 같다');
}

// ②-1 글 신고 확인
{
  const o = G({ kind: 'report' }), b = btns(o);
  ok(o.dlg.dim === 0.5 && o.dlg.tap.v === 'dl.no' && o.dlg.w === 320, '신고: 흐린 곳을 누르면 취소');
  ok(b.length === 2 && b[0].label === '취소' && b[0].act.v === 'dl.no' && b[1].label === '신고' && b[1].act.v === 'dl.ok' && b[1].fill === '#ff3b30', '신고: 단추 이름과 행동');
  ok(JSON.stringify(o).includes('이 글을 신고할까요?') && JSON.stringify(o).includes('신고가 여러 명 모이면 자동으로 숨겨져요.') && !EMOJI.test(JSON.stringify(o)), '신고: 문구 · 이모지 없음');
  ok(/이 글을 신고할까요\?\\n신고가 여러 명 모이면 자동으로 숨겨져요\./.test(html), '신고: 문구가 웹 확인창과 같다');
}

// ②-2 앱 종료 확인
{
  const o = G({ kind: 'exit' }), b = btns(o);
  ok(o.dlg.dim === 0.7 && !o.dlg.tap && o.dlg.fill === '#1c1c1e' && o.dlg.w === 320, '종료: 어두운 카드 · 흐린 곳을 눌러도 안 닫힌다');
  ok(b.length === 2 && b[0].label === '아니요' && b[0].act.v === 'dl.no' && b[1].label === '종료' && b[1].act.v === 'dl.ok' && b[1].fill === '#ff3b30', '종료: 단추 이름과 행동');
  ok(JSON.stringify(o).includes('앱을 종료하시겠습니까?') && JSON.stringify(o).includes('길동무를 종료합니다.') && !EMOJI.test(JSON.stringify(o)), '종료: 문구 · 이모지 없음');
  ok(/앱을 종료하시겠습니까\?/.test(html) && /길동무를 종료합니다\./.test(html), '종료: 문구가 웹과 같다');
}

// ③ 진단 기록
{
  const L = []; for (let i = 0; i < 40; i++) L.push('12:' + (10 + i) + ' 줄 ' + i);
  const o = G({ kind: 'diag', lines: L, cp: 0 }), txt = o.body.map(n => n.s).join('\n');
  ok(txt.startsWith('12:49 줄 39') && txt.endsWith('12:10 줄 0'), '진단: 최신이 위');
  ok(o.info.n === 40 && o.dlg.dim === 0.75 && !o.dlg.tap, '진단: 줄 수 · 흐림 · 흐린 곳 눌러도 닫히지 않는다');
  ok(btns(o).map(x => x.label + ':' + x.act.v).join() === '전체 복사:dl.copy,지우기:dl.clear,닫기:dl.close', '진단: 단추');
  ok(btns(G({ kind: 'diag', lines: L, cp: 1 }))[0].label === '복사됨' && btns(G({ kind: 'diag', lines: L, cp: 2 }))[0].label === '복사 실패', '진단: 복사 결과 글자');
  ok(G({ kind: 'diag', lines: [] }).body[0].s === '기록 없음', '진단: 빈 기록');
  const big = []; for (let i = 0; i < 900; i++) big.push('줄 ' + i + ' ' + 'x'.repeat(80));
  const ob = G({ kind: 'diag', lines: big }), tot = ob.body.map(n => n.s).join('\n').split('\n');
  ok(ob.info.n === 600 && tot.length === 600 && ob.body.length > 1 && ob.body.every(n => n.s.length <= 1800), '진단: 600줄까지 · 덩어리로 쪼갬 ' + ob.body.length);
  ok(G({ kind: 'diag', lines: ['y'.repeat(900)] }).body[0].s.length === 300, '진단: 한 줄 300자까지');
  ok(JSON.stringify(G({ kind: 'diag', lines: L })) === JSON.stringify(G({ kind: 'diag', lines: L })) && G({ kind: 'diag', lines: L }).rev !== G({ kind: 'diag', lines: L.slice(1) }).rev, 'rev 안정');
}

// ④ 알림
{
  const a = G({ kind: 'pop', msg: '출발지로 설정했어요', sub: '강남역' }), s = G({ kind: 'pop', msg: '공유 안내', sub: '링크를 복사했어요', cls: 'sh' });
  ok(a.dlg.dim === 0 && a.dlg.fit === true && a.dlg.fill.startsWith('rgba') && a.head.length === 2 && a.head[0].s === '출발지로 설정했어요' && a.head[1].s === '강남역', '알림: 어두운 모양');
  ok(s.dlg.fill === 'card' && s.dlg.line === 'border2' && s.head[0].color === 'text' && s.info.sh === 1, '알림: sh 모양');
  ok(G({ kind: 'pop', msg: '', sub: '둘째만' }).head.length === 1 && G({ kind: 'pop', msg: '둘째만' }).head.length === 1, '알림: 글이 하나면 한 줄');
  const e = G({ kind: 'pop', msg: '완료 ✅🚇', sub: '좋아요 👍' });
  ok(e.head[0].s === '완료' && e.head[1].s === '좋아요' && !EMOJI.test(JSON.stringify(e)), '알림: 이모지 제거');
  ok(G({ kind: 'pop', msg: 'a'.repeat(300) }).head[0].s.length === 120, '알림: 120자까지');
}

// ⑤ 앱 검증기
{
  const L = []; for (let i = 0; i < 60; i++) L.push('줄 ' + i + ' ' + 'k'.repeat(60));
  const cases = [G({ kind: 'perm' }), G({ kind: 'exit' }), G({ kind: 'report' }), G({ kind: 'diag', lines: L }), G({ kind: 'diag', lines: [] }), G({ kind: 'pop', msg: '안내', sub: '둘째 줄' }), G({ kind: 'pop', msg: '공유', cls: 'sh' })];
  const r = screenCheck(cases);
  ok(!r.err && r.out.length === cases.length && r.out.every(l => /^OK/.test(l)), '앱 검증기 통과 ' + (r.err || r.out.join(' / ')));
}

// ⑥ 워커 내장
{
  const W = fs.readFileSync(R('engine/route-v2-worker.ascii.js'), 'utf8');
  ok(/handleScreenDlg/.test(W) && /function dialogScreen/.test(W) && /url\.pathname === "\/screen\/dlg"/.test(W), '워커에 /screen/dlg 가 내장돼 있다');
  const names = [...fs.readFileSync(R('engine/dialog.js'), 'utf8').matchAll(/^(?:function|var) ([A-Za-z0-9_]+)/gm)].map(m => m[1]);
  const others = W.replace(/\/\/ ===== DIALOG ENGINE BEGIN =====[\s\S]*?\/\/ ===== DIALOG ENGINE END =====/, '');
  names.forEach(n => { const re = new RegExp('(?:^|\\n)(?:async )?(?:function|var|let|const) ' + n + '\\b', 'g'); ok(!re.test(others), '이름 충돌 없음 ' + n); });
  const vm = require('vm'), ctx = { Response: class { constructor(b, o) { this.b = b; this.status = (o && o.status) || 200; } }, console, ENGINE_VERSION: 'x' };
  vm.createContext(ctx);
  const blk = (W.match(/\/\/ ===== DIALOG ENGINE BEGIN =====[\s\S]*?\/\/ ===== DIALOG ENGINE END =====/) || [''])[0];
  ok(blk.length > 500, '워커 사본이 있다');
  try {
    vm.runInContext(blk + '\nthis.__h = handleScreenDlg;', ctx);
    const rq = (obj, method) => ({ method: method || 'POST', text: () => Promise.resolve(typeof obj === 'string' ? obj : JSON.stringify(obj)) });
    Promise.all([ctx.__h(rq({ cap: 16, f: { kind: 'pop', msg: '안내', sub: '둘째' } })), ctx.__h(rq({ cap: 15, f: { kind: 'perm' } })), ctx.__h(rq('{bad')), ctx.__h(rq({}, 'GET')), ctx.__h(rq({ cap: 16, f: { kind: 'zz' } }))]).then(([a, b2, c, d, e]) => {
      const ja = JSON.parse(a.b);
      ok(a.status === 200 && ja.ok && ja.ver === 'x' && ja.screen === 'dlg', '워커 사본이 요청을 끝까지 처리한다');
      ok(JSON.stringify(Object.assign({}, ja, { ver: undefined })) === JSON.stringify(G({ kind: 'pop', msg: '안내', sub: '둘째' })), '워커 사본의 답이 엔진 파일과 같다');
      ok(b2.status === 400 && c.status === 400 && d.status === 405 && e.status === 400, '규격 낮음 400 · 나쁜 JSON 400 · GET 405 · 모르는 종류 400');
      done();
    }, e => { ok(false, '워커 요청 오류 ' + e.message); done(); });
  } catch (e) { ok(false, '워커 블록 실행 오류 ' + e.message); done(); }
}

function done() {
  // ⑦ 웹 연결 글
  ok(/id: 'dlg', kp: 'gdm_scrd', ep: '\/screen\/dlg'/.test(html) && /id="scrdSetCard"/.test(html) && /key === 'f\.scrd'/.test(html) && /window\._scrdSetUse = /.test(html), '웹: 틀 · 설정 카드 · 스위치 연결');
  ok(/window\._ndlg\.pop\(msg, sub, cls\)/.test(html) && /window\._ndlg\.perm\(onOk, onCancel\)/.test(html) && /window\._ndlg\.diag\(\)/.test(html) && /function _pickPopWeb/.test(html) && /function _showOvlPermDialogWeb/.test(html) && /function _ovlDiagShowWeb/.test(html) && /window\._ndlg\.exit\(\)/.test(html) && /window\._ndlg\.report\(function/.test(html) && /function _lrReportGo/.test(html), '웹: 팝업 4종이 먼저 네이티브를 시도하고 웹으로 돌아간다');
  ok(/window\._ndlg\.back\(\)/.test(html), '웹: 뒤로가기가 안내창부터 닫는다');
  console.log(fail ? ('dialog_engine: ' + pass + ' pass, ' + fail + ' FAIL') : ('dialog_engine: ' + pass + ' pass, 0 fail'));
  process.exit(fail ? 1 : 0);
}

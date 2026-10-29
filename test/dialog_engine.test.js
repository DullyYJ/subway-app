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

// ④-1 도보 안내 시트(웹 walkModal)
{
  const NOW = Date.UTC(2026, 9, 21, 6, 5), W = (w, th) => G({ kind: 'walk', walk: Object.assign({ mode: 'arrive', nowMs: NOW, tzoMin: -540, theme: th || 'dark' }, w) });
  const tiles = o => o.head.find(n => n.t === 'row').kids.map(k => k.kids[1].s);
  const o = W({ my: { lat: 37.5, lng: 127.0 }, dest: { lat: 37.505, lng: 127.004, name: '강남역' } });
  ok(o.screen === 'walk' && !o.dlg && o.bg === 'card' && o.info.kind === 'walk' && o.info.refresh === 30000, '도보: 안내창이 아니라 시트 화면');
  ok(o.head[0].t === 'bar' && o.head[0].title === '목적지까지 도보 안내' && o.head[0].sub === '→ 강남역' && o.head[0].act.v === 'wk.close', '도보: 제목 · 목적지 · 닫기');
  ok(tiles(o).join() === '658m,10분' && o.info.dist === 658 && o.info.min === 10, '도보: 직선거리 658m · 67m/분 → 10분 ' + tiles(o));
  ok(o.head[o.head.length - 1].s === '오후 03:05 기준', '도보: 기준 시각(한국시간 오후 03:05)');
  ok(btns(o).map(x => x.label + ':' + x.act.v).join() === '카카오맵:wk.kakao,네이버지도:wk.naver' && btns(o)[0].fill === '#FEE500' && btns(o)[1].fill === '#03C75A', '도보: 지도 앱 단추 색 · 행동');
  ok(!EMOJI.test(JSON.stringify(o)), '도보: 이모지 없음');
  ok(W({ my: { lat: 37.5, lng: 127 }, dest: { lat: 37.5, lng: 127.0002, name: 'a' } }).head.find(n => n.t === 'row').kids[1].kids[1].s === '1분 미만', '도보: 1분 안이면 1분 미만');
  ok(tiles(W({ my: { lat: 37.5, lng: 127 }, dest: { lat: 37.6, lng: 127.1, name: 'b' } }))[0] === '14.2km', '도보: 1km 넘으면 km 한 자리');
  const nm = W({ dest: { lat: 37.5, lng: 127, name: 'c' } });
  ok(tiles(nm).join() === '-,-' && nm.head[nm.head.length - 1].s === ' ' && nm.info.nav.kakao[0] === 'kakaomap://route?ep=37.5,127&by=FOOT' && /directions\/-\/127,37.5,/.test(nm.info.nav.naver[1]), '도보: 내 위치가 없으면 - · 출발지 없는 길안내');
  const nd = W({ my: { lat: 37.5, lng: 127 }, dest: { name: '이름만' } });
  ok(tiles(nd).join() === '0m,-' && nd.info.nav === null && nd.info.msg === '목적지 좌표를 찾을 수 없습니다', '도보: 목적지 좌표가 없으면 0m · - · 안내 글');
  ok(o.info.nav.kakao[0] === 'kakaomap://route?sp=37.5,127&ep=37.505,127.004&by=FOOT' && o.info.nav.kakao[1] === 'https://map.kakao.com/link/to/' + encodeURIComponent('강남역') + ',37.505,127.004', '도보: 카카오맵 주소');
  ok(o.info.nav.naver[0].startsWith('nmap://route/walk?slat=37.5&slng=127&sname=') && o.info.nav.naver[0].endsWith('&dlat=37.505&dlng=127.004&dname=' + encodeURIComponent('강남역') + '&appname=com.dullyyj.subway') && o.info.nav.naver[1] === 'https://map.naver.com/p/directions/127,37.5,%EB%82%B4%EC%9C%84%EC%B9%98,,-1/127.004,37.505,' + encodeURIComponent('강남역') + ',,-1/walk', '도보: 네이버지도 주소');
  ok(W({ dest: { lat: 1, lng: 2, name: '' } }).info.nav.kakao[1].includes(encodeURIComponent('목적지')), '도보: 이름이 없으면 목적지');
  ok(W({ mode: 'start', dest: { lat: 1, lng: 2, name: 'x' } }).head[0].title === '출발역까지 도보 안내' && W({ mode: 'zz', dest: { lat: 1, lng: 2, name: 'x' } }).head[0].title === '현재 위치 지도', '도보: 모드별 제목');
  ok(W({ my: { lat: 37.5, lng: 127 }, dest: { lat: 37.505, lng: 127.004, name: 'x' } }, 'light').head[1].kids[1].kids[1].hl[0][2] === '#29b96a' && o.head[1].kids[1].kids[1].hl[0][2] === '#34c759', '도보: 시간 글자 초록(어두운/밝은 테마)');
  ok(G({ kind: 'walk' }).ok === true && G({ kind: 'walk' }, 15).error === 'cap' && JSON.stringify(W({})) === JSON.stringify(W({})), '도보: 빈 사실도 그려진다 · cap 16 미만 거절 · 안정');
  const hh = (h, m) => W({ my: { lat: 37.5, lng: 127 }, dest: { lat: 37.5, lng: 127, name: 'z' }, nowMs: Date.UTC(2026, 9, 21, h - 9, m) });
  const cl = x => x.head[x.head.length - 1].s;
  ok(cl(hh(0, 0)) === '오전 12:00 기준' && cl(hh(12, 7)) === '오후 12:07 기준' && cl(hh(9, 30)) === '오전 09:30 기준' && cl(hh(23, 59)) === '오후 11:59 기준', '도보: 오전/오후 12시간제 · 두 자리');
  ok(/'kakaomap:\/\/route\?'/.test(html) && /by=FOOT/.test(html) && /nmap:\/\/route\/walk\?/.test(html) && /appname=com\.dullyyj\.subway/.test(html) && /Math\.round\(dist \/ 67\)/.test(html) && /setInterval\(_walkRefresh, 30000\)/.test(html) && /1분 미만/.test(html), '도보: 계산식이 웹 walkModal 과 같다(67m/분 · 30초 · FOOT)');
}

// ④-3 s252: 하차 추천 팝업(앱 화면을 보는 중)
{
  const o = G({ kind: 'reco', title: '🍗 하차 7분 전 · 강남', body: '강남역 도착 예정 12:30\n근처에서 한 끼 어때요?', go: '맛집 보기', ok: '확인' }), b = btns(o);
  ok(o.ok && o.screen === 'dlg' && o.dlg.tap.v === 'dl.no' && o.dlg.dim === 0.5 && o.info.kind === 'reco' && o.info.go === 1, 'reco: 카드 모양 · 흐린 곳 누르면 닫기');
  ok(b.length === 2 && b[0].label === '맛집 보기' && b[0].act.v === 'dl.go' && b[0].fill === 'gold' && b[1].label === '확인' && b[1].act.v === 'dl.no', 'reco: [맛집 보기] [확인]');
  ok(JSON.stringify(o).includes('하차 7분 전 · 강남') && JSON.stringify(o).includes('근처에서 한 끼 어때요?') && !EMOJI.test(JSON.stringify(o)), 'reco: 제목 · 본문 · 이모지 없음');
  const n = G({ kind: 'reco', title: '하차 추천', body: '' }), nb = btns(n);
  ok(n.ok && nb.length === 1 && nb[0].label === '확인' && n.info.go === 0 && G({ kind: 'reco' }, 15).error === 'cap', 'reco: 가게 단추 이름이 없으면 [확인]만');
}

{
  const o = G({ kind: 'bpick', no: '931', stop: 'B0', mid: 1, items: [{ sec: 120, ms: 1, no: '931' }, { sec: 200, ms: 2, no: '932' }] }), b = btns(o);
  ok(JSON.stringify(o).includes('갈아탈 버스를 골라 주세요') && b.length === 3 && b[2].label === '추천대로 탈게요' && b[2].act.v === 'dl.no' && !b.some(x => x.act.v === 'dl.ok'), 'bpick mid: 갈아탈 버스 카드 · 고르지 않으면 추천대로');
}
// ④-4 s320: 경로 이탈 확인 카드(테마 · 같은 크기 단추)
{
  const o = G({ kind: 'offroute', stn: '테크노파크' }), b = btns(o), row = o.head.find(n => n.t === 'btnrow');
  ok(o.ok && o.screen === 'dlg' && o.info.kind === 'offroute' && o.dlg.tap.v === 'dl.no' && o.bg === 'card', 'offroute: 카드 모양 · 바깥을 누르면 계속 안내');
  ok(b.length === 3 && b.map(x => x.label).join('|') === '역까지 이동|계속 안내|다시 찾기' && row.eq === true && b[0].act.v === 'dl.bp.0' && b[1].act.v === 'dl.no' && b[2].act.v === 'dl.bp.1', 'offroute: 세 단추 폭 같게 · 행동');
  ok(JSON.stringify(o).includes('테크노파크까지') && !EMOJI.test(JSON.stringify(o)), 'offroute: 역 이름 안내 · 이모지 없음');
  const n = G({ kind: 'offroute' }), nb = btns(n);
  ok(nb.length === 2 && nb[0].label === '계속 안내' && nb[1].label === '다시 찾기' && nb[1].act.v === 'dl.bp.1' && n.info.stn === 0 && G({ kind: 'offroute' }, 15).error === 'cap', 'offroute: 역이 없으면 두 단추');
  const rc = screenCheck([o, n]); ok(!rc.err && rc.out.every(l => /^OK/.test(l)), 'offroute: 앱 검증기 통과 ' + (rc.err || rc.out.join(' ')));
}

// ④-2 s200: 탈 버스 고르기(첫 구간이 버스일 때 10분 안에 오는 버스)
{
  const it = [{ sec: 45, ms: 1000045 }, { sec: 200, ms: 1000200 }, { sec: 0, ms: 5 }, { sec: 'x', ms: 6 }, { sec: 590, ms: 1000590 }];
  const o = G({ kind: 'bpick', no: '9701', stop: '검단대성베르힐', items: it }), b = btns(o);
  ok(o.ok && o.screen === 'dlg' && o.dlg.tap.v === 'dl.no' && o.dlg.dim === 0.5, 'bpick: 카드 모양 · 흐린 곳 누르면 취소');
  ok(o.info.items.length === 3 && o.info.items.map(x => x.ms).join() === '1000045,1000200,1000590', 'bpick: 값이 이상한 줄은 버리고 info.items 에 단추 순서대로 ms');
  ok(b.length === 5 && b[0].act.v === 'dl.bp.0' && b[1].act.v === 'dl.bp.1' && b[2].act.v === 'dl.bp.2' && b[3].label === '취소' && b[3].act.v === 'dl.no' && b[4].label === '고르지 않고 시작' && b[4].act.v === 'dl.ok', 'bpick: 버스 단추 dl.bp.N · 취소 · 고르지 않고 시작');
  ok(b[0].label === '9701번 (45초 후)' && b[1].label === '9701번 (3분 20초 후)' && b[2].label === '9701번 (9분 50초 후)', 'bpick: 버스 번호(예상 시간) ' + b.slice(0, 3).map(x => x.label).join(' / '));
  ok(JSON.stringify(o).includes('탈 버스를 골라 주세요') && JSON.stringify(o).includes('검단대성베르힐 · 10분 안에 오는 버스') && !EMOJI.test(JSON.stringify(o)), 'bpick: 제목 · 부제 · 이모지 없음');
  ok(G({ kind: 'bpick', items: [] }).ok === true && btns(G({ kind: 'bpick', items: [] })).length === 2 && G({ kind: 'bpick' }, 15).error === 'cap', 'bpick: 버스가 없어도 그려진다(단추 둘) · cap 16 미만 거절');
}

// ⑤ 앱 검증기
{
  const L = []; for (let i = 0; i < 60; i++) L.push('줄 ' + i + ' ' + 'k'.repeat(60));
  const cases = [G({ kind: 'perm' }), G({ kind: 'bpick', no: '9701', stop: '정류장', items: [{ sec: 60, ms: 1 }, { sec: 300, ms: 2 }] }), G({ kind: 'exit' }), G({ kind: 'report' }), G({ kind: 'diag', lines: L }), G({ kind: 'diag', lines: [] }), G({ kind: 'pop', msg: '안내', sub: '둘째 줄' }), G({ kind: 'pop', msg: '공유', cls: 'sh' }), G({ kind: 'walk', walk: { my: { lat: 37.5, lng: 127 }, dest: { lat: 37.505, lng: 127.004, name: '강남역' }, nowMs: 1e12, tzoMin: -540 } }), G({ kind: 'walk' })];
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

function rloadChecks() {
  // ⑥-1 경로 탐색 로딩 카드(rload) — runner 노드를 아는 앱(cap 19)부터
  const o = G({ kind: 'rload' }, 19), r = o.head && o.head[0];
  ok(G({ kind: 'rload' }, 18).error === 'cap' && G({ kind: 'rload' }, 16).error === 'cap' && o.ok === true, 'rload: cap 19 미만이면 만들지 않는다(옛 앱은 runner 를 모른다)');
  ok(o.screen === 'dlg' && o.dlg.dim === 0.7 && o.dlg.w === 296 && o.dlg.r === 20 && !o.dlg.tap && o.bg === 'card', 'rload: 뒤 70% 어둡게 · 폭 296 · 모서리 20 · 흐린 곳을 눌러도 안 닫힌다');
  ok(r && r.t === 'runner' && r.ttl === '복합경로 탐색 중' && r.sub === '잠시만 기다려주세요' && JSON.stringify(r.pad) === '[30,24,30,22]', 'rload: 제목 · 안내 · 여백');
  ok(!EMOJI.test(JSON.stringify(o)) && /^d1:/.test(o.rev) && G({ kind: 'rload' }, 19).rev === o.rev, 'rload: 이모지 없음 · 같은 화면은 같은 rev');
  ok(/id="transitLoading"/.test(html) && /복합경로 탐색 중/.test(html) && /잠시만 기다려주세요/.test(html), 'rload: 문구가 웹 #transitLoading 과 같다');
  { const rc = screenCheck([o]); ok(!rc.err && rc.out.length === 1 && /^OK/.test(rc.out[0]), 'rload: 앱 검증기 통과 ' + (rc.err || rc.out.join(' '))); }
}

function done() {
  rloadChecks();
  // ⑦ 웹 연결 글
  ok(/id: 'dlg', kp: 'gdm_scrd', ep: '\/screen\/dlg'/.test(html) && /id="scrdSetCard"/.test(html) && /key === 'f\.scrd'/.test(html) && /window\._scrdSetUse = /.test(html), '웹: 틀 · 설정 카드 · 스위치 연결');
  ok(/window\._ndlg\.pop\(msg, sub, cls\)/.test(html) && /window\._ndlg\.perm\(onOk, onCancel\)/.test(html) && /window\._ndlg\.diag\(\)/.test(html) && /function _pickPopWeb/.test(html) && /function _showOvlPermDialogWeb/.test(html) && /function _ovlDiagShowWeb/.test(html) && /window\._ndlg\.exit\(\)/.test(html) && /window\._ndlg\.report\(function/.test(html) && /function _lrReportGo/.test(html), '웹: 팝업 4종이 먼저 네이티브를 시도하고 웹으로 돌아간다');
  ok(/window\._ndlg\.back\(\)/.test(html), '웹: 뒤로가기가 안내창부터 닫는다');
  console.log(fail ? ('dialog_engine: ' + pass + ' pass, ' + fail + ' FAIL') : ('dialog_engine: ' + pass + ' pass, 0 fail'));
  process.exit(fail ? 1 : 0);
}

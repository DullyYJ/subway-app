// 설정 화면 엔진(engine/settings.js) 시험.  실행: node test/settings_engine.test.js   (javac · java 필요 — 앱 검증기로 같은 JSON 을 읽어 본다)
//  ① cap 3 미만이면 만들지 않는다 ② 모양·내용(스위치 키·상태 문구·숨김 규칙·이모지 없음) ③ 여러 기기 상태에서 만든 화면이 앱 검증기(ScreenCore.load)를 모두 통과한다
//  ④ 웹 설정 화면의 문구·행동 이름이 엔진과 맞는가 ⑤ 워커 내장 사본 ⑥ 워커 끝에서 끝까지(GET /screen/settings)
process.env.TZ = 'Asia/Seoul';
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');
const E = require('../engine/settings');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; } else { fail++; console.log('  FAIL', m); } }
const R = p => path.join(__dirname, '..', p);
const html = fs.readFileSync(R('ios-reference/index.html'), 'utf8');

// 평탄화: 패널 안까지 모든 노드
function flat(nodes, out) { out = out || []; nodes.forEach(n => { out.push(n); if (n.kids) flat(n.kids, out); }); return out; }
const all = s => flat(s.body);
const full = { id: '길동', np: { arrive: 1, transfer: 0, arrive_reco: 1 }, npd: 1, rl: 1, th: 'dark', sam: 1, samw: 1, errn: 3, cm: 1, ovl: 0,
  };

// ① cap
ok(E.settingsScreen({}, full).ok === false && E.settingsScreen({ cap: 2 }, full).ok === false, 'cap 3 미만이면 만들지 않는다');
const s = E.settingsScreen({ cap: 3 }, full);
ok(s.ok && s.v === 1 && s.screen === 'settings' && s.cover === 'tab' && Array.isArray(s.head) && s.head.length === 1 && s.head[0].t === 'divider', '기본 모양: v1 · settings · cover=tab · head 는 아래 구분선뿐');
ok(/^s2:[0-9a-z]+$/.test(s.rev), 'rev 형식 ' + s.rev);
// ── s243 설정 탭은 좌우 밀기 없음(단독) — sw 를 주지 않는다 ──
ok(!('sw' in s), '설정 탭: 좌우 밀기 없음(sw 없음)');

// ② 내용
const nodes = all(s), toggles = nodes.filter(n => n.t === 'toggle');
const keys = toggles.map(n => n.key).join();
ok(keys === 'n.arrive,n.transfer,n.arrive_reco,rl', '스위치 순서(옛 웹 기능 스위치 행은 없다): ' + keys);
ok(!toggles.some(n => /^f\./.test(n.key)), '웹 기능 스위치(f.*)가 없다');
const tg = k => toggles.find(n => n.key === k);
ok(tg('n.arrive').on === true && tg('n.transfer').on === false && tg('n.arrive_reco').on === true, '알림 스위치 상태 = 저장값');
{
  ok(!nodes.some(n => /포인트|\d+ P\b|등급/.test(n.s || '')), '포인트 칸 · 안내가 없다(s216: 포인트 기능 삭제)');
  ok(!all(E.settingsScreen({ cap: 3 }, Object.assign({}, full, { pt: { total: 120 }, day: '2026-10-20' }))).some(n => /포인트/.test(n.s || '')), '옛 앱이 포인트 저장값을 보내도 칸을 만들지 않는다');
}
const boxes = nodes.filter(n => n.t === 'box').map(n => n.s);
ok(boxes.some(t => /^알림 권한이 꺼져 있어요/.test(t)) && boxes.some(t => /^이 앱의 배터리 사용이 제한됨으로/.test(t)), '권한 거부·배터리 제한 경고 상자');
const cur = nodes.find(n => n.t === 'box' && /^현재 아이디\n/.test(n.s));
ok(cur && cur.s === '현재 아이디\n길동' && JSON.stringify(cur.hl) === '[[7,9]]' && cur.hc === 'gold' && cur.fill === '#1c1c1e', '현재 아이디 상자(웹 #curIdBox: 작은 글 아래 금색 굵은 아이디 두 줄)');
const fld = nodes.find(n => n.t === 'field');
ok(fld && fld.key === 'cid' && fld.value === '길동' && fld.maxlen === 12, '입력칸 cid · 현재 값 · 12자');
const btns = nodes.filter(n => n.t === 'button');
ok(btns.filter(n => n.act.v === 'saveId' || n.act.v === 'clearId').map(n => n.act.v).join() === 'saveId,clearId', '버튼: 저장 → 삭제');
ok(btns.filter(n => n.act.v === 'sam').length === 1 && btns.find(n => n.act.v === 'sam').fill === 'gold' && btns.find(n => n.act.v === 'sam').s === '자동 절전 제외 설정 열기', '갤럭시: 웹처럼 금색 전체 폭 단추');
const sels = nodes.filter(n => n.t === 'select');
ok(sels.length === 2 && sels[0].on === true && sels[1].on === false && sels[0].act.v === 'dark' && sels[1].act.v === 'pastel', '테마 고르기: 다크가 선택됨');
const navs = nodes.filter(n => n.t === 'navrow');
const webIds = [btns.filter(n => n.act.a === 'web').map(n => n.act.v)[0]].concat(navs.filter(n => n.act.a === 'web').map(n => n.act.v)).join(), callIds = navs.filter(n => n.act.a === 'call').map(n => n.act.v).join();
ok(webIds === 'sam,cm,gw,arr,ovl,dev', '웹 카드로 이어지는 행: ' + webIds);
ok(callIds === 'pol.privacy,pol.location,pol.opensource,errlog', '앱 함수 호출 행: ' + callIds);
ok(navs.find(n => n.act.v === 'errlog').sub === '3' && navs.find(n => n.act.v === 'cm').sub === '켜짐' && navs.find(n => n.act.v === 'ovl').sub === '꺼짐', '오른쪽 글: 오류 3 · 켜짐 · 꺼짐');
{
  const titles = s.body.filter(n => n.t === 'panel' && n.kids[0] && n.kids[0].t === 'text').map(n => n.kids[0].s);
  ok(titles.join() === '커뮤니티 아이디,알림 설정,갤럭시 백그라운드 유지,안내 정확도 향상,출퇴근 브리핑 알림,캐릭터 시계 위젯,하차 5분 전 추천,다른 앱 위에 표시,개발자 도구,테마 설정,약관 및 정책', '카드 순서가 웹 설정 탭과 같다(아이디 · 알림 · 갤럭시 · 정확도 · 출퇴근 · 위젯 · 하차 추천 · 오버레이 · 개발자 · 테마 · 약관): ' + titles.join());
  ok(!s.body.some(n => n.t === 'panel' && n.kids[0] && n.kids[0].s === '기능 설정'), '한 칸짜리 \'기능 설정\' 묶음은 없다');
}
const EMOJI = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
ok(!nodes.some(n => [n.s, n.title, n.sub, n.hint].some(t => t && EMOJI.test(t))), '새 화면 글에는 이모지가 없다');
ok(JSON.stringify(E.settingsScreen({ cap: 3 }, full)) === JSON.stringify(s), '같은 입력 → 같은 출력');
const s2 = E.settingsScreen({ cap: 3 }, Object.assign({}, full, { th: 'pastel' }));
ok(s2.rev !== s.rev && s2.body.length === s.body.length, '테마가 바뀌면 rev 가 바뀐다');

// 숨김 규칙
const bare = E.settingsScreen({ cap: 3 }, {});
const bn = all(bare);
ok(bn.filter(n => n.t === 'toggle').map(n => n.key).join() === 'n.arrive,n.transfer,n.arrive_reco,rl', '사실이 없으면: 알림 3개(기본 켜짐) + 정확도만');
ok(bn.filter(n => n.t === 'toggle').every(n => n.on === true), '알림·기록 기본값은 켜짐');
ok(!bn.some(n => n.t === 'field' && n.value) && !bn.some(n => n.t === 'box'), '아이디·경고 상자 없음');
ok(bn.filter(n => n.t === 'button' && (n.act.v === 'saveId' || n.act.v === 'clearId')).length === 1, '아이디가 없으면 삭제 버튼 없음');
ok(bn.filter(n => n.t === 'select').find(n => n.on).act.v === 'pastel', '테마 기본 = 파스텔');
ok(!bn.some(n => n.act && n.act.v === 'sam'), '갤럭시가 아니면 갤럭시 칸 없음');
ok(bn.filter(n => n.t === 'navrow' && (n.act.v === 'cm' || n.act.v === 'ovl')).every(n => !n.sub), '모르는 상태는 오른쪽 글 없음');
const odd = E.settingsScreen({ cap: 3 }, { id: 'x'.repeat(50), errn: -5, th: 'zzz', np: 'bad', pt: 'zz', day: 5 });
ok(odd.ok && all(odd).find(n => n.t === 'field').value.length === 12, '이상한 사실은 걸러진다(아이디 12자로 자름)');

// ③ 앱 검증기 통과 — 사실을 여러 가지로 바꿔 가며 만든 화면을 모두 ScreenCore.load + layout 에 넣어 본다
{
  const lines = [], bools = [0, 1];
  let k = 0;
  for (const sam of bools) for (const npd of bools) for (const th of ['dark', 'pastel']) for (const id of ['', '길동무']) for (const on of bools) for (const fl of bools) {
    k++;
    lines.push(JSON.stringify(E.settingsScreen({ cap: 3 }, { id, npd, th, sam, samw: sam & fl, errn: k % 4, cm: k % 3 === 0 ? null : k % 2, ovl: k % 3 === 1 ? null : 1 - (k % 2), rl: on, np: { arrive: on, transfer: fl, arrive_reco: 1 - on }, pt: on ? { total: k * 7, today: k, todayStr: 'd', rc: k % 5, rcStr: 'd' } : null, day: 'd' })));
  }
  lines.push(JSON.stringify(s), JSON.stringify(bare));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'setchk_'));
  try {
    const f = path.join(dir, 'in.jsonl'), cls = path.join(dir, 'c');
    fs.writeFileSync(f, lines.join('\n') + '\n'); fs.mkdirSync(cls);
    const ENV = Object.assign({}, process.env, { JAVA_TOOL_OPTIONS: '' });
    let r = spawnSync('javac', ['-encoding', 'UTF-8', '-d', cls, R('native/shell/ScreenCore.java'), R('test/java/ScreenCheck.java')], { env: ENV, encoding: 'utf8' });
    ok(r.status === 0, 'ScreenCheck 컴파일 ' + (r.stderr || '').slice(0, 300));
    r = spawnSync('java', ['-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-cp', cls, 'com.dullyyj.subway.ScreenCheck', f], { env: ENV, encoding: 'utf8' });
    const out = (r.stdout || '').split('\n').filter(Boolean);
    ok(out.length === lines.length, '모든 화면에 결과가 나왔다 ' + out.length + '/' + lines.length);
    ok(out.every(l => l.startsWith('OK ')), '모든 화면이 앱 검증기를 통과 ' + out.filter(l => !l.startsWith('OK ')).slice(0, 3).join(' | '));
    ok(out.every(l => Number(l.split(' ')[2]) === 0), '건너뛴 노드 없음(앱이 모든 노드를 안다)');
    const h = out.filter(l => l.startsWith('OK ')).map(l => Number(l.split(' ')[3]));
    ok(Math.min.apply(null, h) > 800 && Math.max.apply(null, h) < 8200, '본문 높이가 정상 범위 ' + Math.min.apply(null, h) + '~' + Math.max.apply(null, h));
    // 옛 앱 시뮬: 앱이 모르는 새 노드(panel 등)뿐인 화면은 '그릴 것이 없다' 로 거절된다 → 웹 폴백 (JVM 시험에서 확인) — 여기선 cap 가 이를 사전에 막는다
  } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { } }
}

// ④ 웹 설정 화면과의 대응(폴백으로 남는 웹 카드가 같은 글·행동을 쓰는가)
{
  const has = t => html.indexOf(t) >= 0;
  ok(has('받고 싶은 알림만 골라서 켜고 끌 수 있어요. 끄면 진동도 함께 꺼져요.') && has('아이디는 이 기기에만 저장되며,<br>작성한 글·채팅에 표시됩니다.'), '웹: 알림·아이디 안내 문구 = 엔진 문구');
  E.SETTINGS_NOTIF.forEach(n => ok(has("title:'" + n.title + "'") && has("desc:'" + n.desc + "'"), '웹 알림 항목 문구 = 엔진: ' + n.title));
  ok(has('목적지에 도착하면 예상 시간과 실제 시간의 차이만 익명으로 보내요. 역 이름·위치·기기 정보는 보내지 않아요.'), '웹: 정확도 설명 = 엔진');
  ok(has("개인정보처리방침") && has("위치기반서비스 이용약관") && has("데이터 출처 및 고지"), '웹: 약관 항목 이름 = 엔진');
  ok(has('깊고 선명한 다크 테마') && has('맑고 시원한 하늘색 테마'), '웹: 테마 설명 = 엔진');
  ok(has('id="samSetCard"') && has('id="gwCard"') && has('id="ovlTestCard"') && has('id="cmAlarmOn"'), '웹: 웹 카드로 열 수 있는 요소가 있다');
}

// ⑧ 반응 속도 기록(s241): 개발자 도구에 앱이 모은 숫자를 글로 보인다
{
  const dev = pf => E.settingsScreen({ cap: 8, p: 'dev' }, { pf });
  const texts = sc => JSON.stringify(sc.body);
  ok(!/반응 속도 기록/.test(texts(dev({ nv: 1 }))), '기록이 안 오면(옛 앱) 칸이 없다');
  const P = { d: [120, 6, 60, 14], l: [30, 9, 48, 3], n: [['/screen/map', 12, 420, 1300, 1], ['/screen/home', 5, 900, 1500, 0]] };
  const sc = dev({ nv: 1, perf: P }), tx = texts(sc);
  ok(/반응 속도 기록/.test(tx) && /그리기  120회 · 평균 6ms · 최대 60ms · 느린 것 14회\(11\.7%\)/.test(tx) && /서버 \/screen\/map  12회 · 평균 420ms · 최대 1300ms · 실패 1회/.test(tx), '그리기 · 화면 구성 · 서버 줄');
  ok(/그리기가 자주 느려요/.test(tx) && /화면 구성이 느려요/.test(tx) && /서버 응답이 느려요: \/screen\/home/.test(tx), '판정: 느린 곳을 짚는다(그리기 5%↑ · 구성 최대 100ms · 서버 평균 800ms)');
  ok(/기록 지우기/.test(tx) && JSON.stringify(sc.body).indexOf('"perf.reset"') > 0, '지우기 단추');
  ok(/큰 문제 없음/.test(texts(dev({ nv: 1, perf: { d: [300, 3, 20, 4], l: [40, 5, 25, 0], n: [['/screen/map', 9, 300, 700, 0]] } }))), '문제 없으면 큰 문제 없음');
  ok(/기록이 적어요/.test(texts(dev({ nv: 1, perf: { d: [3, 3, 5, 0], l: [1, 2, 2, 0], n: [] } }))), '기록이 적으면 적다고');
  ok(dev({ nv: 1, perf: 'zz' }).ok && !/반응 속도 기록/.test(texts(dev({ nv: 1, perf: 'zz' }))), '이상한 기록은 무시');
}

// ⑦ 하위 화면(cap 8) — 예전에 웹 카드 시트로 열던 6개 + 시각 고르기 + 장소 고르기
{
  const PG = (p, pf, cap) => E.settingsScreen({ cap: cap == null ? 8 : cap, p }, { pf: pf || {} });
  const texts = sc => flat(sc.body).map(n => [n.s, n.title, n.sub, n.hint, n.name, n.label].filter(Boolean)).reduce((a, b) => a.concat(b), []);
  const acts = sc => { const o = []; (function w(ns) { ns.forEach(n => { if (n.act) o.push(n.act); if (n.bact) o.push(n.bact); if (n.kids) w(n.kids); }); })(sc.body); return o; };
  // 입구
  ok(PG('cm', {}, 3).ok === false && PG('cm', {}, 7).ok === false, '하위 화면은 cap 8 미만이면 만들지 않는다');
  ok(PG('nope').ok === false && E.settingsScreen({ cap: 8, p: '' }, {}).screen === 'settings', '모르는 화면은 거절 · p 가 없으면 설정 첫 화면');
  const s8 = E.settingsScreen({ cap: 8 }, full), navs8 = flat(s8.body).filter(n => (n.t === 'navrow' || n.t === 'button') && n.act && n.act.v && /^pg\./.test(n.act.v));
  ok(navs8.map(n => n.act.v).join() === 'pg.sam,pg.cm,pg.gw,pg.arr,pg.ovl,pg.dev', 'cap 8: 웹 카드 행이 하위 화면(pg.*)으로 이어진다 ' + navs8.map(n => n.act.v).join());
  ok(!flat(s8.body).some(n => n.act && n.act.a === 'web'), 'cap 8 에는 웹 카드 시트 행동이 남지 않는다');
  ok(flat(E.settingsScreen({ cap: 3 }, full).body).filter(n => n.act && n.act.a === 'web').length === 6, 'cap 3 은 예전 그대로(web 6개)');
  // 모든 하위 화면: 맨 위 '‹ 설정' 단추 · 이모지 없음 · 같은 입력 같은 출력 · 정보
  const names = Object.keys(E.SETTINGS_PAGES);
  names.forEach(p => {
    const sc = PG(p, {});
    ok(sc.ok && sc.screen === 'settings' && sc.cover === 'tab' && sc.info.page === p && /^s2p:/.test(sc.rev), p + ': 기본 모양/정보/rev');
    if (p === 'locd' || p === 'cmb' || /^ask/.test(p)) ok(sc.body[0].t === 'panel' && !JSON.stringify(sc).includes('pg.back'), p + ': 안내 화면은 뒤로 가기 단추가 없다(단추 둘만)');
    else ok(sc.body[0].t === 'button' && sc.body[0].s === '\u2039 \uc124\uc815' && sc.body[0].act.v === 'pg.back', p + ': 맨 위가 ‹ 설정(pg.back)');
    ok(!texts(sc).some(x => EMOJI.test(x)), p + ': 이모지 없음');
    ok(JSON.stringify(PG(p, {})) === JSON.stringify(sc) && PG(p, { x: 1 }).rev === sc.rev, p + ': 같은 입력 → 같은 출력, 모르는 사실은 무시');
  });
  ok(PG('cm', { sub: 'tp', tp: { t: 'morn', ap: 'am', h: 7, m: 30 } }).body[0].s === '\u2039 \ucd9c\ud1f4\uadfc \ube0c\ub9ac\ud551 \uc54c\ub9bc' && PG('cm', { sub: 'pick', pick: { k: 'to', q: '' } }).body[0].s === '\u2039 \ucd9c\ud1f4\uadfc \ube0c\ub9ac\ud551 \uc54c\ub9bc', '시각/장소 고르기의 뒤로 단추는 출퇴근 브리핑 알림으로 돌아간다');
  // 행동 이름은 허용 목록 모양만
  const ALLOW = /^(pg\.back|pol\.(privacy|location|opensource)|erl\.(copy|clear)|locd\.(ok|no)|ask\.(ok|no)|sam\.open|bat\.req|ovl\.diag|pf\.(live|rec)|dev\.(start\.(all|plain|reco|alert2|alert1|quit)|stop)|arr\.(t\.(morning|lunch|night|shop)|demo|stat)|gw\.(add\.(hb|hw|vb|vw)|roam\.(dn|up))|cm\.(day\.[0-6]|preset\.(weekday|weekend|all)|tp\.(morn|eve)|test|pick\.(from|to|eFrom|eTo))|cmb\.(ok|go)|tp\.(ap\.(am|pm)|h\.([1-9]|1[0-2])|m\.([0-9]|[1-5][05])|ok|cancel)|pk\.(save|clear|cancel|u\.\d{1,2}|b\.\d{1,2}))$/;
  names.concat(['tp', 'pick']).forEach(p => {
    const sc = p === 'tp' ? PG('cm', { sub: 'tp', tp: { t: 'eve', ap: 'pm', h: 6, m: 30 } }) : p === 'pick' ? PG('cm', { sub: 'pick', pick: { k: 'to', q: '강' }, bus: ['강남역', '강남역', '강동'] }) : PG(p, {});
    const bad = acts(sc).filter(a => !(a.a === 'call' && ALLOW.test(a.v)));
    ok(bad.length === 0, p + ': 모든 행동이 허용 목록 안 ' + JSON.stringify(bad.slice(0, 2)));
  });
  // 갤럭시 절전
  let sc = PG('sam', { w: 1, ig: 1, bk: 5, sok: 1 }), tx = texts(sc);
  ok(tx.some(x => x === '현재 상태 · 배터리 최적화 제외: 예 · 앱 배터리 제한: 제한됨 · 기기가 보는 앱 등급: 제한'), '갤럭시: 읽은 상태를 문장으로');
  ok(tx.some(x => /^이 앱의 배터리 사용이 제한됨으로/.test(x)) && tx.some(x => /^앱 배터리가 제한 없음이면 삼성 목록/.test(x)), '갤럭시: 제한됨 경고 · 제한 없음 안내(제외됨일 때)');
  sc = PG('sam', {}); tx = texts(sc);
  ok(tx.includes('현재 상태: 확인 중…') && !tx.some(x => /^이 앱의 배터리 사용이/.test(x)), '갤럭시: 아직 못 읽었으면 확인 중, 경고 없음');
  ok(texts(PG('sam', { er: 1 })).includes('현재 상태: 읽지 못했어요'), '갤럭시: 읽기 실패 문구');
  ok(texts(PG('sam', { w: 0, ig: 0, bk: 3, sok: 1 })).includes('현재 상태 · 배터리 최적화 제외: 아니요 · 앱 배터리 제한: 제한 없음/최적화 · 기기가 보는 앱 등급: 자주 사용'), '갤럭시: 제한 없음/등급 이름');
  // 다른 앱 위에 표시
  const OV = (o) => texts(PG('ovl', o)).find(x => /지원|사용 중|권한|꺼져/.test(x) && !/^다른 앱을 쓰는 동안/.test(x));
  ok(OV({ nat: 0 }) === '이 앱 버전에서는 지원하지 않아요.' && OV({ sup: 0 }) === '이 기기(안드로이드 8 미만)에서는 지원하지 않아요.', '오버레이: 지원 안 함 문구 2종');
  ok(OV({ gr: 1, on: 1 }) === '사용 중 · 다른 앱을 쓰는 동안 위쪽에 표시돼요.' && OV({ gr: 1, on: 0 }) === '권한은 허용됨 · 지금은 꺼져 있어요.', '오버레이: 허용됨 켜짐/꺼짐');
  ok(OV({ gr: 0, on: 1 }) === "권한이 필요해요 · 설정에서 '다른 앱 위에 표시'를 허용해 주세요." && OV({ gr: 0, on: 0 }) === '꺼져 있어요.' && OV({ on: 0 }) === '꺼져 있어요.', '오버레이: 권한 없음/모름');
  sc = PG('ovl', { on: 1, pfl: 1, pfr: 0 });
  ok(flat(sc.body).find(n => n.t === 'toggle').key === 'ovl' && flat(sc.body).find(n => n.t === 'toggle').on === true, '오버레이: 스위치 키 ovl');
  tx = texts(sc);
  ok(tx.includes('새 위치 판단기 보정: 켜짐 (누르면 끔)') && tx.includes('정답 기록 버튼: 꺼짐 (테스트 탑승용)'), '오버레이: 보정/기록 버튼 글이 상태에 따라');
  const pb = flat(sc.body).filter(n => n.t === 'button');
  ok(pb.find(n => /^새 위치/.test(n.s)).fill === 'gold' && pb.find(n => /^정답/.test(n.s)).fill === 'none', '오버레이: 켜진 버튼은 금색');
  // 개발자 도구
  tx = texts(PG('dev', { ph: 'alert1', left: 42 }));
  ok(tx.includes('진행 중 · 지금 단계: 1정거장 전(내릴 준비) · 42초 남음'), '개발자: 진행 중 문구');
  ok(texts(PG('dev', { stopped: 1 })).includes('중지했어요.') && !texts(PG('dev', {})).some(x => /진행 중|중지했어요/.test(x)), '개발자: 중지/아무 것도 안 함');
  ok(flat(PG('dev', {}).body).filter(n => n.t === 'row')[0].kids.map(k => k.act.v).join() === 'dev.start.plain,dev.start.reco,dev.start.alert2,dev.start.alert1', '개발자: 단계 단추 4개가 한 줄');
  { const tn = texts(PG('dev', { nv: 1 })).join('\n'), tw = texts(PG('dev', {})).join('\n');
    ok(/주황 막대/.test(tn) && /빨간 막대/.test(tn) && /끌어 옮길 수 있고/.test(tn) && !/알약|무지개|캐릭터|맛집/.test(tn), '개발자(nv): 떠 있는 안내 막대 기준 설명(알약·무지개·캐릭터 없음)');
    ok(/알약/.test(tw) && /무지개/.test(tw) && !/주황 막대/.test(tw), '개발자(웹 기준): 알약·무지개 설명 그대로'); }
  // 약관 · 오류 로그 · 위치 안내
  { const pol = ['polp', 'poll', 'polo'].map(p => texts(PG(p, {})).join('\n'));
    ok(/개인정보처리방침/.test(pol[0]) && /1\. 수집하는 항목/.test(pol[0]) && /7\. 문의\nphg0643@gmail\.com/.test(pol[0]) && /시행일 · 최종 개정일: 2026-10-03/.test(pol[0]), '약관: 개인정보처리방침 본문');
    ok(/제1조 \(목적\)/.test(pol[1]) && /제7조 \(문의\)/.test(pol[1]) && /서버에 저장하거나 제3자에게 제공하지 않습니다/.test(pol[1]), '약관: 위치기반서비스 이용약관 본문');
    ok(/쿠팡 파트너스 활동/.test(pol[2]) && /공공누리 제1유형/.test(pol[2]) && /추정치/.test(pol[2]), '약관: 데이터 출처 및 고지(제휴 고지 · 출처 표시)');
    ok(!pol.some(x => /<\/?[a-z]+>|&gt;|&amp;/.test(x)), '약관: 태그 찌꺼기 없음');
    const hl = flat(PG('polp', {}).body).filter(n => n.t === 'text' && n.hl);
    ok(hl.length >= 5 && hl.every(n => n.hl.every(r => r[0] >= 0 && r[1] <= n.s.length && r[0] < r[1])), '약관: 굵은 글씨 구간이 글 안에 있다'); }
  { const E1 = [{ t: '10-21 06:00', m: 'NullPointerException: x', f: 'A.java:3', s: 'A.f:3\nB.g:9', n: 2 }, { t: '10-21 06:10', m: 'IllegalStateException', f: 'B.java:7', s: '', n: 1 }];
    const t0 = texts(PG('erl', {})), t1 = texts(PG('erl', { errs: E1 }));
    ok(t0.includes('기록된 오류가 없습니다.') && t0.includes('오류 로그') && !acts(PG('erl', {})).some(a => /^erl\./.test(a.v)), '오류 로그: 없으면 안내만(복사/지우기 없음)');
    ok(t1.includes('오류 로그 2건') && t1.indexOf('IllegalStateException') < t1.indexOf('NullPointerException: x'), '오류 로그: 최신이 위');
    ok(t1.includes('10-21 06:00 · 2회') && t1.includes('A.java:3') && t1.includes('A.f:3\nB.g:9'), '오류 로그: 횟수 · 위치 · 흔적');
    ok(acts(PG('erl', { errs: E1 })).map(a => a.v).filter(v => /^erl\./.test(v)).join() === 'erl.copy,erl.clear', '오류 로그: 복사 · 지우기');
    ok(texts(PG('erl', { errs: new Array(80).fill(E1[0]) })).filter(x => x === 'NullPointerException: x').length === 40, '오류 로그: 최대 40건만')
    const tm = texts(PG('erl', { errs: E1, more: 30 }));
    ok(tm.includes('오류 로그 32건') && tm.some(x => /최근 2건만 보여 드려요\. 오래된 30건은 \[복사\]로/.test(x)) && !texts(PG('erl', { errs: E1 })).some(x => /건만 보여 드려요/.test(x)), 's266: 오류 로그: 주소 한도로 일부만 받았으면(more) 전체 건수와 안내를 보여 준다'); }
  { const t = texts(PG('locd', {})).join('\n'), a = acts(PG('locd', {})).map(x => x.v).join();
    ok(/백그라운드 위치 데이터를 수집/.test(t) && /하차역·환승역 도착 알림/.test(t) && /저장하지 않습니다/.test(t), '위치 안내: 고지 글');
    ok(a === 'locd.no,locd.ok,pol.privacy', '위치 안내: 거부 · 동의 · 방침 보기'); }
  { const tb = texts(PG('askbat', {})).join('\n'), ts = texts(PG('askbat', { sm: 1 })).join('\n'), tm = texts(PG('asksam', {})).join('\n'), to = texts(PG('askovl', {})).join('\n');
    ok(/배터리 최적화에서 길동무를 제외/.test(tb) && !/자동 절전/.test(tb) && /삼성·샤오미/.test(tb), 's180 배터리 안내: 일반 기기 글');
    ok(/자동 절전에서 제외/.test(ts) && /\[설정하기\] 한 번이면 이어서 안내해요/.test(ts) && /One UI/.test(ts), 's180 배터리 안내: 갤럭시는 절전 제외까지 한 창');
    ok(/자동으로 절전하지 않는 앱/.test(tm) && /③ 길동무를 체크/.test(tm), 's180 갤럭시 절전 안내');
    ok(/현재 역과 남은 시간/.test(to) && /다른 앱 위에 표시를 켬으로/.test(to) && /광고는 넣지 않아요/.test(to), 's180 다른 앱 위에 표시 안내');
    ['askbat', 'asksam', 'askovl'].forEach(n => ok(acts(PG(n, {})).map(x => x.v).join() === 'ask.no,ask.ok', n + ': 나중에 · 설정하기 둘뿐')); }
  // 하차 5분 전 추천 시험
  ok(texts(PG('arr', {})).includes("'상태 확인'을 누르면 감시 상태와 남은 시간이 표시됩니다."), '추천 시험: 처음 안내');
  const ST = { timer: 1, route: 1, dest: '강남', rem: 725, pre: 10, slot: 'night', dinner: 0, alertAt: Date.UTC(2026, 9, 19, 6, 7, 12), tickAt: Date.UTC(2026, 9, 19, 6, 8, 0), tzo: -540, policy: 1, dg: { stage: '문구 생성', at: Date.UTC(2026, 9, 19, 6, 7, 11), err: '' } };
  const lines = E.settingsArrLines(E.settingsPageFacts({ st: ST }).st);
  ok(lines.join('|') === ['감시 타이머: 동작 중 (20초마다)', '현재 경로: 강남 도착 예정', '남은 시간: 12분 5초  (10분 되면 발사)', '지금 시간대: 야식 (19:00~21:00)', '마지막 발송: 오후 3:07:12  (30분간 재발송 안 함)', '알림 정책: 허용됨', '마지막 감시: 오후 3:08:00', '발사 경과: 문구 생성  (오후 3:07:11)'].join('|'), '추천 시험: 상태 줄 ' + lines.join(' | '));
  const L2 = E.settingsArrLines(E.settingsPageFacts({ st: { slot: 'morning', rem: 300, pre: 10 } }).st);
  ok(L2[0] === '감시 타이머: 없음' && L2[1] === '현재 경로: 없음 (탑승 상태 아님)' && L2[2] === '남은 시간: 5분 0초  (발사 구간)' && L2[3] === '지금 시간대: 커피 (07:01~10:00)' && L2[4] === '마지막 발송: 없음' && L2[5] === '알림 정책: 차단됨' && L2[6] === '마지막 감시: 없음' && L2[7] === '발사 경과: 없음', '추천 시험: 비어 있는 상태 줄들');
  ok(E.settingsArrLines(E.settingsPageFacts({ st: { slot: 'night', dinner: 1, rem: null } }).st)[2] === '남은 시간: 아직 측정 전' && E.settingsArrLines(E.settingsPageFacts({ st: { slot: 'night', dinner: 1 } }).st)[3] === '지금 시간대: 저녁 식사 (17:00~18:59)', '추천 시험: 측정 전 · 저녁 식사');
  ok(E.settingsArrLines(E.settingsPageFacts({ st: { err: 'x' } }).st)[0] === '상태 확인 오류: x', '추천 시험: 읽다 실패');
  ok(flat(PG('arr', { st: ST }).body).filter(n => n.t === 'box').some(n => n.s.split('\n').length === 8), '추천 시험: 상태 상자에 줄이 8개');
  {
    const nvArr = PG('arr', { nv: 1, st: { timer: 1, route: 1, pre: 7, rem: 600, dest: '강남' } });
    const nvTxt = flat(nvArr.body).map(n => n.s || n.title || '').join('\n');
    ok(/하차 7분 전 추천/.test(nvTxt) && !/arr\.demo/.test(JSON.stringify(nvArr.body)) && !/오버레이 아래에도 90초/.test(nvTxt), '추천 시험(앱): 제목 7분 · 캐릭터 미리보기 버튼 없음');
    ok(/탑승 안내: 동작 중 \(5초마다 확인\)/.test(nvTxt) && /7분 되면 발사/.test(nvTxt), '추천 시험(앱): 상태 문구가 앱 방식(5초 · 7분)');
    ok(/arr\.demo/.test(JSON.stringify(PG('arr', {}).body)), '추천 시험(예전 웹 방식)은 미리보기 버튼이 그대로');
  }
  {
    const navV = sc => flat(sc.body).filter(n => (n.t === 'navrow' || n.t === 'button') && n.act && /^pg\./.test(n.act.v)).map(n => n.act.v);
    const all8 = E.settingsScreen({ cap: 8 }, { sam: 1 }), some8 = E.settingsScreen({ cap: 8 }, { sam: 1, pgs: ['sam', 'ovl', 'arr'] });
    ok(['pg.cm', 'pg.gw', 'pg.arr', 'pg.ovl', 'pg.dev', 'pg.sam'].every(v => navV(all8).includes(v)), 'pgs 가 없으면 하위 화면 줄이 모두 보인다');
    ok(navV(some8).sort().join() === 'pg.arr,pg.ovl,pg.sam', 'pgs 에 든 화면 줄만 보인다: ' + navV(some8).join());
    ok(flat(some8.body).some(n => n.t === 'text' && n.s === '하차 7분 전 추천') && !flat(some8.body).some(n => n.t === 'text' && n.s === '하차 5분 전 추천'), 'pgs 가 있으면 하차 추천 카드 제목이 7분');
  }
  {
    const cmT = pf => flat(PG('cm', pf).body).map(n => n.s || n.title || '').join('\n');
    ok(/날씨 \+ 혼잡도 \+ 준비물 한마디/.test(cmT({ nv: 1, on: 1 })) && /절전 설정에 따라/.test(cmT({ nv: 1 })) && !/AI 역무원/.test(cmT({ nv: 1 })), '출퇴근(앱): 실제 내용에 맞는 안내 · 절전 안내');
    ok(/AI 역무원 요약/.test(cmT({})) && !/절전 설정에 따라/.test(cmT({})), '출퇴근(웹 방식)은 그대로');
  }
  // 시계 위젯
  sc = PG('gw', { roam: 6, mOn: 1, eOn: 0, morn: '07:30' }); tx = texts(sc);
  ok(tx.includes('6분 (추천)') && tx.includes('출근 07:30 에 위젯이 응원해요') && tx.some(x => /^6분 추천이에요\. 그보다 길면/.test(x)), '시계 위젯: 6분 추천 · 응원 시각 글');
  ok(texts(PG('gw', { roam: 9, mOn: 1, eOn: 1, morn: '07:30', eve: '18:30' })).some(x => x === '출근 07:30 · 퇴근 18:30 에 위젯이 응원해요') && texts(PG('gw', { roam: 9 })).some(x => /^6분 추천이에요\. 그보다 길게 두면/.test(x)) && texts(PG('gw', { roam: 9 })).includes('9분'), '시계 위젯: 출퇴근 둘 다 · 6분보다 길면 다른 안내 · 9분');
  ok(texts(PG('gw', {})).includes('출·퇴근 장소를 설정하면 그 쪽 버튼이 나와요.'), '시계 위젯: 장소 없을 때');
  ok(flat(PG('gw', {}).body).filter(n => n.t === 'row').slice(0, 2).map(r => r.kids.map(k => k.act.v).join()).join('|') === 'gw.add.hb,gw.add.hw|gw.add.vb,gw.add.vw', '시계 위젯: 추가 단추 2줄');
  ok(PG('gw', { roam: 99 }).body.length === PG('gw', { roam: 6 }).body.length && texts(PG('gw', { roam: 99 })).includes('6분 (추천)'), '시계 위젯: 이상한 값(99)은 6분');
  // 출퇴근 브리핑
  sc = PG('cm', { on: 1, from: '아라', to: '강남', morn: '07:30', eve: '18:05', days: [1, 2, 3, 4, 5] }); tx = texts(sc);
  ok(flat(sc.body).find(n => n.t === 'toggle').key === 'cm' && flat(sc.body).find(n => n.t === 'toggle').on === true, '출퇴근: 스위치 키 cm');
  ok(tx.includes('오전 7:30') && tx.includes('오후 6:05') && tx.includes('선택한 5일에만 보내요.') && tx.includes('비워 두면 출근의 반대 — 강남 → 아라 로 보내요.'), '출퇴근: 시각 글 · 요일 안내 · 퇴근 힌트');
  const dk = flat(sc.body).filter(n => n.t === 'row'); const dayRow = dk.find(r => r.kids.length === 7), preRow = dk.find(r => r.kids.length === 3 && r.kids[0].s === '평일');
  ok(dayRow.kids.map(k => k.s).join('') === '일월화수목금토' && dayRow.kids.map(k => k.fill === 'gold' ? 1 : 0).join('') === '0111110', '출퇴근: 요일 칸(평일만 선택)');
  ok(dayRow.kids[0].tc === '#e5484d' && dayRow.kids[6].tc === '#2f6fed', '출퇴근: 일요일 빨강 · 토요일 파랑 글자(선택 안 됐을 때)');
  ok(preRow.kids.map(k => k.fill === 'gold' ? 1 : 0).join('') === '100', '출퇴근: 평일 묶음이 선택됨');
  ok(E.settingsPageFacts({ days: [0, 6] }).days.join() === '0,6' && flat(PG('cm', { days: [0, 6] }).body).find(r => r.t === 'row' && r.kids[0].s === '평일').kids.map(k => k.fill === 'gold' ? 1 : 0).join('') === '010', '출퇴근: 주말 묶음');
  ok(texts(PG('cm', { days: [] })).includes('요일을 하나도 고르지 않아 매일 보내요.') && flat(PG('cm', {}).body).find(r => r.t === 'row' && r.kids[0].s === '평일').kids.every(k => k.fill !== 'gold'), '출퇴근: 요일이 없으면 매일 안내 · 묶음 선택 없음');
  ok(E.settingsEveHint({ eFrom: '', eTo: '', from: '', to: '' }) === '비워 두면 출근의 반대 방향으로 보내요.' && E.settingsEveHint({ eFrom: '회사', eTo: '', from: '', to: '' }) === '퇴근은 따로 설정한 곳으로 보내요. (한쪽만 채우면 나머지는 출근의 반대편을 써요)' && E.settingsEveHint({ eFrom: '회사', eTo: '집', from: '', to: '' }) === '퇴근은 따로 설정한 곳으로 보내요.', '출퇴근: 퇴근 힌트 3가지');
  const pn = flat(sc.body).filter(n => n.t === 'button' && n.al === 'left');
  ok(pn.map(n => n.act.v).join() === 'cm.pick.from,cm.pick.to,cm.pick.eFrom,cm.pick.eTo' && pn[0].s === '아라' && pn[0].tc === 'text' && pn[2].s === '비우면 회사 근처 역' && pn[2].tc === 'sub' && pn[1].s.length > 0, '출퇴근: 장소 4칸은 웹 입력칸 모양(값 또는 흐린 안내 글)');
  const lr = flat(sc.body).filter(n => n.t === 'row' && n.kids.length === 2 && n.kids[0].t === 'text');
  ok(lr.length >= 2 && lr[0].kids.map(k => k.s).join('|') === '출근 출발지 (집 근처)|출근 도착지 (회사 근처)' && lr[1].kids.map(k => k.s).join('|') === '퇴근 출발지|퇴근 도착지', '출퇴근: 출발·도착이 두 칸씩 나란히(이름이 위)');
  ok(!flat(sc.body).some(n => n.t === 'navrow'), '출퇴근: 목록 화살표 줄 없음');
  ok(E.settingsFmtTime('00:05') === '오전 12:05' && E.settingsFmtTime('12:00') === '오후 12:00' && E.settingsFmtTime('23:59') === '오후 11:59', '출퇴근: 시각 글 경계(자정·정오)');
  ok(E.settingsPageFacts({ morn: '25:00', eve: 'x' }).morn === '07:30' && E.settingsPageFacts({ eve: '9:05' }).eve === '09:05', '출퇴근: 이상한 시각은 기본값 · 한 자리 시는 두 자리로');
  // 시각 고르기
  sc = PG('cm', { sub: 'tp', tp: { t: 'eve', ap: 'pm', h: 6, m: 35 } }); tx = texts(sc);
  ok(sc.info.sub === 'tp' && tx.includes('퇴근 브리핑 시간') && tx.includes('오후 6:35'), '시각 고르기: 제목 · 지금 고른 시각');
  const rows = flat(sc.body).filter(n => n.t === 'row');
  ok(rows.length === 6 && rows[0].kids.map(k => k.s).join() === '오전,오후' && rows[0].kids[1].fill === 'gold' && rows[0].kids[0].fill === 'none', '시각 고르기: 오전/오후 중 오후 선택');
  ok(rows[1].kids.map(k => k.s).join('') === '123456' && rows[2].kids.map(k => k.s).join('') === '789101112' && rows[1].kids.map(k => k.fill === 'gold' ? 1 : 0).join('') === '000001' && rows[2].kids.every(k => k.fill === 'none'), '시각 고르기: 시 12칸(6이 선택)');
  ok(rows[3].kids.map(k => k.s).join() === '00,05,10,15,20,25' && rows[4].kids.map(k => k.s).join() === '30,35,40,45,50,55' && rows[4].kids.map(k => k.fill === 'gold' ? 1 : 0).join('') === '010000', '시각 고르기: 분 12칸(35가 선택)');
  ok(rows[5].kids.map(k => k.act.v).join() === 'tp.cancel,tp.ok' && rows[5].kids[1].fill === 'gold', '시각 고르기: 취소/확인');
  ok(E.settingsPageFacts({ sub: 'tp', tp: { m: 37 } }).tp.m === 35 && E.settingsPageFacts({ sub: 'tp', tp: { h: 40, m: 99 } }).tp.h === 7, '시각 고르기: 분은 5분 단위로 내림 · 이상한 값은 기본');
  ok(texts(PG('cm', { sub: 'tp' })).includes('출근 브리핑 시간') && texts(PG('cm', { sub: 'tp' })).includes('오전 7:30'), '시각 고르기: 사실이 없어도 그려진다(기본 오전 7:30)');
  // 장소 고르기
  sc = PG('cm', { sub: 'pick', pick: { k: 'to', q: '강남' }, bus: ['강남역', '강남역', '강남구청', '', '강남대로'] });
  const sugs = flat(sc.body).filter(n => n.t === 'sug'), ib = flat(sc.body).find(n => n.t === 'inbar');
  ok(sc.info.sub === 'pick' && ib && ib.key === 'cmq' && ib.value === '강남' && ib.watch === true && ib.hint === '지하철·버스 (예: 강남)' && ib.act.v === 'pk.save', '장소 고르기: 입력줄(감시) · 힌트 · 저장');
  ok(texts(sc).includes('출근 도착지 (회사 근처)'), '장소 고르기: 제목');
  const su = sugs.filter(n => n.badge === '지하철'), sb = sugs.filter(n => n.badge === '버스');
  ok(su.length >= 1 && su[0].name.indexOf('강남') === 0 && su.every(n => /^pk\.u\.\d+$/.test(n.act.v)), '장소 고르기: 지하철 후보 = 엔진 역 표(이름이 먼저 시작하는 순) ' + su.map(n => n.name).join());
  ok(sb.map(n => n.name).join() === '강남역,강남구청,강남대로' && sb.map(n => n.act.v).join() === 'pk.b.0,pk.b.2,pk.b.4' && JSON.stringify(sc.info.pk.b) === '[0,2,4]', '장소 고르기: 버스 후보는 같은 이름 하나로, 원래 번호를 돌려준다');
  ok(PG('cm', { sub: 'pick', pick: { k: 'to', q: '강남' }, bus: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }).info.pk.b.length === 5, '장소 고르기: 버스 후보는 5개까지');
  ok(sugs[sugs.length - 1].last === true && sugs.slice(0, -1).every(n => !n.last), '장소 고르기: 마지막 줄만 last');
  ok(sc.info.pk.u.length === su.length && sc.info.pk.u[0].name === su[0].name, '장소 고르기: 고른 번호 → 이름은 info.pk.u');
  const st1 = E.settingsStnFind('아라역'), st2 = E.settingsStnFind('아 라');
  ok(st1.u.length > 0 && JSON.stringify(st1) === JSON.stringify(st2), '장소 고르기: 끝 "역" 과 공백을 떼고 찾는다(예전 _cmSug 와 같다)');
  ok(E.settingsStnFind('').u.length === 0 && E.settingsStnFind('가').u.length <= 12, '장소 고르기: 빈 글은 없음 · 최대 12');
  ok(texts(PG('cm', { sub: 'pick', pick: { k: 'eFrom', q: '' } })).some(x => /비우면 회사 근처 역/.test(x)) && flat(PG('cm', { sub: 'pick', pick: { k: 'eFrom', q: '' } }).body).filter(n => n.t === 'sug').length === 0, '장소 고르기: 빈 글이면 후보 없음 · 퇴근 출발지 힌트');
  ok(texts(PG('cm', { sub: 'pick', pick: { k: 'to', q: 'zzzzqq' } })).some(x => /^맞는 역이나 정류장을 찾지 못했어요/.test(x)), '장소 고르기: 못 찾았을 때 안내');
  // 모든 하위 화면이 앱 검증기를 통과한다
  const cases = [];
  names.forEach(p => { cases.push(PG(p, {})); });
  cases.push(PG('sam', { w: 1, ig: 1, bk: 4, sok: 1 }), PG('ovl', { nat: 1, sup: 1, gr: 1, on: 1, pfl: 1, pfr: 1 }), PG('dev', { ph: 'reco', left: 20 }), PG('dev', { stopped: 1 }), PG('arr', { st: ST }), PG('arr', { st: { err: '오류' } }),
    PG('gw', { roam: 3, mOn: 1, eOn: 1 }), PG('cm', { on: 1, from: '아라', to: '강남', eFrom: '서울', eTo: '', days: [0, 1, 2, 3, 4, 5, 6] }), PG('cm', { days: [3] }),
    PG('cm', { sub: 'tp', tp: { t: 'morn', ap: 'am', h: 12, m: 0 } }), PG('cm', { sub: 'tp', tp: { t: 'eve', ap: 'pm', h: 1, m: 55 } }),
    PG('cm', { sub: 'pick', pick: { k: 'from', q: '아라' }, bus: ['아라동주민센터'] }), PG('cm', { sub: 'pick', pick: { k: 'eTo', q: '' } }), PG('cm', { sub: 'pick', pick: { k: 'to', q: 'qqqq' } }));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'setpg_'));
  try {
    const f = path.join(dir, 'in.jsonl'), cls = path.join(dir, 'c');
    fs.writeFileSync(f, cases.map(c => JSON.stringify(c)).join('\n') + '\n'); fs.mkdirSync(cls);
    const ENV = Object.assign({}, process.env, { JAVA_TOOL_OPTIONS: '' });
    let r = spawnSync('javac', ['-encoding', 'UTF-8', '-d', cls, R('native/shell/ScreenCore.java'), R('test/java/ScreenCheck.java')], { env: ENV, encoding: 'utf8' });
    ok(r.status === 0, '하위 화면: ScreenCheck 컴파일 ' + (r.stderr || '').slice(0, 300));
    r = spawnSync('java', ['-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-cp', cls, 'com.dullyyj.subway.ScreenCheck', f], { env: ENV, encoding: 'utf8' });
    const out = (r.stdout || '').split('\n').filter(Boolean);
    ok(out.length === cases.length && out.every(l => l.startsWith('OK ')), '하위 화면 ' + cases.length + '가지가 앱 검증기를 모두 통과 ' + out.filter(l => !l.startsWith('OK ')).slice(0, 3).join(' | '));
    ok(out.every(l => Number(l.split(' ')[2]) === 0), '하위 화면: 건너뛴 노드 없음');
  } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { } }
  // 웹 카드(폴백)와 같은 글을 쓰는가
  const has = t => html.indexOf(t) >= 0;
  ok(has('갤럭시는 며칠 안 쓴 앱을 자동 절전시켜 화면이 꺼진 동안의 하차 알림이 멈출 수 있어요.') && has('권한은 허용됨 · 지금은 꺼져 있어요.') && has("사용 중 · 다른 앱을 쓰는 동안 위쪽에 표시돼요."), '웹: 갤럭시/오버레이 문구 = 엔진');
  ok(has('설정한 시각에 <b style="color:var(--text);">날씨 + AI 역무원 요약</b>을 알림으로 보내드려요.') && has("도착 5분 전에 시간대별로 보내는 추천이에요. 실제 알림과 같은 내용으로 바로 확인해 볼 수 있어요.") && has('캐릭터 하나가 오른쪽에서 추천 줄(실제 가게·쿠팡 상품 이름)을 끌고 들어오는 모습을 14초간 보여 줘요'), '웹: 출퇴근/추천 시험 문구 = 엔진');
  ok(has('비워 두면 출근의 반대 — ') && has("'선택한 ' + on.length + '일에만 보내요.'") && has("'요일을 하나도 고르지 않아 매일 보내요.'") && has('커피 (07:01~10:00)') && has('추천 없는 시간대 (00:00~07:00)'), '웹: 힌트·요일·시간대 글 = 엔진');
}

// ⑤ 워커 내장 사본
{
  const w = fs.readFileSync(R('engine/route-v2-worker.ascii.js'), 'utf8');
  const ms = '// ===== SETTINGS ENGINE BEGIN =====', me = '// ===== SETTINGS ENGINE END =====';
  const i = w.indexOf(ms), j = w.indexOf(me);
  ok(i > 0 && j > i, '워커에 설정 엔진이 내장돼 있다');
  const esc = t => t.replace(/[\u0080-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  let src = fs.readFileSync(R('engine/settings.js'), 'utf8'); src = src.slice(0, src.indexOf('if (typeof module')).trimEnd();
  const body = w.slice(i + ms.length, j);
  ok(body.indexOf(esc(src)) >= 0, '워커 내장 사본이 engine/settings.js 와 같다');
  ok(body.indexOf(esc(fs.readFileSync(R('engine/settings-worker.js'), 'utf8').trimEnd())) >= 0, '워커 연결부도 같다');
  ok(w.indexOf('if (url.pathname === "/screen/settings") return handleScreenSettings(request);') > 0, '경로 등록');
  ok(!/[^\x00-\x7f]/.test(body), '내장 블록은 ASCII 만');
}

// ⑥ 워커 끝에서 끝까지
{
  const txtOf = o => JSON.stringify(o.body);
  const web = E.settingsScreen({ cap: 8, p: 'ovl' }, { pf: { nat: true, sup: true, gr: true, on: true } }), nat = E.settingsScreen({ cap: 8, p: 'ovl' }, { pf: { nat: true, sup: true, gr: true, on: true, nv: true } });
  ok(/ovl\.diag/.test(txtOf(web)) && /pf\.rec/.test(txtOf(web)), '웹: 오버레이 진단·정답 기록 버튼이 있다');
  ok(!/ovl\.diag/.test(txtOf(nat)) && !/pf\.rec/.test(txtOf(nat)) && /pf\.live/.test(txtOf(nat)) && /"key":"ovl"/.test(txtOf(nat)), '네이티브(nv): 웹 진단 도구는 빼고 스위치와 위치 판단기 버튼만');
}
// ── s278: 출퇴근 브리핑을 설정 화면 안에(하위 화면 없이) · 장소는 그 자리 입력칸 + 후보 줄 ──
{
  const cmf = { nat: true, nv: true, on: true, days: [1, 2, 3, 4, 5], morn: '07:30', eve: '18:30', from: '아라', to: '', eFrom: '', eTo: '' };
  const base = Object.assign({}, full, { pgs: ['sam', 'ovl', 'arr', 'cm', 'gw', 'dev'], cm: 1 });
  const nav = JSON.stringify(E.settingsScreen({ cap: 8 }, base).body);
  ok(/시간 · 장소 · 요일 설정/.test(nav) && !/cmp\./.test(nav), '옛 앱(cmi 없음): 예전 그대로 \'시간 · 장소 · 요일 설정\' 줄 → 하위 화면');
  const sc = E.settingsScreen({ cap: 8 }, Object.assign({}, base, { cmi: 1, cmf }));
  const js = JSON.stringify(sc.body), nd = all(sc);
  ok(!/시간 · 장소 · 요일 설정/.test(js), '새 앱(cmi): 하위 화면으로 가는 줄이 없다');
  const ibs = nd.filter(n => n.t === 'inbar' && /^cmp\./.test(n.key));
  ok(ibs.map(n => n.key).join() === 'cmp.from,cmp.to,cmp.eFrom,cmp.eTo' && ibs.every(n => n.watch && n.btn === '저장' && n.act.v === 'pk.save.' + n.key.slice(4) && n.eact.v === n.act.v), '장소 네 칸은 그 자리 입력칸(저장 단추 · 엔터 · 글자 바뀜 알림)');
  ok(ibs[0].value === '아라' && ibs[1].value === '', '저장된 값이 칸에 들어 있다');
  ok(nd.some(n => n.t === 'toggle' && n.key === 'cm' && n.on === true) && nd.some(n => n.t === 'button' && n.act && n.act.v === 'cm.tp.morn') && nd.some(n => n.t === 'button' && n.act && n.act.v === 'cm.day.1') && nd.some(n => n.t === 'button' && n.act && n.act.v === 'cm.test'), '스위치 · 요일 · 시각 · 미리보기가 같은 화면 안에');
  ok(nd.filter(n => n.t === 'sug').length === 0, '고치는 중이 아니면 후보 줄이 없다');
  const sc2 = E.settingsScreen({ cap: 8 }, Object.assign({}, base, { cmi: 1, cmf: Object.assign({}, cmf, { pick: { k: 'to', q: '강남' }, bus: ['강남역', '', '강남역'] }) }));
  const n2 = all(sc2), jb = JSON.stringify(sc2.body);
  const i2 = n2.findIndex(n => n.t === 'inbar' && n.key === 'cmp.to'), sg = n2.filter(n => n.t === 'sug');
  ok(i2 >= 0 && n2[i2].value === '강남' && sg.length >= 3 && n2[i2 + 1].t === 'sug', '고치는 중인 칸 바로 아래에 후보 줄(친 글자가 칸 값)');
  ok(sg.filter(n => n.badge === '지하철').every(n => n.act.v === 'pk.n' && n.act.id === n.name) && sg.filter(n => n.badge === '버스').map(n => n.act.v).join() === 'pk.b.0', '지하철 후보는 이름을 실어 보내고 · 버스 후보는 앱이 찾은 순번(중복·빈 이름 제외)');
  ok(sg[sg.length - 1].last === true && !/cmp\.from[\s\S]*"t":"sug"[\s\S]*cmp\.to/.test(jb), '마지막 후보 줄 표시 · 다른 칸 아래에는 끼지 않는다');
  const sc3 = E.settingsScreen({ cap: 8 }, Object.assign({}, base, { cmi: 1, cmf: Object.assign({}, cmf, { pick: { k: 'to', q: 'zzzqqq' } }) }));
  ok(all(sc3).some(n => n.t === 'text' && /그대로 저장해도 돼요/.test(n.s)), '후보가 없으면 그대로 저장해도 된다는 안내');
  ok(!/cmp\./.test(JSON.stringify(E.settingsScreen({ cap: 8 }, Object.assign({}, base, { cmi: 1, cmf, pgs: ['sam'] })).body)), '앱이 열 수 없는 화면(cm 가 pgs 에 없음)은 감춘다');
  {
    const rows = n => (n.kids || []).filter(k => k.t === 'row');
    const scH = E.settingsScreen({ cap: 8 }, Object.assign({}, base, { cmi: 1, cmh: 1, cmf }));
    const pn = scH.body.find(n => /cmp\./.test(JSON.stringify(n)) && n.kids);
    const ir = rows(pn).filter(r => r.kids.every(k => k.t === 'inbar'));
    ok(ir.length === 2 && ir[0].kids.map(k => k.key).join() === 'cmp.from,cmp.to' && ir[1].kids.map(k => k.key).join() === 'cmp.eFrom,cmp.eTo', '새 앱(cmh): 출발지 · 도착지가 가로 한 줄(출근 · 퇴근 두 줄)');
    const lr = rows(pn).filter(r => r.kids.every(k => k.t === 'text' && /(출발지|도착지)/.test(k.s)));
    ok(lr.length === 2 && lr[0].kids.map(k => k.s).join('|') === '출근 출발지 (집 근처)|출근 도착지 (회사 근처)', '이름 라벨도 같은 칸 폭으로 위에 나란히');
    ok(ir[0].kids.every(k => k.watch && k.act.v === 'pk.save.' + k.key.slice(4) && k.hint.length <= 10), '가로 칸: 저장 · 엔터 · 글자 바뀜 알림은 그대로, 안내 글은 짧게');
    const scH2 = E.settingsScreen({ cap: 8 }, Object.assign({}, base, { cmi: 1, cmh: 1, cmf: Object.assign({}, cmf, { pick: { k: 'to', q: '강남' }, bus: ['강남역'] }) }));
    const pn2 = scH2.body.find(n => /cmp\./.test(JSON.stringify(n)) && n.kids), ix = pn2.kids.findIndex(n => n.t === 'row' && n.kids.every(k => k.t === 'inbar'));
    ok(pn2.kids[ix + 1].t === 'sug' && pn2.kids.filter(n => n.t === 'sug').length >= 2 && ir.length === 2, '후보 줄은 가로 칸 줄 바로 아래에 끼운다');
    ok(!all(E.settingsScreen({ cap: 8 }, Object.assign({}, base, { cmi: 1, cmf }))).some(n => n.t === 'row' && n.kids.some(k => k.t === 'inbar')), '가로 칸을 모르는 앱(cmh 없음)에게는 세로 입력칸 그대로');
  }
  {
    const scN = E.settingsScreen({ cap: 8 }, Object.assign({}, base, { cmi: 1, cmh: 1, cmf }));
    ok(all(scN).filter(n => n.t === 'inbar' && /^cmp\./.test(n.key)).every(n => n.nobtn === true && n.btn === '저장'), 's281: 역 입력칸은 저장 단추를 그리지 않는다(nobtn · 옛 앱은 btn 그대로)');
    const tpPop = E.settingsScreen({ cap: 8, p: 'cm' }, { pf: { sub: 'tp', pop: true, tp: { t: 'morn', ap: 'pm', h: 5, m: 20 } } });
    const tj = JSON.stringify(tpPop.body);
    ok(!/pg\.back/.test(tj) && (tj.match(/"grp":"h"/g) || []).length === 12 && (tj.match(/"grp":"m"/g) || []).length === 12 && (tj.match(/"grp":"ap"/g) || []).length === 2, 's281: 시각 팝업은 뒤로가기 줄이 없고 오전/오후 · 시 · 분 칸이 묶음(grp)으로 온다');
    ok(/오후 5:20/.test(tj) && /tp\.ok/.test(tj) && /tp\.cancel/.test(tj), 's281: 시각 팝업 글(오후 5:20) · 확인 · 취소');
    const noPop = JSON.stringify(E.settingsScreen({ cap: 8, p: 'cm' }, { pf: { sub: 'tp', tp: { t: 'eve', ap: 'pm', h: 6, m: 30 } } }).body);
    ok(/pg\.back/.test(noPop) && !/"grp"/.test(noPop), 's281: 팝업이 아니면(옛 앱) 기존 시각 화면 그대로');
    const cb = E.settingsScreen({ cap: 8, p: 'cmb' }, { pf: { cb: { kind: 'eve', title: '퇴근길 브리핑 · 강남→수원', body: '강남 → 수원\n강남 12° 맑음\n· 우산은 필요 없어요\n오늘도 수고했어요' } } });
    const cj = JSON.stringify(cb.body);
    ok(cb.ok && /퇴근길 브리핑/.test(cj) && /cmb\.ok/.test(cj) && /cmb\.go/.test(cj) && /퇴근하기/.test(cj) && !/pg\.back/.test(cj) && /오늘도 수고했어요/.test(cj), 's281: 알림 브리핑 창 — 글 · [확인] · [퇴근하기] (뒤로가기 줄 없음)');
    const cb2 = JSON.stringify(E.settingsScreen({ cap: 8, p: 'cmb' }, { pf: { cb: { kind: 'eve', title: 't', body: '예상 50분 소요 · 20:53경 도착 · 환승 없음\n강남 12° 맑음' } } }).body);
    ok(/예상 50분 소요 · 20:53경 도착/.test(cb2) && /"b":1|bold|"w":"b/i.test(cb2), 's285: 브리핑 창 첫 줄(소요 · 도착)이 굵게');
    ok(/출근하기/.test(JSON.stringify(E.settingsScreen({ cap: 8, p: 'cmb' }, { pf: { cb: { kind: 'morn', title: 't', body: 'a\nb' } } }).body)), 's281: 출근 알림은 [출근하기]');
  }
  ok(E.settingsScreen({ cap: 8 }, Object.assign({}, base, { cmi: 1, cmf })).rev !== E.settingsScreen({ cap: 8 }, Object.assign({}, base, { cmi: 1, cmf: Object.assign({}, cmf, { days: [0] }) })).rev, '요일이 바뀌면 rev 가 바뀐다(앱이 다시 그린다)');
}
(async () => {
  const tmp = path.join(os.tmpdir(), 'rv2_set_' + process.pid + '.mjs');
  fs.copyFileSync(R('engine/route-v2-worker.ascii.js'), tmp);
  try {
    const mod = await import(tmp), w = mod.default, call = u => w.fetch(new Request(u), {}, { waitUntil() { } });
    const f = encodeURIComponent(JSON.stringify(full));
    const r = await call('https://x/screen/settings?cap=3&f=' + f), j = await r.json();
    ok(r.status === 200 && j.ok && j.screen === 'settings', '워커 응답 200');
    ok(/route-v2-2026-10-\d\ds\d\d/.test(j.ver), '엔진 버전 표시 ' + j.ver);
    ok(JSON.stringify(j.body) === JSON.stringify(s.body) && j.rev === s.rev, '워커와 직접 계산이 같은 결과');
    ok((await (await call('https://x/screen/settings?cap=2&f=' + f)).json()).ok === false, '워커: cap 부족이면 거절');
    ok((await call('https://x/screen/settings?cap=3&f=' + encodeURIComponent('{oops'))).status === 400, '워커: 깨진 사실은 400');
    ok((await call('https://x/screen/settings?cap=3&f=' + 'a'.repeat(6001))).status === 400, '워커: 너무 긴 사실은 400');
    const r0 = await call('https://x/screen/settings?cap=3'), j0 = await r0.json();
    ok(r0.status === 200 && j0.ok, '워커: 사실 없이도 기본 화면');
    // 하위 화면(cap 8 · p=)
    const pf = encodeURIComponent(JSON.stringify({ pf: { sub: 'pick', pick: { k: 'to', q: '강남' }, bus: ['강남역'] } }));
    const rp = await call('https://x/screen/settings?cap=8&p=cm&f=' + pf), jp = await rp.json();
    ok(rp.status === 200 && jp.ok && jp.info.page === 'cm' && jp.info.sub === 'pick' && jp.info.pk.u.length > 0 && jp.info.pk.b.length === 1, '워커: 하위 화면(장소 고르기) — 워커 안에서도 역 표로 후보를 거른다');
    ok(JSON.stringify(jp.body) === JSON.stringify(E.settingsScreen({ cap: 8, p: 'cm' }, JSON.parse(decodeURIComponent(pf))).body), '워커와 직접 계산이 같은 하위 화면');
    ok((await call('https://x/screen/settings?cap=3&p=cm')).status === 400 && (await call('https://x/screen/settings?cap=8&p=zz')).status === 400, '워커: cap 부족 · 모르는 화면은 400');
    ok((await (await call('https://x/screen/settings?cap=8&p=sam')).json()).ok === true, '워커: 사실 없이도 하위 화면');
    const ro = await w.fetch(new Request('https://x/screen/settings', { method: 'OPTIONS' }), {}, { waitUntil() { } });
    ok(ro.status === 204, '워커: OPTIONS 204');
  } catch (e) { fail++; console.log('  FAIL 워커 시험 예외', e && e.stack || e); }
  try { fs.unlinkSync(tmp); } catch (e) { }
  console.log(`settings_engine: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();

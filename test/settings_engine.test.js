// 설정 화면 엔진(engine/settings.js) 시험.  실행: node test/settings_engine.test.js   (javac · java 필요 — 앱 검증기로 같은 JSON 을 읽어 본다)
//  ① cap 3 미만이면 만들지 않는다 ② 모양·내용(스위치 키·상태 문구·숨김 규칙·이모지 없음) ③ 여러 기기 상태에서 만든 화면이 앱 검증기(ScreenCore.load)를 모두 통과한다
//  ④ 웹 설정 화면의 문구·행동 이름이 엔진과 맞는가 ⑤ 워커 내장 사본 ⑥ 워커 끝에서 끝까지(GET /screen/settings)
process.env.TZ = 'Asia/Seoul';
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');
const E = require('../engine/settings');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; } else { fail++; console.log('  FAIL', m); } }
const R = p => path.join(__dirname, '..', p);
const html = fs.readFileSync(R('www/index.html'), 'utf8');

// 평탄화: 패널 안까지 모든 노드
function flat(nodes, out) { out = out || []; nodes.forEach(n => { out.push(n); if (n.kids) flat(n.kids, out); }); return out; }
const all = s => flat(s.body);
const full = { id: '길동', np: { arrive: 1, transfer: 0, arrive_reco: 1 }, npd: 1, rl: 1, th: 'dark', sam: 1, samw: 1, errn: 3, cm: 1, ovl: 0,
  feat: { nm: { h: 1, on: 1 }, sn: { h: 1, on: 0 }, htl: { h: 1, on: 1, f: 1, w: 'x 오류' }, scr: { h: 1, on: 1, b: 1, w: '모양' }, scrs: { h: 1, on: 1 } } };

// ① cap
ok(E.settingsScreen({}, full).ok === false && E.settingsScreen({ cap: 2 }, full).ok === false, 'cap 3 미만이면 만들지 않는다');
const s = E.settingsScreen({ cap: 3 }, full);
ok(s.ok && s.v === 1 && s.screen === 'settings' && s.cover === 'tab' && Array.isArray(s.head) && s.head.length === 0, '기본 모양: v1 · settings · cover=tab · head 없음');
ok(/^s1:[0-9a-z]+$/.test(s.rev), 'rev 형식 ' + s.rev);

// ② 내용
const nodes = all(s), toggles = nodes.filter(n => n.t === 'toggle');
const keys = toggles.map(n => n.key).join();
ok(keys === 'n.arrive,n.transfer,n.arrive_reco,f.nm,f.sn,f.htl,f.scr,f.scrs,rl', '스위치 순서: ' + keys);
const tg = k => toggles.find(n => n.key === k);
ok(tg('n.arrive').on === true && tg('n.transfer').on === false && tg('n.arrive_reco').on === true, '알림 스위치 상태 = 저장값');
ok(tg('f.nm').on === true && tg('f.sn').on === false && tg('f.htl').on === false && tg('f.scr').on === true, '기능 스위치: 문제로 돌아간 것(htl)은 꺼진 모양');
const boxes = nodes.filter(n => n.t === 'box').map(n => n.s);
ok(boxes.some(t => t === '켜짐 — 노선도를 기기가 직접 그려 확대·축소가 부드러워요.'), '노선도 켜짐 문구');
ok(boxes.some(t => t === '꺼짐 — 예전 방식(웹 화면)으로 그려요.'), '장면 꺼짐 문구');
ok(boxes.some(t => /^네이티브 경로 화면에 문제가 있어 웹 화면으로 대신 보여주고 있어요 \(x 오류\)\. 스위치를 껐다 켜면 다시 시도해요\.$/.test(t)), '경로 화면 문제 문구 + 사유');
ok(boxes.some(t => /^엔진이 준 화면이 올바르지 않아 저장해 둔 화면을 쓰고 있어요 \(모양\)\.$/.test(t)), '쇼핑 저장본 사용 문구');
ok(boxes.some(t => /^알림 권한이 꺼져 있어요/.test(t)) && boxes.some(t => /^이 앱의 배터리 사용이 제한됨으로/.test(t)), '권한 거부·배터리 제한 경고 상자');
const cur = nodes.find(n => n.t === 'box' && /^현재 아이디/.test(n.s));
ok(cur && cur.s === '현재 아이디  길동' && JSON.stringify(cur.hl) === '[[8,10]]', '현재 아이디 상자(굵은 구간 = 아이디)');
const fld = nodes.find(n => n.t === 'field');
ok(fld && fld.key === 'cid' && fld.value === '길동' && fld.maxlen === 12, '입력칸 cid · 현재 값 · 12자');
const btns = nodes.filter(n => n.t === 'button');
ok(btns.length === 2 && btns[0].act.v === 'saveId' && btns[1].act.v === 'clearId', '버튼: 저장 → 삭제');
const sels = nodes.filter(n => n.t === 'select');
ok(sels.length === 2 && sels[0].on === true && sels[1].on === false && sels[0].act.v === 'dark' && sels[1].act.v === 'pastel', '테마 고르기: 다크가 선택됨');
const navs = nodes.filter(n => n.t === 'navrow');
const webIds = navs.filter(n => n.act.a === 'web').map(n => n.act.v).join(), callIds = navs.filter(n => n.act.a === 'call').map(n => n.act.v).join();
ok(webIds === 'sam,cm,gw,arr,ovl,dev', '웹 카드로 이어지는 행: ' + webIds);
ok(callIds === 'pol.privacy,pol.location,pol.opensource,errlog', '앱 함수 호출 행: ' + callIds);
ok(navs.find(n => n.act.v === 'errlog').sub === '3' && navs.find(n => n.act.v === 'cm').sub === '켜짐' && navs.find(n => n.act.v === 'ovl').sub === '꺼짐' && navs.find(n => n.act.v === 'sam').sub === '제한됨', '오른쪽 글: 오류 3 · 켜짐 · 꺼짐 · 제한됨');
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
ok(bn.filter(n => n.t === 'button').length === 1, '아이디가 없으면 삭제 버튼 없음');
ok(bn.filter(n => n.t === 'select').find(n => n.on).act.v === 'pastel', '테마 기본 = 파스텔');
ok(!bn.some(n => n.t === 'navrow' && n.act.v === 'sam'), '갤럭시가 아니면 갤럭시 행 없음');
ok(bn.filter(n => n.t === 'navrow' && (n.act.v === 'cm' || n.act.v === 'ovl')).every(n => !n.sub), '모르는 상태는 오른쪽 글 없음');
const odd = E.settingsScreen({ cap: 3 }, { id: 'x'.repeat(50), errn: -5, th: 'zzz', np: 'bad', feat: { nm: 7, sn: { h: 1, on: 1, w: 'y'.repeat(500) } } });
ok(odd.ok && all(odd).find(n => n.t === 'field').value.length === 12, '이상한 사실은 걸러진다(아이디 12자로 자름)');
ok(all(odd).filter(n => n.t === 'box').every(n => n.s.length < 400), '사유는 140자까지만');
ok(E.settingsStat(E.SETTINGS_FEATS[3], { on: 0 }) === '꺼짐 — 예전 방식(웹 쇼핑 화면)으로 그려요.', '쇼핑 꺼짐 문구');

// ③ 앱 검증기 통과 — 사실을 여러 가지로 바꿔 가며 만든 화면을 모두 ScreenCore.load + layout 에 넣어 본다
{
  const lines = [], bools = [0, 1];
  let k = 0;
  for (const sam of bools) for (const npd of bools) for (const th of ['dark', 'pastel']) for (const id of ['', '길동무']) for (const on of bools) for (const fl of bools) {
    const feat = {}; E.SETTINGS_FEATS.forEach((d, i) => { feat[d.k] = { h: (i + k) % 5 !== 4 ? 1 : 0, on: on, f: (i + fl + k) % 3 === 0 ? 1 : 0, w: fl ? '이유 ' + i : '', b: (i + k) % 2 };  });
    k++;
    lines.push(JSON.stringify(E.settingsScreen({ cap: 3 }, { id, npd, th, sam, samw: sam & fl, errn: k % 4, cm: k % 3 === 0 ? null : k % 2, ovl: k % 3 === 1 ? null : 1 - (k % 2), rl: on, np: { arrive: on, transfer: fl, arrive_reco: 1 - on }, feat })));
  }
  lines.push(JSON.stringify(s), JSON.stringify(bare));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'setchk_'));
  try {
    const f = path.join(dir, 'in.jsonl'), cls = path.join(dir, 'c');
    fs.writeFileSync(f, lines.join('\n') + '\n'); fs.mkdirSync(cls);
    const ENV = Object.assign({}, process.env, { JAVA_TOOL_OPTIONS: '' });
    let r = spawnSync('javac', ['-encoding', 'UTF-8', '-d', cls, R('native/ScreenCore.java'), R('test/java/ScreenCheck.java')], { env: ENV, encoding: 'utf8' });
    ok(r.status === 0, 'ScreenCheck 컴파일 ' + (r.stderr || '').slice(0, 300));
    r = spawnSync('java', ['-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-cp', cls, 'com.dullyyj.subway.ScreenCheck', f], { env: ENV, encoding: 'utf8' });
    const out = (r.stdout || '').split('\n').filter(Boolean);
    ok(out.length === lines.length, '모든 화면에 결과가 나왔다 ' + out.length + '/' + lines.length);
    ok(out.every(l => l.startsWith('OK ')), '모든 화면이 앱 검증기를 통과 ' + out.filter(l => !l.startsWith('OK ')).slice(0, 3).join(' | '));
    ok(out.every(l => Number(l.split(' ')[2]) === 0), '건너뛴 노드 없음(앱이 모든 노드를 안다)');
    const h = out.filter(l => l.startsWith('OK ')).map(l => Number(l.split(' ')[3]));
    ok(Math.min.apply(null, h) > 800 && Math.max.apply(null, h) < 7000, '본문 높이가 정상 범위 ' + Math.min.apply(null, h) + '~' + Math.max.apply(null, h));
    // 옛 앱 시뮬: 앱이 모르는 새 노드(panel 등)뿐인 화면은 '그릴 것이 없다' 로 거절된다 → 웹 폴백 (JVM 시험에서 확인) — 여기선 cap 가 이를 사전에 막는다
  } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { } }
}

// ④ 웹 설정 화면과의 대응(폴백으로 남는 웹 카드가 같은 글·행동을 쓰는가)
{
  const has = t => html.indexOf(t) >= 0;
  ok(has('받고 싶은 알림만 골라서 켜고 끌 수 있어요. 끄면 진동도 함께 꺼져요.') && has('아이디는 이 기기에만 저장되며,<br>작성한 글·채팅에 표시됩니다.'), '웹: 알림·아이디 안내 문구 = 엔진 문구');
  E.SETTINGS_NOTIF.forEach(n => ok(has("title:'" + n.title + "'") && has("desc:'" + n.desc + "'"), '웹 알림 항목 문구 = 엔진: ' + n.title));
  E.SETTINGS_FEATS.forEach(d => ok(has(d.desc.replace(/&/g, '&amp;')) || has(d.desc), '웹 기능 설명 = 엔진: ' + d.title));
  ok(has('목적지에 도착하면 예상 시간과 실제 시간의 차이만 익명으로 보내요. 역 이름·위치·기기 정보는 보내지 않아요.'), '웹: 정확도 설명 = 엔진');
  ok(has("개인정보처리방침") && has("위치기반서비스 이용약관") && has("데이터 출처 및 고지"), '웹: 약관 항목 이름 = 엔진');
  ok(has('깊고 선명한 다크 테마') && has('맑고 시원한 하늘색 테마'), '웹: 테마 설명 = 엔진');
  ok(has('id="samSetCard"') && has('id="gwCard"') && has('id="ovlTestCard"') && has('id="cmAlarmOn"'), '웹: 웹 카드로 열 수 있는 요소가 있다');
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
    ok((await call('https://x/screen/settings?cap=3&f=' + 'a'.repeat(3001))).status === 400, '워커: 너무 긴 사실은 400');
    const r0 = await call('https://x/screen/settings?cap=3'), j0 = await r0.json();
    ok(r0.status === 200 && j0.ok, '워커: 사실 없이도 기본 화면');
    const ro = await w.fetch(new Request('https://x/screen/settings', { method: 'OPTIONS' }), {}, { waitUntil() { } });
    ok(ro.status === 204, '워커: OPTIONS 204');
  } catch (e) { fail++; console.log('  FAIL 워커 시험 예외', e && e.stack || e); }
  try { fs.unlinkSync(tmp); } catch (e) { }
  console.log(`settings_engine: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();

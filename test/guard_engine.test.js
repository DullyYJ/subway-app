// API 남용·매크로 방어(engine/guard.js · guard-worker.js) 시험 — 보통 사용자는 안 걸리고, 매크로는 걸린다 · 번호 위조 · 차단 단계 · 관리 주소 · 워커 끝에서 끝까지
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok  ', m); } else { fail++; console.log('  FAIL', m); } };
const G = require('../engine/guard.js');
const reset = () => { G.GD_ST.b.clear(); G.GD_ST.ban.clear(); G.GD_ST.vio.clear(); G.GD_ST.ids.clear(); G.GD_ST.gcAt = 0; };
const D = (o) => G.gdDecide(Object.assign({ ip: '1.1.1.1', iid: 'abcdefgh1234', path: '/screen/home', method: 'POST', now: 1e9, adminSet: false, adminOk: false }, o));

// 분류
ok(G.gdClass('/route-v2-app') === 'heavy' && G.gdClass('/reco-text') === 'heavy' && G.gdClass('/screen/map') === 'heavy' && G.gdClass('/screen/home') === 'light' && G.gdClass('/screen/batch') === 'light', '종류: 길찾기·AI 문구·지도는 무거운 조회, 화면은 가벼움');
ok(['/tago-probe', '/bt-fill', '/live-test', '/bus-split-test', '/stops-near'].every(p => G.gdClass(p) === 'admin') && G.gdClass('/line-notices') === 'light', '종류: 진단·관리 주소는 admin, 앱이 쓰는 /line-notices 는 가벼움');
ok(G.gdIid('abcdefgh1234') === 'abcdefgh1234' && G.gdIid('짧') === '' && G.gdIid("a'b;c") === '' && G.gdIid(null) === '', '기기 번호 모양 검사');

// 보통 사용자: 1초에 4번을 1분 내내 눌러도(240번) 한 번도 안 걸린다 · 가벼운 화면 버스트 60
reset(); let t = 1e9, blocked = 0;
for (let i = 0; i < 240; i++) { t += 250; if (!D({ now: t }).ok) blocked++; }
ok(blocked === 0, '보통 사용자: 초당 4번 × 60초 → 0번 차단');
reset(); blocked = 0; t = 1e9;
for (let i = 0; i < 60; i++) { if (!D({ now: t }).ok) blocked++; }
ok(blocked === 0, '앱 시작 때 한 번에 60개를 몰아 보내도(버스트) 통과');
// 무거운 조회: 분당 100번 정도(2/s 미만)는 통과
reset(); blocked = 0; t = 1e9;
for (let i = 0; i < 100; i++) { t += 600; if (!D({ now: t, path: '/route-v2-app', method: 'GET' }).ok) blocked++; }
ok(blocked === 0, '길찾기: 0.6초마다 1번 → 통과');

// 매크로: 초당 100번 → 곧 막히고 Retry-After 가 붙는다
reset(); let okN = 0, lim = 0, last = null, banR = null; t = 1e9;
for (let i = 0; i < 500; i++) { t += 10; const r = D({ now: t, path: '/route-v2-app', method: 'GET' }); if (r.ok) okN++; else { lim++; last = r; if (r.reason === 'ban' && (!banR || r.retryS > banR.retryS)) banR = r; } }
ok(okN < 80 && lim > 400 && last && last.status === 429 && last.retryS >= 1, '매크로(초당 100번): 앞의 버스트만 통과, 나머지 429 · 통과 ' + okN);
// 연이은 위반 → 차단(ban) 단계 · 차단되면 바로 거절
ok(banR && banR.retryS >= 60, '연이어 넘으면 60초 이상 차단: ' + (banR && banR.retryS) + '초');
// 차단은 단계적으로 늘어난다(두 번째는 120초)
let lvl2 = null; reset(); t = 1e9;
for (let round = 0; round < 2; round++) { for (let i = 0; i < 300; i++) { t += 10; const r = D({ now: t, path: '/route-v2-app', method: 'GET' }); if (!r.ok && r.reason === 'ban' && (!lvl2 || r.retryS > lvl2.retryS)) lvl2 = r; } t += 61000; }
ok(lvl2 && lvl2.retryS >= 119, '두 번째 차단은 더 길다(≥120초): ' + (lvl2 && lvl2.retryS));
// 차단이 풀리면 다시 정상
reset(); t = 1e9; for (let i = 0; i < 300; i++) { t += 10; D({ now: t, path: '/route-v2-app', method: 'GET' }); }
t += 11 * 60000;
ok(D({ now: t, path: '/route-v2-app', method: 'GET' }).ok, '차단 시간이 지나면 다시 통과(사용자는 영구 차단되지 않는다)');

// 한 사용자의 매크로가 같은 IP 의 다른 기기(공유 IP)를 막지 않는다
reset(); t = 1e9;
for (let i = 0; i < 400; i++) { t += 10; D({ now: t, path: '/route-v2-app', method: 'GET', iid: 'macroaaaaaaaa' }); }
ok(D({ now: t, path: '/route-v2-app', method: 'GET', iid: 'normaluser0001' }).ok && D({ now: t, iid: 'normaluser0001' }).ok, '공유 IP: 매크로 기기가 막혀도 같은 IP 의 다른 기기는 정상');
// 번호를 요청마다 바꿔 우회 → 번호 무시, IP 하나로 묶여 막힌다
reset(); t = 1e9; okN = 0;
for (let i = 0; i < 1000; i++) { t += 5; const r = D({ now: t, path: '/route-v2-app', method: 'GET', iid: 'spoof' + String(i).padStart(8, '0') }); if (r.ok) okN++; }
ok(okN < 160, '번호 위조(요청마다 다른 번호)는 소용없다: 1000번 중 통과 ' + okN);
ok(G.GD_ST.stat.spoof > 0, '위조 감지 통계');
// 번호가 없는 요청(옛 앱·스크립트)도 동작 — IP 하나로 묶임
reset(); t = 1e9; okN = 0;
for (let i = 0; i < 300; i++) { t += 10; if (D({ now: t, iid: '' , path: '/route-v2-app', method: 'GET' }).ok) okN++; }
ok(okN < 80 && okN > 20, '번호 없는 요청도 IP 단위로 제한(옛 앱 호환): 통과 ' + okN);

// 관리 주소
reset();
ok(D({ path: '/tago-probe', method: 'GET', adminSet: true, adminOk: false }).status === 403, '관리 주소: 비밀값이 설정돼 있는데 없으면 403');
ok(D({ path: '/tago-probe', method: 'GET', adminSet: true, adminOk: true }).ok, '관리 주소: 비밀값이 맞으면 통과');
reset(); let adm = 0; for (let i = 0; i < 20; i++) if (D({ path: '/live-test', method: 'GET', now: 1e9 + i * 100 }).ok) adm++;
ok(adm === 5, '관리 주소(비밀값 없음): 분당 5번만 — 통과 ' + adm);
// OPTIONS(사전 확인)는 안 센다
reset(); let op = 0; for (let i = 0; i < 1000; i++) if (D({ method: 'OPTIONS', now: 1e9 }).ok) op++;
ok(op === 1000, 'OPTIONS 는 안 센다');
// 묶음 요청은 3칸
reset(); t = 1e9; okN = 0; for (let i = 0; i < 100; i++) { if (D({ now: t, path: '/screen/batch' }).ok) okN++; }
ok(okN === 20, '묶음(/screen/batch)은 3칸씩: 버스트 60 → 20개 통과(' + okN + ')');
// 메모리: 키가 폭증해도 GC 가 지운다
reset(); for (let i = 0; i < 30000; i++) D({ ip: '10.0.' + (i >> 8) + '.' + (i & 255), iid: '', now: 1e9 + i });
G.gdDecide({ ip: '9.9.9.9', iid: '', path: '/screen/home', method: 'POST', now: 1e9 + 400000, adminSet: false, adminOk: false });
ok(G.GD_ST.b.size < 5000, '메모리 정리: 오래된 통은 지운다(' + G.GD_ST.b.size + ')');

// 워커 내장 · 끝에서 끝까지
const w = fs.readFileSync(path.join(__dirname, '../engine/route-v2-worker.ascii.js'), 'utf8');
const esc = s => s.replace(/[\u0080-￿]/g, ch => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'));
const cut = x => x.slice(0, x.indexOf('if (typeof module')).trimEnd();
const src = esc(cut(fs.readFileSync(path.join(__dirname, '../engine/guard.js'), 'utf8'))), glue = esc(fs.readFileSync(path.join(__dirname, '../engine/guard-worker.js'), 'utf8').trimEnd());
ok(w.includes('// ===== GUARD ENGINE BEGIN =====\n' + src + '\n' + glue + '\n// ===== GUARD ENGINE END ====='), '워커 내장 사본이 같다');
ok(w.includes('var _gd = await guardEnter(request, env);') && w.includes('_gd.done();') && w.includes('gdIid(request.headers.get("X-Gdm-Id"))'), '워커 fetch 입구에 연결 · 완료 시 done · 기존 길찾기 제한도 기기 번호별');
(async () => {
  const tmp = path.join(require('os').tmpdir(), 'rv2_guard_' + process.pid + '.mjs');
  fs.copyFileSync(path.join(__dirname, '../engine/route-v2-worker.ascii.js'), tmp);
  try {
    const mod = await import(tmp);
    const f = (u, init, env) => mod.default.fetch(new Request(u, init), env || {}, { waitUntil() { } });
    const H = (ip, iid) => { const h = { 'CF-Connecting-IP': ip }; if (iid) h['X-Gdm-Id'] = iid; return h; };
    let r = await f('https://x/screen/hdr?tz=540', { headers: H('2.2.2.2', 'devicenumber001') });
    ok(r.status === 200, '워커: 정상 요청은 그대로 200');
    // 매크로: 같은 기기가 /screen/hdr 를 300번
    let n429 = 0, retry = '';
    for (let i = 0; i < 300; i++) { r = await f('https://x/screen/hdr?tz=540', { headers: H('3.3.3.3', 'macroaaaaaaaa') }); if (r.status === 429) { n429++; retry = r.headers.get('Retry-After'); } }
    ok(n429 > 200 && /^\d+$/.test(retry), '워커: 매크로 300번 중 ' + n429 + '번 429 · Retry-After ' + retry);
    const j = await r.json();
    ok(j.ok === false && j.error === 'rate', '워커: 429 본문은 짧은 JSON');
    r = await f('https://x/screen/hdr?tz=540', { headers: H('3.3.3.3', 'otherdevice001') });
    ok(r.status === 200, '워커: 같은 IP 의 다른 기기는 정상');
    // 관리 주소: 비밀값 설정 시 403, 맞으면 통과(404 아닌 응답)
    r = await f('https://x/live-usage', { headers: H('4.4.4.4', 'adminpersonaa') }, { ADMIN_KEY: 'sekret' });
    ok(r.status === 403, '워커: 관리 주소는 비밀값 없으면 403');
    r = await f('https://x/live-usage?k=sekret', { headers: H('4.4.4.5', 'adminpersonaa') }, { ADMIN_KEY: 'sekret' });
    ok(r.status !== 403 && r.status !== 429, '워커: 비밀값이 맞으면 통과(' + r.status + ')');
    // 속도 제한 바인딩(있으면 한 번 더)
    let calls = 0; const RL = { limit: async () => { calls++; return { success: calls <= 2 }; } };
    const s = []; for (let i = 0; i < 4; i++) { r = await f('https://x/screen/hdr?tz=540', { headers: H('5.5.5.5', 'rlbindingtest1') }, { GDM_RL: RL }); s.push(r.status); }
    ok(s[0] === 200 && s[1] === 200 && s[2] === 429 && s[3] === 429, '워커: GDM_RL 바인딩이 거절하면 429 ' + s.join(','));
    r = await f('https://x/screen/hdr?tz=540', { headers: H('5.5.5.6', 'rlbindingtest2') }, { GDM_RL: { limit: async () => { throw new Error('boom'); } } });
    ok(r.status === 200, '워커: 바인딩이 고장 나도 요청은 통과(안전하게 열어 둔다)');
  } catch (e) { fail++; console.log('  FAIL 워커 시험 예외', e && e.stack || e); }
  try { fs.unlinkSync(tmp); } catch (e) { }
  console.log(`guard_engine: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();

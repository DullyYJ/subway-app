// 글쓰기 시트 엔진(engine/write.js) 시험.  실행: node test/write_engine.test.js   (javac · java 필요)
//  ① cap 9 미만이면 만들지 않는다 ② 글자·안내·자리표시가 웹 #wsheet 와 같다(이모지만 뺌) ③ 사실(횟수·안내·등록 중·처음 글) 반영 ④ 앱 검증기 통과 ⑤ 워커 내장 사본 ⑥ 워커 끝에서 끝까지
const fs = require('fs'), path = require('path'), os = require('os');
const E = require('../engine/write'), screenCheck = require('./helpers/screen_check');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  FAIL', m); } }
const R = p => path.join(__dirname, '..', p);
const html = fs.readFileSync(R('www/index.html'), 'utf8');
const EMOJI = /[\u{1F000}-\u{1FFFF}\u{2190}-\u{2BFF}\u{FE0F}]/u;
const flat = ns => { const o = []; (function f(a) { a.forEach(n => { o.push(n); if (n.kids) f(n.kids); }); })(ns); return o; };
const S = (f, cap) => E.writeScreen({ cap: cap == null ? 9 : cap }, f);

// ── ② 웹 #wsheet 대조 ──
{
  const i = html.indexOf('<div class="sheet" id="wsheet">'), seg = html.slice(i, html.indexOf('<!-- LINE FILTER SHEET -->', i));
  const nodes = flat(S({ rc: 1 }).body);
  const txt = nodes.map(n => n.s || n.title || n.btn || '').join('\n');
  ok(/<h3>([^<]+)<\/h3>/.exec(seg)[1] === '제보 글쓰기' && nodes.some(n => n.t === 'bar' && n.title === '제보 글쓰기'), '제목 = 웹 제목');
  ok(/placeholder="([^"]+)"/.exec(seg.slice(seg.indexOf('id="wTitle"')))[1] === nodes.find(n => n.key === 'wt').hint, '제목 입력칸 자리표시 = 웹');
  ok(/placeholder="([^"]+)"[^>]*>/.exec(seg.slice(seg.indexOf('id="wBody"')))[1] === nodes.find(n => n.key === 'wb').hint, '내용 입력칸 자리표시 = 웹');
  ok(/class="save-btn" onclick="submitPost\(\)">([^<]+)</.exec(seg)[1] === nodes.find(n => n.act && n.act.v === 'wr.submit').s, '등록 단추 글 = 웹');
  ok(['카테고리', '제목', '내용'].every(l => seg.indexOf('<label>' + l + '</label>') >= 0 && txt.indexOf(l) >= 0), '라벨 카테고리·제목·내용 = 웹');
  ok(seg.indexOf('<option value="잡담">잡담</option>') >= 0 && nodes.some(n => n.t === 'box' && n.s === '잡담'), '카테고리 선택지(잡담 하나) = 웹');
  const m = /hint\.textContent = '([^']*)' \+ rc \+ '([^']*)'/.exec(html.slice(html.indexOf('function openWriteSheet')));
  ok(!!m, '웹 현장제보 안내 문구를 찾았다');
  const want = (m[1] + 2 + m[2]).replace(/^[^가-힣]+/, '');
  ok(flat(S({ rc: 2 }).body).some(n => n.s === want), '현장제보 안내 = 웹 문구(이모지만 뺌): ' + want);
  ok(html.indexOf('window._wErrShow') >= 0 || html.indexOf('function _wErrShow') >= 0, '웹에 _wErrShow 가 있다');
}
// ── ① cap · ③ 사실 ──
{
  ok(S({}, 8).ok === false && E.writeScreen({}, {}).ok === false && E.writeScreen(null, null).ok === false, 'cap 9 미만이면 만들지 않는다');
  const s = S({ rc: 2, t: '제목글', b: '내용\n두 줄' });
  ok(s.ok && s.v === 1 && s.screen === 'write' && s.cover === 'tab' && s.head.length === 0 && s.body.length === 1 && s.body[0].t === 'panel' && /^w1:/.test(s.rev), '기본 모양');
  const nd = flat(s.body), wt = nd.find(n => n.key === 'wt'), wb = nd.find(n => n.key === 'wb');
  ok(wt && wb && wt.value === '제목글' && wb.value === '내용\n두 줄' && wb.multi === true && !wt.multi && wb.h > wt.h && wb.maxlen === 1000 && wt.maxlen === 60, '입력칸: 처음 글 · 내용만 여러 줄 · 길이 제한');
  ok(nd.filter(n => n.act).map(n => n.act.v).join() === 'wr.close,wr.submit', '행동은 wr.close · wr.submit 둘뿐');
  ok(nd.some(n => n.s === '현장제보 오늘 2/3회 사용 (제보 시 3~8P 랜덤 적립)') && nd.some(n => n.s === '현장제보 오늘 0/3회 사용 (제보 시 3~8P 랜덤 적립)') === false, '횟수 반영');
  ok(!nd.some(n => n.t === 'box' && n.tc === '#ff453a'), '안내 글이 없으면 빨간 상자 없음');
  const e = flat(S({ err: '⚠️ 제목을 입력해주세요' }).body).find(n => n.t === 'box' && n.tc === '#ff453a');
  ok(e && e.s === '제목을 입력해주세요', '안내 글(이모지 뺀) 빨간 상자');
  ok(flat(S({ err: '⚠️ ' + '가'.repeat(300) }).body).find(n => n.tc === '#ff453a').s.length === 120, '안내 글은 120자까지');
  ok(flat(S({ busy: 1 }).body).find(n => n.act && n.act.v === 'wr.submit').s === '등록 중...' && flat(S({ busy: 0 }).body).find(n => n.act && n.act.v === 'wr.submit').s === '제보 등록', '등록 중 단추 글');
  ok(S({ rc: -3 }).info.rc === 0 && S({ rc: 'x' }).info.rc === 0 && S({ rc: 500 }).info.rc === 99 && S(null).ok, '이상한 횟수는 0~99 로');
  ok(flat(S({ t: 'x'.repeat(500), b: 'y'.repeat(5000) }).body).filter(n => n.key).map(n => n.value.length).join() === '60,1000', '처음 글은 제한 길이로 자른다');
  ok(S({ rc: 1 }).rev === S({ rc: 1 }).rev && S({ rc: 2 }).rev !== S({ rc: 1 }).rev, '같은 입력 → 같은 rev, 다르면 다름');
  ok(!JSON.stringify(S({ rc: 1, err: '⚠️ x' })).split('"').some(x => EMOJI.test(x)), '이모지 없음');
}
// ── ④ 앱 검증기 ──
{
  const sc = [S({}), S({ rc: 3, err: '⚠️ 서버가 거절했어요', busy: 1, t: '제목', b: '긴\n내용' }), S({ t: 'x'.repeat(70), b: 'y'.repeat(1200) })];
  const r = screenCheck(sc);
  ok(!r.err && r.out.length === sc.length && r.out.every(l => l.startsWith('OK ')), '모든 화면이 앱 검증기를 통과 ' + (r.err || r.out.filter(l => !l.startsWith('OK ')).join('|')));
  ok(r.out.every(l => Number(l.split(' ')[2]) === 0), '건너뛴 노드 없음');
}
// ── ⑤ 워커 내장 ──
{
  const w = fs.readFileSync(R('engine/route-v2-worker.ascii.js'), 'utf8');
  const ms = '// ===== WRITE ENGINE BEGIN =====', me = '// ===== WRITE ENGINE END =====', i = w.indexOf(ms), j = w.indexOf(me);
  ok(i > 0 && j > i, '워커에 글쓰기 엔진이 내장돼 있다');
  const esc = t => t.replace(/[\u0080-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  let src = fs.readFileSync(R('engine/write.js'), 'utf8'); src = src.slice(0, src.indexOf('if (typeof module')).trimEnd();
  const body = w.slice(i + ms.length, j);
  ok(body.indexOf(esc(src)) >= 0 && body.indexOf(esc(fs.readFileSync(R('engine/write-worker.js'), 'utf8').trimEnd())) >= 0, '워커 내장 사본이 소스와 같다');
  ok(w.indexOf('if (url.pathname === "/screen/write") return handleScreenWrite(request);') > 0, '경로 등록');
  ok(!/[^\x00-\x7f]/.test(body), '내장 블록은 ASCII 만');
  const other = w.slice(0, i) + w.slice(j);
  ok(['writeScreen', 'writeFacts', 'writeHash', 'writeStr', 'writeLabel', 'WRITE_SCREEN_V', 'WRITE_EMOJI', 'handleScreenWrite'].every(n => !new RegExp('^(async\\s+)?(function|var)\\s+' + n + '\\b', 'm').test(other)), '다른 엔진과 이름이 겹치지 않는다');
}
// ── ⑥ 워커 끝에서 끝까지 ──
(async () => {
  const tmp = path.join(os.tmpdir(), 'rv2_write_' + process.pid + '.mjs');
  fs.copyFileSync(R('engine/route-v2-worker.ascii.js'), tmp);
  try {
    const w = (await import(tmp)).default, call = (u, init) => w.fetch(new Request(u, init), {}, { waitUntil() { } });
    const post = b => call('https://x/screen/write', { method: 'POST', body: b, headers: { 'Content-Type': 'text/plain;charset=UTF-8' } });
    const f = { rc: 1, err: '⚠️ 내용을 입력해주세요', busy: 0, t: '가', b: '나\n다' };
    const r = await post(JSON.stringify({ cap: 9, f })), j = await r.json();
    ok(r.status === 200 && j.ok && j.screen === 'write' && /route-v2-2026-10-\d\ds\d\d/.test(j.ver), '워커 응답 200 ' + j.ver);
    const direct = S(f); ok(JSON.stringify(Object.assign({}, j, { ver: undefined })) === JSON.stringify(Object.assign({}, direct, { ver: undefined })), '워커 응답 = 직접 계산');
    ok((await (await post(JSON.stringify({ cap: 8, f: {} }))).json()).ok === false, '워커: cap 부족이면 거절');
    ok((await post('{oops')).status === 400 && (await post('x'.repeat(20001))).status === 413 && (await call('https://x/screen/write')).status === 405, '워커: 깨진 본문 400 · 큰 본문 413 · GET 405');
    const ro = await call('https://x/screen/write', { method: 'OPTIONS' });
    ok(ro.status === 204 && r.headers.get('access-control-allow-origin') === '*' && r.headers.get('cache-control') === 'no-store', '워커: OPTIONS 204 · CORS · no-store');
  } catch (e) { fail++; console.log('  FAIL 워커 시험 예외', e && e.stack || e); }
  try { fs.unlinkSync(tmp); } catch (e) { }
  if (html.indexOf('window._scrWrite = ') >= 0) {
    const has = t => html.indexOf(t) >= 0;
    ok(has("'/screen/write'") && has("/^wr\\.(close|submit)$/"), '웹: 글쓰기 연결부 + 엔진 주소 + wr.<행동> 만 처리');
  }
  console.log(`write_engine: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();

// 소통방 롱폴(s291) 시험 — board-writer /lroom · /talks 의 wait 파라미터.  실행: node test/chat_longpoll.test.js
//  새 줄이 생기면 1.5초 안에 돌려준다 · 없으면 시간이 다 되어 changed:false · wait 없으면 예전과 같다 · 5초 메모리 스냅샷에 가려지지 않는다.
const fs = require('fs'), os = require('os'), path = require('path'), { pathToFileURL } = require('url');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const root = path.join(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-'));
const load = async () => { const f = path.join(tmp, 'bw-' + Math.random().toString(36).slice(2) + '.mjs'); fs.writeFileSync(f, fs.readFileSync(path.join(root, 'workers/src/board-writer.js'), 'utf8')); return (await import(pathToFileURL(f).href)).default; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
function mkDb(msgs, probes) {
  const rows = (sql, a) => {
    if (/^SELECT 1 AS x/.test(sql)) { probes.n++; const line = /line=\?1/.test(sql); const since = line ? a[1] : a[0], now = line ? a[2] : a[1]; return msgs.filter(m => (!line || m.line === a[0]) && (line || m.kind === 'chat') && m.ts > since && m.ts <= now).slice(0, 1).map(() => ({ x: 1 })); }
    if (/^SELECT id, kind, nick, text, stn, ts FROM line_msgs/.test(sql)) return msgs.filter(m => m.line === a[0] && m.ts <= a[1]).sort((x, y) => y.ts - x.ts).map(m => ({ id: m.id, kind: m.kind, nick: m.nick, text: m.text, stn: m.stn || null, ts: m.ts }));
    if (/^SELECT \* FROM \(SELECT 'L'/.test(sql)) return msgs.filter(m => m.kind === 'chat').sort((x, y) => y.ts - x.ts).map(m => ({ id: 'L' + m.id, nick: m.nick, text: m.text, ts: m.ts, line: m.line }));
    return [];
  };
  return { prepare: sql => ({ bind: (...a) => ({ first: async () => rows(sql, a)[0] || null, all: async () => ({ results: rows(sql, a) }), run: async () => ({}) }), run: async () => ({}), all: async () => ({ results: [] }), first: async () => null }), batch: async () => [] };
}
(async () => {
  const ctx = { waitUntil() { } };
  const call = (w, env, p) => w.fetch(new Request('https://w' + p), env, ctx).then(async r => ({ status: r.status, j: await r.json() }));
  const T = Date.now();
  let id = 10; const add = (msgs, line, text, ts, kind) => msgs.push({ id: ++id, line, kind: kind || 'chat', nick: 'n', text, ts: ts == null ? Date.now() : ts });
  // ① wait 가 없으면 예전과 같다(changed 필드 없음)
  {
    const msgs = []; add(msgs, '2호선', '안녕', T - 5000); const probes = { n: 0 }, w = await load(), env = { DB: mkDb(msgs, probes) };
    const r = await call(w, env, '/lroom?line=' + encodeURIComponent('2호선') + '&since=0');
    ok(r.status === 200 && r.j.ok && r.j.msgs.length === 1 && !('changed' in r.j) && probes.n === 0, 'wait 없이 부르면 예전 응답(changed 없음 · 대기 확인 없음)');
    const r2 = await call(w, env, '/lroom?line=' + encodeURIComponent('2호선') + '&since=' + (T - 5000));
    ok(!('changed' in r2.j), 'since 만 있어도 changed 없음');
  }
  // ② since=0 이면 기다리지 않는다
  {
    const msgs = []; const probes = { n: 0 }, w = await load(), env = { DB: mkDb(msgs, probes) };
    const t0 = Date.now(), r = await call(w, env, '/lroom?line=' + encodeURIComponent('2호선') + '&since=0&wait=5');
    ok(Date.now() - t0 < 600 && r.j.changed === false && probes.n === 0, '처음 받기(since=0)는 기다리지 않고 changed:false ' + (Date.now() - t0) + 'ms');
  }
  // ③ 새 줄이 없으면 시간이 다 될 때까지 붙들고 changed:false
  {
    const msgs = []; add(msgs, '2호선', '옛 줄', T - 8000); const probes = { n: 0 }, w = await load(), env = { DB: mkDb(msgs, probes) };
    const t0 = Date.now(), r = await call(w, env, '/lroom?line=' + encodeURIComponent('2호선') + '&since=' + (T - 8000) + '&wait=1');
    const dt = Date.now() - t0;
    ok(r.j.changed === false && dt >= 900 && dt < 1800 && probes.n >= 1, '새 줄이 없으면 wait 초 뒤 changed:false (' + dt + 'ms, 확인 ' + probes.n + '번)');
    ok(r.j.msgs.length === 1, '이어서 쓸 수 있게 since 이후 줄은 그대로 담는다');
  }
  // ④ 기다리는 중 새 줄 → 1.5초 안에 changed:true + 새 줄 포함 (5초 메모리 스냅샷에 가려지지 않는다)
  {
    const msgs = []; add(msgs, '2호선', '옛 줄', T - 8000); const probes = { n: 0 }, w = await load(), env = { DB: mkDb(msgs, probes) };
    await call(w, env, '/lroom?line=' + encodeURIComponent('2호선') + '&since=0');          // 메모리 스냅샷을 만든다(5초)
    setTimeout(() => add(msgs, '2호선', '새 줄!', Date.now()), 500);
    const t0 = Date.now(), r = await call(w, env, '/lroom?line=' + encodeURIComponent('2호선') + '&since=' + (T - 8000) + '&wait=10');
    const dt = Date.now() - t0;
    ok(r.j.changed === true && dt < 2300 && r.j.msgs.some(m => m.text === '새 줄!'), '기다리는 중 올라온 글이 ' + dt + 'ms 만에 담겨 온다(스냅샷을 버리고 다시 읽음)');
  }
  // ⑤ 다른 방 글은 깨우지 않는다
  {
    const msgs = []; add(msgs, '2호선', '옛 줄', T - 8000); const probes = { n: 0 }, w = await load(), env = { DB: mkDb(msgs, probes) };
    setTimeout(() => add(msgs, '3호선', '다른 방', Date.now()), 200);
    const t0 = Date.now(), r = await call(w, env, '/lroom?line=' + encodeURIComponent('2호선') + '&since=' + (T - 8000) + '&wait=1');
    ok(r.j.changed === false && Date.now() - t0 >= 900, '다른 노선 방의 새 글에는 깨어나지 않는다');
  }
  // ⑥ 전체(/talks) 도 같다
  {
    const msgs = []; add(msgs, '2호선', '옛 줄', T - 8000); const probes = { n: 0 }, w = await load(), env = { DB: mkDb(msgs, probes) };
    setTimeout(() => add(msgs, '7호선', '전체에 보일 줄', Date.now()), 400);
    const t0 = Date.now(), r = await call(w, env, '/talks?since=' + (T - 8000) + '&limit=40&wait=10');
    const dt = Date.now() - t0;
    ok(r.status === 200 && r.j.changed === true && dt < 2300 && r.j.talks.some(t => t.text === '전체에 보일 줄'), '/talks 도 새 줄이 생기면 ' + dt + 'ms 만에 돌려준다');
    const r2 = await call(w, env, '/talks?since=' + (T - 8000) + '&limit=40');
    ok(!('changed' in r2.j), '/talks wait 없이는 예전 응답');
  }
  // ⑦ 엉뚱한 wait 는 기다리지 않는다(예전 응답)
  {
    const msgs = []; add(msgs, '2호선', '옛 줄', T - 8000); const probes = { n: 0 }, w = await load(), env = { DB: mkDb(msgs, probes) };
    const t0 = Date.now();
    const a = await call(w, env, '/lroom?line=' + encodeURIComponent('2호선') + '&since=5&wait=-5'), b = await call(w, env, '/lroom?line=' + encodeURIComponent('2호선') + '&since=5&wait=abc');
    ok(!('changed' in a.j) && !('changed' in b.j) && Date.now() - t0 < 800 && probes.n === 0, '음수 · 글자 wait 는 기다리지 않는다');
    const c = await call(w, env, '/lroom?line=' + encodeURIComponent('<script>') + '&since=5&wait=5');
    ok(c.status === 400, '이상한 노선 이름은 그대로 400');
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('\nchat_longpoll: ' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();

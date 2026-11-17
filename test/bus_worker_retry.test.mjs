// s461: gildongmu-bus 워커 — 인천 BIS 의 '세션 소진(resultCode 99, HTTP 200)' 을 엣지 캐시에 굳히지 않고 다른 후보 주소로 다시 받는다
import fs from 'fs';
import os from 'os'; import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'busw-')), f = path.join(tmp, 'bus_mod.mjs');
fs.writeFileSync(f, fs.readFileSync(path.join(root, 'workers/src/bus.js'), 'utf8'));
const mod = await import(f + '?x=' + Date.now());
const worker = mod.default;
const S99 = '{"response":{"header":{"resultCode":99,"resultMsg":"세션 없음 (30/30)"},"body":""}}';
const OK = '{"response":{"header":{"resultCode":"00"},"body":{"items":{"item":[{"routeno":"75"}]},"totalCount":1}}}';
let calls = [], mode;
globalThis.fetch = async (u) => { calls.push(String(u)); const n = calls.length;
  const body = mode === 'allbad' ? S99 : (mode === 'once' ? (n === 1 ? S99 : OK) : OK);
  return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } }); };
const env = { DATA_GO_KR_KEY: 'abc%2Bdef' };
const ctx = { waitUntil() {} };
async function ask(stop) { const u = 'https://x/tago?url=' + encodeURIComponent('https://apis.data.go.kr/6280000/ArvlInfo/getArvlInfo?bstopId=' + stop);
  const r = await worker.fetch(new Request(u), env, ctx); return [r.status, await r.text(), r.headers.get('x-gm-cache')]; }
let fails = 0; const ok = (c, m) => { console.log(c ? '  ok  ' : '  FAIL', m); if (!c) fails++; };
mode = 'once'; calls = []; let r = await ask('s1');
ok(r[0] === 200 && r[1] === OK && calls.length === 2 && calls[0] !== calls[1], '99 한 번 → 다른 후보 주소로 다시 받아 정상 본문');
mode = 'allbad'; calls = []; r = await ask('s2');
ok(r[0] === 200 && r[1] === S99 && calls.length === 3, '계속 99 → 두 번 다시 시도(총 3번)하고 그대로 돌려준다 ' + calls.length);
mode = 'ok'; calls = []; r = await ask('s3');
ok(r[1] === OK && calls.length === 1, '정상이면 한 번만');
mode = 'allbad'; calls = []; r = await ask('s2');
ok(r[1] === S99 && calls.length === 3, '오류 본문은 서버 메모리에 굳히지 않는다(다시 부름)');
process.exit(fails ? 1 : 0);

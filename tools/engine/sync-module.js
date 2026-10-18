#!/usr/bin/env node
// 엔진 모듈(engine/*.js)을 Worker 붙여넣기 파일(engine/route-v2-worker.ascii.js)에 맞춘다 — 2026-10-19.
//   Worker 파일에는 모듈 본문이 'ASCII 이스케이프(\uXXXX)' 로 들어 있다(맨 아래 module.exports 줄 · 'use strict' 는 뺀 채).
//   이 도구: Worker 파일 안의 그 모듈 구간('// ===== 이름 (…) 시작' ~ '이름 끝')을 지금 파일 본문으로 통째로 바꾼다.
// 사용: node tools/engine/sync-module.js engine/ride-eta.js engine/ride-track.js [--version route-v2-…]
'use strict';
const fs = require('fs'), cp = require('child_process');
const args = process.argv.slice(2); let ver = null; const files = [];
for (let i = 0; i < args.length; i++) { if (args[i] === '--base') i++; else if (args[i] === '--version') ver = args[++i]; else files.push(args[i]); }
const W = 'engine/route-v2-worker.ascii.js';
let w = fs.readFileSync(W, 'utf8');
function esc(s) { let o = ''; for (const ch of s) { const c = ch.codePointAt(0); if (c < 128) o += ch; else if (c < 0x10000) o += '\\u' + c.toString(16).padStart(4, '0'); else { const x = c - 0x10000; o += '\\u' + (0xd800 + (x >> 10)).toString(16) + '\\u' + (0xdc00 + (x & 0x3ff)).toString(16); } } return o; }
function body(src) { const i = src.lastIndexOf('if (typeof module'); let b = i > 0 ? src.slice(0, i) : src; return b; }
// 모듈 이름 = 파일 이름(engine/ride-eta.js → ride-eta). Worker 에는 '// ===== <이름> (…) 시작 =====' 줄 다음부터 '// ===== <이름> \ub05d =====' 줄 앞까지가 그 모듈 본문이다.
// (기준 본문과 글자 하나하나 맞추지 않고 구간 통째로 바꾼다 — 주석만 다른 옛 복사본도 맞춰진다.)
for (const f of files) {
  const name = f.replace(/^.*\//, '').replace(/\.js$/, '');
  const a = w.indexOf('// ===== ' + name + ' (');
  if (a < 0 || w.indexOf('// ===== ' + name + ' (', a + 1) >= 0) throw new Error(f + ': Worker 에서 시작 표지가 정확히 한 곳이 아님');
  const aEnd = w.indexOf('\n', a) + 1;
  const b = w.indexOf('// ===== ' + name + ' \\ub05d', aEnd);
  if (b < 0) throw new Error(f + ': Worker 에서 끝 표지를 못 찾음');
  const n = body(fs.readFileSync(f, 'utf8')).replace(/^'use strict';\n/m, '');
  const en = esc(n) + '\n';
  console.log('sync', f, b - aEnd, '→', en.length);
  w = w.slice(0, aEnd) + en + w.slice(b);
}
if (ver) { const m = w.match(/ENGINE_VERSION\s*=\s*["']([^"']+)["']/); if (m) { w = w.replace(m[0], m[0].replace(m[1], ver)); console.log('version', m[1], '→', ver); } else console.log('ENGINE_VERSION 없음'); }
fs.writeFileSync(W, w);

// 엔진 워커(route-v2-worker.ascii.js)에서 부르는 함수가 실제로 정의돼 있는지 확인 — s213: ntLiveFirst 호출만 있고 본문이 빠져 전체 경로 응답이 500 이었다
const fs = require('fs'), path = require('path'), assert = require('assert');
const W = fs.readFileSync(path.join(__dirname, '..', 'engine/route-v2-worker.ascii.js'), 'utf8');
let pass = 0;
const ok = (c, m) => { assert.ok(c, m); pass++; console.log('  ok  ', m); };
for (const n of ['ntNz', 'ntLiveKey', 'ntLiveTargets', 'ntLiveFirst', 'ntAttachPath', 'ntAttachAll', 'bandedRest', 'corridorBoxes']) {
  ok(new RegExp('(async )?function ' + n + '\\(').test(W), n + ' 정의가 워커에 있다');
}
// 호출하는 nt* / rs* 함수(점 앞이 없는 단독 호출)는 모두 정의돼 있어야 한다
const called = new Set(); const re = /(?<![.\w$])(nt[A-Z]\w*|rsBl\w*)\(/g; let m;
while ((m = re.exec(W))) called.add(m[1]);
for (const n of called) { if (new RegExp('function ' + n + '\\b|(var|let|const) ' + n + '\\b').test(W)) continue; assert.fail(n + ' 호출은 있는데 정의가 없다'); }
ok(true, '호출되는 nt*/rsBl* 함수 ' + called.size + '개가 모두 정의돼 있다');
console.log(pass + ' 통과 / 0 실패');

// 엔진이 만든 화면 JSON 들을 앱 검증기(ScreenCore.load + layout)에 넣어 본다 — 시험 공용. 결과: 줄마다 'OK 노드수 건너뜀 본문높이' 또는 'FAIL 사유'
const fs = require('fs'), path = require('path'), os = require('os'), { spawnSync } = require('child_process');
module.exports = function screenCheck(screens) {
  const R = p => path.join(__dirname, '..', '..', p);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scrchk_'));
  try {
    const f = path.join(dir, 'in.jsonl'), cls = path.join(dir, 'c');
    fs.writeFileSync(f, screens.map(s => JSON.stringify(s)).join('\n') + '\n'); fs.mkdirSync(cls);
    const ENV = Object.assign({}, process.env, { JAVA_TOOL_OPTIONS: '' });
    let r = spawnSync('javac', ['-encoding', 'UTF-8', '-d', cls, R('native/shell/ScreenCore.java'), R('test/java/ScreenCheck.java')], { env: ENV, encoding: 'utf8' });
    if (r.status !== 0) return { err: 'javac: ' + (r.stderr || '').slice(0, 300), out: [] };
    r = spawnSync('java', ['-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-cp', cls, 'com.dullyyj.subway.ScreenCheck', f], { env: ENV, encoding: 'utf8' });
    return { err: '', out: (r.stdout || '').split('\n').filter(Boolean) };
  } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { } }
};

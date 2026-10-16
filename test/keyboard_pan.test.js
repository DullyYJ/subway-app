// 키보드가 올라올 때 화면(웹뷰)이 줄어들지 않는다 — 2026-10-16 (YJ: "키보드 올라올 때 화면축소 시키지 마, 키보드만 올라오는 거야")
//   Capacitor 기본 AndroidManifest 는 windowSoftInputMode="adjustResize"(웹뷰 높이를 줄임).
//   CI 의 매니페스트 패치(파이썬)를 그대로 꺼내 가짜 Capacitor 매니페스트에 돌려, adjustPan 이 되는지 확인한다.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 500)); } };

const wf = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'build-apk.yml'), 'utf8').split('\n');
function pyBlock(marker) {
  let start = -1;
  for (let i = 0; i < wf.length; i++) if (/python3 -? ?<< ?'PYEOF'/.test(wf[i])) {
    let end = i + 1; while (end < wf.length && wf[end].trim() !== 'PYEOF') end++;
    const body = wf.slice(i + 1, end).join('\n');
    if (body.includes(marker)) { start = i; const ind = (wf[i + 1].match(/^ */) || [''])[0].length; return wf.slice(i + 1, end).map(l => l.slice(Math.min(ind, (l.match(/^ */) || [''])[0].length))).join('\n'); }
  }
  return null;
}
const MAN = (attr) => `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application android:allowBackup="true" android:label="@string/app_name">
        <activity
            android:exported="true"
            android:name=".MainActivity"
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode|navigation|density"
            ${attr}
            android:launchMode="singleTask">
        </activity>
    </application>
</manifest>
`;
function run(attr) {
  const code = pyBlock('resizeableActivity'); assert(code, '워크플로에서 매니페스트 패치 파이썬을 못 찾았다');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'kbp-')), m = path.join(d, 'android/app/src/main/AndroidManifest.xml');
  fs.mkdirSync(path.dirname(m), { recursive: true }); fs.writeFileSync(m, MAN(attr));
  fs.writeFileSync(path.join(d, '_p.py'), code);
  const r = cp.spawnSync('python3', [path.join(d, '_p.py')], { cwd: d, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, 'python 실패: ' + r.stderr);
  return fs.readFileSync(m, 'utf8');
}
const modes = (s) => (s.match(/android:windowSoftInputMode="[^"]*"/g) || []);

t('Capacitor 기본값(adjustResize)이 adjustPan 으로 바뀐다 — 웹뷰가 줄어들지 않는다', () => {
  const s = run('android:windowSoftInputMode="adjustResize"');
  assert.deepStrictEqual(modes(s), ['android:windowSoftInputMode="adjustPan"'], modes(s).join());
  assert(!/adjustResize/.test(s));
});
t('속성이 아예 없던 매니페스트에도 adjustPan 이 하나만 들어간다', () => {
  const s = run('');
  assert.deepStrictEqual(modes(s), ['android:windowSoftInputMode="adjustPan"'], modes(s).join());
});
t('기존 패치(폴드 크기 변화·resizeableActivity)는 그대로', () => {
  const s = run('android:windowSoftInputMode="adjustResize"');
  assert(/android:resizeableActivity="true"/.test(s) && /screenSize/.test(s));
});
t('다른 곳에서 adjustResize 로 되돌리지 않는다(워크플로·네이티브·웹)', () => {
  const root = path.join(__dirname, '..');
  const hits = [];
  ['.github/workflows/build-apk.yml'].forEach(f => { fs.readFileSync(path.join(root, f), 'utf8').split('\n').forEach((l, i) => { if (/adjustResize|SOFT_INPUT_ADJUST_RESIZE/.test(l) && !/^\s*#/.test(l)) hits.push(f + ':' + (i + 1)); }); });
  fs.readdirSync(path.join(root, 'native')).filter(f => /\.(java|kt|py)$/.test(f)).forEach(f => { if (/SOFT_INPUT_ADJUST_RESIZE|adjustResize/.test(fs.readFileSync(path.join(root, 'native', f), 'utf8'))) hits.push('native/' + f); });
  assert.deepStrictEqual(hits, [], '남아 있는 adjustResize: ' + hits.join(', '));
});

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);

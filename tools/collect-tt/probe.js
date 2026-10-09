// 외부 사이트 구조 확인용(Actions 에서 실행): URL 목록을 받아 out/probe-*.txt 로 저장
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
const urls = (process.env.URLS || '').split('\n').map(s => s.trim()).filter(Boolean);
(async () => {
  let i = 0;
  for (const u of urls) {
    i++;
    try {
      const r = await fetch(u, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36', accept: '*/*' }, signal: AbortSignal.timeout(30000) });
      const t = await r.text();
      fs.writeFileSync(path.join(OUT, 'probe-' + i + '.txt'), 'URL ' + u + '\nSTATUS ' + r.status + '\nTYPE ' + r.headers.get('content-type') + '\nLEN ' + t.length + '\n\n' + t.slice(0, 400000));
      console.log(i, r.status, t.length);
    } catch (e) { fs.writeFileSync(path.join(OUT, 'probe-' + i + '.txt'), 'URL ' + u + '\nERR ' + e.message + ' ' + (e.cause && e.cause.code)); console.log(i, 'ERR', e.message); }
  }
})();

// 특일 정보 API(공공데이터포털) 사용 가능 여부 확인 — Actions 에서 TAGO_KEY 로 실행. 키는 로그·결과에 남기지 않는다.
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
const KEY = process.env.TAGO_KEY || '';
const ops = ['getRestDeInfo', 'getHoliDeInfo'];
(async () => {
  const res = [];
  for (const op of ops) for (const y of [2026, 2027]) {
    const url = 'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/' + op + '?solYear=' + y + '&numOfRows=100&_type=json&ServiceKey=' + encodeURIComponent(KEY);
    try { const r = await fetch(url, { signal: AbortSignal.timeout(30000) }); const t = await r.text(); res.push({ op, y, status: r.status, len: t.length, body: t.replace(KEY, '***').slice(0, 6000) }); }
    catch (e) { res.push({ op, y, err: String(e.message) }); }
  }
  fs.writeFileSync(path.join(OUT, 'probe-api.json'), JSON.stringify(res, null, 1));
  console.log(res.map(r => r.op + r.y + ' ' + (r.status || r.err)).join('\n'));
})();

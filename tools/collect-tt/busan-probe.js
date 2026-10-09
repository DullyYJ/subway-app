// 부산 방향 전환 파라미터 탐색: 전체 HTML 저장 + 변형 POST 비교
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
const H = 'https://data.humetro.busan.kr';
const HD = { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36', 'content-type': 'application/x-www-form-urlencoded', referer: H + '/homepage/default/stationtime/page/list.do?menu_no=1001010301' };
async function post(url, body) { const r = await fetch(H + url, { method: 'POST', headers: HD, body: new URLSearchParams(body).toString(), signal: AbortSignal.timeout(30000) }); return await r.text(); }
const U = '/homepage/default/stationtime/page/view.do?menu_no=10010103';
const dests = h => [...new Set([...h.matchAll(/<span class="blind">([^<]*?행)<\/span>/g)].map(m => m[1]))].join(',');
(async () => {
  const base = await post(U, { s_ho: '1', s_station: '101', s_cho: '' });
  fs.writeFileSync(path.join(OUT, 'probe-full.html'), base);
  const log = [];
  log.push('base dests=' + dests(base) + ' len=' + base.length);
  const sc = [...base.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => /onUpdown|s_cho|updown/i.test(s));
  fs.writeFileSync(path.join(OUT, 'probe-scripts.txt'), sc.join('\n=====\n'));
  const forms = [...base.matchAll(/<form[\s\S]*?<\/form>/g)].map(m => m[0]);
  fs.writeFileSync(path.join(OUT, 'probe-forms.txt'), forms.join('\n=====\n'));
  const variants = [{ s_cho: '1' }, { s_cho: '0' }, { s_updown: '1' }, { s_updown_cd: '1' }, { updown: '1' }, { s_cho: '2' }, { s_course: '1' }, { s_ud: '1' }, { s_dir: '1' }];
  for (const v of variants) { try { const h = await post(U, Object.assign({ s_ho: '1', s_station: '101', s_cho: '' }, v)); log.push(JSON.stringify(v) + ' dests=' + dests(h) + ' len=' + h.length); } catch (e) { log.push(JSON.stringify(v) + ' ERR ' + e.message); } }
  fs.writeFileSync(path.join(OUT, 'probe-log.txt'), log.join('\n'));
  console.log(log.join('\n'));
})();

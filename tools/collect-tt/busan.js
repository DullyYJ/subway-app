// 부산교통공사(data.humetro.busan.kr) 역별 열차시각표 원본 HTML 수집 — Actions 에서 실행. 결과: out/busan.json {호선:{역코드:{nm, html}}}
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
const H = 'https://data.humetro.busan.kr';
const UA = { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36', 'content-type': 'application/x-www-form-urlencoded', referer: H + '/homepage/default/stationtime/page/list.do?menu_no=1001010301' };
async function post(url, body) {
  for (let a = 0; a < 3; a++) {
    try { const r = await fetch(H + url, { method: 'POST', headers: UA, body: new URLSearchParams(body).toString(), signal: AbortSignal.timeout(30000) }); return await r.text(); }
    catch (e) { if (a === 2) throw e; await new Promise(r => setTimeout(r, 1500)); }
  }
}

// 상세 시각표 table → {on:현재방향라벨, rows:[[hh,[[dest,mm]..](평일),[..](토),[..](일공휴)]]]}
function parse(html) {
  const i = html.indexOf('timetable-detail'); if (i < 0) return { rows: [] };
  const j = html.indexOf('</table>', i); const t = html.slice(i, j);
  const on = (html.match(/course-on"[^>]*>\s*([^<]*?)\s*<\/a>/) || [])[1] || '';
  const rows = [];
  for (const tr of t.split('<tr>').slice(1)) {
    const hh = (tr.match(/<th scope="row">\s*(\d+)\s*<\/th>/) || [])[1]; if (hh == null) continue;
    const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => [...m[1].matchAll(/<span class="blind">([^<]*?)행<\/span>\s*(\d+)\s*<span class="blind">분/g)].map(x => [x[1], x[2]]));
    rows.push([hh, tds[0] || [], tds[1] || [], tds[2] || []]);
  }
  return { on, rows };
}
(async () => {
  const res = {}; let n = 0;
  for (const line of ['1', '2', '3', '4']) {
    const opt = await post('/homepage/stationinfo/stationCodeAjax.do', { s_line: line });
    fs.writeFileSync(path.join(OUT, 'busan-opt-' + line + '.html'), opt);
    const stations = [...opt.matchAll(/<option\s+value="([^"]*)"[^>]*>([^<]*)<\/option>/g)].map(m => ({ code: m[1], nm: m[2].trim() })).filter(s => s.code);
    console.log('호선', line, '역', stations.length);
    res[line] = {};
    for (const s of stations) {
      res[line][s.code] = { nm: s.nm, ud: {} };
      for (const ud of ['0', '1']) {
        try { const html = await post('/homepage/default/stationtime/page/view.do?menu_no=10010103', { s_ho: line, s_station: s.code, s_cho: '', updown: ud }); res[line][s.code].ud[ud] = parse(html); n++; }
        catch (e) { res[line][s.code].ud[ud] = { err: String(e.message).slice(0, 80) }; }
      }
    }
  }
  fs.writeFileSync(path.join(OUT, 'busan.json'), JSON.stringify(res));
  console.log('저장', n);
})();

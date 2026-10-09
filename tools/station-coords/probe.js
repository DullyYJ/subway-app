// 공공데이터포털 파일데이터에서 역 좌표 CSV 를 받아 온다(시험 수집). 사용: node probe.js <outdir>
const fs = require('fs'), path = require('path');
const out = process.argv[2] || 'out'; fs.mkdirSync(out, { recursive: true });
const log = []; const L = (...a) => { const s = a.join(' '); console.log(s); log.push(s); };
async function get(url, opt) {
  let last; for (let i = 0; i < 3; i++) { try { return await fetch(url, Object.assign({ headers: { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36', 'accept-language': 'ko' }, redirect: 'follow', signal: AbortSignal.timeout(25000) }, opt || {})); } catch (e) { last = e; await new Promise(r => setTimeout(r, 2000)); } }
  throw last; }
(async () => {
  const sets = { '15093755': '국가철도공단_도시광역철도_역사정보', '15013205': '전국도시철도역사정보표준데이터' };
  for (const id in sets) {
    for (const kind of ['fileData', 'standard']) {
      const url = 'https://www.data.go.kr/data/' + id + '/' + kind + '.do';
      try {
        const r = await get(url); const html = await r.text();
        L('PAGE', url, r.status, html.length);
        fs.writeFileSync(path.join(out, id + '_' + kind + '.html'), html);
        const ids = [...new Set([...html.matchAll(/atchFileId["':= ]+["']?(FILE_\d+)/g)].map(m => m[1]))];
        L('  atchFileId', ids.join(','));
        const sn = [...new Set([...html.matchAll(/fileDetailSn["':= ]+["']?(\d+)/g)].map(m => m[1]))];
        L('  fileDetailSn', sn.join(','));
        for (const f of ids) for (const n of (sn.length ? sn : ['1'])) {
          const du = 'https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId=' + f + '&fileDetailSn=' + n + '&insertDataPrcus=N';
          const d = await get(du); const buf = Buffer.from(await d.arrayBuffer());
          L('  DOWNLOAD', du, d.status, buf.length, d.headers.get('content-type'), d.headers.get('content-disposition'));
          if (d.status === 200 && buf.length > 500) fs.writeFileSync(path.join(out, id + '_' + f + '_' + n + '.bin'), buf);
        }
      } catch (e) { L('ERR', url, e.message, e.cause && (e.cause.code || e.cause.message)); }
    }
  }
  for (const id of ['15093755', '15013205']) for (const kind of ['fileData', 'standard', 'openapi']) {
    const u = 'https://www.data.go.kr/catalog/' + id + '/' + kind + '.json';
    try { const r = await get(u); const t = await r.text(); L('CATALOG', u, r.status, t.length); fs.writeFileSync(path.join(out, 'catalog_' + id + '_' + kind + '.json'), t); } catch (e) { L('CATALOG ERR', u, e.message); }
  }
  for (const u of ['https://www.data.go.kr/', 'https://api.data.go.kr/', 'https://apis.data.go.kr/1613000/SubwayInfo/GetSubwayStationList', 'https://overpass-api.de/api/status', 'https://data.kric.go.kr/']) {
    try { const r = await get(u); L('REACH', u, r.status); } catch (e) { L('REACH ERR', u, e.message, e.cause && (e.cause.code || e.cause.message)); }
  }
  // 파일데이터 내려받기(포털이 쓰는 주소) — 15093755
  for (const u of ['https://www.data.go.kr/tcs/dss/selectFileDataDownload.do?publicDataPk=15093755&publicDataDetailPk=uddi:df94c599-74fa-48e2-99c9-e743e49b5d78',
                   'https://www.data.go.kr/tcs/dss/selectFileDataDownload.do?recommendDataYn=Y&publicDataPk=15093755&publicDataDetailPk=uddi:df94c599-74fa-48e2-99c9-e743e49b5d78']) {
    try { const r = await get(u, { headers: { 'user-agent': 'Mozilla/5.0', referer: 'https://www.data.go.kr/data/15093755/fileData.do' } }); const b = Buffer.from(await r.arrayBuffer());
      L('FILEDL', r.status, b.length, r.headers.get('content-type'), r.headers.get('content-disposition'), b.slice(0, 200).toString('utf8').replace(/\s+/g, ' '));
      if (b.length > 300) fs.writeFileSync(path.join(out, 'stations_15093755_' + (u.includes('recommend') ? 'b' : 'a') + '.bin'), b);
    } catch (e) { L('FILEDL ERR', e.message); }
  }
  // 표준데이터 15013205 OpenAPI 페이지
  try { const r = await get('https://www.data.go.kr/data/15013205/openapi.do'); const t = await r.text(); L('OPENAPI PAGE', r.status, t.length); fs.writeFileSync(path.join(out, '15013205_openapi.html'), t); } catch (e) { L('OPENAPI PAGE ERR', e.message); }
  // OpenStreetMap(Overpass) — 지하철역 이름·좌표 교차 확인용
  const bb = { 대구: '35.70,128.30,36.00,128.95', 광주: '35.05,126.70,35.25,127.00', 대전: '36.25,127.25,36.45,127.55' };
  for (const c in bb) {
    const q = '[out:json][timeout:60];(node["railway"="station"](' + bb[c] + ');node["railway"="stop"]["station"="subway"](' + bb[c] + '););out tags center;';
    try { const r = await get('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'gildongmu-probe' } }); const t = await r.text(); L('OSM', c, r.status, t.length); fs.writeFileSync(path.join(out, 'osm_' + c + '.json'), t); } catch (e) { L('OSM ERR', c, e.message); }
  }
  // KRIC stationInfo (TAGO 키가 통하는지)
  const key = process.env.TAGO_KEY;
  if (key) for (const [opr, ln, cd] of [['DG', '1', '0115'], ['KR', '1', '135']]) {
    const u = 'https://openapi.kric.go.kr/openapi/convenientInfo/stationInfo?serviceKey=' + encodeURIComponent(key) + '&format=json&railOprIsttCd=' + opr + '&lnCd=' + ln + '&stinCd=' + cd;
    try { const r = await get(u); const t = await r.text(); L('KRIC', opr, ln, cd, r.status, t.slice(0, 300).replace(/\s+/g, ' ')); } catch (e) { L('KRIC ERR', e.message); }
  }
  fs.writeFileSync(path.join(out, 'log.txt'), log.join('\n'));
})();

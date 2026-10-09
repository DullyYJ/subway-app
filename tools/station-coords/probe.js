// 공공데이터포털 파일데이터에서 역 좌표 CSV 를 받아 온다(시험 수집). 사용: node probe.js <outdir>
const fs = require('fs'), path = require('path');
const out = process.argv[2] || 'out'; fs.mkdirSync(out, { recursive: true });
const log = []; const L = (...a) => { const s = a.join(' '); console.log(s); log.push(s); };
async function get(url, opt) { const r = await fetch(url, Object.assign({ headers: { 'user-agent': 'Mozilla/5.0' }, redirect: 'follow' }, opt || {})); return r; }
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
  for (const u of ['https://www.data.go.kr/', 'https://api.data.go.kr/', 'https://apis.data.go.kr/1613000/SubwayInfo/GetSubwayStationList', 'https://overpass-api.de/api/status', 'https://data.kric.go.kr/']) {
    try { const r = await get(u); L('REACH', u, r.status); } catch (e) { L('REACH ERR', u, e.message, e.cause && (e.cause.code || e.cause.message)); }
  }
  // KRIC stationInfo (TAGO 키가 통하는지)
  const key = process.env.TAGO_KEY;
  if (key) for (const [opr, ln, cd] of [['DG', '1', '0115'], ['KR', '1', '135']]) {
    const u = 'https://openapi.kric.go.kr/openapi/convenientInfo/stationInfo?serviceKey=' + encodeURIComponent(key) + '&format=json&railOprIsttCd=' + opr + '&lnCd=' + ln + '&stinCd=' + cd;
    try { const r = await get(u); const t = await r.text(); L('KRIC', opr, ln, cd, r.status, t.slice(0, 300).replace(/\s+/g, ' ')); } catch (e) { L('KRIC ERR', e.message); }
  }
  fs.writeFileSync(path.join(out, 'log.txt'), log.join('\n'));
})();

// D1(subway-db)의 kric_tt(KRIC 역별 시각표; 엔진이 쌓아 둔 것)를 읽어 out/kric.json 으로 내보낸다. Actions 에서 CF_API_TOKEN·CF_ACCOUNT_ID 시크릿으로 실행.
//   행: { opr, ln, st(역코드), day(7토/8평일/9휴일), nm(역이름), data("열차번호,도착,출발,출발역코드,도착역코드\n…") }
const fs = require('fs'), path = require('path');
const TOKEN = process.env.CF_API_TOKEN, ACCT = process.env.CF_ACCOUNT_ID, DB = process.env.D1_ID || 'c06de2e6-d6bc-401c-be32-25fde0b5f747';
if (!TOKEN || !ACCT) { console.error('CF_API_TOKEN/CF_ACCOUNT_ID 없음'); process.exit(1); }
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
const oprs = (process.env.OPRS || 'DG,DJ,GJ').split(',');
async function q(sql, params) {
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCT}/d1/database/${DB}/query`, { method: 'POST', headers: { authorization: 'Bearer ' + TOKEN, 'content-type': 'application/json' }, body: JSON.stringify({ sql, params: params || [] }), signal: AbortSignal.timeout(60000) });
      const j = await r.json(); if (!j.success) throw new Error(JSON.stringify(j.errors).slice(0, 200));
      return j.result[0].results;
    } catch (e) { if (a === 2) throw e; await new Promise(r => setTimeout(r, 2000)); }
  }
}
(async () => {
  const out = [];
  for (const opr of oprs) {
    const keys = await q('SELECT ln, st, day FROM kric_tt WHERE opr = ? ORDER BY ln, st, day', [opr]);
    console.log(opr, '행', keys.length);
    for (let i = 0; i < keys.length; i += 8) {
      const part = keys.slice(i, i + 8);
      const where = part.map(() => '(ln = ? AND st = ? AND day = ?)').join(' OR ');
      const rows = await q('SELECT opr, ln, st, day, nm, n, data FROM kric_tt WHERE opr = ? AND (' + where + ')', [opr].concat(...part.map(k => [k.ln, k.st, k.day])));
      rows.forEach(r => out.push(r));
    }
  }
  fs.writeFileSync(path.join(OUT, 'kric.json'), JSON.stringify(out));
  console.log('저장', out.length, '행');
})().catch(e => { console.error('실패', String(e.message).slice(0, 300)); process.exit(1); });

console.warn=()=>{};console.log0=console.log;import fs from 'fs';
export async function load(modPath){
  const M = await import(modPath);
  const rows = JSON.parse(fs.readFileSync('/tmp/prof/rows.json','utf8'));
  const xp = JSON.parse(fs.readFileSync('/tmp/prof/kric_xp_r.json','utf8'));
  const seg = JSON.parse(fs.readFileSync('/tmp/prof/kric_seg_r.json','utf8'));
  const env = { DB: { prepare(sql){ return { all: async()=>({results: sql.includes('kric_seg')?seg:xp}) } } } };
  const G0 = M.buildSubway(M.SUBWAY_BUNDLE);
  await M.kricLoad(env, G0);
  const baseMs = Date.UTC(2026,9,7,7,0,0); // 16:00 KST weekday
  function mkG(){
    const nk = M._nowMinKST(baseMs);
    const G = { adj:Object.create(null), ST:G0.ST, LN:G0.LN, _weekend:false, _baseMs:baseMs, _baseCustom:true };
    G.subOff = M.subOffSet(G.LN, nk, false); G.subFirst = M.subNextFirst(G.LN, nk, false);
    for (const k in G0.adj) G.adj[k] = G0.adj[k].slice();
    return G;
  }
  return { M, rows, mkG, G0 };
}

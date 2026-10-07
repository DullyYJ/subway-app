// 카카오맵(map.kakao.com) 탭의 콘솔/javascript_tool 에서 실행. 케이스 좌표: test/bench/route_cases_70.json ({ci,sy,sx,ey,ex,...}).
// 한 건: window.__kkOne(ci, sx, sy, ex, ey) → {rows:[{min,tr,walk,tx}], tabs, t}  (min = 카카오 총 소요(분), 대기시간은 포함되지 않음)
window.__kkOne = async (ci, sx, sy, ex, ey) => {
  const t0 = performance.now(); const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;left:0;top:0;width:420px;height:900px;opacity:0.01;pointer-events:none;border:0';
  f.src = `/link/by/publictransit/S${ci},${sy},${sx}/E${ci},${ey},${ex}`; document.body.appendChild(f);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  try {
    let d = null, btn = null; for (let i = 0; i < 60; i++) { await sleep(250); try { d = f.contentDocument; btn = d && d.querySelector('a#transit'); } catch (e) { return { err: 'frame ' + e }; } if (btn) break; }
    if (!btn) return { err: 'no transit btn', t: Math.round(performance.now() - t0) };
    await sleep(500); btn.click();
    let items = []; for (let i = 0; i < 80; i++) { await sleep(250); items = [...d.querySelectorAll('li.TransitRouteItem')]; if (items.length) break; }
    if (!items.length) return { err: 'no items', t: Math.round(performance.now() - t0) };
    await sleep(400); items = [...d.querySelectorAll('li.TransitRouteItem')];
    const rows = items.map(li => { const tx = li.innerText.replace(/\n+/g, ' '); const m = tx.match(/^\s*(?:(\d+)시간)?\s*(?:(\d+)분)?/); const mins = (+(m && m[1] || 0)) * 60 + (+(m && m[2] || 0)); const tr = tx.match(/환승(\d+)회|환승없음/); const w = tx.match(/도보\s*(?:(\d+)시간)?\s*(?:(\d+)분)?/); return { min: mins, tr: tr ? (tr[1] ? +tr[1] : 0) : null, walk: w ? ((+(w[1] || 0)) * 60 + (+(w[2] || 0))) : null, tx: tx.slice(0, 80) }; });
    const tabs = [...d.querySelectorAll('li.list')].map(e => e.innerText.replace(/\n/g, ' ')).slice(0, 5);
    return { rows, tabs, t: Math.round(performance.now() - t0) };
  } finally { f.remove(); }
};

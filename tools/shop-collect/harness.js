// 쿠팡 파트너스 페이지(partners.coupang.com, 로그인 상태) 안에서 실행하는 수집기 — 크롬 확장 javascript_tool 로 붙여 넣는다.
// 준비: ① 페이지에 XHR 훅을 걸어 `window.__hdr`(검색 요청 헤더, x-token 포함)를 얻는다(README 참고) ② `window.__PLAN = <plan.json>` ③ 이 파일 실행.
// 원칙: ★ 분당 50회 제한 — 요청 사이 4.5초 이상(분당 13회) · 429 나 이상한 응답이 한 번이라도 오면 즉시 전체 중단(재시도 없음).
// 결과: window.__S.items = [{c,g,n,u,i(원본경로),rc,t}] — localStorage('gdm_shop_collect')에도 저장한다.
(function () {
  const GAP = 4500, Q = window.__PLAN.q, CANDS = window.__PLAN.cands;
  const S = window.__S = window.__S || { items: [], halt: false, why: '', calls: 0, last: '', done: {}, skipped: [] };
  try { const o = JSON.parse(localStorage.getItem('gdm_shop_collect') || 'null'); if (o && o.items && !S.items.length) { S.items = o.items; S.done = o.done || {}; S.skipped = o.skipped || []; } } catch (e) {}
  const save = () => { try { localStorage.setItem('gdm_shop_collect', JSON.stringify({ items: S.items, done: S.done, skipped: S.skipped })); } catch (e) {} };
  const norm = s => String(s || '').replace(/\s/g, '');
  const imgPath = u => { const m = /\/thumbnails\/remote\/\d+x\d+ex\/(.+)$/.exec(String(u || '')); return m ? m[1] : String(u || ''); };
  let lastAt = 0;
  async function api(path, body) {
    if (S.halt) throw new Error('halt');
    const wait = GAP + Math.random() * 600 - (Date.now() - lastAt); if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastAt = Date.now(); S.calls++;
    const r = await fetch(path, { method: 'POST', headers: Object.assign({}, window.__hdr), body: JSON.stringify(body) });
    let j = null; try { j = await r.json(); } catch (e) {}
    if (r.status !== 200 || !j || j.rCode !== '0') { S.halt = true; S.why = 'status ' + r.status + ' ' + (j ? j.rCode + ' ' + String(j.rMessage).slice(0, 120) : 'nojson'); S.last = S.why; throw new Error(S.why); }
    return j.data;
  }
  window.__collect = async function (order) {
    S.running = true;
    const old = await (await fetch('https://gildongmu-shop.phg0643.workers.dev/shop')).json();
    const names = new Set(), imgs = new Set(), pids = new Set(S.items.map(x => x.pid));
    for (const c of old.data.CATS) for (const it of c.items) { names.add(norm(it.n)); imgs.add(imgPath(it.i)); }
    for (const x of S.items) { names.add(norm(x.n)); imgs.add(x.i); }
    const count = (c, g) => S.items.filter(x => x.c === c && x.g === g).length;
    for (const c of order) for (const g of Object.keys(Q[c])) {
      for (const k of CANDS[c][g]) {
        if (S.halt) { S.running = false; return; }
        if (count(c, g) >= Q[c][g]) break;
        if (S.done[c + '|' + k]) continue;
        if (names.has(norm(k))) { S.done[c + '|' + k] = 'dupname'; continue; }
        try {
          const d = await api('/api/v1/search', { page: { pageNumber: 0, size: 12 }, filter: k, deliveryTypes: [] });
          const ps = ((d && d.products) || []).slice(0, 10).filter(p => p.valid !== false && (p.ratingAverage || 0) >= 4.0 && (p.ratingCount || 0) >= 30 && (p.salesPrice || 0) > 0 && !p.travel);
          ps.sort((a, b) => (b.ratingCount || 0) - (a.ratingCount || 0));
          const p = ps.find(p => !pids.has(p.productId) && !imgs.has(imgPath(p.rawImage || p.image)));
          if (!p) { S.done[c + '|' + k] = 'nocand'; S.skipped.push(k); save(); continue; }
          const l = await api('/api/v1/banner/iframe/url', { product: { type: 'PRODUCT', itemId: p.itemId, productId: p.productId, vendorItemId: p.vendorItemId, image: p.image, title: p.title, originPrice: p.originPrice, salesPrice: p.salesPrice, travel: 'false', discountRate: null } });
          if (!l || !/^https:\/\/link\.coupang\.com\/a\//.test(l.shortUrl || '')) { S.halt = true; S.why = 'nolink'; S.running = false; return; }
          const it = { c, g, n: k, u: l.shortUrl, i: imgPath(p.rawImage || p.image), rc: p.ratingCount, t: p.title };
          S.items.push(it); pids.add(p.productId); imgs.add(it.i); names.add(norm(k)); S.done[c + '|' + k] = 'ok'; save();
        } catch (e) { S.running = false; return; }
      }
    }
    S.running = false; S.finished = true;
  };
})();

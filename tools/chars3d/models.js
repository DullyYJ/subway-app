// 길동무 캐릭터 6종 — three.js 로 만든 3D 모델과 동작(오프라인 렌더링용). 앞(진행 방향)은 +x, 위는 +y, 카메라 쪽이 +z.
(function () {
  const T = THREE;
  // ── 재료·도형 도우미 ──
  const mat = (c, o) => new T.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.88, metalness: 0 }, o || {}));
  const glossy = (c, o) => new T.MeshPhysicalMaterial(Object.assign({ color: c, roughness: 0.25, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25 }, o || {}));
  function sh(m) { m.castShadow = true; m.receiveShadow = true; return m; }
  function ell(sx, sy, sz, m, seg) { const g = new T.Mesh(new T.SphereGeometry(1, seg || 28, Math.round((seg || 28) * 0.75)), m); g.scale.set(sx, sy, sz); return sh(g); }
  // 위쪽 끝이 관절(원점), 아래로 len 만큼 늘어진 캡슐
  function limb(len, r, m) { const g = new T.Mesh(new T.CapsuleGeometry(r, Math.max(0.001, len - 2 * r), 6, 14), m); g.position.y = -len / 2; const grp = new T.Group(); grp.add(sh(g)); return grp; }
  function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return (s % 100000) / 100000; }; }
  // 털 뭉치(작은 공을 표면에 흩뿌림) — keep(dir) 이 false 면 그 방향은 맨살로 둔다
  function fluff(parent, rx, ry, rz, n, size, m, seed, keep) {
    const geo = new T.SphereGeometry(1, 10, 8), im = new T.InstancedMesh(geo, m, n), R = rng(seed), d = new T.Object3D(); let k = 0, guard = 0;
    while (k < n && guard++ < n * 40) {
      const u = R() * 2 - 1, th = R() * Math.PI * 2, s = Math.sqrt(1 - u * u), dir = new T.Vector3(s * Math.cos(th), u, s * Math.sin(th));
      if (keep && !keep(dir)) continue;
      const sz = size * (0.75 + R() * 0.5), off = 0.96 + R() * 0.06;
      d.position.set(dir.x * rx * off, dir.y * ry * off, dir.z * rz * off); d.scale.setScalar(sz); d.rotation.set(R() * 3, R() * 3, R() * 3); d.updateMatrix(); im.setMatrixAt(k++, d.matrix);
    }
    im.count = k; im.castShadow = true; im.receiveShadow = true; parent.add(im); return im;
  }
  const eyeBlack = () => glossy(0x16110f, { roughness: 0.1, clearcoat: 1 });
  function bead(parent, x, y, z, r, c) { const e = ell(r, r * 1.08, r, c || eyeBlack(), 18); e.position.set(x, y, z); parent.add(e); const hl = ell(r * 0.3, r * 0.3, r * 0.3, new T.MeshBasicMaterial({ color: 0xffffff }), 8); hl.position.set(x + r * 0.35, y + r * 0.4, z + (z >= 0 ? r * 0.55 : -r * 0.55)); hl.castShadow = false; parent.add(hl); return e; }

  // ═════ 강아지 (돌솜 = 흰 비숑·파란 리본, 뽀푸 = 갈색 푸들·가죽 목줄) ═════
  function buildDog(o) {
    const root = new T.Group(), fm = mat(o.fur, { roughness: 0.95 }), P = {};
    const body = new T.Group(); body.position.y = 0.78; root.add(body); P.body = body;
    body.add(ell(0.6, 0.48, 0.46, fm)); fluff(body, 0.6, 0.48, 0.46, 520, 0.085, fm, o.seed);
    const head = new T.Group(); head.position.set(0.46, 0.55, 0); body.add(head); P.head = head;
    head.add(ell(0.68, 0.64, 0.66, fm, 32));
    fluff(head, 0.68, 0.64, 0.66, 760, 0.1, fm, o.seed + 1, d => !(d.x > 0.5 && d.y < 0.55 && d.y > -0.6 && Math.abs(d.z) < 0.62));   // 얼굴 앞쪽은 털을 비워 눈코가 보이게
    // 얼굴: 주둥이·코·눈
    const muz = ell(0.22, 0.17, 0.24, mat(o.muzzle || o.fur, { roughness: 0.9 })); muz.position.set(0.52, -0.12, 0); head.add(muz); fluff(muz, 0.22, 0.17, 0.24, 40, 0.06, mat(o.muzzle || o.fur, { roughness: 0.95 }), o.seed + 9, d => d.x < 0.55);
    const nose = ell(0.075, 0.06, 0.09, glossy(o.nose || 0x1a1412, { roughness: 0.2 })); nose.position.set(0.72, -0.04, 0); head.add(nose);
    bead(head, 0.55, 0.15, 0.25, 0.095); bead(head, 0.55, 0.15, -0.25, 0.095);
    const tongue = ell(0.07, 0.025, 0.07, mat(0xf27d8a, { roughness: 0.5 })); tongue.position.set(0.62, -0.25, 0); tongue.visible = !!o.tongue; head.add(tongue); P.tongue = tongue;
    if (o.brows) { [0.23, -0.23].forEach(z => { const b = ell(0.05, 0.02, 0.07, mat(o.browC || 0x998877)); b.position.set(0.47, 0.27, z); head.add(b); }); }
    // 귀(털 달린 늘어진 귀)
    P.ears = [];
    [1, -1].forEach(sd => {
      const eg = new T.Group(); eg.position.set(-0.05, 0.2, 0.62 * sd); head.add(eg);
      const e1 = ell(0.24, 0.42, 0.13, fm, 20); e1.position.y = -0.32; eg.add(e1); fluff(e1, 0.24, 0.42, 0.13, 120, 0.075, fm, o.seed + 7 + sd);
      eg.rotation.x = 0.0; P.ears.push(eg);
    });
    if (o.bow) {   // 리본(화면 오른쪽 위) — 고리 둘이 화면 가로로 펼쳐지게
      const bg = new T.Group(); bg.position.set(0.05, 0.64, 0.3); head.add(bg); const bi = new T.Group(); bi.rotation.y = 0.55; bg.add(bi); const bm = mat(o.bow, { roughness: 0.5 });
      [1, -1].forEach(s => { const w = ell(0.27, 0.15, 0.07, bm, 20); w.position.set(0.25 * s, 0.03 * s, 0); w.rotation.z = 0.45 * s; bi.add(w); const tl = ell(0.1, 0.07, 0.05, bm, 12); tl.position.set(0.12 * s, -0.12, 0); tl.rotation.z = -0.6 * s; bi.add(tl); });
      const kn = ell(0.1, 0.1, 0.09, bm, 16); bi.add(kn);
    }
    // 목줄
    if (o.collar) {
      const col = new T.Mesh(new T.TorusGeometry(0.47, 0.05, 10, 36), mat(o.collar, { roughness: 0.55 })); col.position.set(0.3, 0.06, 0); col.rotation.y = Math.PI / 2; col.rotation.x = 0.0; col.scale.set(1, 1.0, 1); body.add(sh(col));
      const bk = new T.Mesh(new T.BoxGeometry(0.08, 0.1, 0.06), mat(0xd6b04a, { metalness: 0.7, roughness: 0.3 })); bk.position.set(0.32, -0.12, 0.5); body.add(sh(bk));
    }
    // 꼬리
    const tail = new T.Group(); tail.position.set(-0.62, 0.22, 0); body.add(tail); const tb = ell(0.2, 0.2, 0.2, fm, 18); tb.position.set(-0.08, 0.1, 0); tail.add(tb); fluff(tb, 0.2, 0.2, 0.2, 26, 0.11, fm, o.seed + 3); P.tail = tail;
    // 다리 네 개 [앞오른, 앞왼, 뒤오른, 뒤왼]
    P.legs = [];
    [[0.36, 0.3], [0.36, -0.3], [-0.38, 0.3], [-0.38, -0.3]].forEach((p, i) => {
      const lg = new T.Group(); lg.position.set(p[0], -0.22, p[1]); body.add(lg);
      const up = limb(0.5, 0.16, fm); lg.add(up);
      const paw = ell(0.2, 0.12, 0.16, fm, 18); paw.position.set(0.05, -0.5, 0); lg.add(paw); fluff(paw, 0.2, 0.12, 0.16, 14, 0.09, fm, o.seed + 20 + i);
      P.legs.push(lg);
    });
    root.userData = P; root.userData.baseY = 0.78; return root;
  }
  function poseDog(root, ph, o) {   // ph: 0..1 한 바퀴
    const P = root.userData, a = ph * Math.PI * 2, g = o.gait || 1;
    // 달리기: 앞다리 둘·뒷다리 둘이 짝을 지어 앞뒤로 크게 휘두르고, 몸이 위아래로 튄다(공중에 뜨는 순간 있음)
    const swing = 0.95 * g;
    P.legs[0].rotation.z = swing * Math.sin(a) + 0.15; P.legs[1].rotation.z = swing * Math.sin(a + 0.35) + 0.15;
    P.legs[2].rotation.z = swing * Math.sin(a + 2.4) - 0.1; P.legs[3].rotation.z = swing * Math.sin(a + 2.75) - 0.1;
    P.legs.forEach((l, i) => { const k = Math.sin(a + (i < 2 ? 0 : 2.4) + 1.57); l.children[1].rotation.z = 0; l.position.y = -0.22 + (k > 0 ? 0.0 : 0) });
    const bounce = Math.abs(Math.sin(a * 1.0 + 0.4));
    root.position.y = (o.air || 0.2) * bounce - 0.02;
    P.body.rotation.z = 0.14 * Math.sin(a + 0.9) * g; P.body.position.y = P.body.userData.y0 === undefined ? (P.body.userData.y0 = P.body.position.y) : P.body.userData.y0;
    P.head.rotation.z = -0.12 * Math.sin(a + 0.9) * g + 0.05; P.head.position.y = 0.58 + 0.03 * Math.sin(a * 2);
    P.ears.forEach((e, i) => { e.rotation.z = 0.35 * Math.sin(a + 1.8) * g + 0.15; e.rotation.x = (i ? 1 : -1) * 0.12; });
    P.tail.rotation.z = 0.4 * Math.sin(a * 2 + 1) + 0.35; P.tail.rotation.x = 0.3 * Math.sin(a * 2.0);
    if (P.tongue.visible) P.tongue.position.y = -0.25 - 0.04 * Math.abs(Math.sin(a + 0.4));
  }

  // ═════ 고양이 (러블) ═════
  function buildCat() {
    const root = new T.Group(), gm = mat(0x7d8691, { roughness: 0.9 }), gl = mat(0x9aa3ad, { roughness: 0.9 }), P = {};
    const body = new T.Group(); body.position.y = 0.88; root.add(body); P.body = body;
    body.add(ell(0.72, 0.46, 0.42, gm, 32)); const belly = ell(0.6, 0.3, 0.36, gl); belly.position.set(0.0, -0.18, 0); body.add(belly);
    const head = new T.Group(); head.position.set(0.74, 0.42, 0); body.add(head); P.head = head;
    head.add(ell(0.62, 0.55, 0.6, gm, 32));
    const cheek = [1, -1].map(s => { const c = ell(0.22, 0.17, 0.22, gm); c.position.set(0.34, -0.16, 0.34 * s); head.add(c); return c; });
    // 귀(뾰족, 안쪽 분홍)
    P.ears = [];
    [1, -1].forEach(s => { const eg = new T.Group(); eg.position.set(0.0, 0.42, 0.36 * s); head.add(eg);
      const ec = new T.Mesh(new T.ConeGeometry(0.24, 0.5, 4), gm); ec.position.y = 0.2; ec.rotation.y = Math.PI / 4; eg.add(sh(ec));
      const ei = new T.Mesh(new T.ConeGeometry(0.15, 0.36, 4), mat(0xe8a5ae)); ei.position.set(0.05, 0.15, 0); ei.rotation.y = Math.PI / 4; eg.add(ei); eg.rotation.x = -0.18 * s; P.ears.push(eg); });
    // 눈(초록, 세로 눈동자) · 코 · 수염
    [1, -1].forEach(s => { const eg = ell(0.1, 0.13, 0.09, glossy(0x7fcf8a, { roughness: 0.15 }), 20); eg.position.set(0.5, 0.08, 0.26 * s); head.add(eg);
      const pu = ell(0.03, 0.09, 0.04, mat(0x0a0a0a)); pu.position.set(0.58, 0.08, 0.265 * s); head.add(pu);
      const hl = ell(0.028, 0.028, 0.028, new T.MeshBasicMaterial({ color: 0xffffff }), 8); hl.position.set(0.585, 0.14, 0.28 * s); head.add(hl); });
    const nose = ell(0.045, 0.035, 0.06, mat(0xe39aa5, { roughness: 0.5 })); nose.position.set(0.6, -0.08, 0); head.add(nose);
    [1, -1].forEach(s => { for (let k = 0; k < 3; k++) { const w = new T.Mesh(new T.CylinderGeometry(0.004, 0.004, 0.34, 4), mat(0xe9edf1)); w.position.set(0.52, -0.12 - k * 0.025, 0.2 * s + 0.12 * s); w.rotation.x = Math.PI / 2; w.rotation.z = (k - 1) * 0.14; w.rotation.y = 0.1 * s; head.add(w); } });
    // 분홍 목줄
    const col = new T.Mesh(new T.TorusGeometry(0.4, 0.05, 10, 36), mat(0xe78e98, { roughness: 0.55 })); col.position.set(0.56, 0.22, 0); col.rotation.y = Math.PI / 2; col.rotation.z = 0.0; body.add(sh(col));
    const tag = ell(0.05, 0.05, 0.02, mat(0xe9c85a, { metalness: 0.6, roughness: 0.3 }), 12); tag.position.set(0.6, -0.04, 0.4); body.add(tag);
    // 긴 꼬리: 토막을 이어 사슬로
    P.tailSeg = []; let parent = body; const base = new T.Group(); base.position.set(-0.78, 0.15, 0); body.add(base); parent = base;
    for (let i = 0; i < 13; i++) { const sg = new T.Group(); sg.position.x = i === 0 ? 0 : -0.105; parent.add(sg); const r = 0.1 - i * 0.003, sp = ell(0.12, r, r, gm, 14); sp.position.x = -0.05; sg.add(sp); P.tailSeg.push(sg); parent = sg; }
    // 다리
    P.legs = [];
    [[0.5, 0.2], [0.5, -0.2], [-0.5, 0.2], [-0.5, -0.2]].forEach((p, i) => { const lg = new T.Group(); lg.position.set(p[0], -0.3, p[1]); body.add(lg);
      const up = limb(0.6, 0.11, gm); lg.add(up); const paw = ell(0.16, 0.09, 0.12, gl, 16); paw.position.set(0.05, -0.6, 0); lg.add(paw); P.legs.push(lg); });
    root.userData = P; return root;
  }
  function poseCat(root, ph) {   // 느긋하게 걷기: 대각선 다리끼리 짝, 꼬리 물결, 머리 까딱
    const P = root.userData, a = ph * Math.PI * 2, sw = 0.42;
    P.legs[0].rotation.z = sw * Math.sin(a); P.legs[3].rotation.z = sw * Math.sin(a); P.legs[1].rotation.z = sw * Math.sin(a + Math.PI); P.legs[2].rotation.z = sw * Math.sin(a + Math.PI);
    P.legs.forEach((l, i) => { const k = (i === 0 || i === 3) ? Math.sin(a) : Math.sin(a + Math.PI); l.position.y = -0.3 + Math.max(0, Math.cos(a + (i === 0 || i === 3 ? 0 : Math.PI))) * 0.0; l.rotation.z += 0; });
    root.position.y = 0.04 * Math.abs(Math.sin(a * 2)) + 0.04;
    P.body.rotation.y = 0.06 * Math.sin(a); P.body.rotation.z = 0.025 * Math.sin(a * 2);
    P.head.rotation.z = -0.05 * Math.sin(a * 2 + 0.5); P.head.rotation.y = 0.12 * Math.sin(a + 0.6);
    P.ears.forEach((e, i) => { e.rotation.z = 0.04 * Math.sin(a * 2 + i); });
    P.tailSeg.forEach((s, i) => { s.rotation.z = (i === 0 ? 0.9 : 0.09) + 0.14 * Math.sin(a - i * 0.45) * (0.6 + i * 0.08); s.rotation.y = 0.08 * Math.sin(a - i * 0.5 + 1); });
  }

  // ═════ 올챙이 (챙챙) ═════
  function buildTadpole() {
    const root = new T.Group(), P = {}, bm = glossy(0x1f2d7a, { roughness: 0.32, clearcoat: 0.8 }), lm = glossy(0x2c3d92, { roughness: 0.4 });
    const body = new T.Group(); body.position.y = 1.2; root.add(body); P.body = body;
    body.add(ell(0.82, 0.74, 0.74, bm, 40));
    const bl2 = ell(0.5, 0.4, 0.5, glossy(0x3a58b8, { roughness: 0.4 }), 24); bl2.position.set(0.18, -0.28, 0); body.add(bl2);
    // 눈
    [1, -1].forEach(s => { const e = ell(0.26, 0.3, 0.12, glossy(0x86c2cc, { roughness: 0.1, clearcoat: 1 }), 24); e.position.set(0.6, 0.2, 0.3 * s); e.rotation.y = 0.5 * s; body.add(e);
      const pu = ell(0.15, 0.19, 0.05, mat(0x1c3a4a, { roughness: 0.2 }), 18); pu.position.set(0.68, 0.2, 0.33 * s); pu.rotation.y = 0.5 * s; body.add(pu);
      const hl = ell(0.05, 0.05, 0.025, new T.MeshBasicMaterial({ color: 0xffffff }), 10); hl.position.set(0.74, 0.3, 0.35 * s); body.add(hl);
      const ch = ell(0.14, 0.09, 0.04, mat(0xe7a1b3, { roughness: 0.7 }), 14); ch.position.set(0.58, -0.16, 0.48 * s); ch.rotation.y = 0.9 * s; body.add(ch); });
    const sm = new T.Mesh(new T.TorusGeometry(0.07, 0.014, 8, 20, Math.PI), mat(0x0e1640)); sm.position.set(0.78, -0.12, 0); sm.rotation.set(0, Math.PI / 2, Math.PI); body.add(sm);
    // 꼬리: 납작한 토막 사슬(뒤로 갈수록 얇고 넓은 지느러미)
    P.tail = []; let parent = new T.Group(); parent.position.set(-0.62, -0.2, 0); body.add(parent);
    for (let i = 0; i < 12; i++) { const sg = new T.Group(); sg.position.x = i === 0 ? 0 : -0.125; parent.add(sg); const hgt = 0.3 - i * 0.008 + (i > 6 ? 0.07 : 0), tk = Math.max(0.025, 0.2 - i * 0.012), sp = ell(0.16, hgt, tk, i > 7 ? lm : bm, 16); sp.position.x = -0.06; sg.add(sp); P.tail.push(sg); parent = sg; }
    // 작은 옆지느러미
    P.fins = [1, -1].map(s => { const f = new T.Group(); f.position.set(-0.05, -0.15, 0.62 * s); body.add(f); const fm = ell(0.14, 0.05, 0.22, lm, 14); fm.position.z = 0.1 * s; f.add(fm); return f; });
    // 물방울
    P.bubbles = []; const bmM = new T.MeshPhysicalMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.35, roughness: 0.05, clearcoat: 1 });
    for (let i = 0; i < 4; i++) { const b = ell(0.07, 0.07, 0.07, bmM, 12); b.castShadow = false; b.userData.i = i; root.add(b); P.bubbles.push(b); }
    root.userData = P; return root;
  }
  function poseTadpole(root, ph) {   // 헤엄: 꼬리 물결이 머리→끝으로 전달, 몸이 살짝 앞뒤·위아래로 일렁
    const P = root.userData, a = ph * Math.PI * 2;
    P.tail.forEach((s, i) => { s.rotation.y = 0.24 * Math.sin(a - i * 0.4) * (0.5 + i * 0.07); s.rotation.z = i === 0 ? 0.25 : 0.06; });
    P.body.rotation.y = -0.1 * Math.sin(a + 0.2); P.body.position.y = 1.2 + 0.06 * Math.sin(a * 2); P.body.position.x = 0.04 * Math.cos(a); P.body.rotation.z = 0.06 * Math.sin(a * 2 + 1);
    P.fins.forEach((f, i) => { f.rotation.x = (i ? 1 : -1) * (0.35 + 0.4 * Math.sin(a * 2 + i)); });
    P.bubbles.forEach(b => { const k = ((ph + b.userData.i * 0.25) % 1); b.position.set(1.0 - b.userData.i * 0.12 + k * 0.1, 1.4 + k * 0.9, 0.2 * (b.userData.i % 2 ? 1 : -1)); b.scale.setScalar(0.04 + 0.05 * Math.sin(k * Math.PI)); });
  }

  // ═════ 독수리 (술) ═════
  function buildEagle() {
    const root = new T.Group(), P = {}, br = mat(0x6e5646, { roughness: 0.9 }), dk = mat(0x4f3d33, { roughness: 0.9 }), lt = mat(0x8c735f, { roughness: 0.9 }), wh = mat(0xf4f1ea, { roughness: 0.9 }), yl = glossy(0xf0b923, { roughness: 0.35 });
    const body = new T.Group(); body.position.y = 1.3; root.add(body); P.body = body;
    body.add(ell(0.8, 0.5, 0.48, br, 30)); const ch = ell(0.55, 0.3, 0.36, lt); ch.position.set(0.1, -0.1, 0); body.add(ch);
    const head = new T.Group(); head.position.set(0.85, 0.2, 0); body.add(head); P.head = head;
    head.add(ell(0.46, 0.44, 0.44, wh, 32));
    const bk = new T.Mesh(new T.ConeGeometry(0.26, 0.56, 20), yl); bk.rotation.z = -Math.PI / 2 - 0.12; bk.position.set(0.55, -0.06, 0); head.add(sh(bk));
    const hook = ell(0.12, 0.1, 0.12, yl, 14); hook.position.set(0.82, -0.16, 0); head.add(hook);
    [1, -1].forEach(s => { const e = ell(0.07, 0.07, 0.06, glossy(0xf7d440, { roughness: 0.2 }), 16); e.position.set(0.3, 0.1, 0.24 * s); head.add(e);
      const pu = ell(0.035, 0.04, 0.03, mat(0x0a0a0a), 12); pu.position.set(0.355, 0.1, 0.25 * s); head.add(pu);
      const brw = ell(0.11, 0.025, 0.05, mat(0xcfc9bd)); brw.position.set(0.3, 0.2, 0.25 * s); brw.rotation.x = -0.45 * s; brw.rotation.z = 0.3; head.add(brw); });
    // 꽁지(흰 부채)
    P.tail = new T.Group(); P.tail.position.set(-0.72, 0.0, 0); body.add(P.tail);
    for (let i = -2; i <= 2; i++) { const f = ell(0.42, 0.04, 0.1, wh, 14); f.position.set(-0.4, 0, i * 0.1); f.rotation.y = i * 0.1; P.tail.add(f); }
    // 날개: 어깨→팔뚝→손 세 마디에 깃털을 붙인다. +z 방향(오른쪽 날개)을 만들고 왼쪽은 z 반전
    P.wings = [];
    [1, -1].forEach(s => {
      const sh0 = new T.Group(); sh0.position.set(0.15, 0.2, 0.34 * s); body.add(sh0);
      const arm = new T.Group(); sh0.add(arm); const a1 = ell(0.3, 0.09, 0.5, br, 18); a1.position.z = 0.5 * s; arm.add(a1);
      for (let i = 0; i < 6; i++) { const f = ell(0.3, 0.03, 0.55, i % 2 ? dk : br, 14); f.position.set(-0.14 - i * 0.05, 0, (0.45 + i * 0.03) * s); f.rotation.y = -0.05 * i * s; arm.add(f); }
      const fore = new T.Group(); fore.position.z = 1.0 * s; arm.add(fore); const a2 = ell(0.28, 0.08, 0.4, br, 18); a2.position.z = 0.35 * s; fore.add(a2);
      for (let i = 0; i < 6; i++) { const f = ell(0.28, 0.028, 0.5, i % 2 ? dk : br, 14); f.position.set(-0.1 - i * 0.05, 0, (0.3 + i * 0.03) * s); f.rotation.y = -0.07 * i * s; fore.add(f); }
      const hand = new T.Group(); hand.position.z = 0.75 * s; fore.add(hand);
      for (let i = 0; i < 7; i++) { const f = ell(0.14, 0.024, 0.55 - i * 0.02, dk, 12); f.position.set(0.12 - i * 0.075, 0, (0.28 + i * 0.01) * s); f.rotation.y = (0.22 - i * 0.07) * s; hand.add(f); }
      P.wings.push({ s: s, sh: sh0, arm: arm, fore: fore, hand: hand });
    });
    // 다리(노란 다리·발톱) — 비행 중이라 뒤로 접는다
    P.legs = [1, -1].map(s => { const g = new T.Group(); g.position.set(-0.05, -0.38, 0.2 * s); body.add(g); const l = limb(0.4, 0.07, yl); g.add(l); const ft = ell(0.17, 0.05, 0.12, yl, 12); ft.position.set(0.05, -0.4, 0); g.add(ft); g.rotation.z = 1.1; return g; });
    root.userData = P; return root;
  }
  function poseEagle(root, ph) {   // 날갯짓: 내려칠 때 활짝, 올릴 때 손목을 꺾어 접는다 · 몸은 반대로 출렁
    const P = root.userData, a = ph * Math.PI * 2, f = Math.sin(a), up = Math.sin(a + 0.9);
    P.wings.forEach(w => {
      const s = w.s, ang = 0.62 * f;
      w.sh.rotation.x = -s * ang;                       // 어깨: 위(−)·아래(+)
      w.fore.rotation.x = -s * (0.35 * Math.sin(a - 0.7) - 0.05);
      w.hand.rotation.x = -s * (0.55 * Math.sin(a - 1.3));
      w.fore.rotation.y = -0.1 * s; w.arm.rotation.y = 0;
    });
    P.body.position.y = 1.3 - 0.16 * f; P.body.rotation.z = 0.04 * Math.sin(a - 0.4);
    P.head.rotation.z = -0.03 * Math.sin(a - 0.4); P.tail.rotation.z = 0.1 * Math.sin(a - 1.0) - 0.05;
  }

  // ═════ 두더지 (두덩) ═════
  function buildMole() {
    const root = new T.Group(), P = {}, bm = mat(0x8c6c52, { roughness: 0.95 }), lt = mat(0xd2ac80, { roughness: 0.95 }), pk = mat(0xf0a9a9, { roughness: 0.6 }), gold = mat(0xd9a93f, { roughness: 0.35, metalness: 0.5 });
    const body = new T.Group(); body.position.y = 1.15; root.add(body); P.body = body;
    body.add(ell(0.72, 0.82, 0.66, bm, 36));
    const belly = ell(0.5, 0.65, 0.4, lt); belly.position.set(0.28, -0.12, 0); body.add(belly);
    const head = new T.Group(); head.position.set(0.12, 0.66, 0); body.add(head); P.head = head;
    head.add(ell(0.68, 0.6, 0.66, bm, 32));
    const sn = ell(0.34, 0.27, 0.32, pk, 24); sn.position.set(0.58, -0.12, 0); head.add(sn); [1, -1].forEach(s => { const n = ell(0.05, 0.06, 0.035, mat(0x7a4a4a), 10); n.position.set(0.88, -0.1, 0.09 * s); head.add(n); });
    [1, -1].forEach(s => bead(head, 0.5, 0.12, 0.3 * s, 0.085));
    [1, -1].forEach(s => { const e = ell(0.12, 0.13, 0.05, bm, 14); e.position.set(-0.05, 0.1, 0.52 * s); head.add(e); });
    // 안전모
    const hat = new T.Group(); hat.position.set(-0.03, 0.26, 0); hat.rotation.z = 0.0; head.add(hat);
    const dome = new T.Mesh(new T.SphereGeometry(0.62, 32, 20, 0, Math.PI * 2, 0, Math.PI / 2), gold); dome.scale.set(1.0, 0.8, 1.0); hat.add(sh(dome));
    const brim = new T.Mesh(new T.CylinderGeometry(0.7, 0.7, 0.05, 36), gold); brim.position.y = 0.0; brim.scale.set(1.1, 1, 1); hat.add(sh(brim));
    const rib = new T.Mesh(new T.BoxGeometry(0.1, 0.06, 0.62), gold); rib.position.y = 0.46; hat.add(sh(rib));
    const lamp = new T.Mesh(new T.CylinderGeometry(0.1, 0.1, 0.1, 18), mat(0x9b9b9b, { metalness: 0.6, roughness: 0.35 })); lamp.rotation.z = Math.PI / 2; lamp.position.set(0.64, 0.22, 0); hat.add(sh(lamp));
    const lb = ell(0.07, 0.07, 0.07, new T.MeshBasicMaterial({ color: 0xfff6c8 }), 14); lb.position.set(0.72, 0.22, 0); lb.castShadow = false; hat.add(lb);
    // 팔과 삽
    P.arms = [];
    [1, -1].forEach(s => { const sg = new T.Group(); sg.position.set(0.3, 0.3, 0.66 * s); body.add(sg);
      const up = limb(0.55, 0.2, bm); sg.add(up); const paw = ell(0.28, 0.2, 0.24, lt, 18); paw.position.set(0.06, -0.6, 0); sg.add(paw);
      for (let k = -1; k <= 1; k++) { const c = new T.Mesh(new T.ConeGeometry(0.03, 0.12, 6), mat(0xe7e0d2)); c.position.set(0.3, -0.64, k * 0.09); c.rotation.z = -Math.PI / 2; sg.add(c); }
      sg.rotation.z = 0.25; P.arms.push(sg); });
    const sv = new T.Group(); sv.position.set(0.0, -0.5, 0); P.arms[0].add(sv); P.shovel = sv;
    const hd = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 1.5, 8), mat(0xb98b55, { roughness: 0.7 })); hd.position.set(0.05, 0.3, 0); sv.add(sh(hd));
    const bl = new T.Mesh(new T.BoxGeometry(0.34, 0.4, 0.04), mat(0xa9afb5, { metalness: 0.6, roughness: 0.35 })); bl.position.set(0.05, -0.65, 0); bl.rotation.y = 0.0; sv.add(sh(bl));
    // 발
    P.legs = [1, -1].map(s => { const g = new T.Group(); g.position.set(0.05, -0.72, 0.3 * s); body.add(g); const ft = ell(0.32, 0.13, 0.2, lt, 18); ft.position.set(0.12, -0.12, 0); g.add(ft); return g; });
    root.userData = P; return root;
  }
  function poseMoleWalk(root, ph) {   // 뒤뚱뒤뚱 걷고, 삽을 어깨에 걸쳐 까딱
    const P = root.userData, a = ph * Math.PI * 2;
    P.body.rotation.x = 0.1 * Math.sin(a); P.body.rotation.z = 0.03 + 0.05 * Math.sin(a); P.body.position.y = 1.15 + 0.07 * Math.abs(Math.sin(a));
    P.legs[0].rotation.z = 0.6 * Math.sin(a); P.legs[1].rotation.z = 0.6 * Math.sin(a + Math.PI);
    P.legs.forEach((g, i) => { g.position.y = -0.8 + Math.max(0, Math.sin(a + (i ? Math.PI : 0))) * 0.12; });
    P.arms[0].rotation.z = 0.35 + 0.18 * Math.sin(a + 0.4); P.arms[1].rotation.z = 0.25 + 0.5 * Math.sin(a + Math.PI);
    P.head.rotation.z = -0.06 * Math.sin(a + 0.6); P.head.rotation.x = 0.05 * Math.sin(a);
    P.shovel.rotation.z = -0.5 + 0.12 * Math.sin(a + 0.4);
  }
  function dirt(n) { const g = new T.Group(), m = mat(0x6b4a30, { roughness: 1 }), R = rng(77); for (let i = 0; i < n; i++) { const d = ell(0.1, 0.07, 0.1, m, 8); d.userData.k = [R() * 6.28, 0.4 + R() * 0.7, 0.8 + R() * 1.2, 0.05 + R() * 0.07]; g.add(d); } return g; }

  window.CHARS = {
    // id → { build, pose, frames, yaw, extra }
    lovel: { name: '러블', build: () => buildCat(), pose: poseCat, yaw: -0.55, frames: 16, view: [3.3, 0.95, -0.12] },
    dolsom: { name: '돌솜', build: () => buildDog({ fur: 0xfbfbfb, bow: 0x2f6fd0, seed: 31, tongue: true }), pose: (r, p) => poseDog(r, p, { gait: 1.0, air: 0.22 }), yaw: -0.55, frames: 16, view: [3.1, 0.92] },
    ppopu: { name: '뽀푸', build: () => buildDog({ fur: 0xb98a5c, collar: 0x6a4524, seed: 57, muzzle: 0xc29666, tongue: true }), pose: (r, p) => poseDog(r, p, { gait: 0.85, air: 0.3 }), yaw: -0.55, frames: 16, view: [3.1, 0.92] },
    chaeng: { name: '챙챙', build: () => buildTadpole(), pose: poseTadpole, yaw: -0.65, frames: 16, view: [3.9, 1.25, -0.3] },
    sul: { name: '술', build: () => buildEagle(), pose: poseEagle, yaw: -0.8, frames: 16, view: [5.6, 1.45] },
    dudung: { name: '두덩', build: () => buildMole(), pose: poseMoleWalk, yaw: -0.5, frames: 16, view: [3.3, 1.15] },
  };
  window.dirt = dirt;
})();

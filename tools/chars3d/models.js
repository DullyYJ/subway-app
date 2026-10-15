// 길동무 캐릭터 6종 — three.js 3D 모델과 동작(오프라인 렌더링용). 앞(진행 방향)은 +x, 위는 +y, 카메라 쪽이 +z.
// 2026-10-14: 원본 2D 그림과 똑같이 보이도록 고침 — 머리 비율을 원본처럼 크게 하고, 얼굴·가슴·배는 원본 그림을 3D 부위 앞면에 입혀(tex.js) 눈·코·표정이 그대로 나온다.
(function () {
  const T = THREE;
  const mat = (c, o) => new T.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.88, metalness: 0 }, o || {}));
  const glossy = (c, o) => new T.MeshPhysicalMaterial(Object.assign({ color: c, roughness: 0.25, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25 }, o || {}));
  function sh(m) { m.castShadow = true; m.receiveShadow = true; return m; }
  function ell(sx, sy, sz, m, seg) { const g = new T.Mesh(new T.SphereGeometry(1, seg || 28, Math.round((seg || 28) * 0.75)), m); g.scale.set(sx, sy, sz); return sh(g); }
  function limb(len, r, m) { const g = new T.Mesh(new T.CapsuleGeometry(r, Math.max(0.001, len - 2 * r), 6, 14), m); g.position.y = -len / 2; const grp = new T.Group(); grp.add(sh(g)); return grp; }

  // 2026-10-14: 몸·다리가 따로 노는 문제 수정 — 다리를 "엉덩이(어깨) 공 + 허벅지 + 무릎 공 + 정강이 + 발" 한 덩어리로 만든다.
  // 엉덩이 공은 몸통 안쪽에 박혀 있어서 다리가 흔들려도 몸과 이어져 보이고, 무릎이 접혀 발이 자연스럽게 들린다.
  function leg2(o, m, pm) {
    const hip = new T.Group(), knee = new T.Group(), paw = new T.Group();
    const ball = ell(o.hr[0], o.hr[1], o.hr[2], m, 20); hip.add(ball);
    const th = limb(o.up, o.ru, m); hip.add(th);
    knee.position.y = -o.up; hip.add(knee);
    const kb = ell(o.rk, o.rk, o.rk * 0.95, m, 16); knee.add(kb);
    const sn = limb(o.lo, o.rl, m); knee.add(sn);
    paw.position.y = -o.lo; knee.add(paw);
    const pw = ell(o.paw[0], o.paw[1], o.paw[2], pm || m, 18); pw.position.set(o.paw[3] || 0.06, 0, 0); paw.add(pw);
    hip.userData = { knee, paw }; return hip;
  }
  // 다리 자세: swing = 엉덩이 각도(+는 발이 앞으로), lift = 0..1 발을 들어 올리는 정도(무릎이 뒤로 접힘)
  function setLeg(lg, swing, lift, kmax, fl) {
    const U = lg.userData; lg.rotation.z = swing; U.knee.rotation.z = -kmax * lift - 0.08; U.paw.rotation.z = -(swing + U.knee.rotation.z) * (fl === undefined ? 0.85 : fl);
  }
  function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return (s % 100000) / 100000; }; }
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
  // ── 원본 그림 입히기: 타원체(rx,ry,rz)의 앞(+x) 반구에 그림을 평면으로 투영한다. 그림 사각형이 타원에 내접한다. ──
  const _tex = {};
  function tex(key) {
    if (_tex[key]) return _tex[key];
    const t = new T.Texture(window.TEXIMG[key]); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true; t.minFilter = T.LinearMipmapLinearFilter; t.needsUpdate = true; return (_tex[key] = t);
  }
  function decal(parent, rx, ry, rz, key, o) {
    o = o || {};
    const ex = o.ext === undefined ? 0.4 : o.ext, g = new T.SphereGeometry(1, 64, 44, Math.PI / 2 - ex, Math.PI + 2 * ex, 0, Math.PI), pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, 0.5 - 0.5 * pos.getZ(i), 0.5 + 0.5 * pos.getY(i));
    const tx = tex(key), m = new T.MeshStandardMaterial({ map: tx, emissiveMap: tx, emissive: 0xffffff, emissiveIntensity: o.glow === undefined ? 0.5 : o.glow, color: o.tint || 0x9a9a9a, roughness: 0.95, metalness: 0, transparent: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const mesh = new T.Mesh(g, m); const k = o.k || 1.012; mesh.scale.set(rx * k, ry * k, rz * k); mesh.castShadow = false; mesh.receiveShadow = false; parent.add(mesh); return mesh;
  }
  let _bump = null;
  function furBump() {   // 솜털 느낌의 잔 요철(구름 같은 얼룩 무늬)
    if (_bump) return _bump;
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'); x.fillStyle = '#808080'; x.fillRect(0, 0, 256, 256);
    const R = rng(5); for (let i = 0; i < 1400; i++) { const px = R() * 256, py = R() * 256, r = 3 + R() * 9, g = x.createRadialGradient(px, py, 0, px, py, r); const v = R() > 0.5 ? 255 : 0; g.addColorStop(0, 'rgba(' + v + ',' + v + ',' + v + ',0.35)'); g.addColorStop(1, 'rgba(' + v + ',' + v + ',' + v + ',0)'); x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2); }
    const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(3, 2); return (_bump = t);
  }
  const fur = (c) => mat(c, { roughness: 1, bumpMap: furBump(), bumpScale: 2.2 });
  const eyeBlack = () => glossy(0x16110f, { roughness: 0.1, clearcoat: 1 });

  // ═════ 강아지 (돌솜 = 흰 비숑·파란 리본, 뽀푸 = 갈색 푸들·가죽 목줄) ═════
  function buildDog(o) {
    const root = new T.Group(), fm = fur(o.fur), P = {};
    const body = new T.Group(); body.position.y = 0.72; root.add(body); P.body = body;
    body.add(ell(0.5, 0.36, 0.38, fm)); 
    const head = new T.Group(); head.position.set(0.36, 0.52, 0); body.add(head); P.head = head;
    head.add(ell(0.66, 0.58, 0.72, fm, 36));
    decal(head, 0.66, 0.58, 0.72, o.tex);
    fluff(head, 0.66, 0.58, 0.72, 46, 0.3, fm, o.seed + 1, d => d.x < -0.35);   // 뒤통수·머리 뒤쪽 털(앞은 원본 그림)
    // 귀(옆으로 늘어진 털 뭉치 — 원본의 양옆 뭉치)
    P.ears = [];
    [1, -1].forEach(sd => {
      const eg = new T.Group(); eg.position.set(-0.08, 0.02, 0.62 * sd); head.add(eg);
      const e1 = ell(0.2, 0.34, 0.16, fm, 20); e1.position.set(0, -0.12, 0.08 * sd); eg.add(e1); fluff(e1, 0.2, 0.34, 0.16, 16, 0.13, fm, o.seed + 7 + sd);
      P.ears.push(eg);
    });
    if (o.bow) {   // 리본(원본: 머리 위 화면 오른쪽) — 고리 둘이 화면 가로로 펼쳐지게
      const bg = new T.Group(); bg.position.set(0.14, 0.5, -0.3); bg.rotation.set(0.0, 0.0, -0.35); head.add(bg); const bm = glossy(o.bow, { roughness: 0.4, clearcoat: 0.5 });
      [1, -1].forEach(s => { const w = ell(0.1, 0.17, 0.27, bm, 20); w.position.set(0.0, 0.0, 0.26 * s); w.rotation.x = 0.4 * s; bg.add(w); const tl = ell(0.07, 0.14, 0.08, bm, 12); tl.position.set(0.0, -0.1, 0.14 * s); tl.rotation.x = 0.7 * s; bg.add(tl); });
      bg.add(ell(0.11, 0.11, 0.11, bm, 16));
    }
    if (o.collar) {   // 가죽 목줄 + 'E' 버클
      const col = new T.Mesh(new T.TorusGeometry(0.34, 0.065, 10, 36), mat(o.collar, { roughness: 0.55 })); col.position.set(0.34, 0.06, 0); col.rotation.y = Math.PI / 2; col.scale.set(1, 1.0, 1); body.add(sh(col));
      const bk = new T.Mesh(new T.BoxGeometry(0.06, 0.15, 0.13), mat(0xd8d2c6, { metalness: 0.3, roughness: 0.4 })); bk.position.set(0.36, -0.27, 0.0); body.add(sh(bk));
    }
    // 꼬리(2026-10-15: 위젯에서 꼬리가 안 보인다는 지적) — 엉덩이 위에서 솟아 등 뒤로 말려 올라가는 털뭉치 꼬리(비숑·푸들 꼬리).
    //   예전엔 몸통 뒤 낮은 곳의 공 하나라 3/4 시점에서 뒷다리·엉덩이에 가려 안 보였다. 이제 등선 위로 솟아 실루엣에 보인다.
    const tail = new T.Group(); tail.position.set(-0.46, 0.2, 0); body.add(tail);
    // 비숑(o.tail='long'): 길고 곱슬곱슬한 털 꼬리가 등 뒤로 솟았다 끝이 앞으로 말린다 · 푸들(o.tail='short'): 짧고 둥근 털 꼬리(작은 폼)
    const TAILS = {
      long: { f: [24, 0.1], balls: [[-0.08, 0.08, 0.05, 0.14], [-0.2, 0.2, 0.1, 0.15], [-0.3, 0.34, 0.15, 0.155], [-0.35, 0.5, 0.19, 0.155], [-0.36, 0.66, 0.21, 0.15], [-0.29, 0.8, 0.22, 0.14], [-0.18, 0.89, 0.22, 0.12]] },
      short: { f: [16, 0.08], balls: [[-0.1, 0.12, 0.1, 0.15], [-0.22, 0.3, 0.2, 0.18], [-0.28, 0.46, 0.26, 0.2]] }
    };
    const TS = TAILS[o.tail || 'short'];
    TS.balls.forEach((q, i) => {
      const tb = ell(q[3], q[3], q[3], fm, 20); tb.position.set(q[0], q[1], q[2]); tail.add(tb); fluff(tb, q[3], q[3], q[3], TS.f[0], TS.f[1], fm, o.seed + 3 + i);
    });
    P.tail = tail;
    // 다리 네 개 [앞오른, 앞왼, 뒤오른, 뒤왼] — 엉덩이 공이 몸통에 박힌 통통한 털 다리 + 발
    P.legs = [];
    [[0.3, 0.23], [0.3, -0.23], [-0.3, 0.23], [-0.3, -0.23]].forEach((p, i) => {
      const lg = leg2({ hr: [0.2, 0.21, 0.18], up: 0.27, ru: 0.15, rk: 0.135, lo: 0.24, rl: 0.12, paw: [0.2, 0.11, 0.17, 0.06] }, fm);
      lg.position.set(p[0], -0.12, p[1]); body.add(lg); P.legs.push(lg);
    });
    root.userData = P; return root;
  }
  function poseDog(root, ph, o) {   // ph: 0..1 한 바퀴 — 앞다리 둘·뒷다리 둘이 짝을 지어 크게 휘두르고 몸이 위아래로 튄다
    const P = root.userData, a = ph * Math.PI * 2, g = o.gait || 1, sw = 0.9 * g;
    const lgs = [[0, 0.12], [0.35, 0.12], [2.4, -0.1], [2.75, -0.1]];
    lgs.forEach((q, i) => { const ph2 = a + q[0], sv = Math.sin(ph2), up = Math.max(0, Math.cos(ph2)); setLeg(P.legs[i], 0.8 * sw * sv + q[1], Math.pow(up, 0.8), 1.0 * g + 0.2); });
    root.position.y = (o.air || 0.2) * 0.8 * Math.abs(Math.sin(a + 0.4)) - 0.02;
    P.body.rotation.z = 0.12 * Math.sin(a + 0.9) * g;
    P.head.rotation.z = -0.1 * Math.sin(a + 0.9) * g + 0.04; P.head.position.y = 0.52 + 0.03 * Math.sin(a * 2);
    P.ears.forEach((e, i) => { e.rotation.z = 0.3 * Math.sin(a + 1.8) * g; e.rotation.x = (i ? 1 : -1) * 0.1; });
    P.tail.rotation.z = 0.22 * Math.sin(a * 2 + 1) + 0.12; P.tail.rotation.x = 0.25 * Math.sin(a * 2.0);
  }

  // ═════ 고양이 (러블 = 러시안블루) ═════
  // 2026-10-15 (YJ: "원본과 너무 다르다 · 러시안블루가 베이스 · 귀엽게 · 꼬리랑 다리가 이상하다"): 마디가 보이는 구슬 사슬 다리·꼬리를 없애고,
  //   ① 다리 = 허벅지→무릎→정강이가 한 줄로 매끈하게 가늘어지는 통통한 관(관절 공은 같은 반지름이라 이음매가 안 보인다)과 둥근 발 ② 꼬리 = 프레임마다 곡선을 따라 새로 뽑는 매끈한 관(끝이 가늘고 둥글게 말림, 원본의 S자 꼬리)
  //   ③ 몸 = 가슴이 큰 달걀형(머리가 큰 치비 비율) ④ 귀 = 넓은 밑동의 둥근 삼각형 + 분홍 안쪽 ⑤ 털 = 푸른 회색에 은빛 윤기(sheen)와 밝은 가슴·발.
  function tubeGeo(pts, rad, seg) {   // pts: Vector3[] 중심선, rad: 각 점의 반지름 → 양 끝이 닫히지 않은 관(끝은 구로 덮는다)
    const n = pts.length, pos = [], idx = [], nor = [], fr = new T.Vector3(0, 0, 1), up = new T.Vector3(), t = new T.Vector3(), nn = new T.Vector3(), bb = new T.Vector3();
    for (let i = 0; i < n; i++) {
      t.subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
      nn.crossVectors(t, fr); if (nn.lengthSq() < 1e-6) nn.crossVectors(t, up.set(0, 1, 0)); nn.normalize(); bb.crossVectors(t, nn).normalize();
      for (let k = 0; k <= seg; k++) {
        const a = k / seg * Math.PI * 2, cx = Math.cos(a), cy = Math.sin(a);
        const dx = nn.x * cx + bb.x * cy, dy = nn.y * cx + bb.y * cy, dz = nn.z * cx + bb.z * cy;
        pos.push(pts[i].x + dx * rad[i], pts[i].y + dy * rad[i], pts[i].z + dz * rad[i]); nor.push(dx, dy, dz);
      }
    }
    for (let i = 0; i < n - 1; i++) for (let k = 0; k < seg; k++) { const a = i * (seg + 1) + k, b = a + seg + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); g.setIndex(idx); return g;
  }
  function plushLeg(o, m, pm) {   // 통통한 관 다리: 반지름이 허벅지 r0 → 무릎 r1 → 발목 r2 로 매끈하게 가늘어진다
    const hip = new T.Group(), knee = new T.Group(), paw = new T.Group();
    const tg = tubeGeo([new T.Vector3(0, 0, 0), new T.Vector3(0, -o.up * 0.5, 0), new T.Vector3(0, -o.up, 0)], [o.r0, (o.r0 + o.r1) / 2, o.r1], 18); hip.add(sh(new T.Mesh(tg, m)));
    hip.add(ell(o.r0, o.r0 * 1.05, o.r0, m, 20));                   // 엉덩이·어깨 공(몸통 안쪽)
    knee.position.y = -o.up; hip.add(knee);
    knee.add(ell(o.r1, o.r1, o.r1, m, 18));
    const sg = tubeGeo([new T.Vector3(0, 0, 0), new T.Vector3(0, -o.lo * 0.5, 0), new T.Vector3(0, -o.lo, 0)], [o.r1, (o.r1 + o.r2) / 2, o.r2], 18); knee.add(sh(new T.Mesh(sg, m)));
    paw.position.y = -o.lo; knee.add(paw);
    const pw = ell(o.paw[0], o.paw[1], o.paw[2], pm || m, 22); pw.position.set(o.paw[3], -o.paw[1] * 0.25, 0); paw.add(pw);   // 둥근 발(앞으로 살짝)
    hip.userData = { knee, paw }; return hip;
  }
  function buildCat() {
    const root = new T.Group(), P = {};
    const gm = new T.MeshPhysicalMaterial({ color: 0x83909a, roughness: 0.9, metalness: 0, sheen: 0.35, sheenColor: new T.Color(0xcfdcec), sheenRoughness: 0.6 });
    const gl = new T.MeshPhysicalMaterial({ color: 0x9aa6ae, roughness: 0.9, metalness: 0, sheen: 0.35, sheenColor: new T.Color(0xe2ecf6), sheenRoughness: 0.6 });
    const body = new T.Group(); body.position.y = 0.62; root.add(body); P.body = body;
    // 몸통: 가슴이 크고 엉덩이가 작은 달걀형(세 타원체가 한 덩어리로 겹친다)
    const chest = ell(0.4, 0.38, 0.36, gm, 34); chest.position.set(0.18, 0.0, 0); body.add(chest);
    const mid = ell(0.46, 0.34, 0.34, gm, 34); mid.position.set(-0.04, -0.01, 0); body.add(mid);
    const hipm = ell(0.38, 0.34, 0.34, gm, 34); hipm.position.set(-0.22, -0.01, 0); body.add(hipm);
    const belly = ell(0.42, 0.18, 0.26, gl, 24); belly.position.set(0.02, -0.2, 0); body.add(belly);
    const head = new T.Group(); head.position.set(0.5, 0.4, 0); body.add(head); P.head = head;
    head.add(ell(0.55, 0.47, 0.55, gm, 40));
    decal(head, 0.55, 0.47, 0.55, 'lovel_head');
    // 귀: 밑동이 넓고 끝이 둥근 삼각형(원본의 큰 귀) + 분홍 안쪽
    P.ears = [];
    const pinkM = mat(0xd9a3a8, { roughness: 0.9 });
    const earGeo = (r, h) => { const pr = [[0.001, 0], [r, 0], [r * 0.97, h * 0.12], [r * 0.82, h * 0.34], [r * 0.58, h * 0.58], [r * 0.34, h * 0.8], [r * 0.15, h * 0.94], [0.001, h]].map(p => new T.Vector2(p[0], p[1])); return new T.LatheGeometry(pr, 32); };
    [1, -1].forEach(s => {
      const eg = new T.Group(); eg.position.set(-0.03, 0.2, 0.28 * s); head.add(eg);
      const ec = new T.Mesh(earGeo(0.27, 0.62), gm); ec.position.y = 0.0; ec.scale.set(0.5, 1, 1.0); eg.add(sh(ec));
      const ei = new T.Mesh(earGeo(0.19, 0.46), pinkM); ei.position.set(0.075, 0.1, 0); ei.scale.set(0.42, 1, 0.9); eg.add(ei);
      eg.rotation.x = -0.28 * s; eg.rotation.z = 0.08; P.ears.push(eg);
    });
    // 코랄색 목줄 + 금빛 방울
    const col = new T.Mesh(new T.TorusGeometry(0.25, 0.05, 14, 40), mat(0xe28a84, { roughness: 0.5 })); col.position.set(0.5, 0.1, 0); col.rotation.y = Math.PI / 2; col.scale.set(1, 1.18, 1.22); body.add(sh(col));
    const bell = ell(0.062, 0.062, 0.062, mat(0xe8b45a, { metalness: 0.55, roughness: 0.3 }), 18); bell.position.set(0.63, -0.1, 0); body.add(bell);
    // 꼬리: 곡선을 따라 매 프레임 새로 뽑는 매끈한 관(poseCat 에서 갱신)
    P.tailRoot = new T.Group(); P.tailRoot.position.set(-0.5, 0.04, 0); body.add(P.tailRoot);
    P.tailMesh = new T.Mesh(new T.BufferGeometry(), gm); sh(P.tailMesh); P.tailRoot.add(P.tailMesh);
    P.tailTip = ell(0.05, 0.05, 0.05, gm, 14); P.tailRoot.add(P.tailTip); P.tailMat = gm;
    // 다리 네 개: 짧고 통통한 치비 다리 + 둥근 밝은 발 [앞오른, 앞왼, 뒤오른, 뒤왼]
    P.legs = [];
    [[0.3, 0.17], [0.3, -0.17], [-0.3, 0.18], [-0.3, -0.18]].forEach((p, i) => {
      const lg = plushLeg({ up: 0.2, lo: 0.2, r0: 0.17, r1: 0.135, r2: 0.115, paw: [0.185, 0.1, 0.15, 0.07] }, gm, gl);
      lg.position.set(p[0], -0.1, p[1]); body.add(lg); P.legs.push(lg);
    });
    root.userData = P; return root;
  }
  function poseCat(root, ph) {   // 느긋하게 걷기: 대각선 다리끼리 짝, 꼬리는 S자로 살랑, 머리 까딱
    const P = root.userData, a = ph * Math.PI * 2, sw = 0.5;
    [[0, 0], [1, Math.PI], [2, Math.PI], [3, 0]].forEach(q => { const ph2 = a + q[1], up = Math.max(0, Math.cos(ph2)); setLeg(P.legs[q[0]], sw * Math.sin(ph2), Math.pow(up, 0.9), 0.8, 0.9); });
    root.position.y = 0.025 * Math.abs(Math.sin(a * 2)) + 0.01;
    P.body.rotation.y = 0.05 * Math.sin(a); P.body.rotation.z = 0.02 * Math.sin(a * 2);
    P.head.rotation.z = -0.045 * Math.sin(a * 2 + 0.5); P.head.rotation.y = 0.09 * Math.sin(a + 0.6);
    P.ears.forEach((e, i) => { e.rotation.z = 0.05 + 0.035 * Math.sin(a * 2 + i); });
    // 꼬리: 엉덩이에서 뒤로 뻗었다가 위로 휘고 끝이 앞으로 말리는 S자(원본). 몸의 흔들림에 늦게 따라온다.
    const pts = [], rad = [], N = 14, base = [[0, 0, 0], [-0.16, 0.0, 0], [-0.3, 0.1, 0], [-0.38, 0.26, 0], [-0.36, 0.44, 0], [-0.26, 0.58, 0], [-0.13, 0.64, 0], [-0.04, 0.6, 0]];
    const cr = new T.CatmullRomCurve3(base.map((b, i) => {
      const w = i / (base.length - 1), sway = 0.1 * Math.sin(a - w * 3.2) * (0.25 + w), lift = 0.04 * Math.sin(a * 2 - w * 2.4) * w;
      return new T.Vector3(b[0] + lift * 0.4, b[1] + lift, b[2] + sway);
    }), false, 'catmullrom', 0.5);
    for (let i = 0; i <= N; i++) { const u = i / N; pts.push(cr.getPoint(u)); rad.push(0.11 - 0.045 * u * u - 0.02 * u); }
    P.tailMesh.geometry.dispose(); P.tailMesh.geometry = tubeGeo(pts, rad, 16);
    P.tailTip.position.copy(pts[N]); P.tailTip.scale.setScalar(rad[N]);
  }

  // ═════ 올챙이 (챙챙) ═════
  function buildTadpole() {
    const root = new T.Group(), P = {}, bm = glossy(0x222f6c, { roughness: 0.4, clearcoat: 0.5 }), lm = glossy(0x4a68ac, { roughness: 0.4, clearcoat: 0.4 }), dm = glossy(0x16204f, { roughness: 0.4 });
    const body = new T.Group(); body.position.y = 1.0; root.add(body); P.body = body;
    const torso = ell(0.4, 0.42, 0.36, bm, 32); torso.position.set(-0.08, -0.62, 0); body.add(torso);
    const head = new T.Group(); body.add(head); P.head = head;
    head.add(ell(0.5, 0.5, 0.56, bm, 44)); decal(head, 0.5, 0.5, 0.56, 'chaeng_head');
    // 가슴 옆 작은 손
    P.arms = [1, -1].map(s => { const f = new T.Group(); f.position.set(0.1, -0.5, 0.34 * s); body.add(f); const h = ell(0.1, 0.17, 0.1, bm, 14); h.position.set(0.0, -0.1, 0.03 * s); h.rotation.x = 0.3 * s; f.add(h); return f; });
    // 꼬리: 납작하고 넓은 지느러미 하나(곡면) — 몸통 아래에서 뒤로 뻗어 끝이 위로 말리고, 프레임마다 물결 모양으로 휜다
    const NU = 44, NV = 18, tg = new T.CylinderGeometry(1, 1, 1, NV, NU, false), tp = tg.attributes.position, nv = tp.count, base = new Float32Array(nv * 3), cols = new Float32Array(nv * 3);
    const cN = new T.Color(0x222f6c), cL = new T.Color(0x4f6db0), cS = new T.Color(0x2a3b80), cc = new T.Color();
    for (let i = 0; i < nv; i++) {
      const y = tp.getY(i), u = Math.min(1, Math.max(0, y + 0.5)), th = Math.atan2(tp.getZ(i), tp.getX(i));
      base[i * 3] = u; base[i * 3 + 1] = Math.cos(th); base[i * 3 + 2] = Math.sin(th);
      const k = Math.min(1, Math.max(0, (u - 0.05) / 0.3)); cc.copy(cN).lerp(cL, k);
      if (u > 0.3 && u < 0.92 && Math.cos(th) > 0.55) cc.lerp(cS, 0.8 * Math.min(1, (Math.cos(th) - 0.55) / 0.3));
      cols[i * 3] = cc.r; cols[i * 3 + 1] = cc.g; cols[i * 3 + 2] = cc.b;
    }
    tg.setAttribute('color', new T.BufferAttribute(cols, 3));
    const tailMesh = new T.Mesh(tg, new T.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.4, clearcoat: 0.4, metalness: 0 })); tailMesh.castShadow = true; tailMesh.receiveShadow = true; tailMesh.frustumCulled = false;
    const tailG = new T.Group(); tailG.position.set(-0.28, -0.72, 0); tailG.add(tailMesh); body.add(tailG); P.tailG = tailG;
    P.tailUpdate = function (a) {
      const L = 1.5;
      for (let i = 0; i < nv; i++) {
        const u = base[i * 3], cy = base[i * 3 + 1], cz = base[i * 3 + 2];
        const hgt = (0.17 + 0.25 * Math.sin(Math.PI * Math.pow(u, 0.8))) * (1 - 0.8 * Math.pow(u, 6)) + 0.02, tk = Math.max(0.012, 0.15 - 0.13 * u);
        const wave = 0.2 * Math.pow(u, 1.1) * Math.sin(a - 5 * u), curl = 0.38 * Math.pow(u, 2.2) + 0.05 * u;
        tp.setXYZ(i, -L * u + 0.0, curl + cy * hgt, wave + cz * tk);
      }
      tp.needsUpdate = true; tg.computeVertexNormals();
    };
    P.tailUpdate(0); P.tail = [];
    P.bubbles = []; const bmM = new T.MeshPhysicalMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.35, roughness: 0.05, clearcoat: 1 });
    for (let i = 0; i < 4; i++) { const b = ell(0.07, 0.07, 0.07, bmM, 12); b.castShadow = false; b.userData.i = i; root.add(b); P.bubbles.push(b); }
    root.userData = P; return root;
  }
  function poseTadpole(root, ph) {   // 헤엄: 꼬리 물결이 몸통→끝으로 전달, 몸이 살짝 앞뒤·위아래로 일렁
    const P = root.userData, a = ph * Math.PI * 2;
    P.tailUpdate(a);
    P.body.rotation.y = -0.1 * Math.sin(a + 0.2); P.body.position.y = 1.0 + 0.06 * Math.sin(a * 2); P.body.position.x = 0.04 * Math.cos(a); P.body.rotation.z = 0.06 * Math.sin(a * 2 + 1);
    P.head.rotation.z = 0.05 * Math.sin(a * 2 + 0.5);
    P.arms.forEach((f, i) => { f.rotation.x = (i ? 1 : -1) * (0.3 + 0.4 * Math.sin(a * 2 + i)); });
    P.bubbles.forEach(b => { const k = ((ph + b.userData.i * 0.25) % 1); b.position.set(0.9 - b.userData.i * 0.12 + k * 0.1, 1.3 + k * 0.9, 0.2 * (b.userData.i % 2 ? 1 : -1)); b.scale.setScalar(0.04 + 0.05 * Math.sin(k * Math.PI)); });
  }

  // ═════ 독수리 (술) ═════
  function buildEagle() {
    const root = new T.Group(), P = {}, br = mat(0x7a6c5e, { roughness: 0.9 }), dk = mat(0x5d5249, { roughness: 0.9 }), lt = mat(0x938779, { roughness: 0.9 }), wh = mat(0xf6f4ee, { roughness: 0.9 }), yl = glossy(0xe9b02c, { roughness: 0.4 });
    const body = new T.Group(); body.position.y = 1.2; root.add(body); P.body = body;
    body.add(ell(0.66, 0.62, 0.56, br, 32)); decal(body, 0.66, 0.62, 0.56, 'sul_chest');
    const head = new T.Group(); head.position.set(0.5, 0.5, 0); body.add(head); P.head = head;
    head.add(ell(0.56, 0.55, 0.58, wh, 36)); decal(head, 0.56, 0.55, 0.58, 'sul_head');
    // 큼직한 노란 부리(위가 넓고 끝이 아래로 굽는다)
    const bk = new T.Mesh(new T.ConeGeometry(0.2, 0.46, 20), yl); bk.rotation.z = -Math.PI / 2; bk.position.set(0.62, -0.14, 0); bk.scale.set(1, 1, 1.25); head.add(sh(bk));
    const hook = ell(0.1, 0.11, 0.1, yl, 14); hook.position.set(0.84, -0.22, 0); head.add(hook);
    // 꽁지(흰 부채)
    P.tail = new T.Group(); P.tail.position.set(-0.55, 0.0, 0); body.add(P.tail);
    for (let i = -2; i <= 2; i++) { const f = ell(0.4, 0.04, 0.1, wh, 14); f.position.set(-0.38, 0, i * 0.1); f.rotation.y = i * 0.1; P.tail.add(f); }
    // 날개: 어깨→팔뚝→손 세 마디에 깃털. +z 쪽(오른쪽 날개)을 만들고 왼쪽은 z 반전
    P.wings = [];
    [1, -1].forEach(s => {
      const sh0 = new T.Group(); sh0.scale.setScalar(0.85); sh0.position.set(0.1, 0.2, 0.46 * s); body.add(sh0);
      const arm = new T.Group(); sh0.add(arm); const a1 = ell(0.3, 0.1, 0.5, br, 18); a1.position.z = 0.5 * s; arm.add(a1);
      for (let i = 0; i < 6; i++) { const f = ell(0.3, 0.03, 0.55, i % 2 ? dk : br, 14); f.position.set(-0.14 - i * 0.05, 0, (0.45 + i * 0.03) * s); f.rotation.y = -0.05 * i * s; arm.add(f); }
      const fore = new T.Group(); fore.position.z = 1.0 * s; arm.add(fore); const a2 = ell(0.28, 0.09, 0.4, br, 18); a2.position.z = 0.35 * s; fore.add(a2);
      for (let i = 0; i < 6; i++) { const f = ell(0.28, 0.028, 0.5, i % 2 ? dk : br, 14); f.position.set(-0.1 - i * 0.05, 0, (0.3 + i * 0.03) * s); f.rotation.y = -0.07 * i * s; fore.add(f); }
      const hand = new T.Group(); hand.position.z = 0.75 * s; fore.add(hand);
      for (let i = 0; i < 7; i++) { const f = ell(0.14, 0.024, 0.55 - i * 0.02, dk, 12); f.position.set(0.12 - i * 0.075, 0, (0.28 + i * 0.01) * s); f.rotation.y = (0.22 - i * 0.07) * s; hand.add(f); }
      P.wings.push({ s: s, sh: sh0, arm: arm, fore: fore, hand: hand });
    });
    // 다리(주황 다리·발톱) — 비행 중이라 뒤로 접는다
    const ym = glossy(0xe7a23a, { roughness: 0.45 });
    P.legs = [1, -1].map(s => { const g = new T.Group(); g.position.set(-0.05, -0.46, 0.2 * s); body.add(g); g.add(limb(0.34, 0.07, ym)); const ft = ell(0.17, 0.05, 0.12, ym, 12); ft.position.set(0.05, -0.36, 0); g.add(ft); g.rotation.z = 1.1; return g; });
    root.userData = P; return root;
  }
  function poseEagle(root, ph) {   // 날갯짓: 내려칠 때 활짝, 올릴 때 손목을 꺾어 접는다 · 몸은 반대로 출렁
    const P = root.userData, a = ph * Math.PI * 2, f = Math.sin(a);
    P.wings.forEach(w => {
      const s = w.s, ang = 0.62 * f;
      w.sh.rotation.x = -s * ang;
      w.fore.rotation.x = -s * (0.35 * Math.sin(a - 0.7) - 0.05);
      w.hand.rotation.x = -s * (0.55 * Math.sin(a - 1.3));
      w.fore.rotation.y = -0.1 * s; w.arm.rotation.y = 0;
    });
    P.body.position.y = 1.2 - 0.16 * f; P.body.rotation.z = 0.04 * Math.sin(a - 0.4);
    P.head.rotation.z = -0.03 * Math.sin(a - 0.4); P.tail.rotation.z = 0.1 * Math.sin(a - 1.0) - 0.05;
  }

  // ═════ 두더지 (두덩) ═════
  function buildMole() {
    const root = new T.Group(), P = {}, bm = mat(0x9b7a60, { roughness: 0.95 }), skin = mat(0xcf9f86, { roughness: 0.8 }), gold = mat(0xb48a3c, { roughness: 0.45, metalness: 0.45 });
    const body = new T.Group(); body.position.y = 0.62; root.add(body); P.body = body;
    body.add(ell(0.5, 0.48, 0.52, bm, 36)); decal(body, 0.5, 0.48, 0.52, 'dudung_belly');
    const head = new T.Group(); head.position.set(0.0, 0.56, 0); body.add(head); P.head = head;
    head.add(ell(0.5, 0.4, 0.54, bm, 36)); decal(head, 0.5, 0.4, 0.54, 'dudung_head');
    // 분홍 코(원본 그림을 입힌 볼록한 코)
    const sn = ell(0.24, 0.23, 0.2, mat(0xe8a39b, { roughness: 0.55 }), 28); sn.position.set(0.44, -0.07, 0.1); head.add(sn); decal(sn, 0.24, 0.23, 0.2, 'dudung_snout', { k: 1.02 });
    // 안전모
    const hat = new T.Group(); hat.position.set(0.0, 0.22, 0); head.add(hat);
    const dome = new T.Mesh(new T.SphereGeometry(0.56, 40, 24, 0, Math.PI * 2, 0, Math.PI / 2), gold); dome.scale.set(0.95, 0.9, 1.0); hat.add(sh(dome));
    const brim = new T.Mesh(new T.CylinderGeometry(0.58, 0.58, 0.05, 40), gold); brim.position.y = 0.0; brim.scale.set(1.0, 1, 1.0); hat.add(sh(brim));
    const rib = new T.Mesh(new T.BoxGeometry(0.1, 0.06, 0.8), gold); rib.position.y = 0.46; hat.add(sh(rib));
    const lampR = new T.Mesh(new T.CylinderGeometry(0.17, 0.2, 0.14, 24), mat(0x9a9a92, { metalness: 0.5, roughness: 0.4 })); lampR.rotation.z = Math.PI / 2; lampR.position.set(0.44, 0.34, 0.0); hat.add(sh(lampR));
    const lb = ell(0.06, 0.15, 0.15, new T.MeshBasicMaterial({ color: 0xeef3e4 }), 18); lb.position.set(0.5, 0.34, 0); lb.castShadow = false; hat.add(lb);
    // 팔과 삽
    P.arms = [];
    [1, -1].forEach(s => { const sg = new T.Group(); sg.position.set(0.18, 0.24, 0.52 * s); body.add(sg);
      sg.add(limb(0.5, 0.15, bm)); const paw = ell(0.2, 0.15, 0.17, skin, 18); paw.position.set(0.04, -0.54, 0); sg.add(paw);
      for (let k = -1; k <= 1; k++) { const c = new T.Mesh(new T.ConeGeometry(0.025, 0.1, 6), mat(0xe9d3c4)); c.position.set(0.22, -0.56, k * 0.07); c.rotation.z = -Math.PI / 2; sg.add(c); }
      sg.rotation.z = 0.25; P.arms.push(sg); });
    const sv = new T.Group(); sv.position.set(0.0, -0.5, 0); P.arms[1].add(sv); P.shovel = sv;
    const hd = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 1.2, 8), mat(0xa9753f, { roughness: 0.7 })); hd.position.set(0.05, 0.2, 0); sv.add(sh(hd));
    const bl = new T.Mesh(new T.BoxGeometry(0.3, 0.34, 0.04), mat(0x9ea3a6, { metalness: 0.5, roughness: 0.4 })); bl.position.set(0.05, -0.4, 0); sv.add(sh(bl));
    // 발
    P.legs = [1, -1].map(s => { const g = new T.Group(); g.position.set(0.04, -0.42, 0.28 * s); body.add(g); const ft = ell(0.3, 0.12, 0.17, skin, 18); ft.position.set(0.1, -0.1, 0); g.add(ft); return g; });
    root.userData = P; return root;
  }
  function poseMoleWalk(root, ph) {   // 뒤뚱뒤뚱 걷고, 삽을 어깨에 걸쳐 까딱
    const P = root.userData, a = ph * Math.PI * 2;
    P.body.rotation.x = 0.1 * Math.sin(a); P.body.rotation.z = 0.03 + 0.05 * Math.sin(a); P.body.position.y = 0.62 + 0.06 * Math.abs(Math.sin(a));
    P.legs[0].rotation.z = 0.6 * Math.sin(a); P.legs[1].rotation.z = 0.6 * Math.sin(a + Math.PI);
    P.legs.forEach((g, i) => { g.position.y = -0.42 + Math.max(0, Math.sin(a + (i ? Math.PI : 0))) * 0.1; });
    P.arms[0].rotation.z = 0.3 + 0.5 * Math.sin(a + Math.PI); P.arms[1].rotation.z = 0.3 + 0.16 * Math.sin(a + 0.4);
    P.head.rotation.z = -0.05 * Math.sin(a + 0.6); P.head.rotation.x = 0.05 * Math.sin(a);
    P.shovel.rotation.z = -0.5 + 0.12 * Math.sin(a + 0.4);
  }
  function dirt(n) { const g = new T.Group(), m = mat(0x6b4a30, { roughness: 1 }), R = rng(77); for (let i = 0; i < n; i++) { const d = ell(0.1, 0.07, 0.1, m, 8); d.userData.k = [R() * 6.28, 0.4 + R() * 0.7, 0.8 + R() * 1.2, 0.05 + R() * 0.07]; g.add(d); } return g; }

  window.CHARS = {
    lovel: { name: '러블', build: () => buildCat(), pose: poseCat, yaw: -0.85, frames: 16, view: [3.3, 0.95, -0.12] },
    dolsom: { name: '돌솜', build: () => buildDog({ fur: 0xeeeeea, bow: 0x3d7edb, seed: 31, tex: 'dolsom_head', tail: 'long' }), pose: (r, p) => poseDog(r, p, { gait: 1.0, air: 0.22 }), yaw: -0.85, frames: 16, view: [3.3, 0.95] },
    ppopu: { name: '뽀푸', build: () => buildDog({ fur: 0xb39a7a, collar: 0x5b3b24, seed: 57, tex: 'ppopu_head', tail: 'short' }), pose: (r, p) => poseDog(r, p, { gait: 0.85, air: 0.3 }), yaw: -0.85, frames: 16, view: [3.3, 0.95] },
    chaeng: { name: '챙챙', build: () => buildTadpole(), pose: poseTadpole, yaw: -0.8, frames: 16, view: [3.9, 1.1, -0.3] },
    sul: { name: '술', build: () => buildEagle(), pose: poseEagle, yaw: -0.8, frames: 16, view: [5.6, 1.35] },
    dudung: { name: '두덩', build: () => buildMole(), pose: poseMoleWalk, yaw: -0.85, frames: 16, view: [3.3, 1.05] },
  };
  window.dirt = dirt;
})();

// 길동무 새 친구 2종 — 판다 · 아기하마 (three.js 절차 모델, 오프라인 렌더용). 앞은 +z, 위는 +y. 앉은 자세(히어로).
(function () {
  const T = THREE;
  function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return (s % 100000) / 100000; }; }
  function sh(m) { m.castShadow = true; m.receiveShadow = true; return m; }
  function ell(sx, sy, sz, m, seg) { const g = new T.Mesh(new T.SphereGeometry(1, seg || 48, Math.round((seg || 48) * 0.75)), m); g.scale.set(sx, sy, sz); return sh(g); }
  function at(o, x, y, z) { o.position.set(x, y, z); return o; }
  // 잔털 요철(아주 고운 솜털 질감)
  let _fz = null;
  function fuzz() {
    if (_fz) return _fz;
    const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d'); x.fillStyle = '#808080'; x.fillRect(0, 0, 512, 512);
    const R = rng(11); for (let i = 0; i < 9000; i++) { const px = R() * 512, py = R() * 512, r = 1 + R() * 2.4, v = R() > 0.5 ? 255 : 0; const g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, 'rgba(' + v + ',' + v + ',' + v + ',0.35)'); g.addColorStop(1, 'rgba(' + v + ',' + v + ',' + v + ',0)'); x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2); }
    const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(3, 3); return (_fz = t);
  }
  const plush = (col, o) => new T.MeshPhysicalMaterial(Object.assign({ color: col, roughness: 0.82, metalness: 0, sheen: 1, sheenColor: new T.Color(0xffffff), sheenRoughness: 0.55, bumpMap: fuzz(), bumpScale: 0.9 }, o || {}));
  const soft = (col, o) => new T.MeshPhysicalMaterial(Object.assign({ color: col, roughness: 0.5, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.5, sheen: 0.6, sheenColor: new T.Color(0xffd9e6), sheenRoughness: 0.5 }, o || {}));
  const gloss = (col, o) => new T.MeshPhysicalMaterial(Object.assign({ color: col, roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08 }, o || {}));
  const flat = (col) => new T.MeshBasicMaterial({ color: col });
  // 볼터치(부드러운 분홍 원)
  function blushTex(col) {
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, col + 'cc'); g.addColorStop(0.55, col + '66'); g.addColorStop(1, col + '00'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
  }
  function blush(parent, x, y, z, s, ry, col) {
    const m = new T.Mesh(new T.PlaneGeometry(s, s * 0.78), new T.MeshBasicMaterial({ map: blushTex(col || '#ff7f9e'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
    m.position.set(x, y, z); m.rotation.y = ry; parent.add(m); return m;
  }
  // 눈: 큼직한 광택 눈 + 큰 하이라이트(왼쪽 위) + 작은 하이라이트(오른쪽 아래) + 아래쪽 반사광
  // 눈: 뜬 눈(공+홍채+반사광) / 감은 눈(∪) / 웃는 눈(∩) / 찡그린 눈(> <) — setEye(g, kind)
  function eye(parent, x, y, z, r, sx, rot, lidCol, lz, sd) {
    const g = new T.Group(); g.position.set(x, y, z); if (rot) g.rotation.set(rot[0], rot[1], rot[2]);
    const bg = new T.Group(); g.add(bg);
    const ball = ell(r * (sx || 1), r * 1.12, r * 0.8, gloss(0x1b120f, { roughness: 0.08 }), 40); bg.add(ball);
    const iris = ell(r * 0.74 * (sx || 1), r * 0.84, r * 0.2, new T.MeshStandardMaterial({ color: 0x4a2a1e, roughness: 0.3, emissive: 0x2a140c, emissiveIntensity: 0.5 }), 32); iris.position.set(0, -r * 0.1, r * 0.66); bg.add(iris);
    const hl = new T.Mesh(new T.SphereGeometry(1, 20, 14), flat(0xffffff)); hl.scale.set(r * 0.34, r * 0.38, r * 0.2); hl.position.set(-r * 0.3, r * 0.38, r * 0.74); bg.add(hl);
    const h2 = new T.Mesh(new T.SphereGeometry(1, 16, 12), flat(0xffffff)); h2.scale.setScalar(r * 0.16); h2.position.set(r * 0.32, -r * 0.34, r * 0.76); bg.add(h2);
    const h3 = new T.Mesh(new T.SphereGeometry(1, 12, 10), new T.MeshBasicMaterial({ color: 0xffe0ee, transparent: true, opacity: 0.55 })); h3.scale.set(r * 0.5, r * 0.14, r * 0.1); h3.position.set(0, -r * 0.62, r * 0.55); bg.add(h3);
    // 감은 눈 줄(눈알 앞면보다 살짝 앞)
    const lc = flat(lidCol === undefined ? 0x3a2330 : lidCol), Z = lz === undefined ? r * 0.8 : lz, W = r * 0.95, TR = r * 0.1;
    const mk = pts => { const t = tube(pts.map(p => [p[0], p[1], Z]), TR, lc, 24); t.castShadow = false; return t; };
    const N = 14, arc = (amp, off) => { const p = []; for (let i = 0; i <= N; i++) { const u = i / N * 2 - 1; p.push([u * W, off + amp * (1 - u * u)]); } return p; };
    const L = {};
    L.closed = new T.Group(); L.closed.add(mk(arc(-r * 0.3, r * 0.1)));
    L.happy = new T.Group(); L.happy.add(mk(arc(r * 0.42, -r * 0.2)));
    const sq = (sd || 1); L.squint = new T.Group();
    L.squint.add(mk([[-W * 0.75 * sq, r * 0.5], [W * 0.7 * sq, 0]])); L.squint.add(mk([[-W * 0.75 * sq, -r * 0.5], [W * 0.7 * sq, 0]]));
    for (const k in L) { L[k].visible = false; g.add(L[k]); }
    g.userData = { bg, L };
    parent.add(g); return g;
  }
  function setEye(g, kind) { const U = g.userData; U.bg.visible = (!kind || kind === 'open'); for (const k in U.L) U.L[k].visible = (k === kind); }
  function tube(pts, r, m, seg) { const c = new T.CatmullRomCurve3(pts.map(p => new T.Vector3(p[0], p[1], p[2]))); return sh(new T.Mesh(new T.TubeGeometry(c, seg || 24, r, 10, false), m)); }
  // 구면(타원체) 위에 얹는 부위: 방향 벡터로 표면 위치를 구한다
  function onEll(rx, ry, rz, cx, cy, cz, dx, dy, dz, push) {
    const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l; const k = 1 + (push || 0);
    return [cx + dx * rx * k, cy + dy * ry * k, cz + dz * rz * k];
  }

  function surfZ(rx, ry, rz, cx, cy, cz, x, y, push) { const a = (x - cx) / rx, b = (y - cy) / ry, q = 1 - a * a - b * b; return cz + rz * Math.sqrt(Math.max(0.0001, q)) + (push || 0); }
  function smile(parent, E, pts, r, col, push) { return parent.add(tube(pts.map(p => [p[0], p[1], surfZ(E[0], E[1], E[2], E[3], E[4], E[5], p[0], p[1], push === undefined ? 0.012 : push)]), r, flat(col), 40)); }
  // 작은 장식(눈 반사광·이빨·콧구멍·입선 등)은 그림자를 드리우지 않는다 — 배 위에 점선 같은 그림자가 생기는 걸 막는다
  function finish(root) { root.updateMatrixWorld(true); root.traverse(o => { if (!o.isMesh) return; const b = new T.Box3().setFromObject(o), sz = b.getSize(new T.Vector3()); if (o.geometry.type === 'TubeGeometry' || Math.max(sz.x, sz.y, sz.z) < 0.34) o.castShadow = false; }); return root; }
  // ═════ 판다 ═════
  function buildPanda(o) {
    o = o || {}; const root = new T.Group(), P = {}; P.eyes = [];
    const white = plush(0xfdfcf8), black = plush(0x1b1b21, { sheenColor: new T.Color(0x6a6a7c), sheenRoughness: 0.45, roughness: 0.78 }), cream = plush(0xfff3e4);
    const pad = soft(0xf4b8c4, { roughness: 0.6 }), padDark = soft(0xe39aab);
    // 몸통: 통통한 배 (앉은 자세, 살짝 뒤로)
    const upper = new T.Group(); root.add(upper); P.upper = upper;
    const body = new T.Group(); upper.add(body); P.body = body;
    const torso = ell(1.0, 0.98, 0.9, white); at(torso, 0, 0.95, -0.04); torso.rotation.x = -0.08; body.add(torso);
    const belly = ell(0.72, 0.7, 0.4, cream); at(belly, 0, 0.86, 0.55); belly.rotation.x = -0.1; body.add(belly);
    // 머리: 넓고 둥근 큰 머리 (몸의 1.2배)
    const head = new T.Group(); head.position.set(0, 2.3, 0.1); head.rotation.z = -0.05; upper.add(head); P.head = head;
    const HR = [1.2, 1.0, 1.04];
    head.add(ell(HR[0], HR[1], HR[2], white, 64));
    const cheekL = ell(0.5, 0.42, 0.5, white, 40); at(cheekL, -0.74, -0.36, 0.34); head.add(cheekL);   // 통통한 볼(머리 안쪽으로 묻어 자연스럽게 이어짐)
    const cheekR = ell(0.5, 0.42, 0.5, white, 40); at(cheekR, 0.74, -0.36, 0.34); head.add(cheekR);
    // 귀
    P.ears = [];
    [-1, 1].forEach(sd => {
      const g = new T.Group(); g.position.set(0.86 * sd, 0.82, 0.0); g.rotation.set(0.0, 0.0, -0.5 * sd); head.add(g);
      g.add(ell(0.33, 0.33, 0.22, black, 40));
      const inn = ell(0.17, 0.17, 0.1, plush(0x3b3340, { roughness: 0.8 }), 28); inn.position.set(0, 0.0, 0.16); g.add(inn);
      P.ears.push(g);
    });
    // 눈 무늬(눈물방울 모양, 바깥쪽이 처짐)
    [-1, 1].forEach(sd => {
      const p = new T.Group(); p.position.set(0.5 * sd, -0.03, 0.93); p.rotation.set(0.04, 0.34 * sd, 0.62 * sd); head.add(p);
      p.add(ell(0.27, 0.37, 0.12, black, 40));
      P.eyes.push(eye(head, 0.46 * sd, -0.06, 1.0, 0.145, 1.0, [0.0, 0.3 * sd, 0], 0xfff3e4, 0.12, sd));
    });
    // 주둥이 + 코 + 입
    const muzzle = ell(0.46, 0.34, 0.34, cream, 48); at(muzzle, 0, -0.36, 0.92); head.add(muzzle);
    const nose = ell(0.14, 0.095, 0.1, gloss(0x1a1215, { roughness: 0.2 }), 32); at(nose, 0, -0.2, 1.2); nose.rotation.x = 0.2; head.add(nose);
    const nh = new T.Mesh(new T.SphereGeometry(1, 12, 10), flat(0xffffff)); nh.scale.set(0.035, 0.02, 0.02); nh.position.set(-0.04, -0.17, 1.28); head.add(nh);
    const mc = 0x4a2b30, PM = [0.46, 0.34, 0.34, 0, -0.36, 0.92];
    P.mouth = new T.Group(); head.add(P.mouth); P.mouthOpen = new T.Group(); P.mouthOpen.visible = false; head.add(P.mouthOpen);
    { const mz = surfZ(0.46, 0.34, 0.34, 0, -0.36, 0.92, 0, -0.5, 0.0); const om = ell(0.17, 0.12, 0.06, soft(0x5a1f2e, { roughness: 0.5 }), 24); at(om, 0, -0.5, mz + 0.01); P.mouthOpen.add(om); const ot = ell(0.1, 0.065, 0.04, soft(0xff8fa8, { roughness: 0.4 }), 20); at(ot, 0, -0.55, mz + 0.045); P.mouthOpen.add(ot); }
    smile(P.mouth, PM, [[0, -0.2], [0, -0.38]], 0.017, mc, 0.01);
    smile(P.mouth, PM, [[0, -0.38], [-0.1, -0.5], [-0.22, -0.5], [-0.32, -0.4]], 0.017, mc, 0.01);
    smile(P.mouth, PM, [[0, -0.38], [0.1, -0.5], [0.22, -0.5], [0.32, -0.4]], 0.017, mc, 0.01);
    const tongue = ell(0.1, 0.065, 0.035, soft(0xff8fa8, { roughness: 0.4 }), 20); at(tongue, 0, -0.56, surfZ(0.46, 0.34, 0.34, 0, -0.36, 0.92, 0, -0.56, 0.0) - 0.0); P.mouth.add(tongue);
    blush(head, -0.86, -0.28, 0.78, 0.42, -0.9, '#ff7f9e'); blush(head, 0.86, -0.28, 0.78, 0.42, 0.9, '#ff7f9e');
    // 이마에 대나무 싹
    const sp = new T.Group(); sp.position.set(0.1, 0.98, 0.18); sp.rotation.z = -0.1; head.add(sp);
    const lm = gloss(0x66c27a, { roughness: 0.35, clearcoat: 0.6 });
    [[-0.5, 0.2], [0.6, -0.18]].forEach((q, i) => { const lf = ell(0.075, 0.32, 0.018, lm, 24); lf.position.set(q[0] * 0.28, 0.22, 0); lf.rotation.z = q[0] * 0.9; lf.rotation.x = q[1]; sp.add(lf); });
    const st = ell(0.04, 0.09, 0.04, gloss(0x4fa863), 16); st.position.set(0, 0.03, 0); sp.add(st);
    // 목도리
    const sc = new T.Mesh(new T.TorusGeometry(0.7, 0.23, 24, 64), plush(0x45c46e, { sheenColor: new T.Color(0xbaffd0) })); sc.position.set(0, 1.36, 0.14); sc.rotation.x = Math.PI / 2 - 0.3; sc.scale.set(1.05, 0.95, 1.0); sh(sc); body.add(sc);
    const kn = ell(0.2, 0.2, 0.18, plush(0x45c46e), 28); at(kn, -0.3, 1.14, 0.84); body.add(kn);
    const tl = ell(0.14, 0.34, 0.07, plush(0x45c46e), 24); at(tl, -0.34, 0.8, 0.9); tl.rotation.z = -0.15; body.add(tl);
    const tl2 = ell(0.14, 0.28, 0.07, plush(0x39b061), 24); at(tl2, -0.12, 0.84, 0.92); tl2.rotation.z = 0.2; tl2.rotation.y = -0.2; body.add(tl2);
    // 팔(검정): 어깨 피벗. 자세는 RIG.pose 가 정한다(여기선 아래로 늘어뜨린 기본형)
    function arm(sd) {
      const g = new T.Group(); g.position.set(0.95 * sd, 1.42, 0.14); body.add(g);
      const a = ell(0.27, 0.5, 0.27, black, 36); a.position.set(0, -0.26, 0); g.add(a);
      const paw = new T.Group(); paw.position.set(0, -0.62, 0.04); g.add(paw); g.userData.paw = paw;
      const pm = ell(0.31, 0.3, 0.29, black, 36); paw.add(pm);
      const pp = ell(0.14, 0.11, 0.06, padDark, 24); pp.position.set(0, -0.02, 0.26); paw.add(pp);
      [[-0.14, 0.15], [0, 0.19], [0.14, 0.15]].forEach(q => { const tb = ell(0.055, 0.05, 0.04, pad, 16); tb.position.set(q[0], q[1] - 0.02, 0.27); paw.add(tb); });
      return g;
    }
    P.armL = arm(-1); P.armR = arm(1);
    // 항상 들고 다니는 대나무(o.bb: 'L' | 'R' 어느 팔이 쥐는지). 팔의 자식이고 RIG.pose 가 팔 각도의 반대로 돌려 곧게 세운다
    {
      const holder = o.bb === 'L' ? P.armL : P.armR;
      const wrap = new T.Group(); wrap.position.set(0, -0.62, 0.3); holder.add(wrap); P.bambooWrap = wrap;
      const bb = new T.Group(); wrap.add(bb); P.bamboo = bb;
      const stalk = new T.Group(); bb.add(stalk); P.stalk = stalk;
      const gm = gloss(0x7ccb62, { roughness: 0.32, clearcoat: 0.7 }), nm = gloss(0x4fa04a, { roughness: 0.4 }), lm2 = gloss(0x66c27a, { roughness: 0.35, clearcoat: 0.6 });
      const SHORT = o.bamLen === 2, L0 = SHORT ? -0.6 : -1.0, SEG = SHORT ? [0.85, 0.85, 0.5] : [0.78, 0.7, 0.62, 0.5];
      let y = L0;
      SEG.forEach((len, i) => {
        const r = 0.125 - i * 0.01;
        const cyl = new T.Mesh(new T.CylinderGeometry(r, r, len, 24), gm); cyl.position.y = y + len / 2; sh(cyl); stalk.add(cyl);
        const ring = ell(r * 1.28, 0.045, r * 1.28, nm, 20); ring.position.y = y + len; stalk.add(ring);
        y += len;
      });
      [[-0.5, 0.25], [0.55, -0.3], [0.05, 0.6]].forEach(q => { const lf = ell(0.075, 0.36, 0.02, lm2, 20); lf.position.set(q[0] * 0.22, y + 0.2, q[1] * 0.12); lf.rotation.z = q[0] * 1.1; lf.rotation.x = q[1] * 0.6; stalk.add(lf); });
      const br = ell(0.06, 0.2, 0.018, lm2, 18); br.position.set(0.17, L0 + 0.78 + 0.12, 0.04); br.rotation.z = -0.9; stalk.add(br);
      const br2 = ell(0.06, 0.18, 0.018, lm2, 18); br2.position.set(-0.17, L0 + (SHORT ? 1.0 : 1.48) + 0.1, 0.0); br2.rotation.z = 0.9; stalk.add(br2);
      const fist = ell(0.24, 0.2, 0.18, black, 28); fist.position.set(0, -0.05, 0.12); bb.add(fist);
      [-0.1, 0.1].forEach(x => { const f = ell(0.085, 0.085, 0.085, black, 14); f.position.set(x * 1.2, 0.04, 0.26); bb.add(f); });
    }
    // 다리: 엉덩이 피벗(몸 안쪽)에서 아래로. 앉을 땐 앞으로 눕힌다(발바닥 패드가 정면으로 보임)
    P.legs = []; P.feet = []; P.pads = [];
    [-1, 1].forEach(sd => {
      const g = new T.Group(); g.position.set(0.52 * sd, 0.33, 0.12); body.add(g); P.legs.push(g);
      g.add(at(ell(0.4, 0.42, 0.4, black, 36), 0, -0.3, 0));
      const f = new T.Group(); f.position.set(0, -0.62, 0); g.add(f); P.feet.push(f);
      f.add(at(ell(0.4, 0.22, 0.52, black, 36), 0, 0, 0.2));
      const sole = ell(0.27, 0.07, 0.33, padDark, 28); sole.position.set(0, -0.2, 0.22); f.add(sole); P.pads.push(sole);
      [[-0.17, 0.4], [0, 0.45], [0.17, 0.4]].forEach(q => { const tb = ell(0.07, 0.045, 0.07, pad, 16); tb.position.set(q[0], -0.22, q[1] - 0.02); f.add(tb); P.pads.push(tb); });
    });
    P.tail = ell(0.26, 0.26, 0.24, white, 28); at(P.tail, 0, 0.35, -0.95); body.add(P.tail);
    root.userData.P = P; root.userData.kind = 'panda';
    return finish(root);
  }


  // 신발 4종: 0 흰 운동화(분홍 줄) · 1 노란 장화 · 2 보라 메리제인(리본 단추) · 3 민트 하이탑(별). 발끝은 +z, 바닥은 -y. 반들반들 깨끗한 새 신발.
  const SHOE_NAMES = ['흰 운동화', '노란 장화', '보라 메리제인', '민트 하이탑'];
  function shoe(v, sd) {
    const g = new T.Group();
    const C = [
      { up: 0xffffff, sole: 0xffd1e3, acc: 0xff8fb8, cap: 0xfff4f8 },
      { up: 0xffd23c, sole: 0x6b4a2a, acc: 0xff9f1c, cap: 0xffe27a },
      { up: 0xb79cf5, sole: 0xfff3fa, acc: 0xff7fb0, cap: 0xcdb8ff },
      { up: 0x7fe3c4, sole: 0xffffff, acc: 0xffe066, cap: 0xb2f2de }
    ][v];
    const up = gloss(C.up, { roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.2 }), sl = soft(C.sole, { roughness: 0.55 }), ac = gloss(C.acc, { roughness: 0.25 }), cp = gloss(C.cap, { roughness: 0.3, clearcoat: 0.6 });
    const H = v === 1 ? 0.56 : v === 3 ? 0.4 : 0.26;                              // 목 높이(장화·하이탑이 높다)
    g.add(at(ell(0.46, 0.17, 0.62, sl, 32), 0, -0.2, 0.1));                          // 밑창
    [-0.22, 0.02, 0.26].forEach(z => g.add(at(ell(0.27, 0.018, 0.045, cp, 12), 0, -0.368, 0.1 + z)));   // 밑창 무늬(바닥이 보일 때)
    g.add(at(ell(0.42, 0.27, 0.58, up, 36), 0, -0.02, 0.1));                         // 신발 몸통
    g.add(at(ell(0.34, 0.2, 0.3, cp, 28), 0, -0.07, 0.4));                           // 앞코
    if (v === 1 || v === 3) g.add(at(ell(0.38, H, 0.36, up, 32), 0, H * 0.5 - 0.05, -0.02));  // 목
    if (v === 1) { g.add(at(ell(0.4, 0.07, 0.38, ac, 28), 0, H - 0.1, -0.02)); [[-0.13, 0.4], [0.13, 0.3]].forEach(q => { g.add(at(ell(0.06, 0.06, 0.03, ac, 14), q[0], q[1], 0.2)); }); }
    if (v === 0) { [0.0, 0.1, 0.2].forEach((z, i) => g.add(at(ell(0.15 - i * 0.015, 0.025, 0.03, ac, 12), 0, 0.2 - i * 0.02, 0.1 + z + 0.18))); g.add(at(ell(0.34, 0.03, 0.16, ac, 20), 0, -0.04, 0.12)).rotation.x = 0.0; }
    if (v === 2) { const st = ell(0.36, 0.045, 0.06, ac, 20); at(st, 0, 0.12, 0.18); g.add(st); const bt = ell(0.07, 0.07, 0.04, gloss(0xffe066), 14); at(bt, 0.3 * (sd || 1) * 0.0 + 0.0, 0.14, 0.24); g.add(bt); const rb1 = ell(0.1, 0.06, 0.04, ac, 16); at(rb1, -0.1, 0.24, 0.42); rb1.rotation.z = 0.5; g.add(rb1); const rb2 = ell(0.1, 0.06, 0.04, ac, 16); at(rb2, 0.1, 0.24, 0.42); rb2.rotation.z = -0.5; g.add(rb2); g.add(at(ell(0.05, 0.05, 0.05, ac, 12), 0, 0.23, 0.42)); }
    if (v === 3) { [0.0, 0.14].forEach(y => { const lc = ell(0.22, 0.02, 0.03, ac, 12); at(lc, 0, 0.08 + y, 0.26 - y * 0.2); g.add(lc); }); const star = ell(0.07, 0.07, 0.025, ac, 5); at(star, 0.37 * (sd || 1), H * 0.4, 0.0); star.rotation.y = Math.PI / 2 * 0.0; g.add(star); }
    return g;
  }
  // ═════ 아기하마 ═════
  function buildHippo(o) {
    o = o || {}; const root = new T.Group(), P = {}; P.eyes = [];
    const skin = plush(0xeba3c8, { sheenColor: new T.Color(0xffd0e6), roughness: 0.72, bumpScale: 0.35 }), skinL = plush(0xf8cfe2, { sheenColor: new T.Color(0xffffff), roughness: 0.7, bumpScale: 0.3 });
    const inner = soft(0xf1a7c0, { roughness: 0.6 }), nostril = soft(0x9a5f86, { roughness: 0.6 }), nail = soft(0xfff1dc, { roughness: 0.4 });
    const body = new T.Group(); root.add(body); P.body = body;
    const torso = ell(1.12, 0.98, 0.98, skin); at(torso, 0, 0.95, -0.05); torso.rotation.x = -0.06; body.add(torso);
    const belly = ell(0.82, 0.74, 0.46, skinL); at(belly, 0, 0.82, 0.55); belly.rotation.x = -0.08; body.add(belly);
    const upper = new T.Group(); root.add(upper); P.upper = upper; body.parent.remove(body); upper.add(body);
    const head = new T.Group(); head.position.set(0, 2.12, 0.1); head.rotation.z = 0.04; upper.add(head); P.head = head;
    const HH = [1.26, 1.02, 1.06];
    head.add(ell(HH[0], HH[1], HH[2], skin, 64));
    const hz = (x, y, p) => surfZ(HH[0], HH[1], HH[2], 0, 0, 0, x, y, p || 0);
    // 아기 하마 주둥이: 폭이 넓고 납작하게 동그란 '베개' 모양(하마다운 특징) — 대신 작고 폭신하게 얼굴에 붙인다
    const MZ = [0.8, 0.43, 0.5, 0, -0.4, 0.82];
    const mz = ell(MZ[0], MZ[1], MZ[2], skinL, 56); at(mz, MZ[3], MZ[4], MZ[5]); head.add(mz);
    // 콧구멍: 하마의 코 언덕 위 동그란 점 둘
    [-1, 1].forEach(sd => { const x = 0.27 * sd, y = -0.12, z = surfZ(MZ[0], MZ[1], MZ[2], MZ[3], MZ[4], MZ[5], x, y, 0.0);
      const mound = ell(0.15, 0.1, 0.08, skinL, 24); at(mound, x, y - 0.0, z - 0.02); head.add(mound);
      const n = ell(0.075, 0.055, 0.03, nostril, 20); at(n, x, y + 0.01, z + 0.05); n.rotation.x = 0.3; head.add(n); });
    // 눈: 크고 동그란 눈 + 눈두덩 살짝(하마 느낌) — 얼굴 가운데 위쪽, 넓게
    [-1, 1].forEach(sd => { const x = 0.62 * sd, y = 0.16;
      // 눈두덩 없음 — 눈은 얼굴 표면에 살짝 박아 납작하게 붙인다
      P.eyes.push(eye(head, x, y, hz(x, y) - 0.115, 0.2, 1.0, [0, 0.38 * sd, 0], 0x4a2a3a, 0.14, sd)); });
    // 귀(작고 동글)
    P.ears = [];
    [-1, 1].forEach(sd => {
      const g = new T.Group(); g.position.set(0.86 * sd, 0.84, -0.1); g.rotation.set(0, 0, -0.55 * sd); head.add(g);
      g.add(ell(0.27, 0.29, 0.17, skin, 32));
      const inn = ell(0.16, 0.17, 0.08, inner, 24); inn.position.set(0, 0.0, 0.11); g.add(inn); P.ears.push(g);
    });
    // 입: 작은 'ᴗ' 웃음 + 인중 + 살짝 보이는 분홍 혀(이빨은 뺀다)
    const mc = 0x8a4a62;
    P.mouth = new T.Group(); head.add(P.mouth); P.mouthOpen = new T.Group(); P.mouthOpen.visible = false; head.add(P.mouthOpen);
    { const mz = surfZ(MZ[0], MZ[1], MZ[2], MZ[3], MZ[4], MZ[5], 0, -0.4, 0.0); const om = ell(0.2, 0.13, 0.06, soft(0x6a2540, { roughness: 0.5 }), 24); at(om, 0, -0.4, mz + 0.01); P.mouthOpen.add(om); const ot = ell(0.12, 0.07, 0.04, soft(0xff8fb0, { roughness: 0.4 }), 20); at(ot, 0, -0.45, mz + 0.045); P.mouthOpen.add(ot); }
    smile(P.mouth, MZ, [[0, -0.22], [0, -0.3]], 0.016, mc, 0.008);
    smile(P.mouth, MZ, [[-0.36, -0.3], [-0.24, -0.42], [-0.1, -0.4], [0, -0.3]], 0.017, mc, 0.008);
    smile(P.mouth, MZ, [[0.36, -0.3], [0.24, -0.42], [0.1, -0.4], [0, -0.3]], 0.017, mc, 0.008);
    const tg = ell(0.075, 0.05, 0.03, soft(0xff8fb0, { roughness: 0.4 }), 20); at(tg, 0, -0.45, surfZ(MZ[0], MZ[1], MZ[2], MZ[3], MZ[4], MZ[5], 0, -0.45, 0.0)); P.mouth.add(tg);
    blush(head, -0.98, -0.2, 0.72, 0.5, -1.0, '#ff6f95'); blush(head, 0.98, -0.2, 0.72, 0.5, 1.0, '#ff6f95');
    // 머리 위 데이지 꽃
    const fl = new T.Group(); fl.position.set(0.7, 0.92, 0.18); fl.rotation.set(0.5, 0.0, -0.4); head.add(fl);
    const pm = soft(0xffffff, { roughness: 0.45, emissive: 0xffffff, emissiveIntensity: 0.35 });
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, pe = ell(0.09, 0.2, 0.04, pm, 20); pe.position.set(Math.cos(a) * 0.2, Math.sin(a) * 0.2, 0); pe.rotation.z = a - Math.PI / 2; fl.add(pe); }
    const ct = ell(0.12, 0.12, 0.07, soft(0xffc93c, { roughness: 0.45 }), 24); ct.position.set(0, 0, 0.04); fl.add(ct);
    // 팔: 어깨 피벗(자세는 RIG.pose)
    function arm(sd) {
      const g = new T.Group(); g.position.set(0.98 * sd, 1.38, 0.2); body.add(g);
      const a = ell(0.28, 0.46, 0.28, skin, 32); a.position.set(0, -0.24, 0); g.add(a);
      const paw = new T.Group(); paw.position.set(0, -0.58, 0.06); g.add(paw); g.userData.paw = paw;
      paw.add(ell(0.3, 0.28, 0.28, skin, 32));
      [-1, 0, 1].forEach(k => { const n = ell(0.055, 0.05, 0.04, nail, 14); n.position.set(0.1 * k, -0.12, 0.2); paw.add(n); });
      return g;
    }
    P.armL = arm(-1); P.armR = arm(1);
    // 다리 + 신발(o.shoe: 0..3)
    P.legs = []; P.feet = []; P.pads = [];
    [-1, 1].forEach(sd => {
      const g = new T.Group(); g.position.set(0.55 * sd, 0.33, 0.12); body.add(g); P.legs.push(g);
      g.add(at(ell(0.44, 0.42, 0.42, skin, 36), 0, -0.3, 0));
      const f = new T.Group(); f.position.set(0, -0.66, 0); g.add(f); P.feet.push(f);
      { const sg = shoe(o.shoe || 0, sd); sg.scale.setScalar(1.3); f.add(at(sg, 0, 0.05, 0.16)); }
    });
    // 짧고 동글동글 말린 꼬리 (옆에서 보면 돼지꼬리처럼 한 바퀴 말림)
    {
      const tg = new T.Group(); at(tg, 0, 0.5, -0.92); body.add(tg); P.tail = tg;
      const base = ell(0.2, 0.2, 0.18, skin, 24); at(base, 0, -0.02, 0.08); tg.add(base);
      const pts = [], N = 40, R0 = 0.27, yc = 0.26;
      for (let i = 0; i <= N; i++) { const t = i / N, a = t * Math.PI * 2.35, R = R0 - 0.15 * t; pts.push([0, yc + R * Math.sin(a), -(R0 - R * Math.cos(a)) + 0.05]); }
      tg.add(tube(pts, 0.1, skin, 80));
      const tip = ell(0.115, 0.115, 0.115, skin, 20); tip.position.set(0, pts[N][1], pts[N][2]); tg.add(tip);
    }
    // 킁킁 맡는 꽃 한 송이(평소엔 숨김): 왼팔 손바닥에 달리고 RIG.pose 가 곧게 세운다
    { const fh = new T.Group(); fh.visible = false; at(fh, 0, -0.05, 0.28); P.armL.userData.paw.add(fh); P.flowerHold = fh;
      const st = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 0.8, 10), gloss(0x66c27a, { roughness: 0.4 })); st.position.y = 0.3; sh(st); fh.add(st);
      const d = daisy(1.5, 0xffffff); d.position.y = 0.72; d.rotation.x = Math.PI / 2 - 0.35; fh.add(d); }
    // 잘 때 안는 꽃다발(평소엔 숨김)
    { const bq = new T.Group(); bq.visible = false; at(bq, 0.0, 0.5, 1.05); bq.scale.setScalar(1.3); body.add(bq); P.bouquet = bq;
      const stem = gloss(0x66c27a, { roughness: 0.4 }), cols = [0xffffff, 0xffe066, 0xffb3d1];
      [[-0.2, 0.05, -0.15], [0.0, 0.0, 0.0], [0.2, 0.08, 0.15]].forEach((q, i) => {
        const st = new T.Mesh(new T.CylinderGeometry(0.025, 0.025, 1.0, 10), stem); st.position.set(q[0] * 0.6, -0.1, 0.0); st.rotation.z = q[2] * 0.5; sh(st); bq.add(st);
        const fl2 = daisy(1.5, cols[i]); fl2.position.set(q[0] + q[2] * 0.2, 0.46 + q[1], 0.05); fl2.rotation.x = Math.PI / 2 - 0.2; fl2.rotation.z = q[2] * 0.4; bq.add(fl2); });
      const rb = ell(0.13, 0.07, 0.07, gloss(0xff7fb0), 16); at(rb, 0, -0.3, 0.05); bq.add(rb); }
    root.userData.P = P; root.userData.kind = 'hippo';
    return finish(root);
  }

  // ═════ 자세(RIG) ═════
  // spec 으로 모든 관절을 한 번에 정한다. 앞(+z)을 향한 모델이라 걷기/포즈는 렌더러가 몸 전체를 돌려 3/4 로 보인다.
  const GY = { panda: 0.54, hippo: 0.7 };
  const base = (k) => ({ uy: GY[k], ux: 0, urx: 0, ury: 0, urz: 0, hrx: 0, hry: 0, hrz: 0, hy: 0, lL: [0, 0], lR: [0, 0], lyL: 0, lyR: 0, aL: [0, 0, 0], aR: [0, 0, 0], eyes: 'open', mouth: 'smile', bt: 0, tz: 0, bs: [1, 1, 1], ground: true, lift: 0, ear: 0 });
  function pose(root, sp) {
    const P = root.userData.P, k = root.userData.kind; sp = Object.assign(base(k), sp || {});
    P.upper.position.set(sp.ux, sp.uy, 0); P.upper.rotation.set(sp.urx, sp.ury, sp.urz); P.body.scale.set(sp.bs[0], sp.bs[1], sp.bs[2]);
    P.head.rotation.set(sp.hrx, sp.hry, sp.hrz + (k === 'panda' ? -0.05 : 0.04));
    P.legs[0].rotation.set(sp.lL[0], 0, sp.lL[1]); P.legs[1].rotation.set(sp.lR[0], 0, sp.lR[1]);
    P.legs[0].position.y = 0.33 + sp.lyL; P.legs[1].position.y = 0.33 + sp.lyR;
    const sitting = sp.lL[0] < -1.0; P.feet.forEach((f, i) => { f.rotation.x = sitting ? 0 : -P.legs[i].rotation.x * 0.85; }); P.pads.forEach(m => { m.visible = sitting; });
    P.armL.rotation.set(sp.aL[0], sp.aL[2], sp.aL[1]); P.armR.rotation.set(sp.aR[0], sp.aR[2], sp.aR[1]);
    if (P.bambooWrap) { const h = P.bambooWrap.parent, r = h.rotation; P.bambooWrap.rotation.order = 'ZYX'; P.bambooWrap.rotation.set(-r.x, -r.y, -r.z); P.bamboo.rotation.set(sp.btx || 0, 0, sp.bt); P.stalk.scale.set(1, sp.sk || 1, 1); P.stalk.position.y = sp.sk ? (1 - sp.sk) * 0.6 : 0; }
    if (P.flowerHold) { const h = P.armL, r = h.rotation, w = P.flowerHold; w.visible = !!sp.flower; w.rotation.order = 'ZYX'; w.rotation.set(-r.x - P.armL.userData.paw.rotation.x, -r.y, -r.z); }
    P.eyes.forEach(e => setEye(e, sp.eyes));
    P.mouth.visible = sp.mouth !== 'open'; P.mouthOpen.visible = sp.mouth === 'open';
    P.tail.rotation.z = sp.tz;
    if (P.ears) P.ears.forEach((e, i) => { e.rotation.x = sp.ear; });
    root.position.y = 0; root.updateMatrixWorld(true);
    if (sp.ground) { const b = new T.Box3(); P.legs.forEach(l => b.expandByObject(l)); root.position.y = -b.min.y; }
    root.position.y += sp.lift; root.updateMatrixWorld(true);
    return root;
  }
  // 걷기 한 걸음(ph 0..1): 두 발이 번갈아 구르고 몸이 좌우로 뒤뚱, 반대쪽 팔이 흔들린다
  function walkSpec(kind, ph) {
    const a = ph * Math.PI * 2, s = Math.sin(a), c = Math.cos(a), sp = {};
    sp.lL = [-0.52 * s, 0]; sp.lR = [0.52 * s, 0]; sp.lyL = 0.12 * Math.max(0, c); sp.lyR = 0.12 * Math.max(0, -c);
    sp.urz = 0.055 * s; sp.ury = 0.09 * s; sp.urx = 0.04 - 0.02 * Math.abs(c); sp.ux = 0.03 * s;
    sp.hrz = -0.05 * s; sp.hry = -0.08 * s; sp.hrx = 0.03 * Math.abs(s);
    sp.tz = 0.35 * Math.sin(a * 2); sp.ear = 0.1 * Math.sin(a * 2 + 1);
    if (kind === 'panda') { sp.aL = [-1.15, -0.12, 0.1]; sp.aR = [-0.5 * s, 0.3, 0]; sp.bt = 0.04 * Math.sin(a * 2); }
    else { sp.aL = [0.5 * s, -0.1, 0]; sp.aR = [-0.5 * s, 0.1, 0]; }
    return sp;
  }
  const NAMES = ['sit', 'sleep', 'happy', 'shiver', 'pant', 'squint', 'x1', 'x2'];
  function poseSpec(kind, n) {
    const sit = { lL: [-1.52, -0.14], lR: [-1.52, 0.14], urx: -0.1, hrx: 0.02 }, P = kind === 'panda';
    const hug = P ? { aL: [-1.15, -0.2, 0.1], aR: [-0.75, 0.55, 0] } : { aL: [-0.7, 0.3, 0], aR: [-0.7, -0.3, 0] };
    const rest = P ? { aL: [-0.95, -0.2, 0.1], aR: [-0.75, 0.35, 0] } : { aL: [-0.5, -0.25, 0], aR: [-0.5, 0.25, 0] };
    if (n === 'sit') return Object.assign({}, sit, rest);
    if (n === 'sleep') return Object.assign({}, sit, hug, { eyes: 'closed', hrz: 0.28, hrx: 0.22, hy: 0 });
    if (n === 'happy') return P ? { lL: [-0.45, -0.3], lR: [0.2, 0.3], aL: [0, -2.6, 0], aR: [-0.2, 2.5, 0], eyes: 'happy', mouth: 'open', hrz: 0.1, lift: 0.4, ground: false, bt: -0.05, uy: GY.panda - 0.12 } : { lL: [-0.45, -0.3], lR: [0.2, 0.3], aL: [0, -2.5, 0], aR: [0, 2.5, 0], eyes: 'happy', mouth: 'open', hrz: 0.1, lift: 0.4, ground: false };
    if (n === 'shiver') return Object.assign({}, P ? { aL: [-1.2, 0.5, 0.3], aR: [-1.1, -0.5, -0.3] } : { aL: [-1.0, 0.7, 0.2], aR: [-1.0, -0.7, -0.2] }, { eyes: 'squint', bs: [1.04, 0.95, 1.04], hrz: -0.18, hrx: 0.15, lL: [-0.12, 0.06], lR: [-0.12, -0.06] });
    if (n === 'pant') return Object.assign({}, sit, rest, { mouth: 'open', hrz: 0.12, hrx: -0.08, urx: 0.12, eyes: 'open' });
    if (n === 'x1') return P ? Object.assign({}, sit, { aL: [-1.5, 0.5, 0.0], aR: [-0.75, 0.35, 0], eyes: 'happy', hrx: 0.28, hrz: 0.04, bt: -0.8, btx: 0.5, sk: 0.5, mouth: 'smile' }) : Object.assign({}, sit, { aL: [-1.45, 0.5, 0.0], aR: [-0.5, 0.25, 0], flower: true, eyes: 'closed', hrx: 0.12, hrz: 0.1 });
    if (n === 'x2') return P ? Object.assign({}, sit, { aL: [-1.5, 0.5, 0.0], aR: [-0.75, 0.35, 0], eyes: 'happy', hrx: 0.2, hrz: 0.04, bt: -0.8, btx: 0.5, sk: 0.5, mouth: 'open' }) : { lL: [-1.0, -0.1], lR: [0.0, 0.05], urx: -0.1, aL: [0, -0.9, 0], aR: [0, 0.9, 0], eyes: 'happy', mouth: 'open', hrz: 0.12 };
    if (n === 'squint') return Object.assign({}, P ? { aL: [-2.55, -0.35, 0.2], aR: [-0.3, 0.3, 0] } : { aL: [-2.5, -0.3, 0.2], aR: [-0.3, 0.3, 0] }, { eyes: 'squint', hrz: 0.12, hrx: -0.1, lL: [-0.06, -0.05], lR: [0.06, 0.05] });
    return {};
  }

  // ═════ 자는 장면 ═════
  // 판다: 잎 방석 위에 옆으로 누워 긴 대나무를 끌어안고 잔다. 히포: 꽃 침대에서 작은 꽃다발을 안고, 신발을 신은 채 잔다.
  function daisy(sc, col) {
    const g = new T.Group(), pm = soft(col || 0xffffff, { roughness: 0.45, emissive: col || 0xffffff, emissiveIntensity: 0.25 });
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, pe = ell(0.07, 0.17, 0.03, pm, 14); pe.position.set(Math.cos(a) * 0.16, 0.0, Math.sin(a) * 0.16); pe.rotation.set(0, -a, Math.PI / 2); pe.rotation.order = 'YZX'; g.add(pe); }
    const c = ell(0.1, 0.05, 0.1, soft(0xffc93c, { roughness: 0.45 }), 16); c.position.y = 0.03; g.add(c); g.scale.setScalar(sc || 1); return g;
  }
  function buildSleep(kind, o) {
    o = o || {}; const root = new T.Group(), P = {};
    const m = kind === 'panda' ? window.FRIENDS.panda({ bb: 'R', bamLen: 2 }) : window.FRIENDS.hippo({ shoe: o.shoe === undefined ? 0 : o.shoe });
    const pivot = new T.Group(); pivot.add(m); root.add(pivot);
    // 받침(방석/침대)
    if (kind === 'panda') {
      const mat = plush(0x9ed98a, { sheenColor: new T.Color(0xe8ffd8), roughness: 0.9 }), rim = plush(0x6fbf68, { roughness: 0.9 });
      const bed = ell(2.2, 0.3, 1.75, mat, 48); at(bed, 0, 0.12, 0); root.add(bed);
      const rg = new T.Mesh(new T.TorusGeometry(1.7, 0.16, 18, 64), rim); rg.rotation.x = Math.PI / 2; rg.scale.set(1.18, 1.0, 0.95); at(rg, 0, 0.3, 0); sh(rg); root.add(rg);
      const lm = gloss(0x66c27a, { roughness: 0.35, clearcoat: 0.5 });
      for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2, lf = ell(0.1, 0.02, 0.34, lm, 14); lf.position.set(Math.cos(a) * 2.3, 0.34, Math.sin(a) * 1.85); lf.rotation.y = -a + Math.PI / 2 + 0.3; lf.rotation.z = 0.2; root.add(lf); }
      const pil = ell(0.9, 0.34, 0.7, plush(0xfff3e4), 36); at(pil, -1.0, 0.58, 0.1); root.add(pil);
    } else {
      const bed = ell(2.2, 0.34, 1.75, plush(0xfff0f6, { sheenColor: new T.Color(0xffffff) }), 48); at(bed, 0, 0.15, 0); root.add(bed);
      const rg = new T.Mesh(new T.TorusGeometry(1.7, 0.18, 18, 64), plush(0xffc2da, { roughness: 0.85 })); rg.rotation.x = Math.PI / 2; rg.scale.set(1.18, 1.0, 0.95); at(rg, 0, 0.32, 0); sh(rg); root.add(rg);
      const cols = [0xffffff, 0xffe066, 0xffb3d1, 0xffffff, 0xcdb8ff];
      for (let i = 0; i < 17; i++) { const a = i / 17 * Math.PI * 2 + 0.2, f = daisy(1.15 + (i % 3) * 0.1, cols[i % cols.length]); at(f, Math.cos(a) * 2.25, 0.52, Math.sin(a) * 1.8); f.rotation.x = 0.3; root.add(f); }
      const pil = ell(0.9, 0.36, 0.7, plush(0xffd6e8), 36); at(pil, -1.0, 0.62, 0.1); root.add(pil);
      const sd = daisy(1.5, 0xffffff); at(sd, -1.7, 0.7, 0.8); root.add(sd);
    }
    root.userData = { P, kind, pivot, m };
    return root;
  }
  // ph: 0..1 숨쉬기. 누운 자세: 몸을 옆으로 눕힌다(머리가 왼쪽)
  function sleepPose(root, ph) {
    const { kind, pivot, m } = root.userData, a = Math.sin(ph * Math.PI * 2), PP = m.userData.P;
    const P = kind === 'panda';
    pose(m, Object.assign(poseSpec(kind, 'sleep'), { ground: false, uy: GY[kind] }, P ? { aL: [-1.25, -0.2, 0.1], aR: [-1.3, 0.3, 0], hrz: 0.1, hrx: 0.1, lL: [-0.5, -0.1], lR: [-0.75, 0.1] } : { aL: [-1.05, 0.3, 0], aR: [-1.1, -0.3, 0], hrz: 0.1, hrx: 0.1, lL: [-0.5, -0.1], lR: [-0.75, 0.1] }, { bs: [1 + 0.012 * a, 1 + 0.03 * a, 1 + 0.012 * a], ear: 0.05 * a }));
    if (P) { PP.body.add(PP.bambooWrap); PP.bambooWrap.rotation.set(0, 0, 0); PP.bambooWrap.position.set(0.0, 0.3, 1.1); PP.bamboo.rotation.set(0, 0, 0); PP.bamboo.scale.set(1, 1.0, 1); PP.bamboo.position.y = 0.0; }
    else { PP.bouquet.visible = true; }
    pivot.rotation.set(0, 0, 0); m.scale.setScalar(0.88); m.rotation.set(0, 0, Math.PI / 2); m.position.set(0, 0, 0); root.updateMatrixWorld(true);
    // 바닥 접촉: 대나무·꽃다발을 뺀 몸으로 잰다
    const hid = P ? PP.bambooWrap : PP.bouquet, hv = hid.visible; hid.visible = false;
    const b = new T.Box3(); [PP.head, PP.body, ...PP.legs].forEach(o => b.expandByObject(o)); hid.visible = hv;
    m.position.y = (P ? 0.5 : 0.55) - b.min.y; m.position.x = 1.0; m.position.z = 0.05;
    root.updateMatrixWorld(true);
  }
  window.RIG = { pose, walkSpec, poseSpec, setEye, NAMES, SHOE_NAMES, GY, buildSleep, sleepPose };
  window.FRIENDS = { panda: buildPanda, hippo: buildHippo };
})();

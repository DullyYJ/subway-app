// 길동무 위젯 '자는 장면' 6종 — 소품과 잠든 캐릭터를 한 칸에 그린다(2026-10-27 YJ: "잠자는 공간인데 몸이 다 나와있어 · 캐릭터별 자는 모습의 특징").
//   고양이=캣타워 위 / 올챙이=물웅덩이(몸은 안 보임) / 독수리=나뭇가지에 매달려 / 비숑=솜사탕처럼 웅크림 / 푸들=엎드림 / 두더지=흙집.
//   SCENES[id] = { view:[칸 너비(단위), 가운데 높이, 가운데 x], el:카메라 내려다보는 각, build(), frame(root, ph) }  ph = 0..1 한 바퀴(16프레임 반복).
(function () {
  const T = THREE, M = window.M3, mat = M.mat, ell = M.ell, sh = M.sh, glossy = M.glossy;
  const TAU = Math.PI * 2, S = (ph, k, off) => Math.sin(ph * TAU * (k || 1) + (off || 0));
  const cyl = (rt, rb, h, m, seg) => sh(new T.Mesh(new T.CylinderGeometry(rt, rb, h, seg || 32), m));
  const box = (w, h, d, m) => sh(new T.Mesh(new T.BoxGeometry(w, h, d), m));
  window.SCENES = {};

  // ═════ 고양이: 캣타워 꼭대기 쿠션에서 잔다 ═════
  SCENES.lovel = {
    anchor: [0.5, 1.75, 0.3],
    view: [3.4, 1.05, 0], el: 0.34,
    build() {
      const g = new T.Group(), carpet = mat(0xd7bd92, { roughness: 1 }), carpet2 = mat(0xc4a574, { roughness: 1 }), sisal = mat(0xc9ad7a, { roughness: 1 }), rope = mat(0xa98a57, { roughness: 1 });
      const U = {}; g.userData = U;
      // 바닥판
      const base = cyl(0.95, 0.98, 0.14, carpet2, 44); base.position.y = 0.07; g.add(base);
      // 기둥(밧줄 감긴)
      const post = cyl(0.17, 0.17, 1.12, sisal, 28); post.position.y = 0.14 + 0.56; g.add(post);
      for (let i = 0; i < 14; i++) { const t = new T.Mesh(new T.TorusGeometry(0.172, 0.022, 8, 28), rope); t.rotation.x = Math.PI / 2; t.position.y = 0.22 + i * 0.075; g.add(sh(t)); }
      // 꼭대기 판 + 분홍 쿠션
      const top = cyl(0.9, 0.9, 0.13, carpet, 48); top.position.y = 1.26 + 0.065; g.add(top);
      const rim = new T.Mesh(new T.TorusGeometry(0.9, 0.065, 14, 52), mat(0xc4a574, { roughness: 1 })); rim.rotation.x = Math.PI / 2; rim.position.y = 1.325; g.add(sh(rim));
      const cush = ell(0.78, 0.15, 0.78, mat(0xf6bfcc, { roughness: 1 }), 36); cush.position.y = 1.43; g.add(cush); U.cushY = 1.52;
      // 옆 낮은 발판(캣타워 느낌)
      const arm = box(0.8, 0.1, 0.22, carpet2); arm.position.set(-0.55, 0.62, 0); g.add(arm);
      const step = cyl(0.42, 0.42, 0.1, carpet, 36); step.position.set(-0.98, 0.7, 0); g.add(step);
      // 매달린 장난감 공(가장자리 끈 끝에서 살랑)
      const toy = new T.Group(); toy.position.set(0.78, 1.2, 0.3); g.add(toy);
      const st = cyl(0.012, 0.012, 0.5, mat(0xe9dcc0), 6); st.position.y = -0.25; toy.add(st);
      const ball = ell(0.11, 0.11, 0.11, glossy(0xe28a84, { roughness: 0.5 }), 22); ball.position.y = -0.55; toy.add(ball); U.toy = toy;
      // 잠든 고양이
      const cat = CHARS.lovel.build(); cat.userData._m = 1; U.cat = cat; g.add(cat); cat.position.set(-0.05, 0, 0.0); cat.rotation.y = 0.15; cat.scale.setScalar(0.82);
      g.rotation.y = -0.7; return g;
    },
    frame(g, ph) {
      const U = g.userData, cat = U.cat, P = cat.userData;
      M.poseCat(cat, 0.1);
      cat.position.y = U.cushY - 0.25 * 0.82;
      P.body.position.y = 0.62 - 0.02 * S(ph, 1); P.body.scale.set(1 + 0.012 * S(ph, 1), 1 + 0.03 * S(ph, 1), 1 + 0.02 * S(ph, 1)); P.body.rotation.set(0, 0, 0);
      // 앞발은 앞으로 모아 턱을 받치고 뒷발은 몸 밑에 접는다
      P.legs.forEach((lg, i) => { if (i < 2) M.setLeg(lg, 1.32, 0.0, 0.2, 0.9); else M.setLeg(lg, 1.0, 1.0, 2.4, 0.9); });
      P.head.position.set(0.58, 0.1 + 0.012 * S(ph, 1), 0.0); P.head.rotation.set(0, 0.0, -0.42);
      P.ears.forEach((e, i) => { e.rotation.z = 0.35 + 0.02 * S(ph, 1, i); e.rotation.x = (i ? 1 : -1) * 0.22; });
      M.setFace(cat, 'closed');
      // 꼬리: 몸 옆을 감싸 앞발 쪽으로 돌아온다 (끝이 천천히 까딱)
      const base = [[0, -0.0, 0], [-0.18, -0.12, 0.08], [-0.34, -0.2, 0.3], [-0.2, -0.24, 0.5], [0.12, -0.25, 0.58], [0.46, -0.25, 0.52], [0.7, -0.26, 0.4]];
      const cr = new T.CatmullRomCurve3(base.map((b, i) => { const w = i / (base.length - 1); return new T.Vector3(b[0], b[1] + 0.03 * w * S(ph, 1, w * 2), b[2] + 0.04 * w * S(ph, 1, 1 + w * 3)); }), false, 'catmullrom', 0.5);
      const pts = [], rad = [], N = 16; for (let i = 0; i <= N; i++) { const u = i / N; pts.push(cr.getPoint(u)); rad.push(0.115 - 0.05 * u * u - 0.015 * u); }
      P.tailMesh.geometry.dispose(); P.tailMesh.geometry = M.tubeGeo(pts, rad, 16); P.tailTip.position.copy(pts[N]); P.tailTip.scale.setScalar(rad[N]);
      // 공 흔들
      U.toy.rotation.z = 0.12 * S(ph, 1, 0.8); U.toy.rotation.x = 0.06 * S(ph, 1, 2.0);
    }
  };

  // ═════ 올챙이: 몸은 물속 — 물웅덩이에 동그라미(물결)와 방울만 올라온다 ═════
  SCENES.chaeng = {
    anchor: [0.0, 0.25, 0.0],
    view: [3.0, 0.2, 0], el: 0.5,
    build() {
      const g = new T.Group(), U = {}; g.userData = U;
      // 진흙 둑
      const mudM = mat(0x7a5a3a, { roughness: 1 }), mud = new T.Mesh(new T.TorusGeometry(1.08, 0.13, 14, 56), mudM); mud.rotation.x = Math.PI / 2; mud.scale.set(1, 1, 0.5); mud.position.y = 0.08; g.add(sh(mud));
      const R = M.rng(9);
      for (let i = 0; i < 16; i++) { const a = i / 16 * TAU + R() * 0.2, rr = 1.05 + R() * 0.08, c = ell(0.14 + R() * 0.08, 0.1, 0.14 + R() * 0.08, mat(i % 3 ? 0x86643f : 0x6b4d30, { roughness: 1 }), 10); c.position.set(Math.cos(a) * rr, 0.1, Math.sin(a) * rr * 0.95); g.add(c); }
      // 물: 가운데가 밝은 방사 그라데이션
      const cv = document.createElement('canvas'); cv.width = cv.height = 256; const x = cv.getContext('2d'), gr = x.createRadialGradient(128, 128, 10, 128, 128, 128);
      gr.addColorStop(0, '#a6e3fb'); gr.addColorStop(0.55, '#6fc3ee'); gr.addColorStop(1, '#3f93cc'); x.fillStyle = gr; x.fillRect(0, 0, 256, 256);
      const wt = new T.CanvasTexture(cv); wt.colorSpace = T.SRGBColorSpace;
      const water = new T.Mesh(new T.CircleGeometry(0.98, 64), new T.MeshStandardMaterial({ map: wt, roughness: 0.15, metalness: 0.0, emissive: 0x2a6fa0, emissiveIntensity: 0.25 })); water.rotation.x = -Math.PI / 2; water.position.y = 0.05; water.receiveShadow = true; g.add(water);
      // 물결 고리 3겹
      U.rings = []; for (let i = 0; i < 3; i++) { const rg = new T.Mesh(new T.RingGeometry(0.94, 1.0, 64), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0, side: T.DoubleSide, depthWrite: false })); rg.rotation.x = -Math.PI / 2; rg.position.y = 0.065; g.add(rg); U.rings.push(rg); }
      // 방울(올라와 톡 터진다)
      U.bub = []; const bm = new T.MeshStandardMaterial({ color: 0xffffff, emissive: 0xcfeeff, emissiveIntensity: 0.9, transparent: true, opacity: 0.9, roughness: 0.2 });
      for (let i = 0; i < 3; i++) { const b = ell(0.09, 0.09, 0.09, bm, 14); b.castShadow = false; g.add(b); U.bub.push(b); }
      // 연잎 + 풀잎
      const lily = cyl(0.3, 0.3, 0.03, mat(0x6fbf6a, { roughness: 0.8 }), 28); lily.position.set(0.55, 0.075, -0.35); g.add(lily);
      const notch = box(0.3, 0.05, 0.08, new T.MeshBasicMaterial({ color: 0x4f9fcc })); notch.position.set(0.7, 0.08, -0.35); notch.rotation.y = -0.2; g.add(notch);
      const bl = mat(0x58a85a, { roughness: 0.9 });
      [[-1.0, 0.1, 0.5], [-1.15, 0.1, 0.2], [1.05, 0.1, 0.45], [0.9, 0.1, 0.75], [-0.4, 0.1, -1.05]].forEach((p, k) => {
        for (let j = 0; j < 4; j++) { const h = 0.45 + R() * 0.35, b = new T.Mesh(new T.ConeGeometry(0.05, h, 5), bl); b.position.set(p[0] + (j - 1.5) * 0.07, h / 2 + 0.05, p[2] + R() * 0.1); b.rotation.z = (R() - 0.5) * 0.5; b.rotation.x = (R() - 0.5) * 0.4; g.add(sh(b)); }
      });
      // 작은 돌
      [[0.95, 0.14, -0.55, 0.16], [-0.85, 0.12, -0.7, 0.13], [0.2, 0.12, 1.1, 0.14]].forEach(q => { const s0 = ell(q[3], q[3] * 0.7, q[3] * 0.9, mat(0xa9a59d, { roughness: 1 }), 12); s0.position.set(q[0], q[1], q[2]); g.add(s0); });
      return g;
    },
    frame(g, ph) {
      const U = g.userData;
      U.rings.forEach((rg, i) => { const k = (ph * 1 + i / 3) % 1, sc = 0.18 + 0.82 * k; rg.scale.set(sc, sc, 1); rg.material.opacity = 0.75 * Math.sin(Math.PI * Math.pow(k, 0.6)) * (1 - k * 0.5); });
      U.bub.forEach((b, i) => { const k = (ph * 1 + i / 3) % 1, a = i * 2.1; b.position.set(Math.cos(a) * 0.22, 0.12 + k * 0.7, Math.sin(a) * 0.2); const sc = k < 0.88 ? (0.45 + 0.9 * k) : 1.4 * (1 - (k - 0.88) / 0.12); b.scale.setScalar(Math.max(0.001, sc * 0.09)); });
    }
  };

  // ═════ 독수리: 큰 나뭇가지에 거꾸로 매달려 날개로 몸을 감싸고 잔다 ═════
  SCENES.sul = {
    anchor: [0.5, 1.15, 0.3],
    view: [3.6, 1.45, -0.1], el: 0.18,
    build() {
      const g = new T.Group(), U = {}; g.userData = U, R = M.rng(21);
      const bark = mat(0x7b5a3c, { roughness: 1, bumpMap: M.furBump(), bumpScale: 2 }), bark2 = mat(0x8b6845, { roughness: 1 });
      // 줄기(왼쪽): 아래가 굵고 위로 가늘어진다
      const TX = -0.95;
      const trunk = sh(new T.Mesh(new T.CylinderGeometry(0.2, 0.34, 2.4, 20), bark)); trunk.position.set(TX, 1.2, 0); trunk.rotation.z = -0.04; g.add(trunk);
      for (let i = 0; i < 4; i++) { const r = new T.Mesh(new T.TorusGeometry(0.3 - i * 0.025, 0.035, 8, 24), bark2); r.rotation.x = Math.PI / 2; r.position.set(TX, 0.35 + i * 0.5, 0); g.add(sh(r)); }
      const root0 = ell(0.5, 0.2, 0.5, bark, 16); root0.position.set(TX, 0.05, 0); g.add(root0);
      // 가지: 줄기 위쪽에서 오른쪽으로 뻗는다
      const bpts = [[TX + 0.05, 2.05], [TX + 0.4, 2.14], [TX + 0.95, 2.16], [TX + 1.5, 2.14], [TX + 1.95, 2.2], [TX + 2.25, 2.3]].map(p => new T.Vector3(p[0], p[1], 0));
      const bc = new T.CatmullRomCurve3(bpts), pts = [], rad = []; for (let i = 0; i <= 24; i++) { const u = i / 24; pts.push(bc.getPoint(u)); rad.push(0.15 - 0.09 * u); }
      const br = sh(new T.Mesh(M.tubeGeo(pts, rad, 14), bark)); g.add(br); U.branchY = 2.13;
      // 잎 덩어리(줄기 위·가지 끝)
      const lm = [mat(0x5fae5a, { roughness: 0.9 }), mat(0x4e9b50, { roughness: 0.9 }), mat(0x72bd62, { roughness: 0.9 })];
      [[TX - 0.05, 2.38, 0.1, 0.5], [TX + 0.35, 2.5, -0.1, 0.4], [TX - 0.5, 2.3, 0.0, 0.36], [TX + 0.55, 2.3, 0.15, 0.32], [TX + 2.0, 2.34, 0.0, 0.3], [TX + 2.3, 2.3, 0.1, 0.24], [TX + 1.75, 2.44, -0.1, 0.23], [TX - 0.05, 2.7, 0.0, 0.3]].forEach((q, i) => { const l = ell(q[3], q[3] * 0.8, q[3], lm[i % 3], 18); l.position.set(q[0], q[1], q[2]); g.add(l); });
      // 늘어진 잎 몇 장(살랑)
      U.leaves = []; for (let i = 0; i < 4; i++) { const lf = ell(0.07, 0.17, 0.03, lm[i % 3], 10); const pv = new T.Group(); pv.position.set(-0.25 + i * 0.42, 2.1, 0.12); lf.position.y = -0.17; pv.add(lf); g.add(pv); U.leaves.push(pv); }
      // 잠든 독수리: 발은 가지에, 몸은 아래로
      const eg = CHARS.sul.build(); U.eg = eg; U.pivot = new T.Group(); U.pivot.position.set(0.45, U.branchY + 0.02, 0.0); g.add(U.pivot); U.pivot.add(eg); eg.scale.setScalar(0.9);
      return g;
    },
    frame(g, ph) {
      const U = g.userData, eg = U.eg, P = eg.userData;
      CHARS.sul.poseX(eg, 'sleep');                         // 날개를 접고 눈을 감은 자세
      eg.rotation.set(0, 0, Math.PI); eg.position.set(0, 0, 0); eg.rotation.y = 0;
      P.head.position.set(0.15, 0.5, 0); P.head.rotation.set(0, 1.0, -0.3 + Math.PI); P.tail.rotation.z = -1.7;
      P.body.scale.set(1 + 0.012 * S(ph, 1), 1 + 0.025 * S(ph, 1), 1 + 0.015 * S(ph, 1));
      U.pivot.rotation.z = 0.035 * S(ph, 1, 0.5);           // 가지에 매달려 천천히 흔들
      U.pivot.rotation.y = -0.55;
      U.leaves.forEach((pv, i) => { pv.rotation.z = 0.12 * S(ph, 1, i * 1.3); });
    }
  };

  // ═════ 강아지 둘 ═════
  function dogScene(id, o) {
    return {
      view: o.view, el: 0.3, anchor: o.anchor,
      build() {
        const g = new T.Group(), U = {}; g.userData = U;
        o.bed(g, U);
        const d = CHARS[id].build(); U.dog = d; g.add(d); d.scale.setScalar(o.sc || 1); U.sc = o.sc || 1;
        g.rotation.y = -0.6; return g;
      },
      frame(g, ph) { o.pose(g.userData, g, ph); }
    };
  }
  // 비숑(돌솜): 솜사탕처럼 동그랗게 웅크린다 — 하늘색 둥근 방석 위
  SCENES.dolsom = dogScene('dolsom', {
    view: [3.0, 0.8, 0.05], sc: 0.75, anchor: [0.3, 1.0, 0.3],
    bed(g, U) {
      const cm = mat(0xa9d3f5, { roughness: 1, bumpMap: M.furBump(), bumpScale: 1.2 });
      const b = ell(1.0, 0.17, 1.0, cm, 44); b.position.y = 0.12; g.add(b);
      const rim = new T.Mesh(new T.TorusGeometry(0.88, 0.14, 16, 52), mat(0xbfe0fa, { roughness: 1, bumpMap: M.furBump(), bumpScale: 1.2 })); rim.rotation.x = Math.PI / 2; rim.position.y = 0.2; g.add(sh(rim));
      U.top = 0.22;
    },
    pose(U, g, ph) {
      const d = U.dog, P = d.userData;
      M.poseDog(d, 0.25, { gait: 1, air: 0 });
      d.position.set(0, U.top - 0.2 * U.sc, 0);
      P.body.position.y = 0.72 + 0.01 * S(ph, 1); P.body.rotation.set(0, 0, 0);
      P.body.scale.set(1.0 + 0.012 * S(ph, 1), 1.0 + 0.03 * S(ph, 1), 1.06 + 0.02 * S(ph, 1));
      P.legs.forEach((lg, i) => M.setLeg(lg, i < 2 ? 1.4 : 1.2, 1.0, 2.6, 0.6));
      // 머리는 앞가슴에 폭 파묻고, 꼬리는 등 위로 말려 올라와 얼굴 쪽으로 덮는다
      P.head.position.set(0.36, 0.2 + 0.01 * S(ph, 1), 0.1); P.head.rotation.set(0.0, 0.0, -0.32);
      P.ears.forEach((e, i) => { e.rotation.z = 0.5; e.rotation.x = (i ? 1 : -1) * 0.25; });
      P.tail.rotation.z = -1.05 + 0.03 * S(ph, 1, 1); P.tail.rotation.x = 0.0;
      M.setFace(d, 'closed');
    }
  });
  // 푸들(뽀푸): 엎드려 앞발에 턱을 괴고 잔다 — 빨간 매트 위
  SCENES.ppopu = dogScene('ppopu', {
    view: [3.3, 0.78, 0.05], sc: 1.0, anchor: [0.5, 0.75, 0.3],
    bed(g, U) {
      const mm = mat(0xcf6a58, { roughness: 1, bumpMap: M.furBump(), bumpScale: 0.8 });
      const m1 = sh(new T.Mesh(new T.BoxGeometry(2.1, 0.1, 1.5), mm)); m1.position.y = 0.05; g.add(m1);
      const m2 = sh(new T.Mesh(new T.BoxGeometry(1.92, 0.115, 1.32), mat(0xe9b08a, { roughness: 1 }))); m2.position.y = 0.055; g.add(m2);
      U.top = 0.11;
    },
    pose(U, g, ph) {
      const d = U.dog, P = d.userData;
      M.poseDog(d, 0.25, { gait: 0.85, air: 0 });
      d.position.set(-0.1, U.top - 0.4, 0);
      P.body.position.y = 0.72; P.body.rotation.set(0, 0, 0); P.body.scale.set(1.0 + 0.01 * S(ph, 1), 1.0 + 0.03 * S(ph, 1), 1.04);
      P.legs.forEach((lg, i) => { if (i < 2) M.setLeg(lg, 1.5, 0.0, 0.2, 0.9); else M.setLeg(lg, 1.1, 1.0, 2.2, 0.8); });
      P.head.position.set(0.55, 0.22 + 0.012 * S(ph, 1), 0.0); P.head.rotation.set(0, 0, -0.12);
      P.ears.forEach((e, i) => { e.rotation.z = 0.4; e.rotation.x = (i ? 1 : -1) * 0.15; });
      P.tail.rotation.z = 0.95 + 0.06 * S(ph, 1, 1); P.tail.rotation.x = 0.0;
      M.setFace(d, 'closed');
    }
  });

  // ═════ 두더지: 직접 쌓은 흙집 — 문턱에 머리만 내밀고 잔다(안전모는 지붕에 걸어 둔다) ═════
  SCENES.dudung = {
    anchor: [0.0, 0.95, 1.2],
    view: [3.3, 0.95, 0], el: 0.28,
    build() {
      const g = new T.Group(), U = {}; g.userData = U, R = M.rng(5);
      const cols = [0x8a5f3a, 0x7a5230, 0x9a6d44, 0x6e4a2c, 0x84583a];
      const dm = i => mat(cols[i % cols.length], { roughness: 1, bumpMap: M.furBump(), bumpScale: 1.5 });
      // 집 몸체: 바닥에서 솟은 둥근 지붕(반구) + 겉에 흙덩이를 층층이 발라 쌓은 모양
      const hemi = sh(new T.Mesh(new T.SphereGeometry(1, 48, 24, 0, TAU, 0, Math.PI / 2), mat(0x7a5231, { roughness: 1, bumpMap: M.furBump(), bumpScale: 2 }))); hemi.scale.set(1.2, 1.08, 1.06); g.add(hemi);
      const tiers = [[18, 1.2, 0.2, 0.27], [16, 1.08, 0.5, 0.27], [14, 0.92, 0.78, 0.26], [11, 0.74, 1.0, 0.25], [8, 0.52, 1.17, 0.23], [5, 0.3, 1.27, 0.21], [1, 0.0, 1.31, 0.22]];
      tiers.forEach((rr, k) => { for (let i = 0; i < rr[0]; i++) {
        const a = rr[0] === 1 ? 0 : i / rr[0] * TAU + k * 0.37 + (R() - 0.5) * 0.12, x = Math.cos(a) * rr[1], z = Math.sin(a) * rr[1] * 0.88;
        if (rr[2] < 0.95 && z > 0.1 && Math.abs(x) < 0.66) continue;                  // 문이 날 자리(앞)는 비운다
        const w = rr[3] * (0.95 + R() * 0.25), c = ell(w * 1.15, w * 0.72, w, dm(i + k), 14); c.position.set(x, rr[2], z); c.rotation.y = -a; c.rotation.z = (R() - 0.5) * 0.3; g.add(c); } });
      // 문: 어두운 아치 + 문틀 흙덩이
      const doorM = new T.MeshBasicMaterial({ color: 0x1b110a });
      const door = new T.Mesh(new T.CircleGeometry(0.58, 36, 0, Math.PI), doorM); door.position.set(0, 0.1, 0.9); g.add(door);
      const dq = box(1.16, 0.12, 0.02, doorM); dq.position.set(0, 0.08, 0.9); g.add(dq);
      for (let i = 0; i <= 10; i++) { const a = i / 10 * Math.PI, c = ell(0.16, 0.14, 0.16, dm(i), 12); c.position.set(Math.cos(a) * 0.66, 0.1 + Math.sin(a) * 0.66, 0.94); g.add(c); }
      // 문턱 흙더미 + 작은 베개
      const sill = ell(0.62, 0.12, 0.34, dm(2), 20); sill.position.set(0, 0.1, 1.12); g.add(sill);
      const pil = ell(0.34, 0.1, 0.22, mat(0xf2d9a0, { roughness: 1 }), 20); pil.position.set(0, 0.2, 1.1); g.add(pil);
      // 지붕 위 안전모
      const mole = CHARS.dudung.build(); const P = mole.userData; U.mole = mole;
      const hat = P.head.children.find(o => o.type === 'Group');
      P.head.remove(hat); hat.position.set(0.35, 1.42, 0.0); hat.rotation.set(0.1, -0.5, -0.3); hat.scale.setScalar(0.9); g.add(hat);
      // 몸은 숨기고 머리만 문턱 베개에 얹는다
      P.body.remove(P.head); P.body.visible = false; g.add(P.head); U.head = P.head; U.mole.visible = true;
      // 삽: 집 옆에 꽂아 둔다
      const sv = new T.Group(); sv.position.set(1.2, 0.0, 0.5); sv.rotation.z = -0.22; g.add(sv);
      const hd = cyl(0.03, 0.03, 1.1, mat(0xa9753f, { roughness: 0.7 }), 8); hd.position.y = 0.6; sv.add(hd);
      const bl = box(0.3, 0.34, 0.04, mat(0x9ea3a6, { metalness: 0.5, roughness: 0.4 })); bl.position.y = 0.08; bl.rotation.y = 0.5; sv.add(bl);
      // 흙 부스러기
      for (let i = 0; i < 7; i++) { const c = ell(0.07 + R() * 0.06, 0.05, 0.07 + R() * 0.05, dm(i), 8); c.position.set(-1.3 + R() * 2.6, 0.04, 0.9 + R() * 0.5); g.add(c); }
      g.scale.setScalar(0.85); return g;
    },
    frame(g, ph) {
      const U = g.userData, h = U.head;
      M.setFace(U.mole, 'closed');
      h.position.set(0.0, 0.44 + 0.012 * S(ph, 1), 1.16); h.scale.setScalar(0.78);
      h.rotation.set(0.0, -1.2, 0.28 + 0.015 * S(ph, 1));
    }
  };
})();

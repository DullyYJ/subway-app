package com.dullyyj.subway;

import static com.dullyyj.subway.SceneUtil.*;

/**
 * 거리 말고 다른 장소의 배경 그림(공원 · 강변 · 학교 앞 · 시장 골목 · 바닷가 · 산길) — YJ(2026-10-25) "홈 화면 주변 배경도 다양한 장소를 랜덤으로".
 * ★ 어느 장소를 보일지는 엔진(/scene 의 look.place)이 정한다. 여기는 받은 이름대로 하늘 · 먼 풍경 · 가까운 풍경 · 바닥을 그릴 뿐이다.
 *   시간대(L.lum 밝기·밤·저녁) · 날씨(비·눈·안개) · 계절 색은 거리 배경(SceneArt.buildBG)과 같은 규칙으로 입힌다.
 * 움직이는 것(물결 · 분수 · 배 · 김 · 흔들리는 등)은 SceneFx 가 이 장소 이름을 보고 앞쪽에서 그린다.
 * android.* 를 쓰지 않는다(JVM 에서 PNG 로 뽑아 눈으로 확인할 수 있게).
 */
final class ScenePlaces {
    private ScenePlaces() {}

    // ── 시간대 · 날씨를 색에 입히는 도구 ──
    static int dim(SceneArt.Pal L, int col) {
        int c = mix(col, css("#0a1020"), clamp(1 - L.lum, 0, .9) * .72);
        if (L.wk.equals("overcast") || L.wk.equals("rain") || L.wk.equals("fog")) c = mix(c, css("#8d98a8"), .2);
        return c;
    }
    static int dim(SceneArt.Pal L, String col) { return dim(L, css(col)); }
    /** 바닥: 비 오면 젖어 어둡게, 눈 오면 하얗게 */
    static int gnd(SceneArt.Pal L, int col) {
        int c = dim(L, col);
        if (L.wk.equals("rain")) c = mix(c, css("#2a313e"), .3);
        if (L.wk.equals("snow")) c = mix(c, css("#ffffff"), .62);
        return c;
    }
    static int gnd(SceneArt.Pal L, String col) { return gnd(L, css(col)); }
    static boolean snowy(SceneArt.Pal L) { return L.wk.equals("snow"); }
    static boolean wet(SceneArt.Pal L) { return L.wk.equals("rain"); }
    static String[] leafSet(String season) {
        return season.equals("autumn") ? new String[]{"#e2893a", "#d9a23b", "#c9602f"} : season.equals("spring") ? new String[]{"#f2b6cc", "#a9d98b", "#f7c7d8"}
                : season.equals("summer") ? new String[]{"#4fa866", "#3f9a5a", "#62b878"} : new String[]{"#7a6a5a", "#8a7868", "#6b5d50"};
    }

    // ── 나무 · 언덕 도구 ──
    static void roundTree(SceneCv c, SceneArt.Pal L, double x, double base, double h, double r, int crown, boolean snow) {
        c.fillStyle(dim(L, "#5b4636")); c.fillRect(x - 1.5, base - h * .62, 3, h * .62);
        c.fillStyle(crown); c.beginPath(); c.arc(x, base - h * .72, r, 0, PI2); c.arc(x - r * .7, base - h * .56, r * .75, 0, PI2); c.arc(x + r * .7, base - h * .56, r * .75, 0, PI2); c.fill();
        c.fillStyle("rgba(255,255,255,.12)"); c.beginPath(); c.arc(x - r * .25, base - h * .8, r * .5, 0, PI2); c.fill();
        if (snow) { c.fillStyle("rgba(255,255,255,.9)"); c.beginPath(); c.ellipse(x, base - h * .72 - r * .72, r * .8, 2.6, 0, 0, PI2); c.fill(); }
    }
    static void pine(SceneCv c, SceneArt.Pal L, double x, double base, double h, double w, int col, boolean snow) {
        c.fillStyle(dim(L, "#4a382a")); c.fillRect(x - 1.3, base - h * .22, 2.6, h * .22);
        for (int i = 0; i < 4; i++) {
            double ty = base - h * (.16 + i * .22), tw2 = w * (1 - i * .2);
            c.fillStyle(shade(col, i * .04)); c.beginPath(); c.moveTo(x - tw2, ty); c.lineTo(x, ty - h * .34); c.lineTo(x + tw2, ty); c.closePath(); c.fill();
            if (snow) { c.fillStyle("rgba(255,255,255,.88)"); c.beginPath(); c.moveTo(x - tw2 * .62, ty - h * .12); c.lineTo(x, ty - h * .34); c.lineTo(x + tw2 * .62, ty - h * .12); c.closePath(); c.fill(); }
        }
    }
    static void hill(SceneCv c, double tw, double base, double amp, double f, double ph, int col) {
        c.fillStyle(col); c.beginPath(); c.moveTo(0, base);
        for (double x = 0; x <= tw + 4; x += 4) c.lineTo(x, base - amp * (.55 + .45 * Math.sin(x * f + ph)) - amp * .3 * Math.sin(x * f * 2.3 + ph * 1.7));
        c.lineTo(tw, base); c.closePath(); c.fill();
    }
    static void glowSpot(SceneCv c, double x, double y, double r, int a, int b, int cc, double al) {
        SceneCv.Grad g = c.radial(x, y, 0, x, y, r).stop(0, rgba(a, b, cc, al)).stop(1, rgba(a, b, cc, 0)); c.fillGrad(g); c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    static void lamp(SceneCv c, SceneArt.Pal L, SceneArt.Geom g, double lx, double ly, double dir) {
        double hx = lx + dir * 9;
        c.fillStyle(dim(L, "#39404f")); c.fillRect(lx - 1.2, ly - 38, 2.4, 38); c.fillRect(Math.min(lx, hx) - 1.2, ly - 38, 10.4, 2.2);
        if (L.lit) glowSpot(c, hx, ly - 35, 38, 255, 224, 140, .75);
        c.fillStyle(L.lit ? "#fff0b0" : "#9aa3b2"); c.beginPath(); c.ellipse(hx, ly - 36, 4, 2.4, 0, 0, PI2); c.fill();
    }

    public static SceneArt.Bg build(SceneCv root, SceneArt.Pal L, SceneArt.Geom g, double dpr, String season, boolean dark) {
        double W = g.W, H = g.H, hy = g.hy; int tw = (int) Math.ceil(W * 1.7);
        SceneArt.Bg bg = new SceneArt.Bg(); bg.tw = tw;
        bg.sky = root.newLayer(W, H, dpr); bg.far = root.newLayer(tw, H, dpr); bg.mid = root.newLayer(tw, H, dpr); bg.gnd = root.newLayer(W, H + g.ext, dpr);
        SceneArt.drawSky(bg.sky.cv(), L, W, H, hy);
        Seeded rng = new Seeded(L.place.hashCode() * 31 + L.slot.length() * 977 + L.wk.length() * 131 + 7);
        switch (L.place) {
            case "park": park(bg, L, g, tw, season, rng); break;
            case "river": river(bg, L, g, tw, season, rng); break;
            case "school": school(bg, L, g, tw, season, rng); break;
            case "market": market(bg, L, g, tw, season, rng); break;
            case "beach": beach(bg, L, g, tw, season, rng); break;
            case "trail": trail(bg, L, g, tw, season, rng); break;
            default: park(bg, L, g, tw, season, rng);
        }
        return bg;
    }

    // ═══ 공원 ═══
    static void park(SceneArt.Bg bg, SceneArt.Pal L, SceneArt.Geom g, int tw, String season, Seeded rng) {
        double W = g.W, H = g.H, hy = g.hy; SceneCv c; int i;
        boolean snow = snowy(L);
        // 먼 풍경: 언덕 두 겹 + 아파트 몇 동
        c = bg.far.cv();
        int hz = dim(L, mix(L.c[2], css("#6fae7a"), .55));
        hill(c, tw, hy + 6, hy * .34, .021, 1.3, snow ? mix(hz, css("#ffffff"), .6) : mix(hz, css("#5b8fa0"), .35));
        hill(c, tw, hy + 6, hy * .22, .034, 4.1, snow ? mix(hz, css("#ffffff"), .7) : hz);
        for (double x = 20; x < tw; x += rng.r(46, 80)) {
            double bw = rng.r(14, 22), bh = rng.r(hy * .22, hy * .4);
            c.fillStyle(dim(L, mix(L.c[2], css("#9aa6b8"), .55))); c.fillRect(x, hy + 5 - bh, bw, bh);
            for (double wy = hy + 8 - bh; wy < hy; wy += 5) for (double wx = x + 2.5; wx < x + bw - 2; wx += 4.5) if (L.lit && rng.r() < .4) { c.fillStyle("rgba(255,226,140,.8)"); c.fillRect(wx, wy, 1.8, 2.2); }
        }
        // 가까운 풍경: 나무 · 벤치 · 꽃울타리
        c = bg.mid.cv();
        String[] leaf = leafSet(season);
        for (double x = 8; x < tw; x += rng.r(26, 52)) {
            double th = rng.r(hy * .38, hy * .62), r2 = rng.r(10, 16); String cc = leaf[rng.pick(leaf.length)];
            int col = dim(L, mix(css(cc), css(L.lit ? "#3a2a4a" : "#ffffff"), L.night ? 0 : L.lit ? .2 : .03));
            if (rng.r() < .28 && !season.equals("winter")) pine(c, L, x, hy + 6, th * 1.1, r2 * .8, dim(L, "#2f6f4a"), snow);
            else roundTree(c, L, x, hy + 6, th, r2, col, snow);
        }
        // 울타리 낮은 덤불 줄(꽃)
        c.fillStyle(dim(L, season.equals("winter") ? "#6b7a63" : "#4f9a5c")); c.beginPath(); for (double x = 0; x < tw; x += 6) c.ellipse(x + 3, hy + 6, 5, 3.4, 0, 0, PI2); c.fill();
        if (season.equals("spring") || season.equals("summer")) for (double x = 2; x < tw; x += rng.r(5, 11)) { c.fillStyle(season.equals("spring") ? (rng.r() < .5 ? "#f7a8c4" : "#fff0a0") : (rng.r() < .5 ? "#ff8aa0" : "#ffe27a")); c.beginPath(); c.arc(x, hy + 4.5 + rng.r(-1, 1.5), 1.3, 0, PI2); c.fill(); }
        // 땅: 잔디 + 굽은 길 + 가로등
        c = bg.gnd.cv();
        int grass = gnd(L, season.equals("winter") ? "#9aa58f" : season.equals("autumn") ? "#9db36a" : "#6fbf6a");
        SceneCv.Grad gr = c.linear(0, hy + 3, 0, H).stop(0, shade(grass, .08)).stop(1, shade(grass, -.12)); c.fillGrad(gr); c.fillRect(0, hy + 3, W, H + g.ext - hy - 3);
        c.fillStyle("rgba(255,255,255,.06)"); for (i = 0; i < 9; i++) { double y0 = hy + 6 + Math.pow(i / 9.0, 1.4) * (H - hy), y1 = hy + 6 + Math.pow((i + .5) / 9.0, 1.4) * (H - hy); c.fillRect(0, y0, W, Math.max(1, y1 - y0)); }
        int path = gnd(L, "#e5d3b0");
        c.fillStyle(path); c.beginPath(); c.moveTo(W * .44, hy + 8); c.bezierTo(W * .5, g.nearTop * .9, W * .02, g.nearTop + 4, -W * .06, H); c.lineTo(W * .72, H); c.bezierTo(W * .6, g.nearTop + 6, W * .56, hy + 24, W * .54, hy + 8); c.closePath(); c.fill();
        { double sl = (W * .72 - W * .6) / Math.max(1, H - g.nearTop - 6), sr = (-W * .06 - W * .02) / Math.max(1, H - g.nearTop - 4); c.beginPath(); c.moveTo(-W * .06, H - .5); c.lineTo(W * .72, H - .5); c.lineTo(W * .72 + sl * g.ext, H + g.ext); c.lineTo(-W * .06 + sr * g.ext, H + g.ext); c.closePath(); c.fill(); }       // 길을 같은 기울기로 아래까지 잇는다
        c.strokeStyle("rgba(0,0,0,.1)"); c.lineWidth(1); c.beginPath(); c.moveTo(W * .44, hy + 8); c.bezierTo(W * .5, g.nearTop * .9, W * .02, g.nearTop + 4, -W * .06, H); c.stroke();
        c.beginPath(); c.moveTo(W * .54, hy + 8); c.bezierTo(W * .56, hy + 24, W * .6, g.nearTop + 6, W * .72, H); c.stroke();
        if (wet(L)) for (i = 0; i < 4; i++) { double pxx = rng.r(.3, .7) * W, pyy = rng.r(g.nearTop + 12, H - 8), prx = rng.r(9, 16); c.fillStyle("rgba(70,90,120,.5)"); c.beginPath(); c.ellipse(pxx, pyy, prx, prx * .26, 0, 0, PI2); c.fill(); }
        if (season.equals("autumn") && !snow) for (i = 0; i < 26; i++) { c.fillStyle(rng.r() < .5 ? "rgba(214,120,50,.85)" : "rgba(226,176,60,.85)"); c.beginPath(); c.ellipse(rng.r(0, W), rng.r(g.nearTop - 6, H - 3), 2.1, 1.2, rng.r(0, 3), 0, PI2); c.fill(); }
        if (snow) for (i = 0; i < 8; i++) { c.fillStyle("rgba(255,255,255,.85)"); c.beginPath(); c.ellipse(rng.r(0, W), rng.r(g.nearTop, H - 3), rng.r(8, 20), rng.r(2, 4), 0, 0, PI2); c.fill(); }
        // 벤치
        double bx = W * .82, by = g.nearTop + 4;
        c.fillStyle(dim(L, "#7a5a3a")); c.fillRect(bx - 12, by - 9, 24, 2.4); c.fillRect(bx - 12, by - 5, 24, 2.4); c.fillStyle(dim(L, "#4b5160")); c.fillRect(bx - 11, by - 3, 2, 6); c.fillRect(bx + 9, by - 3, 2, 6); c.fillRect(bx - 12, by - 14, 2, 8); c.fillRect(bx + 10, by - 14, 2, 8);
        if (snow) { c.fillStyle("rgba(255,255,255,.92)"); c.fillRect(bx - 12, by - 11, 24, 2.2); }
        c = bg.gnd.cv();
        // 분수 받침(물줄기는 SceneFx)
        double fx = W * .2, fy = g.nearTop - 2;
        c.fillStyle(dim(L, "#a9b2bf")); c.beginPath(); c.ellipse(fx, fy + 2, 17, 5, 0, 0, PI2); c.fill();
        c.fillStyle(dim(L, "#7fb4d8")); c.beginPath(); c.ellipse(fx, fy + .6, 14.5, 3.7, 0, 0, PI2); c.fill();
        c.fillStyle(dim(L, "#c7ced9")); c.fillRect(fx - 1.6, fy - 11, 3.2, 12); c.beginPath(); c.ellipse(fx, fy - 11, 5, 1.6, 0, 0, PI2); c.fill();
        lamp(c, L, g, W * .07, g.nearTop + 2, 1); lamp(c, L, g, W * .93, g.nearTop + 2, -1);
    }

    // ═══ 강변 ═══
    static void river(SceneArt.Bg bg, SceneArt.Pal L, SceneArt.Geom g, int tw, String season, Seeded rng) {
        double W = g.W, H = g.H, hy = g.hy; SceneCv c; int i;
        boolean snow = snowy(L);
        double wTop = hy + 6, wBot = g.nearTop - 12;
        // 먼 풍경: 건너편 둔치 · 아파트 숲 · 다리
        c = bg.far.cv();
        hill(c, tw, hy + 4, hy * .3, .018, 2.0, dim(L, mix(L.c[2], css("#7a8fa3"), .5)));
        for (double x = 10; x < tw; x += rng.r(10, 20)) {
            double bw = rng.r(8, 15), bh = rng.r(hy * .12, hy * .34);
            c.fillStyle(dim(L, mix(L.c[2], css("#8fa0b6"), .5 + rng.r(0, .2)))); c.fillRect(x, hy + 4 - bh, bw, bh);
            for (double wy = hy + 7 - bh; wy < hy; wy += 4.5) for (double wx = x + 2; wx < x + bw - 1.5; wx += 3.6) if (L.lit && rng.r() < .45) { c.fillStyle("rgba(255,226,140,.8)"); c.fillRect(wx, wy, 1.4, 1.8); }
        }
        // 다리(트러스)
        double by0 = hy + 3, bl = W * .02, br = W * 1.0;
        c.fillStyle(dim(L, "#5d6a7d")); c.fillRect(bl, by0 - 4.6, br - bl, 2.4);
        for (double x = bl; x < br; x += 14) { c.fillRect(x, by0 - 4.6, 1.6, 6); }
        c.strokeStyle(dim(L, "#5d6a7d")); c.lineWidth(1.4); c.beginPath(); for (double x = bl; x < br; x += 28) { c.moveTo(x, by0 - 4); c.quadTo(x + 14, by0 - 20, x + 28, by0 - 4); } c.stroke();
        for (double x = bl + 9; x < br; x += 50) { c.fillStyle(dim(L, "#4d596b")); c.fillRect(x, by0 - 2, 3, 6); }
        // 건너편 나무 띠
        c = bg.mid.cv();
        String[] leaf = leafSet(season);
        for (double x = 4; x < tw; x += rng.r(15, 28)) roundTree(c, L, x, hy + 6, rng.r(hy * .2, hy * .32), rng.r(6, 10), dim(L, mix(css(leaf[rng.pick(leaf.length)]), css("#2d3a4c"), L.night ? .4 : .08)), snow);
        // 땅: 물 · 둑 · 산책로 · 난간
        c = bg.gnd.cv();
        int sw = mix(L.c[2], css(L.night ? "#10244a" : "#4f8fc4"), .5);
        SceneCv.Grad wgr = c.linear(0, wTop, 0, wBot).stop(0, dim(L, mix(L.c[1], css("#7fb6e0"), .55))).stop(1, dim(L, shade(sw, -.25))); c.fillGrad(wgr); c.fillRect(0, wTop, W, wBot - wTop);
        if (snow) { c.fillStyle("rgba(255,255,255,.18)"); c.fillRect(0, wTop, W, wBot - wTop); }
        // 햇빛/달빛 반사 기둥
        double rx = L.sunX * W; SceneCv.Grad rgl = c.linear(rx, wTop, rx, wBot).stop(0, rgba(255, 244, 200, L.hidesSun ? .08 : L.moon ? .26 : .5)).stop(1, rgba(255, 244, 200, 0));
        c.fillGrad(rgl); c.fillRect(rx - 14, wTop, 28, wBot - wTop);
        // 둑(돌)
        c.fillStyle(gnd(L, "#9ea6b2")); c.fillRect(0, wBot, W, g.nearTop - wBot + 1);
        c.strokeStyle("rgba(0,0,0,.14)"); c.lineWidth(1); for (double x = 0; x < W; x += 13) { c.beginPath(); c.moveTo(x, wBot); c.lineTo(x, g.nearTop + 1); c.stroke(); }
        c.fillStyle("rgba(0,0,0,.18)"); c.fillRect(0, wBot, W, 1.6);
        // 산책로
        int walk = gnd(L, "#d9cdb8"); SceneCv.Grad pg = c.linear(0, g.nearTop, 0, H).stop(0, shade(walk, .06)).stop(1, shade(walk, -.1)); c.fillGrad(pg); c.fillRect(0, g.nearTop, W, H + g.ext - g.nearTop);
        c.fillStyle(shade(walk, .2)); c.fillRect(0, g.nearTop - 1, W, 2);
        c.fillStyle(gnd(L, "#c0675a")); c.fillRect(0, g.nearTop + (H - g.nearTop) * .62, W, 3.4);       // 자전거길 띠
        c.fillStyle("rgba(255,255,255,.55)"); for (double x = 6; x < W; x += 22) c.fillRect(x, g.nearTop + (H - g.nearTop) * .62 + 1.1, 11, 1.2);
        c.strokeStyle("rgba(0,0,0,.08)"); for (i = 1; i < 60; i++) { double yy = g.nearTop + Math.pow(i / 4.0, 1.5) * (H - g.nearTop); if (yy > H + g.ext) break; c.beginPath(); c.moveTo(0, yy); c.lineTo(W, yy); c.stroke(); }
        if (wet(L)) for (i = 0; i < 4; i++) { double pxx = rng.r(.08, .92) * W, pyy = rng.r(g.nearTop + 10, H - 6), prx = rng.r(9, 16); c.fillStyle("rgba(70,90,120,.5)"); c.beginPath(); c.ellipse(pxx, pyy, prx, prx * .26, 0, 0, PI2); c.fill(); }
        if (snow) for (i = 0; i < 8; i++) { c.fillStyle("rgba(255,255,255,.88)"); c.beginPath(); c.ellipse(rng.r(0, W), rng.r(g.nearTop + 3, H - 3), rng.r(8, 20), rng.r(2, 4), 0, 0, PI2); c.fill(); }
        // 난간(둑 위)
        double ry = g.nearTop + 1; c.fillStyle(dim(L, "#4b5160")); c.fillRect(0, ry - 8, W, 1.8);
        for (double x = 2; x < W; x += 12) c.fillRect(x, ry - 8, 1.6, 9);
        if (snow) { c.fillStyle("rgba(255,255,255,.92)"); c.fillRect(0, ry - 9.8, W, 1.8); }
        lamp(c, L, g, W * .07, g.nearTop + 2, 1); lamp(c, L, g, W * .93, g.nearTop + 2, -1);
    }

    // ═══ 학교 앞 ═══
    static void school(SceneArt.Bg bg, SceneArt.Pal L, SceneArt.Geom g, int tw, String season, Seeded rng) {
        double W = g.W, H = g.H, hy = g.hy; SceneCv c; int i;
        boolean snow = snowy(L);
        c = bg.far.cv();
        hill(c, tw, hy + 5, hy * .22, .02, 0.7, dim(L, mix(L.c[2], css("#8aa890"), .55)));
        // 학교 건물
        double bx = W * .12, bw = W * .62, bh = hy * .62, by = hy + 5;
        int wall = dim(L, "#e6dccb");
        c.fillStyle(wall); c.fillRect(bx, by - bh, bw, bh);
        c.fillStyle(shade(wall, -.12)); c.fillRect(bx, by - bh, bw, 3);
        c.fillStyle(dim(L, "#b7c4d6")); c.fillRect(bx - 2, by - bh - 3, bw + 4, 3.4);
        int rows = 3; double cols = Math.floor(bw / 17);
        for (int r = 0; r < rows; r++) for (int k = 0; k < (int) cols; k++) {
            double wx = bx + 6 + k * (bw - 12) / cols, wy = by - bh + 7 + r * (bh - 12) / rows;
            boolean lit = L.lit && rng.r() < .45;
            c.fillStyle(lit ? css("rgba(255,230,150,.92)") : dim(L, "#9fc2e6")); c.fillRect(wx, wy, 10, 7);
            c.fillStyle(dim(L, "#6d7a8d")); c.fillRect(wx + 4.6, wy, .9, 7);
        }
        // 가운데 현관과 시계탑
        double cx = bx + bw / 2; c.fillStyle(shade(wall, -.06)); c.fillRect(cx - 17, by - bh - 14, 34, bh + 14);
        c.fillStyle(dim(L, "#7a5a3a")); c.fillRect(cx - 7, by - 15, 14, 15); c.fillStyle("rgba(255,255,255,.35)"); c.fillRect(cx - .5, by - 15, 1, 15);
        c.fillStyle(dim(L, "#f4f1e6")); c.beginPath(); c.arc(cx, by - bh - 5, 6.2, 0, PI2); c.fill(); c.strokeStyle(dim(L, "#4b5160")); c.lineWidth(1.2); c.stroke();
        c.beginPath(); c.moveTo(cx, by - bh - 5); c.lineTo(cx, by - bh - 9); c.moveTo(cx, by - bh - 5); c.lineTo(cx + 3, by - bh - 4); c.stroke();
        c.fillStyle(dim(L, "#b7c4d6")); c.beginPath(); c.moveTo(cx - 19, by - bh - 14); c.lineTo(cx, by - bh - 25); c.lineTo(cx + 19, by - bh - 14); c.closePath(); c.fill();
        if (snow) { c.fillStyle("rgba(255,255,255,.92)"); c.beginPath(); c.moveTo(cx - 19, by - bh - 14); c.lineTo(cx, by - bh - 25); c.lineTo(cx + 19, by - bh - 14); c.lineTo(cx + 15, by - bh - 14); c.lineTo(cx, by - bh - 21.5); c.lineTo(cx - 15, by - bh - 14); c.closePath(); c.fill(); c.fillRect(bx - 2, by - bh - 5, bw + 4, 2.6); }
        // 깃대(깃발은 SceneFx 가 펄럭이게)
        double fp = W * .84; c.fillStyle(dim(L, "#c7ced9")); c.fillRect(fp - 1, by - hy * .72, 2, hy * .72 + 1);
        c.fillStyle(dim(L, "#e8c14a")); c.beginPath(); c.arc(fp, by - hy * .72 - 1, 1.8, 0, PI2); c.fill();
        // 가까운 풍경: 쇠 울타리 + 은행나무
        c = bg.mid.cv();
        String[] leaf = leafSet(season);
        for (double x = 4; x < tw; x += rng.r(34, 60)) {
            if (x > bx - 10 && x < bx + bw + 10 && rng.r() < .7) continue;
            roundTree(c, L, x, hy + 7, rng.r(hy * .4, hy * .6), rng.r(9, 14), dim(L, mix(css(season.equals("autumn") ? "#e4c13d" : leaf[rng.pick(leaf.length)]), css("#3a2a4a"), L.lit ? .25 : .03)), snow);
        }
        c.fillStyle(dim(L, "#3e4a5c")); c.fillRect(0, hy + 1.5, tw, 1.6); c.fillRect(0, hy + 7.4, tw, 1.6);
        for (double x = 1; x < tw; x += 5) { c.fillRect(x, hy - 2, 1.2, 12); c.beginPath(); c.moveTo(x - .5, hy - 2); c.lineTo(x + .6, hy - 5); c.lineTo(x + 1.7, hy - 2); c.closePath(); c.fill(); }
        if (snow) { c.fillStyle("rgba(255,255,255,.9)"); c.fillRect(0, hy, tw, 1.8); }
        // 땅: 운동장 모래 + 인도 + 어린이 보호구역(노랑) + 횡단보도
        c = bg.gnd.cv();
        int yard = gnd(L, "#d8bf94"); SceneCv.Grad yg = c.linear(0, hy + 9, 0, g.nearTop).stop(0, shade(yard, .06)).stop(1, shade(yard, -.06)); c.fillGrad(yg); c.fillRect(0, hy + 9, W, g.nearTop - hy - 9);
        c.fillStyle(gnd(L, "#e1d9c8")); c.fillRect(0, hy + 9, W, 2);
        int walk = gnd(L, "#cfc8ba"); SceneCv.Grad pg = c.linear(0, g.nearTop, 0, H).stop(0, shade(walk, .06)).stop(1, shade(walk, -.1)); c.fillGrad(pg); c.fillRect(0, g.nearTop, W, H + g.ext - g.nearTop);
        c.fillStyle(shade(walk, .2)); c.fillRect(0, g.nearTop - 1, W, 2.2);
        c.fillStyle(gnd(L, "#f2c230")); c.fillRect(0, g.nearTop + (H - g.nearTop) * .5, W, 5);
        c.fillStyle(rgba(0, 0, 0, .45)); for (double x = 4; x < W; x += 14) { c.beginPath(); c.moveTo(x, g.nearTop + (H - g.nearTop) * .5 + 5); c.lineTo(x + 6, g.nearTop + (H - g.nearTop) * .5); c.lineTo(x + 8, g.nearTop + (H - g.nearTop) * .5); c.lineTo(x + 2, g.nearTop + (H - g.nearTop) * .5 + 5); c.closePath(); c.fill(); }
        c.fillStyle(gnd(L, "#ffffff"));       // 횡단보도: 줄마다 폭 · 간격이 같은 비율로 부챗살처럼 벌어진다 — 평소 카드 아래(H-3)까지만 그리고, 카드가 늘어난 아래쪽은 일반 바닥
        { double yt = g.nearTop + 3, yb = H - 3, xc = W * .52 + 37.5 + 4.5, a = .5 / Math.max(1, H - 3 - yt), sb = 1 + a * (yb - yt);
          for (i = 0; i < 6; i++) { double ci = W * .52 + i * 15 + 4.5, cb = xc + (ci - xc) * sb; c.beginPath(); c.moveTo(ci - 4.5, yt); c.lineTo(ci + 4.5, yt); c.lineTo(cb + 4.5 * sb, yb); c.lineTo(cb - 4.5 * sb, yb); c.closePath(); c.fill(); } }
        if (wet(L)) for (i = 0; i < 4; i++) { double pxx = rng.r(.08, .5) * W, pyy = rng.r(g.nearTop + 10, H - 6), prx = rng.r(9, 16); c.fillStyle("rgba(70,90,120,.5)"); c.beginPath(); c.ellipse(pxx, pyy, prx, prx * .26, 0, 0, PI2); c.fill(); }
        if (snow) for (i = 0; i < 7; i++) { c.fillStyle("rgba(255,255,255,.88)"); c.beginPath(); c.ellipse(rng.r(0, W * .5), rng.r(g.nearTop + 3, H - 3), rng.r(8, 20), rng.r(2, 4), 0, 0, PI2); c.fill(); }
        // 보호구역 표지판
        double sx = W * .93, sy = g.nearTop + 3;
        c.fillStyle(dim(L, "#4a5160")); c.fillRect(sx - 1.2, sy - 36, 2.4, 36);
        c.fillStyle(gnd(L, "#f2c230")); c.beginPath(); c.moveTo(sx, sy - 52); c.lineTo(sx + 11, sy - 33); c.lineTo(sx - 11, sy - 33); c.closePath(); c.fill(); c.strokeStyle(dim(L, "#222833")); c.lineWidth(1.3); c.stroke();
        c.fillStyle(dim(L, "#222833")); c.beginPath(); c.arc(sx - 2, sy - 44, 1.7, 0, PI2); c.arc(sx + 2.8, sy - 43.4, 1.4, 0, PI2); c.fill(); c.fillRect(sx - 3, sy - 42, 2.2, 6); c.fillRect(sx + 1.8, sy - 41.4, 1.8, 5);
        lamp(c, L, g, W * .07, g.nearTop + 2, 1);
    }

    // ═══ 시장 골목 ═══
    static void market(SceneArt.Bg bg, SceneArt.Pal L, SceneArt.Geom g, int tw, String season, Seeded rng) {
        double W = g.W, H = g.H, hy = g.hy; SceneCv c; int i;
        boolean snow = snowy(L);
        c = bg.far.cv();
        // 뒤쪽 건물 벽(2~3층 상가)
        for (double x = -4; x < tw; ) {
            double bw = rng.r(26, 44), bh = rng.r(hy * .5, hy * .82);
            int col = dim(L, mix(css("#c9b79d"), css(rng.r() < .5 ? "#d9a8a0" : "#a9b8c9"), rng.r(0, .6)));
            c.fillStyle(col); c.fillRect(x, hy + 6 - bh, bw, bh); c.fillStyle(shade(col, -.12)); c.fillRect(x, hy + 6 - bh, bw, 2);
            for (double wy = hy + 6 - bh + 6; wy < hy - 8; wy += 9) for (double wx = x + 4; wx < x + bw - 8; wx += 9) { boolean lit = L.lit && rng.r() < .5; c.fillStyle(lit ? css("rgba(255,226,140,.9)") : dim(L, "#8fb0d2")); c.fillRect(wx, wy, 5.5, 5); }
            if (snow) { c.fillStyle("rgba(255,255,255,.9)"); c.fillRect(x, hy + 6 - bh - 1.6, bw, 2.4); }
            x += bw + rng.r(0, 2);
        }
        // 가게 줄: 차양 · 좌판 · 간판
        c = bg.mid.cv();
        String[] ac = {"#d9453d", "#2f7d4f", "#e3a21a", "#2f6fd6", "#c9568a"}; String[] nm = {"과일", "생선", "떡집", "분식", "반찬", "야채", "채소", "약국"};
        double sx = 0; int n = 0;
        while (sx < tw) {
            double sw = rng.r(40, 52), top = hy - 24;
            int col = dim(L, css(ac[n % ac.length]));
            c.fillStyle(dim(L, "#4a3a2c")); c.fillRect(sx + 2, top + 2, 2, 30); c.fillRect(sx + sw - 4, top + 2, 2, 30);
            c.fillStyle(dim(L, "#3b2f26")); c.fillRect(sx + 4, top + 6, sw - 8, 26);
            for (int k = 0; k < 7; k++) { c.fillStyle(k % 2 == 0 ? col : dim(L, "#f4efe4")); double a0 = sx + k * sw / 7; c.beginPath(); c.moveTo(a0, top - 1); c.lineTo(a0 + sw / 7, top - 1); c.lineTo(a0 + sw / 7 + 1, top + 8); c.quadTo(a0 + sw / 14, top + 11.5, a0 - .5, top + 8); c.closePath(); c.fill(); }
            if (snow) { c.fillStyle("rgba(255,255,255,.9)"); c.fillRect(sx, top - 3, sw, 2.6); }
            c.fillStyle(dim(L, "#7a5a3a")); c.fillRect(sx + 3, top + 24, sw - 6, 3);
            for (int k = 0; k < (int) ((sw - 8) / 4.2); k++) { int pc = n % 3 == 0 ? css(k % 2 == 0 ? "#d9453d" : "#e8a02a") : n % 3 == 1 ? css(k % 2 == 0 ? "#c9d3dc" : "#8fa3b5") : css(k % 2 == 0 ? "#6db15a" : "#a7d27a"); c.fillStyle(dim(L, pc)); c.beginPath(); c.arc(sx + 6 + k * 4.2, top + 22.6, 2.1, 0, PI2); c.fill(); }
            c.fillStyle(dim(L, "#222833")); rr(c, sx + sw / 2 - 9, top - 7, 18, 7, 2); c.fill(); c.fillStyle("#f6e7b4"); c.font(5.6); c.fillTextC(nm[(n * 3 + (int) rng.r(0, 8)) % nm.length], sx + sw / 2, top - 3.4);
            sx += sw + rng.r(1, 5); n++;
        }
        // 땅: 돌바닥 + 가로 줄무늬 그림자 + 전구줄은 SceneFx
        c = bg.gnd.cv();
        int pave = gnd(L, "#b8ad9c"); SceneCv.Grad pg = c.linear(0, hy + 6, 0, H).stop(0, shade(pave, -.08)).stop(1, shade(pave, -.02)); c.fillGrad(pg); c.fillRect(0, hy + 6, W, H + g.ext - hy - 6);
        c.fillStyle("rgba(0,0,0,.2)"); c.fillRect(0, hy + 6, W, 5);
        c.strokeStyle("rgba(0,0,0,.12)"); c.lineWidth(1);
        for (i = 1; i < 80; i++) { double yy = hy + 8 + Math.pow(i / 7.0, 1.6) * (H - hy - 8); if (yy > H + g.ext) break; c.beginPath(); c.moveTo(0, yy); c.lineTo(W, yy); c.stroke(); }
        for (i = -10; i <= 10; i++) { c.beginPath(); c.moveTo(W / 2 + i * 12, hy + 8); c.lineTo(W / 2 + i * (12 + 28 * (H + g.ext - hy - 8) / (H - hy - 8)), H + g.ext); c.stroke(); }       // 같은 기울기로 끝까지
        if (wet(L)) for (i = 0; i < 6; i++) { double pxx = rng.r(.08, .92) * W, pyy = rng.r(g.nearTop - 8, H - 6), prx = rng.r(9, 18); c.fillStyle("rgba(70,90,120,.5)"); c.beginPath(); c.ellipse(pxx, pyy, prx, prx * .26, 0, 0, PI2); c.fill(); c.fillStyle("rgba(210,230,255,.3)"); c.beginPath(); c.ellipse(pxx - prx * .2, pyy - 1, prx * .5, prx * .08, 0, 0, PI2); c.fill(); }
        if (snow) for (i = 0; i < 9; i++) { c.fillStyle("rgba(255,255,255,.85)"); c.beginPath(); c.ellipse(rng.r(0, W), rng.r(g.nearTop - 6, H - 3), rng.r(8, 22), rng.r(2, 4), 0, 0, PI2); c.fill(); }
        // 가까운 쪽 손수레
        double cx = W * .86, cy = g.nearTop + 10;
        c.fillStyle(dim(L, "#7a5a3a")); rr(c, cx - 17, cy - 9, 34, 7, 1.6); c.fill(); c.fillStyle(dim(L, "#5a4128")); c.fillRect(cx - 15, cy - 2, 2, 8); c.fillRect(cx + 13, cy - 2, 2, 8);
        for (int k = 0; k < 7; k++) { c.fillStyle(dim(L, k % 2 == 0 ? "#f08a2a" : "#e8c14a")); c.beginPath(); c.arc(cx - 13 + k * 4.4, cy - 11, 2.5, 0, PI2); c.fill(); }
        c.fillStyle(dim(L, "#222833")); c.beginPath(); c.arc(cx - 11, cy + 5, 3.4, 0, PI2); c.arc(cx + 11, cy + 5, 3.4, 0, PI2); c.fill();
    }

    // ═══ 바닷가 ═══
    static void beach(SceneArt.Bg bg, SceneArt.Pal L, SceneArt.Geom g, int tw, String season, Seeded rng) {
        double W = g.W, H = g.H, hy = g.hy; SceneCv c; int i;
        double seaB = g.nearTop - 14;
        c = bg.far.cv();
        // 수평선 위 섬 · 등대 · 배
        hill(c, tw, hy + 4, hy * .16, .03, 5.1, dim(L, mix(L.c[2], css("#6c8aa0"), .55)));
        double lx = W * .78; c.fillStyle(dim(L, "#f1ece0")); c.beginPath(); c.moveTo(lx - 3, hy + 3); c.lineTo(lx - 1.8, hy - 22); c.lineTo(lx + 1.8, hy - 22); c.lineTo(lx + 3, hy + 3); c.closePath(); c.fill();
        c.fillStyle(dim(L, "#d9453d")); c.fillRect(lx - 2.5, hy - 14, 5, 3.4); c.fillStyle(dim(L, "#4b5160")); c.fillRect(lx - 2.6, hy - 26, 5.2, 4);
        if (L.lit) glowSpot(c, lx, hy - 24, 26, 255, 240, 170, .8);
        for (double bx : new double[]{W * .28, W * .48}) { c.fillStyle(dim(L, "#f4f1e6")); c.beginPath(); c.moveTo(bx, hy + 6.2); c.lineTo(bx, hy - 4); c.lineTo(bx + 6, hy + 5); c.closePath(); c.fill(); c.fillStyle(dim(L, "#3d4a66")); c.fillRect(bx - 3, hy + 5, 11, 2); }
        // 가까운 풍경: 소나무 숲 가장자리 · 파라솔 · 구조대 망루
        c = bg.mid.cv();
        for (double x = tw * .52; x < tw; x += rng.r(15, 26)) pine(c, L, x, g.nearTop - 4, rng.r(hy * .5, hy * .78), rng.r(8, 12), dim(L, "#2c6a45"), snowy(L));
        for (double x = 2; x < W * .2; x += rng.r(15, 24)) pine(c, L, x, g.nearTop - 4, rng.r(hy * .5, hy * .74), rng.r(8, 12), dim(L, "#2c6a45"), snowy(L));
        // 땅: 바다 · 젖은 모래 · 마른 모래
        c = bg.gnd.cv();
        SceneCv.Grad sg = c.linear(0, hy + 3, 0, seaB).stop(0, dim(L, mix(L.c[1], css("#4fa7c9"), .5))).stop(1, dim(L, css(L.night ? "#10325a" : "#2e86b0"))); c.fillGrad(sg); c.fillRect(0, hy + 3, W, seaB - hy - 3);
        double rx = L.sunX * W; SceneCv.Grad rgl = c.linear(rx, hy + 3, rx, seaB).stop(0, rgba(255, 244, 200, L.hidesSun ? .08 : L.moon ? .3 : .55)).stop(1, rgba(255, 244, 200, 0)); c.fillGrad(rgl); c.fillRect(rx - 16, hy + 3, 32, seaB - hy - 3);
        c.fillStyle("rgba(255,255,255,.28)"); for (i = 0; i < 14; i++) { double yy = rng.r(hy + 6, seaB - 3); c.fillRect(rng.r(0, W), yy, rng.r(6, 16), 1); }
        int dry = gnd(L, "#e8d7b0"), wetS = mix(dry, css("#6a5a44"), .35);
        SceneCv.Grad sa = c.linear(0, seaB, 0, H).stop(0, wetS).stop(.18, wetS).stop(.26, shade(dry, .04)).stop(1, shade(dry, -.1)); c.fillGrad(sa); c.fillRect(0, seaB, W, H + g.ext - seaB);
        c.fillStyle("rgba(255,255,255,.85)"); c.beginPath(); for (double x = 0; x <= W; x += 4) c.lineTo(x, seaB - 1.4 + Math.sin(x * .09) * 1.4); c.lineTo(W, seaB + 3); c.lineTo(0, seaB + 3); c.closePath(); c.fill();
        for (i = 0; i < 14; i++) { c.fillStyle(rng.r() < .5 ? "rgba(255,255,255,.7)" : "rgba(210,170,150,.8)"); c.beginPath(); c.arc(rng.r(0, W), rng.r(g.nearTop + 6, H - 3), rng.r(.8, 1.6), 0, PI2); c.fill(); }
        c.strokeStyle("rgba(0,0,0,.07)"); c.lineWidth(1); for (i = 1; i < 60; i++) { double yy = g.nearTop + Math.pow(i / 4.0, 1.5) * (H - g.nearTop); if (yy > H + g.ext) break; c.beginPath(); c.moveTo(0, yy); c.lineTo(W, yy); c.stroke(); }
        if (wet(L)) for (i = 0; i < 4; i++) { double pxx = rng.r(.08, .92) * W, pyy = rng.r(g.nearTop + 10, H - 6), prx = rng.r(9, 16); c.fillStyle("rgba(70,90,120,.4)"); c.beginPath(); c.ellipse(pxx, pyy, prx, prx * .26, 0, 0, PI2); c.fill(); }
        String[] pc = {"#e0556c", "#f0b83a", "#5aa9e6", "#e9eef5"};
        for (int k = 0; k < 3; k++) {
            double px = W * (.34 + k * .13), py = g.nearTop + 6;
            c.fillStyle(dim(L, "#6a5a48")); c.fillRect(px - .7, py - 15, 1.4, 15);
            for (int s = 0; s < 6; s++) { c.fillStyle(s % 2 == 0 ? dim(L, pc[k % pc.length]) : dim(L, "#ffffff")); double a0 = px - 12 + s * 4; c.beginPath(); c.moveTo(a0, py - 12); c.lineTo(a0 + 4, py - 12); c.lineTo(px + (a0 + 2 - px) * .15, py - 20); c.closePath(); c.fill(); }
        }
        double tx = W * .88, ty = g.nearTop + 6; c.fillStyle(dim(L, "#f4f1e6")); c.fillRect(tx - 7, ty - 18, 14, 12); c.fillStyle(dim(L, "#e0556c")); c.beginPath(); c.moveTo(tx - 9, ty - 18); c.lineTo(tx, ty - 25); c.lineTo(tx + 9, ty - 18); c.closePath(); c.fill();
        c.fillStyle(dim(L, "#7a5a3a")); c.fillRect(tx - 6, ty - 6, 2, 7); c.fillRect(tx + 4, ty - 6, 2, 7);
        c.fillStyle(dim(L, "#9fc2e6")); c.fillRect(tx - 5, ty - 15, 10, 5);
    }

    // ═══ 산길 ═══
    static void trail(SceneArt.Bg bg, SceneArt.Pal L, SceneArt.Geom g, int tw, String season, Seeded rng) {
        double W = g.W, H = g.H, hy = g.hy; SceneCv c; int i;
        boolean snow = snowy(L);
        c = bg.far.cv();
        int m1 = dim(L, mix(L.c[2], css("#6f8fb0"), .6)), m2 = dim(L, mix(L.c[2], css("#5f8a78"), .6)), m3 = dim(L, mix(L.c[2], css("#4a7a5a"), .5));
        hill(c, tw, hy + 6, hy * .62, .013, 0.4, snow ? mix(m1, css("#ffffff"), .6) : m1);
        c.fillStyle("rgba(255,255,255,.2)"); c.fillRect(0, hy - hy * .26, tw, 5);
        hill(c, tw, hy + 6, hy * .44, .021, 2.8, snow ? mix(m2, css("#ffffff"), .55) : m2);
        c.fillStyle("rgba(255,255,255,.18)"); c.fillRect(0, hy - hy * .12, tw, 5);
        hill(c, tw, hy + 6, hy * .26, .033, 5.5, snow ? mix(m3, css("#ffffff"), .5) : m3);
        // 숲
        c = bg.mid.cv();
        String[] leaf = leafSet(season);
        for (double x = 3; x < tw; x += rng.r(11, 22)) {
            double th = rng.r(hy * .42, hy * .86);
            if (rng.r() < .55) pine(c, L, x, hy + 7, th, rng.r(7, 11), dim(L, mix(css("#2f6a4a"), css("#16322a"), rng.r(0, .4))), snow);
            else roundTree(c, L, x, hy + 7, th * .8, rng.r(8, 13), dim(L, css(leaf[rng.pick(leaf.length)])), snow);
        }
        // 바위
        for (double x = 14; x < tw; x += rng.r(70, 130)) { double rw = rng.r(8, 14); c.fillStyle(dim(L, "#8a8f98")); c.beginPath(); c.ellipse(x, hy + 8, rw, rw * .5, 0, PI, 0); c.fill(); if (snow) { c.fillStyle("rgba(255,255,255,.9)"); c.beginPath(); c.ellipse(x, hy + 6.5, rw * .8, rw * .2, 0, PI, 0); c.fill(); } }
        // 땅: 풀 · 흙길 · 나무 울타리
        c = bg.gnd.cv();
        int grass = gnd(L, season.equals("winter") ? "#8d9a7e" : season.equals("autumn") ? "#8a9a5a" : "#5c9a58");
        SceneCv.Grad gr = c.linear(0, hy + 3, 0, H).stop(0, shade(grass, .04)).stop(1, shade(grass, -.14)); c.fillGrad(gr); c.fillRect(0, hy + 3, W, H + g.ext - hy - 3);
        int dirt = gnd(L, "#a98a62");
        c.fillStyle(dirt); c.beginPath(); c.moveTo(W * .5, hy + 8); c.bezierTo(W * .46, g.nearTop * .85, W * .1, g.nearTop + 2, -W * .1, H); c.lineTo(W * .78, H); c.bezierTo(W * .6, g.nearTop + 4, W * .56, hy + 22, W * .56, hy + 8); c.closePath(); c.fill();
        { double sl = (W * .78 - W * .6) / Math.max(1, H - g.nearTop - 4), sr = (-W * .1 - W * .1) / Math.max(1, H - g.nearTop - 2); c.beginPath(); c.moveTo(-W * .1, H - .5); c.lineTo(W * .78, H - .5); c.lineTo(W * .78 + sl * g.ext, H + g.ext); c.lineTo(-W * .1 + sr * g.ext, H + g.ext); c.closePath(); c.fill(); }       // 길을 같은 기울기로 아래까지 잇는다
        c.fillStyle("rgba(0,0,0,.09)"); for (i = 0; i < 18; i++) { c.beginPath(); c.ellipse(rng.r(W * .08, W * .7), rng.r(g.nearTop - 4, H - 3), rng.r(1.6, 4), rng.r(.8, 1.6), 0, 0, PI2); c.fill(); }
        c.fillStyle(dim(L, "#7e8590")); for (i = 0; i < 9; i++) { c.beginPath(); c.ellipse(rng.r(W * .05, W * .75), rng.r(g.nearTop, H - 3), rng.r(2, 4.4), rng.r(1.2, 2.4), 0, 0, PI2); c.fill(); }
        c.strokeStyle(dim(L, "#6b4f33")); c.lineWidth(1.6); for (i = 0; i < 3; i++) { double rx = rng.r(W * .2, W * .6), ry = rng.r(g.nearTop + 6, H - 8); c.beginPath(); c.moveTo(rx, ry); c.quadTo(rx + 8, ry - 3, rx + 15, ry + 1); c.stroke(); }
        if (wet(L)) for (i = 0; i < 4; i++) { double pxx = rng.r(.15, .6) * W, pyy = rng.r(g.nearTop + 10, H - 6), prx = rng.r(8, 14); c.fillStyle("rgba(70,90,120,.5)"); c.beginPath(); c.ellipse(pxx, pyy, prx, prx * .26, 0, 0, PI2); c.fill(); }
        if (snow) for (i = 0; i < 9; i++) { c.fillStyle("rgba(255,255,255,.88)"); c.beginPath(); c.ellipse(rng.r(0, W), rng.r(g.nearTop + 2, H - 3), rng.r(8, 20), rng.r(2, 4), 0, 0, PI2); c.fill(); }
        // 이정표 · 나무 울타리
        double sx = W * .84, sy = g.nearTop + 6;
        c.fillStyle(dim(L, "#6b4f33")); c.fillRect(sx - 1.4, sy - 30, 2.8, 30);
        c.fillStyle(dim(L, "#8a6a43")); rr(c, sx - 12, sy - 30, 24, 9, 1.6); c.fill(); c.fillStyle("#f6e7b4"); c.font(5.8); c.fillTextC("등산로", sx, sy - 25.4);
        if (snow) { c.fillStyle("rgba(255,255,255,.92)"); c.fillRect(sx - 12, sy - 32, 24, 2.2); }
        c.strokeStyle(dim(L, "#6b4f33")); c.lineWidth(1.6); c.beginPath(); c.moveTo(W * .04, g.nearTop - 6); c.lineTo(W * .2, g.nearTop - 6); c.moveTo(W * .04, g.nearTop - 1); c.lineTo(W * .2, g.nearTop - 1); c.stroke();
        c.lineWidth(2.4); for (double x : new double[]{W * .04, W * .12, W * .2}) { c.beginPath(); c.moveTo(x, g.nearTop - 9); c.lineTo(x, g.nearTop + 3); c.stroke(); }
    }
}

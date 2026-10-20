package com.dullyyj.subway;

import static com.dullyyj.subway.SceneUtil.*;

/**
 * 장면의 '정해진 그림'들: 하늘·도시·가로수·땅 배경, 버스·자동차, 정류장·역 입구, 말풍선, 우산.
 * 웹 _CS 의 같은 이름 함수들을 그대로 옮긴 것이다(색·모양·비율 동일). 판단은 없다 — 받은 값대로 그리기만 한다.
 */
public final class SceneArt {
    private SceneArt() {}

    // ── 엔진이 준 시간대·날씨 이름 → 그림 색표(그림 규칙일 뿐 판단이 아니다) ──
    static final class Sky { final int[] c; final double lum, sx, sy; final boolean moon;
        Sky(String a, String b, String c2, double lum, double sx, double sy, boolean moon) { this.c = new int[]{css(a), css(b), css(c2)}; this.lum = lum; this.sx = sx; this.sy = sy; this.moon = moon; } }
    static Sky sky(String slot) {
        switch (slot) {
            case "dawn": return new Sky("#1d2354", "#6a4f93", "#f6a58f", .62, .2, .47, false);
            case "morning": return new Sky("#74c4fb", "#b2e0ff", "#fff0cd", 1, .3, .2, false);
            case "afternoon": return new Sky("#68b4ee", "#a8d9f7", "#ffe7b5", .98, .74, .2, false);
            case "evening": return new Sky("#3a3a7c", "#d3687a", "#ffbd78", .7, .86, .43, false);
            case "night": return new Sky("#060a22", "#131b4b", "#2a3478", .32, .74, .18, true);
            default: return new Sky("#4aa3f2", "#8accfb", "#d9f1ff", 1.05, .5, .1, false);
        }
    }
    static double wxMix(String wk) {
        switch (wk) { case "cloudy": return .22; case "overcast": return .6; case "rain": return .74; case "snow": return .5; case "fog": return .55; default: return 0; }
    }
    /** 그릴 때 쓰는 값 */
    public static final class Pal {
        public String slot, wk, season; public int[] c = new int[3]; public double lum, sunX, sunY; public boolean moon, night, lit, hidesSun;
    }
    public static Pal paint(SceneModel.Look lk) {
        Sky S = sky(lk.slot); String wk = lk.wk == null || lk.wk.isEmpty() ? "clear" : lk.wk;
        int gray = mix(wk.equals("snow") ? "#d5dde8" : "#8d98a8", "#141a2c", clamp(1 - S.lum, 0, .9) * (wk.equals("snow") ? .75 : 1));
        double m = wxMix(wk);
        Pal p = new Pal();
        p.slot = lk.slot; p.wk = wk; p.season = lk.season == null || lk.season.isEmpty() ? "autumn" : lk.season;
        for (int i = 0; i < 3; i++) p.c[i] = mix(S.c[i], gray, m);
        p.lum = S.lum; p.sunX = S.sx; p.sunY = S.sy; p.moon = S.moon; p.night = lk.night; p.lit = lk.lit; p.hidesSun = lk.hidesSun;
        return p;
    }

    public static final class Geom { public double W, H, hy, roadY0, nearTop, floor; }
    public static Geom geom(double W, double H) {
        boolean tall = H > 230; Geom g = new Geom();
        g.W = W; g.H = H; g.hy = Math.round(H * (tall ? 0.44 : 0.5)); g.roadY0 = g.hy + 5; g.nearTop = Math.round(H * (tall ? 0.62 : 0.7)); g.floor = H - 4;
        return g;
    }

    public static final class Bg { public SceneCv.Layer sky, far, mid, gnd; public int tw; }

    public static Bg buildBG(SceneCv root, Pal L, Geom g, double dpr, String season, boolean dark) {
        double W = g.W, H = g.H, hy = g.hy; int tw = (int) Math.ceil(W * 1.7);
        Seeded rng = new Seeded(L.slot.length() * 977 + L.wk.length() * 131 + 7);
        Bg bg = new Bg(); bg.tw = tw;
        bg.sky = root.newLayer(W, H, dpr); bg.far = root.newLayer(tw, H, dpr); bg.mid = root.newLayer(tw, H, dpr); bg.gnd = root.newLayer(W, H, dpr);
        SceneCv c; SceneCv.Grad gr; double x; int i;
        // 하늘
        c = bg.sky.cv();
        gr = c.linear(0, 0, 0, hy + 6).stop(0, L.c[0]).stop(.62, L.c[1]).stop(1, L.c[2]); c.fillGrad(gr); c.fillRect(0, 0, W, H);
        double sx = L.sunX * W, sy = L.sunY * H, glow = L.hidesSun ? .12 : (L.wk.equals("cloudy") ? .5 : 1);
        if (!L.moon) {
            SceneCv.Grad rg = c.radial(sx, sy, 0, sx, sy, H * .5).stop(0, rgba(255, 236, 170, .55 * glow)).stop(1, rgba(255, 236, 170, 0));
            c.fillGrad(rg); c.fillRect(0, 0, W, hy + 8);
            if (!L.hidesSun) {
                c.fillStyle(L.slot.equals("evening") || L.slot.equals("dawn") ? "#ffd7a0" : "#fff2b3"); c.beginPath(); c.arc(sx, sy, 8.5, 0, PI2); c.fill();
                c.fillStyle("rgba(255,255,255,.55)"); c.beginPath(); c.arc(sx - 2, sy - 2, 4, 0, PI2); c.fill();
            }
        } else {
            SceneCv.Grad mg = c.radial(sx, sy, 0, sx, sy, 34).stop(0, rgba(210, 225, 255, .35 * glow)).stop(1, rgba(210, 225, 255, 0));
            c.fillGrad(mg); c.fillRect(sx - 40, sy - 40, 80, 80);
            if (!L.hidesSun) {
                c.fillStyle("#f4f1dc"); c.beginPath(); c.arc(sx, sy, 8, 0, PI2); c.fill();
                c.fillStyle("rgba(200,205,185,.55)"); c.beginPath(); c.arc(sx - 2.5, sy + 1.5, 2, 0, PI2); c.arc(sx + 2.5, sy - 2.5, 1.4, 0, PI2); c.fill();
            }
        }
        // 먼 도시: 건물 실루엣(+켜진 창)
        c = bg.far.cv();
        int fcol = mix(L.c[2], css(L.night ? "#0b1030" : "#39435f"), L.night ? .6 : .3);
        java.util.ArrayList<double[]> bl = new java.util.ArrayList<>();
        x = -6;
        while (x < tw) { double bw = rng.r(11, 25), bh = rng.r(hy * .2, hy * .6); bl.add(new double[]{x, bw, bh}); x += bw + rng.r(0, 3); }
        for (double[] b : bl) for (int oi = 0; oi < 2; oi++) {
            double off = oi == 0 ? 0 : -tw, bx = b[0] + off; if (bx > tw || bx + b[1] < 0) continue;
            c.fillStyle(fcol); c.fillRect(bx, hy + 4 - b[2], b[1], b[2]);
            c.fillStyle(shade(fcol, .08)); c.fillRect(bx, hy + 4 - b[2], b[1], 2);
            for (double wy = hy + 4 - b[2] + 5; wy < hy - 2; wy += 6) for (double wx = bx + 3; wx < bx + b[1] - 3; wx += 5) {
                if (L.lit && rng.r() < .33) { c.fillStyle(L.night ? "rgba(255,226,140,.85)" : "rgba(255,214,150,.6)"); c.fillRect(wx, wy, 2.2, 2.6); }
                else if (!L.lit && rng.r() < .5) { c.fillStyle("rgba(255,255,255,.12)"); c.fillRect(wx, wy, 2.2, 2.6); }
            }
            if (L.wk.equals("snow")) { c.fillStyle("rgba(255,255,255,.85)"); c.fillRect(bx, hy + 4 - b[2] - 1, b[1], 2.4); }
        }
        // 가로수(계절 색)
        c = bg.mid.cv();
        String[] leaf = season.equals("autumn") ? new String[]{"#e2893a", "#d9a23b", "#c9602f"} : season.equals("spring") ? new String[]{"#f2b6cc", "#a9d98b", "#f7c7d8"}
                : season.equals("summer") ? new String[]{"#4fa866", "#3f9a5a", "#62b878"} : new String[]{"#7a6a5a", "#8a7868", "#6b5d50"};
        x = 6;
        while (x < tw) {
            double th = rng.r(hy * .34, hy * .5), tx = x, tr = rng.r(9, 14); String cc = leaf[rng.pick(leaf.length)];
            for (int oi = 0; oi < 2; oi++) {
                double off = oi == 0 ? 0 : -tw, px = tx + off; if (px > tw + 20 || px < -20) continue;
                c.fillStyle(mix("#5b4636", "#000000", L.night ? .5 : .1)); c.fillRect(px - 1.4, hy + 4 - th * .62, 2.8, th * .62);
                int col = mix(css(cc), css(L.night ? "#0a1020" : L.lit ? "#3a2a4a" : "#ffffff"), L.night ? .6 : L.lit ? .35 : .04);
                if (L.wk.equals("overcast") || L.wk.equals("rain")) col = mix(col, "#7b8594", .3);
                c.fillStyle(col); c.beginPath(); c.arc(px, hy + 4 - th * .72, tr, 0, PI2); c.arc(px - tr * .7, hy + 4 - th * .56, tr * .75, 0, PI2); c.arc(px + tr * .7, hy + 4 - th * .56, tr * .75, 0, PI2); c.fill();
                c.fillStyle("rgba(255,255,255,.12)"); c.beginPath(); c.arc(px - tr * .25, hy + 4 - th * .8, tr * .5, 0, PI2); c.fill();
                if (L.wk.equals("snow")) { c.fillStyle("rgba(255,255,255,.9)"); c.beginPath(); c.ellipse(px, hy + 4 - th * .72 - tr * .72, tr * .8, 2.6, 0, 0, PI2); c.fill(); }
            }
            x += rng.r(17, 36);
        }
        // 땅: 건너편 인도 · 찻길 · 가까운 인도(원근선)
        c = bg.gnd.cv();
        boolean wet = L.wk.equals("rain"), snowy = L.wk.equals("snow"); double lum = L.lum;
        int walk = mix(css(dark ? "#cbbfae" : "#e7dccb"), css("#14182a"), clamp(1 - lum, 0, .9) * .7), road = mix("#6c7078", "#0d1018", clamp(1 - lum, 0, .9) * .75), far2 = mix(walk, "#8d8678", .25);
        if (wet) { walk = mix(walk, "#4b5668", .4); road = mix(road, "#2a313e", .35); }
        if (snowy) { walk = mix(walk, "#ffffff", .6); road = mix(road, "#cfd8e4", .35); far2 = mix(far2, "#ffffff", .5); }
        c.fillStyle(far2); c.fillRect(0, hy + 3, W, 3);
        c.fillStyle(road); c.fillRect(0, g.roadY0, W, g.nearTop - g.roadY0);
        c.fillStyle("rgba(255,255,255,.5)"); for (x = 4; x < W; x += 24) c.fillRect(x, (g.roadY0 + g.nearTop) / 2 - .5, 12, 1.6);
        gr = c.linear(0, g.nearTop, 0, H).stop(0, shade(walk, .06)).stop(1, shade(walk, -.1)); c.fillGrad(gr); c.fillRect(0, g.nearTop, W, H - g.nearTop);
        c.fillStyle(shade(walk, .2)); c.fillRect(0, g.nearTop - 1, W, 2.2); c.fillStyle("rgba(0,0,0,.18)"); c.fillRect(0, g.nearTop + 1.2, W, 1.4);
        c.strokeStyle("rgba(0,0,0,.09)"); c.lineWidth(1);
        for (i = 1; i <= 5; i++) { double yy = g.nearTop + Math.pow(i / 5.0, 1.5) * (H - g.nearTop); c.beginPath(); c.moveTo(0, yy); c.lineTo(W, yy); c.stroke(); }
        for (i = -8; i <= 8; i++) { c.beginPath(); c.moveTo(W / 2 + i * 16, g.nearTop); c.lineTo(W / 2 + i * 44, H); c.stroke(); }
        if (wet) for (i = 0; i < 5; i++) {
            double pxx = rng.r(.08, .92) * W, pyy = rng.r(g.nearTop + 10, H - 6), prx = rng.r(9, 18);
            c.fillStyle("rgba(70,90,120,.55)"); c.beginPath(); c.ellipse(pxx, pyy, prx, prx * .26, 0, 0, PI2); c.fill();
            c.fillStyle("rgba(210,230,255,.35)"); c.beginPath(); c.ellipse(pxx - prx * .2, pyy - 1, prx * .5, prx * .08, 0, 0, PI2); c.fill();
        }
        if (snowy) {
            for (i = 0; i < 9; i++) { double snx = rng.r(0, 1) * W, sny = rng.r(g.nearTop + 3, H - 3); c.fillStyle("rgba(255,255,255,.85)"); double e1 = rng.r(8, 22), e2 = rng.r(2, 4); c.beginPath(); c.ellipse(snx, sny, e1, e2, 0, 0, PI2); c.fill(); }
            c.fillStyle("rgba(255,255,255,.9)"); c.fillRect(0, g.nearTop - 2, W, 2.4);
        }
        // 가로등(저녁·밤·새벽엔 불이 켜진다)
        for (double fx : new double[]{.07, .93}) {
            double lx = fx * W, ly = g.nearTop + 2, hx2 = lx + (fx < .5 ? 9 : -9);
            c.fillStyle("#39404f"); c.fillRect(lx - 1.2, ly - 38, 2.4, 38); c.fillRect(Math.min(lx, hx2) - 1.2, ly - 38, 10.4, 2.2);
            if (L.lit) { SceneCv.Grad lg = c.radial(hx2, ly - 35, 0, hx2, ly - 35, 38).stop(0, rgba(255, 224, 140, .75)).stop(1, rgba(255, 224, 140, 0)); c.fillGrad(lg); c.fillRect(hx2 - 40, ly - 76, 80, 80); }
            c.fillStyle(L.lit ? "#fff0b0" : "#9aa3b2"); c.beginPath(); c.ellipse(hx2, ly - 36, 4, 2.4, 0, 0, PI2); c.fill();
        }
        return bg;
    }

    // ── 버스·자동차 그림 ──
    public static void drawWheel(SceneCv c, double x, double y, double r, double rot) {
        c.fillStyle("#1a1d24"); c.beginPath(); c.arc(x, y, r, 0, PI2); c.fill();
        c.fillStyle("#9aa1ad"); c.beginPath(); c.arc(x, y, r * .5, 0, PI2); c.fill();
        c.strokeStyle("#4b5260"); c.lineWidth(Math.max(.8, r * .12));
        for (int i = 0; i < 4; i++) { double a = rot + i * PI / 2; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * r * .5, y + Math.sin(a) * r * .5); c.stroke(); }
        c.fillStyle("#d8dde6"); c.beginPath(); c.arc(x, y, r * .15, 0, PI2); c.fill();
    }
    public static final class VehOpt { public int color = css("#2f6fd6"); public double door, door2, rot; public String no = ""; public int dir = 1; public boolean night; }

    public static void drawBus(SceneCv c, double cx, double gy, double L, VehOpt o) {
        double h = L * .4, wr = L * .066, y0 = gy - h - wr * .55, x0 = cx - L / 2; int col = o.color, i;
        c.save(); if (o.dir < 0) { c.translate(cx, 0); c.scale(-1, 1); c.translate(-cx, 0); }
        c.fillStyle("rgba(0,0,0,.26)"); c.beginPath(); c.ellipse(cx, gy + 1, L * .5, L * .04, 0, 0, PI2); c.fill();
        SceneCv.Grad g = c.linear(0, y0, 0, y0 + h).stop(0, shade(col, .28)).stop(.45, col).stop(1, shade(col, -.3));
        c.fillGrad(g); rr(c, x0, y0, L, h, L * .055); c.fill();
        c.fillStyle(shade(col, .38)); rr(c, x0 + L * .22, y0 - L * .028, L * .26, L * .035, L * .012); c.fill();
        c.fillStyle("rgba(255,255,255,.88)"); c.fillRect(x0, y0 + h * .66, L, h * .07);
        double wy = y0 + h * .13, wh = h * .42;
        int glassTop = css(o.night ? "#314a73" : "#cfeaff"), glassBot = css(o.night ? "#1b2845" : "#78acdb");
        SceneCv.Grad wg = c.linear(0, wy, 0, wy + wh).stop(0, glassTop).stop(1, glassBot);
        c.fillGrad(wg); rr(c, x0 + L * .05, wy, L * .8, wh, L * .02); c.fill();
        c.fillGrad(wg); c.beginPath(); c.moveTo(x0 + L * .88, wy); c.lineTo(x0 + L * .975, wy + wh * .12); c.lineTo(x0 + L * .985, wy + wh); c.lineTo(x0 + L * .88, wy + wh); c.closePath(); c.fill();
        c.fillStyle(shade(col, -.18)); for (i = 1; i < 5; i++) c.fillRect(x0 + L * (.05 + i * .16) - 1, wy, 2, wh);
        c.fillStyle("rgba(255,255,255,.3)"); c.beginPath(); c.moveTo(x0 + L * .12, wy); c.lineTo(x0 + L * .2, wy); c.lineTo(x0 + L * .12, wy + wh); c.lineTo(x0 + L * .06, wy + wh); c.closePath(); c.fill();
        double[][] ds = {{.69, .12}, {.3, .12}};
        for (int k = 0; k < 2; k++) {
            double dx = x0 + L * ds[k][0], dw = L * ds[k][1], dy = y0 + h * .13, dh = h * .83 - wr * .2, op = k == 0 ? o.door : o.door2;
            c.fillStyle(shade(col, -.35)); c.fillRect(dx - 1, dy - 1, dw + 2, dh + 1);
            if (op > 0) {
                c.fillStyle(o.night ? "#ffe9b0" : "#3c3f4c"); c.fillRect(dx, dy, dw, dh); c.fillStyle("rgba(255,240,200,.35)"); c.fillRect(dx, dy, dw, dh * .4);
                double pw = dw * .5 * (1 - op); c.fillGrad(wg); c.fillRect(dx, dy, pw, dh * .62); c.fillRect(dx + dw - pw, dy, pw, dh * .62);
            } else {
                c.fillGrad(wg); c.fillRect(dx, dy, dw * .47, dh * .62); c.fillRect(dx + dw * .53, dy, dw * .47, dh * .62);
                c.fillStyle(shade(col, -.05)); c.fillRect(dx, dy + dh * .62, dw, dh * .38);
            }
        }
        c.fillStyle("#10131a"); rr(c, x0 + L * .66, y0 + h * .02, L * .22, h * .1, 2); c.fill();
        c.fillStyle("#ffb347"); c.font(Math.max(5, h * .09));
        if (o.dir < 0) { c.save(); c.translate(x0 + L * .77, y0 + h * .07); c.scale(-1, 1); c.fillTextC(o.no, 0, 0); c.restore(); } else c.fillTextC(o.no, x0 + L * .77, y0 + h * .07);
        for (double f : new double[]{.2, .74}) { double wx = x0 + L * f; c.fillStyle("#12151c"); c.beginPath(); c.arc(wx, gy - wr, wr * 1.28, PI, 0); c.fill(); drawWheel(c, wx, gy - wr, wr, o.rot); }
        c.fillStyle("#fff2b8"); c.beginPath(); c.ellipse(x0 + L - 2, y0 + h * .78, 2.6, 3.4, 0, 0, PI2); c.fill();
        c.fillStyle("#e33"); c.fillRect(x0 - 1, y0 + h * .72, 3, 5);
        if (o.night) { SceneCv.Grad hg = c.radial(x0 + L, y0 + h * .78, 0, x0 + L, y0 + h * .78, L * .4).stop(0, rgba(255, 240, 170, .5)).stop(1, rgba(255, 240, 170, 0)); c.fillGrad(hg); c.fillRect(x0 + L - 4, y0 + h * .4, L * .5, h * .8); }
        c.restore();
    }
    public static void drawCar(SceneCv c, double cx, double gy, double L, VehOpt o) {
        double h = L * .42, wr = L * .12, y0 = gy - h - wr * .3; int col = o.color;
        c.save(); if (o.dir < 0) { c.translate(cx, 0); c.scale(-1, 1); c.translate(-cx, 0); }
        c.fillStyle("rgba(0,0,0,.24)"); c.beginPath(); c.ellipse(cx, gy + 1, L * .5, L * .07, 0, 0, PI2); c.fill();
        double x0 = cx - L / 2; SceneCv.Grad g = c.linear(0, y0, 0, y0 + h).stop(0, shade(col, .25)).stop(1, shade(col, -.28));
        c.fillGrad(g); rr(c, x0, y0 + h * .38, L, h * .5, h * .22); c.fill();
        c.beginPath(); c.moveTo(x0 + L * .2, y0 + h * .42); c.quadTo(x0 + L * .27, y0, x0 + L * .42, y0); c.lineTo(x0 + L * .64, y0); c.quadTo(x0 + L * .78, y0 + h * .05, x0 + L * .84, y0 + h * .42); c.closePath(); c.fill();
        c.fillStyle(o.night ? "#27375a" : "#bfe3ff"); c.beginPath(); c.moveTo(x0 + L * .26, y0 + h * .4); c.quadTo(x0 + L * .31, y0 + h * .1, x0 + L * .43, y0 + h * .1); c.lineTo(x0 + L * .62, y0 + h * .1); c.quadTo(x0 + L * .73, y0 + h * .14, x0 + L * .78, y0 + h * .4); c.closePath(); c.fill();
        c.fillStyle("rgba(0,0,0,.25)"); c.fillRect(x0 + L * .5, y0 + h * .1, 1.4, h * .3);
        for (double f : new double[]{.24, .76}) drawWheel(c, x0 + L * f, gy - wr, wr, o.rot);
        c.fillStyle("#fff3b8"); c.beginPath(); c.ellipse(x0 + L - 1.5, y0 + h * .55, 1.8, 2.2, 0, 0, PI2); c.fill();
        c.restore();
    }

    // ── 정류장 · 지하철 역 입구 ──
    public static void drawStop(SceneCv c, Geom g, double x, Pal Lk) {
        double gy = g.nearTop + 6; boolean lit = Lk.lit; int i;
        c.fillStyle("#4a5160"); c.fillRect(x - 1.3, gy - 38, 2.6, 38);
        if (lit) { SceneCv.Grad sg = c.radial(x, gy - 40, 0, x, gy - 40, 22).stop(0, rgba(150, 200, 255, .55)).stop(1, rgba(150, 200, 255, 0)); c.fillGrad(sg); c.fillRect(x - 24, gy - 64, 48, 48); }
        c.fillStyle("#2f6fd6"); c.beginPath(); c.arc(x, gy - 42, 8.5, 0, PI2); c.fill(); c.strokeStyle("#fff"); c.lineWidth(1.2); c.stroke();
        c.fillStyle("#fff"); rr(c, x - 4.8, gy - 46, 9.6, 7.5, 1.6); c.fill(); c.fillStyle("#2f6fd6"); c.fillRect(x - 3.6, gy - 44.6, 7.2, 2.8);
        c.fillStyle("#fff"); c.beginPath(); c.arc(x - 2.7, gy - 38.5, 1.1, 0, PI2); c.arc(x + 2.7, gy - 38.5, 1.1, 0, PI2); c.fill();
        double sx = x + 24, sw = 58, top = gy - 34;
        c.fillStyle(rgba(160, 200, 230, lit ? .2 : .26)); c.fillRect(sx, top + 4, sw, 34);
        c.strokeStyle("rgba(255,255,255,.35)"); c.lineWidth(1); c.beginPath(); c.moveTo(sx + 6, top + 6); c.lineTo(sx + 16, top + 6); c.moveTo(sx + 30, top + 6); c.lineTo(sx + 36, top + 6); c.stroke();
        c.fillStyle("#4a5160"); c.fillRect(sx - 1, top + 2, 2.4, 38); c.fillRect(sx + sw - 1.4, top + 2, 2.4, 38);
        SceneCv.Grad rg = c.linear(0, top - 2, 0, top + 5).stop(0, css("#6b7385")).stop(1, css("#3c4352")); c.fillGrad(rg); rr(c, sx - 5, top - 2, sw + 10, 6, 2.6); c.fill();
        if (Lk.wk.equals("snow")) { c.fillStyle("rgba(255,255,255,.95)"); rr(c, sx - 5, top - 4, sw + 10, 3.4, 1.6); c.fill(); }
        c.fillStyle("#8a6a49"); for (i = 0; i < 3; i++) c.fillRect(sx + 9, top + 24 + i * 2.2, sw - 18, 1.5);
        c.fillStyle("#5a4630"); c.fillRect(sx + 11, top + 31, 2.4, 6); c.fillRect(sx + sw - 14, top + 31, 2.4, 6);
        if (lit) { c.fillStyle("rgba(255,238,170,.85)"); c.fillRect(sx + sw - 13, top + 9, 8, 12); }
    }
    static int lineColor(String line) {
        switch (line == null ? "" : line) {
            case "1": return css("#0052a4"); case "2": return css("#00a84d"); case "3": return css("#ef7c1c"); case "4": return css("#00a5de");
            case "5": return css("#996cac"); case "6": return css("#cd7c2f"); case "7": return css("#747f00"); case "8": return css("#e6186c"); case "9": return css("#bdb092");
            default: return css("#4a6fa5");
        }
    }
    public static void drawEntrance(SceneCv c, Geom g, double x, Pal Lk, String line) {
        double gy = g.nearTop + 7; boolean lit = Lk.lit; int col = lineColor(line), i;
        c.fillStyle("#2b303c"); rr(c, x - 21, gy - 27, 42, 28, 5); c.fill();
        c.fillStyle("#3d4352"); for (i = 0; i < 4; i++) c.fillRect(x - 17 + i * 3, gy - 22 + i * 5, 34 - i * 6, 2.4);
        if (lit) { SceneCv.Grad eg = c.radial(x, gy - 10, 0, x, gy - 10, 28).stop(0, rgba(255, 230, 160, .5)).stop(1, rgba(255, 230, 160, 0)); c.fillGrad(eg); c.fillRect(x - 30, gy - 38, 60, 44); }
        SceneCv.Grad rg = c.linear(0, gy - 38, 0, gy - 26).stop(0, css("#8a93a6")).stop(1, css("#4a5160")); c.fillGrad(rg);
        c.beginPath(); c.moveTo(x - 27, gy - 26); c.lineTo(x - 19, gy - 37); c.lineTo(x + 19, gy - 37); c.lineTo(x + 27, gy - 26); c.closePath(); c.fill();
        if (Lk.wk.equals("snow")) { c.fillStyle("rgba(255,255,255,.95)"); c.beginPath(); c.moveTo(x - 20, gy - 36); c.lineTo(x - 17, gy - 40); c.lineTo(x + 17, gy - 40); c.lineTo(x + 20, gy - 36); c.closePath(); c.fill(); }
        c.fillStyle("#4a5160"); c.fillRect(x - 25, gy - 27, 2.6, 28); c.fillRect(x + 22.4, gy - 27, 2.6, 28);
        double sx = x + 36; c.fillStyle("#4a5160"); c.fillRect(sx - 1.2, gy - 34, 2.4, 34);
        if (lit) { SceneCv.Grad sg = c.radial(sx, gy - 38, 0, sx, gy - 38, 20).stop(0, rgba(255, 255, 255, .5)).stop(1, rgba(255, 255, 255, 0)); c.fillGrad(sg); c.fillRect(sx - 22, gy - 60, 44, 44); }
        c.fillStyle(col); c.beginPath(); c.arc(sx, gy - 39, 8.6, 0, PI2); c.fill(); c.strokeStyle("#fff"); c.lineWidth(1.3); c.stroke();
        String ln = line == null || line.isEmpty() ? "역" : line;
        c.fillStyle("#fff"); c.font(ln.length() > 1 ? 7 : 10); c.fillTextC(ln, sx, gy - 38.6);
    }

    public static void drawBubble(SceneCv c, double x, double y, String text) {
        c.font(10); double w = c.measureText(text) + 10;
        c.fillStyle("rgba(255,255,255,.95)"); rr(c, x - w / 2, y - 14, w, 15, 6); c.fill();
        c.beginPath(); c.moveTo(x - 3, y + .5); c.lineTo(x, y + 5); c.lineTo(x + 3, y + .5); c.fill();
        c.fillStyle("#2a3142"); c.fillTextC(text, x, y - 6);
    }
    public static void drawUmbrella(SceneCv c, double x, double y, double s, String id) {
        String col = id.equals("chaeng") ? "#ffb74d" : id.equals("lovel") ? "#ff7aa5" : id.equals("dolsom") ? "#5aa9ff" : id.equals("ppopu") ? "#7bd88f" : id.equals("sul") ? "#ffd54f" : "#b388ff";
        double r = 17 * s;
        c.save(); c.translate(x, y - 6 * s);
        c.strokeStyle("#555c6b"); c.lineWidth(1.4); c.beginPath(); c.moveTo(0, -1); c.lineTo(0, 15 * s); c.stroke();
        c.fillStyle(col); c.beginPath(); c.moveTo(-r, 0); c.quadTo(-r * .9, -r * .95, 0, -r * 1.02); c.quadTo(r * .9, -r * .95, r, 0); c.quadTo(r * .5, -3, 0, 0); c.quadTo(-r * .5, -3, -r, 0); c.closePath(); c.fill();
        c.strokeStyle("rgba(255,255,255,.55)"); c.lineWidth(.9); c.beginPath(); c.moveTo(0, -r); c.lineTo(0, -1); c.moveTo(-r * .55, -r * .72); c.lineTo(-r * .3, -1); c.moveTo(r * .55, -r * .72); c.lineTo(r * .3, -1); c.stroke();
        c.restore();
    }
    public static void cloud(SceneCv c, double x, double y, double r, int col) {
        c.fillStyle(col); c.beginPath(); c.ellipse(x, y, r * 1.5, r * .6, 0, 0, PI2); c.ellipse(x - r * .75, y + r * .12, r * .85, r * .5, 0, 0, PI2); c.ellipse(x + r * .8, y + r * .14, r * .9, r * .5, 0, 0, PI2); c.ellipse(x - r * .1, y - r * .32, r * .75, r * .55, 0, 0, PI2); c.fill();
    }
    public static void heartP(SceneCv c, double x, double y, double s) {
        c.beginPath(); c.moveTo(x, y + s * .9); c.bezierTo(x - s * 1.7, y - s * .1, x - s * .8, y - s * 1.25, x, y - s * .45); c.bezierTo(x + s * .8, y - s * 1.25, x + s * 1.7, y - s * .1, x, y + s * .9); c.fill();
    }
    public static void star4(SceneCv c, double x, double y, double r, double rot) {
        c.beginPath();
        for (int i = 0; i < 8; i++) { double an = rot + i * PI / 4, rd = i % 2 != 0 ? r * .4 : r; if (i != 0) c.lineTo(x + Math.cos(an) * rd, y + Math.sin(an) * rd); else c.moveTo(x + Math.cos(an) * rd, y + Math.sin(an) * rd); }
        c.closePath(); c.fill();
    }
}

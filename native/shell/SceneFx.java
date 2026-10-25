package com.dullyyj.subway;

import static com.dullyyj.subway.SceneUtil.*;

/**
 * 장면의 날씨 연출과 장소별 움직임 — YJ(2026-10-25) "날씨에 맞춰 비·눈·햇빛·바람 같은 이펙트를 연출하고, 장소를 다양하게".
 * ★ 판단은 없다. 햇빛(look.sun)·더위(look.hot)·추위(look.cold)·바람 세기(look.wind)·장소(look.place)는 엔진(/scene)이 정한 값이고,
 *   여기는 그 값대로 빛줄기 · 아지랑이 · 나뭇잎 · 바람줄기 · 흔들리는 나무 · 분수 · 물결 · 배 · 깃발 · 김 · 전구줄 · 안개 · 반딧불을 그릴 뿐이다.
 * android.* 를 쓰지 않는다(JVM 에서 PNG 로 뽑아 눈으로 확인한다).
 */
final class SceneFx {
    private SceneFx() {}

    // ═══ 가까운 풍경(나무·가게)을 바람에 흔든다 — 위쪽일수록 많이 ═══
    static void drawMid(SceneCore S, SceneCv c, SceneCv.Layer mid, int tw) {
        int wl = S.L.wind;
        if (wl <= 0) { c.drawImage(mid, 0, 0, tw, S.H); return; }
        double dy = mid.h() / S.H, lim = S.g.hy + 12, amp = wl == 1 ? 1.0 : 2.2, sp = wl == 1 ? 1.5 : 2.6, band = 5;
        for (double y = 0; y < S.H; y += band) {
            double h = Math.min(band, S.H - y), rel = clamp(1 - y / lim, 0, 1);
            double off = y < lim ? (Math.sin(S.t * sp + y * .05) * amp + wl * .9) * (.25 + rel * .75) : 0;
            c.drawImage(mid, 0, y * dy, mid.w(), h * dy, off, y, tw, h);
        }
    }

    // ═══ 햇빛: 따뜻한 번짐 · 빛줄기 · 렌즈 반사 ═══
    static void sun(SceneCore S, SceneCv c, double tt) {
        SceneArt.Pal L = S.L; if (!L.sun || L.night) return;
        double sx = L.sunX * S.W, sy = L.sunY * S.H, k = L.bright ? 1.4 : 1, W = S.W, H = S.H;
        SceneCv.Grad g = c.radial(sx, sy, 0, sx, sy, W * .8).stop(0, rgba(255, 240, 190, .22 * k)).stop(.5, rgba(255, 236, 180, .08 * k)).stop(1, rgba(255, 236, 180, 0));
        c.fillGrad(g); c.fillRect(0, 0, W, H);
        for (int i = 0; i < 6; i++) {
            double a = PI * (.2 + i * .115) + Math.sin(tt * .35 + i) * .03, w = .035 + .01 * (i % 3), len = H * 1.5;
            c.fillStyle(rgba(255, 244, 205, (.06 + .03 * Math.sin(tt * .8 + i * 1.7)) * k));
            c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + Math.cos(a - w) * len, sy + Math.sin(a - w) * len); c.lineTo(sx + Math.cos(a + w) * len, sy + Math.sin(a + w) * len); c.closePath(); c.fill();
        }
        double cx = W * .5, cy = H * .5;
        for (int j = 0; j < 3; j++) {
            double u = .38 + j * .3, x = sx + (cx - sx) * u * 1.3, y = sy + (cy - sy) * u * 1.3, r = 4 + j * 3.2;
            c.fillStyle(rgba(255, j == 1 ? 210 : 245, j == 1 ? 170 : 200, .07 * k)); c.beginPath(); c.arc(x, y, r, 0, PI2); c.fill();
        }
    }

    // ═══ 더위: 땅 위 아지랑이 ═══
    static void heat(SceneCore S, SceneCv c, double tt) {
        SceneArt.Pal L = S.L; if (!L.hot || L.night) return;
        c.lineWidth(1.4);
        for (int i = 0; i < 5; i++) {
            double y = S.g.nearTop - 22 + i * 15; c.strokeStyle(rgba(255, 255, 255, .12 + .05 * Math.sin(tt * 1.5 + i)));
            c.beginPath(); for (double x = 0; x <= S.W; x += 5) { double yy = y + Math.sin(x * .07 + tt * 2.8 + i * 1.3) * 1.7; if (x == 0) c.moveTo(x, yy); else c.lineTo(x, yy); } c.stroke();
        }
    }

    // ═══ 추위: 옅은 푸른 기운 ═══
    static void cold(SceneCore S, SceneCv c) {
        if (!S.L.cold) return;
        SceneCv.Grad g = c.linear(0, 0, 0, S.H).stop(0, rgba(170, 205, 255, .1)).stop(1, rgba(170, 205, 255, .04)); c.fillGrad(g); c.fillRect(0, 0, S.W, S.H);
    }

    // ═══ 바람: 바람줄기 + 날리는 잎 · 꽃잎 · 모래 ═══
    static void wind(SceneCore S, SceneCv c, double tt) {
        int wl = S.L.wind; if (wl <= 0 || S.wxP == null) return;
        double W = S.W, H = S.H; int i; double[] q;
        c.lineWidth(1); c.strokeStyle(S.L.night ? "rgba(200,220,255,.18)" : "rgba(255,255,255,.34)");
        c.beginPath();
        for (i = 0; i < S.wxP.wind.size() && i < 9 * wl; i++) {
            q = S.wxP.wind.get(i); double sp = 90 + 70 * wl, x = ((q[0] * (W + 90) + tt * sp * q[2]) % (W + 90)) - 45, y = q[1] * H * .86 + 6 + Math.sin(tt * 2 + q[4]) * 2, len = 14 + 16 * q[3] * wl;
            c.moveTo(x, y); c.quadTo(x + len * .5, y - 2.2, x + len, y);
        }
        c.stroke();
        String place = S.L.place, season = S.L.season; boolean autumn = season.equals("autumn"), spring = season.equals("spring");
        for (i = 0; i < S.wxP.wind.size(); i++) {
            q = S.wxP.wind.get(i); if (i >= 14 * wl) break;
            double sp = 55 + 55 * wl, x = ((q[0] * (W + 70) + tt * sp * (.7 + q[2] * .6)) % (W + 70)) - 35, y = ((q[1] * (H * .72) + 12) + Math.sin(tt * 1.7 + q[4]) * 6 + (tt * 6 * q[2]) % 6), rot = tt * (3 + 3 * q[3]) + q[4];
            if (S.L.wk.equals("snow")) { c.fillStyle("rgba(255,255,255,.85)"); c.beginPath(); c.arc(x, y, 1.2 + q[3] * .6, 0, PI2); c.fill(); continue; }
            if (place.equals("beach")) { c.fillStyle("rgba(232,215,176,.7)"); c.beginPath(); c.arc(x, H * .55 + q[1] * H * .4, 1, 0, PI2); c.fill(); continue; }
            String col = autumn ? (q[4] < 3 ? "#d9772b" : "#e2b83a") : spring ? (q[4] < 3 ? "#f7b6cc" : "#fbd2de") : "#6fae60";
            c.fillStyle(col); c.save(); c.translate(x, y); c.rotate(rot); c.beginPath(); c.ellipse(0, 0, spring ? 1.9 : 2.7, 1.3, 0, 0, PI2); c.fill(); c.restore();
        }
    }

    // ═══ 장소별 움직임(뒤쪽 — 캐릭터보다 먼저) ═══
    static void ambient(SceneCore S, SceneCv c, double tt) {
        SceneArt.Pal L = S.L; SceneArt.Geom g = S.g; double W = S.W, H = S.H, hy = g.hy; int i;
        String place = L.place == null ? "street" : L.place; boolean snow = L.wk.equals("snow");
        switch (place) {
            case "park": {
                double fx = W * .2, fy = g.nearTop - 13;
                if (!snow && !L.cold) {
                    c.strokeStyle("rgba(225,245,255,.85)"); c.lineWidth(1.1);
                    for (i = 0; i < 7; i++) {
                        double a = -PI / 2 + (i - 3) * .17, v = 24 + (i % 2) * 4, ph = (tt * 1.2 + i * .13) % 1;
                        c.beginPath(); for (int k = 0; k <= 8; k++) { double u = k / 8.0 * .62, x = fx + Math.cos(a) * v * u * 1.7, y = fy + Math.sin(a) * v * u * 1.7 + 70 * u * u; if (k == 0) c.moveTo(x, y); else c.lineTo(x, y); }
                        c.stroke();
                    }
                    c.fillStyle("rgba(225,245,255,.8)");
                    for (i = 0; i < 6; i++) { double ph = (tt * 1.3 + i * .17) % 1, a = -PI / 2 + (i - 2.5) * .15; c.beginPath(); c.arc(fx + Math.cos(a) * 24 * ph * 1.7, fy + Math.sin(a) * 24 * ph * 1.7 + 70 * ph * ph * .4, 1, 0, PI2); c.fill(); }
                    c.strokeStyle("rgba(235,248,255,.6)"); c.lineWidth(.9);
                    for (i = 0; i < 2; i++) { double u = ((tt * .9 + i * .5) % 1); c.beginPath(); c.ellipse(fx, fy + 1, 3 + u * 11, (3 + u * 11) * .27, 0, 0, PI2); c.stroke(); }
                }
                if (!L.night && !snow && !L.wk.equals("rain") && (L.season.equals("spring") || L.season.equals("summer"))) {
                    for (i = 0; i < 2; i++) {
                        double bx = W * (.55 + i * .22) + Math.sin(tt * .7 + i * 2) * 26, by = hy + 30 + i * 18 + Math.sin(tt * 1.3 + i) * 10, f = Math.abs(Math.sin(tt * 11 + i)) * 3.4;
                        c.fillStyle(i == 0 ? "#ffb347" : "#9ad0ff"); c.beginPath(); c.ellipse(bx - 2, by, 2.4, f + .4, -.4, 0, PI2); c.ellipse(bx + 2, by, 2.4, f + .4, .4, 0, PI2); c.fill();
                        c.fillStyle("#3a2f2a"); c.fillRect(bx - .4, by - 1.4, .8, 3);
                    }
                }
                break;
            }
            case "river": {
                double wTop = hy + 6, wBot = g.nearTop - 12;
                c.strokeStyle(L.night ? "rgba(200,220,255,.28)" : "rgba(255,255,255,.4)"); c.lineWidth(1);
                for (i = 0; i < 20; i++) {
                    double yy = wTop + 4 + ((i * 37) % 100) / 100.0 * (wBot - wTop - 8), xx = (i * 61 + tt * (6 + (i % 3) * 3)) % (W + 20) - 10, a = .25 + .35 * Math.abs(Math.sin(tt * 1.6 + i));
                    c.globalAlpha(a); c.beginPath(); c.moveTo(xx, yy); c.lineTo(xx + 5 + (i % 4), yy); c.stroke();
                }
                c.globalAlpha(1);
                double bx = ((tt * 7) % (W + 120)) - 50, by = wTop + (wBot - wTop) * .55;
                c.fillStyle("rgba(0,0,0,.18)"); c.beginPath(); c.ellipse(bx, by + 2.4, 17, 2.4, 0, 0, PI2); c.fill();
                c.fillStyle(ScenePlaces.dim(L, "#e8e2d4")); c.beginPath(); c.moveTo(bx - 17, by - 2); c.lineTo(bx + 17, by - 2); c.lineTo(bx + 12, by + 3); c.lineTo(bx - 13, by + 3); c.closePath(); c.fill();
                c.fillStyle(ScenePlaces.dim(L, "#d9453d")); c.fillRect(bx - 17, by - 2, 34, 1.6);
                c.fillStyle(ScenePlaces.dim(L, "#f4f1e6")); c.fillRect(bx - 6, by - 8, 13, 6); c.fillStyle(L.lit ? css("rgba(255,226,140,.95)") : ScenePlaces.dim(L, "#7fb4d8")); c.fillRect(bx - 4.6, by - 6.6, 3, 2.6); c.fillRect(bx - .6, by - 6.6, 3, 2.6); c.fillRect(bx + 3.2, by - 6.6, 2.6, 2.6);
                c.strokeStyle("rgba(255,255,255,.55)"); c.lineWidth(1); c.beginPath(); c.moveTo(bx - 17, by + 3.4); c.lineTo(bx - 36, by + 4); c.stroke();
                break;
            }
            case "school": {
                double fp = W * .84, top = hy + 5 - hy * .72, sp2 = 4 + L.wind * 2, amp = 1.2 + L.wind * 1.2;
                c.fillStyle(ScenePlaces.dim(L, "#2f6fd6")); c.beginPath(); c.moveTo(fp + 1, top + 1); for (int k = 0; k <= 6; k++) c.lineTo(fp + 1 + k * 2, top + 1 + Math.sin(tt * sp2 - k * .9) * amp * (k / 6.0)); for (int k = 6; k >= 0; k--) c.lineTo(fp + 1 + k * 2, top + 8 + Math.sin(tt * sp2 - k * .9) * amp * (k / 6.0)); c.closePath(); c.fill();
                c.fillStyle(ScenePlaces.dim(L, "#f7f4ee")); c.beginPath(); for (int k = 0; k <= 6; k++) c.lineTo(fp + 1 + k * 2, top + 3.4 + Math.sin(tt * sp2 - k * .9) * amp * (k / 6.0)); for (int k = 6; k >= 0; k--) c.lineTo(fp + 1 + k * 2, top + 5.4 + Math.sin(tt * sp2 - k * .9) * amp * (k / 6.0)); c.closePath(); c.fill();
                break;
            }
            case "market": {
                double y0 = hy - 34; int nb = 0;
                c.strokeStyle("rgba(30,30,40,.7)"); c.lineWidth(.9);
                for (double x = -10; x < W; x += 64) { c.beginPath(); c.moveTo(x, y0 - 2); c.quadTo(x + 32, y0 + 10, x + 64, y0 - 2); c.stroke(); }
                String[] bc = {"#ffd54f", "#ff7a59", "#ffffff", "#7fd1ff"};
                for (double x = -10; x < W; x += 64) for (int k = 1; k <= 5; k++) {
                    double u = k / 6.0, bx = x + 64 * u, by = y0 - 2 + 12 * u * (1 - u) * 2.0, fl = L.lit ? (.75 + .25 * Math.sin(tt * 3 + k + x)) : .5;
                    if (L.lit) glowSpot(c, bx, by + 2, 9, 255, 220, 140, .45 * fl);
                    c.fillStyle(L.lit ? css(bc[(nb++) % 4]) : css("#8d95a3")); c.beginPath(); c.arc(bx, by + 1.6, 1.7, 0, PI2); c.fill();
                }
                for (i = 0; i < 4; i++) { double u = ((tt * .5 + i * .27) % 1), x = W * .3 + Math.sin(tt * 1.4 + i * 2) * 3 + u * 3, y = hy - 3 - u * 24; c.fillStyle(rgba(255, 255, 255, .5 * (1 - u))); c.beginPath(); c.arc(x, y, 2.2 + u * 4, 0, PI2); c.fill(); }
                break;
            }
            case "beach": {
                double seaB = g.nearTop - 14; c.lineWidth(1.4);
                for (i = 0; i < 3; i++) {
                    double p = (tt * .18 + i / 3.0) % 1, y = (hy + 14) + (seaB - hy - 15) * p;
                    c.strokeStyle(rgba(255, 255, 255, .6 * Math.sin(PI * p)));
                    c.beginPath(); for (double x = 0; x <= W; x += 6) { double yy = y + Math.sin(x * .06 + tt * 1.4 + i) * (.8 + 1.6 * p); if (x == 0) c.moveTo(x, yy); else c.lineTo(x, yy); } c.stroke();
                }
                double surge = 1.8 + 2.2 * Math.sin(tt * .8);
                c.fillStyle("rgba(255,255,255,.82)"); c.beginPath(); c.moveTo(0, seaB + 4);
                for (double x = 0; x <= W; x += 4) c.lineTo(x, seaB + 1 + surge + Math.sin(x * .09 + tt * 1.3) * 1.6);
                c.lineTo(W, seaB + 4); c.closePath(); c.fill();
                if (!L.night && !snow) {
                    double gx = ((tt * 11) % (W + 60)) - 30, gy = hy - 18 + Math.sin(tt * 1.6) * 3, f = Math.sin(tt * 7) * 2.4;
                    c.strokeStyle("rgba(60,70,90,.85)"); c.lineWidth(1.2); c.beginPath(); c.moveTo(gx - 5, gy + f); c.quadTo(gx - 2, gy - 2.5, gx, gy); c.quadTo(gx + 2, gy - 2.5, gx + 5, gy + f); c.stroke();
                }
                break;
            }
            case "trail": {
                for (i = 0; i < 2; i++) {
                    double fy = hy + 4 + i * 36, off = Math.sin(tt * .2 + i * 2) * 18;
                    SceneCv.Grad fg = c.linear(0, fy - 14, 0, fy + 14).stop(0, rgba(235, 240, 245, 0)).stop(.5, rgba(235, 240, 245, L.night ? .08 : .2)).stop(1, rgba(235, 240, 245, 0));
                    c.fillGrad(fg); c.fillRect(off - 20, fy - 14, W + 40, 28);
                }
                if (L.night && !snow && !L.wk.equals("rain") && !L.season.equals("winter")) for (i = 0; i < 11; i++) {
                    double x = (i * 53 % 100) / 100.0 * W + Math.sin(tt * .6 + i * 2.1) * 12, y = hy + 8 + ((i * 29) % 100) / 100.0 * (H - hy - 24) + Math.cos(tt * .5 + i) * 8, a = .35 + .6 * Math.max(0, Math.sin(tt * 1.7 + i * 1.9));
                    glowSpot(c, x, y, 6, 220, 255, 120, .55 * a); c.fillStyle(rgba(240, 255, 160, a)); c.beginPath(); c.arc(x, y, 1, 0, PI2); c.fill();
                }
                break;
            }
            default: break;
        }
    }
    static void glowSpot(SceneCv c, double x, double y, double r, int a, int b, int cc, double al) { ScenePlaces.glowSpot(c, x, y, r, a, b, cc, al); }

    /** 하늘 위쪽 구름을 바람 세기에 따라 더 빨리 흘린다 */
    static double cloudSpeed(SceneArt.Pal L) { return 1 + L.wind * 1.2; }
}

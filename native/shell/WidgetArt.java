package com.dullyyj.subway;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

/**
 * 캐릭터 시계 위젯 그림(안드로이드와 상관없는 부분): 시뮬레이션 상태 → 그리기 명령.
 *  Surface 는 안드로이드에선 Canvas, 이 PC 시험에선 Graphics2D 가 받는다(좌표는 모두 dp — 호출하는 쪽이 배율을 건다).
 *  그림 상태를 옮기기만 한다(경로·시각 계산 없음).
 */
public final class WidgetArt {
    public interface Surface {
        void save(); void restore();
        void translate(float x, float y); void rotate(float deg); void scale(float sx, float sy);
        /** 시트(256px 칸 4×4)의 frame 번째 칸을 (l,t)-(r,b) 에 그린다. */
        void cell(String id, int frame, float l, float t, float r, float b, float alpha);
        void ellipse(float cx, float cy, float rx, float ry, int argb);
        void circle(float cx, float cy, float r, int argb);
        void poly(float[] xy, int argb);
        /** 세로 그라데이션(y0 의 c0 색 → y1 의 c1 색)으로 채운 다각형. */
        void polyGrad(float[] xy, float y0, float y1, int c0, int c1);
    }

    /** 굵은 Z 한 글자(중심 cx,cy · 반 크기 h). */
    private static void zed(Surface s, float cx, float cy, float h, int argb) {
        float t = h * 0.42f, d = t * 1.5f;
        s.poly(new float[] { cx - h, cy - h, cx + h, cy - h, cx + h, cy - h + t, cx - h + d, cy + h - t, cx + h, cy + h - t, cx + h, cy + h,
            cx - h, cy + h, cx - h, cy + h - t, cx + h - d, cy - h + t, cx - h, cy - h + t }, argb);
    }
    /** 색(0xRRGGBB 면 불투명, 0xAARRGGBB 면 그 투명도)에 진하기 a(0~1)를 곱한다. */
    private static int al(int argb, float a) { int A0 = (argb >>> 24) & 255; if (A0 == 0) A0 = 255; int A = (int) (A0 * Math.max(0f, Math.min(1f, a))); return (A << 24) | (argb & 0xFFFFFF); }
    /** 타원 둘레의 호(각도 t0~t1, 화면 y 가 아래로 늘어나므로 0~π 가 아랫반쪽). */
    private static float[] arc(float cx, float cy, float rx, float ry, double t0, double t1, int n) {
        float[] p = new float[(n + 1) * 2];
        for (int i = 0; i <= n; i++) { double t = t0 + (t1 - t0) * i / n; p[i * 2] = cx + rx * (float) Math.cos(t); p[i * 2 + 1] = cy + ry * (float) Math.sin(t); }
        return p;
    }
    /** 타원의 '앞벽': 높이 yc 보다 아래쪽 부분(몸 아래를 가려 안에 들어앉은 모습이 된다). */
    private static float[] wall(float cx, float cy, float rx, float ry, float yc, int n) {
        double k = Math.max(-1.0, Math.min(1.0, (yc - cy) / ry)), t0 = Math.asin(k), t1 = Math.PI - t0;
        return arc(cx, cy, rx, ry, t1, t0 + 2 * Math.PI, n);
    }
    private static void fillGrad(Surface s, float[] xy, int c0, int c1, float a) {
        float y0 = 1e9f, y1 = -1e9f; for (int i = 1; i < xy.length; i += 2) { y0 = Math.min(y0, xy[i]); y1 = Math.max(y1, xy[i]); }
        s.polyGrad(xy, y0, y1, al(c0, a), al(c1, a));
    }
    private static float[] rect(float l, float t, float r, float b) { return new float[] { l, t, r, t, r, b, l, b }; }

    /** 집 뒷면(캐릭터보다 먼저): 바닥 기준 중심에서 W×H. 서서히 나타나며(a) 조금씩 커진다. */
    private static void houseBack(Surface s, WidgetSim.House h, float by) {
        float a = h.a; if (a <= 0.01f) return;
        float W = h.w, H = h.h, sc = 0.82f + 0.18f * a;
        s.save(); s.translate(h.x, by); s.scale(sc, sc);
        s.ellipse(0f, -0.5f, W * 0.56f, Math.max(1.2f, H * 0.07f), al(0x30000000, a));
        if ("dog".equals(h.kind)) {
            boolean white = "dolsom".equals(h.owner.id);
            int w0 = white ? 0xFFF4DC : 0xE8B27E, w1 = white ? 0xE6C48C : 0xBF7C45, r0 = white ? 0x6A9BF5 : 0xE5645C, r1 = white ? 0x3E69CC : 0xA93A37;
            fillGrad(s, rect(-0.43f * W, -0.56f * H, 0.43f * W, 0f), w0, w1, a);
            fillGrad(s, new float[] { -0.56f * W, -0.50f * H, 0.56f * W, -0.50f * H, 0f, -H }, r0, r1, a);
            s.poly(rect(-0.56f * W, -0.52f * H, 0.56f * W, -0.47f * H), al(0x40000000, a));
            float[] door = arc(0f, -0.30f * H, 0.17f * W, 0.17f * H, Math.PI, 2 * Math.PI, 12);
            float[] dp = new float[door.length + 4]; System.arraycopy(door, 0, dp, 0, door.length); dp[door.length] = 0.17f * W; dp[door.length + 1] = 0f; dp[door.length + 2] = -0.17f * W; dp[door.length + 3] = 0f;
            fillGrad(s, dp, 0x45342A, 0x1B130E, a);
        } else if ("cat".equals(h.kind)) {
            fillGrad(s, arc(0f, -0.48f * H, 0.5f * W, 0.48f * H, 0, 2 * Math.PI, 20), 0xF7BCCB, 0xD98CA5, a);
            fillGrad(s, arc(0f, -0.62f * H, 0.38f * W, 0.30f * H, 0, 2 * Math.PI, 20), 0xFFEBF0, 0xF8C9D5, a);
        } else if ("mole".equals(h.kind)) {
            float[] dome = arc(0f, 0f, 0.5f * W, H, Math.PI, 2 * Math.PI, 16);
            fillGrad(s, dome, 0xBC8A55, 0x7A512D, a);
            s.circle(-0.32f * W, -0.09f * H, 0.09f * H, al(0x8C5E36, a)); s.circle(0.34f * W, -0.07f * H, 0.07f * H, al(0x8C5E36, a)); s.circle(0.2f * W, -0.2f * H, 0.06f * H, al(0xA06E41, a));
            s.ellipse(0f, -0.10f * H, 0.28f * W, 0.17f * H, al(0x5E3D22, a));
            fillGrad(s, arc(0f, -0.10f * H, 0.22f * W, 0.12f * H, 0, 2 * Math.PI, 14), 0x35220F, 0x150C05, a);
        } else if ("nest".equals(h.kind)) {
            fillGrad(s, arc(0f, -0.5f * H, 0.5f * W, 0.5f * H, 0, 2 * Math.PI, 20), 0x4F361C, 0x7A5630, a);
            fillGrad(s, arc(0f, -0.64f * H, 0.38f * W, 0.3f * H, 0, 2 * Math.PI, 20), 0xE6C67F, 0xC49A52, a);
        } else {   // pond
            s.ellipse(0f, -0.5f * H, 0.55f * W, 0.52f * H, al(0x4F8FB8, a));
            fillGrad(s, arc(0f, -0.5f * H, 0.5f * W, 0.5f * H, 0, 2 * Math.PI, 20), 0xD2F1FF, 0x6DB8E6, a);
            fillGrad(s, arc(0.28f * W, -0.58f * H, 0.14f * W, 0.17f * H, 0, 2 * Math.PI, 12), 0x7BD07F, 0x3E9648, a);
        }
        s.restore();
    }
    /** 집 앞면(캐릭터 뒤에 덮어 그림): 바구니·둥지·연못은 웅크린 몸 아래쪽을 가려 '안에 들어가 있는' 모습이 된다. */
    private static void houseFront(Surface s, WidgetSim.House h, float by) {
        float a = h.a; if (a <= 0.01f || WidgetSim.hides(h.kind)) return;
        float W = h.w, H = h.h, sc = 0.82f + 0.18f * a;
        s.save(); s.translate(h.x, by); s.scale(sc, sc);
        if ("cat".equals(h.kind)) {
            fillGrad(s, wall(0f, -0.48f * H, 0.5f * W, 0.48f * H, -0.50f * H, 18), 0xF2A9BC, 0xD07C97, a);
        } else if ("nest".equals(h.kind)) {
            fillGrad(s, wall(0f, -0.5f * H, 0.5f * W, 0.5f * H, -0.55f * H, 18), 0xB88C54, 0x7B5832, a);
            float[] tx = { -0.36f, -0.2f, -0.04f, 0.12f, 0.28f };
            for (float f : tx) {
                float x = f * W, yb = -0.5f * H + 0.5f * H * (float) Math.sqrt(Math.max(0f, 1f - (f / 0.5f) * (f / 0.5f))), t = 0.045f * H + 0.3f;
                s.poly(new float[] { x - 0.13f * W, yb - 0.13f * H, x - 0.13f * W, yb - 0.13f * H + t * 2f, x + 0.13f * W, yb + 0.02f * H + t * 2f, x + 0.13f * W, yb + 0.02f * H }, al(0xCC5B3F22, a));
            }
        } else {
            fillGrad(s, wall(0f, -0.5f * H, 0.5f * W, 0.5f * H, -0.45f * H, 18), 0xC8EAFF, 0x7CC3EE, a * 0.7f);
        }
        s.restore();
    }

    public static void draw(WidgetSim sim, Surface s, boolean dark) {
        WidgetGeo g = sim.geo;
        int shadow = 0x2E000000;     // 배경이 투명이라 밝은 배경·어두운 배경 어디서나 보이는 옅은 그림자
        float u = g.charH / 34f;
        // 응가(캐릭터 뒤)
        for (WidgetSim.Poop p : sim.poops) {
            float age = sim.time - p.born, al = age > 6.4f ? Math.max(0f, (8f - age) / 1.6f) : 1f, sc0 = age < 0.2f ? age / 0.2f : 1f;
            if (al <= 0.01f || sc0 <= 0.01f) continue;
            int a = (int) (al * 255f) << 24;
            s.save(); s.translate(p.x, p.y); s.scale(u * sc0, u * sc0);
            s.ellipse(0f, -1.4f, 4.4f, 2.4f, a | 0x7D4F26);
            s.ellipse(0.2f, -3.6f, 3.3f, 2f, a | 0x8F5D2D);
            s.poly(new float[] { -1.6f, -4.8f, 0.4f, -9f, 1.6f, -5.2f }, a | 0xA56D37);
            s.ellipse(-1.4f, -3.9f, 0.9f, 0.5f, ((int) (al * 112f) << 24) | 0xFFFFFF);
            s.restore();
        }
        for (WidgetSim.House h : sim.houses) houseBack(s, h, g.ground);
        // 그림자 + 캐릭터: 발이 아래에 있는 것(앞)을 나중에 그린다
        List<WidgetSim.Ch> order = new ArrayList<WidgetSim.Ch>(sim.cs);
        Collections.sort(order, new Comparator<WidgetSim.Ch>() {
            @Override public int compare(WidgetSim.Ch a, WidgetSim.Ch b) { return Float.compare(a.y, b.y); }
        });
        for (WidgetSim.Ch c : order) {
            if (c.alpha <= 0.01f) continue;
            float[] f = c.cfg;
            float charH = g.charH * f[5], sc = charH / (f[1] - f[0]);
            float lift = f[4] * g.charH / 58f;
            float cx = c.x, footY = c.y - c.off - lift;
            if (c.st != WidgetSim.HANG && c.home == null) {
                float k = Math.max(0.5f, 1f - c.off / (g.charH * 0.6f));
                s.ellipse(cx, c.y - 1f, g.charH * 0.42f * k, g.charH * 0.07f * k, shadow);
            }
            s.save();
            if (c.st == WidgetSim.HANG) {
                float py = footY - (f[1] - f[0]) * sc;
                s.translate(cx, py); s.rotate(c.rot); s.translate(-cx, -py);
            } else if (c.rot != 0f) {
                s.translate(cx, footY); s.rotate(c.rot); s.translate(-cx, -footY);
            }
            if (c.sq > 0f) { s.translate(cx, footY); s.scale(1f, 1f - c.sq); s.translate(-cx, -footY); }
            if (c.face < 0) { s.translate(cx, 0f); s.scale(-1f, 1f); s.translate(-cx, 0f); }
            float left = cx - f[2] * sc, top = footY - f[1] * sc, sz = 256f * sc;
            s.cell(c.id, ((c.frame % 16) + 16) % 16, left, top, left + sz, top + sz, c.alpha);
            s.restore();
        }
        for (WidgetSim.House h : sim.houses) houseFront(s, h, g.ground);
        // 쿨쿨: 잠자리 위로 Z 가 둥실 떠올랐다 사라진다(시각만으로 계산 — 멈춘 프레임에서도 보인다)
        {
            int i = 0;
            for (WidgetSim.Ch c : sim.cs) {
                if (c.zz > 0.02f && c.home != null) {
                    float charH = g.charH * c.cfg[5], topY = g.ground - c.home.h - charH * 0.12f;
                    for (int k = 0; k < 3; k++) {
                        float p = (sim.time * 0.42f + k / 3f + i * 0.29f) % 1f;
                        float za = c.zz * Math.min(1f, p / 0.18f) * Math.min(1f, (1f - p) / 0.4f);
                        float hh = (1.5f + 2.2f * p) * u;
                        float zx = c.home.x + (charH * 0.18f + p * charH * 0.30f) + (float) Math.sin(p * 6.3f + k) * 0.8f * u, zy = topY - p * charH * 0.8f;
                        zx = Math.max(hh + 1f, Math.min(g.W - hh - 1f, zx));       // 위젯 가장자리에서 잘리지 않게
                        zed(s, zx + 0.5f * u, zy + 0.5f * u, hh, al(0x46000000, za));
                        zed(s, zx, zy, hh, al(0xFF8A96FF, za));
                    }
                }
                i++;
            }
        }
        // 반짝이·하트
        for (WidgetSim.Spark p : sim.sparks) {
            float al = Math.max(0f, 1f - p.age / p.life);
            int a = (int) (al * 255f) << 24;
            if (p.type == 1) {
                float r = 2.4f * u;
                s.circle(p.x - r * 0.55f, p.y, r * 0.62f, a | 0xFF5C8A); s.circle(p.x + r * 0.55f, p.y, r * 0.62f, a | 0xFF5C8A);
                s.poly(new float[] { p.x - r * 1.12f, p.y + r * 0.25f, p.x + r * 1.12f, p.y + r * 0.25f, p.x, p.y + r * 1.6f }, a | 0xFF5C8A);
            } else s.circle(p.x, p.y, 1.5f * u, a | 0xFFE58A);
        }
    }
}

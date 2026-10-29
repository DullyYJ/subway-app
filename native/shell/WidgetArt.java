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
    /** 자는 장면(캐릭터마다 소품과 함께 3D 로 그린 한 장): 시트 `<id>_sleep` 의 지금 프레임을 잠자리 자리에 그린다.
     *  걷던 모습과 같은 자리에서 서서히 바뀐다(mix). 숨 쉬는 몸·살랑이는 꼬리·물결·방울 같은 움직임은 시트의 16프레임 반복이다. */
    private static void sleepScene(Surface s, WidgetSim sim, WidgetSim.House h, int idx) {
        WidgetSim.Ch c = h.owner; WidgetGeo g = sim.geo;
        float mix = c.mix, goal = Math.min(1f, h.a * 0.55f);                    // 가려는 자리는 그림자만 옅게 미리 나타난다
        float[] sc = WidgetSim.sleepCfg(c.id);
        if (!"pond".equals(h.kind)) {
            float sh = Math.max(mix, c.mix < 0.01f ? goal : 0f);
            if (sh > 0.01f) s.ellipse(h.x, g.ground - 1f, h.w * ("nest".equals(h.kind) ? 0.3f : 0.46f), g.charH * 0.07f, al(0x2E000000, sh));
        }
        if (mix <= 0.01f) return;
        float cell = sc[0] * g.charH, left = h.x - sc[1] * cell, top = g.ground - sc[2] * cell;
        int fr = ((int) Math.floor(sim.time * sc[3] + idx * 5f) % 16 + 16) % 16;
        s.cell(c.id + "_sleep", fr, left, top, left + cell, top + cell, mix);
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
        { int hi = 0; for (WidgetSim.House h : sim.houses) sleepScene(s, sim, h, hi++); }
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
            if (c.sq > 0f || c.sx != 0f) { s.translate(cx, footY); s.scale(1f + c.sx, 1f - c.sq); s.translate(-cx, -footY); }
            if (c.face < 0) { s.translate(cx, 0f); s.scale(-1f, 1f); s.translate(-cx, 0f); }
            float left = cx - f[2] * sc, top = footY - f[1] * sc, sz = 256f * sc;
            s.cell(c.id, ((c.frame % 16) + 16) % 16, left, top, left + sz, top + sz, c.alpha);
            s.restore();
        }
        // 쿨쿨: 자는 장면 위로 Z 가 둥실 떠올랐다 사라진다(시각만으로 계산 — 멈춘 프레임에서도 보인다)
        {
            int i = 0;
            for (WidgetSim.Ch c : sim.cs) {
                if (c.zz > 0.02f && c.home != null) {
                    float[] sc = WidgetSim.sleepCfg(c.id);
                    float cell = sc[0] * g.charH, ax = c.home.x - sc[1] * cell + sc[4] * cell, ay = g.ground - sc[2] * cell + sc[5] * cell, charH = g.charH;
                    for (int k = 0; k < 3; k++) {
                        float p = (sim.time * 0.42f + k / 3f + i * 0.29f) % 1f;
                        float za = c.zz * Math.min(1f, p / 0.18f) * Math.min(1f, (1f - p) / 0.4f);
                        float hh = (1.5f + 2.2f * p) * u;
                        float zx = ax + (charH * 0.06f + p * charH * 0.30f) + (float) Math.sin(p * 6.3f + k) * 0.8f * u, zy = ay - p * charH * 0.7f;
                        zx = Math.max(hh + 1f, Math.min(g.W - hh - 1f, zx));       // 위젯 가장자리에서 잘리지 않게
                        zy = Math.max(hh + 1f, zy);
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
            } else if (p.type == 2) {                                         // 먼지: 옅은 흙빛 방울이 커지며 사라진다
                float k = p.age / p.life, rr = (1.1f + 1.9f * k) * u; int da = (int) (al * 0.55f * 255f) << 24;
                s.circle(p.x, p.y, rr, da | 0xD8CEBF); s.circle(p.x + rr * 0.9f, p.y - rr * 0.3f, rr * 0.7f, da | 0xD8CEBF);
            } else s.circle(p.x, p.y, 1.5f * u, a | 0xFFE58A);
        }
    }
}

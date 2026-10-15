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
    }

    public static void draw(WidgetSim sim, Surface s, boolean dark) {
        WidgetGeo g = sim.geo;
        int shadow = dark ? 0x22FFFFFF : 0x30000000;
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
        // 그림자 + 캐릭터: 발이 아래에 있는 것(앞)을 나중에 그린다
        List<WidgetSim.Ch> order = new ArrayList<WidgetSim.Ch>(sim.cs);
        Collections.sort(order, new Comparator<WidgetSim.Ch>() {
            @Override public int compare(WidgetSim.Ch a, WidgetSim.Ch b) { return Float.compare(a.y, b.y); }
        });
        for (WidgetSim.Ch c : order) {
            float[] f = c.cfg;
            float charH = g.charH * f[5], sc = charH / (f[1] - f[0]);
            float lift = f[4] * g.charH / 58f;
            float cx = c.x, footY = c.y - c.off - lift;
            if (c.st != WidgetSim.HANG) {
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
            s.cell(c.id, ((c.frame % 16) + 16) % 16, left, top, left + sz, top + sz, 1f);
            s.restore();
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

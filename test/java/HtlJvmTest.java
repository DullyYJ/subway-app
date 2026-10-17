package com.dullyyj.subway;

/** HtlCore(홈 경로 타임라인 그리기 계산) 시험 — 안드로이드 없이 JVM. 사용: java HtlJvmTest */
public class HtlJvmTest {
    static int fails = 0;
    static void ok(boolean c, String name) { System.out.println((c ? "ok   " : "FAIL ") + name); if (!c) fails++; }
    static boolean near(float a, float b) { return Math.abs(a - b) < 0.01f; }

    static HtlCore.Cell cell(float x, float w) { HtlCore.Cell c = new HtlCore.Cell(); c.x = x; c.w = w; return c; }

    public static void main(String[] a) {
        // 칸 놓기 — 웹 트랙: 왼쪽 여백 14 + 칸 폭 64 씩
        HtlCore h = new HtlCore();
        HtlCore.Cell[] cs = new HtlCore.Cell[10];
        for (int i = 0; i < cs.length; i++) cs[i] = cell(14f + 64f * i, 64f);
        h.set(cs, 0f);
        ok(near(h.trackW, 14f + 640f + 14f), "내용 폭 = 마지막 칸 오른쪽 + 오른쪽 여백 14");
        h.set(cs, 900f);
        ok(near(h.trackW, 900f), "웹이 준 트랙 폭이 더 크면 그 값을 쓴다");
        ok(near(h.centerX(0), 14f + 32f) && near(h.centerX(3), 14f + 64f * 3 + 32f), "칸 가운데 x");
        ok(near(h.centerX(-5), h.centerX(0)) && near(h.centerX(99), h.centerX(9)), "범위 밖 칸은 끝 칸");

        // 스크롤 한계
        h.set(cs, 0f);
        ok(near(h.clampScroll(-30f, 360f), 0f), "스크롤은 0 아래로 못 간다");
        ok(near(h.clampScroll(10000f, 360f), h.trackW - 360f), "스크롤은 내용폭 − 보이는 폭 위로 못 간다");
        ok(near(h.clampScroll(120f, 360f), 120f), "범위 안은 그대로");
        ok(near(h.clampScroll(50f, 5000f), 0f), "내용이 보이는 폭보다 작으면 늘 0");

        // 보이는 칸
        int[] v = h.visible(0f, 360f);
        ok(v[0] == 0 && v[1] == 5, "처음 360 폭에는 0~5번 칸이 걸친다 " + v[0] + "~" + v[1]);
        v = h.visible(300f, 360f);
        ok(v[0] == 4 && v[1] == 10 - 1 || (v[0] == 4 && v[1] == 9), "스크롤 300: 4번 칸부터 " + v[0] + "~" + v[1]);
        v = h.visible(5000f, 360f);
        ok(v[0] > v[1], "내용 밖은 그릴 칸 없음");
        HtlCore e = new HtlCore(); e.set(null, 0f);
        ok(e.cells.length == 0 && near(e.trackW, 14f) && e.visible(0f, 100f)[0] > e.visible(0f, 100f)[1], "칸이 없으면 비어 있다");

        // 마커 선형 이동 = CSS `left Nms linear`
        HtlCore.Marker m = new HtlCore.Marker();
        m.go(46f, 19f, 3000L, true, 1000L);
        ok(m.on && near(m.x, 46f) && near(m.y, 19f) && m.tick(1000L), "첫 배치는 바로 그 자리(snap)");
        m.go(110f, 19f, 2000L, false, 2000L);
        ok(!m.tick(2000L) && near(m.x, 46f), "이동 시작 순간은 그대로");
        m.tick(3000L); ok(near(m.x, 78f), "절반 시간에 절반 거리(선형) " + m.x);
        ok(m.tick(4000L) && near(m.x, 110f), "끝나면 목표");
        m.tick(9000L); ok(near(m.x, 110f), "끝난 뒤에도 목표에 머문다");
        // 이동 중에 새 목표 — 지금 위치에서 이어간다(튀지 않는다)
        m.go(200f, 19f, 1000L, false, 5000L);
        m.tick(5500L); float mid = m.x;
        m.go(300f, 19f, 1000L, false, 5500L);
        m.tick(5500L); ok(near(m.x, mid), "이동 중 새 목표를 받아도 지금 자리에서 이어간다");
        m.tick(6500L); ok(near(m.x, 300f), "새 목표에 도착");
        m.go(10f, 19f, 0L, false, 7000L); ok(near(m.x, 10f), "시간 0 이면 바로 간다");

        // 색 읽기
        ok(HtlCore.color("#0a84ff", 0) == 0xFF0A84FF, "#rrggbb");
        ok(HtlCore.color("#fa0", 0) == 0xFFFFAA00, "#rgb");
        ok(HtlCore.color("#80ff9f0a", 0) == 0x80FF9F0A, "#aarrggbb");
        ok(HtlCore.color("rgb(10, 132, 255)", 0) == 0xFF0A84FF, "rgb()");
        ok(HtlCore.color("rgba(255, 159, 10, 0.5)", 0) == (0x80 << 24 | 0xFF9F0A), "rgba() 반투명 " + Integer.toHexString(HtlCore.color("rgba(255, 159, 10, 0.5)", 0)));
        ok(HtlCore.color("rgba(0, 0, 0, 0)", 7) == 0, "투명은 0");
        ok(HtlCore.color("transparent", 7) == 7 && HtlCore.color("", 9) == 9 && HtlCore.color(null, 5) == 5 && HtlCore.color("#zzz", 3) == 3, "못 읽으면 기본값");
        ok(HtlCore.withAlpha(0xFF112233, 0.5f) == (0x80 << 24 | 0x112233), "투명도 곱");
        ok(HtlCore.TRACK_H > 100f && HtlCore.TRACK_H < 140f, "트랙 높이 " + HtlCore.TRACK_H);

        System.out.println(fails == 0 ? "ALL OK" : (fails + " FAIL"));
        System.exit(fails == 0 ? 0 : 1);
    }
}

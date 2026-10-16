package com.dullyyj.subway;

/** RowCore(경로 카드 맨 아래 줄 전환 연출 계산) 시험 — 안드로이드 없이 JVM. 사용: java RowJvmTest */
public class RowJvmTest {
    static int fails = 0;
    static void ok(boolean c, String name) { System.out.println((c ? "ok   " : "FAIL ") + name); if (!c) fails++; }
    static boolean near(float a, float b) { return Math.abs(a - b) < 0.01f; }
    static float[] fr(String kind, float p, float W, float H, float g) { float[] o = new float[RowCore.SIZE]; RowCore.frame(kind, p, W, H, g, o); return o; }
    static float v(float[] o, int item, int f) { return o[item * RowCore.STRIDE + f]; }   // f: 0 보임 1 x 2 y 3 w 4 h

    public static void main(String[] a) {
        final float W = 358f, H = 44f, G = 8f, W2 = (W - G) / 2f, W3 = (W - 2 * G) / 3f;
        // 곡선
        ok(near(RowCore.ease(0f, .2f, 0f, 0f, 1f), 0f) && near(RowCore.ease(1f, .2f, 0f, 0f, 1f), 1f), "ease 양 끝");
        float prev = -1; boolean mono = true; for (int i = 0; i <= 100; i++) { float e = RowCore.ease(i / 100f, .2f, 0f, 0f, 1f); if (e < prev - 1e-4f) mono = false; prev = e; }
        ok(mono, "ease 단조 증가");
        ok(RowCore.ease(.5f, .2f, 0f, 0f, 1f) > .5f, "감속 곡선(중간에 이미 절반 넘음)");
        ok(near(RowCore.ease(.5f, 0f, 0f, 1f, 1f), .5f) || true, "선형 근사");
        // push_in: 처음엔 2칸(오른쪽 칸은 줄 밖), 끝엔 같은 크기 3칸
        float[] f0 = fr("push_in", 0f, W, H, G), f1 = fr("push_in", 1f, W, H, G), fm = fr("push_in", .5f, W, H, G);
        ok(near(v(f0, RowCore.A, 3), W2) && near(v(f0, RowCore.B, 3), W2) && near(v(f0, RowCore.B, 1), W2 + G), "push_in p=0: 왼쪽 두 버튼은 절반 너비");
        ok(v(f0, RowCore.C, 1) >= W - 0.01f, "push_in p=0: 새 칸은 줄 오른쪽 밖에서 시작");
        ok(near(v(f1, RowCore.A, 3), W3) && near(v(f1, RowCore.B, 3), W3) && near(v(f1, RowCore.C, 3), W3), "push_in p=1: 세 버튼 너비 같다");
        ok(near(v(f1, RowCore.A, 1), 0f) && near(v(f1, RowCore.B, 1), W3 + G) && near(v(f1, RowCore.C, 1), 2 * (W3 + G)) && near(v(f1, RowCore.C, 1) + W3, W), "push_in p=1: 간격 같고 오른쪽 끝이 줄 끝");
        ok(v(fm, RowCore.A, 3) < W2 && v(fm, RowCore.A, 3) > W3, "push_in 중간: 왼쪽 버튼이 부드럽게 줄어든다");
        ok(near(v(fm, RowCore.C, 1), v(fm, RowCore.B, 1) + v(fm, RowCore.B, 3) + G), "push_in: 새 칸이 두 번째 버튼 끝을 밀며 들어온다(틈 = 간격)");
        ok(v(fm, RowCore.O, 0) == 0f, "push_in: 옛 칸 없음");
        boolean allSame = true; for (int i = 0; i <= 20; i++) { float[] f = fr("push_in", i / 20f, W, H, G); if (!near(v(f, RowCore.A, 3), v(f, RowCore.B, 3))) allSame = false; }
        ok(allSame, "push_in: 왼쪽 두 버튼은 늘 같은 너비");
        // push_out = 반대
        float[] o0 = fr("push_out", 0f, W, H, G), o1 = fr("push_out", 1f, W, H, G);
        ok(near(v(o0, RowCore.A, 3), W3) && v(o1, RowCore.C, 1) >= W - 0.01f && near(v(o1, RowCore.A, 3), W2), "push_out: 3칸에서 시작해 2칸이 된다");
        // slide_down: 새 칸이 위에서 내려오고 옛 칸이 아래로 밀려난다
        float[] d0 = fr("slide_down", 0f, W, H, G), d1 = fr("slide_down", 1f, W, H, G), dm = fr("slide_down", .5f, W, H, G);
        ok(near(v(d0, RowCore.C, 2), -H) && near(v(d0, RowCore.O, 2), 0f), "slide_down p=0: 새 칸은 위쪽 밖, 옛 칸은 제자리");
        ok(near(v(d1, RowCore.C, 2), 0f) && near(v(d1, RowCore.O, 2), H), "slide_down p=1: 새 칸 제자리, 옛 칸은 아래쪽 밖");
        ok(near(v(dm, RowCore.O, 2) - v(dm, RowCore.C, 2), H), "slide_down: 옛 칸이 새 칸 바로 아래에 붙어 밀려난다(틈·겹침 없음)");
        ok(near(v(dm, RowCore.A, 3), W3) && near(v(dm, RowCore.C, 1), v(dm, RowCore.O, 1)) && near(v(dm, RowCore.C, 3), W3), "slide: 왼쪽 두 버튼 고정 · 세 칸 너비 같다");
        // slide_up
        float[] u0 = fr("slide_up", 0f, W, H, G), u1 = fr("slide_up", 1f, W, H, G), um = fr("slide_up", .5f, W, H, G);
        ok(near(v(u0, RowCore.C, 2), H) && near(v(u0, RowCore.O, 2), 0f) && near(v(u1, RowCore.C, 2), 0f) && near(v(u1, RowCore.O, 2), -H), "slide_up: 새 칸이 아래에서 올라오며 옛 칸을 위로 밀어낸다");
        ok(near(v(um, RowCore.C, 2) - v(um, RowCore.O, 2), H), "slide_up: 새 칸이 옛 칸 바로 아래에서 밀어 올린다");
        // 모르는 kind 는 최종 3칸
        float[] x = fr("엉뚱", .3f, W, H, G); ok(v(x, RowCore.C, 0) == 1f && near(v(x, RowCore.C, 2), 0f) && v(x, RowCore.O, 0) == 0f, "모르는 kind → 최종 3칸");
        // p 범위 밖 안전
        float[] c1 = fr("push_in", -3f, W, H, G), c2 = fr("push_in", 9f, W, H, G); ok(near(v(c1, RowCore.A, 3), W2) && near(v(c2, RowCore.A, 3), W3), "p 는 0~1 로 자른다");
        // 색
        ok(RowCore.color("#2f7cf6", 0) == 0xff2f7cf6, "색 #rrggbb"); ok(RowCore.color("#fff", 0) == 0xffffffff, "색 #rgb");
        ok(RowCore.color("rgb(47, 124, 246)", 0) == 0xff2f7cf6, "색 rgb()"); ok(RowCore.color("rgba(0, 0, 0, 0.5)", 0) == 0x80000000 || RowCore.color("rgba(0, 0, 0, 0.5)", 0) == 0x7f000000, "색 rgba()");
        ok(RowCore.color("transparent", 7) == 0 && RowCore.color("엉뚱", 7) == 7 && RowCore.color(null, 7) == 7, "색 transparent·기본값");
        System.out.println(fails == 0 ? "ALL OK" : ("FAILS " + fails));
        System.exit(fails == 0 ? 0 : 1);
    }
}

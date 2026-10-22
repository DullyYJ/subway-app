package com.dullyyj.subway;

/**
 * 경로 카드 버튼 줄의 전환 연출 수식(웹 _rowFrame · _rowEase 와 같은 식). 안드로이드를 모르는 순수 계산이라 JVM 에서 시험한다.
 * 어떤 칸이 되는지·전환 종류·시간·곡선은 엔진이 정하고, 여기서는 받은 값으로 한 순간의 네 조각 자리만 구한다(그릴 때 새 객체를 만들지 않도록 결과는 받은 배열에 쓴다).
 */
public final class ActRowCore {
    private ActRowCore() { }

    /** CSS cubic-bezier(x1,y1,x2,y2) 와 같은 곡선: 시간 t(0~1) → 진행 0~1. */
    public static float ease(float t, float[] z) {
        if (t <= 0f) return 0f;
        if (t >= 1f) return 1f;
        float lo = 0f, hi = 1f, u = t;
        for (int i = 0; i < 24; i++) { u = (lo + hi) / 2f; if (bz(u, z[0], z[2]) < t) lo = u; else hi = u; }
        return bz(u, z[1], z[3]);
    }
    private static float bz(float u, float p1, float p2) { float v = 1f - u; return 3f * v * v * u * p1 + 3f * v * u * u * p2 + u * u * u; }

    public static final int A = 0, B = 1, C = 2, O = 3;

    /**
     * 진행 p(0~1)에서 네 조각의 [보임, x, y, w, h] 를 out[조각*5 …] 에 쓴다. 조각: A 왼쪽 · B 가운데 · C 오른쪽(새 칸) · O 밀려나는 옛 칸.
     * kind: push_in(왼쪽 두 칸이 줄고 오른쪽에서 밀고 들어옴) · push_out(그 반대) · slide_down(새 칸이 위에서 내려오며 옛 칸을 아래로) · slide_up(새 칸이 아래에서 올라오며 옛 칸을 위로).
     */
    public static void frame(String kind, float p, float W, float H, float g, float[] out) {
        for (int i = 0; i < 20; i++) out[i] = 0f;
        p = Math.max(0f, Math.min(1f, p));
        float w2 = (W - g) / 2f, w3 = (W - 2f * g) / 3f, x3 = 2f * (w3 + g);
        if ("push_in".equals(kind) || "push_out".equals(kind)) {
            float q = "push_out".equals(kind) ? 1f - p : p, wa = w2 + (w3 - w2) * q;
            set(out, A, 0f, 0f, wa, H); set(out, B, wa + g, 0f, wa, H); set(out, C, 2f * (wa + g), 0f, w3, H);
            return;
        }
        set(out, A, 0f, 0f, w3, H); set(out, B, w3 + g, 0f, w3, H);
        if ("slide_down".equals(kind)) { set(out, C, x3, -H * (1f - p), w3, H); set(out, O, x3, H * p, w3, H); }
        else if ("slide_up".equals(kind)) { set(out, C, x3, H * (1f - p), w3, H); set(out, O, x3, -H * p, w3, H); }
        else set(out, C, x3, 0f, w3, H);
    }
    private static void set(float[] o, int k, float x, float y, float w, float h) { int b = k * 5; o[b] = 1f; o[b + 1] = x; o[b + 2] = y; o[b + 3] = w; o[b + 4] = h; }

    /** 연출을 지금 그려야 하나: 전환이 일어난 시각(sq, 엔진 시계)이 방금(2.5초 안)일 때만. 오래된 값은 최종 모양만 보인다. */
    public static boolean fresh(long sq, long wallMs) { long d = wallMs - sq; return sq > 0L && d > -2000L && d < 2500L; }
}

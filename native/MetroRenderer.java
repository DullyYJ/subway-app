package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

/**
 * 노선도를 "무엇을 어떤 순서로 그릴지" 정하는 규칙. android.* 를 쓰지 않는다 → JVM 에서 시험할 수 있다.
 * 실제로 점·선을 찍는 일은 Sink(안드로이드는 MetroMapView 안의 CanvasSink, 시험에서는 java.awt)가 맡는다.
 *
 * 규칙 (tools/metro-native/refrender.js 의 Canvas2D 참조 구현과 같다 — 그쪽은 원본 SVG 와 픽셀로 맞춰 검증돼 있다):
 *   · SVG 문서 순서대로 그린다
 *   · 호선 필터 상태 0 = 건너뜀, 1~254 = 그 불투명도, 255 = 그대로
 *   · 화면 밖(bbox 가 보이는 영역과 안 겹침)은 건너뜀
 *   · 클립은 같은 클립인 연속 구간 동안만 적용
 *   · 라벨의 영문(en) 글자는 lod 일 때 건너뜀(작게 볼 땐 어차피 안 읽힌다 — 앱의 .lz 규칙과 같음)
 */
public final class MetroRenderer {
    private MetroRenderer() {}

    public interface Sink {
        /** 바탕을 칠한다 */
        void clear(int argb);
        /** 이후 그리는 것을 이 도형 안으로 제한(save + clipPath) */
        void pushClip(int shape);
        void popClip();
        /** 도형 채우기. m 이 null 이 아니면 먼저 변환, 그다음 (x,y) 만큼 이동 */
        void fill(int shape, float x, float y, float[] m, int argb, boolean evenOdd);
        /** 도형 선 그리기. m 이 null 이 아니면 변환 안에서(선 굵기·점선도 같이 변환됨) */
        void stroke(int shape, float[] m, int argb, float width, float[] dash, boolean round);
    }

    public interface Cancel { boolean isCancelled(); }

    /** argb 의 알파에 state/255 를 곱한다 */
    public static int withState(int argb, int state) {
        if (state >= 255) return argb;
        int a = (argb >>> 24) & 255;
        int na = Math.round(a * state / 255f);
        return (na << 24) | (argb & 0x00FFFFFF);
    }

    /**
     * @param vx0..vy1  그릴 영역(SVG 좌표)
     * @param highlightOp 색을 덮어 그릴 라벨 op(없으면 -1) — 번호가 아닌 "그 라벨만 이 색으로"
     * @return 실제로 그린 op 수(시험·빈 화면 감지용). 취소되면 -1
     */
    public static int render(MetroMapData d, Sink s, int filter, boolean lod,
                             float vx0, float vy0, float vx1, float vy1,
                             int highlightOp, int highlightArgb, Cancel cancel) {
        byte[] st = d.filterState[filter < 0 || filter >= d.filterState.length ? 0 : filter];
        s.clear(d.bg);
        int cur = -1, drawn = 0;
        for (int i = 0; i < d.nOp; i++) {
            if ((i & 63) == 0 && cancel != null && cancel.isCancelled()) {
                if (cur >= 0) s.popClip();
                return -1;
            }
            int state = st[i] & 255;
            if (state == 0) continue;
            int b = 4 * i;
            if (d.bbox[b + 2] < vx0 || d.bbox[b] > vx1 || d.bbox[b + 3] < vy0 || d.bbox[b + 1] > vy1) continue;
            int c = d.clip[i];
            if (c != cur) {
                if (cur >= 0) s.popClip();
                if (c >= 0) s.pushClip(d.clipShape[c]);
                cur = c;
            }
            int kd = d.kind[i];
            if (kd == MetroMapData.K_PATH) {
                int fl = d.opFlags[i];
                boolean evenOdd = (fl & 8) != 0;
                if ((fl & 2) != 0) s.fill(d.opShape[i], 0f, 0f, d.opMatrix[i], withState(d.opFill[i], state), evenOdd);
                if ((fl & 4) != 0) s.stroke(d.opShape[i], d.opMatrix[i], withState(d.opStroke[i], state), d.opSw[i], d.opDash[i], (fl & 16) != 0);
            } else if (kd == MetroMapData.K_GLYPH) {
                s.fill(d.opShape[i], d.opX[i], d.opY[i], null, withState(d.opFill[i], state), false);
            } else {
                int a = d.lbInstStart[i], n = d.lbInstCount[i];
                boolean hl = (i == highlightOp);
                for (int k = a; k < a + n; k++) {
                    if (lod && d.inEn[k]) continue;
                    s.fill(d.inShape[k], d.inX[k], d.inY[k], null, withState(hl ? highlightArgb : d.inFill[k], state), false);
                }
            }
            drawn++;
        }
        if (cur >= 0) s.popClip();
        return drawn;
    }
}

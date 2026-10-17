package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

/**
 * 홈 경로 화면 가로 타임라인(#transitHtlTrack)의 그리기 계산 — 순수 자바(android.* 없음, JVM 에서 시험).
 *
 * 2026-10-17 (YJ: "앱 자체를 웹뷰에서 네이티브로 — 화면 단위 점진 이전, 첫 화면은 홈 경로 화면"). 네이티브 이전 P1.
 *   원칙은 그대로다: 계산은 엔진이, 그림은 앱이. 칸 목록(역명·노선 라벨·점/선 색·시각)과 칸의 자리(x·폭)는 웹이 이미 그린 DOM 에서 읽어 넘기고,
 *   마커가 어디(트랙 x)로 몇 ms 동안 가는지도 웹의 마커 배치 함수(_placeGpsMarkerSmooth)가 정한 값을 그대로 넘긴다. 이 클래스는
 *   (1) 칸 목록을 가로 내용 좌표로 놓고 (2) 스크롤 한계를 지키며 (3) 마커의 선형 이동(웹 CSS transition left Nms linear 와 같다)을 계산하고
 *   (4) 웹 CSS 색 문자열(#rgb · #rrggbb · rgb() · rgba())을 읽는다.
 *   좌표 단위는 CSS px(dp 와 같다) — 그릴 때 밀도를 곱한다.
 */
public final class HtlCore {
    /** 칸 하나 — 웹 DOM(역·도보 칸 4줄: 이름 · 노선 라벨 · 선·점 · 시각)에서 읽은 값. */
    public static final class Cell {
        public String n = "", t = "", g = "";   // 이름 · 시각(또는 도보 라벨) · 노선 라벨
        public boolean pill;                    // 노선 라벨이 색 배지(환승 ↔ · 장거리 출발/도착)인가
        public int gc = 0xFF8E8E93;             // 라벨 색(배지면 배경색)
        public float gf = 7.5f;                 // 라벨 글자 크기
        public int nc = 0xFF000000, tc = 0xFF8E8E93;   // 이름 · 시각 글자색
        public float nf = 10f, tf = 9f;         // 이름 · 시각 글자 크기
        public boolean nb = true, tb = true;    // 굵게
        public boolean hasL, hasR;              // 왼쪽 · 오른쪽 선이 있는가
        public int lc = 0xFF8E8E93, rc = 0xFF8E8E93;
        public int dc = 0xFF0A84FF;             // 점 색
        public int dk = 1;                      // 점 모양: 0 없음 · 1 속이 빈 동그라미(12) · 2 꽉 찬 점(14) · 3 작은 점(도보 6)
        public float x, w = 64f;                // 트랙 안 왼쪽 가장자리 x · 폭
    }

    /** 줄 높이(웹 행1~행4와 같다): 이름 30 · 라벨 18 · 선·점 26 · 시각 16(위 여백 3). 트랙 위 여백 6. */
    public static final float TOP = 6f, R1 = 30f, R2 = 18f, R3 = 26f, R4 = 16f, T4GAP = 3f;
    public static final float LINE_Y = 12f, LINE_H = 3f;          // 선: 줄 위에서 12, 두께 3
    public static final float TRACK_H = TOP + R1 + R2 + R3 + T4GAP + R4 + 6f;

    public Cell[] cells = new Cell[0];
    public float trackW = 0f;                  // 내용 전체 폭(마지막 칸 오른쪽 + 오른쪽 여백)

    public void set(Cell[] c, float contentW) {
        cells = (c == null) ? new Cell[0] : c;
        float end = 0f;
        for (Cell k : cells) if (k != null) end = Math.max(end, k.x + k.w);
        trackW = Math.max(contentW, end + 14f);
    }

    /** 스크롤 위치를 [0, 내용폭 − 보이는 폭] 안으로. */
    public float clampScroll(float s, float viewW) {
        float max = Math.max(0f, trackW - viewW);
        if (s < 0f) return 0f;
        return s > max ? max : s;
    }

    /** i 번째 칸의 가운데 x(내용 좌표). 범위 밖이면 가까운 쪽 끝 칸. */
    public float centerX(int i) {
        if (cells.length == 0) return 0f;
        if (i < 0) i = 0; if (i >= cells.length) i = cells.length - 1;
        Cell k = cells[i];
        return k == null ? 0f : k.x + k.w / 2f;
    }

    /** 칸 범위 [first, last] — 보이는 영역(스크롤 s, 폭 viewW)과 겹치는 칸만(그릴 칸). 없으면 first > last. */
    public int[] visible(float s, float viewW) {
        int first = -1, last = -2;
        for (int i = 0; i < cells.length; i++) {
            Cell k = cells[i];
            if (k == null) continue;
            if (k.x + k.w < s || k.x > s + viewW) continue;
            if (first < 0) first = i;
            last = i;
        }
        if (first < 0) return new int[] { 0, -1 };
        return new int[] { first, last };
    }

    // ───────────── 마커: 웹 `left Nms linear` 와 같은 선형 이동 ─────────────
    public static final class Marker {
        public boolean on;            // 보이는가(웹 마커가 display:none 이 아닌가)
        public float x, y;            // 지금 위치(트랙 좌표). y 는 점 가운데
        public float fromX, toX, fromY, toY;
        public long t0, ms;           // 이동 시작 시각(ms) · 걸리는 시간
        public boolean wait;          // 승차 대기(주황 맥박)
        public String badge = "";     // 대기 뱃지 글자(없으면 빈 글자)

        /** 새 목표로 — snap 이면 바로 그 자리(웹 transition none), 아니면 지금 위치에서 ms 동안 선형. */
        public void go(float tx, float ty, long ms, boolean snap, long now) {
            if (!on || snap || ms <= 0L) { x = tx; y = ty; fromX = tx; toX = tx; fromY = ty; toY = ty; t0 = now; this.ms = 0L; on = true; return; }
            tick(now);
            fromX = x; fromY = y; toX = tx; toY = ty; t0 = now; this.ms = ms;
        }
        /** now 의 위치를 계산해 x·y 에 넣는다. 끝났으면 true. */
        public boolean tick(long now) {
            if (ms <= 0L || now >= t0 + ms) { x = toX; y = toY; return true; }
            float p = (now - t0) / (float) ms; if (p < 0f) p = 0f;
            x = fromX + (toX - fromX) * p; y = fromY + (toY - fromY) * p;
            return false;
        }
    }

    // ───────────── 웹 CSS 색 → ARGB ─────────────
    /** "#rgb" "#rrggbb" "#aarrggbb" "rgb(r,g,b)" "rgba(r,g,b,a)" 를 읽는다. 못 읽으면 def. 투명(알파 0)은 0 을 돌려준다. */
    public static int color(String s, int def) {
        if (s == null) return def;
        s = s.trim();
        try {
            if (s.length() == 0) return def;
            if (s.charAt(0) == '#') {
                String h = s.substring(1);
                if (h.length() == 3) { int r = Integer.parseInt(h.substring(0, 1), 16), g = Integer.parseInt(h.substring(1, 2), 16), b = Integer.parseInt(h.substring(2, 3), 16); return 0xFF000000 | (r * 17) << 16 | (g * 17) << 8 | (b * 17); }
                if (h.length() == 6) return 0xFF000000 | (int) Long.parseLong(h, 16);
                if (h.length() == 8) return (int) Long.parseLong(h, 16);
                return def;
            }
            if (s.startsWith("rgb")) {
                int a = s.indexOf('('), b = s.indexOf(')');
                if (a < 0 || b < a) return def;
                String[] p = s.substring(a + 1, b).split("[ ,/]+");
                int n = 0; float[] v = new float[4]; v[3] = 1f;
                for (String q : p) { if (q.length() == 0) continue; if (n >= 4) break; v[n++] = q.endsWith("%") ? Float.parseFloat(q.substring(0, q.length() - 1)) * (n == 4 ? 0.01f : 2.55f) : Float.parseFloat(q); }
                if (n < 3) return def;
                int al = Math.round(Math.max(0f, Math.min(1f, v[3])) * 255f);
                if (al == 0) return 0;
                return al << 24 | clamp8(v[0]) << 16 | clamp8(v[1]) << 8 | clamp8(v[2]);
            }
        } catch (RuntimeException e) { /* 아래로 */ }
        return def;
    }
    private static int clamp8(float v) { int r = Math.round(v); return r < 0 ? 0 : (r > 255 ? 255 : r); }

    /** 색에 투명도 곱하기(0~1). */
    public static int withAlpha(int c, float a) {
        int al = Math.round(((c >>> 24) & 0xFF) * Math.max(0f, Math.min(1f, a)));
        return (al << 24) | (c & 0x00FFFFFF);
    }
}

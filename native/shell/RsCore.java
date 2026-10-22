package com.dullyyj.subway;

/**
 * 앱 탑승 시트(웹 rs-sheet)의 칸 계산 — 순수 자바. 무엇을 보일지(올라온 시트 · 기록 직후 되돌리기 · 대기 알약)와 글·색·막대 값은 엔진(overlay.rs)이 정하고,
 * 여기는 그 값을 dp 칸으로 놓고 눌림 · 쓸기를 가려낼 뿐이다. 그리는 일은 RsSheetView.
 */
public final class RsCore {
    private RsCore() { }

    public static final int H_BOARD = 92, H_UNDO = 54, H_PILL = 44;
    public static final float PAD = 16f, PILL_H = 30f;

    /** 시트가 차지할 높이(dp). 안 보이면 0. */
    public static int heightDp(OvCore.Ov v) {
        if (!OvCore.rsShown(v)) return 0;
        return "board".equals(v.rsSt) ? H_BOARD : ("undo".equals(v.rsSt) ? H_UNDO : H_PILL);
    }
    /** 단추 글자 수에 따른 너비(dp): [탑승] 72 · [환승완료] [되돌리기] 는 글자마다 12 더. */
    public static float btnW(String text) { int n = text == null ? 2 : text.length(); return 72f + Math.max(0, n - 2) * 12f; }
    /** 단추 칸 {x, y, w, h}(dp). 시트 너비 w. */
    public static float[] btn(OvCore.Ov v, float w) {
        float bw = btnW(v.rsBt), bh = "undo".equals(v.rsSt) ? 34f : 40f, by = "undo".equals(v.rsSt) ? (H_UNDO - bh) / 2f : 30f;
        return new float[] { w - PAD - bw, by, bw, bh };
    }
    /** 대기 알약 칸 {x, y, w, h}: 오른쪽 아래, 글 폭 tw(dp)에 맞춘다. */
    public static float[] pill(float w, float tw) { float pw = 38f + tw; return new float[] { w - PAD - pw, (H_PILL - PILL_H) / 2f, pw, PILL_H }; }
    /** 누른 곳이 하는 일: "press" · "undo" · "pill" · null. */
    public static String tap(OvCore.Ov v, float x, float y, float w, float tw) {
        if (!OvCore.rsShown(v)) return null;
        if ("wait".equals(v.rsSt)) { float[] p = pill(w, tw); return in(p, x, y, 8f) ? "pill" : null; }
        float[] b = btn(v, w);
        if (!in(b, x, y, 6f)) return null;
        return "undo".equals(v.rsSt) ? "undo" : "press";
    }
    /** 쓸기가 하는 일: 올라온 시트를 아래로 쓸면 "close"(대기 알약으로), 알약을 위로 쓸면 "open". 세로가 충분하고 가로보다 클 때만. */
    public static String swipe(OvCore.Ov v, float dx, float dy) {
        if (!OvCore.rsShown(v)) return null;
        if ("board".equals(v.rsSt) && dy > 36f && dy > Math.abs(dx) * 1.2f) return "close";
        if ("wait".equals(v.rsSt) && dy < -28f && -dy > Math.abs(dx) * 1.2f) return "open";
        return null;
    }
    /** 하단 탭 막대를 쓸었을 때(웹 _rsInitSwipe): 위로 쓸면 도착이 멀어도 시트를 연다("open"), 올라온 시트는 아래로 쓸면 닫는다("close"). 세로가 충분하고 가로보다 클 때만. */
    public static String tabSwipe(OvCore.Ov v, float dx, float dy) {
        if (dy < -28f && -dy > Math.abs(dx) * 1.2f) return v != null && "board".equals(v.rsSt) ? null : "open";
        if (dy > 36f && dy > Math.abs(dx) * 1.2f && v != null && "board".equals(v.rsSt)) return "close";
        return null;
    }
    /** 막대(출발 뒤 줄어드는 시간) 채움 너비(dp). 값이 없으면 0. */
    public static float barFill(OvCore.Ov v, float w) { return v.rsBar < 0f ? 0f : w * Math.max(0f, Math.min(1f, v.rsBar)); }
    private static boolean in(float[] r, float x, float y, float slop) { return x >= r[0] - slop && x <= r[0] + r[2] + slop && y >= r[1] - slop && y <= r[1] + r[3] + slop; }
}

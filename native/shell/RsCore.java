package com.dullyyj.subway;

/**
 * 앱 탑승 시트(웹 rs-sheet)의 칸 계산 — 순수 자바. 무엇을 보일지(올라온 시트 · 기록 직후 되돌리기 · 대기 알약)와 글·색·막대 값은 엔진(overlay.rs)이 정하고,
 * 여기는 그 값을 dp 칸으로 놓고 눌림 · 쓸기를 가려낼 뿐이다. 그리는 일은 RsSheetView.
 */
public final class RsCore {
    private RsCore() { }

    // 웹 .rs-sheet / .rs-pill / .rs-undo 의 숫자 그대로(dp): 시트 = 위 여백 8 + 손잡이 4 + 10 + 단추 줄 46 + 아래 14 + 윗선 1 = 83. 알약 · 되돌리기는 하단 탭에서 14 위에 떠 있다(웹 bottom:70).
    public static final int H_BOARD = 83, H_UNDO = 53, H_PILL = 52;
    public static final float PAD = 16f, PILL_H = 38f, PILL_R = 14f, BTN_H = 46f, ROW_Y = 23f, CAP_H = 39f, UB_W = 64f;

    /** 시트가 차지할 높이(dp). 안 보이면 0. */
    public static int heightDp(OvCore.Ov v) {
        if (!OvCore.rsShown(v)) return 0;
        return "board".equals(v.rsSt) ? H_BOARD : ("undo".equals(v.rsSt) ? H_UNDO : H_PILL);
    }
    /** 두 뷰 중 어느 쪽이 그리나: sheet 뷰(탭 아래, 올라온 시트만) · 떠 있는 뷰(탭 위, 알약 · 되돌리기). 그 뷰가 차지할 높이. */
    public static int heightDp(OvCore.Ov v, boolean sheet) {
        if (!OvCore.rsShown(v)) return 0;
        boolean b = "board".equals(v.rsSt);
        return sheet ? (b ? H_BOARD : 0) : (b ? 0 : ("undo".equals(v.rsSt) ? H_UNDO : H_PILL));
    }
    /** 단추 너비(dp): 웹 .rs-btn = 최소 92 · 좌우 24(환승완료는 16) · 16px 굵은 글 + 자간 .5. */
    public static float btnW(String text) { int n = text == null ? 2 : text.length(); return Math.max(92f, n * 16.5f + (n > 2 ? 32f : 48f)); }
    /** 단추 칸 {x, y, w, h}(dp). 시트 너비 w. */
    public static float[] btn(OvCore.Ov v, float w) {
        if ("undo".equals(v.rsSt)) return new float[] { w - PAD - UB_W, 0f, UB_W, CAP_H };
        float bw = btnW(v.rsBt);
        return new float[] { w - PAD - bw, ROW_Y, bw, BTN_H };
    }
    /** 되돌리기 알약(캡슐) {x, y, w, h}: 가운데 정렬, 글 너비 tw(dp). 웹 .rs-undo = 좌 16 · 글 · 12 · [되돌리기] · 우 12. */
    public static float[] undoCap(float w, float tw) { float cw = 16f + tw + 12f + UB_W + 12f; return new float[] { (w - cw) / 2f, 0f, cw, CAP_H }; }
    public static float[] undoBtn(float w, float tw) { float[] c = undoCap(w, tw); return new float[] { c[0] + c[2] - 12f - UB_W, 0f, UB_W, CAP_H }; }
    /** 대기 알약 칸 {x, y, w, h}: 오른쪽(14) · 글 폭 tw(dp) — 웹 .rs-pill = 좌 13 · 점 8 · 8 · 글 · 우 15. */
    public static float[] pill(float w, float tw) { float pw = 44f + tw; return new float[] { w - PILL_R - pw, 0f, pw, PILL_H }; }
    /** 누른 곳이 하는 일: "press" · "undo" · "pill" · null. tw = 알약이면 글 너비, 되돌리기면 안내 글 너비. */
    public static String tap(OvCore.Ov v, float x, float y, float w, float tw) {
        if (!OvCore.rsShown(v)) return null;
        if ("wait".equals(v.rsSt)) { float[] p = pill(w, tw); return in(p, x, y, 8f) ? "pill" : null; }
        if ("undo".equals(v.rsSt)) return in(undoBtn(w, tw), x, y, 6f) ? "undo" : null;
        float[] b = btn(v, w);
        return in(b, x, y, 6f) ? "press" : null;
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

package com.dullyyj.subway;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Shader;
import android.view.MotionEvent;
import android.view.View;
import android.view.animation.PathInterpolator;

/**
 * 탑승 시트(웹 rs-sheet · rs-pill · rs-undo). 숫자 · 색 · 움직임은 웹 CSS 그대로:
 *  · 시트(sheetMode): 하단 탭 아래 맨 아래에 붙는다. 위 둥근 20 · 윗선 1 · 손잡이 36×4 · 탈것 칸 42(둥근 13, 금색 그림) · 위 글(12 굵게 금색) · 노선 알약 + 이름(16 굵게) · 금색 단추 46(둥근 15, 맥동 링 2초).
 *    올라올 때 0.46초(cubic-bezier .22,1,.36,1) + 투명도 0.3초, 하단 탭이 같이 시트 높이만큼 올라간다. 아래로 끌면 손가락을 따라 내려가고 36 넘게 놓으면 닫힌다.
 *    닫히면 오른쪽 아래(34%, 64%)로 0.2배 줄며 사라지고 대기 알약이 0.12초 뒤 떠오른다.
 *  · 떠 있는 뷰(!sheetMode): 하단 탭 위 14. 대기 알약(높이 38 · 주황 점이 1.4초로 숨 쉼) · 기록 직후 되돌리기 캡슐(어두운 알약 · 24 아래에서 0.35초).
 * 어떤 모양을 보일지와 글 · 색 · 막대는 엔진(overlay.rs)이 정한 값이고 여기는 그리기만 한다. 그리는 동안 새 객체를 만들지 않는다.
 */
public final class RsSheetView extends View {
    public interface Act { void act(String a); }
    private static final long RISE_MS = 460L, FADE_MS = 300L;
    private static final PathInterpolator EASE = new PathInterpolator(0.22f, 1f, 0.36f, 1f);

    private final boolean sheetMode;
    private float dpr = 3f;
    private int[] pal;
    private OvCore.Ov ov, exitOv;
    private Act host;
    private View sibling;                          // 시트가 올라오면 같이 올라가는 하단 탭
    private int curH = 0;                          // 지금 차지하는 높이(dp). 사라지는 움직임이 끝날 때까지는 줄지 않는다
    private boolean exiting;
    private String lastSt = "hidden";
    private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG), tp = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF rf = new RectF(), rf2 = new RectF();
    private LinearGradient grad; private float gx0, gy0, gx1, gy1; private int gc0, gc1;
    private float dx0, dy0;
    private boolean down, dragging;

    public RsSheetView(Context c, boolean sheetMode) {
        super(c);
        this.sheetMode = sheetMode;
        dpr = c.getResources().getDisplayMetrics().density;
        tp.setTypeface(ScreenView.face(true));
        setVisibility(View.GONE);
    }
    public void setPalette(int[] pal) { this.pal = pal; invalidate(); }
    public void setHost(Act a) { host = a; }
    public void setSibling(View v) { sibling = v; }

    /** 엔진 값을 받는다(메인 스레드). 높이가 0 → 양수면 올라오고, 양수 → 0 이면 시트는 줄어들거나 내려가고 알약 · 캡슐은 가라앉는다. */
    public void setOv(OvCore.Ov v) {
        OvCore.Ov before = ov;
        ov = v;
        int h = RsCore.heightDp(v, sheetMode);
        String st = OvCore.rsShown(v) ? v.rsSt : "hidden";
        String was = lastSt; lastSt = st;
        if (h > 0) {
            exitOv = null;
            boolean rise = curH == 0 || exiting;
            exiting = false; animate().cancel();
            curH = h;
            if (getVisibility() != View.VISIBLE) setVisibility(View.VISIBLE);
            requestLayout();
            if (rise) rise(h, st, "wait".equals(was) || "undo".equals(was) || "board".equals(was));
            invalidate();
            return;
        }
        if (curH == 0) return;
        // 사라진다: 움직임이 끝날 때까지 지난 값으로 그린다
        exitOv = before != null && RsCore.heightDp(before, sheetMode) > 0 ? before : exitOv;
        if (exiting) return;
        exiting = true;
        final boolean toWait = "wait".equals(st);
        animate().cancel();
        Runnable end = new Runnable() { @Override public void run() { finishExit(); } };
        if (sheetMode) {
            float w = getWidth(), hh = curH * dpr;
            setPivotX(w); setPivotY(hh);
            if (toWait) animate().translationX(w * 0.34f).translationY(hh * 0.64f).scaleX(0.2f).scaleY(0.2f).alpha(0f).setDuration(RISE_MS).setInterpolator(EASE).withEndAction(end).start();       // 웹 .rs-sheet.shrink
            else animate().translationY(hh * 1.12f).alpha(0f).setDuration(RISE_MS).setInterpolator(EASE).withEndAction(end).start();                                                                       // 웹 기본(translateY 112%)
            if (sibling != null) sibling.animate().translationY(hh).setDuration(RISE_MS).setInterpolator(EASE).start();                                                                                 // 하단 탭이 같이 내려간다
        } else {
            animate().translationY(("undo".equals(was) ? 24f : 16f) * dpr).alpha(0f).setDuration(250L).withEndAction(end).start();
        }
    }
    private void finishExit() {
        exiting = false; exitOv = null; curH = 0;
        setVisibility(View.GONE);
        setTranslationX(0f); setTranslationY(0f); setScaleX(1f); setScaleY(1f); setAlpha(1f);
        if (sibling != null) { sibling.animate().cancel(); sibling.setTranslationY(0f); }
        requestLayout();
    }
    private void rise(int h, String st, boolean fromOther) {
        if (sheetMode) {
            setPivotX(getWidth()); setPivotY(h * dpr);
            setScaleX(1f); setScaleY(1f); setTranslationX(0f); setTranslationY(h * dpr); setAlpha(0f);
            animate().translationY(0f).setDuration(RISE_MS).setInterpolator(EASE).start();
            animate().alpha(1f).setDuration(FADE_MS).start();
            if (sibling != null) { sibling.animate().cancel(); sibling.setTranslationY(h * dpr); sibling.animate().translationY(0f).setDuration(RISE_MS).setInterpolator(EASE).start(); }      // html.rs-up .bnav
        } else if ("wait".equals(st)) {
            setPivotX(getWidth() - RsCore.PILL_R * dpr); setPivotY(RsCore.PILL_H * dpr);
            setScaleX(0.6f); setScaleY(0.6f); setTranslationY(16f * dpr); setAlpha(0f);
            animate().scaleX(1f).scaleY(1f).translationY(0f).alpha(1f).setStartDelay(120L).setDuration(400L).setInterpolator(EASE).start();      // 웹 .rs-pill.on (0.12초 뒤 0.4초)
        } else {
            setScaleX(1f); setScaleY(1f); setTranslationY(24f * dpr); setAlpha(0f);
            animate().translationY(0f).alpha(1f).setStartDelay(0L).setDuration(350L).setInterpolator(EASE).start();                               // 웹 .rs-undo.on
        }
    }

    @Override protected void onMeasure(int wms, int hms) {
        setMeasuredDimension(MeasureSpec.getSize(wms), Math.round(curH * dpr));
    }

    private int col(int i) { return pal != null ? pal[i] : 0xFF1B2129; }
    private static int alpha(int c, float a) { return (Math.round(((c >>> 24) & 255) * a) << 24) | (c & 0xFFFFFF); }

    @Override protected void onDraw(Canvas cv) {
        OvCore.Ov v = exiting && exitOv != null ? exitOv : ov;
        if (v == null || !OvCore.rsShown(v)) return;
        float w = getWidth() / dpr;
        cv.save();
        cv.scale(dpr, dpr);
        if (sheetMode) { if ("board".equals(v.rsSt)) drawBoard(cv, v, w); }
        else if ("wait".equals(v.rsSt)) drawPill(cv, v, w);
        else if ("undo".equals(v.rsSt)) drawUndo(cv, v, w);
        cv.restore();
        if (!"undo".equals(v.rsSt)) postInvalidateOnAnimation();          // 단추 맥동 · 알약 점
    }

    private void text(Canvas cv, String s, float x, float baseY, float size, boolean bold, int color) {
        tp.setTextSize(size); tp.setFakeBoldText(false); tp.setColor(color); tp.setTypeface(ScreenView.face(bold)); tp.setLetterSpacing(0f);
        cv.drawText(s, x, baseY, tp);
    }

    /** 위 둥근 20 · 윗선 1(웹 border-top). 아래 둥근 모서리는 화면 밖으로 밀어 낸다. */
    private void card(Canvas cv, float w, float h) {
        p.setShader(null);
        p.setStyle(Paint.Style.FILL); p.setColor(col(ScreenView.R_CARD));
        rf.set(0f, 0f, w, h + 24f); cv.drawRoundRect(rf, 20f, 20f, p);
        p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(col(ScreenView.R_BORDER2));
        rf.set(0.5f, 0.5f, w - 0.5f, h + 24f); cv.drawRoundRect(rf, 20f, 20f, p);
    }

    /** 탈것 그림(웹 _RS_ICON 을 단순화): 금색 몸 + 카드 색 창 · 불빛 · 다리. */
    private void glyph(Canvas cv, float cx, float cy, boolean bus) {
        int gold = col(ScreenView.R_GOLD), bg = col(ScreenView.R_CARD2);
        p.setStyle(Paint.Style.FILL); p.setColor(gold);
        if (bus) {
            rf.set(cx - 8f, cy - 10f, cx + 8f, cy + 7f); cv.drawRoundRect(rf, 3f, 3f, p);
            rf.set(cx - 7f, cy + 7f, cx - 4.5f, cy + 10f); cv.drawRect(rf, p);
            rf.set(cx + 4.5f, cy + 7f, cx + 7f, cy + 10f); cv.drawRect(rf, p);
            p.setColor(bg); rf.set(cx - 6f, cy - 7.5f, cx + 6f, cy - 1f); cv.drawRoundRect(rf, 1.5f, 1.5f, p);
            cv.drawCircle(cx - 4.8f, cy + 3.6f, 1.5f, p); cv.drawCircle(cx + 4.8f, cy + 3.6f, 1.5f, p);
        } else {
            rf.set(cx - 7f, cy - 10f, cx + 7f, cy + 6.5f); cv.drawRoundRect(rf, 3.5f, 3.5f, p);
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1.7f);
            cv.drawLine(cx - 4.5f, cy + 6f, cx - 7f, cy + 10.5f, p); cv.drawLine(cx + 4.5f, cy + 6f, cx + 7f, cy + 10.5f, p);
            p.setStyle(Paint.Style.FILL); p.setColor(bg);
            rf.set(cx - 5f, cy - 7.5f, cx + 5f, cy - 0.5f); cv.drawRoundRect(rf, 1.5f, 1.5f, p);
            cv.drawCircle(cx - 3.4f, cy + 3f, 1.4f, p); cv.drawCircle(cx + 3.4f, cy + 3f, 1.4f, p);
        }
    }

    /** 금색 단추(웹 .rs-btn): 135° 금색 → 진금색 · 둥근 15 · 16 굵은 글 + 자간 .5 · 맥동 링(2초, 0~70% 동안 12까지 번지며 사라짐). */
    private void bigButton(Canvas cv, float[] b, String label) {
        int gold = col(ScreenView.R_GOLD), gold2 = col(ScreenView.R_GOLD2);
        long t = System.currentTimeMillis() % 2000L;
        float u = t / 1400f;
        if (u < 1f) {
            float e = 1f - (1f - u) * (1f - u), s = 12f * e;
            p.setShader(null); p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(Math.max(0.5f, s)); p.setColor(alpha(gold, 0.5f * (1f - e)));
            rf2.set(b[0] - s / 2f, b[1] - s / 2f, b[0] + b[2] + s / 2f, b[1] + b[3] + s / 2f);
            cv.drawRoundRect(rf2, 15f + s / 2f, 15f + s / 2f, p);
        }
        if (grad == null || gx0 != b[0] || gy0 != b[1] || gx1 != b[0] + b[2] || gy1 != b[1] + b[3] || gc0 != gold || gc1 != gold2) {
            gx0 = b[0]; gy0 = b[1]; gx1 = b[0] + b[2]; gy1 = b[1] + b[3]; gc0 = gold; gc1 = gold2;
            grad = new LinearGradient(gx0, gy0, gx1, gy1, gold, gold2, Shader.TileMode.CLAMP);
        }
        p.setStyle(Paint.Style.FILL); p.setShader(grad);
        rf.set(b[0], b[1], b[0] + b[2], b[1] + b[3]); cv.drawRoundRect(rf, 15f, 15f, p);
        p.setShader(null);
        tp.setTextSize(16f); tp.setTypeface(ScreenView.face(true)); tp.setLetterSpacing(0.031f); tp.setColor(col(ScreenView.R_ONGOLD));
        float tw = tp.measureText(label);
        cv.drawText(label, b[0] + (b[2] - tw) / 2f, b[1] + b[3] / 2f + 5.6f, tp);
        tp.setLetterSpacing(0f);
    }

    private void drawBoard(Canvas cv, OvCore.Ov v, float w) {
        float h = RsCore.H_BOARD;
        card(cv, w, h);
        p.setStyle(Paint.Style.FILL); p.setColor(col(ScreenView.R_BORDER2));
        rf.set(w / 2f - 18f, 9f, w / 2f + 18f, 13f); cv.drawRoundRect(rf, 2f, 2f, p);        // 손잡이
        p.setColor(col(ScreenView.R_CARD2));
        rf.set(RsCore.PAD, 25f, RsCore.PAD + 42f, 67f); cv.drawRoundRect(rf, 13f, 13f, p);   // 탈것 칸 42 · 둥근 13
        glyph(cv, RsCore.PAD + 21f, 46f, "bus".equals(v.rsMode));
        float tx = RsCore.PAD + 42f + 12f, btnX = RsCore.btn(v, w)[0], right = btnX - 12f;
        String kick = v.rsKick.length() > 0 ? v.rsKick : v.rsK;
        text(cv, ell(kick, 12f, true, right - tx), tx, 38f, 12f, true, col(ScreenView.R_GOLD));      // 12px · 700 · 금색
        float x = tx;
        if (v.rsChip.length() > 0) {
            tp.setTextSize(11f); tp.setTypeface(ScreenView.face(true));
            float cw = Math.min(tp.measureText(v.rsChip) + 16f, 96f);
            p.setStyle(Paint.Style.FILL); p.setColor(v.rsCbg); rf.set(x, 45.7f, x + cw, 65.7f); cv.drawRoundRect(rf, 10f, 10f, p);
            text(cv, ell(v.rsChip, 11f, true, cw - 12f), x + 8f, 59.8f, 11f, true, v.rsCfg);
            x += cw + 7f;
        }
        text(cv, ell(v.rsNm, 16f, true, right - x), x, 61.3f, 16f, true, col(ScreenView.R_TEXT));
        bigButton(cv, RsCore.btn(v, w), v.rsBt);
        if (v.rsBar >= 0f) {                                                                  // 출발 뒤 줄어드는 막대(웹 .rs-bar: 좌우 16 · 아래 5 · 높이 3)
            float bf = RsCore.barFill(v, w - 2f * RsCore.PAD);
            p.setStyle(Paint.Style.FILL); p.setColor(col(ScreenView.R_BORDER)); rf.set(RsCore.PAD, h - 8f, w - RsCore.PAD, h - 5f); cv.drawRoundRect(rf, 1.5f, 1.5f, p);
            p.setColor(col(ScreenView.R_GOLD)); rf.set(RsCore.PAD, h - 8f, RsCore.PAD + bf, h - 5f); cv.drawRoundRect(rf, 1.5f, 1.5f, p);
        }
    }

    private float undoTextW(OvCore.Ov v) { tp.setTextSize(13f); tp.setTypeface(ScreenView.face(true)); return tp.measureText(ell(v.rsK, 13f, true, 220f)); }

    private void drawUndo(Canvas cv, OvCore.Ov v, float w) {
        String msg = ell(v.rsK, 13f, true, 220f);
        float tw = undoTextW(v);
        float[] c = RsCore.undoCap(w, tw);
        p.setShader(null); p.setStyle(Paint.Style.FILL); p.setColor(col(ScreenView.R_TEXT));              // 어두운 알약(웹 background: var(--text))
        rf.set(c[0], c[1], c[0] + c[2], c[1] + c[3]); cv.drawRoundRect(rf, c[3] / 2f, c[3] / 2f, p);
        text(cv, msg, c[0] + 16f, c[1] + c[3] / 2f + 4.6f, 13f, true, col(ScreenView.R_BG));
        float[] b = RsCore.undoBtn(w, tw);
        tp.setTextSize(13f); tp.setTypeface(ScreenView.face(true));
        String bl = v.rsBt.length() > 0 ? v.rsBt : "되돌리기";
        text(cv, bl, b[0] + (b[2] - tp.measureText(bl)) / 2f, b[1] + b[3] / 2f + 4.6f, 13f, true, 0xFF0A84FF);
    }

    private float pillTextW(OvCore.Ov v) {
        String chip = v.rsChip.length() > 0 ? v.rsChip : v.rsNm;
        tp.setTextSize(14f); tp.setTypeface(ScreenView.face(true));
        float t = tp.measureText("대기");
        if (chip.length() > 0) { tp.setTextSize(11f); t += 8f + tp.measureText(ell(chip, 11f, true, 90f)); }
        return t;
    }

    private void drawPill(Canvas cv, OvCore.Ov v, float w) {
        String chip = v.rsChip.length() > 0 ? v.rsChip : v.rsNm;
        float[] r = RsCore.pill(w, pillTextW(v));
        p.setShader(null);
        p.setStyle(Paint.Style.FILL); p.setColor(col(ScreenView.R_CARD)); rf.set(r[0], r[1], r[0] + r[2], r[1] + r[3]); cv.drawRoundRect(rf, r[3] / 2f, r[3] / 2f, p);
        p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(col(ScreenView.R_BORDER2)); rf2.set(r[0] + 0.5f, r[1] + 0.5f, r[0] + r[2] - 0.5f, r[1] + r[3] - 0.5f); cv.drawRoundRect(rf2, r[3] / 2f, r[3] / 2f, p);
        float ph = (System.currentTimeMillis() % 1400L) / 1400f, s = 0.5f - 0.5f * (float) Math.cos(ph * 2.0 * Math.PI);     // 숨쉬는 점(웹 rsDot 1.4초: 투명도 1→.35 · 크기 1→.7)
        p.setStyle(Paint.Style.FILL); p.setColor(alpha(col(ScreenView.R_ORANGE), 1f - 0.65f * s)); cv.drawCircle(r[0] + 13f + 4f, r[1] + r[3] / 2f, 4f * (1f - 0.3f * s), p);
        float x = r[0] + 13f + 8f + 8f, by = r[1] + r[3] / 2f + 5f;
        text(cv, "대기", x, by, 14f, true, col(ScreenView.R_TEXT));
        if (chip.length() > 0) {
            tp.setTextSize(14f); tp.setTypeface(ScreenView.face(true));
            text(cv, ell(chip, 11f, true, 90f), x + tp.measureText("대기") + 8f, by - 0.5f, 11f, true, col(ScreenView.R_SUB));
        }
    }

    /** 폭에 맞게 …로 줄인 글(글이 폭 안이면 같은 문자열을 돌려줘 새 객체를 만들지 않는다). */
    private String ell(String s, float size, boolean bold, float maxW) {
        if (s == null || s.length() == 0) return "";
        tp.setTextSize(size); tp.setTypeface(ScreenView.face(bold));
        if (tp.measureText(s) <= maxW) return s;
        int n = s.length();
        while (n > 1 && tp.measureText(s, 0, n) + tp.measureText("…") > maxW) n--;
        return s.substring(0, n) + "…";
    }

    @Override public boolean onTouchEvent(MotionEvent e) {
        OvCore.Ov v = ov;
        if (v == null || exiting || !OvCore.rsShown(v)) return false;
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                if (!sheetMode) {                                                   // 떠 있는 뷰는 알약 · 캡슐 자리만 받고 나머지 터치는 뒤 화면으로 보낸다
                    float w0 = getWidth() / dpr, x0 = e.getX() / dpr, y0 = e.getY() / dpr;
                    float tw0 = "wait".equals(v.rsSt) ? pillTextW(v) : undoTextW(v);
                    float[] r0 = "wait".equals(v.rsSt) ? RsCore.pill(w0, tw0) : RsCore.undoCap(w0, tw0);
                    if (x0 < r0[0] - 8f || x0 > r0[0] + r0[2] + 8f || y0 < r0[1] - 8f || y0 > r0[1] + r0[3] + 8f) return false;
                }
                dx0 = e.getRawX() / dpr; dy0 = e.getRawY() / dpr; down = true; dragging = false; return true;
            case MotionEvent.ACTION_MOVE: {
                if (!down || !sheetMode || !"board".equals(v.rsSt)) return true;
                float dx = e.getRawX() / dpr - dx0, dy = e.getRawY() / dpr - dy0;
                if (dy > 0 && dy > Math.abs(dx)) { dragging = true; setTranslationY(dy * dpr); }          // 웹: 시트가 손가락을 따라 내려온다
                else if (dragging) { dragging = false; setTranslationY(0f); }
                return true;
            }
            case MotionEvent.ACTION_UP: {
                if (!down) return false;
                down = false;
                float x = e.getX() / dpr, y = e.getY() / dpr, w = getWidth() / dpr;
                float rawDx = e.getRawX() / dpr - dx0, rawDy = e.getRawY() / dpr - dy0;
                boolean was = dragging; dragging = false;
                String sw = RsCore.swipe(v, rawDx, rawDy);
                if (was && sw == null) animate().translationY(0f).setDuration(200L).setInterpolator(EASE).start();
                if (sw != null) {
                    fire(sw);
                    if (was) postDelayed(new Runnable() { @Override public void run() { if (!exiting && getTranslationY() > 0f) animate().translationY(0f).setDuration(200L).start(); } }, 900L);
                    return true;
                }
                if (Math.abs(rawDx) < 10f && Math.abs(rawDy) < 10f) {
                    float tw = "wait".equals(v.rsSt) ? pillTextW(v) : ("undo".equals(v.rsSt) ? undoTextW(v) : 0f);
                    String a = RsCore.tap(v, x, y, w, tw);
                    if (a != null) { performHapticFeedback(android.view.HapticFeedbackConstants.KEYBOARD_TAP); fire(a); }
                }
                return true;
            }
            case MotionEvent.ACTION_CANCEL: down = false; if (dragging) { dragging = false; animate().translationY(0f).setDuration(200L).start(); } return true;
            default: return true;
        }
    }
    private void fire(String a) { if (host != null) host.act(a); }
}

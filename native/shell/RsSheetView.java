package com.dullyyj.subway;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.view.MotionEvent;
import android.view.View;
import android.view.animation.DecelerateInterpolator;

/**
 * 탑승 시트(웹 rs-sheet): 도착 2분 전에 올라오는 [탑승]/[환승완료] 줄 · 기록 직후 [되돌리기] · 줄어든 대기 알약.
 * 어떤 모양으로 보일지와 글·색·막대는 모두 엔진(overlay.rs)이 정한 값이고, 여기는 받은 대로 그리고 손짓을 서비스(엔진 다음 걸음)로 전할 뿐이다.
 * 그리는 동안 새 객체를 만들지 않는다(Paint · RectF 는 미리 만들어 둔다).
 */
public final class RsSheetView extends View {
    public interface Act { void act(String a); }

    private float dpr = 3f;
    private int[] pal;
    private OvCore.Ov ov;
    private Act host;
    private int lastH = 0;
    private boolean pulse;
    private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG), tp = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF rf = new RectF();
    private float dx0, dy0;
    private boolean down;

    public RsSheetView(Context c) {
        super(c);
        dpr = c.getResources().getDisplayMetrics().density;
        tp.setTypeface(ScreenView.face(true));
        setVisibility(View.GONE);
    }
    public void setPalette(int[] pal) { this.pal = pal; invalidate(); }
    public void setHost(Act a) { host = a; }

    /** 엔진 값을 받는다(메인 스레드). 높이가 0 → 양수로 바뀌면 아래에서 올라오는 모션. */
    public void setOv(OvCore.Ov v) {
        ov = v;
        int h = RsCore.heightDp(v);
        pulse = h > 0 && "wait".equals(v.rsSt);
        if (h == 0) { if (lastH != 0) { lastH = 0; setVisibility(View.GONE); } return; }
        boolean rise = lastH == 0;
        lastH = h;
        if (getVisibility() != View.VISIBLE) setVisibility(View.VISIBLE);
        requestLayout();
        if (rise) { setTranslationY(h * dpr); animate().translationY(0f).setDuration(260L).setInterpolator(new DecelerateInterpolator()).start(); }
        invalidate();
    }

    @Override protected void onMeasure(int wms, int hms) {
        setMeasuredDimension(MeasureSpec.getSize(wms), Math.round(RsCore.heightDp(ov) * dpr));
    }

    private int col(int i) { return pal != null ? pal[i] : 0xFF1B2129; }
    private static int alpha(int c, float a) { return (Math.round(((c >>> 24) & 255) * a) << 24) | (c & 0xFFFFFF); }

    @Override protected void onDraw(Canvas cv) {
        OvCore.Ov v = ov;
        if (v == null || !OvCore.rsShown(v)) return;
        float w = getWidth() / dpr;
        cv.save();
        cv.scale(dpr, dpr);
        if ("wait".equals(v.rsSt)) drawPill(cv, v, w);
        else if ("undo".equals(v.rsSt)) drawUndo(cv, v, w);
        else drawBoard(cv, v, w);
        cv.restore();
        if (pulse) postInvalidateOnAnimation();
    }

    private void text(Canvas cv, String s, float x, float baseY, float size, boolean bold, int color) {
        tp.setTextSize(size); tp.setFakeBoldText(false); tp.setColor(color); tp.setTypeface(ScreenView.face(bold));
        cv.drawText(s, x, baseY, tp);
    }

    private void card(Canvas cv, float w, float h) {
        p.setStyle(Paint.Style.FILL); p.setColor(col(ScreenView.R_CARD));
        rf.set(0f, 0f, w, h + 24f); cv.drawRoundRect(rf, 20f, 20f, p);               // 아래쪽 둥근 모서리는 화면 밖으로 밀어 낸다
        p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(col(ScreenView.R_BORDER));
        rf.set(0.5f, 0.5f, w - 0.5f, h + 24f); cv.drawRoundRect(rf, 20f, 20f, p);
    }

    private void button(Canvas cv, float[] b, String label, boolean outline) {
        rf.set(b[0], b[1], b[0] + b[2], b[1] + b[3]);
        if (outline) { p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1.2f); p.setColor(0xFF0A84FF); cv.drawRoundRect(rf, b[3] / 2f, b[3] / 2f, p); }
        else { p.setStyle(Paint.Style.FILL); p.setColor(0xFF0A84FF); cv.drawRoundRect(rf, b[3] / 2f, b[3] / 2f, p); }
        tp.setTextSize(15f); tp.setTypeface(ScreenView.face(true));
        float tw = tp.measureText(label);
        text(cv, label, b[0] + (b[2] - tw) / 2f, b[1] + b[3] / 2f + 5.4f, 15f, true, outline ? 0xFF0A84FF : 0xFFFFFFFF);
    }

    private void drawBoard(Canvas cv, OvCore.Ov v, float w) {
        float h = RsCore.H_BOARD;
        card(cv, w, h);
        p.setStyle(Paint.Style.FILL); p.setColor(alpha(col(ScreenView.R_SUB), 0.5f));
        rf.set(w / 2f - 18f, 8f, w / 2f + 18f, 12f); cv.drawRoundRect(rf, 2f, 2f, p);        // 손잡이
        // 탈것 동그라미 + 모양
        float cx = RsCore.PAD + 20f, cy = 50f;
        p.setColor(alpha(v.rsCbg, 0.16f)); cv.drawCircle(cx, cy, 20f, p);
        p.setColor(v.rsCbg);
        rf.set(cx - 8f, cy - 10f, cx + 8f, cy + 7f); cv.drawRoundRect(rf, 4f, 4f, p);        // 차체
        p.setColor(col(ScreenView.R_CARD));
        rf.set(cx - 5f, cy - 7f, cx + 5f, cy - 1f); cv.drawRoundRect(rf, 1.5f, 1.5f, p);     // 앞 유리
        p.setColor(v.rsCbg);
        cv.drawCircle(cx - 4.5f, cy + 10f, 1.8f, p); cv.drawCircle(cx + 4.5f, cy + 10f, 1.8f, p);
        float tx = cx + 20f + 12f, btnX = RsCore.btn(v, w)[0];
        // 곧 도착 문구 + 노선 알약 + 이름
        tp.setTextSize(12f); tp.setTypeface(ScreenView.face(false));
        String kick = v.rsKick.length() > 0 ? v.rsKick : v.rsK;
        text(cv, ell(kick, 12f, false, btnX - tx - 8f), tx, 40f, 12f, false, col(ScreenView.R_SUB));
        float x = tx;
        if (v.rsChip.length() > 0) {
            tp.setTextSize(11f); tp.setTypeface(ScreenView.face(true));
            float cw = Math.min(tp.measureText(v.rsChip) + 14f, 84f);
            p.setStyle(Paint.Style.FILL); p.setColor(v.rsCbg); rf.set(x, 48f, x + cw, 66f); cv.drawRoundRect(rf, 9f, 9f, p);
            text(cv, ell(v.rsChip, 11f, true, cw - 10f), x + 7f, 61f, 11f, true, v.rsCfg);
            x += cw + 7f;
        }
        text(cv, ell(v.rsNm, 17f, true, btnX - x - 8f), x, 63f, 17f, true, col(ScreenView.R_TEXT));
        button(cv, RsCore.btn(v, w), v.rsBt, false);
        // 출발 뒤 줄어드는 막대
        float bf = RsCore.barFill(v, w - 2f * RsCore.PAD);
        if (v.rsBar >= 0f) {
            p.setStyle(Paint.Style.FILL); p.setColor(alpha(col(ScreenView.R_SUB), 0.25f)); rf.set(RsCore.PAD, h - 6f, w - RsCore.PAD, h - 3f); cv.drawRoundRect(rf, 1.5f, 1.5f, p);
            p.setColor(0xFF0A84FF); rf.set(RsCore.PAD, h - 6f, RsCore.PAD + bf, h - 3f); cv.drawRoundRect(rf, 1.5f, 1.5f, p);
        }
    }

    private void drawUndo(Canvas cv, OvCore.Ov v, float w) {
        float h = RsCore.H_UNDO;
        card(cv, w, h);
        float[] b = RsCore.btn(v, w);
        text(cv, ell(v.rsK, 14f, true, b[0] - RsCore.PAD - 12f), RsCore.PAD, h / 2f + 5f, 14f, true, col(ScreenView.R_TEXT));
        button(cv, b, v.rsBt, true);
    }

    private void drawPill(Canvas cv, OvCore.Ov v, float w) {
        String chip = v.rsChip.length() > 0 ? v.rsChip : v.rsNm;
        tp.setTextSize(12f); tp.setTypeface(ScreenView.face(true));
        float tw = tp.measureText("대기") + 6f + (chip.length() > 0 ? tp.measureText(ell(chip, 12f, true, 90f)) : 0f);
        float[] r = RsCore.pill(w, tw);
        p.setStyle(Paint.Style.FILL); p.setColor(col(ScreenView.R_CARD)); rf.set(r[0], r[1], r[0] + r[2], r[1] + r[3]); cv.drawRoundRect(rf, r[3] / 2f, r[3] / 2f, p);
        p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(col(ScreenView.R_BORDER)); cv.drawRoundRect(rf, r[3] / 2f, r[3] / 2f, p);
        float ph = (float) ((System.currentTimeMillis() % 1600L) / 1600.0);
        float a = 0.45f + 0.55f * (float) Math.abs(Math.sin(ph * Math.PI));                      // 숨쉬는 점(웹 rs-dot)
        p.setStyle(Paint.Style.FILL); p.setColor(alpha(0xFF0A84FF, a)); cv.drawCircle(r[0] + 14f, r[1] + r[3] / 2f, 4f, p);
        text(cv, "대기", r[0] + 24f, r[1] + r[3] / 2f + 4.4f, 12f, true, col(ScreenView.R_TEXT));
        if (chip.length() > 0) text(cv, ell(chip, 12f, true, 90f), r[0] + 24f + tp.measureText("대기") + 6f, r[1] + r[3] / 2f + 4.4f, 12f, true, col(ScreenView.R_SUB));
    }

    /** 폭에 맞게 …로 줄인 글(그릴 때 호출되지만 글이 폭 안이면 같은 문자열을 돌려줘 새 객체를 만들지 않는다). */
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
        if (v == null || !OvCore.rsShown(v)) return false;
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN: dx0 = e.getX() / dpr; dy0 = e.getY() / dpr; down = true; return true;
            case MotionEvent.ACTION_UP: {
                if (!down) return false;
                down = false;
                float x = e.getX() / dpr, y = e.getY() / dpr, w = getWidth() / dpr;
                String sw = RsCore.swipe(v, x - dx0, y - dy0);
                if (sw != null) { fire(sw); return true; }
                if (Math.abs(x - dx0) < 10f && Math.abs(y - dy0) < 10f) {
                    tp.setTextSize(12f); tp.setTypeface(ScreenView.face(true));
                    String chip = v.rsChip.length() > 0 ? v.rsChip : v.rsNm;
                    float tw = tp.measureText("대기") + 6f + (chip.length() > 0 ? tp.measureText(ell(chip, 12f, true, 90f)) : 0f);
                    String a = RsCore.tap(v, x, y, w, tw);
                    if (a != null) { performHapticFeedback(android.view.HapticFeedbackConstants.KEYBOARD_TAP); fire(a); }
                }
                return true;
            }
            case MotionEvent.ACTION_CANCEL: down = false; return true;
            default: return true;
        }
    }
    private void fire(String a) { if (host != null) host.act(a); }
}

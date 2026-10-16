package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.os.SystemClock;
import android.view.MotionEvent;
import android.view.View;

/**
 * 경로 카드 맨 아래 줄 전환 연출을 그리는 투명한 얹기 뷰(2026-10-16). 연출이 도는 0.4초 동안만 웹 줄 위에 떠 있고 끝나면 스스로 치워진다.
 *   · 진행도·자리는 RowCore(엔진이 준 kind·시간·곡선) — 이 뷰는 그리기만 한다. vsync 마다(postInvalidateOnAnimation) 다시 그려 화면 주사율(60·90·120Hz)을 그대로 따른다.
 *   · 손가락은 가져가지 않는다(false) — 아래 웹 줄이 이미 최종 모양이라 눌림은 그대로 웹이 받는다.
 */
public final class RowOverlayView extends View {
    public interface Done { void onDone(); }

    /** 조각 하나의 겉모양(웹 버튼의 계산된 스타일을 그대로 받는다). */
    public static final class Spec {
        String label = ""; int bg = 0xff2f7cf6, fg = 0xffffffff, bd = 0; float fs = 13f, br = 12f; boolean bold = true;
    }

    private final Spec[] spec = { new Spec(), new Spec(), new Spec(), new Spec() };
    private final float[] fr = new float[RowCore.SIZE];
    private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG), stroke = new Paint(Paint.ANTI_ALIAS_FLAG), text = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF rr = new RectF();
    private String kind = "none";
    private float rowW, rowH, gap, dpr = 1f; private float[] ez = { 0.2f, 0f, 0f, 1f };
    private long startMs, durMs; private int cardBg = 0; private boolean running; private Done done;

    public RowOverlayView(Context c) {
        super(c);
        setClickable(false); setFocusable(false);
        stroke.setStyle(Paint.Style.STROKE); text.setTextAlign(Paint.Align.CENTER);
    }
    @Override public boolean dispatchTouchEvent(MotionEvent e) { return false; }
    @Override public boolean onTouchEvent(MotionEvent e) { return false; }

    /** 조각 겉모양 지정. i = RowCore.A/B/C/O. 크기(fs·br·gap)는 CSS px — 뷰가 dpr 을 곱한다. */
    public void setSpec(int i, String label, int bg, int fg, int bd, float fsCss, float brCss, boolean bold) {
        Spec s = spec[i]; s.label = label == null ? "" : label; s.bg = bg; s.fg = fg; s.bd = bd; s.fs = fsCss; s.br = brCss; s.bold = bold;
    }

    public void start(String kind, long ms, float[] ease, float rowWCss, float rowHCss, float gapCss, float dpr, int cardBg, Done done) {
        this.kind = kind == null ? "none" : kind; this.durMs = Math.max(1L, ms); this.dpr = dpr > 0f ? dpr : 1f;
        if (ease != null && ease.length >= 4) ez = ease;
        rowW = rowWCss * this.dpr; rowH = rowHCss * this.dpr; gap = gapCss * this.dpr; this.cardBg = cardBg; this.done = done;
        startMs = SystemClock.uptimeMillis(); running = true; setVisibility(VISIBLE); postInvalidateOnAnimation();
    }
    public void stopNow() { running = false; done = null; setVisibility(GONE); }
    public boolean isRunning() { return running; }

    @Override protected void onDraw(Canvas cv) {
        if (!running) return;
        float t = (SystemClock.uptimeMillis() - startMs) / (float) durMs;
        float p = RowCore.ease(Math.min(1f, Math.max(0f, t)), ez[0], ez[1], ez[2], ez[3]);
        cv.save();
        cv.clipRect(0f, 0f, rowW, rowH);
        if ((cardBg >>> 24) != 0) cv.drawColor(cardBg);                       // 아래 웹 줄(이미 최종 모양)을 가린다 — 카드 바탕색
        RowCore.frame(kind, p, rowW, rowH, gap, fr);
        for (int i = RowCore.O; i >= 0; i--) {                                 // o → c → b → a 순서: 밀려 나가는 옛 칸을 먼저 그려 새 칸이 위에 온다
            int k = i * RowCore.STRIDE; if (fr[k] < 0.5f) continue;
            draw(cv, spec[i], fr[k + 1], fr[k + 2], fr[k + 3], fr[k + 4]);
        }
        cv.restore();
        if (t >= 1f) { running = false; Done d = done; done = null; setVisibility(GONE); if (d != null) d.onDone(); }
        else postInvalidateOnAnimation();
    }

    private void draw(Canvas cv, Spec s, float x, float y, float w, float h) {
        if (w < 1f || h < 1f) return;
        rr.set(x, y, x + w, y + h);
        float r = s.br * dpr;
        fill.setColor(s.bg); cv.drawRoundRect(rr, r, r, fill);
        if ((s.bd >>> 24) != 0) { stroke.setColor(s.bd); stroke.setStrokeWidth(Math.max(1f, dpr)); rr.inset(dpr * 0.5f, dpr * 0.5f); cv.drawRoundRect(rr, r, r, stroke); }
        text.setColor(s.fg); text.setTypeface(s.bold ? Typeface.DEFAULT_BOLD : Typeface.DEFAULT);
        float size = s.fs * dpr; text.setTextSize(size);
        float avail = Math.max(1f, w - 8f * dpr), tw = text.measureText(s.label);
        if (tw > avail) { size = Math.max(9f * dpr, size * avail / tw); text.setTextSize(size); }     // 좁으면 글자를 줄여 맞춘다
        Paint.FontMetrics fm = text.getFontMetrics();
        cv.save(); cv.clipRect(x, y, x + w, y + h);
        cv.drawText(s.label, x + w / 2f, y + h / 2f - (fm.ascent + fm.descent) / 2f, text);
        cv.restore();
    }
}

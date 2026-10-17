package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.os.SystemClock;
import android.text.TextPaint;
import android.text.TextUtils;
import android.view.MotionEvent;
import android.view.View;

/**
 * 홈 경로 화면 가로 타임라인을 그리는 뷰 — 2026-10-17 네이티브 이전 P1.
 *   그릴 값(칸·테마·스크롤·마커)은 모두 웹이 정해 넘긴 것이다(HtlCore). 여기는 그리기만 한다 — 손가락은 받지 않는다(웹뷰가 그대로 스크롤한다).
 *   좌표는 CSS px 로 계산해 두고 밀도(dpr)를 한 번 곱해 그린다. 웹 마커의 깜박임(1.3초)·승차 대기 맥박(1.6초)과 같은 박자를 쓴다.
 */
public class HtlView extends View {
    private final HtlCore core = new HtlCore();
    private final HtlCore.Marker mk = new HtlCore.Marker();
    private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final TextPaint tp = new TextPaint(Paint.ANTI_ALIAS_FLAG);
    private final RectF rf = new RectF();
    private float dpr = 1f, sx = 0f;
    private int bg = 0xFFFFFFFF, fg = 0xFF111114, sub = 0xFF8E8E93;
    private volatile long lastDraw = 0L;
    private boolean drewOnce = false;
    private Runnable onFirst;
    private HtlCore.Run[] runs = null;                 // 글자 덩어리 모드(경로 카드 머리줄 등) — 있으면 칸·마커 대신 이것만 그린다

    public HtlView(Context c) {
        super(c);
        tp.setTextAlign(Paint.Align.CENTER);
        setWillNotDraw(false);
    }

    // 손가락은 웹뷰가 받는다 — 이 뷰는 그리기만
    @Override public boolean dispatchTouchEvent(MotionEvent e) { return false; }
    @Override public boolean onTouchEvent(MotionEvent e) { return false; }

    public void setFirstDraw(Runnable r) { onFirst = r; }
    public long drawAgeMs() { return lastDraw == 0L ? Long.MAX_VALUE : SystemClock.uptimeMillis() - lastDraw; }
    public int cellCount() { return runs != null ? runs.length : core.cells.length; }

    public void setDpr(float d) { if (d > 0f) dpr = d; invalidate(); }
    public void setTheme(int bgc, int fgc, int subc) { bg = bgc; fg = fgc; sub = subc; invalidate(); }
    public void setCells(HtlCore.Cell[] cs, float trackW) { core.set(cs, trackW); invalidate(); }
    public void setRuns(HtlCore.Run[] r) { runs = r; invalidate(); }
    public int runCount() { return runs == null ? 0 : runs.length; }
    public void setScroll(float s) { sx = s; invalidate(); }
    public float scroll() { return sx; }

    /** 마커: on/off · 목표(x,y 트랙 좌표) · 걸리는 시간 · 첫 배치 여부 · 승차 대기 · 뱃지 글자. */
    public void setMarker(boolean on, float x, float y, long ms, boolean snap, boolean wait, String badge) {
        long now = SystemClock.uptimeMillis();
        if (!on) { mk.on = false; }
        else mk.go(x, y, ms, snap, now);
        mk.wait = wait; mk.badge = badge == null ? "" : badge;
        invalidate();
    }

    /** 위치는 그대로 두고 승차 대기 맥박·뱃지 글자만 바꾼다. */
    public void setMarkerFlags(boolean wait, String badge) { mk.wait = wait; mk.badge = badge == null ? "" : badge; invalidate(); }

    private void text(Canvas cv, String s, float cx, float base, float maxW, float size, int color, boolean bold) {
        if (s == null || s.length() == 0) return;
        tp.setTextSize(size); tp.setColor(color); tp.setFakeBoldText(false);
        tp.setTypeface(bold ? Typeface.DEFAULT_BOLD : Typeface.DEFAULT);
        CharSequence e = TextUtils.ellipsize(s, tp, Math.max(1f, maxW), TextUtils.TruncateAt.END);
        cv.drawText(e, 0, e.length(), cx, base, tp);
    }

    @Override protected void onDraw(Canvas cv) {
        long now = SystemClock.uptimeMillis();
        lastDraw = now;
        p.setStyle(Paint.Style.FILL);
        p.setColor(bg);
        cv.drawRect(0, 0, getWidth(), getHeight(), p);
        if (runs != null) {                                   // 글자 덩어리: 웹이 정한 자리에 그대로(줄바꿈·배치는 하지 않는다)
            cv.save();
            cv.scale(dpr, dpr);
            for (HtlCore.Run r : runs) {
                if (r == null || r.t.length() == 0) continue;
                tp.setTextAlign(Paint.Align.LEFT);
                tp.setTextSize(r.size); tp.setColor(r.color); tp.setFakeBoldText(false);
                tp.setTypeface(r.bold ? Typeface.DEFAULT_BOLD : Typeface.DEFAULT);
                Paint.FontMetrics fm = tp.getFontMetrics();
                CharSequence e = TextUtils.ellipsize(r.t, tp, Math.max(1f, r.w), TextUtils.TruncateAt.END);
                cv.drawText(e, 0, e.length(), r.x, HtlCore.baseline(r.y, r.h, fm.ascent, fm.descent), tp);
            }
            tp.setTextAlign(Paint.Align.CENTER);
            cv.restore();
            if (!drewOnce) { drewOnce = true; if (onFirst != null) post(onFirst); }
            return;
        }
        cv.save();
        cv.scale(dpr, dpr);                                   // 이제부터 좌표는 CSS px
        float viewW = getWidth() / dpr;
        int[] vr = core.visible(sx - 4f, viewW + 8f);
        cv.translate(-sx, 0f);
        float top = HtlCore.TOP;
        for (int i = vr[0]; i <= vr[1]; i++) {
            HtlCore.Cell c = core.cells[i];
            if (c == null) continue;
            float cx = c.x + c.w / 2f;
            // 행1: 이름 — 아래 정렬
            text(cv, c.n, cx, top + HtlCore.R1 - 3.5f, c.w - 4f, c.nf, c.nc, c.nb);
            // 행2: 노선 라벨(배지 또는 글자)
            float r2 = top + HtlCore.R1;
            if (c.g.length() > 0) {
                if (c.pill) {
                    float pad = 4.5f;
                    tp.setTextSize(c.gf); tp.setTypeface(Typeface.DEFAULT_BOLD);
                    float tw = Math.min(tp.measureText(c.g), c.w - 2f - pad * 2f);
                    float bw = tw + pad * 2f, bh = c.gf * 1.25f + 2f;
                    rf.set(cx - bw / 2f, r2 + (HtlCore.R2 - bh) / 2f, cx + bw / 2f, r2 + (HtlCore.R2 + bh) / 2f);
                    p.setColor(c.gc); cv.drawRoundRect(rf, 4f, 4f, p);
                    text(cv, c.g, cx, rf.centerY() + c.gf * 0.36f, c.w - 2f - pad * 2f, c.gf, 0xFFFFFFFF, true);
                } else {
                    text(cv, c.g, cx, r2 + HtlCore.R2 / 2f + c.gf * 0.36f, c.w, c.gf, c.gc, true);
                }
            }
            // 행3: 선 · 점
            float r3 = r2 + HtlCore.R2, ly = r3 + HtlCore.LINE_Y, cy = r3 + 13f;
            if (c.hasL) { p.setColor(c.lc); cv.drawRect(c.x, ly, cx, ly + HtlCore.LINE_H, p); }
            if (c.hasR) { p.setColor(c.rc); cv.drawRect(cx, ly, c.x + c.w, ly + HtlCore.LINE_H, p); }
            if (c.dk == 2) { p.setColor(c.dc); cv.drawCircle(cx, cy, 7f, p); }
            else if (c.dk == 1) { p.setColor(c.dc); cv.drawCircle(cx, cy, 6f, p); p.setColor(bg); cv.drawCircle(cx, cy, 3f, p); }
            else if (c.dk == 3) { p.setColor(c.dc); cv.drawCircle(cx, cy, 3f, p); }
            // 행4: 시각(또는 도보 라벨)
            float r4 = r3 + HtlCore.R3 + HtlCore.T4GAP;
            text(cv, c.t, cx, r4 + HtlCore.R4 / 2f + c.tf * 0.36f, c.w - 2f, c.tf, c.tc, c.tb);
        }
        // 마커 — 위치는 웹의 `left Nms linear` 와 같은 선형 이동
        if (mk.on) {
            boolean running = !mk.tick(now);
            float mx = mk.x, my = mk.y;
            float ph = ((now % (mk.wait ? 1600L : 1300L)) / (float) (mk.wait ? 1600L : 1300L));
            float pulse = (float) (0.5 - 0.5 * Math.cos(ph * 2.0 * Math.PI));        // 0→1→0
            int mc = mk.wait ? 0xFFFF9F0A : 0xFF0A84FF;
            if (mk.wait) {
                p.setColor(HtlCore.withAlpha(mc, 0.28f)); cv.drawCircle(mx, my, 7f + 4f * (0.8f + 0.25f * pulse), p);
            } else {
                p.setColor(HtlCore.withAlpha(mc, 0.55f * (1f - pulse))); cv.drawCircle(mx, my, 7f + 6f * pulse, p);   // 번지는 고리
            }
            float sc = mk.wait ? (1f + 0.25f * pulse) : 1f;
            p.setColor(0xFFFFFFFF); cv.drawCircle(mx, my, 7f * sc, p);
            p.setColor(mc); cv.drawCircle(mx, my, 5f * sc, p);
            if (mk.wait && mk.badge.length() > 0) {            // 승차 대기 뱃지: 마커 위 주황 알약
                tp.setTextSize(9f); tp.setTypeface(Typeface.DEFAULT_BOLD);
                float bw = tp.measureText(mk.badge) + 14f, bh = 12f, by = my - 7f - 9f - bh / 2f;
                rf.set(mx - bw / 2f, by - bh / 2f, mx + bw / 2f, by + bh / 2f);
                p.setColor(0xFFFF9F0A); cv.drawRoundRect(rf, 6f, 6f, p);
                text(cv, mk.badge, mx, by + 3.2f, bw, 9f, 0xFFFFFFFF, true);
            }
            postInvalidateOnAnimation();                        // 깜박임·이동 — 화면 박자마다(보일 때만)
        }
        cv.restore();
        if (!drewOnce) { drewOnce = true; if (onFirst != null) post(onFirst); }
    }
}

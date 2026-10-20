package com.dullyyj.subway;   // ★ 앱 패키지와 같아야 한다

import android.animation.ValueAnimator;
import android.content.Context;
import android.content.Intent;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.RectF;
import android.graphics.SweepGradient;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.TextPaint;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.WindowManager;
import android.view.animation.LinearInterpolator;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * 다른 앱 위에 뜨는 안내 카드. 칸 줄(정류장 이름 · 시각 · 노선 라벨 · 점과 선) · 남은시간 · 하차 임박 큰 안내 · 도착 뒤 [안내 종료] · 접힌 알약.
 *
 * ★ 원칙(YJ): "모든 계산은 엔진이 한다. 앱은 그림만 그린다." 글 · 색 · 점 모양 · 현위치 칸 · 경고 단계(alert 0·1·2)는 엔진(/ride-standby 의 overlay)이 정한 값 그대로이고
 *   OvCore 가 읽어 준다. 여기는 창을 만들고 그리고 손짓(누르기 · 쓸기 · 꾹 눌러 옮기기)을 받을 뿐이다.
 * 경고 단계에서는 카드 테두리에 무지개가 돈다(2정거장 전 천천히 · 1정거장 전 빠르게). 진동은 알림(RideService)이 이미 울리므로 여기서는 울리지 않는다.
 * 권한: '다른 앱 위에 표시'(SYSTEM_ALERT_WINDOW). 없으면 아무것도 하지 않는다. 설정에서 스위치를 켰을 때만 뜬다. 모든 창 조작은 메인 스레드에서.
 */
final class RideOverlay {
    private final Context ctx;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final float dn;
    private WindowManager wm;
    private FrameLayout box;
    private LinearLayout col;
    private StripView strip;
    private TextView t1, t2, t3, btn, pillT, rsT;
    private LinearLayout rsRow;
    private RowView rowView;
    private Host host;
    private Border border;
    private GradientDrawable bg;
    private WindowManager.LayoutParams lp;
    private boolean shown, userPill, blinkOn = true, blinking, userScrolling;
    private OvCore.Ov cur = new OvCore.Ov();
    private float scrollPos;
    private ValueAnimator pulseAnim, pillAnim;
    private static int lastY = -1;
    private static final long BLINK_MS = 550L;

    /** 오버레이의 손짓을 받는 쪽(탑승 서비스). 없으면 안내 종료만 스스로 한다. */
    interface Host {
        void act(String a);                   // 탑승 줄: press · undo · open · close · pill
        void recoGo(OvCore.Row r);            // 추천 줄 [보기]
        void recoOk(long at);                 // 추천 줄 [확인]
        void quitApp();                       // 내릴 준비 줄 [앱 종료]
        void endRide();                       // 도착 줄 [안내 종료]
    }
    void setHost(Host h) { host = h; }
    private void dAct(String a) { if (host != null) host.act(a); }

    RideOverlay(Context c) { ctx = c.getApplicationContext() != null ? c.getApplicationContext() : c; dn = ctx.getResources().getDisplayMetrics().density; }

    static boolean allowed(Context c) { return Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(c); }
    static boolean supported() { return Build.VERSION.SDK_INT >= 26; }
    private int dp(float v) { return Math.round(v * dn); }

    /** 줄 글만 있는 막대(개발자 도구 · 엔진이 칸을 안 준 경우). */
    void update(boolean on, String line1, String line2, String banner, int alert) { show(on, OvCore.plain(on, line1, line2, banner, alert)); }

    /** on 이 아니거나 안내가 없으면 치운다. 아니면 만들거나 값만 바꾼다. */
    void show(final boolean on, final OvCore.Ov v) {
        ui.post(new Runnable() { @Override public void run() {
            try {
                if (!on || v == null || !v.active || !allowed(ctx)) { removeNow(); return; }
                cur = v;
                if (!shown) addNow();
                if (!shown) return;
                apply();
            } catch (Throwable ignored) { /* 창을 못 띄워도 안내는 알림으로 이어진다 */ }
        } });
    }
    void hide() { ui.post(new Runnable() { @Override public void run() { removeNow(); } }); }

    private boolean pillMode() { return userPill && cur.alert == 0; }

    private void apply() {
        OvCore.Ov v = cur;
        boolean pill = pillMode(), hasStrip = OvCore.hasStrip(v);
        int bgc = v.hasTheme ? v.bg : 0xF01C1C1E, fg = v.hasTheme ? v.fg : 0xFFFFFFFF, sub = v.hasTheme ? v.sub : 0xFFD1D1D6;
        bg.setColor(bgc);
        bg.setStroke(Math.max(1, dp(1)), 0x33808080);
        lp.width = pill ? WindowManager.LayoutParams.WRAP_CONTENT : WindowManager.LayoutParams.MATCH_PARENT;
        pillT.setVisibility(pill ? View.VISIBLE : View.GONE);
        pillT.setText("●  " + OvCore.pillText(v)); pillT.setTextColor(fg);
        col.setVisibility(pill ? View.GONE : View.VISIBLE);
        strip.setVisibility(hasStrip ? View.VISIBLE : View.GONE);
        t1.setVisibility(hasStrip ? View.GONE : View.VISIBLE);
        t1.setText(v.line1); t1.setTextColor(fg);
        t2.setText(v.line2); t2.setTextColor(sub);
        t2.setVisibility(v.line2.length() == 0 ? View.GONE : View.VISIBLE);
        boolean ban = v.banner.length() > 0 && (v.alert > 0 || OvCore.arrived(v));
        t3.setText(ban ? v.banner : ""); t3.setVisibility(ban ? View.VISIBLE : View.GONE);
        t3.setTextColor(v.alert == 1 ? 0xFFFF453A : (v.alert == 2 ? 0xFFFF9F0A : fg));
        boolean ar = OvCore.arrived(v);
        String rst = v.rsSt;
        boolean showRs = !pill && (ar || "board".equals(rst) || "undo".equals(rst) || "wait".equals(rst));
        boolean hasBtn = showRs && v.rsBt.length() > 0 && ("board".equals(rst) || "undo".equals(rst));
        rsRow.setVisibility(showRs ? View.VISIBLE : View.GONE);
        rsT.setText("wait".equals(rst) && !ar ? "승차 대기 · " + v.rsK : v.rsK); rsT.setTextColor(fg);
        btn.setVisibility(hasBtn ? View.VISIBLE : View.GONE); btn.setText(v.rsBt);
        boolean showRow = !pill && v.row.kind > 0;
        rowView.setVisibility(showRow ? View.VISIBLE : View.GONE);
        if (showRow) rowView.set(v.row, fg, sub);
        if (!userScrolling) scrollPos = OvCore.centerPos(v.cur, v.base, v.cells.length);
        strip.invalidate();
        border.setMode(pill ? 0 : v.alert);
        startAnims();
        try { wm.updateViewLayout(box, lp); } catch (Throwable ignored) { }
    }

    private void startAnims() {
        if (pulseAnim == null) {
            pulseAnim = ValueAnimator.ofFloat(0f, 1f); pulseAnim.setDuration(1100L); pulseAnim.setRepeatMode(ValueAnimator.REVERSE); pulseAnim.setRepeatCount(ValueAnimator.INFINITE);
            pulseAnim.addUpdateListener(new ValueAnimator.AnimatorUpdateListener() { @Override public void onAnimationUpdate(ValueAnimator a) { strip.pulse = (Float) a.getAnimatedValue(); if (strip.getVisibility() == View.VISIBLE) strip.invalidate(); if (rowView != null && rowView.getVisibility() == View.VISIBLE) rowView.invalidate(); } });
            pulseAnim.start();
        }
        // 접힌 알약: 목적지 3정거장 전(pre)부터 깜박인다
        if (pillAnim == null) {
            pillAnim = ValueAnimator.ofFloat(1f, 0.35f); pillAnim.setDuration(600L); pillAnim.setRepeatMode(ValueAnimator.REVERSE); pillAnim.setRepeatCount(ValueAnimator.INFINITE);
            pillAnim.addUpdateListener(new ValueAnimator.AnimatorUpdateListener() { @Override public void onAnimationUpdate(ValueAnimator a) { pillT.setAlpha(cur.pre ? (Float) a.getAnimatedValue() : 1f); } });
            pillAnim.start();
        }
        if (cur.moving && !blinking) { blinking = true; ui.postDelayed(blinker, BLINK_MS); }
    }
    private final Runnable blinker = new Runnable() {
        @Override public void run() {
            if (!shown || !cur.moving) { blinking = false; blinkOn = true; if (strip != null) strip.invalidate(); return; }
            blinkOn = !blinkOn;
            if (strip != null) strip.invalidate();
            ui.postDelayed(this, BLINK_MS);
        }
    };
    private final Runnable recenter = new Runnable() { @Override public void run() { userScrolling = false; if (shown) { scrollPos = OvCore.centerPos(cur.cur, cur.base, cur.cells.length); strip.invalidate(); } } };

    private void removeNow() {
        ui.removeCallbacks(blinker); ui.removeCallbacks(recenter);
        if (pulseAnim != null) { pulseAnim.cancel(); pulseAnim = null; }
        if (pillAnim != null) { pillAnim.cancel(); pillAnim = null; }
        if (border != null) border.setMode(0);
        blinking = false; blinkOn = true; userScrolling = false;
        if (!shown) return;
        try { wm.removeViewImmediate(box); } catch (Throwable ignored) { }
        shown = false;
    }

    private void openApp() {
        try { ctx.startActivity(new Intent(ctx, ShellActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)); } catch (Throwable ignored) { }
    }

    private void addNow() {
        wm = (WindowManager) ctx.getSystemService(Context.WINDOW_SERVICE);
        box = new FrameLayout(ctx);
        box.setPadding(dp(8), dp(5), dp(8), dp(3));
        bg = new GradientDrawable(); bg.setColor(0xF01C1C1E); bg.setCornerRadius(dp(14));
        FrameLayout card = new FrameLayout(ctx);
        card.setBackground(bg);
        box.addView(card, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT));
        col = new LinearLayout(ctx); col.setOrientation(LinearLayout.VERTICAL); col.setPadding(dp(6), dp(5), dp(6), dp(5));
        card.addView(col, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT));
        strip = new StripView(ctx);
        col.addView(strip, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(54)));
        t1 = text(14f, true); t1.setGravity(Gravity.CENTER);
        col.addView(t1, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        t2 = text(12f, true); t2.setGravity(Gravity.CENTER);
        col.addView(t2, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        t3 = text(13f, true); t3.setGravity(Gravity.CENTER); t3.setPadding(0, dp(3), 0, 0);
        col.addView(t3, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        rsRow = new LinearLayout(ctx); rsRow.setOrientation(LinearLayout.HORIZONTAL); rsRow.setGravity(Gravity.CENTER_VERTICAL); rsRow.setPadding(dp(8), dp(4), dp(8), dp(2));
        rsT = text(12.5f, true);
        rsRow.addView(rsT, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        btn = text(13f, true); btn.setGravity(Gravity.CENTER); btn.setTextColor(0xFFFFFFFF);
        GradientDrawable bd = new GradientDrawable(); bd.setColor(0xFF0A84FF); bd.setCornerRadius(dp(10)); btn.setBackground(bd);
        LinearLayout.LayoutParams bl = new LinearLayout.LayoutParams(dp(92), dp(34)); bl.leftMargin = dp(8);
        rsRow.addView(btn, bl);
        col.addView(rsRow, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        rowView = new RowView(ctx);
        col.addView(rowView, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(64)));
        pillT = text(13f, true); pillT.setPadding(dp(14), dp(7), dp(14), dp(7));
        card.addView(pillT, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT));
        border = new Border(ctx);
        card.addView(border, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        int type = Build.VERSION.SDK_INT >= 26 ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY : WindowManager.LayoutParams.TYPE_PHONE;
        lp = new WindowManager.LayoutParams(WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.WRAP_CONTENT, type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS, PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
        lp.y = lastY >= 0 ? lastY : dp(36);
        box.setOnTouchListener(touch());
        try { wm.addView(box, lp); shown = true; } catch (Throwable t) { shown = false; }
    }

    /** 누르기 = 앱 열기(도착 줄의 버튼은 안내 종료 · 알약은 펼치기) · 칸 줄 좌우 쓸기 = 넘겨 보기(10초 뒤 현위치로) · 세로 쓸기 = 알약 접기/펼치기 · 꾹 눌러 위아래로 옮기기. */
    private View.OnTouchListener touch() {
        final int slop = ViewConfiguration.get(ctx).getScaledTouchSlop();
        return new View.OnTouchListener() {
            float x0, y0, lastX, lastY0, startPos; int startY; boolean armed, dragged, scrolling, swiping, inStrip, onBtn, onRs; int rowHit;
            final Runnable arm = new Runnable() { @Override public void run() {
                if (dragged || scrolling || swiping) return;
                armed = true; y0 = lastY0; startY = lp.y;
                try { box.performHapticFeedback(android.view.HapticFeedbackConstants.LONG_PRESS); } catch (Throwable ignored) { }
            } };
            @Override public boolean onTouch(View v, MotionEvent e) {
                switch (e.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN: {
                        x0 = e.getRawX(); y0 = e.getRawY(); lastX = x0; lastY0 = y0; startY = lp.y; startPos = scrollPos;
                        armed = dragged = scrolling = swiping = false;
                        float rx = e.getRawX(), ry = e.getRawY();
                        inStrip = !pillMode() && hit(strip, rx, ry);
                        onBtn = !pillMode() && hit(btn, rx, ry);
                        onRs = !pillMode() && hit(rsRow, rx, ry);
                        rowHit = (!pillMode() && rowView.getVisibility() == View.VISIBLE) ? rowView.hitBtn(rx, ry) : -1;
                        ui.removeCallbacks(arm); ui.postDelayed(arm, 450L);
                        return true;
                    }
                    case MotionEvent.ACTION_MOVE: {
                        lastX = e.getRawX(); lastY0 = e.getRawY();
                        float mx = lastX - x0, my = lastY0 - y0;
                        if (!dragged && !scrolling && !swiping && (Math.abs(mx) > slop || Math.abs(my) > slop)) {
                            if (armed) dragged = true;
                            else {
                                ui.removeCallbacks(arm);
                                if (inStrip && cur.cells.length > OvCore.COLS && Math.abs(mx) > Math.abs(my)) { scrolling = true; userScrolling = true; ui.removeCallbacks(recenter); }
                                else swiping = true;
                            }
                        }
                        if (scrolling && strip.getWidth() > 0) { scrollPos = OvCore.clampPos(startPos - mx / (strip.getWidth() / (float) OvCore.COLS), cur.base, cur.cells.length); strip.invalidate(); }
                        else if (dragged) { lp.y = Math.max(0, startY + Math.round(my)); lastY = lp.y; try { wm.updateViewLayout(box, lp); } catch (Throwable ignored) { } }
                        return true;
                    }
                    case MotionEvent.ACTION_UP:
                    case MotionEvent.ACTION_CANCEL: {
                        ui.removeCallbacks(arm);
                        boolean up = e.getActionMasked() == MotionEvent.ACTION_UP;
                        if (scrolling) ui.postDelayed(recenter, 10000L);
                        else if (swiping) {
                            float my = lastY0 - y0;
                            if (up && my > dp(22)) {
                                if (userPill) { userPill = false; apply(); }
                                else if (!"board".equals(cur.rsSt) && !"undo".equals(cur.rsSt)) dAct("open");            // 아래로 쓸면 탑승 줄이 열린다
                            } else if (up && my < -dp(22)) {
                                if ("board".equals(cur.rsSt) && !OvCore.arrived(cur)) dAct("close");                  // 위로 쓸면 열린 탑승 줄부터 닫고
                                else if (!userPill && cur.alert == 0) { userPill = true; apply(); }                    // 그다음엔 알약으로 접는다
                            }
                        } else if (!dragged && !armed && up) {
                            if (pillMode()) { userPill = false; apply(); }
                            else if (rowHit > 0 && cur.row.kind == 1) { if (rowHit == 1) { if (host != null) host.recoGo(cur.row); else openApp(); } else if (host != null) host.recoOk(cur.row.at); }
                            else if (rowHit > 0 && cur.row.kind == 2) { if (host != null) host.quitApp(); else RideService.stop(ctx); }
                            else if (onBtn) {
                                if (OvCore.arrived(cur)) { if (host != null) host.endRide(); else RideService.stop(ctx); }   // 도착 줄의 [안내 종료]
                                else dAct("undo".equals(cur.rsSt) ? "undo" : "press");                                           // [탑승] / [되돌리기]
                            }
                            else if (onRs && "wait".equals(cur.rsSt)) dAct("pill");
                            else openApp();
                        }
                        armed = false;
                        return true;
                    }
                    default: return false;
                }
            }
        };
    }

    private TextView text(float sp, boolean bold) {
        TextView t = new TextView(ctx);
        t.setTextSize(sp); t.setTextColor(0xFFFFFFFF); t.setSingleLine(true); t.setEllipsize(TextUtils.TruncateAt.END);
        t.setTypeface(Typeface.DEFAULT, bold ? Typeface.BOLD : Typeface.NORMAL);
        return t;
    }

    /** 칸 줄: 정류장명 · 점과 선 · 시각(노선 라벨은 시각 왼쪽). 다섯 칸이 보이고 현위치 칸만 진한 글. 이동 중이면 현재역→다음역 선이 깜박인다. */
    private final class StripView extends View {
        float pulse;
        private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final TextPaint tp = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        private final RectF rf = new RectF();
        StripView(Context c) { super(c); tp.setTextAlign(Paint.Align.CENTER); }
        private void txt(Canvas cv, String s, float cx, float y, float maxW, float sp, int color, boolean bold) {
            if (s == null || s.length() == 0) return;
            tp.setTextAlign(Paint.Align.CENTER); tp.setTextSize(sp * getResources().getDisplayMetrics().scaledDensity); tp.setColor(color);
            tp.setTypeface(bold ? Typeface.DEFAULT_BOLD : Typeface.DEFAULT);
            CharSequence e = TextUtils.ellipsize(s, tp, Math.max(1f, maxW), TextUtils.TruncateAt.END);
            cv.drawText(e, 0, e.length(), cx, y, tp);
        }
        @Override protected void onDraw(Canvas cv) {
            OvCore.Cell[] cs = cur.cells; int n = cs.length;
            if (n == 0) return;
            float cw = getWidth() / (float) OvCore.COLS, yName = dp(14), yAx = dp(28), yTime = dp(49), lw = dp(3);
            int fg = cur.hasTheme ? cur.fg : 0xFFFFFFFF, sub = cur.hasTheme ? cur.sub : 0xFF8E8E93, bgc = cur.hasTheme ? cur.bg : 0xFF1C1C1E;
            for (int i = 0; i < n; i++) {
                OvCore.Cell c = cs[i];
                float cx = (cur.base + i - scrollPos + 0.5f) * cw;
                if (cx + cw / 2f < 0f || cx - cw / 2f > getWidth()) continue;
                boolean here = i == cur.cur, nextHi = cur.moving && i == cur.cur + 1 && c.n.length() > 0;
                int ink = (here || nextHi) ? fg : sub;
                txt(cv, c.n, cx, yName, cw - dp(3), (here || nextHi) ? 11.5f : 10.5f, ink, true);
                p.setStyle(Paint.Style.FILL);
                boolean dim = cur.moving && !blinkOn;
                if (c.hasL) { p.setColor((c.lc & 0x00FFFFFF) | ((dim && i == cur.cur + 1 ? 70 : 255) << 24)); cv.drawRect(cx - cw / 2f, yAx - lw / 2f, cx, yAx + lw / 2f, p); }
                if (c.hasR) { p.setColor((c.rc & 0x00FFFFFF) | ((dim && i == cur.cur ? 70 : 255) << 24)); cv.drawRect(cx, yAx - lw / 2f, cx + cw / 2f, yAx + lw / 2f, p); }
                if (here) {
                    int hc = cur.moving ? 0x000A84FF : 0x00F0A500;
                    p.setColor((Math.round(0x70 * (1f - 0.6f * pulse)) << 24) | hc);
                    cv.drawCircle(cx, yAx, dp(9) + dp(4) * pulse, p);
                    p.setColor((Math.round(255 * (1f - 0.55f * pulse)) << 24) | hc);
                    cv.drawCircle(cx, yAx, dp(7), p);
                } else if (c.dk == 2) { p.setColor(c.dc); cv.drawCircle(cx, yAx, dp(7), p); }
                else if (c.dk == 1) { p.setColor(c.dc); cv.drawCircle(cx, yAx, dp(6), p); p.setColor(bgc); cv.drawCircle(cx, yAx, dp(3), p); }
                else if (c.dk == 3) { p.setColor(c.dc); cv.drawCircle(cx, yAx, dp(3), p); }
                if (c.g.length() > 0) {
                    float sc = getResources().getDisplayMetrics().scaledDensity, maxRow = cw - dp(3);
                    tp.setTypeface(Typeface.DEFAULT_BOLD); tp.setTextSize(9.5f * sc);
                    float tmW = c.t.length() > 0 ? tp.measureText(c.t) : 0f, gap = c.t.length() > 0 ? dp(3) : 0f, pad = c.pill ? dp(8) : 0f;
                    tp.setTextSize((c.pill ? 7f : 8f) * sc);
                    CharSequence e = TextUtils.ellipsize(c.g, tp, Math.max(dp(10), maxRow - tmW - gap - pad), TextUtils.TruncateAt.END);
                    float gW = tp.measureText(e, 0, e.length()) + pad, x0 = cx - (gW + gap + tmW) / 2f;
                    if (c.pill) {
                        rf.set(x0, yTime - dp(8.5f), x0 + gW, yTime + dp(2.5f)); p.setColor(c.gc); cv.drawRoundRect(rf, dp(4), dp(4), p);
                        tp.setColor(Color.WHITE); tp.setTextAlign(Paint.Align.CENTER); cv.drawText(e, 0, e.length(), x0 + gW / 2f, yTime, tp);
                    } else { tp.setColor(c.gc); tp.setTextAlign(Paint.Align.LEFT); cv.drawText(e, 0, e.length(), x0, yTime, tp); }
                    if (c.t.length() > 0) { tp.setTextSize(9.5f * sc); tp.setTypeface(Typeface.DEFAULT_BOLD); tp.setColor(ink); tp.setTextAlign(Paint.Align.LEFT); cv.drawText(c.t, x0 + gW + gap, yTime, tp); }
                    tp.setTextAlign(Paint.Align.CENTER);
                } else txt(cv, c.t, cx, yTime, cw - dp(3), 9.5f, ink, true);
            }
        }
    }

    /** 하차 임박 테두리: 무지개 그라데이션이 카드 둘레를 돈다(2정거장 전 천천히 · 1정거장 전 빠르게). mode 0 이면 그리지도 돌리지도 않는다. */
    private final class Border extends View {
        private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final RectF rf = new RectF();
        private ValueAnimator anim;
        private int mode;
        private float angle;
        Border(Context c) { super(c); p.setStyle(Paint.Style.STROKE); setClickable(false); }
        void setMode(int m) {
            if (m == mode) return;
            mode = m;
            if (anim != null) { anim.cancel(); anim = null; }
            if (m == 0) { setVisibility(View.GONE); return; }
            setVisibility(View.VISIBLE);
            anim = ValueAnimator.ofFloat(0f, 360f); anim.setInterpolator(new LinearInterpolator()); anim.setRepeatCount(ValueAnimator.INFINITE); anim.setDuration(OvCore.spinMs(m));
            anim.addUpdateListener(new ValueAnimator.AnimatorUpdateListener() { @Override public void onAnimationUpdate(ValueAnimator a) { angle = (Float) a.getAnimatedValue(); invalidate(); } });
            anim.start();
        }
        @Override protected void onDetachedFromWindow() { super.onDetachedFromWindow(); if (anim != null) { anim.cancel(); anim = null; mode = 0; } }
        @Override protected void onDraw(Canvas cv) {
            if (mode == 0 || getWidth() == 0) return;
            float w = mode == 1 ? dp(3) : dp(2);
            p.setStrokeWidth(w);
            p.setShader(new SweepGradient(getWidth() / 2f, getHeight() / 2f, new int[] { 0xFFFF453A, 0xFFFF9F0A, 0xFFFFD60A, 0xFF30D158, 0xFF64D2FF, 0xFF0A84FF, 0xFFBF5AF2, 0xFFFF453A }, null));
            rf.set(w / 2f, w / 2f, getWidth() - w / 2f, getHeight() - w / 2f);
            cv.save(); cv.rotate(angle, getWidth() / 2f, getHeight() / 2f);
            cv.drawRoundRect(rf, dp(14), dp(14), p);
            cv.restore();
        }
    }

    private static boolean hit(View v, float rx, float ry) {
        if (v == null || v.getVisibility() != View.VISIBLE) return false;
        int[] l = new int[2]; v.getLocationOnScreen(l);
        return rx >= l[0] && rx <= l[0] + v.getWidth() && ry >= l[1] && ry <= l[1] + v.getHeight();
    }

    private static final java.util.HashMap<String, android.graphics.Bitmap> SHEETS = new java.util.HashMap<String, android.graphics.Bitmap>();
    /** 캐릭터 시트(assets/chars3d/<id>.webp, 4x4 프레임). 읽기에 실패하면 null → 그림 없이 글만 그린다. */
    private android.graphics.Bitmap sheet(String id) {
        android.graphics.Bitmap b = SHEETS.get(id);
        if (b != null) return b;
        try {
            android.graphics.BitmapFactory.Options o = new android.graphics.BitmapFactory.Options();
            o.inSampleSize = 2; o.inPreferredConfig = android.graphics.Bitmap.Config.ARGB_8888;
            java.io.InputStream in = ctx.getAssets().open("chars3d/" + id + ".webp");
            try { b = android.graphics.BitmapFactory.decodeStream(in, null, o); } finally { in.close(); }
            if (b != null) SHEETS.put(id, b);
        } catch (Throwable ignored) { b = null; }
        return b;
    }

    /** 하단 줄: 캐릭터 + 글(이름 · 설명 · 거리/분류) + 버튼([보기][확인] 또는 [앱 종료]). 글과 버튼 이름은 엔진 값. */
    private final class RowView extends View {
        private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final TextPaint tp = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        private final RectF b1 = new RectF(), b2 = new RectF(), cr = new RectF();
        private OvCore.Row row = new OvCore.Row();
        private int fg = 0xFFFFFFFF, sub = 0xFF8E8E93;
        RowView(Context c) { super(c); setVisibility(View.GONE); }
        void set(OvCore.Row r, int fgc, int subc) { row = r; fg = fgc; sub = subc; invalidate(); }
        @Override protected void onMeasure(int w, int h) { setMeasuredDimension(MeasureSpec.getSize(w), dp(64)); }
        private void layoutBtns() {
            float w = getWidth(), top = dp(17), bot = dp(47);
            if (row.kind == 1) { b2.set(w - dp(8) - dp(46), top, w - dp(8), bot); b1.set(b2.left - dp(6) - dp(78), top, b2.left - dp(6), bot); }
            else { b1.set(w - dp(8) - dp(84), top, w - dp(8), bot); b2.setEmpty(); }
        }
        /** 화면 좌표(rx, ry)가 어느 버튼인가: 1 첫 버튼 · 2 둘째 버튼 · 0 글 부분 · -1 줄 밖. */
        int hitBtn(float rx, float ry) {
            int[] l = new int[2]; getLocationOnScreen(l);
            float x = rx - l[0], y = ry - l[1];
            if (x < 0 || y < 0 || x > getWidth() || y > getHeight()) return -1;
            layoutBtns();
            if (b1.contains(x, y)) return 1;
            if (!b2.isEmpty() && b2.contains(x, y)) return 2;
            return 0;
        }
        private void draw(Canvas cv, String s, float x, float y, float px, boolean bold, int color, float maxW) {
            tp.setTextAlign(Paint.Align.LEFT); tp.setTextSize(px * getResources().getDisplayMetrics().scaledDensity); tp.setColor(color);
            tp.setTypeface(bold ? Typeface.DEFAULT_BOLD : Typeface.DEFAULT);
            CharSequence e = TextUtils.ellipsize(s, tp, Math.max(1f, maxW), TextUtils.TruncateAt.END);
            cv.drawText(e, 0, e.length(), x, y, tp);
        }
        private void btn(Canvas cv, RectF r, String label, boolean solid) {
            p.setStyle(Paint.Style.FILL); p.setColor(0xFF0A84FF);
            if (solid) cv.drawRoundRect(r, dp(9), dp(9), p);
            else { p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(Math.max(1, dp(1))); p.setColor(sub); cv.drawRoundRect(r, dp(9), dp(9), p); }
            tp.setTextAlign(Paint.Align.CENTER); tp.setTypeface(Typeface.DEFAULT_BOLD); tp.setTextSize(11.5f * getResources().getDisplayMetrics().scaledDensity); tp.setColor(solid ? 0xFFFFFFFF : fg);
            CharSequence e = TextUtils.ellipsize(label, tp, r.width() - dp(6), TextUtils.TruncateAt.END);
            cv.drawText(e, 0, e.length(), r.centerX(), r.centerY() + tp.getTextSize() * 0.35f, tp);
        }
        @Override protected void onDraw(Canvas cv) {
            if (row.kind == 0) return;
            layoutBtns();
            float x0 = dp(8);
            android.graphics.Bitmap sh = row.ch.length() > 0 ? sheet(row.ch) : null;
            if (sh != null) {
                int f = (int) ((System.currentTimeMillis() / 110L) % 16L), cell = sh.getWidth() / 4;
                android.graphics.Rect src = new android.graphics.Rect((f % 4) * cell, (f / 4) * cell, (f % 4) * cell + cell, (f / 4) * cell + cell);
                cr.set(x0, dp(6), x0 + dp(52), dp(58));
                p.setFilterBitmap(true); p.setAlpha(255); p.setStyle(Paint.Style.FILL);
                cv.drawBitmap(sh, src, cr, p);
                x0 += dp(58);
            }
            float right = b1.left - dp(6), w = Math.max(dp(40), right - x0);
            draw(cv, row.a, x0, dp(24), 13f, true, fg, w);
            draw(cv, row.b, x0, dp(41), 11f, false, sub, w);
            if (row.kind == 1 && row.m.length() > 0) draw(cv, row.m, x0, dp(56), 10f, false, sub, w);
            if (row.kind == 1) { btn(cv, b1, row.go, true); btn(cv, b2, row.ok, false); }
            else btn(cv, b1, row.end, true);
        }
    }
}

package com.dullyyj.subway;   // ★ 앱 패키지와 같아야 한다

import android.animation.ValueAnimator;
import android.content.Context;
import android.content.Intent;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.RectF;
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
import android.view.animation.DecelerateInterpolator;
import android.view.animation.LinearInterpolator;
import android.view.animation.OvershootInterpolator;
import android.view.VelocityTracker;
import android.view.ViewTreeObserver;
import android.content.SharedPreferences;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * 다른 앱 위에 뜨는 안내 카드. 칸 줄(정류장 이름 · 시각 · 노선 라벨 · 점과 선) · 남은시간 · 하차 임박 큰 안내 · 도착 뒤 [안내 종료] · 접힌 알약.
 *
 * ★ 원칙(YJ): "모든 계산은 엔진이 한다. 앱은 그림만 그린다." 글 · 색 · 점 모양 · 현위치 칸 · 경고 단계(alert 0·1·2)는 엔진(/ride-standby 의 overlay)이 정한 값 그대로이고
 *   OvCore 가 읽어 준다. 여기는 창을 만들고 그리고 손짓(누르기 · 쓸기 · 꾹 눌러 옮기기)을 받을 뿐이다.
 * 경고 단계에서는 카드 테두리에 무지개가 돈다(2정거장 전 천천히 · 1정거장 전 빠르게). 진동도 웹과 같다 — 엔진이 alertVibe(설정이 허용했나)와 alertAt(단계가 켜진/바뀐 시각)을 주고, 여기서는 새 alertAt 일 때 한 번 울리기만 한다.
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
    private boolean shown, userPill, blinkOn = true, blinking, userScrolling, curPill, movedForAlert, popReady;
    private int restoreX, restoreY, pillX;
    private long dismissedRecoAt = -1L, dismissedAlertAt = -1L, lastVibeAt = 0L;
    private String dismissedRsKey = "";
    private ValueAnimator flingAnim, recenterAnim;
    private static final String PREF = "overlay_pos";       // 웹 때와 같은 이름 — 저장된 위치 · 접힘(pill) · 알약 가로 위치(px)를 이어 쓴다
    private OvCore.Ov cur = new OvCore.Ov();
    private float scrollPos;
    private ValueAnimator pulseAnim, pillAnim;
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
                // 엔진이 정한 진동: 단계가 켜졌고(alert) 설정이 허용했고(alertVibe) 새 경고(alertAt)일 때 한 번만(20초 지난 묵은 경고는 울리지 않는다)
                if (v.alert > 0 && v.alertVibe && v.alertAt > 0L && v.alertAt != lastVibeAt && System.currentTimeMillis() - v.alertAt < 20000L) { lastVibeAt = v.alertAt; vibrateAlert(v.alert); }
                apply();
            } catch (Throwable ignored) { /* 창을 못 띄워도 안내는 알림으로 이어진다 */ }
        } });
    }
    void hide() { ui.post(new Runnable() { @Override public void run() { removeNow(); } }); }

    /** 접힌 알약으로 보일지. 접어 둬도 1정거장 전(alert 1, 이미 접어 끈 경고는 제외)이거나 새 추천(row)이 오면 저절로 펼친다 — 2정거장 전(alert 2)은 펼치지 않고 알약 둘레 무지개만 돈다(웹 OverlayPlugin.applyMode 와 같다). */
    private boolean pillMode() { return userPill && !wantOpen(); }
    private boolean wantOpen() { return (cur.alert == 1 && cur.alertAt != dismissedAlertAt) || (cur.row.kind > 0 && cur.row.at != dismissedRecoAt) || boardOpen(); }
    /** s229 (YJ: 알약으로 접어 뒀어도 탑승·환승 때가 되면 알약이 펼쳐지고 [탑승]·[환승완료] 버튼이 보여야 한다): 엔진이 board(탑승·환승 시각)로 알리면 저절로 펼친다 — 사용자가 그 차례를 접었으면 그 차례만 다시 펼치지 않는다. */
    private boolean boardOpen() { return "board".equals(cur.rsSt) && !cur.rsEnd && cur.rsBt.length() > 0 && !rsKey().equals(dismissedRsKey); }
    private String rsKey() { return cur.rsMode + "|" + cur.rsNm + "|" + cur.rsChip; }

    private void apply() {
        OvCore.Ov v = cur;
        boolean pill = pillMode(), hasStrip = OvCore.hasStrip(v);
        int bgc = v.hasTheme ? v.bg : 0xF01C1C1E, fg = v.hasTheme ? v.fg : 0xFFFFFFFF, sub = v.hasTheme ? v.sub : 0xFFD1D1D6;
        bg.setColor(bgc);
        bg.setCornerRadius(dp(pill ? 15 : 14));
        border.pill = pill;
        bg.setStroke(Math.max(1, dp(1)), 0x33808080);
        // 알약 ↔ 펼침 전환(웹 applyMode): 경고·추천으로 저절로 펼칠 땐 알약 자리를 기억하고 맨 위로 옮기며, 끝나 다시 접을 땐 기억해 둔 자리로 돌려놓는다
        boolean changed = pill != curPill;
        if (changed) {
            if (pill) { if (movedForAlert) { lp.x = restoreX; lp.y = restoreY; movedForAlert = false; } else lp.x = pillX; }
            else if (userPill) { restoreX = lp.x; restoreY = lp.y; movedForAlert = true; lp.x = 0; lp.y = 0; }
            else { pillX = lp.x; lp.x = 0; movedForAlert = false; }
            curPill = pill;
        }
        lp.width = pill ? WindowManager.LayoutParams.WRAP_CONTENT : WindowManager.LayoutParams.MATCH_PARENT;
        pillT.setVisibility(pill ? View.VISIBLE : View.GONE);
        boolean wt = "wait".equals(v.rsSt) || "board".equals(v.rsSt);
        SpannableString ps = new SpannableString("●  " + OvCore.pillText(v));
        ps.setSpan(new ForegroundColorSpan(OvCore.stateRgb(v)), 0, 1, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);   // s295: 달리는 중 파랑 · 역에 서 있는 동안 노랑 · 승차 대기 주황
        pillT.setText(ps); pillT.setTextColor(fg);
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
        border.setMode(v.alert);          // s258 (YJ: 펴진 오버레이를 사용자가 다시 알약으로 접어도 알약 테두리가 똑같이 하이라이트) — 접혔든 펴졌든 2정거장 전(느리게 6초)·1정거장 전(빠르게 1.1초)은 같은 무지개
        startAnims();
        try { wm.updateViewLayout(box, lp); } catch (Throwable ignored) { }
        if (changed && popReady) popIn();
        popReady = true;
    }

    /** 모드가 바뀐 직후 스프링처럼(살짝 넘쳤다가 안착) 커지며 나타난다. 위쪽 가운데를 기준으로(웹 popIn). */
    private void popIn() {
        final View r = box;
        if (r == null) return;
        r.getViewTreeObserver().addOnGlobalLayoutListener(new ViewTreeObserver.OnGlobalLayoutListener() {
            @Override public void onGlobalLayout() {
                try { r.getViewTreeObserver().removeOnGlobalLayoutListener(this); } catch (Throwable ignored) { }
                try {
                    r.animate().cancel();
                    r.setPivotX(r.getWidth() / 2f); r.setPivotY(0f);
                    r.setScaleX(0.55f); r.setScaleY(0.55f);
                    r.animate().scaleX(1f).scaleY(1f).setDuration(520L).setInterpolator(new OvershootInterpolator(2.4f)).start();
                } catch (Throwable ignored) { }
            }
        });
    }

    private void startAnims() {
        if (pulseAnim == null) {
            pulseAnim = ValueAnimator.ofFloat(0f, 1f); pulseAnim.setDuration(650L); pulseAnim.setRepeatMode(ValueAnimator.REVERSE); pulseAnim.setRepeatCount(ValueAnimator.INFINITE);
            pulseAnim.addUpdateListener(new ValueAnimator.AnimatorUpdateListener() { @Override public void onAnimationUpdate(ValueAnimator a) { strip.pulse = (Float) a.getAnimatedValue(); if (strip.getVisibility() == View.VISIBLE) strip.invalidate(); if (rowView != null && rowView.getVisibility() == View.VISIBLE) rowView.invalidate(); } });
            pulseAnim.start();
        }
        // 접힌 알약: 목적지 3정거장 전(pre)부터 깜박인다(웹: 카드 전체가 1 → 0.28 로 650ms 마다)
        if (pillAnim == null) {
            pillAnim = ValueAnimator.ofFloat(1f, 0.28f); pillAnim.setDuration(650L); pillAnim.setRepeatMode(ValueAnimator.REVERSE); pillAnim.setRepeatCount(ValueAnimator.INFINITE);
            pillAnim.addUpdateListener(new ValueAnimator.AnimatorUpdateListener() { @Override public void onAnimationUpdate(ValueAnimator a) { if (box != null) box.setAlpha(curPill && cur.pre ? (Float) a.getAnimatedValue() : 1f); } });
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
    /** 손을 뗀 지 10초 뒤 현위치로 부드럽게 돌아온다(웹 recenter: 380ms 감속). */
    private final Runnable recenter = new Runnable() { @Override public void run() {
        stopFling(); userScrolling = false;
        if (!shown) return;
        final float from = scrollPos, to = OvCore.centerPos(cur.cur, cur.base, cur.cells.length);
        recenterAnim = ValueAnimator.ofFloat(0f, 1f); recenterAnim.setDuration(380L); recenterAnim.setInterpolator(new DecelerateInterpolator(1.6f));
        recenterAnim.addUpdateListener(new ValueAnimator.AnimatorUpdateListener() { @Override public void onAnimationUpdate(ValueAnimator an) {
            if (userScrolling) { an.cancel(); return; }
            scrollPos = from + (to - from) * (Float) an.getAnimatedValue(); if (strip != null) strip.invalidate();
        } });
        recenterAnim.start();
    } };

    /** 손가락을 뗀 뒤 관성으로 미끄러지는 칸 줄(속도 = 초당 칸 수). 천천히 감속하며 끝에서 멈춘다(웹 startFling). */
    private void startFling(float cellsPerSec) {
        stopFling();
        if (strip == null || !shown) return;
        float dist = cellsPerSec * 0.38f;
        if (Math.abs(dist) < 0.25f) return;
        final float from = scrollPos, to = OvCore.clampPos(from + dist, cur.base, cur.cells.length);
        if (Math.abs(to - from) < 0.05f) return;
        long dur = (long) Math.max(320, Math.min(1200, 320 + Math.abs(to - from) * 150));
        flingAnim = ValueAnimator.ofFloat(0f, 1f); flingAnim.setDuration(dur); flingAnim.setInterpolator(new DecelerateInterpolator(2.2f));
        flingAnim.addUpdateListener(new ValueAnimator.AnimatorUpdateListener() { @Override public void onAnimationUpdate(ValueAnimator an) {
            scrollPos = from + (to - from) * (Float) an.getAnimatedValue(); if (strip != null) strip.invalidate();
        } });
        flingAnim.start();
    }
    private void stopFling() {
        try { if (flingAnim != null) flingAnim.cancel(); } catch (Throwable ignored) { }
        try { if (recenterAnim != null) recenterAnim.cancel(); } catch (Throwable ignored) { }
        flingAnim = null; recenterAnim = null;
    }

    /** 경고 진동(웹 vibrateAlert): 1정거장 전·환승 = 세 번, 2정거장 전 = 두 번. */
    private void vibrateAlert(int level) {
        try {
            android.os.Vibrator vb = (android.os.Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
            if (vb == null || !vb.hasVibrator()) return;
            long[] pat = (level == 1) ? new long[] { 0, 300, 100, 300, 100, 300 } : new long[] { 0, 400, 150, 400 };
            if (Build.VERSION.SDK_INT >= 26) vb.vibrate(android.os.VibrationEffect.createWaveform(pat, -1)); else vb.vibrate(pat, -1);
        } catch (Throwable ignored) { }
    }

    /** 저장된 위치(웹과 같은 overlay_pos): 세로 위치 y · 알약 가로 위치 px · 접어 둔 상태 pill. */
    private void savePos() {
        try {
            SharedPreferences.Editor ed = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit();
            if (curPill) { pillX = lp.x; ed.putInt("px", lp.x); }
            ed.putInt("y3", lp.y).apply();
        } catch (Throwable ignored) { }
    }

    /** 사용자가 알약으로 접거나(true) 펼친다(false). 접은 상태는 저장된다. 경고·추천으로 펼쳐진 중에 접으면 그 경고·추천으로는 다시 펼치지 않는다(웹 setUserPill). */
    private void setUserPill(boolean v) {
        userPill = v;
        if (v) { if (cur.alert > 0) dismissedAlertAt = cur.alertAt; if (cur.row.kind > 0) dismissedRecoAt = cur.row.at; if ("board".equals(cur.rsSt)) dismissedRsKey = rsKey(); }
        else { dismissedAlertAt = -1L; dismissedRecoAt = -1L; dismissedRsKey = ""; }
        try { ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit().putBoolean("pill", v).apply(); } catch (Throwable ignored) { }
        if (shown) apply();
    }

    private void removeNow() {
        ui.removeCallbacks(blinker); ui.removeCallbacks(recenter); stopFling();
        if (pulseAnim != null) { pulseAnim.cancel(); pulseAnim = null; }
        if (pillAnim != null) { pillAnim.cancel(); pillAnim = null; }
        if (box != null) box.setAlpha(1f);
        if (border != null) border.setMode(0);
        blinking = false; blinkOn = true; userScrolling = false;
        if (!shown) return;
        try { wm.removeViewImmediate(box); } catch (Throwable ignored) { }
        shown = false; curPill = false; movedForAlert = false; popReady = false;
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
        pillT = text(12f, true); pillT.setPadding(dp(14), dp(7), dp(14), dp(7)); pillT.setMaxWidth(Math.round(ctx.getResources().getDisplayMetrics().widthPixels * 0.72f));
        card.addView(pillT, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT));
        border = new Border(ctx);
        card.addView(border, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        int type = Build.VERSION.SDK_INT >= 26 ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY : WindowManager.LayoutParams.TYPE_PHONE;
        lp = new WindowManager.LayoutParams(WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.WRAP_CONTENT, type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS, PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
        try {   // 저장된 위치 · 접힘(웹과 같은 overlay_pos). 화면 밖이면 안쪽으로
            SharedPreferences sp = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE);
            android.util.DisplayMetrics dm = ctx.getResources().getDisplayMetrics();
            lp.y = Math.max(0, Math.min(sp.getInt("y3", 0), Math.max(0, dm.heightPixels - dp(120))));
            userPill = sp.getBoolean("pill", userPill);
            pillX = Math.max(-dm.widthPixels / 2, Math.min(dm.widthPixels / 2, sp.getInt("px", 0)));
        } catch (Throwable t) { lp.y = 0; }
        curPill = false; movedForAlert = false; popReady = false;
        box.setOnTouchListener(touch());
        try { wm.addView(box, lp); shown = true; } catch (Throwable t) { shown = false; }
    }

    /** 누르기 = 앱 열기(도착 줄의 버튼은 안내 종료 · 알약은 펼치기) · 칸 줄 좌우 쓸기 = 넘겨 보기(10초 뒤 현위치로) · 세로 쓸기 = 알약 접기/펼치기 · 꾹 눌러 위아래로 옮기기. */
    private View.OnTouchListener touch() {
        final int slop = ViewConfiguration.get(ctx).getScaledTouchSlop();
        return new View.OnTouchListener() {
            float x0, y0, lastX, lastY0, startPos; int startY, startX; VelocityTracker vt; boolean armed, dragged, scrolling, swiping, inStrip, onBtn, onRs; int rowHit;
            final Runnable arm = new Runnable() { @Override public void run() {
                if (dragged || scrolling || swiping) return;
                armed = true; x0 = lastX; y0 = lastY0; startY = lp.y; startX = lp.x;
                try { box.performHapticFeedback(android.view.HapticFeedbackConstants.LONG_PRESS); } catch (Throwable ignored) { }
            } };
            @Override public boolean onTouch(View v, MotionEvent e) {
                switch (e.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN: {
                        x0 = e.getRawX(); y0 = e.getRawY(); lastX = x0; lastY0 = y0; startY = lp.y; startX = lp.x; startPos = scrollPos; stopFling();
                        try { if (vt != null) vt.recycle(); vt = VelocityTracker.obtain(); vt.addMovement(e); } catch (Throwable t) { vt = null; }
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
                        try { if (vt != null) vt.addMovement(e); } catch (Throwable ignored) { }
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
                        else if (dragged) { lp.y = Math.max(0, startY + Math.round(my)); if (curPill) lp.x = startX + Math.round(mx); try { wm.updateViewLayout(box, lp); } catch (Throwable ignored) { } }   // 알약은 가로로도 옮긴다(웹과 같다) · 펼친 카드는 폭이 화면 가득이라 세로만
                        return true;
                    }
                    case MotionEvent.ACTION_UP:
                    case MotionEvent.ACTION_CANCEL: {
                        ui.removeCallbacks(arm);
                        boolean up = e.getActionMasked() == MotionEvent.ACTION_UP;
                        if (scrolling) {
                            try {   // 떼는 순간의 속도로 관성 스크롤(웹 startFling)
                                if (vt != null && up && strip.getWidth() > 0) { vt.addMovement(e); vt.computeCurrentVelocity(1000); startFling(-vt.getXVelocity() / (strip.getWidth() / (float) OvCore.COLS)); }
                            } catch (Throwable ignored) { }
                            ui.postDelayed(recenter, 10000L);
                        }
                        else if (swiping) {
                            float my = lastY0 - y0;
                            if (up) {
                                if (pillMode()) { if (my > dp(22)) setUserPill(false); }                                  // 알약에서 아래로 쓸어도 펼쳐진다
                                else if (my > dp(22)) { if (!"board".equals(cur.rsSt) && !"undo".equals(cur.rsSt)) dAct("open"); }   // 아래로 쓸면 탑승 줄이 열린다
                                else if (my < -dp(22)) {
                                    if ("board".equals(cur.rsSt) && !OvCore.arrived(cur)) dAct("close");                // 위로 쓸면 열린 탑승 줄부터 닫고
                                    else setUserPill(true);                                                              // 그다음엔 알약으로 접는다(웹과 같다 — 경고 중에 접으면 그 경고로는 다시 펼치지 않는다)
                                }
                            }
                        } else if (dragged) savePos();
                        else if (!dragged && !armed && up) {
                            if (pillMode()) setUserPill(false);
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
                        try { if (vt != null) { vt.recycle(); vt = null; } } catch (Throwable ignored) { }
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
                    int hc = OvCore.stateRgb(cur) & 0x00FFFFFF;
                    p.setColor((Math.round(0x70 * (1f - 0.6f * pulse)) << 24) | hc);
                    cv.drawCircle(cx, yAx, dp(9) + dp(4) * pulse, p);
                    p.setColor((Math.round(255 * (1f - 0.55f * pulse)) << 24) | hc);
                    cv.drawCircle(cx, yAx, dp(7), p);
                    if (!cur.moving && !OvCore.waiting(cur)) { p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(dp(1.2f)); p.setColor(0xCCB38600); cv.drawCircle(cx, yAx, dp(7), p); p.setStyle(Paint.Style.FILL); }      // s295: 노랑은 밝은 바탕에서 묻히지 않게 짙은 노랑 테두리
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

    /** 하차 임박 테두리: 카드 둘레에 옅은 무지개 띠가 깔려 있고, 밝은 빛 하나가 둘레를 따라 달린다(2정거장 전 천천히 · 1정거장 전 빠르게). 카드 모양·띠는 가만히 있고 빛만 움직인다. mode 0 이면 그리지도 돌리지도 않는다. */
    private final class Border extends View {
        private static final int N = 120;                                        // 둘레를 나눈 조각 수(색이 조각마다 다르다)
        private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final RectF rf = new RectF();
        private final android.graphics.Path[] seg = new android.graphics.Path[N];
        private final int[] col = new int[N];
        private ValueAnimator anim;
        private int mode, built = -1;
        boolean pill;
        private float head;                                                        // 빛의 머리 위치(0~1)
        private static final int RAINBOW_N = 8;
        private final int[] rainbow = new int[] { 0xFFFF3B30, 0xFFFF9500, 0xFFFFD60A, 0xFF34C759, 0xFF00C7BE, 0xFF0A84FF, 0xFFAF52DE, 0xFFFF2D92, 0xFFFF3B30 };
        Border(Context c) {
            super(c); p.setStyle(Paint.Style.STROKE); p.setStrokeCap(Paint.Cap.BUTT); setClickable(false); setVisibility(View.GONE);       // 처음엔 숨김 — 보이는 채로 카드(WRAP_CONTENT)에 MATCH_PARENT 로 들어가면 화면 높이만큼 카드가 늘어난다
            for (int i = 0; i < N; i++) { seg[i] = new android.graphics.Path(); col[i] = rainbowAt((i + 0.5f) / N); }
        }
        private int rainbowAt(float f) {
            float x = f * RAINBOW_N; int i = Math.min(RAINBOW_N - 1, (int) x); float t = x - i;
            int a = rainbow[i], b = rainbow[i + 1];
            return 0xFF000000 | (((int) (((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t)) << 16) | (((int) (((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t)) << 8) | (int) ((a & 255) * (1 - t) + (b & 255) * t);
        }
        /** 카드 크기에 영향을 주지 않는다: 카드가 정해진 뒤(EXACTLY)에만 그 크기를 따르고, 재는 동안엔 0. */
        @Override protected void onMeasure(int ws, int hs) {
            setMeasuredDimension(MeasureSpec.getMode(ws) == MeasureSpec.EXACTLY ? MeasureSpec.getSize(ws) : 0, MeasureSpec.getMode(hs) == MeasureSpec.EXACTLY ? MeasureSpec.getSize(hs) : 0);
        }
        void setMode(int m) {
            if (m == mode) return;
            mode = m;
            if (anim != null) { anim.cancel(); anim = null; }
            if (m == 0) { setVisibility(View.GONE); return; }
            setVisibility(View.VISIBLE);
            anim = ValueAnimator.ofFloat(0f, 1f); anim.setInterpolator(new LinearInterpolator()); anim.setRepeatCount(ValueAnimator.INFINITE); anim.setDuration(OvCore.spinMs(m));
            anim.addUpdateListener(new ValueAnimator.AnimatorUpdateListener() { @Override public void onAnimationUpdate(ValueAnimator a) { head = (Float) a.getAnimatedValue(); invalidate(); } });
            anim.start();
        }
        @Override protected void onDetachedFromWindow() { super.onDetachedFromWindow(); if (anim != null) { anim.cancel(); anim = null; mode = 0; } }
        /** 카드 크기(또는 모양)가 바뀌면 둘레 조각 길을 다시 만든다 — 그릴 때마다 만들지 않는다. */
        private void build(float w) {
            int key = getWidth() * 7919 + getHeight() * 31 + (pill ? 1 : 0);
            if (key == built) return;
            built = key;
            float in = w * 0.65f;                                                                              // 가장 굵을 때(1.3배)도 카드 밖으로 안 잘리게
            rf.set(in, in, getWidth() - in, getHeight() - in);
            android.graphics.Path ring = new android.graphics.Path(); float r = dp(pill ? 15 : 14);
            ring.addRoundRect(rf, r, r, android.graphics.Path.Direction.CW);
            android.graphics.PathMeasure pm = new android.graphics.PathMeasure(ring, true);
            float len = pm.getLength();
            for (int i = 0; i < N; i++) {
                seg[i].reset();
                pm.getSegment(len * i / N, Math.min(len, len * (i + 1) / N + 1.2f), seg[i], true);          // 이웃 조각과 1px 겹쳐 틈이 안 생기게
            }
        }
        @Override protected void onDraw(Canvas cv) {
            if (mode == 0 || getWidth() == 0 || getHeight() == 0) return;
            float w = dp(2.5f);
            build(w);
            for (int i = 0; i < N; i++) {
                double pos = (i + 0.5) / N, a = OvCore.ringAlpha(pos, head);
                p.setStrokeWidth(w * (float) (1.0 + 0.3 * OvCore.glow(pos, head)));                           // 빛이 지나는 자리는 살짝 굵게
                p.setColor((col[i] & 0x00FFFFFF) | ((int) Math.round(255 * a) << 24));
                cv.drawPath(seg[i], p);
            }
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
        private final android.graphics.Rect src = new android.graphics.Rect();
        private long inAt = 0L, seenAt = -1L;                              // 입장 시작 시각 · 마지막으로 본 추천(row.at)
        private static final long IN_MS = 1150L, TURN_MS = 300L;            // 오른쪽에서 줄을 끌고 들어오는 시간(웹 RecoView) · 다 들어온 뒤 돌아서기까지
        private final Runnable tick = new Runnable() { @Override public void run() { invalidate(); if (isShown() && row.kind > 0) postDelayed(this, 55L); } };
        RowView(Context c) { super(c); setVisibility(View.GONE); }
        void set(OvCore.Row r, int fgc, int subc) {
            if (r.kind > 0 && (r.at != seenAt || row.kind == 0)) { seenAt = r.at; inAt = System.currentTimeMillis(); }          // 새 추천/내릴 준비: 입장 연출을 다시
            row = r; fg = fgc; sub = subc;
            removeCallbacks(tick); if (r.kind > 0) post(tick);
            invalidate();
        }
        @Override protected void onMeasure(int w, int h) { setMeasuredDimension(MeasureSpec.getSize(w), dp(64)); }
        private void layoutBtns() {
            float w = getWidth(), top = dp(17), bot = dp(47);
            if (row.kind == 1) { b2.set(w - dp(8) - dp(42), top, w - dp(8), bot); b1.set(b2.left - dp(6) - dp(100), top, b2.left - dp(6), bot); }
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
            long now = System.currentTimeMillis(), el = now - inAt;
            float u = Math.min(1f, el / (float) IN_MS), slide = 1f - (1f - u) * (1f - u) * (1f - u);        // 처음엔 빠르게 걷다가 끝에서 서서히 멈춘다(감속)
            boolean walking = u < 1f, facingRow = el >= IN_MS + TURN_MS;                                     // 들어오는 동안 · 다 들어오고 0.3초 뒤엔 줄 쪽(오른쪽)으로 돌아선다
            cv.save();
            cv.translate((1f - slide) * getWidth(), 0f);                                                      // 캐릭터 + 줄 묶음이 오른쪽 화면 밖에서 왼쪽으로
            float x0 = dp(8);
            android.graphics.Bitmap sh = row.ch.length() > 0 ? sheet(row.ch) : null;
            if (sh != null) {
                long per = facingRow ? 183L : 110L;                                                            // 돌아선 뒤엔 동작을 0.6배 속도로 늦춘다
                int f = (int) ((now / per) % 16L), cell = sh.getWidth() / 4;
                src.set((f % 4) * cell, (f / 4) * cell, (f % 4) * cell + cell, (f / 4) * cell + cell);
                cr.set(x0, dp(6), x0 + dp(52), dp(58));
                p.setFilterBitmap(true); p.setAlpha(255); p.setStyle(Paint.Style.FILL);
                cv.save();
                if (walking) { cv.rotate(-5f * (1f - u * 0.4f), cr.centerX(), cr.bottom); cv.scale(-1f, 1f, cr.centerX(), cr.centerY()); }     // 앞(왼쪽)으로 5° 숙이고 왼쪽으로 가니 좌우 반전(시트는 오른쪽을 본다)
                cv.drawBitmap(sh, src, cr, p);
                cv.restore();
                x0 += dp(58);
            }
            float right = b1.left - dp(6), w = Math.max(dp(40), right - x0);
            draw(cv, row.a, x0, dp(24), 13f, true, fg, w);
            draw(cv, row.b, x0, dp(41), 11f, false, sub, w);
            if (row.kind == 1 && row.m.length() > 0) draw(cv, row.m, x0, dp(56), 10f, false, sub, w);
            if (row.kind == 1) { btn(cv, b1, row.go, true); btn(cv, b2, row.ok, false); }
            else btn(cv, b1, row.end, true);
            cv.restore();
        }
        @Override protected void onDetachedFromWindow() { removeCallbacks(tick); super.onDetachedFromWindow(); }
    }
}

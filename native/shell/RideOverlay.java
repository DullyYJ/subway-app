package com.dullyyj.subway;   // ★ 앱 패키지와 같아야 한다

import android.content.Context;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * 다른 앱 위에 뜨는 작은 안내 막대 (2026-10-21 s101). 현재역 ▸ 다음역 · 남은 시간 · (하차/환승 임박 때) 큰 안내 문구.
 *
 * ★ 원칙(YJ): "모든 계산은 엔진이 한다. 앱은 그림만 그린다." 글(line1·line2·banner)과 단계(alert 0·1·2)는 엔진(/ride-standby 의 overlay)이 정한 값 그대로다.
 *   여기는 창을 만들고 글자를 넣을 뿐이다. 누르면 앱으로 돌아가고, 위아래로 끌어 자리를 옮길 수 있다(자리는 이 프로세스에서만 기억).
 * 권한: '다른 앱 위에 표시'(SYSTEM_ALERT_WINDOW). 없으면 아무것도 하지 않는다. 설정에서 스위치를 켰을 때만 뜬다.
 * 모든 창 조작은 메인 스레드에서(어느 스레드에서 불러도 된다).
 */
final class RideOverlay {
    private final Context ctx;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private WindowManager wm;
    private LinearLayout box;
    private TextView t1, t2, t3;
    private GradientDrawable bg;
    private WindowManager.LayoutParams lp;
    private boolean shown;
    private static int lastY = -1;

    RideOverlay(Context c) { ctx = c.getApplicationContext() != null ? c.getApplicationContext() : c; }

    static boolean allowed(Context c) { return Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(c); }
    static boolean supported() { return Build.VERSION.SDK_INT >= 26; }

    /** on 이 아니거나 안내가 없으면 치운다. 아니면 만들거나 글만 바꾼다. */
    void update(final boolean on, final String line1, final String line2, final String banner, final int alert) {
        ui.post(new Runnable() { @Override public void run() {
            try {
                if (!on || line1 == null || line1.length() == 0 || !allowed(ctx)) { removeNow(); return; }
                if (!shown) addNow();
                if (!shown) return;
                t1.setText(line1); t2.setText(line2 == null ? "" : line2);
                t2.setVisibility(line2 == null || line2.length() == 0 ? View.GONE : View.VISIBLE);
                boolean ban = banner != null && banner.length() > 0 && alert > 0;
                t3.setText(ban ? banner : ""); t3.setVisibility(ban ? View.VISIBLE : View.GONE);
                bg.setColor(alert >= 1 ? (alert == 1 ? 0xF0D9381E : 0xF0C77700) : 0xEB1C1C1E);       // 1정거장 전 = 붉게 · 2정거장 전 = 주황 · 평소 = 짙은 회색
            } catch (Throwable ignored) { /* 창을 못 띄워도 안내는 알림으로 이어진다 */ }
        } });
    }
    void hide() { ui.post(new Runnable() { @Override public void run() { removeNow(); } }); }

    private void removeNow() {
        if (!shown) return;
        try { wm.removeViewImmediate(box); } catch (Throwable ignored) { }
        shown = false;
    }

    private void addNow() {
        float d = ctx.getResources().getDisplayMetrics().density;
        wm = (WindowManager) ctx.getSystemService(Context.WINDOW_SERVICE);
        box = new LinearLayout(ctx);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(Math.round(14 * d), Math.round(8 * d), Math.round(14 * d), Math.round(8 * d));
        bg = new GradientDrawable(); bg.setColor(0xEB1C1C1E); bg.setCornerRadius(16 * d);
        box.setBackground(bg);
        t1 = text(14f, true, 0xFFFFFFFF); t2 = text(11.5f, false, 0xFFD1D1D6); t3 = text(13f, true, 0xFFFFFFFF);
        box.addView(t1); box.addView(t2); box.addView(t3);
        int type = Build.VERSION.SDK_INT >= 26 ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY : WindowManager.LayoutParams.TYPE_PHONE;
        lp = new WindowManager.LayoutParams(WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT, type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS, PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
        lp.y = lastY >= 0 ? lastY : Math.round(48 * d);
        box.setOnTouchListener(new View.OnTouchListener() {
            float dy0, y0; int startY; boolean moved;
            @Override public boolean onTouch(View v, MotionEvent e) {
                switch (e.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN: y0 = e.getRawY(); startY = lp.y; moved = false; return true;
                    case MotionEvent.ACTION_MOVE: {
                        dy0 = e.getRawY() - y0;
                        if (Math.abs(dy0) > 12f) moved = true;
                        if (moved) { lp.y = Math.max(0, startY + Math.round(dy0)); lastY = lp.y; try { wm.updateViewLayout(box, lp); } catch (Throwable ignored) { } }
                        return true;
                    }
                    case MotionEvent.ACTION_UP:
                        if (!moved) {                                       // 누르면 앱으로 돌아간다
                            try { ctx.startActivity(new Intent(ctx, ShellActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)); } catch (Throwable ignored) { }
                        }
                        return true;
                    default: return true;
                }
            }
        });
        try { wm.addView(box, lp); shown = true; } catch (Throwable t) { shown = false; }
    }
    private TextView text(float sp, boolean bold, int color) {
        TextView t = new TextView(ctx);
        t.setTextSize(sp); t.setTextColor(color); t.setSingleLine(true); t.setEllipsize(android.text.TextUtils.TruncateAt.END);
        t.setTypeface(Typeface.DEFAULT, bold ? Typeface.BOLD : Typeface.NORMAL);
        t.setMaxWidth(Math.round(ctx.getResources().getDisplayMetrics().widthPixels * 0.86f));
        return t;
    }
}

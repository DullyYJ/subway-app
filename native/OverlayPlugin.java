package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.TextUtils;
import android.util.DisplayMetrics;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 다른 앱 위에 표시(오버레이) 플러그인 — "다른 앱을 보면서도 내 위치를 알 수 있게".
 *
 * 2026-10-01 신설 (YJ: "오버레이 방식 구현 — 앱이 백그라운드로 돌면 알아서 위에 떠야 해")
 * ──────────────────────────────────────────────────────────────────
 * · 이 플러그인은 '그리기'만 한다. 무엇을 보여줄지(현재 ▸ 다음 역, 남은 시간 문구)는 웹이 정해서
 *   update() 로 문자열을 넘겨 주고, 여기서는 받은 글자를 그대로 찍는다.
 * · 앱 화면이 사라지면(액티비티 onStop) 자동으로 뜨고, 앱으로 돌아오면(onStart) 자동으로 사라진다.
 *   PiP(작은 창)·알림 권한 창 같은 '앱이 아직 보이는 상태'에서는 onStop 이 오지 않으므로 겹치지 않는다.
 * · 권한: 설정 > 다른 앱 위에 표시(SYSTEM_ALERT_WINDOW). 사용자가 설정 화면에서 직접 켜야 한다
 *   (구글 플레이 정책도 이 권한은 시스템 설정 화면으로 보내 승인받도록 안내한다).
 * · 안전장치: 웹이 3분 넘게 갱신을 안 보내면(앱이 죽었거나 안내가 끝났는데 신호를 놓침) 스스로 숨겨
 *   낡은 시각이 계속 떠 있는 일이 없게 한다.
 * · 광고·홍보 문구는 절대 이 창에 넣지 않는다(플레이 정책: 앱 밖 화면에 광고 금지).
 */
@CapacitorPlugin(name = "Overlay")
public class OverlayPlugin extends Plugin {

    private static final long STALE_MS = 3 * 60 * 1000L;
    private static final long CHECK_MS = 30 * 1000L;
    private static final String PREF = "overlay_pos";

    private final Handler main = new Handler(Looper.getMainLooper());

    private volatile boolean wanted = false;       // 웹: 안내 중이고 오버레이를 쓰기로 함
    private volatile boolean appVisible = true;    // 액티비티가 화면에 보이는가
    private volatile long lastUpdateAt = 0L;
    private String line1 = "", line2 = "", line3 = "";

    private WindowManager wm;
    private WindowManager.LayoutParams lp;
    private LinearLayout root;
    private TextView t1, t2, t3;
    private boolean attached = false;

    // ── JS 에서 부르는 메서드 ─────────────────────────────────────

    @PluginMethod
    public void isAvailable(PluginCall call) {
        call.resolve(new JSObject()
                .put("supported", Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                .put("granted", canDraw())
                .put("shown", attached));
    }

    /** 시스템 '다른 앱 위에 표시' 설정 화면을 연다(사용자가 직접 켠다). */
    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (canDraw()) {
            call.resolve(new JSObject().put("ok", true).put("granted", true));
            return;
        }
        try {
            Intent i = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve(new JSObject().put("ok", true).put("granted", false));
        } catch (Exception e) {
            // 일부 기기는 앱별 화면이 없다 → 전체 목록 화면이라도 연다
            try {
                Intent i2 = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION);
                i2.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i2);
                call.resolve(new JSObject().put("ok", true).put("granted", false).put("fallback", true));
            } catch (Exception e2) {
                call.resolve(new JSObject().put("ok", false).put("error", String.valueOf(e2.getMessage())));
            }
        }
    }

    /**
     * 웹이 주기적으로 부른다. active=false 면 숨긴다.
     * line1: 윗줄(현재 ▸ 다음), line2: 가운데 줄(목적지·남은 시간·도착), line3: 선택(추천 알림 제목 등)
     */
    @PluginMethod
    public void update(PluginCall call) {
        wanted = call.getBoolean("active", false);
        line1 = nz(call.getString("line1"));
        line2 = nz(call.getString("line2"));
        line3 = nz(call.getString("line3"));
        lastUpdateAt = System.currentTimeMillis();
        refresh();
        call.resolve(new JSObject().put("ok", true).put("shown", attached));
    }

    // ── 앱이 화면에서 사라지면 뜨고, 돌아오면 사라진다 ─────────────

    @Override
    protected void handleOnStop() {
        appVisible = false;
        refresh();
    }

    @Override
    protected void handleOnStart() {
        appVisible = true;
        refresh();
    }

    @Override
    protected void handleOnDestroy() {
        wanted = false;
        appVisible = true;
        main.post(new Runnable() { @Override public void run() { detach(); } });
    }

    // ── 내부 ───────────────────────────────────────────────────

    private static String nz(String s) { return s == null ? "" : s; }

    private boolean canDraw() {
        try {
            return Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                    && Settings.canDrawOverlays(getContext());
        } catch (Exception e) {
            return false;
        }
    }

    private void refresh() {
        main.post(new Runnable() {
            @Override public void run() {
                try {
                    boolean stale = (System.currentTimeMillis() - lastUpdateAt) > STALE_MS;
                    boolean show = wanted && !appVisible && !stale && canDraw()
                            && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && line1.length() > 0;
                    if (show) { attachOrUpdate(); scheduleCheck(); }
                    else detach();
                } catch (Exception ignored) { }
            }
        });
    }

    private final Runnable checker = new Runnable() {
        @Override public void run() {
            if (attached) refresh();
        }
    };

    private void scheduleCheck() {
        main.removeCallbacks(checker);
        main.postDelayed(checker, CHECK_MS);
    }

    private int dp(float v) {
        DisplayMetrics dm = getContext().getResources().getDisplayMetrics();
        return Math.round(v * dm.density);
    }

    private TextView makeText(float sp, int color, boolean bold) {
        TextView t = new TextView(getContext());
        t.setTextColor(color);
        t.setTextSize(sp);
        t.setSingleLine(true);
        t.setEllipsize(TextUtils.TruncateAt.END);
        t.setGravity(Gravity.CENTER);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setIncludeFontPadding(false);
        return t;
    }

    private void build() {
        Context ctx = getContext();
        wm = (WindowManager) ctx.getSystemService(Context.WINDOW_SERVICE);
        DisplayMetrics dm = ctx.getResources().getDisplayMetrics();
        int maxW = Math.round(dm.widthPixels * 0.92f);

        root = new LinearLayout(ctx);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setPadding(dp(14), dp(8), dp(14), dp(8));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.BLACK);                 // 순수 검정(PiP 와 같은 규칙)
        bg.setCornerRadius(dp(14));
        root.setBackground(bg);

        t1 = makeText(16, Color.WHITE, true);
        t2 = makeText(14, Color.parseColor("#FFD60A"), true);
        t3 = makeText(12, Color.parseColor("#D4D4DA"), false);
        t1.setMaxWidth(maxW - dp(28));
        t2.setMaxWidth(maxW - dp(28));
        t3.setMaxWidth(maxW - dp(28));
        root.addView(t1);
        root.addView(t2);
        root.addView(t3);

        lp = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                        ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                        : WindowManager.LayoutParams.TYPE_PHONE,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                        | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
        SharedPreferences sp = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE);
        lp.x = sp.getInt("x", 0);
        lp.y = sp.getInt("y", dp(36));            // 상태바 바로 아래

        final int slop = ViewConfiguration.get(ctx).getScaledTouchSlop();
        root.setOnTouchListener(new View.OnTouchListener() {
            float dx, dy; int sx, sy; boolean dragged;
            @Override public boolean onTouch(View v, MotionEvent e) {
                switch (e.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        dx = e.getRawX(); dy = e.getRawY(); sx = lp.x; sy = lp.y; dragged = false;
                        return true;
                    case MotionEvent.ACTION_MOVE: {
                        float mx = e.getRawX() - dx, my = e.getRawY() - dy;
                        if (!dragged && (Math.abs(mx) > slop || Math.abs(my) > slop)) dragged = true;
                        if (dragged) {
                            lp.x = sx + Math.round(mx);
                            lp.y = Math.max(0, sy + Math.round(my));
                            try { wm.updateViewLayout(root, lp); } catch (Exception ignored) { }
                        }
                        return true;
                    }
                    case MotionEvent.ACTION_UP:
                        if (dragged) savePos();
                        else openApp();               // 탭하면 앱으로 돌아간다
                        return true;
                    default:
                        return false;
                }
            }
        });
    }

    private void savePos() {
        try {
            getContext().getSharedPreferences(PREF, Context.MODE_PRIVATE)
                    .edit().putInt("x", lp.x).putInt("y", lp.y).apply();
        } catch (Exception ignored) { }
    }

    private void openApp() {
        try {
            Intent i = getContext().getPackageManager()
                    .getLaunchIntentForPackage(getContext().getPackageName());
            if (i != null) {
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                        | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                        | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                getContext().startActivity(i);
            }
        } catch (Exception ignored) { }
    }

    private void attachOrUpdate() {
        if (root == null) build();
        t1.setText(line1);
        t2.setText(line2);
        t2.setVisibility(line2.length() > 0 ? View.VISIBLE : View.GONE);
        t3.setText(line3);
        t3.setVisibility(line3.length() > 0 ? View.VISIBLE : View.GONE);
        if (!attached) {
            try {
                wm.addView(root, lp);
                attached = true;
            } catch (Exception e) {
                attached = false;
            }
        }
    }

    private void detach() {
        main.removeCallbacks(checker);
        if (attached && wm != null && root != null) {
            try { wm.removeView(root); } catch (Exception ignored) { }
        }
        attached = false;
    }
}

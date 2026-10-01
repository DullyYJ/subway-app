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
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.TextUtils;
import android.text.style.ForegroundColorSpan;
import android.text.style.RelativeSizeSpan;
import android.text.style.StyleSpan;
import android.util.DisplayMetrics;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.getcapacitor.JSArray;
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
    private String[] track = new String[0];     // 출발 – 경로 – 현위치 – 경로 – 도착 (웹이 정해 준 이름들)
    private int trackCur = -1;                  // 현위치 칸 번호(이 칸만 하얗고, 나머지는 흐린 회색)

    private WindowManager wm;
    private WindowManager.LayoutParams lp;
    private LinearLayout root;
    private TextView t1, t2, t3;
    private LinearLayout row;                    // 다섯 칸(출발·경로…) — 현위치가 늘 가운데 칸에 오도록 칸 폭을 좌우 대칭으로 고정
    private final TextView[] cells = new TextView[5];
    private final TextView[] seps = new TextView[4];
    private static final float[] CELL_W = { 1f, 1f, 1.8f, 1f, 1f };   // 좌우 대칭 — 가운데(현위치) 칸이 화면 정중앙
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
     * track/cur: 윗줄 — 출발·경로·현위치·경로·도착 이름 목록과 현위치 칸 번호(현위치만 하얗게, 나머지는 회색).
     *            track 이 비어 있으면 line1 을 그대로 쓴다.
     * line2: 가운데 줄(목적지·남은 시간·도착), line3: 선택(추천 알림 제목 등)
     */
    @PluginMethod
    public void update(PluginCall call) {
        wanted = call.getBoolean("active", false);
        line1 = nz(call.getString("line1"));
        try {
            JSArray arr = call.getArray("track");
            int n = arr == null ? 0 : arr.length();
            String[] tr = new String[n];
            for (int i = 0; i < n; i++) tr[i] = arr.optString(i, "");
            track = tr;
        } catch (Exception e) { track = new String[0]; }
        trackCur = call.getInt("cur", -1);
        line2 = nz(call.getString("line2"));
        line3 = nz(call.getString("line3"));
        lastUpdateAt = System.currentTimeMillis();
        refresh();
        call.resolve(new JSObject().put("ok", true).put("shown", attached));
    }

    /**
     * ★ 2026-10-01 (YJ: "하차 전 추천 알림이 안 온다"): 앱이 가려지면 웹뷰 타이머가 멈춰 '하차 10분 전' 감시도 같이 멈춘다.
     * 확정한 여정이 진행되는 동안(오버레이를 쓰든 안 쓰든) 네이티브가 5초마다 웹을 깨우도록 웹이 켜고 끈다.
     * 웹이 60초마다 다시 켜 주지 않으면(10분) 스스로 멈춘다.
     */
    @PluginMethod
    public void keepAlive(PluginCall call) {
        journeyOn = call.getBoolean("on", false);
        if (journeyOn) journeyAt = System.currentTimeMillis();
        main.post(new Runnable() { @Override public void run() { if (journeyOn) startTicker(); } });
        call.resolve(new JSObject().put("ok", true));
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
        journeyOn = false;
        main.removeCallbacks(ticker);
        ticking = false;
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
                            && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                            && (track.length > 0 || line1.length() > 0);
                    if (show) { attachOrUpdate(); scheduleCheck(); startTicker(); }
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

    // ★ 2026-10-01 (YJ: "역을 이동해도 오버레이가 실시간으로 안 바뀌고 앱에 갔다 와야 바뀐다"):
    //   앱이 가려지면 웹뷰가 '숨겨진 페이지'가 되어 JS 타이머가 1초~1분 간격으로 늦춰지거나 멈춘다.
    //   → 오버레이가 떠 있는 동안은 네이티브가 5초마다 웹에 '한 번 돌아라' 하고 직접 깨운다.
    //   (스크립트 직접 실행은 타이머 제한을 받지 않는다. 무엇을 계산할지는 웹이 정하고, 여기서는 깨우기만 한다.)
    private static final long TICK_MS = 5 * 1000L;
    private static final long JOURNEY_STALE_MS = 10 * 60 * 1000L;   // 웹이 10분 넘게 '안내 중'이라고 말해 주지 않으면 스스로 멈춘다
    private boolean ticking = false;
    private volatile boolean journeyOn = false;    // 웹: 확정한 여정이 진행 중 (오버레이 사용 여부와 무관)
    private volatile long journeyAt = 0L;

    private final Runnable ticker = new Runnable() {
        @Override public void run() {
            boolean journey = journeyOn && (System.currentTimeMillis() - journeyAt) < JOURNEY_STALE_MS;
            if (!attached && !journey) { ticking = false; return; }
            try {
                // 앱이 보이는 동안은 웹이 스스로 돌고 있으니 깨울 필요가 없다. 가려진 동안만 깨운다.
                if (!appVisible && getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().getWebView().evaluateJavascript(
                            "try{window._ovlNativeTick&&window._ovlNativeTick();}catch(e){}", null);
                }
            } catch (Exception ignored) { }
            main.postDelayed(this, TICK_MS);
        }
    };

    private void startTicker() {
        if (ticking) return;
        ticking = true;
        main.postDelayed(ticker, TICK_MS);
    }

    private int dp(float v) {
        DisplayMetrics dm = getContext().getResources().getDisplayMetrics();
        return Math.round(v * dm.density);
    }

    private TextView makeText(float sp, int color, boolean bold) {
        TextView t = new TextView(getContext());
        t.setTextColor(color);
        t.setTextSize(sp);
        // ★ 2026-10-01: 한 줄 + '…' 로 자르면 아래 줄이 잘려 보였다(YJ 제보) → 잘라 내지 않고 필요하면 두 줄로 줄바꿈
        t.setMaxLines(2);
        t.setGravity(Gravity.CENTER);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setIncludeFontPadding(false);
        return t;
    }

    private void build() {
        Context ctx = getContext();
        wm = (WindowManager) ctx.getSystemService(Context.WINDOW_SERVICE);
        DisplayMetrics dm = ctx.getResources().getDisplayMetrics();
        // ★ 2026-10-01 (YJ: "역간 거리가 너무 멀어서 역이 하나만 보여 — 좌우 2개씩 보이게"): 실기기에서 다섯 칸이 화면보다 넓게
        //   퍼져 바깥 두 칸이 잘렸다(가중치(weight) 폭 + WRAP_CONTENT 창 조합). → 창 폭과 모든 칸 폭을 '정확한 픽셀'로 직접 정한다.
        //   이렇게 하면 어떤 기기에서도 창 = 화면의 94%, 다섯 칸 합 = 창 안쪽 폭으로 고정된다.
        int maxW = Math.round(dm.widthPixels * 0.96f);
        final int padH = dp(8);
        final int rowW = maxW - 2 * padH;
        final int sepW = dp(4);
        // ★ 2026-10-01 (YJ: "양옆 역은 세로 가운데로, 글자는 조금 키워"): 세 기둥 — 왼쪽(두 칸) · 가운데(현위치 + 노란 줄) · 오른쪽(두 칸).
        //   양옆 칸은 창 전체 높이의 한가운데에 놓인다(가운데 기둥이 두 줄이라 위쪽에 치우쳐 보이던 것을 바로잡음).
        //   가운데 기둥 폭은 노란 줄(남은 시간 문구)이 한 줄에 들어갈 만큼 확보하고, 나머지를 좌우 대칭으로 나눈다.
        final int centerW = Math.round(rowW * 0.43f);
        final int sideW = Math.round((rowW - centerW - 4 * sepW) / 4f);

        root = new LinearLayout(ctx);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setPadding(padH, dp(8), padH, dp(8));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.BLACK);                 // 순수 검정(PiP 와 같은 규칙)
        bg.setCornerRadius(dp(14));
        root.setBackground(bg);

        t1 = makeText(15, Color.WHITE, false);     // (예비 — 다섯 칸을 못 받았을 때만 가운데 칸에 쓴다)
        t2 = makeText(18, Color.parseColor("#FFD60A"), true);      // ★ 2026-10-01: 14→18 (아래 글자를 키워 달라는 요청)
        t3 = makeText(14, Color.parseColor("#D4D4DA"), false);
        t2.setMaxWidth(centerW);
        t3.setMaxWidth(rowW);

        for (int i = 0; i < 5; i++) {
            TextView c = makeText(12, Color.parseColor("#6E6E76"), false);
            cells[i] = c;
        }
        for (int i = 0; i < 4; i++) {
            TextView sp = makeText(12, Color.parseColor("#44444B"), false);
            sp.setText("\u203A");                       // ›
            seps[i] = sp;
        }
        // 옆 칸은 한 줄로 두고, 칸 폭에 맞춰 글자가 12sp 이하에서 스스로 줄어든다(이름이 길어도 잘리거나 줄바꿈되지 않게)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            for (int i = 0; i < 5; i++) {
                if (i == 2) continue;
                cells[i].setMaxLines(1);
                cells[i].setAutoSizeTextTypeUniformWithConfiguration(8, 12, 1, TypedValue.COMPLEX_UNIT_SP);
            }
        }

        row = new LinearLayout(ctx);                 // 세 기둥을 가로로 놓는 줄 — 모든 기둥이 세로 가운데 정렬
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.addView(cells[0], new LinearLayout.LayoutParams(sideW, LinearLayout.LayoutParams.WRAP_CONTENT));
        row.addView(seps[0], new LinearLayout.LayoutParams(sepW, LinearLayout.LayoutParams.WRAP_CONTENT));
        row.addView(cells[1], new LinearLayout.LayoutParams(sideW, LinearLayout.LayoutParams.WRAP_CONTENT));
        row.addView(seps[1], new LinearLayout.LayoutParams(sepW, LinearLayout.LayoutParams.WRAP_CONTENT));
        LinearLayout mid = new LinearLayout(ctx);    // 가운데 기둥: 현위치(흰색) 위, 노란 줄 아래
        mid.setOrientation(LinearLayout.VERTICAL);
        mid.setGravity(Gravity.CENTER_HORIZONTAL);
        mid.addView(cells[2], new LinearLayout.LayoutParams(centerW, LinearLayout.LayoutParams.WRAP_CONTENT));
        mid.addView(t2, new LinearLayout.LayoutParams(centerW, LinearLayout.LayoutParams.WRAP_CONTENT));
        row.addView(mid, new LinearLayout.LayoutParams(centerW, LinearLayout.LayoutParams.WRAP_CONTENT));
        row.addView(seps[2], new LinearLayout.LayoutParams(sepW, LinearLayout.LayoutParams.WRAP_CONTENT));
        row.addView(cells[3], new LinearLayout.LayoutParams(sideW, LinearLayout.LayoutParams.WRAP_CONTENT));
        row.addView(seps[3], new LinearLayout.LayoutParams(sepW, LinearLayout.LayoutParams.WRAP_CONTENT));
        row.addView(cells[4], new LinearLayout.LayoutParams(sideW, LinearLayout.LayoutParams.WRAP_CONTENT));
        root.addView(row, new LinearLayout.LayoutParams(rowW, LinearLayout.LayoutParams.WRAP_CONTENT));
        root.addView(t3);

        lp = new WindowManager.LayoutParams(
                maxW,
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

    /** 윗줄: 현위치 칸만 하얗고 크게, 나머지(출발·경로·도착)는 작고 흐린 회색. 글자만 그린다. */
    private CharSequence buildTrack() {
        if (track.length == 0) return line1;
        final int dim = Color.parseColor("#6E6E76");      // 잘 안 보이는 회색
        final int sepc = Color.parseColor("#44444B");
        SpannableStringBuilder sb = new SpannableStringBuilder();
        for (int i = 0; i < track.length; i++) {
            if (i > 0) {
                int a = sb.length();
                sb.append(" \u203A ");                    // ›
                sb.setSpan(new ForegroundColorSpan(sepc), a, sb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                sb.setSpan(new RelativeSizeSpan(0.8f), a, sb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            }
            int s0 = sb.length();
            sb.append(track[i]);
            int e0 = sb.length();
            if (i == trackCur) {
                sb.setSpan(new ForegroundColorSpan(Color.WHITE), s0, e0, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                sb.setSpan(new StyleSpan(Typeface.BOLD), s0, e0, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                sb.setSpan(new RelativeSizeSpan(1.25f), s0, e0, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            } else {
                sb.setSpan(new ForegroundColorSpan(dim), s0, e0, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                sb.setSpan(new RelativeSizeSpan(0.82f), s0, e0, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            }
        }
        return sb;
    }

    private void attachOrUpdate() {
        if (root == null) build();
        boolean five = track.length == 5;
        for (int i = 0; i < 5; i++) {
            String nm = five ? (track[i] == null ? "" : track[i]) : "";
            if (!five && i == 2) nm = line1;               // 예비: 다섯 칸을 못 받으면 한 줄 문구를 가운데 칸에
            boolean cur = five ? (i == trackCur) : (i == 2);
            TextView c = cells[i];
            c.setText(nm);
            if (i == 2) {                                   // 현위치 칸: 흰색·굵게·17sp, 길면 두 줄까지
                c.setTextColor(Color.WHITE);
                c.setTextSize(17);
                c.setTypeface(Typeface.DEFAULT_BOLD);
                c.setMaxLines(2);
            } else {                                        // 옆 칸: 회색, 칸에 맞춰 자동 축소(최대 12sp)
                c.setTextColor(Color.parseColor("#6E6E76"));
            }
        }
        for (int i = 0; i < 4; i++) {                       // 양옆이 모두 차 있는 사이에만 › 를 보인다
            boolean both = five && track[i] != null && track[i].length() > 0 && track[i + 1] != null && track[i + 1].length() > 0;
            seps[i].setVisibility(both ? View.VISIBLE : View.INVISIBLE);
        }
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
        if (!journeyOn) { main.removeCallbacks(ticker); ticking = false; }   // 여정이 진행 중이면 오버레이를 내려도 깨우기는 계속한다
        if (attached && wm != null && root != null) {
            try { wm.removeView(root); } catch (Exception ignored) { }
        }
        attached = false;
    }
}

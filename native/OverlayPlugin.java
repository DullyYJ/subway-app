package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.animation.ValueAnimator;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorFilter;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.RectF;
import android.graphics.SweepGradient;
import android.graphics.drawable.Drawable;
import android.view.animation.LinearInterpolator;
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
import android.widget.FrameLayout;
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
    private int alertLevel = 0;                 // 하차 임박: 0 없음 · 2 두 정거장 전(무지개 테두리가 천천히) · 1 한 정거장 전(빠르게)
    private RainbowBorder border;
    private ValueAnimator borderAnim;
    private int borderMode = 0;

    private WindowManager wm;
    private WindowManager.LayoutParams lp;
    private LinearLayout root;
    private TextView t1, t2, t3;
    // ★ 2026-10-03 (YJ: "지나간 곳 · 현위치 · 다음정거장 — 세 칸, 아래는 남은시간·도착"): 다섯 칸 → 세 칸. 가운데(현위치) 칸이 화면 정중앙.
    private final TextView[] cells = new TextView[3];
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
        Integer al = call.getInt("alert", 0);
        alertLevel = al == null ? 0 : Math.max(0, Math.min(2, al));
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
                    if (show) { rebuildIfResized(); attachOrUpdate(); scheduleCheck(); startTicker(); }
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
            try { if (attached) rebuildIfResized(); } catch (Exception ignored0) { }
            try {
                // 앱이 보이는 동안은 웹이 스스로 돌고 있으니 깨울 필요가 없다. 가려진 동안만 깨운다.
                if (!appVisible && getBridge() != null && getBridge().getWebView() != null) {
                    // ★ 2026-10-02 (YJ: "앱을 켤 때마다 위치가 바뀌어 있고 오버레이는 실시간으로 안 바뀐다"): 앱이 가려지면 웹뷰의 타이머·렌더가
                    //   멈춘 상태일 수 있다 → 깨우기 직전에 웹뷰 타이머를 다시 살린다(시스템 전체 설정이 아니라 이 웹뷰의 JS 타이머 일시정지 해제).
                    try { getBridge().getWebView().resumeTimers(); } catch (Exception ignored2) { }
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

    // ★ 2026-10-02 (YJ: 갤럭시 폴드 — "폰을 펴고 접을 때 화면에 안 맞춰져"): 오버레이는 만들 때의 화면 폭으로 굳어 있었다.
    //   접었다 펴면 화면 폭·밀도가 바뀌는데 창은 옛 폭 그대로라 좁은 화면에선 잘리고 넓은 화면에선 작게 남았다.
    //   → 폭·밀도는 '지금 실제 화면'(앱 컨텍스트의 기본 디스플레이)에서 읽고, 바뀌면 다시 만든다(rebuildIfResized).
    private DisplayMetrics realMetrics() {
        DisplayMetrics dm = new DisplayMetrics();
        try {
            WindowManager w = (WindowManager) getContext().getApplicationContext().getSystemService(Context.WINDOW_SERVICE);
            w.getDefaultDisplay().getRealMetrics(dm);
            if (dm.widthPixels > 0 && dm.density > 0) return dm;
        } catch (Exception ignored) { }
        return getContext().getResources().getDisplayMetrics();
    }

    private String builtKey = "";

    private String sizeKey() {
        DisplayMetrics dm = realMetrics();
        return dm.widthPixels + "x" + dm.heightPixels + "@" + dm.density;
    }

    /** 화면 폭·밀도가 바뀌었으면(폴드 펴기/접기) 오버레이를 새 크기로 다시 만든다. 메인 스레드에서만 부른다. */
    private void rebuildIfResized() {
        if (root == null || sizeKey().equals(builtKey)) return;
        boolean was = attached;
        if (attached && wm != null) {
            try { wm.removeView(root); } catch (Exception ignored) { }
            attached = false;
        }
        root = null; border = null; borderAnim = null; borderMode = 0;
        if (was) attachOrUpdate();
    }

    private int dp(float v) {
        return Math.round(v * realMetrics().density);
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
        DisplayMetrics dm = realMetrics();
        builtKey = sizeKey();
        // ★ 2026-10-01 (YJ: "역간 거리가 너무 멀어서 역이 하나만 보여 — 좌우 2개씩 보이게"): 실기기에서 다섯 칸이 화면보다 넓게
        //   퍼져 바깥 두 칸이 잘렸다(가중치(weight) 폭 + WRAP_CONTENT 창 조합). → 창 폭과 모든 칸 폭을 '정확한 픽셀'로 직접 정한다.
        //   이렇게 하면 어떤 기기에서도 창 = 화면의 94%, 다섯 칸 합 = 창 안쪽 폭으로 고정된다.
        // ★ 2026-10-02: 펼친 폴드(가로 700dp 안팎)에선 96% 폭이 지나치게 넓다 → 최대 560dp 로 제한한다.
        // ★ 2026-10-03 (YJ: "오버레이 좌우폭을 화면 좌우에 맞춰줘"): 화면 폭 그대로(가장자리까지).
        int maxW = dm.widthPixels;
        final int padH = dp(8);
        final int rowW = maxW - 2 * padH;
        final int centerW = Math.round(rowW * 0.36f);   // 현위치(가운데) 칸
        final int sideW = Math.round((rowW - centerW) / 2f);   // 지나간 곳 · 다음정거장 — 좌우 대칭

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
        t3.setMaxWidth(rowW);

        for (int i = 0; i < 3; i++) {
            TextView c = makeText(i == 1 ? 23.4f : 19.8f, i == 1 ? Color.WHITE : Color.parseColor("#6E6E76"), i == 1);
            // ★ 2026-10-03 (YJ: "경로는 한 줄만, 정류장이 길면 …으로 잘라"): 세 칸 모두 한 줄, 넘치면 끝을 '…' 로 자른다(글자 크기는 고정).
            c.setSingleLine(true);
            c.setMaxLines(1);
            c.setEllipsize(android.text.TextUtils.TruncateAt.END);
            cells[i] = c;
        }
        // 노란 줄(남은시간 · 도착)은 맨 아래 전체 폭에 한 줄(길면 글자가 스스로 줄어든다)
        t2.setMaxWidth(rowW);
        t2.setMaxLines(1);
        t2.setHorizontallyScrolling(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            t2.setAutoSizeTextTypeUniformWithConfiguration(10, 18, 1, TypedValue.COMPLEX_UNIT_SP);
        }
        LinearLayout row = new LinearLayout(ctx);    // 윗줄: 지나간 곳 | 현위치 | 다음정거장 (세로 가운데 정렬)
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.addView(cells[0], new LinearLayout.LayoutParams(sideW, LinearLayout.LayoutParams.WRAP_CONTENT));
        row.addView(cells[1], new LinearLayout.LayoutParams(centerW, LinearLayout.LayoutParams.WRAP_CONTENT));
        row.addView(cells[2], new LinearLayout.LayoutParams(sideW, LinearLayout.LayoutParams.WRAP_CONTENT));
        View gap = new View(ctx);
        root.addView(t3);                            // 추천 알림 제목은 위(노란 줄이 늘 맨 아래)
        root.addView(row, new LinearLayout.LayoutParams(rowW, LinearLayout.LayoutParams.WRAP_CONTENT));
        root.addView(gap, new LinearLayout.LayoutParams(1, dp(6)));
        root.addView(t2, new LinearLayout.LayoutParams(rowW, LinearLayout.LayoutParams.WRAP_CONTENT));

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
        // ★ 2026-10-02: 저장된 위치가 지금 화면 밖이면(폴드를 접어 폭이 줄었을 때) 안쪽으로 당겨 놓는다
        int xLimit = Math.max(0, (dm.widthPixels - maxW) / 2);
        lp.x = Math.max(-xLimit, Math.min(xLimit, sp.getInt("x", 0)));
        lp.y = Math.max(0, Math.min(sp.getInt("y", dp(36)), Math.max(0, dm.heightPixels - dp(120))));   // 상태바 바로 아래

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

    /**
     * ★ 2026-10-02 (YJ: "2정거장 전엔 오버레이 모서리가 얇은 무지개빛으로 천천히 돌고, 1정거장 전엔 빨리 돌면서 곧 내려야 한다는 표시"):
     * 오버레이 테두리에 무지개색 SweepGradient 를 돌려 그린다. 판단(몇 정거장 남았나)은 웹이 하고, 여기선 alert 값(0/2/1)대로 그리기만 한다.
     */
    private static class RainbowBorder extends Drawable {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final RectF rect = new RectF();
        private final Matrix matrix = new Matrix();
        private SweepGradient shader;
        private float angle = 0f, radius, stroke;
        private boolean visible = false;
        private final int[] colors = {
                0xFFFF3B30, 0xFFFF9500, 0xFFFFD60A, 0xFF34C759, 0xFF00C7BE, 0xFF0A84FF, 0xFFAF52DE, 0xFFFF2D92, 0xFFFF3B30 };

        RainbowBorder(float radiusPx, float strokePx) {
            radius = radiusPx; stroke = strokePx;
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(strokePx);
        }
        void setAngle(float a) { angle = a; invalidateSelf(); }
        void setShown(boolean v) { visible = v; invalidateSelf(); }
        @Override protected void onBoundsChange(android.graphics.Rect b) {
            rect.set(b);
            rect.inset(stroke / 2f, stroke / 2f);
            shader = new SweepGradient(b.exactCenterX(), b.exactCenterY(), colors, null);
            paint.setShader(shader);
        }
        @Override public void draw(Canvas c) {
            if (!visible || shader == null) return;
            matrix.setRotate(angle, getBounds().exactCenterX(), getBounds().exactCenterY());
            shader.setLocalMatrix(matrix);
            c.drawRoundRect(rect, radius, radius, paint);
        }
        @Override public void setAlpha(int a) { paint.setAlpha(a); }
        @Override public void setColorFilter(ColorFilter f) { paint.setColorFilter(f); }
        @Override public int getOpacity() { return PixelFormat.TRANSLUCENT; }
    }

    /** alert 값에 맞춰 테두리를 켜고(2=6초에 한 바퀴, 1=1.1초에 한 바퀴) 끈다. 메인 스레드에서 부른다. */
    private void applyAlert() {
        if (root == null) return;
        if (border == null) {
            border = new RainbowBorder(dp(14), dp(2.5f));            // 얇은 테두리
            root.setForeground(border);
        }
        int mode = alertLevel;
        if (mode == borderMode && (mode == 0 || (borderAnim != null && borderAnim.isRunning()))) return;
        borderMode = mode;
        if (borderAnim != null) { borderAnim.cancel(); borderAnim = null; }
        if (mode == 0) { border.setShown(false); return; }
        border.setShown(true);
        borderAnim = ValueAnimator.ofFloat(0f, 360f);
        borderAnim.setInterpolator(new LinearInterpolator());
        borderAnim.setDuration(mode == 1 ? 1100L : 6000L);
        borderAnim.setRepeatCount(ValueAnimator.INFINITE);
        borderAnim.addUpdateListener(new ValueAnimator.AnimatorUpdateListener() {
            @Override public void onAnimationUpdate(ValueAnimator a) { border.setAngle((Float) a.getAnimatedValue()); }
        });
        borderAnim.start();
    }

    private void stopAlert() {
        try { if (borderAnim != null) borderAnim.cancel(); } catch (Exception ignored) { }
        borderAnim = null; borderMode = 0;
        if (border != null) border.setShown(false);
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
        // 웹이 세 칸(지나간 곳·현위치·다음정거장)을 준다. 예전 웹(다섯 칸)이면 가운데 셋만 쓴다.
        String[] three = new String[3];
        if (track.length == 3) {
            for (int i = 0; i < 3; i++) three[i] = track[i] == null ? "" : track[i];
        } else if (track.length == 5) {
            for (int i = 0; i < 3; i++) three[i] = track[i + 1] == null ? "" : track[i + 1];
        } else {
            three[0] = ""; three[1] = line1; three[2] = "";   // 예비: 칸을 못 받으면 한 줄 문구를 가운데 칸에
        }
        // ★ 2026-10-03 (YJ: "지나간 곳이라는 글자는 예시였어, 직접 쓰지 마"): 비어 있는 칸은 글자를 넣지 않고 그대로 비워 둔다.
        for (int i = 0; i < 3; i++) {
            TextView c = cells[i];
            String nm = three[i] == null ? "" : three[i];
            c.setText(nm);
            if (i == 1) {                                   // 현위치 칸: 흰색·굵게
                c.setTextColor(Color.WHITE);
                c.setTypeface(Typeface.DEFAULT_BOLD);
            } else {                                        // 옆 칸: 회색
                c.setTextColor(Color.parseColor("#6E6E76"));
            }
        }
        t2.setText(line2);
        t2.setVisibility(line2.length() > 0 ? View.VISIBLE : View.GONE);
        t3.setText(line3);
        t3.setVisibility(line3.length() > 0 ? View.VISIBLE : View.GONE);
        try { applyAlert(); } catch (Exception ignored) { }
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
        stopAlert();                                   // 보이지 않는 동안 애니메이션을 돌리지 않는다(배터리)
        main.removeCallbacks(checker);
        if (!journeyOn) { main.removeCallbacks(ticker); ticking = false; }   // 여정이 진행 중이면 오버레이를 내려도 깨우기는 계속한다
        if (attached && wm != null && root != null) {
            try { wm.removeView(root); } catch (Exception ignored) { }
        }
        attached = false;
    }
}

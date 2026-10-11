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
import android.text.TextPaint;
import android.text.TextUtils;
import android.text.style.ForegroundColorSpan;
import android.text.style.RelativeSizeSpan;
import android.text.style.StyleSpan;
import android.util.DisplayMetrics;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.VelocityTracker;
import android.view.ViewConfiguration;
import android.view.animation.DecelerateInterpolator;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONObject;

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
    // ★ 2026-10-11 (YJ: "오버레이도 앱의 경로 화면으로 — 현위치 글씨만 검은색, 나머지는 회색. 정류장명은 한 줄, 길면 적당히 잘라"):
    //   앱 경로 화면(타임라인)의 칸을 웹이 그대로 읽어 보내 주면(이름·노선 라벨·시각·점/선 색) 여기서는 같은 모양으로 그리기만 한다.
    private static class Cell {
        String n = "", t = "", g = "";          // 정류장명 · 시각 · 노선 라벨(931번, ↔ 인천2호선)
        boolean pill = false;                   // 라벨이 색 배지(환승·출발·도착)인가
        int gc = 0xFF8E8E93;                    // 라벨 색(배지면 배경색)
        boolean hasL = false, hasR = false;     // 왼쪽·오른쪽 선이 있는가
        int lc = 0xFF8E8E93, rc = 0xFF8E8E93;   // 선 색
        int dc = 0xFF0A84FF;                    // 점 색
        int dk = 1;                             // 점 모양: 0 없음 · 1 속이 빈 동그라미 · 2 꽉 찬 점 · 3 작은 점(도보)
    }
    private Cell[] strip = new Cell[0];
    private int stripCur = 0;                   // 현위치 칸 번호(strip 안에서)
    // ★ 2026-10-11 (YJ: "오버레이 좌우 스크롤 가능하게 · 마커도 깜박이게"): 웹이 현위치 앞뒤 칸을 넉넉히(최대 50칸) 보내고,
    //   화면에는 다섯 칸만 보인다. 손가락으로 좌우로 밀면 넘겨 볼 수 있고, 손을 뗀 지 10초 뒤 현위치로 돌아온다.
    private int stripBase = 0;                  // strip[0] 이 경로 전체에서 몇 번째 칸인지(칸이 앞에서 잘려 나가도 스크롤 위치를 지키려고)
    private float scrollPos = 0f;               // 화면 맨 왼쪽 칸의 경로 전체 기준 위치(칸 단위, 소수)
    private boolean userScrolling = false;
    private float pulse = 0f;                   // 현위치 점 깜박임 0~1
    private ValueAnimator pulseAnim;
    private ValueAnimator flingAnim;            // 손가락을 떼도 관성으로 미끄러지는 스크롤
    private int thBg = Color.WHITE, thFg = Color.parseColor("#111114"), thSub = Color.parseColor("#8E8E93");
    private GradientDrawable cardBg;
    private boolean moving = false;             // ★ 2026-10-06: 열차가 현재 역을 떠나 다음 역으로 가는 중(웹이 판단해 넘겨 준다) — 화살표가 깜박인다
    private int alertLevel = 0;                 // 하차 임박: 0 없음 · 2 두 정거장 전(무지개 테두리가 천천히) · 1 한 정거장 전(빠르게)
    private RainbowBorder border;
    private ValueAnimator borderAnim;
    private int borderMode = 0;

    private WindowManager wm;
    private WindowManager.LayoutParams lp;
    private LinearLayout root;
    private TextView t1, t2, t3;
    private boolean attached = false;

    // ★ 2026-10-11: 현재역과 다음역 사이 선이 이동 중이면 깜박인다(예전 화살표 -->를 대신한다. 무엇을 보여줄지·이동 중인지는 웹이 정하고, 여기서는 그리기·깜박임만 한다).
    private StripView stripView;
    private static final long BLINK_MS = 550L;
    private boolean blinkOn = false, blinking = false;
    private final Runnable blinker = new Runnable() {
        @Override public void run() {
            if (!attached || !moving || stripView == null) { blinking = false; return; }
            blinkOn = !blinkOn;
            stripView.setLit(blinkOn);
            main.postDelayed(this, BLINK_MS);
        }
    };

    /**
     * 앱 경로 화면(타임라인)과 같은 모양으로 다섯 칸을 그리는 뷰: 정류장명 · 노선 라벨 · 점과 선 · 시각.
     * 현위치 칸만 글씨가 검정(테마의 글자색)이고 나머지는 회색. 정류장명은 한 줄이며 칸보다 길면 끝을 '…' 로 자른다.
     */
    private class StripView extends View {
        private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final TextPaint tp = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        private final RectF rf = new RectF();
        private boolean lit = true;
        StripView(Context c) {
            super(c);
            tp.setTextAlign(Paint.Align.CENTER);
        }
        void setLit(boolean on) { lit = on; invalidate(); }
        int wantH() { return dp(2) + dp(16) + dp(14) + dp(22) + dp(16); }
        // 높이는 우리가 정한 값으로 고정한다(부모가 wrap_content 라도 화면 전체를 덮지 않게).
        @Override protected void onMeasure(int wSpec, int hSpec) {
            setMeasuredDimension(MeasureSpec.getSize(wSpec), wantH());
        }
        private void text(Canvas cv, String s, float cx, float y, float maxW, float sp, int color, boolean bold) {
            if (s == null || s.length() == 0) return;
            tp.setTextSize(sp * getResources().getDisplayMetrics().scaledDensity);
            tp.setColor(color);
            tp.setTypeface(bold ? Typeface.DEFAULT_BOLD : Typeface.DEFAULT);
            CharSequence e = TextUtils.ellipsize(s, tp, Math.max(1f, maxW), TextUtils.TruncateAt.END);
            cv.drawText(e, 0, e.length(), cx, y, tp);
        }
        @Override protected void onDraw(Canvas cv) {
            int n = strip.length;
            if (n == 0) return;
            int cols = 5;
            float cw = getWidth() / (float) cols;
            float yName = dp(2) + dp(12.5f);
            float yTag = dp(2) + dp(16) + dp(10.5f);
            float yAx = dp(2) + dp(16) + dp(14) + dp(11);
            float yTime = dp(2) + dp(16) + dp(14) + dp(22) + dp(12);
            float lw = dp(3);
            for (int i = 0; i < n; i++) {
                Cell c = strip[i];
                float cx = (stripBase + i - scrollPos + 0.5f) * cw;
                if (cx + cw / 2f < 0f || cx - cw / 2f > getWidth()) continue;      // 화면 밖 칸은 그리지 않는다
                boolean here = (i == stripCur);
                int ink = here ? thFg : thSub;
                // 정류장명(한 줄)
                text(cv, c.n, cx, yName, cw - dp(3), here ? 11.5f : 10.5f, ink, true);
                // 노선 라벨
                if (c.g.length() > 0) {
                    if (c.pill) {
                        tp.setTextSize(7f * getResources().getDisplayMetrics().scaledDensity);
                        tp.setTypeface(Typeface.DEFAULT_BOLD);
                        CharSequence e = TextUtils.ellipsize(c.g, tp, Math.max(1f, cw - dp(10)), TextUtils.TruncateAt.END);
                        float w = tp.measureText(e, 0, e.length()) + dp(8);
                        rf.set(cx - w / 2f, yTag - dp(8.5f), cx + w / 2f, yTag + dp(2.5f));
                        p.setStyle(Paint.Style.FILL);
                        p.setColor(c.gc);
                        cv.drawRoundRect(rf, dp(4), dp(4), p);
                        tp.setColor(Color.WHITE);
                        cv.drawText(e, 0, e.length(), cx, yTag, tp);
                    } else {
                        text(cv, c.g, cx, yTag, cw - dp(3), 8f, c.gc, true);
                    }
                }
                // 선
                p.setStyle(Paint.Style.FILL);
                boolean blinkSeg = moving && !lit && ((i == stripCur && c.hasR) || (i == stripCur + 1 && c.hasL));
                int al = blinkSeg ? 70 : 255;
                if (c.hasL) {
                    p.setColor((c.lc & 0x00FFFFFF) | (al << 24));
                    cv.drawRect(cx - cw / 2f, yAx - lw / 2f, cx, yAx + lw / 2f, p);
                }
                boolean blinkR = moving && !lit && (i == stripCur && c.hasR);
                if (c.hasR) {
                    p.setColor((c.rc & 0x00FFFFFF) | ((blinkR ? 70 : 255) << 24));
                    cv.drawRect(cx, yAx - lw / 2f, cx + cw / 2f, yAx + lw / 2f, p);
                }
                // 점
                if (here) {
                    // ★ 2026-10-11 (YJ): 대기 중(정차)엔 노란(주황) 점, 움직이는 중엔 앱 화면처럼 파란 점
                    int hc = moving ? 0x000A84FF : 0x00F0A500;
                    int ha = Math.round(0x70 * (1f - 0.6f * pulse));
                    p.setColor((ha << 24) | hc);
                    cv.drawCircle(cx, yAx, dp(9) + dp(4) * pulse, p);   // 현위치 둘레 테두리(깜박이며 커졌다 작아짐)
                    int da = Math.round(255 * (1f - 0.55f * pulse));
                    p.setColor((da << 24) | hc);
                    cv.drawCircle(cx, yAx, dp(7), p);           // 앱 현위치 점(대기 주황 · 이동 파랑, 깜박임)
                } else if (c.dk == 2) {
                    p.setColor(c.dc);
                    cv.drawCircle(cx, yAx, dp(7), p);
                } else if (c.dk == 1) {
                    p.setColor(c.dc);
                    cv.drawCircle(cx, yAx, dp(6), p);
                    p.setColor(thBg);
                    cv.drawCircle(cx, yAx, dp(3), p);
                } else if (c.dk == 3) {
                    p.setColor(c.dc);
                    cv.drawCircle(cx, yAx, dp(3), p);
                }
                // 시각
                text(cv, c.t, cx, yTime, cw - dp(3), 9.5f, ink, true);
            }
        }
    }

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
     * cells/cur: 윗줄 — 앱 경로 화면의 칸(이름 n · 시각 t · 라벨 g/gp/gc · 선 lc/rc · 점 dc/dk)과 현위치 칸 번호(현위치 글씨만 검정, 나머지는 회색).
     * theme: 앱 테마의 카드 바탕·글자·보조 글자 색(bg/fg/sub).
     * line2: 가운데 줄(목적지·남은 시간·도착), line3: 선택(추천 알림 제목 등)
     */
    @PluginMethod
    public void update(PluginCall call) {
        wanted = call.getBoolean("active", false);
        line1 = nz(call.getString("line1"));
        try {
            JSArray arr = call.getArray("cells");
            int n = arr == null ? 0 : Math.min(arr.length(), 60);
            Cell[] cs = new Cell[n];
            for (int i = 0; i < n; i++) {
                JSONObject o = arr.getJSONObject(i);
                Cell c = new Cell();
                c.n = o.optString("n", ""); c.t = o.optString("t", ""); c.g = o.optString("g", "");
                c.pill = o.optBoolean("gp", false);
                c.gc = col(o.optString("gc", ""), 0xFF8E8E93);
                String l = o.optString("lc", ""), r = o.optString("rc", "");
                c.hasL = l.length() > 0; c.hasR = r.length() > 0;
                c.lc = col(l, 0xFF8E8E93); c.rc = col(r, 0xFF8E8E93);
                c.dc = col(o.optString("dc", ""), 0xFF0A84FF);
                c.dk = o.optInt("dk", 1);
                cs[i] = c;
            }
            strip = cs;
        } catch (Exception e) { strip = new Cell[0]; }
        stripCur = Math.max(0, Math.min(call.getInt("cur", 0), Math.max(0, strip.length - 1)));
        stripBase = Math.max(0, call.getInt("base", 0));
        try {
            JSObject th = call.getObject("theme");
            if (th != null) {
                thBg = col(th.optString("bg", ""), Color.WHITE);
                thFg = col(th.optString("fg", ""), Color.parseColor("#111114"));
                thSub = col(th.optString("sub", ""), Color.parseColor("#8E8E93"));
            }
        } catch (Exception ignored) { }
        moving = call.getBoolean("moving", false);
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

    /** '#rrggbb' 문자열을 색으로(잘못된 값이면 기본값). */
    private static int col(String s, int def) {
        try {
            if (s == null || s.length() == 0) return def;
            return Color.parseColor(s);
        } catch (Exception e) { return def; }
    }

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
                            && (strip.length > 0 || line1.length() > 0);
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
        stopBlink();
        root = null; border = null; borderAnim = null; borderMode = 0; stripView = null; cardBg = null;
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

        root = new LinearLayout(ctx);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setPadding(padH, dp(8), padH, dp(8));
        // ★ 2026-10-11: 앱 경로 화면 카드와 같은 모양 — 테마의 카드 바탕 + 얇은 테두리(순수 검정 바탕은 그만)
        cardBg = new GradientDrawable();
        cardBg.setColor(thBg);
        cardBg.setCornerRadius(dp(14));
        cardBg.setStroke(Math.max(1, dp(1)), 0x33808080);
        root.setBackground(cardBg);

        t1 = makeText(15, thFg, false);            // (예비 — 앱 칸을 못 받았을 때만 쓴다)
        t2 = makeText(13, thSub, true);            // 남은시간 · 도착 (회색)
        t3 = makeText(13, thSub, false);           // 추천 알림 제목
        t3.setMaxWidth(rowW);

        // 남은시간 줄은 맨 아래 전체 폭에 한 줄(길면 글자가 스스로 줄어든다)
        t2.setMaxWidth(rowW);
        t2.setMaxLines(1);
        t2.setHorizontallyScrolling(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            t2.setAutoSizeTextTypeUniformWithConfiguration(10, 13, 1, TypedValue.COMPLEX_UNIT_SP);
        }
        View gap = new View(ctx);
        stripView = new StripView(ctx);
        root.addView(t3);                            // 추천 알림 제목은 위(남은시간 줄이 늘 맨 아래)
        root.addView(stripView, new LinearLayout.LayoutParams(rowW, stripView.wantH()));
        root.addView(gap, new LinearLayout.LayoutParams(1, dp(4)));
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
            float dx, dy; int sx, sy; boolean dragged, scrolling, inStrip; float startPos; VelocityTracker vt;
            @Override public boolean onTouch(View v, MotionEvent e) {
                switch (e.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        dx = e.getRawX(); dy = e.getRawY(); sx = lp.x; sy = lp.y; dragged = false; scrolling = false;
                        // 점·선 줄에서 시작한 좌우 움직임은 칸을 넘겨 보는 스크롤, 그 밖은 창 이동
                        inStrip = stripView != null && e.getY() >= stripView.getTop() && e.getY() <= stripView.getBottom();
                        startPos = scrollPos;
                        stopFling();                                  // 미끄러지던 중에 다시 대면 멈춘다
                        try { if (vt != null) vt.recycle(); vt = VelocityTracker.obtain(); vt.addMovement(e); } catch (Exception ignored) { vt = null; }
                        return true;
                    case MotionEvent.ACTION_MOVE: {
                        float mx = e.getRawX() - dx, my = e.getRawY() - dy;
                        try { if (vt != null) vt.addMovement(e); } catch (Exception ignored) { }
                        if (!dragged && !scrolling && (Math.abs(mx) > slop || Math.abs(my) > slop)) {
                            if (inStrip && strip.length > 5 && Math.abs(mx) > Math.abs(my)) {
                                scrolling = true;
                                userScrolling = true;
                                main.removeCallbacks(recenter);
                            } else dragged = true;
                        }
                        if (scrolling && stripView != null && stripView.getWidth() > 0) {
                            scrollPos = clampPos(startPos - mx / (stripView.getWidth() / 5f));
                            stripView.invalidate();
                        } else if (dragged) {
                            lp.x = sx + Math.round(mx);
                            lp.y = Math.max(0, sy + Math.round(my));
                            try { wm.updateViewLayout(root, lp); } catch (Exception ignored) { }
                        }
                        return true;
                    }
                    case MotionEvent.ACTION_UP:
                    case MotionEvent.ACTION_CANCEL:
                        if (scrolling) {
                            // ★ 2026-10-11 (YJ: "앱처럼 슬라이딩되어 미끄러지게"): 떼는 순간의 속도로 관성 스크롤
                            try {
                                if (vt != null && e.getAction() == MotionEvent.ACTION_UP && stripView != null && stripView.getWidth() > 0) {
                                    vt.addMovement(e);
                                    vt.computeCurrentVelocity(1000);
                                    float cw = stripView.getWidth() / 5f;
                                    startFling(-vt.getXVelocity() / cw);          // 초당 몇 칸
                                }
                            } catch (Exception ignored) { }
                            main.postDelayed(recenter, 10000L);      // 손을 뗀 지 10초 뒤 현위치로 돌아온다
                        }
                        else if (dragged) savePos();
                        else if (e.getAction() == MotionEvent.ACTION_UP) openApp();   // 탭하면 앱으로 돌아간다
                        try { if (vt != null) { vt.recycle(); vt = null; } } catch (Exception ignored) { }
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

    private void attachOrUpdate() {
        if (root == null) build();
        // 앱 경로 화면의 칸이 오면 그대로 그린다. 못 받으면(옛 웹) 한 줄 문구만 가운데에 보여 준다.
        if (strip.length == 0 && line1.length() > 0) {
            Cell c = new Cell();
            c.n = line1; c.dk = 0;
            strip = new Cell[] { c };
            stripCur = 0;
        }
        try {
            if (cardBg != null) cardBg.setColor(thBg);
            if (!userScrolling) scrollPos = followPos(); else scrollPos = clampPos(scrollPos);
            t2.setTextColor(thSub);
            t3.setTextColor(thSub);
            if (stripView != null) {
                stripView.invalidate();
                if (moving && strip.length > 1) startBlink();
                else { stopBlink(); stripView.setLit(true); }       // 정차 중: 선은 그대로
            }
        } catch (Exception ignored) { }
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
        if (attached) startPulse();
    }

    /** 현위치가 둘째 칸에 오도록 한 스크롤 위치(보낸 칸 범위 안으로 제한, 다섯 칸보다 적으면 가운데). */
    private float followPos() {
        int n = strip.length;
        if (n <= 5) return stripBase - (5 - n) / 2f;
        float lo = stripBase, hi = stripBase + n - 5;
        return Math.max(lo, Math.min(hi, stripBase + stripCur - 1));
    }

    private float clampPos(float v) {
        int n = strip.length;
        if (n <= 5) return stripBase - (5 - n) / 2f;
        return Math.max(stripBase, Math.min(stripBase + n - 5, v));
    }

    /** 손가락을 뗀 뒤 관성으로 미끄러지는 스크롤(속도 = 초당 칸 수). 천천히 감속하며 끝에서 멈춘다. */
    private void startFling(float cellsPerSec) {
        stopFling();
        if (stripView == null || !attached) return;
        float dist = cellsPerSec * 0.38f;                       // 떼는 속도에 비례해 더 미끄러진다
        if (Math.abs(dist) < 0.25f) return;
        final float from = scrollPos, to = clampPos(from + dist);
        if (Math.abs(to - from) < 0.05f) return;
        long dur = (long) Math.max(320, Math.min(1200, 320 + Math.abs(to - from) * 150));
        flingAnim = ValueAnimator.ofFloat(0f, 1f);
        flingAnim.setDuration(dur);
        flingAnim.setInterpolator(new DecelerateInterpolator(2.2f));
        flingAnim.addUpdateListener(new ValueAnimator.AnimatorUpdateListener() {
            @Override public void onAnimationUpdate(ValueAnimator an) {
                scrollPos = from + (to - from) * (Float) an.getAnimatedValue();
                if (stripView != null) stripView.invalidate();
            }
        });
        flingAnim.start();
    }

    private void stopFling() {
        try { if (flingAnim != null) flingAnim.cancel(); } catch (Exception ignored) { }
        flingAnim = null;
    }

    private final Runnable recenter = new Runnable() {
        @Override public void run() {
            stopFling();
            userScrolling = false;
            if (stripView == null || !attached) return;
            final float from = scrollPos, to = followPos();
            ValueAnimator a = ValueAnimator.ofFloat(0f, 1f);
            a.setDuration(380L);
            a.setInterpolator(new DecelerateInterpolator(1.6f));
            a.addUpdateListener(new ValueAnimator.AnimatorUpdateListener() {
                @Override public void onAnimationUpdate(ValueAnimator an) {
                    if (userScrolling) { an.cancel(); return; }
                    scrollPos = from + (to - from) * (Float) an.getAnimatedValue();
                    if (stripView != null) stripView.invalidate();
                }
            });
            a.start();
        }
    };

    /** 현위치 점을 깜박이게 한다(보이는 동안만 돈다). */
    private void startPulse() {
        if (pulseAnim != null && pulseAnim.isRunning()) return;
        pulseAnim = ValueAnimator.ofFloat(0f, 1f);
        pulseAnim.setDuration(650L);
        pulseAnim.setRepeatCount(ValueAnimator.INFINITE);
        pulseAnim.setRepeatMode(ValueAnimator.REVERSE);
        pulseAnim.addUpdateListener(new ValueAnimator.AnimatorUpdateListener() {
            @Override public void onAnimationUpdate(ValueAnimator an) {
                pulse = (Float) an.getAnimatedValue();
                if (stripView != null) stripView.invalidate();
            }
        });
        pulseAnim.start();
    }

    private void stopPulse() {
        try { if (pulseAnim != null) pulseAnim.cancel(); } catch (Exception ignored) { }
        pulseAnim = null; pulse = 0f;
    }

    private void startBlink() {
        if (blinking) return;
        blinking = true; blinkOn = true;
        if (stripView != null) stripView.setLit(true);
        main.postDelayed(blinker, BLINK_MS);
    }

    private void stopBlink() {
        main.removeCallbacks(blinker);
        blinking = false; blinkOn = false;
    }

    private void detach() {
        stopBlink();
        stopPulse();
        stopFling();
        main.removeCallbacks(recenter);
        userScrolling = false;
        stopAlert();                                   // 보이지 않는 동안 애니메이션을 돌리지 않는다(배터리)
        main.removeCallbacks(checker);
        if (!journeyOn) { main.removeCallbacks(ticker); ticking = false; }   // 여정이 진행 중이면 오버레이를 내려도 깨우기는 계속한다
        if (attached && wm != null && root != null) {
            try { wm.removeView(root); } catch (Exception ignored) { }
        }
        attached = false;
    }
}

package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.animation.ValueAnimator;
import android.graphics.Canvas;
import android.graphics.Bitmap;
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
import android.view.animation.OvershootInterpolator;
import android.view.ViewTreeObserver;
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

    private static final long STALE_MS = 6 * 60 * 1000L;   // 2026-10-12: 3분 → 6분
    private static final long CHECK_MS = 30 * 1000L;
    private static final String PREF = "overlay_pos";

    private final Handler main = new Handler(Looper.getMainLooper());

    // ★ 2026-10-13 (YJ: "카카오 방식 — 앱을 밀어 닫아도 네이티브가 안내를 이어서 그린다"): 대기 모드.
    //   액티비티가 사라져도(최근 목록에서 밀어 닫음) 프로세스는 KeepAliveService 덕에 산다. 그때 오버레이 창을 내리지 않고 hosted 로 쥐고 있다가,
    //   KeepAliveService 가 엔진 답에서 받은 overlay 값을 standbyPush 로 넘기면 그대로 그린다(웹 update 와 같은 모양). 앱을 다시 열면 새 플러그인 인스턴스가 load() 에서 이 창을 거둔다.
    private static volatile OverlayPlugin live = null;
    private volatile boolean hosted = false;        // 대기 모드가 이 인스턴스의 오버레이 창을 쥐고 있다
    private volatile boolean hostedOk = false;      // 넘겨받을 때 오버레이를 쓰는 중이었다(설정에서 껐으면 대기 모드에서도 그리지 않는다)

    @Override
    public void load() {
        OverlayPlugin old = live;
        live = this;
        if (old != null && old != this && old.hosted) {
            // 앱이 다시 열렸지만 대기 모드는 계속된다(웹은 새로 떠서 여정을 모른다) — 이 인스턴스가 쥐기를 이어받고 옛 창은 거둔다.
            // 다음 엔진 답(5초 안)부터 이 인스턴스가 그린다. 앱이 보이는 동안은 숨고, 다시 가려지면(handleOnStop) 뜬다.
            hostedOk = old.hostedOk; hosted = true;
            old.hosted = false; old.hostedOk = false; old.wanted = false;
            final OverlayPlugin o2 = old;
            main.post(new Runnable() { @Override public void run() { try { o2.detach(); } catch (Throwable ignored) { } } });
        } else if (old != null && old != this) {
            old.wanted = false;
            final OverlayPlugin o3 = old;
            main.post(new Runnable() { @Override public void run() { try { o3.detach(); } catch (Throwable ignored) { } } });
        }
    }

    private void releaseHosted() {
        hosted = false; hostedOk = false; wanted = false;
        main.post(new Runnable() { @Override public void run() { try { detach(); } catch (Throwable ignored) { } } });
    }

    /** KeepAliveService → 엔진이 준 overlay 값을 대기 모드로 쥐고 있는 오버레이에 그린다. 쥔 인스턴스가 없으면 아무 일도 하지 않는다. */
    static void standbyPush(JSONObject ov) {
        final OverlayPlugin p = live;
        if (p == null || !p.hosted || !p.hostedOk || ov == null) return;
        try {
            if (!ov.optBoolean("active", false)) { p.wanted = false; p.refresh(); return; }
            p.applyUpdate(ov);
            if (!p.hostedOk) p.wanted = false;
        } catch (Throwable ignored) { }
    }

    /** 대기 모드가 끝났다 — 쥐고 있던 오버레이를 내린다. */
    static void standbyHide() {
        final OverlayPlugin p = live;
        if (p == null || !p.hosted) return;
        p.releaseHosted();
    }

    private volatile boolean wanted = false;       // 웹: 안내 중이고 오버레이를 쓰기로 함
    // ★ 2026-10-14 (YJ: "도착 전 추천 때 캐릭터들이 어떻게 나와서 동작하는지 보고 싶어 — 테스트 버튼"): 설정의 [캐릭터 미리보기]가 부르는 시연.
    //   앱이 보이는 중에도 오버레이를 띄워 추천 줄과 캐릭터 둘을 몇 초간 보여 준다. 이 동안 웹의 update 는 무시하고, 끝나면 시연 전 값으로 되돌린다.
    private volatile long demoUntil = 0L;
    private boolean demoSaved = false;
    private boolean sWanted, sRcOn, sMoving;
    private Cell[] sStrip;
    private int sStripCur, sStripBase;
    private String sLine1 = "", sLine2 = "", sLine3 = "", sRcA = "", sRcB = "", sRcM = "", sRcGo = "", sRcCh = "", sRcCh2 = "", sRsSt = "hidden";
    private long sRcAt;
    private boolean demoActive() { return demoUntil > System.currentTimeMillis(); }
    private volatile boolean appVisible = true;    // 액티비티가 화면에 보이는가
    private volatile long lastUpdateAt = 0L;
    private volatile long webAliveAt = 0L;     // 웹이 깨우기에 마지막으로 답한 시각
    private String line1 = "", line2 = "", line3 = "";
    private String pillCur = "";                 // ★ 2026-10-13: 알약의 현위치 문구(웹이 엔진 값으로 정한다 — 이동 중이면 '다음역(이동중)'). 비면 line1 에서 뽑는다
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
    // ★ 2026-10-11 (YJ: "오버레이에도 탑승 버튼을 앱처럼 — 2분 전 자동으로 나오고, 쓸어 올리면 나오고 쓸어 내리면 숨고"):
    //   언제 보일지(board 올림 · wait 대기 알약 · undo 되돌리기 · hidden 숨김)와 문구·색은 앱의 탑승 시트 상태(_rs)를 웹이 그대로 넘겨 준다.
    //   여기서는 그리기와 손짓(쓸어 올림·내림·탑승 누름)을 웹에 알리는 일만 한다.
    private String rsSt = "hidden", rsK = "", rsCh = "", rsNm = "", rsUm = "", rsBt = "탑승";
    private boolean rsHasCbg = false;
    private int rsCbg = 0xFF0A84FF, rsCfg = 0xFF0A84FF;
    private float rsBar = -1f;                  // 출발 뒤 남은 비율(0~1), 없으면 -1
    private BoardView boardView;
    // ★ 2026-10-11 (YJ: "추천은 오버레이 하단에 · 추천아이템 연결 버튼 · 끄는 확인 버튼"): 도착 3분 전부터 맨 아래에 두 줄 추천 + [보기] [확인]. 문구·시각·갈 곳은 웹이 정한다.
    private boolean rcOn = false;
    private String rcA = "", rcB = "", rcM = "", rcGo = "보기";
    // ★ 2026-10-16 (YJ: "도착즈음 나오는 광고에서 버튼을 맛집보기 · 주변버스보기 · 종료"): 버튼이 셋 — [rcGo] [rcBus] [rcEnd]. 이름은 웹이 정해 보내고, 못 받으면 아래 기본 이름을 쓴다.
    private String rcBus = "주변버스 보기", rcEnd = "종료";
    // ★ 2026-10-13 (YJ: "도착 전 추천 때 오버레이 하단이 확장되면서 캐릭터 일부가 나와서 추천을 보여줘"): 웹이 정한 캐릭터 둘(rcCh 큰 쪽·rcCh2 작은 쪽)을
    //   추천 줄 위로 내민다. 그림(3D 동작 프레임 www/chars3d/*.webp)은 앱 자산에서 읽어 그리기만 한다 — 문구·시각·갈 곳은 그대로 웹이 정한다.
    private long rcAt = 0;
    private String rcCh = "", rcCh2 = "";
    private RecoView recoView;
    private static final String[] RC_CHARS = { "dolsom", "lovel", "dudung", "sul", "ppopu", "chaeng" };
    // ★ 2026-10-13 (YJ: "캐릭터를 3D 렌더링해서 동물답게 — 추천 문구 때도 똑같이 · 예전 방식은 안 돼"): 3D 로 미리 렌더링한 동작 프레임 시트(public/chars3d/<id>.webp, 256px 칸 4×4)를
    //   시간 순으로 그린다(제자리 걸음·뜀·날갯짓·헤엄). 옛 한 장 그림 방식은 없앴다 — 읽기가 어긋나면 잠시 뒤 다시 읽는다.
    private final java.util.HashMap<String, Bitmap> rcSheet = new java.util.HashMap<String, Bitmap>();
    private final java.util.HashMap<String, Long> rcSheetFail = new java.util.HashMap<String, Long>();
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
    private long lastVibeAt = 0L;               // 마지막으로 진동한 경고의 시각(웹이 단계가 바뀐 때 찍어 보냄) — 같은 경고에 두 번 울리지 않는다
    private int alertLevel = 0;                 // 하차 임박: 0 없음 · 2 두 정거장 전(무지개 테두리가 천천히) · 1 한 정거장 전(빠르게)
    private RainbowBorder border;
    private ValueAnimator borderAnim;
    private int borderMode = 0;

    // ★ 2026-10-12 (YJ: "위로 한 번 쓸면 알약 — 현재 상황(대기·현위치)만 보여주고, 하차 3정거장 전엔 알약이 깜박이고,
    //   환승 1정거장 전·목적지 2·1정거장 전엔 알약이 스프링처럼 펼쳐지며 맨 위로 가서 엣지 강조. 알림이 지나면 다시 알약으로"):
    //   userPill = 사용자가 알약으로 접어 둔 상태(저장됨). 접힌 동안 웹의 경고 단계(alert 1·2)가 켜지면 자동으로 펼쳐 맨 위로 옮기고(원래 위치는 기억),
    //   경고가 끝나면 다시 알약으로 접어 원래 위치로 돌려놓는다. 알약일 때만 쓰는 신호: pre(목적지 3정거장 전) = 알약 깜박임.
    //   알약일 때는 테두리·탑승 줄·추천 줄·칸 줄을 그리지 않고, 진동은 모드와 상관없이 기존대로 울린다.
    private boolean userPill = false;           // 사용자가 접어 둠
    private boolean curPill = false;            // 지금 그려진 모드(true=알약)
    private boolean movedForAlert = false;      // 경고로 펼치며 위치를 옮겼다(돌아갈 자리를 restoreX/Y 에 기억)
    private int restoreX = 0, restoreY = 0, pillX = 0;
    private long curAlertAt = 0L, dismissedAlertAt = -1L;   // 경고 시각 · 알약으로 다시 접은 경고(같은 경고로는 다시 펼치지 않는다)
    // ★ 2026-10-16 (YJ: "오버레이가 접혀 있어도 추천이 뜨면 펴지면서 나와야 해"): 접힌 중에 새 추천(rcAt)이 오면 알약이 펼쳐져 추천 줄을 보여 준다. 사용자가 그 추천으로 다시 접으면 같은 추천으로는 다시 펼치지 않는다.
    private long dismissedRecoAt = -1L;
    private boolean preAlert = false;           // 웹: 최종 목적지 3정거장 전
    private PillView pillView;
    private View gapView;
    private int fullW = 0;
    private ValueAnimator pillBlinkAnim;

    private WindowManager wm;
    private WindowManager.LayoutParams lp;
    private LinearLayout root;
    private TextView t1, t2, t3;
    private boolean attached = false;

    // ★ 2026-10-11: 현재역과 다음역 사이 선이 이동 중이면 깜박인다(예전 화살표 -->를 대신한다. 무엇을 보여줄지·이동 중인지는 웹이 정하고, 여기서는 그리기·깜박임만 한다).
    private StripView stripView;
    private LinearLayout infoRow;               // ★ 남은시간 줄 + 오른쪽 '대기' 알약
    private WaitChip waitChip;
    private int rowWpx = 0;
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
        int wantH() { return dp(54); }   // ★ 2026-10-11 (YJ: 노선 라벨을 시각 왼쪽으로 옮겨 줄 하나를 줄여줘): 64dp → 54dp
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
            float yName = dp(2) + dp(11.5f);
            float yAx = dp(28);
            float yTime = dp(49);
            float lw = dp(3);
            for (int i = 0; i < n; i++) {
                Cell c = strip[i];
                float cx = (stripBase + i - scrollPos + 0.5f) * cw;
                if (cx + cw / 2f < 0f || cx - cw / 2f > getWidth()) continue;      // 화면 밖 칸은 그리지 않는다
                boolean here = (i == stripCur);
                // ★ 2026-10-13 (YJ: "역과 역사이가 깜빡이며 다음역으로 가는 중일때는 다음역 이름을 넣어야 헷갈리지 않을것같아"): 이동 중(선이 깜박이는 동안)엔
                //   가는 중인 다음 역 이름도 현위치처럼 진하게(글자색) 보여 준다 — 점·크기는 그대로라 '지금 있는 곳'은 여전히 파란 점이 가리킨다.
                boolean nextHi = moving && i == stripCur + 1 && c.n.length() > 0;
                int ink = (here || nextHi) ? thFg : thSub;
                // 정류장명(한 줄)
                text(cv, c.n, cx, yName, cw - dp(3), (here || nextHi) ? 11.5f : 10.5f, ink, true);
                // 선
                p.setStyle(Paint.Style.FILL);
                // ★ 2026-10-12 (YJ: 이동 중에만 역과 역 사이 선이 깜박이게): 깜박이는 선은 현재역→다음역 한 구간뿐이다(이 칸의 오른쪽 절반 + 다음 칸의 왼쪽 절반). 이 칸의 왼쪽(이전역→현재역)은 그대로 둔다.
                boolean blinkSeg = moving && !lit && (i == stripCur + 1 && c.hasL);
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
                // 시각 — 노선 라벨(75번 · 환승 · 출발 · 도착)은 시각 왼쪽에 붙여 한 줄로
                if (c.g.length() > 0) {
                    float maxRow = cw - dp(3);
                    float sc = getResources().getDisplayMetrics().scaledDensity;
                    tp.setTypeface(Typeface.DEFAULT_BOLD);
                    tp.setTextSize(9.5f * sc);
                    float tmW = c.t.length() > 0 ? tp.measureText(c.t) : 0f;
                    float gap = c.t.length() > 0 ? dp(3) : 0f;
                    float pad = c.pill ? dp(8) : 0f;
                    tp.setTextSize((c.pill ? 7f : 8f) * sc);
                    CharSequence e = TextUtils.ellipsize(c.g, tp, Math.max(dp(10), maxRow - tmW - gap - pad), TextUtils.TruncateAt.END);
                    float gW = tp.measureText(e, 0, e.length()) + pad;
                    float x0 = cx - (gW + gap + tmW) / 2f;
                    if (c.pill) {
                        rf.set(x0, yTime - dp(8.5f), x0 + gW, yTime + dp(2.5f));
                        p.setStyle(Paint.Style.FILL);
                        p.setColor(c.gc);
                        cv.drawRoundRect(rf, dp(4), dp(4), p);
                        tp.setColor(Color.WHITE);
                        tp.setTextAlign(Paint.Align.CENTER);
                        cv.drawText(e, 0, e.length(), x0 + gW / 2f, yTime, tp);
                    } else {
                        tp.setColor(c.gc);
                        tp.setTextAlign(Paint.Align.LEFT);
                        cv.drawText(e, 0, e.length(), x0, yTime, tp);
                    }
                    if (c.t.length() > 0) {
                        tp.setTextSize(9.5f * sc);
                        tp.setTypeface(Typeface.DEFAULT_BOLD);
                        tp.setColor(ink);
                        tp.setTextAlign(Paint.Align.LEFT);
                        cv.drawText(c.t, x0 + gW + gap, yTime, tp);
                    }
                    tp.setTextAlign(Paint.Align.CENTER);
                } else {
                    text(cv, c.t, cx, yTime, cw - dp(3), 9.5f, ink, true);
                }
            }
        }
    }


    /**
     * 오버레이 맨 아래 줄: 앱의 탑승 시트와 같은 상태를 그린다.
     *  hidden — 얇은 손잡이(쓸어 올리면 열림) · wait — '대기' 알약 · board — 탑승 안내 + [탑승] 버튼 · undo — '탑승으로 기록했어요' + [되돌리기]
     * 높이는 상태에 맞게 부드럽게 늘고 준다.
     */
    private class BoardView extends View {
        private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final TextPaint tp = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        private final RectF rf = new RectF();
        private final RectF btn = new RectF();
        private float h = -1f;
        private String shown = "";
        private ValueAnimator anim;
        BoardView(Context c) { super(c); }
        int targetH(String st) {
            if ("board".equals(st) || "undo".equals(st)) return dp(42);
            if ("wait".equals(st)) return 0;     // ★ 대기 알약은 남은시간 줄 오른쪽으로 옮겼다(줄 하나 절약)
            return dp(9);
        }
        void setState(String st) {
            if (st == null) st = "hidden";
            boolean first = h < 0f;
            if (!st.equals(shown) || first) {
                shown = st;
                final float to = targetH(st);
                if (anim != null) { anim.cancel(); anim = null; }
                if (first) { h = to; requestLayout(); }
                else {
                    final float from = h;
                    anim = ValueAnimator.ofFloat(0f, 1f);
                    anim.setDuration(240L);
                    anim.setInterpolator(new DecelerateInterpolator(1.8f));
                    anim.addUpdateListener(new ValueAnimator.AnimatorUpdateListener() {
                        @Override public void onAnimationUpdate(ValueAnimator an) {
                            h = from + (to - from) * (Float) an.getAnimatedValue();
                            requestLayout();
                        }
                    });
                    anim.start();
                }
            }
            invalidate();
        }
        void cancelAnim() { try { if (anim != null) anim.cancel(); } catch (Exception ignored) { } anim = null; }
        @Override protected void onMeasure(int wSpec, int hSpec) {
            setMeasuredDimension(MeasureSpec.getSize(wSpec), Math.round(Math.max(0f, h < 0f ? targetH("hidden") : h)));
        }
        /** 보이는 버튼(탑승 · 되돌리기)을 눌렀나 — 손가락 오차를 감안해 사방 8dp 넓게. */
        boolean hitBtn(float x, float y) {
            if (!("board".equals(shown) || "undo".equals(shown)) || btn.isEmpty()) return false;
            float m = dp(8);
            return x >= btn.left - m && x <= btn.right + m && y >= btn.top - m && y <= btn.bottom + m;
        }
        private float txt(Canvas cv, String s, float x, float y, float maxW, float sp, int color, boolean bold, Paint.Align al) {
            if (s == null || s.length() == 0) return 0f;
            tp.setTextSize(sp * getResources().getDisplayMetrics().scaledDensity);
            tp.setColor(color);
            tp.setTypeface(bold ? Typeface.DEFAULT_BOLD : Typeface.DEFAULT);
            tp.setTextAlign(al);
            CharSequence e = TextUtils.ellipsize(s, tp, Math.max(1f, maxW), TextUtils.TruncateAt.END);
            cv.drawText(e, 0, e.length(), x, y, tp);
            return tp.measureText(e, 0, e.length());
        }
        private float mw(String s, float sp, boolean bold) {
            tp.setTextSize(sp * getResources().getDisplayMetrics().scaledDensity);
            tp.setTypeface(bold ? Typeface.DEFAULT_BOLD : Typeface.DEFAULT);
            return tp.measureText(s == null ? "" : s);
        }
        @Override protected void onDraw(Canvas cv) {
            float w = getWidth();
            btn.setEmpty();
            if ("wait".equals(shown)) {
                return;
            } else if ("board".equals(shown) || "undo".equals(shown)) {
                boolean undo = "undo".equals(shown);
                float padL = dp(4), bw = dp(undo ? 84 : Math.max(70f, Math.min(104f, mw(rsBt, 14.5f, true) / getResources().getDisplayMetrics().density + 26f))), bh = dp(30);
                float bt = dp(5);
                btn.set(w - padL - bw, bt, w - padL, bt + bh);
                if (undo) {
                    p.setColor((0x33 << 24) | (thSub & 0x00FFFFFF));
                    cv.drawRoundRect(btn, bh / 2f, bh / 2f, p);
                    txt(cv, "되돌리기", btn.centerX(), btn.centerY() + dp(4.6f), bw - dp(8), 13f, thFg, true, Paint.Align.CENTER);
                    txt(cv, rsUm.length() > 0 ? rsUm : "탑승으로 기록했어요", padL, btn.centerY() + dp(4.6f), btn.left - padL - dp(8), 13f, thFg, true, Paint.Align.LEFT);
                    return;
                }
                p.setColor(0xFF0A84FF);
                cv.drawRoundRect(btn, bh / 2f, bh / 2f, p);
                txt(cv, rsBt, btn.centerX(), btn.centerY() + dp(5f), bw - dp(8), 14.5f, 0xFFFFFFFF, true, Paint.Align.CENTER);
                float maxL = btn.left - padL - dp(8);
                txt(cv, rsK, padL, dp(4) + dp(11), maxL, 11f, thSub, true, Paint.Align.LEFT);
                float cy0 = dp(4) + dp(16), ch = dp(17);
                float cw = Math.min(maxL * 0.55f, mw(rsCh, 10f, true) + dp(12));
                rf.set(padL, cy0, padL + cw, cy0 + ch);
                if (rsHasCbg) p.setColor(rsCbg); else p.setColor((0x29 << 24) | (rsCfg & 0x00FFFFFF));
                cv.drawRoundRect(rf, dp(5), dp(5), p);
                txt(cv, rsCh, padL + cw / 2f, cy0 + ch / 2f + dp(3.6f), cw - dp(6), 10f, rsCfg, true, Paint.Align.CENTER);
                String nm = rsNm;
                txt(cv, nm, padL + cw + dp(7), cy0 + ch / 2f + dp(4.4f), maxL - cw - dp(7), 13f, thFg, true, Paint.Align.LEFT);
                if (rsBar >= 0f) {
                    float by = dp(40), bx0 = padL, bx1 = w - padL;
                    rf.set(bx0, by, bx1, by + dp(2));
                    p.setColor((0x33 << 24) | (thSub & 0x00FFFFFF));
                    cv.drawRoundRect(rf, dp(1), dp(1), p);
                    rf.set(bx0, by, bx0 + (bx1 - bx0) * Math.max(0f, Math.min(1f, rsBar)), by + dp(2));
                    p.setColor(0xFF0A84FF);
                    cv.drawRoundRect(rf, dp(1), dp(1), p);
                }
            } else {
                // 손잡이: 위로 쓸어 올리면 탑승 안내가 나온다
                float gw = dp(28), gh = dp(3.5f);
                rf.set((w - gw) / 2f, dp(3), (w + gw) / 2f, dp(3) + gh);
                p.setColor((0x59 << 24) | (thSub & 0x00FFFFFF));
                cv.drawRoundRect(rf, gh / 2f, gh / 2f, p);
            }
        }
    }

    /** 맨 아래 추천 줄: 가게·상품 이름(굵게) · 지금 날씨·시간에 맞춘 추천 설명(최대 두 줄) · 거리/종류, 오른쪽(좁은 화면은 아래)에 [보기] [확인].
     *  ★ 2026-10-14 (YJ: "캐릭터가 좌우로 움직이게 — 랜덤 하나가 우측에서 광고를 쫙 당겨서 · 위아래로 잘리지 않게"):
     *  추천이 뜨면 캐릭터 하나(웹이 무작위로 정함)가 오른쪽 화면 밖에서 왼쪽으로 걸어(뛰어·날아·헤엄쳐) 들어오며 줄을 밧줄로 끌어당긴다.
     *  줄이 자리에 서면 캐릭터는 줄 쪽으로 돌아서서 천천히 움직인다. 캐릭터는 줄 옆 칸 전체를 쓰므로 위·아래·옆 어디도 잘리지 않는다.
     *  ★ 2026-10-14 (YJ: "광고판에 문구가 너무 없다 · 추천 음식/제품 설명 · 글자 키워줘"): 글자를 키우고(이름 16sp · 설명 13.5sp · 버튼 13sp) 설명을 두 줄까지 보인다.
     *  줄 높이는 글 양에 맞춰 달라진다. 가로가 좁아 글자 칸이 210dp 가 안 되면 버튼을 글 아래 줄로 내리고 거리·종류는 버튼 줄 왼쪽에 둔다.
     *  그림은 앱 자산(public/chars3d/*.webp, 3D 렌더링 동작 프레임)을 시간 순으로 그리고(왼쪽으로 갈 때는 좌우 반전), 여기서는 이동·반전만 계산한다.
     *  가게·상품 이름과 문구는 웹이 정해 넘긴 것을 그대로 쓴다. */
    private class RecoView extends View {
        private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint bp = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
        private final TextPaint tp = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        private final RectF rf = new RectF();
        private final android.graphics.Path rope = new android.graphics.Path();
        private final RectF go = new RectF(), ok = new RectF(), bus = new RectF();
        private long t0 = 0;
        private String key = "";
        private static final float PULL = 1.15f;            // 줄을 끌고 들어오는 시간(초)
        // 글 배치(너비·문구가 바뀔 때만 다시 계산한다)
        private String lkey = "";
        private boolean metaOwn = false;
        private float blkW = 0f;
        private static final float BLK_H_DP = 56f;       // 버튼 블록 높이(26 + 4 + 26)
        private float nameSp = 16f, goW = 0f, okW = 0f, busW = 0f, btnSp = 13f, barHdp = 0f, rowHdp = 70f, baseLast = 26f;
        private String[] desc = new String[0];
        RecoView(Context c) { super(c); }
        private int charW() { return dp(66); }              // 줄 왼쪽에 캐릭터가 서는 칸 너비
        /** 추천이 새로 뜨거나 다시 보이면 처음부터 끌어오기를 시작한다(같은 추천이 계속 보이는 중이면 이어서). */
        void begin(boolean wasVisible) {
            String k = rcAt + "|" + rcCh;
            if (!wasVisible || !k.equals(key)) {
                key = k; t0 = android.os.SystemClock.uptimeMillis();
                if (rcCh.length() == 0) rcCh = RC_CHARS[(int) Math.abs((rcAt / 1000L) % RC_CHARS.length)];   // 웹이 안 정했으면 추천 시각으로 고정 선택(재그림에도 안 바뀐다)
            }
            requestLayout();
        }
        /** 글자 크기·문구에 맞춰 줄 높이와 버튼 자리를 정한다(dp 단위로 계산해 두고 그릴 때 px 로 바꾼다). */
        private void layoutFor(float w) {
            String k = ((int) w) + "|" + rcA + "|" + rcB + "|" + rcM + "|" + rcGo + "|" + rcBus + "|" + rcEnd;
            if (k.equals(lkey)) return;
            lkey = k;
            float d = getResources().getDisplayMetrics().density;
            float barW = w - charW() - dp(2), padL = dp(12);
            // ★ 2026-10-16 (YJ: "버튼은 이쪽(오른쪽 위)으로 옮겨줘. 확장 길이가 너무 길어"): 버튼 셋을 글 아래 줄로 내리지 않고 오른쪽에 모아 둔다.
            //   1행 [맛집 보기][종료] · 2행 [주변버스 보기](가로 폭은 1행과 같게) — 높이가 글 두 줄과 비슷해 줄이 짧아진다.
            float gapB = dp(5);
            btnSp = 12.5f;
            while (true) {
                goW = Math.max(dp(52), mwb(rcGo, btnSp, true) + dp(16));
                busW = Math.max(dp(52), mwb(rcBus, btnSp, true) + dp(16));
                okW = Math.max(dp(40), mwb(rcEnd, btnSp, true) + dp(16));
                blkW = Math.max(goW + gapB + okW, busW);
                if (btnSp <= 11f || blkW <= barW * 0.46f) break;
                btnSp -= 0.5f;
            }
            float textW = barW - padL - blkW - dp(10) - dp(10) - dp(8);
            nameSp = fitSp(rcA, textW, 16f, 12f);
            desc = rcB.length() > 0 ? wrap(rcB, textW, 2, 13.5f) : new String[0];
            metaOwn = false;
            if (rcM.length() > 0) metaOwn = mwb(rcA, nameSp, true) + dp(10) + mwb(rcM, 12f, false) > textW;
            baseLast = 26f + (desc.length > 0 ? 19f + 18f * (desc.length - 1) : 0f);
            barHdp = Math.max(BLK_H_DP + 12f, baseLast + (metaOwn ? 17f : 0f) + 10f);
            rowHdp = Math.max(70f, barHdp + 4f);
        }
        @Override protected void onMeasure(int wSpec, int hSpec) {
            int w = MeasureSpec.getSize(wSpec);
            if (rcOn) layoutFor(w);
            setMeasuredDimension(w, dp(rowHdp));
        }
        /** 1 = [맛집 보기]류, 3 = [주변버스 보기], 2 = [종료], 0 = 버튼 밖(손가락 오차를 감안해 사방 6dp 넓게, 겹치면 손가락에 가까운 쪽). */
        int hit(float x, float y) {
            float m = dp(6);
            RectF[] rs = { go, bus, ok };
            int[] id = { 1, 3, 2 };
            int best = 0; float bd = Float.MAX_VALUE;
            for (int i = 0; i < 3; i++) {
                RectF r = rs[i];
                if (r.isEmpty()) continue;
                if (x >= r.left - m && x <= r.right + m && y >= r.top - m && y <= r.bottom + m) {
                    float d = Math.abs(x - r.centerX());
                    if (x >= r.left && x <= r.right) d = -1f;       // 버튼 안을 눌렀으면 그 버튼이 먼저
                    if (d < bd) { bd = d; best = id[i]; }
                }
            }
            return best;
        }
        private float txt(Canvas cv, String s, float x, float y, float maxW, float sp, int color, boolean bold, Paint.Align al) {
            if (s == null || s.length() == 0) return 0f;
            tp.setTextSize(sp * getResources().getDisplayMetrics().scaledDensity);
            tp.setColor(color);
            tp.setTypeface(bold ? Typeface.DEFAULT_BOLD : Typeface.DEFAULT);
            tp.setTextAlign(al);
            CharSequence e = TextUtils.ellipsize(s, tp, Math.max(1f, maxW), TextUtils.TruncateAt.END);
            cv.drawText(e, 0, e.length(), x, y, tp);
            return tp.measureText(e, 0, e.length());
        }
        private float mwb(String s, float sp, boolean bold) {
            tp.setTextSize(sp * getResources().getDisplayMetrics().scaledDensity);
            tp.setTypeface(bold ? Typeface.DEFAULT_BOLD : Typeface.DEFAULT);
            return tp.measureText(s == null ? "" : s);
        }
        /** 가게·상품 이름: 칸에 들어가도록 글자를 from → to sp 까지 줄여 보고, 그래도 길면 끝을 '…' 로 자른다. */
        private float fitSp(String s, float maxW, float from, float to) {
            float sp = from;
            while (sp > to && mwb(s, sp, true) > maxW) sp -= 0.5f;
            return sp;
        }
        /** 설명 문구를 칸 너비에 맞춰 최대 maxLines 줄로 나눈다(띄어쓰기에서 끊고, 마지막 줄이 넘치면 '…'). */
        private String[] wrap(String s, float maxW, int maxLines, float sp) {
            java.util.ArrayList<String> out = new java.util.ArrayList<String>();
            tp.setTextSize(sp * getResources().getDisplayMetrics().scaledDensity);
            tp.setTypeface(Typeface.DEFAULT);
            String rest = s == null ? "" : s.trim();
            while (rest.length() > 0 && out.size() < maxLines) {
                if (out.size() == maxLines - 1) { out.add(TextUtils.ellipsize(rest, tp, Math.max(1f, maxW), TextUtils.TruncateAt.END).toString()); break; }
                int n = tp.breakText(rest, true, maxW, null);
                if (n >= rest.length()) { out.add(rest); break; }
                if (n < 1) n = 1;
                int cut = n, sp2 = rest.lastIndexOf(' ', n);
                if (sp2 >= n / 2) cut = sp2;
                out.add(rest.substring(0, cut).trim());
                rest = rest.substring(cut).trim();
            }
            return out.toArray(new String[0]);
        }
        /** 3D 동작 시트. 지금 쓰는 캐릭터 말고는 메모리에서 내린다(시트 하나가 약 4MB). */
        private Bitmap sheet(String id) {
            if (id == null || id.length() == 0) return null;
            Bitmap c = rcSheet.get(id);
            if (c != null) return c;
            long now = android.os.SystemClock.uptimeMillis();
            Long fa = rcSheetFail.get(id);
            if (fa != null && now - fa < 1500L) return null;      // 읽기가 어긋났으면 1.5초 뒤 다시 읽는다(옛 한 장 그림으로 그리지 않는다)
            java.util.Iterator<java.util.Map.Entry<String, Bitmap>> it = rcSheet.entrySet().iterator();
            while (it.hasNext()) { String k = it.next().getKey(); if (!k.equals(rcCh)) it.remove(); }
            Bitmap b = null;
            try {
                java.io.InputStream in = getContext().getAssets().open("public/chars3d/" + id + ".webp");
                try { b = android.graphics.BitmapFactory.decodeStream(in); } finally { in.close(); }
            } catch (Exception ignored) { }
            if (b != null && (b.getWidth() < 1024 || b.getHeight() < 1024)) b = null;
            if (b == null) { rcSheetFail.put(id, now); return null; }
            rcSheetFail.remove(id);
            rcSheet.put(id, b);
            return b;
        }
        private final android.graphics.Rect rSrc = new android.graphics.Rect();
        private final RectF rDst = new RectF();
        /** {칸 안 머리 위 끝, 발(바닥) 높이, 몸 가로 중심, 초당 프레임, 띄울 높이(dp — 날거나 헤엄치는 캐릭터)} — 시트를 만들 때의 값(앱 로딩의 D3 와 같다). */
        private float[] cfg3(String id) {
            if ("dolsom".equals(id)) return new float[] { 8f, 248.5f, 120.8f, 19f, 0f };
            if ("lovel".equals(id)) return new float[] { 8f, 250f, 117.9f, 11f, 0f };
            if ("ppopu".equals(id)) return new float[] { 8f, 248.5f, 120.3f, 19f, 0f };
            if ("chaeng".equals(id)) return new float[] { 14f, 244.5f, 154.5f, 15f, 6f };
            if ("sul".equals(id)) return new float[] { 27f, 230.5f, 131f, 20f, 16f };
            return new float[] { 15f, 222.5f, 128f, 13f, 0f };
        }
        /** 몸 높이(dp): 날거나 헤엄치는 캐릭터는 띄운 높이까지 더해도 칸(줄 최소 높이 70 − 4)을 넘지 않게 작게 잡는다. */
        private float bodyDp(String id) {
            if ("sul".equals(id)) return 44f;
            if ("chaeng".equals(id)) return 52f;
            return 58f;
        }
        /** face: +1 오른쪽을 봄 · −1 왼쪽을 봄(시트는 오른쪽을 보고 있어 반전해 그린다). lean: 앞으로 기울임(도). ph: 동작 시계(초). */
        private void drawChar3d(Canvas cv, Bitmap sh, String id, float cx, float baseY, int face, float lean, float ph) {
            float[] c = cfg3(id);
            float sc = dp(bodyDp(id)) / (c[1] - c[0]);
            int idx = ((int) (Math.max(0f, ph) * c[3])) % 16;
            int sx = (idx % 4) * 256, sy = (idx / 4) * 256;
            rSrc.set(sx, sy, sx + 256, sy + 256);
            float footY = baseY - dp(c[4]);
            float left = cx - c[2] * sc, topY = footY - c[1] * sc;
            rDst.set(left, topY, left + 256f * sc, topY + 256f * sc);
            cv.save();
            if (lean != 0f) cv.rotate(lean, cx, footY);
            if (face < 0) cv.scale(-1f, 1f, cx, footY);
            cv.drawBitmap(sh, rSrc, rDst, bp);
            cv.restore();
        }
        @Override protected void onDraw(Canvas cv) {
            float w = getWidth(), h = getHeight();
            go.setEmpty(); ok.setEmpty(); bus.setEmpty();
            if (!rcOn) return;
            layoutFor(w);
            float t = t0 == 0 ? 9f : (android.os.SystemClock.uptimeMillis() - t0) / 1000f;
            float u = Math.min(1f, t / PULL);
            float e = 0.45f * u + 0.55f * (1f - (1f - u) * (1f - u) * (1f - u));     // 처음부터 바로 걷다가 끝에서 서서히 멈춘다
            float ox = (1f - e) * w;                                                   // 캐릭터와 줄이 함께 오른쪽 밖에서 들어온다
            boolean arrived = t >= PULL;
            float cw = charW();
            float cx = ox + cw / 2f;
            float baseY = h - dp(4);
            float barB = h - dp(2), barT = barB - dp(barHdp);
            float barL = ox + cw, barR = ox + w - dp(2);
            float midY = (barT + barB) / 2f;
            if (barL < w) {
                p.setStyle(Paint.Style.FILL);
                rf.set(barL, barT, barR, barB);
                p.setColor(thBg);
                cv.drawRoundRect(rf, dp(14), dp(14), p);
                p.setColor((0x1A << 24) | (thSub & 0x00FFFFFF));
                cv.drawRoundRect(rf, dp(14), dp(14), p);
                float bh = dp(26), vg = dp(4), edge = dp(10), gap = dp(5);
                float tx = barL + dp(12);
                float nameBase = barT + dp(26), lastBase = barT + dp(baseLast);
                // 버튼 블록: 줄의 오른쪽 가운데. 1행 [맛집 보기][종료], 2행 [주변버스 보기]
                float blkR = barR - edge, blkL = blkR - blkW;
                float blkT = midY - (bh * 2f + vg) / 2f;
                ok.set(blkR - okW, blkT, blkR, blkT + bh);
                go.set(blkL, blkT, ok.left - gap, blkT + bh);
                bus.set(blkL, blkT + bh + vg, blkR, blkT + bh * 2f + vg);
                float textW = blkL - tx - dp(8);
                // 이름(굵게) + 같은 줄에 거리·종류(자리가 있을 때)
                float nw = txt(cv, rcA, tx, nameBase, textW, nameSp, thFg, true, Paint.Align.LEFT);
                if (rcM.length() > 0 && !metaOwn) txt(cv, rcM, tx + nw + dp(10), nameBase, textW - nw - dp(10), 12f, thSub, false, Paint.Align.LEFT);
                for (int i = 0; i < desc.length; i++) txt(cv, desc[i], tx, nameBase + dp(19) + dp(18) * i, textW, 13.5f, thFg, false, Paint.Align.LEFT);
                if (metaOwn) txt(cv, rcM, tx, lastBase + dp(17), textW, 12f, thSub, false, Paint.Align.LEFT);
                p.setColor(0xFF0A84FF);
                cv.drawRoundRect(go, bh / 2f, bh / 2f, p);
                txt(cv, rcGo, go.centerX(), go.centerY() + dp(4.4f), go.width() - dp(6), btnSp, 0xFFFFFFFF, true, Paint.Align.CENTER);
                p.setColor((0x26 << 24) | 0x000A84FF);                                  // [주변버스 보기]: 옅은 파랑 바탕에 파란 글씨
                cv.drawRoundRect(bus, bh / 2f, bh / 2f, p);
                txt(cv, rcBus, bus.centerX(), bus.centerY() + dp(4.4f), bus.width() - dp(6), btnSp, 0xFF0A84FF, true, Paint.Align.CENTER);
                p.setColor((0x33 << 24) | (thSub & 0x00FFFFFF));
                cv.drawRoundRect(ok, bh / 2f, bh / 2f, p);
                txt(cv, rcEnd, ok.centerX(), ok.centerY() + dp(4.4f), ok.width() - dp(6), btnSp, thFg, true, Paint.Align.CENTER);
                // 밧줄: 캐릭터 몸에서 줄 왼쪽 가운데로(줄이 끌려오는 동안은 팽팽, 선 뒤에는 느슨하게 처진다)
                float ry0 = baseY - dp(19), ry1 = barB - dp(Math.min(barHdp / 2f, 34f)), rx0 = cx + dp(9), rx1 = barL + dp(1);
                p.setStyle(Paint.Style.STROKE);
                p.setStrokeWidth(dp(2f));
                p.setStrokeCap(Paint.Cap.ROUND);
                p.setColor((0xAA << 24) | (thSub & 0x00FFFFFF));
                float sag = arrived ? dp(3f) : 0f;
                rope.reset();
                rope.moveTo(rx0, ry0);
                rope.quadTo((rx0 + rx1) / 2f, (ry0 + ry1) / 2f + sag, rx1, ry1);
                cv.drawPath(rope, p);
                p.setStyle(Paint.Style.FILL);
            }
            Bitmap sh3 = sheet(rcCh);
            if (sh3 != null) {
                float ph = arrived ? PULL + (t - PULL) * 0.6f : t;                       // 선 뒤에는 동작을 천천히
                boolean turned = t >= PULL + 0.3f;                                       // 줄을 다 끌어온 뒤 줄 쪽으로 돌아선다
                float lean = arrived ? 0f : -5f * (1f - u * 0.6f);                       // 끌 때는 왼쪽으로 몸을 숙인다
                drawChar3d(cv, sh3, rcCh, cx, baseY, turned ? 1 : -1, turned ? 0f : lean, ph);
            }
            // 끌어오는 동안은 부드럽게(화면 주기), 선 뒤에는 동작을 위해 약 30프레임/초로 다시 그린다
            if (!arrived) postOnAnimation(new Runnable() { @Override public void run() { invalidate(); } });
            else postInvalidateDelayed(33);
        }
    }

    /** 남은시간 줄 오른쪽에 붙는 '● 대기 · 75번' 알약(앱 탑승 시트의 대기 상태와 같은 뜻). */
    private class WaitChip extends View {
        private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final TextPaint tp = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        private final RectF rf = new RectF();
        private String s = "";
        private float tw = 0f;
        WaitChip(Context c) { super(c); }
        void setLabel(String label, int maxW) {
            String t = "대기 · " + (label == null ? "" : label);
            tp.setTextSize(10f * getResources().getDisplayMetrics().scaledDensity);
            tp.setTypeface(Typeface.DEFAULT_BOLD);
            CharSequence e = TextUtils.ellipsize(t, tp, Math.max(dp(24), maxW - dp(24)), TextUtils.TruncateAt.END);
            String ns = e.toString();
            if (!ns.equals(s)) { s = ns; tw = tp.measureText(s); requestLayout(); }
            invalidate();
        }
        int wantW() { return Math.round(tw + dp(24)); }
        @Override protected void onMeasure(int wSpec, int hSpec) { setMeasuredDimension(wantW(), dp(16)); }
        @Override protected void onDraw(Canvas cv) {
            float ph = getHeight();
            rf.set(0, 0, getWidth(), ph);
            p.setStyle(Paint.Style.FILL);
            p.setColor((0x2A << 24) | (thSub & 0x00FFFFFF));
            cv.drawRoundRect(rf, ph / 2f, ph / 2f, p);
            p.setColor(0xFFF0A500);
            cv.drawCircle(dp(9), ph / 2f, dp(3), p);
            tp.setTextSize(10f * getResources().getDisplayMetrics().scaledDensity);
            tp.setTypeface(Typeface.DEFAULT_BOLD);
            tp.setColor(thFg);
            tp.setTextAlign(Paint.Align.LEFT);
            cv.drawText(s, dp(16), ph / 2f + dp(3.6f), tp);
        }
    }

    /**
     * ★ 2026-10-12: 알약 모드의 한 줄 — 현재 상황(대기 · 현위치 ▸ 다음역)만 보여준다. 점 색: 대기·정차=주황, 이동 중=파랑.
     */
    private class PillView extends View {
        private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final TextPaint tp = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        private String s = "";
        private float tw = 0f;
        PillView(Context c) { super(c); }
        void setLabel(String label) {
            String t = label == null ? "" : label;
            tp.setTextSize(12f * getResources().getDisplayMetrics().scaledDensity);
            tp.setTypeface(Typeface.DEFAULT_BOLD);
            int maxW = Math.max(dp(80), Math.round(realMetrics().widthPixels * 0.72f) - dp(36));
            String ns = TextUtils.ellipsize(t, tp, maxW, TextUtils.TruncateAt.END).toString();
            if (!ns.equals(s)) { s = ns; tw = tp.measureText(s); requestLayout(); }
            invalidate();
        }
        @Override protected void onMeasure(int wSpec, int hSpec) { setMeasuredDimension(Math.round(tw + dp(30)), dp(24)); }
        @Override protected void onDraw(Canvas cv) {
            float ph = getHeight();
            boolean wt = "wait".equals(rsSt) || "board".equals(rsSt);
            p.setStyle(Paint.Style.FILL);
            p.setColor(moving && !wt ? 0xFF0A84FF : 0xFFF0A500);
            cv.drawCircle(dp(10), ph / 2f, dp(4), p);
            tp.setTextSize(12f * getResources().getDisplayMetrics().scaledDensity);
            tp.setTypeface(Typeface.DEFAULT_BOLD);
            tp.setColor(thFg);
            tp.setTextAlign(Paint.Align.LEFT);
            cv.drawText(s, dp(20), ph / 2f + dp(4.2f), tp);
        }
    }

    /** 알약에 보여줄 한 줄 — 대기 중이면 '대기 · 탈 것', 탄 뒤에는 '현위치 · 도착시각 도착'. */
    private String pillText() {
        try {
            if ("wait".equals(rsSt) || "board".equals(rsSt)) {
                String lab = rsCh.length() > 0 ? rsCh : rsNm;
                return lab.length() > 0 ? "대기 · " + lab : "대기";
            }
        } catch (Exception ignored) { }
        // ★ 2026-10-12 (YJ: "승차 확정 후에는 현위치와 도착예정시간만"): 탄 뒤에는 '현위치 · 10:06 도착' (웹이 만든 남은시간 줄에서 도착 시각만 뽑는다)
        String cur = line1;
        int sp = cur.indexOf(" ▸ ");
        if (sp > 0) cur = cur.substring(0, sp);
        if (cur.startsWith("● ")) cur = cur.substring(2);
        cur = cur.trim();
        if (pillCur.length() > 0) cur = pillCur;      // 이동 중: '다음역(이동중)' — 문구는 웹이 엔진 값으로 정해 보낸다
        if (cur.length() == 0 && strip.length > 0) cur = strip[Math.max(0, Math.min(stripCur, strip.length - 1))].n;
        String arr = "";
        try {
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("(\\d{1,2}:\\d{2})\\s*도착").matcher(line2);
            if (m.find()) arr = m.group(1);
        } catch (Exception ignored) { }
        if (cur.length() == 0) return arr.length() > 0 ? arr + " 도착" : "";
        return arr.length() > 0 ? cur + " · " + arr + " 도착" : cur;
    }

    /** 웹에 손짓을 알린다(웹이 앱 탑승 시트와 똑같이 처리하고 새 상태를 다시 보내 준다). */
    private void act(String a) {
        if (hosted) { actHosted(a); return; }
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                try { getBridge().getWebView().resumeTimers(); } catch (Exception ignored) { }
                getBridge().getWebView().evaluateJavascript(
                        "try{window._ovlAct&&window._ovlAct('" + a + "');}catch(e){}", null);
            }
        } catch (Exception ignored) { }
    }

    /**
     * ★ 2026-10-16 (YJ: "종료는 앱 종료로 정확히 해줘. 도착 거의 전이니까 앱 종료해도 상관없을 거야"): 광고의 [종료] = 앱 완전 종료.
     * 웹이 살아 있으면 먼저 알려 추천을 닫고 스스로 정리하게 한 뒤(recoEnd), 웹 없이도 되도록 여기서 직접 끝낸다 —
     * 대기 서비스 중지 · 화면 켜 둠 해제 · 오버레이 내림 · 알림 모두 지움 · 화면(액티비티)을 최근 앱 목록에서도 지움.
     * ★ 프로세스는 남겨 둔다(YJ: "앱 종료 전 시계 위젯은 살려둬야 동물들이 돌아다니지") — 위젯 동물 애니메이션이 이 프로세스의 핸들러로 돈다.
     */
    private void quitApp() {
        try { act("recoEnd"); } catch (Throwable ignored) { }
        main.postDelayed(new Runnable() { @Override public void run() { finishQuit(); } }, 350L);
    }

    private void finishQuit() {
        journeyOn = false; wanted = false;
        try { KeepAliveService.send(getContext(), KeepAliveService.ACT_STOP); } catch (Throwable ignored) { }
        stopKeepSvc();
        try { if (cpuLock != null && cpuLock.isHeld()) cpuLock.release(); } catch (Throwable ignored) { }
        try { detach(); } catch (Throwable ignored) { }
        try {
            android.app.NotificationManager nm = (android.app.NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancelAll();
        } catch (Throwable ignored) { }
        try { Activity a = getActivity(); if (a != null) { if (Build.VERSION.SDK_INT >= 21) a.finishAndRemoveTask(); else a.finish(); } } catch (Throwable ignored) { }
        try { WidgetCore.onAppLeft(getContext()); } catch (Throwable ignored) { }      // 화면이 닫혔으니 시계 위젯 동물들을 바로 깨운다
        // ★ 프로세스는 죽이지 않는다 — 홈 화면 시계 위젯(동물들이 돌아다님)은 앱과 같은 프로세스에서 움직인다(WidgetCore). 화면·서비스·오버레이만 끝낸다.
    }

    /** 대기 모드(웹이 없다)에서의 손짓: 알약·손잡이는 앱 열기, [안내 종료]는 서비스 종료. 그 밖(탑승·되돌리기·추천)은 웹이 있어야 하는 일이라 하지 않는다. */
    private void actHosted(String a) {
        try {
            if ("press".equals(a) && "board".equals(rsSt)) { KeepAliveService.send(getContext(), KeepAliveService.ACT_STOP); return; }
            if ("open".equals(a) || "pill".equals(a)) openApp();
        } catch (Throwable ignored) { }
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
        if (demoActive()) { call.resolve(new JSObject().put("ok", true).put("shown", attached).put("demo", true)); return; }   // 시연 중에는 웹 값으로 덮지 않는다
        if (hosted) { call.resolve(new JSObject().put("ok", true).put("shown", attached).put("hosted", true)); return; }      // 대기 모드가 오버레이를 쥐고 있다 — 낡은 웹 값으로 덮지 않는다
        applyUpdate(call.getData());
        call.resolve(new JSObject().put("ok", true).put("shown", attached));
    }

    /**
     * 오버레이에 그릴 값을 받아 반영한다. 웹의 update() 와 대기 모드(KeepAliveService 가 엔진 답의 overlay 를 넘김)가 같은 모양의 값을 쓴다.
     * ★ 2026-10-13 (YJ: "카카오 방식 — 앱이 사라져도 네이티브가 안내를 그린다"): 무엇을 그릴지는 웹(또는 엔진)이 정하고 여기서는 그리기만 한다.
     */
    private void applyUpdate(JSONObject o) {
        wanted = o.optBoolean("active", false);
        line1 = nz(o.optString("line1", ""));
        pillCur = nz(o.optString("pill", ""));
        try {
            org.json.JSONArray arr = o.optJSONArray("cells");
            int n = arr == null ? 0 : Math.min(arr.length(), 150);    // ★ 2026-10-12: 긴 경로가 중간에 끊기지 않게 60 → 150
            Cell[] cs = new Cell[n];
            for (int i = 0; i < n; i++) {
                JSONObject co = arr.getJSONObject(i);
                Cell c = new Cell();
                c.n = co.optString("n", ""); c.t = co.optString("t", ""); c.g = co.optString("g", "");
                c.pill = co.optBoolean("gp", false);
                c.gc = col(co.optString("gc", ""), 0xFF8E8E93);
                String l = co.optString("lc", ""), r = co.optString("rc", "");
                c.hasL = l.length() > 0; c.hasR = r.length() > 0;
                c.lc = col(l, 0xFF8E8E93); c.rc = col(r, 0xFF8E8E93);
                c.dc = col(co.optString("dc", ""), 0xFF0A84FF);
                c.dk = co.optInt("dk", 1);
                cs[i] = c;
            }
            strip = cs;
        } catch (Exception e) { strip = new Cell[0]; }
        stripCur = Math.max(0, Math.min(o.optInt("cur", 0), Math.max(0, strip.length - 1)));
        stripBase = Math.max(0, o.optInt("base", 0));
        try {
            JSONObject th = o.optJSONObject("theme");
            if (th != null) {
                thBg = col(th.optString("bg", ""), Color.WHITE);
                thFg = col(th.optString("fg", ""), Color.parseColor("#111114"));
                thSub = col(th.optString("sub", ""), Color.parseColor("#8E8E93"));
            }
        } catch (Exception ignored) { }
        try {
            JSONObject rs = o.optJSONObject("rs");
            if (rs != null) {
                rsSt = rs.optString("st", "hidden");
                rsK = rs.optString("k", ""); rsCh = rs.optString("ch", ""); rsNm = rs.optString("nm", ""); rsUm = rs.optString("um", ""); rsBt = rs.optString("bt", "탑승"); if (rsBt.length() == 0) rsBt = "탑승";
                String cb = rs.optString("cbg", "");
                rsHasCbg = cb.length() > 0; rsCbg = col(cb, 0xFF0A84FF);
                rsCfg = col(rs.optString("cfg", ""), 0xFF0A84FF);
                rsBar = (float) rs.optDouble("bar", -1);
            } else { rsSt = "hidden"; }
        } catch (Exception e) { rsSt = "hidden"; }
        try {
            JSONObject rc = o.optJSONObject("reco");
            if (rc != null && rc.optBoolean("on", false)) {
                rcOn = true; rcA = rc.optString("a", ""); rcB = rc.optString("b", ""); rcM = rc.optString("m", ""); rcGo = rc.optString("go", "보기");
                if (rcGo.length() == 0) rcGo = "보기";
                rcBus = rc.optString("bus", ""); if (rcBus.length() == 0) rcBus = "주변버스 보기";
                rcEnd = rc.optString("end", ""); if (rcEnd.length() == 0) rcEnd = "종료";
                if (rcA.length() == 0) rcOn = false;
                rcAt = (long) rc.optDouble("at", 0);
                rcCh = rc.optString("ch", ""); rcCh2 = rc.optString("ch2", "");
            } else { rcOn = false; }
        } catch (Exception e) { rcOn = false; }
        moving = o.optBoolean("moving", false);
        preAlert = o.optBoolean("pre", false);
        int al = o.optInt("alert", 0);
        alertLevel = Math.max(0, Math.min(2, al));
        // ★ 2026-10-12 (YJ: "환승 1정거장 전·목적지 2·1정거장 전 — 엣지 하이라이트와 진동"): 테두리와 같은 순간에 진동한다.
        //   판단은 웹이 한다(alertAt = 단계가 켜지거나 바뀐 시각, alertVibe = 설정에서 진동이 허용됐는지). 여기선 새 경고일 때 한 번만 울린다.
        try {
            long alertAt = o.optLong("alertAt", 0L);
            curAlertAt = alertAt;
            boolean alertVibe = o.optBoolean("alertVibe", false);
            if (alertLevel > 0 && alertVibe && alertAt > 0L && alertAt != lastVibeAt
                    && System.currentTimeMillis() - alertAt < 20000L) {
                lastVibeAt = alertAt;
                vibrateAlert(alertLevel);
            }
        } catch (Exception ignored) { }
        line2 = nz(o.optString("line2", ""));
        line3 = nz(o.optString("line3", ""));
        lastUpdateAt = System.currentTimeMillis();
        refresh();
    }

    /**
     * 설정 [캐릭터 미리보기]: 도착 전 추천 줄과 캐릭터 둘이 나와 움직이는 모습을 secs 초(기본 14) 동안 보여 준다.
     * 앱이 화면에 있어도 뜬다(시스템 오버레이). 시연 중 다시 부르면 새 캐릭터 둘로 처음부터 다시 보여 주고, 끝나거나 아무 데나 누르면 시연 전 상태로 돌아간다.
     * 권한이 없으면 ok=false, error=permission.
     */
    @PluginMethod
    public void recoDemo(final PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || !canDraw()) {
            call.resolve(new JSObject().put("ok", false).put("error", "permission"));
            return;
        }
        final long now = System.currentTimeMillis();
        final int secs = Math.max(4, Math.min(40, call.getInt("secs", 14)));
        if (!demoSaved) {
            sWanted = wanted; sStrip = strip; sStripCur = stripCur; sStripBase = stripBase;
            sLine1 = line1; sLine2 = line2; sLine3 = line3; sRsSt = rsSt; sMoving = moving;
            sRcOn = rcOn; sRcA = rcA; sRcB = rcB; sRcM = rcM; sRcGo = rcGo; sRcCh = rcCh; sRcCh2 = rcCh2; sRcAt = rcAt;
            demoSaved = true;
        }
        Cell c0 = new Cell(); c0.n = "지나간 곳"; c0.dk = 1; c0.hasR = true;
        Cell c1 = new Cell(); c1.n = "미리보기"; c1.dk = 2; c1.hasL = true; c1.hasR = true;
        Cell c2 = new Cell(); c2.n = "다음 정거장"; c2.dk = 1; c2.hasL = true;
        strip = new Cell[] { c0, c1, c2 }; stripCur = 1; stripBase = 0;
        line1 = ""; line2 = "추천 캐릭터 미리보기 · 실제 알림이 아니에요"; line3 = ""; rsSt = "hidden"; moving = false;
        rcOn = true;
        rcA = nz(call.getString("a")); if (rcA.length() == 0) rcA = "곧 도착해요 · 커피 한 잔 어때요?";
        rcB = nz(call.getString("b")); rcM = nz(call.getString("m")); rcGo = nz(call.getString("go")); if (rcGo.length() == 0) rcGo = "보기";
        rcCh = nz(call.getString("ch")); rcCh2 = nz(call.getString("ch2"));
        rcAt = now;                       // 새 추천으로 보여 처음부터 확장·등장을 다시 시작한다
        wanted = true; lastUpdateAt = now; demoUntil = now + secs * 1000L;
        refresh();
        main.removeCallbacks(demoEnd);
        main.postDelayed(demoEnd, secs * 1000L + 150L);
        call.resolve(new JSObject().put("ok", true).put("shown", attached));
    }

    private final Runnable demoEnd = new Runnable() {
        @Override public void run() { if (!demoActive()) endDemo(); }
    };

    /** 시연을 끝내고 시연 전 값으로 되돌린다(웹의 다음 update 가 곧 최신 값으로 덮는다). */
    private void endDemo() {
        demoUntil = 0L;
        main.removeCallbacks(demoEnd);
        if (!demoSaved) return;
        demoSaved = false;
        wanted = sWanted; strip = sStrip == null ? new Cell[0] : sStrip; stripCur = sStripCur; stripBase = sStripBase;
        line1 = sLine1; line2 = sLine2; line3 = sLine3; rsSt = sRsSt; moving = sMoving;
        rcOn = sRcOn; rcA = sRcA; rcB = sRcB; rcM = sRcM; rcGo = sRcGo; rcCh = sRcCh; rcCh2 = sRcCh2; rcAt = sRcAt;
        refresh();
    }

    /**
     * ★ 2026-10-01 (YJ: "하차 전 추천 알림이 안 온다"): 앱이 가려지면 웹뷰 타이머가 멈춰 '하차 10분 전' 감시도 같이 멈춘다.
     * 확정한 여정이 진행되는 동안(오버레이를 쓰든 안 쓰든) 네이티브가 5초마다 웹을 깨우도록 웹이 켜고 끈다.
     * 웹이 60초마다 다시 켜 주지 않으면(10분) 스스로 멈춘다.
     */
    /**
     * ★ 2026-10-13 (YJ: "카카오지하철처럼 안내 로직을 네이티브로"): 웹이 '여정 상태'를 네이티브에 맡겨 둔다(대기 모드용). 웹뷰가 사라지면 KeepAliveService 가 이 상태로 엔진을 불러 안내를 이어간다.
     */
    @PluginMethod
    public void standbyPacket(PluginCall call) {
        String st = call.getString("state"), url = call.getString("url");
        if (st != null && url != null && url.startsWith("https://")) KeepAliveService.savePacket(getContext(), st, url);
        call.resolve(new JSObject().put("ok", true));
    }

    /** 다시 열린 앱이 묻는다: 대기 모드(앱이 닫힌 동안 네이티브가 이어 온 안내)가 아직 돌고 있나, 엔진이 마지막으로 만든 문구는 무엇인가. */
    @PluginMethod
    public void standbyStatus(PluginCall call) {
        try { call.resolve(new JSObject(KeepAliveService.standbyViewJson(getContext()))); }
        catch (Exception e) { call.resolve(new JSObject().put("active", false)); }
    }

    /** 여정이 끝나거나 취소됐다 — 맡겨 둔 상태를 지우고, 대기 모드가 돌고 있으면 끝낸다. */
    @PluginMethod
    public void standbyEnd(PluginCall call) {
        KeepAliveService.clearPacket(getContext());
        if (KeepAliveService.standbyActive) { stopKeepSvc(); }
        call.resolve(new JSObject().put("ok", true));
    }

    @PluginMethod
    public void keepAlive(PluginCall call) {
        // 대기 모드가 돌고 있는 동안(앱을 밀어 닫았다가 다시 열었다) 새로 뜬 웹이 '여정 없음'(off)을 보내도 끄지 않는다. 끝내는 길은 standbyEnd · 알림의 [안내 종료] · 엔진의 done.
        if (KeepAliveService.standbyActive) {
            if (call.getBoolean("on", false)) { if (hosted) releaseHosted(); KeepAliveService.send(getContext(), KeepAliveService.ACT_DEACTIVATE); }   // 웹이 여정을 다시 쥐었다 — 주도권을 돌려준다(쥐고 있던 오버레이 창도 웹에 돌려준다)
            else { call.resolve(new JSObject().put("ok", true).put("standby", true)); return; }
        }
        journeyOn = call.getBoolean("on", false);
        if (journeyOn) journeyAt = System.currentTimeMillis();
        main.post(new Runnable() { @Override public void run() { if (journeyOn) { startTicker(); startKeepSvc(); } else stopKeepSvc(); } });
        call.resolve(new JSObject().put("ok", true));
    }

    // ── 앱이 화면에서 사라지면 뜨고, 돌아오면 사라진다 ─────────────

    @Override
    protected void handleOnStop() {
        appVisible = false;
        refresh();
        // ★ 2026-10-13 (YJ: "오버레이가 업데이트가 안되는것같아" — 앱을 뒤로 보냈더니 오버레이가 앱보다 한 역 전을 가리켰다):
        //   오버레이는 사라지기 직전 웹이 보낸 마지막 값으로 먼저 뜨고, 최신 값은 최대 5초 뒤 틱에서야 들어왔다 → 가려지는 즉시(0.3초·1.5초 뒤 한 번 더) 웹을 깨워 새 값을 받는다.
        wakeWebSoon(300L);
        wakeWebSoon(1500L);
    }

    private void wakeWebSoon(long delayMs) {
        main.postDelayed(new Runnable() {
            @Override public void run() {
                try {
                    if (appVisible || getBridge() == null || getBridge().getWebView() == null) return;
                    try { getBridge().getWebView().resumeTimers(); } catch (Exception ignored1) { }
                    try { getBridge().getWebView().onResume(); } catch (Exception ignored2) { }
                    getBridge().getWebView().evaluateJavascript(
                            "(function(){try{return !!(window._ovlNativeTick&&window._ovlNativeTick(" + bgServiceState() + "));}catch(e){return false;}})()",
                            new android.webkit.ValueCallback<String>() {
                                @Override public void onReceiveValue(String v) {
                                    webAliveAt = System.currentTimeMillis();
                                    if ("true".equals(v)) { journeyAt = webAliveAt; }
                                }
                            });
                } catch (Exception ignored) { }
            }
        }, delayMs);
    }

    @Override
    protected void handleOnStart() {
        appVisible = true;
        refresh();
    }

    @Override
    protected void handleOnDestroy() {
        // ★ 2026-10-13: 앱을 밀어 닫아 액티비티가 사라져도 여정 중이고 맡겨 둔 상태가 있으면 서비스를 끄지 않고 대기 모드로 넘긴다(KeepAliveService 가 엔진을 불러 이어간다).
        //   이때 오버레이 창도 내리지 않는다 — 이 인스턴스가 hosted 로 쥐고, 엔진이 준 값을 standbyPush 로 받아 그린다(오버레이를 쓰던 경우만).
        boolean handOver = (journeyOn || hosted) && KeepAliveService.hasPacket(getContext());   // hosted: 앱을 다시 열었다가 또 밀어 닫아도 대기 모드를 이어 간다
        boolean wasWanted = hosted ? hostedOk : wanted;
        journeyOn = false;
        try { if (cpuLock != null && cpuLock.isHeld()) cpuLock.release(); } catch (Exception ignoredR2) { }
        main.removeCallbacks(ticker);
        ticking = false;
        if (handOver) {
            hostedOk = wasWanted;
            hosted = true;
            appVisible = false;     // 오버레이는 앱이 안 보일 때 뜨는 것 — 액티비티가 없으니 늘 '안 보임'
            KeepAliveService.send(getContext(), KeepAliveService.ACT_ACTIVATE);
            if (!hostedOk) { wanted = false; main.post(new Runnable() { @Override public void run() { detach(); } }); }
            return;
        }
        wanted = false;
        stopKeepSvc();
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
                    boolean stale = !journeyOn && !hosted && (System.currentTimeMillis() - Math.max(lastUpdateAt, webAliveAt)) > STALE_MS;   // 여정 중에는 웹이 잠깐 못 보내도 오버레이를 내리지 않는다   // 2026-10-12: 웹이 깨우기에 답하는 동안은 낡은 것이 아니다
                    boolean show = wanted && (!appVisible || demoActive()) && !stale && canDraw()
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
    private static final long JOURNEY_STALE_MS = 8 * 60 * 60 * 1000L;   // 2026-10-12: 10분 → 8시간 — 웹이 멈춰 keepAlive 를 못 보내도 깨우기는 이어 간다(끝나면 웹이 끄고, 앱이 종료되면 handleOnDestroy 가 끈다)
    private boolean ticking = false;
    private volatile boolean journeyOn = false;    // 웹: 확정한 여정이 진행 중 (오버레이 사용 여부와 무관)
    private volatile long journeyAt = 0L;

    private final Runnable ticker = new Runnable() {
        @Override public void run() {
            if (hosted) { ticking = false; return; }   // 대기 모드: 웹이 없다 — 깨울 것도, 서비스를 끌 이유도 없다(서비스 수명은 KeepAliveService 가 쥔다)
            boolean journey = journeyOn && (System.currentTimeMillis() - journeyAt) < JOURNEY_STALE_MS;
            if (!attached && !journey) { ticking = false; try { if (cpuLock != null && cpuLock.isHeld()) cpuLock.release(); } catch (Exception ignoredR) { } stopKeepSvc(); return; }
            // ★ 2026-10-13: 여정 중인데 우리 유지 서비스가 없으면 다시 켠다(시작이 막히면 조용히 건너뛴다).
            if (journey && serviceState("KeepAliveService") == 0) startKeepSvc();
            try { if (attached) rebuildIfResized(); } catch (Exception ignored0) { }
            // ★ 2026-10-12 (YJ: "앱의 갱신 호출을 못 해도 5초에 한 번은 살려야지"): 화면이 꺼져 CPU 가 잠들면 이 5초 틱도 멈춘다.
            //   여정 중에는 CPU 를 깨워 두는 락(부분 웨이크락)을 틱마다 90초씩 갱신한다 — 틱이 죽으면 락도 90초 안에 저절로 풀린다.
            try { holdCpu(); } catch (Exception ignoredW) { }
            try {
                // 앱이 보이는 동안은 웹이 스스로 돌고 있으니 깨울 필요가 없다. 가려진 동안만 깨운다.
                if (!appVisible && getBridge() != null && getBridge().getWebView() != null) {
                    // ★ 2026-10-02 (YJ: "앱을 켤 때마다 위치가 바뀌어 있고 오버레이는 실시간으로 안 바뀐다"): 앱이 가려지면 웹뷰의 타이머·렌더가
                    //   멈춘 상태일 수 있다 → 깨우기 직전에 웹뷰 타이머를 다시 살린다(시스템 전체 설정이 아니라 이 웹뷰의 JS 타이머 일시정지 해제).
                    try { getBridge().getWebView().resumeTimers(); } catch (Exception ignored2) { }
                    // ★ 2026-10-12 (YJ: "앱이 백그라운드로 들어가고 오버레이가 실행돼도 오버레이가 죽으면 안 돼. 계속 깨워야지"):
                    //   웹뷰가 가려지면 렌더링까지 재워질 수 있다 → 깨울 때마다 onResume 도 불러 JS 실행을 보장하고,
                    //   웹이 돌려준 값(여정 진행 중이면 true)으로 '여정 진행 중' 표시를 이어 간다 — 웹이 keepAlive 를 못 보내는 동안에도 깨우기가 10분 만에 멈추지 않는다.
                    try { getBridge().getWebView().onResume(); } catch (Exception ignored3) { }
                    getBridge().getWebView().evaluateJavascript(
                            "(function(){try{return !!(window._ovlNativeTick&&window._ovlNativeTick(" + bgServiceState() + "));}catch(e){return false;}})()",
                            new android.webkit.ValueCallback<String>() {
                                @Override public void onReceiveValue(String v) {
                                    webAliveAt = System.currentTimeMillis();
                                    if ("true".equals(v)) { journeyAt = webAliveAt; }
                                }
                            });
                }
            } catch (Exception ignored) { }
            main.postDelayed(this, TICK_MS);
        }
    };

    // ★ 2026-10-13 (YJ: "서비스가 끊기면 30초마다 되살아나? 텀이 너무 길다 — 4.5초로"): 웹이 가진 '백그라운드 위치 켜짐' 표시(_bgGeoActive)는
    //   서비스가 죽어도 true 로 남아 있어 되살리기가 아예 일어나지 않았다. 틱마다 진짜 서비스 상태를 읽어 웹에 넘긴다.
    //   1 = 살아 있음 · 0 = 없음 · -1 = 읽지 못함(웹은 이 값으로 되살리지 않는다).
    private int bgServiceState() { return serviceState("BackgroundGeolocationService"); }

    private int serviceState(String classSuffix) {
        try {
            android.app.ActivityManager am = (android.app.ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
            if (am == null) return -1;
            java.util.List<android.app.ActivityManager.RunningServiceInfo> l = am.getRunningServices(200);
            if (l == null) return -1;
            String pkg = getContext().getPackageName();
            for (android.app.ActivityManager.RunningServiceInfo s : l) {
                if (s == null || s.service == null) continue;
                if (!pkg.equals(s.service.getPackageName())) continue;
                if (s.service.getClassName().endsWith(classSuffix)) return 1;
            }
            return 0;
        } catch (Throwable e) { return -1; }
    }

    /** 경로 이동 중 프로세스를 포그라운드 우선순위로 올려 두는 서비스(KeepAliveService). 시작이 거부돼도 앱은 영향 없다. */
    private void startKeepSvc() {
        try {
            android.content.Intent i = new android.content.Intent(getContext(), KeepAliveService.class);
            if (android.os.Build.VERSION.SDK_INT >= 26) getContext().startForegroundService(i); else getContext().startService(i);
        } catch (Throwable ignored) { }
    }

    private void stopKeepSvc() {
        try { getContext().stopService(new android.content.Intent(getContext(), KeepAliveService.class)); } catch (Throwable ignored) { }
    }

    private android.os.PowerManager.WakeLock cpuLock = null;
    private void holdCpu() {
        if (!journeyOn) { if (cpuLock != null && cpuLock.isHeld()) cpuLock.release(); return; }
        if (cpuLock == null) {
            android.os.PowerManager pm = (android.os.PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            if (pm == null) return;
            cpuLock = pm.newWakeLock(android.os.PowerManager.PARTIAL_WAKE_LOCK, "gildongmu:ovl");
            cpuLock.setReferenceCounted(false);
        }
        cpuLock.acquire(90 * 1000L);
    }

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
        root = null; border = null; borderAnim = null; borderMode = 0; stripView = null; boardView = null; recoView = null; pillView = null; gapView = null; cardBg = null; stopPillBlink();
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
        root.setPadding(padH, dp(5), padH, dp(2));
        // ★ 2026-10-11: 앱 경로 화면 카드와 같은 모양 — 테마의 카드 바탕 + 얇은 테두리(순수 검정 바탕은 그만)
        cardBg = new GradientDrawable();
        cardBg.setColor(thBg);
        cardBg.setCornerRadius(dp(14));
        cardBg.setStroke(Math.max(1, dp(1)), 0x33808080);
        root.setBackground(cardBg);

        t1 = makeText(15, thFg, false);            // (예비 — 앱 칸을 못 받았을 때만 쓴다)
        t2 = makeText(12, thSub, true);            // 남은시간 · 도착 (회색)
        t3 = makeText(13, thSub, false);           // 추천 알림 제목
        t3.setMaxWidth(rowW);

        // 남은시간 줄은 맨 아래 전체 폭에 한 줄(길면 글자가 스스로 줄어든다)
        t2.setMaxWidth(rowW);
        t2.setMaxLines(1);
        t2.setHorizontallyScrolling(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            t2.setAutoSizeTextTypeUniformWithConfiguration(10, 12, 1, TypedValue.COMPLEX_UNIT_SP);
        }
        View gap = new View(ctx);
        gapView = gap;
        stripView = new StripView(ctx);
        root.addView(t3);                            // 추천 알림 제목은 위(남은시간 줄이 늘 맨 아래)
        root.addView(stripView, new LinearLayout.LayoutParams(rowW, stripView.wantH()));
        root.addView(gap, new LinearLayout.LayoutParams(1, dp(1)));
        rowWpx = rowW;
        infoRow = new LinearLayout(ctx);
        infoRow.setOrientation(LinearLayout.HORIZONTAL);
        infoRow.setGravity(Gravity.CENTER);
        infoRow.addView(t2, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        waitChip = new WaitChip(ctx);
        LinearLayout.LayoutParams wlp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        wlp.leftMargin = dp(6);
        waitChip.setVisibility(View.GONE);
        infoRow.addView(waitChip, wlp);
        root.addView(infoRow, new LinearLayout.LayoutParams(rowW, LinearLayout.LayoutParams.WRAP_CONTENT));
        boardView = new BoardView(ctx);
        root.addView(boardView, new LinearLayout.LayoutParams(rowW, LinearLayout.LayoutParams.WRAP_CONTENT));   // ★ 탑승 안내 줄
        recoView = new RecoView(ctx);
        recoView.setVisibility(View.GONE);
        root.addView(recoView, new LinearLayout.LayoutParams(rowW, LinearLayout.LayoutParams.WRAP_CONTENT));    // ★ 추천 줄(맨 아래, 도착 3분 전부터)
        pillView = new PillView(ctx);
        pillView.setVisibility(View.GONE);
        root.addView(pillView, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));   // ★ 알약 모드의 한 줄
        fullW = maxW;
        curPill = false; movedForAlert = false;

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
        userPill = sp.getBoolean("pill", false);
        pillX = Math.max(-dm.widthPixels / 2, Math.min(dm.widthPixels / 2, sp.getInt("px", 0)));

        final int slop = ViewConfiguration.get(ctx).getScaledTouchSlop();
        root.setOnTouchListener(new View.OnTouchListener() {
            float dx, dy; int sx, sy; boolean dragged, scrolling, inStrip, inBottom, swiping, armed; float startPos; float bx, by, lastX, lastY; VelocityTracker vt;
            // ★ 2026-10-11 (YJ: "아래로 슬라이딩하면 오버레이가 같이 내려가고 클릭하면 앱이 열린다 — 개선방안?"):
            //   세로로 쓸기는 이제 어디서 시작하든 탑승 줄을 여닫는 데만 쓴다(아래로 쓸면 열림 · 위로 쓸면 닫힘). 창 이동은 '꾹 눌러서'(0.45초, 진동) 잡은 뒤에만 한다.
            //   그래서 쓸다가 창이 같이 끌려 내려가거나, 쓸기가 탭으로 읽혀 앱이 열리는 일이 없다.
            final Runnable arm = new Runnable() {
                @Override public void run() {
                    if (dragged || scrolling || swiping) return;
                    armed = true;
                    dx = lastX; dy = lastY; sx = lp.x; sy = lp.y;          // 지금 손가락 위치를 창 이동의 기준점으로
                    try { root.performHapticFeedback(android.view.HapticFeedbackConstants.LONG_PRESS); } catch (Exception ignored) { }
                }
            };
            @Override public boolean onTouch(View v, MotionEvent e) {
                switch (e.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        dx = e.getRawX(); dy = e.getRawY(); lastX = dx; lastY = dy; sx = lp.x; sy = lp.y; dragged = false; scrolling = false; swiping = false; armed = false;
                        bx = e.getX(); by = e.getY();
                        // 맨 아래 영역(남은시간 줄 + 탑승 줄): [탑승]·알약 누름 판정에 쓴다
                        inBottom = !curPill && boardView != null && e.getY() >= (infoRow != null && infoRow.getVisibility() == View.VISIBLE ? infoRow.getTop() : boardView.getTop());
                        // 점·선 줄에서 시작한 좌우 움직임은 칸을 넘겨 보는 스크롤
                        inStrip = !curPill && stripView != null && e.getY() >= stripView.getTop() && e.getY() <= stripView.getBottom();
                        startPos = scrollPos;
                        stopFling();                                  // 미끄러지던 중에 다시 대면 멈춘다
                        main.removeCallbacks(arm);
                        main.postDelayed(arm, 450L);
                        try { if (vt != null) vt.recycle(); vt = VelocityTracker.obtain(); vt.addMovement(e); } catch (Exception ignored) { vt = null; }
                        return true;
                    case MotionEvent.ACTION_MOVE: {
                        lastX = e.getRawX(); lastY = e.getRawY();
                        float mx = lastX - dx, my = lastY - dy;
                        try { if (vt != null) vt.addMovement(e); } catch (Exception ignored) { }
                        if (!dragged && !scrolling && !swiping && (Math.abs(mx) > slop || Math.abs(my) > slop)) {
                            if (armed) {
                                dragged = true;                                         // 꾹 누른 뒤 움직이면 창 이동
                            } else {
                                main.removeCallbacks(arm);
                                if (inStrip && strip.length > 5 && Math.abs(mx) > Math.abs(my)) {
                                    scrolling = true;
                                    userScrolling = true;
                                    main.removeCallbacks(recenter);
                                } else if (Math.abs(my) > Math.abs(mx)) {
                                    swiping = true;                                     // 세로 쓸기: 탑승 줄 열기·닫기
                                } else {
                                    swiping = true; startPosIgnore = true;               // 가로로 쓸었지만 칸 줄이 아님: 아무 일 없음(탭으로도 안 읽음)
                                }
                            }
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
                        main.removeCallbacks(arm);
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
                        else if (swiping) {
                            // 앱 시트와 같은 동작을 오버레이 어디서든: 아래로 쓸면 탑승 안내 열기, 위로 쓸면 닫기(대기 알약)
                            if (e.getAction() == MotionEvent.ACTION_UP && !startPosIgnore) {
                                float myy = e.getRawY() - dy;
                                if (curPill) { if (myy > dp(22)) setUserPill(false); }          // 알약에서 아래로 쓸어도 펼쳐진다
                                else if (myy > dp(22)) { if (!"board".equals(rsSt)) act("open"); }
                                else if (myy < -dp(22)) {
                                    if ("board".equals(rsSt)) act("close");                      // 탑승 줄이 열려 있으면 그것부터 닫는다
                                    else setUserPill(true);                                      // 그다음 위로 쓸면 알약
                                }
                            }
                            startPosIgnore = false;
                        }
                        else if (dragged) savePos();
                        else if (armed) { /* 꾹 눌렀다가 그냥 뗌: 아무 일 없음 */ }
                        else if (e.getAction() == MotionEvent.ACTION_UP && curPill) {
                            setUserPill(false);                                               // 알약을 누르면 펼쳐진다(앱은 안 열림)
                        }
                        else if (e.getAction() == MotionEvent.ACTION_UP) {
                            int rh = (recoView != null && recoView.getVisibility() == View.VISIBLE && by >= recoView.getTop()) ? recoView.hit(bx - recoView.getLeft(), by - recoView.getTop()) : -1;
                            if (demoActive()) { endDemo(); }                                  // 시연은 어디를 눌러도 닫힌다(실제 동작은 하지 않는다)
                            else if (rh == 1) { act("recoGo"); openApp(); }                    // [보기] — 추천 아이템·맛집으로(앱을 앞으로)
                            else if (rh == 3) { act("recoBus"); openApp(); }                   // [주변버스 보기] — 노선도의 버스 > 주변 정류장으로(앱을 앞으로)
                            else if (rh == 2) quitApp();                                   // [종료] — 앱을 완전히 끝낸다(도착 직전이라 안내를 이어갈 필요 없음)
                            else if (rh == 0) openApp();                                   // 추천 줄의 글자 부분: 앱으로
                            else if (inBottom && boardView != null && boardView.hitBtn(bx - boardView.getLeft(), by - boardView.getTop())) {
                                act("undo".equals(rsSt) ? "undo" : "press");          // [탑승] / [되돌리기]
                            } else if (inBottom && ("wait".equals(rsSt) || "hidden".equals(rsSt))) {
                                act(("wait".equals(rsSt)) ? "pill" : "open");           // 알약·손잡이를 누르면 탑승 줄이 열린다(앱은 안 열림)
                            } else openApp();                                             // 그 밖은 탭하면 앱으로 돌아간다
                        }
                        armed = false;
                        try { if (vt != null) { vt.recycle(); vt = null; } } catch (Exception ignored) { }
                        return true;
                    default:
                        return false;
                }
            }
            boolean startPosIgnore = false;
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
        void setRadius(float r) { if (r != radius) { radius = r; invalidateSelf(); } }
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

    /** 경고 진동. 2단계(두 정거장 전)=두 번, 1단계(한 정거장 전·환승)=세 번. */
    private void vibrateAlert(int level) {
        try {
            android.os.Vibrator v = (android.os.Vibrator) getContext().getSystemService(Context.VIBRATOR_SERVICE);
            if (v == null || !v.hasVibrator()) return;
            long[] pat = (level == 1) ? new long[]{0, 300, 100, 300, 100, 300} : new long[]{0, 400, 150, 400};
            if (Build.VERSION.SDK_INT >= 26) v.vibrate(android.os.VibrationEffect.createWaveform(pat, -1));
            else v.vibrate(pat, -1);
        } catch (Exception ignored) { }
    }

    /** alert 값에 맞춰 테두리를 켜고(2=6초에 한 바퀴, 1=1.1초에 한 바퀴) 끈다. 메인 스레드에서 부른다. */
    private void applyAlert() {
        if (root == null) return;
        if (border == null) {
            border = new RainbowBorder(dp(14), dp(2.5f));            // 얇은 테두리
            root.setForeground(border);
        }
        border.setRadius(curPill ? dp(15) : dp(14));   // 알약은 알약 모양 그대로 둘러싼다
        int mode = alertLevel;                      // ★ 2026-10-16: 알약일 때도 그린다 — 두 정거장 전엔 알약 둘레에 무지개(천천히), 한 정거장 전엔 알약이 펼쳐지며 빠르게
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
        stopPillBlink();
    }

    private void savePos() {
        try {
            SharedPreferences.Editor ed = getContext().getSharedPreferences(PREF, Context.MODE_PRIVATE).edit();
            if (curPill) { pillX = lp.x; ed.putInt("px", lp.x).putInt("y", lp.y); }       // 알약: 가로 위치는 따로, 세로는 오버레이와 같이
            else ed.putInt("x", lp.x).putInt("y", lp.y);
            ed.apply();
        } catch (Exception ignored) { }
    }

    /** 사용자가 알약으로 접거나(true) 펼친다(false). 접은 상태는 저장된다. 경고로 펼쳐진 중에 접으면 그 경고로는 다시 펼치지 않는다. 메인 스레드에서 부른다. */
    private void setUserPill(boolean v) {
        userPill = v;
        if (v) { if (alertLevel > 0) dismissedAlertAt = curAlertAt; if (rcOn) dismissedRecoAt = rcAt; }
        else { dismissedAlertAt = -1L; dismissedRecoAt = -1L; }
        try { getContext().getSharedPreferences(PREF, Context.MODE_PRIVATE).edit().putBoolean("pill", v).apply(); } catch (Exception ignored) { }
        attachOrUpdate();
    }

    /**
     * 알약 ↔ 펼침 전환. 알약 = 사용자가 접어 둔 상태이면서 지금 켜진 경고가 없을 때(경고가 있어도 이미 접어 끈 경고면 알약).
     * 경고로 펼칠 땐 알약 위치를 기억하고 맨 위로 옮기며, 경고가 끝나 다시 접을 땐 기억해 둔 위치로 돌려놓는다.
     */
    private void applyMode() {
        if (root == null || lp == null) return;
        // 접힌 알약이 저절로 펼쳐지는 때: ① 한 정거장 전(alert 1, 환승 1정거장 전 포함) ② 새 추천이 뜰 때.
        //   두 정거장 전(alert 2)은 펼치지 않고 알약 둘레에 무지개 테두리만 돈다(applyAlert).
        boolean alertOpen = alertLevel == 1 && curAlertAt != dismissedAlertAt;
        boolean recoOpen = rcOn && rcAt != dismissedRecoAt;
        boolean wp = userPill && !demoActive() && !alertOpen && !recoOpen;
        boolean changed = (wp != curPill);
        if (changed) {
            if (wp) {                                                   // 접기
                if (movedForAlert) { lp.x = restoreX; lp.y = restoreY; movedForAlert = false; }
                else lp.x = pillX;
            } else {                                                    // 펴기
                if (userPill) { restoreX = lp.x; restoreY = lp.y; movedForAlert = true; lp.x = 0; lp.y = dp(36); }   // 경고: 맨 위로
                else { pillX = lp.x; lp.x = 0; movedForAlert = false; }                                              // 사용자가 폄: 제자리
            }
            lp.width = wp ? WindowManager.LayoutParams.WRAP_CONTENT : fullW;
            curPill = wp;
        }
        int padH = dp(8);
        if (wp) {
            root.setPadding(dp(4), dp(3), dp(4), dp(3));
            if (cardBg != null) cardBg.setCornerRadius(dp(15));
            t3.setVisibility(View.GONE);
            if (stripView != null) stripView.setVisibility(View.GONE);
            if (gapView != null) gapView.setVisibility(View.GONE);
            if (infoRow != null) infoRow.setVisibility(View.GONE);
            if (boardView != null) boardView.setVisibility(View.GONE);
            if (recoView != null) recoView.setVisibility(View.GONE);
            if (pillView != null) { pillView.setLabel(pillText()); pillView.setVisibility(View.VISIBLE); pillView.invalidate(); }
        } else {
            root.setPadding(padH, dp(5), padH, dp(2));
            if (cardBg != null) cardBg.setCornerRadius(dp(14));
            if (pillView != null) pillView.setVisibility(View.GONE);
            if (stripView != null) stripView.setVisibility(View.VISIBLE);
            if (gapView != null) gapView.setVisibility(View.VISIBLE);
            if (boardView != null) boardView.setVisibility(View.VISIBLE);
        }
        if (changed && attached) {
            try { wm.updateViewLayout(root, lp); } catch (Exception ignored) { }
            popIn();
        }
        if (curPill && preAlert) startPillBlink(); else stopPillBlink();
    }

    /** 모드가 바뀐 직후 스프링처럼(살짝 넘쳤다가 안착) 커지며 나타난다. 위쪽 가운데를 기준으로. */
    private void popIn() {
        final View r = root;
        if (r == null) return;
        r.getViewTreeObserver().addOnGlobalLayoutListener(new ViewTreeObserver.OnGlobalLayoutListener() {
            @Override public void onGlobalLayout() {
                try { r.getViewTreeObserver().removeOnGlobalLayoutListener(this); } catch (Exception ignored) { }
                try {
                    r.animate().cancel();
                    r.setPivotX(r.getWidth() / 2f);
                    r.setPivotY(0f);
                    r.setScaleX(0.55f);
                    r.setScaleY(0.55f);
                    r.animate().scaleX(1f).scaleY(1f).setDuration(520L).setInterpolator(new OvershootInterpolator(2.4f)).start();
                } catch (Exception ignored) { }
            }
        });
    }

    /** 목적지 3정거장 전: 알약이 깜박인다(알약일 때만). */
    private void startPillBlink() {
        if (root == null || (pillBlinkAnim != null && pillBlinkAnim.isRunning())) return;
        pillBlinkAnim = ValueAnimator.ofFloat(1f, 0.28f);
        pillBlinkAnim.setDuration(650L);
        pillBlinkAnim.setRepeatCount(ValueAnimator.INFINITE);
        pillBlinkAnim.setRepeatMode(ValueAnimator.REVERSE);
        pillBlinkAnim.addUpdateListener(new ValueAnimator.AnimatorUpdateListener() {
            @Override public void onAnimationUpdate(ValueAnimator a) { if (root != null) root.setAlpha((Float) a.getAnimatedValue()); }
        });
        pillBlinkAnim.start();
    }

    private void stopPillBlink() {
        try { if (pillBlinkAnim != null) pillBlinkAnim.cancel(); } catch (Exception ignored) { }
        boolean was = pillBlinkAnim != null;
        pillBlinkAnim = null;
        if (was && root != null) root.setAlpha(1f);
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
            if (boardView != null) boardView.setState(rsSt);
            if (recoView != null) {
                boolean rcWas = recoView.getVisibility() == View.VISIBLE;
                recoView.setVisibility(rcOn ? View.VISIBLE : View.GONE);
                if (rcOn) recoView.begin(rcWas);
                recoView.invalidate();
            }
            if (waitChip != null && infoRow != null) {
                boolean wt = "wait".equals(rsSt);
                if (wt) {
                    waitChip.setLabel(rsCh, Math.round(rowWpx * 0.42f));
                    t2.setMaxWidth(Math.max(dp(80), rowWpx - waitChip.wantW() - dp(6)));
                } else {
                    t2.setMaxWidth(rowWpx);
                }
                waitChip.setVisibility(wt ? View.VISIBLE : View.GONE);
                waitChip.invalidate();
            }
            if (stripView != null) {
                stripView.invalidate();
                if (moving && strip.length > 1) startBlink();
                else { stopBlink(); stripView.setLit(true); }       // 정차 중: 선은 그대로
            }
        } catch (Exception ignored) { }
        t2.setText(line2);
        t2.setVisibility(line2.length() > 0 ? View.VISIBLE : View.GONE);
        if (infoRow != null) infoRow.setVisibility((line2.length() > 0 || (waitChip != null && waitChip.getVisibility() == View.VISIBLE)) ? View.VISIBLE : View.GONE);
        t3.setText(line3);
        t3.setVisibility(line3.length() > 0 ? View.VISIBLE : View.GONE);
        try { applyMode(); } catch (Exception ignored) { }          // ★ 알약 ↔ 펼침(위 줄들의 보임 여부를 알약일 때 덮어쓴다)
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
        try { if (boardView != null) boardView.cancelAnim(); } catch (Exception ignored) { }
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

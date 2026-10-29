package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.LinearGradient;
import android.graphics.Matrix;
import android.graphics.Shader;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.graphics.Rect;
import android.text.InputFilter;
import android.text.InputType;
import android.text.TextPaint;
import android.util.LruCache;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.VelocityTracker;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.OverScroller;
import android.widget.TextView;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 서버 구동 화면을 그리는 뷰 — 2026-10-18. 엔진이 준 화면 JSON(ScreenCore.Screen)을 그대로 그린다. 무엇을 보일지 정하지 않는다.
 *   · 머리는 위에 고정. 머리 안의 칩 줄만 가로로 밀리고(안내 상자·검색줄은 고정) 본문은 세로로 밀린다 — 손가락 따라가기 + 관성(OverScroller) + 화면 박자(postInvalidateOnAnimation).
 *   · 그릴 때 새로 만드는 객체가 없다(Paint·RectF·Path 재사용). 화면 밖 조각은 이진 탐색으로 건너뛴다. 그림은 백그라운드에서 받아 LruCache + 파일 캐시에 둔다.
 *   · 좌표는 dp. 그릴 때 밀도(dpr)를 한 번 곱한다. 글자 폭도 같은 Paint 로 잰다.
 */
public class ScreenView extends View {
    public interface Listener {
        void onAction(ScreenCore.Act a);
        /** 스위치를 눌렀다 — 화면은 이미 뒤집혀 있다(on = 새 상태). 앱이 실제로 바꾸고, 엔진 새 화면이 오면 그걸로 덮어쓴다. */
        void onSet(ScreenCore.Act a, boolean on);
        /** 검색줄에서 검색 실행(입력칸 글자 q, 비었을 수 있다). 무슨 주소를 열지는 엔진이 정한 a.tpl/a.empty 를 웹이 쓴다. */
        void onSearch(ScreenCore.Act a, String q);
        /** 검색 입력칸이 포커스를 얻거나 잃음(키보드가 올라오면 웹뷰 크기가 바뀌므로 웹이 '움직임'으로 오해해 숨기지 않게 알린다). */
        void onInputFocus(boolean on);
        void onFirstDraw();
        /** 글자 입력칸(watch)의 글자가 바뀌었다(kind=edit) · 포커스를 얻었다(focus) · 잃었다(blur). 자동완성을 엔진에 물을 때 웹이 쓴다. */
        void onText(String key, String value, String kind);
        /** 그려진 내용의 높이(dp) — 웹 자리(사각형)가 이 높이를 따라 늘고 준다. */
        void onContentH(float dp);
    }

    // 색 역할 (ScreenCore 의 color 이름과 같은 순서)
    public static final int R_BG = 0, R_CARD = 1, R_BORDER = 2, R_TEXT = 3, R_SUB = 4, R_GOLD = 5, R_ORANGE = 6, R_IMGBG = 7, R_WHITE = 8, R_BORDER2 = 9, R_CARD2 = 10, R_NAV = 11, R_GOLD2 = 12, R_ONGOLD = 13;

    private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final TextPaint tp = new TextPaint(Paint.ANTI_ALIAS_FLAG);
    private final RectF rf = new RectF(), rf2 = new RectF();
    private final Runnable firstDrawCb = new Runnable() { @Override public void run() { if (listener != null) listener.onFirstDraw(); } };
    private final Paint bmpPaint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
    private final int[] pal = { 0xFF0B0F14, 0xFF1B2129, 0x33FFFFFF, 0xFFF2F4F7, 0xFF9AA4B2, 0xFFF0B429, 0xFFF07830, 0xFF252528, 0xFFFFFFFF, 0x4DFFFFFF, 0xFF2C2C2E, 0xFF161618, 0xFF0E7DD6, 0xFFFFFFFF };
    private ScreenCore.Screen screen;
    private ScreenCore.Layout lay;
    private float dpr = 1f, scrollY = 0f, scrollX = 0f;
    private static final long BAND_RETURN_MS = 10000L;     // 손 놓고 이 시간이 지나면 마커가 가운데로 돌아온다(s265)
    private float bandVel;
    private long bandUserT; private float bandX; private boolean flingBand, inBand; private String bandSig = "";   // 본문 안 타임라인 줄(경로 결과 카드)의 가로 위치 · 그 줄을 놓고 미는 중 · 손가락이 그 줄 위에서 시작했다
    private String ctrDone = null;                      // 24시간 차트: 지금 시각 막대를 가운데로 맞춘 막대 내용 표시(내용이 바뀔 때만 다시 맞춘다)
    private final OverScroller flingY, flingX, flingP;
    // s303: 위아래로 밀어 고르는 목록(pickl) — 목록마다(열쇠) 밀린 정도·마지막으로 맞춘 선택 줄·손가락이 잡은 목록·관성
    private final java.util.HashMap<String, Float> pickOff = new java.util.HashMap<String, Float>();
    private final java.util.HashMap<String, String> pickSig = new java.util.HashMap<String, String>();
    private ScreenCore.Item pickHit; private String flingKey; private float flingMax;
    // s307: 접었다 펼치는 고르기 목록(pickl fold) — 펼친 목록의 열쇠 · 마지막으로 본 선택 줄 · 펼침/접힘 스프링(어느 목록 · 시작 시각 · 시작 때 보이던 높이 · 시작 때 안쪽 밀린 정도)
    private final java.util.HashSet<String> foldOpen = new java.util.HashSet<String>();
    private final java.util.HashMap<String, String> foldSig = new java.util.HashMap<String, String>();
    private String foldKey; private long foldT0; private float foldH0, foldOff0;
    private float foldY, foldBot, foldDy; private boolean foldOn, bodyDraw;       // 이번에 그리는 동안의 값: 목록 위·아래 끝(본문 좌표) · 아래 칸들이 내려가 있는 정도
    private static final float FOLD_MS = 640f;
    private final Path pickChev = new Path();                                    // ▾/▴ 한 번 만들어 재사용(그릴 때 새 객체 없음)
    private VelocityTracker vt;
    private final int slop, minFling, maxFling;
    private float downX, downY, lastX, lastY, downBodyY;
    private long downT;
    private int mode = 0;                                  // 0 없음 · 1 본문 세로 · 2 머리 가로 · 8 본문 안 타임라인 가로 · 3 눌러보는 중 · 6 순서 바꾸기 줄 · 7 카드 끄는 중
    private boolean inHead, inChips, inFoot;
    private String openKey;                                // 펼친 게시글 id (null = 엔진이 준 표시를 따름 · "" = 모두 접음)
    private final Map<float[], android.graphics.Path> iconPaths = new HashMap<float[], android.graphics.Path>();
    private ScreenCore.Item pressed;
    private Listener listener;
    private boolean drewOnce;
    private boolean mkHas;                                 // 내 위치 마커가 한 번이라도 놓였나
    private float mkFromX, mkToX, mkMs;                    // 마커가 가는 중인 구간(dp)과 걸리는 ms
    private long mkT0;

    // ── 글꼴: 웹은 'Noto Sans KR'(구글 웹폰트)로 그린다. 기기 기본 글꼴은 한글이 작고 가늘어 보이므로 같은 글꼴을 앱에 넣어(CI 가 내려받아 assets/fonts 에) 쓴다.
    //    파일이 없거나 읽기 실패면 기기 기본 글꼴로 되돌아간다(화면은 그대로 뜬다).
    private static volatile Typeface faceR, faceB;
    private static volatile boolean facesTried;
    public static synchronized void preloadFaces(Context c) {
        if (facesTried) return;
        facesTried = true;
        try { faceR = Typeface.createFromAsset(c.getAssets(), "fonts/NotoSansKR-Regular.ttf"); } catch (Throwable e) { faceR = null; }
        try { faceB = Typeface.createFromAsset(c.getAssets(), "fonts/NotoSansKR-Bold.ttf"); } catch (Throwable e) { faceB = null; }
    }
    static Typeface face(boolean bold) {
        Typeface t = bold ? faceB : faceR;
        return t != null ? t : (bold ? Typeface.DEFAULT_BOLD : Typeface.DEFAULT);
    }
    private volatile long lastDraw = 0L;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private EditText input;                                   // 검색줄의 진짜 입력칸(기기 키보드·붙여넣기·한글 조합은 안드로이드가 한다)
    private int inL = -1, inT = -1, inW = -1, inH = -1;        // 마지막으로 놓은 입력칸 자리(바뀔 때만 다시 놓는다)
    private boolean inFront, inShown;
    private ScreenCore.Act inAct;
    private EditText editor;                                  // 글자 입력칸(field 노드)을 누르면 그 자리에 뜨는 진짜 입력칸
    private String editKey;
    private int eL = -1, eT = -1, eW = -1, eH = -1;            // 마지막으로 놓은 글자 입력칸 자리
    private final Map<String, String> fieldVals = new HashMap<String, String>(), fieldBase = new HashMap<String, String>();
    // 입력칸 글자(편집 중이 아닐 때) 줄임: 같은 글 · 같은 폭이면 지난 계산을 쓴다(맞으면 새 객체 없음)
    private static final class InbarMemo { String v, r; float w, size; boolean bold; }
    private final Map<String, InbarMemo> inbarMemo = new HashMap<String, InbarMemo>();
    /** 글자 자리(오른쪽 단추 앞까지)보다 길면 … 으로 줄인다. 지금 tp 에 글자 크기가 이미 맞춰져 있다. */
    private String inbarShown(ScreenCore.Item it, String v) {
        float maxW = it.ix + it.iw - 8f - it.textX;
        if (v == null || v.length() < 2 || maxW < 24f) return v;
        InbarMemo m = inbarMemo.get(it.key);
        if (m != null && m.v.equals(v) && m.w == maxW && m.size == it.size && m.bold == it.bold) return m.r;
        String r = v;
        if (tp.measureText(v) > maxW) {
            int n = v.length();
            float ew = tp.measureText("\u2026");
            while (n > 1 && tp.measureText(v, 0, n) + ew > maxW) n--;
            r = v.substring(0, n) + "\u2026";
        }
        if (m == null) { if (inbarMemo.size() > 24) inbarMemo.clear(); m = new InbarMemo(); inbarMemo.put(it.key, m); }
        m.v = v; m.r = r; m.w = maxW; m.size = it.size; m.bold = it.bold;
        return r;
    }
    private final java.util.HashMap<String, Float> widthMemo = new java.util.HashMap<String, Float>();         // 글자 폭 기억: 8초마다 오는 새 화면은 대부분 같은 글이라 다시 재지 않는다(배치가 주 스레드에서 도는 시간을 줄인다)
    private float memoDpr = -1f;
    private final ScreenCore.Measurer measurer = new ScreenCore.Measurer() {
        @Override public float width(String s, float size, boolean bold) {
            if (memoDpr != dpr) { widthMemo.clear(); memoDpr = dpr; }
            final boolean memo = s.length() >= 2 && s.length() <= 80;
            String k = null;
            if (memo) {
                k = (bold ? "b" : "n") + size + "|" + s;
                Float c = widthMemo.get(k);
                if (c != null) return c.floatValue();
            }
            tp.setTypeface(face(bold));
            tp.setTextSize(size * dpr);
            float w = tp.measureText(s) / dpr;
            if (memo) { if (widthMemo.size() > 6000) widthMemo.clear(); widthMemo.put(k, Float.valueOf(w)); }
            return w;
        }
    };

    public ScreenView(Context c) {
        super(c);
        setWillNotDraw(false);
        ViewConfiguration vc = ViewConfiguration.get(c);
        slop = vc.getScaledTouchSlop(); minFling = vc.getScaledMinimumFlingVelocity(); maxFling = vc.getScaledMaximumFlingVelocity();
        flingY = new OverScroller(c); flingX = new OverScroller(c); flingP = new OverScroller(c);
        ImageBank.init(c);
        preloadFaces(c);
    }

    public void setListener(Listener l) { listener = l; }
    // ── 커뮤니티 좌우 밀기(웹 _commSwipeInit · _swipeAttach): 판정값은 웹 그대로 — 32px 이상 · 1.2초 안 · 세로로 80px 넘게 벗어나면 스크롤 · 가로가 세로 이상.
    //    무엇으로 넘길지는 엔진이 준 칩(탭 · 카테고리 · 호선)의 순서와 켜진 칸으로 앱 쪽 SwipeHost 가 정한다. 여기서는 몸짓을 알아보고 넘어갈 때 본문이 옆에서 미끄러져 들어오는 그림만 그린다.
    public interface SwipeHost { boolean onSwipe(ScreenView v, int dir); /** 지금 이 화면이 좌우 밀기를 쓰는 화면인가(아니면 세로 스크롤을 가로채지 않는다). */ boolean canSwipe(); }
    private SwipeHost swipeHost;
    private float swX0, swY0, swScroll0; private long swT0; private boolean swBlock, swOff, swCan;
    private float swShift, swRelFrom; private long swRelT, swHold; private boolean swFire;                      // 가로로 밀 때 본문이 손가락을 따라 움직인 거리(dp) · 뗀 뒤 되돌아오는 그림
    private int pendSlide; private long pendSlideAt, slT0; private int slDir;
    private static final float SW_MIN_DP = 32f, SW_OFF_DP = 80f, SW_FLING_DP = 520f, SW_FLING_MIN_DP = 10f, SW_LOCK_SW = 1.0f, SW_RECOVER_DP = 36f; private static final long SW_MAX_MS = 1200L, SLIDE_MS = 380L;
    private static final float SW_DRAG_DP = 88f, SW_LOCK = 1.25f; private static final long SW_BACK_MS = 420L, SW_OUT_MS = 110L;          // 손가락을 거의 그대로 따라가다(고무줄처럼 88dp 까지) 놓으면 스프링으로 제자리 · 가로가 세로 이상이면 바로 가로로 잠근다(s236)          // 따라 움직이는 최대 36dp · 가로가 세로의 1.25배 넘으면 가로로 잠근다(그 뒤로는 위아래로 안 흔들린다)
    private static final float SLIDE_DP = 56f;                                         // 웹 ltSlideInLeft/Right: 24px 옆에서 + 투명→불투명 0.34초 cubic-bezier(.22,.8,.3,1)
    private static android.view.animation.PathInterpolator slideEase;
    public void setSwipeHost(SwipeHost h) { swipeHost = h; }
    // ── 아래로 당겨 새로고침(s236): 맨 위에서 아래로 당기면 목록이 고무줄처럼 늘어나고, 놓으면 스프링으로 튀어 오르며 새로고침한다 ──
    public interface PullHost { boolean canPull(); void onPull(); }
    private PullHost pullHost;
    public void setPullHost(PullHost h) { pullHost = h; }
    private float pullY, pullFrom; private long pullRelT; private boolean pullAllowed;
    private static final float PULL_TRIG = 64f, PULL_MAX = 150f;
    /** 감쇠 스프링 응답: 1(처음) → 0(제자리)을 넘나들다 가라앉는다. t 초, zeta 감쇠비, w0 각진동수. */
    static float springF(float t, float zeta, float w0) {
        float wd = w0 * (float) Math.sqrt(1f - zeta * zeta), a = zeta * w0;
        return (float) (Math.exp(-a * t) * (Math.cos(wd * t) + (a / wd) * Math.sin(wd * t)));
    }
    /** 다음에 오는 새 화면은 dir 쪽으로 밀어서 넘어온 것이다(dir -1 = 왼쪽으로 밀어 다음 칸 → 새 내용은 오른쪽에서 들어온다). 3초 안에 안 오면 잊는다. */
    public void slideNext(int dir) { pendSlide = dir; pendSlideAt = SystemClock.uptimeMillis(); }
    /** 지금 그리는 화면(엔진이 준 좌우 밀기 행동 sw 를 읽을 때 쓴다). 없으면 null. */
    public ScreenCore.Screen currentScreen() { return screen; }
    /** 머리 줄(chips)의 칩 행동들과 켜진 칸 번호(onOut[0], 없으면 -1). */
    public ScreenCore.Act[] chipActs(int[] onOut) {
        java.util.ArrayList<ScreenCore.Act> o = new java.util.ArrayList<ScreenCore.Act>();
        int on = -1;
        if (lay != null) for (ScreenCore.Item it : lay.head) if (it.kind == ScreenCore.K_CHIP && it.act != null) { if (it.on) on = o.size(); o.add(it.act); }
        if (onOut != null && onOut.length > 0) onOut[0] = on;
        return o.toArray(new ScreenCore.Act[0]);
    }
    /** 입력칸 글자 모음(키 → 글자). 앱이 call 행동을 처리할 때 함께 받는다. */
    public Map<String, String> fields() { return new HashMap<String, String>(fieldVals); }
    public long drawAgeMs() { return lastDraw == 0L ? Long.MAX_VALUE : SystemClock.uptimeMillis() - lastDraw; }
    public int itemCount() { return lay == null ? 0 : lay.head.length + lay.body.length; }
    /** 놀이터 칸을 놓을 자리(dp · 이 뷰 좌표): kind 인 첫 칸(역 이름 K_TEXT · 시간표 머리줄 K_BAR)의 [글 x, 글 y, 글 너비, 글 줄 높이, 칸 y, 칸 높이, 오른쪽 한계]. 없으면 null. 배치가 끝난 뒤 주 스레드에서만(처음 위치 기준 · 스크롤 안 함). */
    public float[] playAnchor(int kind) {
        if (lay == null) return null;
        for (int pass = 0; pass < 2; pass++) {
            ScreenCore.Item[] arr = pass == 0 ? lay.head : lay.body; float oy = pass == 0 ? 0f : lay.headH;
            for (ScreenCore.Item it : arr) {
                if (it.kind != kind || it.lines.length == 0) continue;
                setText(it.size, it.bold, 0);
                float right = kind == ScreenCore.K_BAR && it.sw > 0f ? it.sx - 8f : it.x + it.w;
                return new float[] { it.textX, oy + it.textY, it.mqVis > 0f ? Math.min(it.mqVis, it.mqW) : tp.measureText(it.lines[0]), it.lineH, oy + it.y, it.h, right, pass == 0 ? 0f : 1f };      // [7] = 1 이면 본문 안의 칸 — 스크롤을 따라 움직인다
            }
        }
        return null;
    }
    public float scrollPos() { return scrollY; }
    /** 스크롤 위치가 바뀐 그림 박자마다 부른다(시간표 머리의 캐릭터 놀이터가 글과 함께 올라가게). 그리는 일만 하는 가벼운 것이어야 한다. */
    private Runnable scrollHook; private float hookY = Float.NaN;
    public void setScrollHook(Runnable r) { scrollHook = r; hookY = Float.NaN; }
    private String fcDone = "";
    /** 엔진이 '여기로 내려 보여 달라'고 표시한 칸(box 의 fc 열쇠 — 시간표에서 지금 시각 다음 열차 줄)이 새로 나타났으면 한 번 그 줄로 스크롤한다. 같은 열쇠는 다시 안 끌어서 보던 자리를 지킨다. */
    private void applyFocus() {
        if (lay == null || getHeight() <= 0) return;
        for (ScreenCore.Item q : lay.body) {
            if (q.kind != ScreenCore.K_BOX || q.key.length() == 0) continue;
            if (!q.key.equals(fcDone)) { fcDone = q.key; scrollY = ScreenCore.clamp(q.y - 56f, lay.bodyMaxScroll(bodyViewH())); invalidate(); }
            return;
        }
        // s231 (YJ: 버스 세부위치(노선 상세)를 열면 내 위치를 중심으로 스크롤): 엔진이 '내 정류장'(mine)으로 표시한 줄이 새로 나타나면 한 번 화면 가운데로. 같은 줄은 다시 안 끌어서 보던 자리를 지킨다.
        for (ScreenCore.Item q : lay.body) {
            if (q.kind != ScreenCore.K_BRX || !"s".equals(q.dk) || !q.top) continue;
            String mk = "me|" + q.ti;
            if (!mk.equals(fcDone)) { fcDone = mk; scrollY = ScreenCore.clamp(q.y + q.h / 2f - bodyViewH() / 2f, lay.bodyMaxScroll(bodyViewH())); invalidate(); }
            return;
        }
        fcDone = "";
    }
    public void setDpr(float d) { if (d > 0f && d != dpr) { dpr = d; relayout(); } }
    public void setPalette(int[] c) { for (int i = 0; i < pal.length && i < c.length; i++) pal[i] = c[i]; styleInput(); invalidate(); }

    /** 새 화면을 올린다. keepScroll 이면 위치를 유지(같은 목록 갱신), 아니면 맨 위로. */
    public void setScreen(ScreenCore.Screen s, boolean keepScroll) {
        boolean stick = s != null && "bottom".equals(s.anchor) && (!keepScroll || nearBottom());
        // 키 기준 갱신: 새 데이터로 목록이 바뀌어도 보던 글(엔진이 준 고유 id)이 같은 자리에 남도록 위치를 맞춘다
        String ancKey = null; float ancOff = 0f;
        if (keepScroll && !stick && lay != null && scrollY > 1f) {
            for (ScreenCore.Item q : lay.body) {
                if (q.y + q.h <= scrollY) continue;
                String k = anchorKey(q);
                if (k != null) { ancKey = k; ancOff = q.y - scrollY; break; }
            }
        }
        final long nowSp = SystemClock.uptimeMillis();
        java.util.HashMap<String, Integer> spOld = null;
        if (keepScroll && lay != null && nowSp < spUntil) { spOld = new java.util.HashMap<String, Integer>(); fpAdd(spOld, lay.head); fpAdd(spOld, lay.body); fpAdd(spOld, lay.foot); }
        final ScreenCore.Layout before = keepScroll && !stick && ancKey == null ? lay : null;      // 노선 상세: 바뀐 줄만 다시 그리려고 이전 배치를 쥔다
        screen = s;
        mqT0 = SystemClock.uptimeMillis();
        if (pendSlide != 0) { if (mqT0 - pendSlideAt < 3000L) { slDir = pendSlide; slT0 = mqT0; followChip = true; } pendSlide = 0; }      // 밀어서 넘어온 화면이면 위 칩 줄도 켜진 칩을 따라간다
        hintUntil = 0L;                                                                    // 엔진이 준 실제 상태(감지 중 여부)가 오면 임시 표시는 거둔다
        cdFresh = true; pendAgeMs = srcAgeMs; srcAgeMs = 0L;
        iconPaths.clear();
        if (!keepScroll) { scrollY = 0f; if (!followChip) scrollX = 0f; openKey = null; ctrDone = null; bandX = 0f; bandSig = ""; }
        boolean touching = mode == 1 || mode == 2 || mode == 8 || mode == 9;
        if (!touching) { flingY.forceFinished(true); flingX.forceFinished(true); pressed = null; mode = 0; }      // 손가락이 닿은 채 오는 8초 갱신이 스크롤을 끊지 않는다(노선 상세만; 그 밖은 예전과 같다)
        else if (before == null || !before.part) { flingY.forceFinished(true); flingX.forceFinished(true); pressed = null; mode = 0; }
        partialFrom = before != null && before.part ? before : null;
        relayout();
        partialFrom = null;
        if (spOld != null) markChanged(spOld, nowSp);
        trackMsgs(keepScroll);
        syncMk(keepScroll);
        if (stick && lay != null) { scrollY = lay.bodyMaxScroll(bodyViewH()); invalidate(); }
        else if (ancKey != null && lay != null) {
            for (ScreenCore.Item q : lay.body) {
                if (ancKey.equals(anchorKey(q))) { scrollY = ScreenCore.clamp(q.y - ancOff, lay.bodyMaxScroll(bodyViewH())); invalidate(); break; }
            }
        }
    }
    /** 위치를 붙잡을 키: 엔진이 준 고유 id 가 있는 칸만(없으면 null — 번호로는 붙잡지 않는다). */
    private static String anchorKey(ScreenCore.Item q) {
        if (q == null || q.act == null || q.act.id == null || q.act.id.length() == 0) return null;
        return q.act.id;
    }
    /** 그린 화면을 비운다(다른 탭의 옛 화면이 새 탭 자리에 남아 보이지 않게). */
    public void clearScreen() { foldOpen.clear(); foldSig.clear(); foldKey = null; msgSeen.clear(); msgBorn.clear(); roMode = false; roReset(); dgCards = new ScreenCore.Item[0]; screen = null; lay = null; fcDone = ""; scrollY = 0f; scrollX = 0f; bandX = 0f; bandSig = ""; openKey = null; ctrDone = null; pressed = null; mode = 0; mkHas = false; invalidate(); syncLater(); }
    /** 맨 아래에서 80dp 안에 있으면 참(채팅 자동 따라가기 판단). 아직 배치 전이면 참. */
    private boolean nearBottom() {
        if (lay == null) return true;
        return lay.bodyMaxScroll(bodyViewH()) - scrollY <= 80f;
    }

    /** 안내창(fit)이 가장 긴 글 줄에 맞춘 카드 너비(dp; 없으면 0). */
    /** 지금 그린 내용 전체 높이(dp). */
    public float contentHdp() { return lay == null ? 0f : lay.headH + lay.bodyH + lay.footH; }
    public float fitWidthDp() { return lay == null ? 0f : lay.fitW; }

    // ── 떠 있는 단추(웹 .fab): 그라데이션은 배치 때 한 번만 만든다(그릴 때 새 객체 없음) ──
    private android.graphics.LinearGradient fabShader; private float fabSX = -1f, fabSY = -1f, fabSW = -1f; private boolean fabDown;
    private void buildFab() {
        if (lay == null || lay.fabW <= 0f) { fabShader = null; return; }
        float w = getWidth() / dpr, h = getHeight() / dpr, fx = (w - lay.fabW) / 2f, fy = h - lay.footH - ScreenCore.FAB_B - ScreenCore.FAB_H;
        if (fabShader != null && fx == fabSX && fy == fabSY && lay.fabW == fabSW) return;
        fabSX = fx; fabSY = fy; fabSW = lay.fabW;
        fabShader = new android.graphics.LinearGradient(fx, fy, fx + lay.fabW, fy + ScreenCore.FAB_H, pal[R_GOLD], pal[R_GOLD], android.graphics.Shader.TileMode.CLAMP);          // s312(YJ): 글쓰기 단추는 게시판 칩과 같은 한 가지 파랑(칩 켠 색 = 'gold')
    }
    private boolean fabAt(float px, float py) {
        if (lay == null || lay.fabW <= 0f) return false;
        float x = px / dpr, y = py / dpr, w = getWidth() / dpr, h = getHeight() / dpr, fx = (w - lay.fabW) / 2f, fy = h - lay.footH - ScreenCore.FAB_B - ScreenCore.FAB_H;
        return x >= fx - 4f && x < fx + lay.fabW + 4f && y >= fy - 4f && y < fy + ScreenCore.FAB_H + 4f;
    }
    private void drawFab(Canvas cv, float w, float h) {
        if (lay == null || lay.fabW <= 0f) return;
        float fw = lay.fabW, fh = ScreenCore.FAB_H, fx = (w - fw) / 2f, fy = h - lay.footH - ScreenCore.FAB_B - fh, rad = 30f;
        p.setStyle(Paint.Style.FILL); p.setShader(null);
        for (int i = 5; i >= 1; i--) { p.setColor((pal[R_GOLD] & 0x00FFFFFF) | 0x0A000000); float e = i * 1.4f; rf.set(fx - e, fy + 4f - e, fx + fw + e, fy + fh + 4f + e); cv.drawRoundRect(rf, rad + e, rad + e, p); }       // 웹 box-shadow 0 4px 14px rgba(212,175,55,.4) 흉내
        rf.set(fx, fy, fx + fw, fy + fh);
        p.setColor(pal[R_GOLD]); p.setAlpha(255); cv.drawRoundRect(rf, fh / 2f, fh / 2f, p);          // s313(YJ: 너무 흐림): 그라데이션 셰이더는 앞에서 남은 붓 투명도를 그대로 받아 흐리게 보였다 — 단색 · 불투명으로
        if (fabDown) { p.setColor(0x22000000); cv.drawRoundRect(rf, fh / 2f, fh / 2f, p); }
        float tx = fx + ScreenCore.FAB_PX;
        if (lay.fabIcon.length > 0) {
            android.graphics.Path ph = pathOf(lay.fabIcon);
            cv.save(); cv.translate(tx, fy + (fh - ScreenCore.FAB_ICON) / 2f); cv.scale(ScreenCore.FAB_ICON / 24f, ScreenCore.FAB_ICON / 24f);
            p.setColor(pal[R_ONGOLD]); cv.drawPath(ph, p); cv.restore();
            tx += ScreenCore.FAB_ICON + ScreenCore.FAB_GAP;
        }
        setText(ScreenCore.FAB_TXT, true, pal[R_ONGOLD]);
        cv.drawText(lay.fabLabel, tx, base(fy, fh, 0), tp);
    }
    private boolean followChip;
    /** 밀기로 카테고리가 바뀐 직후: 켜진 칩이 칩 줄 가운데 오게 줄을 부드럽게 옮긴다(웹 scrollIntoView). */
    private void followOnChip() {
        followChip = false;
        if (lay == null || lay.headMaxScroll() <= 0f) return;
        for (ScreenCore.Item it : lay.head) {
            if (it.kind != ScreenCore.K_CHIP || !it.on || it.fixed) continue;
            float target = ScreenCore.clamp(it.x + it.w / 2f - lay.width / 2f, lay.headMaxScroll());
            if (Math.abs(target - scrollX) < 1f) return;
            flingX.forceFinished(true); flingBand = false;
            flingX.startScroll(Math.round(scrollX * dpr), 0, Math.round((target - scrollX) * dpr), 0, 260);
            invalidate();
            return;
        }
    }
    // ── s277 (YJ: 보던 분류로 돌아오면 렉 · 늦게 나온다): 곧 올 화면(이웃 분류)의 '배치'를 뒤 스레드에서 미리 해 둔다 — 큰 화면(채팅 200줄 · 쇼핑 160장)은 글 폭 재기 + 칸 배치가 주 스레드에서 수십 ms 걸렸다.
    //    엔진이 준 글로 앱이 그리기 전 준비만 한다(계산 결과를 바꾸지 않는다: 같은 ScreenCore.layout 을 같은 폭·높이로 돌릴 뿐). 한 번 쓰면 버린다(배치는 눌림·켜짐 상태를 지니므로).
    private static final class PreLay { final float w, h, d; final ScreenCore.Layout lay; PreLay(float w, float h, float d, ScreenCore.Layout l) { this.w = w; this.h = h; this.d = d; lay = l; } }
    private final java.util.LinkedHashMap<ScreenCore.Screen, PreLay> preLay = new java.util.LinkedHashMap<ScreenCore.Screen, PreLay>(8, 0.75f, true) {
        @Override protected boolean removeEldestEntry(java.util.Map.Entry<ScreenCore.Screen, PreLay> e) { return size() > 8; }
    };
    private final java.util.concurrent.ConcurrentHashMap<String, Float> bgMemo = new java.util.concurrent.ConcurrentHashMap<String, Float>();
    private static final java.util.concurrent.ExecutorService PRE_EX = java.util.concurrent.Executors.newSingleThreadExecutor(new java.util.concurrent.ThreadFactory() {
        @Override public Thread newThread(Runnable r) { Thread t = new Thread(r, "scr-prelay"); t.setDaemon(true); t.setPriority(Thread.MIN_PRIORITY + 1); return t; }
    });
    /** (주 스레드) 이 화면의 배치와 처음 보일 큰 그림 디코딩을 뒤에서 미리 해 둔다. 이미 해 뒀거나 폭이 아직 없거나 남는 세로를 채우는 노드(fit)가 있으면 하지 않는다. */
    public void preLayout(final ScreenCore.Screen s) {
        if (s == null || s.fitNode != null || getWidth() <= 0 || getHeight() <= 0 || dpr <= 0f) return;
        final float w = getWidth() / dpr, h = getHeight() / dpr, d = dpr;
        synchronized (preLay) { PreLay p = preLay.get(s); if (p != null && p.w == w && p.h == h && p.d == d) return; }
        final TextPaint pb = new TextPaint(tp);
        PRE_EX.execute(new Runnable() { @Override public void run() {
            try {
                final ScreenCore.Measurer bm = new ScreenCore.Measurer() {
                    @Override public float width(String str, float size, boolean bold) {
                        final boolean memo = str.length() >= 2 && str.length() <= 80;
                        String k = null;
                        if (memo) { k = (bold ? "b" : "n") + size + "|" + d + "|" + str; Float c = bgMemo.get(k); if (c != null) return c.floatValue(); }
                        pb.setTypeface(face(bold)); pb.setTextSize(size * d);
                        float wv = pb.measureText(str) / d;
                        if (memo) { if (bgMemo.size() > 6000) bgMemo.clear(); bgMemo.put(k, Float.valueOf(wv)); }
                        return wv;
                    }
                };
                ScreenCore.Layout L = ScreenCore.layout(s, w, bm, null, h);
                synchronized (preLay) { preLay.put(s, new PreLay(w, h, d, L)); }
                int n = 0;                                                                   // 처음 화면에 보일 큰 그림(파일에 이미 있는 것)을 미리 풀어 둔다 — 돌아왔을 때 곰돌이 자리표시자 없이
                for (ScreenCore.Item it : L.body) {
                    if (n >= 16 || it.y > h * 1.4f) break;
                    if (it.img != null && it.img.length() > 0) { ImageBank.preDecode(it.img, Math.round(it.iw * d), Math.round(it.ih * d)); n++; }
                }
            } catch (Throwable ignored) { }
        } });
    }
    private ScreenCore.Layout takePre(float w, float h) {
        if (openKey != null || !foldOpen.isEmpty()) return null;
        synchronized (preLay) { PreLay p = preLay.remove(screen); if (p != null && p.w == w && p.h == h && p.d == dpr) return p.lay; }
        return null;
    }
    private void relayout() {
        if (screen == null || getWidth() <= 0) { lay = null; invalidate(); syncLater(); return; }
        try { int wh = getRootView().getHeight(); if (wh > 0) ScreenCore.winH = wh / dpr; } catch (Throwable ignored) { }                  // 웹 vh 높이(버스 지도 24vh)는 창 높이 기준
        final long plt0 = PerfLog.now();
        ScreenCore.applyFold(screen, foldOpen, foldSig);                                           // s307: 접힌 고르기 목록은 이번 배치에 접힌 채로 · 고른 줄이 바뀐 새 화면이면 다시 접는다
        { ScreenCore.Layout pl = takePre(getWidth() / dpr, getHeight() / dpr); lay = pl != null ? pl : ScreenCore.layout(screen, getWidth() / dpr, measurer, openKey, getHeight() / dpr); }
        PerfLog.layout(plt0);
        if (!hasPager()) { pgPage = 0; pgPos = 0f; pgDragOn = false; }
        if (lay.bandTop < 0f) { bandSig = ""; bandX = 0f; }
        else if (!lay.bandSig.equals(bandSig)) { bandSig = lay.bandSig; bandX = lay.mkBody && lay.mk != null ? ScreenCore.clamp(lay.mk.x(lay.mk.r) - lay.bandL - lay.bandView / 2f, lay.bandMax()) : 0f; }      // 새 경로면 내 위치(없으면 처음)가 보이게
        if (lay.ctrSig.length() == 0) ctrDone = null;
        else if (!lay.ctrSig.equals(ctrDone)) { ctrDone = lay.ctrSig; scrollX = lay.initScrollX; }      // 24시간 차트 내용이 새로 오면 지금 시각 막대를 가운데로
        clampScroll();
        if (followChip) followOnChip();
        applyFocus();
        markBcards();
        roSync();                                                                         // 주변 정류장 카드 목록을 다시 모은다(새 배치 = 끌던 상태는 끝)
        buildFab();
        syncFieldBases(lay.body); syncFieldBases(lay.foot);
        float ch = lay.headH + lay.bodyH + lay.footH;
        if (Math.abs(ch - lastCH) > 0.5f) { lastCH = ch; final float chf = ch; post(new Runnable() { @Override public void run() { if (listener != null) listener.onContentH(chf); } }); }
        if (editKey != null) { ScreenCore.Item f = fieldByKey(editKey); if (f != null) ensureEditVisible(f); }
        if (lay != null && lay.mk != null && !mkHas) syncMk(false);      // 폭이 정해지기 전에 올라온 화면의 마커도 첫 배치 때 놓는다
        if (partialFrom == null || !dirtyOnly(partialFrom)) invalidate();
        syncLater();
    }
    // ── 노선 상세: 새 화면이 와도 모양이 같으면(줄 수·자리 그대로) 지문이 달라진 줄의 자리만 다시 그린다 — 버스 위치가 바뀐 줄 둘 정도만 ──
    private ScreenCore.Layout partialFrom;
    private static boolean sameBox(ScreenCore.Item a, ScreenCore.Item b) { return a.kind == b.kind && a.x == b.x && a.y == b.y && a.w == b.w && a.h == b.h; }
    /** 이전 배치와 자리가 모두 같으면 달라진 줄만 invalidate 하고 true. 하나라도 어긋나면 false(전체를 다시 그린다). */
    private boolean dirtyOnly(ScreenCore.Layout o) {
        ScreenCore.Layout n = lay;
        if (n == null || o == null || !n.part || n.head.length != o.head.length || n.body.length != o.body.length || n.foot.length != o.foot.length) return false;
        if (n.headH != o.headH || n.bodyH != o.bodyH || n.footH != o.footH) return false;
        for (int i = 0; i < n.foot.length; i++) if (!sameBox(n.foot[i], o.foot[i]) || !n.foot[i].sig.equals(o.foot[i].sig) || !java.util.Arrays.equals(n.foot[i].lines, o.foot[i].lines)) return false;
        for (int i = 0; i < n.head.length; i++) if (!sameBox(n.head[i], o.head[i])) return false;
        for (int i = 0; i < n.body.length; i++) if (!sameBox(n.body[i], o.body[i])) return false;
        int cnt = 0;
        for (int i = 0; i < n.head.length; i++) {
            ScreenCore.Item a = n.head[i], b = o.head[i];
            if (a.sig.equals(b.sig) && java.util.Arrays.equals(a.lines, b.lines)) continue;
            invalidate(0, Math.round(a.y * dpr), getWidth(), Math.round((a.y + a.h) * dpr) + 1); cnt++;
        }
        float top = scrollY, bot = scrollY + (getHeight() / dpr - n.headH - n.footH);
        for (int i = 0; i < n.body.length; i++) {
            ScreenCore.Item a = n.body[i], b = o.body[i];
            if (a.sig.equals(b.sig) && java.util.Arrays.equals(a.lines, b.lines)) continue;
            cnt++;
            if (a.y + a.h < top - 4f || a.y > bot + 4f) continue;                                // 안 보이는 줄은 그릴 것이 없다
            invalidate(0, Math.round((n.headH + a.y - scrollY) * dpr), getWidth(), Math.round((n.headH + a.y + a.h - scrollY) * dpr) + 1);
        }
        return true;
    }
    /** 입력칸 글자: 엔진이 준 기본값이 바뀐 때만 덮는다(쓰던 글자가 새 화면에 지워지지 않게). */
    private void syncFieldBases(ScreenCore.Item[] arr) {
        for (ScreenCore.Item it : arr) {
            if (it.kind != ScreenCore.K_FIELD && it.kind != ScreenCore.K_INBAR) continue;
            String pb = fieldBase.get(it.key);
            if (pb == null || !pb.equals(it.value)) { fieldVals.put(it.key, it.value); fieldBase.put(it.key, it.value); }
        }
    }
    @Override protected void onSizeChanged(int w, int h, int ow, int oh) {
        super.onSizeChanged(w, h, ow, oh);
        boolean stick = screen != null && "bottom".equals(screen.anchor) && nearBottom();
        relayout();
        if (stick && lay != null) { scrollY = lay.bodyMaxScroll(bodyViewH()); invalidate(); }
    }

    private float viewHdp() { return getHeight() / dpr; }
    private float bodyViewH() { return Math.max(0f, viewHdp() - (lay == null ? 0f : lay.headH + lay.footH)); }
    private float footTop() { return viewHdp() - (lay == null ? 0f : lay.footH); }
    private void clampScroll() {
        if (lay == null) return;
        scrollY = ScreenCore.clamp(scrollY, lay.bodyMaxScroll(bodyViewH()));
        scrollX = ScreenCore.clamp(scrollX, lay.headMaxScroll());
        bandX = ScreenCore.clamp(bandX, lay.bandMax());
    }

    // ───────────── 손가락 ─────────────
    private boolean parentMayIntercept;
    /** true 면 터치를 시작해도 부모의 가로채기를 막지 않는다(시트 박스가 위아래 끌기를 확정하면 가져간다). */
    public void setParentIntercept(boolean on) { parentMayIntercept = on; }
    @Override public boolean onTouchEvent(MotionEvent e) {
        if (lay == null) return true;
        if (vt == null) vt = VelocityTracker.obtain();
        vt.addMovement(e);
        float x = e.getX(), y = e.getY();
        if (mode == 5 && e.getActionMasked() != MotionEvent.ACTION_DOWN) return tmTouch(e);          // 끌 수 있는 지도 위 손가락
        if ((mode == 6 || mode == 7) && e.getActionMasked() != MotionEvent.ACTION_DOWN) return roTouch(e);       // 주변 정류장 카드 끌어서 순서 바꾸기
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN: {
                if (!parentMayIntercept && getParent() != null) getParent().requestDisallowInterceptTouchEvent(true);          // 끌어 닫는 시트 안이면 부모가 위아래 끌기를 가로챌 수 있게 둔다
                flingY.forceFinished(true); flingX.forceFinished(true); ssOn = false;
                if (roMode && roDown(x, y)) { downX = lastX = x; downY = lastY = y; return true; }
                if (liveMapAt(x, y) != null && tmView != null) { mode = 5; pressed = null; tmDX = tmLX = x; tmDY = tmLY = y; tmDT = SystemClock.uptimeMillis(); tmMoved = false; tmScaling = false; tmSg.onTouchEvent(e); return true; }
                downX = lastX = x; downY = lastY = y; downT = SystemClock.uptimeMillis();
                inHead = y < lay.headH * dpr;
                inChips = inHead && lay.chipsTop >= 0f && y >= lay.chipsTop * dpr && y < lay.chipsBot * dpr;
                { float byy = y / dpr - lay.headH + scrollY; inBand = !inHead && lay.bandTop >= 0f && lay.bandMax() > 0f && byy >= lay.bandTop - 4f && byy < lay.bandBot + 4f && y < footTop() * dpr; }       // 본문 안 타임라인 줄 위에서 시작했나
                inFoot = lay.footH > 0f && !inHead && y >= footTop() * dpr;
                mode = 3;
                fabDown = fabAt(x, y);
                pressed = fabDown ? null : findItem(x, y);
                if (pressed != null && pressed.act == null && pressed.kind != ScreenCore.K_FIELD) pressed = null;
                pressInFoot = inFoot;
                flingP.forceFinished(true); pickHit = (!inHead && !inFoot && !fabDown) ? pickAt(x, y) : null;
                ui.removeCallbacks(lpRun);
                if (pressed != null && pressed.kind == ScreenCore.K_BCARD && "near".equals(pressed.value) && !inHead && !inFoot && roEnabled()) ui.postDelayed(lpRun, RO_LP_MS);       // 꾹 누르면 순서 바꾸기
                sceneTouch = false;
                { ScreenCore.Item si = sceneAt(x, y); if (si != null && scene.touchDown(sceneX(x, si), sceneY(y, si))) { sceneTouch = true; pressed = null; } }
                pgHit = pagerAt(x, y);
                swX0 = x; swY0 = y; swT0 = downT; swOff = false; swScroll0 = scrollY; swCan = swipeHost != null && swipeHost.canSwipe();
                pullAllowed = pullHost != null && lay != null && lay.footH <= 0f && !inHead && !inBand && pullHost.canPull(); if (pullRelT > 0L && mode != 1) { pullRelT = 0L; pullY = 0f; }
                swBlock = swipeHost == null || inHead || inBand || inFoot || fabDown || sceneTouch || swOutside(x, y) || (pressed != null && (pressed.kind == ScreenCore.K_FIELD || pressed.kind == ScreenCore.K_INBAR || pressed.kind == ScreenCore.K_SEARCH || pressed.kind == ScreenCore.K_RBTN));      // 웹 _swipeBlocked: 입력칸 · 단추 · 칩 줄 · 가로로 밀리는 영역에서 시작한 몸짓은 무시
                invalidate();
                return true;
            }
            case MotionEvent.ACTION_MOVE: {
                float dx = x - lastX, dy = y - lastY;
                { float ay = Math.abs(y - swY0), ax = Math.abs(x - swX0); if (ay > SW_OFF_DP * dpr && ay > ax) swOff = true; }
                if (sceneTouch && scene != null) {
                    ScreenCore.Item si = sceneAt(x, y);
                    float sx = si != null ? sceneX(x, si) : x - sceneL * dpr, sy = si != null ? sceneY(y, si) : y - sceneT * dpr;
                    scene.touchMove(sx, sy);
                    if (scene.isHeld()) { mode = 4; lastX = x; lastY = y; invalidate(); return true; }      // 캐릭터를 잡았다 — 목록은 밀지 않는다
                    if (mode == 4) return true;
                }
                if (mode == 4) return true;
                if (mode == 3) {
                    if (Math.abs(x - downX) > slop || Math.abs(y - downY) > slop) {
                        pressed = null; fabDown = false; ui.removeCallbacks(lpRun);
                        float adx = Math.abs(x - downX), ady = Math.abs(y - downY);
                        if (pickHit != null && pickHit.pickMax > 0f && ady > adx) { mode = 11; pressed = null; lastY = y; invalidate(); return true; }          // 고르기 목록 위에서 위아래로 밀면 그 목록만 민다
                        if (pgHit != null && adx > ady * SW_LOCK) { mode = 10; pgDragOn = true; pgDownPos = pgPos; pgLast = SystemClock.uptimeMillis(); lastX = x; blurInput(); invalidate(); return true; }          // 두 쪽 카드를 가로로 밀기 시작
                        if (swipeHost != null && !swBlock && !swOff && !inHead && !inFoot && !inBand && adx > ady * SW_LOCK_SW && swCan) { mode = 9; swShift = 0f; swRelT = 0L; lastX = x; blurInput(); invalidate(); return true; }          // 가로로 밀기 시작 — 가로로 잠가 세로 스크롤을 멈춘다(비스듬히 밀어도 목록이 흔들리지 않게)
                        mode = inHead ? (inChips ? 2 : 0) : (inFoot ? 0 : 1);   // 머리는 칩 줄만 가로로 민다(안내 상자·검색줄은 고정) · 아래 고정 줄은 안 밀린다
                        if (inHead && Math.abs(y - downY) > Math.abs(x - downX) * 2f) mode = 0;     // 머리를 위아래로 쓸면 무시
                        if (mode == 1 && inBand && Math.abs(x - downX) > Math.abs(y - downY)) mode = 8;          // 타임라인 줄은 가로로 밀면 그 줄만 민다(세로로 쓸면 목록)
                        if (mode == 1) blurInput();                                              // 목록을 밀기 시작하면 키보드를 내린다
                    } else return true;
                }
                if (mode == 11 && pickHit != null) {
                    float o11 = pickGet(pickHit); pickOff.put(pickHit.key, ScreenCore.clamp(o11 - dy / dpr, pickHit.pickMax)); lastY = y; invalidate(); return true;
                }
                if (mode == 10) {                                                                 // 두 쪽 카드를 손가락 따라 민다
                    if (pgHit != null) pgPos = pgDownPos - (x - downX) / dpr / Math.max(1f, pgHit.w);          // 끝이 없다 — 어느 쪽으로든 계속 넘어간다
                    lastX = x; invalidate(); return true;
                }
                if (mode == 9) {                                                                  // 가로로 잠긴 몸짓: 본문은 손가락을 반쯤 따라 움직이기만 한다(세로 스크롤 없음)
                    float ax9 = Math.abs(x - swX0), ay9 = Math.abs(y - swY0);
                    if (ay9 > SW_OFF_DP * dpr && ay9 > ax9) { mode = 1; swOff = true; swShift = 0f; lastY = y; lastX = x; invalidate(); return true; }          // 웹: 세로로 80px 넘게 벗어나면 스크롤로 본다
                    float dd9 = (x - swX0) / dpr; swShift = Math.signum(dd9) * SW_DRAG_DP * (1f - (float) Math.exp(-Math.abs(dd9) / SW_DRAG_DP));          // 처음엔 손가락과 1:1, 갈수록 고무줄처럼 느려진다
                    lastX = x; invalidate(); return true;
                }
                if (mode == 1 && swipeHost != null && swCan && !swBlock && !swOff && !inHead && !inFoot && !inBand && Math.abs(x - swX0) > SW_RECOVER_DP * dpr && Math.abs(x - swX0) > 2.2f * Math.abs(y - swY0) && Math.abs(scrollY - swScroll0) < 20f && pullY <= 0f) {
                    scrollY = swScroll0; flingY.forceFinished(true); mode = 9; swShift = 0f; swRelT = 0L; lastX = x; invalidate(); return true;          // 처음에 비스듬해서 세로로 잡혔어도 곧 확실히 가로로 밀면 가로로 바꾼다(막힘 방지)
                }
                if (mode == 1) {
                    float ddp = dy / dpr;
                    if (pullAllowed && (pullY > 0f || (scrollY <= 0f && ddp > 0f))) {                       // 맨 위에서 아래로 당긴다 — 고무줄처럼 점점 무겁게
                        float res = 0.6f / (1f + pullY / 90f);
                        pullY = Math.max(0f, Math.min(PULL_MAX, pullY + (ddp > 0f ? ddp * res : ddp)));
                        scrollY = 0f; pullRelT = 0L; flingY.forceFinished(true);
                    } else scrollY = ScreenCore.clamp(scrollY - ddp, lay.bodyMaxScroll(bodyViewH()));
                    lastY = y; invalidate();
                }
                else if (mode == 2) { scrollX = ScreenCore.clamp(scrollX - dx / dpr, lay.headMaxScroll()); lastX = x; invalidate(); }
                else if (mode == 8) { bandX = ScreenCore.clamp(bandX - dx / dpr, lay.bandMax()); lastX = x; bandUserT = SystemClock.uptimeMillis(); invalidate(); }
                return true;
            }
            case MotionEvent.ACTION_UP: {
                if (sceneTouch && scene != null) { scene.touchUp(); sceneTouch = false; }
                if (mode == 4) { finishTouch(); invalidate(); return true; }
                if (mode == 11 && pickHit != null) {
                    vt.computeCurrentVelocity(1000, maxFling); float v11 = vt.getYVelocity();
                    if (Math.abs(v11) > minFling) { flingKey = pickHit.key; flingMax = pickHit.pickMax; flingP.fling(0, Math.round(pickGet(pickHit) * dpr), 0, Math.round(-v11), 0, 0, 0, Math.round(pickHit.pickMax * dpr)); }
                    finishTouch(); invalidate(); return true;
                }
                if (mode == 3 && pickHit != null && pressed == null && listener != null && SystemClock.uptimeMillis() - downT < 600) { ScreenCore.Item ph = pickHit; tapPick(ph, x, y); finishTouch(); invalidate(); return true; }
                if (mode == 10) {                                                                 // 놓았다: 빠르게 쓸었거나 절반 넘게 밀렸으면 그 쪽으로
                    vt.computeCurrentVelocity(1000, maxFling);
                    float vx = vt.getXVelocity();
                    int pg0 = Math.round(pgDownPos); pgPage = vx < -PG_FLING * dpr ? pg0 + 1 : vx > PG_FLING * dpr ? pg0 - 1 : Math.max(pg0 - 1, Math.min(pg0 + 1, Math.round(pgPos)));
                    pgDragOn = false; pgHit = null; pgLast = SystemClock.uptimeMillis(); finishTouch(); invalidate(); return true;
                }
                if (mode == 9) {                                                                  // 가로로 민 몸짓을 놓았다: 32dp 넘게 밀었으면 칸을 넘기고(손가락 오른쪽 = 왼쪽 칸 · 왼쪽 = 오른쪽 칸) 아니면 제자리로
                    float sdx = x - swX0;
                    vt.computeCurrentVelocity(1000, maxFling);
                    float vx9 = vt.getXVelocity() / dpr;
                    boolean fire = Math.abs(sdx) >= SW_MIN_DP * dpr || (Math.abs(vx9) >= SW_FLING_DP && Math.abs(sdx) >= SW_FLING_MIN_DP * dpr && vx9 * sdx > 0f);          // 빠르게 쓸기만 해도 넘긴다
                    swRelFrom = swShift; swRelT = SystemClock.uptimeMillis(); swHold = 0L; swFire = false;
                    if (fire && swipeHost != null) {
                        swHold = 450L + SW_OUT_MS; swFire = true;
                        final int sdir = sdx < 0f ? -1 : 1;                                                          // s316: 나가는 그림(0.11초)이 끝난 뒤에 새 화면을 부른다 — 미리 받아 둔 화면이 바로 와도 반쯤 사라지던 옛 글이 툭 끊기지 않고, 나가고 → 들어오는 한 동작으로 이어진다
                        ui.postDelayed(new Runnable() { @Override public void run() { if (swipeHost != null) swipeHost.onSwipe(ScreenView.this, sdir); } }, SW_OUT_MS);
                    }          // 새 화면이 오면 그 자리에서 미끄러져 들어온다(안 오면 450ms 뒤 되돌아온다)
                    pressed = null; ui.removeCallbacks(lpRun); finishTouch(); invalidate(); return true;
                }
                if (mode == 3 && fabDown) { fabDown = false; if (SystemClock.uptimeMillis() - downT < 600 && listener != null && lay != null && lay.fabAct != null) { blurInput(); listener.onAction(lay.fabAct); } finishTouch(); invalidate(); return true; }
                if (mode == 3) {
                    if (SystemClock.uptimeMillis() - downT < 600 && pressed != null && listener != null) {
                        ScreenCore.Item pi = pressed; ScreenCore.Act a = pi.act; pressed = null; invalidate();
                        if (pi.kind == ScreenCore.K_SEARCH) tapSearch(pi, x / dpr, y / dpr);
                        else if (pi.kind == ScreenCore.K_FIELD) beginEdit(pi);
                        else if (pi.kind == ScreenCore.K_INBAR) tapInbar(pi, x / dpr, pressInFoot);
                        else if (pi.kind == ScreenCore.K_POSTH) toggleOpen(pi);
                        else if (pi.kind == ScreenCore.K_TDROW && pi.key.length() > 0) toggleTd(pi);
                        else if ((pi.kind == ScreenCore.K_SUG || pi.kind == ScreenCore.K_TROW) && pi.act2 != null && x / dpr >= pi.btx - 6f) { blurInput(); listener.onAction(pi.act2); }
                        else if (pi.kind == ScreenCore.K_RHD) { blurInput(); ScreenCore.Act ra = ScreenCore.Layout.rhdAct(pi, x / dpr); if (ra != null) listener.onAction(ra); }
                        else if (pi.kind == ScreenCore.K_BCARD) tapBcard(pi, x / dpr, y / dpr - lay.headH + scrollY);
                        else if (pi.kind == ScreenCore.K_BRX && "h".equals(pi.dk)) tapBrh(pi, x / dpr);
                        else if (pi.kind == ScreenCore.K_BTOG) { blurInput(); pickBtog(pi); listener.onAction(a); }
                        else if (pi.kind == ScreenCore.K_TOGGLE) { blurInput(); pi.on = !pi.on; invalidate(); listener.onSet(a, pi.on); }     // 화면은 바로 뒤집는다(엔진 새 화면을 기다리지 않는다)
                        else { blurInput(); if (pi.kind == ScreenCore.K_CHIP && a != null && "cat".equals(a.a)) pickChip(pi); else if (pi.kind == ScreenCore.K_BUTTON && a != null && a.v != null && a.v.startsWith("rh.tab.")) pickRtab(pi); else if (pi.kind == ScreenCore.K_BUTTON && pi.gk.length() > 0) pickGrp(pi); listener.onAction(a); }
                    }
                } else if (mode == 1 || mode == 2 || mode == 8) {
                    vt.computeCurrentVelocity(1000, maxFling);
                    if (mode == 1 && pullY > 0f) {                                                 // 당겼다 놓았다: 스프링으로 튀어 오르며, 충분히 당겼으면 새로고침
                        pullFrom = pullY; pullRelT = SystemClock.uptimeMillis();
                        if (pullY >= PULL_TRIG && pullHost != null) { performHapticFeedback(android.view.HapticFeedbackConstants.VIRTUAL_KEY); pullHost.onPull(); }
                    } else if (mode == 1) {
                        float v = vt.getYVelocity();
                        if (Math.abs(v) > minFling) { flingY.fling(0, Math.round(scrollY * dpr), 0, Math.round(-v), 0, 0, 0, Math.round(lay.bodyMaxScroll(bodyViewH()) * dpr)); }
                    } else if (mode == 8) {
                        float v = vt.getXVelocity();
                        flingBand = true; bandUserT = SystemClock.uptimeMillis();
                        if (Math.abs(v) > minFling) { flingX.fling(Math.round(bandX * dpr), 0, Math.round(-v), 0, 0, Math.round(lay.bandMax() * dpr), 0, 0); }
                    } else {
                        float v = vt.getXVelocity(); flingBand = false;
                        if (Math.abs(v) > minFling) { flingX.fling(Math.round(scrollX * dpr), 0, Math.round(-v), 0, 0, Math.round(lay.headMaxScroll() * dpr), 0, 0); }
                    }
                }
                finishTouch();
                invalidate();
                return true;
            }
            case MotionEvent.ACTION_CANCEL: if (sceneTouch && scene != null) { scene.touchUp(); sceneTouch = false; } if (mode == 10) { pgDragOn = false; pgPage = Math.round(pgPos); } if (mode == 1 && pullY > 0f) { pullFrom = pullY; pullRelT = SystemClock.uptimeMillis(); } finishTouch(); invalidate(); return true;
            default: return true;
        }
    }
    /** 화면에 '좌우 밀기 카드'(panel swp)가 있으면 그 카드 밖에서 시작한 몸짓은 좌우 밀기가 아니다(세로 스크롤 · 다른 카드 그대로). 그런 카드가 없으면 항상 false. */
    private boolean swOutside(float px, float py) {
        if (lay == null) return false;
        boolean any = false; float x = px / dpr, by = py / dpr - lay.headH + scrollY;
        for (ScreenCore.Item it : lay.body) if (it.kind == ScreenCore.K_PANEL && it.swp) { any = true; if (x >= it.x && x < it.x + it.w && by >= it.y && by < it.y + it.h) return false; }
        return any;
    }
    /** 밀리는 영역(밀기 카드 안 · 타임라인 아래)의 칸인가 — 단추 줄 · 카드 자신은 제자리. */
    private static boolean swIn(ScreenCore.Item it, float l, float r, float t, float b) {
        return it.kind != ScreenCore.K_PANEL && it.kind != ScreenCore.K_BUTTON && it.kind != ScreenCore.K_SWAP && it.x >= l - 2f && it.x < r && it.y >= t - 0.5f && it.y < b;
    }
    private boolean pressInFoot;
    private static final float PG_FLING = 500f;
    /** 분류 칩을 누르면 새 화면이 오기 전에 먼저 그 칩을 켜 보인다(같은 줄의 다른 칩은 끈다) — 엔진 화면이 오면 그것으로 덮어쓴다. */
    /** 좌우 밀기로 넘긴 칸의 칩을 새 화면이 오기 전에 먼저 켜 보인다(칩을 눌렀을 때와 같다) — 같은 행동을 가진 칩이 없으면 아무것도 안 한다. */
    public void lightChip(ScreenCore.Act a) {
        if (lay != null && a != null && a.v != null && "call".equals(a.a) && a.v.startsWith("rh.tab.")) {          // 결과 카드를 밀어 탭을 넘길 때도 위 탭 단추를 먼저 켜 보인다
            for (ScreenCore.Item it : lay.body) if (it.kind == ScreenCore.K_BUTTON && it.act != null && a.v.equals(it.act.v)) { pickRtab(it); return; }
            for (ScreenCore.Item it : lay.head) if (it.kind == ScreenCore.K_BUTTON && it.act != null && a.v.equals(it.act.v)) { pickRtab(it); return; }
            return;
        }
        if (lay == null || a == null || a.v == null || !"cat".equals(a.a)) return;
        for (ScreenCore.Item it : lay.head) if (it.kind == ScreenCore.K_CHIP && it.act != null && "cat".equals(it.act.a) && a.v.equals(it.act.v)) { pickChip(it); return; }
        for (ScreenCore.Item it : lay.body) if (it.kind == ScreenCore.K_CHIP && it.act != null && "cat".equals(it.act.a) && a.v.equals(it.act.v)) { pickChip(it); return; }
    }
    private void pickChip(ScreenCore.Item pi) {
        if (lay == null) return;
        for (ScreenCore.Item it : lay.head) if (it.kind == ScreenCore.K_CHIP && it.y == pi.y) it.on = it == pi;
        for (ScreenCore.Item it : lay.body) if (it.kind == ScreenCore.K_CHIP && it.y == pi.y) it.on = it == pi;
        invalidate();
    }

    /** 경로 방식 탭(최단시간 · 최소환승 · 지하철 · 버스)을 누르면 새 화면이 오기 전에 그 자리에서 먼저 켜 보인다 — 켜진 단추의 모양(색)을 눌린 단추와 맞바꾼다. 서버를 기다리지 않아 웹처럼 즉시 바뀐다. */
    private void pickRtab(ScreenCore.Item pi) {
        if (lay == null) return;
        ScreenCore.Item on = null;
        java.util.ArrayList<ScreenCore.Item> row = new java.util.ArrayList<ScreenCore.Item>();
        for (ScreenCore.Item it : lay.body) if (it.kind == ScreenCore.K_BUTTON && it.y == pi.y && it.act != null && it.act.v != null && it.act.v.startsWith("rh.tab.")) row.add(it);
        for (ScreenCore.Item it : lay.head) if (it.kind == ScreenCore.K_BUTTON && it.y == pi.y && it.act != null && it.act.v != null && it.act.v.startsWith("rh.tab.")) row.add(it);
        for (ScreenCore.Item it : row) if (it != pi && it.fill != null && "gold".equals(it.fill.role)) on = it;
        if (on == null || on == pi) return;
        rtFrom[0] = cc(pi.fill, pal[R_CARD]); rtFrom[1] = cc(pi.line, pal[R_BORDER]); rtFrom[2] = cc(pi.tc, pal[R_SUB]);          // 웹 #routeOptionTabs button{transition:all .15s} — 옛 색에서 새 색으로 0.15초 동안 섞는다
        rtFrom[3] = cc(on.fill, pal[R_CARD]); rtFrom[4] = cc(on.line, pal[R_BORDER]); rtFrom[5] = cc(on.tc, pal[R_SUB]);
        ScreenCore.Col f = pi.fill, l = pi.line, t = pi.tc;
        pi.fill = on.fill; pi.line = on.line; pi.tc = on.tc;
        on.fill = f; on.line = l; on.tc = t;
        rtA = pi; rtB = on; rtT0 = android.os.SystemClock.uptimeMillis();
        invalidate();
    }
    /** 같은 묶음(grp)의 단추 중 하나를 누르면 엔진 답을 기다리지 않고 그 자리에서 켜 보인다 — 켜져 있던 단추와 모양을 맞바꾼다. */
    private void pickGrp(ScreenCore.Item pi) {
        if (lay == null || pi.fill == null) return;
        if (pi.fill.role != null && "gold".equals(pi.fill.role)) return;
        ScreenCore.Item on = null;
        for (ScreenCore.Item it : lay.body) if (it != pi && it.kind == ScreenCore.K_BUTTON && pi.gk.equals(it.gk) && it.fill != null && "gold".equals(it.fill.role)) on = it;
        if (on == null) return;
        ScreenCore.Col f = pi.fill, l = pi.line, t = pi.tc;
        pi.fill = on.fill; pi.line = on.line; pi.tc = on.tc;
        on.fill = f; on.line = l; on.tc = t;
        invalidate();
    }
    private ScreenCore.Item rtA, rtB; private long rtT0; private final int[] rtFrom = new int[6]; private boolean rtAnim;
    private static int mix(int a, int b, float f) {
        int ra = (a >>> 24) & 255, rb = (b >>> 24) & 255;
        int A = Math.round(ra + (rb - ra) * f), R = Math.round(((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * f), G = Math.round(((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * f), B = Math.round((a & 255) + ((b & 255) - (a & 255)) * f);
        return (A << 24) | (R << 16) | (G << 8) | B;
    }
    /** 경로 탭 단추의 지금 색(전환 중이면 섞은 색). k: 0 바탕 · 1 테두리 · 2 글. */
    private int rtColor(ScreenCore.Item it, int k, int to) {
        if (it != rtA && it != rtB) return to;
        float f = (android.os.SystemClock.uptimeMillis() - rtT0) / 150f;
        if (f >= 1f) { return to; }
        rtAnim = true;
        return mix(rtFrom[(it == rtA ? 0 : 3) + k], to, f * (2f - f));
    }
    /** 토글 줄 단추를 누르면 새 화면이 오기 전에 먼저 그 단추를 켜 보인다(새로고침 단추는 제외). */
    private void pickBtog(ScreenCore.Item pi) {
        if (lay == null || "r".equals(pi.value)) return;
        for (ScreenCore.Item it : lay.head) if (it.kind == ScreenCore.K_BTOG && !"r".equals(it.value) && it.sy == pi.sy) it.on = it == pi;
        invalidate();
    }
    /** 정류장 카드를 눌렀다: ★/×/✏️/🗺️ 자리면 그 행동, 아니면 카드 — 카드는 바로 켜고 지도를 그 핀으로 옮긴 뒤 엔진에 알린다. */
    private void tapBcard(ScreenCore.Item pi, float xdp, float ydp) {
        blurInput();
        ScreenCore.Act a = pi.act;
        for (int z = 0; z < pi.za.length && z * 4 + 3 < pi.zs.length; z++) {
            float zx = pi.zs[z * 4], zy = pi.zs[z * 4 + 1], zw = pi.zs[z * 4 + 2], zh = pi.zs[z * 4 + 3];
            if (zw > 0f && pi.za[z] != null && xdp >= zx && xdp < zx + zw && ydp >= zy - 4f && ydp < zy + zh + 4f) {
                if (z == 0 && "s".equals(pi.dk)) { pi.top = !pi.top; invalidate(); }       // 별은 바로 뒤집는다(엔진 새 화면이 오면 그걸로 덮어쓴다)
                listener.onAction(pi.za[z]);
                return;
            }
        }
        if (pi.ra.length > 0 && pi.gf.length >= pi.ra.length * 2) {                           // 노선 줄을 눌렀다 → 그 노선의 상세(종 모양 알림 자리는 빼고)
            float ry = ydp - pi.y;
            for (int i = 0; i < pi.ra.length; i++) {
                if (ry >= pi.gf[i * 2] && ry < pi.gf[i * 2] + pi.gf[i * 2 + 1] && pi.ra[i] != null && xdp < pi.f3 - 4f) { listener.onAction(pi.ra[i]); return; }
            }
        }
        focusCard(pi.key, false);
        if (pi.ti >= 0 && pi.ti < tmPins.size() && tmView != null) { tmFocus = pi.ti; tmFocApplied = pi.ti; tmLabel = false; tmGoTo(tmPins.get(pi.ti).la, tmPins.get(pi.ti).lo, tmView.zoom); }
        listener.onAction(a);
    }

    // ───────────── 캐릭터 장면(혼잡도 카드) — 엔진이 정한 값을 SceneCore 가 그린다. 여기는 크기·시계·손가락만 이어 준다 ─────────────
    // ───────────── 두 쪽 카드(혼잡도 ↔ 지하철 객실 장면): 앱은 두 쪽을 가로로 밀어 넘기기만 한다. 두 번째 쪽 글·열차 위치(시각표)는 엔진이 준다 ─────────────
    /** 객실 장면이 받을 탑승 엔진의 시각표(pos 글). 탑승 서비스를 아는 쪽(ShellActivity)이 꽂아 준다 — 이 뷰는 서비스를 모른다. 없으면 빈 글. */
    public interface TrainFeed { String pos(); }
    public static volatile TrainFeed trainFeed;
    private int pgPage; private float pgPos, pgDownPos; private long pgLast; private boolean pgDragOn, pgAnim;
    private ScreenCore.Item pgHit; private String trainPosCache = "";
    private final ScreenCore.Item pgSc = new ScreenCore.Item();
    private final RectF pgRect = new RectF();
    private static boolean isPager(ScreenCore.Item it) { return it.kind == ScreenCore.K_PANEL && it.pgN > 0 && it.sc2.length() > 0; }
    private ScreenCore.Item pagerAt(float px, float py) {
        if (lay == null || sceneFailed) return null;
        float x = px / dpr, y = py / dpr;
        if (y < lay.headH || (lay.footH > 0f && y >= footTop())) return null;
        float by = y - lay.headH + scrollY;
        for (ScreenCore.Item it : lay.body) if (isPager(it) && x >= it.x && x < it.x + it.w && by >= it.y && by < it.y + it.h) return it;
        return null;
    }
    private boolean hasPager() { if (lay == null) return false; for (ScreenCore.Item it : lay.body) if (isPager(it)) return true; return false; }
    /** 넘기는 중이 아니면 목표 쪽으로 부드럽게 다가간다(0=혼잡도 · 1=객실). */
    private float pgStep(long now) {
        long dt = pgLast == 0L ? 16L : Math.min(50L, now - pgLast); pgLast = now;
        if (pgDragOn) return pgPos;
        float tgt = pgPage;
        if (pgPos == tgt && Math.abs(pgPage) >= 2) { int k = (pgPage / 2) * 2; pgPage -= k; pgPos -= k; tgt = pgPage; }     // 두 쪽이 돌고 도니 수가 커지지 않게 짝수 칸씩 되돌린다
        if (pgPos != tgt) { pgPos += (tgt - pgPos) * Math.min(1f, dt / 70f); if (Math.abs(tgt - pgPos) < 0.004f) pgPos = tgt; pgAnim = pgPos != tgt; }
        return pgPos;
    }
    /** 두 쪽 카드에서 객실 장면(둘째 쪽)이 보이는 정도(0~1) — 미는 위치(pgPos)에서 바로 계산한다. 제목줄이 이 값으로 글을 바꿔 보인다. */
    private float pgSceneShare() {
        float o = pgPos; int base = (int) Math.floor(o); float fr = o - base; int pa = ((base % 2) + 2) % 2;
        return Math.max(0f, Math.min(1f, pa == 1 ? 1f - fr : fr));
    }
    /** 두 쪽 카드 그리기: 틀(둥근 카드)은 그대로 두고 안쪽만 가로로 민다. 0쪽=원래 칸들(혼잡도), 1쪽=객실 장면. 두 쪽이 끝없이 돈다(왼쪽·오른쪽 어느 쪽으로 밀어도 다음 쪽). 반환: 건너뛸 칸 수. */
    private int drawPager(Canvas cv, ScreenCore.Item pn, int i, long now) {
        float o = pgStep(now);
        drawItem(cv, pn);
        cv.save();
        cv.clipRect(pn.x + 1f, pn.y + 1f, pn.x + pn.w - 1f, pn.y + pn.h - 1f);
        int base = (int) Math.floor(o); float fr = o - base;
        int pa = ((base % 2) + 2) % 2, pb = 1 - pa;                          // 지금 왼쪽에 걸친 쪽 · 오른쪽에서 들어오는 쪽
        drawPgPage(cv, pn, i, pa, -fr * pn.w);
        if (fr > 0f) drawPgPage(cv, pn, i, pb, (1f - fr) * pn.w);
        cv.restore();
        float sc = pa == 1 ? 1f - fr : fr;                                    // 객실 장면이 보이는 정도(0~1)
        float cx = pn.x + pn.w / 2f, cy = pn.y + pn.h - 6f;
        p.setStyle(Paint.Style.FILL);
        for (int d = 0; d < 2; d++) {
            float on = d == 0 ? 1f - sc : sc;
            p.setColor(alpha(sc > 0.5f ? 0xFFFFFFFF : pal[R_SUB], 0.35f + 0.55f * on));
            cv.drawCircle(cx + (d == 0 ? -5f : 5f), cy, 2.2f + 0.8f * on, p);
        }
        return pn.pgN;
    }
    private void drawPgPage(Canvas cv, ScreenCore.Item pn, int i, int which, float dx) {
        cv.save(); cv.translate(dx, 0f);
        if (which == 0) {
            for (int k = 1; k <= pn.pgN && i + k < lay.body.length; k++) drawItem(cv, lay.body[i + k]);
        } else {
            float in = 7f;
            pgSc.kind = ScreenCore.K_SCENE; pgSc.value = pn.sc2; pgSc.x = pn.x + in; pgSc.y = pn.y + in; pgSc.w = pn.w - in * 2f; pgSc.h = pn.h - in * 2f; pgSc.radius = 10f;
            drawScene(cv, pgSc);
        }
        cv.restore();
    }

    private SceneDriver scene;
    private String sceneJson = "";
    private boolean sceneFailed, sceneDrawn, sceneTouch;
    private float sceneL, sceneT, sceneW, sceneH;          // 마지막으로 그린 장면 자리(화면 dp)
    private final Path sceneClip = new Path();
    private final RectF sceneRect = new RectF();

    private boolean darkNow() {
        int c = pal[R_BG];
        return (0.299f * ((c >> 16) & 255) + 0.587f * ((c >> 8) & 255) + 0.114f * (c & 255)) < 128f;
    }
    private void drawScene(Canvas cv, ScreenCore.Item it) {
        if (sceneFailed || it.value.length() == 0) return;
        if (scene == null) {
            scene = new SceneDriver(getContext(), new SceneDriver.Listener() {
                @Override public void onReady() { invalidate(); }
                @Override public void onError(String message) { sceneFailed = true; invalidate(); }
                @Override public void onHeld() { }
                @Override public void onHot(boolean hot) { }
            });
            scene.load();
        }
        scene.layout(it.w, it.h, dpr, darkNow());
        if (!it.value.equals(sceneJson)) { sceneJson = it.value; scene.apply(sceneJson); trainPosCache = null; }
        if ("train".equals(scene.mode())) {                                                  // 객실 장면: 탑승 엔진의 시각표(pos.segs)와 지금 시각만 건네 준다 — 달림/섬은 그 시각의 함수
            TrainFeed tf = trainFeed; String pj = tf != null ? tf.pos() : "";
            if (!pj.equals(trainPosCache)) { trainPosCache = pj; scene.core().trainPos(pj); }
            scene.core().trainClock(System.currentTimeMillis());
        }
        sceneDrawn = true; sceneL = it.x; sceneW = it.w; sceneH = it.h;
        sceneT = it.y + lay.headH - scrollY;
        if (!scene.isLoaded()) return;
        scene.frame(System.nanoTime());
        cv.save();
        sceneRect.set(it.x, it.y, it.x + it.w, it.y + it.h);
        sceneClip.rewind(); sceneClip.addRoundRect(sceneRect, it.radius, it.radius, Path.Direction.CW);
        cv.clipPath(sceneClip);
        cv.translate(it.x, it.y);
        cv.scale(1f / dpr, 1f / dpr);                      // 장면은 화면 픽셀 좌표로 그린다(밀도는 SceneCore 가 안다)
        scene.draw(cv);
        cv.restore();
        String tg = scene.core().tag();                                                        // 웹 .cs-tag: 왼쪽 위 작은 알약(🌙 밤 …)
        if (tg != null && tg.length() > 0) {
            setText(10.5f, true, pal[R_WHITE]);
            float tw = tp.measureText(tg) + 18f;
            rf.set(it.x + 8f, it.y + 7f, it.x + 8f + tw, it.y + 27f);
            p.setStyle(Paint.Style.FILL); p.setColor(0xF20C1222); cv.drawRoundRect(rf, 10f, 10f, p);                    // 구름 위에서도 구름과 섞이지 않게 거의 불투명하게 + 밝은 테두리로 떼어 놓는다
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(0x66FFFFFF); rf2.set(rf.left + 0.5f, rf.top + 0.5f, rf.right - 0.5f, rf.bottom - 0.5f); cv.drawRoundRect(rf2, 9.5f, 9.5f, p);
            p.setStyle(Paint.Style.FILL);
            cv.drawText(tg, it.x + 17f, base(it.y + 7f, 20f, 0), tp);
        }
        p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(pal[R_BORDER]);       // 웹 .cong-scene 의 1px 테두리
        rf2.set(it.x + 0.5f, it.y + 0.5f, it.x + it.w - 0.5f, it.y + it.h - 0.5f); cv.drawRoundRect(rf2, it.radius - 0.5f, it.radius - 0.5f, p);
        p.setStyle(Paint.Style.FILL);
    }
    // ───────────── 경로 탐색 로딩: 뛰어가는 캐릭터(웹 #transitLoading · 순수 장식 — 계산은 RunnerCore, 글은 엔진) ─────────────
    private boolean runDrawn;
    // 무지개 테두리(웹 preview-glow, 3초에 한 바퀴): 한 번 만든 스윕 그라데이션을 행렬로만 돌린다. 그리는 동안 이 카드 자리만 화면 박자로 다시 그린다.
    private final android.graphics.SweepGradient glowSh = new android.graphics.SweepGradient(0f, 0f,
        new int[] { 0xFFFF9500, 0xFFFF3B30, 0xFFFF2D95, 0xFFA24BFF, 0xFF0A84FF, 0xFF30D158, 0xFFFFD60A, 0xFFFF9500 }, null);
    private final android.graphics.Matrix glowMx = new android.graphics.Matrix();
    private float glX0, glY0, glX1, glY1; private boolean glowDrawn;
    private float tdX0, tdY0, tdX1, tdY1; private long tdFullT;      // 세부경로 현재위치 점의 맥박 자리(본문 dp) · 마지막으로 화면 전체를 다시 그린 때 — 점 자리만 초당 30번, 전체는 1초에 한 번
    private boolean hrDrawn;                       // 구간 타임라인에 '지금 칸' 점이 보이는 중(고리가 숨 쉰다)
    private boolean tdDrawn, tdAct;                    // 세부경로 줄이 보이는 중 · 그중 지금 가는 구간이 있는 중
    private final Path tdTri = new Path();             // 펼침 동그라미 안 ▾
    private static String runPrev = "";
    private String runId = ""; private long runT0, runLast, runBorn;
    private final RectF runDst = new RectF();
    private final Rect runSrc = new Rect();
    /** 8 그림 · 8 비움 점선(새 객체 없이). off 만큼 오른쪽으로 밀린다. */
    private void dashLine(Canvas cv, float x0, float x1, float y, float off) {
        for (float x = x0 - 16f + off; x < x1; x += 16f) { float a = Math.max(x0, x), b = Math.min(x1, x + 8f); if (b > a) cv.drawLine(a, y, b, y, p); }
    }
    private final Runnable runReady = new Runnable() { @Override public void run() { invalidate(); } };
    private void drawRunner(Canvas cv, ScreenCore.Item it) {
        long now = SystemClock.uptimeMillis();
        if (runId.length() == 0 || now - runLast > 400L) {                                   // 새로 보이기 시작 — 방금 나온 것이 아닌 캐릭터를 하나 뽑는다
            runId = RunnerCore.pick(runPrev, Math.random()); runPrev = runId; runT0 = now; runBorn = now;
            RunnerArt.warm(getContext(), runId, new Handler(Looper.getMainLooper()), new RunnerArt.Ready() { @Override public void onSheet() { post(runReady); } });
        }
        runLast = now;
        float wc = it.w, hc = ScreenCore.RUN_TRACK_H;
        RunnerCore.Frame f = RunnerCore.at(runId, now - runT0, wc);
        if (f.done) {                                                                            // 화면을 다 가로질렀다 → 다음 캐릭터
            runId = RunnerCore.pick(runId, Math.random()); runPrev = runId; runT0 = now;
            f = RunnerCore.at(runId, 0L, wc);
        }
        String key = f.intro ? runId + "_intro" : runId;
        Bitmap sheet = RunnerArt.get(key);
        long t = now - runBorn;
        int lineCol = pal[R_BORDER2];
        if (sheet != null) {
            RunnerCore.Spec d = RunnerCore.spec(runId);
            float sc = (float) (d.cell / 256d), gy = it.y + hc - 12f;
            float gx = it.x;
            cv.save(); cv.clipRect(it.x, it.y, it.x + it.w, it.y + hc);
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(2f); p.setColor(lineCol);                                  // 바닥 점선(웹 dashoffset -t·40: 초당 40dp 로 흐른다)
            dashLine(cv, it.x, it.x + it.w, gy + 3f, ((t / 1000f) * 40f) % 16f);
            p.setStyle(Paint.Style.FILL);
            p.setColor(0x33000000);                                                              // 그림자
            float sw = (float) (d.cell * d.sh);
            rf.set(gx + f.shadowX - sw / 2f, gy + 3f - 3f, gx + f.shadowX + sw / 2f, gy + 3f + 3f); cv.drawOval(rf, p);
            int col = f.idx % 4, row = f.idx / 4;
            runSrc.set(col * 256, row * 256, col * 256 + 256, row * 256 + 256);
            float left = gx + f.x - (float) (d.ox * sc), top = gy + 3f - (float) d.lift - (float) (d.base * sc);
            runDst.set(left, top, left + (float) d.cell, top + (float) d.cell);
            cv.drawBitmap(sheet, runSrc, runDst, bmpPaint);
            cv.restore();
        } else {                                                                                 // 시트를 아직 못 읽었다 → 굴러가는 바퀴
            float tx = it.x + (it.w - RunnerCore.WHEEL_TRACK_W) / 2f, ty = it.y + (hc - RunnerCore.WHEEL_TRACK_H) / 2f;
            float cy = ty + RunnerCore.WHEEL_TRACK_H / 2f + 1f;
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(2f); p.setColor(lineCol);
            dashLine(cv, tx, tx + RunnerCore.WHEEL_TRACK_W, ty + RunnerCore.WHEEL_TRACK_H, 0f);
            cv.save(); cv.clipRect(tx, ty - 4f, tx + RunnerCore.WHEEL_TRACK_W, ty + RunnerCore.WHEEL_TRACK_H + 4f);
            float wx = tx + RunnerCore.wheelX(t, RunnerCore.WHEEL_TRACK_W) + 12f;
            p.setColor(pal[R_GOLD]); p.setStrokeWidth(3f); cv.drawCircle(wx, cy - 2f, 10f, p);
            cv.save(); cv.rotate(RunnerCore.wheelRot(t), wx, cy - 2f); p.setStrokeWidth(2f); cv.drawLine(wx - 10f, cy - 2f, wx + 10f, cy - 2f, p); cv.restore();
            cv.restore();
            p.setStyle(Paint.Style.FILL);
        }
        // 제목 + 말줄임표 점 3개(0.2초씩 늦게 깜박) · 안내 글
        float ty0 = it.y + hc + ScreenCore.RUN_TTL_GAP;
        setText(14f, true, pal[R_TEXT]);
        float tw = tp.measureText(it.label), dw = tp.measureText("."), all = tw + dw * 3f, x0 = it.x + (it.w - all) / 2f;
        float by = base(ty0, ScreenCore.RUN_TTL_H, 0);
        cv.drawText(it.label, x0, by, tp);
        for (int i = 0; i < 3; i++) {
            tp.setColor(alpha(pal[R_TEXT], RunnerCore.dotAlpha(t, i)));
            cv.drawText(".", x0 + tw + dw * i, by, tp);
        }
        if (it.value.length() > 0) {
            setText(11f, false, pal[R_SUB]); tp.setTextAlign(Paint.Align.CENTER);
            cv.drawText(it.value, it.x + it.w / 2f, base(ty0 + ScreenCore.RUN_TTL_H + ScreenCore.RUN_SUB_GAP, ScreenCore.RUN_SUB_H, 0), tp);
            tp.setTextAlign(Paint.Align.LEFT);
        }
        runDrawn = true;
    }
    // ───────────── 맨 위 흐르는 문구(문구 목록은 엔진이 정한 값 · 앱은 오른쪽에서 왼쪽으로 흘리며 색을 돌리기만) ─────────────
    private boolean skelDrawn;
    private boolean lbDrawn; private long lbT0;
    /** 불러오는 중 막대: 제목 · 0→100% 로 차오르는 막대 · 퍼센트. 받는 시간은 알 수 없어 시간으로 천천히 차오르게 그린다(99% 에서 멈춰 기다리다, 받으면 이 줄이 내용으로 바뀐다). 새 객체 없이 그린다. */
    private void drawLbar(Canvas cv, ScreenCore.Item it) {
        long now = SystemClock.uptimeMillis();
        if (lbT0 == 0L) lbT0 = now;
        lbDrawn = true;
        float pr = Math.min(0.99f, 1f - (float) Math.exp(-(now - lbT0) / 1800f));
        float bw = Math.min(it.w - 56f, 260f), bx = it.x + (it.w - bw) / 2f, by = it.y + 38f;
        p.setStyle(Paint.Style.FILL);
        setText(14f, true, pal[R_TEXT]); tp.setTextAlign(Paint.Align.CENTER);
        cv.drawText(it.label, it.x + it.w / 2f, base(it.y + 8f, 22f, 0), tp);
        skr.set(bx, by, bx + bw, by + 8f); p.setColor(pal[R_BORDER]); cv.drawRoundRect(skr, 4f, 4f, p);
        skr.set(bx, by, bx + Math.max(8f, bw * pr), by + 8f); p.setColor(pal[R_GOLD]); cv.drawRoundRect(skr, 4f, 4f, p);
        setText(12f, true, pal[R_GOLD]); tp.setTextAlign(Paint.Align.CENTER);
        cv.drawText(Math.round(pr * 100f) + "%", it.x + it.w / 2f, base(it.y + 52f, 18f, 0), tp);
        if (it.value != null && it.value.length() > 0) { setText(11.5f, false, pal[R_SUB]); cv.drawText(it.value, it.x + it.w / 2f, base(it.y + 66f, 16f, 0), tp); }
        tp.setTextAlign(Paint.Align.LEFT);
    }
    private final RectF skr = new RectF();
    /** 스켈레톤: 카드 모양 자리표시가 숨 쉬듯 옅어졌다 짙어진다(1.3초). 새 객체 없이 그린다. */
    private void drawSkel(Canvas cv, ScreenCore.Item it) {
        float ph = (SystemClock.uptimeMillis() % 1300L) / 1300f;
        float pulse = 0.5f + 0.5f * (float) Math.sin(ph * 6.2831853f);
        int bar = (pal[R_BORDER] & 0x00FFFFFF) | (((int) (110f + 100f * pulse)) << 24);
        int rows = Math.round(it.f1);
        float y = it.y;
        if ("map".equals(it.value)) {
            p.setStyle(Paint.Style.FILL); p.setColor(bar);
            skr.set(it.x, y, it.x + it.w, y + ScreenCore.SKEL_MAP_H); cv.drawRoundRect(skr, 14f, 14f, p);
            y += ScreenCore.SKEL_MAP_H + ScreenCore.SKEL_GAP;
        }
        boolean cards = "cards".equals(it.value);
        float rh = cards ? ScreenCore.SKEL_CARD_H : ScreenCore.SKEL_ROW_H;
        for (int i = 0; i < rows; i++) {
            p.setStyle(Paint.Style.FILL); p.setColor(pal[R_CARD]);
            skr.set(it.x, y, it.x + it.w, y + rh); cv.drawRoundRect(skr, 14f, 14f, p);
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(pal[R_BORDER]); cv.drawRoundRect(skr, 14f, 14f, p);
            p.setStyle(Paint.Style.FILL); p.setColor(bar);
            if (cards) {
                skr.set(it.x + 14f, y + 14f, it.x + it.w * 0.55f, y + 28f); cv.drawRoundRect(skr, 6f, 6f, p);
                skr.set(it.x + 14f, y + 44f, it.x + it.w - 14f, y + 58f); cv.drawRoundRect(skr, 6f, 6f, p);
                skr.set(it.x + 14f, y + 68f, it.x + it.w * 0.8f, y + 82f); cv.drawRoundRect(skr, 6f, 6f, p);
                skr.set(it.x + 14f, y + 98f, it.x + 96f, y + 118f); cv.drawRoundRect(skr, 10f, 10f, p);
            } else {
                cv.drawCircle(it.x + 14f + 18f, y + rh / 2f, 18f, p);
                skr.set(it.x + 62f, y + 16f, it.x + 62f + (it.w - 90f) * 0.62f, y + 30f); cv.drawRoundRect(skr, 6f, 6f, p);
                skr.set(it.x + 62f, y + 40f, it.x + 62f + (it.w - 90f) * 0.9f, y + 52f); cv.drawRoundRect(skr, 6f, 6f, p);
            }
            y += rh + ScreenCore.SKEL_GAP;
        }
        skelDrawn = true;
    }
    private boolean marqDrawn;
    private boolean mqDrawn;                          // 놀이터 자리를 남기고 흐르는 긴 이름이 보이는 중
    private long mqT0;                               // 흐름 시작 시각(새 화면이 올라온 때)
    private String marqSrc = "";
    private String[] marqMsgs = new String[0];
    private int marqIdx;
    private String marqCur = "";
    private float marqTw = -1f;
    private long marqT0;
    private final Paint mqp = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Matrix mqm = new Matrix();
    private LinearGradient mqGrad, mqFadeL, mqFadeR;
    private float mqFadeW = -1f; private int mqFadeBg = 0;
    private static final int C_ORANGE2 = 0xFFFF9F0A, C_BLUE2 = 0xFF2F7CF6;
    private void drawMarq(Canvas cv, ScreenCore.Item it) {
        if (!it.value.equals(marqSrc)) {                                   // 새 목록: 지금 흐르는 문구는 끝까지 보여 주고 다음부터 새 목록
            marqSrc = it.value; marqMsgs = it.value.split("\n");
            if (marqCur.length() == 0) { marqIdx = 0; marqCur = marqMsgs[0]; marqTw = -1f; marqT0 = SystemClock.uptimeMillis(); }
        }
        if (marqCur.length() == 0) return;
        long now = SystemClock.uptimeMillis();
        mqp.setTypeface(face(true)); mqp.setTextSize(13.5f * dpr);
        if (marqTw < 0f) {
            marqTw = mqp.measureText(marqCur) / dpr;
            mqGrad = new LinearGradient(0f, 0f, marqTw * 3f * dpr, 0f, new int[] { pal[R_GOLD], C_ORANGE2, C_BLUE2, pal[R_GOLD] }, null, Shader.TileMode.REPEAT);
        }
        float pass = Math.max(3000f, it.f1), span = it.w + marqTw, frac = (now - marqT0) / pass;
        if (frac >= 1f) {                                                  // 한 바퀴 다 흘렀다 → 다음 문구
            marqIdx = (marqIdx + 1) % marqMsgs.length; marqCur = marqMsgs[marqIdx]; marqTw = -1f; marqT0 = now; marqDrawn = true;
            return;
        }
        float x = it.x + it.w - frac * span;
        float phase = ((now % (long) Math.max(1000f, it.f2)) / Math.max(1000f, it.f2)) * 2f;           // 6초에 두 번 도는 색(옛 웹 hdrGrad 와 같은 속도)
        mqm.setTranslate((x - phase * marqTw * 3f) * dpr, 0f);
        mqGrad.setLocalMatrix(mqm);
        cv.save();
        cv.clipRect(it.x, it.y, it.x + it.w, it.y + it.h);
        mqp.setShader(mqGrad);
        cv.save(); cv.scale(1f / dpr, 1f / dpr);                           // 글자는 화면 픽셀로 그린다(위 scale(dpr) 를 되돌림)
        Paint.FontMetrics fm = mqp.getFontMetrics();
        cv.drawText(marqCur, x * dpr, (it.y + it.h / 2f) * dpr - (fm.ascent + fm.descent) / 2f, mqp);
        cv.restore();
        mqp.setShader(null);
        // 양끝 8% 는 서서히 사라지게(옛 웹 mask-image)
        float fw = it.w * 0.08f; int bg = bgNow();
        if (mqFadeL == null || fw != mqFadeW || bg != mqFadeBg) {
            mqFadeW = fw; mqFadeBg = bg;
            mqFadeL = new LinearGradient(it.x, 0f, it.x + fw, 0f, bg, bg & 0x00FFFFFF, Shader.TileMode.CLAMP);
            mqFadeR = new LinearGradient(it.x + it.w - fw, 0f, it.x + it.w, 0f, bg & 0x00FFFFFF, bg, Shader.TileMode.CLAMP);
        }
        mqp.setStyle(Paint.Style.FILL);
        mqp.setShader(mqFadeL); cv.drawRect(it.x, it.y, it.x + fw, it.y + it.h, mqp);
        mqp.setShader(mqFadeR); cv.drawRect(it.x + it.w - fw, it.y, it.x + it.w, it.y + it.h, mqp);
        mqp.setShader(null);
        cv.restore();
        marqDrawn = true;
        if (it.on) {                                                       // 아래 구분선
            mqp.setStyle(Paint.Style.STROKE); mqp.setStrokeWidth(1f); mqp.setColor(pal[R_BORDER]);
            cv.drawLine(0f, getHeight() / dpr - 0.5f, getWidth() / dpr, getHeight() / dpr - 0.5f, mqp);
            mqp.setStyle(Paint.Style.FILL);
        }
    }


    // ───────────── 주변 정류장 카드 끌어서 순서 바꾸기(웹 _busReorderEnter · _bdBeginDrag · _bdMove · _bdEnd · .bus-reorder-mode · busJiggle) ─────────────
    //  꾹(0.42초) 누르면 편집 모드: 카드가 흔들리고(.24초 ±0.8°) 위에 '끌어서 순서 변경 [완료]' 줄이 뜬다. 끌면 그 카드가 손가락을 따라오고(1.03배 + 그림자) 다른 카드는 .18초쯤에 한 칸씩 비킨다.
    //  목록 위·아래 끝(90dp)에 닿으면 목록이 따라 밀린다. 놓으면 새 순서(정류장 열쇠 목록)를 앱에 알린다 — 저장하고 다시 그리는 것은 앱 · 엔진(글도 엔진이 준 것: 첫 카드의 rol · rod).
    //  새 화면이 오면(엔진이 새 순서로 다시 그린 것) 끌던 상태는 끝난다.
    public interface ReorderHost { void onReorder(String[] keys, int[] perm); }
    private ReorderHost reorderHost;
    public void setReorderHost(ReorderHost h) { reorderHost = h; }
    private static final long RO_LP_MS = 420L, RO_SETTLE_MAX_MS = 1500L;
    private static final float RO_EDGE = 90f, RO_MAXV = 18f, RO_ZOOM = 1.03f;
    private boolean roMode, dragOn, settleOn, dgCommit, roAnim, roBtnDown;
    private ScreenCore.Item[] dgCards = new ScreenCore.Item[0];            // 주변 정류장 카드들(위 → 아래)
    private int dgIdx = -1, dgTo = -1;
    private float dgDown, dgY, dgScroll0, dgDyCur, dgSlot, dgScaleCur = 1f, dgGap = 12f;
    private float[] shCur = new float[0], shTgt = new float[0];            // 다른 카드가 비킨 정도(dp): 지금 · 목표
    private long dgT;
    private float roBx0, roBy0, roBx1, roBy1, roBtx0, roBty0, roBtx1, roBty1;       // 완료 줄 · 그 안의 완료 단추(dp, 화면 기준)
    private final Runnable lpRun = new Runnable() { @Override public void run() {
        if (mode != 3 || pressed == null || lay == null || pressed.kind != ScreenCore.K_BCARD || !"near".equals(pressed.value) || !roEnabled()) return;
        ScreenCore.Item it = pressed; pressed = null;
        roMode = true;
        performHapticFeedback(android.view.HapticFeedbackConstants.LONG_PRESS);
        downT = 0L;                                                        // 꾹 누른 뒤 놓는 것은 '누름'이 아니다
        if (roBegin(it, downY)) mode = 7; else mode = 0;
        invalidate();
    } };
    private final Runnable roGuard = new Runnable() { @Override public void run() { if (settleOn) { roReset(); invalidate(); } } };     // 새 화면이 끝내 안 오면 제자리로
    private boolean roEnabled() { return reorderHost != null && dgCards.length >= 2 && dgCards[0].rol != null && dgCards[0].rol.length() > 0; }
    /** 새 화면이 왔다: 끌던 상태를 끝내고 주변 정류장 카드 목록을 다시 모은다. 카드가 둘 미만이면 편집 모드도 끝. */
    private void roSync() {
        roReset();
        if (reorderHost == null || lay == null) { dgCards = new ScreenCore.Item[0]; roMode = false; return; }
        int n = 0;
        for (ScreenCore.Item q : lay.body) if (q.kind == ScreenCore.K_BCARD && "near".equals(q.value)) n++;
        if (n < 2) { dgCards = new ScreenCore.Item[0]; roMode = false; return; }
        ScreenCore.Item[] a = new ScreenCore.Item[n]; int k = 0;
        for (ScreenCore.Item q : lay.body) if (q.kind == ScreenCore.K_BCARD && "near".equals(q.value)) a[k++] = q;
        dgCards = a;
        dgGap = Math.max(0f, a[1].y - (a[0].y + a[0].h));
        if (!roEnabled()) roMode = false;
    }
    private void roReset() {
        ui.removeCallbacks(roGuard);
        dragOn = false; settleOn = false; dgCommit = false; roAnim = false; dgIdx = -1; dgTo = -1; dgDyCur = 0f; dgSlot = 0f; dgScaleCur = 1f;
        for (int i = 0; i < shCur.length; i++) { shCur[i] = 0f; shTgt[i] = 0f; }
    }
    private boolean roBegin(ScreenCore.Item it, float yPx) {
        int idx = -1;
        for (int i = 0; i < dgCards.length; i++) if (dgCards[i] == it) idx = i;
        if (idx < 0) return false;
        ui.removeCallbacks(roGuard);
        if (shCur.length != dgCards.length) { shCur = new float[dgCards.length]; shTgt = new float[dgCards.length]; }
        else for (int i = 0; i < shCur.length; i++) { shCur[i] = 0f; shTgt[i] = 0f; }
        dgIdx = idx; dgTo = idx; dgDown = yPx; dgY = yPx; dgScroll0 = scrollY; dgDyCur = 0f; dgSlot = 0f; dgScaleCur = RO_ZOOM;
        dragOn = true; settleOn = false; dgCommit = false; dgT = SystemClock.uptimeMillis();
        return true;
    }
    /** 손가락 · 목록 밀림에 맞춰 끌린 카드의 자리와 놓을 칸(dgTo)을 다시 정하고, 다른 카드가 비킬 목표를 계산한다. */
    private void roUpdate() {
        if (!dragOn || dgIdx < 0) return;
        ScreenCore.Item d = dgCards[dgIdx];
        float dy = (dgY - dgDown) / dpr + (scrollY - dgScroll0);        // 손가락이 움직인 만큼 + 그동안 목록이 밀린 만큼
        dgDyCur = dy;
        float c = d.y + d.h / 2f + dy;
        int ti = 0;
        for (int i = 0; i < dgCards.length; i++) if (i != dgIdx && dgCards[i].y + dgCards[i].h / 2f < c) ti++;
        dgTo = ti;
        roTargets();
    }
    /** 끌린 카드를 dgTo 칸에 끼운 새 순서로 위에서부터 쌓았을 때 카드마다 있어야 할 자리(높이가 달라도 맞다). */
    private void roTargets() {
        float y = dgCards[0].y; int n = dgCards.length, k = 0;
        for (int slot = 0; slot < n; slot++) {
            int who;
            if (slot == dgTo) who = dgIdx; else { while (k == dgIdx) k++; who = k++; }
            if (who == dgIdx) dgSlot = y - dgCards[who].y; else shTgt[who] = y - dgCards[who].y;
            y += dgCards[who].h + dgGap;
        }
    }
    private void roEnd(boolean commit) {
        if (!dragOn) return;
        dragOn = false; settleOn = true; dgT = SystemClock.uptimeMillis(); dgCommit = false;
        if (commit && dgTo != dgIdx && reorderHost != null) {
            int n = dgCards.length, k = 0;
            int[] perm = new int[n]; String[] keys = new String[n];
            for (int slot = 0; slot < n; slot++) {
                int who;
                if (slot == dgTo) who = dgIdx; else { while (k == dgIdx) k++; who = k++; }
                perm[slot] = who; keys[slot] = dgCards[who].key;
            }
            dgCommit = true;
            ui.removeCallbacks(roGuard); ui.postDelayed(roGuard, RO_SETTLE_MAX_MS);
            performHapticFeedback(android.view.HapticFeedbackConstants.KEYBOARD_TAP);
            reorderHost.onReorder(keys, perm);
        } else { dgTo = dgIdx; roTargets(); }                           // 제자리로 돌아간다
        invalidate();
    }
    /** 완료 줄·끌기 중의 손가락. mode 6 = 완료 줄(또는 놓은 뒤 기다리는 중)을 누르는 중 · mode 7 = 카드를 끄는 중. */
    private boolean roTouch(MotionEvent e) {
        float x = e.getX(), y = e.getY();
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_MOVE:
                if (mode == 7) { dgY = y; roUpdate(); invalidate(); }
                return true;
            case MotionEvent.ACTION_UP:
                if (mode == 7) {
                    if (dgIdx >= 0 && Math.abs(y - dgDown) <= slop && SystemClock.uptimeMillis() - downT < 600L && listener != null && lay != null) {       // 안 움직이고 바로 뗐다 = 그냥 누름
                        ScreenCore.Item it = dgCards[dgIdx]; roEnd(false); finishTouch(); tapBcard(it, x / dpr, y / dpr - lay.headH + scrollY); invalidate(); return true;
                    }
                    roEnd(true);
                } else if (mode == 6 && roBtnDown && roEnabled() && x / dpr >= roBtx0 && x / dpr <= roBtx1 && y / dpr >= roBty0 - 8f && y / dpr <= roBty1 + 8f) { roMode = false; roReset(); }
                roBtnDown = false; finishTouch(); invalidate(); return true;
            case MotionEvent.ACTION_CANCEL:
                if (mode == 7) roEnd(false);
                roBtnDown = false; finishTouch(); invalidate(); return true;
            default: return true;
        }
    }
    /** 손가락이 닿았다: 편집 모드에서 완료 줄이면 눌림 시작, 주변 카드면 바로 끌기 시작. 먹었으면 true. */
    private boolean roDown(float x, float y) {
        float dx = x / dpr, dy = y / dpr;
        if (settleOn) { mode = 6; roBtnDown = false; pressed = null; return true; }              // 놓은 뒤 새 화면이 올 때까지 잠깐 손가락을 받지 않는다
        if (roEnabled() && dy >= roBy0 && dy <= roBy1 && dx >= roBx0 && dx <= roBx1) {
            mode = 6; pressed = null; downT = SystemClock.uptimeMillis();
            roBtnDown = dx >= roBtx0 && dx <= roBtx1 && dy >= roBty0 - 8f && dy <= roBty1 + 8f;
            return true;
        }
        if (dy < lay.headH || (lay.footH > 0f && dy >= footTop())) return false;
        ScreenCore.Item it = findItem(x, y);
        if (it != null && it.kind == ScreenCore.K_BCARD && "near".equals(it.value) && roBegin(it, y)) { mode = 7; pressed = null; downT = SystemClock.uptimeMillis(); invalidate(); return true; }
        return false;
    }
    /** 프레임마다: 끌 때는 가장자리 자동 스크롤 · 비키는 카드 이동, 놓은 뒤에는 제자리로 앉기. */
    private void roStep(long now) {
        roAnim = false;
        if (!(dragOn || settleOn) || dgIdx < 0 || dgCards.length == 0) return;
        float dt = Math.min(64f, Math.max(1f, now - dgT)), k = 1f - (float) Math.exp(-dt / 55f);       // 약 .18초에 따라붙는다(웹 transform .18s)
        dgT = now;
        boolean busy = false;
        if (dragOn) {
            float top = lay.headH, bot = getHeight() / dpr - lay.footH, fy = dgY / dpr, v = 0f;
            if (fy < top + RO_EDGE) v = -RO_MAXV * Math.min(1f, (top + RO_EDGE - fy) / RO_EDGE);
            else if (fy > bot - RO_EDGE) v = RO_MAXV * Math.min(1f, (fy - (bot - RO_EDGE)) / RO_EDGE);
            if (v != 0f) scrollY = ScreenCore.clamp(scrollY + v * dt / 16.7f, lay.bodyMaxScroll(bodyViewH()));
            roUpdate(); busy = true;
        } else {
            dgDyCur += (dgSlot - dgDyCur) * k; dgScaleCur += (1f - dgScaleCur) * k;
            if (Math.abs(dgSlot - dgDyCur) > 0.3f || Math.abs(1f - dgScaleCur) > 0.002f) busy = true; else { dgDyCur = dgSlot; dgScaleCur = 1f; }
        }
        for (int i = 0; i < shCur.length; i++) {
            float d = shTgt[i] - shCur[i];
            if (Math.abs(d) > 0.3f) { shCur[i] += d * k; busy = true; } else shCur[i] = shTgt[i];
        }
        if (settleOn && !dgCommit && !busy) { roReset(); return; }                                 // 제자리로 앉았다
        roAnim = busy;
    }
    /** 편집 모드의 카드: 끄는 중이면 비킨 만큼 옮겨 그리고(끌리는 카드는 맨 위에 따로), 아니면 흔들며 그린다. */
    private void drawBcardRo(Canvas cv, ScreenCore.Item it) {
        if (!roMode || !"near".equals(it.value)) { drawBcard(cv, it); return; }
        boolean drag = dragOn || settleOn;
        int idx = -1;
        if (drag) { for (int i = 0; i < dgCards.length; i++) if (dgCards[i] == it) idx = i; if (idx == dgIdx) return; }
        cv.save();
        if (drag) { if (idx >= 0 && idx < shCur.length) cv.translate(0f, shCur[idx]); }
        else {
            float deg = -0.8f * (float) Math.cos(2.0 * Math.PI * (SystemClock.uptimeMillis() % 240L) / 240.0);             // 웹 busJiggle .24초 ±0.8°
            cv.rotate(deg, it.x + it.w / 2f, it.y + it.h / 2f); roAnim = true;
        }
        drawBcard(cv, it);
        cv.restore();
    }
    private void roDrawDragged(Canvas cv) {
        if (dgIdx < 0 || dgIdx >= dgCards.length) return;
        ScreenCore.Item it = dgCards[dgIdx];
        float cx = it.x + it.w / 2f, cy = it.y + it.h / 2f;
        cv.save();
        cv.translate(0f, dgDyCur);
        float sh = Math.max(0f, Math.min(1f, (dgScaleCur - 1f) / (RO_ZOOM - 1f)));                      // 그림자는 떠 있는 동안만(웹 box-shadow 0 10px 26px)
        if (sh > 0.02f) {
            p.setStyle(Paint.Style.FILL);
            for (int i = 6; i >= 1; i--) {
                float e = 2f + i * 4f;
                p.setColor(((int) (13f * sh)) << 24);
                rf.set(it.x - e + 2f, it.y + 4f - e + 6f, it.x + it.w + e - 2f, it.y + it.h + 16f + e - 6f);
                cv.drawRoundRect(rf, it.radius + e, it.radius + e, p);
            }
        }
        cv.scale(dgScaleCur, dgScaleCur, cx, cy);
        drawBcard(cv, it);
        cv.restore();
    }
    /** 위에 붙어 있는 '끌어서 순서 변경 [완료]' 줄(웹 #busReorderBar: sticky · 카드 바탕 · 테두리 · 파란 완료 단추). 글은 엔진이 준 것. */
    private void roDrawBar(Canvas cv, float w) {
        String lbl = dgCards[0].rol, done = dgCards[0].rod;
        float x0 = 12f, x1 = w - 12f, y0 = lay.headH + 8f, y1 = y0 + 46f;
        roBx0 = x0; roBy0 = y0; roBx1 = x1; roBy1 = y1;
        float bw = measurer.width(done, 13f, true) + 32f;
        roBtx1 = x1 - 12f; roBtx0 = roBtx1 - bw; roBty0 = y0 + 8f; roBty1 = y1 - 8f;
        p.setStyle(Paint.Style.FILL); p.setColor(0x16000000); rf.set(x0, y0 + 2f, x1, y1 + 3f); cv.drawRoundRect(rf, 12f, 12f, p);
        p.setColor(pal[R_CARD]); rf.set(x0, y0, x1, y1); cv.drawRoundRect(rf, 12f, 12f, p);
        p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(pal[R_BORDER]); rf.set(x0 + 0.5f, y0 + 0.5f, x1 - 0.5f, y1 - 0.5f); cv.drawRoundRect(rf, 12f, 12f, p);
        p.setStyle(Paint.Style.FILL); p.setColor(0xFF2F7CF6); rf.set(roBtx0, roBty0, roBtx1, roBty1); cv.drawRoundRect(rf, 8f, 8f, p);
        setText(13f, false, pal[R_SUB]); cv.drawText(lbl, x0 + 12f, base(y0, y1 - y0, 0), tp);
        setText(13f, true, 0xFFFFFFFF); tp.setTextAlign(Paint.Align.CENTER); cv.drawText(done, (roBtx0 + roBtx1) / 2f, base(roBty0, roBty1 - roBty0, 0), tp); tp.setTextAlign(Paint.Align.LEFT);
    }

    // ───────────── 버스: 토글 줄 · 정류장 카드(내용·모양·색은 엔진, 앱은 그리기) ─────────────
    private static final int C_BLUE = 0xFF0066FF, C_SOON = 0xFFE74C3C, C_NOARR = 0xFFA0A0A5;
    private boolean bcAnim, arAnim, spAnim;
    private long spUntil;
    private static final float SP_MS = 520f;
    /** 이 시각까지 오는 새 화면(같은 화면의 새 응답)은 내용이 바뀐 칸만 스프링으로 나타나게 한다 — 새 경로가 아니라 같은 경로의 실시간 반영일 때 부른다. */
    public void springChanges(long ms) { spUntil = SystemClock.uptimeMillis() + Math.max(0L, ms); }
    private static String itemFp(ScreenCore.Item q) {
        StringBuilder b = new StringBuilder(96);
        b.append(q.kind).append('|').append(q.key).append('|').append(q.value).append('|').append(q.label).append('|').append(q.badge).append('|').append(q.tag).append('|').append(q.time).append('|').append(q.dk).append(q.gk).append(q.ps ? 'p' : '-').append(q.hr ? 'h' : '-').append('|').append(q.color).append('|').append(q.bg).append('|').append(q.sig).append('|').append(q.t1).append('|').append(q.t2).append('|').append(q.t3).append('|').append(q.dist).append('|').append(q.go).append('|').append(q.stars).append('|').append(q.rank);
        for (String s : q.lines) b.append('\n').append(s);
        for (String s : q.lines2) b.append('\u0001').append(s);
        for (String s : q.sa) b.append('\u0002').append(s);
        b.append('\u0003').append(q.lmt);
        return b.toString();
    }
    private static void fpAdd(java.util.HashMap<String, Integer> m, ScreenCore.Item[] arr) {
        for (ScreenCore.Item q : arr) { String k = itemFp(q); Integer c = m.get(k); m.put(k, c == null ? 1 : c + 1); }
    }
    /** 이전 배치에 없던 내용의 칸만 표시한다. 칸의 절반 넘게 새것이면(다른 화면) 표시하지 않는다. */
    private void markChanged(java.util.HashMap<String, Integer> old, long now) {
        if (lay == null || old == null || old.isEmpty()) return;
        ScreenCore.Item[][] parts = { lay.head, lay.body, lay.foot };
        int total = 0, fresh = 0;
        java.util.ArrayList<ScreenCore.Item> hit = new java.util.ArrayList<ScreenCore.Item>();
        for (ScreenCore.Item[] arr : parts) for (ScreenCore.Item q : arr) {
            total++;
            String k = itemFp(q); Integer c = old.get(k);
            if (c != null && c > 0) { old.put(k, c - 1); continue; }
            fresh++; hit.add(q);
        }
        if (fresh == 0 || fresh * 2 > total) return;
        for (ScreenCore.Item q : hit) q.sp = now;
        invalidate();
    }

    private long arSq, arT0;                                   // 버튼 줄 전환 연출: 마지막으로 본 전환 시각 · 시작한 시계
    private final float[] arF = new float[20];
    // ── 새 말풍선 등장 애니메이션(웹 .chat-bubble.anim-l/anim-r: 0.34초 · 타인은 왼쪽에서, 내 글은 오른쪽에서 24px 미끄러지며 나타남). 처음 그린 화면·다른 화면으로 바뀐 뒤 처음에는 쓰지 않는다(기존 글은 다시 움직이지 않음).
    private final java.util.HashSet<String> msgSeen = new java.util.HashSet<String>();
    private final java.util.HashMap<String, Long> msgBorn = new java.util.HashMap<String, Long>();
    private boolean msgAnimOn;
    private static final long MSG_ANIM_MS = 340L;
    private static String msgKey(ScreenCore.Item q) { return q.act != null && q.act.id != null && q.act.id.length() > 0 ? "i:" + q.act.id : "t:" + (q.on ? 1 : 0) + (q.lines != null && q.lines.length > 0 ? q.lines[0] : "") + "|" + q.label; }
    private void trackMsgs(boolean keepScroll) {
        java.util.HashSet<String> now = new java.util.HashSet<String>();
        if (lay != null) for (ScreenCore.Item q : lay.body) if (q.kind == ScreenCore.K_MSG) now.add(msgKey(q));
        if (keepScroll && !msgSeen.isEmpty() && !now.isEmpty()) {
            java.util.ArrayList<String> fresh = new java.util.ArrayList<String>();
            for (String k : now) if (!msgSeen.contains(k)) fresh.add(k);
            if (fresh.size() > 0 && fresh.size() <= 3) { long t = SystemClock.uptimeMillis(); for (String k : fresh) msgBorn.put(k, t); invalidate(); }         // 한꺼번에 많이 바뀌면(처음 불러오기) 움직이지 않는다
        } else msgBorn.clear();
        msgSeen.clear(); msgSeen.addAll(now);
    }
    private final Set<String> seenCards = new HashSet<String>(), seenRows = new HashSet<String>();
    private String seenMode = "";
    private android.graphics.Path bellPath;
    /** 새로 올라온 정류장 카드·노선 줄에 등장 시작 시각을 붙인다(이미 본 열쇠는 조용히 — 웹: 처음 그릴 때만 펼친다). */
    // ── 버스 도착 초 카운트다운(웹 _BUSARR · _busArrKeep · _busCdTick): 엔진이 준 남은 초(sec)를 받은 순간부터 1초마다 줄여 그린다.
    //    새 화면이 와도 흐르던 값과 45초 이내면 '같은 차'로 보고 시작점을 이어 가서 숫자가 튀지 않는다. 오래 된 캐시 화면은 그만큼 이미 흐른 것으로 친다(setSourceAge).
    private final Map<String, double[]> cdState = new HashMap<String, double[]>();     // 열쇠 → {시작 초, 시작 시각(uptime ms)}
    private long srcAgeMs = 0L, pendAgeMs = 0L;
    private boolean cdDrawn, cdFresh;       // cdFresh: 새 화면이 막 올라왔다 — 이때만 카운트다운 시작점을 새 값으로 잡는다(지도 만지기·크기 바뀜 같은 다시 배치는 흐르던 값을 건드리지 않는다)
    /** 다음에 올리는 화면이 받은 지 몇 ms 된 것인지(캐시 화면 · 0 이면 방금 받은 것). 한 번 쓰면 0 으로 돌아간다. */
    public void setSourceAge(long ms) { srcAgeMs = Math.max(0L, ms); }
    private void markCountdowns(long now) {
        boolean fresh = cdFresh; cdFresh = false;
        long age = fresh ? pendAgeMs : 0L; if (fresh) pendAgeMs = 0L;
        if (cdState.size() > 400) { for (java.util.Iterator<Map.Entry<String, double[]>> ii = cdState.entrySet().iterator(); ii.hasNext(); ) if (now - (long) ii.next().getValue()[1] > 600000L) ii.remove(); }
        for (ScreenCore.Item it : lay.body) {
            if (it.kind != ScreenCore.K_BCARD || it.bs.length == 0) continue;
            for (int k = 0; k < it.bs.length; k++) {
                float sec = it.bs[k];
                if (sec <= 0f || it.ck[k] == null) continue;
                if (fresh || !cdState.containsKey(it.ck[k])) cdState.put(it.ck[k], new double[] { sec, now - age });      // 새로 받은 실시간 값이 오면 줄어들던 옛 값은 버리고 바로 그 값에서 다시 센다
            }
        }
    }
    private double cdRem(String key, float sec0, long now) {
        double[] st = key == null ? null : cdState.get(key);
        return st == null ? sec0 : st[0] - (now - (long) st[1]) / 1000.0;
    }
    private void markBcards() {
        if (lay == null) return;
        long now = SystemClock.uptimeMillis();
        markCountdowns(now);
        boolean any = false;
        int order = 0;                                                      // 이번에 처음 나온 카드의 차례(뼈대 위에 첫 정류장부터 아래로 하나씩 스프링으로 내려앉는다)
        for (ScreenCore.Item it : lay.body) {
            if (it.kind != ScreenCore.K_BCARD) continue;
            if (!any) { any = true; if (!seenMode.equals(it.value)) { seenCards.clear(); seenRows.clear(); cardLn.clear(); rowLn.clear(); cardY.clear(); seenMode = it.value; } }
            double[] cy = cardY.get(it.key);                                 // 위 카드에 줄이 생겨 키가 커지면 아래 카드가 한 번에 튀지 않고 옛 자리에서 스프링으로 내려온다
            if (cy == null) cardY.put(it.key, new double[] { it.y, 0.0, 0.0, now });
            else {
                double off0 = 0.0;
                if (cy[2] > 0.0) { float f0 = (float) ((now - (long) cy[2]) / CARD_SPRING_MS); if (f0 < 1f) off0 = cy[1] * (1f - spring(f0 < 0f ? 0f : f0)); }
                double d = cy[0] + off0 - it.y;
                boolean moved = Math.abs(it.y - cy[0]) > 1.5;
                if (now - (long) cy[3] < 3000L) { if (moved && Math.abs(d) > 1.5) { cy[1] = Math.max(-240.0, Math.min(240.0, d)); cy[2] = now; } }
                else { cy[1] = 0.0; cy[2] = 0.0; }
                cy[0] = it.y; cy[3] = now;
                it.yo = (float) cy[1]; it.yt = (long) cy[2];
            }
            long rowBase = now;
            if (seenCards.add(it.key)) { it.ln = now + CARD_STAGGER_MS * Math.min(order, 8); order++; rowBase = it.ln + 140L; cardLn.put(it.key, it.ln); }
            else { Long c0 = cardLn.get(it.key); if (c0 != null) { if (now - c0 < 1200L) it.ln = c0; else cardLn.remove(it.key); } }          // 내려앉는 도중에 화면이 다시 와도(도착정보가 하나씩 채워질 때) 멈추지 않고 이어서
            for (int i = 0; i < it.rt.length; i++) {
                String rk = it.key + "|" + it.sa[i * 6] + "|" + it.sa[i * 6 + 1];
                if (seenRows.add(rk)) { it.rt[i] = rowBase + 55L * i; rowLn.put(rk, it.rt[i]); }
                else { Long r0 = rowLn.get(rk); if (r0 != null) { if (now - r0 < 1200L) it.rt[i] = r0; else rowLn.remove(rk); } }
            }
        }
        if (!any) { seenCards.clear(); seenRows.clear(); cardLn.clear(); rowLn.clear(); cardY.clear(); seenMode = ""; }
    }

    // ───────────── 노선 상세(웹 .brs-*) ─────────────
    private static final int C_UP = 0xFF00B341, C_DOWN = 0xFFFF9F0A, C_NA = 0xFF2F7CF6, C_ME = 0xFFFF3B30;
    private final float[] brxPing = new float[32];         // 맥박이 도는 버스·내 위치 마커의 자리(영역 dp: 왼, 위, 오른, 아래)
    private int brxPingN;
    private static int brCls(String k) { return "up".equals(k) ? C_UP : "down".equals(k) ? C_DOWN : C_NA; }
    private void tapBrh(ScreenCore.Item pi, float xdp) {
        blurInput();
        for (int z = 0; z < pi.za.length && z * 4 + 3 < pi.zs.length; z++) {
            if (pi.za[z] != null && xdp >= pi.zs[z * 4] - 4f && xdp < pi.zs[z * 4] + pi.zs[z * 4 + 2] + 4f) { listener.onAction(pi.za[z]); return; }
        }
    }
    private void pill(Canvas cv, float x, float y, float w, float h, int fill, int stroke) {
        rf.set(x, y, x + w, y + h);
        p.setStyle(Paint.Style.FILL); p.setColor(fill); cv.drawRoundRect(rf, h / 2f, h / 2f, p);
        if (stroke != 0) { p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(stroke); rf2.set(x + 0.5f, y + 0.5f, x + w - 0.5f, y + h - 0.5f); cv.drawRoundRect(rf2, h / 2f, h / 2f, p); p.setStyle(Paint.Style.FILL); }
    }
    private void drawBrx(Canvas cv, ScreenCore.Item it) {
        float x = it.x, y = it.y, w = it.w, h = it.h;
        String d = it.dk;
        if ("h".equals(d)) {
            p.setStyle(Paint.Style.FILL); p.setColor(pal[R_CARD]); cv.drawRect(x, y, x + w, y + h, p);
            float by = y + (h - ScreenCore.BR_BADGE_H) / 2f;
            rf.set(x + ScreenCore.BR_PADX, by, x + ScreenCore.BR_PADX + it.badgeW, by + ScreenCore.BR_BADGE_H);
            p.setColor(cc(it.fill, C_NA)); cv.drawRoundRect(rf, 8f, 8f, p);
            setText(15f, true, 0xFFFFFFFF); tp.setTextAlign(Paint.Align.CENTER);
            cv.drawText(it.lines[0], x + ScreenCore.BR_PADX + it.badgeW / 2f, base(by, ScreenCore.BR_BADGE_H, 0), tp);
            tp.setTextAlign(Paint.Align.LEFT);
            if (it.t1.length() > 0) { setText(12f, false, pal[R_SUB]); cv.drawText(it.t1, x + ScreenCore.BR_PADX + it.badgeW + 8f, base(y, h, 0), tp); }
            tp.setTextAlign(Paint.Align.CENTER);
            setText(18f, false, pal[R_SUB]); cv.drawText("\u21BB", it.zs[0] + it.zs[2] / 2f, base(y, h, 0), tp);
            setText(17f, false, pal[R_SUB]); cv.drawText("\u2715", it.zs[4] + it.zs[6] / 2f, base(y, h, 0), tp);
            tp.setTextAlign(Paint.Align.LEFT);
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(pal[R_BORDER]); cv.drawLine(x, y + h - 0.5f, x + w, y + h - 0.5f, p); p.setStyle(Paint.Style.FILL);
            return;
        }
        if ("t".equals(d)) {
            p.setStyle(Paint.Style.FILL); p.setColor(pal[R_CARD]); cv.drawRect(x, y, x + w, y + h, p);
            setText(it.size, true, pal[R_TEXT]); cv.drawText(it.lines[0], x + ScreenCore.BR_PADX, base(y + 12f, 20f, 0), tp);
            setText(it.size, true, pal[R_SUB]); cv.drawText("\u2192", it.f1, base(y + 12f, 20f, 0), tp);
            setText(it.size, true, pal[R_TEXT]); cv.drawText(it.t1, it.f2, base(y + 12f, 20f, 0), tp);
            if (it.tag.length() > 0) {
                int c = brCls(it.value);
                pill(cv, it.sx, y + 13f, it.sw, 18f, alpha(c, 0.14f), 0);
                setText(11f, true, c); tp.setTextAlign(Paint.Align.CENTER); cv.drawText(it.tag, it.sx + it.sw / 2f, base(y + 13f, 18f, 0), tp); tp.setTextAlign(Paint.Align.LEFT);
            }
            float chH = ScreenCore.BR_CHIP * 1.3f + ScreenCore.BR_CHIP_PY * 2f;
            for (int i = 0; i < it.sa.length; i++) {
                String k = it.ck[i]; int tc = "on".equals(k) ? C_NA : "me".equals(k) ? C_ME : pal[R_SUB];
                int fl = "on".equals(k) ? alpha(C_NA, 0.12f) : "me".equals(k) ? alpha(C_ME, 0.12f) : pal[R_BG], st = "on".equals(k) ? alpha(C_NA, 0.25f) : "me".equals(k) ? alpha(C_ME, 0.25f) : pal[R_BORDER];
                float cx = it.gf[i * 3], cy = y + it.gf[i * 3 + 1], cw = it.gf[i * 3 + 2];
                pill(cv, cx, cy, cw, chH, fl, st);
                setText(ScreenCore.BR_CHIP, true, tc); tp.setTextAlign(Paint.Align.CENTER); cv.drawText(it.sa[i], cx + cw / 2f, base(cy, chH, 0), tp); tp.setTextAlign(Paint.Align.LEFT);
            }
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(pal[R_BORDER]); cv.drawLine(x, y + h - 0.5f, x + w, y + h - 0.5f, p); p.setStyle(Paint.Style.FILL);
            return;
        }
        if ("c".equals(d)) {
            int c = brCls(it.value);
            p.setStyle(Paint.Style.FILL); p.setColor(pal[R_BG]); cv.drawRect(x, y, x + w, y + h, p);
            setText(13f, true, c); cv.drawText("\u25BC", x + ScreenCore.BR_PADX, base(y, h, 0), tp);
            setText(12.5f, true, pal[R_TEXT]); cv.drawText(it.lines[0], it.f1, base(y, h, 0), tp);
            setText(12.5f, false, pal[R_SUB]); cv.drawText(" \uBC29\uBA74", it.f2, base(y, h, 0), tp);
            if (it.tag.length() > 0) {
                pill(cv, it.sx, y + (h - 18f) / 2f, it.sw, 18f, alpha(c, 0.14f), 0);
                setText(11f, true, c); tp.setTextAlign(Paint.Align.CENTER); cv.drawText(it.tag, it.sx + it.sw / 2f, base(y + (h - 18f) / 2f, 18f, 0), tp); tp.setTextAlign(Paint.Align.LEFT);
            }
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(pal[R_BORDER]); cv.drawLine(x, y + h - 0.5f, x + w, y + h - 0.5f, p); p.setStyle(Paint.Style.FILL);
            return;
        }
        if ("n".equals(d)) {
            pill(cv, it.sx, y + (h - 22f) / 2f, it.sw, 22f, alpha(C_DOWN, 0.14f), alpha(C_DOWN, 0.30f));
            setText(ScreenCore.BR_CHIP, true, C_DOWN); tp.setTextAlign(Paint.Align.CENTER); cv.drawText(it.lines[0], it.sx + it.sw / 2f, base(y + (h - 22f) / 2f, 22f, 0), tp); tp.setTextAlign(Paint.Align.LEFT);
            return;
        }
        // s — 정류장 줄
        int cls = brCls(it.value);
        float rh = h - 1f, cy = y + rh / 2f, rx = x + ScreenCore.BR_RAIL_X;
        p.setStyle(Paint.Style.FILL);
        if (it == pressed) { p.setColor(pal[R_CARD2]); cv.drawRect(x, y, x + w, y + h, p); }
        else if ("s".equals(it.tag)) { p.setColor(alpha(C_DOWN, 0.14f)); cv.drawRect(x, y, x + w, y + h, p); }
        else if ("p".equals(it.tag)) { p.setColor(alpha(C_NA, 0.14f)); cv.drawRect(x, y, x + w, y + h, p); }
        else if (it.top) { p.setColor(alpha(C_ME, 0.09f)); cv.drawRect(x, y, x + w, y + h, p); }
        else if (it.on) { p.setColor(alpha(C_NA, 0.08f)); cv.drawRect(x, y, x + w, y + h, p); }
        float lt = it.go.indexOf('f') >= 0 ? cy : y, lb = it.go.indexOf('l') >= 0 ? cy : y + h;
        p.setColor(cls); cv.drawRect(rx - 2.5f, lt, rx + 2.5f, lb, p);
        boolean bus = "bus".equals(it.badge), me = "me".equals(it.badge);
        if (!bus && !me) {
            p.setColor(cls); cv.drawCircle(rx, cy, 6.5f, p); p.setColor(0xFFFFFFFF); cv.drawCircle(rx, cy, 4.5f, p);
            if (it.pub) { setText(7f, true, 0xFFFFFFFF); tp.setTextAlign(Paint.Align.CENTER); cv.drawText("\u25BC", rx, base(y + h - 12f, 10f, 0), tp); tp.setTextAlign(Paint.Align.LEFT); }
        } else if (bus) {
            long t = SystemClock.uptimeMillis() % 1100L; float ph = t / 1100f;
            p.setColor(alpha(C_NA, 0.45f * (1f - ph))); cv.drawCircle(rx, cy, 10.5f * (1f + 1.4f * ph), p);       // 웹 brsBusPing: 퍼지며 사라지는 고리
            float sc = 1f + 0.15f * (float) Math.sin(ph * Math.PI);
            p.setColor(C_NA); cv.drawCircle(rx, cy, 10.5f * sc, p);
            p.setColor(0xFFFFFFFF); rf.set(rx - 4.5f, cy - 5f, rx + 4.5f, cy + 4f); cv.drawRoundRect(rf, 2f, 2f, p);               // 버스 몸통
            p.setColor(C_NA); cv.drawRect(rx - 3.2f, cy - 3.4f, rx + 3.2f, cy - 0.6f, p);
            p.setColor(0xFFFFFFFF); cv.drawCircle(rx - 2.4f, cy + 4.6f, 1.2f, p); cv.drawCircle(rx + 2.4f, cy + 4.6f, 1.2f, p);
            if (brxPingN < 8) { float pr = 10.5f * 2.6f; int k = brxPingN++ * 4; brxPing[k] = rx - pr; brxPing[k + 1] = cy - pr; brxPing[k + 2] = rx + pr; brxPing[k + 3] = cy + pr; }
        } else {
            if (brxPingN < 8) { float pr = 8.5f * 2.7f; int k = brxPingN++ * 4; brxPing[k] = rx - pr; brxPing[k + 1] = cy - pr; brxPing[k + 2] = rx + pr; brxPing[k + 3] = cy + pr; }
            long t = SystemClock.uptimeMillis() % 1600L; float ph = t / 1600f;
            p.setColor(alpha(C_ME, 0.5f * (1f - ph))); cv.drawCircle(rx, cy, 8.5f * (1f + 1.7f * ph), p);               // 웹 brsMePulse
            p.setColor(0xFFFFFFFF); cv.drawCircle(rx, cy, 9f, p); p.setColor(C_ME); cv.drawCircle(rx, cy, 6.5f, p);
            p.setColor(0xFFFFFFFF); cv.drawCircle(rx, cy, 2.5f, p);
        }
        float bx = x + ScreenCore.BR_BODY_X, ty = y + ScreenCore.BR_ROW_PY;
        setText(it.size, true, it.top ? C_ME : it.on ? C_NA : pal[R_TEXT]);
        cv.drawText(it.lines[0], bx, base(ty, 20f, 0), tp);
        ty += 20f;
        if (it.t1.length() > 0) { setText(ScreenCore.BR_ID, false, pal[R_SUB]); cv.drawText(it.t1, bx, base(ty + 3f, 15f, 0), tp); ty += 18f; }
        for (int i = 0; i < it.sa.length; i++) { setText(ScreenCore.BR_NOTE, true, "me".equals(it.ck[i]) ? C_ME : C_NA); cv.drawText(it.sa[i], bx, base(ty, 17f, 0), tp); ty += 17f; }
        if (it.label.length() > 0) {
            if ("s".equals(it.tag)) { pill(cv, it.sx, cy - 9f, it.sw, 18f, alpha(C_DOWN, 0.22f), 0); setText(ScreenCore.BR_LAB, true, 0xFFC77700); }
            else setText(ScreenCore.BR_LAB, true, alpha(C_NA, 0.9f));
            tp.setTextAlign(Paint.Align.CENTER); cv.drawText(it.label, it.sx + it.sw / 2f, base(cy - 9f, 18f, 0), tp); tp.setTextAlign(Paint.Align.LEFT);
        }
        p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(pal[R_BORDER]); cv.drawLine(bx, y + h - 0.5f, x + w - ScreenCore.BR_PADX, y + h - 0.5f, p); p.setStyle(Paint.Style.FILL);
    }

    private void drawBtog(Canvas cv, ScreenCore.Item it) {
        boolean under = "u".equals(it.value), refresh = "r".equals(it.value);
        if (it.top) {                                                        // 줄 바탕 + 아래 선(첫 단추가 한 번 그린다)
            p.setStyle(Paint.Style.FILL); p.setColor(under ? pal[R_CARD] : pal[R_BG]);
            cv.drawRect(it.sx, it.sy, it.sx + it.sw, it.sy + it.sh, p);
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(pal[R_BORDER]);
            cv.drawLine(it.sx, it.sy + it.sh - 0.5f, it.sx + it.sw, it.sy + it.sh - 0.5f, p);
            p.setStyle(Paint.Style.FILL);
        }
        boolean pr = it == pressed;
        if (under) {
            if (pr) { p.setColor(0x14808080); cv.drawRect(it.x, it.y, it.x + it.w, it.y + it.h, p); }
            setText(14f, true, it.on ? pal[R_TEXT] : pal[R_SUB]); tp.setTextAlign(Paint.Align.CENTER);
            cv.drawText(it.label, it.x + it.w / 2f, base(it.y, it.h - 2f, 0), tp);
            tp.setTextAlign(Paint.Align.LEFT);
            if (it.on) { p.setColor(pal[R_GOLD]); cv.drawRect(it.x, it.y + it.h - 2f, it.x + it.w, it.y + it.h, p); }
            return;
        }
        rf.set(it.x, it.y, it.x + it.w, it.y + it.h);
        boolean on = it.on && !refresh;
        p.setStyle(Paint.Style.FILL); p.setColor(on ? C_BLUE : pal[R_CARD]); cv.drawRoundRect(rf, it.radius, it.radius, p);
        if (pr) { p.setColor(0x14808080); cv.drawRoundRect(rf, it.radius, it.radius, p); }
        p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(on ? C_BLUE : pal[R_BORDER]);
        rf2.set(it.x + 0.5f, it.y + 0.5f, it.x + it.w - 0.5f, it.y + it.h - 0.5f); cv.drawRoundRect(rf2, it.radius - 0.5f, it.radius - 0.5f, p);
        p.setStyle(Paint.Style.FILL);
        setText(refresh ? 15f : 13f, !refresh, on ? 0xFFFFFFFF : pal[R_SUB]); tp.setTextAlign(Paint.Align.CENTER);
        cv.drawText(it.label, it.x + it.w / 2f, base(it.y, it.h, 0), tp);
        tp.setTextAlign(Paint.Align.LEFT);
    }
    private static float ease(float f) { return 1f - (1f - f) * (1f - f); }
    private void drawBcard(Canvas cv, ScreenCore.Item it) {
        long now = SystemClock.uptimeMillis();
        float a = 1f, dy = 0f;
        if (it.ln > 0L) {                                                    // 카드 등장: 위에서 18dp 스프링으로 내려앉으며(살짝 지나쳤다 되돌아) 나타남 .56초 — 첫 정류장부터 차례로
            float f = (now - it.ln) / CARD_SPRING_MS;
            if (f < 1f) { a = f <= 0f ? 0f : Math.min(1f, f * 3.2f); dy = f <= 0f ? -18f : -18f * (1f - spring(f)); bcAnim = true; }
        }
        if (it.yt > 0L && it.yo != 0f) { float fy = (now - it.yt) / CARD_SPRING_MS; if (fy < 1f) { dy += it.yo * (1f - spring(fy < 0f ? 0f : fy)); bcAnim = true; } }
        boolean layer = a < 1f;
        if (layer) cv.saveLayerAlpha(it.x - 4f, it.y - 4f + dy, it.x + it.w + 4f, it.y + it.h + 4f + dy, Math.round(255f * a));
        cv.save(); cv.translate(0f, dy);
        float x = it.x, y = it.y, w = it.w, h = it.h, r = it.radius;
        rf.set(x, y, x + w, y + h);
        p.setStyle(Paint.Style.FILL); p.setColor(pal[R_CARD]); cv.drawRoundRect(rf, r, r, p);
        if (it.on) { p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(2f); p.setColor(0x330066FF); rf2.set(x - 1f, y - 1f, x + w + 1f, y + h + 1f); cv.drawRoundRect(rf2, r + 1f, r + 1f, p); }   // 웹 .bus-card-on 바깥 테두리 2px
        p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(it.on ? C_BLUE : pal[R_BORDER]);
        rf2.set(x + 0.5f, y + 0.5f, x + w - 0.5f, y + h - 0.5f); cv.drawRoundRect(rf2, r - 0.5f, r - 0.5f, p);
        p.setStyle(Paint.Style.FILL);
        // 머리: 번호 배지
        if (it.badge.length() > 0) {
            float bcx = x + 1f + ScreenCore.BC_PADX + ScreenCore.BC_BADGE / 2f, bcy = y + 1f + ScreenCore.BC_PADT + ScreenCore.BC_BADGE / 2f;
            p.setColor(C_BLUE); cv.drawCircle(bcx, bcy, ScreenCore.BC_BADGE / 2f, p);
            setText(11f, true, 0xFFFFFFFF); tp.setTextAlign(Paint.Align.CENTER);
            cv.drawText(it.badge, bcx, base(bcy - 7f, 14f, 0), tp); tp.setTextAlign(Paint.Align.LEFT);
        }
        setText(it.size, true, pal[R_TEXT]);
        for (int k = 0; k < it.lines.length; k++) cv.drawText(it.lines[k], it.textX, base(it.textY + k * it.lineH, it.lineH, 0), tp);
        if (it.t1.length() > 0) { setText(ScreenCore.BC_ORIG, true, pal[R_SUB]); cv.drawText(it.t1, it.f1, base(it.f2, it.lineH, 0), tp); }
        if (it.lmt.length() > 0) { setText(ScreenCore.BC_LM, true, pal[R_GOLD]); cv.drawText(it.lmt, it.lx, base(it.ly, it.lh, 0), tp); }
        // 머리 오른쪽: 거리 알약 · ★/× · 🗺️ · ✏️
        if (it.go.length() > 0) {
            rf.set(it.sx, it.sy, it.sx + it.sw, it.sy + ScreenCore.BC_DIST_H);
            p.setColor(pal[R_BG]); cv.drawRoundRect(rf, 11f, 11f, p);
            setText(ScreenCore.BC_DIST, false, pal[R_SUB]); tp.setTextAlign(Paint.Align.CENTER);
            cv.drawText(it.go, it.sx + it.sw / 2f, base(it.sy, ScreenCore.BC_DIST_H, 0), tp); tp.setTextAlign(Paint.Align.LEFT);
        }
        if (it.zs.length >= 12) {
            tp.setTextAlign(Paint.Align.CENTER);
            if (it.zs[2] > 0f) {
                boolean near = "s".equals(it.dk);
                if (near) setText(16f, false, it.top ? pal[R_GOLD] : pal[R_SUB]); else setText(20f, false, pal[R_SUB]);
                cv.drawText(near ? (it.top ? "\u2605" : "\u2606") : "\u00D7", it.zs[0] + it.zs[2] / 2f, base(it.zs[1], it.zs[3], 0), tp);
            }
            if (it.zs[10] > 0f) { setText(13f, false, alpha(pal[R_TEXT], 0.7f)); cv.drawText("\uD83D\uDDFA\uFE0F", it.zs[8] + it.zs[10] / 2f, base(it.zs[9], it.zs[11], 0), tp); }
            if (it.zs[6] > 0f) { setText(12f, false, alpha(pal[R_TEXT], 0.55f)); cv.drawText("\u270F\uFE0F", it.zs[4] + it.zs[6] / 2f, base(it.zs[5], it.zs[7], 0), tp); }
            tp.setTextAlign(Paint.Align.LEFT);
        }
        // 줄
        int rc = it.gf.length / 2;
        if (rc > 0) {
            cv.save();
            rf.set(x, y, x + w, y + h); bcClip.rewind(); bcClip.addRoundRect(rf, r, r, Path.Direction.CW); cv.clipPath(bcClip);
            float rowL = x + 1f + ScreenCore.BC_ROW_PX, bellX = it.f3;
            for (int i = 0; i < rc; i++) {
                float top = y + 1f + it.gf[i * 2], rh = it.gf[i * 2 + 1];
                float ra = 1f, rdy = 0f;
                if (it.rt[i] > 0L) {                                          // 노선 줄 등장: 위에서 10dp 내려오며 나타남 .3초(55ms씩 차례로)
                    float f = (now - it.rt[i]) / ROW_SPRING_MS;                  // 새 버스 줄: 위에서 스프링처럼 내려와(살짝 지나쳤다 되돌아) 자리잡는다
                    if (f < 1f) { ra = f <= 0f ? 0f : Math.min(1f, f * 3f); rdy = f <= 0f ? -16f : -16f * (1f - spring(f)); bcAnim = true; }
                }
                if (ra <= 0f) continue;
                if (ra < 1f) cv.saveLayerAlpha(x, top - 12f, x + w, top + rh + 4f, Math.round(255f * ra));
                cv.save(); cv.translate(0f, rdy);
                p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(pal[R_BORDER2]); cv.drawLine(x + 1f, top + 0.5f, x + w - 1f, top + 0.5f, p); p.setStyle(Paint.Style.FILL);
                float inner = rh - 1f - ScreenCore.BC_ROW_PY * 2f, c0 = top + 1f + ScreenCore.BC_ROW_PY;
                String dir = it.sa[i * 6 + 1];
                float noH = ScreenCore.BC_NO * ScreenCore.BC_NO_LH, leftH = noH + (dir.length() > 0 ? 2f + ScreenCore.BC_DIR * 1.35f : 0f), lt = c0 + (inner - leftH) / 2f;
                setText(ScreenCore.BC_NO, true, cc(it.ca[i], C_BLUE)); cv.drawText(it.sa[i * 6], rowL, base(lt, noH, 0), tp);
                if (dir.length() > 0) { setText(ScreenCore.BC_DIR, true, pal[R_SUB]); cv.drawText(dir, rowL, base(lt + noH + 2f, ScreenCore.BC_DIR * 1.35f, 0), tp); }
                boolean bell = it.gb[i * 3 + 2];
                float xr = bell ? bellX - ScreenCore.BC_ROW_GAP : x + w - 1f - ScreenCore.BC_ROW_PX;
                int ac = it.sa[i * 6 + 4].length() > 0 ? 2 : 1;
                float alh = ScreenCore.BC_ARR * ScreenCore.BC_ARR_LH, rt0 = c0 + (inner - (ac * alh + (ac - 1) * ScreenCore.BC_ARR_GAP)) / 2f;
                for (int k = 0; k < ac; k++) {
                    String tm = it.sa[i * 6 + 2 + k * 2], cn = it.sa[i * 6 + 3 + k * 2];
                    boolean soonNow = it.gb[i * 3 + k];
                    if (it.bs.length > i * 2 + k && it.bs[i * 2 + k] > 0f) {                                  // 초 카운트다운: 받은 뒤 흐른 만큼 줄인 값을 그린다
                        double rem = cdRem(it.ck[i * 2 + k], it.bs[i * 2 + k], now);
                        tm = ScreenCore.cdFmt(rem); soonNow = rem <= 60.0; cdDrawn = true;
                    }
                    float ay = rt0 + k * (alh + ScreenCore.BC_ARR_GAP), rx = xr;
                    if (cn.length() > 0) {
                        setText(ScreenCore.BC_CNT, true, pal[R_SUB]); tp.setTextAlign(Paint.Align.RIGHT);
                        cv.drawText(cn, rx, base(ay, alh, 0), tp); tp.setTextAlign(Paint.Align.LEFT);
                        rx -= tp.measureText(cn) + ScreenCore.BC_CNT_GAP;
                    }
                    setText(ScreenCore.BC_ARR, true, soonNow ? C_SOON : pal[R_TEXT]); tp.setTextAlign(Paint.Align.RIGHT);
                    cv.drawText(tm, rx, base(ay, alh, 0), tp); tp.setTextAlign(Paint.Align.LEFT);
                }
                if (bell) drawBell(cv, bellX, top + 1f + (rh - 1f - ScreenCore.BC_BELL) / 2f);
                cv.restore();
                if (ra < 1f) cv.restore();
            }
            cv.restore();
        } else if (it.t2.length() > 0) {
            float top = y + 1f + (it.h - 2f) - (1f + ScreenCore.BC_MSG_PY * 2f + ScreenCore.BC_MSG * 1.35f);
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(pal[R_BORDER]); cv.drawLine(x + 1f, top + 0.5f, x + w - 1f, top + 0.5f, p); p.setStyle(Paint.Style.FILL);
            setText(ScreenCore.BC_MSG, false, pal[R_SUB]); tp.setTextAlign(Paint.Align.LEFT);
            cv.drawText(it.t2, x + 1f + ScreenCore.BC_PADX, base(top + 1f + ScreenCore.BC_MSG_PY, ScreenCore.BC_MSG * 1.35f, 0), tp);
            if (it.za.length > 3 && it.za[3] != null && it.zs.length >= 16) {                                  // '다시 시도 ›'
                setText(ScreenCore.BC_MSG, true, 0xFF2F7CF6); tp.setTextAlign(Paint.Align.RIGHT);
                cv.drawText(ScreenCore.BC_RETRY, x + w - 1f - ScreenCore.BC_PADX, base(it.zs[13], it.zs[15], 0), tp); tp.setTextAlign(Paint.Align.LEFT);
            }
        }
        cv.restore();
        if (layer) cv.restore();
    }
    private final Path bcClip = new Path();
    private static final float ROW_SPRING_MS = 520f, CARD_SPRING_MS = 560f;
    private static final long CARD_STAGGER_MS = 90L;
    private final java.util.HashMap<String, Long> cardLn = new java.util.HashMap<String, Long>(), rowLn = new java.util.HashMap<String, Long>();
    private final java.util.HashMap<String, double[]> cardY = new java.util.HashMap<String, double[]>();          // 카드 열쇠 → {마지막 y, 옮겨 올 거리, 시작 시각, 마지막 본 시각}
    /** 감쇠 스프링 0 → 1(중간에 약 15% 지나쳤다가 되돌아와 1 에 닿는다). f = 0..1 */
    private static float spring(float f) { return 1f - (float) (Math.exp(-6.0 * f) * Math.cos(10.0 * f)); }
    /** 벨 아이콘(웹 .map-bus-bell: 22px, 보조색, 투명도 .55). 24x24 칸의 경로를 22px 로 줄여 그린다. */
    private void drawBell(Canvas cv, float x, float y) {
        if (bellPath == null) {
            Path b = new Path();
            b.moveTo(12f, 22f); b.cubicTo(13.1f, 22f, 14f, 21.1f, 14f, 20f); b.lineTo(10f, 20f); b.cubicTo(10f, 21.1f, 10.9f, 22f, 12f, 22f); b.close();
            b.moveTo(18f, 16f); b.lineTo(18f, 11f); b.cubicTo(18f, 7.93f, 16.36f, 5.36f, 13.5f, 4.68f); b.lineTo(13.5f, 4f); b.cubicTo(13.5f, 3.17f, 12.83f, 2.5f, 12f, 2.5f);
            b.cubicTo(11.17f, 2.5f, 10.5f, 3.17f, 10.5f, 4f); b.lineTo(10.5f, 4.68f); b.cubicTo(7.63f, 5.36f, 6f, 7.92f, 6f, 11f); b.lineTo(6f, 16f); b.lineTo(4f, 18f); b.lineTo(4f, 19f); b.lineTo(20f, 19f); b.lineTo(20f, 18f); b.close();
            bellPath = b;
        }
        float sc = ScreenCore.BC_BELL / 24f;
        cv.save(); cv.translate(x, y); cv.scale(sc, sc);
        p.setStyle(Paint.Style.FILL); p.setColor(alpha(pal[R_SUB], 0.55f)); cv.drawPath(bellPath, p);
        cv.restore();
    }

    // ───────────── 타일 지도(핀은 엔진이 정한 값 · 앱은 받은 타일에 그리기만) ─────────────
    private TileLoader tiles;
    private final Runnable tileTick = new Runnable() { @Override public void run() { invalidate(); } };
    private final Path tmClip = new Path();
    private final RectF tmRect = new RectF();
    private String tmValue = "", tmPathStr = ""; private int tmW = -1, tmH = -1;
    private double[] tmPath = new double[0];
    private List<TileMapCore.Pin> tmPins = new ArrayList<TileMapCore.Pin>();
    private TileMapCore.View tmView;
    private int tmFocus = -1, tmFocApplied = -2;           // 고른 핀(앱이 눌림에 바로 · 엔진이 준 값이 바뀌면 그 값) · 엔진이 마지막으로 준 값
    private boolean tmLabel;                               // 고른 핀에 이름표를 단다(핀을 손으로 눌렀을 때만 — 웹 팝업)
    private boolean tmAnimOn;                              // 가운데·확대를 부드럽게 옮기는 중
    private double tmAnimLa0, tmAnimLo0, tmAnimZ0, tmAnimLa1, tmAnimLo1, tmAnimZ1;
    private long tmAnimT0;
    private float tmL, tmT, tmWd, tmHt;                    // 마지막으로 그린 지도 자리(영역 dp)
    private boolean tmLive, tmDrawn;
    private String tmHint = "";
    private static final long TM_ANIM_MS = 260L;
    private final Paint tmp = new Paint(Paint.ANTI_ALIAS_FLAG);
    private LinearGradient tmHintGrad; private float tmHintH = -1f;
    private void drawTmap(Canvas cv, ScreenCore.Item it) {
        int pw = Math.round(it.w * dpr), ph = Math.round(it.h * dpr);
        if (pw <= 0 || ph <= 0) return;
        if (tiles == null) { tiles = TileLoader.get(getContext()); tiles.watch(tileTick); }
        if (!it.value.equals(tmValue) || !it.path.equals(tmPathStr) || pw != tmW || ph != tmH) {
            tmValue = it.value; tmPathStr = it.path; tmW = pw; tmH = ph;
            tmPins = TileMapCore.parsePins(it.value);
            tmPath = TileMapCore.parsePath(it.path);
            tmView = new TileMapCore.View(pw, ph);
            tmView.fit(tmPins, Math.round(34f * dpr), 3, 17);
            if (it.fpad > 0f && !it.on) {                                               // 웹 fitBounds(점들, {padding, maxZoom}) — 정수 배율(Leaflet zoomSnap 1), 핀 하나면 setView(17)
                double kk = Math.log(dpr) / Math.log(2.0), mz = (it.fzmax > 0f ? it.fzmax : 17.0) + kk;
                List<TileMapCore.Pin> fl = new ArrayList<TileMapCore.Pin>(tmPins);
                for (int q = 0; q + 1 < tmPath.length; q += 2) { TileMapCore.Pin pp = new TileMapCore.Pin(); pp.la = tmPath[q]; pp.lo = tmPath[q + 1]; fl.add(pp); }
                tmView.fit(fl, Math.round(it.fpad * dpr), 1.0 + kk, mz);
                if (fl.size() == 1) tmView.zoom = 17.0 + kk;
                else tmView.zoom = Math.min(mz, Math.max(1.0 + kk, Math.floor(tmView.zoom - kk + 1e-6) + kk));
            }
            tmFocApplied = -2; tmAnimOn = false; tmLabel = false;
            vecFresh = true;
            if (vecHost != null && it.on) {                                         // 웹과 같은 맞춤: 핀이 하나면 17배율 · 여럿이면 여백 36px · 최대 17 · 정수 배율(Leaflet zoomSnap 1)
                double kk = Math.log(dpr) / Math.log(2.0);
                tmView.fit(tmPins, Math.round(36f * dpr), 1.0 + kk, 17.0 + kk);
                if (tmPins.size() == 1) tmView.zoom = 17.0 + kk;
                else tmView.zoom = Math.max(1.0 + kk, Math.floor(tmView.zoom - kk + 1e-6) + kk);
            }
        }
        if (tmView == null || tmPins.isEmpty()) return;
        boolean vec = vecHost != null && it.on;
        if (vec) {
            vecPlaced = true;
            vecHost.place(Math.round(it.x * dpr), Math.round(it.y * dpr), pw, ph);
            if (vecFresh) { vecFresh = false; vecHost.setCamera(tmView.cla, tmView.clo, tmView.zoom); }
        }
        long now = SystemClock.uptimeMillis();
        if (it.on && it.ti != tmFocApplied) {                                // 엔진이 고른 핀이 바뀌었다 → 그 핀으로 가운데를 옮긴다(웹 panTo)
            tmFocApplied = it.ti;
            if (tmFocus != it.ti) { tmFocus = it.ti; tmLabel = false; if (it.ti >= 0 && it.ti < tmPins.size()) tmGoTo(tmPins.get(it.ti).la, tmPins.get(it.ti).lo, tmView.zoom); }
        }
        if (tmAnimOn) {
            float f = (now - tmAnimT0) / (float) TM_ANIM_MS;
            if (f >= 1f) { f = 1f; tmAnimOn = false; }
            double e = 1.0 - (1.0 - f) * (1.0 - f);
            tmView.cla = tmAnimLa0 + (tmAnimLa1 - tmAnimLa0) * e; tmView.clo = tmAnimLo0 + (tmAnimLo1 - tmAnimLo0) * e; tmView.zoom = tmAnimZ0 + (tmAnimZ1 - tmAnimZ0) * e;
            tmView.clamp();
            tmDrawn = true;
        }
        tmL = it.x; tmT = it.y; tmWd = it.w; tmHt = it.h; tmLive = it.on; tmHint = it.label;
        if (vec && vecHost.ready()) return;                                           // 벡터 지도(위 덮개)가 보인다 — 핀 · 안내 · 단추는 덮개가 그린다
        cv.save();
        tmRect.set(it.x, it.y, it.x + it.w, it.y + it.h);
        tmClip.rewind(); tmClip.addRoundRect(tmRect, it.radius, it.radius, Path.Direction.CW);
        cv.clipPath(tmClip);
        cv.translate(it.x, it.y);
        cv.scale(1f / dpr, 1f / dpr);
        TileMapArt.draw(cv, tiles, tmView, tmPins, dpr, it.on ? tmFocus : -1, tmLabel, it.on ? now : 0L, tmPath);
        if (it.on) { drawTmapChrome(cv, it.label); tmDrawn = true; }
        cv.restore();
        if (it.top) {                                                        // 아래 구분선(웹 border-bottom)
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(pal[R_BORDER]);
            cv.drawLine(it.x, it.y + it.h - 0.5f, it.x + it.w, it.y + it.h - 0.5f, p);
            p.setStyle(Paint.Style.FILL);
        }
    }
    private void drawTmapChrome(Canvas cv, String label) {
            float hh = 26f * dpr;                                            // 아래 안내 글(웹 #mapBusMapHint): 위로 갈수록 투명한 검정 + 흰 글자
            if (label.length() > 0) {
                if (tmHintGrad == null || tmHintH != hh) { tmHintH = hh; tmHintGrad = new LinearGradient(0f, tmH - hh, 0f, tmH, 0x00000000, 0x73000000, Shader.TileMode.CLAMP); }
                tmp.setStyle(Paint.Style.FILL); tmp.setShader(tmHintGrad); cv.drawRect(0f, tmH - hh, tmW, tmH, tmp); tmp.setShader(null);
                tmp.setColor(0xFFFFFFFF); tmp.setTypeface(face(true)); tmp.setTextSize(11f * dpr); tmp.setTextAlign(Paint.Align.CENTER);
                cv.drawText(label, tmW / 2f, tmH - 8f * dpr, tmp);
                tmp.setTextAlign(Paint.Align.LEFT);
            }
            float bsz = 30f * dpr, bm = 10f * dpr, bx = tmW - bm - bsz, by = tmH - bm - 2f * bsz;          // 확대·축소 단추(웹 Leaflet 줌 컨트롤: 오른쪽 아래 30px 두 칸)
            tmp.setStyle(Paint.Style.FILL); tmp.setColor(0xFFFFFFFF);
            rf.set(bx, by, bx + bsz, by + 2f * bsz); cv.drawRoundRect(rf, 4f * dpr, 4f * dpr, tmp);
            tmp.setStyle(Paint.Style.STROKE); tmp.setStrokeWidth(2f * dpr); tmp.setColor(0x33000000); cv.drawRoundRect(rf, 4f * dpr, 4f * dpr, tmp);
            tmp.setStrokeWidth(dpr); tmp.setColor(0xFFCCCCCC); cv.drawLine(bx, by + bsz, bx + bsz, by + bsz, tmp);
            tmp.setStyle(Paint.Style.FILL); tmp.setColor(0xFF333333); tmp.setTypeface(face(true)); tmp.setTextSize(18f * dpr); tmp.setTextAlign(Paint.Align.CENTER);
            Paint.FontMetrics fm = tmp.getFontMetrics();
            cv.drawText("+", bx + bsz / 2f, by + bsz / 2f - (fm.ascent + fm.descent) / 2f, tmp);
            cv.drawText("\u2212", bx + bsz / 2f, by + bsz * 1.5f - (fm.ascent + fm.descent) / 2f, tmp);
            tmp.setTextAlign(Paint.Align.LEFT);
    }
    // ── 벡터 지도(MapLibre · 웹과 같은 OpenFreeMap Liberty): 화면 글 위에 놓인 MapView 가 타일을 그리고, 핀 · 안내 · 단추는 그 위 덮개가 이 안의 그림 · 누름 계산을 그대로 쓴다.
    //    그림이 준비되기 전(또는 못 받을 때)은 아래 타일 그림이 그대로 보인다.
    public interface VecHost {
        void place(int l, int t, int w, int h);               // 이 자리(이 화면 픽셀)에 지도를 놓는다 · w ≤ 0 이면 숨긴다
        void setCamera(double la, double lo, double zPx);     // 곧바로(움직임 없이) 가운데 · 확대(화면 픽셀 기준 배율)
        void goTo(double la, double lo, double zPx);          // 부드럽게
        boolean ready();
    }
    private VecHost vecHost; private boolean vecPlaced, vecFresh;
    public void setVecHost(VecHost h) { vecHost = h; }
    /** 지도(MapLibre)가 움직였다 — 핀 계산이 같은 가운데 · 배율을 쓰게 맞춘다. */
    void vecCamera(double la, double lo, double zPx) {
        if (tmView == null) return;
        tmView.cla = la; tmView.clo = lo; tmView.zoom = zPx;
    }
    /** 덮개 위 한 점이 핀 · 확대 단추 위인가(그러면 덮개가 받고, 아니면 지도가 받는다). */
    boolean vecHit(float x, float y) {
        if (tmView == null) return false;
        float bsz = 30f * dpr, bm = 10f * dpr, bx = tmW - bm - bsz, by = tmH - bm - 2f * bsz;
        if (x >= bx && x < bx + bsz && y >= by && y < by + 2f * bsz) return true;
        double bd = 24f * dpr;
        for (int i = 0; i < tmPins.size(); i++) {
            TileMapCore.Pin pn = tmPins.get(i);
            if ("m".equals(pn.k)) continue;
            double[] sc = tmView.toScreen(pn.la, pn.lo);
            if (Math.hypot(sc[0] - x, sc[1] - y) < bd) return true;
        }
        return false;
    }
    void vecTap(float x, float y) { if (tmView != null) tmTap(x, y); }
    boolean vecAnim() { for (TileMapCore.Pin pn : tmPins) if ("m".equals(pn.k)) return true; return false; }
    void vecDraw(Canvas cv) {
        if (tmView == null || tmPins.isEmpty()) return;
        TileMapArt.drawPins(cv, tmView, tmPins, dpr, tmFocus, tmLabel, SystemClock.uptimeMillis());
        drawTmapChrome(cv, tmHint);
        TileMapArt.drawAttribution(cv, tmW, tmH, dpr, "\u00A9 OpenFreeMap \u00A9 OpenStreetMap");
    }
    /** 지도 가운데(와 확대)를 부드럽게 옮긴다. */
    private void tmGoTo(double la, double lo, double z) {
        if (tmView == null) return;
        if (vecHost != null && vecHost.ready()) { vecHost.goTo(la, lo, z); return; }          // 벡터 지도: 지도가 직접 부드럽게 움직이고 그 움직임이 핀 계산에 이어진다
        tmAnimLa0 = tmView.cla; tmAnimLo0 = tmView.clo; tmAnimZ0 = tmView.zoom; tmAnimLa1 = la; tmAnimLo1 = lo; tmAnimZ1 = z; tmAnimT0 = SystemClock.uptimeMillis(); tmAnimOn = true;
        invalidate();
    }
    /** 머리에 있는 끌 수 있는 지도(live)가 이 화면 점 아래에 있으면 그 조각. */
    private ScreenCore.Item liveMapAt(float px, float py) {
        if (lay == null) return null;
        float x = px / dpr, y = py / dpr;
        if (y >= lay.headH) return null;
        for (ScreenCore.Item it : lay.head) if (it.kind == ScreenCore.K_TMAP && it.on && x >= it.x && x < it.x + it.w && y >= it.y && y < it.y + it.h) return it;
        return null;
    }
    private boolean tmMoved, tmScaling; private float tmDX, tmDY, tmLX, tmLY; private long tmDT;
    private final android.view.ScaleGestureDetector tmSg = new android.view.ScaleGestureDetector(getContext(), new android.view.ScaleGestureDetector.SimpleOnScaleGestureListener() {
        @Override public boolean onScale(android.view.ScaleGestureDetector d) {
            if (tmView != null && mode == 5) { tmAnimOn = false; tmView.zoomBy(Math.log(d.getScaleFactor()) / Math.log(2.0), d.getFocusX() - tmL * dpr, d.getFocusY() - tmT * dpr); invalidate(); }
            return true;
        }
    });
    /** 지도 위 손가락: 끌기 · 두 손가락 확대 · ± 단추 · 핀 누르기. 핀은 엔진이 준 행동(v)과 같이 움직일 카드(g)를 갖는다. */
    private boolean tmTouch(MotionEvent e) {
        if (tmView == null) { finishTouch(); return true; }
        tmSg.onTouchEvent(e);
        float x = e.getX(), y = e.getY();
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_POINTER_DOWN: tmScaling = true; tmMoved = true; return true;
            case MotionEvent.ACTION_MOVE: {
                if (tmSg.isInProgress() || e.getPointerCount() > 1) { tmScaling = true; tmLX = x; tmLY = y; return true; }
                if (tmScaling) { tmLX = x; tmLY = y; tmScaling = false; return true; }                // 두 손가락 뒤 남은 한 손가락이 튀지 않게
                if (!tmMoved && Math.abs(x - tmDX) < 8f * dpr && Math.abs(y - tmDY) < 8f * dpr) return true;
                tmMoved = true; tmAnimOn = false; tmView.pan(x - tmLX, y - tmLY); tmLX = x; tmLY = y; invalidate();
                return true;
            }
            case MotionEvent.ACTION_UP: {
                if (!tmMoved && SystemClock.uptimeMillis() - tmDT < 600L) tmTap(x - tmL * dpr, y - tmT * dpr);
                finishTouch(); invalidate();
                return true;
            }
            case MotionEvent.ACTION_CANCEL: finishTouch(); invalidate(); return true;
            default: return true;
        }
    }
    private void tmTap(float lx, float ly) {
        float bsz = 30f * dpr, bm = 10f * dpr, bx = tmWd * dpr - bm - bsz, by = tmHt * dpr - bm - 2f * bsz;
        if (lx >= bx && lx < bx + bsz && ly >= by && ly < by + 2f * bsz) {
            double d = ly < by + bsz ? 1.0 : -1.0;
            tmGoTo(tmView.cla, tmView.clo, Math.max(TileMapCore.MIN_ZOOM, Math.min(TileMapCore.MAX_ZOOM, Math.round(tmView.zoom) + d)));
            return;
        }
        int best = -1; double bd = 24f * dpr;
        for (int i = 0; i < tmPins.size(); i++) {
            TileMapCore.Pin pn = tmPins.get(i);
            if ("m".equals(pn.k)) continue;
            double[] sc = tmView.toScreen(pn.la, pn.lo);
            double dd = Math.hypot(sc[0] - lx, sc[1] - ly);
            if (dd < bd) { bd = dd; best = i; }
        }
        if (best < 0) return;
        TileMapCore.Pin pn = tmPins.get(best);
        tmFocus = best; tmFocApplied = best; tmLabel = true;
        tmGoTo(pn.la, pn.lo, tmView.zoom);
        if (pn.g.length() > 0) focusCard(pn.g, true);                       // 같은 번호 카드를 켜고 위로 부드럽게 끌어 온다
        if (pn.v.length() > 0 && listener != null) { ScreenCore.Act a = new ScreenCore.Act(); a.a = "call"; a.v = pn.v; a.id = pn.g; listener.onAction(a); }
    }
    /** 열쇠가 key 인 정류장 카드만 켜고(나머지는 끔), 원하면 그 카드가 맨 위에 오게 부드럽게 민다. */
    private void focusCard(String key, boolean scroll) {
        if (lay == null) return;
        ScreenCore.Item target = null;
        for (ScreenCore.Item q : lay.body) if (q.kind == ScreenCore.K_BCARD) { q.on = key.equals(q.key); if (q.on) target = q; }
        invalidate();
        if (scroll && target != null) smoothScrollTo(ScreenCore.clamp(target.y - 4f, lay.bodyMaxScroll(bodyViewH())));
    }
    private boolean ssOn; private float ssFrom, ssTo; private long ssT0;
    /** 행동이 actV 인 카드 아래로 펼친 지도가 다 보이도록, 모자라면 그 카드가 위에 오게 부드럽게 민다(웹 scrollIntoView). */
    void revealBelow(String actV) {
        if (lay == null || actV == null) return;
        for (ScreenCore.Item q : lay.body) {
            if (q.act == null || !actV.equals(q.act.v)) continue;
            float viewH = bodyViewH();
            if (q.y + q.h + 380f > scrollY + viewH || q.y < scrollY) smoothScrollTo(ScreenCore.clamp(q.y - 8f, lay.bodyMaxScroll(viewH)));
            return;
        }
    }
    private void smoothScrollTo(float to) {
        flingY.forceFinished(true);
        ssFrom = scrollY; ssTo = to; ssT0 = SystemClock.uptimeMillis(); ssOn = true; invalidate();
    }
    /** 지금 화면에 올라온 첫 타일 지도의 핀 글(없으면 ""). 앱이 크게 보기를 열 때 쓴다. */
    public String tmapPins() {
        if (screen == null || lay == null) return "";
        for (ScreenCore.Item it : lay.body) if (it.kind == ScreenCore.K_TMAP) return it.value;
        return "";
    }
    private ScreenCore.Item sceneAt(float px, float py) {
        if (lay == null || !sceneDrawn || scene == null || !scene.isLoaded()) return null;
        float x = px / dpr, y = py / dpr;
        if (y < lay.headH || (lay.footH > 0f && y >= footTop())) return null;
        float by = y - lay.headH + scrollY;
        for (ScreenCore.Item it : lay.body) if (it.kind == ScreenCore.K_SCENE && x >= it.x && x < it.x + it.w && by >= it.y && by < it.y + it.h) return it;
        return null;
    }
    private float sceneX(float px, ScreenCore.Item it) { return px - it.x * dpr; }
    private float sceneY(float py, ScreenCore.Item it) { return py - (lay.headH - scrollY + it.y) * dpr; }
    private float lastCH = -1f;
    /** 게시글 머리를 눌렀다 — 앱이 바로 펼치고(한 번에 한 글) 눌린 머리가 화면에서 움직이지 않게 스크롤을 맞춘다. 알림은 on(펼침) 으로. */
    /** 세부경로 구간 줄을 눌렀다 — 서버를 거치지 않고 앱이 바로 펼친다(웹 _toggleDetailSec: ▾ 가 0.2초 동안 돈다). 알림은 on(펼침) 으로. */
    private void toggleTd(ScreenCore.Item pi) {
        blurInput();
        final boolean wasOn = pi.on; final ScreenCore.Act a = pi.act;
        StringBuilder b = new StringBuilder(",");
        for (ScreenCore.Item q : lay.body) { if (q.kind != ScreenCore.K_TDROW || q.key.length() == 0) continue; if (q.key.equals(pi.key) ? !wasOn : q.on) b.append(q.key).append(','); }
        openKey = "td:" + b;
        tdTog.put(pi.key, Long.valueOf(SystemClock.uptimeMillis()));
        relayout();
        if (lay != null) scrollY = ScreenCore.clamp(scrollY, lay.bodyMaxScroll(bodyViewH()));
        invalidate();
        if (listener != null) listener.onSet(a, !wasOn);
    }
    private final java.util.HashMap<String, Long> tdTog = new java.util.HashMap<String, Long>();       // 구간 번호 → 마지막으로 누른 때(▾ 돌리기)
    private boolean tdAnim;
    private void toggleOpen(ScreenCore.Item hd) {
        blurInput();
        boolean wasOn = hd.on; String key = hd.key; ScreenCore.Act a = hd.act;
        float topOnScreen = hd.y - scrollY;
        openKey = wasOn ? "" : key;
        flingY.forceFinished(true);
        relayout();
        if (lay != null) {
            for (ScreenCore.Item q : lay.body) { if (q.kind == ScreenCore.K_POSTH && key.equals(q.key)) { scrollY = ScreenCore.clamp(q.y - topOnScreen, lay.bodyMaxScroll(bodyViewH())); break; } }
        }
        invalidate();
        if (listener != null) listener.onSet(a, !wasOn);
    }
    private void tapInbar(ScreenCore.Item it, float xdp, boolean inFootRegion) {
        if (it.sw > 0f && xdp >= it.btx - 4f && xdp < it.btx + it.sw + 4f) { if (!it.on) fireInbar(it, inFootRegion, it.act); return; }      // on = 흐린 단추(dim): 눌러도 무시
        beginEdit(it);
    }
    /** 입력줄 단추(또는 키보드의 보내기): 쓰던 글을 보관하고 행동을 알린다. 아래 고정 줄이면 키보드를 그대로 두고(이어 쓰기), 본문 안이면 내린다. */
    private void fireInbar(ScreenCore.Item it, boolean inFootRegion, ScreenCore.Act act) {
        if (editKey != null && editor != null) fieldVals.put(editKey, String.valueOf(editor.getText()));
        if (!inFootRegion) blurInput();
        if (act != null && "call".equals(act.a) && act.v != null && act.v.startsWith("rt.gps")) { hintAct = act.v; hintUntil = SystemClock.uptimeMillis() + 1500L; lastTapScale = hintUntil - 1500L; }      // 엔진 답을 기다리지 않고 누른 즉시 돌아가는 표시(0초 반응)
        invalidate();
        if (listener != null && act != null) listener.onAction(act);
    }
    private String hintAct = ""; private long hintUntil; private boolean inbarBusy;
    /** 웹이 입력칸 글자를 바꾼다(보낸 뒤 비우기 등). 편집 중이면 진짜 입력칸도 같이. */
    public void setField(String key, String value) {
        if (key == null) return;
        String v = value == null ? "" : value;
        fieldVals.put(key, v);
        if (editor != null && key.equals(editKey)) { editSilent = true; editor.setText(v); editor.setSelection(editor.getText().length()); editSilent = false; }
        invalidate();
    }
    private void finishTouch() { ui.removeCallbacks(lpRun); pickHit = null; pressed = null; fabDown = false; mode = 0; if (vt != null) { vt.recycle(); vt = null; } }

    private ScreenCore.Item findItem(float px, float py) {
        float x = px / dpr, y = py / dpr;
        if (lay.footH > 0f && y >= footTop()) {
            float fy = y - footTop();
            for (ScreenCore.Item it : lay.foot) if ((it.act != null || it.kind == ScreenCore.K_FIELD) && ScreenCore.Layout.hits(it, x, fy)) return it;
            return null;
        }
        if (y < lay.headH) {
            for (ScreenCore.Item it : lay.head) {
                float hx = it.fixed ? x : x + scrollX;
                if ((it.act != null || it.kind == ScreenCore.K_FIELD) && ScreenCore.Layout.hits(it, hx, y)) return it;
            }
            return null;
        }
        float by = y - lay.headH + scrollY;
        int[] r = lay.bodyRange(by, by + 0.01f);
        for (int i = r[1] - 1; i >= r[0]; i--) { ScreenCore.Item it = lay.body[i]; if ((it.act != null || it.kind == ScreenCore.K_FIELD) && ScreenCore.Layout.hits(it, x, by)) return it; }      // 위에 그려진 것(바꾸기 단추)이 먼저
        return null;
    }

    // ───────────── 그리기 ─────────────
    private float base(float top, float h, int i) {
        Paint.FontMetrics fm = tp.getFontMetrics();
        return top + (h - (fm.descent - fm.ascent)) / 2f - fm.ascent;
    }
    private void setText(float size, boolean bold, int color) {
        tp.setTypeface(face(bold));
        tp.setTextSize(size); tp.setColor(color); tp.setTextAlign(Paint.Align.LEFT);
    }
    private static int alpha(int c, float a) { return ((int) (((c >>> 24) & 0xFF) * a) << 24) | (c & 0xFFFFFF); }
    private int roleColor(String r) {
        if ("bg".equals(r)) return pal[R_BG]; if ("card".equals(r)) return pal[R_CARD]; if ("border".equals(r)) return pal[R_BORDER];
        if ("text".equals(r)) return pal[R_TEXT]; if ("sub".equals(r)) return pal[R_SUB]; if ("gold".equals(r)) return pal[R_GOLD];
        if ("orange".equals(r)) return pal[R_ORANGE]; if ("imgbg".equals(r)) return pal[R_IMGBG]; if ("white".equals(r)) return pal[R_WHITE];
        if ("border2".equals(r)) return pal[R_BORDER2]; if ("card2".equals(r)) return pal[R_CARD2]; if ("nav".equals(r)) return pal[R_NAV]; if ("gold2".equals(r)) return pal[R_GOLD2]; if ("ongold".equals(r)) return pal[R_ONGOLD];
        return 0;
    }

    /** 화면 바탕 색: 안내창이 색을 정했으면 그것, 아니면 bg 역할. */
    private int bgNow() { return lay.bgCol != null ? cc(lay.bgCol, 0) : roleColor(lay.bg); }

    /** 색(역할 이름 또는 ARGB). null 이면 def. */
    private int cc(ScreenCore.Col c, int def) { if (c == null) return def; return c.role != null ? roleColor(c.role) : c.argb; }

    @Override protected void onDraw(Canvas cv) {
        final long pt0 = PerfLog.now();
        vecPlaced = false;
        drawAll(cv);
        PerfLog.draw(pt0);
        if (vecHost != null && !vecPlaced) vecHost.place(0, 0, 0, 0);                  // 벡터 지도가 놓일 자리가 이번 그림에 없다 — 숨긴다
    }
    private void drawAll(Canvas cv) {
        if (scrollHook != null && scrollY != hookY) { hookY = scrollY; scrollHook.run(); }
        long now = SystemClock.uptimeMillis();
        lastDraw = now;
        p.setStyle(Paint.Style.FILL); p.setColor(lay == null ? pal[R_BG] : bgNow());      // 바탕: 화면이 정한 색 역할(카드 안 화면은 card · 안내창은 엔진이 준 색)
        cv.drawRect(0, 0, getWidth(), getHeight(), p);
        if (lay == null) return;
        boolean moving = false;
        sceneDrawn = false; pgAnim = false; hrDrawn = false; glowDrawn = false; tdDrawn = false; tdAct = false; tdAnim = false; marqDrawn = false; mqDrawn = false; skelDrawn = false; lbDrawn = false; runDrawn = false; bcAnim = false; spAnim = false; rtAnim = false; arAnim = false; msgAnimOn = false; tmDrawn = false; cdDrawn = false; brxPingN = 0; inbarBusy = false;
        if (ssOn) {                                                                       // 핀을 눌러 카드로 부드럽게 가는 중
            float f = (now - ssT0) / 350f;
            if (f >= 1f) { f = 1f; ssOn = false; }
            scrollY = ScreenCore.clamp(ssFrom + (ssTo - ssFrom) * ease(f), lay.bodyMaxScroll(bodyViewH())); moving = true;
        }
        if (flingKey != null && flingP.computeScrollOffset()) { pickOff.put(flingKey, ScreenCore.clamp(flingP.getCurrY() / dpr, flingMax)); moving = true; }
        if (flingY.computeScrollOffset()) { scrollY = ScreenCore.clamp(flingY.getCurrY() / dpr, lay.bodyMaxScroll(bodyViewH())); moving = true; }
        if (flingX.computeScrollOffset()) { if (flingBand) bandX = ScreenCore.clamp(flingX.getCurrX() / dpr, lay.bandMax()); else scrollX = ScreenCore.clamp(flingX.getCurrX() / dpr, lay.headMaxScroll()); moving = true; }
        if (flingBand && !flingX.isFinished()) bandUserT = SystemClock.uptimeMillis();         // 손가락으로 민 뒤 미끄러지는 동안도 '만지는 중' — 10초는 멈춘 뒤부터 센다
        if (lay.bandTop >= 0f && lay.mkBody && lay.mk != null && mkHas && mode != 8 && !(flingBand && !flingX.isFinished())) {      // s257·s265 (YJ: 손 놓고 10초 뒤 마커가 가운데로 다시 튕겨 오게): 마커가 가운데 오도록 줄이 따라간다 · 손가락으로 밀었으면 놓은 뒤 10초 쉬고 스프링으로 복귀
            float tgt = ScreenCore.clamp(mkCurX(now) - lay.bandL - lay.bandView / 2f, lay.bandMax()), dlt = tgt - bandX;
            long wait = BAND_RETURN_MS - (SystemClock.uptimeMillis() - bandUserT);
            if (wait > 0L) { bandVel = 0f; if (Math.abs(dlt) > 0.3f) postInvalidateDelayed(Math.min(wait, 1000L)); }        // 쉬는 동안: 그리기 루프가 멎어 있어도 10초 뒤에 깨어나게
            else if (Math.abs(dlt) > 0.3f || Math.abs(bandVel) > 0.05f) {
                if (Math.abs(dlt) < 1.2f && Math.abs(bandVel) < 0.4f) { bandX = tgt; bandVel = 0f; }
                else { bandVel = bandVel * 0.78f + dlt * 0.045f; bandX = ScreenCore.clamp(bandX + bandVel, lay.bandMax()); }      // 살짝 넘쳤다 돌아오는 스프링(감쇠 0.78 · 힘 0.045)
                moving = true;
            }
        }
        roStep(now);                                                                      // 카드를 끄는 중이면 가장자리 자동 스크롤 · 비키는 카드 이동

        cv.save();
        cv.scale(dpr, dpr);
        float w = getWidth() / dpr, h = getHeight() / dpr;
        // 본문(머리 아래로 잘라서)
        float slF = -1f;
        if (slDir != 0) {                                                                  // 칸을 밀어 넘어온 직후: 본문이 옆에서 24dp 미끄러지며 나타난다
            long el = now - slT0;
            if (el >= SLIDE_MS) slDir = 0;
            else { if (slideEase == null) slideEase = new android.view.animation.PathInterpolator(0.22f, 0.8f, 0.3f, 1f); slF = slideEase.getInterpolation(Math.max(0f, el) / (float) SLIDE_MS); moving = true; }
        }
        float swOx = 0f, swAl = 1f;
        if (slF >= 0f) { swOx = -slDir * SLIDE_DP * (1f - slF); swAl = 0.25f + 0.75f * slF; swShift = 0f; swRelT = 0L; swFire = false; }          // s315: 투명에서 시작하지 않는다 — 새 글이 바로 비쳐 비는 틈이 안 보인다
        else if (mode == 9) { swOx = swShift; swAl = 1f - 0.3f * Math.min(1f, Math.abs(swShift) / SW_DRAG_DP); }
        else if (swFire && swRelT > 0L) {                                                     // s315(YJ: 경로 넘길 때 부드럽지 않다): 넘기기로 정해 놓은 뒤 — 반쯤 민 채 멈춰 기다리지 않고 가던 쪽으로 계속 미끄러지며 사라지고(0.11초), 새 화면이 오면 반대쪽에서 들어온다
            long el = now - swRelT; float tg = swRelFrom < 0f ? -SLIDE_DP : SLIDE_DP, a0 = 1f - 0.3f * Math.min(1f, Math.abs(swRelFrom) / SW_DRAG_DP);
            if (el < SW_OUT_MS) { float u = el <= 0L ? 0f : el / (float) SW_OUT_MS, e = 1f - (1f - u) * (1f - u); swShift = swRelFrom + (tg - swRelFrom) * e; swOx = swShift; swAl = a0 * (1f - e); moving = true; }
            else if (el < swHold) { swShift = tg; swOx = tg; swAl = 0f; moving = true; }                // 새 화면을 기다리는 동안은 비운다
            else if (el < swHold + SW_BACK_MS) { float u = (el - swHold) / (float) SW_BACK_MS, e = 1f - (1f - u) * (1f - u); swShift = tg * (1f - e); swOx = swShift; swAl = e; moving = true; }      // 끝내 안 오면 제자리에서 다시 나타난다
            else { swShift = 0f; swRelT = 0L; swFire = false; }
        }
        else if (swShift != 0f && swRelT > 0L) {                                              // 놓은 뒤: 새 화면을 기다리다가(hold) 부드럽게 제자리로
            long el = now - swRelT - swHold;
            if (el >= SW_BACK_MS) { swShift = 0f; swRelT = 0L; }
            else { swShift = swRelFrom * springF(el <= 0L ? 0f : el / 1000f, 0.62f, 13f); swOx = swShift; swAl = 1f - 0.3f * Math.min(1f, Math.abs(swShift) / SW_DRAG_DP); moving = true; }
        }
        float pullNow = pullY;
        if (pullRelT > 0L && mode != 1) {                                                   // 놓은 뒤: 감쇠 스프링으로 튀어 오른다(처음 아래 → 살짝 위로 넘어갔다 → 제자리)
            float pt = (now - pullRelT) / 1000f;
            if (pt >= 0.95f) { pullY = 0f; pullRelT = 0L; pullNow = 0f; }
            else { pullY = pullNow = Math.max(-26f, pullFrom * springF(pt, 0.42f, 11f)); moving = true; }
        }
        // s314(YJ: 전체가 왼쪽으로 이동해 — 브리핑 박스 부분만 개별적으로 부드럽게): 화면에 밀기 카드(panel swp)가 있으면 본문 전체가 아니라 그 카드 안의 '타임라인 아래 글 영역'(경로 · 브리핑 글)만 밀리고 카드 가장자리에서 잘린다
        boolean swReg = false; float rgL = 0f, rgR = 0f, rgT = 0f, rgB = 0f;
        if (swOx != 0f || swAl < 1f) for (ScreenCore.Item si : lay.body) if (si.kind == ScreenCore.K_PANEL && si.swp) {
            rgL = si.x + 1f; rgR = si.x + si.w - 1f; rgB = si.y + si.h; rgT = lay.bandBot >= si.y && lay.bandBot <= rgB ? lay.bandBot : si.y + 80f; swReg = true; break;
        }
        final boolean swLayer = !swReg && (swOx != 0f || swAl < 1f);
        if (swLayer) { cv.saveLayerAlpha(0f, lay.headH, w, h - lay.footH, Math.round(255f * swAl), Canvas.ALL_SAVE_FLAG); cv.translate(swOx, 0f); }
        if (pullNow > 8f) {                                                                 // 당겨서 드러난 자리: 둥근 화살표 고리(당길수록 차오르고, 새로고침 중엔 돈다)
            float pr = Math.min(1f, pullNow / PULL_TRIG), cy = lay.headH + Math.min(pullNow, 100f) * 0.5f, rad = 9f;
            boolean spinning = pullRelT > 0L && pullFrom >= PULL_TRIG;
            float st = spinning ? (now % 900L) / 900f * 360f : pullNow * 3f;
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(2.4f); p.setStrokeCap(Paint.Cap.ROUND);
            p.setColor(alpha(pal[R_SUB], Math.min(1f, 0.25f + pr)));
            rf.set(w / 2f - rad, cy - rad, w / 2f + rad, cy + rad);
            cv.drawArc(rf, st - 90f, spinning ? 280f : 40f + 290f * pr, false, p);
            p.setStrokeCap(Paint.Cap.BUTT); p.setStyle(Paint.Style.FILL);
        }
        cv.save();
        cv.clipRect(0f, lay.headH, w, h - lay.footH);
        cv.translate(0f, lay.headH - scrollY + pullNow);
        foldOn = false; foldDy = 0f;
        if (foldKey != null) {                                                              // s307: 접었다 펼치는 중 — 목록 아래 칸들이 스프링으로 내려가고(펼침) 올라온다(접힘)
            if ((now - foldT0) / FOLD_MS >= 1f) foldKey = null;
            else for (ScreenCore.Item fi : lay.body) if (fi.kind == ScreenCore.K_PICKL && foldKey.equals(fi.key)) { foldY = fi.y; foldBot = fi.y + fi.h; foldDy = pickVisH(fi) - fi.h; foldOn = Math.abs(foldDy) > 0.2f; spAnim = true; break; }
        }
        float fmg = foldOn ? Math.abs(foldDy) : 0f;
        int[] r = lay.bodyRange(scrollY - 4f - fmg, scrollY + (h - lay.headH - lay.footH) + 4f + fmg);
        for (int i = r[0]; i < r[1]; i++) {
            ScreenCore.Item bit = lay.body[i];
            if (bit.kind == ScreenCore.K_SWAP) continue;
            if (swReg && swIn(bit, rgL, rgR, rgT, rgB)) continue;                          // 밀리는 영역의 칸은 아래에서 따로 그린다
            if (!sceneFailed && isPager(bit)) { i += drawPager(cv, bit, i, now); continue; }
            float sdy = 0f, gh = 0f;
            if (foldOn && bit.kind != ScreenCore.K_PICKL) { if (bit.y >= foldBot - 0.5f) sdy = foldDy; else if (bit.kind == ScreenCore.K_PANEL && bit.y <= foldY && bit.y + bit.h >= foldBot - 0.5f) gh = foldDy; }
            if (sdy != 0f) { cv.save(); cv.translate(0f, sdy); }
            if (gh != 0f) bit.h += gh;
            if (bit.band) { cv.save(); cv.clipRect(bit.cl, bit.y - 4f, bit.cr, bit.y + bit.h + 4f); cv.translate(-bandX, 0f); drawItem(cv, bit); cv.restore(); }      // 카드 안 타임라인: 틀 안에서 가로로 밀린다
            else drawItem(cv, bit);
            if (gh != 0f) bit.h -= gh;
            if (sdy != 0f) cv.restore();
        }
        if (swReg) {
            cv.save(); cv.clipRect(rgL, rgT, rgR, rgB);
            cv.saveLayerAlpha(rgL, rgT, rgR, rgB, Math.round(255f * swAl), Canvas.ALL_SAVE_FLAG); cv.translate(swOx, 0f);
            for (int i = r[0]; i < r[1]; i++) { ScreenCore.Item bit = lay.body[i]; if (swIn(bit, rgL, rgR, rgT, rgB)) drawItem(cv, bit); }
            cv.restore(); cv.restore();
        }
        boolean pulsingB = false;
        if (lay.mkBody && lay.bandTop >= 0f && lay.bandTop + 100f >= scrollY - 4f && lay.bandTop <= scrollY + (h - lay.headH - lay.footH) + 4f) {     // 그 줄 위의 내 위치 마커(칸과 같이 밀린다)
            cv.save(); if (foldOn && lay.bandTop >= foldBot - 0.5f) cv.translate(0f, foldDy); cv.clipRect(lay.bandL, lay.bandTop - 6f, lay.bandL + lay.bandView, lay.bandBot + 6f); cv.translate(-bandX, 0f);
            pulsingB = drawMk(cv, now); cv.restore();
        }
        for (int i = r[0]; i < r[1]; i++) if (lay.body[i].kind == ScreenCore.K_SWAP) drawItem(cv, lay.body[i]);       // 두 줄 경계에 얹는 둥근 단추는 맨 위에(웹 z-index 20) — 그 밑의 구분선이 단추를 가로지르지 않게
        if (dragOn || settleOn) roDrawDragged(cv);                                        // 끌리는 카드는 맨 위에
        cv.restore();
        if (swLayer) cv.restore();
        if (roMode && roEnabled()) { cv.save(); cv.clipRect(0f, lay.headH, w, h - lay.footH); roDrawBar(cv, w); cv.restore(); }       // 위에 붙은 '끌어서 순서 변경 · 완료' 줄
        // 머리(위에 고정, 본문 위에 덮음)
        p.setStyle(Paint.Style.FILL); p.setColor(bgNow());
        cv.drawRect(0f, 0f, w, lay.headH, p);
        cv.save();
        cv.clipRect(0f, 0f, w, lay.headH);
        for (int i = 0; i < lay.head.length; i++) { ScreenCore.Item it = lay.head[i]; if (it.fixed) drawItem(cv, it); }      // 안내 상자·검색줄(고정)
        cv.translate(-scrollX, 0f);
        float x0 = scrollX - 4f, x1 = scrollX + w + 4f;
        for (int i = 0; i < lay.head.length; i++) { ScreenCore.Item it = lay.head[i]; if (!it.fixed && it.x + it.w >= x0 && it.x <= x1) drawItem(cv, it); }   // 칩 줄(가로로 밀림)
        boolean pulsing = lay.mkBody ? pulsingB : drawMk(cv, now);                                                      // 내 위치 마커(구간 타임라인 위)
        cv.restore();
        if (lay.footH > 0f) {                                                                    // 아래 고정 줄(채팅 입력줄): 배경 + 위 선 + 조각
            cv.save();
            cv.clipRect(0f, h - lay.footH, w, h);
            cv.translate(0f, h - lay.footH);
            p.setStyle(Paint.Style.FILL); p.setColor(bgNow());
            cv.drawRect(0f, 0f, w, lay.footH, p);
            if (lay.fl) { p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(pal[R_BORDER]); cv.drawLine(0f, 0.5f, w, 0.5f, p); }
            p.setStyle(Paint.Style.FILL);
            for (int i = 0; i < lay.foot.length; i++) drawItem(cv, lay.foot[i]);
            cv.restore();
        }
        drawFab(cv, w, h);
        cv.restore();
        if (lay.lineCol != null) {                                                               // 안내창 카드 테두리(1dp)
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(dpr); p.setColor(cc(lay.lineCol, 0));
            rf2.set(dpr / 2f, dpr / 2f, getWidth() - dpr / 2f, getHeight() - dpr / 2f);
            cv.drawRoundRect(rf2, lay.dlgR * dpr, lay.dlgR * dpr, p);
            p.setStrokeWidth(1f);
        }

        if (!drewOnce) { drewOnce = true; post(firstDrawCb); }
        if (sceneDrawn && scene != null && scene.isRunning() && !scene.isPaused()) postInvalidateOnAnimation();        // 장면이 보이는 동안만 화면 박자로 계속 그린다(안 보이면 저절로 멈춘다)
        if (!lbDrawn) lbT0 = 0L;                                                                                                            // 불러오는 막대가 안 보이면 다음에 보일 때 0% 부터
        if (marqDrawn || mqDrawn || skelDrawn || lbDrawn || runDrawn || inbarBusy) postInvalidateOnAnimation();                                     // 흐르는 문구가 보이는 동안만 화면 박자로 계속 그린다
        if (brxPingN > 0 && isShown()) {                                                           // 버스·내 위치 마커 맥박: 그 마커 자리만 초당 15번(보이는 동안만; 화면을 벗어나면 저절로 멈춘다)
            float oy = lay.headH - scrollY;
            for (int i = 0; i < brxPingN; i++) {
                int k = i * 4;
                postInvalidateDelayed(66L, Math.round(brxPing[k] * dpr), Math.round((brxPing[k + 1] + oy) * dpr), Math.round(brxPing[k + 2] * dpr), Math.round((brxPing[k + 3] + oy) * dpr));
            }
        }
        if (glowDrawn && isShown()) { float goy = lay.headH - scrollY; postInvalidateOnAnimation(Math.round(glX0 * dpr), Math.round((glY0 + goy) * dpr), Math.round(glX1 * dpr), Math.round((glY1 + goy) * dpr)); }   // 무지개 카드가 보이는 동안만, 그 카드 자리만
        if (tdAnim) postInvalidateOnAnimation();
        else if (tdAct && isShown()) {                                                                // 점 맥박: 화면 전체를 매 프레임 다시 그리지 않는다 — 점 자리만 초당 30번, 전체는 1초에 한 번(줄 바탕·시간이 바뀌는 것을 따라가게)
            if (now - tdFullT >= 1000L) { tdFullT = now; postInvalidateDelayed(33L); }
            else { float toy = lay.headH - scrollY; postInvalidateDelayed(33L, Math.max(0, Math.round(tdX0 * dpr)), Math.max(0, Math.round((tdY0 + toy) * dpr)), Math.round(tdX1 * dpr), Math.round((tdY1 + toy) * dpr)); }
        } else if (tdDrawn) postInvalidateDelayed(2000L);                          // 세부경로: 지금 가는 구간이 보이면 현재위치 점이 맥박 치도록 화면 박자로, 아니면 웹처럼 2초마다 진행만 갱신
        if (cdDrawn) postInvalidateDelayed(1000L - (System.currentTimeMillis() % 1000L) + 5L);       // 버스 도착 카운트다운이 보이는 동안 초가 바뀔 때마다 한 번씩
        if (moving || mode == 1 || mode == 2 || mode == 8 || mode == 9 || mode == 10 || pgAnim || mode == 5 || bcAnim || arAnim || spAnim || tmAnimOn || msgAnimOn || rtAnim || roAnim) postInvalidateOnAnimation();
        else if (tmDrawn) postInvalidateDelayed(50L);                                             // 내 위치 점 뒤로 퍼지는 고리(웹 1.6초 주기)
        else if (pulsing || hrDrawn) postInvalidateDelayed(mkMs > 0f && now - mkT0 < mkMs ? 16L : 66L);      // 마커 맥박·고리(마커가 있을 때만; 가만히 있으면 초당 15번)
    }

    /** 새 화면의 마커 자리를 받는다. 이어서 오는 화면이면 지금 보이는 자리에서 새 자리까지 엔진이 정한 ms 동안 이어 가고, 처음이거나 ms 가 0 이면 곧바로 놓는다. */
    private void syncMk(boolean keep) {
        ScreenCore.Mark k = lay == null ? null : lay.mk;
        if (k == null) { mkHas = false; return; }
        long now = SystemClock.uptimeMillis();
        float to = k.x(k.r);
        final boolean sameRoute = mkHas && keep && k.n == mkFloorN;
        if (sameRoute && k.f < mkFloorF) return;                 // s294 (YJ: 도착이 판정된 역은 다음 역으로 가면 무슨 일이 있어도 되돌아가지 못한다): 같은 경로에서 이미 지나간 칸보다 뒤 칸으로 가라는 값은 버린다
        mkFloorF = sameRoute ? Math.max(mkFloorF, k.f) : k.f; mkFloorN = k.n;
        if (!mkHas || !keep || k.ms <= 0f) { mkHas = true; mkFromX = mkToX = to; mkMs = 0f; mkT0 = now; mkBack = 0; }
        else if (Math.abs(to - mkToX) > 0.01f) {
            float back = mkToX - to;                                                     // 뒤로 가는 값: GPS 흔들림으로 역에 서 있다 0.05~0.2 구간 되돌아가는 것은 걸러 낸다(웹 역주행 가드 _markerMaxProg).
            if (back > 0.01f && back <= Math.max(24f, Math.abs(k.x1 - k.x0)) * 0.5f && ++mkBack < 3) return;       // 같은 방향의 뒤로 가는 값이 세 번 이어지면(약 15초) 진짜 되돌림으로 받아들인다
            mkBack = 0;
            mkFromX = mkCurX(now); mkToX = to; mkMs = k.ms; mkT0 = now;
        } else mkBack = 0;
    }
    private int mkBack;                                    // 연속으로 뒤로 가라고 온 횟수
    private int mkFloorN = -1, mkFloorF = -1;              // s294: 지금 경로(칸 수)에서 마커가 이미 닿은 가장 앞 칸 — 이보다 뒤로는 되돌리지 않는다
    private float mkCurX(long now) {
        if (mkMs <= 0f) return mkToX;
        float t = (now - mkT0) / mkMs;
        return t >= 1f ? mkToX : mkFromX + (mkToX - mkFromX) * t;
    }
    /** 내 위치 마커: 점 + 흰 테두리 + 번쩍임(승차 대기면 맥박) + 퍼지는 고리 + (대기면) 알약 배지. 모양·색·주기·글은 엔진이 정했다. */
    /** s295 (YJ: 역에 도착하면 노란색을 두었다가 대기 20초 뒤 파란 이동 마커로): 엔진이 '역에 서 있는 구간'(mk.dw)이라 했고 마커가 그 역 자리에 실제로 닿았을 때만 참 — 미끄러져 오는 3초 동안은 아직 파랑이다. */
    private boolean mkDwelling(long now) {
        ScreenCore.Mark k = lay == null ? null : lay.mk;
        return k != null && mkHas && k.dw && !"w".equals(k.pu) && k.dccol != null && (mkMs <= 0f || now - mkT0 >= mkMs);
    }
    private boolean drawMk(Canvas cv, long now) {
        ScreenCore.Mark k = lay.mk;
        if (k == null || !mkHas) return false;
        final boolean dwell = mkDwelling(now);
        float x = mkCurX(now), y = k.y, rad = (dwell ? k.dd : k.d) / 2f, ph;
        boolean wait = "w".equals(k.pu);
        // 퍼지는 고리(0.5배 → 2.4배, 흐려지며 사라짐)
        final ScreenCore.Col dotC = dwell ? k.dccol : k.ccol, haloC = dwell ? k.dhcol : k.hcol, ringC = dwell ? k.drcol : k.rcol;
        if (ringC != null && k.rms > 0f) {
            float f = (now % (long) k.rms) / k.rms, e = 1f - (1f - f) * (1f - f);
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(2f); p.setColor(alpha(cc(ringC, dwell ? 0xFFFFD60A : 0xFF0A84FF), 0.85f * (1f - f)));
            cv.drawCircle(x, y, (rad + 2f) * (0.5f + 1.9f * e), p);
        }
        p.setStyle(Paint.Style.FILL);
        ph = (now % (long) k.pms) / k.pms;
        float tri = ph < 0.5f ? ph * 2f : (1f - ph) * 2f;                       // 0 → 1 → 0
        float scale = 1f, op = 1f;
        if (wait) {                                                              // 맥박: 1 → 1.25배 · 투명도 1 → .75
            scale = 1f + 0.25f * tri; op = 1f - 0.25f * tri;
            if (k.hcol != null) { p.setColor(cc(k.hcol, 0)); cv.drawCircle(x, y, (rad + k.hw) * scale, p); }
        } else if (haloC != null) {                                              // 번쩍임: 바깥 둘레가 커지며 옅어짐
            p.setColor(alpha(cc(haloC, 0), 1f - tri)); cv.drawCircle(x, y, rad + k.hw * tri, p);
        }
        float rr = rad * scale;
        if (k.bw > 0f && k.bcol != null) { p.setColor(alpha(cc(k.bcol, 0xFFFFFFFF), op)); cv.drawCircle(x, y, rr, p); }
        p.setColor(alpha(cc(dotC, 0xFF0A84FF), op)); cv.drawCircle(x, y, Math.max(0f, rr - k.bw * scale), p);
        if (k.bt.length() > 0) {                                                 // 대기 배지(알약)
            float pw = k.btw + 14f;
            rf.set(x - pw / 2f, k.bty, x + pw / 2f, k.bty + k.bth);
            p.setColor(cc(k.gcol, 0xFFFF9F0A)); cv.drawRoundRect(rf, k.bth / 2f, k.bth / 2f, p);
            setText(k.bz, true, cc(k.tcol, pal[R_WHITE])); tp.setTextAlign(Paint.Align.CENTER);
            cv.drawText(k.bt, x, base(k.bty, k.bth, 0), tp);
            tp.setTextAlign(Paint.Align.LEFT);
        }
        return true;
    }

    private void drawItem(Canvas cv, ScreenCore.Item it) {
        if (it.sp > 0L) {                                                    // 바뀐 칸: 위에서 10dp 스프링으로 내려앉으며(살짝 지나쳤다 되돌아) 나타남 — 나머지 칸은 건드리지 않는다
            float f = (SystemClock.uptimeMillis() - it.sp) / SP_MS;
            if (f >= 1f) it.sp = 0L;
            else {
                float a = f <= 0f ? 0f : Math.min(1f, f * 3f), dy = f <= 0f ? -10f : -10f * (1f - spring(f));
                spAnim = true;
                if (a < 1f) cv.saveLayerAlpha(it.x - 4f, it.y - 14f, it.x + it.w + 4f, it.y + it.h + 14f, Math.round(255f * a));
                cv.save(); cv.translate(0f, dy);
                drawItem0(cv, it);
                cv.restore();
                if (a < 1f) cv.restore();
                return;
            }
        }
        drawItem0(cv, it);
    }
    private void drawItem0(Canvas cv, ScreenCore.Item it) {
        switch (it.kind) {
            case ScreenCore.K_CHIP: drawChip(cv, it); break;
            case ScreenCore.K_TAGS: drawTags(cv, it); break;
            case ScreenCore.K_CARD: drawCard(cv, it); break;
            case ScreenCore.K_TEXT: drawTextBlock(cv, it); break;
            case ScreenCore.K_BUTTON: drawButton(cv, it); break;
            case ScreenCore.K_ROWANIM: drawRowAnim(cv, it); break;
            case ScreenCore.K_BOX: drawBox(cv, it); break;
            case ScreenCore.K_SEARCH: drawSearch(cv, it); break;
            case ScreenCore.K_PANEL: drawPanel(cv, it); if (it.pub) drawGlow(cv, it); break;
            case ScreenCore.K_TOGGLE: drawToggle(cv, it); break;
            case ScreenCore.K_NAV: drawNav(cv, it); break;
            case ScreenCore.K_SELECT: drawSelect(cv, it); break;
            case ScreenCore.K_FIELD: drawField(cv, it); break;
            case ScreenCore.K_BAR: drawBar(cv, it); break;
            case ScreenCore.K_SHD: drawShd(cv, it); break;
            case ScreenCore.K_SEC: drawSec(cv, it); break;
            case ScreenCore.K_BRX: drawBrx(cv, it); break;
            case ScreenCore.K_TROW: drawTrow(cv, it); break;
            case ScreenCore.K_PLACE: drawPlace(cv, it); break;
            case ScreenCore.K_DIV: drawDivider(cv, it); break;
            case ScreenCore.K_NEWS: drawNews(cv, it); break;
            case ScreenCore.K_POSTH: drawPostHead(cv, it); break;
            case ScreenCore.K_CMT: drawCmt(cv, it); break;
            case ScreenCore.K_RBTN: drawRbtn(cv, it); break;
            case ScreenCore.K_PICKL: drawPick(cv, it); break;
            case ScreenCore.K_INBAR: drawInbar(cv, it); break;
            case ScreenCore.K_MSG: drawMsgAnim(cv, it); break;
            case ScreenCore.K_TAB: drawTab(cv, it); break;
            case ScreenCore.K_SUG: drawSug(cv, it); break;
            case ScreenCore.K_SWAP: drawSwap(cv, it); break;
            case ScreenCore.K_RHD: drawRhd(cv, it); break;
            case ScreenCore.K_TRK: drawTrk(cv, it); break;
            case ScreenCore.K_AIH: drawAih(cv, it); break;
            case ScreenCore.K_LTH: drawLth(cv, it); break;
            case ScreenCore.K_LTR: drawLtr(cv, it); break;
            case ScreenCore.K_PILL: drawPill(cv, it); break;
            case ScreenCore.K_CGH: drawCgh(cv, it); break;
            case ScreenCore.K_GAUGE: drawGauge(cv, it); break;
            case ScreenCore.K_CHART: drawChart(cv, it); break;
            case ScreenCore.K_HBAR: drawHbar(cv, it); break;
            case ScreenCore.K_CARS: drawCars(cv, it); break;
            case ScreenCore.K_SCENE: drawScene(cv, it); break;
            case ScreenCore.K_TMAP: drawTmap(cv, it); break;
            case ScreenCore.K_MARQ: drawMarq(cv, it); break;
            case ScreenCore.K_SKEL: drawSkel(cv, it); break;
            case ScreenCore.K_LBAR: drawLbar(cv, it); break;
            case ScreenCore.K_RUNNER: drawRunner(cv, it); break;
            case ScreenCore.K_TDROW: drawTdrow(cv, it); break;
            case ScreenCore.K_LPILL: drawLpill(cv, it); break;
            case ScreenCore.K_BTOG: drawBtog(cv, it); break;
            case ScreenCore.K_BCARD: drawBcardRo(cv, it); break;
            default: break;
        }
    }

    private void drawTags(Canvas cv, ScreenCore.Item it) {                          // 눌리지 않는 알약(바탕 · 테두리 · 글자 모두 엔진이 정한다)
        float rad = it.radius;
        rf.set(it.x, it.y, it.x + it.w, it.y + it.h);
        if (it.fill != null) { p.setStyle(Paint.Style.FILL); p.setColor(cc(it.fill, 0)); cv.drawRoundRect(rf, rad, rad, p); }
        if (it.line != null) {
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(cc(it.line, 0));
            rf2.set(it.x + 0.5f, it.y + 0.5f, it.x + it.w - 0.5f, it.y + it.h - 0.5f);
            cv.drawRoundRect(rf2, rad - 0.5f, rad - 0.5f, p);
            p.setStyle(Paint.Style.FILL);
        }
        setText(it.size, it.bold, it.tc != null ? cc(it.tc, 0) : pal[R_TEXT]);
        tp.setTextAlign(Paint.Align.CENTER);
        cv.drawText(it.label, it.x + it.w / 2f, base(it.y, it.h, 0), tp);
        tp.setTextAlign(Paint.Align.LEFT);
    }

    private void drawChip(Canvas cv, ScreenCore.Item it) {
        float rad = it.h / 2f;
        int onFill = cc(it.ac, pal[R_ORANGE]);
        boolean tinted = it.ac != null && !"orange".equals(it.ac.role);              // 맛집 칩: 꺼진 칩도 카드색 바탕(웹 .food-chip)
        boolean web = it.owc;                                                         // 엔진이 꺼진 칩 모양(바탕 · 테두리 · 글자)을 정했다
        int border = it.on ? onFill : (web ? cc(it.obd, 0x00000000) : 0x738C8C8C);
        rf.set(it.x, it.y, it.x + it.w, it.y + it.h);
        if (it.on && it.plain) { border = 0x00000000; }
        else if (it.on) { p.setStyle(Paint.Style.FILL); p.setColor(onFill); cv.drawRoundRect(rf, rad, rad, p); }
        else if (web) { if (it.ofl != null) { p.setStyle(Paint.Style.FILL); p.setColor(cc(it.ofl, 0)); cv.drawRoundRect(rf, rad, rad, p); } }
        else if (tinted) { p.setStyle(Paint.Style.FILL); p.setColor(pal[R_CARD]); cv.drawRoundRect(rf, rad, rad, p); }
        if (it == pressed) { p.setStyle(Paint.Style.FILL); p.setColor(0x14808080); cv.drawRoundRect(rf, rad, rad, p); }
        float bwd = it.bw > 0f ? it.bw : 1f;
        p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(bwd); p.setColor(border);
        rf2.set(it.x + bwd / 2f, it.y + bwd / 2f, it.x + it.w - bwd / 2f, it.y + it.h - bwd / 2f);
        cv.drawRoundRect(rf2, rad - bwd / 2f, rad - bwd / 2f, p);
        p.setStyle(Paint.Style.FILL);
        boolean plainOn = it.on && it.plain;                                        // s208: 켜진 '전체'는 바탕이 없어 흰 글자가 안 보였다 — 칩 색(금색) 굵은 글자 + 밑줄로 켜짐을 보인다
        int fg = plainOn ? onFill : (it.on ? cc(it.tc, pal[R_WHITE]) : (web ? cc(it.otx, pal[R_SUB]) : (tinted ? pal[R_SUB] : pal[R_TEXT])));
        float fs = it.size > 0f ? it.size : 12f, px = it.sx > 0f ? it.sx : ScreenCore.CHIP_PADX;
        setText(fs, true, fg);
        float b = base(it.y, it.h, 0);
        cv.drawText(it.label, it.x + px, b, tp);
        if (plainOn) { p.setStyle(Paint.Style.FILL); p.setColor(onFill); float uy = b + 3f; cv.drawRoundRect(it.x + px, uy, it.x + px + it.labelW, uy + 2f, 1f, 1f, p); }
        if (it.badge.length() > 0) {
            tp.setColor(alpha(fg, 0.7f));
            cv.drawText(it.badge, it.x + px + it.labelW + 6f, b, tp);
        }
    }

    /** 맛집 머리줄: 제목 + 금색 작은 글('○○역 인근') + 오른쪽 알약 단추. */
    private void drawBar(Canvas cv, ScreenCore.Item it) {
        setText(it.size, true, pal[R_TEXT]);
        float tb = base(it.textY, it.lineH, 0);
        if (it.mq) { cv.save(); cv.clipRect(it.textX, it.textY, it.textX + it.mqVis, it.textY + it.lineH + 2f); cv.drawText(it.lines[0], it.textX - mqOff(it), tb, tp); cv.restore(); }
        else cv.drawText(it.lines.length > 0 ? it.lines[0] : "", it.textX, tb, tp);
        if (it.label.length() > 0) {
            setText(it.size2, true, pal[R_GOLD]);
            float sb = it.top ? tb : base(it.subY, it.lineH2, 0);                    // 한 줄이면 제목과 같은 글자 밑선
            cv.drawText(it.label, it.tagX, sb, tp);
        }
        if (it.badge.length() > 0) {
            float rad = it.sh / 2f;
            rf.set(it.sx, it.sy, it.sx + it.sw, it.sy + it.sh);
            p.setStyle(Paint.Style.FILL); p.setColor(pal[R_CARD]); cv.drawRoundRect(rf, rad, rad, p);
            if (it == pressed) { p.setColor(0x14808080); cv.drawRoundRect(rf, rad, rad, p); }
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(pal[R_BORDER]);
            rf2.set(it.sx + 0.5f, it.sy + 0.5f, it.sx + it.sw - 0.5f, it.sy + it.sh - 0.5f);
            cv.drawRoundRect(rf2, rad - 0.5f, rad - 0.5f, p);
            p.setStyle(Paint.Style.FILL);
            setText(ScreenCore.BAR_BTN, false, pal[R_SUB]); tp.setTextAlign(Paint.Align.CENTER);
            cv.drawText(it.badge, it.sx + it.sw / 2f, base(it.sy, it.sh, 0), tp);
            tp.setTextAlign(Paint.Align.LEFT);
        }
    }

    /** 카드 위 제목줄(웹 .sec): 제목(글자 사이 0.4) · 알약 · 가운데 작은 글 · 오른쪽 테두리 단추. */
    private void drawSec(Canvas cv, ScreenCore.Item it) {
        // 제목이 둘이면(두 쪽 카드: 혼잡도 ↔ 객실 친구들) 옆으로 미는 정도에 맞춰 첫째 글이 사라지며 둘째 글이 나타난다(손가락을 따라 되돌아가기도 한다)
        float sw = it.lines.length > 1 ? pgSceneShare() : 0f, keep = 1f - sw;
        tp.setLetterSpacing(0.4f / it.size);
        if (keep > 0.003f) { setText(it.size, false, alpha(pal[R_SUB], keep)); tp.setLetterSpacing(0.4f / it.size); cv.drawText(it.lines[0], it.textX, base(it.y, it.h, 0) - 3f * sw, tp); }
        if (sw > 0.003f) { setText(it.size, false, alpha(pal[R_SUB], sw)); tp.setLetterSpacing(0.4f / it.size); cv.drawText(it.lines[1], it.textX, base(it.y, it.h, 0) + 3f * keep, tp); }
        tp.setLetterSpacing(0f);
        if (it.badge.length() > 0 && keep > 0.003f) {                                  // 알약은 첫째 제목(혼잡도)에 딸려 있다 — 함께 사라진다
            float ph = 18f, py = it.y + (it.h - ph) / 2f;
            rf.set(it.bx, py, it.bx + it.badgeW, py + ph);
            p.setStyle(Paint.Style.FILL); p.setColor(alpha(cc(it.ac, pal[R_GOLD]), keep)); cv.drawRoundRect(rf, 6f, 6f, p);
            setText(ScreenCore.SEC_PILL, true, alpha(pal[R_WHITE], keep)); tp.setTextAlign(Paint.Align.CENTER);
            cv.drawText(it.badge, it.bx + it.badgeW / 2f, base(py, ph, 0), tp); tp.setTextAlign(Paint.Align.LEFT);
        }
        if (it.label.length() > 0) {
            setText(it.size2, true, pal[R_SUB]);
            cv.drawText(it.label, it.tagX, base(it.y, it.h, 0), tp);
        }
        if (it.go.length() > 0) {
            rf.set(it.sx, it.sy, it.sx + it.sw, it.sy + it.sh);
            float rad = it.sh / 2f;
            if (it == pressed) { p.setStyle(Paint.Style.FILL); p.setColor(alpha(pal[R_GOLD], 0.14f)); cv.drawRoundRect(rf, rad, rad, p); }
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(pal[R_GOLD]);
            rf2.set(it.sx + 0.5f, it.sy + 0.5f, it.sx + it.sw - 0.5f, it.sy + it.sh - 0.5f); cv.drawRoundRect(rf2, rad - 0.5f, rad - 0.5f, p);
            p.setStyle(Paint.Style.FILL);
            setText(ScreenCore.SEC_BTN, true, pal[R_GOLD]); tp.setTextAlign(Paint.Align.CENTER);
            cv.drawText(it.go, it.sx + it.sw / 2f, base(it.sy, it.sh, 0), tp); tp.setTextAlign(Paint.Align.LEFT);
        }
    }

    /** 기준시각 줄(웹 홈 경로 카드 맨 아래). */
    private void drawTrow(Canvas cv, ScreenCore.Item it) {
        if (it == pressed) { p.setStyle(Paint.Style.FILL); p.setColor(0x0F808080); rf.set(it.x, it.y, it.x + it.w, it.y + it.h); cv.drawRect(rf, p); }
        if (it.label.length() > 0) { setText(it.size2, false, pal[R_SUB]); cv.drawText(it.label, it.bx, base(it.y, it.h, 0), tp); }
        setText(it.size, false, it.on ? pal[R_SUB] : pal[R_TEXT]);
        cv.drawText(it.lines[0], it.textX, base(it.y, it.h, 0), tp);
        if (it.tag.length() > 0) { setText(it.size2, false, pal[R_SUB]); cv.drawText(it.tag, it.tagX, base(it.y, it.h, 0), tp); }
        if (it.badge.length() > 0) {
            rf.set(it.sx, it.sy, it.sx + it.sw, it.sy + it.sh); int c = cc(it.ac, 0xFF30D158);
            p.setStyle(Paint.Style.FILL); p.setColor(alpha(c, 0.15f)); cv.drawRoundRect(rf, 8f, 8f, p);
            setText(it.size2, true, c); tp.setTextAlign(Paint.Align.CENTER);
            cv.drawText(it.badge, it.sx + it.sw / 2f, base(it.sy, it.sh, 0), tp); tp.setTextAlign(Paint.Align.LEFT);
        }
        if (it.go.length() > 0) { setText(it.size2, false, pal[R_SUB]); cv.drawText(it.go, it.btx, base(it.y, it.h, 0), tp); }
    }

    /** 시트 머리(웹 transitDetailHandle): 손잡이 40x5 · 제목 15px 800 · 오른쪽 28 동그란 ×(rgba(120,120,128,.16)). */
    private void drawShd(Canvas cv, ScreenCore.Item it) {
        p.setStyle(Paint.Style.FILL); p.setColor(pal[R_BORDER2]);
        rf.set(it.bx, it.by, it.bx + 40f, it.by + ScreenCore.SHD_HANDLE_H); cv.drawRoundRect(rf, 3f, 3f, p);
        for (int i = 0; i < it.lines.length; i++) { setText(it.size, true, pal[R_TEXT]); cv.drawText(it.lines[i], it.textX, base(it.textY + i * it.lineH, it.lineH, 0), tp); }
        final float cx = it.sx + it.sw / 2f, cy = it.sy + it.sh / 2f;
        p.setColor(it == pressed ? 0x47787880 : 0x29787880); cv.drawCircle(cx, cy, it.sw / 2f, p);
        p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1.7f); p.setStrokeCap(Paint.Cap.ROUND); p.setColor(pal[R_TEXT]);
        cv.drawLine(cx - 4.2f, cy - 4.2f, cx + 4.2f, cy + 4.2f, p); cv.drawLine(cx + 4.2f, cy - 4.2f, cx - 4.2f, cy + 4.2f, p);
        p.setStyle(Paint.Style.FILL); p.setStrokeCap(Paint.Cap.BUTT); p.setStrokeWidth(1f);
    }

    // ───────────── 세부경로 줄(웹 .tdsec-row): 진행 레일 · 현재위치 점 · 아이콘 · 뱃지 · 펼침 정거장 ─────────────
    /** 구간 아이콘(손으로 그린 선 모양: w 도보 · s 지하철 · b 버스). 새 객체 없이 중심 (cx,cy) 기준 16dp 안에 그린다. */
    private void tdIcon(Canvas cv, String k, float cx, float cy, int c) {
        p.setColor(c); p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1.8f); p.setStrokeCap(Paint.Cap.ROUND);
        if ("w".equals(k)) {
            p.setStyle(Paint.Style.FILL); cv.drawCircle(cx + 1f, cy - 6f, 2f, p); p.setStyle(Paint.Style.STROKE);
            cv.drawLine(cx + 1f, cy - 3.2f, cx - 1f, cy + 1.8f, p);
            cv.drawLine(cx - 1f, cy + 1.8f, cx - 4f, cy + 6.5f, p); cv.drawLine(cx - 1f, cy + 1.8f, cx + 2.5f, cy + 6.5f, p);
            cv.drawLine(cx + 0.6f, cy - 2f, cx + 4.2f, cy + 0.2f, p); cv.drawLine(cx + 0.6f, cy - 2f, cx - 3f, cy - 0.8f, p);
        } else if ("s".equals(k)) {
            rf.set(cx - 5f, cy - 7f, cx + 5f, cy + 4.5f); cv.drawRoundRect(rf, 3f, 3f, p);
            cv.drawLine(cx - 5f, cy - 1.5f, cx + 5f, cy - 1.5f, p);
            cv.drawLine(cx - 3.5f, cy + 4.5f, cx - 5.2f, cy + 7.5f, p); cv.drawLine(cx + 3.5f, cy + 4.5f, cx + 5.2f, cy + 7.5f, p);
            p.setStyle(Paint.Style.FILL); cv.drawCircle(cx - 2.4f, cy + 1.5f, 1.1f, p); cv.drawCircle(cx + 2.4f, cy + 1.5f, 1.1f, p);
        } else {
            rf.set(cx - 6f, cy - 7f, cx + 6f, cy + 5.5f); cv.drawRoundRect(rf, 2.5f, 2.5f, p);
            cv.drawLine(cx - 6f, cy - 1.5f, cx + 6f, cy - 1.5f, p);
            cv.drawLine(cx - 3.5f, cy + 5.5f, cx - 3.5f, cy + 7.5f, p); cv.drawLine(cx + 3.5f, cy + 5.5f, cx + 3.5f, cy + 7.5f, p);
            p.setStyle(Paint.Style.FILL); cv.drawCircle(cx - 3f, cy + 2f, 1.1f, p); cv.drawCircle(cx + 3f, cy + 2f, 1.1f, p);
        }
        p.setStyle(Paint.Style.FILL); p.setStrokeCap(Paint.Cap.BUTT);
    }
    private void drawTdrow(Canvas cv, ScreenCore.Item it) {
        final float hh = it.f1, y = it.y, x = it.x;
        final long now = System.currentTimeMillis();
        final boolean act = it.ln2 > it.ln && now >= it.ln && now < it.ln2;
        final float ratio = it.ln2 <= it.ln ? 0f : now >= it.ln2 ? 1f : now <= it.ln ? 0f : (float) (now - it.ln) / (float) (it.ln2 - it.ln);
        final int col = cc(it.ac, pal[R_SUB]);
        tdDrawn = true; final boolean tdFirst = act && !tdAct; if (act) tdAct = true;
        p.setStyle(Paint.Style.FILL);
        if (act) { p.setColor(pal[R_CARD2]); rf.set(x, y, x + it.w, y + hh); cv.drawRect(rf, p); }
        else if (it == pressed && it.act != null) { p.setColor(pal[R_CARD2]); rf.set(x, y, x + it.w, y + hh); cv.drawRect(rf, p); }
        // 진행 레일: 바탕 선 + 지나온 만큼 색 채움(첫 줄은 가운데부터 · 마지막 줄은 가운데까지)
        final String pos = it.gk;
        final float t0 = ("f".equals(pos) || "o".equals(pos)) ? y + hh / 2f : y, t1 = ("l".equals(pos) || "o".equals(pos)) ? y + hh / 2f : y + hh;
        p.setColor(cc(it.lc, pal[R_BORDER])); rf.set(it.sx - 1.5f, t0, it.sx + 1.5f, t1); cv.drawRect(rf, p);
        if (ratio > 0f) { p.setColor(col); rf.set(it.sx - 1.5f, t0, it.sx + 1.5f, t0 + (t1 - t0) * ratio); cv.drawRect(rf, p); }
        // 아이콘 동그라미(2px 카드색 테두리)
        final float cy = y + hh / 2f - 0.5f;
        p.setColor(pal[R_CARD]); cv.drawCircle(it.sx, cy, 17f, p);
        p.setColor(cc(it.dc, pal[R_CARD2])); cv.drawCircle(it.sx, cy, 15f, p);
        tdIcon(cv, it.dk, it.sx, cy, col);
        // 뱃지 + 펼침 동그라미
        if (it.badgeW > 0f) {
            rf.set(it.bx, it.sy, it.bx + it.badgeW, it.sy + ScreenCore.TD_BADGE_H);
            p.setColor(cc(it.fill, pal[R_CARD2])); cv.drawRoundRect(rf, ScreenCore.TD_BADGE_H / 2f, ScreenCore.TD_BADGE_H / 2f, p);
            final String bt = ellipsizeTd(it.badge, it.badgeW - ScreenCore.TD_BADGE_PX * 2f, ScreenCore.TD_BADGE_TXT, true);          // 줄이는 쪽이 Paint 색을 지우므로 먼저 구하고 색을 정한다
            setText(ScreenCore.TD_BADGE_TXT, true, cc(it.line, pal[R_SUB])); tp.setTextAlign(Paint.Align.CENTER);
            cv.drawText(bt, it.bx + it.badgeW / 2f, base(it.sy, ScreenCore.TD_BADGE_H, 0), tp);
            tp.setTextAlign(Paint.Align.LEFT);
        }
        if (it.pub) {
            final float cr = ScreenCore.TD_CHEV / 2f;
            p.setColor(pal[R_CARD2]); cv.drawCircle(it.ix, it.iy, cr, p);
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(pal[R_BORDER]); cv.drawCircle(it.ix, it.iy, cr - 0.5f, p);
            p.setStyle(Paint.Style.FILL); p.setColor(pal[R_SUB]);
            float ang = it.on ? 180f : 0f;                                                           // 열리면 위로 뒤집힌다(웹 rotate 180° · transition .2s)
            Long tg = it.key.length() > 0 ? tdTog.get(it.key) : null;
            if (tg != null) {
                final float fr = (SystemClock.uptimeMillis() - tg.longValue()) / 200f;
                if (fr < 1f) { final float e = 1f - (1f - fr) * (1f - fr); ang = (it.on ? e : 1f - e) * 180f; tdAnim = true; }
            }
            cv.save(); cv.rotate(ang, it.ix, it.iy);
            tdTri.rewind(); tdTri.moveTo(it.ix - 3.6f, it.iy - 1.6f); tdTri.lineTo(it.ix + 3.6f, it.iy - 1.6f); tdTri.lineTo(it.ix, it.iy + 2.2f); tdTri.close();
            cv.drawPath(tdTri, p);
            cv.restore();
        }
        for (int i = 0; i < it.lines.length; i++) { setText(ScreenCore.TD_PATH, false, pal[R_SUB]); cv.drawText(it.lines[i], it.bx, base(it.textY + i * ScreenCore.TD_PATH_LH, ScreenCore.TD_PATH_LH, 0), tp); }
        if (it.tag.length() > 0) { setText(ScreenCore.TD_CNT, false, pal[R_SUB]); cv.drawText(it.tag, it.bx, base(it.f3, ScreenCore.TD_CNT_LH, 0), tp); }
        // 오른쪽 시간
        tp.setTextAlign(Paint.Align.RIGHT);
        if (it.label.length() > 0) { setText(ScreenCore.TD_TIME, true, cc(it.tc, pal[R_SUB])); tp.setTextAlign(Paint.Align.RIGHT); cv.drawText(it.label, it.btx, base(it.by, ScreenCore.TD_TIME_LH, 0), tp); }
        if (it.value.length() > 0) { setText(ScreenCore.TD_RNG, false, pal[R_SUB]); tp.setTextAlign(Paint.Align.RIGHT); cv.drawText(it.value, it.btx, base(it.bty, ScreenCore.TD_RNG_LH, 0), tp); }
        tp.setTextAlign(Paint.Align.LEFT);
        // 줄 아래 가는 선(펼친 줄은 목록 끝에)
        p.setColor(pal[R_BORDER]); rf.set(x, y + hh - 1f, x + it.w, y + hh); cv.drawRect(rf, p);                // 웹: 줄 아래 선은 펼쳐도 그대로, 목록은 그 아래
        // 펼친 정거장 목록
        if (it.on) {
            final int ns = it.gb.length;
            for (int k = 0; k < ns; k++) {
                final float ry = y + hh + ScreenCore.TD_STOP_PAD_T + k * ScreenCore.TD_STOP_ROW, dcy = ry + ScreenCore.TD_STOP_ROW / 2f, dx = x + ScreenCore.TD_STOP_PAD_L + 4.5f;
                final boolean end = it.gb[k];
                if (end) { p.setStyle(Paint.Style.FILL); p.setColor(col); cv.drawCircle(dx, dcy, 4.5f, p); }
                else {
                    p.setStyle(Paint.Style.FILL); p.setColor(col); cv.drawCircle(dx, dcy, 4.5f, p);
                    p.setColor(pal[R_CARD]); cv.drawCircle(dx, dcy, 2.5f, p);
                }
                setText(12f, end, end ? pal[R_TEXT] : pal[R_SUB]);
                cv.drawText(it.sa[k * 2], dx + 4.5f + 10f, base(ry, ScreenCore.TD_STOP_ROW, 0), tp);
                setText(11f, false, pal[R_SUB]); tp.setTextAlign(Paint.Align.RIGHT);
                cv.drawText(it.sa[k * 2 + 1], x + it.w - ScreenCore.TD_PADH, base(ry, ScreenCore.TD_STOP_ROW, 0), tp); tp.setTextAlign(Paint.Align.LEFT);
            }
        }
        // 현재위치 점: 빨간 점 + 흰 테두리 + 옅은 고리 + 퍼지는 맥박(1.4초, ease-out)
        if (act) {
            final float my = t0 + (t1 - t0) * ratio;
            { final float pr = 6.5f * 2.5f + 1f, ax = it.sx - pr, ay = my - pr, bx = it.sx + pr, by = my + pr; if (!tdFirst) { tdX0 = Math.min(tdX0, ax); tdY0 = Math.min(tdY0, ay); tdX1 = Math.max(tdX1, bx); tdY1 = Math.max(tdY1, by); } else { tdX0 = ax; tdY0 = ay; tdX1 = bx; tdY1 = by; } }
            final float ph = (SystemClock.uptimeMillis() % 1400L) / 1400f, e = 1f - (1f - ph) * (1f - ph);
            p.setStyle(Paint.Style.FILL);
            p.setColor(0xFFFF3B30); p.setAlpha(Math.round(255f * 0.65f * (1f - e))); cv.drawCircle(it.sx, my, 6.5f * (1f + 1.5f * e), p);
            p.setColor(0x4DFF3B30); cv.drawCircle(it.sx, my, 8.5f, p);
            p.setColor(0xFFFFFFFF); cv.drawCircle(it.sx, my, 6.5f, p);
            p.setColor(0xFFFF3B30); cv.drawCircle(it.sx, my, 4f, p);
        }
        p.setStyle(Paint.Style.FILL); p.setStrokeWidth(1f);
    }
    /** 뱃지가 좁으면 … 으로 줄인다(글자 폭은 지금 칠하는 Paint 로). */
    private String ellipsizeTd(String s, float maxW, float size, boolean bold) {
        setText(size, bold, 0);
        if (tp.measureText(s) <= maxW) return s;
        int n = s.length();
        while (n > 1 && tp.measureText(s, 0, n) + tp.measureText("\u2026") > maxW) n--;
        return s.substring(0, n) + "\u2026";
    }

    /** 맛집 장소 카드: 순위 동그라미 · 이름 · 업종/주소 · (별점|공공데이터 딱지)·거리·길찾기 글. */
    private void drawPlace(Canvas cv, ScreenCore.Item it) {
        float rad = it.radius;
        rf.set(it.x, it.y, it.x + it.w, it.y + it.h);
        p.setStyle(Paint.Style.FILL); p.setColor(pal[R_CARD]); cv.drawRoundRect(rf, rad, rad, p);
        if (it == pressed) { p.setColor(0x14808080); cv.drawRoundRect(rf, rad, rad, p); }
        p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(pal[R_BORDER]);
        rf2.set(it.x + 0.5f, it.y + 0.5f, it.x + it.w - 0.5f, it.y + it.h - 0.5f);
        cv.drawRoundRect(rf2, rad - 0.5f, rad - 0.5f, p);
        p.setStyle(Paint.Style.FILL);
        // 순위 동그라미
        float rr = ScreenCore.PLACE_RANK / 2f;
        p.setColor(it.pub ? 0x33808088 : pal[R_GOLD]);
        cv.drawCircle(it.bx + rr, it.by + rr, rr, p);
        if (it.rank.length() > 0) {
            setText(11f, true, 0xFF121214); tp.setTextAlign(Paint.Align.CENTER);
            cv.drawText(it.rank, it.bx + rr, base(it.by, ScreenCore.PLACE_RANK, 0), tp);
            tp.setTextAlign(Paint.Align.LEFT);
        }
        // 이름 · 업종/주소
        setText(it.size, true, pal[R_TEXT]);
        cv.drawText(it.lines.length > 0 ? it.lines[0] : "", it.textX, base(it.textY, it.lineH, 0), tp);
        setText(it.size2, false, pal[R_SUB]);
        for (int k = 0; k < it.lines2.length; k++) cv.drawText(it.lines2[k], it.textX, base(it.subY + k * it.lineH2, it.lineH2, k), tp);
        // 한 줄
        float mh = it.metaH, my = it.metaY;
        if (it.stars.length() > 0) { setText(ScreenCore.PLACE_STAR, true, 0xFFFFD60A); cv.drawText(it.stars, it.starX, base(my, mh, 0), tp); }
        if (it.badge.length() > 0) {
            rf.set(it.badgeX, my, it.badgeX + it.badgePw, my + mh); p.setColor(0x29787880); cv.drawRoundRect(rf, mh / 2f, mh / 2f, p);
            setText(ScreenCore.PLACE_META, false, pal[R_SUB]); cv.drawText(it.badge, it.badgeX + 8f, base(my, mh, 0), tp);
        }
        if (it.dist.length() > 0) {
            rf.set(it.distX, my, it.distX + it.distPw, my + mh); p.setColor(pal[R_BG]); cv.drawRoundRect(rf, mh / 2f, mh / 2f, p);
            setText(ScreenCore.PLACE_META, false, pal[R_SUB]); cv.drawText(it.dist, it.distX + 8f, base(my, mh, 0), tp);
        }
        if (it.go.length() > 0) { setText(ScreenCore.PLACE_META, true, 0xFF03C75A); cv.drawText(it.go, it.goX, base(my, mh, 0), tp); }
    }

    /** 뉴스 줄: 왼쪽 금색 막대 · 제목(굵게, 여러 줄) · 작은 글 · 오른쪽 › · 아래 가는 선. */
    private void drawNews(Canvas cv, ScreenCore.Item it) {
        if (it == pressed) { rf.set(it.x, it.y, it.x + it.w, it.y + it.h); p.setStyle(Paint.Style.FILL); p.setColor(0x14808080); cv.drawRoundRect(rf, 8f, 8f, p); }
        p.setStyle(Paint.Style.FILL); p.setColor(pal[R_GOLD]);
        rf.set(it.bx, it.by, it.bx + ScreenCore.NEWS_BARW, it.by + it.sh); cv.drawRoundRect(rf, 1.5f, 1.5f, p);
        setText(it.size, true, pal[R_TEXT]);
        for (int k = 0; k < it.lines.length; k++) cv.drawText(it.lines[k], it.textX, base(it.textY + k * it.lineH, it.lineH, k), tp);
        if (it.lines2.length > 0) { setText(it.size2, false, pal[R_SUB]); cv.drawText(it.lines2[0], it.textX, base(it.subY, it.lineH2, 0), tp); }
        setText(ScreenCore.NEWS_CHEV, false, pal[R_SUB]); cv.drawText("\u203A", it.tagX, base(it.metaY, ScreenCore.NEWS_CHEV * ScreenCore.NEWS_LH, 0), tp);
        p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(pal[R_BORDER]);
        cv.drawLine(it.x, it.y + it.h - 0.5f, it.x + it.w, it.y + it.h - 0.5f, p);
        p.setStyle(Paint.Style.FILL);
    }

    private void drawDivider(Canvas cv, ScreenCore.Item it) {
        p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(it.line != null ? cc(it.line, pal[R_BORDER]) : ("border2".equals(it.bg) ? pal[R_BORDER2] : pal[R_BORDER]));
        cv.drawLine(it.x, it.y + 0.5f, it.x + it.w, it.y + 0.5f, p);
        p.setStyle(Paint.Style.FILL);
    }

    private void drawCard(Canvas cv, ScreenCore.Item it) {
        rf.set(it.x, it.y, it.x + it.w, it.y + it.h);
        p.setStyle(Paint.Style.FILL); p.setColor(pal[R_CARD]);
        cv.drawRoundRect(rf, 12f, 12f, p);
        if (it == pressed) { p.setColor(0x14808080); cv.drawRoundRect(rf, 12f, 12f, p); }
        p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(pal[R_BORDER]);
        rf2.set(it.x + 0.5f, it.y + 0.5f, it.x + it.w - 0.5f, it.y + it.h - 0.5f);
        cv.drawRoundRect(rf2, 11.5f, 11.5f, p);
        p.setStyle(Paint.Style.FILL);
        // 그림 칸
        rf.set(it.ix, it.iy, it.ix + it.iw, it.iy + it.ih);
        Bitmap bmp = it.img.length() > 0 ? ImageBank.get(it.img, Math.round(it.iw * dpr), Math.round(it.ih * dpr), this) : null;
        if (bmp != null) {
            p.setColor(pal[R_WHITE]); cv.drawRoundRect(rf, 8f, 8f, p);
            float bw = bmp.getWidth(), bh = bmp.getHeight();
            float s = Math.min(it.iw / bw, it.ih / bh);
            float dw = bw * s, dh = bh * s, dx = it.ix + (it.iw - dw) / 2f, dy = it.iy + (it.ih - dh) / 2f;
            rf2.set(dx, dy, dx + dw, dy + dh);
            cv.drawBitmap(bmp, null, rf2, bmpPaint);
        } else {
            p.setColor(pal[R_IMGBG]); cv.drawRoundRect(rf, 8f, 8f, p);
            if (it.fb.length() > 0) {
                setText(26f, false, pal[R_TEXT]); tp.setTextAlign(Paint.Align.CENTER);
                cv.drawText(it.fb, it.ix + it.iw / 2f, base(it.iy, it.ih, 0), tp);
                tp.setTextAlign(Paint.Align.LEFT);
            }
        }
        // 이름 줄 + 최저가
        setText(it.size, true, pal[R_TEXT]);
        for (int k = 0; k < it.lines.length; k++) cv.drawText(it.lines[k], it.textX, base(it.textY + k * it.lineH, it.lineH, k), tp);
        if (it.tag.length() > 0) { setText(it.size, true, pal[R_GOLD]); cv.drawText(it.tag, it.tagX, base(it.textY, it.lineH, 0), tp); }
    }

    /** 넘치는 이름의 흐름(왼쪽으로 넘친 길이만큼 갔다가 오른쪽으로 돌아온다): 처음·끝에서 잠깐 멈춘다. 새 객체 없음. */
    private float mqOff(ScreenCore.Item it) {
        float over = it.mqW - it.mqVis;
        if (over <= 0f) return 0f;
        float run = over / 30f * 1000f, pause = 1200f, cyc = pause + run + pause + run;       // 초당 30dp
        float t = (float) ((SystemClock.uptimeMillis() - mqT0) % (long) cyc);
        mqDrawn = true;
        if (t < pause) return 0f;
        t -= pause; if (t < run) return over * (t / run);
        t -= run; if (t < pause) return over;
        t -= pause; return over * (1f - t / run);
    }
    private void drawTextBlock(Canvas cv, ScreenCore.Item it) {
        int c = alpha(roleColor(it.color), it.alpha);
        setText(it.size, it.bold, c);
        if (it.mq && it.lines.length > 0) {                                                  // 놀이터 칸을 남기고 넘치는 이름: 보이는 칸 안에서 좌우로 흐른다
            cv.save(); cv.clipRect(it.x, it.y, it.x + it.mqVis, it.y + it.h);
            cv.drawText(it.lines[0], it.x - mqOff(it), base(it.y, it.lineH, 0), tp);
            cv.restore(); return;
        }
        if (it.segs != null) { drawRich(cv, it, it.textX, it.textY, c); return; }
        for (int k = 0; k < it.lines.length; k++) {
            float x = it.x;
            if ("center".equals(it.align)) { tp.setTextAlign(Paint.Align.CENTER); x = it.x + it.w / 2f; }
            else if ("right".equals(it.align)) { tp.setTextAlign(Paint.Align.RIGHT); x = it.x + it.w; }
            cv.drawText(it.lines[k], x, base(it.y + k * it.lineH, it.lineH, k), tp);
        }
        tp.setTextAlign(Paint.Align.LEFT);
    }

    /** 경로 카드 버튼 줄의 전환 연출(웹 RowNative): 최종 모양 위에 카드색 덮개를 얹고 네 조각을 엔진이 정한 종류·시간·곡선대로 움직인다. 방금 일어난 전환만 그리고, 아니면 아무것도 안 그린다. */
    private void drawRowAnim(Canvas cv, ScreenCore.Item it) {
        if (it.subs == null) return;
        long wall = System.currentTimeMillis();
        if (it.sq != arSq) { arSq = it.sq; arT0 = ActRowCore.fresh(it.sq, wall) ? SystemClock.uptimeMillis() - Math.max(0L, wall - it.sq) : 0L; }
        if (arT0 == 0L) return;
        long el = SystemClock.uptimeMillis() - arT0;
        if (el >= it.ams) return;
        ActRowCore.frame(it.ak, ActRowCore.ease(Math.max(0f, el) / (float) it.ams, it.aez), it.w, it.h, it.gap, arF);
        arAnim = true;
        rf.set(it.x, it.y, it.x + it.w, it.y + it.h);
        cv.save(); cv.clipRect(rf);
        p.setStyle(Paint.Style.FILL); p.setColor(cc(it.ac, pal[R_CARD])); cv.drawRect(rf, p);
        for (int k = 3; k >= 0; k--) {                                    // 옛 칸 → 새 칸 → 가운데 → 왼쪽 순(웹과 같다)
            int sl = k == 3 ? 3 : (k == 2 ? 2 : (k == 1 ? 1 : 0)), b = sl * 5;
            ScreenCore.Item sub = it.subs[sl];
            if (sub == null || arF[b] == 0f) continue;
            sub.x = it.x + arF[b + 1]; sub.y = it.y + arF[b + 2]; sub.w = arF[b + 3]; sub.h = arF[b + 4];
            drawButton(cv, sub);
        }
        cv.restore();
    }

    private void drawButton(Canvas cv, ScreenCore.Item it) {
        rf.set(it.x, it.y, it.x + it.w, it.y + it.h);
        p.setStyle(Paint.Style.FILL); p.setColor(rtColor(it, 0, cc(it.fill, pal[R_CARD])));
        cv.drawRoundRect(rf, it.radius, it.radius, p);
        if (it == pressed) { p.setColor(0x14808080); cv.drawRoundRect(rf, it.radius, it.radius, p); }
        int lc = rtColor(it, 1, cc(it.line, pal[R_BORDER]));
        if ((lc >>> 24) != 0) {
            float bw = it.act != null && it.act.v != null && it.act.v.startsWith("rh.tab.") ? 1.5f : 1f, hb = bw / 2f;         // 웹 경로 탭 단추 테두리 1.5px
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(bw); p.setColor(lc);
            rf2.set(it.x + hb, it.y + hb, it.x + it.w - hb, it.y + it.h - hb);
            cv.drawRoundRect(rf2, it.radius - hb, it.radius - hb, p);
        }
        p.setStyle(Paint.Style.FILL);
        setText(it.size, it.bold, rtColor(it, 2, cc(it.tc, pal[R_SUB]))); tp.setTextAlign(it.left ? Paint.Align.LEFT : Paint.Align.CENTER);
        cv.drawText(it.lines.length > 0 ? it.lines[0] : it.label, it.left ? it.x + 11f : it.x + it.w / 2f, base(it.y, it.h, 0), tp);
        tp.setTextAlign(Paint.Align.LEFT);
    }

    private final android.graphics.Path lbOuter = new android.graphics.Path(), lbInner = new android.graphics.Path();
    private void drawPanel(Canvas cv, ScreenCore.Item it) {
        rf.set(it.x, it.y, it.x + it.w, it.y + it.h);
        if (it.sw > 0f && it.ac != null) {                                                  // 웹 border-left(굵은 색 띠): 바깥 모양에 띠 색을 깔고 안쪽 모양(왼쪽 모서리가 띠만큼 덜 둥글다)을 카드 색으로 덮는다
            float r = it.radius, bw = it.sw;
            lbOuter.reset(); lbOuter.addRoundRect(rf, r, r, android.graphics.Path.Direction.CW);
            p.setStyle(Paint.Style.FILL); p.setColor(it.line != null ? cc(it.line, 0) : pal[R_BORDER]); cv.drawPath(lbOuter, p);
            cv.save(); cv.clipPath(lbOuter);
            p.setColor(cc(it.ac, 0)); rf2.set(it.x, it.y, it.x + bw + r, it.y + it.h); cv.drawRoundRect(rf2, r, r, p);
            cv.restore();
            rf2.set(it.x + bw, it.y + 1f, it.x + it.w - 1f, it.y + it.h - 1f);
            float rl = Math.max(0f, r - bw), rr = Math.max(0f, r - 1f), rv = Math.max(0f, r - 1f);
            lbInner.reset(); lbInner.addRoundRect(rf2, new float[] { rl, rv, rr, rv, rr, rv, rl, rv }, android.graphics.Path.Direction.CW);
            p.setColor(it.fill != null ? cc(it.fill, 0) : pal[R_CARD]); cv.drawPath(lbInner, p);
            return;
        }
        if (it.fill != null) { p.setStyle(Paint.Style.FILL); p.setColor(cc(it.fill, 0)); cv.drawRoundRect(rf, it.radius, it.radius, p); }
        if (it.line != null) {
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(cc(it.line, 0));
            rf2.set(it.x + 0.5f, it.y + 0.5f, it.x + it.w - 0.5f, it.y + it.h - 0.5f);
            cv.drawRoundRect(rf2, it.radius - 0.5f, it.radius - 0.5f, p);
            p.setStyle(Paint.Style.FILL);
        }
    }

    /** 카드 둘레 무지개 띠: 바깥으로 2 · 안쪽으로 0.5 (웹 inset -2px + padding 2.5px), 원뿔 그라데이션이 위(12시)에서 시작해 시계 방향으로 돈다. */
    private void drawGlow(Canvas cv, ScreenCore.Item it) {
        final float deg = (SystemClock.uptimeMillis() % 3000L) / 3000f * 360f;
        glowMx.setRotate(deg - 90f, 0f, 0f); glowMx.postTranslate(it.x + it.w / 2f, it.y + it.h / 2f); glowSh.setLocalMatrix(glowMx);
        p.setShader(glowSh); p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(2.5f);
        rf2.set(it.x - 0.75f, it.y - 0.75f, it.x + it.w + 0.75f, it.y + it.h + 0.75f);
        cv.drawRoundRect(rf2, it.radius + 0.75f, it.radius + 0.75f, p);
        p.setShader(null); p.setStyle(Paint.Style.FILL);
        if (!glowDrawn) { glowDrawn = true; glX0 = it.x - 3f; glY0 = it.y - 3f; glX1 = it.x + it.w + 3f; glY1 = it.y + it.h + 3f; }
        else { glX0 = Math.min(glX0, it.x - 3f); glY0 = Math.min(glY0, it.y - 3f); glX1 = Math.max(glX1, it.x + it.w + 3f); glY1 = Math.max(glY1, it.y + it.h + 3f); }
    }

    private void drawTopLine(Canvas cv, ScreenCore.Item it) {
        p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(pal[R_BORDER]);
        cv.drawLine(it.x, it.y + 0.5f, it.x + it.w, it.y + 0.5f, p);
        p.setStyle(Paint.Style.FILL);
    }

    private void drawToggle(Canvas cv, ScreenCore.Item it) {
        if (it.top) drawTopLine(cv, it);
        setText(it.size, it.bold, cc(it.tc, pal[R_TEXT]));
        for (int k = 0; k < it.lines.length; k++) cv.drawText(it.lines[k], it.textX, base(it.textY + k * it.lineH, it.lineH, k), tp);
        if (it.lines2.length > 0) {
            float y2 = it.textY + it.lines.length * it.lineH + 2f;
            setText(it.size2, false, cc(it.sc, pal[R_SUB]));
            for (int k = 0; k < it.lines2.length; k++) cv.drawText(it.lines2[k], it.textX, base(y2 + k * it.lineH2, it.lineH2, k), tp);
        }
        float r = it.sh / 2f;
        rf.set(it.sx, it.sy, it.sx + it.sw, it.sy + it.sh);
        p.setStyle(Paint.Style.FILL); p.setColor(it.on ? cc(it.ac, 0xFF30D158) : pal[R_BORDER2]);
        cv.drawRoundRect(rf, r, r, p);
        float d = it.sh - 6f, kx = it.on ? it.sx + it.sw - 3f - d : it.sx + 3f;
        p.setColor(0x33000000); cv.drawCircle(kx + d / 2f, it.sy + 3f + d / 2f + 1f, d / 2f, p);      // 그림자
        p.setColor(0xFFFFFFFF); cv.drawCircle(kx + d / 2f, it.sy + 3f + d / 2f, d / 2f, p);
    }

    private void drawNav(Canvas cv, ScreenCore.Item it) {
        if (it.top) drawTopLine(cv, it);
        if (it == pressed) { rf.set(it.x, it.y, it.x + it.w, it.y + it.h); p.setStyle(Paint.Style.FILL); p.setColor(0x14808080); cv.drawRoundRect(rf, 8f, 8f, p); }
        setText(it.size, false, cc(it.tc, pal[R_TEXT]));
        cv.drawText(it.lines.length > 0 ? it.lines[0] : "", it.textX, base(it.textY, it.lineH, 0), tp);
        int sc = cc(it.sc, pal[R_SUB]);
        setText(13f, false, sc); tp.setTextAlign(Paint.Align.RIGHT);
        cv.drawText("\u203A", it.x + it.w, base(it.textY, it.lineH, 0), tp);
        if (it.label.length() > 0) { setText(it.size2, false, sc); tp.setTextAlign(Paint.Align.RIGHT); cv.drawText(it.label, it.sx - 8f, base(it.textY, it.lineH, 0), tp); }
        tp.setTextAlign(Paint.Align.LEFT);
    }

    private void drawSelect(Canvas cv, ScreenCore.Item it) {
        rf.set(it.x, it.y, it.x + it.w, it.y + it.h);
        p.setStyle(Paint.Style.FILL); p.setColor(cc(it.fill, pal[R_CARD]));
        cv.drawRoundRect(rf, it.radius, it.radius, p);
        if (it == pressed) { p.setColor(0x14808080); cv.drawRoundRect(rf, it.radius, it.radius, p); }
        p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(2f); p.setColor(it.on ? cc(it.ac, pal[R_GOLD]) : cc(it.line, pal[R_BORDER]));
        rf2.set(it.x + 1f, it.y + 1f, it.x + it.w - 1f, it.y + it.h - 1f);
        cv.drawRoundRect(rf2, it.radius - 1f, it.radius - 1f, p);
        p.setStyle(Paint.Style.FILL);
        if (it.prevC.length == 5) {                                                  // 미리보기 칸: 위 55% · 아래 45% · 막대 셋
            float x = it.sx, y = it.sy, w = it.sw, h = it.sh, cut = y + h * 0.55f;
            cv.save();
            rf.set(x, y, x + w, y + h); cv.clipRect(rf);
            p.setColor(cc(it.prevC[0], 0)); cv.drawRect(x, y, x + w, cut, p);
            p.setColor(cc(it.prevC[1], 0)); cv.drawRect(x, cut, x + w, y + h, p);
            p.setColor(cc(it.prevC[2], 0)); cv.drawRect(x, cut, x + w, cut + 1f, p);
            float bw = (w - 8f - 6f) / 3f, by = cut + (y + h - cut) / 2f - 2f;
            for (int k = 0; k < 3; k++) {
                p.setColor(cc(it.prevC[k == 0 ? 3 : 4], 0));
                rf.set(x + 4f + k * (bw + 3f), by, x + 4f + k * (bw + 3f) + bw, by + 4f); cv.drawRoundRect(rf, 2f, 2f, p);
            }
            cv.restore();
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(cc(it.prevC[2], 0));
            rf2.set(x + 0.5f, y + 0.5f, x + w - 0.5f, y + h - 0.5f); cv.drawRoundRect(rf2, 9.5f, 9.5f, p);
            p.setStyle(Paint.Style.FILL);
        }
        setText(it.size, true, cc(it.tc, pal[R_TEXT]));
        for (int k = 0; k < it.lines.length; k++) cv.drawText(it.lines[k], it.textX, base(it.textY + k * it.lineH, it.lineH, k), tp);
        if (it.lines2.length > 0) {
            float y2 = it.textY + it.lines.length * it.lineH + 2f;
            setText(it.size2, false, cc(it.sc, pal[R_SUB]));
            for (int k = 0; k < it.lines2.length; k++) cv.drawText(it.lines2[k], it.textX, base(y2 + k * it.lineH2, it.lineH2, k), tp);
        }
        if (it.on) {                                                                 // 체크 원
            p.setStyle(Paint.Style.FILL); p.setColor(cc(it.ac2, pal[R_GOLD]));
            cv.drawCircle(it.bx + 11f, it.by + 11f, 11f, p);
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(2f); p.setStrokeCap(Paint.Cap.ROUND); p.setColor(cc(it.tcCk, 0xFF121214));
            cv.drawLine(it.bx + 6.5f, it.by + 11.5f, it.bx + 9.8f, it.by + 14.8f, p);
            cv.drawLine(it.bx + 9.8f, it.by + 14.8f, it.bx + 15.5f, it.by + 7.8f, p);
            p.setStyle(Paint.Style.FILL); p.setStrokeCap(Paint.Cap.BUTT);
        }
    }

    private void drawField(Canvas cv, ScreenCore.Item it) {
        rf.set(it.x, it.y, it.x + it.w, it.y + it.h);
        if (it.fill != null) { p.setStyle(Paint.Style.FILL); p.setColor(cc(it.fill, 0)); cv.drawRoundRect(rf, it.radius, it.radius, p); }
        boolean editing = it.key.equals(editKey);
        if (it.line != null) {
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(editing ? 1.5f : 1f); p.setColor(editing ? pal[R_GOLD] : cc(it.line, 0));
            rf2.set(it.x + 0.5f, it.y + 0.5f, it.x + it.w - 0.5f, it.y + it.h - 0.5f);
            cv.drawRoundRect(rf2, it.radius - 0.5f, it.radius - 0.5f, p);
            p.setStyle(Paint.Style.FILL);
        }
        if (editing) return;                                                         // 편집 중엔 진짜 입력칸이 이 자리에 글자를 그린다
        String v = fieldVals.get(it.key);
        boolean empty = v == null || v.length() == 0;
        setText(it.size, false, empty ? alpha(cc(it.sc, pal[R_SUB]), 0.8f) : cc(it.tc, pal[R_TEXT]));
        cv.save(); rf.set(it.x + 6f, it.y, it.x + it.w - 6f, it.y + it.h); cv.clipRect(rf);
        if (it.multi) drawFieldLines(cv, it, empty ? it.label : v);
        else cv.drawText(empty ? it.label : v, it.textX, base(it.y, it.h, 0), tp);
        cv.restore();
    }
    /** 여러 줄 입력칸(글쓰기 내용)의 글자: 줄바꿈 문자와 칸 너비에서 줄을 나눠 위쪽부터 그린다(칸 밖은 잘림). */
    private void drawFieldLines(Canvas cv, ScreenCore.Item it, String src) {
        float lh = it.size * 1.45f, maxW = Math.max(10f, it.w - 26f), top = it.y + 10f;
        int line = 0;
        String[] paras = src.split("\n", -1);
        for (int pi = 0; pi < paras.length; pi++) {
            String rest = paras[pi];
            while (true) {
                float by = top + line * lh + it.size;
                if (by - it.size > it.y + it.h) return;
                int c = rest.length() == 0 ? 0 : tp.breakText(rest, true, maxW, null);
                if (c <= 0 && rest.length() > 0) c = 1;
                if (c > 0) cv.drawText(rest.substring(0, c), it.textX, by, tp);
                line++;
                rest = rest.substring(c);
                if (rest.length() == 0) break;
            }
        }
    }

    /** 굵은 구간이 섞인 글: 줄마다 조각을 차례로 그린다(새 글자·객체를 만들지 않는다 — 조각은 배치 때 미리 나눠 뒀다). */
    private void drawRich(Canvas cv, ScreenCore.Item it, float x0, float y0, int color) {
        for (int k = 0; k < it.segs.length; k++) {
            float x = x0, b = -1f;
            for (int q = 0; q < it.segs[k].length; q++) {
                int sc0 = (it.segBold[k][q] && it.ac2 != null) ? cc(it.ac2, color) : color;
                if (it.segCol != null && it.segCol[k][q] != null) sc0 = cc(it.segCol[k][q], sc0);
                setText(it.size, it.segBold[k][q], sc0);
                if (b < 0f) b = base(y0 + k * it.lineH, it.lineH, k);
                cv.drawText(it.segs[k][q], x, b, tp);
                x += tp.measureText(it.segs[k][q]);
            }
        }
    }

    private void drawBox(Canvas cv, ScreenCore.Item it) {
        rf.set(it.x, it.y, it.x + it.w, it.y + it.h);
        if (it.fill != null) {
            p.setStyle(Paint.Style.FILL); p.setColor(cc(it.fill, 0));
            cv.drawRoundRect(rf, it.radius, it.radius, p);
        }
        if (it.line != null) {
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(cc(it.line, 0));
            rf2.set(it.x + 0.5f, it.y + 0.5f, it.x + it.w - 0.5f, it.y + it.h - 0.5f);
            cv.drawRoundRect(rf2, it.radius - 0.5f, it.radius - 0.5f, p);
            p.setStyle(Paint.Style.FILL);
        }
        int c = it.tc != null ? cc(it.tc, 0) : roleColor(it.color);
        setText(it.size, it.bold, c);
        if (it.segs != null) { drawRich(cv, it, it.textX, it.textY, c); return; }
        for (int k = 0; k < it.lines.length; k++) cv.drawText(it.lines[k], it.textX, base(it.textY + k * it.lineH, it.lineH, k), tp);
    }

    private void drawSearch(Canvas cv, ScreenCore.Item it) {
        int accent = cc(it.ac, 0xFFE63329);
        rf.set(it.x, it.y, it.x + it.w, it.y + it.h);
        p.setStyle(Paint.Style.FILL); p.setColor(pal[R_CARD]);
        cv.drawRoundRect(rf, it.radius, it.radius, p);
        p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(pal[R_BORDER]);
        rf2.set(it.x + 0.5f, it.y + 0.5f, it.x + it.w - 0.5f, it.y + it.h - 0.5f);
        cv.drawRoundRect(rf2, it.radius - 0.5f, it.radius - 0.5f, p);
        p.setStyle(Paint.Style.FILL); p.setColor(accent);
        float r1 = ScreenCore.SEARCH_BADGE / 2f;
        cv.drawCircle(it.bx + r1, it.by + r1, r1, p);
        if (it.badge.length() > 0) {
            setText(12f, true, pal[R_WHITE]); tp.setTextAlign(Paint.Align.CENTER);
            cv.drawText(it.badge, it.bx + r1, base(it.by, ScreenCore.SEARCH_BADGE, 0), tp);
            tp.setTextAlign(Paint.Align.LEFT);
        }
        float r2 = ScreenCore.SEARCH_BTN / 2f, cx = it.btx + r2, cy = it.bty + r2;
        p.setStyle(Paint.Style.FILL); p.setColor(accent);
        cv.drawCircle(cx, cy, r2, p);
        if (it == pressed) { p.setColor(0x33000000); cv.drawCircle(cx, cy, r2, p); }
        p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1.8f); p.setStrokeCap(Paint.Cap.ROUND); p.setColor(pal[R_WHITE]);
        cv.drawCircle(cx - 1.3f, cy - 1.3f, 4.4f, p);                      // 돋보기
        cv.drawLine(cx + 1.9f, cy + 1.9f, cx + 5.4f, cy + 5.4f, p);
        p.setStyle(Paint.Style.FILL); p.setStrokeCap(Paint.Cap.BUTT);
    }

    private void drawPostHead(Canvas cv, ScreenCore.Item it) {
        if (it == pressed) { rf.set(it.x, it.y, it.x + it.w, it.y + it.h); p.setStyle(Paint.Style.FILL); p.setColor(pal[R_CARD2]); cv.drawRoundRect(rf, 11f, 11f, p); }       // 웹 .dc-post:active { background: card2 }
        if (it.badge.length() > 0) {
            float bh = ScreenCore.POST_BADGE * 1.4f + 4f;
            rf.set(it.bx, it.by, it.bx + it.badgeW, it.by + bh);
            p.setStyle(Paint.Style.FILL); p.setColor(cc(it.ac, 0xFF8E8E93)); cv.drawRoundRect(rf, 5f, 5f, p);
            setText(ScreenCore.POST_BADGE, true, pal[R_WHITE]); tp.setTextAlign(Paint.Align.CENTER);
            cv.drawText(it.badge, it.bx + it.badgeW / 2f, base(it.by, bh, 0), tp);
            tp.setTextAlign(Paint.Align.LEFT);
        }
        setText(it.size, true, pal[R_TEXT]);
        for (int k = 0; k < it.lines.length; k++) cv.drawText(it.lines[k], it.textX, base(it.textY + k * it.lineH, it.lineH, k), tp);
        if (it.tag.length() > 0) { setText(it.size2, true, pal[R_GOLD]); cv.drawText(it.tag, it.tagX, base(it.metaY, it.lineH2, 0), tp); }
        if (it.label.length() > 0) { setText(it.size2, false, pal[R_SUB]); cv.drawText(it.label, it.distX, base(it.metaY, it.lineH2, 0), tp); }
        if (it.mp != null) {
            for (int k = 0; k < it.mp.length; k++) {
                setText(ScreenCore.POST_DOT, false, pal[R_BORDER2]); cv.drawText("\u00b7", it.mpx[k] - ScreenCore.POST_MGAP - it.dotW, base(it.metaY, it.lineH2, 0), tp);
                setText(it.size2, false, pal[R_SUB]); cv.drawText(it.mp[k], it.mpx[k], base(it.metaY, it.lineH2, 0), tp);
            }
            if (it.cmS.length() > 0) {
                setText(ScreenCore.POST_DOT, false, pal[R_BORDER2]); cv.drawText("\u00b7", it.dotX0, base(it.metaY, it.lineH2, 0), tp);
                setText(ScreenCore.POST_CMT_SIZE, false, pal[R_TEXT]); cv.drawText(it.cmS, it.cmX, base(it.metaY - (it.rowH - it.lineH2) / 2f, it.rowH, 0), tp);
            }
        }
    }
    private void drawCmt(Canvas cv, ScreenCore.Item it) {
        setText(it.size2, true, cc(it.ac, 0xFF5E5CE6));
        cv.drawText(it.tag, it.x, base(it.metaY, it.lineH2, 0), tp);
        if (it.label.length() > 0) { setText(ScreenCore.CMT_TIME, false, pal[R_SUB]); cv.drawText(it.label, it.tagX, base(it.metaY, it.lineH2, 0), tp); }
        setText(it.size, false, pal[R_TEXT]);
        for (int k = 0; k < it.lines.length; k++) cv.drawText(it.lines[k], it.textX, base(it.textY + k * it.lineH, it.lineH, k), tp);
    }
    private void drawRbtn(Canvas cv, ScreenCore.Item it) {
        boolean sq = it == pressed;                                                    // 웹 .dc-react-btn:active { transform: scale(.95) }
        if (sq) { cv.save(); cv.scale(0.95f, 0.95f, it.x + it.w / 2f, it.y + it.h / 2f); }
        drawRbtn0(cv, it);
        if (sq) cv.restore();
    }
    private void drawRbtn0(Canvas cv, ScreenCore.Item it) {
        rf.set(it.x, it.y, it.x + it.w, it.y + it.h);
        p.setStyle(Paint.Style.FILL); p.setColor(cc(it.fill, pal[R_CARD2])); cv.drawRoundRect(rf, it.radius, it.radius, p);
        p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(cc(it.line, pal[R_BORDER2]));
        rf2.set(it.x + 0.5f, it.y + 0.5f, it.x + it.w - 0.5f, it.y + it.h - 0.5f); cv.drawRoundRect(rf2, it.radius - 0.5f, it.radius - 0.5f, p);
        p.setStyle(Paint.Style.FILL);
        setText(it.size, true, cc(it.tc, pal[R_SUB])); tp.setTextAlign(Paint.Align.CENTER);
        cv.drawText(it.label, it.x + it.w / 2f, base(it.y, it.h, 0), tp);
        tp.setTextAlign(Paint.Align.LEFT);
    }
    // ───────────── 위아래로 밀어 고르는 목록(pickl) ─────────────
    private float pickGet(ScreenCore.Item it) { Float f = pickOff.get(it.key); return f == null ? 0f : ScreenCore.clamp(f, it.pickMax); }
    private ScreenCore.Item pickAt(float px, float py) {
        if (lay == null || lay.body == null) return null;
        float x = px / dpr, by = py / dpr - lay.headH + scrollY;
        int[] r = lay.bodyRange(by - 2f, by + 2f);
        for (int i = r[1] - 1; i >= r[0]; i--) { ScreenCore.Item it = lay.body[i]; if (it.kind == ScreenCore.K_PICKL && x >= it.x && x < it.x + it.w && by >= it.y && by < it.y + it.h) return it; }
        return null;
    }
    /** 지금 목록 안쪽이 밀려 있는 정도: 접힌 목록은 고른 줄이 맨 위에 오도록(펼침·접힘 도중엔 스프링으로 그 사이를). */
    private float pickOffNow(ScreenCore.Item it) {
        if (!it.fold) return pickGet(it);
        float tgt = it.open ? pickGet(it) : Math.min(it.onIdx * it.rowH, Math.max(0f, it.rows.size() * it.rowH - 4f - it.collH));
        if (foldKey != null && foldKey.equals(it.key)) {
            float f = (SystemClock.uptimeMillis() - foldT0) / FOLD_MS;
            if (f < 1f) { float sp = Math.max(0f, Math.min(1f, spring(f < 0f ? 0f : f))); return foldOff0 + (tgt - foldOff0) * sp; }
        }
        return tgt;
    }
    /** 지금 보이는 목록 높이: 펼침·접힘 도중엔 시작 높이에서 끝 높이로 스프링(살짝 지나쳤다 되돌아). */
    private float pickVisH(ScreenCore.Item it) {
        if (!it.fold || foldKey == null || !foldKey.equals(it.key)) return it.h;
        float f = (SystemClock.uptimeMillis() - foldT0) / FOLD_MS;
        if (f >= 1f) return it.h;
        return it.h + (foldH0 - it.h) * (1f - spring(f < 0f ? 0f : f));
    }
    /** 접었다 펼치기: 배치를 다시 하고(아래 칸들이 새 자리로) 시작 높이·밀림을 기억해 스프링으로 옮긴다. */
    private void toggleFold(ScreenCore.Item it, boolean open) {
        if (!it.fold) return;
        final String key = it.key;
        float h0 = pickVisH(it), off0 = pickOffNow(it);
        if (open) {                                                                       // 펼칠 때 안쪽은 고른 줄이 맨 위에 오게(접힌 모습 그대로 시작해 아래로 펼쳐진다)
            foldOpen.add(key);
            pickOff.put(key, Math.max(0f, Math.min(it.onIdx * it.rowH, Math.max(0f, it.rows.size() * it.rowH - 4f - it.openH))));
        } else foldOpen.remove(key);
        foldKey = key; foldT0 = SystemClock.uptimeMillis(); foldH0 = h0; foldOff0 = off0;
        relayout();
        invalidate();
    }
    private void tapPick(ScreenCore.Item it, float px, float py) {
        float by = py / dpr - lay.headH + scrollY, ry = by - it.y + pickOffNow(it);
        int i = (int) Math.floor(ry / it.rowH);
        if (it.rows == null || i < 0 || i >= it.rows.size()) return;
        ScreenCore.Item r = it.rows.get(i); if (r.act == null || ry - i * it.rowH > r.h) return;
        if (it.fold && !it.open) { blurInput(); toggleFold(it, true); return; }          // 접힌 한 줄을 누르면 아래로 펼친다
        boolean same = r.on;
        for (ScreenCore.Item q : it.rows) q.on = q == r;                                  // 새 화면이 오기 전에 먼저 그 줄을 켜 보인다
        blurInput();
        if (it.fold) { it.onIdx = i; ScreenCore.pickSelect(screen, it.key, i); toggleFold(it, false); if (same) return; }          // 고르면 펼친 목록이 위로 접히며 고른 줄만 남는다(이미 고른 줄이면 접기만)
        else invalidate();
        if (listener != null) listener.onAction(r.act);
    }
    private void drawPick(Canvas cv, ScreenCore.Item it) {
        if (it.rows == null || it.rows.isEmpty()) return;
        int on = -1; for (int i = 0; i < it.rows.size(); i++) if (it.rows.get(i).on) { on = i; break; }
        if (!it.fold) {
            String sg = on + ":" + it.rows.size(), old = pickSig.get(it.key);
            if (!sg.equals(old)) {                                                            // 고른 줄이 바뀌었으면(새 화면) 그 줄이 보이게만 맞춘다 — 사용자가 민 자리는 그대로 둔다
                pickSig.put(it.key, sg); float o = pickGet(it);
                if (on >= 0) { float top = on * it.rowH; if (top < o || top + it.rowH > o + it.h + 4f) pickOff.put(it.key, ScreenCore.clamp(top - (it.h - it.rowH) / 2f, it.pickMax)); }
            }
        }
        float off = pickOffNow(it), vh = pickVisH(it);
        if (it.fold && foldKey != null && foldKey.equals(it.key) && vh != it.h) spAnim = true;
        cv.save(); cv.clipRect(it.x, it.y, it.x + it.w, it.y + Math.max(1f, vh));
        for (ScreenCore.Item r : it.rows) {
            float ry = it.y + r.y - off; if (ry + r.h < it.y || ry > it.y + vh) continue;
            rf.set(it.x, ry, it.x + it.w, ry + r.h);
            p.setStyle(Paint.Style.FILL); p.setColor(r.on ? pal[R_GOLD] : pal[R_CARD2]); cv.drawRoundRect(rf, 9f, 9f, p);
            if (!r.on) { p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(pal[R_BORDER2]); rf2.set(it.x + 0.5f, ry + 0.5f, it.x + it.w - 0.5f, ry + r.h - 0.5f); cv.drawRoundRect(rf2, 8.5f, 8.5f, p); p.setStyle(Paint.Style.FILL); }
            int tc = r.on ? 0xFFFFFFFF : pal[R_TEXT], sc = r.on ? 0xE6FFFFFF : pal[R_SUB];
            float rgt = it.fold && r.on ? 30f : 12f;                                           // 접을 수 있는 목록은 고른 줄 오른쪽 끝에 ▾/▴ 자리
            setText(r.size, true, tc); cv.drawText(r.label, it.x + 12f, base(ry, r.h, 0), tp);
            setText(r.size - 1f, false, sc); cv.drawText(r.value, it.x + it.w * 0.5f - (it.fold && r.on ? 8f : 0f), base(ry, r.h, 0), tp);
            if (r.lines != null && r.lines.length > 0 && r.lines[0].length() > 0) { setText(r.size, true, tc); tp.setTextAlign(Paint.Align.RIGHT); cv.drawText(r.lines[0], it.x + it.w - rgt, base(ry, r.h, 0), tp); tp.setTextAlign(Paint.Align.LEFT); }
            if (it.fold && r.on) {                                                             // ▾(접힘) / ▴(펼침) — 목록이 접힌다는 표시
                float cx = it.x + it.w - 16f, cy = ry + r.h / 2f, k = 4.2f; boolean up = it.open;
                p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(2f); p.setStrokeCap(Paint.Cap.ROUND); p.setStrokeJoin(Paint.Join.ROUND); p.setColor(tc);
                android.graphics.Path ph = pickChev; ph.reset(); ph.moveTo(cx - k, cy + (up ? k * .5f : -k * .5f)); ph.lineTo(cx, cy + (up ? -k * .5f : k * .5f)); ph.lineTo(cx + k, cy + (up ? k * .5f : -k * .5f));
                cv.drawPath(ph, p); p.setStrokeCap(Paint.Cap.BUTT); p.setStrokeJoin(Paint.Join.MITER); p.setStyle(Paint.Style.FILL);
            }
        }
        if (it.pickMax > 0f && it.open || (it.pickMax > 0f && !it.fold)) {                // 더 있다는 표시: 오른쪽 가는 막대
            float th = Math.max(16f, it.h * it.h / (it.h + it.pickMax)), ty = it.y + (it.h - th) * (off / it.pickMax);
            p.setStyle(Paint.Style.FILL); p.setColor(alpha(pal[R_SUB], 0.45f)); rf.set(it.x + it.w - 3f, ty, it.x + it.w - 1f, ty + th); cv.drawRoundRect(rf, 1f, 1f, p);
        }
        cv.restore();
    }
    private static final float INBAR_BTN_R = 9f;
    private void drawInbar(Canvas cv, ScreenCore.Item it) {
        boolean editing = it.key.equals(editKey);
        rf.set(it.ix, it.iy, it.ix + it.iw, it.iy + it.ih);
        if (it.fill != null) { p.setStyle(Paint.Style.FILL); p.setColor(cc(it.fill, 0)); cv.drawRoundRect(rf, it.radius, it.radius, p); }
        if (it.line != null) {
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(editing ? 1.5f : 1f); p.setColor(editing ? pal[R_GOLD] : cc(it.line, 0));
            rf2.set(it.ix + 0.5f, it.iy + 0.5f, it.ix + it.iw - 0.5f, it.iy + it.ih - 0.5f); cv.drawRoundRect(rf2, it.radius - 0.5f, it.radius - 0.5f, p);
            p.setStyle(Paint.Style.FILL);
        }
        if (it.dotC != null) { p.setStyle(Paint.Style.FILL); p.setColor(cc(it.dotC, 0)); cv.drawCircle(it.bx, it.by, 5f, p); }
        if (it.fill2 != null && it.sfh > 0f) {                                              // 웹 입력칸의 바탕 띠(글자 자리만)
            float sx0 = it.textX, sx1 = it.btx - 10f, sy0 = it.iy + (it.ih - it.sfh) / 2f;
            if (sx1 > sx0) { rf.set(sx0, sy0, sx1, sy0 + it.sfh); p.setStyle(Paint.Style.FILL); p.setColor(cc(it.fill2, pal[R_CARD2])); cv.drawRoundRect(rf, it.sfr, it.sfr, p); }
        }
        if (!editing) {
            String v = fieldVals.get(it.key);
            boolean empty = v == null || v.length() == 0;
            setText(it.size, it.bold, empty ? alpha(cc(it.sc, pal[R_SUB]), 0.8f) : cc(it.tc, pal[R_TEXT]));
            cv.save(); rf.set(it.ix + 8f, it.iy, it.ix + it.iw - 8f, it.iy + it.ih); cv.clipRect(rf);
            cv.drawText(empty ? it.label : inbarShown(it, empty ? it.label : v), it.textX, base(it.iy, it.ih, 0), tp);          // 글자 자리보다 길면 … 으로 줄여 보인다(편집을 시작하면 전체 글자 · 후보 줄은 이름을 다 보여 준다)
            cv.restore();
        }
        if (it.sw <= 0f) return;                                                              // 단추 없는 입력칸(nobtn)
        rf.set(it.btx, it.bty, it.btx + it.sw, it.bty + it.sh);
        if (it.pathOps.length > 0) {                                                       // 둥근 아이콘 단추(실시간 대화 보내기): 금색 동그라미 + 흰 아이콘
            p.setStyle(Paint.Style.FILL); p.setColor(it.on ? alpha(cc(it.ac, pal[R_GOLD]), 0.5f) : cc(it.ac, pal[R_GOLD])); cv.drawCircle(it.btx + it.sw / 2f, it.bty + it.sh / 2f, it.sw / 2f, p);
            if (it == pressed && !it.on) { p.setColor(0x33000000); cv.drawCircle(it.btx + it.sw / 2f, it.bty + it.sh / 2f, it.sw / 2f, p); }
            android.graphics.Path ph = pathFor(it);
            if (ph != null) {
                float ic = ScreenCore.INBAR_ICON, sc = ic / 24f;
                cv.save(); cv.translate(it.btx + (it.sw - ic) / 2f, it.bty + (it.sh - ic) / 2f); cv.scale(sc, sc);
                p.setColor(pal[R_WHITE]); cv.drawPath(ph, p);
                cv.restore();
            }
            return;
        }
        float br = it.radius > 0f ? it.radius : INBAR_BTN_R;      // 입력칸을 네모(r:0)로 두는 홈 줄도 단추는 웹처럼 둥글게
        long nowI = SystemClock.uptimeMillis();
        boolean busy = it.on || (it.act != null && it.act.v != null && it.act.v.equals(hintAct) && nowI < hintUntil);        // 감지 중(엔진이 준 흐린 단추) 또는 방금 눌러 엔진 답을 기다리는 동안
        boolean down = it == pressed && !busy;
        float bcx = it.btx + it.sw / 2f, bcy = it.bty + it.sh / 2f;
        cv.save();
        if (down || (busy && nowI - lastTapScale < 160L)) cv.scale(0.94f, 0.94f, bcx, bcy);                                  // 누르는 순간 살짝 작아지는 반응
        p.setStyle(Paint.Style.FILL); p.setColor(busy ? alpha(cc(it.ac, pal[R_GOLD]), 0.5f) : cc(it.ac, pal[R_GOLD])); cv.drawRoundRect(rf, br, br, p);
        if (down) { p.setColor(0x33000000); cv.drawRoundRect(rf, br, br, p); }
        setText(it.size2 > 0f ? it.size2 : it.size, true, busy ? alpha(cc(it.ac2, 0xFF121214), 0.6f) : cc(it.ac2, 0xFF121214)); tp.setTextAlign(Paint.Align.CENTER);
        float tw = tp.measureText(it.badge), spR = 5f, gap = 6f;
        boolean spinOn = (it.spin && it.on) || (it.act != null && it.act.v != null && it.act.v.equals(hintAct) && nowI < hintUntil);
        if (spinOn && it.sw >= tw + 2f * (spR + gap) + 6f) {                                                                    // 글자 왼쪽에서 도는 작은 스피너
            float sx = bcx - (tw + gap + 2f * spR) / 2f + spR;
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(2f); p.setStrokeCap(Paint.Cap.ROUND); p.setColor(alpha(cc(it.ac2, 0xFF121214), 0.75f));
            rf2.set(sx - spR, bcy - spR, sx + spR, bcy + spR);
            cv.drawArc(rf2, (nowI % 900L) / 900f * 360f, 250f, false, p);
            p.setStrokeCap(Paint.Cap.BUTT); p.setStyle(Paint.Style.FILL);
            cv.drawText(it.badge, bcx + (gap + 2f * spR) / 2f, base(it.bty, it.sh, 0), tp);
        } else cv.drawText(it.badge, bcx, base(it.bty, it.sh, 0), tp);
        if (spinOn) inbarBusy = true;
        cv.restore();
        tp.setTextAlign(Paint.Align.LEFT);
    }
    private long lastTapScale;
    /** 경로 결과 머리줄: 큰 분 숫자 + 단위 + 구간명(같은 글자 밑선) + 오른쪽 즐겨찾기 알약 + 닫기 ×. */
    /** 구간 타임라인 칸: 이름(아래 맞춤, 두 줄까지) · 배지 · 선+점 · 시각. 무엇을 어떤 색·크기로 쓸지는 전부 엔진이 정했다. */
    private static final boolean SHOW_HERE = false;            // s294: 금색 '지금 칸' 표시(마커와 둘로 보여 헷갈린다) — 끈다
    private void drawTrk(Canvas cv, ScreenCore.Item it) {
        // s257 (YJ: "마커가 2개 나온다"): 금색 '지금 칸'과 회색 '지난 칸'은 엔진이 화면 값을 줄 때 정해 둔 것이라, 마커는 부드럽게 움직이는데 이쪽은 옛 값에 멈춰 둘이 갈라졌다.
        //   마커가 있으면 화면에 실제로 보이는 마커 자리(mkCurX)에서 다시 정한다 — 마커가 hh(엔진 값) 이상 가면 그 칸이 '지금'이고 그 앞은 지난 칸(회색). 마커가 곧 유일한 위치 표시.
        boolean liveHr = it.hr, livePs = it.ps;
        if (lay != null && lay.mk != null && mkHas && it.ci >= 0) {
            ScreenCore.Mark k = lay.mk; float span = k.x1 - k.x0, rr = span > 0.5f ? ScreenCore.clamp((mkCurX(SystemClock.uptimeMillis()) - k.x0) / span, 1f) : 0f;
            int here = rr >= k.hh ? k.t : k.f;
            liveHr = here > 0 && it.ci == here; livePs = here > 0 && it.ci >= 0 && it.ci < here;
        }
        final boolean dwCell = lay != null && lay.mk != null && it.ci >= 0 && it.ci == lay.mk.f && mkDwelling(SystemClock.uptimeMillis());      // s295: 마커가 역에 서 있는 동안 그 역 이름을 금색 굵게(점은 마커가 대신한다)
        final boolean hrNow = SHOW_HERE && liveHr, psNow = livePs;      // s294 (YJ: "지난 역으로 삼은 역은 화면에 표출하지 말고 데이터만 내부에서 계산"): 금색 '지금 칸'(점·이름·고리)은 그리지 않는다 — 엔진 값(hr)과 지난 칸 흐림(ps)은 그대로 계산한다
        float cx = it.x + it.w / 2f, axisTop = it.y + ScreenCore.TRK_NAME_H + ScreenCore.TRK_BADGE_H;
        float ly = axisTop + ScreenCore.TRK_LINE_Y, cy = axisTop + ScreenCore.TRK_DOT_Y;
        // 이름: 마지막 줄의 아래가 nameBot
        if (it.lines.length > 0) {
            setText(it.size, it.bold || hrNow || dwCell, hrNow ? 0xFFFFD60A : dwCell ? pal[R_GOLD] : psNow ? alpha(cc(it.nc, pal[R_TEXT]), 0.35f) : cc(it.nc, pal[R_TEXT])); tp.setTextAlign(Paint.Align.CENTER);      // 지금 칸: 금색 굵게 · 지나간 칸: 흐리게(웹 htl-gps-here · htl-passed)
            for (int i = 0; i < it.lines.length; i++) {
                float top = it.y + it.nameBot - (it.lines.length - i) * it.lineH;
                cv.drawText(it.lines[i], cx, base(top, it.lineH, 0), tp);
            }
            tp.setTextAlign(Paint.Align.LEFT);
        }
        // 배지: 알약(바탕색 + 흰 글) 또는 색 글자
        if (it.label.length() > 0) {
            float rowTop = it.y + ScreenCore.TRK_NAME_H;
            int gcol = cc(it.gc, pal[R_SUB]);
            if ("p".equals(it.gk)) {
                float ph = it.gsz * 1.25f + 2f, pw = it.badgeTw + 2f * it.gx, pt = rowTop + (ScreenCore.TRK_BADGE_H - ph) / 2f;
                rf.set(cx - pw / 2f, pt, cx + pw / 2f, pt + ph);
                p.setStyle(Paint.Style.FILL); p.setColor(gcol); cv.drawRoundRect(rf, 4f, 4f, p);
                setText(it.gsz, true, pal[R_WHITE]); tp.setTextAlign(Paint.Align.CENTER);
                cv.drawText(it.label, cx, base(pt, ph, 0), tp);
            } else {
                setText(it.gsz, true, gcol); tp.setTextAlign(Paint.Align.CENTER);
                cv.drawText(it.label, cx, base(rowTop, ScreenCore.TRK_BADGE_H, 0), tp);
            }
            tp.setTextAlign(Paint.Align.LEFT);
        }
        // 선(앞뒤 칸과 이어지게 겹쳐 그린다)
        p.setStyle(Paint.Style.FILL);
        if (it.lc != null) { p.setColor(psNow ? alpha(cc(it.lc, 0), 0.3f) : cc(it.lc, 0)); cv.drawRect(it.x - 0.5f, ly, cx, ly + ScreenCore.TRK_LINE_H, p); }
        if (it.rc != null) { p.setColor(psNow ? alpha(cc(it.rc, 0), 0.3f) : cc(it.rc, 0)); cv.drawRect(cx, ly, it.x + it.w + 0.5f, ly + ScreenCore.TRK_LINE_H, p); }
        // 점
        if (hrNow) {                                                                   // 지금 칸: 금색 점(14) + 파란 고리가 3→8 로 커졌다 작아졌다(웹 gps-pulse 1.5초)
            final float ph = (SystemClock.uptimeMillis() % 1500L) / 1500f, tri = ph < 0.5f ? ph * 2f : (1f - ph) * 2f, e = tri * tri * (3f - 2f * tri);
            p.setColor(0xFF0A84FF); p.setAlpha(Math.round(255f * (0.4f - 0.32f * e))); cv.drawCircle(cx, cy, 7f + 3f + 5f * e, p);
            p.setColor(0xFFFFD60A); cv.drawCircle(cx, cy, 7f, p);
            hrDrawn = true;
        } else if (psNow) { p.setColor(0x4D555555); cv.drawCircle(cx, cy, "e".equals(it.dk) ? ScreenCore.TRK_E_R : "m".equals(it.dk) ? ScreenCore.TRK_M_R : ScreenCore.TRK_R_R, p); if ("r".equals(it.dk)) { p.setColor(pal[R_CARD]); cv.drawCircle(cx, cy, ScreenCore.TRK_R_R - 3f, p); } }
        else if ("e".equals(it.dk)) { p.setColor(cc(it.dc, 0)); cv.drawCircle(cx, cy, ScreenCore.TRK_E_R, p); }
        else if ("r".equals(it.dk)) { p.setColor(cc(it.dc, 0)); cv.drawCircle(cx, cy, ScreenCore.TRK_R_R, p); p.setColor(pal[R_CARD]); cv.drawCircle(cx, cy, ScreenCore.TRK_R_R - 3f, p); }
        else if ("m".equals(it.dk)) {
            int c1 = cc(it.dc, 0), c2 = it.dc2 != null ? cc(it.dc2, c1) : c1;
            float mr = ScreenCore.TRK_M_R;                                       // 반지름 3dp 의 작은 점 — 왼쪽 반은 앞 색, 오른쪽 반은 뒤 색(그릴 때 새 객체를 만들지 않으려고 그라데이션 대신 반으로 나눠 칠한다)
            cv.save(); cv.clipRect(cx - mr, cy - mr, cx, cy + mr); p.setColor(c1); cv.drawCircle(cx, cy, mr, p); cv.restore();
            cv.save(); cv.clipRect(cx, cy - mr, cx + mr, cy + mr); p.setColor(c2); cv.drawCircle(cx, cy, mr, p); cv.restore();
        }
        // 시각(또는 도보 분)
        if (it.time.length() > 0) {
            setText(it.tsz, it.tb, psNow ? alpha(cc(it.timec, pal[R_SUB]), 0.35f) : cc(it.timec, pal[R_SUB])); tp.setTextAlign(Paint.Align.CENTER);
            cv.drawText(it.time, cx, base(axisTop + ScreenCore.TRK_AXIS_H + ScreenCore.TRK_TIME_GAP, ScreenCore.TRK_TIME_H, 0), tp);
            tp.setTextAlign(Paint.Align.LEFT);
        }
    }
    // ───────────── 혼잡도 카드(머리줄 · 게이지 · 24시간 막대 · 칸별 혼잡) ─────────────
    /** 머리줄: 왼쪽 '지하철 강남'(이름은 굵은 금색) + 작은 글 · 오른쪽 혼잡 단계 글자. 글·색은 엔진이 정했다. */
    private final char[] cdBuf = new char[8];
    private long cdTick = 0L;
    /** AI 승무원 머리줄: 제목(한 줄) · 다음 갱신 카운트다운 알약(마감 시각까지 남은 시간을 m:ss 로) · 새로고침 단추. 글·색·마감 시각은 엔진이 정했다. */
    private void drawAih(Canvas cv, ScreenCore.Item it) {
        setText(it.size, true, pal[R_TEXT]);
        cv.drawText(it.lines[0], it.textX, base(it.y, it.h, 0), tp);
        if (it.ln > 0L) {
            long now = System.currentTimeMillis();
            int rem = (int) Math.max(0L, Math.round((it.ln - now) / 1000.0));
            float pw = it.f1, right = it.f2, py = it.y + (it.h - ScreenCore.AIH_PILL_H) / 2f;
            setText(ScreenCore.AIH_PILL, true, cc(it.tc, 0xFF2F7CF6));
            int n = 0;
            if (rem > 0) {
                int mn = rem / 60, sc = rem % 60;
                if (mn >= 100) cdBuf[n++] = (char) ('0' + (mn / 100) % 10);
                if (mn >= 10) cdBuf[n++] = (char) ('0' + (mn / 10) % 10);
                cdBuf[n++] = (char) ('0' + mn % 10); cdBuf[n++] = ':'; cdBuf[n++] = (char) ('0' + sc / 10); cdBuf[n++] = (char) ('0' + sc % 10);
            }
            float tw = n > 0 ? tp.measureText(cdBuf, 0, n) : tp.measureText(it.label);
            float w = tw + ScreenCore.AIH_PILL_PX * 2f;
            p.setStyle(Paint.Style.FILL); p.setColor(cc(it.fill, 0x1F2F7CF6));
            rf.set(right - w, py, right, py + ScreenCore.AIH_PILL_H); cv.drawRoundRect(rf, 8f, 8f, p);
            if (n > 0) cv.drawText(cdBuf, 0, n, right - w + ScreenCore.AIH_PILL_PX, base(py, ScreenCore.AIH_PILL_H, 0), tp);
            else cv.drawText(it.label, right - w + ScreenCore.AIH_PILL_PX, base(py, ScreenCore.AIH_PILL_H, 0), tp);
            if (rem > 0 && now >= cdTick) { cdTick = now + 900L; postInvalidateDelayed(1000L); }
        }
        rf.set(it.sx, it.sy, it.sx + it.sw, it.sy + it.sh);
        p.setStyle(Paint.Style.FILL); p.setColor(pal[R_CARD2]); cv.drawRoundRect(rf, 9f, 9f, p);
        p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(pal[R_BORDER]);
        rf2.set(it.sx + 0.5f, it.sy + 0.5f, it.sx + it.sw - 0.5f, it.sy + it.sh - 0.5f); cv.drawRoundRect(rf2, 8.5f, 8.5f, p);
        p.setStyle(Paint.Style.FILL);
        android.graphics.Path ph = it.pathOps.length > 0 ? pathFor(it) : null;
        if (ph != null) {
            float ic = ScreenCore.AIH_ICON, sc = ic / 24f;
            cv.save(); cv.translate(it.sx + (it.sw - ic) / 2f, it.sy + (it.sh - ic) / 2f); cv.scale(sc, sc);
            p.setColor(it.on ? alpha(pal[R_TEXT], 0.4f) : (it == pressed ? alpha(pal[R_TEXT], 0.6f) : pal[R_TEXT])); cv.drawPath(ph, p);
            cv.restore();
        }
    }
    /** 홈 '실시간 대화' 머리줄: 색 점 + 굵은 제목 + 작은 꼬리 글(›). 글·색은 엔진이 정했다. */
    private void drawLth(Canvas cv, ScreenCore.Item it) {
        if (it == pressed) { rf.set(it.x, it.y, it.x + it.w, it.y + it.h); p.setStyle(Paint.Style.FILL); p.setColor(0x14808080); cv.drawRoundRect(rf, 6f, 6f, p); }
        p.setStyle(Paint.Style.FILL); p.setColor(cc(it.dotC, 0xFFFF3B30)); cv.drawCircle(it.x + ScreenCore.LTH_DOT / 2f, it.y + (it.h - 4f) / 2f, ScreenCore.LTH_DOT / 2f, p);
        setText(ScreenCore.LTH_TITLE, true, pal[R_TEXT]);
        cv.drawText(it.t1, it.f1, base(it.y, it.h - 4f, 0), tp);
        if (it.t2.length() > 0) { setText(ScreenCore.LTH_TITLE, false, pal[R_SUB]); cv.drawText(it.t2, it.f2, base(it.y, it.h - 4f, 0), tp); }
    }
    /** 알약 글자: 둥근 바탕 + 글(위치·말줄임은 배치가 정했다). */
    /** 노선 알약(웹 _linePillHtml): 노선 색 알약 + 흰 글자, 호선 숫자가 있으면 왼쪽에 반투명 흰 동그라미(알파 .28) 안에 숫자. */
    private void drawLpill(Canvas cv, ScreenCore.Item it) {
        p.setStyle(Paint.Style.FILL); p.setColor(cc(it.fill, 0xFF8E8E93));
        rf.set(it.x, it.y, it.x + it.w, it.y + it.h); cv.drawRoundRect(rf, it.h / 2f, it.h / 2f, p);
        float tx = it.x + ScreenCore.LP_PADL;
        if (it.t1.length() > 0) {
            float cx = it.x + ScreenCore.LP_PADL_N + ScreenCore.LP_NUM / 2f, cy = it.y + it.h / 2f;
            p.setColor(0x47FFFFFF); cv.drawCircle(cx, cy, ScreenCore.LP_NUM / 2f, p);
            setText(ScreenCore.LP_NUM_FS, true, 0xFFFFFFFF); tp.setTextAlign(Paint.Align.CENTER);
            cv.drawText(it.t1, cx, base(cy - ScreenCore.LP_NUM / 2f, ScreenCore.LP_NUM, 0), tp); tp.setTextAlign(Paint.Align.LEFT);
            tx = it.x + ScreenCore.LP_PADL_N + ScreenCore.LP_NUM + ScreenCore.LP_NUM_GAP;
        }
        setText(ScreenCore.LP_FS, true, 0xFFFFFFFF);
        cv.drawText(it.label, tx, base(it.y, it.h, 0), tp);
    }
    private void drawPill(Canvas cv, ScreenCore.Item it) {
        p.setStyle(Paint.Style.FILL); p.setColor(cc(it.fill, pal[R_CARD2]));
        rf.set(it.x, it.y, it.x + it.w, it.y + it.h); cv.drawRoundRect(rf, it.f3, it.f3, p);
        setText(it.f2, it.on, cc(it.tc, pal[R_TEXT]));
        cv.drawText(it.t1, it.x + it.f1, base(it.y, it.h, 0), tp);
    }
    /** 홈 '실시간 대화' 한 줄: 닉네임(굵게) · 글(한 줄) · 오른쪽 시각. 말줄임·위치는 배치가 정했다. */
    private void drawLtr(Canvas cv, ScreenCore.Item it) {
        float b = base(it.y, it.h, 0);
        if (it.t1.length() > 0) { setText(ScreenCore.LTR_NICK, true, cc(it.tc, pal[R_GOLD])); cv.drawText(it.t1, it.x, b, tp); }
        setText(ScreenCore.LTR_TXT, false, pal[R_TEXT]); cv.drawText(it.t2, it.f1, b, tp);
        if (it.label.length() > 0) { setText(ScreenCore.LTR_TIME, false, pal[R_SUB]); cv.drawText(it.label, it.f2, b, tp); }
    }
    private void drawCgh(Canvas cv, ScreenCore.Item it) {
        float b1 = 0f;
        setText(ScreenCore.CGH_NAME, false, pal[R_SUB]);
        b1 = base(it.y, ScreenCore.CGH_L1, 0);
        if (it.t1.length() > 0) cv.drawText(it.t1, it.x, b1, tp);
        setText(ScreenCore.CGH_NAME, true, pal[R_GOLD]);
        cv.drawText(it.t2, it.x + it.f1, b1, tp);
        if (it.t3.length() > 0) { setText(ScreenCore.CGH_META, false, pal[R_SUB]); cv.drawText(it.t3, it.x, base(it.y + ScreenCore.CGH_L1, ScreenCore.CGH_L2, 0), tp); }
        if (it.label.length() > 0) {
            setText(ScreenCore.CGH_ST, true, cc(it.sc, pal[R_SUB])); tp.setTextAlign(Paint.Align.RIGHT);
            cv.drawText(it.label, it.x + it.w, base(it.y, it.h, 0), tp);
            tp.setTextAlign(Paint.Align.LEFT);
        }
    }
    /** 게이지: 위에 작은 글 두 개(이름 · %) + 아래에 둥근 채움 막대. */
    private void drawGauge(Canvas cv, ScreenCore.Item it) {
        setText(ScreenCore.GAUGE_LBL, false, pal[R_SUB]);
        float bl = base(it.y, ScreenCore.GAUGE_LBL_H, 0);
        cv.drawText(it.label, it.x, bl, tp);
        if (it.value.length() > 0) { tp.setTextAlign(Paint.Align.RIGHT); cv.drawText(it.value, it.x + it.w, bl, tp); tp.setTextAlign(Paint.Align.LEFT); }
        float ty = it.y + ScreenCore.GAUGE_LBL_H + ScreenCore.GAUGE_GAP, r = ScreenCore.GAUGE_BAR_H / 2f;
        p.setStyle(Paint.Style.FILL); p.setColor(pal[R_BORDER2]);
        rf.set(it.x, ty, it.x + it.w, ty + ScreenCore.GAUGE_BAR_H); cv.drawRoundRect(rf, r, r, p);
        if (it.f1 > 0f) { p.setColor(cc(it.ac, 0xFF34C759)); rf.set(it.x, ty, it.x + Math.max(ScreenCore.GAUGE_BAR_H, it.w * it.f1), ty + ScreenCore.GAUGE_BAR_H); cv.drawRoundRect(rf, r, r, p); }
    }
    /** 24시간 차트의 틀: 바탕·테두리 + 머리(제목 · 작은 출처 · 오른쪽 피크). 막대는 밀리는 줄(drawHbar)이 그 위에 그린다. */
    private void drawChart(Canvas cv, ScreenCore.Item it) {
        rf.set(it.x, it.y, it.x + it.w, it.y + it.h);
        p.setStyle(Paint.Style.FILL); p.setColor(pal[R_CARD2]); cv.drawRoundRect(rf, it.radius, it.radius, p);
        p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(pal[R_BORDER]);
        rf2.set(it.x + 0.5f, it.y + 0.5f, it.x + it.w - 0.5f, it.y + it.h - 0.5f); cv.drawRoundRect(rf2, it.radius - 0.5f, it.radius - 0.5f, p);
        p.setStyle(Paint.Style.FILL);
        float top = it.y + ScreenCore.CHART_PADT, hx = it.x + ScreenCore.CHART_PADL;
        setText(ScreenCore.CHART_HDR, false, pal[R_SUB]);
        cv.drawText(it.t1, hx, base(top, ScreenCore.CHART_HDR_H, 0), tp);
        if (it.t2.length() > 0) { setText(ScreenCore.CHART_SRC, false, pal[R_SUB]); cv.drawText(it.t2, hx + it.f1 + 4f, base(top, ScreenCore.CHART_HDR_H, 0), tp); }
        if (it.t3.length() > 0) { setText(ScreenCore.CHART_HDR, true, cc(it.ac, pal[R_GOLD])); tp.setTextAlign(Paint.Align.RIGHT); cv.drawText(it.t3, it.x + it.w - ScreenCore.CHART_R, base(top, ScreenCore.CHART_HDR_H, 0), tp); tp.setTextAlign(Paint.Align.LEFT); }
    }
    /** 막대 한 칸: 아래에 시간 글자, 그 위에 색 막대(위쪽 모서리만 둥글게). 운행 없는 시간은 흐린 낮은 막대, 지금 시각은 바깥 테두리와 굵은 글자. */
    private void drawHbar(Canvas cv, ScreenCore.Item it) {
        float vw = getWidth() / dpr;
        cv.save();
        cv.clipRect(scrollX + it.f3, it.y, scrollX + vw, it.y + it.h);          // 틀 안쪽으로만 보인다(밀려서 틀 왼쪽 여백으로 넘어가지 않게)
        float cx = it.x + it.w / 2f, bottom = it.y + it.f2 - ScreenCore.CHART_LBL_H, fw = ScreenCore.CHART_FILL_W / 2f;
        boolean cur = it.on;
        int lc = cur ? cc(it.ac, pal[R_TEXT]) : pal[R_SUB];
        p.setStyle(Paint.Style.FILL);
        if (it.top) {
            p.setColor(alpha(pal[R_BORDER2], 0.35f));
            rf.set(cx - fw, bottom - 4f, cx + fw, bottom); cv.drawRoundRect(rf, 2f, 2f, p);
            lc = alpha(lc, 0.35f);
        } else {
            float h = Math.max(4f, it.f1);
            int fc = alpha(cc(it.fill, 0xFF34C759), it.alpha);
            rf.set(cx - fw, bottom - h, cx + fw, bottom + 3f);                    // 아래 3dp 는 글자 위 빈 틈에 걸쳐 모서리를 직각으로 보이게 한다
            p.setColor(fc); cv.drawRoundRect(rf, 3f, 3f, p);
            if (cur) {
                p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(2f); p.setColor(cc(it.ac, 0xFFFFFFFF));
                rf2.set(cx - fw - 2f, bottom - h - 2f, cx + fw + 2f, bottom + 1f); cv.drawRoundRect(rf2, 4f, 4f, p);
                p.setStyle(Paint.Style.FILL);
            }
        }
        setText(ScreenCore.CHART_LBL, cur, lc); tp.setTextAlign(Paint.Align.CENTER);
        cv.drawText(it.label, cx, base(bottom + 3f, ScreenCore.CHART_LBL_H - 3f, 0), tp);
        tp.setTextAlign(Paint.Align.LEFT);
        cv.restore();
    }
    /** 칸별 혼잡: 제목 + 칸 가로줄(칸마다 테두리 색, 글 세 줄 — 칸 번호 · 단계 · %) / 칸이 없으면 안내 글. */
    private void drawCars(Canvas cv, ScreenCore.Item it) {
        if (it.t1.length() > 0) { setText(ScreenCore.CARS_TTL, false, pal[R_SUB]); cv.drawText(it.t1, it.x, base(it.y, ScreenCore.CARS_TTL_H, 0), tp); }
        float cy = it.y + it.f2;
        if (it.ca.length == 0) {
            if (it.value.length() > 0) { setText(11f, false, pal[R_SUB]); cv.drawText(it.value, it.x, base(cy + 6f, 14f, 0), tp); }
            return;
        }
        tp.setTextAlign(Paint.Align.CENTER);
        for (int i = 0; i < it.ca.length; i++) {
            float cx = it.x + i * (it.f1 + ScreenCore.CARS_GAP), mid = cx + it.f1 / 2f;
            int col = cc(it.ca[i], 0xFF34C759);
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1.5f); p.setColor(col);
            rf2.set(cx + 0.75f, cy + 0.75f, cx + it.f1 - 0.75f, cy + it.f3 - 0.75f); cv.drawRoundRect(rf2, 7.25f, 7.25f, p);
            p.setStyle(Paint.Style.FILL);
            float r1 = cy + 7.5f, r2 = r1 + 16f, r3 = r2 + 14.5f;
            setText(11f, true, col); tp.setTextAlign(Paint.Align.CENTER); cv.drawText(it.sa[i * 3], mid, base(r1, 14f, 0), tp);
            setText(10f, false, pal[R_SUB]); tp.setTextAlign(Paint.Align.CENTER); cv.drawText(it.sa[i * 3 + 1], mid, base(r2, 12.5f, 0), tp);
            setText(10f, false, col); tp.setTextAlign(Paint.Align.CENTER); cv.drawText(it.sa[i * 3 + 2], mid, base(r3, 12.5f, 0), tp);
        }
        tp.setTextAlign(Paint.Align.LEFT);
    }
    private void drawRhd(Canvas cv, ScreenCore.Item it) {
        boolean isMsg = "m".equals(it.tag);                                              // 안내 한 줄(고른 탭에 경로가 없을 때): 숫자·단위 없이 굵은 글
        if (isMsg) { setText(ScreenCore.RHD_MSG, true, pal[R_TEXT]); cv.drawText(it.go, it.zoneX, base(it.y, it.h, 0), tp); }
        else {
            setText(it.size, true, pal[R_TEXT]);
            float bl = base(it.y, it.h, 0);
            cv.drawText(it.lines[0], it.textX, bl, tp);
            if (it.label.length() > 0) { setText(it.size2, false, pal[R_SUB]); cv.drawText(it.label, it.tagX, bl, tp); }
            if (it.go.length() > 0) { setText(ScreenCore.RHD_ROUTE, false, pal[R_SUB]); cv.drawText(it.go, it.zoneX, bl, tp); }
        }
        if (it.sw > 0f) {
            float rad = it.sh / 2f;
            rf.set(it.sx, it.sy, it.sx + it.sw, it.sy + it.sh);
            if (it == pressed) { p.setStyle(Paint.Style.FILL); p.setColor(0x22808080); cv.drawRoundRect(rf, rad, rad, p); }
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(pal[R_GOLD]);
            rf2.set(it.sx + 0.5f, it.sy + 0.5f, it.sx + it.sw - 0.5f, it.sy + it.sh - 0.5f);
            cv.drawRoundRect(rf2, rad - 0.5f, rad - 0.5f, p);
            p.setStyle(Paint.Style.FILL);
            setText(ScreenCore.RHD_BTN, true, pal[R_GOLD]); tp.setTextAlign(Paint.Align.CENTER);
            cv.drawText(it.badge, it.sx + it.sw / 2f, base(it.sy, it.sh, 0), tp);
            tp.setTextAlign(Paint.Align.LEFT);
        }
        if (it.on) {
            setText(22f, false, pal[R_SUB]); tp.setTextAlign(Paint.Align.CENTER);
            cv.drawText("\u00d7", it.btx + ScreenCore.RHD_X / 2f, base(it.bty, ScreenCore.RHD_X, 0), tp);
            tp.setTextAlign(Paint.Align.LEFT);
        }
    }
    /** 한 줄 목록(자동완성·기준시각): 종류 딱지 + 이름(굵게) + 작은 글 + (오른쪽 작은 단추). 마지막 줄이 아니면 아래에 가는 선. */
    private void drawSug(Canvas cv, ScreenCore.Item it) {
        if (it == pressed) { p.setStyle(Paint.Style.FILL); p.setColor(0x14808080); cv.drawRect(it.x, it.y, it.x + it.w, it.y + it.h, p); }
        if (it.badge.length() > 0) {
            int bc = cc(it.ac, pal[R_SUB]);
            rf.set(it.bx, it.y + (it.h - 18f) / 2f, it.bx + it.badgeW, it.y + (it.h + 18f) / 2f);
            p.setStyle(Paint.Style.FILL); p.setColor(alpha(bc, 0.16f)); cv.drawRoundRect(rf, 5f, 5f, p);
            setText(ScreenCore.SUG_BADGE, true, bc); tp.setTextAlign(Paint.Align.CENTER);
            cv.drawText(it.badge, it.bx + it.badgeW / 2f, base(rf.top, 18f, 0), tp);
            tp.setTextAlign(Paint.Align.LEFT);
        }
        setText(it.size, true, pal[R_TEXT]);
        cv.drawText(it.lines[0], it.textX, base(it.y, it.h, 0), tp);
        if (it.label.length() > 0) { setText(it.size2, false, pal[R_SUB]); cv.drawText(it.label, it.tagX, base(it.y, it.h, 0), tp); }
        if (it.sw > 0f) {
            rf.set(it.btx, it.bty, it.btx + it.sw, it.bty + it.sh);
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(pal[R_BORDER2]);
            rf2.set(rf.left + 0.5f, rf.top + 0.5f, rf.right - 0.5f, rf.bottom - 0.5f); cv.drawRoundRect(rf2, 7f, 7f, p);
            p.setStyle(Paint.Style.FILL);
            setText(ScreenCore.SUG_BTN, true, pal[R_SUB]); tp.setTextAlign(Paint.Align.CENTER);
            cv.drawText(it.go, it.btx + it.sw / 2f, base(it.bty, it.sh, 0), tp);
            tp.setTextAlign(Paint.Align.LEFT);
        }
        if (!it.on) {
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(pal[R_BORDER2]);
            cv.drawLine(it.x + 14f, it.y + it.h - 0.5f, it.x + it.w - 14f, it.y + it.h - 0.5f, p);
            p.setStyle(Paint.Style.FILL);
        }
    }
    /** 두 줄 경계 한가운데의 동그란 단추(출발↔도착 바꾸기): 바깥 테두리(배경색) + 파란 원 + 흰 아이콘. */
    private void drawSwap(Canvas cv, ScreenCore.Item it) {
        float cx = it.x + it.w / 2f, cy = it.y + it.h / 2f, r = it.w / 2f;
        p.setStyle(Paint.Style.FILL); p.setColor(cc(it.line, pal[R_BG])); cv.drawCircle(cx, cy, r, p);
        p.setColor(cc(it.fill, 0xFF0A84FF)); cv.drawCircle(cx, cy, r - 2.5f - (it == pressed ? 1.5f : 0f), p);
        android.graphics.Path ph = it.pathOps.length > 0 ? pathFor(it) : null;
        if (ph != null) {
            float ic = it.w * 16f / 34f, sc = ic / 24f;
            cv.save(); cv.translate(cx - ic / 2f, cy - ic / 2f); cv.scale(sc, sc);
            p.setColor(cc(it.tc, pal[R_WHITE])); cv.drawPath(ph, p);
            cv.restore();
        }
    }
    private void drawMsgAnim(Canvas cv, ScreenCore.Item it) {
        Long b = msgBorn.isEmpty() ? null : msgBorn.get(msgKey(it));
        if (b == null) { drawMsg(cv, it); return; }
        float f = (SystemClock.uptimeMillis() - b) / (float) MSG_ANIM_MS;
        if (f >= 1f) { msgBorn.remove(msgKey(it)); drawMsg(cv, it); return; }
        float e = 1f - (1f - f) * (1f - f) * (1f - f);                                          // 웹 cubic-bezier(.22,.8,.3,1) 에 가까운 빨리 나오고 천천히 멈춤
        msgAnimOn = true;
        cv.save();
        cv.translate((it.on ? 24f : -24f) * (1f - e), 0f);
        cv.saveLayerAlpha(it.x - 30f, it.y - 2f, it.x + it.w + 30f, it.y + it.h + 2f, Math.round(255f * e));
        drawMsg(cv, it);
        cv.restore(); cv.restore();
    }
    private void drawMsg(Canvas cv, ScreenCore.Item it) {
        if (it.tag.length() > 0) { setText(it.size2, false, pal[R_SUB]); cv.drawText(it.tag, it.x, base(it.y, it.lineH2, 0), tp); }
        rf.set(it.x, it.sy, it.x + it.w, it.sy + it.sh);
        p.setStyle(Paint.Style.FILL); p.setColor(cc(it.fill, pal[R_CARD2])); cv.drawRoundRect(rf, it.radius, it.radius, p);
        if (it.badge.length() > 0) { setText(10f, true, cc(it.ac, 0xFFFF453A)); cv.drawText(it.badge, it.bx, base(it.by, 14f, 0), tp); }
        setText(it.size, false, cc(it.tc, pal[R_TEXT]));
        for (int k = 0; k < it.lines.length; k++) cv.drawText(it.lines[k], it.textX, base(it.textY + k * it.lineH, it.lineH, k), tp);
        float th = ScreenCore.MSG_TIME * 1.35f;
        if (it.label.length() > 0) { setText(ScreenCore.MSG_TIME, false, pal[R_SUB]); cv.drawText(it.label, it.x, base(it.metaY, th, 0), tp); }
        if (it.go.length() > 0) {
            int sub = alpha(pal[R_SUB], it == pressed ? 1f : 0.75f);
            setText(ScreenCore.MSG_TIME, false, sub);
            cv.drawText(" · ", it.btnLX, base(it.metaY, th, 0), tp);
            cv.drawText(it.go, it.zoneX, base(it.metaY, th, 0), tp);
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(0.8f); p.setColor(sub);
            cv.drawLine(it.zoneX, it.metaY + th - 1f, it.zoneX + it.zoneW, it.metaY + th - 1f, p);
            p.setStyle(Paint.Style.FILL);
        }
    }
    private void drawTab(Canvas cv, ScreenCore.Item it) {
        rf.set(it.x, it.y, it.x + it.w, it.y + it.h);
        p.setStyle(Paint.Style.FILL); p.setColor(cc(it.fill, pal[R_NAV])); cv.drawRect(rf, p);
        if (it == pressed) { p.setColor(0x14808080); cv.drawRect(rf, p); }
        p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(pal[R_BORDER]);
        cv.drawLine(it.x, it.y + 0.5f, it.x + it.w, it.y + 0.5f, p);
        p.setStyle(Paint.Style.FILL);
        int col = it.on ? cc(it.ac, pal[R_GOLD]) : cc(it.sc, pal[R_SUB]);
        float cx = it.x + it.w / 2f, lh = ScreenCore.TAB_LABEL * 1.4f, top = it.y + (it.h - (ScreenCore.TAB_ICON + 4f + lh)) / 2f;
        android.graphics.Path ph = it.pathOps.length > 0 ? pathFor(it) : null;
        if (ph != null) {
            float sc = ScreenCore.TAB_ICON / 24f;
            cv.save(); cv.translate(cx - ScreenCore.TAB_ICON / 2f, top); cv.scale(sc, sc);
            p.setColor(col); cv.drawPath(ph, p);
            cv.restore();
        }
        setText(ScreenCore.TAB_LABEL, it.on, col); tp.setTextAlign(Paint.Align.CENTER);
        cv.drawText(it.label, cx, base(top + ScreenCore.TAB_ICON + 4f, lh, 0), tp);
        if (it.badge.length() > 0) {
            float bx = cx + ScreenCore.TAB_ICON / 2f, by = top + 2f;
            p.setColor(0xFFFF3B30); cv.drawCircle(bx, by, 7f, p);
            setText(9f, true, pal[R_WHITE]); cv.drawText(it.badge, bx, base(by - 7f, 14f, 0), tp);
        }
        tp.setTextAlign(Paint.Align.LEFT);
    }

    // ───────────── 검색 입력칸(진짜 EditText) ─────────────
    /** 아이콘 경로(M/L/C/Z 풀어 둔 배열)를 안드로이드 Path 로. 처음 한 번만 만들고 화면이 바뀔 때까지 쓴다. */
    private android.graphics.Path pathFor(ScreenCore.Item it) { return pathOf(it.pathOps); }
    private android.graphics.Path pathOf(float[] ops) {
        android.graphics.Path ph = iconPaths.get(ops);
        if (ph != null) return ph;
        ph = new android.graphics.Path();
        float[] o = ops; int i = 0;
        while (i < o.length) {
            int op = (int) o[i++];
            if (op == ScreenCore.OP_M) { ph.moveTo(o[i], o[i + 1]); i += 2; }
            else if (op == ScreenCore.OP_L) { ph.lineTo(o[i], o[i + 1]); i += 2; }
            else if (op == ScreenCore.OP_C) { ph.cubicTo(o[i], o[i + 1], o[i + 2], o[i + 3], o[i + 4], o[i + 5]); i += 6; }
            else if (op == ScreenCore.OP_Z) ph.close();
            else break;
        }
        iconPaths.put(ops, ph);
        return ph;
    }
    private ScreenCore.Item searchItem() {
        if (lay == null) return null;
        for (ScreenCore.Item it : lay.head) if (it.kind == ScreenCore.K_SEARCH) return it;
        return null;
    }
    private void ensureInput() {
        if (input != null) return;
        EditText e = new EditText(getContext());
        e.setBackground(null);
        e.setPadding(0, 0, 0, 0);
        e.setSingleLine(true);
        e.setIncludeFontPadding(false);
        e.setGravity(Gravity.CENTER_VERTICAL);
        e.setInputType(InputType.TYPE_CLASS_TEXT);
        e.setImeOptions(EditorInfo.IME_ACTION_SEARCH);
        e.setTypeface(face(false)); e.setTextSize(TypedValue.COMPLEX_UNIT_DIP, 13f);
        e.setOnEditorActionListener(new TextView.OnEditorActionListener() {
            @Override public boolean onEditorAction(TextView v, int actionId, KeyEvent ev) {
                boolean enter = ev != null && ev.getKeyCode() == KeyEvent.KEYCODE_ENTER && ev.getAction() == KeyEvent.ACTION_DOWN;
                if (actionId == EditorInfo.IME_ACTION_SEARCH || actionId == EditorInfo.IME_ACTION_DONE || enter) { submitSearch(); return true; }
                return false;
            }
        });
        e.setOnFocusChangeListener(new View.OnFocusChangeListener() {
            @Override public void onFocusChange(View v, boolean has) { if (listener != null) listener.onInputFocus(has); }
        });
        input = e;
        styleInput();
    }
    private void styleInput() {
        if (input == null) return;
        input.setTextColor(pal[R_TEXT]);
        input.setHintTextColor(alpha(pal[R_SUB], 0.8f));
    }
    private void submitSearch() {
        if (listener == null || inAct == null) return;
        String q = input == null ? "" : String.valueOf(input.getText()).trim();
        blurInput();
        listener.onSearch(inAct, q);
    }
    private void tapSearch(ScreenCore.Item it, float xdp, float ydp) {
        boolean onBtn = xdp >= it.btx - 4f && xdp < it.btx + ScreenCore.SEARCH_BTN + 4f && ydp >= it.bty - 4f && ydp < it.bty + ScreenCore.SEARCH_BTN + 4f;
        if (onBtn) { inAct = it.act; submitSearch(); return; }
        ensureInput(); syncInput();
        if (input != null && input.getVisibility() == View.VISIBLE) {                // 알약의 다른 곳을 눌러도 입력칸에 커서를 준다
            input.requestFocus();
            try { ((InputMethodManager) getContext().getSystemService(Context.INPUT_METHOD_SERVICE)).showSoftInput(input, 0); } catch (Throwable ignored) { }
        }
    }
    private void blurInput() {
        endEdit();
        if (input == null || !input.hasFocus()) return;
        try { ((InputMethodManager) getContext().getSystemService(Context.INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(input.getWindowToken(), 0); } catch (Throwable ignored) { }
        input.clearFocus();
    }
    /** 검색 입력칸만 내린다. 글자 입력칸(field)의 편집은 건드리지 않는다 — 배치가 바뀔 때마다(키보드가 올라와 크기가 줄 때 포함) 불리므로, 여기서 편집을 끝내면 키보드가 올라오다 사라진다. */
    private void hideInput() {
        if (input == null) return;
        if (input.hasFocus()) {
            try { ((InputMethodManager) getContext().getSystemService(Context.INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(input.getWindowToken(), 0); } catch (Throwable ignored) { }
            input.clearFocus();
        }
        if (input.getVisibility() != View.GONE) input.setVisibility(View.GONE);
        inShown = false;
    }
    /** 입력칸을 검색줄 자리에 맞춘다. 검색줄이 없거나 뷰가 안 보이거나 잘려(clip) 있으면 숨긴다. 자리가 같으면 아무것도 안 한다. */
    private void syncInput() {
        ScreenCore.Item si = searchItem();
        ViewGroup par = getParent() instanceof ViewGroup ? (ViewGroup) getParent() : null;
        if (si == null || par == null || getVisibility() != View.VISIBLE || getWidth() <= 0) { hideInput(); return; }
        ensureInput();
        inAct = si.act;
        if (input.getParent() != par) {
            if (input.getParent() instanceof ViewGroup) ((ViewGroup) input.getParent()).removeView(input);
            par.addView(input, new FrameLayout.LayoutParams(1, 1));
            inFront = true;
        }
        int w = Math.max(1, Math.round(si.iw * dpr)), h = Math.max(1, Math.round(si.ih * dpr));
        int l = getLeft() + Math.round(si.ix * dpr), t = getTop() + Math.round(si.iy * dpr);
        Rect cb = null;
        try { cb = getClipBounds(); } catch (Throwable ignored) { }
        if (cb != null) {                                                                    // 잘려 보이면(팝업·탭 이동 중) 입력칸은 내린다
            int rl = Math.round(si.ix * dpr), rt = Math.round(si.iy * dpr);
            if (rl < cb.left || rt < cb.top || rl + w > cb.right || rt + h > cb.bottom) { hideInput(); return; }
        }
        String hint = si.label == null ? "" : si.label;
        if (!hint.contentEquals(input.getHint() == null ? "" : input.getHint())) input.setHint(hint);
        if (si.maxlen != maxLen) { maxLen = si.maxlen; input.setFilters(new InputFilter[] { new InputFilter.LengthFilter(maxLen) }); }
        if (l != inL || t != inT || w != inW || h != inH || input.getParent() != par) {
            inL = l; inT = t; inW = w; inH = h;
            FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(w, h);
            lp.leftMargin = l; lp.topMargin = t;
            input.setLayoutParams(lp);
        }
        if (input.getVisibility() != View.VISIBLE) input.setVisibility(View.VISIBLE);
        if (!inShown || !inFront) { inShown = true; inFront = true; input.bringToFront(); }
    }
    private int maxLen = -1;
    private boolean syncQ;
    private final Runnable syncRun = new Runnable() { @Override public void run() { syncQ = false; syncInput(); syncEditor(); } };
    /** 배치 도중에 자식 뷰를 건드리지 않도록 한 박자 뒤로 미룬다(여러 번 불려도 한 번). */
    private void syncLater() { if (!syncQ) { syncQ = true; post(syncRun); } }
    @Override protected void onLayout(boolean changed, int l, int t, int r, int b) { super.onLayout(changed, l, t, r, b); syncLater(); }
    @Override protected void onVisibilityChanged(View changedView, int vis) {
        super.onVisibilityChanged(changedView, vis);
        if (changedView != this) return;
        if (vis != View.VISIBLE) { endEdit(); hideInput(); } else { inShown = false; syncLater(); }
    }
    @Override protected void onDetachedFromWindow() {
        super.onDetachedFromWindow();
        if (tiles != null) { tiles.unwatch(tileTick); tiles = null; tmValue = ""; }
        if (scene != null) { scene.destroy(); scene = null; sceneJson = ""; sceneFailed = false; }      // 스프라이트 비트맵을 돌려준다(다시 붙으면 새로 읽는다)
        endEdit();
        if (editor != null && editor.getParent() instanceof ViewGroup) ((ViewGroup) editor.getParent()).removeView(editor);
        if (input != null) { blurInput(); if (input.getParent() instanceof ViewGroup) ((ViewGroup) input.getParent()).removeView(input); inShown = false; inL = inT = inW = inH = -1; }
    }
    // ───────────── 글자 입력칸(field) 편집 ─────────────
    private boolean editInFoot, editSilent, editEnding;
    private long editBeganAt;
    private String watchKey;
    private ScreenCore.Item fieldByKey(String k) {
        if (lay == null || k == null) return null;
        for (ScreenCore.Item it : lay.body) if ((it.kind == ScreenCore.K_FIELD || it.kind == ScreenCore.K_INBAR) && k.equals(it.key)) { editInFoot = false; return it; }
        for (ScreenCore.Item it : lay.foot) if ((it.kind == ScreenCore.K_FIELD || it.kind == ScreenCore.K_INBAR) && k.equals(it.key)) { editInFoot = true; return it; }
        return null;
    }
    private void ensureEditor() {
        if (editor != null) return;
        EditText e = new EditText(getContext());
        e.addTextChangedListener(new android.text.TextWatcher() {
            @Override public void beforeTextChanged(CharSequence c, int a, int b, int d) { }
            @Override public void onTextChanged(CharSequence c, int a, int b, int d) { }
            @Override public void afterTextChanged(android.text.Editable ed) {
                if (editSilent || editKey == null) return;
                String v = String.valueOf(ed);
                fieldVals.put(editKey, v);
                ScreenCore.Item cur = fieldByKey(editKey);
                if (cur != null && cur.watch && listener != null) listener.onText(editKey, v, "edit");
            }
        });
        e.setBackground(null);
        e.setPadding(0, 0, 0, 0);
        e.setSingleLine(true);
        e.setIncludeFontPadding(false);
        e.setGravity(Gravity.CENTER_VERTICAL);
        e.setInputType(InputType.TYPE_CLASS_TEXT);
        e.setImeOptions(EditorInfo.IME_ACTION_DONE);
        e.setOnEditorActionListener(new TextView.OnEditorActionListener() {
            @Override public boolean onEditorAction(TextView v, int actionId, KeyEvent ev) {
                ScreenCore.Item cur = fieldByKey(editKey);
                if (cur != null && cur.kind == ScreenCore.K_INBAR) { fireInbar(cur, editInFoot, cur.act2 != null ? cur.act2 : cur.act); return true; }          // 키보드의 보내기 = 입력줄 단추
                blurInput(); return true;
            }
        });
        e.setOnFocusChangeListener(new View.OnFocusChangeListener() {
            @Override public void onFocusChange(View v, boolean has) {
                if (!has) {
                    // 편집을 막 시작한 직후(배치·크기가 바뀌는 사이)에 포커스가 잠깐 빠지면 키보드가 안 열린 채 끝나 버린다 — 직접 끝낸 게 아니면 되찾는다
                    if (!editEnding && editKey != null && SystemClock.uptimeMillis() - editBeganAt < 500L) { kbSoon(); return; }
                    commitEdit();
                }
                if (listener != null) listener.onInputFocus(has);
            }
        });
        editor = e;
    }
    private void beginEdit(ScreenCore.Item it) {
        ensureEditor();
        blurInput();
        ViewGroup par = getParent() instanceof ViewGroup ? (ViewGroup) getParent() : null;
        if (par == null) return;
        if (editor.getParent() != par) {
            if (editor.getParent() instanceof ViewGroup) ((ViewGroup) editor.getParent()).removeView(editor);
            par.addView(editor, new FrameLayout.LayoutParams(1, 1));
        }
        editKey = it.key;
        fieldByKey(it.key);                                                                                        // editInFoot 갱신
        String v = fieldVals.get(it.key);
        editSilent = true; editor.setText(v == null ? "" : v); editSilent = false;
        editor.setTextColor(cc(it.tc, pal[R_TEXT]));
        editor.setHintTextColor(alpha(cc(it.sc, pal[R_SUB]), 0.8f));
        editor.setHint(it.label);
        editor.setImeOptions(it.kind == ScreenCore.K_INBAR ? (it.watch ? EditorInfo.IME_ACTION_SEARCH : EditorInfo.IME_ACTION_SEND) : EditorInfo.IME_ACTION_DONE);
        boolean multi = it.kind == ScreenCore.K_FIELD && it.multi;                                                   // 여러 줄 입력칸: 줄바꿈 키를 받고 위쪽부터 쓴다
        editor.setInputType(multi ? (InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE) : InputType.TYPE_CLASS_TEXT);
        editor.setSingleLine(!multi);
        editor.setMaxLines(multi ? 12 : 1);
        editor.setGravity(multi ? (Gravity.TOP | Gravity.START) : Gravity.CENTER_VERTICAL);
        editor.setPadding(0, multi ? Math.round(10f * dpr) : 0, 0, 0);
        if (multi) editor.setImeOptions(EditorInfo.IME_FLAG_NO_ENTER_ACTION);
        editor.setTypeface(face(it.bold)); editor.setTextSize(TypedValue.COMPLEX_UNIT_DIP, it.size);
        editor.setFilters(new InputFilter[] { new InputFilter.LengthFilter(Math.max(1, it.maxlen)) });
        eL = eT = eW = eH = -1;
        ensureEditVisible(it);
        editor.setVisibility(View.VISIBLE);
        syncEditor();
        editor.bringToFront();
        editBeganAt = SystemClock.uptimeMillis();
        editor.requestFocus();
        editor.setSelection(editor.getText().length());
        try { ((InputMethodManager) getContext().getSystemService(Context.INPUT_METHOD_SERVICE)).showSoftInput(editor, 0); } catch (Throwable ignored) { }
        kbSoon();
        if (it.watch && listener != null) { watchKey = it.key; listener.onText(it.key, String.valueOf(editor.getText()), "focus"); }
        invalidate();
    }
    /** 키보드 올리기를 배치가 끝난 뒤에도 두 번 더 시도한다(막 얹은 입력칸에는 첫 시도가 무시되는 기기가 있다). 이미 올라와 있으면 아무 일도 없다. */
    private void kbSoon() {
        Runnable r = new Runnable() {
            @Override public void run() {
                if (editor == null || editKey == null) return;
                try {
                    if (!editor.hasFocus()) editor.requestFocus();
                    ((InputMethodManager) getContext().getSystemService(Context.INPUT_METHOD_SERVICE)).showSoftInput(editor, 0);
                } catch (Throwable ignored) { }
            }
        };
        post(r); postDelayed(r, 120L); postDelayed(r, 350L);
    }
    /** 편집 중인 칸이 본문 보이는 영역 안에 오도록 스크롤한다(키보드가 올라와 영역이 줄어든 뒤에도). */
    private void ensureEditVisible(ScreenCore.Item f) {
        if (lay == null || f == null || editInFoot) return;
        float vh = bodyViewH();
        if (vh <= f.h + 16f) return;
        if (f.y + f.h + 8f > scrollY + vh) scrollY = f.y + f.h + 8f - vh;
        if (f.y - 8f < scrollY) scrollY = f.y - 8f;
        scrollY = ScreenCore.clamp(scrollY, lay.bodyMaxScroll(vh));
        flingY.forceFinished(true);
    }
    private void syncEditor() {
        if (editKey == null || editor == null) return;
        ScreenCore.Item f = fieldByKey(editKey);
        ViewGroup par = getParent() instanceof ViewGroup ? (ViewGroup) getParent() : null;
        if (f == null || par == null || getVisibility() != View.VISIBLE) { endEdit(); return; }
        float topDp = editInFoot ? footTop() + f.y : lay.headH + f.y - scrollY;
        if (!editInFoot && (topDp < lay.headH - 1f || topDp + f.h > footTop() + 1f)) { if (SystemClock.uptimeMillis() - editBeganAt < 600L) return; endEdit(); return; }      // 막 시작한 때엔 크기가 따라오는 중이라 닫지 않는다     // 화면 밖으로 밀렸다(아래 고정 줄에 가려져도)
        boolean ib = f.kind == ScreenCore.K_INBAR;
        float exDp = ib ? (f.dotC != null ? f.textX : f.ix + 14f) : f.x + 13f, ewDp = ib ? (f.dotC != null ? f.ix + f.iw - 8f - f.textX : f.iw - 28f) : f.w - 26f;
        int l = getLeft() + Math.round(exDp * dpr), t = getTop() + Math.round(topDp * dpr);
        int w = Math.max(1, Math.round(ewDp * dpr)), h = Math.max(1, Math.round((ib ? f.ih : f.h) * dpr));
        if (l != eL || t != eT || w != eW || h != eH) {
            eL = l; eT = t; eW = w; eH = h;
            FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(w, h);
            lp.leftMargin = l; lp.topMargin = t;
            editor.setLayoutParams(lp);
        }
    }
    private void commitEdit() {
        String ek = editKey;
        if (editKey != null && editor != null) fieldVals.put(editKey, String.valueOf(editor.getText()));
        editKey = null;
        if (ek != null && ek.equals(watchKey)) { watchKey = null; if (listener != null) listener.onText(ek, fieldVals.get(ek) == null ? "" : fieldVals.get(ek), "blur"); }
        if (editor != null && editor.getVisibility() != View.GONE) editor.setVisibility(View.GONE);
        invalidate();
    }
    /** 편집을 끝내고(글자는 보관) 키보드를 내린다. */
    private void endEdit() {
        if (editor == null || editKey == null) return;
        try { ((InputMethodManager) getContext().getSystemService(Context.INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(editor.getWindowToken(), 0); } catch (Throwable ignored) { }
        editEnding = true;
        try { editor.clearFocus(); } finally { editEnding = false; }
        commitEdit();
    }

    /** 클리핑이 바뀌어도 입력칸이 어긋나지 않게 플러그인이 setClipBounds 뒤에 부른다. */
    public void resyncInput() { syncLater(); }

    /** 그림을 받아 두는 곳 — 메모리(LruCache) → 파일 → 네트워크. 받는 일은 백그라운드, 끝나면 화면 박자에 맞춰 다시 그린다. */
    static final class ImageBank {
        private static LruCache<String, Bitmap> mem;
        private static File dir;
        private static ExecutorService pool;
        private static final Set<String> loading = new HashSet<String>();
        private static final Map<String, Long> failed = new HashMap<String, Long>();
        private static final Handler main = new Handler(Looper.getMainLooper());

        private static ExecutorService warmPool;
        private static final Set<String> warming = new HashSet<String>();
        /** 미리 받기: 그림 파일만 뒤에서 받아 파일 캐시에 둔다(동시 6개 · 낮은 우선순위 — 쇼핑 모든 분류의 상품 그림이 곰돌이 자리표시자로 오래 남지 않게). 이미 있거나 받는 중이거나 최근에 실패한 것은 건너뛴다. 화면에 그릴 때는 파일에서 곧바로 읽는다. */
        static void warm(Context c, java.util.List<String> urls) {
            if (urls == null || urls.isEmpty()) return;
            init(c);
            synchronized (ImageBank.class) {
                if (warmPool == null) {
                    warmPool = Executors.newFixedThreadPool(6, new java.util.concurrent.ThreadFactory() {
                        @Override public Thread newThread(Runnable r) { Thread t = new Thread(r, "scr-img-warm"); t.setDaemon(true); t.setPriority(Thread.MIN_PRIORITY + 1); return t; }
                    });
                }
            }
            for (final String url : urls) {
                synchronized (ImageBank.class) {
                    if (warming.contains(url) || loading.contains(url)) continue;
                    Long f = failed.get(url);
                    if (f != null && SystemClock.uptimeMillis() - f < 60000L) continue;
                    if (mem.get(url) != null) continue;
                    File ff = new File(dir, key(url));
                    if (ff.exists() && ff.length() > 0) continue;
                    warming.add(url);
                }
                warmPool.execute(new Runnable() {
                    @Override public void run() {
                        boolean ok = false;
                        try { ok = fetch(url) != null; } catch (Throwable ignored) { ok = false; }
                        synchronized (ImageBank.class) { warming.remove(url); if (!ok) failed.put(url, SystemClock.uptimeMillis()); }
                    }
                });
            }
        }

        static synchronized void init(Context c) {
            if (mem != null) return;
            int kb = (int) (Runtime.getRuntime().maxMemory() / 1024L / 12L);
            mem = new LruCache<String, Bitmap>(Math.max(4096, kb)) {
                @Override protected int sizeOf(String k, Bitmap b) { return b.getByteCount() / 1024; }
            };
            dir = new File(c.getCacheDir(), "scr_img"); dir.mkdirs();
            pool = Executors.newFixedThreadPool(3);
        }

        /** (뒤 스레드가 직접 부른다) 파일 캐시에 이미 있는 그림을 메모리로 미리 풀어 둔다 — 내려받지는 않는다(받기는 warm). 이미 메모리에 있거나 풀고 있으면 건너뛴다. */
        static void preDecode(String url, int w, int h) {
            if (mem == null || url == null || url.length() == 0) return;
            if (mem.get(url) != null) return;
            synchronized (ImageBank.class) {
                if (loading.contains(url)) return;
                Long f = failed.get(url);
                if (f != null && SystemClock.uptimeMillis() - f < 60000L) return;
                File ff = new File(dir, key(url));
                if (!ff.exists() || ff.length() == 0) return;
                loading.add(url);
            }
            Bitmap bm = null;
            try { bm = load(url, Math.max(32, w), Math.max(32, h)); } catch (Throwable t) { bm = null; }
            synchronized (ImageBank.class) {
                loading.remove(url);
                if (bm == null) failed.put(url, SystemClock.uptimeMillis()); else mem.put(url, bm);
            }
        }
        /** 있으면 바로 돌려주고, 없으면 받으러 가고 null. */
        static Bitmap get(final String url, final int w, final int h, final View v) {
            Bitmap b = mem.get(url);
            if (b != null) return b;
            synchronized (ImageBank.class) {
                if (loading.contains(url)) return null;
                Long f = failed.get(url);
                if (f != null && SystemClock.uptimeMillis() - f < 60000L) return null;
                loading.add(url);
            }
            pool.execute(new Runnable() {
                @Override public void run() {
                    Bitmap bm = null;
                    try { bm = load(url, Math.max(32, w), Math.max(32, h)); } catch (Throwable t) { bm = null; }
                    final Bitmap res = bm;
                    synchronized (ImageBank.class) {
                        loading.remove(url);
                        if (res == null) failed.put(url, SystemClock.uptimeMillis()); else mem.put(url, res);
                    }
                    if (res != null) main.post(new Runnable() { @Override public void run() { v.postInvalidateOnAnimation(); } });
                }
            });
            return null;
        }

        private static String key(String url) { return Integer.toHexString(url.hashCode()) + "_" + url.length(); }

        /** 그림 파일이 파일 캐시에 없으면 받아 둔다(내려받기만 · 풀어 읽지 않는다). 받지 못하면 null. */
        private static File fetch(String url) throws Exception {
            File f = new File(dir, key(url));
            if (!f.exists() || f.length() == 0) {
                HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                c.setConnectTimeout(4000); c.setReadTimeout(7000);
                c.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android) GildongmuScreen");
                if (c.getResponseCode() != 200) { c.disconnect(); return null; }
                InputStream in = c.getInputStream();
                File tmp = new File(dir, key(url) + ".tmp");
                FileOutputStream out = new FileOutputStream(tmp);
                byte[] buf = new byte[16384]; int n; long tot = 0;
                while ((n = in.read(buf)) > 0) { out.write(buf, 0, n); tot += n; if (tot > 4_000_000L) { out.close(); tmp.delete(); c.disconnect(); return null; } }
                out.close(); in.close(); c.disconnect();
                if (!tmp.renameTo(f)) { tmp.delete(); return null; }
                trim();
            }
            return f;
        }

        private static Bitmap load(String url, int w, int h) throws Exception {
            File f = fetch(url);
            if (f == null) return null;
            BitmapFactory.Options o = new BitmapFactory.Options();
            o.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(f.getPath(), o);
            if (o.outWidth <= 0 || o.outHeight <= 0) { f.delete(); return null; }
            int ss = 1;
            while (o.outWidth / (ss * 2) >= w && o.outHeight / (ss * 2) >= h) ss *= 2;
            o.inJustDecodeBounds = false; o.inSampleSize = ss;
            return BitmapFactory.decodeFile(f.getPath(), o);
        }

        /** 파일 캐시가 40MB 를 넘으면 오래된 것부터 지운다. */
        private static int trimN = 0;
        private static void trim() {
            try {
                if ((++trimN & 15) != 0) return;                                  // s277: 받을 때마다 파일 천 개를 훑고 크기를 재던 것 — 열여섯 장에 한 번만
                File[] fs = dir.listFiles(); if (fs == null) return;
                long tot = 0; for (File x : fs) tot += x.length();
                if (tot < 40L * 1024 * 1024) return;
                java.util.Arrays.sort(fs, new java.util.Comparator<File>() { @Override public int compare(File a, File b) { return Long.compare(a.lastModified(), b.lastModified()); } });
                for (File x : fs) { if (tot < 30L * 1024 * 1024) break; tot -= x.length(); x.delete(); }
            } catch (Throwable ignored) { }
        }
    }
}

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
    private String ctrDone = null;                      // 24시간 차트: 지금 시각 막대를 가운데로 맞춘 막대 내용 표시(내용이 바뀔 때만 다시 맞춘다)
    private final OverScroller flingY, flingX;
    private VelocityTracker vt;
    private final int slop, minFling, maxFling;
    private float downX, downY, lastX, lastY, downBodyY;
    private long downT;
    private int mode = 0;                                  // 0 없음 · 1 본문 세로 · 2 머리 가로 · 3 눌러보는 중
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
    private final ScreenCore.Measurer measurer = new ScreenCore.Measurer() {
        @Override public float width(String s, float size, boolean bold) {
            tp.setTypeface(face(bold));
            tp.setTextSize(size * dpr);
            return tp.measureText(s) / dpr;
        }
    };

    public ScreenView(Context c) {
        super(c);
        setWillNotDraw(false);
        ViewConfiguration vc = ViewConfiguration.get(c);
        slop = vc.getScaledTouchSlop(); minFling = vc.getScaledMinimumFlingVelocity(); maxFling = vc.getScaledMaximumFlingVelocity();
        flingY = new OverScroller(c); flingX = new OverScroller(c);
        ImageBank.init(c);
        preloadFaces(c);
    }

    public void setListener(Listener l) { listener = l; }
    /** 입력칸 글자 모음(키 → 글자). 앱이 call 행동을 처리할 때 함께 받는다. */
    public Map<String, String> fields() { return new HashMap<String, String>(fieldVals); }
    public long drawAgeMs() { return lastDraw == 0L ? Long.MAX_VALUE : SystemClock.uptimeMillis() - lastDraw; }
    public int itemCount() { return lay == null ? 0 : lay.head.length + lay.body.length; }
    public float scrollPos() { return scrollY; }
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
        screen = s;
        iconPaths.clear();
        if (!keepScroll) { scrollY = 0f; scrollX = 0f; openKey = null; ctrDone = null; }
        flingY.forceFinished(true); flingX.forceFinished(true);
        pressed = null; mode = 0;
        relayout();
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
    public void clearScreen() { screen = null; lay = null; scrollY = 0f; scrollX = 0f; openKey = null; ctrDone = null; pressed = null; mode = 0; mkHas = false; invalidate(); syncLater(); }
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
        fabShader = new android.graphics.LinearGradient(fx, fy, fx + lay.fabW, fy + ScreenCore.FAB_H, pal[R_GOLD2], pal[R_GOLD], android.graphics.Shader.TileMode.CLAMP);
    }
    private boolean fabAt(float px, float py) {
        if (lay == null || lay.fabW <= 0f) return false;
        float x = px / dpr, y = py / dpr, w = getWidth() / dpr, h = getHeight() / dpr, fx = (w - lay.fabW) / 2f, fy = h - lay.footH - ScreenCore.FAB_B - ScreenCore.FAB_H;
        return x >= fx - 4f && x < fx + lay.fabW + 4f && y >= fy - 4f && y < fy + ScreenCore.FAB_H + 4f;
    }
    private void drawFab(Canvas cv, float w, float h) {
        if (lay == null || lay.fabW <= 0f || fabShader == null) return;
        float fw = lay.fabW, fh = ScreenCore.FAB_H, fx = (w - fw) / 2f, fy = h - lay.footH - ScreenCore.FAB_B - fh, rad = 30f;
        p.setStyle(Paint.Style.FILL); p.setShader(null);
        for (int i = 5; i >= 1; i--) { p.setColor(0x0AD4AF37); float e = i * 1.4f; rf.set(fx - e, fy + 4f - e, fx + fw + e, fy + fh + 4f + e); cv.drawRoundRect(rf, rad + e, rad + e, p); }       // 웹 box-shadow 0 4px 14px rgba(212,175,55,.4) 흉내
        rf.set(fx, fy, fx + fw, fy + fh);
        p.setShader(fabShader); cv.drawRoundRect(rf, fh / 2f, fh / 2f, p); p.setShader(null);
        if (fabDown) { p.setColor(0x22000000); cv.drawRoundRect(rf, fh / 2f, fh / 2f, p); }
        float tx = fx + ScreenCore.FAB_PX;
        if (lay.fabIcon.length > 0) {
            android.graphics.Path ph = pathOf(lay.fabIcon);
            cv.save(); cv.translate(tx, fy + (fh - ScreenCore.FAB_ICON) / 2f); cv.scale(ScreenCore.FAB_ICON / 24f, ScreenCore.FAB_ICON / 24f);
            p.setColor(0xFF121214); cv.drawPath(ph, p); cv.restore();
            tx += ScreenCore.FAB_ICON + ScreenCore.FAB_GAP;
        }
        setText(ScreenCore.FAB_TXT, true, pal[R_ONGOLD]);
        cv.drawText(lay.fabLabel, tx, base(fy, fh, 0), tp);
    }
    private void relayout() {
        if (screen == null || getWidth() <= 0) { lay = null; invalidate(); syncLater(); return; }
        lay = ScreenCore.layout(screen, getWidth() / dpr, measurer, openKey, getHeight() / dpr);
        if (lay.ctrSig.length() == 0) ctrDone = null;
        else if (!lay.ctrSig.equals(ctrDone)) { ctrDone = lay.ctrSig; scrollX = lay.initScrollX; }      // 24시간 차트 내용이 새로 오면 지금 시각 막대를 가운데로
        clampScroll();
        markBcards();
        buildFab();
        syncFieldBases(lay.body); syncFieldBases(lay.foot);
        float ch = lay.headH + lay.bodyH + lay.footH;
        if (Math.abs(ch - lastCH) > 0.5f) { lastCH = ch; final float chf = ch; post(new Runnable() { @Override public void run() { if (listener != null) listener.onContentH(chf); } }); }
        if (editKey != null) { ScreenCore.Item f = fieldByKey(editKey); if (f != null) ensureEditVisible(f); }
        if (lay != null && lay.mk != null && !mkHas) syncMk(false);      // 폭이 정해지기 전에 올라온 화면의 마커도 첫 배치 때 놓는다
        invalidate();
        syncLater();
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
    }

    // ───────────── 손가락 ─────────────
    @Override public boolean onTouchEvent(MotionEvent e) {
        if (lay == null) return true;
        if (vt == null) vt = VelocityTracker.obtain();
        vt.addMovement(e);
        float x = e.getX(), y = e.getY();
        if (mode == 5 && e.getActionMasked() != MotionEvent.ACTION_DOWN) return tmTouch(e);          // 끌 수 있는 지도 위 손가락
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN: {
                if (getParent() != null) getParent().requestDisallowInterceptTouchEvent(true);
                flingY.forceFinished(true); flingX.forceFinished(true); ssOn = false;
                if (liveMapAt(x, y) != null && tmView != null) { mode = 5; pressed = null; tmDX = tmLX = x; tmDY = tmLY = y; tmDT = SystemClock.uptimeMillis(); tmMoved = false; tmScaling = false; tmSg.onTouchEvent(e); return true; }
                downX = lastX = x; downY = lastY = y; downT = SystemClock.uptimeMillis();
                inHead = y < lay.headH * dpr;
                inChips = inHead && lay.chipsTop >= 0f && y >= lay.chipsTop * dpr && y < lay.chipsBot * dpr;
                inFoot = lay.footH > 0f && !inHead && y >= footTop() * dpr;
                mode = 3;
                fabDown = fabAt(x, y);
                pressed = fabDown ? null : findItem(x, y);
                if (pressed != null && pressed.act == null && pressed.kind != ScreenCore.K_FIELD) pressed = null;
                pressInFoot = inFoot;
                sceneTouch = false;
                { ScreenCore.Item si = sceneAt(x, y); if (si != null && scene.touchDown(sceneX(x, si), sceneY(y, si))) { sceneTouch = true; pressed = null; } }
                invalidate();
                return true;
            }
            case MotionEvent.ACTION_MOVE: {
                float dx = x - lastX, dy = y - lastY;
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
                        pressed = null; fabDown = false;
                        mode = inHead ? (inChips ? 2 : 0) : (inFoot ? 0 : 1);   // 머리는 칩 줄만 가로로 민다(안내 상자·검색줄은 고정) · 아래 고정 줄은 안 밀린다
                        if (inHead && Math.abs(y - downY) > Math.abs(x - downX) * 2f) mode = 0;     // 머리를 위아래로 쓸면 무시
                        if (mode == 1) blurInput();                                              // 목록을 밀기 시작하면 키보드를 내린다
                    } else return true;
                }
                if (mode == 1) { scrollY = ScreenCore.clamp(scrollY - dy / dpr, lay.bodyMaxScroll(bodyViewH())); lastY = y; invalidate(); }
                else if (mode == 2) { scrollX = ScreenCore.clamp(scrollX - dx / dpr, lay.headMaxScroll()); lastX = x; invalidate(); }
                return true;
            }
            case MotionEvent.ACTION_UP: {
                if (sceneTouch && scene != null) { scene.touchUp(); sceneTouch = false; }
                if (mode == 4) { finishTouch(); invalidate(); return true; }
                if (mode == 3 && fabDown) { fabDown = false; if (SystemClock.uptimeMillis() - downT < 600 && listener != null && lay != null && lay.fabAct != null) { blurInput(); listener.onAction(lay.fabAct); } finishTouch(); invalidate(); return true; }
                if (mode == 3) {
                    if (SystemClock.uptimeMillis() - downT < 600 && pressed != null && listener != null) {
                        ScreenCore.Item pi = pressed; ScreenCore.Act a = pi.act; pressed = null; invalidate();
                        if (pi.kind == ScreenCore.K_SEARCH) tapSearch(pi, x / dpr, y / dpr);
                        else if (pi.kind == ScreenCore.K_FIELD) beginEdit(pi);
                        else if (pi.kind == ScreenCore.K_INBAR) tapInbar(pi, x / dpr, pressInFoot);
                        else if (pi.kind == ScreenCore.K_POSTH) toggleOpen(pi);
                        else if ((pi.kind == ScreenCore.K_SUG || pi.kind == ScreenCore.K_TROW) && pi.act2 != null && x / dpr >= pi.btx - 6f) { blurInput(); listener.onAction(pi.act2); }
                        else if (pi.kind == ScreenCore.K_RHD) { blurInput(); listener.onAction(ScreenCore.Layout.rhdAct(pi, x / dpr)); }
                        else if (pi.kind == ScreenCore.K_BCARD) tapBcard(pi, x / dpr, y / dpr - lay.headH + scrollY);
                        else if (pi.kind == ScreenCore.K_BTOG) { blurInput(); pickBtog(pi); listener.onAction(a); }
                        else if (pi.kind == ScreenCore.K_TOGGLE) { blurInput(); pi.on = !pi.on; invalidate(); listener.onSet(a, pi.on); }     // 화면은 바로 뒤집는다(엔진 새 화면을 기다리지 않는다)
                        else { blurInput(); if (pi.kind == ScreenCore.K_CHIP && a != null && "cat".equals(a.a)) pickChip(pi); listener.onAction(a); }
                    }
                } else if (mode == 1 || mode == 2) {
                    vt.computeCurrentVelocity(1000, maxFling);
                    if (mode == 1) {
                        float v = vt.getYVelocity();
                        if (Math.abs(v) > minFling) { flingY.fling(0, Math.round(scrollY * dpr), 0, Math.round(-v), 0, 0, 0, Math.round(lay.bodyMaxScroll(bodyViewH()) * dpr)); }
                    } else {
                        float v = vt.getXVelocity();
                        if (Math.abs(v) > minFling) { flingX.fling(Math.round(scrollX * dpr), 0, Math.round(-v), 0, 0, Math.round(lay.headMaxScroll() * dpr), 0, 0); }
                    }
                }
                finishTouch();
                invalidate();
                return true;
            }
            case MotionEvent.ACTION_CANCEL: if (sceneTouch && scene != null) { scene.touchUp(); sceneTouch = false; } finishTouch(); invalidate(); return true;
            default: return true;
        }
    }
    private boolean pressInFoot;
    /** 분류 칩을 누르면 새 화면이 오기 전에 먼저 그 칩을 켜 보인다(같은 줄의 다른 칩은 끈다) — 엔진 화면이 오면 그것으로 덮어쓴다. */
    private void pickChip(ScreenCore.Item pi) {
        if (lay == null) return;
        for (ScreenCore.Item it : lay.head) if (it.kind == ScreenCore.K_CHIP && it.y == pi.y) it.on = it == pi;
        for (ScreenCore.Item it : lay.body) if (it.kind == ScreenCore.K_CHIP && it.y == pi.y) it.on = it == pi;
        invalidate();
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
        focusCard(pi.key, false);
        if (pi.ti >= 0 && pi.ti < tmPins.size() && tmView != null) { tmFocus = pi.ti; tmFocApplied = pi.ti; tmLabel = false; tmGoTo(tmPins.get(pi.ti).la, tmPins.get(pi.ti).lo, tmView.zoom); }
        listener.onAction(a);
    }

    // ───────────── 캐릭터 장면(혼잡도 카드) — 엔진이 정한 값을 SceneCore 가 그린다. 여기는 크기·시계·손가락만 이어 준다 ─────────────
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
        if (!it.value.equals(sceneJson)) { sceneJson = it.value; scene.apply(sceneJson); }
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
            p.setStyle(Paint.Style.FILL); p.setColor(0x8C0C1222); cv.drawRoundRect(rf, 10f, 10f, p);
            cv.drawText(tg, it.x + 17f, base(it.y + 7f, 20f, 0), tp);
        }
        p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(pal[R_BORDER]);       // 웹 .cong-scene 의 1px 테두리
        rf2.set(it.x + 0.5f, it.y + 0.5f, it.x + it.w - 0.5f, it.y + it.h - 0.5f); cv.drawRoundRect(rf2, it.radius - 0.5f, it.radius - 0.5f, p);
        p.setStyle(Paint.Style.FILL);
    }
    // ───────────── 맨 위 흐르는 문구(문구 목록은 엔진이 정한 값 · 앱은 오른쪽에서 왼쪽으로 흘리며 색을 돌리기만) ─────────────
    private boolean skelDrawn;
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


    // ───────────── 버스: 토글 줄 · 정류장 카드(내용·모양·색은 엔진, 앱은 그리기) ─────────────
    private static final int C_BLUE = 0xFF0066FF, C_SOON = 0xFFE74C3C, C_NOARR = 0xFFA0A0A5;
    private boolean bcAnim;
    private final Set<String> seenCards = new HashSet<String>(), seenRows = new HashSet<String>();
    private String seenMode = "";
    private android.graphics.Path bellPath;
    /** 새로 올라온 정류장 카드·노선 줄에 등장 시작 시각을 붙인다(이미 본 열쇠는 조용히 — 웹: 처음 그릴 때만 펼친다). */
    private void markBcards() {
        if (lay == null) return;
        long now = SystemClock.uptimeMillis();
        boolean any = false;
        for (ScreenCore.Item it : lay.body) {
            if (it.kind != ScreenCore.K_BCARD) continue;
            if (!any) { any = true; if (!seenMode.equals(it.value)) { seenCards.clear(); seenRows.clear(); seenMode = it.value; } }
            if (seenCards.add(it.key)) it.ln = now;
            for (int i = 0; i < it.rt.length; i++) {
                String rk = it.key + "|" + it.sa[i * 6] + "|" + it.sa[i * 6 + 1];
                if (seenRows.add(rk)) it.rt[i] = now + 55L * i;
            }
        }
        if (!any) { seenCards.clear(); seenRows.clear(); seenMode = ""; }
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
        if (it.ln > 0L) {                                                    // 카드 등장: 아래에서 10dp 올라오며 나타남 .26초
            float f = (now - it.ln) / 260f;
            if (f < 1f) { a = ease(Math.max(0f, f)); dy = 10f * (1f - a); bcAnim = true; }
        }
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
                    float f = (now - it.rt[i]) / 300f;
                    if (f < 1f) { ra = f <= 0f ? 0f : ease(f); rdy = -10f * (1f - ra); bcAnim = true; }
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
                    float ay = rt0 + k * (alh + ScreenCore.BC_ARR_GAP), rx = xr;
                    if (cn.length() > 0) {
                        setText(ScreenCore.BC_CNT, true, pal[R_SUB]); tp.setTextAlign(Paint.Align.RIGHT);
                        cv.drawText(cn, rx, base(ay, alh, 0), tp); tp.setTextAlign(Paint.Align.LEFT);
                        rx -= tp.measureText(cn) + ScreenCore.BC_CNT_GAP;
                    }
                    setText(ScreenCore.BC_ARR, true, it.gb[i * 3 + k] ? C_SOON : pal[R_TEXT]); tp.setTextAlign(Paint.Align.RIGHT);
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
        }
        cv.restore();
        if (layer) cv.restore();
    }
    private final Path bcClip = new Path();
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
    private String tmValue = ""; private int tmW = -1, tmH = -1;
    private List<TileMapCore.Pin> tmPins = new ArrayList<TileMapCore.Pin>();
    private TileMapCore.View tmView;
    private int tmFocus = -1, tmFocApplied = -2;           // 고른 핀(앱이 눌림에 바로 · 엔진이 준 값이 바뀌면 그 값) · 엔진이 마지막으로 준 값
    private boolean tmLabel;                               // 고른 핀에 이름표를 단다(핀을 손으로 눌렀을 때만 — 웹 팝업)
    private boolean tmAnimOn;                              // 가운데·확대를 부드럽게 옮기는 중
    private double tmAnimLa0, tmAnimLo0, tmAnimZ0, tmAnimLa1, tmAnimLo1, tmAnimZ1;
    private long tmAnimT0;
    private float tmL, tmT, tmWd, tmHt;                    // 마지막으로 그린 지도 자리(영역 dp)
    private boolean tmLive, tmDrawn;
    private static final long TM_ANIM_MS = 260L;
    private final Paint tmp = new Paint(Paint.ANTI_ALIAS_FLAG);
    private LinearGradient tmHintGrad; private float tmHintH = -1f;
    private void drawTmap(Canvas cv, ScreenCore.Item it) {
        int pw = Math.round(it.w * dpr), ph = Math.round(it.h * dpr);
        if (pw <= 0 || ph <= 0) return;
        if (tiles == null) { tiles = TileLoader.get(getContext()); tiles.watch(tileTick); }
        if (!it.value.equals(tmValue) || pw != tmW || ph != tmH) {
            tmValue = it.value; tmW = pw; tmH = ph;
            tmPins = TileMapCore.parsePins(it.value);
            tmView = new TileMapCore.View(pw, ph);
            tmView.fit(tmPins, Math.round(34f * dpr), 3, 17);
            tmFocApplied = -2; tmAnimOn = false; tmLabel = false;
        }
        if (tmView == null || tmPins.isEmpty()) return;
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
        tmL = it.x; tmT = it.y; tmWd = it.w; tmHt = it.h; tmLive = it.on;
        cv.save();
        tmRect.set(it.x, it.y, it.x + it.w, it.y + it.h);
        tmClip.rewind(); tmClip.addRoundRect(tmRect, it.radius, it.radius, Path.Direction.CW);
        cv.clipPath(tmClip);
        cv.translate(it.x, it.y);
        cv.scale(1f / dpr, 1f / dpr);
        TileMapArt.draw(cv, tiles, tmView, tmPins, dpr, it.on ? tmFocus : -1, tmLabel, it.on ? now : 0L);
        if (it.on) {
            float hh = 26f * dpr;                                            // 아래 안내 글(웹 #mapBusMapHint): 위로 갈수록 투명한 검정 + 흰 글자
            if (it.label.length() > 0) {
                if (tmHintGrad == null || tmHintH != hh) { tmHintH = hh; tmHintGrad = new LinearGradient(0f, tmH - hh, 0f, tmH, 0x00000000, 0x73000000, Shader.TileMode.CLAMP); }
                tmp.setStyle(Paint.Style.FILL); tmp.setShader(tmHintGrad); cv.drawRect(0f, tmH - hh, tmW, tmH, tmp); tmp.setShader(null);
                tmp.setColor(0xFFFFFFFF); tmp.setTypeface(face(true)); tmp.setTextSize(11f * dpr); tmp.setTextAlign(Paint.Align.CENTER);
                cv.drawText(it.label, tmW / 2f, tmH - 8f * dpr, tmp);
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
            tmDrawn = true;
        }
        cv.restore();
        if (it.top) {                                                        // 아래 구분선(웹 border-bottom)
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(pal[R_BORDER]);
            cv.drawLine(it.x, it.y + it.h - 0.5f, it.x + it.w, it.y + it.h - 0.5f, p);
            p.setStyle(Paint.Style.FILL);
        }
    }
    /** 지도 가운데(와 확대)를 부드럽게 옮긴다. */
    private void tmGoTo(double la, double lo, double z) {
        if (tmView == null) return;
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
        if (xdp >= it.btx - 4f && xdp < it.btx + it.sw + 4f) { if (!it.on) fireInbar(it, inFootRegion, it.act); return; }      // on = 흐린 단추(dim): 눌러도 무시
        beginEdit(it);
    }
    /** 입력줄 단추(또는 키보드의 보내기): 쓰던 글을 보관하고 행동을 알린다. 아래 고정 줄이면 키보드를 그대로 두고(이어 쓰기), 본문 안이면 내린다. */
    private void fireInbar(ScreenCore.Item it, boolean inFootRegion, ScreenCore.Act act) {
        if (editKey != null && editor != null) fieldVals.put(editKey, String.valueOf(editor.getText()));
        if (!inFootRegion) blurInput();
        invalidate();
        if (listener != null && act != null) listener.onAction(act);
    }
    /** 웹이 입력칸 글자를 바꾼다(보낸 뒤 비우기 등). 편집 중이면 진짜 입력칸도 같이. */
    public void setField(String key, String value) {
        if (key == null) return;
        String v = value == null ? "" : value;
        fieldVals.put(key, v);
        if (editor != null && key.equals(editKey)) { editSilent = true; editor.setText(v); editor.setSelection(editor.getText().length()); editSilent = false; }
        invalidate();
    }
    private void finishTouch() { pressed = null; fabDown = false; mode = 0; if (vt != null) { vt.recycle(); vt = null; } }

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
        long now = SystemClock.uptimeMillis();
        lastDraw = now;
        p.setStyle(Paint.Style.FILL); p.setColor(lay == null ? pal[R_BG] : bgNow());      // 바탕: 화면이 정한 색 역할(카드 안 화면은 card · 안내창은 엔진이 준 색)
        cv.drawRect(0, 0, getWidth(), getHeight(), p);
        if (lay == null) return;
        boolean moving = false;
        sceneDrawn = false; marqDrawn = false; skelDrawn = false; bcAnim = false; tmDrawn = false;
        if (ssOn) {                                                                       // 핀을 눌러 카드로 부드럽게 가는 중
            float f = (now - ssT0) / 350f;
            if (f >= 1f) { f = 1f; ssOn = false; }
            scrollY = ScreenCore.clamp(ssFrom + (ssTo - ssFrom) * ease(f), lay.bodyMaxScroll(bodyViewH())); moving = true;
        }
        if (flingY.computeScrollOffset()) { scrollY = ScreenCore.clamp(flingY.getCurrY() / dpr, lay.bodyMaxScroll(bodyViewH())); moving = true; }
        if (flingX.computeScrollOffset()) { scrollX = ScreenCore.clamp(flingX.getCurrX() / dpr, lay.headMaxScroll()); moving = true; }

        cv.save();
        cv.scale(dpr, dpr);
        float w = getWidth() / dpr, h = getHeight() / dpr;
        // 본문(머리 아래로 잘라서)
        cv.save();
        cv.clipRect(0f, lay.headH, w, h - lay.footH);
        cv.translate(0f, lay.headH - scrollY);
        int[] r = lay.bodyRange(scrollY - 4f, scrollY + (h - lay.headH - lay.footH) + 4f);
        for (int i = r[0]; i < r[1]; i++) drawItem(cv, lay.body[i]);
        cv.restore();
        // 머리(위에 고정, 본문 위에 덮음)
        p.setStyle(Paint.Style.FILL); p.setColor(bgNow());
        cv.drawRect(0f, 0f, w, lay.headH, p);
        cv.save();
        cv.clipRect(0f, 0f, w, lay.headH);
        for (int i = 0; i < lay.head.length; i++) { ScreenCore.Item it = lay.head[i]; if (it.fixed) drawItem(cv, it); }      // 안내 상자·검색줄(고정)
        cv.translate(-scrollX, 0f);
        float x0 = scrollX - 4f, x1 = scrollX + w + 4f;
        for (int i = 0; i < lay.head.length; i++) { ScreenCore.Item it = lay.head[i]; if (!it.fixed && it.x + it.w >= x0 && it.x <= x1) drawItem(cv, it); }   // 칩 줄(가로로 밀림)
        boolean pulsing = drawMk(cv, now);                                                      // 내 위치 마커(구간 타임라인 위)
        cv.restore();
        if (lay.footH > 0f) {                                                                    // 아래 고정 줄(채팅 입력줄): 배경 + 위 선 + 조각
            cv.save();
            cv.clipRect(0f, h - lay.footH, w, h);
            cv.translate(0f, h - lay.footH);
            p.setStyle(Paint.Style.FILL); p.setColor(bgNow());
            cv.drawRect(0f, 0f, w, lay.footH, p);
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(pal[R_BORDER]);
            cv.drawLine(0f, 0.5f, w, 0.5f, p);
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
        if (marqDrawn || skelDrawn) postInvalidateOnAnimation();                                     // 흐르는 문구가 보이는 동안만 화면 박자로 계속 그린다
        if (moving || mode == 1 || mode == 2 || mode == 5 || bcAnim || tmAnimOn) postInvalidateOnAnimation();
        else if (tmDrawn) postInvalidateDelayed(50L);                                             // 내 위치 점 뒤로 퍼지는 고리(웹 1.6초 주기)
        else if (pulsing) postInvalidateDelayed(mkMs > 0f && now - mkT0 < mkMs ? 16L : 66L);      // 마커 맥박·고리(마커가 있을 때만; 가만히 있으면 초당 15번)
    }

    /** 새 화면의 마커 자리를 받는다. 이어서 오는 화면이면 지금 보이는 자리에서 새 자리까지 엔진이 정한 ms 동안 이어 가고, 처음이거나 ms 가 0 이면 곧바로 놓는다. */
    private void syncMk(boolean keep) {
        ScreenCore.Mark k = lay == null ? null : lay.mk;
        if (k == null) { mkHas = false; return; }
        long now = SystemClock.uptimeMillis();
        float to = k.x(k.r);
        if (!mkHas || !keep || k.ms <= 0f) { mkHas = true; mkFromX = mkToX = to; mkMs = 0f; mkT0 = now; }
        else if (Math.abs(to - mkToX) > 0.01f) { mkFromX = mkCurX(now); mkToX = to; mkMs = k.ms; mkT0 = now; }
    }
    private float mkCurX(long now) {
        if (mkMs <= 0f) return mkToX;
        float t = (now - mkT0) / mkMs;
        return t >= 1f ? mkToX : mkFromX + (mkToX - mkFromX) * t;
    }
    /** 내 위치 마커: 점 + 흰 테두리 + 번쩍임(승차 대기면 맥박) + 퍼지는 고리 + (대기면) 알약 배지. 모양·색·주기·글은 엔진이 정했다. */
    private boolean drawMk(Canvas cv, long now) {
        ScreenCore.Mark k = lay.mk;
        if (k == null || !mkHas) return false;
        float x = mkCurX(now), y = k.y, rad = k.d / 2f, ph;
        boolean wait = "w".equals(k.pu);
        // 퍼지는 고리(0.5배 → 2.4배, 흐려지며 사라짐)
        if (k.rcol != null && k.rms > 0f) {
            float f = (now % (long) k.rms) / k.rms, e = 1f - (1f - f) * (1f - f);
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(2f); p.setColor(alpha(cc(k.rcol, 0xFF0A84FF), 0.85f * (1f - f)));
            cv.drawCircle(x, y, (rad + 2f) * (0.5f + 1.9f * e), p);
        }
        p.setStyle(Paint.Style.FILL);
        ph = (now % (long) k.pms) / k.pms;
        float tri = ph < 0.5f ? ph * 2f : (1f - ph) * 2f;                       // 0 → 1 → 0
        float scale = 1f, op = 1f;
        if (wait) {                                                              // 맥박: 1 → 1.25배 · 투명도 1 → .75
            scale = 1f + 0.25f * tri; op = 1f - 0.25f * tri;
            if (k.hcol != null) { p.setColor(cc(k.hcol, 0)); cv.drawCircle(x, y, (rad + k.hw) * scale, p); }
        } else if (k.hcol != null) {                                             // 번쩍임: 바깥 둘레가 커지며 옅어짐
            p.setColor(alpha(cc(k.hcol, 0), 1f - tri)); cv.drawCircle(x, y, rad + k.hw * tri, p);
        }
        float rr = rad * scale;
        if (k.bw > 0f && k.bcol != null) { p.setColor(alpha(cc(k.bcol, 0xFFFFFFFF), op)); cv.drawCircle(x, y, rr, p); }
        p.setColor(alpha(cc(k.ccol, 0xFF0A84FF), op)); cv.drawCircle(x, y, Math.max(0f, rr - k.bw * scale), p);
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
        switch (it.kind) {
            case ScreenCore.K_CHIP: drawChip(cv, it); break;
            case ScreenCore.K_CARD: drawCard(cv, it); break;
            case ScreenCore.K_TEXT: drawTextBlock(cv, it); break;
            case ScreenCore.K_BUTTON: drawButton(cv, it); break;
            case ScreenCore.K_BOX: drawBox(cv, it); break;
            case ScreenCore.K_SEARCH: drawSearch(cv, it); break;
            case ScreenCore.K_PANEL: drawPanel(cv, it); break;
            case ScreenCore.K_TOGGLE: drawToggle(cv, it); break;
            case ScreenCore.K_NAV: drawNav(cv, it); break;
            case ScreenCore.K_SELECT: drawSelect(cv, it); break;
            case ScreenCore.K_FIELD: drawField(cv, it); break;
            case ScreenCore.K_BAR: drawBar(cv, it); break;
            case ScreenCore.K_SEC: drawSec(cv, it); break;
            case ScreenCore.K_TROW: drawTrow(cv, it); break;
            case ScreenCore.K_PLACE: drawPlace(cv, it); break;
            case ScreenCore.K_DIV: drawDivider(cv, it); break;
            case ScreenCore.K_NEWS: drawNews(cv, it); break;
            case ScreenCore.K_POSTH: drawPostHead(cv, it); break;
            case ScreenCore.K_CMT: drawCmt(cv, it); break;
            case ScreenCore.K_RBTN: drawRbtn(cv, it); break;
            case ScreenCore.K_INBAR: drawInbar(cv, it); break;
            case ScreenCore.K_MSG: drawMsg(cv, it); break;
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
            case ScreenCore.K_BTOG: drawBtog(cv, it); break;
            case ScreenCore.K_BCARD: drawBcard(cv, it); break;
            default: break;
        }
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
        int fg = it.on ? cc(it.tc, pal[R_WHITE]) : (web ? cc(it.otx, pal[R_SUB]) : (tinted ? pal[R_SUB] : pal[R_TEXT]));
        float fs = it.size > 0f ? it.size : 12f, px = it.sx > 0f ? it.sx : ScreenCore.CHIP_PADX;
        setText(fs, true, fg);
        float b = base(it.y, it.h, 0);
        cv.drawText(it.label, it.x + px, b, tp);
        if (it.badge.length() > 0) {
            tp.setColor(alpha(fg, 0.7f));
            cv.drawText(it.badge, it.x + px + it.labelW + 6f, b, tp);
        }
    }

    /** 맛집 머리줄: 제목 + 금색 작은 글('○○역 인근') + 오른쪽 알약 단추. */
    private void drawBar(Canvas cv, ScreenCore.Item it) {
        setText(it.size, true, pal[R_TEXT]);
        float tb = base(it.textY, it.lineH, 0);
        cv.drawText(it.lines.length > 0 ? it.lines[0] : "", it.textX, tb, tp);
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
        setText(it.size, false, pal[R_SUB]); tp.setLetterSpacing(0.4f / it.size);
        cv.drawText(it.lines[0], it.textX, base(it.y, it.h, 0), tp);
        tp.setLetterSpacing(0f);
        if (it.badge.length() > 0) {
            float ph = 18f, py = it.y + (it.h - ph) / 2f;
            rf.set(it.bx, py, it.bx + it.badgeW, py + ph);
            p.setStyle(Paint.Style.FILL); p.setColor(cc(it.ac, pal[R_GOLD])); cv.drawRoundRect(rf, 6f, 6f, p);
            setText(ScreenCore.SEC_PILL, true, pal[R_WHITE]); tp.setTextAlign(Paint.Align.CENTER);
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

    private void drawTextBlock(Canvas cv, ScreenCore.Item it) {
        int c = alpha(roleColor(it.color), it.alpha);
        setText(it.size, it.bold, c);
        if (it.segs != null) { drawRich(cv, it, it.textX, it.textY, c); return; }
        for (int k = 0; k < it.lines.length; k++) {
            float x = it.x;
            if ("center".equals(it.align)) { tp.setTextAlign(Paint.Align.CENTER); x = it.x + it.w / 2f; }
            else if ("right".equals(it.align)) { tp.setTextAlign(Paint.Align.RIGHT); x = it.x + it.w; }
            cv.drawText(it.lines[k], x, base(it.y + k * it.lineH, it.lineH, k), tp);
        }
        tp.setTextAlign(Paint.Align.LEFT);
    }

    private void drawButton(Canvas cv, ScreenCore.Item it) {
        rf.set(it.x, it.y, it.x + it.w, it.y + it.h);
        p.setStyle(Paint.Style.FILL); p.setColor(cc(it.fill, pal[R_CARD]));
        cv.drawRoundRect(rf, it.radius, it.radius, p);
        if (it == pressed) { p.setColor(0x14808080); cv.drawRoundRect(rf, it.radius, it.radius, p); }
        int lc = cc(it.line, pal[R_BORDER]);
        if ((lc >>> 24) != 0) {
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(lc);
            rf2.set(it.x + 0.5f, it.y + 0.5f, it.x + it.w - 0.5f, it.y + it.h - 0.5f);
            cv.drawRoundRect(rf2, it.radius - 0.5f, it.radius - 0.5f, p);
        }
        p.setStyle(Paint.Style.FILL);
        setText(it.size, it.bold, cc(it.tc, pal[R_SUB])); tp.setTextAlign(Paint.Align.CENTER);
        cv.drawText(it.lines.length > 0 ? it.lines[0] : it.label, it.x + it.w / 2f, base(it.y, it.h, 0), tp);
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
            cv.drawText(empty ? it.label : v, it.textX, base(it.iy, it.ih, 0), tp);
            cv.restore();
        }
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
        p.setStyle(Paint.Style.FILL); p.setColor(it.on ? alpha(cc(it.ac, pal[R_GOLD]), 0.5f) : cc(it.ac, pal[R_GOLD])); cv.drawRoundRect(rf, br, br, p);
        if (it == pressed && !it.on) { p.setColor(0x33000000); cv.drawRoundRect(rf, br, br, p); }
        setText(it.size2 > 0f ? it.size2 : it.size, true, it.on ? alpha(cc(it.ac2, 0xFF121214), 0.6f) : cc(it.ac2, 0xFF121214)); tp.setTextAlign(Paint.Align.CENTER);
        cv.drawText(it.badge, it.btx + it.sw / 2f, base(it.bty, it.sh, 0), tp);
        tp.setTextAlign(Paint.Align.LEFT);
    }
    /** 경로 결과 머리줄: 큰 분 숫자 + 단위 + 구간명(같은 글자 밑선) + 오른쪽 즐겨찾기 알약 + 닫기 ×. */
    /** 구간 타임라인 칸: 이름(아래 맞춤, 두 줄까지) · 배지 · 선+점 · 시각. 무엇을 어떤 색·크기로 쓸지는 전부 엔진이 정했다. */
    private void drawTrk(Canvas cv, ScreenCore.Item it) {
        float cx = it.x + it.w / 2f, axisTop = it.y + ScreenCore.TRK_NAME_H + ScreenCore.TRK_BADGE_H;
        float ly = axisTop + ScreenCore.TRK_LINE_Y, cy = axisTop + ScreenCore.TRK_DOT_Y;
        // 이름: 마지막 줄의 아래가 nameBot
        if (it.lines.length > 0) {
            setText(it.size, it.bold, cc(it.nc, pal[R_TEXT])); tp.setTextAlign(Paint.Align.CENTER);
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
        if (it.lc != null) { p.setColor(cc(it.lc, 0)); cv.drawRect(it.x - 0.5f, ly, cx, ly + ScreenCore.TRK_LINE_H, p); }
        if (it.rc != null) { p.setColor(cc(it.rc, 0)); cv.drawRect(cx, ly, it.x + it.w + 0.5f, ly + ScreenCore.TRK_LINE_H, p); }
        // 점
        if ("e".equals(it.dk)) { p.setColor(cc(it.dc, 0)); cv.drawCircle(cx, cy, ScreenCore.TRK_E_R, p); }
        else if ("r".equals(it.dk)) { p.setColor(cc(it.dc, 0)); cv.drawCircle(cx, cy, ScreenCore.TRK_R_R, p); p.setColor(pal[R_CARD]); cv.drawCircle(cx, cy, ScreenCore.TRK_R_R - 3f, p); }
        else if ("m".equals(it.dk)) {
            int c1 = cc(it.dc, 0), c2 = it.dc2 != null ? cc(it.dc2, c1) : c1;
            float mr = ScreenCore.TRK_M_R;                                       // 반지름 3dp 의 작은 점 — 왼쪽 반은 앞 색, 오른쪽 반은 뒤 색(그릴 때 새 객체를 만들지 않으려고 그라데이션 대신 반으로 나눠 칠한다)
            cv.save(); cv.clipRect(cx - mr, cy - mr, cx, cy + mr); p.setColor(c1); cv.drawCircle(cx, cy, mr, p); cv.restore();
            cv.save(); cv.clipRect(cx, cy - mr, cx + mr, cy + mr); p.setColor(c2); cv.drawCircle(cx, cy, mr, p); cv.restore();
        }
        // 시각(또는 도보 분)
        if (it.time.length() > 0) {
            setText(it.tsz, it.tb, cc(it.timec, pal[R_SUB])); tp.setTextAlign(Paint.Align.CENTER);
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
    private void hideInput() {
        endEdit();
        if (input == null) return;
        blurInput();
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
        if (vis != View.VISIBLE) hideInput(); else { inShown = false; syncLater(); }
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

        static synchronized void init(Context c) {
            if (mem != null) return;
            int kb = (int) (Runtime.getRuntime().maxMemory() / 1024L / 12L);
            mem = new LruCache<String, Bitmap>(Math.max(4096, kb)) {
                @Override protected int sizeOf(String k, Bitmap b) { return b.getByteCount() / 1024; }
            };
            dir = new File(c.getCacheDir(), "scr_img"); dir.mkdirs();
            pool = Executors.newFixedThreadPool(3);
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

        private static Bitmap load(String url, int w, int h) throws Exception {
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
        private static void trim() {
            try {
                File[] fs = dir.listFiles(); if (fs == null) return;
                long tot = 0; for (File x : fs) tot += x.length();
                if (tot < 40L * 1024 * 1024) return;
                java.util.Arrays.sort(fs, new java.util.Comparator<File>() { @Override public int compare(File a, File b) { return Long.compare(a.lastModified(), b.lastModified()); } });
                for (File x : fs) { if (tot < 30L * 1024 * 1024) break; tot -= x.length(); x.delete(); }
            } catch (Throwable ignored) { }
        }
    }
}

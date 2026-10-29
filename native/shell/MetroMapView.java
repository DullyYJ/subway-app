package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.DashPathEffect;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.animation.ValueAnimator;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.MotionEvent;
import android.view.VelocityTracker;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.animation.DecelerateInterpolator;
import android.widget.OverScroller;

import java.util.HashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 네이티브 노선도 화면. 화면 위에 얹히는 View 하나.
 *
 * 왜 이렇게 그리나 (YJ: "노선도 확대·축소할 때 렉이 걸리고 깨진다")
 * ─────────────────────────────────────────────────────────────────
 * 예전 SVG 는 도형 1만여 개를 손가락이 움직일 때마다 브라우저가 다시 그린다. 여기서는
 *   · 도형을 백그라운드 스레드에서 비트맵 한 장으로 그려 두고(화면보다 사방 20% 더 넓게),
 *   · 손가락으로 밀거나 오므릴 때는 그 비트맵을 GPU 로 옮기고 늘이기만 한다(그리기 계산 없음 → 매 프레임 부드럽게).
 *   · 손을 멈추면 현재 배율로 다시 선명하게 그려서 바꿔 끼운다(확대해도 깨지지 않는다 — 벡터를 새로 그리니까).
 * 무엇을 그릴지 정하는 규칙은 MetroRenderer(순수 자바, PC 에서 시험됨)에 있고, 여기는 그 규칙을 안드로이드 Canvas 에 찍는 일만 한다.
 *
 * 계산 원칙: 경로·시간 계산은 하지 않는다. 지도 위 위치·터치·그림만 담당한다.
 */
public class MetroMapView extends View {

    public interface Listener {
        /** 역 이름(라벨)을 눌렀다. sx,sy 는 이 View 안 화면 좌표 */
        void onStation(int op, float sx, float sy);
        /** 손가락이 닿았다 — 웹 쪽 팝업을 닫게 한다 */
        void onGestureStart();
        /** 지도가 가로로 더 못 가는 끝에서 더 밀어 놓았다 — 버스 탭으로 넘긴다. dir = 손가락이 간 쪽(-1 왼쪽 · +1 오른쪽) */
        void onEdgeSwipe(int dir);
        /** 첫 그림이 나왔다(비어 있지 않음을 확인한 뒤) */
        void onReady();
        void onError(String msg);
        /** centerOn 의 이동이 끝났다(강조 시작 시점) */
        void onCentered(int op);
    }

    private static final int FLASH_COLOR = 0xFFFF2D55;
    private static final long FLASH_MS = 2400L;
    private static final float LOD_EN_BELOW_CSS = 0.6f;   // 앱의 _LOD_EN_BELOW 와 같다

    private final MetroMapData data;
    private final MetroCamera cam;
    private final float density;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private Listener listener;

    private int filter = 0;
    private boolean needFit = true;

    // ── 비트맵 캐시 ──
    private Bitmap front, back;
    private float fScale, fTx, fTy;     // front 를 그릴 때의 카메라
    private int fMx, fMy;               // front 의 왼쪽-위가 화면 (-fMx,-fMy) 에 있었다
    private volatile int gen = 0;       // 바뀌면 진행 중인 그리기를 버린다
    private boolean busy = false;
    private boolean readySent = false;
    private boolean released = false;
    private final Paint bmpPaint = new Paint(Paint.FILTER_BITMAP_FLAG);
    private final Matrix mat = new Matrix();

    // ── 손가락 ──
    private final int slop;
    private final float tapTolPx;
    private float downX, downY, lastX, lastY;
    private long downT;
    private int activeId = -1;
    private boolean moved, pinching, tapOk;
    private float edgeOver, edgeOverY;          // 가장자리에서 더 밀린 가로·세로 양(px)
    private float pStartDist, pStartScale, pFx, pFy;
    private VelocityTracker vt;
    private final OverScroller scroller;
    private boolean flinging = false;
    private ValueAnimator anim;

    // ── 강조(찾아가기·내 위치) ──
    private int flashOp = -1;
    private long flashStart = 0L;
    private final Paint ringPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint tintPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final HashMap<Integer, Path> uiPaths = new HashMap<>();

    // ── 안내 문구(웹의 #svgHint 를 대신 그림) ──
    private String hint = null;
    private float hintBottomPx = 0f;
    private final Paint hintBg = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint hintTx = new Paint(Paint.ANTI_ALIAS_FLAG);

    public MetroMapView(Context ctx, MetroMapData data, float density) {
        super(ctx);
        this.data = data;
        this.density = density > 0f ? density : 1f;
        this.cam = new MetroCamera(data.svgW, data.svgH);
        ViewConfiguration vc = ViewConfiguration.get(ctx);
        this.slop = vc.getScaledTouchSlop();
        this.tapTolPx = 14f * this.density;
        this.scroller = new OverScroller(ctx);
        ringPaint.setStyle(Paint.Style.STROKE);
        ringPaint.setColor(FLASH_COLOR);
        tintPaint.setStyle(Paint.Style.FILL);
        tintPaint.setColor(FLASH_COLOR);
        hintBg.setStyle(Paint.Style.FILL);
        hintBg.setColor(0xA6000000);
        hintTx.setColor(0xFFAAAAAA);
        hintTx.setTextAlign(Paint.Align.CENTER);
        hintTx.setTextSize(9f * this.density);
        hintTx.setTypeface(Typeface.DEFAULT);
        setWillNotDraw(false);
        setFocusable(false);
    }

    public void setListener(Listener l) { listener = l; }
    public MetroMapData data() { return data; }
    public MetroCamera camera() { return cam; }
    public int filterIndex() { return filter; }

    // ═════════════════════════ 크기 · 필터 · 맞춤 ═════════════════════════
    @Override
    protected void onSizeChanged(int w, int h, int ow, int oh) {
        super.onSizeChanged(w, h, ow, oh);
        if (w <= 0 || h <= 0) return;
        cam.setView(w, h, 20f * density);
        if (needFit) { cam.fit(); needFit = false; }
        invalidateRender();
    }

    /** 호선 필터 (이름은 앱의 gmFilterLine 이름 그대로: 'ALL', '2호선' …) */
    public void setFilter(String name) {
        int f = data.filterIndex(name);
        if (f == filter) return;
        filter = f;
        invalidateRender();
    }

    /** 처음 위치·배율로 (앱의 _pzFit) */
    public void fit() {
        stopMotion();
        if (getWidth() > 0 && getHeight() > 0) { cam.fit(); invalidateRender(); invalidate(); }
        else needFit = true;
    }

    public void setHint(String text, float bottomPx) {
        hint = (text == null || text.length() == 0) ? null : text;
        hintBottomPx = bottomPx;
        invalidate();
    }

    // ═════════════════════════ 찾아가기 ═════════════════════════
    /**
     * 역 라벨을 화면 가운데로. zoomCss>0 이면 그 배율(CSS 기준)보다 작을 때만 확대한다(축소는 안 함 — 웹과 같음).
     * @return 못 찾으면 false
     */
    public boolean centerOn(String name, float zoomCss, boolean flash) {
        int op = data.findLabel(name);
        if (op < 0) return false;
        float target = cam.scale;
        if (zoomCss > 0f) target = Math.max(cam.scale, cam.clampScale(zoomCss * density));
        animateTo(op, target, true, flash);
        return true;
    }

    /** 라벨이 화면 밖이면 가운데로 옮긴다(팝업이 아래를 가렸을 때 역이 안 보이는 일을 막는다). 배율은 그대로. */
    public boolean ensureVisible(String name) {
        int op = data.findLabel(name);
        if (op < 0) return false;
        float m = 28f * density, sx = cam.screenX(data.labelCx(op)), sy = cam.screenY(data.labelCy(op));
        if (sx >= m && sx <= cam.viewW - m && sy >= m && sy <= cam.viewH - cover - m) return true;        // 아래를 시트가 덮은 만큼은 안 보이는 자리로 친다
        animateTo(op, cam.scale, false, false);
        return true;
    }
    /** 아래에서 올라온 시트가 덮은 높이(px). 웹은 지도 사각형을 시트 위쪽 끝까지로 줄여 역이 그 안에 오게 한다 — 앱은 지도를 크게 둔 채 같은 보이는 영역으로 가운데를 맞춘다. 0 이면 덮개 없음. */
    public void setCover(float px) { cover = Math.max(0f, px); }
    private float cover;

    private void animateTo(final int op, final float targetScale, final boolean notify, final boolean flash) {
        stopMotion();
        final float x = data.labelCx(op), y = data.labelCy(op);
        final float s0 = cam.scale, sx0 = cam.screenX(x), sy0 = cam.screenY(y);
        final float s1 = targetScale, sx1 = cam.viewW / 2f, sy1 = (cam.viewH - cover) / 2f;
        anim = ValueAnimator.ofFloat(0f, 1f);
        anim.setDuration(380L);
        anim.setInterpolator(new DecelerateInterpolator(1.6f));
        anim.addUpdateListener(new ValueAnimator.AnimatorUpdateListener() {
            @Override public void onAnimationUpdate(ValueAnimator a) {
                float k = (Float) a.getAnimatedValue();
                cam.scale = s0 + (s1 - s0) * k;
                float sx = sx0 + (sx1 - sx0) * k, sy = sy0 + (sy1 - sy0) * k;
                cam.tx = sx - x * cam.scale;
                cam.ty = sy - y * cam.scale;
                cam.clamp();
                invalidate();
                scheduleRender(120L);
            }
        });
        anim.addListener(new android.animation.AnimatorListenerAdapter() {
            private boolean canceled = false;
            @Override public void onAnimationCancel(android.animation.Animator a) { canceled = true; }
            @Override public void onAnimationEnd(android.animation.Animator a) {
                if (canceled) return;
                scheduleRender(0L);
                if (flash) startFlash(op);
                if (notify && listener != null) listener.onCentered(op);
            }
        });
        anim.start();
    }

    private void startFlash(int op) {
        flashOp = op;
        flashStart = SystemClock.uptimeMillis();
        invalidate();
    }

    private void stopMotion() {
        if (anim != null) { anim.cancel(); anim = null; }
        if (flinging) { scroller.forceFinished(true); flinging = false; }
    }

    // ═════════════════════════ 손가락 ═════════════════════════
    // 시트가 오르내리는 동안 잘라낸(안 보이는) 아래쪽은 만짐을 받지 않는다 — 아래의 웹 시트가 받게 한다. -1 이면 전체.
    private float visBottom = -1f;
    private boolean touchBlocked;
    public void setVisBottom(float b) { visBottom = b; }
    @Override
    public boolean dispatchTouchEvent(MotionEvent ev) {
        if (ev.getActionMasked() == MotionEvent.ACTION_DOWN) touchBlocked = visBottom >= 0f && ev.getY() > visBottom;
        if (touchBlocked) return false;
        return super.dispatchTouchEvent(ev);
    }

    @Override
    public boolean onTouchEvent(MotionEvent e) {
        int act = e.getActionMasked();
        switch (act) {
            case MotionEvent.ACTION_DOWN: {
                if (getParent() != null) getParent().requestDisallowInterceptTouchEvent(true);
                stopMotion();
                downX = lastX = e.getX(); downY = lastY = e.getY(); downT = e.getEventTime();
                activeId = e.getPointerId(0);
                moved = false; pinching = false; tapOk = true;
                edgeOver = 0f; edgeOverY = 0f; animate().cancel(); setTranslationX(0f);
                if (vt != null) vt.recycle();
                vt = VelocityTracker.obtain(); vt.addMovement(e);
                if (listener != null) listener.onGestureStart();
                return true;
            }
            case MotionEvent.ACTION_POINTER_DOWN: {
                if (vt != null) vt.addMovement(e);
                if (e.getPointerCount() >= 2) { startPinch(e); tapOk = false; moved = true; }
                return true;
            }
            case MotionEvent.ACTION_MOVE: {
                if (vt != null) vt.addMovement(e);
                if (pinching && e.getPointerCount() >= 2) { updatePinch(e); return true; }
                int idx = e.findPointerIndex(activeId);
                if (idx < 0) return true;
                float x = e.getX(idx) + getTranslationX(), y = e.getY(idx);          // 끝 밀기로 View 가 딸려 가 있어도 손가락 위치는 화면 기준으로 같게
                if (!moved) {
                    if (Math.hypot(x - downX, y - downY) <= slop) return true;
                    moved = true; tapOk = false; lastX = x; lastY = y;     // 슬롭을 넘은 순간부터 움직인다
                    return true;
                }
                float ddy = y - lastY;
                float left = cam.panByLeftoverX(x - lastX, ddy);
                if (left != 0f) { if (edgeOver != 0f && (left < 0f) != (edgeOver < 0f)) { edgeOver = 0f; edgeOverY = 0f; } edgeOver += left; edgeOverY += Math.abs(ddy); }
                else { edgeOver = 0f; edgeOverY = 0f; }
                float pull = Math.abs(edgeOver) >= edgeThr() * 0.35f && Math.abs(edgeOver) >= 1.5f * edgeOverY ? edgeOver * 0.4f : 0f;      // 끝에서 더 밀면 지도가 살짝 딸려 가며 '넘어간다'를 알려 준다
                setTranslationX(pull);
                lastX = x; lastY = y;
                invalidate();
                considerRender();
                return true;
            }
            case MotionEvent.ACTION_POINTER_UP: {
                if (vt != null) vt.addMovement(e);
                if (pinching) {
                    int up = e.getActionIndex();
                    if (e.getPointerCount() - 1 >= 2) { startPinchExcluding(e, up); }
                    else {
                        pinching = false;
                        int keep = up == 0 ? 1 : 0;
                        activeId = e.getPointerId(keep);
                        lastX = e.getX(keep); lastY = e.getY(keep);
                        scheduleRender(0L);
                    }
                }
                return true;
            }
            case MotionEvent.ACTION_UP: {
                if (vt != null) vt.addMovement(e);
                int idx = e.findPointerIndex(activeId);
                float x = idx >= 0 ? e.getX(idx) : e.getX(), y = idx >= 0 ? e.getY(idx) : e.getY();
                if (pinching) { pinching = false; scheduleRender(0L); }
                else if (tapOk && !moved && (e.getEventTime() - downT) < 500L) { handleTap(x, y); }
                else if (moved) {
                    int ed = MetroCamera.edgeSwipe(edgeOver, edgeOverY, edgeThr());
                    if (ed != 0 && listener != null) { edgeReset(); recycleVt(); scheduleRender(0L); listener.onEdgeSwipe(ed); return true; }
                    edgeReset(); startFling();
                }
                recycleVt();
                return true;
            }
            case MotionEvent.ACTION_CANCEL: {
                pinching = false; edgeReset(); recycleVt(); scheduleRender(0L);
                return true;
            }
            default:
                return true;
        }
    }

    private float edgeThr() { return 72f * density; }
    /** 끝 밀기 표시를 되돌린다(딸려 갔던 지도가 제자리로) */
    private void edgeReset() {
        edgeOver = 0f; edgeOverY = 0f;
        if (getTranslationX() != 0f) animate().translationX(0f).setDuration(160L).start();
    }

    private void recycleVt() { if (vt != null) { vt.recycle(); vt = null; } }

    private void startPinch(MotionEvent e) { startPinchExcluding(e, -1); }

    private void startPinchExcluding(MotionEvent e, int skip) {
        edgeReset();
        int a = -1, b = -1;
        for (int i = 0; i < e.getPointerCount(); i++) {
            if (i == skip) continue;
            if (a < 0) a = i; else if (b < 0) b = i;
        }
        if (b < 0) return;
        float dx = e.getX(a) - e.getX(b), dy = e.getY(a) - e.getY(b);
        pStartDist = (float) Math.max(1.0, Math.hypot(dx, dy));
        pStartScale = cam.scale;
        float mx = (e.getX(a) + e.getX(b)) / 2f, my = (e.getY(a) + e.getY(b)) / 2f;
        pFx = cam.svgX(mx); pFy = cam.svgY(my);              // 두 손가락 가운데 아래의 지도 위치를 붙잡는다
        pinchA = e.getPointerId(a); pinchB = e.getPointerId(b);
        pinching = true;
    }
    private int pinchA = -1, pinchB = -1;

    private void updatePinch(MotionEvent e) {
        int a = e.findPointerIndex(pinchA), b = e.findPointerIndex(pinchB);
        if (a < 0 || b < 0) return;
        float dx = e.getX(a) - e.getX(b), dy = e.getY(a) - e.getY(b);
        float dist = (float) Math.max(1.0, Math.hypot(dx, dy));
        float mx = (e.getX(a) + e.getX(b)) / 2f, my = (e.getY(a) + e.getY(b)) / 2f;
        float s = cam.clampScale(pStartScale * dist / pStartDist);
        cam.scale = s;
        cam.tx = mx - pFx * s;
        cam.ty = my - pFy * s;
        cam.clamp();
        invalidate();
        scheduleRender(110L);
    }

    private void handleTap(float x, float y) {
        float tol = tapTolPx / cam.scale;
        int op = data.hitLabel(cam.svgX(x), cam.svgY(y), tol, filter);
        if (op >= 0 && listener != null) listener.onStation(op, x, y);
    }

    private void startFling() {
        if (vt == null) { scheduleRender(0L); return; }
        vt.computeCurrentVelocity(1000, 8000f);
        float vx = vt.getXVelocity(), vy = vt.getYVelocity();
        int minV = ViewConfiguration.get(getContext()).getScaledMinimumFlingVelocity();
        if (Math.abs(vx) < minV && Math.abs(vy) < minV) { scheduleRender(0L); return; }
        scroller.forceFinished(true);
        scroller.fling((int) -cam.tx, (int) -cam.ty, (int) -vx, (int) -vy,
                (int) cam.minScrollX(), (int) cam.maxScrollX(), (int) cam.minScrollY(), (int) cam.maxScrollY());
        flinging = true;
        postOnAnimation(flingStep);
    }

    private final Runnable flingStep = new Runnable() {
        @Override public void run() {
            if (!flinging) return;
            if (scroller.computeScrollOffset()) {
                cam.tx = -scroller.getCurrX();
                cam.ty = -scroller.getCurrY();
                cam.clamp();
                invalidate();
                considerRender();
                postOnAnimation(this);
            } else {
                flinging = false;
                scheduleRender(0L);
            }
        }
    };

    // ═════════════════════════ 그리기 요청 ═════════════════════════
    private final Runnable renderRun = new Runnable() { @Override public void run() { startRender(); } };

    private void scheduleRender(long delay) {
        ui.removeCallbacks(renderRun);
        ui.postDelayed(renderRun, delay);
    }

    /** 밀고 있는 중: 캐시 비트맵이 화면을 곧 못 덮게 되면 지금 새로 그린다 */
    private void considerRender() {
        if (front == null) { scheduleRender(0L); return; }
        float r = cam.scale / fScale;
        float dx = cam.tx - r * fTx, dy = cam.ty - r * fTy;          // 비트맵 왼쪽-위가 화면에서 움직인 만큼(배율 보정)
        if (r < 0.98f || r > 1.02f || Math.abs(dx) > fMx * 0.55f || Math.abs(dy) > fMy * 0.55f) scheduleRender(0L);
    }

    /** 내용이 달라졌다(필터·크기) — 진행 중이던 건 버리고 새로 */
    private void invalidateRender() {
        gen++;
        scheduleRender(0L);
    }

    private boolean lod() { return cam.scale / density < LOD_EN_BELOW_CSS; }

    private void startRender() {
        if (released || cam.viewW <= 0f || cam.viewH <= 0f) return;
        if (busy) { ui.removeCallbacks(renderRun); ui.postDelayed(renderRun, 40L); return; }
        busy = true;
        final int w = (int) cam.viewW, h = (int) cam.viewH;
        int mx = Math.max(0, Math.min((int) (w * 0.2f), (4096 - w) / 2));
        int my = Math.max(0, Math.min((int) (h * 0.2f), (4096 - h) / 2));
        final int bw = w + 2 * mx, bh = h + 2 * my, fmx = mx, fmy = my;
        final float sc = cam.scale, tx = cam.tx, ty = cam.ty;
        final boolean ld = lod();
        final int flt = filter;
        final int myGen = gen;
        Bitmap use = back;
        back = null;
        if (use != null && (use.getWidth() != bw || use.getHeight() != bh || use.isRecycled())) { use.recycle(); use = null; }
        final Bitmap target = use;
        worker.execute(new Runnable() {
            @Override public void run() {
                Bitmap bm = target;
                int drawn = 0;
                String err = null;
                try {
                    if (bm == null) bm = Bitmap.createBitmap(bw, bh, Bitmap.Config.ARGB_8888);
                    Canvas c = new Canvas(bm);
                    c.translate(fmx + tx, fmy + ty);
                    c.scale(sc, sc);
                    float x0 = (-fmx - tx) / sc, y0 = (-fmy - ty) / sc, x1 = (bw - fmx - tx) / sc, y1 = (bh - fmy - ty) / sc;
                    CanvasSink sink = sinkFor(c, bw, bh);
                    drawn = MetroRenderer.render(data, sink, flt, ld, x0, y0, x1, y1, -1, 0, new MetroRenderer.Cancel() {
                        @Override public boolean isCancelled() { return gen != myGen || released; }
                    });
                    sink.close();
                } catch (Throwable t) {
                    err = String.valueOf(t);
                }
                final Bitmap done = bm;
                final int fdrawn = drawn;
                final String ferr = err;
                ui.post(new Runnable() {
                    @Override public void run() { finishRender(done, fdrawn, ferr, myGen, sc, tx, ty, fmx, fmy); }
                });
            }
        });
    }

    private void finishRender(Bitmap bm, int drawn, String err, int myGen, float sc, float tx, float ty, int mx, int my) {
        busy = false;
        if (released) { if (bm != null) bm.recycle(); return; }
        if (err != null) {
            if (bm != null) bm.recycle();
            if (listener != null) listener.onError("그리기 실패: " + err);
            return;
        }
        if (drawn < 0 || myGen != gen) {              // 중간에 버려짐 — 비트맵은 다음 그리기에 재사용
            if (back != null) back.recycle();
            back = bm;
            scheduleRender(0L);
            return;
        }
        Bitmap old = front;
        front = bm; fScale = sc; fTx = tx; fTy = ty; fMx = mx; fMy = my;
        back = old;
        invalidate();
        if (!readySent) {
            readySent = true;
            if (looksBlank(bm, data.bg)) { if (listener != null) listener.onError("지도가 비어 있다"); }
            else if (listener != null) listener.onReady();
        }
        considerRender();
    }

    /** 성기게 찍어 보아 배경색이 아닌 점이 거의 없으면 비어 있는 것 */
    static boolean looksBlank(Bitmap bm, int bg) {
        int w = bm.getWidth(), h = bm.getHeight(), non = 0, tot = 0;
        for (int yy = 0; yy < 48; yy++) {
            for (int xx = 0; xx < 48; xx++) {
                int px = bm.getPixel(Math.min(w - 1, xx * w / 48), Math.min(h - 1, yy * h / 48));
                tot++;
                if (px != bg) non++;
            }
        }
        return non < tot * 0.01f;
    }

    // ═════════════════════════ 안드로이드 Canvas 로 찍기 ═════════════════════════
    private final ThreadLocal<CanvasSink> sinkTl = new ThreadLocal<CanvasSink>();
    private CanvasSink sinkFor(Canvas c, int w, int h) {
        CanvasSink s = sinkTl.get();
        if (s == null) { s = new CanvasSink(data); sinkTl.set(s); }
        s.begin(c, w, h);
        return s;
    }

    /** MetroRenderer.Sink 의 안드로이드 구현. 그리기 스레드 하나에서만 쓴다(Path 캐시를 공유하지 않음). */
    static final class CanvasSink implements MetroRenderer.Sink {
        private final MetroMapData d;
        private final Path[] paths;
        private final Paint fillP = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint strokeP = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Matrix mm = new Matrix();
        private final float[] v9 = new float[9];
        private Canvas c;
        private int w, h;

        CanvasSink(MetroMapData d) {
            this.d = d;
            this.paths = new Path[d.shCmd.length];
            fillP.setStyle(Paint.Style.FILL);
            strokeP.setStyle(Paint.Style.STROKE);
            strokeP.setStrokeJoin(Paint.Join.MITER);
            strokeP.setStrokeMiter(4f);
        }

        void begin(Canvas c, int w, int h) { this.c = c; this.w = w; this.h = h; }
        void close() { this.c = null; }

        Path path(int si) {
            Path p = paths[si];
            if (p != null) return p;
            p = buildPath(d, si);
            paths[si] = p;
            return p;
        }

        @Override public void clear(int argb) {
            // 호출 시점의 변환(지도→비트맵)을 건드리지 않고 비트맵 전체를 칠한다
            c.save();
            c.setMatrix(null);
            c.drawColor(argb);
            c.restore();
        }
        @Override public void pushClip(int shape) { c.save(); Path p = path(shape); p.setFillType(Path.FillType.WINDING); c.clipPath(p); }
        @Override public void popClip() { c.restore(); }

        @Override public void fill(int shape, float x, float y, float[] m, int argb, boolean evenOdd) {
            Path p = path(shape);
            p.setFillType(evenOdd ? Path.FillType.EVEN_ODD : Path.FillType.WINDING);
            fillP.setColor(argb);
            c.save();
            if (m != null) { setMat(m); c.concat(mm); }
            if (x != 0f || y != 0f) c.translate(x, y);
            c.drawPath(p, fillP);
            c.restore();
        }

        @Override public void stroke(int shape, float[] m, int argb, float width, float[] dash, boolean round) {
            Path p = path(shape);
            strokeP.setColor(argb);
            strokeP.setStrokeWidth(width);
            strokeP.setStrokeCap(round ? Paint.Cap.ROUND : Paint.Cap.BUTT);
            strokeP.setPathEffect(dashEffect(dash));
            c.save();
            if (m != null) { setMat(m); c.concat(mm); }
            c.drawPath(p, strokeP);
            c.restore();
        }

        private void setMat(float[] m) {   // SVG matrix(a b c d e f) → Android 3x3 행 순서 {a c e / b d f / 0 0 1}
            v9[0] = m[0]; v9[1] = m[2]; v9[2] = m[4];
            v9[3] = m[1]; v9[4] = m[3]; v9[5] = m[5];
            v9[6] = 0f; v9[7] = 0f; v9[8] = 1f;
            mm.setValues(v9);
        }

        private DashPathEffect dashEffect(float[] dash) {
            if (dash == null || dash.length == 0) return null;
            float[] a = dash;
            if (a.length % 2 == 1) { a = new float[dash.length * 2]; System.arraycopy(dash, 0, a, 0, dash.length); System.arraycopy(dash, 0, a, dash.length, dash.length); }
            float sum = 0f;
            for (float f : a) sum += f;
            if (!(sum > 0f)) return null;
            return new DashPathEffect(a, 0f);
        }
    }

    static Path buildPath(MetroMapData d, int si) {
        Path p = new Path();
        byte[] cmd = d.shCmd[si];
        float[] co = d.shCoord[si];
        int k = 0;
        for (int i = 0; i < cmd.length; i++) {
            switch (cmd[i]) {
                case 0: p.moveTo(co[k], co[k + 1]); k += 2; break;
                case 1: p.lineTo(co[k], co[k + 1]); k += 2; break;
                case 2: p.cubicTo(co[k], co[k + 1], co[k + 2], co[k + 3], co[k + 4], co[k + 5]); k += 6; break;
                default: p.close(); break;
            }
        }
        return p;
    }

    // ═════════════════════════ 화면에 그리기 ═════════════════════════
    @Override
    protected void onDraw(Canvas canvas) {
        canvas.drawColor(data.bg);
        if (front != null && !front.isRecycled()) {
            float r = cam.scale / fScale;
            mat.reset();
            mat.postTranslate(-fMx, -fMy);
            mat.postScale(r, r);
            mat.postTranslate(cam.tx - r * fTx, cam.ty - r * fTy);
            canvas.drawBitmap(front, mat, bmpPaint);
        }
        if (flashOp >= 0) drawFlash(canvas);
        if (hint != null) drawHint(canvas);
    }

    private void drawFlash(Canvas canvas) {
        long el = SystemClock.uptimeMillis() - flashStart;
        if (el > FLASH_MS) { flashOp = -1; return; }
        int op = flashOp;
        canvas.save();
        canvas.translate(cam.tx, cam.ty);
        canvas.scale(cam.scale, cam.scale);
        // 글자를 빨갛게 (웹의 _flashStation 과 같은 색)
        boolean ld = lod();
        for (int k = data.lbInstStart[op]; k < data.lbInstStart[op] + data.lbInstCount[op]; k++) {
            if (ld && data.inEn[k]) continue;
            Path p = uiPaths.get(data.inShape[k]);
            if (p == null) { p = buildPath(data, data.inShape[k]); uiPaths.put(data.inShape[k], p); }
            p.setFillType(data.inEo[k] ? Path.FillType.EVEN_ODD : Path.FillType.WINDING);   // ㅁ·ㅂ 안쪽 구멍
            canvas.save();
            canvas.translate(data.inX[k], data.inY[k]);
            canvas.drawPath(p, tintPaint);
            canvas.restore();
        }
        // 퍼지는 고리: 반지름 r0→r0*2.2, 투명도 0.9→0.15 를 1초 주기로 (웹과 같은 수식)
        float ph = (el / 1000f) % 1f;
        float r0 = Math.max(10f, Math.max(data.labelW(op), data.labelH(op)) * 0.7f);
        ringPaint.setStrokeWidth(2.5f);
        ringPaint.setAlpha(Math.max(0, Math.min(255, Math.round((0.9f - ph * 0.75f) * 255f))));
        canvas.drawCircle(data.labelCx(op), data.labelCy(op), r0 + ph * r0 * 1.2f, ringPaint);
        canvas.restore();
        postInvalidateOnAnimation();
    }

    private void drawHint(Canvas canvas) {
        float tw = hintTx.measureText(hint);
        float padX = 12f * density, padY = 4f * density, th = hintTx.getTextSize();
        float cx = getWidth() / 2f, bottom = getHeight() - hintBottomPx;
        RectF r = new RectF(cx - tw / 2f - padX, bottom - th - 2 * padY, cx + tw / 2f + padX, bottom);
        canvas.drawRoundRect(r, 10f * density, 10f * density, hintBg);
        canvas.drawText(hint, cx, bottom - padY - th * 0.2f, hintTx);
    }

    // ═════════════════════════ 정리 ═════════════════════════
    /** 숨김 상태가 길어질 때 큰 비트맵을 놓아준다. 다시 보이면 새로 그린다. */
    public void releaseBitmaps() {
        gen++;
        if (front != null) { front.recycle(); front = null; }
        if (back != null) { back.recycle(); back = null; }
    }

    @Override
    protected void onVisibilityChanged(View changed, int visibility) {
        super.onVisibilityChanged(changed, visibility);
        if (visibility == VISIBLE && front == null && !released) scheduleRender(0L);
    }

    public void destroy() {
        released = true;
        gen++;
        stopMotion();
        ui.removeCallbacksAndMessages(null);
        worker.shutdownNow();
        if (front != null) { front.recycle(); front = null; }
        if (back != null) { back.recycle(); back = null; }
    }

    /** 화면에 보이는 모습을 작은 JPEG 로 (웹 팝업·모달이 지도 위에 뜰 때, 가려진 지도 자리에 대신 깔아 둔다) */
    public Bitmap snapshot(float k) {
        int w = getWidth(), h = getHeight();
        if (w <= 0 || h <= 0) return null;
        Bitmap bm = Bitmap.createBitmap(Math.max(1, (int) (w * k)), Math.max(1, (int) (h * k)), Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bm);
        c.scale(k, k);
        onDraw(c);
        return bm;
    }
}

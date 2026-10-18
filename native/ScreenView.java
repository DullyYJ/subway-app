package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
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
import java.util.HashMap;
import java.util.HashSet;
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
        /** 검색줄에서 검색 실행(입력칸 글자 q, 비었을 수 있다). 무슨 주소를 열지는 엔진이 정한 a.tpl/a.empty 를 웹이 쓴다. */
        void onSearch(ScreenCore.Act a, String q);
        /** 검색 입력칸이 포커스를 얻거나 잃음(키보드가 올라오면 웹뷰 크기가 바뀌므로 웹이 '움직임'으로 오해해 숨기지 않게 알린다). */
        void onInputFocus(boolean on);
        void onFirstDraw();
    }

    // 색 역할 (ScreenCore 의 color 이름과 같은 순서)
    public static final int R_BG = 0, R_CARD = 1, R_BORDER = 2, R_TEXT = 3, R_SUB = 4, R_GOLD = 5, R_ORANGE = 6, R_IMGBG = 7, R_WHITE = 8;

    private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final TextPaint tp = new TextPaint(Paint.ANTI_ALIAS_FLAG);
    private final RectF rf = new RectF(), rf2 = new RectF();
    private final Runnable firstDrawCb = new Runnable() { @Override public void run() { if (listener != null) listener.onFirstDraw(); } };
    private final Paint bmpPaint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
    private final int[] pal = { 0xFF0B0F14, 0xFF1B2129, 0x33FFFFFF, 0xFFF2F4F7, 0xFF9AA4B2, 0xFFF0B429, 0xFFF07830, 0xFF252528, 0xFFFFFFFF };
    private ScreenCore.Screen screen;
    private ScreenCore.Layout lay;
    private float dpr = 1f, scrollY = 0f, scrollX = 0f;
    private final OverScroller flingY, flingX;
    private VelocityTracker vt;
    private final int slop, minFling, maxFling;
    private float downX, downY, lastX, lastY, downBodyY;
    private long downT;
    private int mode = 0;                                  // 0 없음 · 1 본문 세로 · 2 머리 가로 · 3 눌러보는 중
    private boolean inHead, inChips;
    private ScreenCore.Item pressed;
    private Listener listener;
    private boolean drewOnce;
    private volatile long lastDraw = 0L;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private EditText input;                                   // 검색줄의 진짜 입력칸(기기 키보드·붙여넣기·한글 조합은 안드로이드가 한다)
    private int inL = -1, inT = -1, inW = -1, inH = -1;        // 마지막으로 놓은 입력칸 자리(바뀔 때만 다시 놓는다)
    private boolean inFront, inShown;
    private ScreenCore.Act inAct;
    private final ScreenCore.Measurer measurer = new ScreenCore.Measurer() {
        @Override public float width(String s, float size, boolean bold) {
            tp.setTypeface(bold ? Typeface.DEFAULT_BOLD : Typeface.DEFAULT);
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
    }

    public void setListener(Listener l) { listener = l; }
    public long drawAgeMs() { return lastDraw == 0L ? Long.MAX_VALUE : SystemClock.uptimeMillis() - lastDraw; }
    public int itemCount() { return lay == null ? 0 : lay.head.length + lay.body.length; }
    public float scrollPos() { return scrollY; }
    public void setDpr(float d) { if (d > 0f && d != dpr) { dpr = d; relayout(); } }
    public void setPalette(int[] c) { for (int i = 0; i < pal.length && i < c.length; i++) pal[i] = c[i]; styleInput(); invalidate(); }

    /** 새 화면을 올린다. keepScroll 이면 위치를 유지(같은 목록 갱신), 아니면 맨 위로. */
    public void setScreen(ScreenCore.Screen s, boolean keepScroll) {
        screen = s;
        if (!keepScroll) { scrollY = 0f; scrollX = 0f; }
        flingY.forceFinished(true); flingX.forceFinished(true);
        pressed = null; mode = 0;
        relayout();
    }

    private void relayout() {
        if (screen == null || getWidth() <= 0) { lay = null; invalidate(); syncLater(); return; }
        lay = ScreenCore.layout(screen, getWidth() / dpr, measurer);
        clampScroll();
        invalidate();
        syncLater();
    }
    @Override protected void onSizeChanged(int w, int h, int ow, int oh) { super.onSizeChanged(w, h, ow, oh); relayout(); }

    private float viewHdp() { return getHeight() / dpr; }
    private float bodyViewH() { return Math.max(0f, viewHdp() - (lay == null ? 0f : lay.headH)); }
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
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN: {
                if (getParent() != null) getParent().requestDisallowInterceptTouchEvent(true);
                flingY.forceFinished(true); flingX.forceFinished(true);
                downX = lastX = x; downY = lastY = y; downT = SystemClock.uptimeMillis();
                inHead = y < lay.headH * dpr;
                inChips = inHead && lay.chipsTop >= 0f && y >= lay.chipsTop * dpr && y < lay.chipsBot * dpr;
                mode = 3;
                pressed = findItem(x, y);
                if (pressed != null && pressed.act == null) pressed = null;
                invalidate();
                return true;
            }
            case MotionEvent.ACTION_MOVE: {
                float dx = x - lastX, dy = y - lastY;
                if (mode == 3) {
                    if (Math.abs(x - downX) > slop || Math.abs(y - downY) > slop) {
                        pressed = null;
                        mode = inHead ? (inChips ? 2 : 0) : 1;                  // 머리는 칩 줄만 가로로 민다(안내 상자·검색줄은 고정)
                        if (inHead && Math.abs(y - downY) > Math.abs(x - downX) * 2f) mode = 0;     // 머리를 위아래로 쓸면 무시
                        if (mode == 1) blurInput();                                              // 목록을 밀기 시작하면 키보드를 내린다
                    } else return true;
                }
                if (mode == 1) { scrollY = ScreenCore.clamp(scrollY - dy / dpr, lay.bodyMaxScroll(bodyViewH())); lastY = y; invalidate(); }
                else if (mode == 2) { scrollX = ScreenCore.clamp(scrollX - dx / dpr, lay.headMaxScroll()); lastX = x; invalidate(); }
                return true;
            }
            case MotionEvent.ACTION_UP: {
                if (mode == 3) {
                    if (SystemClock.uptimeMillis() - downT < 600 && pressed != null && listener != null) {
                        ScreenCore.Item pi = pressed; ScreenCore.Act a = pi.act; pressed = null; invalidate();
                        if (pi.kind == ScreenCore.K_SEARCH) tapSearch(pi, x / dpr, y / dpr);
                        else { blurInput(); listener.onAction(a); }
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
            case MotionEvent.ACTION_CANCEL: finishTouch(); invalidate(); return true;
            default: return true;
        }
    }
    private void finishTouch() { pressed = null; mode = 0; if (vt != null) { vt.recycle(); vt = null; } }

    private ScreenCore.Item findItem(float px, float py) {
        float x = px / dpr, y = py / dpr;
        if (y < lay.headH) {
            for (ScreenCore.Item it : lay.head) {
                float hx = it.fixed ? x : x + scrollX;
                if (hx >= it.x && hx < it.x + it.w && y >= it.y && y < it.y + it.h) return it;
            }
            return null;
        }
        float by = y - lay.headH + scrollY;
        int[] r = lay.bodyRange(by, by + 0.01f);
        for (int i = r[0]; i < r[1]; i++) { ScreenCore.Item it = lay.body[i]; if (x >= it.x && x < it.x + it.w && by >= it.y && by < it.y + it.h) return it; }
        return null;
    }

    // ───────────── 그리기 ─────────────
    private float base(float top, float h, int i) {
        Paint.FontMetrics fm = tp.getFontMetrics();
        return top + (h - (fm.descent - fm.ascent)) / 2f - fm.ascent;
    }
    private void setText(float size, boolean bold, int color) {
        tp.setTypeface(bold ? Typeface.DEFAULT_BOLD : Typeface.DEFAULT);
        tp.setTextSize(size); tp.setColor(color); tp.setTextAlign(Paint.Align.LEFT);
    }
    private static int alpha(int c, float a) { return ((int) (((c >>> 24) & 0xFF) * a) << 24) | (c & 0xFFFFFF); }
    private int roleColor(String r) {
        if ("bg".equals(r)) return pal[R_BG]; if ("card".equals(r)) return pal[R_CARD]; if ("border".equals(r)) return pal[R_BORDER];
        if ("text".equals(r)) return pal[R_TEXT]; if ("sub".equals(r)) return pal[R_SUB]; if ("gold".equals(r)) return pal[R_GOLD];
        if ("orange".equals(r)) return pal[R_ORANGE]; if ("imgbg".equals(r)) return pal[R_IMGBG]; if ("white".equals(r)) return pal[R_WHITE];
        return 0;
    }

    @Override protected void onDraw(Canvas cv) {
        long now = SystemClock.uptimeMillis();
        lastDraw = now;
        p.setStyle(Paint.Style.FILL); p.setColor(pal[R_BG]);
        cv.drawRect(0, 0, getWidth(), getHeight(), p);
        if (lay == null) return;
        boolean moving = false;
        if (flingY.computeScrollOffset()) { scrollY = ScreenCore.clamp(flingY.getCurrY() / dpr, lay.bodyMaxScroll(bodyViewH())); moving = true; }
        if (flingX.computeScrollOffset()) { scrollX = ScreenCore.clamp(flingX.getCurrX() / dpr, lay.headMaxScroll()); moving = true; }

        cv.save();
        cv.scale(dpr, dpr);
        float w = getWidth() / dpr, h = getHeight() / dpr;
        // 본문(머리 아래로 잘라서)
        cv.save();
        cv.clipRect(0f, lay.headH, w, h);
        cv.translate(0f, lay.headH - scrollY);
        int[] r = lay.bodyRange(scrollY - 4f, scrollY + (h - lay.headH) + 4f);
        for (int i = r[0]; i < r[1]; i++) drawItem(cv, lay.body[i]);
        cv.restore();
        // 머리(위에 고정, 본문 위에 덮음)
        p.setStyle(Paint.Style.FILL); p.setColor(pal[R_BG]);
        cv.drawRect(0f, 0f, w, lay.headH, p);
        cv.save();
        cv.clipRect(0f, 0f, w, lay.headH);
        for (int i = 0; i < lay.head.length; i++) { ScreenCore.Item it = lay.head[i]; if (it.fixed) drawItem(cv, it); }      // 안내 상자·검색줄(고정)
        cv.translate(-scrollX, 0f);
        float x0 = scrollX - 4f, x1 = scrollX + w + 4f;
        for (int i = 0; i < lay.head.length; i++) { ScreenCore.Item it = lay.head[i]; if (!it.fixed && it.x + it.w >= x0 && it.x <= x1) drawItem(cv, it); }   // 칩 줄(가로로 밀림)
        cv.restore();
        cv.restore();

        if (!drewOnce) { drewOnce = true; post(firstDrawCb); }
        if (moving || mode == 1 || mode == 2) postInvalidateOnAnimation();
    }

    private void drawItem(Canvas cv, ScreenCore.Item it) {
        switch (it.kind) {
            case ScreenCore.K_CHIP: drawChip(cv, it); break;
            case ScreenCore.K_CARD: drawCard(cv, it); break;
            case ScreenCore.K_TEXT: drawTextBlock(cv, it); break;
            case ScreenCore.K_BUTTON: drawButton(cv, it); break;
            case ScreenCore.K_BOX: drawBox(cv, it); break;
            case ScreenCore.K_SEARCH: drawSearch(cv, it); break;
            default: break;
        }
    }

    private void drawChip(Canvas cv, ScreenCore.Item it) {
        float rad = it.h / 2f;
        int border = it.on ? pal[R_ORANGE] : 0x738C8C8C;
        rf.set(it.x, it.y, it.x + it.w, it.y + it.h);
        if (it.on) { p.setStyle(Paint.Style.FILL); p.setColor(pal[R_ORANGE]); cv.drawRoundRect(rf, rad, rad, p); }
        p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(border);
        rf2.set(it.x + 0.5f, it.y + 0.5f, it.x + it.w - 0.5f, it.y + it.h - 0.5f);
        cv.drawRoundRect(rf2, rad - 0.5f, rad - 0.5f, p);
        p.setStyle(Paint.Style.FILL);
        int fg = it.on ? pal[R_WHITE] : pal[R_TEXT];
        setText(12f, true, fg);
        float b = base(it.y, it.h, 0);
        cv.drawText(it.label, it.x + ScreenCore.CHIP_PADX, b, tp);
        if (it.badge.length() > 0) {
            tp.setColor(alpha(fg, 0.7f));
            cv.drawText(it.badge, it.x + ScreenCore.CHIP_PADX + it.labelW + 6f, b, tp);
        }
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
        p.setStyle(Paint.Style.FILL); p.setColor(pal[R_CARD]);
        cv.drawRoundRect(rf, 12f, 12f, p);
        if (it == pressed) { p.setColor(0x14808080); cv.drawRoundRect(rf, 12f, 12f, p); }
        p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(pal[R_BORDER]);
        rf2.set(it.x + 0.5f, it.y + 0.5f, it.x + it.w - 0.5f, it.y + it.h - 0.5f);
        cv.drawRoundRect(rf2, 11.5f, 11.5f, p);
        p.setStyle(Paint.Style.FILL);
        setText(it.size, false, pal[R_SUB]); tp.setTextAlign(Paint.Align.CENTER);
        cv.drawText(it.lines.length > 0 ? it.lines[0] : it.label, it.x + it.w / 2f, base(it.y, it.h, 0), tp);
        tp.setTextAlign(Paint.Align.LEFT);
    }

    /** 굵은 구간이 섞인 글: 줄마다 조각을 차례로 그린다(새 글자·객체를 만들지 않는다 — 조각은 배치 때 미리 나눠 뒀다). */
    private void drawRich(Canvas cv, ScreenCore.Item it, float x0, float y0, int color) {
        for (int k = 0; k < it.segs.length; k++) {
            float x = x0, b = -1f;
            for (int q = 0; q < it.segs[k].length; q++) {
                setText(it.size, it.segBold[k][q], color);
                if (b < 0f) b = base(y0 + k * it.lineH, it.lineH, k);
                cv.drawText(it.segs[k][q], x, b, tp);
                x += tp.measureText(it.segs[k][q]);
            }
        }
    }

    private void drawBox(Canvas cv, ScreenCore.Item it) {
        rf.set(it.x, it.y, it.x + it.w, it.y + it.h);
        if (it.fillRole != null || it.fillC != 0) {
            p.setStyle(Paint.Style.FILL); p.setColor(it.fillRole != null ? roleColor(it.fillRole) : it.fillC);
            cv.drawRoundRect(rf, it.radius, it.radius, p);
        }
        if (it.lineRole != null || it.lineC != 0) {
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(1f); p.setColor(it.lineRole != null ? roleColor(it.lineRole) : it.lineC);
            rf2.set(it.x + 0.5f, it.y + 0.5f, it.x + it.w - 0.5f, it.y + it.h - 0.5f);
            cv.drawRoundRect(rf2, it.radius - 0.5f, it.radius - 0.5f, p);
            p.setStyle(Paint.Style.FILL);
        }
        int c = roleColor(it.color);
        setText(it.size, it.bold, c);
        if (it.segs != null) { drawRich(cv, it, it.textX, it.textY, c); return; }
        for (int k = 0; k < it.lines.length; k++) cv.drawText(it.lines[k], it.textX, base(it.textY + k * it.lineH, it.lineH, k), tp);
    }

    private void drawSearch(Canvas cv, ScreenCore.Item it) {
        int accent = it.accentRole != null ? roleColor(it.accentRole) : it.accentC;
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

    // ───────────── 검색 입력칸(진짜 EditText) ─────────────
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
        e.setTextSize(TypedValue.COMPLEX_UNIT_DIP, 13f);
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
        if (input == null || !input.hasFocus()) return;
        try { ((InputMethodManager) getContext().getSystemService(Context.INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(input.getWindowToken(), 0); } catch (Throwable ignored) { }
        input.clearFocus();
    }
    private void hideInput() {
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
    private final Runnable syncRun = new Runnable() { @Override public void run() { syncQ = false; syncInput(); } };
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
        if (input != null) { blurInput(); if (input.getParent() instanceof ViewGroup) ((ViewGroup) input.getParent()).removeView(input); inShown = false; inL = inT = inW = inH = -1; }
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

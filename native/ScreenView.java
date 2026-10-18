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
import android.text.TextPaint;
import android.util.LruCache;
import android.view.MotionEvent;
import android.view.VelocityTracker;
import android.view.View;
import android.view.ViewConfiguration;
import android.widget.OverScroller;

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
 *   · 머리(칩 줄)는 위에 고정, 가로로 밀린다. 본문은 세로로 밀린다 — 손가락 따라가기 + 관성(OverScroller) + 화면 박자(postInvalidateOnAnimation).
 *   · 그릴 때 새로 만드는 객체가 없다(Paint·RectF·Path 재사용). 화면 밖 조각은 이진 탐색으로 건너뛴다. 그림은 백그라운드에서 받아 LruCache + 파일 캐시에 둔다.
 *   · 좌표는 dp. 그릴 때 밀도(dpr)를 한 번 곱한다. 글자 폭도 같은 Paint 로 잰다.
 */
public class ScreenView extends View {
    public interface Listener {
        void onAction(ScreenCore.Act a);
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
    private boolean inHead;
    private ScreenCore.Item pressed;
    private Listener listener;
    private boolean drewOnce;
    private volatile long lastDraw = 0L;
    private final Handler ui = new Handler(Looper.getMainLooper());
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
    public void setPalette(int[] c) { for (int i = 0; i < pal.length && i < c.length; i++) pal[i] = c[i]; invalidate(); }

    /** 새 화면을 올린다. keepScroll 이면 위치를 유지(같은 목록 갱신), 아니면 맨 위로. */
    public void setScreen(ScreenCore.Screen s, boolean keepScroll) {
        screen = s;
        if (!keepScroll) { scrollY = 0f; scrollX = 0f; }
        flingY.forceFinished(true); flingX.forceFinished(true);
        pressed = null; mode = 0;
        relayout();
    }

    private void relayout() {
        if (screen == null || getWidth() <= 0) { lay = null; invalidate(); return; }
        lay = ScreenCore.layout(screen, getWidth() / dpr, measurer);
        clampScroll();
        invalidate();
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
                        mode = inHead ? 2 : 1;
                        if (inHead && Math.abs(y - downY) > Math.abs(x - downX) * 2f) mode = 0;     // 머리를 위아래로 쓸면 무시
                    } else return true;
                }
                if (mode == 1) { scrollY = ScreenCore.clamp(scrollY - dy / dpr, lay.bodyMaxScroll(bodyViewH())); lastY = y; invalidate(); }
                else if (mode == 2) { scrollX = ScreenCore.clamp(scrollX - dx / dpr, lay.headMaxScroll()); lastX = x; invalidate(); }
                return true;
            }
            case MotionEvent.ACTION_UP: {
                if (mode == 3) {
                    if (SystemClock.uptimeMillis() - downT < 600 && pressed != null && listener != null) { ScreenCore.Act a = pressed.act; pressed = null; invalidate(); listener.onAction(a); }
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
            float hx = x + scrollX;
            for (ScreenCore.Item it : lay.head) if (hx >= it.x && hx < it.x + it.w && y >= it.y && y < it.y + it.h) return it;
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
        cv.translate(-scrollX, 0f);
        int[] hr = lay.headRange(scrollX - 4f, scrollX + w + 4f);
        for (int i = hr[0]; i < hr[1]; i++) drawItem(cv, lay.head[i]);
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

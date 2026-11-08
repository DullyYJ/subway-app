package com.dullyyj.subway;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.SystemClock;

import java.io.InputStream;
import java.util.HashSet;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 가족구성원이 꾸민 길동무 친구들 모습을 부모 앱 홈 장면에서도 그대로 보여 준다(길동무 패밀리 꾸미기와 같은 도감 · 같은 계산).
 *
 * 무엇을 입었는지는 가족구성원 앱이 서버에 올린 저장 글("고른친구,탭;모자,옷,소지품;…(8명)")이고, 몸의 어디에 얼마 크게 놓을지는 도감 엔진(FriendWardrobe)이
 * 계산해 둔다. 여기는 장면 도화지(SceneCv)에 붓질만 한다. 저장 글은 폰에 남겨 두므로 앱을 켜자마자 바로 입은 모습으로 나오고, 서버에서 새로 받으면 바로 바뀐다.
 * 큰 시트는 뒤 스레드에서만 읽는다(주 스레드는 파일을 열지 않는다) — 읽히기 전에는 그림 문장(FriendArt)으로 먼저 그린다.
 */
final class FriendWear implements SceneCore.WearHook {
    static final FriendWear I = new FriendWear();
    private static final int N = 8;

    /** 입은 모습(바뀌지 않는 한 장): 칸마다 그림 문장을 풀어 둔 것. */
    private static final class Look {
        final FriendArt.Op[][] ops = new FriendArt.Op[3][];
        final int[] idx = {-1, -1, -1};
        boolean any() { return ops[0] != null || ops[1] != null || ops[2] != null; }
    }

    private volatile Context app;
    private volatile Look[] looks = new Look[N];
    private volatile boolean anyLook;                           // 입은 것이 하나도 없으면 장면은 여기서 바로 지나간다
    private volatile String cur = "";
    private final ExecutorService ex = Executors.newSingleThreadExecutor();

    private FriendWear() {}

    /** 장면에 입히는 일을 켠다(한 번). 입은 것이 없으면 그릴 때 바로 지나간다. */
    void init(Context c) {
        if (app != null) return;
        app = c.getApplicationContext();
        SceneCore.WEAR_HOOK = this;
    }

    String current() { return cur; }

    /** 저장 글 모양 검사(엔진과 같은 규칙: 고른친구 0~7, 탭 0~2, 그 뒤 8칸 × 모자·옷·소지품 −1~19). 빈 글은 따로 다룬다. */
    static boolean valid(String s) {
        if (s == null || s.length() < 10 || s.length() > 120) return false;
        String[] p = s.split(";", -1);
        if (p.length != N + 1) return false;
        try {
            String[] h = p[0].split(",", -1);
            if (h.length != 2) return false;
            int a = Integer.parseInt(h[0].trim()), b = Integer.parseInt(h[1].trim());
            if (a < 0 || a >= N || b < 0 || b > 2) return false;
            for (int c = 1; c <= N; c++) {
                String[] w = p[c].split(",", -1);
                if (w.length != 3) return false;
                for (String x : w) { int v = Integer.parseInt(x.trim()); if (v < -1 || v >= FriendWardrobe.PER) return false; }
            }
            return true;
        } catch (RuntimeException e) { return false; }
    }

    /**
     * 저장 글을 받아 적용한다. 모양이 틀리면 무시(false). 같으면 아무것도 하지 않는다(false). 바뀌었으면 필요한 시트를 뒤에서 미리 읽어 두고 true.
     * 빈 글은 "아무것도 안 입음".
     */
    boolean apply(String s) {
        if (s == null) return false;
        if (s.equals(cur)) return false;
        Look[] n = new Look[N];
        if (s.length() > 0) {
            try {
                String[] p = s.split(";");
                if (p.length != N + 1) return false;
                for (int c = 0; c < N; c++) {
                    String[] w = p[c + 1].split(",");
                    if (w.length != 3) return false;
                    Look l = new Look();
                    for (int k = 0; k < 3; k++) {
                        int v = Integer.parseInt(w[k].trim());
                        if (v < 0 || v >= FriendWardrobe.PER) continue;
                        l.ops[k] = FriendArt.parse(FriendWardrobe.art(c, k, v));
                        l.idx[k] = v;
                    }
                    n[c] = l.any() ? l : null;
                }
            } catch (RuntimeException e) {
                return false;                                   // 망가진 글은 지금 모습을 그대로 둔다
            }
        }
        retain(n);                                              // 더 이상 안 입는 것의 그림은 놓아 준다(꾸밀 때마다 쌓여 메모리가 커지지 않게)
        looks = n;
        cur = s;
        boolean any = false;
        for (Look l : n) if (l != null) any = true;
        anyLook = any;
        warm(n);
        return true;
    }

    // ───────── 시트 읽기(뒤 스레드) ─────────
    private final ConcurrentHashMap<String, Bitmap> bmp = new ConcurrentHashMap<String, Bitmap>();
    private final ConcurrentHashMap<String, AndroidCv.AImg> aimg = new ConcurrentHashMap<String, AndroidCv.AImg>();
    private final HashSet<String> pending = new HashSet<String>(), missing = new HashSet<String>();
    private final ConcurrentHashMap<Integer, Bitmap> cells = new ConcurrentHashMap<Integer, Bitmap>();      // (친구 · 칸 번호) → 도감 시트에서 오려 둔 칸(0.14MB)

    private static String sheetName(int ci, String suffix) { return FriendWardrobe.IDS[ci] + suffix; }

    /** 새 모습에 쓰이는 그림 이름 · 칸만 남기고 나머지 읽어 둔 것을 버린다. */
    private void retain(Look[] ls) {
        HashSet<String> keep = new HashSet<String>();
        HashSet<Integer> kc = new HashSet<Integer>();
        for (int ci = 0; ci < N; ci++) {
            Look l = ls[ci];
            if (l == null) continue;
            for (int slot = 0; slot < 3; slot++) {
                int i = l.idx[slot];
                if (i < 0) continue;
                if (FriendWardrobe.baked(ci, slot, i)) keep.add(sheetName(ci, "_g" + (slot == 0 ? FriendWardrobe.PER + i : i)));
                else kc.add(ci * 64 + slot * FriendWardrobe.PER + i);
            }
            if (ci == FriendWardrobe.ci("dudung") && l.ops[0] != null) { keep.add("dudung_nh"); keep.add("dudung_act_nh"); }
        }
        for (String k : bmp.keySet()) if (!keep.contains(k)) { bmp.remove(k); aimg.remove(k); }
        for (Integer k : cells.keySet()) if (!kc.contains(k)) { cells.remove(k); aimg.remove("c" + (k / 64) + ":" + (k % 64)); }
    }

    /** 입은 모습에 필요한 시트를 미리 읽어 둔다 — 친구가 나올 때 시트가 읽히는 사이 그림이 바뀌지 않게. */
    private void warm(final Look[] ls) {
        final Context c = app;
        if (c == null) return;
        ex.execute(new Runnable() {
            @Override public void run() {
                for (int ci = 0; ci < N; ci++) {
                    if (ls != looks) return;                            // 그 사이 모습이 또 바뀌었으면 이 읽기는 그만
                    Look l = ls[ci];
                    if (l == null) continue;
                    boolean needAtlas = false;
                    for (int slot = 0; slot < 3; slot++) {
                        int i = l.idx[slot];
                        if (i < 0) continue;
                        if (FriendWardrobe.baked(ci, slot, i)) loadBaked(c, ci, slot == 0 ? FriendWardrobe.PER + i : i);
                        else if (cells.get(ci * 64 + slot * FriendWardrobe.PER + i) == null) needAtlas = true;
                    }
                    if (ci == FriendWardrobe.ci("dudung") && l.ops[0] != null) { kick("dudung_nh"); kick("dudung_act_nh"); }          // 두덩 새 모자: 안전모 없는 시트도 미리
                    if (needAtlas) cutCells(c, ci, l);
                }
            }
        });
    }

    /** 몸에 입혀 구운 옷 한 벌의 시트를 읽는다. 이미 있거나 없는 시트면 false. */
    private boolean loadBaked(Context c, int ci, int bi) {
        String key = sheetName(ci, "_g" + bi);
        if (bmp.containsKey(key)) return false;
        Bitmap b = decode(c, key);
        if (b == null) return false;
        bmp.put(key, b);
        return true;
    }

    /** 구워지지 않은 입을 것: 큰 도감 시트(9MB)에서 필요한 칸만 오려 두고 시트는 바로 버린다(여덟이 모여도 메모리가 넘치지 않게). */
    private boolean cutCells(Context c, int ci, Look l) {
        Bitmap at = decode(c, sheetName(ci, ""));
        if (at == null) return false;
        boolean any = false;
        try {
            int g = FriendWardrobe.GRID, cs = FriendWardrobe.CELL;
            for (int slot = 0; slot < 3; slot++) {
                int i = l.idx[slot];
                if (i < 0 || FriendWardrobe.baked(ci, slot, i)) continue;
                int q = slot * FriendWardrobe.PER + i, x = (q % g) * cs, y = (q / g) * cs;
                if (x + cs > at.getWidth() || y + cs > at.getHeight()) continue;
                if (cells.get(ci * 64 + q) != null) continue;
                try { cells.put(ci * 64 + q, Bitmap.createBitmap(at, x, y, cs, cs)); any = true; } catch (Throwable ignored) { }
            }
        } finally {
            try { at.recycle(); } catch (Throwable ignored) { }
        }
        return any;
    }

    private Bitmap decode(Context c, String name) {
        synchronized (this) { if (missing.contains(name)) return null; }
        InputStream in = null;
        try {
            in = c.getAssets().open("wear/" + name + ".webp");
            BitmapFactory.Options o = new BitmapFactory.Options();
            o.inScaled = false; o.inPreferredConfig = Bitmap.Config.ARGB_8888;
            Bitmap b = BitmapFactory.decodeStream(in, null, o);
            if (b == null) synchronized (this) { missing.add(name); }
            return b;
        } catch (Throwable t) {
            synchronized (this) { missing.add(name); }
            return null;
        } finally {
            try { if (in != null) in.close(); } catch (Throwable ignored) { }
        }
    }

    /** 읽혀 있는 시트를 그림 객체로(없으면 null · 읽는 중이 아니면 뒤에서 읽기 시작). 주 스레드에서만 부른다. */
    private AndroidCv.AImg img(String key, Bitmap b) {
        if (b == null) return null;
        AndroidCv.AImg a = aimg.get(key);
        if (a == null || a.bmp != b) { a = new AndroidCv.AImg(b); aimg.put(key, a); }
        return a;
    }

    private AndroidCv.AImg bakedImg(int ci, int bi) {
        String key = sheetName(ci, "_g" + bi);
        Bitmap b = bmp.get(key);
        if (b == null) { kick(key); return null; }
        return img(key, b);
    }

    private AndroidCv.AImg cellImg(int ci, int q) {
        Bitmap b = cells.get(ci * 64 + q);
        return b == null ? null : img("c" + ci + ":" + q, b);
    }

    /** 이 이름의 시트를 뒤에서 한 번 읽어 둔다(이미 읽는 중 · 없는 시트면 아무것도 안 함). */
    private void kick(final String key) {
        final Context c = app;
        if (c == null) return;
        synchronized (this) { if (pending.contains(key) || missing.contains(key)) return; pending.add(key); }
        ex.execute(new Runnable() {
            @Override public void run() {
                Bitmap b = bmp.containsKey(key) ? null : decode(c, key);
                if (b != null) bmp.put(key, b);
                synchronized (FriendWear.this) { pending.remove(key); }
            }
        });
    }

    /** 두덩이 새 모자를 쓰면 안전모가 없는 시트(wear/dudung_nh · dudung_act_nh)로 그린다(안전모 위에 겹쳐 보이지 않게). 읽히기 전이면 null → 원래 시트. */
    @Override public SceneCv.Img nh(String id, boolean act) {
        if (!anyLook || !"dudung".equals(id)) return null;
        Look[] ls = looks;
        int ci = FriendWardrobe.ci("dudung");
        if (ci < 0 || ls[ci] == null || ls[ci].ops[0] == null) return null;
        String key = act ? "dudung_act_nh" : "dudung_nh";
        Bitmap b = bmp.get(key);
        if (b == null) { kick(key); return null; }
        return img(key, b);
    }

    // ───────── 그리기 ─────────
    private static final class Pen implements FriendArt.Pen {
        SceneCv c;
        @Override public void begin() { c.beginPath(); }
        @Override public void move(float x, float y) { c.moveTo(x, y); }
        @Override public void line(float x, float y) { c.lineTo(x, y); }
        @Override public void quad(float cx, float cy, float x, float y) { c.quadTo(cx, cy, x, y); }
        @Override public void close() { c.closePath(); }
        @Override public void oval(float cx, float cy, float rx, float ry) { c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); }
        @Override public void fill(int argb) { c.fillStyle(argb); c.fill(); }
        @Override public void stroke(int argb, float w) { c.strokeStyle(argb); c.lineWidth(w); c.stroke(); }
    }

    private final Pen pen = new Pen();
    private final float[] o = new float[4], sp = new float[3], st = new float[8 * FriendWardrobe.NS];
    private final int[] wt = new int[6];

    /** kind: 0 걷기 · 1 자세 · 2 동작 시트. (dx, dy) = 칸 왼쪽 위(변환된 자리), sc = 칸 한 픽셀의 장면 크기. */
    @Override public void draw(SceneCv c, SceneCore.Actor a, int kind, int idx, double dx, double dy, double sc) {   // sc = 칸 한 픽셀(256 기준)의 장면 크기
        if (!anyLook || a == null || a.intro || a.heart > 0 || a.id == null) return;
        Look[] ls = looks;
        int ci = FriendWardrobe.ci(a.id);
        if (ci < 0 || ci >= N) return;
        Look lk = ls[ci];
        if (lk == null) return;
        pen.c = c;
        c.lineCapRound(true);
        for (int n = 0; n < 3; n++) {
            int slot = n == 0 ? 1 : n == 1 ? 2 : 0;          // 옷 → 소지품 → 모자
            FriendArt.Op[] ops = lk.ops[slot];
            if (ops == null || !(slot == 2 ? FriendWardrobe.floatAt(ci, kind, idx, SystemClock.uptimeMillis(), o) : FriendWardrobe.place(ci, kind, idx, slot, o))) continue;
            int i = lk.idx[slot];
            if (FriendWardrobe.sprite(ci, slot, i, sp)) {
                int bi = slot == 0 ? FriendWardrobe.PER + i : i;         // 구운 모자는 번호 20 + 모자 번호
                AndroidCv.AImg wi = FriendWardrobe.baked(ci, slot, i) ? bakedImg(ci, bi) : null;
                if (wi != null && FriendWardrobe.wornTile(ci, kind, idx, bi, wt)) {
                    c.drawImage(wi, wt[0], wt[1], wt[2], wt[3], dx + wt[4] * sc, dy + wt[5] * sc, wt[2] * sc, wt[3] * sc);
                    continue;
                }
                AndroidCv.AImg at = cellImg(ci, slot * FriendWardrobe.PER + i);
                if (at == null) {
                    FriendArt.draw(pen, ops, (float) (dx + o[0] * sc), (float) (dy + o[1] * sc), (float) (o[2] * sc));          // 시트가 읽히는 동안은 그림 문장으로
                    continue;
                }
                int nn = FriendWardrobe.strips(ci, kind, idx, slot, i, o[0], o[1], o[2], st);
                float tilt = slot == 0 ? FriendWardrobe.hatTilt(ci, kind, idx) : slot == 2 ? o[3] : 0f;
                boolean rot = tilt != 0f && nn > 0;
                if (rot) {
                    double px = dx + (st[4] + st[6]) * 0.5 * sc, py = dy + (st[5] + (st[7] - st[5]) * (slot == 2 ? 0.5 : 0.8)) * sc;
                    c.save(); c.translate(px, py); c.rotate(tilt); c.translate(-px, -py);
                }
                for (int j = 0; j < nn; j++) {
                    int q = j * 8;
                    c.drawImage(at, (int) st[q], (int) st[q + 1], (int) st[q + 2] - (int) st[q], (int) st[q + 3] - (int) st[q + 1],
                        dx + st[q + 4] * sc, dy + st[q + 5] * sc, (st[q + 6] - st[q + 4]) * sc, (st[q + 7] - st[q + 5]) * sc);
                }
                if (rot) c.restore();
            } else {
                FriendArt.draw(pen, ops, (float) (dx + o[0] * sc), (float) (dy + o[1] * sc), (float) (o[2] * sc));
            }
        }
    }
}

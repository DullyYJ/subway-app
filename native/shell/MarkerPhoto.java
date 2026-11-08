package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import android.content.ContentResolver;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.net.Uri;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 가족구성원 마커 사진 보관(이 폰 안에만): files/markers/<열쇠>.png — 동그랗게 잘린 작은 그림 하나. 지도는 그릴 때마다 get() 으로 꺼내 쓴다(메모리에 올려 둔 것만 — 그릴 때 파일을 읽지 않는다).
 * 사진을 고르는 곳 · 자르는 곳은 KidsHub / MarkerCropDialog.
 */
final class MarkerPhoto {
    private MarkerPhoto() { }
    static final int OUT = 160;                                            // 저장하는 한 변(px) — 지도 마커(약 38dp)보다 넉넉히 크다
    private static final ConcurrentHashMap<String, Bitmap> CACHE = new ConcurrentHashMap<String, Bitmap>();
    private static volatile File dir;

    /** 앱을 켤 때 한 번: 저장된 그림들을 뒤 스레드에서 메모리로. */
    static void init(Context c) {
        if (dir != null) return;
        dir = new File(c.getFilesDir(), "markers");
        new Thread(new Runnable() { @Override public void run() {
            try {
                File[] fs = dir.listFiles();
                if (fs == null) return;
                for (File f : fs) {
                    String n = f.getName();
                    if (!n.endsWith(".png")) continue;
                    Bitmap b = BitmapFactory.decodeFile(f.getPath());
                    if (b != null) CACHE.put(n.substring(0, n.length() - 4), b);
                }
            } catch (Throwable ignored) { }
        } }, "marker-load").start();
    }

    /** 지도가 쓴다 — 없으면 null(기본 점). */
    static Bitmap get(String key) { return key == null || key.length() == 0 ? null : CACHE.get(key); }

    static boolean put(String key, Bitmap circle) {
        if (dir == null || key == null || key.length() == 0 || circle == null) return false;
        try {
            dir.mkdirs();
            FileOutputStream o = new FileOutputStream(new File(dir, key + ".png"));
            try { circle.compress(Bitmap.CompressFormat.PNG, 100, o); } finally { o.close(); }
            CACHE.put(key, circle);
            return true;
        } catch (Throwable t) { return false; }
    }

    static void clear(String key) {
        if (key == null || key.length() == 0) return;
        CACHE.remove(key);
        try { if (dir != null) new File(dir, key + ".png").delete(); } catch (Throwable ignored) { }
    }

    /** 고른 사진을 한 변 maxSide 안으로 줄여 읽고 EXIF 방향대로 돌린다. 못 읽으면 null. */
    static Bitmap decode(ContentResolver cr, Uri u, int maxSide) {
        try {
            BitmapFactory.Options o = new BitmapFactory.Options();
            o.inJustDecodeBounds = true;
            InputStream in = cr.openInputStream(u);
            if (in == null) return null;
            try { BitmapFactory.decodeStream(in, null, o); } finally { in.close(); }
            if (o.outWidth <= 0 || o.outHeight <= 0) return null;
            int ss = 1;
            while (Math.max(o.outWidth, o.outHeight) / (ss * 2) >= maxSide) ss *= 2;
            BitmapFactory.Options o2 = new BitmapFactory.Options();
            o2.inSampleSize = ss;
            in = cr.openInputStream(u);
            if (in == null) return null;
            Bitmap b;
            try { b = BitmapFactory.decodeStream(in, null, o2); } finally { in.close(); }
            if (b == null) return null;
            int rot = 0;
            if (android.os.Build.VERSION.SDK_INT >= 24) {
                try {
                    InputStream ei = cr.openInputStream(u);
                    if (ei != null) {
                        try {
                            int ori = new android.media.ExifInterface(ei).getAttributeInt(android.media.ExifInterface.TAG_ORIENTATION, 1);
                            rot = ori == 6 ? 90 : (ori == 3 ? 180 : (ori == 8 ? 270 : 0));
                        } finally { ei.close(); }
                    }
                } catch (Throwable ignored) { /* 방향을 모르면 그대로 */ }
            }
            if (rot != 0) {
                Matrix m = new Matrix(); m.postRotate(rot);
                Bitmap r = Bitmap.createBitmap(b, 0, 0, b.getWidth(), b.getHeight(), m, true);
                if (r != b) b.recycle();
                b = r;
            }
            return b;
        } catch (Throwable t) { return null; }
    }
}

package com.dullyyj.subway;   // ★ 앱 패키지와 같아야 한다

import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 움직이는 GIF 만들기(순수 자바 — 안드로이드 없음, JVM 에서 시험한다). 프레임은 ARGB 정수 배열.
 *  · 색 256개: 0번은 투명(알파 128 미만), 나머지는 호출한 쪽이 꼭 지킬 색(fixed)을 먼저 넣고 남은 칸을 샘플 프레임의 색 분포(중앙값 분할)로 채운다.
 *  · 프레임은 앞 프레임과 달라진 네모만 담는다(disposal 1) — 카드 그림처럼 거의 안 변하는 장면이 아주 작아진다.
 *  · 무한 반복(NETSCAPE2.0). 지연은 1/100초 단위.
 */
final class GifEnc {
    private GifEnc() { }

    /** frames: 같은 크기(w×h)의 ARGB 배열들. fixed: 팔레트에 그대로 넣을 0xRRGGBB 색(최대 16). */
    static byte[] encode(int w, int h, List<int[]> frames, int delayCs, int[] fixed) {
        if (w <= 0 || h <= 0 || frames.isEmpty()) throw new IllegalArgumentException("size");
        int[] pal = palette(frames, w * h, fixed);
        List<byte[]> idx = new ArrayList<byte[]>();
        Map<Integer, Byte> cache = new HashMap<Integer, Byte>();
        for (int[] f : frames) idx.add(index(f, pal, cache));
        ByteArrayOutputStream o = new ByteArrayOutputStream(1 << 16);
        o.write('G'); o.write('I'); o.write('F'); o.write('8'); o.write('9'); o.write('a');
        w16(o, w); w16(o, h);
        o.write(0xF7); o.write(0); o.write(0);                       // 전역 색 표(256) · 배경 0 · 비율 0
        for (int i = 0; i < 256; i++) { int c = pal[i]; o.write((c >> 16) & 255); o.write((c >> 8) & 255); o.write(c & 255); }
        o.write(0x21); o.write(0xFF); o.write(11); for (char ch : "NETSCAPE2.0".toCharArray()) o.write(ch); o.write(3); o.write(1); w16(o, 0); o.write(0);   // 무한 반복
        byte[] prev = null;
        for (byte[] cur : idx) {
            int x0 = 0, y0 = 0, x1 = w - 1, y1 = h - 1;
            if (prev != null) {
                x0 = w; y0 = h; x1 = -1; y1 = -1;
                for (int y = 0; y < h; y++) { int row = y * w; for (int x = 0; x < w; x++) if (cur[row + x] != prev[row + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
                if (x1 < 0) { x0 = 0; y0 = 0; x1 = 0; y1 = 0; }           // 안 변해도 지연을 세려면 한 칸짜리 프레임이 필요하다
            }
            int rw = x1 - x0 + 1, rh = y1 - y0 + 1;
            o.write(0x21); o.write(0xF9); o.write(4); o.write((1 << 2) | 1); w16(o, Math.max(2, delayCs)); o.write(0); o.write(0);   // disposal 1 · 투명 있음(0번)
            o.write(0x2C); w16(o, x0); w16(o, y0); w16(o, rw); w16(o, rh); o.write(0);
            byte[] px = new byte[rw * rh];
            for (int y = 0; y < rh; y++) System.arraycopy(cur, (y0 + y) * w + x0, px, y * rw, rw);
            lzw(o, px);
            prev = cur;
        }
        o.write(0x3B);
        return o.toByteArray();
    }

    private static void w16(ByteArrayOutputStream o, int v) { o.write(v & 255); o.write((v >> 8) & 255); }

    // ───────── 색 ─────────
    /** 256색 팔레트(0xRRGGBB): [0] 투명 자리, [1..] fixed 다음 중앙값 분할 색. */
    static int[] palette(List<int[]> frames, int n, int[] fixed) {
        int[] pal = new int[256]; int used = 1;
        if (fixed != null) for (int c : fixed) { if (used >= 17) break; pal[used++] = c & 0xFFFFFF; }
        // 샘플 프레임(고르게 최대 8장)의 색을 5비트씩으로 모아 센다
        int step = Math.max(1, frames.size() / 8);
        long[] cnt = new long[32768], sr = new long[32768], sg = new long[32768], sb = new long[32768];
        for (int fi = 0; fi < frames.size(); fi += step) {
            int[] f = frames.get(fi);
            for (int i = 0; i < n; i++) {
                int c = f[i]; if (((c >>> 24) & 255) < 128) continue;
                int r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255, k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
                cnt[k]++; sr[k] += r; sg[k] += g; sb[k] += b;
            }
        }
        List<int[]> boxes = new ArrayList<int[]>();                          // 각 상자 = 색 번호 목록
        int[] all = new int[32768]; int m = 0; for (int k = 0; k < 32768; k++) if (cnt[k] > 0) all[m++] = k;
        if (m == 0) return pal;
        boxes.add(java.util.Arrays.copyOf(all, m));
        int want = 256 - used;
        while (boxes.size() < want) {
            int best = -1; long bestN = 1;
            for (int i = 0; i < boxes.size(); i++) { int[] b = boxes.get(i); if (b.length < 2) continue; long tot = 0; for (int k : b) tot += cnt[k]; if (tot > bestN) { bestN = tot; best = i; } }
            if (best < 0) break;
            int[] b = boxes.remove(best);
            int rMin = 31, rMax = 0, gMin = 31, gMax = 0, bMin = 31, bMax = 0;
            for (int k : b) { int r = k >> 10, g = (k >> 5) & 31, bl = k & 31; rMin = Math.min(rMin, r); rMax = Math.max(rMax, r); gMin = Math.min(gMin, g); gMax = Math.max(gMax, g); bMin = Math.min(bMin, bl); bMax = Math.max(bMax, bl); }
            final int ch = (rMax - rMin >= gMax - gMin && rMax - rMin >= bMax - bMin) ? 0 : (gMax - gMin >= bMax - bMin ? 1 : 2);
            Integer[] bo = new Integer[b.length]; for (int i = 0; i < b.length; i++) bo[i] = b[i];
            java.util.Arrays.sort(bo, new java.util.Comparator<Integer>() { @Override public int compare(Integer a, Integer c) { return Integer.compare(comp(a, ch), comp(c, ch)); } });
            long tot = 0; for (int k : b) tot += cnt[k];
            long acc = 0; int cut = 0; for (int i = 0; i < bo.length; i++) { acc += cnt[bo[i]]; cut = i + 1; if (acc * 2 >= tot) break; }
            cut = Math.max(1, Math.min(b.length - 1, cut));
            int[] lo = new int[cut], hi = new int[b.length - cut];
            for (int i = 0; i < cut; i++) lo[i] = bo[i]; for (int i = cut; i < b.length; i++) hi[i - cut] = bo[i];
            boxes.add(lo); boxes.add(hi);
        }
        for (int[] b : boxes) {
            if (used >= 256) break;
            long c = 0, r = 0, g = 0, bl = 0; for (int k : b) { c += cnt[k]; r += sr[k]; g += sg[k]; bl += sb[k]; }
            if (c == 0) continue;
            pal[used++] = (int) ((r / c) << 16 | (g / c) << 8 | (bl / c));
        }
        return pal;
    }
    private static int comp(int k, int ch) { return ch == 0 ? k >> 10 : (ch == 1 ? (k >> 5) & 31 : k & 31); }

    /** 프레임 → 팔레트 번호. 알파 128 미만은 0(투명). 같은 색은 한 번만 가장 가까운 색을 찾는다. */
    static byte[] index(int[] f, int[] pal, Map<Integer, Byte> cache) {
        byte[] out = new byte[f.length]; int lastC = 0, last = 0; boolean has = false;
        for (int i = 0; i < f.length; i++) {
            int c = f[i];
            if (((c >>> 24) & 255) < 128) { out[i] = 0; continue; }
            c &= 0xFFFFFF;
            if (has && c == lastC) { out[i] = (byte) last; continue; }
            Byte q = cache.get(c);
            if (q == null) { q = (byte) nearest(pal, c); cache.put(c, q); }
            lastC = c; last = q & 255; has = true; out[i] = q;
        }
        return out;
    }
    private static int nearest(int[] pal, int c) {
        int r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255, best = 1; long bd = Long.MAX_VALUE;
        for (int i = 1; i < 256; i++) {
            int p = pal[i]; if (p == 0 && i > 1 && pal[i] == 0) continue;
            int dr = r - ((p >> 16) & 255), dg = g - ((p >> 8) & 255), db = b - (p & 255);
            long d = 2L * dr * dr + 4L * dg * dg + 3L * db * db;          // 눈이 초록에 더 민감하다
            if (d < bd) { bd = d; best = i; if (d == 0) break; }
        }
        return best;
    }

    // ───────── LZW ─────────
    /** GIF 비트 묶음 쓰기: 낮은 비트부터 채우고 255바이트씩 블록으로 낸다. */
    private static final class Bits {
        final ByteArrayOutputStream o; final byte[] blk = new byte[255]; int n; long buf; int nb;
        Bits(ByteArrayOutputStream o) { this.o = o; }
        void put(int code, int bits) { buf |= (long) code << nb; nb += bits; while (nb >= 8) { byteOut((int) (buf & 255)); buf >>= 8; nb -= 8; } }
        void byteOut(int b) { blk[n++] = (byte) b; if (n == 255) { o.write(255); o.write(blk, 0, 255); n = 0; } }
        void finish() { if (nb > 0) byteOut((int) (buf & 255)); buf = 0; nb = 0; if (n > 0) { o.write(n); o.write(blk, 0, n); n = 0; } o.write(0); }
    }
    private static void lzw(ByteArrayOutputStream o, byte[] px) {
        final int minBits = 8, clear = 1 << minBits, eoi = clear + 1, HS = 8192;
        o.write(minBits);
        Bits bw = new Bits(o);
        int[] hk = new int[HS], hv = new int[HS]; java.util.Arrays.fill(hk, -1);
        int next = eoi + 1, bits = minBits + 1;
        bw.put(clear, bits);
        int code = px[0] & 255;
        for (int i = 1; i < px.length; i++) {
            int c = px[i] & 255, key = (code << 8) | c, h = (key * 0x9E3779B1) >>> 19, found = -1;
            while (hk[h] != -1) { if (hk[h] == key) { found = hv[h]; break; } h = (h + 1) & (HS - 1); }
            if (found >= 0) { code = found; continue; }
            bw.put(code, bits);
            if (next < 4096) { hk[h] = key; hv[h] = next++; if (next - 1 == (1 << bits) && bits < 12) bits++; }
            else { bw.put(clear, bits); java.util.Arrays.fill(hk, -1); next = eoi + 1; bits = minBits + 1; }
            code = c;
        }
        bw.put(code, bits);
        bw.put(eoi, bits);
        bw.finish();
    }
}

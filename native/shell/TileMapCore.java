package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import java.util.ArrayList;
import java.util.List;

/**
 * 타일 지도 계산 — 순수 자바(안드로이드·네트워크·시계 없음). JVM 에서 시험한다.
 * 지도 위에 무엇을 찍을지(핀의 좌표·번호·이름)는 엔진이 정해 글로 준다. 여기는 그 좌표를 화면 픽셀로 바꾸고 어떤 타일이 필요한지 셀 뿐이다.
 * 좌표계: 웹 메르카토르(256px 타일), 줌은 소수까지 쓴다(타일은 가장 가까운 정수 줌의 것을 늘이거나 줄여 그린다).
 */
public final class TileMapCore {
    private TileMapCore() { }

    public static final int T = 256, MAX_PINS = 40, MAX_Z = 19;
    public static final double MIN_ZOOM = 2.0, MAX_ZOOM = 19.0, MAX_LAT = 85.0;

    /** 핀: k = s(정류장·장소) · m(내 위치) · f(고른 것), n = 핀 안 글자(번호), name = 이름. */
    public static final class Pin { public double la, lo; public String k = "s", n = "", name = "", v = "", g = ""; }   // v = 핀을 눌렀을 때 부를 행동 · g = 같이 움직일 카드의 열쇠(엔진이 정함)

    private static String clean(String s, int max) {
        if (s == null) return "";
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < s.length() && b.length() < max; i++) {
            char c = s.charAt(i);
            if (c == '|' || c == ',' || c < 0x20) continue;
            b.append(c);
        }
        return b.toString().trim();
    }
    /** 핀 하나를 글로("la,lo,k,n,name") — 화면 노드 값으로 쓴다. */
    public static String encodePin(double la, double lo, String k, String n, String name) { return encodePin(la, lo, k, n, name, "", ""); }
    public static String encodePin(double la, double lo, String k, String n, String name, String v, String g) {
        String kk = "m".equals(k) || "f".equals(k) ? k : "s";
        return la + "," + lo + "," + kk + "," + clean(n, 4) + "," + clean(name, 24) + "," + clean(v, 40) + "," + clean(g, 40);
    }
    /** encodePin 들을 '|' 로 이은 글을 핀 목록으로. 모양이 이상한 줄은 건너뛴다. */
    public static List<Pin> parsePins(String enc) {
        List<Pin> out = new ArrayList<Pin>();
        if (enc == null || enc.length() == 0) return out;
        for (String part : enc.split("\\|", -1)) {
            String[] f = part.split(",", -1);
            if (f.length < 3) continue;
            try {
                Pin p = new Pin();
                p.la = Double.parseDouble(f[0]); p.lo = Double.parseDouble(f[1]);
                if (!(Math.abs(p.la) <= MAX_LAT) || !(Math.abs(p.lo) <= 180.0) || (p.la == 0.0 && p.lo == 0.0)) continue;
                p.k = "m".equals(f[2]) || "f".equals(f[2]) ? f[2] : "s";
                p.n = f.length > 3 ? f[3] : ""; p.name = f.length > 4 ? f[4] : ""; p.v = f.length > 5 ? f[5] : ""; p.g = f.length > 6 ? f[6] : "";
                out.add(p);
                if (out.size() >= MAX_PINS) break;
            } catch (NumberFormatException e) { /* 건너뜀 */ }
        }
        return out;
    }

    // ── 메르카토르 ──
    public static double worldSize(double z) { return T * Math.pow(2.0, z); }
    public static double xOf(double lo, double z) { return (lo + 180.0) / 360.0 * worldSize(z); }
    public static double yOf(double la, double z) {
        double l = Math.max(-MAX_LAT, Math.min(MAX_LAT, la)) * Math.PI / 180.0;
        return (1.0 - Math.log(Math.tan(l) + 1.0 / Math.cos(l)) / Math.PI) / 2.0 * worldSize(z);
    }
    public static double loOf(double x, double z) { return x / worldSize(z) * 360.0 - 180.0; }
    public static double laOf(double y, double z) {
        double n = Math.PI * (1.0 - 2.0 * y / worldSize(z));
        return Math.atan(Math.sinh(n)) * 180.0 / Math.PI;
    }

    /** 보이는 영역: 가운데 좌표 · 줌 · 화면 크기(px). */
    public static final class View {
        public double cla = 37.5665, clo = 126.9780, zoom = 14.0;
        public int w = 1, h = 1;

        public View(int w, int h) { this.w = Math.max(1, w); this.h = Math.max(1, h); }

        /** 좌표 → 화면 픽셀(보이는 영역 밖이어도 계산한다). */
        public double[] toScreen(double la, double lo) {
            return new double[] { w / 2.0 + xOf(lo, zoom) - xOf(clo, zoom), h / 2.0 + yOf(la, zoom) - yOf(cla, zoom) };
        }
        /** 화면 픽셀 → 좌표. */
        public double[] toLatLng(double sx, double sy) {
            return new double[] { laOf(yOf(cla, zoom) + sy - h / 2.0, zoom), loOf(xOf(clo, zoom) + sx - w / 2.0, zoom) };
        }
        /** 핀들이 모두 들어오게 맞춘다(핀이 하나면 그 자리를 16배율로). pad = 가장자리 여백(px). */
        public void fit(List<Pin> pins, int pad, double minZ, double maxZ) {
            if (pins == null || pins.isEmpty()) return;
            double minLa = 90, maxLa = -90, minLo = 180, maxLo = -180;
            for (Pin p : pins) { minLa = Math.min(minLa, p.la); maxLa = Math.max(maxLa, p.la); minLo = Math.min(minLo, p.lo); maxLo = Math.max(maxLo, p.lo); }
            double z;
            if (pins.size() == 1 || (maxLa - minLa < 1e-6 && maxLo - minLo < 1e-6)) z = Math.min(16.0, maxZ);
            else {
                double aw = Math.max(40.0, w - 2.0 * pad), ah = Math.max(40.0, h - 2.0 * pad);
                double dx0 = (maxLo - minLo) / 360.0 * T, dy0 = Math.max(1e-9, yOf(minLa, 0) - yOf(maxLa, 0));
                double zx = dx0 < 1e-9 ? maxZ : Math.log(aw / dx0) / Math.log(2.0), zy = Math.log(ah / dy0) / Math.log(2.0);
                z = Math.max(minZ, Math.min(maxZ, Math.min(zx, zy)));
            }
            zoom = z;
            clo = (minLo + maxLo) / 2.0;
            cla = laOf((yOf(minLa, 0) + yOf(maxLa, 0)) / 2.0, 0);
            clamp();
        }
        /** 손가락으로 (dx, dy)px 만큼 끌었다 — 지도가 그만큼 따라온다. */
        public void pan(double dx, double dy) {
            double cx = xOf(clo, zoom) - dx, cy = yOf(cla, zoom) - dy;
            clo = loOf(cx, zoom); cla = laOf(cy, zoom);
            clamp();
        }
        /** (fx, fy) 화면 점이 제자리에 있도록 줌을 d 만큼(2^d 배) 바꾼다. */
        public void zoomBy(double d, double fx, double fy) {
            double[] at = toLatLng(fx, fy);
            double nz = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom + d));
            zoom = nz;
            double cx = xOf(at[1], zoom) - (fx - w / 2.0), cy = yOf(at[0], zoom) - (fy - h / 2.0);
            clo = loOf(cx, zoom); cla = laOf(cy, zoom);
            clamp();
        }
        public void clamp() {
            zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
            cla = Math.max(-MAX_LAT, Math.min(MAX_LAT, cla));
            while (clo > 180.0) clo -= 360.0;
            while (clo < -180.0) clo += 360.0;
        }
        /** 지금 영역을 덮는 타일들: {줌, x(감싼 값), y, 화면 x, 화면 y, 화면에서의 한 변}. 60장을 넘기지 않는다. */
        public List<int[]> tiles() {
            List<int[]> out = new ArrayList<int[]>();
            int tz = (int) Math.max(0, Math.min(MAX_Z, Math.round(zoom)));
            double scale = Math.pow(2.0, zoom - tz), cwx = xOf(clo, tz), cwy = yOf(cla, tz);
            int n = 1 << tz;
            int x0 = (int) Math.floor((cwx - w / 2.0 / scale) / T), x1 = (int) Math.floor((cwx + w / 2.0 / scale) / T);
            int y0 = (int) Math.floor((cwy - h / 2.0 / scale) / T), y1 = (int) Math.floor((cwy + h / 2.0 / scale) / T);
            int side = (int) Math.round(T * scale + 0.49);
            for (int ty = Math.max(0, y0); ty <= Math.min(n - 1, y1); ty++) {
                for (int tx = x0; tx <= x1; tx++) {
                    int wx = ((tx % n) + n) % n;
                    int sx = (int) Math.round(w / 2.0 + (tx * (double) T - cwx) * scale), sy = (int) Math.round(h / 2.0 + (ty * (double) T - cwy) * scale);
                    out.add(new int[] { tz, wx, ty, sx, sy, side });
                    if (out.size() >= 60) return out;
                }
            }
            return out;
        }
    }

    /** 타일 주소(OpenStreetMap 표준 타일). 범위 밖이면 null. */
    public static String tileUrl(int z, int x, int y) {
        if (z < 0 || z > MAX_Z) return null;
        int n = 1 << z;
        if (x < 0 || x >= n || y < 0 || y >= n) return null;
        return "https://tile.openstreetmap.org/" + z + "/" + x + "/" + y + ".png";
    }
}

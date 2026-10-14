package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.zip.GZIPInputStream;

/**
 * 네이티브 노선도 데이터(www/metro_native.bin, 형식 GMN1) 읽기 + 역 찾기·터치 판정.
 *
 * ★ android.* 를 쓰지 않는다 — 이 PC(JVM)에서 그대로 시험할 수 있게 하려는 것이다(test/metro_native_java.test.js).
 * 형식은 tools/metro-native/format.js 가 정의한다. 거기와 이 파일을 같이 바꾼다.
 *
 * 계산 원칙: 이 파일은 "SVG 에 이미 있던 정보(도형·글자 위치)"를 읽을 뿐이다. 경로·시간 계산은 하지 않는다.
 */
public final class MetroMapData {
    public static final int K_PATH = 0, K_GLYPH = 1, K_LABEL = 2;

    public float svgW, svgH;
    public int bg;
    public String[] strings;

    /** 도형: 명령(0=M 1=L 2=C 3=Z)과 좌표(절대, SVG 단위) */
    public byte[][] shCmd;
    public float[][] shCoord;
    /** 클립 번호 → 도형 번호 */
    public int[] clipShape;

    public int nOp;
    public byte[] kind;
    public short[] clip;
    public float[] bbox;            // 4*nOp : x0,y0,x1,y1
    public int[] opShape;           // kind 0,1
    public byte[] opFlags;          // kind 0 : 1=변환 2=채움 4=선 8=evenodd 16=둥근끝
    public float[][] opMatrix;      // kind 0 (없으면 null)
    public int[] opFill;            // kind 0,1
    public int[] opStroke;          // kind 0
    public float[] opSw;            // kind 0
    public float[][] opDash;        // kind 0 (빈 배열 = 실선)
    public float[] opX, opY;        // kind 1
    public int[] lbName, lbAlt;     // kind 2 (문자열 번호, alt 는 -1 가능)
    public float[] lbTb;            // 4*nOp : kind 2 의 글자 상자 x,y,w,h
    public int[] lbInstStart, lbInstCount;
    public int[] inShape, inFill;
    public float[] inX, inY;
    public boolean[] inEn;

    public String[] filterName;
    public byte[][] filterState;    // [필터][op] 0=숨김 1~255=불투명도

    /** 라벨(kind 2) op 번호들(문서 순서) */
    public int[] labelOps;
    private String[] labelKey;      // 공백 제거한 역명

    // ───────────────────────── 읽기 ─────────────────────────
    public static MetroMapData parse(InputStream gz) throws IOException {
        try (GZIPInputStream in = new GZIPInputStream(gz)) {
            ByteArrayOutputStream bo = new ByteArrayOutputStream(4 << 20);
            byte[] buf = new byte[1 << 16];
            int n;
            while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
            return parseRaw(bo.toByteArray());
        }
    }

    public static MetroMapData parse(byte[] gz) throws IOException {
        return parse(new ByteArrayInputStream(gz));
    }

    public static MetroMapData parseRaw(byte[] raw) throws IOException {
        ByteBuffer b = ByteBuffer.wrap(raw).order(ByteOrder.LITTLE_ENDIAN);
        if (raw.length < 4 || raw[0] != 'G' || raw[1] != 'M' || raw[2] != 'N' || raw[3] != '1') throw new IOException("노선도 데이터 형식이 아니다");
        b.position(4);
        MetroMapData d = new MetroMapData();
        d.svgW = b.getFloat(); d.svgH = b.getFloat(); d.bg = b.getInt();
        int ns = b.getInt();
        d.strings = new String[ns];
        for (int i = 0; i < ns; i++) {
            int l = b.getShort() & 0xFFFF;
            d.strings[i] = new String(raw, b.position(), l, StandardCharsets.UTF_8);
            b.position(b.position() + l);
        }
        int nsh = b.getInt();
        d.shCmd = new byte[nsh][]; d.shCoord = new float[nsh][];
        for (int i = 0; i < nsh; i++) {
            int nc = b.getInt(), nf = b.getInt();
            byte[] c = new byte[nc]; b.get(c);
            float[] f = new float[nf];
            for (int k = 0; k < nf; k++) f[k] = b.getFloat();
            d.shCmd[i] = c; d.shCoord[i] = f;
        }
        int ncl = b.getShort() & 0xFFFF;
        d.clipShape = new int[ncl];
        for (int i = 0; i < ncl; i++) d.clipShape[i] = b.getInt();
        int n = b.getInt(); d.nOp = n;
        d.kind = new byte[n]; d.clip = new short[n]; d.bbox = new float[4 * n];
        d.opShape = new int[n]; d.opFlags = new byte[n]; d.opMatrix = new float[n][]; d.opFill = new int[n]; d.opStroke = new int[n];
        d.opSw = new float[n]; d.opDash = new float[n][]; d.opX = new float[n]; d.opY = new float[n];
        d.lbName = new int[n]; d.lbAlt = new int[n]; d.lbTb = new float[4 * n]; d.lbInstStart = new int[n]; d.lbInstCount = new int[n];
        int[] is = new int[1 << 14], ifl = new int[1 << 14];
        float[] ix = new float[1 << 14], iy = new float[1 << 14];
        boolean[] ie = new boolean[1 << 14];
        int ni = 0, nl = 0;
        for (int i = 0; i < n; i++) {
            d.kind[i] = b.get(); d.clip[i] = b.getShort();
            for (int k = 0; k < 4; k++) d.bbox[4 * i + k] = b.getFloat();
            int kd = d.kind[i];
            if (kd == K_PATH) {
                d.opShape[i] = b.getInt();
                int fl = b.get() & 0xFF; d.opFlags[i] = (byte) fl;
                if ((fl & 1) != 0) { float[] m = new float[6]; for (int k = 0; k < 6; k++) m[k] = b.getFloat(); d.opMatrix[i] = m; }
                if ((fl & 2) != 0) d.opFill[i] = b.getInt();
                if ((fl & 4) != 0) { d.opStroke[i] = b.getInt(); d.opSw[i] = b.getFloat(); }
                int nd = b.get() & 0xFF;
                float[] dash = new float[nd];
                for (int k = 0; k < nd; k++) dash[k] = b.getFloat();
                d.opDash[i] = dash;
            } else if (kd == K_GLYPH) {
                d.opShape[i] = b.getInt(); d.opX[i] = b.getFloat(); d.opY[i] = b.getFloat(); d.opFill[i] = b.getInt();
            } else if (kd == K_LABEL) {
                d.lbName[i] = b.getInt(); d.lbAlt[i] = b.getInt();
                for (int k = 0; k < 4; k++) d.lbTb[4 * i + k] = b.getFloat();
                int cnt = b.getShort() & 0xFFFF;
                d.lbInstStart[i] = ni; d.lbInstCount[i] = cnt;
                if (ni + cnt > is.length) {
                    int cap = Math.max(is.length * 2, ni + cnt);
                    is = Arrays.copyOf(is, cap); ifl = Arrays.copyOf(ifl, cap);
                    ix = Arrays.copyOf(ix, cap); iy = Arrays.copyOf(iy, cap); ie = Arrays.copyOf(ie, cap);
                }
                for (int k = 0; k < cnt; k++) {
                    is[ni] = b.getInt(); ix[ni] = b.getFloat(); iy[ni] = b.getFloat(); ifl[ni] = b.getInt(); ie[ni] = b.get() != 0;
                    ni++;
                }
                nl++;
            } else throw new IOException("알 수 없는 op 종류 " + kd);
        }
        d.inShape = Arrays.copyOf(is, ni); d.inFill = Arrays.copyOf(ifl, ni);
        d.inX = Arrays.copyOf(ix, ni); d.inY = Arrays.copyOf(iy, ni); d.inEn = Arrays.copyOf(ie, ni);
        int nf = b.get() & 0xFF;
        d.filterName = new String[nf]; d.filterState = new byte[nf][];
        for (int i = 0; i < nf; i++) {
            d.filterName[i] = d.strings[b.getInt()];
            byte[] st = new byte[n]; b.get(st); d.filterState[i] = st;
        }
        if (b.remaining() != 0) throw new IOException("데이터 끝에 남는 바이트 " + b.remaining());
        d.labelOps = new int[nl]; d.labelKey = new String[nl];
        int li = 0;
        for (int i = 0; i < n; i++) {
            if (d.kind[i] == K_LABEL) { d.labelOps[li] = i; d.labelKey[li] = stripSpace(d.strings[d.lbName[i]]); li++; }
        }
        return d;
    }

    // ───────────────────────── 조회 ─────────────────────────
    /** 필터 이름 → 번호. 모르는 이름은 0('ALL') — 앱이 모르는 호선 이름을 줘도 전부 보이게 */
    public int filterIndex(String name) {
        if (name != null) for (int i = 0; i < filterName.length; i++) if (filterName[i].equals(name)) return i;
        return 0;
    }

    public boolean isLabel(int op) { return op >= 0 && op < nOp && kind[op] == K_LABEL; }
    public String labelName(int op) { return strings[lbName[op]]; }
    public String labelAlt(int op) { return lbAlt[op] >= 0 ? strings[lbAlt[op]] : null; }
    public float labelCx(int op) { return lbTb[4 * op] + lbTb[4 * op + 2] / 2f; }
    public float labelCy(int op) { return lbTb[4 * op + 1] + lbTb[4 * op + 3] / 2f; }
    public float labelW(int op) { return lbTb[4 * op + 2]; }
    public float labelH(int op) { return lbTb[4 * op + 3]; }

    static String stripSpace(String s) {
        StringBuilder sb = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (!Character.isWhitespace(c)) sb.append(c);
        }
        return sb.toString();
    }

    /**
     * 역 이름으로 라벨 찾기 — 앱의 _mapGoToStation 과 같은 규칙:
     * ① 공백을 지운 이름이 정확히 같은 첫 라벨 ② 없으면 이름이 들어 있는 첫 라벨(문서 순서). 못 찾으면 -1.
     */
    public int findLabel(String name) {
        String q = stripSpace(name == null ? "" : name);
        if (q.isEmpty()) return -1;
        for (int i = 0; i < labelOps.length; i++) if (labelKey[i].equals(q)) return labelOps[i];
        for (int i = 0; i < labelOps.length; i++) if (labelKey[i].indexOf(q) >= 0) return labelOps[i];
        return -1;
    }

    /**
     * 화면 한 점(SVG 좌표)에서 눌린 라벨. 손가락 여유 tol(SVG 단위)까지 허용한다.
     * 숨겨진(필터 상태 0) 라벨은 누를 수 없다(웹에서 display:none 요소를 못 누르는 것과 같음).
     * 후보가 여럿이면 글자 상자와의 거리가 가까운 것, 같으면 상자 중심이 가까운 것, 그래도 같으면 문서에서 뒤(위에 그려진) 것.
     */
    public int hitLabel(float x, float y, float tol, int filter) {
        byte[] st = filterState[filter < 0 || filter >= filterState.length ? 0 : filter];
        int best = -1;
        float bestD = Float.MAX_VALUE, bestC = Float.MAX_VALUE;
        for (int li = 0; li < labelOps.length; li++) {
            int op = labelOps[li];
            if (st[op] == 0) continue;
            float tx = lbTb[4 * op], ty = lbTb[4 * op + 1], tw = lbTb[4 * op + 2], th = lbTb[4 * op + 3];
            float dx = x < tx ? tx - x : (x > tx + tw ? x - (tx + tw) : 0f);
            float dy = y < ty ? ty - y : (y > ty + th ? y - (ty + th) : 0f);
            float dd = (float) Math.sqrt(dx * dx + dy * dy);
            if (dd > tol) continue;
            float cx = tx + tw / 2f - x, cy = ty + th / 2f - y;
            float cc = cx * cx + cy * cy;
            if (dd < bestD - 1e-4f || (Math.abs(dd - bestD) <= 1e-4f && cc <= bestC)) { best = op; bestD = dd; bestC = cc; }
        }
        return best;
    }
}

package com.dullyyj.subway;   // ★ MainActivity.java 첫 줄과 같아야 한다

/**
 * 캐릭터 시트 파일 이름 규칙(순수 계산 — 안드로이드를 쓰지 않아 JVM 에서 시험한다).
 *
 * 시트 열쇠(key)는 "<id>"(걷기) · "<id>_pose"(자세 8칸) · "<id>_sleep"(자는 장면) · "dudung_intro".
 * 대부분은 열쇠가 곧 파일 이름(assets/chars3d/<key>.webp)이지만, 뽀송(bbosong)은 신발을 자주 갈아 신는다 —
 * 걷기·자세 시트가 신발마다 따로 있어(bbosong_0 … bbosong_3, bbosong_0_pose …) 지금 신은 신발 번호를 붙인 파일을 읽는다.
 * 자는 장면(bbosong_sleep)은 신발과 상관없이 한 장이다.
 *
 * 신발은 {@link #SHOE_MS} 마다 바뀐다(같은 시간 칸 안에서는 모든 화면이 같은 신발) — 시트를 새로 읽을 때(앱 열기·장면 다시 만들기·위젯 새로 그리기) 바뀐 신발이 반영된다.
 * 계산에 시계 말고는 쓰는 것이 없어, 시험은 now 를 넣어 같은 값을 확인한다.
 */
public final class Chars {
    private Chars() {}

    /** 신발이 바뀌는 시간 간격(분 단위 칸). */
    public static final long SHOE_MS = 20L * 60L * 1000L;
    /** 뽀송의 신발 종류 수(흰 운동화 · 노란 장화 · 보라 메리제인 · 민트 하이탑). */
    public static final int SHOES = 4;

    /** 지금 시각(ms)의 신발 번호(0..SHOES-1). 이어지는 두 칸은 늘 다른 신발이다(갈아 신은 티가 난다).
     *  4칸씩 묶어 신발 4종을 한 번씩 섞어 신고, 묶음 사이에서 같은 신발이 이어지면 앞 두 개를 맞바꾼다(앞 묶음 마지막 값은 바뀌지 않으므로 계산이 한 단계로 끝난다). */
    public static int shoe(long nowMs) {
        long b = Math.floorDiv(nowMs, SHOE_MS);
        long blk = Math.floorDiv(b, (long) SHOES);
        int i = (int) Math.floorMod(b, (long) SHOES);
        int[] p = perm(blk);
        if (p[0] == perm(blk - 1)[SHOES - 1]) { int t = p[0]; p[0] = p[1]; p[1] = t; }
        return p[i];
    }
    public static int shoe() { return shoe(System.currentTimeMillis()); }
    private static int[] perm(long blk) {
        int[] p = new int[SHOES];
        for (int i = 0; i < SHOES; i++) p[i] = i;
        long h = blk;
        for (int i = SHOES - 1; i > 0; i--) {
            h = h * 0x9E3779B97F4A7C15L + 0x7F4A7C15L; h ^= (h >>> 29); h *= 0xBF58476D1CE4E5B9L; h ^= (h >>> 32);
            int j = (int) Math.floorMod(h, (long) (i + 1));
            int t = p[i]; p[i] = p[j]; p[j] = t;
        }
        return p;
    }

    /** 신발을 갈아 신는 캐릭터인가. */
    public static boolean hasShoes(String id) { return "bbosong".equals(id); }

    /** 시트 열쇠 → assets/chars3d 안의 파일 이름(확장자 없음). */
    public static String file(String key, long nowMs) {
        if (key == null) return "";
        if (key.equals("bbosong")) return "bbosong_" + shoe(nowMs);
        if (key.equals("bbosong_pose")) return "bbosong_" + shoe(nowMs) + "_pose";
        return key;
    }
    public static String file(String key) { return file(key, System.currentTimeMillis()); }
}

package com.dullyyj.subway;

/** Chars(시트 파일 이름 규칙) 점검 — node test/chars_native.test.js 가 컴파일해 부른다. */
public final class CharsJvmTest {
    static int bad = 0;
    static void ck(boolean ok, String msg) { if (!ok) { bad++; System.out.println("FAIL " + msg); } }
    public static void main(String[] a) {
        long t0 = 1_700_000_000_000L;
        // ① 신발: 0..3, 같은 시간 칸 안에서는 늘 같고, 이어지는 칸은 서로 다르다
        for (int i = 0; i < 400; i++) {
            long b = t0 + i * Chars.SHOE_MS;
            int s = Chars.shoe(b), s2 = Chars.shoe(b + Chars.SHOE_MS / 2 - 1), n = Chars.shoe(b + Chars.SHOE_MS);
            ck(s >= 0 && s < Chars.SHOES, "범위 " + s);
            ck(Chars.shoe(Math.floorDiv(b, Chars.SHOE_MS) * Chars.SHOE_MS) == Chars.shoe(Math.floorDiv(b, Chars.SHOE_MS) * Chars.SHOE_MS + Chars.SHOE_MS - 1), "같은 칸 안에서 같은 신발");
            ck(Chars.shoe(Math.floorDiv(b, Chars.SHOE_MS) * Chars.SHOE_MS) != Chars.shoe(Math.floorDiv(b, Chars.SHOE_MS) * Chars.SHOE_MS + Chars.SHOE_MS), "이어지는 칸은 갈아 신는다 " + i);
        }
        int[] cnt = new int[Chars.SHOES];
        for (int i = 0; i < 4000; i++) cnt[Chars.shoe(t0 + i * Chars.SHOE_MS)]++;
        for (int k = 0; k < Chars.SHOES; k++) ck(cnt[k] > 700, "신발 " + k + " 가 고르게 나온다: " + cnt[k]);
        // ② 파일 이름
        int s = Chars.shoe(t0);
        ck(Chars.file("bbosong", t0).equals("bbosong_" + s), "뽀송 걷기");
        ck(Chars.file("bbosong_pose", t0).equals("bbosong_" + s + "_pose"), "뽀송 자세");
        ck(Chars.file("bbosong_sleep", t0).equals("bbosong_sleep"), "뽀송 잠은 신발과 무관");
        for (String id : new String[] { "dolsom", "lovel", "dudung", "sul", "ppopu", "chaeng", "juksun" }) {
            ck(Chars.file(id, t0).equals(id), id + " 그대로");
            ck(Chars.file(id + "_pose", t0).equals(id + "_pose"), id + "_pose 그대로");
            ck(Chars.file(id + "_sleep", t0).equals(id + "_sleep"), id + "_sleep 그대로");
        }
        ck(Chars.file("dudung_intro", t0).equals("dudung_intro"), "두덩 인트로");
        ck(Chars.file(null, t0).isEmpty(), "null");
        ck(Chars.hasShoes("bbosong") && !Chars.hasShoes("juksun") && !Chars.hasShoes("dolsom"), "신발 캐릭터");
        System.out.println(bad == 0 ? "ALL OK" : bad + " FAIL");
        System.exit(bad == 0 ? 0 : 1);
    }
}

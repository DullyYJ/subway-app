package com.dullyyj.subway;

import java.util.HashSet;
import java.util.Random;

/** PlayCore(캐릭터 놀이터 계산) 시험 — 안드로이드 없이 JVM. 사용: java PlayJvmTest */
public class PlayJvmTest {
    static int fails = 0, oks = 0;
    static void ok(boolean c, String name) { System.out.println((c ? "ok   " : "FAIL ") + name); if (c) oks++; else fails++; }

    public static void main(String[] a) {
        // 장면 8개 · 색 3줄 · 행동 비중
        ok(PlayCore.SCENE_ORDER.length == 8, "장면 8가지");
        boolean sc = true;
        for (String n : PlayCore.SCENE_ORDER) { PlayCore.Scene s = PlayCore.scene(n); if (s == null || s.p.length != 3 || s.d.length != 3 || s.g.length != 2 || s.wWalk + s.wHop + s.wSpin + s.wRest < 0.99) sc = false; }
        ok(sc, "장면마다 파스텔 3색 · 다크 3색 · 바닥 2색 · 행동 비중 합 1");
        ok(PlayCore.scene("night").p[0] == 0xFFBCC8FF && PlayCore.scene("day").d[2] == 0xFF27507A, "색 값이 웹과 같다");
        ok("z".equals(PlayCore.scene("night").mark) && "♡".equals(PlayCore.scene("candy").mark), "쉴 때 표시가 장면마다 다르다");
        ok("cat".equals(PlayCore.kindOf("lovel")) && "mole".equals(PlayCore.kindOf("dudung")) && "tad".equals(PlayCore.kindOf("chaeng")) && "eagle".equals(PlayCore.kindOf("sul")) && "dog".equals(PlayCore.kindOf("dolsom")) && "dog".equals(PlayCore.kindOf("ppopu")), "종류: 강아지 · 고양이 · 두더지 · 올챙이 · 독수리");

        // 모든 장면 × 시드: 오래 돌려도 칸 밖으로 나가지 않고 숫자가 깨지지 않는다
        boolean inside = true, finite = true; HashSet<String> seen = new HashSet<String>();
        for (String sn : PlayCore.SCENE_ORDER) {
            for (int seed = 1; seed <= 12; seed++) {
                PlayCore.Snap o = new PlayCore.Snap(); o.scene = sn; o.ids = RunnerCore.ORDER.clone();        // 6마리 전부(모든 종류가 나온다)
                PlayCore.Play p = new PlayCore.Play(190d, 70d, o, new Random(seed * 7919L));
                for (int i = 0; i < 30 * 90; i++) {                                                           // 90초
                    p.tick(1d / 30d);
                    for (PlayCore.Actor c : p.cs) {
                        seen.add(c.kind + ":" + c.st);
                        if (Double.isNaN(c.x) || Double.isNaN(c.y) || Double.isNaN(c.fr) || Double.isInfinite(c.x) || Double.isInfinite(c.y)) finite = false;
                        if (c.x < -c.w || c.x > 190d + c.w) inside = false;
                        int f = p.frameIdx(c); if (f < 0 || f >= 16) finite = false;
                        if (c.useIntro && (f < 0 || f >= c.D.intro)) finite = false;
                    }
                    if (p.poops.size() > 3 || p.pt.size() > 60) finite = false;
                }
            }
        }
        ok(inside, "90초 × 8장면 × 12시드 동안 캐릭터가 칸을 벗어나지 않는다");
        ok(finite, "좌표 · 프레임 번호가 깨지지 않고 응가 3개 · 입자 60개를 넘지 않는다");
        String[] must = { "dog:poop", "dog:sniff", "cat:climb", "cat:perch", "mole:dig", "mole:emerge", "mole:sink", "tad:swim", "tad:jumpOut", "tad:jumpIn", "eagle:fly", "eagle:land", "eagle:takeoff" };
        StringBuilder miss = new StringBuilder();
        for (String m : must) if (!seen.contains(m)) miss.append(m).append(' ');
        ok(miss.length() == 0, "캐릭터마다 자기 놀이가 나온다 " + miss);

        // 이어받기: 장면 · 캐릭터 · 자리 · 나무 · 웅덩이
        PlayCore.Play p1 = new PlayCore.Play(190d, 70d, null, new Random(5));
        ok(p1.cs.length == 2 || p1.cs.length == 3, "기본은 2~3마리");
        for (int i = 0; i < 100; i++) p1.tick(1d / 30d);
        PlayCore.Snap sn = p1.snap();
        PlayCore.Play p2 = new PlayCore.Play(220d, 70d, sn, new Random(99));
        boolean same = p2.sc.name.equals(p1.sc.name) && p2.cs.length == p1.cs.length && p2.sideA == p1.sideA;
        for (int i = 0; i < p1.cs.length; i++) same &= p2.cs[i].id.equals(p1.cs[i].id);
        ok(same, "이어받으면 같은 장면 · 같은 캐릭터");
        boolean pos = true;
        for (int i = 0; i < p1.cs.length; i++) { double want = Math.max(p2.cs[i].w * 0.45, Math.min(220d - p2.cs[i].w * 0.45, sn.xs[i] * 220d)); if (Math.abs(p2.cs[i].x - want) > 1e-6 && !"mole".equals(p2.cs[i].kind) && !"tad".equals(p2.cs[i].kind)) pos = false; }
        ok(pos, "서 있던 자리 비율 그대로(칸 너비가 달라도)");
        PlayCore.Snap o2 = new PlayCore.Snap(); o2.scene = "snow"; o2.ids = new String[] { "lovel", "chaeng", "dolsom" }; o2.sideA = true; o2.treeX = 0.3d; o2.pondX = 0.7d;
        PlayCore.Play p3 = new PlayCore.Play(200d, 70d, o2, new Random(3));
        ok(p3.tree != null && Math.abs(p3.tree.x - 60d) < 1e-9 && p3.pond != null && Math.abs(p3.pond.x - 140d) < 1e-9, "나무 · 웅덩이 자리도 이어받는다");
        ok(Math.abs(p3.pond.rx - Math.min(26d, 200d * 0.14)) < 1e-9 && Math.abs(p3.tree.th - Math.min(70d * 0.58, 42d)) < 1e-9, "나무 키 · 웅덩이 반지름 규격");
        PlayCore.Snap o3 = new PlayCore.Snap(); o3.scene = "day"; o3.ids = new String[] { "dolsom", "ppopu" };
        PlayCore.Play p4 = new PlayCore.Play(190d, 70d, o3, new Random(1));
        ok(p4.tree == null && p4.pond == null, "고양이·올챙이가 없으면 나무·웅덩이도 없다");

        // 캐릭터 규격(키 34dp 안팎)
        PlayCore.Play p5 = new PlayCore.Play(190d, 70d, o2, new Random(2));
        boolean h = true; for (PlayCore.Actor c : p5.cs) if (c.bodyH > PlayCore.TARGET_H + 0.01d || c.k > 0.62 + 1e-9) h = false;
        ok(h, "캐릭터 키가 34dp 를 넘지 않는다(배율 0.62 이하)");

        // 칸 놓기
        float[] ph = PlayCore.popupHost(360f, 16f, 16f, 80f, 36f, 29.7f);
        ok(ph != null && Math.abs(ph[0] - 106f) < 0.01f && ph[2] >= 90f && Math.abs(ph[3] - 70f) < 0.01f && Math.abs(ph[0] + ph[2] - 344f) < 0.6f, "역 팝업: 이름 오른쪽 ~ 오른쪽 여백까지");
        ok(ph != null && ph[1] > -1f && ph[1] < 1f, "역 팝업: 이름 줄 아래에 맞춰 위로 솟는다");
        ok(PlayCore.popupHost(360f, 16f, 16f, 250f, 36f, 29.7f) == null, "이름이 길어 90dp 도 못 내면 놓지 않는다");
        float[] th = PlayCore.ttHost(0f, 25.2f, 16f, 120f, 300f);
        ok(th != null && Math.abs(th[0] - 146f) < 0.01f && Math.abs(th[0] + th[2] - 300f) < 0.6f && th[3] == 70f, "시간표: 제목 오른쪽 ~ 닫기 단추 앞");
        ok(PlayCore.ttHost(0f, 25.2f, 16f, 230f, 300f) == null, "시간표: 제목이 길면 놓지 않는다");

        System.out.println(fails == 0 ? "ALL OK (" + oks + ")" : "FAILED " + fails);
        if (fails > 0) System.exit(1);
    }
}

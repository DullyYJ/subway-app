package com.dullyyj.subway;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

/** 오프닝 대본 읽기·고르기·시각별 모습 점검 — node test/open_native.test.js 가 컴파일해 부른다. args[0] = assets/open.json */
public final class OpenJvmTest {
    static int bad = 0;
    static void ck(boolean ok, String msg) { if (!ok) { bad++; System.out.println("FAIL " + msg); } }
    public static void main(String[] a) throws Exception {
        String json = new String(Files.readAllBytes(Paths.get(a[0])), StandardCharsets.UTF_8);
        OpenCore.Script sc = OpenCore.parse(json);
        ck(sc != null && sc.slots.length == 7 && sc.dur == 2700 && sc.fade == 700 && sc.brand.equals("우리들의 길동무"), "대본 읽기: 7칸 · 2.7초(2초 + 앱 화면으로 녹아드는 0.7초) · 상단 글 \"우리들의 길동무\"");
        if (sc == null) { System.out.println("FAILED"); System.exit(1); }
        OpenCore.parse(null); ck(OpenCore.parse("{") == null && OpenCore.parse("[]") == null && OpenCore.parse("{\"slots\":[]}") == null, "망가진 대본은 null (앱은 오프닝 없이 연다)");
        // ① 시간대 7칸 — 사용자가 정한 경계
        String[] exp = new String[24];
        for (int h = 0; h < 24; h++) exp[h] = h >= 7 && h < 9 ? "greet" : h >= 9 && h < 11 ? "morning" : h >= 11 && h < 13 ? "lunch" : h >= 13 && h < 17 ? "afternoon" : h >= 17 && h < 20 ? "evening" : h >= 20 && h < 23 ? "night" : "sleep";
        for (int h = 0; h < 24; h++) for (int m = 0; m < 60; m += 29) ck(OpenCore.slotFor(sc, h + m / 60.0).id.equals(exp[h]), "시간대 " + h + ":" + m + " → " + OpenCore.slotFor(sc, h + m / 60.0).id + " (기대 " + exp[h] + ")");
        ck(OpenCore.slotFor(sc, 6.99).id.equals("sleep") && OpenCore.slotFor(sc, 7.0).id.equals("greet") && OpenCore.slotFor(sc, 22.99).id.equals("night") && OpenCore.slotFor(sc, 23.0).id.equals("sleep") && OpenCore.slotFor(sc, 0.0).id.equals("sleep") && OpenCore.slotFor(sc, 24.5).id.equals("sleep") && OpenCore.slotFor(sc, -0.5).id.equals("sleep"), "경계: 07·09·11·13·17·20·23 시 · 자정 · 범위 밖 값");
        // ② 칸마다 두 가지, 날마다 번갈아
        for (OpenCore.Slot s : sc.slots) {
            ck(s.variants.length == 2, s.id + ": 두 가지");
            ck(OpenCore.cast(s, 100) != OpenCore.cast(s, 101) && OpenCore.cast(s, 100) == OpenCore.cast(s, 102) && OpenCore.cast(s, -1) != null, s.id + ": 날마다 번갈아 · 음수 날도 안전");
            ck((s.sun != null) != (s.moon != null), s.id + ": 해 또는 달");
        }
        // ③ 친구 셋 · 알려진 친구 · 구간이 오프닝 시간 안 · 시각마다 모습이 그려진다
        String ids = "dolsom lovel dudung sul ppopu chaeng juksun bbosong ";
        for (OpenCore.Slot s : sc.slots) for (int v = 0; v < s.variants.length; v++) {
            OpenCore.Actor[] cast = s.variants[v]; ck(cast.length == 3, s.id + "/" + v + ": 친구 셋");
            java.util.HashSet<String> seen = new java.util.HashSet<String>();
            ck(cast[0].tr[0].x0 < cast[1].tr[0].x0 && cast[1].tr[0].x0 < cast[2].tr[0].x0 && Math.abs(cast[1].tr[0].x0 - 0.5) < 1e-9 && Math.abs((cast[0].tr[0].x0 + cast[2].tr[0].x0) / 2 - 0.5) < 1e-9, s.id + "/" + v + ": 왼쪽 · 가운데(0.5) · 오른쪽이 가운데를 중심으로 대칭");
            int says = 0; for (int ci = 0; ci < 3; ci++) for (OpenCore.Seg g : cast[ci].tr) if (!g.say.isEmpty()) { says++; ck(ci == 1, s.id + "/" + v + ": 인사 말풍선은 가운데 친구만"); }
            ck(says == 1, s.id + "/" + v + ": 말풍선은 하나만(" + says + ") — 움직임을 줄였다");
            for (OpenCore.Actor ac : cast) {
                ck(ids.contains(ac.id + " ") && seen.add(ac.id), s.id + "/" + v + ": " + ac.id + " 알려진 친구 · 겹치지 않음");
                boolean anySay = false, moves = false;
                for (OpenCore.Seg g : ac.tr) {
                    ck(g.t0 >= 0 && g.t1 <= sc.dur && g.t1 >= g.t0, s.id + "/" + ac.id + ": 구간이 오프닝 안");
                    ck(!g.k.equals("walk"), s.id + "/" + ac.id + ": 걸어 들어오지 않는다(움직임을 줄였다)");
                    ck(g.hop <= 0.051, s.id + "/" + ac.id + ": 콩콩은 키의 5% 안쪽 " + g.hop);
                    ck(g.x0 == g.x1, s.id + "/" + ac.id + ": 제자리");
                    ck(g.x0 >= 0.25 && g.x0 <= 0.75, s.id + "/" + ac.id + ": 가운데에 모여 있다(" + g.x0 + ")");
                    ck(g.k.equals("walk") || g.k.equals("pose") || g.k.equals("sleep"), s.id + "/" + ac.id + ": 알려진 종류 " + g.k);
                    ck(g.p >= 0 && g.p <= 7, s.id + "/" + ac.id + ": 자세 번호 0~7");
                    ck(g.fx.isEmpty() || "heart spark note leaf food zzz".contains(g.fx), s.id + "/" + ac.id + ": 알려진 효과 " + g.fx);
                    if (!g.say.isEmpty()) anySay = true; if (g.x0 != g.x1 || g.hop > 0) moves = true;
                    if (g.p >= 6) ck(ac.id.equals("juksun") || ac.id.equals("bbosong"), s.id + "/" + ac.id + ": 6·7번 자세는 새 친구만(옛 친구는 칸의 뜻이 다르다)");
                }
                if (s.id.equals("sleep")) ck(ac.tr.length == 1 && ac.tr[0].k.equals("sleep"), s.id + ": 모두 자고 있다");
                for (long t = 0; t < sc.dur; t += 40) {
                    OpenCore.St st = OpenCore.at(ac, t);
                    ck(st.on && st.alpha >= 0 && st.alpha <= 1 && st.x > -0.3 && st.x < 1.3 && st.hop >= 0 && st.hop < 0.5 && (st.face == 1 || st.face == -1), s.id + "/" + ac.id + " t=" + t + ": 값 범위");
                }
                OpenCore.St late = OpenCore.at(ac, sc.dur - 50); ck(late.x > 0.25 && late.x < 0.75, s.id + "/" + ac.id + ": 끝날 때도 가운데에 있다 (" + late.x + ")");
                ck(OpenCore.at(ac, (long) ac.tr[0].t0 + 400).alpha > 0.99 && OpenCore.at(ac, (long) ac.tr[0].t0).alpha < 0.05, s.id + "/" + ac.id + ": 조용히 나타난다(0.3초)");
            }
        }
        // ④ 칸마다 움직임이 서로 다르다(같은 대본이 아니다): 칸별로 (자세·종류) 묶음이 겹치지 않게 달라야 한다
        java.util.HashSet<String> sigs = new java.util.HashSet<String>();
        for (OpenCore.Slot s : sc.slots) { StringBuilder b = new StringBuilder(); for (OpenCore.Actor ac : s.variants[0]) for (OpenCore.Seg g : ac.tr) b.append(g.k).append(g.p).append(g.fx).append(g.say).append(g.x1); sigs.add(b.toString()); }
        ck(sigs.size() == 7, "칸마다 움직임이 다르다: " + sigs.size());
        // ⑤ 가운데 친구의 인사가 뜬다 · 아침엔 죽순이가 천천히 먹는다(6↔7)
        OpenCore.Slot sl0 = OpenCore.slotFor(sc, 7.5); OpenCore.St g1 = OpenCore.at(sl0.variants[0][1], 1000);
        ck(!g1.say.isEmpty() && g1.sayA > 0.9 && g1.x == 0.5, "말풍선이 가운데에 뜬다");
        ck(OpenCore.at(sl0.variants[0][0], 100).pose == 6 && OpenCore.at(sl0.variants[0][0], 800).pose == 7 && OpenCore.at(sl0.variants[0][0], 1500).pose == 6, "죽순이: 대나무를 천천히 먹는다(입 다묾 ↔ 벌림 0.7초마다)");
        ck(OpenCore.at(OpenCore.slotFor(sc, 3).variants[0][1], 1000).k.equals("sleep"), "잠자기: 가운데 친구도 자고 있다");
        // ⑥ 전체 진하기
        ck(OpenCore.alpha(sc, 0) == 1 && OpenCore.alpha(sc, sc.dur - sc.fade) == 1 && OpenCore.alpha(sc, sc.dur) == 0 && OpenCore.alpha(sc, sc.dur - sc.fade / 2) > 0.4 && OpenCore.alpha(sc, sc.dur - sc.fade / 2) < 0.6 && OpenCore.done(sc, sc.dur) && !OpenCore.done(sc, sc.dur - 1), "사라짐: 2초는 또렷이 · 마지막 0.7초에 서서히");
        ck(sc.dur - sc.fade >= 2000, "또렷이 보이는 시간이 2초 이상");
        // 앱 화면으로 녹아듦: 글·친구가 먼저 사라지고 배경이 뒤따른다(둘 다 단조 감소 · 끝에서 0 · 앞에서 1)
        double prevB = 2, prevF = 2; boolean mono = true, fgFirst = true;
        for (long t = sc.dur - sc.fade; t <= sc.dur; t += 10) { double b = OpenCore.bgAlpha(sc, t), f = OpenCore.fgAlpha(sc, t); if (b > prevB + 1e-9 || f > prevF + 1e-9) mono = false; if (f > b + 1e-9) fgFirst = false; prevB = b; prevF = f; }
        ck(mono && fgFirst && OpenCore.bgAlpha(sc, sc.dur - sc.fade) == 1 && OpenCore.fgAlpha(sc, sc.dur - sc.fade) == 1 && OpenCore.bgAlpha(sc, sc.dur) == 0 && OpenCore.fgAlpha(sc, sc.dur) == 0 && OpenCore.fgAlpha(sc, sc.dur - sc.fade / 2) < 0.02 && OpenCore.bgAlpha(sc, sc.dur - sc.fade / 2) > 0.4, "녹아듦: 친구·글이 먼저 사라지고 배경이 뒤따른다(그라데이션)");
        OpenCore.Slot mn = OpenCore.slotFor(sc, 7.5); ck(OpenCore.sunY(mn, 0, sc) > OpenCore.sunY(mn, 2000, sc), "아침 해는 떠오른다(y 가 줄어든다)");
        ck(OpenCore.sunY(OpenCore.slotFor(sc, 1), 0, sc) < 0, "밤엔 해가 없다");
        System.out.println(bad == 0 ? "ALL OK" : bad + " FAIL");
        System.exit(bad == 0 ? 0 : 1);
    }
}

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
        // ② 대본: 바탕·글 색 · 나올 수 있는 8마리 · 자리 · 칸 정보
        ck(sc.chars.length == 8 && sc.bg == 0xFFFAF9F7 && sc.ink == 0xFF2B2F4A, "대본: 8마리 · 파스텔 화이트 바탕 · 글 색");
        ck(Math.abs(sc.x[1] - 0.5) < 1e-9 && Math.abs((sc.x[0] + sc.x[2]) / 2 - 0.5) < 1e-9 && sc.x[0] >= 0.25 && sc.x[2] <= 0.75 && Math.abs(sc.xs[1] - 0.5) < 1e-9 && Math.abs((sc.xs[0] + sc.xs[2]) / 2 - 0.5) < 1e-9, "자리: 가운데(0.5)를 중심으로 대칭 · 모여 있다");
        for (OpenCore.Slot s : sc.slots) {
            ck(s.roles.length == 3, s.id + ": 자리 셋의 연기");
            ck((s.sun != null) != (s.moon != null), s.id + ": 해 또는 달");
            ck(s.id.equals("sleep") == s.kind.equals("sleep"), s.id + ": 잠자는 칸만 sleep");
            int says = 0; for (int i = 0; i < 3; i++) if (!s.roles[i].say.isEmpty()) { says++; ck(i == 1, s.id + ": 인사 말풍선은 가운데 자리만"); }
            ck(says == 1, s.id + ": 말풍선은 하나만(" + says + ")");
            for (OpenCore.Role r : s.roles) { ck(r.hop <= 0.051, s.id + ": 콩콩은 키의 5% 안쪽"); ck(r.p >= 0 && r.p <= 2, s.id + ": 기본 연기는 0~2번 자세(전용 자세는 special 에서만)"); ck(r.fx.isEmpty() || "heart spark note leaf food zzz".contains(r.fx), s.id + ": 알려진 효과"); }
            for (java.util.Map.Entry<String, OpenCore.Seg[]> en : s.special.entrySet()) ck(en.getKey().equals("juksun") || en.getKey().equals("bbosong"), s.id + ": 전용 동작은 새 친구만 " + en.getKey());
        }
        // ③ 랜덤: 서로 다른 셋 · 8마리가 모두 나온다 · 방금 조합은 피한다 · 같은 seed 는 같은 결과(시험 가능)
        java.util.HashMap<String, Integer> count = new java.util.HashMap<String, Integer>(); java.util.HashSet<String> trios = new java.util.HashSet<String>();
        String prev = ""; int repeats = 0;
        for (long seed = 0; seed < 4000; seed++) {
            String[] ids = OpenCore.pickIds(sc, seed * 7919L + 13, prev);
            ck(ids.length == 3 && !ids[0].equals(ids[1]) && !ids[0].equals(ids[2]) && !ids[1].equals(ids[2]), "서로 다른 셋");
            for (String id : ids) { ck(java.util.Arrays.asList(sc.chars).contains(id), "알려진 친구 " + id); count.merge(id, 1, Integer::sum); }
            String key = ids[0] + "," + ids[1] + "," + ids[2]; trios.add(key);
            java.util.ArrayList<String> sa = new java.util.ArrayList<String>(java.util.Arrays.asList(ids)), sb = new java.util.ArrayList<String>(java.util.Arrays.asList(prev.split(",")));
            java.util.Collections.sort(sa); java.util.Collections.sort(sb); if (sa.equals(sb)) repeats++;
            ck(java.util.Arrays.equals(ids, OpenCore.pickIds(sc, seed * 7919L + 13, prev)), "같은 seed·이전 조합이면 같은 결과");
            prev = key;
        }
        ck(count.size() == 8, "8마리가 모두 나온다: " + count);
        int lo = Integer.MAX_VALUE, hi = 0; for (int v : count.values()) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
        ck(lo > 4000 * 3 / 8 * 0.85 && hi < 4000 * 3 / 8 * 1.15, "고르게 나온다: 최소 " + lo + " 최대 " + hi);
        ck(trios.size() > 200, "조합이 다양하다: " + trios.size());
        ck(repeats == 0, "방금 나온 조합은 연속으로 나오지 않는다: " + repeats);
        ck(OpenCore.pickIds(sc, 5, null).length == 3 && OpenCore.pickIds(sc, 5, "x").length == 3 && OpenCore.pickIds(sc, 5, "a,b").length == 3, "이전 기록이 비었거나 망가져도 안전");
        // ④ 어떤 셋이 서도, 어느 칸에서도: 구간이 오프닝 안 · 제자리 · 모여 있다 · 말풍선은 가운데 하나 · 조용히 나타난다
        for (OpenCore.Slot s : sc.slots) for (long seed = 0; seed < 300; seed++) {
            String[] ids = OpenCore.pickIds(sc, seed, ""); OpenCore.Actor[] cast = OpenCore.cast(sc, s, ids);
            ck(cast.length == 3, s.id + ": 친구 셋");
            int says = 0;
            for (int ci = 0; ci < 3; ci++) {
                OpenCore.Actor ac = cast[ci]; ck(ac.id.equals(ids[ci]) && ac.tr.length > 0, s.id + ": 자리 " + ci + " = " + ids[ci]);
                double want = (s.kind.equals("sleep") ? sc.xs : sc.x)[ci];
                for (OpenCore.Seg g : ac.tr) {
                    ck(g.t0 >= 0 && g.t1 <= sc.dur && g.t1 >= g.t0, s.id + "/" + ac.id + ": 구간이 오프닝 안");
                    ck(!g.k.equals("walk") && g.x0 == g.x1 && Math.abs(g.x0 - want) < 1e-9, s.id + "/" + ac.id + ": 제자리(자리 " + ci + ")");
                    ck(g.hop <= 0.051, s.id + "/" + ac.id + ": 콩콩은 키의 5% 안쪽 " + g.hop);
                    ck(g.k.equals("pose") || g.k.equals("sleep"), s.id + "/" + ac.id + ": 알려진 종류 " + g.k);
                    ck(g.p >= 0 && g.p <= 7, s.id + "/" + ac.id + ": 자세 번호 0~7");
                    ck(g.p < 6 || ac.id.equals("juksun") || ac.id.equals("bbosong"), s.id + "/" + ac.id + ": 6·7번 자세는 새 친구만");
                    ck(s.kind.equals("sleep") ? g.k.equals("sleep") : g.k.equals("pose"), s.id + "/" + ac.id + ": 칸의 종류대로");
                    if (!g.say.isEmpty()) { says++; ck(ci == 1, s.id + "/" + ac.id + ": 인사 말풍선은 가운데 자리만"); }
                }
                for (long t = 0; t < sc.dur; t += 40) {
                    OpenCore.St st = OpenCore.at(ac, t);
                    ck(st.on && st.alpha >= 0 && st.alpha <= 1 && st.hop >= 0 && st.hop < 0.5 && (st.face == 1 || st.face == -1) && Math.abs(st.x - want) < 1e-9, s.id + "/" + ac.id + " t=" + t + ": 값 범위");
                }
                ck(OpenCore.at(ac, (long) ac.tr[0].t0 + 400).alpha > 0.99 && OpenCore.at(ac, (long) ac.tr[0].t0).alpha < 0.05, s.id + "/" + ac.id + ": 조용히 나타난다(0.3초)");
            }
            ck(says == 1, s.id + ": 말풍선은 하나만(" + says + ")");
        }
        // ⑤ 칸마다 연기가 서로 다르다 · 가운데 인사가 뜬다 · 죽순이는 먹고 · 뽀송은 자기 동작을 한다
        java.util.HashSet<String> sigs = new java.util.HashSet<String>();
        for (OpenCore.Slot s : sc.slots) { StringBuilder b = new StringBuilder(); for (OpenCore.Actor ac : OpenCore.cast(sc, s, new String[] { "dolsom", "lovel", "dudung" })) for (OpenCore.Seg g : ac.tr) b.append(g.k).append(g.p).append(g.fx).append(g.say).append(g.hop); sigs.add(b.toString()); }
        ck(sigs.size() == 7, "칸마다 연기가 다르다: " + sigs.size());
        OpenCore.Slot sl0 = OpenCore.slotFor(sc, 7.5); OpenCore.St g1 = OpenCore.at(OpenCore.cast(sc, sl0, new String[] { "dolsom", "lovel", "dudung" })[1], 1000);
        ck(!g1.say.isEmpty() && g1.sayA > 0.9 && g1.x == 0.5, "말풍선이 가운데에 뜬다");
        OpenCore.Actor[] gk = OpenCore.cast(sc, sl0, new String[] { "juksun", "dolsom", "bbosong" });
        ck(OpenCore.at(gk[0], 300).pose == 6 && OpenCore.at(gk[0], 800).pose == 7 && OpenCore.at(gk[0], 1500).pose == 6, "죽순이: 대나무를 천천히 먹는다(입 다묾 ↔ 벌림 0.7초마다)");
        ck(OpenCore.at(gk[2], 1000).pose == 0 && OpenCore.at(gk[2], 2000).pose == 6, "뽀송: 처음엔 앉아 있다가 꽃 냄새를 맡는다");
        OpenCore.Actor[] cm = OpenCore.cast(sc, sl0, new String[] { "dolsom", "juksun", "bbosong" });
        ck(!OpenCore.at(cm[1], 1000).say.isEmpty() && OpenCore.at(cm[1], 1000).pose == 6 + (int) (1000 - 120) / 700 % 2, "죽순이가 가운데에 서도 인사 말풍선과 먹기를 함께 한다");
        ck(OpenCore.at(OpenCore.cast(sc, OpenCore.slotFor(sc, 3), new String[] { "dolsom", "lovel", "dudung" })[1], 1000).k.equals("sleep"), "잠자기: 가운데 친구도 자고 있다");
        ck(OpenCore.at(OpenCore.cast(sc, OpenCore.slotFor(sc, 15), new String[] { "bbosong", "dolsom", "lovel" })[0], 1000).pose == 7, "오후: 뽀송이 신발을 자랑한다");
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

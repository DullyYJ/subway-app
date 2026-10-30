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
        ck("두덩".equals(sc.names.get("dudung")) && "독슐".equals(sc.names.get("sul")) && "둘숑".equals(sc.names.get("dolsom")) && "뽀푸".equals(sc.names.get("ppopu")) && "챙챙".equals(sc.names.get("chaeng")) && "쮸르".equals(sc.names.get("juksun")) && "베비히포".equals(sc.names.get("bbosong")), "이름표: 대본의 이름을 읽는다");
        for (String c : sc.chars) ck(sc.names.get(c) != null && !sc.names.get(c).isEmpty(), "이름표: " + c + " 에 이름이 있다");
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
        // ⑥-0 날씨: 맑음·모르는 값·빈 값은 칸 그대로 · 날씨별로 하늘이 바뀌고 해/달/별·구름·효과가 대본대로 · 밤은 어두운 채
        OpenCore.Slot noon = OpenCore.slotFor(sc, 12), night = OpenCore.slotFor(sc, 21);
        ck(OpenCore.withWeather(sc, noon, null) == noon && OpenCore.withWeather(sc, noon, "") == noon && OpenCore.withWeather(sc, noon, "clear") == noon && OpenCore.withWeather(sc, noon, "tornado") == noon, "날씨: 맑음·모르는 값은 칸 그대로(날씨를 지어내지 않는다)");
        for (String wk : new String[] { "cloudy", "overcast", "rain", "snow", "fog" }) {
            OpenCore.Wx w = sc.wx.get(wk); ck(w != null, "날씨 정의 " + wk);
            for (OpenCore.Slot s : sc.slots) {
                OpenCore.Slot r = OpenCore.withWeather(sc, s, wk);
                ck(r != s && r.id.equals(s.id) && r.roles == s.roles && r.special == s.special && r.kind.equals(s.kind) && r.fx.equals(w.fx), s.id + "/" + wk + ": 칸의 연기는 그대로, 날씨만 입힌다");
                ck(r.sky0 != s.sky0 || r.sky1 != s.sky1 || r.sky2 != s.sky2, s.id + "/" + wk + ": 하늘 색이 바뀐다");
                ck((r.sun == null) == (s.sun == null || !w.sun) && (r.moon == null) == (s.moon == null || !w.sun) && (w.sun ? r.stars == s.stars : r.stars == 0), s.id + "/" + wk + ": 해·달·별 가림");
                ck(r.clouds >= s.clouds && r.clouds >= w.clouds, s.id + "/" + wk + ": 구름은 줄지 않는다");
                ck((r.sky0 >>> 24) == 0xFF && (r.ground >>> 24) == 0xFF, s.id + "/" + wk + ": 색은 불투명");
                if (s.dark) { int lum = ((r.sky0 >> 16) & 255) + ((r.sky0 >> 8) & 255) + (r.sky0 & 255); ck(lum < 3 * 110, s.id + "/" + wk + ": 밤은 어두운 채(" + lum + ")"); }
            }
        }
        OpenCore.Slot snow = OpenCore.withWeather(sc, noon, "snow"); ck(((snow.ground >> 16) & 255) > 200 && ((snow.ground >> 8) & 255) > 200, "눈: 땅이 하얗다");
        OpenCore.Slot rain = OpenCore.withWeather(sc, noon, "rain"); ck(rain.sun == null && rain.fx.equals("rain") && ((rain.sky0 >> 8) & 255) < ((noon.sky0 >> 8) & 255), "비: 해가 가려지고 하늘이 어두워진다");
        ck(OpenCore.mix(0xFF000000, 0xFFFFFFFF, 0) == 0xFF000000 && OpenCore.mix(0xFF000000, 0xFFFFFFFF, 1) == 0xFFFFFFFF && OpenCore.mix(0xFF102030, 0xFF102030, 0.5) == 0xFF102030, "색 섞기");
        ck(night.dark && !noon.dark, "밤 칸만 dark");
        // s326 (YJ: 하단 이미지가 어두워지면 하얀 바탕도 하늘 끝색으로 · 제목 글은 흰색): 밤·잠자기 칸만 bg(=하늘 맨 위색) · ink(밝은 글)를 가진다 — 낮 칸은 0(대본의 파스텔 화이트·진한 글)
        for (OpenCore.Slot q : sc.slots) {
            ck(q.dark ? (q.bg == q.sky0 && q.ink != 0 && ((q.ink >> 16) & 255) > 200) : (q.bg == 0 && q.ink == 0), q.id + ": 어두운 칸만 어두운 바탕·밝은 글");
            for (String wk : new String[] { "cloudy", "rain", "snow", "fog" }) { OpenCore.Slot r = OpenCore.withWeather(sc, q, wk); ck(q.dark ? (r.bg == r.sky0 && r.ink == q.ink) : (r.bg == 0 && r.ink == 0), q.id + "/" + wk + ": 날씨가 물들어도 바탕은 하늘 맨 위와 같다"); }
        }
        // ⑥ 전체 진하기
        ck(OpenCore.alpha(sc, 0) == 1 && OpenCore.alpha(sc, sc.dur - sc.fade) == 1 && OpenCore.alpha(sc, sc.dur) == 0 && OpenCore.alpha(sc, sc.dur - sc.fade / 2) > 0.4 && OpenCore.alpha(sc, sc.dur - sc.fade / 2) < 0.6 && OpenCore.done(sc, sc.dur) && !OpenCore.done(sc, sc.dur - 1), "사라짐: 2초는 또렷이 · 마지막 0.7초에 서서히");
        ck(sc.dur - sc.fade >= 2000, "또렷이 보이는 시간이 2초 이상");
        // 앱 화면으로 녹아듦: 글·친구가 먼저 사라지고 배경이 뒤따른다(둘 다 단조 감소 · 끝에서 0 · 앞에서 1)
        double prevB = 2, prevF = 2; boolean mono = true, fgFirst = true;
        for (long t = sc.dur - sc.fade; t <= sc.dur; t += 10) { double b = OpenCore.bgAlpha(sc, t), f = OpenCore.fgAlpha(sc, t); if (b > prevB + 1e-9 || f > prevF + 1e-9) mono = false; if (f > b + 1e-9) fgFirst = false; prevB = b; prevF = f; }
        ck(mono && fgFirst && OpenCore.bgAlpha(sc, sc.dur - sc.fade) == 1 && OpenCore.fgAlpha(sc, sc.dur - sc.fade) == 1 && OpenCore.bgAlpha(sc, sc.dur) == 0 && OpenCore.fgAlpha(sc, sc.dur) == 0 && OpenCore.fgAlpha(sc, sc.dur - sc.fade / 2) < 0.02 && OpenCore.bgAlpha(sc, sc.dur - sc.fade / 2) > 0.4, "녹아듦: 친구·글이 먼저 사라지고 배경이 뒤따른다(그라데이션)");
        OpenCore.Slot mn = OpenCore.slotFor(sc, 7.5); ck(OpenCore.sunY(mn, 0, sc) > OpenCore.sunY(mn, 2000, sc), "아침 해는 떠오른다(y 가 줄어든다)");
        ck(OpenCore.sunY(OpenCore.slotFor(sc, 1), 0, sc) < 0, "밤엔 해가 없다");
        // ⑩ 전원 인사(s338): 홈 장면 3초 꾹 누르기 — 8마리 전원 · 3줄 · 차례대로 인사
        ck(sc.all != null && sc.all.sx.length == 8 && sc.all.order.length == 8 && sc.all.dur == 8200 && sc.all.fade == 700, "전원 인사 판: 자리 8 · 차례 8 · 8.2초(+0.7초 녹아듦)");
        for (OpenCore.Slot s : sc.slots) {
            ck(OpenCore.canAll(sc, s), s.id + ": 전원 인사 가능(모든 친구에게 인사 글)");
            ck(s.all != null && s.all.say.size() == 8 && s.all.hop <= 0.051, s.id + ": 인사 글 8 · 콩콩 5% 안쪽");
            for (String c : sc.chars) ck(s.all.say.get(c) != null && s.all.say.get(c).codePointCount(0, s.all.say.get(c).length()) <= 10, s.id + "/" + c + ": 인사 글이 있고 열 글자 안쪽");
        }
        ck(OpenCore.canAll(sc, OpenCore.withWeather(sc, OpenCore.slotFor(sc, 12), "rain")), "날씨를 입혀도 전원 인사 대본은 따라온다");
        { String noAll = json.replace("\"all\":{", "\"allx\":{"); OpenCore.Script s0 = OpenCore.parse(noAll); ck(s0 != null && s0.all == null && !OpenCore.canAll(s0, s0.slots[0]), "대본에 전원 인사 판이 없으면 쓰지 않는다(앱은 아무것도 안 한다)"); }
        OpenCore.Script as = OpenCore.forAll(sc);
        ck(as.dur == 8200 && as.fade == 700 && as.slots == sc.slots && OpenCore.done(as, 8200) && !OpenCore.done(as, 8199) && OpenCore.alpha(as, 7500) == 1 && OpenCore.alpha(as, 8200) == 0, "전원 인사 시간표: 길이·사라짐만 다르다");
        for (OpenCore.Slot s : sc.slots) {
            OpenCore.Actor[] cs = OpenCore.castAll(sc, s, 99L);
            java.util.HashSet<String> ids = new java.util.HashSet<String>(); int[] perRow = new int[3]; boolean order = true; int lastRow = 9;
            for (OpenCore.Actor ac : cs) { ids.add(ac.id); perRow[ac.row]++; if (ac.row > lastRow) order = false; lastRow = ac.row; ck(ac.scale == sc.all.scale && ac.gap == sc.all.gap, s.id + ": 배율·줄 간격은 대본 것"); }
            ck(cs.length == 8 && ids.size() == 8 && ids.containsAll(java.util.Arrays.asList(sc.chars)), s.id + ": 8마리 전원이 한 번씩");
            ck(perRow[0] == 3 && perRow[1] == 2 && perRow[2] == 3, s.id + ": 앞 3 · 가운데 2 · 뒤 3 (" + perRow[0] + "," + perRow[1] + "," + perRow[2] + ")");
            ck(order, s.id + ": 뒤 줄부터 앞 줄 차례(앞 줄이 뒤 줄을 가린다)");
            // 인사: 각자 자기 차례에 한 번만 · 차례는 서로 다르고 간격이 일정 · 같은 때 뜨는 말풍선은 서로 안 닿는다
            java.util.HashSet<Double> times = new java.util.HashSet<Double>();
            for (OpenCore.Actor ac : cs) {
                times.add(ac.sayAt); ck(ac.say.equals(s.all.say.get(ac.id)) && ac.sayAt >= sc.all.t0 && ac.sayAt <= sc.all.t0 + 7 * sc.all.step + 1e-6, s.id + "/" + ac.id + ": 자기 글 · 차례 안");
                int shown = 0; for (long t = 0; t <= sc.all.dur; t += 20) { OpenCore.St st = OpenCore.at(ac, t); if (st.say.equals(s.all.say.get(ac.id)) && st.sayA > 0.02) { shown++; ck(t >= ac.sayAt && t < ac.sayAt + 1700, s.id + "/" + ac.id + ": 차례 밖에서 말하지 않는다 t=" + t); } }
                ck(shown > 40, s.id + "/" + ac.id + ": 충분히 읽을 시간 동안 보인다(" + shown + ")");
                ck(OpenCore.at(ac, (long) ac.sayAt - 5).say.isEmpty() || !ac.say.equals(OpenCore.at(ac, (long) ac.sayAt - 5).say), s.id + ": 차례 전엔 말이 없다");
            }
            ck(times.size() == 8, s.id + ": 인사 차례 8개가 모두 다르다");
            int maxAt = 0; for (long t = 0; t <= sc.all.dur; t += 20) { int n = 0; for (OpenCore.Actor ac : cs) if (OpenCore.at(ac, t).say.length() > 0 && OpenCore.at(ac, t).sayA > 0.02) n++; maxAt = Math.max(maxAt, n); }
            ck(maxAt <= 3 && maxAt >= 2, s.id + ": 한꺼번에 뜨는 말풍선은 2~3개(" + maxAt + ")");
            for (OpenCore.Actor ac : cs) for (OpenCore.Actor bc : cs) if (ac != bc && ac.row == bc.row && Math.abs(ac.sayAt - bc.sayAt) < 1700) ck(Math.abs(OpenCore.at(ac, 3000).x - OpenCore.at(bc, 3000).x) >= 0.29, s.id + ": 같은 줄에서 동시에 말하는 친구는 멀리 있다 " + ac.id + "/" + bc.id);
            double endSay = 0; for (OpenCore.Actor ac : cs) endSay = Math.max(endSay, ac.sayAt + 1700); ck(endSay <= sc.all.dur - sc.all.fade, s.id + ": 마지막 인사가 끝난 뒤에 사라지기 시작한다(" + endSay + ")");
            for (OpenCore.Actor ac : cs) for (OpenCore.Seg g : ac.tr) { ck(g.t1 <= sc.all.dur && g.hop <= 0.051 && g.say.isEmpty(), s.id + "/" + ac.id + ": 동작 구간은 길이 안 · 콩콩 5% 안쪽 · 말은 구간이 아니라 차례로"); }
        }
        // 같은 seed 는 같은 배치 · 다른 seed 는 다른 배치 · 모든 친구가 모든 자리에 서 본다
        { OpenCore.Slot s0 = OpenCore.slotFor(sc, 12); String k1 = "", k2 = ""; for (OpenCore.Actor ac : OpenCore.castAll(sc, s0, 5L)) k1 += ac.id + ac.row + (int) (ac.tr[0].x0 * 100) + ","; for (OpenCore.Actor ac : OpenCore.castAll(sc, s0, 5L)) k2 += ac.id + ac.row + (int) (ac.tr[0].x0 * 100) + ",";
          ck(k1.equals(k2), "같은 seed 는 같은 배치");
          java.util.HashSet<String> arr = new java.util.HashSet<String>(), seat = new java.util.HashSet<String>();
          for (long sd = 0; sd < 600; sd++) { String k = ""; for (OpenCore.Actor ac : OpenCore.castAll(sc, s0, sd * 31L + 7)) { k += ac.id + "@" + ac.row + "/" + (int) (ac.tr[0].x0 * 100) + ","; seat.add(ac.id + "@" + ac.row + "/" + (int) (ac.tr[0].x0 * 100)); } arr.add(k); }
          ck(arr.size() > 500, "seed 마다 배치가 다르다(" + arr.size() + "/600)"); ck(seat.size() == 64, "친구마다 8자리 모두에 서 본다(" + seat.size() + "/64)"); }
        // 전용 동작(죽순이 · 뽀송)은 전원 인사에서도 자기 자리에서 그대로 한다
        { OpenCore.Slot gr = OpenCore.slotFor(sc, 7.5); boolean jk = false, bb = false;
          for (OpenCore.Actor ac : OpenCore.castAll(sc, gr, 3L)) { if (ac.id.equals("juksun")) jk = ac.tr.length > 1 && ac.tr[0].p == 6 && ac.tr[1].p == 7; if (ac.id.equals("bbosong")) bb = ac.tr.length == 2 && ac.tr[1].p == 6; }
          ck(jk && bb, "아침: 죽순이는 먹고 뽀송은 하트(전용 동작)"); }
        // 잠자는 시간엔 모두 잠든 모습으로 인사한다
        { OpenCore.Slot sl = OpenCore.slotFor(sc, 2); for (OpenCore.Actor ac : OpenCore.castAll(sc, sl, 11L)) ck("sleep".equals(OpenCore.at(ac, 2000).k) && "zzz".equals(OpenCore.at(ac, 2000).fx), "잠자기 칸: " + ac.id + " 는 잠든 모습 + zzz"); }
        // 오프닝(셋)은 그대로: 옛 방식의 친구에게는 자리 줄 · 배율이 기본값, 말은 구간에서
        { OpenCore.Slot gr = OpenCore.slotFor(sc, 7.5); for (OpenCore.Actor ac : OpenCore.cast(sc, gr, new String[] { "dolsom", "lovel", "dudung" })) ck(ac.row == 0 && ac.scale == 1 && ac.gap == 0 && ac.say.isEmpty() && ac.sayAt < 0, "오프닝 친구는 줄 0 · 배율 1 · 따로 인사 없음"); }
        System.out.println(bad == 0 ? "ALL OK" : bad + " FAIL");
        System.exit(bad == 0 ? 0 : 1);
    }
}

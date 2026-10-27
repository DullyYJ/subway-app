package com.dullyyj.subway;

import java.util.List;

/** ScreenCore(서버 구동 화면: JSON 읽기·검증·배치·눌림) 시험 — 안드로이드 없이 JVM. 사용: java ScreenJvmTest */
public class ScreenJvmTest {
    static int fails = 0, oks = 0;
    static float lkN2(ScreenCore.Layout L) { for (ScreenCore.Item q : L.body) if (q.kind == ScreenCore.K_RBTN && q.label.startsWith("좋아요")) return q.y; return -1f; }
    static void ok(boolean c, String name) { System.out.println((c ? "ok   " : "FAIL ") + name); if (c) oks++; else fails++; }
    static boolean near(float a, float b) { return Math.abs(a - b) < 0.02f; }

    // 영문 0.5em · 한글 등 1em · 공백 0.3em
    static final ScreenCore.Measurer M = new ScreenCore.Measurer() {
        public float width(String s, float size, boolean bold) {
            float w = 0; for (int i = 0; i < s.length(); i++) { char c = s.charAt(i); w += (c == ' ' ? 0.3f : (c < 128 ? 0.5f : 1f)) * size * (bold ? 1.05f : 1f); }
            return w;
        }
    };

    static String card(String name, String url) { return "{\"t\":\"card\",\"name\":\"" + name + "\",\"tag\":\"최저가 ›\",\"fb\":\"X\",\"img\":\"https://img/a.jpg\",\"act\":{\"a\":\"open\",\"url\":\"" + url + "\"}}"; }
    static String screen(int n) {
        StringBuilder g = new StringBuilder();
        for (int i = 0; i < n; i++) { if (i > 0) g.append(','); g.append(card("상품" + i, "https://link.coupang.com/a/" + i)); }
        return "{\"ok\":true,\"v\":1,\"screen\":\"shop\",\"rev\":\"r1\",\"head\":[{\"t\":\"chips\",\"pad\":[14,4,14,4],\"gap\":6,\"h\":30,\"items\":["
            + "{\"label\":\"추천\",\"badge\":\"100\",\"on\":true,\"act\":{\"a\":\"cat\",\"v\":\"추천\"}},{\"label\":\"식사\",\"badge\":\"229\",\"on\":false,\"act\":{\"a\":\"cat\",\"v\":\"식사\"}},{\"label\":\"음료\",\"badge\":\"101\",\"act\":{\"a\":\"cat\",\"v\":\"음료\"}}]}],"
            + "\"body\":[{\"t\":\"grid\",\"cols\":2,\"gap\":8,\"pad\":[14,4,14,0],\"items\":[" + g + "]},"
            + "{\"t\":\"text\",\"pad\":[16,10,16,0],\"size\":10,\"color\":\"sub\",\"s\":\"이 페이지의 상품 링크는 쿠팡 파트너스 활동의 일환으로, 수수료를 제공받습니다.\"},"
            + "{\"t\":\"spacer\",\"h\":10},{\"t\":\"button\",\"pad\":[14,0,14,0],\"s\":\"지금 바로 새로고침\",\"size\":11,\"h\":40,\"act\":{\"a\":\"refresh\"}},{\"t\":\"spacer\",\"h\":14}]}";
    }
    static String wrapBody(String node) { return "{\"ok\":true,\"v\":1,\"screen\":\"t\",\"head\":[],\"body\":[" + node + "]}"; }
    static boolean bad(String json) { try { ScreenCore.load(json); return false; } catch (ScreenCore.ParseError e) { return true; } }

    public static void main(String[] a) throws Exception {
        // ── JSON 읽기 ──
        Object o = ScreenCore.parse("{\"a\":[1,2.5,-3e2,true,false,null,\"x\\n\\u00e9\\\"\"],\"b\":{}}");
        ok(o instanceof java.util.Map, "객체를 읽는다");
        ok(bad("{\"ok\":true"), "닫히지 않은 JSON 은 거절");
        ok(bad(""), "빈 글은 거절");
        ok(bad("{\"a\":1} x"), "뒤에 남은 글자는 거절");
        ok(bad("{'a':1}"), "작은따옴표 JSON 은 거절");
        StringBuilder deep = new StringBuilder(); for (int i = 0; i < 60; i++) deep.append('['); for (int i = 0; i < 60; i++) deep.append(']');
        ok(bad(deep.toString()), "너무 깊은 중첩은 거절");
        boolean tooBig; try { ScreenCore.parse(new String(new char[ScreenCore.MAX_JSON + 1]).replace('\0', ' ')); tooBig = false; } catch (ScreenCore.ParseError e) { tooBig = true; }
        ok(tooBig, "너무 큰 입력은 거절");
        ok(bad("{\"a\":\"\\q\"}") && bad("{\"a\":\"\\u12\"}"), "잘못된 이스케이프는 거절");

        // ── 검증 ──
        ScreenCore.Screen s = ScreenCore.load(screen(6));
        ok(s.id.equals("shop") && s.rev.equals("r1") && s.head.size() == 1 && s.body.size() == 5, "정상 화면을 읽는다");
        ok(s.head.get(0).items.size() == 3 && s.head.get(0).items.get(0).on && s.head.get(0).items.get(0).act.v.equals("추천"), "칩과 행동");
        ok(bad(screen(1).replace("\"v\":1", "\"v\":2")), "모르는 규격(v=2)은 거절 → 폴백");
        ok(bad(screen(1).replace("\"v\":1,", "")), "v 없으면 거절");
        ok(bad(screen(1).replace("\"ok\":true", "\"ok\":false")), "엔진이 실패를 알리면 거절");
        ok(bad(screen(1).replace("\"screen\":\"shop\",", "")), "screen 없으면 거절");
        ok(bad(screen(1).replace("\"head\":[{", "\"head\":{")), "head 가 배열이 아니면 거절");
        ok(bad(screen(1).replace("\"name\":\"상품0\"", "\"name\":5")), "카드 이름이 글자가 아니면 거절");
        ok(bad(screen(1).replace("https://link.coupang.com/a/0", "javascript:alert(1)")), "http(s) 가 아닌 링크는 거절");
        ok(bad(screen(1).replace("\"a\":\"open\"", "\"a\":\"format\"")), "모르는 행동은 거절");
        ok(bad(screen(1).replace("\"cols\":2", "\"cols\":9")), "칸 수 범위 밖은 거절");
        ok(bad(screen(1).replace("\"pad\":[14,4,14,0]", "\"pad\":[14,4]")), "pad 가 4개가 아니면 거절");
        ok(bad(screen(1).replace("\"color\":\"sub\"", "\"color\":\"#ff0000\"")), "모르는 색 이름은 거절(엔진은 역할 이름만 쓴다)");
        {   // s241 좌우 밀기 sw — 엔진이 정한 행동을 그대로 읽는다(l/r 행동 · 머리 쪽 표시 · 뉴스 카테고리)
            ScreenCore.Screen sw = ScreenCore.load("{\"ok\":true,\"v\":1,\"screen\":\"t\",\"head\":[],\"body\":[{\"t\":\"spacer\",\"h\":4}],\"sw\":{\"l\":{\"a\":\"call\",\"v\":\"cc.news\"},\"lh\":true,\"lc\":\"전체\",\"r\":{\"a\":\"cat\",\"v\":\"IT\"}}}");
            ok(sw.swL != null && "cc.news".equals(sw.swL.v) && sw.swLh && "전체".equals(sw.swLc) && sw.swR != null && "cat".equals(sw.swR.a) && "IT".equals(sw.swR.v) && !sw.swRh && sw.swRc.length() == 0, "sw: 좌우 행동 · 머리 쪽 · 카테고리");
            ScreenCore.Screen no = ScreenCore.load(wrapBody("{\"t\":\"spacer\",\"h\":4}"));
            ok(no.swL == null && no.swR == null, "sw 없으면 밀어도 아무 일 없음(멈춤)");
            ok(bad("{\"ok\":true,\"v\":1,\"screen\":\"t\",\"head\":[],\"body\":[{\"t\":\"spacer\",\"h\":4}],\"sw\":{\"l\":{\"a\":\"zzz\"}}}"), "sw 행동이 엉터리면 거절");
        }
        ScreenCore.Screen s2 = ScreenCore.load(screen(2).replace("{\"t\":\"spacer\",\"h\":10}", "{\"t\":\"hologram\",\"x\":1},{\"t\":\"spacer\",\"h\":10}"));
        ok(s2.skipped == 1 && s2.body.size() == 5, "모르는 노드 종류는 건너뛴다(앞으로 늘려도 옛 앱이 안 깨진다)");
        ScreenCore.Screen s3 = ScreenCore.load(screen(1).replace("https://img/a.jpg", "file:///etc/passwd"));
        ok(s3.body.get(0).items.get(0).img.length() == 0, "이상한 그림 주소는 그림만 뺀다(카드는 그대로)");
        ok(bad("{\"ok\":true,\"v\":1,\"screen\":\"shop\",\"head\":[],\"body\":[]}"), "그릴 것이 없으면 거절");
        // 노드 수 한도
        boolean many; try { ScreenCore.load(screen(ScreenCore.MAX_NODES + 50)); many = false; } catch (ScreenCore.ParseError e) { many = true; }
        ok(many, "노드가 너무 많으면 거절");

        // ── 글 나누기 ──
        List<String> w1 = ScreenCore.wrap("hello world foo", 40f, 10f, false, 0, M);   // 영문 5px/글자 → 8자
        ok(w1.size() >= 2 && w1.get(0).equals("hello"), "공백에서 줄을 나눈다 " + w1);
        List<String> w2 = ScreenCore.wrap("가나다라마바사아자차", 30f, 10f, false, 0, M);   // 한글 10px → 3자
        ok(w2.size() == 4 && w2.get(0).equals("가나다"), "공백이 없으면 글자 단위로 나눈다 " + w2);
        List<String> w3 = ScreenCore.wrap("가나다라마바사아자차카타파하", 30f, 10f, false, 2, M);
        ok(w3.size() == 2 && w3.get(1).endsWith("\u2026") && M.width(w3.get(1), 10f, false) <= 30f + 0.01f, "줄 수 한도를 넘으면 … 으로 줄인다 " + w3);
        ok(ScreenCore.wrap("abc", 100f, 10f, false, 0, M).size() == 1, "짧으면 한 줄");
        ok(ScreenCore.wrap("", 100f, 10f, false, 0, M).size() == 0, "빈 글은 줄 없음");
        ok(ScreenCore.wrap("가\n나", 100f, 10f, false, 0, M).size() == 2, "줄바꿈 글자");
        String e1 = ScreenCore.ellipsize("가나다라마바사", 35f, 10f, false, M);
        ok(e1.equals("가나\u2026") && M.width(e1, 10f, false) <= 35f, "한 줄 줄이기 " + e1);

        // ── 배치 ──
        ScreenCore.Layout L = ScreenCore.layout(s, 360f, M);
        ok(L.head.length == 3, "칩 3개");
        ok(near(L.head[0].x, 14f) && near(L.head[0].y, 4f) && near(L.head[0].h, 30f), "첫 칩 자리");
        ok(near(L.head[1].x, L.head[0].x + L.head[0].w + 6f), "칩 사이 간격 6");
        ok(near(L.headH, 4f + 30f + 4f), "머리 높이 = 위 여백 + 칩 + 아래 여백");
        ok(near(L.head[0].w, 24f + M.width("추천", 12f, true) + 6f + M.width("100", 12f, true)), "칩 폭 = 좌우 12 + 라벨 + 6 + 뱃지");
        float cw = (360f - 28f - 8f) / 2f;
        ScreenCore.Item c0 = L.body[0], c1 = L.body[1], c2 = L.body[2];
        ok(c0.kind == ScreenCore.K_CARD && near(c0.w, cw) && near(c1.w, cw), "카드 폭 = (폭 − 좌우 여백 − 간격) / 2 : " + cw);
        ok(near(c0.x, 14f) && near(c1.x, 14f + cw + 8f) && near(c0.y, 4f) && near(c1.y, 4f), "한 줄에 두 장");
        ok(near(c2.y, c0.y + c0.h + 8f), "다음 줄은 높이 + 간격 8 아래");
        ok(near(c0.h, c1.h), "한 줄 카드는 높이가 같다");
        ok(near(c0.ih, 78f) && near(c0.iw, cw - 18f), "그림 칸 78 높이");
        ok(c0.lines.length == 1 && c0.tag.equals("최저가 ›"), "카드 이름 한 줄 + 최저가");
        ok(near(c0.tagX, c0.x + c0.w - 1f - 8f - c0.tagW), "최저가는 오른쪽 안쪽에 붙는다");
        // 6장 = 3줄
        ScreenCore.Item last = null; for (ScreenCore.Item it : L.body) if (it.kind == ScreenCore.K_CARD) last = it;
        ok(near(last.y, 4f + 2f * (c0.h + 8f)), "6장은 3줄");
        ScreenCore.Item btn = null, txt = null; for (ScreenCore.Item it : L.body) { if (it.kind == ScreenCore.K_BUTTON) btn = it; if (it.kind == ScreenCore.K_TEXT) txt = it; }
        ok(btn != null && txt != null && txt.y > last.y + last.h && btn.y > txt.y + txt.h && near(btn.h, 40f), "카드 → 문구 → 단추 순서");
        ok(near(L.bodyH, btn.y + btn.h + 14f), "본문 높이 = 마지막 단추 + 아래 여백");
        // 긴 이름은 두 줄
        ScreenCore.Screen sl = ScreenCore.load(screen(2).replace("상품0", "아주 긴 상품 이름 아주 긴 상품 이름 아주 긴 상품 이름 아주 긴 상품 이름"));
        ScreenCore.Layout LL = ScreenCore.layout(sl, 360f, M);
        ok(LL.body[0].lines.length == 2 && LL.body[0].lines[1].endsWith("\u2026"), "긴 이름은 두 줄까지, 넘치면 …");
        ok(LL.body[0].h > L.body[0].h && near(LL.body[0].h, LL.body[1].h), "두 줄 카드가 있으면 그 줄 전체가 높아진다");
        // 칩 내용 폭 → 가로로 밀 수 있나
        ScreenCore.Layout narrow = ScreenCore.layout(s, 120f, M);
        ok(narrow.headMaxScroll() > 0f, "좁으면 칩 줄이 가로로 밀린다");
        ok(near(L.headMaxScroll(), 0f) || L.headContentW > 360f, "넓으면 밀 필요 없다");

        // ── 보이는 조각·눌림 ──
        ScreenCore.Layout B = ScreenCore.layout(ScreenCore.load(screen(400)), 360f, M);
        int[] r0 = B.bodyRange(0f, 600f);
        ok(r0[0] == 0 && r0[1] > 4 && r0[1] < 40, "맨 위 600dp 에는 카드 몇 장만 걸친다 " + r0[0] + "~" + r0[1]);
        float mid = B.bodyH / 2f;
        int[] r1 = B.bodyRange(mid, mid + 600f);
        ok(r1[0] > 50 && r1[1] > r1[0] && r1[1] - r1[0] < 40, "중간에서도 보이는 만큼만 " + r1[0] + "~" + r1[1]);
        boolean okAll = true; int[] rs = B.bodyRange(0f, B.bodyH);
        ok(rs[0] == 0 && rs[1] == B.body.length, "전체 범위는 전부");
        ScreenCore.Item pick = B.body[100];
        ScreenCore.Act ha = B.hitBody(pick.x + 5f, pick.y + 5f);
        ok(ha != null && ha.a.equals("open") && ha.url.endsWith("/100"), "카드를 누르면 그 카드 링크 " + (ha == null ? "null" : ha.url));
        ok(B.hitBody(1f, pick.y + 5f) == null, "여백을 누르면 아무 일도 없다");
        ok(B.hitBody(pick.x + pick.w + 2f, pick.y + 5f) == null, "카드 사이 간격도 아무 일 없다");
        ScreenCore.Act hc = L.hitHead(L.head[1].x + 3f, 10f);
        ok(hc != null && hc.a.equals("cat") && hc.v.equals("식사"), "칩을 누르면 그 카테고리");
        ok(L.hitHead(L.head[1].x + 3f, 100f) == null, "칩 줄 밖은 없음");
        ScreenCore.Item bt = null; for (ScreenCore.Item it : L.body) if (it.kind == ScreenCore.K_BUTTON) bt = it;
        ScreenCore.Act hb = L.hitBody(bt.x + 10f, bt.y + 10f);
        ok(hb != null && hb.a.equals("refresh"), "단추를 누르면 새로고침");


        // ── 안내 상자 · 검색줄 (cap=2 화면) ──
        String notice = "이 페이지의 상품 링크는 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.";
        int hl1a = notice.indexOf("쿠팡 파트너스 활동"), hl1b = hl1a + "쿠팡 파트너스 활동".length(), hl2a = notice.indexOf("일정액"), hl2b = notice.length();
        String boxJ = "{\"t\":\"box\",\"pad\":[14,14,14,8],\"ip\":[12,8,12,8],\"s\":\"" + notice + "\",\"hl\":[[" + hl1a + "," + hl1b + "],[" + hl2a + "," + hl2b + "]],\"size\":11.5,\"lh\":1.5,\"color\":\"text\",\"fill\":\"rgba(255,149,0,0.12)\",\"line\":\"rgba(255,149,0,0.35)\",\"r\":10}";
        String srchJ = "{\"t\":\"search\",\"pad\":[14,0,14,4],\"max\":340,\"hint\":\"쿠팡에서 검색\",\"badge\":\"C\",\"accent\":\"#e63329\",\"maxlen\":60,\"act\":{\"a\":\"search\",\"tpl\":\"https://www.coupang.com/np/search?q={q}\",\"empty\":\"https://coupa.ng/coRT4D\"}}";
        String chipsJ = "{\"t\":\"chips\",\"pad\":[14,4,14,4],\"gap\":6,\"h\":30,\"items\":[{\"label\":\"추천\",\"badge\":\"100\",\"on\":true,\"act\":{\"a\":\"cat\",\"v\":\"추천\"}},{\"label\":\"식사\",\"badge\":\"229\",\"act\":{\"a\":\"cat\",\"v\":\"식사\"}}]}";
        String capScreen = screen(4).replace("\"rev\":\"r1\",", "\"rev\":\"r1\",\"cover\":\"tab\",").replaceFirst("\"head\":\\[\\{\"t\":\"chips\".*?\\]\\}\\],\"body\"", "\"head\":[" + boxJ + "," + srchJ + "," + chipsJ + "],\"body\"");
        ScreenCore.Screen cs = ScreenCore.load(capScreen);
        ok(cs.cover.equals("tab") && cs.head.size() == 3 && cs.head.get(0).t.equals("box") && cs.head.get(1).t.equals("search") && cs.head.get(2).t.equals("chips"), "cap=2 화면: 상자·검색줄·칩, cover=tab");
        ok(s.cover.equals("chips"), "cover 없으면 chips(예전 화면)");
        ok(cs.head.get(0).hl.length == 2 && cs.head.get(1).act.tpl.contains("{q}") && cs.head.get(1).act.empty.equals("https://coupa.ng/coRT4D") && cs.head.get(1).maxlen == 60, "상자 굵은 구간 · 검색 행동");
        ok(bad(capScreen.replace("{q}", "")), "검색 tpl 에 {q} 가 없으면 거절");
        ok(bad(capScreen.replace("\"empty\":\"https://coupa.ng/coRT4D\"", "\"empty\":\"javascript:alert(1)\"")), "검색 empty 가 http(s) 가 아니면 거절");
        ok(bad(capScreen.replace("\"empty\":\"https://coupa.ng/coRT4D\"", "\"x\":1")), "검색 empty 가 없으면 거절");
        ok(bad(capScreen.replace("[" + hl1a + "," + hl1b + "]", "[" + hl1a + "," + (notice.length() + 5) + "]")), "굵은 구간이 글 밖이면 거절");
        ok(bad(capScreen.replace("[" + hl1a + "," + hl1b + "]", "[" + hl1b + "," + hl1a + "]")), "굵은 구간의 시작이 끝보다 뒤면 거절");
        ok(bad(capScreen.replace("rgba(255,149,0,0.12)", "주황색")), "읽을 수 없는 CSS 색은 거절");
        ok(bad(capScreen.replace("\"s\":\"" + notice + "\"", "\"s\":\"\"")), "상자 글이 비면 거절");
        ok(bad(capScreen.replace("\"a\":\"search\"", "\"a\":\"refresh\"")), "검색줄의 행동이 search 가 아니면 거절");
        ok(bad(capScreen.replace("\"cover\":\"tab\"", "\"cover\":\"zzz\"")), "모르는 cover 는 거절");
        ok(bad(capScreen.replace("\"maxlen\":60", "\"maxlen\":0")), "maxlen 범위 밖은 거절");
        ok(bad(screen(1).replace("\"a\":\"open\"", "\"a\":\"search\"")), "search 행동에 tpl 이 없으면 거절");
        ScreenCore.Layout CL = ScreenCore.layout(cs, 360f, M);
        ScreenCore.Item bx = CL.head[0], sr = CL.head[1], ch0 = CL.head[2];
        ok(bx.kind == ScreenCore.K_BOX && sr.kind == ScreenCore.K_SEARCH && ch0.kind == ScreenCore.K_CHIP, "머리 순서: 상자 → 검색줄 → 칩");
        ok(bx.fixed && sr.fixed && !ch0.fixed, "상자·검색줄은 고정, 칩만 가로로 밀린다");
        ok(near(bx.x, 14f) && near(bx.y, 14f) && near(bx.w, 332f), "상자 자리 (여백 14)");
        ok(bx.lines.length >= 2 && near(bx.h, 2f + 8f + bx.lineH * bx.lines.length + 8f), "상자 높이 = 테두리 2 + 안쪽 위아래 8 + 줄 수 × 줄 높이");
        ok(near(sr.y, bx.y + bx.h + 8f) && near(sr.h, 44f), "검색줄은 상자 아래 8, 높이 44");
        ok(near(sr.w, 332f) && near(sr.x, 14f), "좁은 화면에서는 폭 가득");
        ok(near(ch0.y, sr.y + 44f + 4f + 4f), "칩 줄은 검색줄 + 아래 여백 4 + 칩 위 여백 4 아래");
        ok(near(CL.headH, ch0.y + 30f + 4f), "머리 높이 = 칩 줄 끝 + 4");
        ok(near(CL.chipsTop, sr.y + 44f + 4f) && near(CL.chipsBot, CL.headH), "칩 줄 범위(칩 줄만 가로로 밀 수 있는 곳)");
        ScreenCore.Layout CW = ScreenCore.layout(cs, 480f, M);
        ok(near(CW.head[1].w, 340f) && near(CW.head[1].x, 14f + (452f - 340f) / 2f), "넓으면 검색줄은 최대 340 에 가운데");
        ok(near(sr.bx, sr.x + 1f + 14f) && near(sr.btx, sr.x + sr.w - 1f - 8f - 30f) && near(sr.ix, sr.bx + 20f + 8f) && near(sr.iw, sr.btx - 8f - sr.ix) && near(sr.ih, 30f), "검색줄 안: 배지 · 입력칸 · 단추 자리");
        ok(sr.iw > 100f, "입력칸 폭이 쓸 만하다 " + sr.iw);
        ScreenCore.Layout CN = ScreenCore.layout(cs, 120f, M);
        ok(CN.headMaxScroll() > 0f && CN.headContentW > 120f, "칩이 넘치면 가로로 밀린다(상자·검색줄은 안 셈 — 상자는 좁은 폭에 맞춰 줄바꿈)");
        ok(CN.head[0].lines.length > bx.lines.length, "좁으면 상자 글이 더 많은 줄");
        // 굵은 구간 조각
        ok(bx.segs != null && bx.segs.length == bx.lines.length, "줄마다 조각");
        StringBuilder boldAll = new StringBuilder(), allTxt = new StringBuilder();
        for (int k = 0; k < bx.segs.length; k++) for (int q = 0; q < bx.segs[k].length; q++) { allTxt.append(bx.segs[k][q]); if (bx.segBold[k][q]) boldAll.append(bx.segs[k][q]); }
        ok(allTxt.toString().replace(" ", "").equals(notice.replace(" ", "")), "조각을 이으면 원문(공백 제외)");
        ok(boldAll.toString().replace(" ", "").equals(("쿠팡 파트너스 활동" + "일정액의 수수료를 제공받습니다.").replace(" ", "")), "굵은 조각 = 지정한 두 구간만: " + boldAll);
        ScreenCore.Layout CS = ScreenCore.layout(cs, 200f, M);   // 줄이 더 많아져도 구간이 줄을 넘나들며 이어진다
        StringBuilder bold2 = new StringBuilder(); for (int k = 0; k < CS.head[0].segs.length; k++) for (int q = 0; q < CS.head[0].segs[k].length; q++) if (CS.head[0].segBold[k][q]) bold2.append(CS.head[0].segs[k][q]);
        ok(bold2.toString().replace(" ", "").equals(("쿠팡 파트너스 활동" + "일정액의 수수료를 제공받습니다.").replace(" ", "")), "줄이 바뀌어도 굵은 구간이 같다: " + bold2);
        ok(bx.fill != null && bx.fill.role == null && (bx.fill.argb >>> 24) > 0x10 && (bx.fill.argb >>> 24) < 0x30 && (bx.fill.argb & 0xFFFFFF) == 0xFF9500, "상자 바탕 = CSS rgba 를 읽는다 " + (bx.fill == null ? "null" : Integer.toHexString(bx.fill.argb)));
        ok(sr.ac != null && sr.ac.role == null && sr.ac.argb == 0xFFE63329, "검색 강조색 #e63329");
        // 눌림
        ScreenCore.Act hs = CL.hitHead(sr.x + 40f, sr.y + 20f);
        ok(hs != null && hs.a.equals("search"), "검색줄을 누르면 search 행동");
        ok(CL.hitHead(bx.x + 20f, bx.y + 10f) == null, "안내 상자를 눌러도 아무 일 없다");
        ScreenCore.Act hc2 = CL.hitHead(ch0.x + 3f, ch0.y + 5f, 0f);
        ok(hc2 != null && hc2.a.equals("cat"), "칩은 그대로 눌린다");
        ScreenCore.Act hs2 = CL.hitHead(sr.x + 40f, sr.y + 20f, 200f);
        ok(hs2 != null && hs2.a.equals("search"), "칩 줄을 밀어도 검색줄 위치는 그대로(고정)");
        ScreenCore.Act hc3 = CL.hitHead(ch0.x + 3f - 30f, ch0.y + 5f, 30f);
        ok(hc3 != null && hc3.a.equals("cat"), "칩은 민 만큼 보정해서 눌린다");

        // ── 옛 앱 호환: 모르는 새 노드는 건너뛴다(옛 앱 시뮬레이션: 모르는 종류로 바꿔 읽기) ──
        ScreenCore.Screen old = ScreenCore.load(capScreen.replace("\"t\":\"box\"", "\"t\":\"future\"").replace("\"t\":\"search\"", "\"t\":\"future2\""));
        ok(old.head.size() == 1 && old.skipped >= 2, "모르는 노드(옛 앱이 새 상자·검색줄을 만난 경우)는 건너뛰고 칩만 그린다");


        // ── 설정 화면 노드(panel·toggle·navrow·select·field·button 변형) ──
        String setJson = "{\"ok\":true,\"v\":1,\"screen\":\"settings\",\"rev\":\"x\",\"cover\":\"tab\",\"head\":[],\"body\":["
            + "{\"t\":\"panel\",\"pad\":[14,12,14,0],\"kids\":["
            + "{\"t\":\"text\",\"s\":\"알림 설정\",\"size\":14,\"bold\":true},"
            + "{\"t\":\"toggle\",\"key\":\"n.arrive\",\"title\":\"도착 알림\",\"sub\":\"도착 직전에 알려 드려요\",\"on\":true},"
            + "{\"t\":\"toggle\",\"key\":\"n.transfer\",\"title\":\"환승 알림\",\"top\":true,\"on\":false},"
            + "{\"t\":\"navrow\",\"title\":\"출퇴근 브리핑 알림\",\"sub\":\"켜짐\",\"top\":true,\"act\":{\"a\":\"web\",\"v\":\"brief\"}},"
            + "{\"t\":\"field\",\"key\":\"commId\",\"hint\":\"아이디 2~12자\",\"value\":\"\",\"maxlen\":12},"
            + "{\"t\":\"button\",\"s\":\"저장\",\"fill\":\"gold\",\"tc\":\"#121214\",\"bold\":true,\"act\":{\"a\":\"call\",\"v\":\"saveId\"}}"
            + "]},"
            + "{\"t\":\"select\",\"title\":\"다크\",\"sub\":\"어두운 화면\",\"on\":true,\"act\":{\"a\":\"sel\",\"v\":\"dark\"},\"fill\":\"#18181a\",\"onl\":\"#d4af37\",\"prev\":[\"#111\",\"#222\",\"#333\",\"#d4af37\",\"#fff\"]},"
            + "{\"t\":\"select\",\"title\":\"파스텔\",\"on\":false,\"act\":{\"a\":\"sel\",\"v\":\"pastel\"}}]}";
        ScreenCore.Screen ss = ScreenCore.load(setJson);
        ok(ss.cover.equals("tab") && ss.body.size() == 3 && ss.body.get(0).t.equals("panel") && ss.body.get(0).kids.size() == 6, "설정 화면을 읽는다(panel 안에 노드 6개)");
        ScreenCore.Layout SL = ScreenCore.layout(ss, 360f, M);
        ScreenCore.Item pn = null, tg1 = null, tg2 = null, nv = null, fd = null, sbt = null, se1 = null, se2 = null;
        for (ScreenCore.Item it : SL.body) {
            if (it.kind == ScreenCore.K_PANEL) pn = it; else if (it.kind == ScreenCore.K_TOGGLE) { if (tg1 == null) tg1 = it; else tg2 = it; }
            else if (it.kind == ScreenCore.K_NAV) nv = it; else if (it.kind == ScreenCore.K_FIELD) fd = it; else if (it.kind == ScreenCore.K_BUTTON) sbt = it;
            else if (it.kind == ScreenCore.K_SELECT) { if (se1 == null) se1 = it; else se2 = it; }
        }
        ok(pn != null && tg1 != null && tg2 != null && nv != null && fd != null && sbt != null && se1 != null && se2 != null, "배치 결과에 모든 종류가 있다");
        ok(near(pn.x, 14f) && near(pn.y, 12f) && near(pn.w, 332f), "패널 자리(여백 14·12)");
        ok(tg1.x > pn.x && tg1.x + tg1.w < pn.x + pn.w && near(tg1.x, pn.x + 1f + 16f) && near(tg1.w, pn.w - 2f - 32f), "패널 안 노드는 테두리 1 + 안쪽 16 만큼 들어간다");
        ok(pn.h > 0f && near(pn.y + pn.h, sbt.y + sbt.h + 16f + 1f), "패널 높이 = 마지막 자식 끝 + 안쪽 16 + 테두리 1 (" + pn.h + ")");
        ok(tg1.on && !tg2.on && tg1.key.equals("n.arrive") && tg1.act.a.equals("set") && tg1.act.key.equals("n.arrive"), "스위치: 상태·키·set 행동");
        ok(tg1.lines2.length >= 1 && tg2.lines2.length == 0 && tg1.h > tg2.h - 0.01f, "설명 줄이 있으면 더 높거나 같다");
        ok(tg2.top && tg2.h >= 1f + 9f + 25f + 9f - 0.01f, "윗선이 있으면 높이에 1 더해진다 " + tg2.h);
        ok(near(tg1.sx + tg1.sw, tg1.x + tg1.w) && tg1.sy >= tg1.y && tg1.sy + tg1.sh <= tg1.y + tg1.h, "스위치는 오른쪽 끝, 줄 안에");
        ok(ScreenCore.Layout.hits(tg1, tg1.sx + 4f, tg1.sy + 4f) && !ScreenCore.Layout.hits(tg1, tg1.x + 3f, tg1.sy + 4f), "스위치 줄은 스위치(+8dp) 만 눌린다");
        ok(ScreenCore.Layout.hits(tg1, tg1.sx - 6f, tg1.sy + 4f), "스위치 바깥 8dp 까지 눌림(손가락 여유)");
        ok(nv.act.a.equals("web") && nv.act.v.equals("brief") && nv.label.equals("켜짐") && nv.labelW > 0f && ScreenCore.Layout.hits(nv, nv.x + 5f, nv.y + 5f), "이동 줄: web 행동·오른쪽 글·줄 전체 눌림");
        ok(fd.key.equals("commId") && fd.maxlen == 12 && fd.label.equals("아이디 2~12자") && near(fd.h, 44f) && fd.act == null, "입력칸: 키·글자수·힌트·높이 44, 눌림 행동은 앱 내부(편집)");
        ok(sbt.fill.role.equals("gold") && sbt.tc.role == null && sbt.tc.argb == 0xFF121214 && sbt.act.a.equals("call") && sbt.act.v.equals("saveId"), "버튼 변형: 금색 바탕 + CSS 글자색 + call 행동");
        ok(se1.on && !se2.on && se1.act.a.equals("sel") && se1.act.v.equals("dark") && se1.prevC.length == 5 && se2.prevC.length == 0, "고르기 카드: 상태·행동·미리보기 5색");
        ok(se1.fill.role == null && se1.fill.argb == 0xFF18181A && se1.ac.argb == 0xFFD4AF37 && se2.fill.role.equals("card") && se2.ac.role.equals("gold"), "고르기 카드 색: CSS 색 / 기본 역할");
        ok(se1.h >= 4f + 28f + 52f - 0.01f, "고르기 카드 높이 >= 미리보기 칸 + 여백");
        // 눌림: 패널 안 항목도 본문 좌표로 눌린다
        ScreenCore.Act shb = SL.hitBody(sbt.x + 20f, sbt.y + 10f);
        ok(shb != null && shb.a.equals("call") && shb.v.equals("saveId"), "패널 안 버튼 눌림");
        ScreenCore.Act ht = SL.hitBody(tg1.sx + 5f, tg1.sy + 5f);
        ok(ht != null && ht.a.equals("set") && ht.key.equals("n.arrive"), "패널 안 스위치 눌림");
        ok(SL.hitBody(pn.x + 3f, pn.y + 3f) == null, "패널 빈 곳은 아무 일 없다");
        ScreenCore.Act hs3 = SL.hitBody(se2.x + 30f, se2.y + 10f);
        ok(hs3 != null && hs3.a.equals("sel") && hs3.v.equals("pastel"), "고르기 카드 눌림");
        // 검증(거절)
        String t1 = "{\"t\":\"toggle\",\"key\":\"k\",\"title\":\"x\"}";
        ok(!bad(wrapBody(t1)), "스위치 최소 형태는 통과");
        ok(bad(wrapBody("{\"t\":\"toggle\",\"title\":\"x\"}")), "스위치 key 없으면 거절");
        ok(bad(wrapBody("{\"t\":\"toggle\",\"key\":\"한글\",\"title\":\"x\"}")), "스위치 key 에 한글이 있으면 거절");
        ok(bad(wrapBody("{\"t\":\"toggle\",\"key\":\"k\"}")), "스위치 title 없으면 거절");
        ok(bad(wrapBody("{\"t\":\"navrow\",\"title\":\"x\"}")), "이동 줄 act 없으면 거절");
        ok(bad(wrapBody("{\"t\":\"navrow\",\"title\":\"x\",\"act\":{\"a\":\"web\",\"v\":\"a b\"}}")), "web 행동 v 에 공백이 있으면 거절");
        ok(bad(wrapBody("{\"t\":\"navrow\",\"title\":\"x\",\"act\":{\"a\":\"call\"}}")), "call 행동 v 없으면 거절");
        ok(bad(wrapBody("{\"t\":\"select\",\"title\":\"x\",\"act\":{\"a\":\"call\",\"v\":\"q\"}}")), "고르기 카드 행동이 sel 이 아니면 거절");
        ok(bad(wrapBody("{\"t\":\"select\",\"title\":\"x\",\"act\":{\"a\":\"sel\",\"v\":\"q\"},\"prev\":[\"#111\",\"#222\"]}")), "미리보기 색이 5개가 아니면 거절");
        ok(bad(wrapBody("{\"t\":\"select\",\"title\":\"x\",\"act\":{\"a\":\"sel\",\"v\":\"q\"},\"prev\":[\"#111\",\"#222\",\"#333\",\"#444\",\"nope\"]}")), "미리보기 색을 못 읽으면 거절");
        ok(bad(wrapBody("{\"t\":\"field\",\"hint\":\"x\"}")), "입력칸 key 없으면 거절");

        // ── row(한 줄에 같은 폭으로 나란히 — 요일 칸·시각 칸·시험 단추) ──
        String rwJ = "{\"ok\":true,\"v\":1,\"screen\":\"settings\",\"rev\":\"r\",\"cover\":\"tab\",\"head\":[],\"body\":[{\"t\":\"panel\",\"pad\":[10,0,10,0],\"ip\":[10,10,10,10],\"kids\":["
            + "{\"t\":\"row\",\"gap\":6,\"pad\":[0,0,0,6],\"kids\":["
            + "{\"t\":\"button\",\"s\":\"일\",\"h\":36,\"act\":{\"a\":\"call\",\"v\":\"cm.day.0\"}},"
            + "{\"t\":\"button\",\"s\":\"월\",\"h\":36,\"fill\":\"gold\",\"act\":{\"a\":\"call\",\"v\":\"cm.day.1\"}},"
            + "{\"t\":\"button\",\"s\":\"화\",\"h\":36,\"act\":{\"a\":\"call\",\"v\":\"cm.day.2\"}}]},"
            + "{\"t\":\"button\",\"s\":\"아래\",\"h\":40,\"act\":{\"a\":\"refresh\"}}]}]}";
        ScreenCore.Screen rwS = ScreenCore.load(rwJ);
        ScreenCore.Layout rwL = ScreenCore.layout(rwS, 360f, M);
        java.util.List<ScreenCore.Item> rwB = new java.util.ArrayList<ScreenCore.Item>();
        ScreenCore.Item rwPn = null;
        for (ScreenCore.Item it : rwL.body) { if (it.kind == ScreenCore.K_BUTTON) rwB.add(it); else if (it.kind == ScreenCore.K_PANEL) rwPn = it; }
        ok(rwB.size() == 4 && rwPn != null, "row: 안의 단추 3개 + 아래 단추가 배치된다");
        String alJ = "{\"ok\":true,\"v\":1,\"screen\":\"settings\",\"rev\":\"r\",\"cover\":\"tab\",\"head\":[],\"body\":[{\"t\":\"row\",\"gap\":10,\"kids\":["
            + "{\"t\":\"button\",\"s\":\"아라\",\"al\":\"left\",\"h\":42,\"act\":{\"a\":\"call\",\"v\":\"cm.pick.from\"}},"
            + "{\"t\":\"button\",\"s\":\"가운데\",\"h\":42,\"act\":{\"a\":\"call\",\"v\":\"cm.pick.to\"}}]}]}";
        ScreenCore.Layout alL = ScreenCore.layout(ScreenCore.load(alJ), 360f, M);
        java.util.List<ScreenCore.Item> alB = new java.util.ArrayList<ScreenCore.Item>();
        for (ScreenCore.Item it : alL.body) if (it.kind == ScreenCore.K_BUTTON) alB.add(it);
        ok(alB.size() == 2 && alB.get(0).left && !alB.get(1).left, "button al:left — 입력칸처럼 글을 왼쪽에 붙이고 al 없으면 가운데");
        ok(bad(wrapBody("{\"t\":\"button\",\"s\":\"x\",\"al\":\"right\",\"act\":{\"a\":\"refresh\"}}")), "button al 이 left·center 가 아니면 거절");
        float rwIn = rwPn.w - 2f - 20f, rwCol = (rwIn - 12f) / 3f;
        ok(near(rwB.get(0).y, rwB.get(1).y) && near(rwB.get(1).y, rwB.get(2).y), "row: 같은 높이(y)에 놓인다");
        ok(near(rwB.get(0).w, rwCol) && near(rwB.get(1).w, rwCol) && near(rwB.get(2).w, rwCol), "row: 칸 폭이 모두 같다 (" + rwB.get(0).w + " vs " + rwCol + ")");
        ok(near(rwB.get(1).x - (rwB.get(0).x + rwB.get(0).w), 6f) && near(rwB.get(2).x - (rwB.get(1).x + rwB.get(1).w), 6f), "row: 칸 사이 간격 6");
        ok(near(rwB.get(2).x + rwB.get(2).w, rwPn.x + 1f + 10f + rwIn), "row: 마지막 칸이 안쪽 오른쪽 끝에 닿는다");
        ok(near(rwB.get(3).y, rwB.get(0).y + 36f + 6f), "row: 다음 노드는 줄 높이 36 + 아래 여백 6 뒤에 온다");
        ScreenCore.Act rwA1 = rwL.hitBody(rwB.get(1).x + 5f, rwB.get(1).y + 5f), rwA2 = rwL.hitBody(rwB.get(2).x + 5f, rwB.get(2).y + 5f);
        ok(rwA1 != null && rwA1.v.equals("cm.day.1") && rwA2 != null && rwA2.v.equals("cm.day.2"), "row: 칸마다 자기 행동으로 눌린다");
        ok(rwL.hitBody(rwB.get(0).x + rwB.get(0).w + 2f, rwB.get(0).y + 5f) == null, "row: 칸 사이 틈은 눌려도 아무 일 없다");
        ok(bad(wrapBody("{\"t\":\"row\",\"kids\":[]}")), "row: 칸이 없으면 거절");
        ok(bad(wrapBody("{\"t\":\"row\",\"kids\":[{\"t\":\"toggle\",\"key\":\"k\",\"title\":\"x\"}]}")), "row 안에 스위치를 둘 수 없다");
        ok(!bad(wrapBody("{\"t\":\"row\",\"kids\":[{\"t\":\"panel\",\"kids\":[{\"t\":\"text\",\"s\":\"a\"}]},{\"t\":\"panel\",\"kids\":[{\"t\":\"text\",\"s\":\"b\"}]}]}")), "row 안에 panel 을 둘 수 있다(도보 안내 두 칸)");
        ok(bad(wrapBody("{\"t\":\"row\",\"kids\":[{\"t\":\"row\",\"kids\":[{\"t\":\"button\",\"s\":\"a\",\"act\":{\"a\":\"refresh\"}}]}]}")), "row 안에 row 를 둘 수 없다");
        StringBuilder rwNine = new StringBuilder("{\"t\":\"row\",\"kids\":[");
        for (int i = 0; i < 9; i++) { if (i > 0) rwNine.append(','); rwNine.append("{\"t\":\"button\",\"s\":\"a\",\"act\":{\"a\":\"refresh\"}}"); }
        ok(bad(wrapBody(rwNine + "]}")), "row: 9칸은 거절(최대 " + ScreenCore.MAX_ROW + ")");
        ok(bad(wrapBody("{\"t\":\"row\",\"kids\":[{\"t\":\"button\",\"s\":\"a\",\"act\":{\"a\":\"nope\"}}]}")), "row 안 단추의 모르는 행동은 거절");
        ok(bad(wrapBody("{\"t\":\"field\",\"key\":\"k\",\"h\":500}")), "입력칸 높이 범위 밖은 거절");
        // ── 여러 줄 입력칸(글쓰기 내용) ──
        {
            StringBuilder mvLong = new StringBuilder(); for (int i = 0; i < 900; i++) mvLong.append('가');
            ScreenCore.Screen mvS = ScreenCore.load(wrapBody("{\"t\":\"field\",\"key\":\"wb\",\"hint\":\"내용\",\"h\":96,\"maxlen\":1000,\"multi\":true,\"value\":\"" + mvLong + "\"}"));
            ScreenCore.Layout mvL = ScreenCore.layout(mvS, 360f, M);
            ScreenCore.Item mvF = null; for (ScreenCore.Item it : mvL.body) if (it.kind == ScreenCore.K_FIELD) mvF = it;
            ok(mvF != null && mvF.multi && mvF.maxlen == 1000 && mvF.h == 96f && mvF.value.length() == 900, "여러 줄 입력칸: multi/maxlen 1000/높이 96/긴 처음 글");
            ScreenCore.Screen mvS1 = ScreenCore.load(wrapBody("{\"t\":\"field\",\"key\":\"wt\",\"hint\":\"제목\"}"));
            ScreenCore.Item mvF1 = null; for (ScreenCore.Item it : ScreenCore.layout(mvS1, 360f, M).body) if (it.kind == ScreenCore.K_FIELD) mvF1 = it;
            ok(mvF1 != null && !mvF1.multi && mvF1.maxlen == 60, "한 줄 입력칸은 그대로(multi 꺼짐 · maxlen 60)");
            ok(bad(wrapBody("{\"t\":\"field\",\"key\":\"k\",\"maxlen\":1001}")), "입력칸 maxlen 1000 초과는 거절");
            ok(bad(wrapBody("{\"t\":\"field\",\"key\":\"k\",\"h\":161}")), "입력칸 높이 160 초과는 거절");
            ok(bad(wrapBody("{\"t\":\"field\",\"key\":\"k\",\"multi\":\"yes\"}")), "multi 가 참/거짓이 아니면 거절");
        }
        ok(bad(wrapBody("{\"t\":\"panel\",\"kids\":[{\"t\":\"panel\",\"kids\":[]}]}")), "패널 안에 패널은 거절(중첩 금지)");
        ok(bad(wrapBody("{\"t\":\"panel\",\"kids\":[{\"t\":\"grid\",\"items\":[]}]}")), "패널 안에 격자는 거절");
        ok(bad(wrapBody("{\"t\":\"panel\",\"kids\":[{\"t\":\"search\",\"act\":{\"a\":\"search\",\"tpl\":\"https://a/{q}\",\"empty\":\"https://a\"}}]}")), "패널 안에 검색줄은 거절");
        ok(bad(wrapBody("{\"t\":\"panel\",\"fill\":\"junk\",\"kids\":[]}")), "패널 바탕색을 못 읽으면 거절");
        ok(bad(wrapBody("{\"t\":\"panel\"}")), "패널 kids 없으면 거절");
        ok(!bad(wrapBody("{\"t\":\"panel\",\"kids\":[{\"t\":\"future\",\"x\":1},{\"t\":\"text\",\"s\":\"a\"}]}")), "패널 안 모르는 노드는 건너뛰고 통과");
        ScreenCore.Screen so = ScreenCore.load(wrapBody("{\"t\":\"panel\",\"kids\":[{\"t\":\"future\",\"x\":1},{\"t\":\"text\",\"s\":\"a\"}]}"));
        ok(so.skipped == 1 && so.body.get(0).kids.size() == 1, "건너뛴 개수 1, 남은 자식 1");
        ScreenCore.Layout BL = ScreenCore.layout(ScreenCore.load(wrapBody("{\"t\":\"box\",\"s\":\"경고\",\"tc\":\"#ff453a\",\"fill\":\"rgba(255,69,58,.12)\"}")), 360f, M);
        ok(BL.body[0].tc != null && BL.body[0].tc.argb == 0xFFFF453A && BL.body[0].fill.argb != 0, "상자 글자색 tc(CSS 색)");
        ok(bad(wrapBody("{\"t\":\"box\",\"s\":\"x\",\"tc\":\"junk\"}")), "상자 글자색을 못 읽으면 거절");
        ok(ScreenCore.ident("n.arrive_reco") && ScreenCore.ident("a:b-c") && !ScreenCore.ident("") && !ScreenCore.ident("a b") && !ScreenCore.ident("가") && !ScreenCore.ident(new String(new char[41]).replace('\0', 'a')), "식별자 규칙");
        // 옛 앱 시뮬레이션: 새 노드를 모르는 앱은 전부 건너뛰고 '그릴 것이 없다' 로 거절 → 웹 폴백
        String oldSet = setJson.replace("\"panel\"", "\"zz\"").replace("\"select\"", "\"zz2\"");
        ok(bad(oldSet), "새 노드만 있는 화면을 옛 앱이 만나면 거절(→ 웹 폴백)");
        // 설정 화면 배치 시간
        StringBuilder manyT = new StringBuilder();
        for (int i = 0; i < 150; i++) { if (i > 0) manyT.append(','); manyT.append("{\"t\":\"toggle\",\"key\":\"k").append(i).append("\",\"title\":\"항목 ").append(i).append("\",\"sub\":\"설명 설명 설명 설명 설명 설명 설명 설명\",\"top\":true}"); }
        long q0 = System.nanoTime();
        ScreenCore.Layout ML = ScreenCore.layout(ScreenCore.load(wrapBody("{\"t\":\"panel\",\"kids\":[" + manyT + "]}")), 360f, M);
        long qms = (System.nanoTime() - q0) / 1000000L;
        ok(qms < 400 && ML.bodyH > 150f * 30f, "스위치 150개 읽기+배치 " + qms + "ms");

        // ── 맛집 화면: 머리줄(bar) · 장소 카드(place) · 구분선(divider) · 켜진 칩 색 ──
        String fbarJ = "{\"t\":\"bar\",\"pad\":[16,16,16,8],\"title\":\"도착역 맛집\",\"sub\":\"강남역 인근\",\"btn\":\"새로고침\",\"act\":{\"a\":\"refresh\"}}";
        String fchipsJ = "{\"t\":\"chips\",\"pad\":[16,0,16,12],\"gap\":8,\"h\":30,\"onc\":\"gold\",\"onfg\":\"#121214\",\"items\":[{\"label\":\"전체\",\"on\":true,\"act\":{\"a\":\"cat\",\"v\":\"전체\"}},{\"label\":\"카페\",\"act\":{\"a\":\"cat\",\"v\":\"카페\"}}]}";
        String plJ = "{\"t\":\"place\",\"pad\":[12,0,12,10],\"rank\":\"1\",\"name\":\"맛있는 국밥집\",\"sub\":\"국밥 · 역삼로 12\",\"stars\":\"★★★★★\",\"dist\":\"320m\",\"go\":\"길찾기 · 지도 →\",\"act\":{\"a\":\"call\",\"v\":\"fm.c.7\"}}";
        String pbJ = "{\"t\":\"place\",\"pad\":[12,0,12,10],\"rank\":\"\",\"pub\":true,\"name\":\"공공 식당\",\"sub\":\"한식\",\"badge\":\"공공데이터\",\"dist\":\"1.2km\",\"go\":\"길찾기 · 지도 →\",\"act\":{\"a\":\"call\",\"v\":\"fm.p.3\"}}";
        String foodJ = "{\"ok\":true,\"v\":1,\"screen\":\"food\",\"rev\":\"f1:x\",\"cover\":\"tab\",\"head\":[" + fbarJ + "," + fchipsJ + "],\"body\":[" + plJ + ",{\"t\":\"divider\",\"pad\":[12,8,12,0]}," + pbJ + ",{\"t\":\"spacer\",\"h\":80}]}";
        ScreenCore.Screen fs = ScreenCore.load(foodJ);
        ok(fs.head.size() == 2 && fs.body.size() == 4 && fs.skipped == 0 && fs.cover.equals("tab"), "맛집 화면을 읽는다(모르는 노드 없음)");
        ok(bad(foodJ.replace("\"title\":\"도착역 맛집\",", "")), "bar 는 title 필수");
        ok(bad(foodJ.replace("\"btn\":\"새로고침\",\"act\":{\"a\":\"refresh\"}", "\"btn\":\"새로고침\"")), "bar 단추가 있으면 act 필수");
        ok(bad(foodJ.replace("\"name\":\"맛있는 국밥집\",", "")), "place 는 name 필수");
        ok(bad(foodJ.replace("\"v\":\"fm.c.7\"", "\"v\":\"fm c 7\"")), "place 행동 이름이 올바르지 않으면 거절");
        ok(bad(foodJ.replace("\"act\":{\"a\":\"call\",\"v\":\"fm.c.7\"}", "\"x\":1")), "place 는 act 필수");
        ok(bad(foodJ.replace("\"onc\":\"gold\"", "\"onc\":\"nonsense\"")), "칩 켜진 색이 이상하면 거절");
        ScreenCore.Layout FL = ScreenCore.layout(fs, 360f, M);
        ok(FL.head.length == 3 && FL.head[0].kind == ScreenCore.K_BAR && FL.head[0].fixed && FL.head[1].kind == ScreenCore.K_CHIP && !FL.head[1].fixed, "머리 = 머리줄(고정) + 칩(밀림)");
        ScreenCore.Item bar = FL.head[0];
        float btnW = M.width("새로고침", 12f, false) + 30f;
        ok(near(bar.sw, btnW) && near(bar.sx, 16f + (360f - 32f) - btnW), "단추는 오른쪽 끝");
        ok(bar.top && near(bar.tagX, 16f + M.width("도착역 맛집", 18f, true) + 8f), "제목 옆 작은 글은 8 띄워 같은 줄(웹 baseline)");
        ok(near(bar.h, Math.max(18f * 1.4f, 12f * 1.4f + 14f)) && near(bar.y, 16f), "머리줄 높이 = 제목 줄 높이");
        ok(FL.head[1].y >= bar.y + bar.h + 8f - 0.01f && near(FL.chipsTop, bar.y + bar.h + 8f), "칩 줄은 머리줄 아래");
        ok(FL.head[1].ac != null && "gold".equals(FL.head[1].ac.role) && FL.head[1].tc != null && FL.head[1].tc.role == null, "칩 켜진 색: 금색 바탕 · 글자 #121214");
        ok(ScreenCore.layout(s, 360f, M).head[0].ac != null && "orange".equals(ScreenCore.layout(s, 360f, M).head[0].ac.role), "쇼핑 칩은 예전처럼 주황");
        // s204: 시간표 머리(제목줄 · 칩 셋 · 요약)는 head 에 고정 · 이어진 칩 줄 셋은 한 덩어리로 민다
        ScreenCore.Screen tts = ScreenCore.load("{\"ok\":true,\"v\":1,\"screen\":\"maptt\",\"head\":[{\"t\":\"bar\",\"title\":\"서대문 시간표\"},"
            + "{\"t\":\"chips\",\"pad\":[16,4,16,6],\"h\":30,\"items\":[{\"label\":\"5호선\",\"on\":true,\"act\":{\"a\":\"call\",\"v\":\"mt.l.0\"}}]},"
            + "{\"t\":\"chips\",\"pad\":[16,0,16,6],\"h\":28,\"items\":[{\"label\":\"평일\",\"on\":true,\"act\":{\"a\":\"call\",\"v\":\"mt.d.DAY\"}}]},"
            + "{\"t\":\"chips\",\"pad\":[16,0,16,8],\"h\":30,\"items\":[{\"label\":\"상행\",\"on\":true,\"act\":{\"a\":\"call\",\"v\":\"mt.k.0\"}}]},"
            + "{\"t\":\"text\",\"s\":\"첫차 05:45\",\"size\":12}],\"body\":[{\"t\":\"box\",\"s\":\"05시   45\",\"size\":13,\"hl\":[[0,3,\"#b86e00\"]],\"fill\":\"rgba(245,166,35,.2)\",\"line\":\"#f5a623\",\"color\":\"sub\"}]}");
        ScreenCore.Layout TTL = ScreenCore.layout(tts, 360f, M);
        ok(TTL.head.length >= 5 && TTL.head[0].kind == ScreenCore.K_BAR && TTL.head[0].sw == 0f && TTL.head[0].fixed, "시간표 머리: 제목줄은 단추(닫기) 없이 고정");
        ok(near(TTL.chipsTop, TTL.head[1].y - 4f) && near(TTL.chipsBot, TTL.head[3].y + 30f + 8f), "이어진 칩 줄 셋이 한 덩어리 가로 미는 구역");
        ok(TTL.body.length == 1 && TTL.body[0].kind == ScreenCore.K_BOX && TTL.body[0].fill != null && TTL.body[0].line != null, "본문 시(時)줄: 바탕·테두리 강조를 읽는다");
        ScreenCore.Layout narrowF = ScreenCore.layout(ScreenCore.load(foodJ.replace("강남역 인근", "아주아주 긴 역 이름 근처 인근 인근")), 300f, M);
        ok(!narrowF.head[0].top && narrowF.head[0].subY > narrowF.head[0].textY && narrowF.head[0].h > bar.h, "좁으면 작은 글이 아래 줄로 내려간다");
        ScreenCore.Item p0 = FL.body[0], pp = FL.body[2];
        ok(p0.kind == ScreenCore.K_PLACE && near(p0.x, 12f) && near(p0.w, 336f) && near(p0.y, 0f), "장소 카드 자리: 좌우 12");
        ok(near(p0.textX, 12f + 1f + 14f + 24f + 12f) && near(p0.bx, 12f + 1f + 14f), "이름은 순위 동그라미 오른쪽 12 띄움");
        ok(p0.lines.length == 1 && p0.lines2.length == 1 && p0.rank.equals("1") && p0.stars.length() == 5 && !p0.pub, "이름 한 줄 · 업종 줄 · 순위·별점");
        ok(near(p0.starX, p0.textX) && near(p0.distX, p0.starX + M.width("★★★★★", 13f, true) + 8f) && p0.goX > p0.distX + p0.distPw, "한 줄: 별점 → 거리 → 길찾기(간격 8)");
        ok(near(p0.h, 1f + 14f + 21f + 3f + 16.8f + 5f + 20f + 14f + 1f), "카드 높이 = 테두리·안쪽 14·이름 21+3·업종 16.8+5·한 줄 20");
        ok(pp.pub && pp.rank.length() == 0 && pp.stars.length() == 0 && pp.badge.equals("공공데이터") && near(pp.distX, pp.badgeX + pp.badgePw + 8f), "공공데이터 카드: 딱지 → 거리");
        ok(FL.body[1].kind == ScreenCore.K_DIV && near(FL.body[1].y, p0.y + p0.h + 10f + 8f) && near(FL.body[1].h, 1f), "구분선은 카드 아래 간격 10 + 8");
        ScreenCore.Act ph = FL.hitBody(p0.x + 30f, p0.y + 30f);
        ok(ph != null && ph.a.equals("call") && ph.v.equals("fm.c.7"), "카드를 누르면 그 번호");
        ok(FL.hitBody(p0.x + 30f, p0.y + p0.h + 3f) == null, "카드 사이 간격은 무반응");
        ScreenCore.Act ba = FL.hitHead(bar.sx + 5f, bar.sy + 5f);
        ok(ba != null && ba.a.equals("refresh"), "머리줄 단추를 누르면 새로고침");
        ok(FL.hitHead(20f, bar.y + 5f) == null, "머리줄 제목 쪽은 무반응");
        ScreenCore.Act cc2 = FL.hitHead(FL.head[2].x + 3f, FL.chipsTop + 12f);
        ok(cc2 != null && cc2.a.equals("cat") && cc2.v.equals("카페"), "칩을 누르면 그 업종");
        ScreenCore.Screen longName = ScreenCore.load(foodJ.replace("맛있는 국밥집", "아주 긴 가게 이름 아주 긴 가게 이름 아주 긴 가게 이름 아주 긴 가게 이름"));
        ScreenCore.Item ln = ScreenCore.layout(longName, 360f, M).body[0];
        ok(ln.lines.length == 1 && ln.lines[0].endsWith("\u2026") && M.width(ln.lines[0], 15f, true) <= 336f - 2f - 28f - 24f - 12f + 0.01f, "긴 이름은 한 줄로 … 줄임");
        ScreenCore.Screen manyP = ScreenCore.load("{\"ok\":true,\"v\":1,\"screen\":\"food\",\"head\":[],\"body\":[" + plJ.replace("\"sub\":\"국밥 · 역삼로 12\"", "\"sub\":\"아주 긴 업종과 주소 아주 긴 업종과 주소 아주 긴 업종과 주소 아주 긴 업종과 주소 아주 긴 업종과 주소 아주 긴 업종과 주소\"") + "]}");
        ok(ScreenCore.layout(manyP, 360f, M).body[0].lines2.length == 2, "업종/주소는 두 줄까지");
        long tf = System.nanoTime();
        StringBuilder pl300 = new StringBuilder();
        for (int i = 0; i < 300; i++) { if (i > 0) pl300.append(','); pl300.append(plJ.replace("fm.c.7", "fm.c." + i)); }
        ScreenCore.Layout fbig = ScreenCore.layout(ScreenCore.load("{\"ok\":true,\"v\":1,\"screen\":\"food\",\"head\":[],\"body\":[" + pl300 + "]}"), 360f, M);
        long fms = (System.nanoTime() - tf) / 1000000L;
        ok(fms < 300 && fbig.body.length == 300 && fbig.bodyRange(0f, 700f)[1] < 20, "카드 300장 읽기+배치 " + fms + "ms · 보이는 건 몇 장만");

        // ── 뉴스 화면: 뉴스 줄(news) ──
        String nwJ = "{\"t\":\"news\",\"pad\":[14,0,14,0],\"title\":\"코스피 급등 소식\",\"sub\":\"증시 · 3분 전\",\"act\":{\"a\":\"call\",\"v\":\"nw.4\"}}";
        String nchipsJ = "{\"t\":\"chips\",\"pad\":[14,4,14,6],\"gap\":6,\"h\":30,\"onc\":\"gold\",\"onfg\":\"#121214\",\"items\":[{\"label\":\"전체\",\"on\":true,\"act\":{\"a\":\"cat\",\"v\":\"전체\"}},{\"label\":\"증시\",\"act\":{\"a\":\"cat\",\"v\":\"증시\"}}]}";
        String newsJ = "{\"ok\":true,\"v\":1,\"screen\":\"news\",\"rev\":\"n1:x\",\"cover\":\"tab\",\"head\":[" + nchipsJ + "],\"body\":[{\"t\":\"spacer\",\"h\":8}," + nwJ + "," + nwJ.replace("nw.4", "nw.9").replace("코스피 급등 소식", "아주 긴 기사 제목 아주 긴 기사 제목 아주 긴 기사 제목 아주 긴 기사 제목 아주 긴 기사 제목 아주 긴 기사 제목 아주 긴 기사 제목 아주 긴 기사 제목 아주 긴 기사 제목 아주 긴 기사 제목 아주 긴 기사 제목 아주 긴 기사 제목 아주 긴 기사 제목 아주 긴 기사 제목") + ",{\"t\":\"spacer\",\"h\":72}]}";
        ScreenCore.Screen ns = ScreenCore.load(newsJ);
        ok(ns.head.size() == 1 && ns.body.size() == 4 && ns.skipped == 0, "뉴스 화면을 읽는다(모르는 노드 없음)");
        ok(bad(newsJ.replace("\"title\":\"코스피 급등 소식\",", "")), "news 는 title 필수");
        ok(bad(newsJ.replace("\"act\":{\"a\":\"call\",\"v\":\"nw.4\"}", "\"x\":1")), "news 는 act 필수");
        ok(bad(newsJ.replace("\"v\":\"nw.4\"", "\"v\":\"nw 4\"")), "news 행동 이름이 올바르지 않으면 거절");
        ScreenCore.Screen oldNs = ScreenCore.load(newsJ.replace("\"t\":\"news\"", "\"t\":\"future3\""));
        ok(oldNs.skipped == 2 && oldNs.body.size() == 2, "뉴스 줄을 모르는 옛 앱은 건너뛴다(깨지지 않음)");
        ScreenCore.Layout NL = ScreenCore.layout(ns, 360f, M);
        ScreenCore.Item n0 = NL.body[0], n1 = NL.body[1];
        float chevW = M.width("\u203A", 13f, false);
        ok(n0.kind == ScreenCore.K_NEWS && near(n0.x, 14f) && near(n0.w, 332f) && near(n0.y, 8f), "뉴스 줄 자리: 좌우 14, 위 간격 8");
        ok(near(n0.textX, 14f + 4f + 3f + 10f) && near(n0.bx, 14f + 4f), "제목은 금색 막대 오른쪽 10 띄움");
        ok(n0.lines.length == 1 && n0.lines2.length == 1 && near(n0.h, 13f + 14f * 1.45f + 4f + 15f + 13f + 1f), "한 줄 제목 높이 = 위아래 13 + 제목 + 4 + 작은 글 + 선 1");
        ok(near(n0.tagX, 14f + 332f - 4f - chevW), "› 는 오른쪽 끝(안쪽 4)");
        ok(n1.lines.length == ScreenCore.NEWS_MAXLINES && n1.lines[n1.lines.length - 1].endsWith("\u2026") && near(n1.h, 13f + 14f * 1.45f * 4f + 4f + 15f + 13f + 1f), "긴 제목은 4줄까지 … 로 줄임");
        ok(near(n1.y, n0.y + n0.h) && near(NL.bodyH, 8f + n0.h + n1.h + 72f), "줄은 이어 붙고 아래 간격 72");
        ScreenCore.Act na = NL.hitBody(n0.x + 40f, n0.y + 10f);
        ok(na != null && na.a.equals("call") && na.v.equals("nw.4"), "뉴스 줄을 누르면 그 번호");
        long tn = System.nanoTime();
        StringBuilder nw300 = new StringBuilder();
        for (int i = 0; i < 300; i++) { if (i > 0) nw300.append(','); nw300.append(nwJ.replace("nw.4", "nw." + i)); }
        ScreenCore.Layout nbig = ScreenCore.layout(ScreenCore.load("{\"ok\":true,\"v\":1,\"screen\":\"news\",\"head\":[],\"body\":[" + nw300 + "]}"), 360f, M);
        long nms = (System.nanoTime() - tn) / 1000000L;
        ok(nms < 300 && nbig.body.length == 300 && nbig.bodyRange(0f, 700f)[1] < 25, "뉴스 300줄 읽기+배치 " + nms + "ms · 보이는 건 몇 줄만");

        // ── 아이콘 경로(SVG path d) ──
        float[] pc = ScreenCore.pathOps("M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z");
        ok(pc.length > 30 && pc[0] == ScreenCore.OP_M && near(pc[1], 20f) && near(pc[2], 2f), "아이콘 경로를 읽는다(M 20 2 로 시작)");
        ok(pc[3] == ScreenCore.OP_L && near(pc[4], 4f) && near(pc[5], 2f), "H 는 같은 높이의 L 로 풀린다");
        float[] ar = ScreenCore.pathOps("M0 0a5 5 0 0 1 10 0");
        ok(ar.length == 3 + 7 * 2 && ar[3] == ScreenCore.OP_C && near(ar[ar.length - 2], 10f) && near(ar[ar.length - 1], 0f), "호(A)는 곡선 둘로 풀려 끝점이 맞다");
        float[] rel = ScreenCore.pathOps("m1 1 2 0 0 2z");
        ok(rel.length == 3 + 3 + 3 + 1 && near(rel[3 + 1], 3f) && near(rel[3 + 1 + 1], 1f), "m 뒤에 오는 짝은 선(l)으로 읽는다");
        ok(ScreenCore.pathOps("").length == 0, "빈 경로는 그리지 않는다(허용)");
        boolean pbad = true;
        for (String bp : new String[] { "L1 1", "M1", "M1 1x", "M1 1 Z9", "M1 1 a1 1 0 2 1 3 3", "M" + new String(new char[1000]).replace('\0', '1') }) { try { ScreenCore.pathOps(bp); pbad = false; } catch (ScreenCore.ParseError e) { } }
        ok(pbad, "잘못된 경로(M 없음·수 부족·모르는 글자·호 플래그·너무 김)는 거절");

        // ── 아래 탭 막대(tabbar) ──
        String ICON = "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z";
        String tabJ = "{\"t\":\"tabbar\",\"h\":56,\"items\":["
            + "{\"label\":\"커뮤니티\",\"icon\":\"" + ICON + "\",\"act\":{\"a\":\"call\",\"v\":\"tab.community\"}},"
            + "{\"label\":\"노선도\",\"icon\":\"" + ICON + "\",\"act\":{\"a\":\"call\",\"v\":\"tab.map\"}},"
            + "{\"label\":\"홈\",\"icon\":\"" + ICON + "\",\"on\":true,\"act\":{\"a\":\"call\",\"v\":\"tab.home\"}},"
            + "{\"label\":\"쇼핑센터\",\"icon\":\"" + ICON + "\",\"badge\":\"3\",\"act\":{\"a\":\"call\",\"v\":\"tab.shop\"}},"
            + "{\"label\":\"맛집\",\"icon\":\"" + ICON + "\",\"act\":{\"a\":\"call\",\"v\":\"tab.food\"}}]}";
        ScreenCore.Screen ts = ScreenCore.load("{\"ok\":true,\"v\":1,\"screen\":\"tabs\",\"head\":[],\"body\":[" + tabJ + "]}");
        ScreenCore.Layout TL = ScreenCore.layout(ts, 360f, M);
        ok(TL.body.length == 5 && TL.body[0].kind == ScreenCore.K_TAB && near(TL.body[0].w, 72f) && near(TL.body[4].x, 288f) && near(TL.bodyH, 56f), "탭 막대: 다섯 칸이 폭을 똑같이 나눈다(높이 56)");
        ok(TL.body[2].on && !TL.body[1].on && TL.body[3].badge.equals("3") && TL.body[0].pathOps.length > 10, "켜진 칸·배지·아이콘 경로");
        ScreenCore.Act ta = TL.hitBody(150f, 20f);
        ok(ta != null && ta.v.equals("tab.home"), "가운데 칸을 누르면 홈");
        ok(bad(wrapBody(tabJ.replace("M10 20v-6", "Q"))), "탭 아이콘 경로가 틀리면 화면 전체를 거절");
        ok(bad(wrapBody(tabJ.replace("\"label\":\"홈\",", ""))), "탭 칸에 label 없으면 거절");
        ok(bad(wrapBody("{\"t\":\"tabbar\",\"items\":[{\"label\":\"홈\",\"icon\":\"\",\"act\":{\"a\":\"call\",\"v\":\"tab.home\"}}]}")), "탭은 2칸 이상");

        ScreenCore.Screen as0 = ScreenCore.load("{\"ok\":true,\"v\":1,\"screen\":\"chat\",\"anchor\":\"bottom\",\"head\":[],\"body\":[{\"t\":\"spacer\",\"h\":10}]}");
        ok("bottom".equals(as0.anchor) && "".equals(ScreenCore.load("{\"ok\":true,\"v\":1,\"screen\":\"chat\",\"head\":[],\"body\":[{\"t\":\"spacer\",\"h\":10}]}").anchor), "anchor: bottom 을 읽고, 없으면 빈 값");
        ok(bad("{\"ok\":true,\"v\":1,\"screen\":\"chat\",\"anchor\":\"top\",\"head\":[],\"body\":[{\"t\":\"spacer\",\"h\":10}]}"), "anchor: 모르는 값은 거절");

        // ── 게시글 카드(post: 아코디언) · 댓글 · 단추 줄 · 입력줄 ──
        String kidsJ = "[{\"t\":\"text\",\"s\":\"본문 내용입니다 본문 내용입니다\",\"size\":13,\"lh\":1.8,\"pad\":[0,0,0,12]},"
            + "{\"t\":\"btnrow\",\"pad\":[0,0,0,12],\"gap\":8,\"h\":30,\"items\":[{\"label\":\"좋아요 3\",\"act\":{\"a\":\"call\",\"v\":\"bd.r.0.like\"}},{\"label\":\"ㅋㅋ 1\",\"on\":true,\"fill\":\"#0a84ff22\",\"line\":\"#0a84ff\",\"tc\":\"#0a84ff\",\"act\":{\"a\":\"call\",\"v\":\"bd.r.0.lol\"}},{\"label\":\"신고\",\"right\":true,\"act\":{\"a\":\"call\",\"v\":\"bd.x.0\"}}]},"
            + "{\"t\":\"cmt\",\"pad\":[0,10,0,7],\"nick\":\"출근러\",\"s\":\"저도 그랬어요 정말 공감합니다\",\"time\":\"3분 전\"},"
            + "{\"t\":\"cmt\",\"pad\":[0,0,0,7],\"nick\":\"답글러\",\"s\":\"ㅋㅋ\",\"time\":\"방금\",\"ind\":true},"
            + "{\"t\":\"inbar\",\"pad\":[0,8,0,0],\"key\":\"cmt.0\",\"hint\":\"댓글 남기기\",\"btn\":\"등록\",\"h\":36,\"r\":8,\"act\":{\"a\":\"call\",\"v\":\"bd.c.0\"}}]";
        String postJ = "{\"t\":\"post\",\"pad\":[12,0,12,8],\"id\":\"p1\",\"title\":\"오늘 지하철 정말 붐비네요\",\"cat\":\"혼잡\",\"catc\":\"#ff6b35\",\"nick\":\"빨간모자\",\"meta\":\"3분 전 · 조회 12 · 댓글 2\",\"kids\":" + kidsJ + "}";
        String post2J = postJ.replace("\"p1\"", "\"p2\"").replace("bd.", "bd2.").replace("cmt.0", "cmt.1").replace("오늘 지하철 정말 붐비네요", "두번째 글");
        ScreenCore.Screen ps = ScreenCore.load("{\"ok\":true,\"v\":1,\"screen\":\"board\",\"head\":[],\"body\":[" + postJ + "," + post2J + "]}");
        ok(ps.body.size() == 2 && ps.body.get(0).kids.size() == 5 && ps.skipped == 0, "게시글 카드를 읽는다(안 노드 5개)");
        ScreenCore.Layout PL0 = ScreenCore.layout(ps, 360f, M, "");
        ok(PL0.body.length == 4 && PL0.body[0].kind == ScreenCore.K_PANEL && PL0.body[1].kind == ScreenCore.K_POSTH && !PL0.body[1].on && PL0.body[3].kind == ScreenCore.K_POSTH, "모두 접으면 카드마다 틀+머리만 그린다");
        float hdr = PL0.body[1].h;
        ok(near(hdr, 12f + 14f * 1.4f + 8f + 11f * 1.4f + 10f) && near(PL0.body[0].h, 1f + hdr + 1f) && near(PL0.body[2].y, 1f + hdr + 1f + 8f), "접힌 카드 높이 = 위 12 + 제목 + 8 + 메타 + 아래 10 (+테두리 2) 그리고 카드 사이 8");
        ok(PL0.body[1].badge.equals("혼잡") && PL0.body[1].tag.equals("빨간모자") && PL0.body[1].label.startsWith("3분 전"), "머리: 분류 딱지 · 글쓴이 · 메타");
        ok(near(PL0.body[1].textX, 12f + 1f + 14f + M.width("혼잡", 10f, true) + 14f + 8f), "제목은 딱지 오른쪽 8 띄움");
        ScreenCore.Layout PL1 = ScreenCore.layout(ps, 360f, M, "p1");
        ok(PL1.body.length == 12 && PL1.body[1].on && PL1.body[2].kind == ScreenCore.K_DIV, "p1 을 펼치면 구분선 + 안 노드들이 쌓인다");
        int kc = 0, rb = 0, ib = 0; for (ScreenCore.Item q : PL1.body) { if (q.kind == ScreenCore.K_CMT) kc++; if (q.kind == ScreenCore.K_RBTN) rb++; if (q.kind == ScreenCore.K_INBAR) ib++; }
        ok(kc == 2 && rb == 3 && ib == 1, "댓글 2 · 단추 3 · 입력줄 1");
        ScreenCore.Layout PLd = ScreenCore.layout(ps, 360f, M);
        ok(PLd.body[1].on == false && PLd.body.length == 4, "open 표시가 없으면 접힌 채로(기본)");
        ScreenCore.Screen psOpen = ScreenCore.load("{\"ok\":true,\"v\":1,\"screen\":\"board\",\"head\":[],\"body\":[" + postJ.replace("\"kids\"", "\"open\":true,\"kids\"") + "," + post2J + "]}");
        ok(ScreenCore.layout(psOpen, 360f, M).body[1].on && !ScreenCore.layout(psOpen, 360f, M, "").body[1].on && ScreenCore.layout(psOpen, 360f, M, "p2").body[ScreenCore.layout(psOpen, 360f, M, "p2").body.length - 1].kind != ScreenCore.K_POSTH, "엔진의 open 표시를 따르고, openKey 가 있으면 그걸 따른다");
        ScreenCore.Layout PL2 = ScreenCore.layout(ps, 360f, M, "p2");
        ok(PL2.body[1].on == false && PL2.body[PL2.body.length - 1].kind != ScreenCore.K_PANEL && near(PL2.body[2].y, PL0.body[2].y), "p2 를 펼치면 p1 은 접혀 있고 p2 위치는 그대로");
        ScreenCore.Act tg = PL0.hitBody(100f, PL0.body[1].y + 10f);
        ok(tg != null && tg.a.equals("tog") && tg.v.equals("p1"), "머리를 누르면 tog p1");
        ScreenCore.Item inb = null, cm0 = null, rbn = null; for (ScreenCore.Item q : PL1.body) { if (q.kind == ScreenCore.K_INBAR) inb = q; if (q.kind == ScreenCore.K_CMT && cm0 == null) cm0 = q; if (q.kind == ScreenCore.K_RBTN && q.label.equals("신고")) rbn = q; }
        ok(inb != null && inb.act.v.equals("bd.c.0") && inb.key.equals("cmt.0") && near(inb.iw + inb.sw + ScreenCore.INBAR_GAP, inb.w) && near(inb.btx, inb.x + inb.w - inb.sw), "입력줄: 입력칸 + 8 + 단추가 한 줄을 채운다");
        ok(cm0 != null && cm0.lines.length >= 1 && near(cm0.h, 11f * 1.4f + 2f + 12f * 1.5f * cm0.lines.length) && near(cm0.textY, cm0.y + 11f * 1.4f + 2f), "댓글: 글쓴이 줄 + 본문 줄");
        ok(rbn != null && near(rbn.x + rbn.w, PL1.body[1].x + PL1.body[1].w - 14f), "right 단추는 오른쪽 끝에 붙는다");
        ScreenCore.Layout PLn = ScreenCore.layout(ps, 190f, M, "p1");
        ScreenCore.Item rbN = null, lkN = null; for (ScreenCore.Item q : PLn.body) { if (q.kind == ScreenCore.K_RBTN && q.label.equals("신고")) rbN = q; if (q.kind == ScreenCore.K_RBTN && q.label.startsWith("좋아요")) lkN = q; }
        ok(rbN != null && lkN != null && rbN.y > lkN.y + lkN.h && rbN.x + rbN.w <= 190f - 12f - 1f - 13f, "좁아서 한 줄에 안 들어가면 right 단추는 둘째 줄로 내려간다");
        ok(near(PLn.bodyH - ScreenCore.layout(ps, 190f, M, "p1").bodyH, 0f) && rbn != null && near(rbn.y, lkN2(PL1)), "넓으면 같은 줄(둘째 줄 없음)");
        ScreenCore.Act ca = PL1.hitBody(inb.x + 5f, inb.y + 5f);
        ok(ca != null && ca.v.equals("bd.c.0"), "입력줄 자리를 누르면 그 글의 댓글 행동");
        ok(bad(wrapBody(postJ.replace("\"id\":\"p1\"", "\"id\":\"p 1\""))), "post id 가 올바르지 않으면 거절");
        ok(bad(wrapBody(postJ.replace("\"title\":\"오늘 지하철 정말 붐비네요\",", ""))), "post 는 title 필수");
        ok(bad(wrapBody(postJ.replace("{\"t\":\"cmt\",\"pad\":[0,10,0,7]", "{\"t\":\"post\",\"id\":\"z\",\"title\":\"x\",\"kids\":[]}, {\"t\":\"cmt\",\"pad\":[0,10,0,7]"))), "post 안에 post 는 거절");
        ok(bad(wrapBody(postJ.replace("\"nick\":\"출근러\"", "\"nick\":\"\""))), "cmt 는 nick 필수");
        ok(bad(wrapBody(postJ.replace("\"btn\":\"등록\"", "\"btn\":\"\""))), "inbar 는 btn 필수");
        ok(bad(wrapBody(postJ.replace("\"key\":\"cmt.0\"", "\"key\":\"c m t\""))), "inbar key 가 올바르지 않으면 거절");
        ok(bad(wrapBody(postJ.replace("\"v\":\"bd.c.0\"", "\"v\":\"bd c 0\""))), "행동 이름이 올바르지 않으면 거절");
        ScreenCore.Screen oldPs = ScreenCore.load("{\"ok\":true,\"v\":1,\"screen\":\"board\",\"head\":[],\"body\":[" + postJ.replace("\"t\":\"post\"", "\"t\":\"future9\"") + ",{\"t\":\"spacer\",\"h\":8}]}");
        ok(oldPs.skipped == 1 && oldPs.body.size() == 1, "post 를 모르는 옛 앱은 건너뛴다(깨지지 않음)");

        // ── 채팅 말풍선(msg) · 아래 고정 줄(foot) ──
        String msgJ = "{\"t\":\"msg\",\"pad\":[12,0,12,10],\"pre\":\"(2호선)\",\"nick\":\"지하철러\",\"s\":\"오늘 사람 진짜 많네요 다들 힘내세요 오늘 사람 진짜 많네요 다들 힘내세요\",\"time\":\"09:12\",\"go\":\"신고\",\"act\":{\"a\":\"call\",\"v\":\"ch.x.7\"}}";
        String mineJ = "{\"t\":\"msg\",\"pad\":[12,0,12,10],\"mine\":true,\"nick\":\"나\",\"s\":\"안녕하세요\",\"time\":\"09:13\"}";
        String footJ = "{\"t\":\"inbar\",\"pad\":[12,10,12,10],\"key\":\"chat\",\"hint\":\"메시지를 입력하세요...\",\"btn\":\"전송\",\"h\":38,\"r\":19,\"maxlen\":200,\"act\":{\"a\":\"call\",\"v\":\"ch.send\"}}";
        ScreenCore.Screen chs = ScreenCore.load("{\"ok\":true,\"v\":1,\"screen\":\"chat\",\"head\":[],\"body\":[" + msgJ + "," + mineJ + "],\"foot\":[" + footJ + "]}");
        ScreenCore.Layout CHL = ScreenCore.layout(chs, 360f, M);
        ScreenCore.Item m0 = CHL.body[0], m1 = CHL.body[1];
        ok(CHL.body.length == 2 && m0.kind == ScreenCore.K_MSG && !m0.on && m1.on, "말풍선 둘(남의 것 · 내 것)");
        ok(near(m0.x, 12f) && m0.w <= (336f * 0.74f) + 0.01f && m0.lines.length >= 2, "남의 말풍선: 왼쪽 12, 폭은 336 의 74% 이하, 긴 글은 줄바꿈");
        ok(near(m1.x + m1.w, 12f + 336f) && near(m1.w, M.width("안녕하세요", 13f, false) + 22f), "내 말풍선: 오른쪽 끝, 폭은 글 + 좌우 11");
        ok(m0.tag.equals("(2호선) 지하철러") && m1.tag.length() == 0, "남의 것에만 글쓴이 줄");
        ok(near(m0.h, 11f * 1.35f + 3f + 16f + 13f * 1.45f * m0.lines.length + 3f + 10f) && near(m1.y, m0.h + 10f), "말풍선 높이 = 글쓴이 + 풀 + 글 + 시각, 사이 10");
        ScreenCore.Act ra = CHL.hitBody(m0.zoneX + 2f, m0.zoneY + 3f), rb2 = CHL.hitBody(m0.x + 5f, m0.sy + 8f);
        ok(ra != null && ra.v.equals("ch.x.7") && rb2 == null, "'신고' 글자 자리만 눌리고 말풍선 몸통은 안 눌린다");
        ok(CHL.hitBody(m1.x + 3f, m1.sy + 3f) == null, "act 없는 내 말풍선은 안 눌린다");
        ok(CHL.foot.length == 1 && CHL.foot[0].kind == ScreenCore.K_INBAR && near(CHL.footH, 10f + 38f + 10f), "foot: 입력줄 하나, 높이 = 위아래 10 + 38");
        ok(CHL.hitFoot(CHL.foot[0].btx + 4f, CHL.foot[0].y + 4f).v.equals("ch.send") && CHL.hitFoot(5f, 5f) == null, "foot 단추 자리를 누르면 전송 · 바깥은 없음");
        ok(near(CHL.foot[0].iw + CHL.foot[0].sw + ScreenCore.INBAR_GAP, 336f), "foot 입력칸 + 단추 = 줄 폭");
        ok(near(CHL.bodyMaxScroll(500f - CHL.footH), Math.max(0f, CHL.bodyH - (500f - CHL.footH))), "본문 스크롤 한계는 foot 을 뺀 높이로");
        ok(ScreenCore.load("{\"ok\":true,\"v\":1,\"screen\":\"c\",\"head\":[],\"body\":[],\"foot\":[" + footJ + "]}").foot.size() == 1, "foot 만 있는 화면도 읽는다");
        ok(bad("{\"ok\":true,\"v\":1,\"screen\":\"c\",\"head\":[],\"body\":[],\"foot\":{}}"), "foot 이 배열이 아니면 거절");
        ok(bad(wrapBody(msgJ.replace("\"s\":\"오늘 사람 진짜 많네요 다들 힘내세요 오늘 사람 진짜 많네요 다들 힘내세요\",", ""))), "msg 는 s 필수");
        String chipC = "{\"t\":\"chips\",\"items\":[{\"label\":\"2호선\",\"on\":true,\"c\":\"#00a84d\",\"act\":{\"a\":\"cat\",\"v\":\"2호선\"}},{\"label\":\"전체\",\"act\":{\"a\":\"cat\",\"v\":\"all\"}}]}";
        ScreenCore.Layout CCL = ScreenCore.layout(ScreenCore.load("{\"ok\":true,\"v\":1,\"screen\":\"c\",\"head\":[" + chipC + "],\"body\":[]}"), 360f, M);
        ok(CCL.head[0].ac.argb == 0xFF00A84D && CCL.head[1].ac.role.equals("orange"), "칩마다 켜진 색(c)을 줄 수 있다");
        ok(bad("{\"ok\":true,\"v\":1,\"screen\":\"c\",\"head\":[" + chipC.replace("#00a84d", "초록") + "],\"body\":[]}"), "칩 색을 못 읽으면 거절");
        long tp0 = System.nanoTime();
        StringBuilder p60 = new StringBuilder();
        for (int i = 0; i < 90; i++) { if (i > 0) p60.append(','); p60.append(postJ.replace("\"p1\"", "\"p" + i + "\"")); }
        ScreenCore.Layout pbig = ScreenCore.layout(ScreenCore.load("{\"ok\":true,\"v\":1,\"screen\":\"board\",\"head\":[],\"body\":[" + p60 + "]}"), 360f, M, "p45");
        long pms = (System.nanoTime() - tp0) / 1000000L;
        ok(pms < 400 && pbig.bodyRange(0f, 700f)[1] < 30, "글 90개(하나 펼침) 읽기+배치 " + pms + "ms · 보이는 건 몇 개만");

        // ── 시간(400장 배치 + 10만 번 범위 찾기) ──
        long t0 = System.nanoTime();
        ScreenCore.Layout big = ScreenCore.layout(ScreenCore.load(screen(1000)), 360f, M);
        long ms = (System.nanoTime() - t0) / 1000000L;
        ok(ms < 400, "1000장 읽기+배치 " + ms + "ms");
        t0 = System.nanoTime();
        int acc = 0;
        for (int i = 0; i < 100000; i++) { int[] rr = big.bodyRange((i % 1000) * 3f, (i % 1000) * 3f + 700f); acc += rr[1] - rr[0]; }
        long ms2 = (System.nanoTime() - t0) / 1000000L;
        ok(ms2 < 400 && acc > 0, "범위 찾기 10만 번 " + ms2 + "ms");

        // ── 색·스크롤 ──
        ok(ScreenCore.color("#f07830", 0) == 0xFFF07830 && ScreenCore.color("#fff", 0) == 0xFFFFFFFF, "색 읽기 #");
        ok(ScreenCore.color("rgb(10, 20, 30)", 0) == 0xFF0A141E, "색 읽기 rgb()");
        ok(ScreenCore.color("rgba(255,255,255,.5)", 0) == 0x80FFFFFF, "색 읽기 rgba()");
        ok(ScreenCore.color("이상한", 7) == 7 && ScreenCore.color(null, 9) == 9, "못 읽으면 기본값");
        ok(near(ScreenCore.clamp(-5f, 100f), 0f) && near(ScreenCore.clamp(500f, 100f), 100f) && near(ScreenCore.clamp(40f, 100f), 40f), "스크롤 한계");
        ok(near(ScreenCore.rubber(-20f, 100f), -10f) && near(ScreenCore.rubber(140f, 100f), 120f) && near(ScreenCore.rubber(30f, 100f), 30f), "끝에서 저항");
        ok(near(B.bodyMaxScroll(700f), B.bodyH - 700f) && near(B.bodyMaxScroll(1e9f), 0f), "본문 스크롤 한계");

        // ── 홈 탭 경로 입력(inbar 확장 · swap · sug) ──
        String hAct = "{\"a\":\"call\",\"v\":\"x\"}";
        String panel = "{\"t\":\"panel\",\"pad\":[0,0,0,4],\"ip\":[0,0,0,0],\"r\":16,\"kids\":["
            + "{\"t\":\"inbar\",\"key\":\"start\",\"hint\":\"출발지 검색\",\"value\":\"강남\",\"h\":48,\"size\":15,\"bold\":true,\"dot\":\"#0a84ff\",\"bh\":30,\"bsize\":12,\"btn\":\"위치 감지\",\"onc\":\"#0a84ff\",\"ckf\":\"#ffffff\",\"fill\":\"none\",\"line\":\"none\",\"watch\":true,\"act\":" + hAct + "},"
            + "{\"t\":\"swap\",\"size\":34,\"icon\":\"M16 17.01V10h-2v7.01h-3L15 21l4-3.99h-3zM9 3L5 6.99h3V14h2V6.99h3L9 3z\",\"act\":" + hAct + "},"
            + "{\"t\":\"divider\"},"
            + "{\"t\":\"inbar\",\"key\":\"dest\",\"hint\":\"도착지 검색\",\"h\":48,\"size\":15,\"dot\":\"#ff3b30\",\"bh\":30,\"bsize\":12,\"btn\":\"경로 탐색\",\"watch\":true,\"act\":" + hAct + "},"
            + "{\"t\":\"sug\",\"badge\":\"지하철\",\"name\":\"강남역\",\"sub\":\"2호선\",\"act\":" + hAct + "},"
            + "{\"t\":\"sug\",\"name\":\"기준시각 현재\",\"sub\":\"평일\",\"last\":true,\"btn\":\"현재\",\"bact\":" + hAct + ",\"act\":" + hAct + "}]}";
        ScreenCore.Screen hsNew = ScreenCore.load(wrapBody(panel));
        ScreenCore.Layout HL = ScreenCore.layout(hsNew, 360f, M);
        int nIn = 0, nSw = 0, nSug = 0; ScreenCore.Item swI = null, in0 = null, in1 = null, sg0 = null, sg1 = null;
        for (ScreenCore.Item q : HL.body) {
            if (q.kind == ScreenCore.K_INBAR) { nIn++; if (in0 == null) in0 = q; else in1 = q; }
            if (q.kind == ScreenCore.K_SWAP) { nSw++; swI = q; }
            if (q.kind == ScreenCore.K_SUG) { nSug++; if (sg0 == null) sg0 = q; else sg1 = q; }
        }
        ok(nIn == 2 && nSw == 1 && nSug == 2, "홈 카드: 입력줄 2 · 바꾸기 1 · 목록줄 2");
        ok(in0 != null && in0.dotC != null && in0.bold && in0.watch && near(in0.sh, 30f) && near(in0.size2, 12f) && near(in0.bty, in0.y + 9f), "입력줄: 동그라미·굵게·단추 높이 30 가운데");
        ok(in0 != null && near(in0.textX, in0.x + 34f) && near(in0.bx, in0.x + 19f), "입력줄: 동그라미 오른쪽에서 글자 시작");
        ok(swI != null && in0 != null && in1 != null && near(swI.y + swI.h / 2f, in0.y + in0.h) && in1.y > in0.y + in0.h, "바꾸기 단추는 두 줄 경계 한가운데(높이 안 차지)");
        ok(in1 != null && swI != null && near(in1.y, in0.y + 48f + 1f), "바꾸기 단추는 높이를 쓰지 않는다(분리선 1 만)");
        ok(sg0 != null && near(sg0.h, ScreenCore.SUG_H) && sg0.badgeW > 0f && sg0.sw == 0f && sg0.act2 == null, "목록줄: 높이 44 · 딱지");
        ok(sg1 != null && sg1.go.equals("현재") && sg1.act2 != null && sg1.sw > 0f && sg1.btx + sg1.sw <= sg1.x + sg1.w && sg1.on, "목록줄: 오른쪽 작은 단추 · 마지막 표시");
        ok(bad(wrapBody("{\"t\":\"swap\",\"size\":34}")) && bad(wrapBody("{\"t\":\"sug\",\"act\":" + hAct + "}")) && bad(wrapBody("{\"t\":\"sug\",\"name\":\"a\",\"btn\":\"x\",\"act\":" + hAct + "}")), "swap/sug 모양이 틀리면 거절");
        ok(bad(wrapBody("{\"t\":\"inbar\",\"key\":\"k\",\"btn\":\"x\",\"bh\":10,\"act\":" + hAct + "}")), "inbar bh 10 은 거절");
        float expectH = 2f + 48f + 1f + 48f + ScreenCore.SUG_H * 2f + ScreenCore.SUG_BOX_GAP * 2f + 4f;
        ok(near(HL.bodyH, expectH), "홈 카드 높이 = 줄 높이의 합 (" + HL.bodyH + " vs " + expectH + ")");
        ScreenCore.Item hit = null;
        for (int i = HL.body.length - 1; i >= 0; i--) { ScreenCore.Item q = HL.body[i]; if (q.act != null && ScreenCore.Layout.hits(q, swI.x + swI.w / 2f, in0.y + in0.h)) { hit = q; break; } }
        ok(hit == swI, "경계를 누르면 바꾸기 단추가 눌린다(뒤에서부터 찾기)");

        // ── 경로 결과 머리줄(rhd) ──
        String fav = "{\"a\":\"call\",\"v\":\"rh.fav\"}", cls = "{\"a\":\"call\",\"v\":\"rh.close\"}";
        ScreenCore.Layout RL = ScreenCore.layout(ScreenCore.load(wrapBody("{\"t\":\"rhd\",\"num\":\"24\",\"unit\":\"분\",\"s\":\"부평 \u2192 두정\",\"btn\":\"즐겨찾기\",\"act\":" + fav + ",\"xact\":" + cls + ",\"pad\":[0,0,0,8]}")), 360f, M);
        ScreenCore.Item rh = RL.body.length == 1 ? RL.body[0] : null;
        ok(rh != null && rh.kind == ScreenCore.K_RHD && near(rh.h, ScreenCore.RHD_H) && rh.lines[0].equals("24") && rh.label.equals("분") && rh.go.equals("부평 \u2192 두정"), "머리줄: 숫자·단위·구간명");
        ok(rh != null && near(RL.bodyH, ScreenCore.RHD_H + 8f), "머리줄 높이 = 34 + 아래 여백");
        ok(rh != null && rh.sw > 0f && rh.on && rh.btx + ScreenCore.RHD_X <= rh.x + rh.w + 0.01f && rh.sx + rh.sw <= rh.btx, "머리줄: 즐겨찾기 알약은 닫기 × 왼쪽, 둘 다 줄 안");
        ok(rh != null && rh.zoneX > rh.tagX && rh.zoneX + 20f < rh.sx, "머리줄: 구간명은 단위 오른쪽 · 알약 왼쪽");
        ok(rh != null && ScreenCore.Layout.hits(rh, rh.sx + 4f, rh.sy + 4f) && ScreenCore.Layout.hits(rh, rh.btx + 4f, rh.bty + 4f) && !ScreenCore.Layout.hits(rh, rh.x + 10f, rh.y + 10f), "머리줄: 두 단추 자리만 눌린다");
        ok(rh != null && ScreenCore.Layout.rhdAct(rh, rh.sx + 4f).v.equals("rh.fav") && ScreenCore.Layout.rhdAct(rh, rh.btx + 4f).v.equals("rh.close"), "머리줄: 누른 자리에 맞는 행동(즐겨찾기/닫기)");
        ScreenCore.Layout RL2 = ScreenCore.layout(ScreenCore.load(wrapBody("{\"t\":\"rhd\",\"num\":\"7\",\"unit\":\"분\",\"s\":\"가나다\",\"xact\":" + cls + "}")), 360f, M);
        ScreenCore.Item rh2 = RL2.body.length == 1 ? RL2.body[0] : null;
        ok(rh2 != null && rh2.sw == 0f && rh2.on && rh2.act != null && ScreenCore.Layout.rhdAct(rh2, rh2.btx + 4f).v.equals("rh.close") && ScreenCore.Layout.hits(rh2, rh2.btx + 4f, rh2.bty + 4f), "즐겨찾기가 없으면 닫기 × 만");
        ScreenCore.Layout RL3 = ScreenCore.layout(ScreenCore.load(wrapBody("{\"t\":\"rhd\",\"num\":\"24\",\"unit\":\"분\",\"s\":\"아주아주아주아주아주아주아주아주아주아주아주긴출발역이름 \u2192 아주아주아주아주아주아주아주아주아주긴도착역이름\",\"btn\":\"즐겨찾기\",\"act\":" + fav + ",\"xact\":" + cls + "}")), 280f, M);
        ok(RL3.body.length == 1 && RL3.body[0].go.length() > 0 && RL3.body[0].go.endsWith("\u2026") && RL3.body[0].zoneX + M.width(RL3.body[0].go, ScreenCore.RHD_ROUTE, false) <= RL3.body[0].sx + 0.5f, "긴 구간명은 …으로 줄여 알약을 안 덮는다");
        ScreenCore.Layout RL4 = ScreenCore.layout(ScreenCore.load(wrapBody("{\"t\":\"rhd\",\"msg\":\"버스만으로 갈 수 있는 경로가 없어요\",\"btn\":\"즐겨찾기\",\"act\":" + fav + ",\"xact\":" + cls + "}")), 360f, M);
        ScreenCore.Item rh4 = RL4.body.length == 1 ? RL4.body[0] : null;
        ok(rh4 != null && "m".equals(rh4.tag) && rh4.go.equals("버스만으로 갈 수 있는 경로가 없어요") && near(rh4.zoneX, rh4.x) && rh4.label.length() == 0 && rh4.sw > 0f && rh4.on, "안내 한 줄: 왼쪽 끝에서 시작 · 숫자·단위 없음 · 단추는 그대로");
        ok(RL4.body[0].zoneX + M.width(RL4.body[0].go, ScreenCore.RHD_MSG, true) <= RL4.body[0].sx + 0.5f, "안내 한 줄은 즐겨찾기 알약을 안 덮는다");
        ok(bad(wrapBody("{\"t\":\"rhd\",\"unit\":\"분\",\"xact\":" + cls + "}")) && bad(wrapBody("{\"t\":\"rhd\",\"num\":\"1\"}")) && bad(wrapBody("{\"t\":\"rhd\",\"num\":\"1\",\"btn\":\"x\"}")), "머리줄 모양이 틀리면 거절(num 없음 · 누를 곳 없음 · btn 인데 act 없음)");

        // ── 구간 타임라인(trk) ──
        String trkCells = "[{\"w\":64,\"n\":\"도보\",\"nc\":\"sub\",\"ns\":9,\"np\":2,\"rc\":\"#8e8e93\",\"dk\":\"e\",\"dc\":\"#d4af37\",\"t\":\"3분\",\"tc\":\"gold\",\"ts\":9,\"tb\":true,\"ti\":0},"
                + "{\"w\":64,\"n\":\"아라역4번출구가아주길다\",\"nc\":\"text\",\"ns\":10,\"nb\":true,\"g\":\"6번\",\"gk\":\"t\",\"gc\":\"#30d158\",\"gs\":7,\"lc\":\"#8e8e93\",\"rc\":\"#30d158\",\"dk\":\"r\",\"dc\":\"#30d158\",\"t\":\"12:04\",\"tc\":\"sub\",\"ts\":9,\"ti\":1},"
                + "{\"w\":108,\"n\":\"부산\",\"nc\":\"#ff9500\",\"ns\":11,\"nb\":true,\"g\":\"KTX 도착\",\"gk\":\"p\",\"gc\":\"#ff9500\",\"gs\":7.5,\"gx\":5,\"lc\":\"#ff9500\",\"dk\":\"m\",\"dc\":\"#ff9500\",\"dc2\":\"#8e8e93\",\"rc\":\"#8e8e93\",\"t\":\"15:27 \u00b7 총 3시간 5분\",\"tc\":\"gold\",\"ts\":10,\"tb\":true,\"ti\":-1}]";
        String trkJson = "{\"ok\":true,\"v\":1,\"screen\":\"t\",\"cover\":\"tab\",\"head\":[{\"t\":\"trk\",\"pad\":[14,6,14,6],\"cells\":" + trkCells + "}],\"body\":[{\"t\":\"spacer\",\"h\":0}]}";
        ScreenCore.Layout TKL = ScreenCore.layout(ScreenCore.load(trkJson), 200f, M);
        ok(TKL.head.length == 3 && TKL.head[0].kind == ScreenCore.K_TRK && near(TKL.head[0].x, 14f) && near(TKL.head[1].x, 14f + 64f) && near(TKL.head[2].x, 14f + 128f) && near(TKL.head[2].w, 108f), "타임라인: 칸이 가로로 이어 놓인다(폭은 엔진이 정한 값)");
        ok(near(TKL.headH, 6f + ScreenCore.TRK_H + 6f), "타임라인: 높이 = 여백 + 93");
        ok(near(TKL.headContentW, 14f + 64f + 64f + 108f + 14f), "타임라인: 내용 폭 = 여백 + 칸 폭의 합");
        ok(TKL.chipsTop >= 0f && TKL.chipsBot > TKL.chipsTop, "타임라인: 가로로 미는 줄 범위가 잡힌다");
        ok(TKL.head[0].lines.length == 1 && TKL.head[0].lines[0].equals("도보") && near(TKL.head[0].nameBot, ScreenCore.TRK_NAME_H - 2f), "타임라인: 도보 이름은 아래 여백 2");
        ok(TKL.head[1].lines.length == 1 && TKL.head[1].lines[0].endsWith("\u2026"), "타임라인: 긴 이름은 한 줄(웹 nowrap), 넘으면 …");
        ok(TKL.head[1].label.equals("6번") && "t".equals(TKL.head[1].gk) && TKL.head[1].lc != null && TKL.head[1].rc != null && "r".equals(TKL.head[1].dk) && TKL.head[1].ti == 1, "타임라인: 배지 · 선 · 점 종류 · 추적 번호를 엔진 값 그대로");
        ok(TKL.head[0].lc == null && TKL.head[0].rc != null && "e".equals(TKL.head[0].dk), "타임라인: 맨앞 칸은 왼쪽 선 없음");
        ok(TKL.head[2].dc2 != null && TKL.head[2].badgeTw > 0f && TKL.head[2].badgeTw + 2f * TKL.head[2].gx <= TKL.head[2].w && TKL.head[2].time.contains("3시간"), "타임라인: 도보 가운데 점의 둘째 색 · 알약은 칸 안 · 시각 글");
        ok(TKL.head[2].tb && near(TKL.head[2].tsz, 10f) && TKL.head[1].ti == 1 && TKL.head[2].ti == -1, "타임라인: 시각 글 크기·굵기 · 추적 안 하는 칸은 -1");
        ok(TKL.body.length == 0 && near(TKL.bodyH, 0f) && near(TKL.headMaxScroll(), 264f - 200f), "타임라인: 본문은 높이 0 · 넘친 폭만큼 가로로 밀린다");
        String tmJson = "{\"ok\":true,\"v\":1,\"screen\":\"t\",\"head\":[],\"body\":[{\"t\":\"tmap\",\"h\":213,\"hv\":24,\"hmin\":137,\"hmax\":231,\"pts\":[{\"la\":37.5,\"lo\":127.0,\"k\":\"m\"}]}]}";
        try {
            ScreenCore.winH = 800f; ScreenCore.Layout TML = ScreenCore.layout(ScreenCore.load(tmJson), 360f, M);
            ok(near(TML.body[0].h, 192f), "지도: 높이 = 창 높이의 24% (800 → 192)");
            ScreenCore.winH = 300f; TML = ScreenCore.layout(ScreenCore.load(tmJson), 360f, M);
            ok(near(TML.body[0].h, 137f), "지도: 작은 창은 최소 137");
            ScreenCore.winH = 2000f; TML = ScreenCore.layout(ScreenCore.load(tmJson), 360f, M);
            ok(near(TML.body[0].h, 231f), "지도: 큰 창은 최대 231");
            ScreenCore.winH = 0f; TML = ScreenCore.layout(ScreenCore.load(tmJson), 360f, M);
            ok(near(TML.body[0].h, 213f), "지도: 창 높이를 모르면 엔진 h");
        } catch (Exception e) { ok(false, "지도 hv 테스트 예외: " + e); } finally { ScreenCore.winH = 0f; }
        ok(bad(trkJson.replace("\"gk\":\"t\"", "\"gk\":\"z\"")) && bad(trkJson.replace("\"dk\":\"e\"", "\"dk\":\"q\"")) && bad(trkJson.replace("\"w\":64,\"n\":\"도보\"", "\"w\":9999,\"n\":\"도보\"")), "타임라인: 모르는 배지·점 종류·칸 폭은 거절");
        ok(bad("{\"ok\":true,\"v\":1,\"screen\":\"t\",\"head\":[{\"t\":\"trk\",\"cells\":[]}],\"body\":[]}"), "타임라인: 칸이 없으면 거절");
        ok(bad(trkJson.replace("\"nc\":\"sub\"", "\"nc\":\"nope\"")), "타임라인: 읽을 수 없는 색은 거절");
        // 내 위치 마커(mk): 칸 가운데 사이 · 대기 배지 · 검증
        String mkBase = "\"mk\":{\"f\":0,\"t\":1,\"r\":0.5,\"ms\":3000,\"d\":14,\"c\":\"#0a84ff\",\"bc\":\"#ffffff\",\"bw\":2,\"pu\":\"b\",\"pms\":1300,\"hc\":\"rgba(10,132,255,.85)\",\"hw\":6,\"ring\":\"rgba(10,132,255,.7)\",\"rms\":1400}";
        String mkJson = trkJson.replace("\"cells\":" + trkCells, "\"cells\":" + trkCells + "," + mkBase);
        ScreenCore.Layout MKL = ScreenCore.layout(ScreenCore.load(mkJson), 200f, M);
        ok(MKL.mk != null && near(MKL.mk.x0, 14f + 32f) && near(MKL.mk.x1, 14f + 64f + 32f) && near(MKL.mk.x(0.5f), 14f + 64f), "마커: 시작·끝 칸 가운데와 그 사이 비율 위치");
        ok(near(MKL.mk.y, 6f + ScreenCore.TRK_NAME_H + ScreenCore.TRK_BADGE_H + ScreenCore.TRK_DOT_Y) && MKL.mk.btw == 0f && MKL.mk.ccol != null && MKL.mk.hcol != null && MKL.mk.rcol != null, "마커: 점 높이는 칸의 점 자리 · 배지 없음 · 색을 읽는다");
        ok(near(MKL.mk.ms, 3000f) && near(MKL.mk.pms, 1300f) && "b".equals(MKL.mk.pu), "마커: 이동 시간·맥박 주기·종류는 엔진 값 그대로");
        ok(ScreenCore.layout(ScreenCore.load(trkJson), 200f, M).mk == null, "마커: 없으면 없음");
        // 본문(패널 안) 타임라인: 칸 줄이 틀 안에서 가로로 밀리고, 마커·밀림 범위는 배치가 알려 준다(경로 결과 카드 — 예전엔 본문에서 칸이 통째로 사라졌다)
        String bandJson = "{\"ok\":true,\"v\":1,\"screen\":\"r\",\"cover\":\"tab\",\"head\":[],\"body\":[{\"t\":\"panel\",\"pad\":[0,4,0,8],\"ip\":[12,12,12,8],\"kids\":[{\"t\":\"text\",\"s\":\"가\",\"size\":13},{\"t\":\"trk\",\"pad\":[14,6,14,6],\"cells\":" + trkCells + "," + mkBase + "}]}]}";
        ScreenCore.Layout BDL = ScreenCore.layout(ScreenCore.load(bandJson), 200f, M);
        int bdN = 0; ScreenCore.Item bd0 = null;
        for (ScreenCore.Item q : BDL.body) if (q.kind == ScreenCore.K_TRK) { bdN++; if (bd0 == null) bd0 = q; }
        ok(bdN == 3 && bd0.band && bd0.cl > 0f && bd0.cr > bd0.cl && BDL.bandTop >= 0f && BDL.bandBot - BDL.bandTop >= ScreenCore.TRK_H - 0.1f, "본문 타임라인: 칸 셋이 본문에 놓이고 가로 틀·세로 범위가 잡힌다");
        ok(BDL.bandMax() > 0f && near(BDL.bandMax(), 14f + 64f + 64f + 108f + 14f - BDL.bandView), "본문 타임라인: 틀보다 넘친 폭만큼 가로로 밀린다");
        ok(BDL.mk != null && BDL.mkBody && near(BDL.mk.x0, bd0.x + 32f) && near(BDL.mk.x(0.5f), bd0.x + 64f), "본문 타임라인: 내 위치 마커가 칸 가운데 사이에 놓인다");
        ok(BDL.bandSig.length() > 0 && ScreenCore.layout(ScreenCore.load(bandJson), 200f, M).bandSig.equals(BDL.bandSig), "본문 타임라인: 같은 내용이면 같은 표시(바뀔 때만 앱이 마커로 다시 맞춘다)");
        String mkWait = mkJson.replace("\"pu\":\"b\"", "\"pu\":\"w\",\"bt\":\"대기 중 · 350m\",\"bg\":\"#ff9f0a\",\"btc\":\"#ffffff\",\"bz\":9");
        ScreenCore.Layout MWL = ScreenCore.layout(ScreenCore.load(mkWait), 200f, M);
        ok(MWL.mk.btw > 0f && near(MWL.mk.bth, 9f * 1.25f + 2f) && MWL.mk.bty >= 6f + ScreenCore.TRK_NAME_H && MWL.mk.bty + MWL.mk.bth <= 6f + ScreenCore.TRK_NAME_H + ScreenCore.TRK_BADGE_H && "w".equals(MWL.mk.pu) && MWL.mk.gcol != null, "마커: 대기 배지는 노선 줄 안에 가운데 놓인다");
        ok(bad(mkJson.replace("\"f\":0,\"t\":1", "\"f\":0,\"t\":7")) && bad(mkJson.replace("\"pu\":\"b\"", "\"pu\":\"x\"")) && bad(mkJson.replace("\"c\":\"#0a84ff\"", "\"c\":\"nope\"")) && bad(mkJson.replace("\"r\":0.5", "\"r\":1.5")) && bad(mkJson.replace("\"d\":14", "\"d\":99")), "마커: 칸 번호·종류·색·비율·크기가 틀리면 거절");

        // ── 혼잡도 카드(cgh · gauge · chart · cars · box hc) ──
        String cgBars = "[{\"h\":\"0\",\"o\":true},{\"h\":\"1\",\"v\":30,\"c\":\"#34c759\",\"a\":0.75},{\"h\":\"2\",\"v\":60,\"c\":\"#ff9f0a\",\"a\":1,\"u\":true},{\"h\":\"3\",\"v\":90,\"c\":\"#ff3b30\",\"a\":0.75},{\"h\":\"4\",\"v\":12,\"c\":\"#34c759\",\"a\":0.75}]";
        String cgJson = "{\"ok\":true,\"v\":1,\"screen\":\"cong\",\"cover\":\"tab\",\"bg\":\"card\",\"head\":["
            + "{\"t\":\"cgh\",\"pad\":[0,0,0,0],\"lab\":\"지하철\",\"nm\":\"강남\",\"meta\":\"14시 기준\",\"st\":\"혼잡\",\"sc\":\"#ff6b35\"},"
            + "{\"t\":\"gauge\",\"pad\":[0,10,0,0],\"s\":\"혼잡도\",\"txt\":\"47%\",\"v\":47,\"c\":\"#ff9f0a\"},"
            + "{\"t\":\"chart\",\"pad\":[0,10,0,0],\"ttl\":\"24시간 혼잡도\",\"src\":\"(통계 기반)\",\"pk\":\"3시 피크\",\"bh\":112,\"ci\":2,\"co\":\"#ffffff\",\"cs\":\"sig1\",\"bars\":" + cgBars + "},"
            + "{\"t\":\"cars\",\"pad\":[0,10,0,0],\"ttl\":\"칸별 혼잡 예상도\",\"cells\":[{\"n\":\"1칸\",\"l\":\"여유\",\"p\":\"20%\",\"c\":\"#34c759\"},{\"n\":\"2칸\",\"l\":\"혼잡\",\"p\":\"70%\",\"c\":\"#ff6b35\"}]}"
            + "],\"body\":[{\"t\":\"spacer\",\"h\":0}]}";
        ScreenCore.Layout CGL = ScreenCore.layout(ScreenCore.load(cgJson), 300f, M);
        ScreenCore.Item cgh = null, gau = null, cht = null, car = null; int cgHb = 0;
        for (ScreenCore.Item q : CGL.head) { if (q.kind == ScreenCore.K_CGH) cgh = q; else if (q.kind == ScreenCore.K_GAUGE) gau = q; else if (q.kind == ScreenCore.K_CHART) cht = q; else if (q.kind == ScreenCore.K_CARS) car = q; else if (q.kind == ScreenCore.K_HBAR) cgHb++; }
        ok(cgh != null && gau != null && cht != null && car != null && cgHb == 5, "혼잡도: 머리줄·게이지·차트 틀·칸별·막대 5개를 배치한다");
        ok(cgh.fixed && gau.fixed && cht.fixed && car.fixed, "혼잡도: 막대줄 말고는 가로로 안 밀린다");
        ok(near(cgh.h, ScreenCore.CGH_H) && cgh.t1.equals("지하철 ") && cgh.t2.equals("강남") && cgh.t3.equals("14시 기준") && cgh.label.equals("혼잡") && cgh.sc != null && cgh.f2 > 0f, "혼잡도: 머리줄 글 조각·단계 글 폭·색");
        ok(near(gau.y, cgh.y + cgh.h + 10f) && near(gau.h, ScreenCore.GAUGE_H) && near(gau.f1, 0.47f) && gau.value.equals("47%"), "혼잡도: 게이지는 머리줄 아래 10 · 비율 0.47");
        float panelH = ScreenCore.CHART_PADT + ScreenCore.CHART_HDR_H + ScreenCore.CHART_HDR_GAP + 112f + ScreenCore.CHART_SCROLL_PB + ScreenCore.CHART_PADB;
        ok(near(cht.h, panelH) && near(cht.y, gau.y + gau.h + 10f) && cht.t1.equals("24시간 혼잡도") && cht.t2.equals("(통계 기반)") && cht.t3.equals("3시 피크"), "혼잡도: 차트 틀 높이 = 머리 + 막대 영역 + 여백");
        ScreenCore.Item b0 = null, b2 = null; for (ScreenCore.Item q : CGL.head) if (q.kind == ScreenCore.K_HBAR) { if (b0 == null) b0 = q; if (q.on) b2 = q; }
        ok(b0.top && !b2.top && b2.on && near(b2.f1, 60f) && near(b2.alpha, 1f) && near(b0.w, ScreenCore.CHART_COL_W) && near(b0.y, cht.y + ScreenCore.CHART_PADT + ScreenCore.CHART_HDR_H + ScreenCore.CHART_HDR_GAP), "혼잡도: 막대 — 운행 없음/지금/높이/투명도 · 막대줄 위치");
        float innerL = ScreenCore.CHART_PADL, innerW = 300f - innerL, spacer = innerW / 2f - ScreenCore.CHART_COL_W / 2f;
        ok(near(b0.x, innerL + spacer), "혼잡도: 첫 막대 앞에 반 폭 여백(어느 막대든 가운데에 올 수 있다)");
        float want = b2.x + ScreenCore.CHART_COL_W / 2f - (innerL + innerW / 2f);
        ok(near(CGL.initScrollX, want) && CGL.ctrSig.equals("sig1") && CGL.initScrollX > 0f && CGL.initScrollX <= CGL.headMaxScroll() + 0.01f, "혼잡도: 지금 막대를 가운데로 맞출 위치 · 내용 표시");
        ok(CGL.chipsTop >= 0f && near(CGL.chipsTop, b0.y) && near(CGL.chipsBot, b0.y + 112f + ScreenCore.CHART_SCROLL_PB), "혼잡도: 막대줄만 가로로 민다(손가락 영역)");
        ok(near(car.y, cht.y + cht.h + 10f) && near(car.f2, ScreenCore.CARS_TTL_H + ScreenCore.CARS_TTL_GAP) && near(car.f3, ScreenCore.CARS_CELL_H) && car.ca.length == 2 && car.sa.length == 6 && near(car.f1, (300f - ScreenCore.CARS_GAP) / 2f), "혼잡도: 칸별은 칸 폭을 똑같이 나눈다 · 글 세 줄씩");
        ok(near(CGL.headH, car.y + car.h) && near(CGL.headMaxScroll(), CGL.headContentW - 300f) && CGL.headMaxScroll() > 0f, "혼잡도: 머리 높이 = 마지막 조각 아래 · 막대가 넘친 폭만큼 밀린다");
        ok(ScreenCore.layout(ScreenCore.load(cgJson.replace("\"ci\":2", "\"ci\":-1")), 300f, M).initScrollX == 0f, "혼잡도: 지금 막대가 없으면 처음 위치");
        String cgEmpty = cgJson.replace(cgBars, "[]").replace("\"ci\":2", "\"ci\":-1").replace(",\"pk\":\"3시 피크\"", ",\"pk\":\"-\"");
        ScreenCore.Layout CGE = ScreenCore.layout(ScreenCore.load(cgEmpty), 300f, M);
        ok(CGE.chipsTop < 0f && near(CGE.headMaxScroll(), 0f), "혼잡도: 막대가 없는 차트(대기 상태)는 밀리지 않는다");
        String msgOnly = "{\"ok\":true,\"v\":1,\"screen\":\"cong\",\"head\":[{\"t\":\"cars\",\"ttl\":\"칸별\",\"cells\":[],\"msg\":\"출발역 설정 후 표시됩니다\"}],\"body\":[]}";
        ScreenCore.Layout CGM = ScreenCore.layout(ScreenCore.load(msgOnly), 300f, M);
        ok(CGM.head[0].ca.length == 0 && CGM.head[0].value.startsWith("출발역") && near(CGM.head[0].h, ScreenCore.CARS_TTL_H + ScreenCore.CARS_TTL_GAP + ScreenCore.CARS_MSG_H), "혼잡도: 칸이 없으면 안내 글 한 줄");
        ok(bad(msgOnly.replace("\"msg\":\"출발역 설정 후 표시됩니다\"", "\"msg\":\"\"")), "혼잡도: 칸도 안내 글도 없으면 거절");
        ok(bad(cgJson.replace("\"v\":47", "\"v\":147")) && bad(cgJson.replace("\"sc\":\"#ff6b35\"", "\"sc\":\"nope\"")) && bad(cgJson.replace("\"ci\":2", "\"ci\":9")) && bad(cgJson.replace("\"bh\":112", "\"bh\":9")) && bad(cgJson.replace("\"c\":\"#ff9f0a\",\"a\":1,\"u\":true", "\"c\":\"#ff9f0a\",\"a\":3,\"u\":true")), "혼잡도: 비율·색·막대 번호·높이·투명도가 틀리면 거절");
        StringBuilder cgMany = new StringBuilder(); for (int i = 0; i < 49; i++) { if (i > 0) cgMany.append(','); cgMany.append("{\"h\":\"x\",\"v\":5,\"c\":\"#fff\"}"); }
        ok(bad(cgJson.replace(cgBars, "[" + cgMany + "]").replace("\"ci\":2", "\"ci\":-1")), "혼잡도: 막대가 너무 많으면 거절");
        // 좁은 폭: 긴 이름은 말줄임, 단계 글자는 남는다 / box 의 굵은 구간 색(hc)
        String cgNarrow = cgJson.replace("\"nm\":\"강남\"", "\"nm\":\"구로디지털단지구로디지털단지구로디지털단지\"");
        ScreenCore.Item nh = ScreenCore.layout(ScreenCore.load(cgNarrow), 160f, M).head[0];
        ok(nh.t2.endsWith("\u2026") && nh.f1 + M.width(nh.t2, ScreenCore.CGH_NAME, true) + nh.f2 + ScreenCore.CGH_GAP <= 160.5f, "혼잡도: 좁으면 이름을 줄이고 단계 글자는 지킨다");
        String bxJson = "{\"ok\":true,\"v\":1,\"screen\":\"cong\",\"head\":[{\"t\":\"box\",\"s\":\"평균 25명 최대 30명\",\"hl\":[[3,6]],\"hc\":\"#ff6b35\",\"size\":12}],\"body\":[]}";
        ScreenCore.Item cgBx = ScreenCore.layout(ScreenCore.load(bxJson), 300f, M).head[0];
        ok(cgBx.ac2 != null && cgBx.segs != null && bad(bxJson.replace("#ff6b35", "nope")), "box: 굵은 구간 색(hc)을 읽고 나쁜 색은 거절");
        ok(ScreenCore.layout(ScreenCore.load(bxJson.replace("\"hc\":\"#ff6b35\",", "")), 300f, M).head[0].ac2 == null, "box: hc 가 없으면 글 색 그대로");

        // ── AI 승무원 카드(aih · text hl 색) ──
        String aiIcon = "M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z";
        String aiJson = "{\"ok\":true,\"v\":1,\"screen\":\"ai\",\"cover\":\"tab\",\"bg\":\"card\",\"head\":["
            + "{\"t\":\"aih\",\"pad\":[0,0,0,10],\"s\":\"부평 → 두정 · 남은시간: 50분\",\"icon\":\"" + aiIcon + "\",\"done\":\"갱신 중...\",\"to\":1792464000000,\"act\":{\"a\":\"call\",\"v\":\"ai.refresh\"}},"
            + "{\"t\":\"text\",\"pad\":[0,0,0,7],\"s\":\"부평에서 신도림까지 갈아타요\",\"size\":14,\"lh\":1.5,\"color\":\"text\",\"hl\":[[0,2,\"#2f7cf6\"],[5,8,\"#1a7a2e\"]]}"
            + "],\"body\":[{\"t\":\"spacer\",\"h\":0}]}";
        ScreenCore.Layout AIL = ScreenCore.layout(ScreenCore.load(aiJson), 320f, M);
        ScreenCore.Item aih = AIL.head[0], aitx = AIL.head[1];
        ok(aih.kind == ScreenCore.K_AIH && near(aih.h, ScreenCore.AIH_H) && aih.ln == 1792464000000L && aih.lines.length == 1 && aih.lines[0].startsWith("부평") && aih.act != null && !aih.on, "AI: 머리줄 — 제목 한 줄 · 마감 시각(ms 그대로) · 새로고침 행동");
        ok(near(aih.sx, 320f - ScreenCore.AIH_BTN_W) && near(aih.sw, ScreenCore.AIH_BTN_W) && aih.f1 > 0f && near(aih.f2, 320f - ScreenCore.AIH_BTN_W - ScreenCore.AIH_GAP) && aih.pathOps.length > 0 && aih.fixed, "AI: 단추 · 알약 자리 · 아이콘 경로 · 고정");
        ok(AIL.hitHead(320f - 10f, 10f) != null && AIL.hitHead(20f, 10f) == null && AIL.hitHead(320f - 60f, 10f) == null, "AI: 새로고침 단추 자리만 눌린다(제목·알약은 안 눌린다)");
        ok(near(aitx.y, aih.y + aih.h + 10f) && aitx.segs != null && aitx.segCol != null && aitx.segCol[0].length == aitx.segs[0].length, "AI: 문단은 머리줄 아래 10 · 조각마다 색 칸");
        int coloredSegs = 0; for (ScreenCore.Col cq : aitx.segCol[0]) if (cq != null) coloredSegs++;
        ok(coloredSegs == 2 && aitx.segBold[0][0] && aitx.segCol[0][0] != null && aitx.segCol[0][0].argb == 0xFF2F7CF6, "AI: 굵은 구간 둘에 엔진이 준 색");
        String aiOff = aiJson.replace(",\"act\":{\"a\":\"call\",\"v\":\"ai.refresh\"}", ",\"bd\":true");
        ScreenCore.Item aiD = ScreenCore.layout(ScreenCore.load(aiOff), 320f, M).head[0];
        ok(aiD.on && aiD.act == null && ScreenCore.layout(ScreenCore.load(aiOff), 320f, M).hitHead(310f, 10f) == null, "AI: 생성 중(bd)이면 단추가 안 눌린다");
        ScreenCore.Item aiN = ScreenCore.layout(ScreenCore.load(aiJson.replace("\"to\":1792464000000,", "")), 320f, M).head[0];
        ok(aiN.ln == 0L && aiN.f1 == 0f, "AI: 마감 시각이 없으면 알약 자리도 없다");
        ok(bad(aiJson.replace("\"to\":1792464000000", "\"to\":\"x\"")) && bad(aiJson.replace("\"to\":1792464000000", "\"to\":-5")) && bad(aiJson.replace("\"s\":\"부평 → 두정 · 남은시간: 50분\"", "\"s\":\"\"")) && bad(aiJson.replace("\"#2f7cf6\"", "\"nope\"")) && bad(aiJson.replace("[0,2,\"#2f7cf6\"]", "[0,2,5]")), "AI: 나쁜 마감 시각·빈 제목·읽을 수 없는 색·글 아닌 색은 거절");
        ScreenCore.Layout AIP = ScreenCore.layout(ScreenCore.load(aiJson.replace("[[0,2,\"#2f7cf6\"],[5,8,\"#1a7a2e\"]]", "[[0,2],[5,8]]")), 320f, M);
        ok(AIP.head[1].segCol == null && AIP.head[1].segs != null, "AI: 색이 없는 hl 은 예전처럼(굵게만)");

        // ── 홈 '실시간 대화' 게시판(lth · ltr · inbar 둥근 아이콘 단추 bicon) ──
        String ltIcon = "M2.01 21L23 12 2.01 3 2 10l15 2-15 2z";
        String ltJson = "{\"ok\":true,\"v\":1,\"screen\":\"talk\",\"cover\":\"tab\",\"bg\":\"card\",\"head\":["
            + "{\"t\":\"lth\",\"pad\":[0,0,0,4],\"s\":\"실시간 대화\",\"tail\":\"\u203a\",\"dot\":\"#ff3b30\",\"act\":{\"a\":\"call\",\"v\":\"tk.open\"}},"
            + "{\"t\":\"ltr\",\"pad\":[0,0,0,5],\"nick\":\"지하철러\",\"s\":\"오늘도 출근길 힘내요\",\"time\":\"08:41\"},"
            + "{\"t\":\"ltr\",\"pad\":[0,0,0,0],\"nick\":\"아주아주긴닉네임을가진사람입니다\",\"s\":\"아주 긴 글이 오른쪽 시각과 겹치지 않고 말줄임으로 끝나야 합니다 정말로요 정말로요\",\"time\":\"08:42\"}"
            + "],\"body\":[{\"t\":\"spacer\",\"h\":0}],\"foot\":["
            + "{\"t\":\"inbar\",\"pad\":[0,10,0,0],\"key\":\"talk.in\",\"hint\":\"실시간 대화 남기기...\",\"btn\":\"보내기\",\"bicon\":\"" + ltIcon + "\",\"h\":38,\"bh\":38,\"r\":18,\"maxlen\":100,\"size\":13,\"act\":{\"a\":\"call\",\"v\":\"tk.send\"}}]}";
        ScreenCore.Layout LTL = ScreenCore.layout(ScreenCore.load(ltJson), 300f, M);
        ScreenCore.Item lth = LTL.head[0], ltr1 = LTL.head[1], ltr2 = LTL.head[2], ltib = LTL.foot[0];
        ok(lth.kind == ScreenCore.K_LTH && near(lth.h, ScreenCore.LTH_H) && lth.t1.equals("실시간 대화") && lth.t2.equals("\u203a") && lth.f2 > lth.f1 && lth.dotC != null && lth.act != null, "대화: 머리줄 — 제목 · 꼬리 글 · 색 점 · 행동");
        ok(ltr1.kind == ScreenCore.K_LTR && near(ltr1.h, ScreenCore.LTR_H) && near(ltr1.y, lth.y + lth.h + 4f) && near(ltr2.y, ltr1.y + ltr1.h + 5f), "대화: 줄 높이 20 · 줄 사이 5 · 머리줄 아래 4");
        ok(near(ltr1.f2 + M.width("08:41", ScreenCore.LTR_TIME, false), 300f) && ltr1.t1.equals("지하철러") && ltr1.f1 > ltr1.x, "대화: 시각은 오른쪽 끝 · 글은 닉네임 뒤");
        ok(ltr2.t1.endsWith("\u2026") && M.width(ltr2.t1, ScreenCore.LTR_NICK, true) <= ScreenCore.LTR_NICK_MAX + 0.5f && ltr2.t2.endsWith("\u2026") && ltr2.f1 + M.width(ltr2.t2, ScreenCore.LTR_TXT, false) + ScreenCore.LTR_GAP <= ltr2.f2 + 0.5f, "대화: 긴 닉네임(80)·긴 글은 말줄임 — 시각과 겹치지 않는다");
        ok(LTL.hitHead(50f, 8f) != null && LTL.hitHead(50f, 30f) == null, "대화: 머리줄 전체가 눌리고 대화 줄은 안 눌린다");
        ok(ltib.kind == ScreenCore.K_INBAR && near(ltib.sw, 38f) && near(ltib.sh, 38f) && ltib.pathOps.length > 0 && near(ltib.btx, 300f - 38f) && ltib.iw > 150f, "입력줄: 둥근 아이콘 단추(지름 38) · 입력칸 폭");
        ok(LTL.hitFoot(300f - 19f, 10f + 19f) != null, "입력줄: 둥근 단추 자리가 눌린다");
        ok(bad(ltJson.replace("\"s\":\"실시간 대화\"", "\"s\":\"\"")) && bad(ltJson.replace("\"s\":\"오늘도 출근길 힘내요\"", "\"s\":\"\"")) && bad(ltJson.replace("\"dot\":\"#ff3b30\"", "\"dot\":\"nope\"")) && bad(ltJson.replace("\"bh\":38", "\"bh\":10")), "대화: 글 없는 줄 · 나쁜 색 · 너무 작은 아이콘 단추는 거절");
        ScreenCore.Item ltNo = ScreenCore.layout(ScreenCore.load(ltJson.replace(",\"act\":{\"a\":\"call\",\"v\":\"tk.open\"}},{\"t\":\"ltr\",\"pad\":[0,0,0,5]", "},{\"t\":\"ltr\",\"pad\":[0,0,0,5]")), 300f, M).head[0];
        ok(ltNo.act == null, "대화: 행동이 없으면 머리줄도 안 눌린다");

        // ── 안내창(dlg) · 같은 폭 단추(btnrow eq) ──
        String dlJson = "{\"ok\":true,\"v\":1,\"screen\":\"dlg\",\"bg\":\"card\",\"dlg\":{\"w\":340,\"maxh\":0.85,\"dim\":0.5,\"top\":0.42,\"r\":18,\"fit\":true,\"fill\":\"rgba(20,22,28,0.92)\",\"line\":\"border\",\"tap\":{\"a\":\"call\",\"v\":\"dl.no\"}},"
            + "\"head\":[{\"t\":\"text\",\"pad\":[26,18,26,5],\"s\":\"안내창 제목\",\"size\":16,\"bold\":true,\"align\":\"center\",\"color\":\"white\"},"
            + "{\"t\":\"text\",\"pad\":[26,0,26,18],\"s\":\"조금 더 긴 둘째 줄 글입니다\",\"size\":13,\"align\":\"center\",\"color\":\"white\"},"
            + "{\"t\":\"btnrow\",\"pad\":[22,0,22,22],\"gap\":10,\"h\":46,\"eq\":true,\"bsize\":15,\"r\":11,\"items\":[{\"label\":\"취소\",\"act\":{\"a\":\"call\",\"v\":\"dl.no\"}},{\"label\":\"설정 열기\",\"fill\":\"#2f7cf6\",\"line\":\"#2f7cf6\",\"tc\":\"#ffffff\",\"act\":{\"a\":\"call\",\"v\":\"dl.ok\"}}]}],"
            + "\"body\":[{\"t\":\"spacer\",\"h\":0}]}";
        ScreenCore.Screen dlS = ScreenCore.load(dlJson);
        ok(dlS.dlg != null && near(dlS.dlg.w, 340f) && near(dlS.dlg.top, 0.42f) && near(dlS.dlg.r, 18f) && dlS.dlg.fit && dlS.dlg.tap != null && "dl.no".equals(dlS.dlg.tap.v), "안내창: dlg 값(너비·위치·모서리·fit·바깥 누름)을 읽는다");
        ScreenCore.Layout DLL = ScreenCore.layout(dlS, 340f, M);
        ok(DLL.bgCol != null && DLL.bgCol.argb != 0 && DLL.lineCol != null && near(DLL.dlgR, 18f), "안내창: 카드 바탕·테두리·모서리가 배치 결과에 실린다");
        float dfit = 340f - (340f - 52f) + M.width("조금 더 긴 둘째 줄 글입니다", 13f, false);
        ok(DLL.fitW > 0f && near(DLL.fitW, dfit) && DLL.fitW < 340f, "안내창 fit: 가장 긴 글 줄에 맞춘 너비 " + DLL.fitW + " vs " + dfit);
        ok(ScreenCore.layout(ScreenCore.load(dlJson.replace("\"fit\":true", "\"fit\":false")), 340f, M).fitW == 0f && ScreenCore.layout(ScreenCore.load(aiJson), 320f, M).fitW == 0f && ScreenCore.load(aiJson).dlg == null, "안내창: fit 이 아니거나 안내창이 아니면 fitW 0 · dlg 없음");
        ScreenCore.Item db1 = null, db2 = null; for (ScreenCore.Item q : DLL.head) if (q.kind == ScreenCore.K_RBTN) { if (db1 == null) db1 = q; else db2 = q; }
        ok(db1 != null && db2 != null && near(db1.w, db2.w) && near(db1.w, (340f - 44f - 10f) / 2f) && near(db2.x, db1.x + db1.w + 10f) && near(db1.h, 46f) && near(db1.size, 15f) && near(db1.radius, 11f) && db2.fill.argb == 0xFF2F7CF6, "단추 줄(eq): 폭을 똑같이 나누고 글자·모서리·색은 엔진이 정한 대로");
        ok(DLL.hitHead(60f, DLL.head[2].y + 20f) != null && "dl.no".equals(DLL.hitHead(60f, DLL.head[2].y + 20f).v) && "dl.ok".equals(DLL.hitHead(300f, DLL.head[2].y + 20f).v) && DLL.hitHead(60f, 10f) == null, "단추 줄: 왼쪽은 취소 · 오른쪽은 설정 열기 · 글 줄은 안 눌린다");
        ok(bad(dlJson.replace("\"w\":340", "\"w\":50")) && bad(dlJson.replace("\"maxh\":0.85", "\"maxh\":0.1")) && bad(dlJson.replace("\"dim\":0.5", "\"dim\":0.99")) && bad(dlJson.replace("\"fill\":\"rgba(20,22,28,0.92)\"", "\"fill\":\"nope\"")) && bad(dlJson.replace("\"dlg\":{", "\"dlg\":[1],\"x\":{")) && bad(dlJson.replace("\"v\":\"dl.no\"}},", "\"v\":\"\"}},")), "안내창: 범위 밖 값 · 읽을 수 없는 색 · 객체가 아닌 dlg · 이름 없는 행동은 거절");

        // ── 알약 글자(pill: 미리보기 라벨) ──
        String pvJson = "{\"ok\":true,\"v\":1,\"screen\":\"pvl\",\"cover\":\"tab\",\"bg\":\"card\",\"head\":[{\"t\":\"pill\",\"pad\":[0,0,0,10],\"s\":\"예상 경로 · 오후 2:30\",\"size\":11,\"bold\":true,\"tc\":\"#ff9500\",\"fill\":\"rgba(255,149,0,0.14)\",\"ph\":11,\"pv\":4,\"r\":9}],\"body\":[{\"t\":\"spacer\",\"h\":0}]}";
        ScreenCore.Layout PVL = ScreenCore.layout(ScreenCore.load(pvJson), 300f, M);
        ScreenCore.Item pil = PVL.head[0];
        float pw = M.width("예상 경로 · 오후 2:30", 11f, true) + 22f;
        ok(pil.kind == ScreenCore.K_PILL && near(pil.w, pw) && near(pil.h, 11f * 1.35f + 8f) && near(pil.x, 0f) && pil.t1.equals("예상 경로 · 오후 2:30"), "알약: 폭 = 글 폭 + 좌우 여백 " + pil.w + " vs " + pw);
        ok(near(PVL.head[0].y, 0f) && PVL.bodyH >= 0f, "알약: 위에 붙는다");
        ScreenCore.Layout PVN = ScreenCore.layout(ScreenCore.load(pvJson.replace("예상 경로 · 오후 2:30", "아주아주아주아주아주아주아주아주아주아주아주아주아주 긴 라벨 글자입니다 정말로 깁니다")), 120f, M);
        ok(PVN.head[0].w <= 120f + 0.5f && PVN.head[0].t1.endsWith("\u2026"), "알약: 칸보다 길면 말줄임 " + PVN.head[0].w);
        ok(bad(pvJson.replace("\"s\":\"예상 경로 · 오후 2:30\"", "\"s\":\"\"")) && bad(pvJson.replace("\"tc\":\"#ff9500\"", "\"tc\":\"zzz\"")), "알약: 글이 없거나 색을 못 읽으면 거절");

        // ── 앱 본체 통신 보호(netAllowed · netTimeout) ──
        ok(ScreenCore.netAllowed("https://route-v2.phg0643.workers.dev/screen/dlg") && ScreenCore.netAllowed("https://board-writer.phg0643.workers.dev/talks?x=1") && ScreenCore.netAllowed("https://gentle-lab-7e47subway-api.phg0643.workers.dev"), "통신: 길동무 서버 세 곳은 허용");
        ok(!ScreenCore.netAllowed("http://route-v2.phg0643.workers.dev/x") && !ScreenCore.netAllowed("https://evil.example/x") && !ScreenCore.netAllowed("https://route-v2.phg0643.workers.dev.evil.com/x") && !ScreenCore.netAllowed("https://route-v2.phg0643.workers.dev@evil.com/x") && !ScreenCore.netAllowed("https://evil.com\\@route-v2.phg0643.workers.dev/x") && !ScreenCore.netAllowed("https://route-v2.phg0643.workers.dev:8443/x") && !ScreenCore.netAllowed("https://user:pw@route-v2.phg0643.workers.dev/x") && !ScreenCore.netAllowed(null) && !ScreenCore.netAllowed("") && !ScreenCore.netAllowed("file:///etc/passwd") && !ScreenCore.netAllowed("https://route-v2.phg0643.workers.dev /x"), "통신: 다른 곳 · http · 주소 속임수 · 포트 · 사용자 정보는 거절");
        ok(ScreenCore.netTimeout(0) == 8000 && ScreenCore.netTimeout(-5) == 8000 && ScreenCore.netTimeout(100) == 1000 && ScreenCore.netTimeout(5000) == 5000 && ScreenCore.netTimeout(999999) == 20000 && ScreenCore.netTimeout(Double.NaN) == 8000, "통신: 제한 시간은 1~20초(기본 8초)");

        ok(NetPost.post("https://evil.example/x", "a", 1000).status == -1 && "blocked".equals(NetPost.post("http://localhost:1/x", "a", 1000).err) && "too-long".equals(NetPost.post("https://route-v2.phg0643.workers.dev/x", new String(new char[ScreenCore.NET_MAX_REQ + 1]), 1000).err), "통신: 허용 밖 주소·너무 긴 본문은 보내지 않고 거절");

        // ── 화면 바탕 색(bg) ──
        String bgBase = "{\"ok\":true,\"v\":1,\"screen\":\"x\",\"head\":[],\"body\":[{\"t\":\"spacer\",\"h\":4}]";
        ok("bg".equals(ScreenCore.layout(ScreenCore.load(bgBase + "}"), 300f, M).bg) && "card".equals(ScreenCore.layout(ScreenCore.load(bgBase + ",\"bg\":\"card\"}"), 300f, M).bg) && "card2".equals(ScreenCore.layout(ScreenCore.load(bgBase + ",\"bg\":\"card2\"}"), 300f, M).bg), "화면 바탕: 기본 bg · card · card2");
        ok(bad(bgBase + ",\"bg\":\"gold\"}") && bad(bgBase + ",\"bg\":\"#fff\"}"), "화면 바탕은 bg/card/card2 만");

        // ── 캐릭터 장면(scene) ──
        String scBase = "{\"ok\":true,\"v\":1,\"screen\":\"x\",\"head\":[],\"body\":[";
        String scJ = "{\\\"ok\\\":true,\\\"mode\\\":\\\"idle\\\"}";
        ScreenCore.Layout SCL = ScreenCore.layout(ScreenCore.load(scBase + "{\"t\":\"scene\",\"h\":170,\"r\":12,\"pad\":[0,0,0,8],\"sc\":\"" + scJ + "\"}]}"), 300f, M);
        ScreenCore.Item sci = null; for (ScreenCore.Item q : SCL.body) if (q.kind == ScreenCore.K_SCENE) sci = q;
        ok(sci != null && sci.h == 170f && sci.radius == 12f && sci.value.startsWith("{\"ok\":true") && Math.abs(SCL.bodyH - 178f) < 0.5f, "scene: 높이 · 모서리 · 엔진 글(JSON)을 그대로 쥔다 " + (sci == null ? "" : sci.h) + "/" + SCL.bodyH);
        ok(bad(scBase + "{\"t\":\"scene\",\"h\":170}]}") && bad(scBase + "{\"t\":\"scene\",\"sc\":\"\"}]}") && bad(scBase + "{\"t\":\"scene\",\"h\":20,\"sc\":\"x\"}]}"), "scene: sc 없음 · 너무 낮음은 거절");
        ok(bad(scBase + "{\"t\":\"scene\",\"sc\":\"" + new String(new char[ScreenCore.SCENE_MAX]).replace('\0', 'a') + "\"}]}"), "scene: 너무 긴 글은 거절");

        // ── 두 쪽 카드(panel sc2: 옆으로 밀면 지하철 객실 장면) ──
        {
            String tp_pk = "{\"t\":\"text\",\"s\":\"가\"},{\"t\":\"text\",\"s\":\"나\"}";
            ScreenCore.Layout tp_PL = ScreenCore.layout(ScreenCore.load(scBase + "{\"t\":\"panel\",\"sc2\":\"" + scJ + "\",\"kids\":[" + tp_pk + "]},{\"t\":\"text\",\"s\":\"뒤\"}]}"), 300f, M);
            ScreenCore.Item tp_pgI = null; int tp_pgIdx = -1; for (int q = 0; q < tp_PL.body.length; q++) if (tp_PL.body[q].kind == ScreenCore.K_PANEL) { tp_pgI = tp_PL.body[q]; tp_pgIdx = q; }
            ok(tp_pgI != null && tp_pgI.sc2.startsWith("{\"ok\":true") && tp_pgI.pgN == 2 && tp_pgIdx + 2 < tp_PL.body.length, "panel sc2: 두 번째 쪽 글을 쥐고 첫 쪽 칸 수(pgN)를 안다 pgN=" + (tp_pgI == null ? -1 : tp_pgI.pgN));
            boolean inside = true; for (int q = 1; q <= 2; q++) { ScreenCore.Item k = tp_PL.body[tp_pgIdx + q]; if (k.y < tp_pgI.y || k.y + k.h > tp_pgI.y + tp_pgI.h + 0.5f) inside = false; }
            ok(inside && tp_PL.body[tp_pgIdx + 3].y >= tp_pgI.y + tp_pgI.h - 0.5f, "panel sc2: 뒤따르는 pgN 칸은 카드 안에 있고 그 다음 칸은 카드 밖이다");
            ScreenCore.Layout tp_PL0 = ScreenCore.layout(ScreenCore.load(scBase + "{\"t\":\"panel\",\"kids\":[" + tp_pk + "]}]}"), 300f, M);
            ScreenCore.Item tp_p0 = null; for (ScreenCore.Item q : tp_PL0.body) if (q.kind == ScreenCore.K_PANEL) tp_p0 = q;
            ok(tp_p0 != null && tp_p0.pgN == 0 && tp_p0.sc2.length() == 0 && Math.abs(tp_p0.h - tp_pgI.h) < 0.5f, "panel sc2 없으면 한 쪽 카드 그대로(높이도 같다)");
            ScreenCore.Layout tp_PL2 = ScreenCore.layout(ScreenCore.load(scBase + "{\"t\":\"panel\",\"sc2\":\"" + new String(new char[ScreenCore.SCENE_MAX]).replace('\0', 'a') + "\",\"kids\":[" + tp_pk + "]}]}"), 300f, M);
            ScreenCore.Item tp_p2 = null; for (ScreenCore.Item q : tp_PL2.body) if (q.kind == ScreenCore.K_PANEL) tp_p2 = q;
            ok(tp_p2 != null && tp_p2.sc2.length() == 0 && tp_p2.pgN == 0, "panel sc2: 너무 긴 글은 객실 쪽을 버리고 한 쪽 카드로(카드는 살린다)");
        }

        // ── 타일 지도 노드(tmap) ──
        try {
            ScreenCore.Screen tms = ScreenCore.load("{\"ok\":true,\"v\":1,\"screen\":\"map\",\"head\":[],\"body\":[{\"t\":\"tmap\",\"h\":210,\"r\":12,\"pad\":[8,12,2,12],\"pts\":[{\"la\":37.2661,\"lo\":127.0011,\"k\":\"s\",\"n\":\"1\",\"l\":\"수원역, 환승|센터\"},{\"la\":37.267,\"lo\":127.002,\"k\":\"m\"},{\"la\":0,\"lo\":0}],\"act\":{\"a\":\"call\",\"v\":\"mp.all\"}}]}");
            ScreenCore.Layout tl = ScreenCore.layout(tms, 360f, M);
            ok(tl.body.length == 1 && tl.body[0].kind == ScreenCore.K_TMAP && near(tl.body[0].h, 210f) && tl.body[0].act != null && "mp.all".equals(tl.body[0].act.v), "tmap: 자리 · 높이 · 누름");
            java.util.List<TileMapCore.Pin> tps = TileMapCore.parsePins(tl.body[0].value);
            ok(tps.size() == 2 && "수원역 환승센터".equals(tps.get(0).name) && "1".equals(tps.get(0).n) && "m".equals(tps.get(1).k), "tmap: 핀 값(0,0 건너뜀 · 쉼표/막대 제거)");
        } catch (Exception ex) { ok(false, "tmap 읽기: " + ex); }
        try {
            ScreenCore.Screen tws = ScreenCore.load("{\"ok\":true,\"v\":1,\"screen\":\"x\",\"head\":[],\"body\":[{\"t\":\"tmap\",\"h\":260,\"r\":0,\"fp\":46,\"fz\":18,\"pts\":[{\"la\":37.499,\"lo\":127.029,\"k\":\"b\",\"n\":\"도착\"},{\"la\":37.4979,\"lo\":127.0276,\"k\":\"a\",\"n\":\"출발\"}],\"line\":[[37.4979,127.0276],[37.4985,127.0282],[37.499,127.029]]}]}");
            ScreenCore.Layout tl2 = ScreenCore.layout(tws, 360f, M);
            ScreenCore.Item ti = tl2.body[0];
            double[] pth = TileMapCore.parsePath(ti.path);
            java.util.List<TileMapCore.Pin> tp2 = TileMapCore.parsePins(ti.value);
            ok(ti.kind == ScreenCore.K_TMAP && pth.length == 6 && Math.abs(pth[2] - 37.4985) < 1e-9 && ti.fpad == 46f && ti.fzmax == 18f && !ti.on, "tmap: 걷는 길 · 맞춤 여백/최대 배율 · 끌 수 없는 지도");
            ok(tp2.size() == 2 && "b".equals(tp2.get(0).k) && "도착".equals(tp2.get(0).n) && "a".equals(tp2.get(1).k), "tmap: 출발/도착 핀 종류");
        } catch (Exception ex) { ok(false, "tmap 길 읽기: " + ex); }
        for (String bad2 : new String[] { "{\"t\":\"tmap\",\"pts\":[{\"la\":37,\"lo\":127}],\"line\":[[37]]}", "{\"t\":\"tmap\",\"pts\":[{\"la\":37,\"lo\":127}],\"line\":[[95,1]]}", "{\"t\":\"tmap\",\"pts\":[{\"la\":37,\"lo\":127}],\"line\":\"x\"}" }) {
            boolean thr = false;
            try { ScreenCore.load("{\"ok\":true,\"v\":1,\"screen\":\"x\",\"head\":[],\"body\":[" + bad2 + "]}"); } catch (ScreenCore.ParseError e) { thr = true; } catch (Exception e) { thr = true; }
            ok(thr, "tmap 엉터리 길은 거부: " + bad2);
        }
        for (String bad : new String[] { "{\"t\":\"tmap\",\"pts\":[]}", "{\"t\":\"tmap\",\"pts\":[{\"la\":95,\"lo\":1}]}", "{\"t\":\"tmap\",\"h\":10,\"pts\":[{\"la\":37,\"lo\":127}]}", "{\"t\":\"tmap\",\"pts\":[{\"la\":37,\"lo\":127}],\"act\":{\"a\":\"zzz\"}}" }) {
            boolean threw = false;
            try { ScreenCore.load("{\"ok\":true,\"v\":1,\"screen\":\"map\",\"head\":[],\"body\":[" + bad + "]}"); } catch (Exception ex) { threw = true; }
            ok(threw, "tmap 엉터리는 거부: " + bad);
        }

        // ── 칩 줄 웹 모양(fs · px · offf/offb/offt · oc · pl) ──
        {
            String H = "{\"ok\":true,\"v\":1,\"screen\":\"cchips\",\"head\":[";
            try {
                ScreenCore.Layout cl = ScreenCore.layout(ScreenCore.load(H + "{\"t\":\"chips\",\"pad\":[14,12,14,6],\"gap\":6,\"h\":27,\"fs\":11,\"px\":13,\"onc\":\"gold\",\"onfg\":\"#ffffff\",\"offf\":\"card2\",\"offb\":\"border\",\"offt\":\"sub\",\"items\":[{\"label\":\"게시판\",\"on\":true,\"act\":{\"a\":\"call\",\"v\":\"chC.board\"}},{\"label\":\"뉴스\",\"act\":{\"a\":\"call\",\"v\":\"chC.news\"}},{\"label\":\"1호선\",\"oc\":\"#0052a4\",\"c\":\"#0052a4\",\"act\":{\"a\":\"cat\",\"v\":\"f:1\"}},{\"label\":\"전체\",\"pl\":true,\"on\":true,\"act\":{\"a\":\"cat\",\"v\":\"f:ALL\"}}]}],\"body\":[]}"), 360f, M);
                ScreenCore.Item chA = cl.head[0], chB = cl.head[1], chC = cl.head[2], chD = cl.head[3];
                ok(near(chA.x, 14f) && near(chA.h, 27f) && near(chA.size, 11f) && near(chA.sx, 13f) && near(chA.w, 26f + chA.labelW), "chips: 웹 칩 왼쪽 여백 14 · 높이 27 · 글자 11 · 좌우 13");
                ok(chB.owc && chB.ofl != null && "card2".equals(chB.ofl.role) && chB.obd != null && "border".equals(chB.obd.role) && chB.otx != null && "sub".equals(chB.otx.role), "chips: 꺼진 칩 바탕/테두리/글자는 엔진이 정한 역할 색");
                ok(chC.owc && chC.obd != null && chC.obd.role == null && chC.otx != null && chC.otx.role == null && chC.ofl != null, "chips: 칩마다 oc(노선 색 테두리·글자)");
                ok(chD.plain && chD.on && !chA.plain, "chips: pl 은 켜져도 글자만(plain)");
                ScreenCore.Layout dl = ScreenCore.layout(ScreenCore.load(H + "{\"t\":\"chips\",\"items\":[{\"label\":\"a\"}]}],\"body\":[]}"), 360f, M);
                ok(!dl.head[0].owc && near(dl.head[0].size, 12f) && near(dl.head[0].sx, ScreenCore.CHIP_PADX), "chips: 값을 안 주면 옛 모양 그대로(글자 12 · 여백 12 · 꺼진 색 없음)");
            } catch (Exception ex) { ok(false, "chips 웹 모양: " + ex); }
            boolean threw = false; try { ScreenCore.load(H + "{\"t\":\"chips\",\"offf\":\"not-a-color\",\"items\":[{\"label\":\"a\"}]}],\"body\":[]}"); } catch (Exception ex) { threw = true; } ok(threw, "chips: 읽을 수 없는 offf 는 거부");
        }

        // ── tags(s217): 눌리지 않는 알약 줄 — 가로로 나란히, 폭이 모자라면 다음 줄로, 누름 자리 없음 ──
        {
            String tgJ = "{\"t\":\"tags\",\"pad\":[0,2,0,10],\"gap\":6,\"h\":24,\"size\":11,\"px\":10,\"items\":["
                + "{\"s\":\"환승 5회\",\"b\":true,\"c\":\"rgba(255,159,10,0.14)\",\"oc\":\"rgba(255,159,10,0.45)\",\"tc\":\"gold\"},{\"s\":\"KTX + 지하철\",\"b\":true,\"c\":\"card2\",\"oc\":\"border\",\"tc\":\"text\"},"
                + "{\"s\":\"부평\",\"c\":\"card2\",\"oc\":\"border\",\"tc\":\"sub\"},{\"s\":\"구로\"},{\"s\":\"광명\"},{\"s\":\"\"}]}";
            ScreenCore.Screen tgS = ScreenCore.load(wrapBody(tgJ));
            ScreenCore.Layout tgL = ScreenCore.layout(tgS, 360f, M);
            java.util.List<ScreenCore.Item> tgI = new java.util.ArrayList<ScreenCore.Item>();
            for (ScreenCore.Item it : tgL.body) if (it.kind == ScreenCore.K_TAGS) tgI.add(it);
            ok(tgI.size() == 5 && tgS.skipped == 1, "tags: 알약 다섯 개(빈 글은 건너뜀)");
            ok(tgI.get(0).fill != null && tgI.get(0).line != null && tgI.get(0).bold && !tgI.get(3).bold && near(tgI.get(0).h, 24f) && near(tgI.get(0).radius, 12f), "tags: 바탕 · 테두리 · 굵기 · 둥근 끝");
            ok(near(tgI.get(0).w, M.width("환승 5회", 11f, true) + 20f) && near(tgI.get(1).x, tgI.get(0).x + tgI.get(0).w + 6f) && near(tgI.get(0).y, tgI.get(1).y), "tags: 글 폭 + 좌우 10, 사이 6, 같은 줄");
            ScreenCore.Layout tgLN = ScreenCore.layout(tgS, 120f, M);
            float y0 = -1f, y1 = -1f; for (ScreenCore.Item it : tgLN.body) if (it.kind == ScreenCore.K_TAGS) { if (y0 < 0f) y0 = it.y; y1 = it.y; }
            ok(y1 >= y0 + 24f + 6f - 0.02f, "tags: 폭이 모자라면 다음 줄로 흐른다");
            ok(tgI.get(0).act == null, "tags: 눌러도 아무 행동 없음");
        }

        // ── 홈 웹 치수 노드(sec · trow · panel lb · inbar bpx/ifill/inh · divider c · scene fit · ltr fo) ──
        {
            String H = "{\"ok\":true,\"v\":1,\"screen\":\"hw\",\"head\":[],\"body\":[";
            try {
                String hwBody = "{\"t\":\"sec\",\"s\":\"혼잡도\",\"hint\":\"지하철을 타면 혼잡도가 표시돼요\",\"btn\":\"📍 위치 공유\",\"act\":{\"a\":\"call\",\"v\":\"share.loc\"},\"pad\":[14,0,14,6]},"
                    + "{\"t\":\"panel\",\"pad\":[14,0,14,14],\"ip\":[15,10,10,10],\"r\":16,\"lb\":4,\"lc\":\"#1d9bf0\",\"kids\":[{\"t\":\"scene\",\"h\":150,\"r\":12,\"fit\":true,\"sc\":\"{\\\"ok\\\":true}\"}]},"
                    + "{\"t\":\"sec\",\"s\":\"AI 승무원\",\"pad\":[14,0,14,6]},"
                    + "{\"t\":\"panel\",\"pad\":[14,0,14,14],\"ip\":[0,0,0,0],\"r\":16,\"kids\":["
                    + "{\"t\":\"inbar\",\"key\":\"a\",\"hint\":\"출발지 검색\",\"h\":57,\"pad\":[0,0,14,0],\"ifill\":\"card2\",\"ifh\":17,\"ifr\":11,\"btn\":\"위치 감지\",\"bh\":33,\"bsize\":12,\"bpx\":16,\"dot\":\"#0a84ff\",\"size\":15,\"act\":{\"a\":\"call\",\"v\":\"x\"}},"
                    + "{\"t\":\"divider\",\"c\":\"border2\"},"
                    + "{\"t\":\"trow\",\"lb\":\"🕐 기준시각\",\"s\":\"현재\",\"cur\":true,\"hint\":\"(클릭해서 시간을 변경하세요)\",\"day\":\"평일\",\"dc\":\"#30d158\",\"btn\":\"현재\",\"act\":{\"a\":\"call\",\"v\":\"bt.pick\"},\"bact\":{\"a\":\"call\",\"v\":\"bt.now\"},\"h\":34}]},"
                    + "{\"t\":\"panel\",\"pad\":[14,0,14,22],\"ip\":[12,10,12,10],\"r\":14,\"kids\":["
                    + "{\"t\":\"ltr\",\"pad\":[0,0,0,5],\"nick\":\"가\",\"s\":\"하나\",\"time\":\"02:30\",\"fo\":1},"
                    + "{\"t\":\"ltr\",\"pad\":[0,0,0,5],\"nick\":\"나\",\"s\":\"둘\",\"time\":\"02:31\",\"fo\":2},"
                    + "{\"t\":\"ltr\",\"pad\":[0,0,0,5],\"nick\":\"다\",\"s\":\"셋\",\"time\":\"02:32\",\"fo\":3},"
                    + "{\"t\":\"ltr\",\"pad\":[0,0,0,5],\"nick\":\"라\",\"s\":\"넷\",\"time\":\"02:33\"},"
                    + "{\"t\":\"ltr\",\"nick\":\"마\",\"s\":\"다섯\",\"time\":\"02:34\"}]}";
                ScreenCore.Screen hwS = ScreenCore.load(H + hwBody + "]}");
                ScreenCore.Layout hwL = ScreenCore.layout(hwS, 411f, M);
                ScreenCore.Item hwSec = null, hwPan = null, hwScn = null, hwTr = null, hwInb = null, hwDv = null;
                int hwLtrs = 0;
                for (ScreenCore.Item it : hwL.body) {
                    if (it.kind == ScreenCore.K_SEC && hwSec == null) hwSec = it;
                    if (it.kind == ScreenCore.K_PANEL && hwPan == null) hwPan = it;
                    if (it.kind == ScreenCore.K_SCENE) hwScn = it;
                    if (it.kind == ScreenCore.K_TROW) hwTr = it;
                    if (it.kind == ScreenCore.K_INBAR) hwInb = it;
                    if (it.kind == ScreenCore.K_DIV) hwDv = it;
                    if (it.kind == ScreenCore.K_LTR) hwLtrs++;
                }
                ok(hwSec != null && near(hwSec.x, 14f) && near(hwSec.w, 383f) && near(hwSec.h, 23f) && hwSec.go.length() > 0 && near(hwSec.sx + hwSec.sw, 397f) && near(hwSec.sh, 23f), "sec: 웹 .sec — 좌우 14 · 단추 높이 23 · 단추는 오른쪽 끝");
                ok(hwSec != null && hwSec.label.length() > 0 && hwSec.tagX > hwSec.textX + 30f && hwSec.tagX + 10f < hwSec.sx, "sec: 가운데 작은 글은 제목 뒤 8 · 단추 앞에서 끝난다");
                ok(ScreenCore.Layout.hits(hwSec, hwSec.sx + 5f, hwSec.sy + 5f) && !ScreenCore.Layout.hits(hwSec, 30f, hwSec.y + 5f), "sec: 단추 자리만 눌린다");
                ok(hwPan != null && near(hwPan.y, 29f) && near(hwPan.sw, 4f) && hwPan.ac != null && near(hwPan.h, 172f), "panel: 왼쪽 띠 4(lb) · 장면 150 + 안쪽 여백 10·10 + 테두리 → 172");
                ok(hwScn != null && near(hwScn.x, 30f) && near(hwScn.y, 40f) && near(hwScn.w, 356f), "panel ip [15,10,10,10]: 장면은 x 30 · 카드 안 10 아래 · 폭 356");
                ok(hwInb != null && near(hwInb.h, 57f) && near(hwInb.sh, 33f) && hwInb.fill2 != null && near(hwInb.sfh, 17f) && near(hwInb.sfr, 11f), "inbar: 줄 57 · 단추 33 · 입력 글자 뒤 띠 17/모서리 11");
                ok(hwInb != null && near(hwInb.x + hwInb.w, 382f) && near(hwInb.btx + hwInb.sw, 382f) && near(hwInb.textX, hwInb.x + 34f), "inbar pad [0,0,14,0]: 단추는 카드 안쪽 오른쪽에서 14 · 글자는 점 뒤 20");
                ok(hwDv != null && hwDv.line != null && "border2".equals(hwDv.line.role), "divider c=border2");
                ok(hwTr != null && near(hwTr.h, 34f) && near(hwTr.bx, hwTr.x + 14f) && hwTr.badge.length() > 0 && near(hwTr.sh, 18f) && hwTr.go.length() > 0 && near(hwTr.btx + hwTr.sw2, hwTr.x + hwTr.w - 14f) && hwTr.tag.length() > 0 && hwTr.on, "trow: 웹 기준시각 줄 — 좌우 14 · 알약 18 · 오른쪽 끝 단추 · 안내 글");
                ok(near(hwTr.sx + hwTr.sw + 8f, hwTr.btx), "trow: 알약과 단추 사이 8");
                ok(ScreenCore.Layout.hits(hwTr, hwTr.x + 100f, hwTr.y + 10f) && hwLtrs == 5, "trow: 줄 전체가 눌린다 · 대화 줄 5개");
                // fit: 보이는 높이 791 → 남는 세로를 장면이 채우고(최소 90), 모자라면 오래된 줄부터 접힌다
                ScreenCore.Layout hwB0 = ScreenCore.layout(hwS, 411f, M, null, 0f);
                ScreenCore.Layout hwBig = ScreenCore.layout(hwS, 411f, M, null, hwB0.bodyH + 200f);
                ScreenCore.Item hwSbig = null; for (ScreenCore.Item it : hwBig.body) if (it.kind == ScreenCore.K_SCENE) hwSbig = it;
                ok(hwSbig != null && near(hwSbig.h, 350f) && near(hwBig.bodyH, hwB0.bodyH + 200f), "scene fit: 남는 세로 200 → 장면 150 + 200 (본문이 보이는 높이에 딱 맞는다)");
                ScreenCore.Layout hwSmall = ScreenCore.layout(hwS, 411f, M, null, hwB0.bodyH - 60f - 150f + 50f);
                int hwLs = 0; ScreenCore.Item hwSs = null; for (ScreenCore.Item it : hwSmall.body) { if (it.kind == ScreenCore.K_LTR) hwLs++; if (it.kind == ScreenCore.K_SCENE) hwSs = it; }
                ok(hwSs != null && near(hwSs.h, 90f) && hwLs < 5 && hwLs >= 2, "scene fit: 모자라면 장면은 최소 90 · 대화 오래된 줄부터 접힌다(2줄은 남김): 줄 " + hwLs);
                ScreenCore.Layout hwAg = ScreenCore.layout(hwS, 411f, M, null, 0f);
                ok(near(hwAg.bodyH, hwB0.bodyH), "scene fit: 높이를 모르면(0) 접힘·키움 없이 원래대로");
            } catch (Exception ex) { ok(false, "홈 웹 치수 노드: " + ex); }
            boolean threw = false; try { ScreenCore.load(H + "{\"t\":\"sec\",\"s\":\"\"}]}"); } catch (Exception ex) { threw = true; } ok(threw, "sec: s 가 없으면 거부");
        }

        // ── 노선 상세 노드(brh · brt · brsec · brturn · brs) ──
        {
            String H = "{\"ok\":true,\"v\":1,\"screen\":\"mapbr\",\"head\":[{\"t\":\"brh\",\"no\":\"13-4\",\"tp\":\"일반\",\"c\":\"#00b341\",\"act\":{\"a\":\"call\",\"v\":\"br.rf\"},\"bact\":{\"a\":\"call\",\"v\":\"br.x\"}},{\"t\":\"brt\",\"a\":\"가\",\"b\":\"라\",\"tag\":\"상행\",\"tk\":\"up\",\"chips\":[{\"s\":\"운행 2대\",\"k\":\"on\"},{\"s\":\"정류장 40개\"},{\"s\":\"내 위치 · 3정거장 전\",\"k\":\"me\"}]}],\"body\":[";
            String row = "{\"t\":\"brs\",\"k\":\"up\",\"i\":0,\"nm\":\"가\",\"id\":\"001\",\"fl\":\"f\",\"ar\":1,\"mk\":\"bus\",\"here\":1,\"notes\":[{\"s\":\"🚌 경기70\",\"k\":\"bus\"}],\"lab\":\"선택 ›\",\"act\":{\"a\":\"call\",\"v\":\"br.p.0\"}}";
            String sec = "{\"t\":\"brsec\",\"k\":\"up\",\"s\":\"라\",\"tag\":\"상행\"},{\"t\":\"brturn\",\"s\":\"회차 ↻\"}";
            try {
                ScreenCore.Layout bl = ScreenCore.layout(ScreenCore.load(H + sec + "," + row + "," + row.replace("\"i\":0", "\"i\":1").replace("\"mk\":\"bus\",\"here\":1,\"notes\":[{\"s\":\"🚌 경기70\",\"k\":\"bus\"}],", "").replace("br.p.0", "br.p.1") + "]}"), 360f, M);
                ScreenCore.Item h = bl.head[0], t = bl.head[1], sc = bl.body[0], bn = bl.body[1], rs0 = bl.body[2], rs1 = bl.body[3];
                ok(h.kind == ScreenCore.K_BRX && "h".equals(h.dk) && h.h == ScreenCore.BR_HEAD_H && h.za.length == 2 && h.za[0].v.equals("br.rf") && h.za[1].v.equals("br.x") && h.zs[0] < h.zs[4], "brh: 머리 52 · ↻ ✕ 두 자리");
                ok("t".equals(t.dk) && t.sa.length == 3 && t.h > 40f && t.gf[3] > 0f, "brt: 칩 셋의 자리");
                ok("c".equals(sc.dk) && "n".equals(bn.dk) && bn.h == ScreenCore.BR_TURN_H, "구간 머리 · 회차");
                ok("s".equals(rs0.dk) && rs0.h > rs1.h && rs0.sa.length == 1 && rs0.act.v.equals("br.p.0") && "f".equals(rs0.go) && rs0.pub && rs1.sa.length == 0 && rs1.h >= ScreenCore.BR_ROW_MIN, "brs: 알림이 있는 줄이 더 높다 · 눌림 행동 · 첫 줄 표시");
                ok(bl.part && !rs0.sig.equals(rs1.sig) && rs0.sig.equals(ScreenCore.layout(ScreenCore.load(H + sec + "," + row + "]}"), 360f, M).body[2].sig), "지문: 내용이 같으면 같고 다르면 다르다(바뀐 줄만 다시 그리는 근거)");
            } catch (Exception ex) { ok(false, "노선 상세 읽기: " + ex); }
            String[] bads = { "{\"t\":\"brh\",\"no\":\"\",\"act\":{\"a\":\"call\",\"v\":\"x\"},\"bact\":{\"a\":\"call\",\"v\":\"y\"}}", row.replace("\"act\":{\"a\":\"call\",\"v\":\"br.p.0\"}", "\"x\":1") };
            for (String b : bads) { boolean threw = false; try { ScreenCore.load(H + b + "]}"); } catch (Exception ex) { threw = true; } ok(threw, "노선 상세 엉터리는 거부"); }
            try {
                ScreenCore.Layout cl = ScreenCore.layout(ScreenCore.load("{\"ok\":true,\"v\":1,\"screen\":\"maph\",\"head\":[],\"body\":[{\"t\":\"bcard\",\"k\":\"SEOUL:1\",\"nm\":\"가\",\"mode\":\"near\",\"act\":{\"a\":\"call\",\"v\":\"mp.pc.0\"},\"rows\":[{\"no\":\"146\",\"c\":\"#0066FF\",\"a\":[{\"s\":\"1분\",\"sec\":60}],\"act\":{\"a\":\"call\",\"v\":\"br.0.0\"}},{\"no\":\"7\",\"a\":[{\"s\":\"2분\",\"sec\":120}]}]}]}"), 360f, M);
                ScreenCore.Item bc = cl.body[0];
                ok(bc.ra.length == 2 && bc.ra[0] != null && "br.0.0".equals(bc.ra[0].v) && bc.ra[1] == null, "bcard: 노선 줄마다 누름 행동");
            } catch (Exception ex) { ok(false, "bcard 줄 행동: " + ex); }
            try {                                                                       // 순서 바꾸기 줄 글(첫 주변 카드에만 오는 rol · rod)
                String ro_c = "{\"t\":\"bcard\",\"k\":\"SEOUL:%d\",\"nm\":\"가\",\"mode\":\"near\",\"act\":{\"a\":\"call\",\"v\":\"mp.pc.%d\"}%s}";
                String ro_j = "{\"ok\":true,\"v\":1,\"screen\":\"maph\",\"head\":[],\"body\":[" + String.format(ro_c, 1, 0, ",\"rol\":\"끌어서 순서 변경\",\"rod\":\"완료\"") + "," + String.format(ro_c, 2, 1, "") + "]}";
                ScreenCore.Layout ro_l = ScreenCore.layout(ScreenCore.load(ro_j), 360f, M);
                ScreenCore.Item ro_a = ro_l.body[0], ro_b = ro_l.body[1];
                ok(ro_a.kind == ScreenCore.K_BCARD && "끌어서 순서 변경".equals(ro_a.rol) && "완료".equals(ro_a.rod) && ro_b.rol.length() == 0 && ro_b.rod.length() == 0, "bcard: 순서 바꾸기 줄 글은 첫 카드에만 실린다(rol · rod)");
                ok(ro_b.y >= ro_a.y + ro_a.h && ro_b.y - (ro_a.y + ro_a.h) < 40f, "bcard: 카드 사이 간격이 있어 끌기가 칸 계산을 한다");
            } catch (Exception ex) { ok(false, "bcard 순서 바꾸기 글: " + ex); }
            try {                                                                       // s202: 이름 옆 '(○○역 방향)' — 한 줄에 들어가면 이름 바로 뒤, 안 들어가면 다음 줄
                String lm_c = "{\"t\":\"bcard\",\"k\":\"SEOUL:%d\",\"nm\":\"%s\",\"mode\":\"near\",\"act\":{\"a\":\"call\",\"v\":\"mp.pc.%d\"}%s}";
                String lm_j = "{\"ok\":true,\"v\":1,\"screen\":\"maph\",\"head\":[],\"body\":[" + String.format(lm_c, 1, "가", 0, ",\"lm\":\"검단역\"") + "," + String.format(lm_c, 2, "가", 1, ",\"lm\":\"가나다라마바사아자차카타파하가나다라마바사아자차카타파하\"") + "," + String.format(lm_c, 3, "가", 2, "") + "]}";
                ScreenCore.Layout lm_l = ScreenCore.layout(ScreenCore.load(lm_j), 360f, M);
                ScreenCore.Item lm_a = lm_l.body[0], lm_b = lm_l.body[1], lm_n = lm_l.body[2];
                ok("(검단역 방향)".equals(lm_a.lmt) && lm_a.lx > lm_a.textX && lm_a.ly == lm_a.textY && lm_a.h == lm_n.h, "bcard: 이름 옆 방향 글이 이름 뒤 같은 줄에 붙고 카드 높이는 그대로");
                ok(lm_b.lmt.length() > 0 && lm_b.lx == lm_b.textX && lm_b.ly > lm_b.textY && lm_b.h > lm_n.h, "bcard: 이름이 길어 한 줄에 안 들어가면 방향 글은 다음 줄로 내려가고 카드가 그만큼 커진다");
                ok(lm_n.lmt.length() == 0, "bcard: lm 이 없으면 방향 글 없음");
                String rt_j = "{\"ok\":true,\"v\":1,\"screen\":\"maph\",\"head\":[],\"body\":[" + String.format(lm_c, 4, "가", 3, ",\"em\":\"운행 정보 없음\",\"rt\":{\"a\":\"call\",\"v\":\"mp.rt\"},\"lm\":\"검단역\"") + "," + String.format(lm_c, 5, "가", 4, ",\"em\":\"운행 정보 없음\"") + "]}";
                ScreenCore.Layout rt_l = ScreenCore.layout(ScreenCore.load(rt_j), 360f, M);
                ScreenCore.Item rt_a = rt_l.body[0], rt_b = rt_l.body[1];
                ok("운행 정보 없음".equals(rt_a.t2) && rt_a.lmt.length() > 0 && rt_a.zs.length == 16 && rt_a.za.length == 4 && rt_a.za[3] != null && "mp.rt".equals(rt_a.za[3].v) && rt_a.zs[14] > 0f && rt_a.zs[13] > rt_a.y + rt_a.h * 0.4f && rt_a.zs[12] + rt_a.zs[14] <= rt_a.x + rt_a.w, "bcard: 안내 줄 오른쪽 '다시 시도 ›' 누르는 자리(네 번째 칸) · 방향 글과 안내 글이 함께 있어도 서로 안 덮는다");
                ok(rt_b.zs.length == 12 && rt_b.za.length == 3, "bcard: rt 가 없으면 누르는 자리는 세 칸 그대로");
            } catch (Exception ex) { ok(false, "bcard 방향 글: " + ex); }
        }

        // ── 버스 탭 노드(btog · bcard · tmap 확장) ──
        {
            String H = "{\"ok\":true,\"v\":1,\"screen\":\"maph\",\"head\":[],\"body\":[";
            String card = "{\"t\":\"bcard\",\"k\":\"SEOUL:11111\",\"nm\":\"강남역\",\"mode\":\"near\",\"on\":true,\"pad\":[12,12,0,12],\"act\":{\"a\":\"call\",\"v\":\"mp.pc.0\",\"id\":\"SEOUL:11111\"},\"edit\":{\"a\":\"call\",\"v\":\"mp.al.0\"},\"n\":\"1\",\"dist\":\"60m\",\"fv\":0,\"star\":{\"a\":\"call\",\"v\":\"mp.fv.0\"},\"pi\":0,\"rows\":[{\"no\":\"146\",\"c\":\"#0066FF\",\"a\":[{\"s\":\"3분 30초\",\"sec\":210,\"p\":\"2번째전\"}],\"bell\":1,\"dir\":\"→ 강남역방향\"}]}";
            try {
                ScreenCore.Layout bl = ScreenCore.layout(ScreenCore.load(H + "{\"t\":\"btog\",\"v\":\"u\",\"items\":[{\"label\":\"버스\",\"on\":true,\"act\":{\"a\":\"call\",\"v\":\"mp.t.bus\"}},{\"label\":\"지하철\",\"act\":{\"a\":\"call\",\"v\":\"mp.t.sub\"}}]},{\"t\":\"btog\",\"v\":\"p\",\"items\":[{\"label\":\"주변\",\"on\":true,\"act\":{\"a\":\"call\",\"v\":\"mp.vw.near\"}},{\"label\":\"즐겨찾기\",\"act\":{\"a\":\"call\",\"v\":\"mp.vw.fav\"}}],\"rf\":{\"label\":\"새로고침\",\"act\":{\"a\":\"call\",\"v\":\"mp.rf\"}}}," + card + "]}"), 360f, M);
                int under = 0, pill = 0, refresh = 0, cards = 0; float cardH = 0f;
                for (ScreenCore.Item it : bl.body) {
                    if (it.kind == ScreenCore.K_BTOG) { if ("u".equals(it.value)) under++; else if ("r".equals(it.value)) refresh++; else pill++; }
                    if (it.kind == ScreenCore.K_BCARD) { cards++; cardH = it.h; }
                }
                ok(under == 2 && pill == 2 && refresh == 1, "btog: 밑줄 탭 2 · 둥근 단추 2 · 새로고침 1");
                ok(cards == 1 && cardH > 40f && bl.bodyH > cardH, "bcard: 카드 한 장의 높이를 엔진 글로 잰다");
            } catch (Exception ex) { ok(false, "btog/bcard 읽기: " + ex); }
            String[] bads = {
                "{\"t\":\"btog\",\"items\":[]}",
                "{\"t\":\"btog\",\"v\":\"z\",\"items\":[{\"label\":\"a\"}]}",
                "{\"t\":\"btog\",\"items\":[{\"label\":\"\"}]}",
                card.replace("\"mode\":\"near\"", "\"mode\":\"zzz\""),
                card.replace("\"k\":\"SEOUL:11111\"", "\"k\":\"\""),
                card.replace("\"no\":\"146\"", "\"no\":\"\""),
                card.replace("\"nm\":\"강남역\"", "\"nm\":\"\""),
            };
            for (String b : bads) { boolean threw = false; try { ScreenCore.load(H + b + "]}"); } catch (Exception ex) { threw = true; } ok(threw, "btog/bcard 엉터리는 거부: " + b.substring(0, Math.min(60, b.length()))); }
            try {
                ScreenCore.Screen lv = ScreenCore.load(H + "{\"t\":\"tmap\",\"h\":210,\"live\":1,\"foc\":0,\"pts\":[{\"la\":37.5,\"lo\":127.0,\"k\":\"s\",\"n\":\"1\",\"v\":\"mp.pm.0\",\"g\":\"SEOUL:11111\"},{\"la\":37.51,\"lo\":127.01,\"k\":\"s\",\"n\":\"2\",\"v\":\"mp.pm.1\",\"g\":\"SEOUL:22222\"}]}]}");
                ScreenCore.Layout ll = ScreenCore.layout(lv, 360f, M);
                java.util.List<TileMapCore.Pin> lp = TileMapCore.parsePins(ll.body[0].value);
                ok(lp.size() == 2 && "mp.pm.1".equals(lp.get(1).v) && "SEOUL:22222".equals(lp.get(1).g), "tmap 확장: 핀 누름 행동(v) · 카드 열쇠(g)");
            } catch (Exception ex) { ok(false, "tmap 확장 읽기: " + ex); }
        }

        // ── 흐르는 문구 노드(marq) ──
        try {
            ScreenCore.Screen mq = ScreenCore.load("{\"ok\":true,\"v\":1,\"screen\":\"hdr\",\"head\":[],\"body\":[{\"t\":\"marq\",\"h\":26,\"pad\":[8,14,8,14],\"msgs\":[\"오늘도 화이팅!\",\" \",\"좋은 아침이에요\"],\"pass\":16000,\"grad\":6000,\"line\":true}]}");
            ScreenCore.Layout ml = ScreenCore.layout(mq, 360f, M);
            ok(ml.body.length == 1 && ml.body[0].kind == ScreenCore.K_MARQ && near(ml.body[0].h, 26f) && near(ml.body[0].f1, 16000f) && near(ml.body[0].f2, 6000f) && ml.body[0].on, "marq: 자리 · 속도 · 선");
            ok("오늘도 화이팅!\n좋은 아침이에요".equals(ml.body[0].value), "marq: 빈 문구는 건너뛴다");
        } catch (Exception ex) { ok(false, "marq 읽기: " + ex); }
        for (String bad : new String[] { "{\"t\":\"marq\",\"msgs\":[]}", "{\"t\":\"marq\",\"msgs\":[1]}", "{\"t\":\"marq\",\"msgs\":[\"a\"],\"h\":5}", "{\"t\":\"marq\",\"msgs\":[\"a\"],\"pass\":10}" }) {
            boolean threw = false;
            try { ScreenCore.load("{\"ok\":true,\"v\":1,\"screen\":\"hdr\",\"head\":[],\"body\":[" + bad + "]}"); } catch (Exception ex) { threw = true; }
            ok(threw, "marq 엉터리는 거부: " + bad);
        }

        // ── 행동에 실린 고유 id · 제목 · 입력칸 열쇠 ──
        try {
            String idJ = "{\"ok\":true,\"v\":1,\"screen\":\"news\",\"head\":[],\"body\":[{\"t\":\"news\",\"pad\":[14,0,14,0],\"title\":\"가\",\"sub\":\"나\",\"act\":{\"a\":\"call\",\"v\":\"nw.3\",\"id\":\"https://x.com/1\",\"t\":\"제목\"}},{\"t\":\"news\",\"pad\":[14,0,14,0],\"title\":\"다\",\"sub\":\"라\",\"act\":{\"a\":\"call\",\"v\":\"bd.cm.2\",\"id\":\"77\",\"key\":\"c.77\"}},{\"t\":\"news\",\"pad\":[14,0,14,0],\"title\":\"마\",\"sub\":\"바\",\"act\":{\"a\":\"call\",\"v\":\"nw.1\"}}]}";
            ScreenCore.Layout il = ScreenCore.layout(ScreenCore.load(idJ), 360f, M);
            ScreenCore.Act i0 = il.body[0].act, i1 = il.body[1].act, i2 = il.body[2].act;
            ok(i0 != null && i0.ix == -1 && i2.ix == -1, "ix 가 없으면 -1");
            ok(i0 != null && "https://x.com/1".equals(i0.id) && "제목".equals(i0.t) && i1 != null && "77".equals(i1.id) && "c.77".equals(i1.key) && i2 != null && i2.id.length() == 0 && i2.t.length() == 0 && i2.key.length() == 0, "행동에 실린 고유 id · 제목 · 열쇠 읽기(없으면 빈 글 — 옛 엔진도 그대로)");
        } catch (Exception ex) { ok(false, "act id 읽기: " + ex); }
        try {
            ScreenCore.Layout xl = ScreenCore.layout(ScreenCore.load("{\"ok\":true,\"v\":1,\"screen\":\"news\",\"head\":[],\"body\":[{\"t\":\"news\",\"title\":\"가\",\"sub\":\"나\",\"act\":{\"a\":\"call\",\"v\":\"nw.7\",\"id\":\"u\",\"ix\":7}}]}"), 360f, M);
            ok(xl.body[0].act.ix == 7, "행동의 원래 위치(ix) 읽기");
        } catch (Exception ex) { ok(false, "ix 읽기: " + ex); }
        for (String badIx : new String[] { "-5", "100001", "\"x\"" }) {
            boolean thr = false;
            try { ScreenCore.load("{\"ok\":true,\"v\":1,\"screen\":\"news\",\"head\":[],\"body\":[{\"t\":\"news\",\"title\":\"가\",\"sub\":\"나\",\"act\":{\"a\":\"call\",\"v\":\"nw.1\",\"ix\":" + badIx + "}}]}"); } catch (Exception ex) { thr = true; }
            ok(thr, "엉터리 ix 거부: " + badIx);
        }
        {
            StringBuilder longId = new StringBuilder(); for (int i = 0; i < 500; i++) longId.append('a');
            try {
                ScreenCore.Layout lgl = ScreenCore.layout(ScreenCore.load("{\"ok\":true,\"v\":1,\"screen\":\"news\",\"head\":[],\"body\":[{\"t\":\"news\",\"title\":\"가\",\"sub\":\"나\",\"act\":{\"a\":\"call\",\"v\":\"nw.1\",\"id\":\"" + longId + "\"}}]}"), 360f, M);
                ok(lgl.body[0].act.id.length() <= 400, "너무 긴 id 는 400자에서 자른다");
            } catch (Exception ex) { ok(false, "긴 id: " + ex); }
            boolean threw = false;
            try { ScreenCore.load("{\"ok\":true,\"v\":1,\"screen\":\"news\",\"head\":[],\"body\":[{\"t\":\"news\",\"title\":\"가\",\"sub\":\"나\",\"act\":{\"a\":\"call\",\"v\":\"bd.cm.1\",\"key\":\"a b!\"}}]}"); } catch (Exception ex) { threw = true; }
            ok(threw, "엉터리 입력칸 열쇠는 거부");
        }
        // ── 경로 탐색 로딩(runner) 노드 ──
        try {
            ScreenCore.Screen rn = ScreenCore.load("{\"ok\":true,\"v\":1,\"screen\":\"dlg\",\"bg\":\"card\",\"dlg\":{\"w\":296,\"maxh\":0.9,\"dim\":0.7,\"top\":0.5,\"r\":20,\"mx\":24},\"head\":[{\"t\":\"runner\",\"pad\":[30,24,30,22],\"ttl\":\"복합경로 탐색 중\",\"sub\":\"잠시만 기다려주세요\"}],\"body\":[{\"t\":\"spacer\",\"h\":0}]}");
            ScreenCore.Layout rl = ScreenCore.layout(rn, 296f, M);
            ScreenCore.Item ri = rl.head.length > 0 ? rl.head[0] : null;
            ok(ri != null && ri.kind == ScreenCore.K_RUNNER && "복합경로 탐색 중".equals(ri.label) && "잠시만 기다려주세요".equals(ri.value), "runner: 제목 · 안내 글");
            ok(ri != null && near(ri.w, 236f) && near(ri.h, ScreenCore.RUN_H) && near(ri.x, 30f) && near(ri.y, 24f), "runner: 달리는 칸 너비 236 · 안쪽 여백 30/24");
            ok(near(rl.headH, 24f + ScreenCore.RUN_H + 22f) && near(ScreenCore.RUN_H, 98f + 8f + 19f + 4f + 14f), "runner: 카드 높이 = 위 24 + 칸 98 + 제목 + 안내 + 아래 22");
        } catch (Exception ex) { ok(false, "runner 읽기: " + ex); }
        for (String bad : new String[] { "{\"t\":\"runner\",\"sub\":\"x\"}", "{\"t\":\"runner\",\"ttl\":\"\"}", "{\"t\":\"runner\",\"ttl\":7}" }) {
            try { ScreenCore.load("{\"ok\":true,\"v\":1,\"screen\":\"x\",\"head\":[" + bad + "],\"body\":[]}"); ok(false, "runner: 잘못된 값은 거절 " + bad); }
            catch (Exception ex) { ok(true, "runner: 잘못된 값은 거절 " + bad); }
        }
        // ── 타임라인 칸 흐림(ps) · 지금 칸(hr) ──
        try {
            ScreenCore.Layout pl = ScreenCore.layout(ScreenCore.load("{\"ok\":true,\"v\":1,\"screen\":\"x\",\"head\":[{\"t\":\"trk\",\"cells\":[{\"n\":\"가\",\"dk\":\"e\",\"dc\":\"#0a84ff\"},{\"n\":\"나\",\"dk\":\"r\",\"dc\":\"#0a84ff\",\"ps\":true},{\"n\":\"다\",\"dk\":\"r\",\"dc\":\"#0a84ff\",\"hr\":true}]}],\"body\":[]}"), 360f, M);
            int nps = 0, nhr = 0;
            for (ScreenCore.Item q : pl.head) if (q.kind == ScreenCore.K_TRK) { if (q.ps) nps++; if (q.hr) nhr++; }
            ok(nps == 1 && nhr == 1, "trk 칸: 지나간 칸(ps) · 지금 칸(hr) 표시");
        } catch (Exception ex) { ok(false, "trk ps/hr 읽기: " + ex); }
        // ── 노선 알약(lpills): 숫자 동그라미 · 줄 바꿈 ──
        try {
            ScreenCore.Layout ll = ScreenCore.layout(ScreenCore.load("{\"ok\":true,\"v\":1,\"screen\":\"x\",\"head\":[],\"body\":[{\"t\":\"lpills\",\"pad\":[16,0,16,20],\"gap\":7,\"items\":[{\"s\":\"2호선\",\"c\":\"#00a84d\",\"num\":\"2\"},{\"s\":\"신분당선\",\"c\":\"#d4003b\"},{\"s\":\"수도권 광역철도 직통선\",\"c\":\"#0a84ff\"},{\"s\":\"GTX-A\",\"c\":\"#8e44ad\",\"num\":\"A\"}]}]}"), 360f, M);
            int np = 0; float h0 = -1f, maxY = 0f; boolean fit = true;
            for (ScreenCore.Item q : ll.body) if (q.kind == ScreenCore.K_LPILL) { np++; if (h0 < 0f) h0 = q.h; if (q.h != h0) fit = false; maxY = Math.max(maxY, q.y); if (q.x + q.w > 360f - 16f + 0.01f) fit = false; }
            ok(np == 4 && h0 == ScreenCore.LP_H_NUM && fit, "lpills: 알약 4개 · 숫자가 하나라도 있으면 높이 34 · 같은 높이 · 칸 안에 들어옴");
            ok(maxY > 0f, "lpills: 칸이 모자라면 다음 줄로 넘어간다");
            ScreenCore.Item first = null; for (ScreenCore.Item q : ll.body) if (q.kind == ScreenCore.K_LPILL) { first = q; break; }
            ok(first != null && "2".equals(first.t1) && first.w > ScreenCore.LP_PADL_N + ScreenCore.LP_NUM + ScreenCore.LP_NUM_GAP + ScreenCore.LP_PADR, "lpills: 숫자 칸만큼 폭이 늘어난다");
            ScreenCore.Layout l2 = ScreenCore.layout(ScreenCore.load("{\"ok\":true,\"v\":1,\"screen\":\"x\",\"head\":[],\"body\":[{\"t\":\"lpills\",\"items\":[{\"s\":\"신분당선\",\"c\":\"#d4003b\"}]}]}"), 360f, M);
            ok(l2.body.length == 1 && l2.body[0].h == ScreenCore.LP_H && l2.body[0].t1.length() == 0, "lpills: 숫자가 없으면 높이 27 · 동그라미 없음");
        } catch (Exception ex) { ok(false, "lpills: " + ex); }
        // ── 무지개 테두리 카드(panel glow) ──
        try {
            ScreenCore.Layout gl = ScreenCore.layout(ScreenCore.load("{\"ok\":true,\"v\":1,\"screen\":\"x\",\"head\":[],\"body\":[{\"t\":\"panel\",\"glow\":true,\"kids\":[{\"t\":\"text\",\"s\":\"가\"}]},{\"t\":\"panel\",\"kids\":[{\"t\":\"text\",\"s\":\"나\"}]}]}"), 360f, M);
            ScreenCore.Item g0 = null, g1 = null;
            for (ScreenCore.Item q : gl.body) if (q.kind == ScreenCore.K_PANEL) { if (g0 == null) g0 = q; else if (g1 == null) g1 = q; }
            ok(g0 != null && g0.pub && g1 != null && !g1.pub, "panel glow: 켠 카드만 무지개 테두리");
        } catch (Exception ex) { ok(false, "panel glow 읽기: " + ex); }
        // ── 세부경로 줄(tdrow) 노드 ──
        try {
            String row = "{\"t\":\"tdrow\",\"pos\":\"f\",\"ic\":\"s\",\"col\":\"#2f7cf6\",\"trk\":\"rgba(47,124,246,0.1875)\",\"ibg\":\"rgba(47,124,246,0.157)\",\"lab\":\"수도권 1호선\",\"bbg\":\"rgba(47,124,246,0.133)\",\"bfg\":\"#2f7cf6\",\"path\":\"부평 → 두정\",\"cnt\":\"3정거장 경유\",\"time\":\"12분\",\"tcol\":\"#2f7cf6\",\"rng\":\"12:03~12:15\",\"dep\":1760000000000,\"arr\":1760000720000,\"ex\":true,\"op\":%OP%,\"act\":{\"a\":\"call\",\"v\":\"rd.tg.1\"},\"stops\":[[\"부평\",\"12:03\",1],[\"가\",\"12:07\",0],[\"두정\",\"12:15\",1]]}";
            ScreenCore.Layout tdl0 = ScreenCore.layout(ScreenCore.load("{\"ok\":true,\"v\":1,\"screen\":\"rdetail\",\"head\":[],\"body\":[" + row.replace("%OP%", "false") + "]}"), 360f, M);
            ScreenCore.Layout tdl1 = ScreenCore.layout(ScreenCore.load("{\"ok\":true,\"v\":1,\"screen\":\"rdetail\",\"head\":[],\"body\":[" + row.replace("%OP%", "true") + "]}"), 360f, M);
            ScreenCore.Item tda = tdl0.body.length > 0 ? tdl0.body[0] : null, tdb = tdl1.body.length > 0 ? tdl1.body[0] : null;
            ok(tda != null && tda.kind == ScreenCore.K_TDROW && tda.act != null && tda.pub && !tda.on && tda.ln == 1760000000000L && tda.ln2 == 1760000720000L, "tdrow: 종류 · 눌림 · 시각(밀리초 그대로)");
            ok(tda != null && near(tda.sx, 16f + 17f) && near(tda.bx, 16f + 34f + 12f) && tda.f1 >= 26f + 34f && near(tda.h, tda.f1), "tdrow: 레일 가운데 x · 몸통 x · 줄 높이(안쪽 여백 13×2 + 내용)");
            ok(tdb != null && tdb.on && tdb.gb.length == 3 && tdb.gb[0] && !tdb.gb[1] && tdb.gb[2] && "가".equals(tdb.sa[2]) && near(tdb.h - tdb.f1, ScreenCore.TD_STOP_PAD_T + 3 * ScreenCore.TD_STOP_ROW + ScreenCore.TD_STOP_PAD_B), "tdrow: 펼치면 정거장 줄(끝점 표시) 높이가 더해진다");
            ok(tda != null && "12분".equals(tda.label) && "12:03~12:15".equals(tda.value) && "3정거장 경유".equals(tda.tag) && tda.lines.length >= 1, "tdrow: 시간 · 시간대 · 경유 · 경로 글");
        } catch (Exception ex) { ok(false, "tdrow 읽기: " + ex); }
        // ── 시트 머리(shd) · 앱이 바로 펼치는 줄(i + openKey "td:") · 아래 줄 선(fl) ──
        try {
            String shd = "{\"t\":\"shd\",\"title\":\"52분 · 부평 → 두정\",\"act\":{\"a\":\"call\",\"v\":\"rd.close\"}}";
            String r2 = "{\"t\":\"tdrow\",\"i\":%I%,\"pos\":\"m\",\"ic\":\"s\",\"lab\":\"1호선\",\"time\":\"5분\",\"ex\":true,\"act\":{\"a\":\"call\",\"v\":\"rd.tg.%I%\"},\"stops\":[[\"a\",\"12:00\",1],[\"b\",\"12:02\",0],[\"c\",\"12:05\",1]]}";
            String js = "{\"ok\":true,\"v\":1,\"screen\":\"rdetail\",\"fl\":false,\"bg\":\"card\",\"head\":[" + shd + "],\"body\":[" + r2.replace("%I%", "1") + "," + r2.replace("%I%", "3") + "],\"foot\":[{\"t\":\"button\",\"s\":\"x\",\"act\":{\"a\":\"call\",\"v\":\"rd.confirm\"}}]}";
            ScreenCore.Screen scd = ScreenCore.load(js);
            ScreenCore.Layout ld = ScreenCore.layout(scd, 360f, M);
            ScreenCore.Item hd0 = ld.head.length > 0 ? ld.head[0] : null;
            ok(hd0 != null && hd0.kind == ScreenCore.K_SHD && near(hd0.h, 8f + 5f + 8f + 28f + 8f) && near(hd0.sw, 28f) && near(hd0.sx, 360f - 18f - 28f), "shd: 높이 8+5+8+28+8 · × 동그라미는 오른쪽 18 안쪽");
            ok(ld.fl == false && "card".equals(ld.bg), "화면 fl=false · bg=card");
            ok(ScreenCore.Layout.hits(hd0, 360f - 18f - 14f, hd0.sy + 14f) && !ScreenCore.Layout.hits(hd0, 40f, hd0.sy + 14f), "shd: × 자리만 눌린다");
            ScreenCore.Layout lc = ScreenCore.layout(scd, 360f, M, null);
            ok(lc.body.length == 2 && !lc.body[0].on && !lc.body[1].on && "1".equals(lc.body[0].key) && "3".equals(lc.body[1].key), "tdrow: i 가 있으면 key 에 구간 번호 · 접힌 채 시작");
            ScreenCore.Layout lo = ScreenCore.layout(scd, 360f, M, "td:,3,");
            ok(!lo.body[0].on && lo.body[1].on && lo.body[1].h > lc.body[1].h && near(lo.bodyH - lc.bodyH, ScreenCore.TD_STOP_PAD_T + 3 * ScreenCore.TD_STOP_ROW + ScreenCore.TD_STOP_PAD_B), "tdrow: 앱이 3번을 펼치면 그 줄만 정거장 높이만큼 커진다(서버 왕복 없음)");
            ScreenCore.Layout lz = ScreenCore.layout(scd, 360f, M, "td:,");
            ok(!lz.body[0].on && !lz.body[1].on, "tdrow: 앱이 모두 접으면 모두 접힌다");
        } catch (Exception ex) { ok(false, "shd/로컬 펼침: " + ex); }
        for (String bad : new String[] { "{\"t\":\"tdrow\",\"ic\":\"x\"}", "{\"t\":\"tdrow\",\"pos\":\"z\"}", "{\"t\":\"tdrow\",\"dep\":-5}", "{\"t\":\"tdrow\",\"stops\":[[\"a\"]]}", "{\"t\":\"tdrow\",\"col\":\"nope\"}" }) {
            try { ScreenCore.load("{\"ok\":true,\"v\":1,\"screen\":\"x\",\"head\":[],\"body\":[" + bad + "]}"); ok(false, "tdrow: 잘못된 값은 거절 " + bad); }
            catch (Exception ex) { ok(true, "tdrow: 잘못된 값은 거절 " + bad); }
        }
        // ── 스켈레톤(skel) 노드 ──
        for (String sc : new String[] { "cards", "map", "list" }) {
            try {
                ScreenCore.Screen sk = ScreenCore.load("{\"ok\":true,\"v\":1,\"screen\":\"skel\",\"head\":[],\"body\":[{\"t\":\"skel\",\"kind\":\"" + sc + "\",\"rows\":4,\"pad\":[12,12,12,0]}]}");
                ScreenCore.Layout kl = ScreenCore.layout(sk, 360f, M);
                ok(kl.body.length == 1 && kl.body[0].kind == ScreenCore.K_SKEL && kl.body[0].h > 200f && kl.body[0].w > 300f, "skel: " + sc + " 자리");
            } catch (Exception ex) { ok(false, "skel 읽기 " + sc + ": " + ex); }
        }
        try {
            ScreenCore.Layout k1 = ScreenCore.layout(ScreenCore.load("{\"ok\":true,\"v\":1,\"screen\":\"skel\",\"head\":[],\"body\":[{\"t\":\"skel\",\"kind\":\"map\",\"rows\":3}]}"), 360f, M);
            ok(near(k1.body[0].h, ScreenCore.SKEL_MAP_H + ScreenCore.SKEL_GAP + 3 * (ScreenCore.SKEL_ROW_H + ScreenCore.SKEL_GAP)) && "map".equals(k1.body[0].value), "skel: 지도형 높이");
        } catch (Exception ex) { ok(false, "skel map: " + ex); }
        for (String bad : new String[] { "{\"t\":\"skel\",\"rows\":0}", "{\"t\":\"skel\",\"rows\":99}", "{\"t\":\"skel\",\"kind\":7}" }) {
            boolean threw = false;
            try { ScreenCore.load("{\"ok\":true,\"v\":1,\"screen\":\"skel\",\"head\":[],\"body\":[" + bad + "]}"); } catch (Exception ex) { threw = true; }
            ok(threw, "skel 엉터리는 거부: " + bad);
        }

        // ── 게시판 글 머리줄(점 · 👁 · 💬) · 떠 있는 단추 · 칩 테두리 두께 (웹 .dc-post-meta · .fab · .chat-line-chip)
        {
            String bj = "{\"v\":1,\"screen\":\"board\",\"head\":[{\"t\":\"divider\",\"c\":\"border\"}],\"body\":["
                + "{\"t\":\"post\",\"id\":\"pa\",\"pad\":[14,0,14,8],\"title\":\"제목\",\"nick\":\"닉\",\"mp\":[\"3분 전\",\"\ud83d\udc41 12\"],\"cm\":2,\"kids\":[]},"
                + "{\"t\":\"post\",\"id\":\"pb\",\"pad\":[14,0,14,8],\"title\":\"제목2\",\"nick\":\"닉\",\"mp\":[\"3분 전\"],\"kids\":[]}],"
                + "\"fab\":{\"s\":\"✏️ 제보 글쓰기\",\"icon\":\"M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z\",\"act\":{\"a\":\"call\",\"v\":\"bd.write\"}}}";
            ScreenCore.Screen bs = ScreenCore.load(bj);
            ScreenCore.Layout bl = ScreenCore.layout(bs, 411f, M, null, 791f);
            ScreenCore.Item pa = null, pb = null;
            for (ScreenCore.Item q : bl.body) if (q.kind == ScreenCore.K_POSTH) { if (pa == null) pa = q; else pb = q; }
            ok(pa != null && pb != null && pa.mp != null && pa.cmS.length() > 0 && pb.cmS.length() == 0, "글 머리줄: 조각 · 댓글 수가 있을 때만 💬");
            ok(near(pa.h, 1f * 0f + 12f + 14f * 1.4f + 8f + 19.4f + 10f) && near(pb.h, 12f + 14f * 1.4f + 8f + 11f * 1.4f + 10f), "글 머리줄 높이: 댓글 있으면 19.4, 없으면 15.4 (웹 71 · 67 에서 테두리 2 뺀 값)");
            ok(pa.mpx[0] > pa.tagX + pa.tagW && pa.cmX > pa.mpx[1] && pa.dotX0 > pa.mpx[1], "점(·)은 닉네임 · 조각 사이에 5px 간격으로 놓임");
            ok(bl.fabLabel != null && bl.fabW > 80f && bl.fabAct != null, "떠 있는 글쓰기 단추 자리");
            String cj = "{\"v\":1,\"screen\":\"chat\",\"head\":[{\"t\":\"chips\",\"h\":31,\"fs\":12.5,\"px\":15,\"items\":[{\"label\":\"전체\",\"on\":true,\"bw\":1.5,\"act\":{\"a\":\"cat\",\"v\":\"all\"}},{\"label\":\"2호선\",\"bw\":2,\"ob\":\"#00a84d\",\"act\":{\"a\":\"cat\",\"v\":\"2\"}}]}],\"body\":[{\"t\":\"spacer\",\"h\":4}]}";
            ScreenCore.Layout cl = ScreenCore.layout(ScreenCore.load(cj), 411f, M, null, 791f);
            ok(near(cl.head[0].bw, 1.5f) && near(cl.head[1].bw, 2f) && cl.head[1].obd != null && near(cl.head[1].h, 31f), "칩 테두리 두께 · 따로 칠한 테두리색");
        }
        {   // 이름이 길면 놀이터 칸(rw)만 남기고 흐른다(mq) — 짧으면 가만히
            ScreenCore.Item mq1 = ScreenCore.layout(ScreenCore.load(wrapBody("{\"t\":\"text\",\"s\":\"강남\",\"size\":22,\"bold\":true,\"lines\":1,\"rw\":100,\"mq\":true,\"pad\":[0,36,0,12]}")), 360f, M).body[0];
            ok(mq1.mq == false && mq1.lines.length == 1 && mq1.lines[0].equals("강남"), "짧은 이름은 흐르지 않는다");
            ScreenCore.Item mq2 = ScreenCore.layout(ScreenCore.load(wrapBody("{\"t\":\"text\",\"s\":\"아주아주아주 긴 역 이름 아주아주아주 긴 역 이름\",\"size\":22,\"bold\":true,\"lines\":1,\"rw\":100,\"mq\":true,\"pad\":[0,36,0,12]}")), 360f, M).body[0];
            ok(mq2.mq && mq2.lines.length == 1 && mq2.lines[0].startsWith("아주아주아주") && !mq2.lines[0].endsWith("\u2026"), "긴 이름은 줄이지 않고 통째로 둔다(…없음)");
            ok(near(mq2.mqVis, 360f - 32f - 100f) || mq2.mqVis > 100f, "보이는 칸 = 너비 − 놀이터 칸");
            ok(mq2.mqW > mq2.mqVis + 1f && near(mq2.w, mq2.mqVis), "이름 전체 폭이 보이는 칸보다 길다 · 칸 폭 = 보이는 칸");
            ScreenCore.Item mq3 = ScreenCore.layout(ScreenCore.load(wrapBody("{\"t\":\"text\",\"s\":\"아주아주아주 긴 역 이름 아주아주아주 긴 역 이름\",\"size\":22,\"lines\":1,\"pad\":[0,36,0,12]}")), 360f, M).body[0];
            ok(!mq3.mq && mq3.lines[0].endsWith("\u2026"), "mq 가 없으면 예전처럼 … 줄임");
            String bj = "{\"ok\":true,\"v\":1,\"screen\":\"t\",\"head\":[],\"body\":[{\"t\":\"bar\",\"pad\":[0,36,0,4],\"rw\":100,\"mq\":true,\"title\":\"TITLE 시간표\",\"btn\":\"닫기\",\"act\":{\"a\":\"call\",\"v\":\"mp.close\"}}]}";
            ScreenCore.Item tb1 = ScreenCore.layout(ScreenCore.load(bj.replace("TITLE", "강남")), 360f, M).body[0];
            ScreenCore.Item tb2 = ScreenCore.layout(ScreenCore.load(bj.replace("TITLE", "아주아주아주 긴 역 이름 아주아주아주 긴 역 이름")), 360f, M).body[0];
            ok(!tb1.mq && tb2.mq && tb2.mqW > tb2.mqVis + 1f && tb2.mqVis >= 40f, "시간표 제목줄도 길 때만 흐른다");
            String rj = "{\"t\":\"row\",\"pad\":[8,0,0,4],\"gap\":8,AN\"kids\":[{\"t\":\"button\",\"s\":\"세부경로 보기\",\"size\":13,\"h\":42,\"r\":12,\"act\":{\"a\":\"call\",\"v\":\"rh.detail\"}},{\"t\":\"button\",\"s\":\"안내 종료\",\"size\":13,\"h\":42,\"r\":12,\"act\":{\"a\":\"call\",\"v\":\"rh.stop\"}},{\"t\":\"button\",\"s\":\"환승\",\"size\":13,\"h\":42,\"r\":12,\"fill\":\"#bf5af2\",\"tc\":\"#ffffff\",\"act\":{\"a\":\"call\",\"v\":\"rh.slot\"}}]}";
            String anJ = "\"an\":{\"k\":\"slide_down\",\"ms\":380,\"e\":[0.2,0,0,1],\"sq\":1791862800123,\"bg\":\"card\",\"o\":{\"s\":\"탑승\",\"fill\":\"#0a84ff\",\"tc\":\"#ffffff\"}},";
            ScreenCore.Layout rl = ScreenCore.layout(ScreenCore.load(wrapBody(rj.replace("AN", anJ))), 360f, M), rl0 = ScreenCore.layout(ScreenCore.load(wrapBody(rj.replace("AN", ""))), 360f, M);
            ScreenCore.Item ran = null; for (ScreenCore.Item q : rl.body) if (q.kind == ScreenCore.K_ROWANIM) ran = q;
            ok(ran != null && ran.ak.equals("slide_down") && ran.ams == 380 && ran.sq == 1791862800123L && near(ran.aez[0], 0.2f) && ran.subs.length == 4 && ran.subs[3] != null && ran.subs[3].label.equals("탑승") && ran.subs[2].label.equals("환승") && ran.gap == 8f && near(ran.h, 42f) && ran.w > 300f, "버튼 줄 전환 연출: 칸이 셋이면 덮개 조각이 만들어진다(시각은 long 그대로 · 옛 칸 모양 포함)");
            int nb = 0; for (ScreenCore.Item q : rl0.body) if (q.kind == ScreenCore.K_ROWANIM) nb++;
            int nb1 = 0; for (ScreenCore.Item q : rl.body) if (q.kind == ScreenCore.K_BUTTON) nb1++;
            ok(nb == 0 && nb1 == 3, "연출 값이 없으면 덮개 없음 · 단추는 그대로 세 개(눌림·행동은 단추가 받는다)");
            ScreenCore.Layout rl2 = ScreenCore.layout(ScreenCore.load(wrapBody(rj.replace("AN", anJ.replace("slide_down", "bogus")))), 360f, M);
            int nb2 = 0; for (ScreenCore.Item q : rl2.body) if (q.kind == ScreenCore.K_ROWANIM) nb2++;
            ok(nb2 == 0, "모르는 전환 종류는 무시");
        }
        System.out.println(fails == 0 ? "ALL OK (" + oks + ")" : fails + " FAIL");
        System.exit(fails == 0 ? 0 : 1);
    }
}

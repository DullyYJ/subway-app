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
        ok(n0.lines.length == 1 && n0.lines2.length == 1 && near(n0.h, 13f + 14f * 1.45f + 4f + 11f * 1.45f + 13f + 1f), "한 줄 제목 높이 = 위아래 13 + 제목 + 4 + 작은 글 + 선 1");
        ok(near(n0.tagX, 14f + 332f - 4f - chevW), "› 는 오른쪽 끝(안쪽 4)");
        ok(n1.lines.length == ScreenCore.NEWS_MAXLINES && n1.lines[n1.lines.length - 1].endsWith("\u2026") && near(n1.h, 13f + 14f * 1.45f * 4f + 4f + 11f * 1.45f + 13f + 1f), "긴 제목은 4줄까지 … 로 줄임");
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
        ok(near(m0.h, 11f * 1.35f + 3f + 16f + 13f * 1.45f * m0.lines.length + 3f + 9f * 1.35f) && near(m1.y, m0.h + 10f), "말풍선 높이 = 글쓴이 + 풀 + 글 + 시각, 사이 10");
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
        float expectH = 2f + 48f + 1f + 48f + ScreenCore.SUG_H * 2f + 4f;
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
        ok(TKL.head[1].lines.length == 2 && TKL.head[1].lines[1].endsWith("\u2026"), "타임라인: 긴 이름은 두 줄까지, 넘으면 …");
        ok(TKL.head[1].label.equals("6번") && "t".equals(TKL.head[1].gk) && TKL.head[1].lc != null && TKL.head[1].rc != null && "r".equals(TKL.head[1].dk) && TKL.head[1].ti == 1, "타임라인: 배지 · 선 · 점 종류 · 추적 번호를 엔진 값 그대로");
        ok(TKL.head[0].lc == null && TKL.head[0].rc != null && "e".equals(TKL.head[0].dk), "타임라인: 맨앞 칸은 왼쪽 선 없음");
        ok(TKL.head[2].dc2 != null && TKL.head[2].badgeTw > 0f && TKL.head[2].badgeTw + 2f * TKL.head[2].gx <= TKL.head[2].w && TKL.head[2].time.contains("3시간"), "타임라인: 도보 가운데 점의 둘째 색 · 알약은 칸 안 · 시각 글");
        ok(TKL.head[2].tb && near(TKL.head[2].tsz, 10f) && TKL.head[1].ti == 1 && TKL.head[2].ti == -1, "타임라인: 시각 글 크기·굵기 · 추적 안 하는 칸은 -1");
        ok(TKL.body.length == 0 && near(TKL.bodyH, 0f) && near(TKL.headMaxScroll(), 264f - 200f), "타임라인: 본문은 높이 0 · 넘친 폭만큼 가로로 밀린다");
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

        // ── 화면 바탕 색(bg) ──
        String bgBase = "{\"ok\":true,\"v\":1,\"screen\":\"x\",\"head\":[],\"body\":[{\"t\":\"spacer\",\"h\":4}]";
        ok("bg".equals(ScreenCore.layout(ScreenCore.load(bgBase + "}"), 300f, M).bg) && "card".equals(ScreenCore.layout(ScreenCore.load(bgBase + ",\"bg\":\"card\"}"), 300f, M).bg) && "card2".equals(ScreenCore.layout(ScreenCore.load(bgBase + ",\"bg\":\"card2\"}"), 300f, M).bg), "화면 바탕: 기본 bg · card · card2");
        ok(bad(bgBase + ",\"bg\":\"gold\"}") && bad(bgBase + ",\"bg\":\"#fff\"}"), "화면 바탕은 bg/card/card2 만");

        System.out.println(fails == 0 ? "ALL OK (" + oks + ")" : fails + " FAIL");
        System.exit(fails == 0 ? 0 : 1);
    }
}

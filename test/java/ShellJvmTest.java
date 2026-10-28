package com.dullyyj.subway;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** ShellCore(네이티브 껍데기의 순수 계산) 시험 — 안드로이드 없이 JVM. 사용: java ShellJvmTest */
public class ShellJvmTest {
    static int fails = 0, oks = 0;
    static HomeCore.Loc swLoc(String n, double la, double lo) { HomeCore.Loc l = new HomeCore.Loc(); l.name = n; l.lat = la; l.lng = lo; l.type = "p"; return l; }
    static void ok(boolean c, String name) { System.out.println((c ? "ok   " : "FAIL ") + name); if (c) oks++; else fails++; }

    /** 시험용 쓰기 기록 한 줄: 종류 · 열쇠 길이 · 열쇠 · 값 길이(varint) · 값(UTF-16LE, 첫 바이트 0). */
    static byte[] logRec(String name, String val) {
        try {
            byte[] key = ("_https://localhost\u0000\u0001" + name).getBytes(java.nio.charset.Charset.forName("ISO-8859-1"));
            byte[] v16 = val.getBytes(java.nio.charset.Charset.forName("UTF-16LE"));
            java.io.ByteArrayOutputStream w = new java.io.ByteArrayOutputStream();
            w.write(0xAA); w.write(1); w.write(key.length); w.write(key, 0, key.length);
            int vl = v16.length + 1; w.write((vl & 127) | 128); w.write(vl >> 7); w.write(0); w.write(v16, 0, v16.length);
            return w.toByteArray();
        } catch (Exception e) { return new byte[0]; }
    }

    public static void main(String[] a) throws Exception {
        ShellCore.MemStore st = new ShellCore.MemStore();

        // ── 쿠팡 추천 최근 상품 기억(ShopRecent, s262) ──
        {
            long t0 = 1_000_000_000_000L;
            String sv = "";
            sv = ShopRecent.add(sv, "A 상품", t0); sv = ShopRecent.add(sv, "B\t상품\n2", t0 + 1000); sv = ShopRecent.add(sv, "A 상품", t0 + 2000);
            java.util.List<String> nm = ShopRecent.names(sv, t0 + 3000);
            ok(nm.size() == 2 && "A 상품".equals(nm.get(0)) && "B 상품 2".equals(nm.get(1)), "최근 상품: 같은 이름은 하나 · 최근 순 · 탭·줄바꿈 정리 " + nm);
            ok(ShopRecent.names(sv, t0 + ShopRecent.TTL_MS + 5000).isEmpty(), "최근 상품: 5일이 지나면 잊는다");
            String big = ""; for (int i = 0; i < 40; i++) big = ShopRecent.add(big, "P" + i, t0 + i);
            ok(ShopRecent.names(big, t0 + 100).size() == ShopRecent.MAX && "P39".equals(ShopRecent.names(big, t0 + 100).get(0)), "최근 상품: 최대 " + ShopRecent.MAX + "개");
            String b0 = "{\"arrMs\":1,\"pickShop\":1}";
            String b1 = ShopRecent.inject(b0, nm);
            ok(b1.equals("{\"arrMs\":1,\"pickShop\":1,\"shopRecent\":[\"A 상품\",\"B 상품 2\"]}"), "최근 상품: 요청 본문에 shopRecent 를 덧붙인다 " + b1);
            ok(ShopRecent.inject(b0, new java.util.ArrayList<String>()).equals(b0) && ShopRecent.inject(b1, nm).equals(b1) && ShopRecent.inject("x", nm).equals("x"), "최근 상품: 기억이 없거나 이미 있으면 그대로");
            ok(ShopRecent.itemName("{\"shopItem\":{\"n\":\"우산 \",\"u\":\"https://a\"}}").equals("우산") && ShopRecent.itemName("{\"ok\":true}").isEmpty() && ShopRecent.itemName("no json").isEmpty(), "최근 상품: 응답에서 상품 이름만 뽑는다");
        }

        // ── 탭 ──
        ok("home".equals(ShellCore.currentTab(st)), "처음엔 홈 탭");
        st.put("tab", "bogus");
        ok("home".equals(ShellCore.currentTab(st)), "모르는 탭 이름은 홈으로");
        ok(ShellCore.tabsBody("map").equals("{\"cap\":26,\"f\":{\"tab\":\"map\"}}"), "탭 막대 요청 본문");
        ok(ShellCore.tabsBody("x\"y").contains("\"home\""), "엉터리 탭 이름은 요청에 실리지 않는다");
        ok(ShellCore.netOk(ShellCore.tabsUrl()), "탭 주소는 통신 허용 목록 안");
        ShellCore.Effect e = ShellCore.routeTabs(st, "call", "tab.shop");
        ok(e.kind == ShellCore.E_TAB && "shop".equals(e.arg) && "shop".equals(ShellCore.currentTab(st)), "탭 누름 → 탭 옮김 + 저장");
        ok(ShellCore.routeTabs(st, "call", "tab.nope").kind == ShellCore.E_NONE, "모르는 탭은 무시");
        ok(ShellCore.routeTabs(st, "set", "tab.shop").kind == ShellCore.E_NONE, "call 이 아니면 무시");

        // ── 설정 하위 화면(다른 앱 위에 표시) ──
        {
            ShellCore.MemStore ps = new ShellCore.MemStore();
            ok(ShellCore.routeSettings(ps, "call", "pg.ovl", null, false, null).kind == ShellCore.E_PAGE && "ovl".equals(ShellCore.routeSettings(ps, "call", "pg.ovl", null, false, null).arg), "설정: 하위 화면 누름 → E_PAGE(ovl)");
            ok(ShellCore.settingsFacts(ps).contains("\"ovl\":0"), "설정 사실: 오버레이 꺼짐");
            ok(ShellCore.routePage(ps, "ovl", "set", null, "ovl", true, false) == ShellCore.PG_NEEDPERM && "1".equals(ps.get(ShellCore.K_OVL, "0")) && ShellCore.settingsFacts(ps).contains("\"ovl\":1"), "오버레이 스위치 켬 + 권한 없음 → 권한 화면을 열어야 한다(저장은 켬)");
            ok(ShellCore.routePage(ps, "ovl", "set", null, "ovl", true, true) == ShellCore.PG_RENDER, "권한이 있으면 그냥 다시 그린다");
            ok(ShellCore.routePage(ps, "ovl", "set", null, "ovl", false, true) == ShellCore.PG_RENDER && "0".equals(ps.get(ShellCore.K_OVL, "1")), "끄면 저장 꺼짐");
            ok(ShellCore.routePage(ps, "ovl", "call", "pf.live", null, false, true) == ShellCore.PG_RENDER && "1".equals(ps.get(ShellCore.K_PFL, "0")) && ShellCore.routePage(ps, "ovl", "call", "pf.live", null, false, true) == ShellCore.PG_RENDER && "0".equals(ps.get(ShellCore.K_PFL, "1")), "위치 판단기 보정 버튼은 눌릴 때마다 켜고 끈다");
            ok(ShellCore.routePage(ps, "ovl", "call", "pg.back", null, false, true) == ShellCore.PG_CLOSE && ShellCore.routePage(ps, "ovl", "call", "ovl.diag", null, false, true) == ShellCore.PG_NONE && ShellCore.routePage(ps, "zz", "set", null, "ovl", true, true) == ShellCore.PG_NONE, "뒤로 = 닫기 · 모르는 눌림/화면은 무시");
            ok(ShellCore.routePage(ps, "sam", "call", "sam.open", null, false, true) == ShellCore.PG_SAMOPEN && ShellCore.routePage(ps, "sam", "call", "bat.req", null, false, true) == ShellCore.PG_BATREQ
               && ShellCore.routePage(ps, "sam", "call", "pg.back", null, false, true) == ShellCore.PG_CLOSE && ShellCore.routePage(ps, "sam", "call", "dev.stop", null, false, true) == ShellCore.PG_NONE, "절전 화면 눌림 길");
            ps.put(ShellCore.K_SAM, "1"); ps.put(ShellCore.K_SAMW, "1");
            ok(ShellCore.settingsFacts(ps).contains("\"sam\":1,\"samw\":1"), "설정 첫 화면 사실에 갤럭시·제한됨");
            ok(ShellCore.pageUrlSam("{\"pf\":{\"w\":true}}").contains("p=sam&f=") && ShellCore.pageUrlSam("{}").contains("cap=" + ShellCore.SETTINGS_CAP), "절전 화면 주소");
            ok("lunch".equals(ShellCore.arrKind("arr.t.lunch")) && ShellCore.arrKind("arr.t.x") == null && ShellCore.arrKind("arr.stat") == null && ShellCore.arrKind(null) == null, "시험 알림 종류 읽기");
            ok(ShellCore.routePage(ps, "arr", "call", "arr.t.shop", null, false, true) == ShellCore.PG_ARRTEST && ShellCore.routePage(ps, "arr", "call", "arr.stat", null, false, true) == ShellCore.PG_RENDER
               && ShellCore.routePage(ps, "arr", "call", "pg.back", null, false, true) == ShellCore.PG_CLOSE && ShellCore.routePage(ps, "arr", "call", "arr.demo", null, false, true) == ShellCore.PG_NONE, "하차 추천 화면 눌림 길");
            {
                String ab = ShellCore.arrTestBody("lunch", 1760000000000L);
                long am = Long.parseLong(ab.substring(ab.indexOf("\"arrMs\":") + 8, ab.indexOf(',')));
                ok(am % 86400000L == 12600000L && am <= 1760000000000L + 86400000L && am > 1760000000000L - 86400000L, "점심 시험 도착 시각 = 한국시간 12:30: " + am);
                ok(ab.contains("\"nowMs\":" + (am - 300000L)) && ab.contains("\"foodPref\":\"server\"") && ab.endsWith("\"pickShop\":1}"), "시험 본문 모양");
                String au = ShellCore.pageUrlArr(false, true, true, "", "", 0L);
                ok(au.contains("p=arr&f=") && !au.contains("%22st%22"), "상태 확인 전에는 st 를 싣지 않는다");
                String au2 = ShellCore.pageUrlArr(true, true, false, "\"dest\":\"강남\",\"rem\":300", "시험", 5L);
                String dec = java.net.URLDecoder.decode(au2, "UTF-8");
                ok(dec.contains("\"st\":{\"timer\":true,\"route\":true,\"pre\":7,\"tzo\":-540,\"policy\":false,\"dest\":\"강남\",\"rem\":300,\"dg\":{\"stage\":\"시험\",\"at\":5}}"), "상태 확인 사실: " + dec);
            }
            {
                ShellCore.MemStore es = new ShellCore.MemStore();
                ok(ErrCore.count(es) == 0 && ErrCore.copyText(es).equals("(오류 없음)") && ErrCore.pageFacts(es).equals("{\"pf\":{\"nat\":true,\"nv\":true,\"errs\":[],\"more\":0}}"), "오류 로그: 처음엔 비어 있다");
                {   // s266: 40건(한글·긴 호출 흔적)이 쌓여도 화면 주소가 서버 한도(f 6000자 · 주소 인코딩 뒤) 안이다 — 예전엔 40건이면 서버가 거절해 빈 화면이 됐다
                    StringBuilder big = new StringBuilder(); for (int q = 0; q < 70; q++) big.append("호출흔적 ");
                    ShellCore.MemStore es40 = new ShellCore.MemStore();
                    for (int q = 0; q < 40; q++) ErrCore.add(es40, "10-28 06:1" + (q % 10), "오류 메시지 번호 " + q + " 한글로 길게 적은 설명", "ShellActivity.java:" + (1000 + q), big.toString());
                    String pf = ErrCore.pageFacts(es40), u = ShellCore.pageUrlPlain("erl", pf);
                    ok(ErrCore.count(es40) == 40 && pf.length() < 6000 && u.length() < 7600 && pf.contains("\"more\":") && !pf.contains("\"more\":0"), "오류 로그 40건: 화면 주소가 한도 안(" + pf.length() + "자 · 주소 " + u.length() + "자)이고 나머지는 more 로 알린다");
                    ok(ErrCore.copyText(es40).contains("오류 메시지 번호 0 ") && ErrCore.copyText(es40).contains("오류 메시지 번호 39"), "복사는 40건 전부");
                }
                ErrCore.add(es, "10-21 06:00", "NullPointerException: x", "A.java:3", "A.f:3\nB.g:9");
                ErrCore.add(es, "10-21 06:01", "IllegalStateException", "B.java:7", "");
                ok(ErrCore.count(es) == 2, "두 건");
                ErrCore.add(es, "10-21 06:05", "NullPointerException: x", "A.java:3", "A.f:3");
                java.util.List<ErrCore.Entry> el = ErrCore.list(es);
                ok(el.size() == 2 && el.get(1).m.startsWith("NullPointer") && el.get(1).n == 2 && "10-21 06:05".equals(el.get(1).t), "같은 오류는 횟수만 올리고 맨 뒤로");
                ok(ErrCore.copyText(es).contains("(2회) NullPointerException: x\n  A.java:3\n  A.f:3") && ErrCore.copyText(es).contains("\n\n["), "복사 글 모양");
                for (int i = 0; i < 60; i++) ErrCore.add(es, "t", "e" + i, "f", "");
                ok(ErrCore.count(es) == 40 && ErrCore.list(es).get(39).m.equals("e59") && ErrCore.list(es).get(0).m.equals("e20"), "최대 40건, 오래된 것부터 버린다");
                ErrCore.add(es, "t", "따옴표 \" 와 줄바꿈 \n 와 역슬래시 \\", "f", "s");
                ok(ErrCore.list(es).get(39).m.equals("따옴표 \" 와 줄바꿈 \n 와 역슬래시 \\"), "특수문자가 저장·읽기에서 그대로");
                ErrCore.add(es, "t", "   ", "f", ""); ok(ErrCore.count(es) == 40, "빈 메시지는 안 적는다");
                es.put(ErrCore.K_LOG, "깨진 값"); ok(ErrCore.count(es) == 0, "깨진 저장값은 빈 목록");
                ErrCore.add(es, "t", "x", "f", ""); ErrCore.clear(es); ok(ErrCore.count(es) == 0, "지우기");
                ok("polp".equals(ShellCore.polPage("pol.privacy")) && "poll".equals(ShellCore.polPage("pol.location")) && "polo".equals(ShellCore.polPage("pol.opensource")) && "erl".equals(ShellCore.polPage("errlog")) && ShellCore.polPage("pol.x") == null && ShellCore.polPage(null) == null, "설정 첫 화면 줄 → 하위 화면 이름");
                ShellCore.Effect pe = ShellCore.routeSettings(es, "call", "pol.location", null, false, null);
                ok(pe.kind == ShellCore.E_PAGE && "poll".equals(pe.arg), "약관 줄을 누르면 하위 화면이 열린다");
                ShellCore.Effect ee = ShellCore.routeSettings(es, "call", "errlog", null, false, null);
                ok(ee.kind == ShellCore.E_PAGE && "erl".equals(ee.arg), "오류 로그 줄을 누르면 하위 화면이 열린다");
                ok(ShellCore.routePage(es, "polp", "call", "pg.back", null, false, true) == ShellCore.PG_CLOSE && ShellCore.routePage(es, "erl", "call", "erl.copy", null, false, true) == ShellCore.PG_ERLCOPY && ShellCore.routePage(es, "erl", "call", "erl.clear", null, false, true) == ShellCore.PG_ERLCLEAR && ShellCore.routePage(es, "polo", "call", "erl.clear", null, false, true) == ShellCore.PG_NONE, "약관/오류 로그 행동 라우팅");
                ok(!"1".equals(es.get(ShellCore.K_LOCDISC, "0")) && ShellCore.routePage(es, "locd", "call", "locd.no", null, false, true) == ShellCore.PG_LOCNO && !"1".equals(es.get(ShellCore.K_LOCDISC, "0")), "위치 안내: 거부는 동의로 기록하지 않는다");
                ok(ShellCore.routePage(es, "locd", "call", "pol.privacy", null, false, true) == ShellCore.PG_POLOPEN && !"1".equals(es.get(ShellCore.K_LOCDISC, "0")), "위치 안내: 방침 보기");
                ok(ShellCore.routePage(es, "locd", "call", "locd.ok", null, false, true) == ShellCore.PG_LOCOK && "1".equals(es.get(ShellCore.K_LOCDISC, "0")), "위치 안내: 동의하면 기록");
                ok(ShellCore.routePage(es, "askbat", "call", "ask.ok", null, false, true) == ShellCore.PG_ASKOK && ShellCore.routePage(es, "asksam", "call", "ask.no", null, false, true) == ShellCore.PG_ASKNO
                    && ShellCore.routePage(es, "askovl", "call", "ask.ok", null, false, true) == ShellCore.PG_ASKOK && ShellCore.routePage(es, "askbat", "call", "pg.back", null, false, true) == ShellCore.PG_NONE && ShellCore.routePage(es, "askbat", "set", "ask.ok", null, true, true) == ShellCore.PG_NONE
                    && ShellCore.isAskPage("askbat") && !ShellCore.isAskPage("locd") && ShellCore.pageUrlAsk("askbat", true).contains("p=askbat") && ShellCore.pageUrlAsk("askbat", true).contains("sm"), "s182 처음 설치 안내: 나중에 · 설정하기 둘뿐");
                ok(ShellCore.pageUrlPlain("polp", null).endsWith("p=polp") && ShellCore.pageUrlPlain("erl", ErrCore.pageFacts(es)).contains("p=erl&f="), "약관/오류 로그 주소");
            }
            {
                ShellCore.MemStore ds = new ShellCore.MemStore();
                ok("all".equals(DevCore.mode("dev.start.all")) && "quit".equals(DevCore.mode("dev.start.quit")) && DevCore.mode("dev.start.x") == null && DevCore.mode("dev.stop") == null && DevCore.mode(null) == null, "개발자 도구: 모드 이름");
                ok(DevCore.total("all") == 75 && DevCore.total("plain") == 15 && DevCore.total("quit") == 15, "전체 75초 · 한 단계 15초");
                ok("plain".equals(DevCore.phaseAt("all", 0)) && "plain".equals(DevCore.phaseAt("all", 14)) && "reco".equals(DevCore.phaseAt("all", 15)) && "alert2".equals(DevCore.phaseAt("all", 30)) && "alert1".equals(DevCore.phaseAt("all", 45)) && "plain".equals(DevCore.phaseAt("all", 60)) && DevCore.phaseAt("all", 75) == null && DevCore.phaseAt("all", -1) == null, "전체 시나리오 단계: 0~15 평상시 → 추천 → 2정거장 → 1정거장 → 마무리");
                ok("alert1".equals(DevCore.phaseAt("alert1", 3)) && DevCore.phaseAt("alert1", 15) == null, "한 단계만 고르면 15초");
                ok(DevCore.bar("reco") == null && DevCore.bar("quit") == null && "0".equals(DevCore.bar("plain")[3]) && "2".equals(DevCore.bar("alert2")[3]) && "1".equals(DevCore.bar("alert1")[3]) && DevCore.bar("alert1")[2].length() > 0, "막대 단계(추천·종료는 막대 없음)");
                ok(DevCore.pageFacts(null, 0, false).equals("{\"pf\":{\"nat\":true,\"nv\":true}}") && DevCore.pageFacts("alert2", 31, false).equals("{\"pf\":{\"nat\":true,\"nv\":true,\"ph\":\"alert2\",\"left\":31}}") && DevCore.pageFacts(null, 0, true).contains("\"stopped\":true"), "개발자 도구 화면 기기 사실");
                ok(ShellCore.routePage(ds, "dev", "call", "dev.start.all", null, false, true) == ShellCore.PG_DEVSTART && ShellCore.routePage(ds, "dev", "call", "dev.stop", null, false, true) == ShellCore.PG_DEVSTOP && ShellCore.routePage(ds, "dev", "call", "pg.back", null, false, true) == ShellCore.PG_CLOSE && ShellCore.routePage(ds, "dev", "call", "dev.start.zz", null, false, true) == ShellCore.PG_NONE, "dev 화면 행동 라우팅");
                ok(ShellCore.pageUrlDev(DevCore.pageFacts(null, 0, false)).contains("p=dev&f="), "dev 화면 주소");
                PerfLog.reset();
                ok(PerfLog.snapshot().equals("{\"d\":[0,0,0,0],\"l\":[0,0,0,0],\"n\":[]}"), "반응 속도 기록: 처음은 모두 0");
                { long t0 = PerfLog.now(); PerfLog.draw(t0); PerfLog.layout(t0); PerfLog.net("https://route-v2.phg0643.workers.dev/screen/map?cap=18&q=secret", t0, true); PerfLog.net("https://route-v2.phg0643.workers.dev/screen/map?x=1", t0, false); }
                String pfs = PerfLog.snapshot();
                ok(pfs.startsWith("{\"d\":[1,") && pfs.contains("[\"/screen/map\",2,") && !pfs.contains("secret") && !pfs.contains("cap="), "반응 속도 기록: 경로별로 모으고 질문 내용은 남기지 않는다 " + pfs);
                ok(DevCore.withPerf("{\"pf\":{\"nv\":true}}", "{\"d\":[1]}").equals("{\"pf\":{\"nv\":true,\"perf\":{\"d\":[1]}}}") && DevCore.withPerf("zz", "{}").equals("zz"), "개발자 도구 사실에 기록을 덧붙인다");
                PerfLog.reset();
            }
            {
                ShellCore.MemStore gs = new ShellCore.MemStore();
                ok(GwCore.roam(gs) == 6, "위젯 돌아다니는 시간 기본 6분");
                ok(GwCore.stepRoam(gs, "gw.roam.dn") && GwCore.roam(gs) == 5 && GwCore.stepRoam(gs, "gw.roam.up") && GwCore.roam(gs) == 6, "−1분 / +1분");
                for (int i = 0; i < 12; i++) GwCore.stepRoam(gs, "gw.roam.dn");
                ok(GwCore.roam(gs) == 2, "최소 2분에서 멈춘다");
                for (int i = 0; i < 12; i++) GwCore.stepRoam(gs, "gw.roam.up");
                ok(GwCore.roam(gs) == 10, "최대 10분에서 멈춘다");
                gs.put(GwCore.K_ROAM, "abc"); ok(GwCore.roam(gs) == 6, "깨진 값은 기본 6분");
                ok(!GwCore.stepRoam(gs, "gw.roam.x") && !GwCore.stepRoam(gs, null), "모르는 행동은 무시");
                ok("hb".equals(GwCore.addType("gw.add.hb")) && "vw".equals(GwCore.addType("gw.add.vw")) && GwCore.addType("gw.add.zz") == null && GwCore.addType("gw.add.") == null && GwCore.addType(null) == null, "위젯 종류 4개만");
                ok(ShellCore.routePage(gs, "gw", "call", "gw.add.hw", null, false, true) == ShellCore.PG_GWADD, "gw.add → 핀 추가");
                ok(ShellCore.routePage(gs, "gw", "call", "gw.roam.dn", null, false, true) == ShellCore.PG_GWCFG, "gw.roam → 설정 다시 전달");
                ok(ShellCore.routePage(gs, "gw", "call", "bat.req", null, false, true) == ShellCore.PG_BATREQ && ShellCore.routePage(gs, "gw", "call", "sam.open", null, false, true) == ShellCore.PG_SAMOPEN && ShellCore.routePage(gs, "gw", "call", "pg.back", null, false, true) == ShellCore.PG_CLOSE, "gw 화면의 배터리/절전/뒤로");
                ok(ShellCore.pageUrlGw(GwCore.pageFacts(gs)).contains("p=gw&f="), "gw 화면 주소");
                ok(!GwCore.mOn(gs) && !GwCore.eOn(gs) && GwCore.configJson(gs).startsWith("{\"on\":false,\"mOn\":false,\"eOn\":false,"), "장소가 없으면 꺼짐");
                String br = "{\"v\":1,\"title\":\"t\",\"body\":\"b\",\"route\":{\"from\":{\"name\":\"임학\",\"lat\":37.5,\"lng\":126.7,\"bus\":false},\"to\":{\"name\":\"아라\",\"lat\":37.6,\"lng\":126.8,\"bus\":true}}}";
                gs.put(GwCore.K_ROAM, "6");
                GwCore.Route rt = GwCore.parseRoute(br);
                ok(rt != null && "임학".equals(rt.from.name) && rt.from.lat == 37.5 && rt.to.bus && !rt.from.bus, "브리핑 응답의 경로를 읽는다");
                ok(GwCore.parseRoute("{\"v\":1,\"route\":null}") == null && GwCore.parseRoute("{\"route\":{\"from\":{\"name\":\"\",\"lat\":1,\"lng\":1},\"to\":{\"name\":\"a\",\"lat\":1,\"lng\":1}}}") == null && GwCore.parseRoute("x") == null, "경로 없음/깨진 값은 null");
                GwCore.putOrigin(gs, "morn", rt);
                ok(GwCore.mOn(gs) && !GwCore.eOn(gs), "출근 쪽만 켜진다");
                String cj = GwCore.configJson(gs);
                ok(cj.contains("\"on\":true") && cj.contains("\"mOn\":true") && cj.contains("\"eOn\":false") && cj.contains("\"mLat\":37.5") && cj.contains("\"mLng\":126.7") && !cj.contains("eLat") && cj.contains("\"roam\":6") && cj.contains("\"days\":[1,2,3,4,5]") && cj.contains("\"morn\":\"07:30\""), "위젯 설정 JSON: " + cj);
                gs.put(CmCore.K_DAYS, ""); ok(GwCore.configJson(gs).contains("\"days\":[0,1,2,3,4,5,6]"), "요일이 비면 매일");
                GwCore.putOrigin(gs, "morn", null); ok(!GwCore.mOn(gs), "장소를 지우면 다시 꺼진다");
                ok(GwCore.pageFacts(gs).equals("{\"pf\":{\"nat\":true,\"nv\":true,\"roam\":6,\"mOn\":false,\"eOn\":false,\"morn\":\"07:30\",\"eve\":\"18:30\"}}"), "gw 화면 기기 사실");
            }
            {
                ShellCore.MemStore cs = new ShellCore.MemStore();
                CmCore cmc = new CmCore();
                ok(!CmCore.on(cs) && "07:30".equals(CmCore.morn(cs)) && "18:30".equals(CmCore.eve(cs)) && CmCore.days(cs).toString().equals("[1, 2, 3, 4, 5]"), "출퇴근 기본값: 꺼짐 · 07:30 · 18:30 · 평일");
                ok(cmc.act(cs, "set", null, "cm", true, null) == (CmCore.R_RENDER | CmCore.R_RESCHED) && CmCore.on(cs), "스위치 켜면 저장 + 알람 다시 걸기");
                cmc.act(cs, "call", "cm.day.1", null, false, null); cmc.act(cs, "call", "cm.day.0", null, false, null);
                ok(CmCore.days(cs).toString().equals("[0, 2, 3, 4, 5]"), "요일 토글: " + CmCore.days(cs));
                cmc.act(cs, "call", "cm.preset.weekend", null, false, null);
                ok(CmCore.days(cs).toString().equals("[0, 6]") && cmc.act(cs, "call", "cm.day.9", null, false, null) == CmCore.R_NONE, "주말 묶음 · 이상한 요일은 무시");
                // 시각 고르기
                ok(cmc.act(cs, "call", "cm.tp.eve", null, false, null) == CmCore.R_RENDER && "tp".equals(cmc.sub) && "pm".equals(cmc.tpAp) && cmc.tpH == 6 && cmc.tpM == 30, "퇴근 시각 고르기 열기: 오후 6:30");
                String pf = cmc.pageFacts(cs);
                ok(pf.contains("\"sub\":\"tp\"") && pf.contains("\"tp\":{\"t\":\"eve\",\"ap\":\"pm\",\"h\":6,\"m\":30}") && pf.contains("\"days\":[0,6]") && pf.contains("\"on\":true"), "시각 고르기 사실: " + pf);
                cmc.act(cs, "call", "tp.h.12", null, false, null); cmc.act(cs, "call", "tp.m.5", null, false, null); cmc.act(cs, "call", "tp.ap.am", null, false, null);
                ok(cmc.act(cs, "call", "tp.ok", null, false, null) == (CmCore.R_RENDER | CmCore.R_RESCHED) && "00:05".equals(CmCore.eve(cs)) && cmc.sub.length() == 0, "오전 12:05 = 00:05 로 저장");
                cmc.act(cs, "call", "cm.tp.morn", null, false, null); cmc.act(cs, "call", "tp.ap.pm", null, false, null); cmc.act(cs, "call", "tp.h.12", null, false, null); cmc.act(cs, "call", "tp.m.0", null, false, null);
                cmc.act(cs, "call", "tp.ok", null, false, null);
                ok("12:00".equals(CmCore.morn(cs)) && cmc.act(cs, "call", "tp.h.13", null, false, null) == CmCore.R_NONE && cmc.act(cs, "call", "tp.m.7", null, false, null) == CmCore.R_NONE, "오후 12:00 = 12:00 · 범위 밖은 무시");
                cmc.act(cs, "call", "cm.tp.morn", null, false, null);
                ok(cmc.act(cs, "call", "tp.cancel", null, false, null) == CmCore.R_RENDER && "12:00".equals(CmCore.morn(cs)) && cmc.sub.length() == 0, "취소하면 그대로");
                // 장소 고르기
                ok(cmc.act(cs, "call", "cm.pick.from", null, false, null) == CmCore.R_RENDER && cmc.picking() && "from".equals(cmc.pkK), "장소 고르기 열기(빈 칸이면 찾기 없음)");
                ok(cmc.onQuery("강") == CmCore.R_RENDER && cmc.onQuery("강남") == CmCore.R_BUS && "강남".equals(cmc.pkQ), "두 글자부터 버스정류장을 찾는다");
                cmc.setStations(java.util.Arrays.asList("강남", "강남구청"));
                cmc.setBus(java.util.Arrays.asList("강남역.강남역사거리", "강남구청"), java.util.Arrays.asList(new double[] { 37.5, 127.0 }, new double[] { 37.51, 127.04 }));
                String pf2 = cmc.pageFacts(cs);
                ok(pf2.contains("\"sub\":\"pick\"") && pf2.contains("\"pick\":{\"k\":\"from\",\"q\":\"강남\"}") && pf2.contains("\"bus\":[\"강남역.강남역사거리\",\"강남구청\"]"), "장소 고르기 사실: " + pf2);
                ok(cmc.act(cs, "call", "pk.u.1", null, false, null) == (CmCore.R_RENDER | CmCore.R_RESCHED) && "강남구청".equals(CmCore.place(cs, "from")) && CmCore.placeJson(cs, "from").equals("{\"nm\":\"강남구청\"}") && cmc.sub.length() == 0, "역 후보 고르기 → 이름만 저장");
                cmc.act(cs, "call", "cm.pick.to", null, false, null); cmc.setBus(java.util.Arrays.asList("정류장A"), java.util.Arrays.<double[]>asList(new double[] { 37.25, 127.5 }));
                cmc.act(cs, "call", "pk.b.0", null, false, null);
                ok("정류장A".equals(CmCore.place(cs, "to")) && CmCore.placeJson(cs, "to").equals("{\"nm\":\"정류장A\",\"lat\":37.25,\"lng\":127.5,\"bus\":true}"), "버스 후보 고르기 → 좌표와 함께: " + CmCore.placeJson(cs, "to"));
                cmc.act(cs, "call", "cm.pick.eFrom", null, false, null);
                ok(cmc.act(cs, "call", "pk.u.5", null, false, null) == CmCore.R_NONE && cmc.act(cs, "call", "pk.save", null, false, "  사당  ") == (CmCore.R_RENDER | CmCore.R_RESCHED) && "사당".equals(CmCore.place(cs, "eFrom")), "직접 입력 저장(공백 정리) · 없는 후보 번호 무시");
                cmc.act(cs, "call", "cm.pick.to", null, false, null);
                cmc.act(cs, "call", "pk.save", null, false, "정류장A");
                ok(CmCore.placeJson(cs, "to").equals("{\"nm\":\"정류장A\"}"), "직접 입력하면 버스 좌표는 지운다");
                cmc.act(cs, "call", "cm.pick.to", null, false, null);
                ok(cmc.act(cs, "call", "pk.clear", null, false, null) == (CmCore.R_RENDER | CmCore.R_RESCHED) && CmCore.placeJson(cs, "to") == null, "비우기");
                cmc.act(cs, "call", "cm.pick.to", null, false, null);
                ok(cmc.act(cs, "call", "pg.back", null, false, null) == CmCore.R_RENDER && cmc.sub.length() == 0 && cmc.act(cs, "call", "pg.back", null, false, null) == CmCore.R_CLOSE, "뒤로: 하위 화면이면 한 칸, 아니면 닫기");
                ok(cmc.act(cs, "call", "cm.test", null, false, null) == CmCore.R_TEST, "지금 미리보기");
                // 엔진 요청 본문
                String bb = CmCore.briefBody(cs, "eve", 1760000000000L, new double[] { 37.5, 127.0 });
                ok(bb.equals("{\"kind\":\"eve\",\"nowMs\":1760000000000,\"from\":{\"nm\":\"강남구청\"},\"eFrom\":{\"nm\":\"사당\"},\"gps\":{\"lat\":37.5,\"lng\":127.0}}"), "브리핑 요청 본문: " + bb);
                String bbE = CmCore.briefBody(cs, "eve", 1760000000000L, new double[] { 37.5, 127.0 }, true);
                ok(bbE.contains(",\"eta\":1") && !bb.contains("\"eta\""), "s285: 알림 요청만 경로 소요(eta)를 요청한다: " + bbE);
                ok(CmCore.occBody(cs, 5L).equals("{\"op\":\"occ\",\"nowMs\":5,\"morn\":\"12:00\",\"eve\":\"00:05\",\"days\":[0,6]}"), "알람 시각 요청 본문: " + CmCore.occBody(cs, 5L));
                long[] oc = CmCore.parseOcc("{\"ok\":true,\"v\":1,\"morn\":[1,2,3],\"eve\":[9]}", "morn", 2);
                ok(oc.length == 2 && oc[1] == 2 && CmCore.parseOcc("{\"ok\":true,\"eve\":[9]}", "eve", 14)[0] == 9 && CmCore.parseOcc("{\"ok\":false}", "morn", 5).length == 0 && CmCore.parseOcc("망가짐", "morn", 5).length == 0, "알람 시각 읽기");
                String[] br = CmCore.parseBrief("{\"ok\":true,\"title\":\"출근길 브리핑\",\"body\":\"줄1\\n줄2\"}");
                ok(br != null && br[0].equals("출근길 브리핑") && br[1].equals("줄1\n줄2") && CmCore.parseBrief("{\"ok\":true,\"title\":\"\",\"body\":\"x\"}") == null && CmCore.parseBrief("{\"ok\":false}") == null, "브리핑 글 읽기");
                ok(CmCore.hm("7:30", "09:00").equals("09:00") && CmCore.hm("24:00", "09:00").equals("09:00") && CmCore.hm("23:59", "09:00").equals("23:59"), "시각 모양 검사");
            }
            String pu = ShellCore.pageUrl(ps, "ovl", true, false);
            ok(pu.startsWith("https://route-v2.phg0643.workers.dev/screen/settings?cap=8&p=ovl&f=") && pu.indexOf(' ') < 0 && pu.indexOf('"') < 0 && ShellCore.netOk(pu), "하위 화면 주소: 인코딩 · 허용 목록");
        }

        // ── 예전 웹뷰 즐겨찾기 가져오기(LegacyCore) ──
        {
            String fj = "[{\"s\":\"강남\",\"d\":\"역삼\",\"name\":\"출근\"},{\"s\":\"강남\",\"d\":\"역삼\",\"name\":\"중복\"},{\"s\":\"서울\",\"d\":\"서울\",\"name\":\"같음\"},{\"s\":\"홍대입구\",\"d\":\"잠실\"},{\"x\":1}]";
            byte[] key = ("_https://localhost\u0000\u0001mk_favorites").getBytes(java.nio.charset.Charset.forName("ISO-8859-1"));
            java.io.ByteArrayOutputStream w = new java.io.ByteArrayOutputStream();
            byte[] v16 = fj.getBytes(java.nio.charset.Charset.forName("UTF-16LE"));
            w.write(0xAA); w.write(1); w.write(key.length); w.write(key, 0, key.length);                   // 쓰기 기록: 종류 · 열쇠 길이 · 열쇠 · 값 길이(varint) · 값
            int vl = v16.length + 1; w.write((vl & 127) | 128); w.write(vl >> 7); w.write(0); w.write(v16, 0, v16.length);
            java.util.List<byte[]> fl = new java.util.ArrayList<byte[]>(); fl.add(w.toByteArray());
            String got = LegacyCore.findFavorites(fl);
            ok(got != null && LegacyCore.count(got) == 2 && got.contains("\"name\":\"출근\"") && got.contains("홍대입구→잠실") && !got.contains("중복") && !got.contains("같음"), "예전 즐겨찾기: 쓰기 기록(UTF-16)에서 찾고 중복·출발=도착은 거른다 " + got);
            String lat = "[{\"s\":\"A\",\"d\":\"B\",\"name\":\"n\"}]";
            java.io.ByteArrayOutputStream t = new java.io.ByteArrayOutputStream();
            t.write(0); t.write(key.length); t.write(lat.length() + 1); t.write(key, 0, key.length); t.write(1); byte[] lb = lat.getBytes(java.nio.charset.Charset.forName("ISO-8859-1")); t.write(lb, 0, lb.length);   // 표: 값이 열쇠 바로 뒤
            java.util.List<byte[]> tl = new java.util.ArrayList<byte[]>(); tl.add(t.toByteArray());
            ok(LegacyCore.count(String.valueOf(LegacyCore.findFavorites(tl))) == 1, "예전 즐겨찾기: 표 모양(Latin1, 값이 바로 뒤)도 찾는다");
            java.util.List<byte[]> two = new java.util.ArrayList<byte[]>(); two.add(w.toByteArray()); two.add(t.toByteArray());
            ok(LegacyCore.count(LegacyCore.findFavorites(two)) == 1, "예전 즐겨찾기: 여러 파일이면 나중 것이 이긴다");
            java.util.List<byte[]> bad = new java.util.ArrayList<byte[]>(); bad.add("mk_favorites\u0000\u0001garbage".getBytes()); bad.add(new byte[0]); bad.add(null);
            ok(LegacyCore.findFavorites(bad) == null && LegacyCore.findFavorites(new java.util.ArrayList<byte[]>()) == null, "예전 즐겨찾기: 엉뚱한 바이트·빈 입력은 못 찾은 것으로(지어내지 않는다)");
            StringBuilder many = new StringBuilder("["); for (int i = 0; i < 12; i++) many.append(i > 0 ? "," : "").append("{\"s\":\"가").append(i).append("\",\"d\":\"나\",\"name\":\"x\"}"); many.append(']');
            ok(LegacyCore.count(String.valueOf(LegacyCore.shape(many.toString()))) == 8, "예전 즐겨찾기: 최대 8개");
        }

        // ── 예전 값들: 아이디 · 출퇴근 브리핑(앱 본체 저장소 kv · localStorage 파일) ──
        {
            String kv = "{\"mk_favorites\":\"[{\\\"s\\\":\\\"A\\\",\\\"d\\\":\\\"B\\\"}]\",\"mk_comm_id\":\"\\\"홍길동_1\\\"\",\"mk_pt\":\"{\\\"total\\\":120,\\\"today\\\":5,\\\"today_str\\\":\\\"Wed Oct 21 2026\\\"}\",\"mk_pts\":\"{\\\"total\\\":150,\\\"date\\\":\\\"x\\\"}\","
                + "\"commuteAlarm\":\"{\\\"on\\\":true,\\\"morn\\\":\\\"08:10\\\",\\\"eve\\\":\\\"19:00\\\",\\\"from\\\":\\\"인하대\\\",\\\"to\\\":\\\"강남\\\",\\\"days\\\":[1,3,9],\\\"eFrom\\\":\\\"정류장Z\\\",\\\"eFromLat\\\":37.1,\\\"eFromLng\\\":127.2,\\\"eFromBus\\\":true,\\\"lastKey\\\":\\\"k\\\"}\"}";
            LegacyCore.Found fd = LegacyCore.find(null, kv);
            ok(fd.any() && LegacyCore.count(fd.fav) == 1 && "홍길동_1".equals(fd.id) && fd.commute != null, "예전 값(앱 본체 저장소): 즐겨찾기 · 아이디 · 출퇴근(포인트는 가져오지 않는다)");
            ShellCore.MemStore ls = new ShellCore.MemStore();
            ok(LegacyCore.applyCommute(ls, fd.commute) && CmCore.on(ls) && "08:10".equals(CmCore.morn(ls)) && "19:00".equals(CmCore.eve(ls)) && CmCore.days(ls).toString().equals("[1, 3]")
               && "인하대".equals(CmCore.place(ls, "from")) && CmCore.placeJson(ls, "to").equals("{\"nm\":\"강남\"}") && CmCore.placeJson(ls, "eFrom").equals("{\"nm\":\"정류장Z\",\"lat\":37.1,\"lng\":127.2,\"bus\":true}"), "예전 출퇴근 설정 옮기기: " + ls.m);
            ok(!LegacyCore.applyCommute(new ShellCore.MemStore(), "{\"x\":1}") && !LegacyCore.applyCommute(new ShellCore.MemStore(), "망가짐") && LegacyCore.find(null, null).any() == false, "엉뚱한 값은 옮기지 않는다");
            ok(LegacyCore.idOf("\"a\"") == null && LegacyCore.idOf("\"새 이름!\"") == null && "abc".equals(LegacyCore.idOf("abc")) && LegacyCore.idOf("{\"a\":1}") == null, "아이디 규칙 검사");
            // localStorage 파일에서: 쓰기 기록 모양(UTF-16) 으로 아이디·출퇴근
            java.util.List<byte[]> files = new java.util.ArrayList<byte[]>();
            files.add(logRec("mk_comm_id", "\"길동무_7\""));
            files.add(logRec("commuteAlarm", "{\"on\":false,\"morn\":\"07:00\",\"eve\":\"18:00\",\"from\":\"사당\"}"));
            LegacyCore.Found fg = LegacyCore.find(files, null);
            ok("길동무_7".equals(fg.id) && fg.commute != null && fg.fav == null, "예전 값(localStorage 파일): 아이디 · 출퇴근");
        }

        // ── 앱 규칙(엔진 /rules 쪽 껍데기) ──
        ShellCore.MemStore rs = new ShellCore.MemStore();
        long t0 = 1792454400000L;
        String cb = RulesCore.checkBody(rs, "post", "잡담", t0, "제목", "내\"용");
        ok(cb.startsWith("{\"op\":\"check\",\"kind\":\"post\",\"cat\":\"잡담\"") && !cb.contains("\"pt\"") && !cb.contains("\"day\"") && cb.endsWith("\"texts\":[\"제목\",\"내\\\"용\"]}"), "검사 요청: " + cb);
        ok("".equals(RulesCore.checkError("{\"ok\":true}")) && "".equals(RulesCore.checkError("")) && "".equals(RulesCore.checkError("<html>")), "통과 · 엔진 못 닿음 · 깨진 답은 막지 않는다");
        ok("욕설 안 돼요".equals(RulesCore.checkError("{\"ok\":false,\"msg\":\"욕설 안 돼요\"}")) && "등록할 수 없어요".equals(RulesCore.checkError("{\"ok\":false}")), "거절 문구");
        java.util.List<String> sec = new java.util.ArrayList<String>(); sec.add("2호선"); sec.add("수도권 1호선");
        String mb = RulesCore.mylinesBody("[{\"l\":\"2호선\",\"n\":3,\"t\":5}]", sec, t0);
        ok(mb.equals("{\"op\":\"mylines\",\"now\":1792454400000,\"my\":[{\"l\":\"2호선\",\"n\":3,\"t\":5}],\"sec\":[\"2호선\",\"수도권 1호선\"]}") && RulesCore.mylinesBody(null, null, 1L).contains("\"my\":[],\"sec\":[]"), "탄 노선 요청: " + mb);
        ok(RulesCore.applyMyLines(rs, "{\"ok\":true,\"my\":[{\"l\":\"1호선\",\"n\":1,\"t\":99}],\"lines\":[\"1호선\"]}") && rs.get(ChatCore.K_MY, "").startsWith("[{") && rs.get(ChatCore.K_MY, "").contains("\"l\":\"1호선\"") && rs.get(ChatCore.K_MY, "").contains("\"n\":1") && rs.get(ChatCore.K_MY, "").contains("\"t\":99") && !RulesCore.applyMyLines(rs, "{\"ok\":false}"), "탄 노선 기록 저장");

        // ── s278: 설정 화면 안 출퇴근 장소 입력칸(하위 화면 없이) ──
        {
            ShellCore.MemStore cs = new ShellCore.MemStore();
            CmCore c = new CmCore();
            c.focusInline("to", "");
            ok(c.inl && "to".equals(c.pkK) && CmCore.inlX.contains("\"pick\":{\"k\":\"to\"") && !c.picking(), "입력칸에 들어오면 그 칸이 고치는 중(하위 화면 아님)");
            ok(c.onInline("to", "강") == CmCore.R_RENDER, "한 글자는 버스 검색 없이 다시 그리기만");
            ok(c.onInline("to", "강남") == (CmCore.R_RENDER | CmCore.R_BUS), "두 글자부터: 지하철 후보는 바로 그리고 버스 후보도 찾는다(s281)");
            c.setBus(java.util.Arrays.asList("강남역"), java.util.Arrays.asList(new double[] { 37.49, 127.02 }));
            ok(ShellCore.settingsFacts(cs).contains("\"bus\":[\"강남역\"]") && ShellCore.settingsFacts(cs).contains("\"q\":\"강남\""), "고치는 중인 칸 · 글자 · 버스 후보가 설정 화면 요청에 실린다");
            ok((c.act(cs, "call", "pk.b.0", null, false, null) & CmCore.R_RESCHED) != 0 && "강남역".equals(CmCore.place(cs, "to")) && cs.get("cm_to_g", "").startsWith("37.49,127.02") && !c.inl && CmCore.inlX.length() == 0, "버스 후보를 누르면 좌표와 함께 저장하고 고치기가 끝난다");
            c.focusInline("from", "아");
            ok((c.act(cs, "call", "pk.n", null, false, "아라") & CmCore.R_RESCHED) != 0 && "아라".equals(CmCore.place(cs, "from")) && cs.get("cm_from_g", "x").length() == 0 && !c.inl, "지하철 후보를 누르면 이름만 저장");
            c.focusInline("eFrom", "");
            ok((c.act(cs, "call", "pk.save.eFrom", null, false, "  부평  ") & CmCore.R_RESCHED) != 0 && "부평".equals(CmCore.place(cs, "eFrom")), "[저장]/엔터는 그 칸 글자를 다듬어 저장");
            ok((c.act(cs, "call", "pk.save.eFrom", null, false, "") & CmCore.R_RESCHED) != 0 && CmCore.place(cs, "eFrom").length() == 0, "비워서 저장하면 지운다");
            ok(c.act(cs, "call", "pk.save.zzz", null, false, "x") == CmCore.R_NONE && c.act(cs, "call", "pk.n", null, false, "x") == CmCore.R_NONE, "모르는 칸 · 고치는 중이 아닐 때의 후보 누름은 무시");
            c.focusInline("to", "x"); ok(c.endInline() && !c.endInline() && CmCore.inlX.length() == 0, "고치기를 끝내면 요청 조각이 사라진다");
            ok(c.act(cs, "call", "cm.test", null, false, null) == CmCore.R_TEST, "미리보기는 어느 상태에서나");
            // s281: 입력칸을 벗어나면 자동 저장
            c.focusInline("to", ""); 
            ok((c.blurInline(cs, "to", "  광화문 ") & CmCore.R_RESCHED) != 0 && "광화문".equals(CmCore.place(cs, "to")) && !c.inl, "벗어나면 친 글자를 자동 저장");
            c.focusInline("to", "광화문");
            ok(c.blurInline(cs, "to", "광화문") == CmCore.R_RENDER && "광화문".equals(CmCore.place(cs, "to")), "같은 글자면 알림 다시 예약 없이 닫기만");
            c.focusInline("to", "");
            ok(c.blurInline(cs, "to", "  ") == CmCore.R_RENDER && "광화문".equals(CmCore.place(cs, "to")), "다 지우고 벗어나면 저장된 것은 그대로(Enter 로만 비움)");
            ok(c.blurInline(cs, "to", "x") == CmCore.R_NONE, "고치는 중이 아니면 무시");
            // s281: 시각 고르기 팝업 사실
            cs.put(CmCore.K_EVE, "18:30");
            String pf = CmCore.tpPopFacts(cs, "eve");
            ok(pf.contains("\"pop\":true") && pf.contains("\"sub\":\"tp\"") && pf.contains("\"t\":\"eve\"") && pf.contains("\"ap\":\"pm\"") && pf.contains("\"h\":6") && pf.contains("\"m\":30"), "시각 팝업 사실: 지금 저장된 시각(오후 6:30)에서 시작");
            CmCore tp = new CmCore(); tp.act(cs, "call", "cm.tp.morn", null, false, null); tp.pop = true;
            ok(tp.pageFacts(cs).contains("\"pop\":true") && (tp.act(cs, "call", "tp.h.9", null, false, null) & CmCore.R_RENDER) != 0 && tp.tpH == 9, "팝업에서 시를 고르면 상태에 적힌다");
            ok((tp.act(cs, "call", "tp.ok", null, false, null) & CmCore.R_RESCHED) != 0 && !tp.pop && tp.sub.length() == 0 && CmCore.morn(cs).startsWith("09:"), "확인 = 저장하고 팝업을 끝낸다");
            String[] bf = CmCore.parseBrief("{\"ok\":true,\"kind\":\"eve\",\"title\":\"퇴근길 브리핑\",\"body\":\"a\\nb\"}");
            ok(bf != null && bf.length == 3 && "eve".equals(bf[2]) && "morn".equals(CmCore.parseBrief("{\"ok\":true,\"title\":\"t\",\"body\":\"b\"}")[2]), "브리핑 응답에서 엔진이 정한 출근/퇴근 종류도 읽는다");
        }
        // ── 설정 사실 ──
        ShellCore.MemStore s2 = new ShellCore.MemStore();
        String f = ShellCore.settingsFacts(s2);
        ok(f.equals("{\"id\":\"\",\"np\":{\"arrive\":1,\"transfer\":1,\"arrive_reco\":1},\"ovl\":0,\"sam\":0,\"samw\":0,\"cm\":0,\"cmi\":1,\"cmh\":1,\"cmf\":{\"nat\":true,\"nv\":true,\"on\":false,\"morn\":\"07:30\",\"eve\":\"18:30\",\"days\":[1,2,3,4,5],\"from\":\"\",\"to\":\"\",\"eFrom\":\"\",\"eTo\":\"\"},\"errn\":0,\"pgs\":[\"sam\",\"ovl\",\"arr\",\"cm\",\"gw\",\"dev\"],\"rl\":1,\"th\":\"pastel\"}"), "기본 기기 사실: " + f);
        s2.put("comm_id", "길동무7"); s2.put("np_transfer", "0"); s2.put("ride_log_off", "1"); s2.put("theme", "dark");
        f = ShellCore.settingsFacts(s2);
        ok(f.contains("\"id\":\"길동무7\"") && f.contains("\"transfer\":0") && f.contains("\"rl\":0") && f.contains("\"th\":\"dark\""), "바뀐 기기 사실");
        s2.put("comm_id", "a\"b\\c\nd");
        ok(ShellCore.settingsFacts(s2).contains("a\\\"b\\\\c\\nd"), "아이디의 따옴표·역슬래시·줄바꿈은 이스케이프");
        String u = ShellCore.settingsUrl(s2);
        ok(u.startsWith("https://route-v2.phg0643.workers.dev/screen/settings?cap=8&f=") && u.indexOf(' ') < 0 && u.indexOf('"') < 0 && ShellCore.netOk(u), "설정 주소: 인코딩 · 허용 목록");

        // ── 설정 눌림 ──
        ShellCore.MemStore s3 = new ShellCore.MemStore();
        e = ShellCore.routeSettings(s3, "set", "", "n.transfer", false, null);
        ok(e.kind == ShellCore.E_REFRESH && "0".equals(s3.get("np_transfer", "1")), "알림 스위치 끔 → 저장 + 다시 받기");
        e = ShellCore.routeSettings(s3, "set", "", "n.transfer", true, null);
        ok("1".equals(s3.get("np_transfer", "0")), "알림 스위치 켬");
        ok(ShellCore.routeSettings(s3, "set", "", "n.evil", true, null).kind == ShellCore.E_NONE && s3.m.get("np_evil") == null, "모르는 알림 키는 저장 안 함");
        e = ShellCore.routeSettings(s3, "set", "", "rl", false, null);
        ok(e.kind == ShellCore.E_REFRESH && "1".equals(s3.get("ride_log_off", "0")), "도착 오차 기록 끔");
        ok(ShellCore.routeSettings(s3, "set", "", "f.scrh", true, null).kind == ShellCore.E_NONE, "웹 기능 스위치(f.*)는 무시");
        e = ShellCore.routeSettings(s3, "sel", "dark", "", false, null);
        ok(e.kind == ShellCore.E_REFRESH && "dark".equals(ShellCore.theme(s3)), "테마 고르기");
        ok(ShellCore.routeSettings(s3, "sel", "neon", "", false, null).kind == ShellCore.E_NONE && "dark".equals(ShellCore.theme(s3)), "모르는 테마는 무시");

        Map<String, String> fl = new HashMap<String, String>();
        fl.put("cid", " 홍길동 ");
        e = ShellCore.routeSettings(s3, "call", "saveId", "", false, fl);
        ok(e.kind == ShellCore.E_TOAST && "홍길동".equals(s3.get("comm_id", "")) && e.arg.contains("홍길동"), "아이디 저장(앞뒤 공백 제거)");
        fl.put("cid", "a");
        e = ShellCore.routeSettings(s3, "call", "saveId", "", false, fl);
        ok(e.kind == ShellCore.E_TOAST && e.arg.contains("2~12자") && "홍길동".equals(s3.get("comm_id", "")), "너무 짧은 아이디 거절 · 저장값 그대로");
        fl.put("cid", "bad id!");
        ok(ShellCore.routeSettings(s3, "call", "saveId", "", false, fl).arg.contains("한글·영문·숫자"), "특수문자 아이디 거절");
        fl.put("cid", "1234567890123");
        ok(ShellCore.routeSettings(s3, "call", "saveId", "", false, fl).arg.contains("2~12자"), "13자 아이디 거절");
        ok(ShellCore.routeSettings(s3, "call", "saveId", "", false, null).arg.contains("2~12자"), "입력칸 값이 없으면 거절");
        e = ShellCore.routeSettings(s3, "call", "clearId", "", false, null);
        ok(e.kind == ShellCore.E_TOAST && "".equals(s3.get("comm_id", "x")), "아이디 삭제");
        ok(ShellCore.routeSettings(s3, "call", "pol.nothing", "", false, null).kind == ShellCore.E_TOAST, "아직 없는 기능은 알림");
        ok(ShellCore.routeSettings(s3, "web", "cm", "", false, null).kind == ShellCore.E_TOAST, "web 행동은 '옮기는 중' 알림");
        ok(ShellCore.routeSettings(s3, "call", "tab.map", "", false, null).kind == ShellCore.E_TAB, "설정 화면에서 온 탭 이동");
        ok(ShellCore.routeSettings(s3, null, null, null, false, null).kind == ShellCore.E_NONE, "빈 눌림은 무시");

        // ── 출처 · 임시 화면 · 색 ──
        for (String t : ShellCore.TABS) {
            try { ScreenCore.load(ShellCore.pendingScreen(t)); ok(true, "임시 화면 검증 통과: " + t); }
            catch (ScreenCore.ParseError pe) { ok(false, "임시 화면 검증 실패 " + t + ": " + pe.getMessage()); }
        }

        // ── 칸(slot) · 요청 ──
        ShellCore.MemStore s4 = new ShellCore.MemStore();
        String[] sl = ShellCore.slotsOf(s4, "community");
        ok(sl.length == 2 && "cchips".equals(sl[0]) && "news".equals(sl[1]), "커뮤니티 기본 = 칩 줄 + 뉴스");
        s4.put("cc_mode", "set");
        ok("settings".equals(ShellCore.slotsOf(s4, "community")[1]), "설정 칩이면 설정 화면");
        s4.put("cc_mode", "board");
        ok("board".equals(ShellCore.slotsOf(s4, "community")[1]), "게시판 칩이면 게시판 화면");
        s4.put("cc_mode", "chat");
        ok("chat".equals(ShellCore.slotsOf(s4, "community")[1]), "채팅 칩이면 실시간소통 화면");
        s4.put("cc_mode", "zzz");
        ok("news".equals(ShellCore.mode(s4)), "모르는 칩은 기본으로");
        ok(ShellCore.slotsOf(s4, "shop").length == 1 && "shop".equals(ShellCore.slotsOf(s4, "shop")[0]), "쇼핑 한 칸");
        ShellCore.Req rq = ShellCore.request("shop", s4, new String[0]);
        ok("GET".equals(rq.method) && rq.url.equals("https://route-v2.phg0643.workers.dev/screen/shop?cap=26") && rq.body == null, "쇼핑 요청(분류 없음)");
        s4.put("shop_cat", "식사 & 간식");
        ok(ShellCore.request("shop", s4, new String[0]).url.endsWith("&cat=%EC%8B%9D%EC%82%AC+%26+%EA%B0%84%EC%8B%9D"), "쇼핑 분류 인코딩");
        rq = ShellCore.request("cchips", s4, null);
        ok("POST".equals(rq.method) && rq.body.equals("{\"cap\":26,\"f\":{\"mode\":\"news\"}}"), "칩 줄 요청: " + rq.body);
        ok(ShellCore.feedUrls("news").length == 2 && ShellCore.netOk(ShellCore.feedUrls("news")[0]) && ShellCore.netOk(ShellCore.feedUrls("news")[1]), "뉴스 원자료 주소는 허용 목록 안");
        ok(ShellCore.feedUrls("shop").length == 0 && ShellCore.request("pending", s4, null) == null, "원자료 없는 화면 · 모르는 화면은 요청 없음");

        // ── 뉴스 원자료 ──
        String f0 = "{\"ok\":true,\"items\":[{\"title\":\"  코스피 &amp; 환율  \\n 급등 \",\"link\":\"https://a.com/1\",\"desc\":\"요약 &#39;x&#39;\",\"source\":\"연합&apos;뉴스\",\"ts\":1700000000000,\"cat\":\"경제\"},{\"title\":\"\"},{\"link\":\"x\"}]}";
        String f1 = "{\"ok\":true,\"cats\":{\"증시\":[{\"title\":\"나스닥 마감\",\"link\":\"https://b.com/2\",\"source\":\"한경\",\"ts\":1700000001000}]}}";
        ShellCore.NewsRows nr = ShellCore.NewsRows.from(new String[] { f0, f1 });
        ok(nr.rows.size() == 2, "빈 제목은 건너뛴다: " + nr.rows.size());
        ok(nr.rows.get(0)[0].equals("코스피 & 환율 급등") && nr.rows.get(0)[5].equals("요약 'x'") && nr.rows.get(0)[2].equals("연합'뉴스"), "이름표 풀기 · 공백 정리");
        ok(nr.rows.get(1)[4].equals("증시") && nr.rows.get(1)[3].equals("1700000001000"), "서버 분류 칸 · 시각");
        ok(nr.rowJson(1).equals("[\"나스닥 마감\",\"https://b.com/2\",\"한경\",1700000001000,\"증시\",\"\"]"), "기사 줄 JSON: " + nr.rowJson(1));
        ok(nr.rowJson(9).equals("[]"), "없는 번호");
        try { ScreenCore.parse(nr.json()); ok(true, "기사 목록은 올바른 JSON"); } catch (ScreenCore.ParseError pe) { ok(false, "기사 목록 JSON 오류"); }
        ok(ShellCore.NewsRows.from(new String[] { "", "not json" }).rows.isEmpty() && ShellCore.NewsRows.from(null).rows.isEmpty(), "원자료가 없거나 깨져도 빈 목록");
        {
            String fdup = "{\"ok\":true,\"cats\":{\"경제\":[{\"title\":\"코스피  &amp; 환율 급등\",\"link\":\"https://a.com/1\"}]}}";
            ok(ShellCore.NewsRows.from(new String[] { f0, fdup }).rows.size() == 1, "원자료 두 곳에 같은 기사(공백 뺀 제목)가 있으면 한 번만");
            StringBuilder big = new StringBuilder("{\"ok\":true,\"items\":[");
            String dsc = new String(new char[600]).replace('\0', '가');
            for (int i = 0; i < 1500; i++) { if (i > 0) big.append(','); big.append("{\"title\":\"기사 번호 ").append(i).append(" 제목입니다 아주 길게\",\"link\":\"https://news.example.com/article/2026/10/21/").append(i).append("\",\"source\":\"연합뉴스\",\"ts\":1700000000000,\"desc\":\"").append(dsc).append("\"}"); }
            big.append("]}");
            ShellCore.NewsRows bn = ShellCore.NewsRows.from(new String[] { big.toString() });
            ok(bn.rows.size() == ShellCore.NewsRows.MAX && bn.listJson().length() < ScreenCore.NET_MAX_REQ / 2, "기사가 아주 많아도(링크 · 긴 요약 포함) 엔진 요청 본문은 한도의 절반 안: " + bn.listJson().length());
            ok(!nr.listJson().contains("a.com") && nr.listJson().contains("코스피 & 환율 급등") && nr.listJson().contains("1700000001000") && nr.rowJson(1).contains("b.com/2"), "목록 요청 줄에는 링크 · 언론사가 없고 상세용 전체 줄에는 있다");
            ok(nr.rowJsonById("코스피 & 환율 급등", "코스피 & 환율 급등", 0).equals(nr.rowJson(0)) && nr.rowJsonById("나스닥 마감", "나스닥 마감", 1).equals(nr.rowJson(1)), "엔진이 링크 없이 준 id(제목)로도 같은 기사를 찾는다");
            try { ScreenCore.Screen es = ScreenCore.load(ShellCore.errorScreen("HTTP 503")); ok(es.body.size() == 3 && ShellCore.errorScreen("").length() < ShellCore.errorScreen("HTTP 503").length(), "안내 화면에 못 받은 이유가 작게 붙는다"); }
            catch (ScreenCore.ParseError pe2) { ok(false, "안내 화면 JSON 오류: " + pe2.getMessage()); }
        }
        ok(nr.rowJsonById("https://b.com/2", "x").equals(nr.rowJson(1)) && nr.rowJsonById("https://a.com/1", "").equals(nr.rowJson(0)), "기사 고유 id(링크)로 줄 찾기 — 순서가 바뀌어도 같은 기사");
        ok(nr.rowJsonById("https://gone.com/9", "사라진 기사").equals("[\"사라진 기사\",\"https://gone.com/9\",\"\",0,\"\",\"\"]") && nr.rowJsonById("제목만", "").startsWith("[\"제목만\",\"\""), "목록에서 사라진 기사도 눌린 줄이 준 제목 · 링크로 연다");
        {
            ShellCore.Cond cd = new ShellCore.Cond("\"abc\"", 1000L, 60, 7);
            ok(cd.fresh(1000L + 59000L, 7) && !cd.fresh(1000L + 60000L, 7) && !cd.fresh(2000L, 8) && !cd.fresh(500L, 7) && !new ShellCore.Cond("", 1000L, 60, 7).fresh(1500L, 7) && !new ShellCore.Cond("\"a\"", 1000L, 0, 7).fresh(1500L, 7), "신선 시간 안 · 같은 요청 · ETag 있음일 때만 네트워크 없이 쓴다");
            ShellCore.Cond rt = ShellCore.Cond.parse(cd.enc());
            ok(rt != null && rt.etag.equals("\"abc\"") && rt.at == 1000L && rt.maxAge == 60 && rt.sig == 7 && ShellCore.Cond.parse("") == null && ShellCore.Cond.parse("a\nb") == null && ShellCore.Cond.parse("a\nx\n1\n2") == null, "조건부 요청 메모 저장 · 읽기(깨진 글은 버린다)");
            ShellCore.Cond tc = cd.touched(5000L, 0, 7);
            ok(tc.at == 5000L && tc.maxAge == 60 && tc.etag.equals(cd.etag) && ShellCore.condKey("news|x").startsWith("cm_"), "304 를 받으면 받은 시각만 새로 한다");
            ok(NetPost.parseRetryAfter("2") == 2 && NetPost.parseRetryAfter(" 60 ") == 60 && NetPost.parseRetryAfter(null) == 0 && NetPost.parseRetryAfter("Wed, 21 Oct") == 0 && NetPost.parseRetryAfter("") == 0, "Retry-After 초 읽기");
            ok(NetPost.retryable(429, 2) && NetPost.retryable(503, 3) && NetPost.retryable(429, 0) && !NetPost.retryable(429, 60) && !NetPost.retryable(200, 0) && !NetPost.retryable(500, 1) && !NetPost.retryable(-1, 0), "429 · 503 이고 3초 이하일 때만 조용히 한 번 다시(오래 차단 중이면 기다리지 않는다)");
            ok(NetPost.iidOk("0123456789abcdef0123456789abcdef") && !NetPost.iidOk("short") && !NetPost.iidOk("has space 12345678") && !NetPost.iidOk(null), "기기 번호 모양(서버 gdIid 와 같다)");
            ok(NetPost.parseMaxAge("private, max-age=45") == 45 && NetPost.parseMaxAge("no-store") == 0 && NetPost.parseMaxAge(null) == 0 && NetPost.parseMaxAge("max-age=") == 0 && NetPost.parseMaxAge("max-age=99999999999") < 100000000, "Cache-Control max-age 읽기");
        }
        {
            // 같은 링크의 줄이 여럿이어도 엔진이 알려 준 원래 위치(ix)에 가장 가까운 줄이 열린다
            String fd = "{\"ok\":true,\"items\":[{\"title\":\"첫 기사\",\"link\":\"https://dup.com/1\",\"source\":\"가\",\"ts\":1},{\"title\":\"다른 기사\",\"link\":\"https://o.com/2\",\"ts\":2},{\"title\":\"같은 링크 다른 제목\",\"link\":\"https://dup.com/1\",\"source\":\"나\",\"ts\":3}]}";
            ShellCore.NewsRows dn = ShellCore.NewsRows.from(new String[] { fd });
            ok(dn.rows.size() == 3, "중복 링크 줄도 앱 목록엔 모두 있다");
            ok(dn.rowJsonById("https://dup.com/1", "", 2).equals(dn.rowJson(2)) && dn.rowJsonById("https://dup.com/1", "", 0).equals(dn.rowJson(0)) && dn.rowJsonById("https://dup.com/1", "", 1).equals(dn.rowJson(0)) && dn.rowJsonById("https://dup.com/1", "", 9).equals(dn.rowJson(2)) && dn.rowJsonById("https://dup.com/1", "", -1).equals(dn.rowJson(0)), "같은 id 가 여럿이면 원래 위치(ix)에 가장 가까운 줄 · ix 가 없으면 처음 줄");
        }
        {
            int[] rh = ShellCore.retryHint("{\"ok\":true,\"v\":1,\"screen\":\"shop\",\"delayed\":true,\"retry\":[4,8,15,999,0],\"head\":[],\"body\":[]}");
            ok(rh != null && rh.length == 5 && rh[0] == 4 && rh[3] == 120 && rh[4] == 1, "서버 지연 안내의 재시도 간격은 1~120초로 읽는다");
            ok(ShellCore.retryHint("{\"ok\":true,\"delayed\":true}").length == ShellCore.DEFAULT_RETRY.length && ShellCore.retryHint("{\"ok\":true,\"v\":1,\"screen\":\"shop\"}") == null && ShellCore.retryHint("{\"delayed\":false}") == null && ShellCore.retryHint("") == null && ShellCore.retryHint(null) == null && ShellCore.retryHint("{\"delayed\":tru") == null, "간격이 없으면 기본값 · 안내가 아니면 null · 깨진 글도 안전");
            ShellCore.MemStore ss = new ShellCore.MemStore();
            String k1 = ShellCore.cacheKey("settings", ss);
            ss.put("ovl_on", "1");
            String k2 = ShellCore.cacheKey("settings", ss);
            ShellCore.MemStore ss2 = new ShellCore.MemStore();
            ok(k1.startsWith("settings|") && !k1.equals(k2) && k1.equals(ShellCore.cacheKey("settings", ss2)) && "settings".equals(ShellCore.expectId(k2)) && ShellCore.diskTtl(k2) > 0L, "설정 화면 캐시 열쇠는 기기 저장값의 지문 — 값이 바뀌면 옛 화면이 나오지 않는다");
        }
        s4.put("news_cat", "증시");
        rq = ShellCore.request("news", s4, new String[] { f0, f1 });
        ok(rq.body.startsWith("{\"cap\":26,\"f\":{\"cat\":\"증시\"},\"n\":[[") && ShellCore.netOk(rq.url), "뉴스 요청 본문");
        ok(ShellCore.decode("a&lt;b&gt;&quot;&#x41;&unknown;&").equals("a<b>\"A&unknown;&"), "이름표 풀기 모음");

        // ── 칸별 눌림 ──
        ShellCore.MemStore s5 = new ShellCore.MemStore();
        e = ShellCore.route("cchips", s5, "call", "cc.set", "", false, "", null);
        ok(e.kind == ShellCore.E_TAB && "set".equals(ShellCore.mode(s5)), "칩 누름 → 칸 바뀜(탭 다시 그리기)");
        ok(ShellCore.route("cchips", s5, "call", "cc.hack", "", false, "", null).kind == ShellCore.E_NONE, "모르는 칩 무시");
        e = ShellCore.route("shop", s5, "cat", "추천", "", false, "", null);
        ok(e.kind == ShellCore.E_REFRESH && "추천".equals(s5.get("shop_cat", "")), "쇼핑 분류 누름");
        e = ShellCore.route("shop", s5, "open", "", "", false, "https://link.coupang.com/a/1", null);
        ok(e.kind == ShellCore.E_LINK && e.arg.startsWith("https://"), "쇼핑 링크 열기");
        ok(ShellCore.route("shop", s5, "open", "", "", false, "javascript:alert(1)", null).kind == ShellCore.E_NONE && ShellCore.route("shop", s5, "open", "", "", false, "intent://x", null).kind == ShellCore.E_NONE, "http(s) 아닌 주소는 열지 않는다");
        ok(ShellCore.route("shop", s5, "refresh", "", "", false, "", null).kind == ShellCore.E_REFRESH, "새로고침");
        e = ShellCore.route("news", s5, "cat", "경제", "", false, "", null);
        ok(e.kind == ShellCore.E_REFRESH && "경제".equals(s5.get("news_cat", "")), "뉴스 칩");
        e = ShellCore.route("news", s5, "call", "nw.12", "", false, "", null);
        ok(e.kind == ShellCore.E_NEWS && "12".equals(e.arg), "기사 누름");
        ok(ShellCore.route("news", s5, "call", "nw.x", "", false, "", null).kind == ShellCore.E_NONE && ShellCore.route("news", s5, "call", "nw.-1", "", false, "", null).kind == ShellCore.E_NONE && ShellCore.route("news", s5, "call", "nw.99999", "", false, "", null).kind == ShellCore.E_NONE, "엉터리 기사 번호 무시");
        e = ShellCore.routeSearch("https://www.coupang.com/np/search?q={q}", "https://coupa.ng/x", " 라면 ");
        ok(e.kind == ShellCore.E_LINK && e.arg.equals("https://www.coupang.com/np/search?q=%EB%9D%BC%EB%A9%B4"), "검색: 글이 있으면 tpl");
        e = ShellCore.routeSearch("https://www.coupang.com/np/search?q={q}", "https://coupa.ng/x", " ");
        ok(e.kind == ShellCore.E_LINK && e.arg.equals("https://coupa.ng/x"), "검색: 비었으면 empty");
        ok(ShellCore.routeSearch("", "", "a").kind == ShellCore.E_NONE, "주소 없으면 무시");

        // ── 기사 상세 ──
        ShellCore.Detail dt = ShellCore.parseDetail("{\"ok\":true,\"v\":1,\"detail\":{\"cat\":\"경제\",\"title\":\"제목\",\"meta\":\"3분 전 · 한경\",\"desc\":\"\",\"empty\":\"요약 없음\",\"notice\":\"출처\",\"btn\":\"한경 원문 보기 ›\",\"close\":\"닫기\",\"open\":1}}", "https://b.com/2");
        ok(dt != null && dt.title.equals("제목") && dt.body.equals("요약 없음") && dt.open && dt.btn.contains("원문"), "상세 읽기(요약 없으면 안내 글)");
        dt = ShellCore.parseDetail("{\"ok\":true,\"detail\":{\"title\":\"t\",\"desc\":\"d\",\"open\":1}}", "javascript:x");
        ok(dt != null && !dt.open && "d".equals(dt.body), "이상한 링크면 원문 단추를 숨긴다");
        ok(ShellCore.parseDetail("{\"ok\":false}", "") == null && ShellCore.parseDetail("zzz", "") == null, "상세를 못 읽으면 null");
        ok(ShellCore.newsDetailBody("[\"a\"]").equals("{\"cap\":26,\"d\":[\"a\"]}"), "상세 요청 본문");

        ok(ShellCore.palette("dark").length == 14 && ShellCore.palette("pastel").length == 14 && ShellCore.palette("zzz")[0] == 0xFFF0F4F8, "팔레트 14칸 · 기본은 파스텔");
        ok(ShellCore.palette("dark")[0] == 0xFF121214 && ShellCore.palette("dark")[5] == 0xFFD4AF37, "다크 배경·금색");

        // ── 홈 탭 입력 ──
        HomeCore h = new HomeCore();
        HomeCore.Env env = new HomeCore.Env(); env.nowMs = 0; env.tzoMin = -540; env.y = 2026; env.m = 9; env.d = 20;
        String hrq = h.request(env, 18);
        ok(hrq.equals("{\"cap\":18,\"f\":{\"start\":\"\",\"dest\":\"\",\"active\":\"\",\"startSet\":false,\"destSet\":false,\"gps\":false,\"rs\":false,\"base\":{\"ms\":null,\"tzo\":-540,\"today\":[2026,9,20],\"now\":0}},\"d\":{}}"), "홈 요청 본문(빈 상태): " + hrq);
        ok(h.onText("start", "강남", "focus") && h.active == HomeCore.START, "입력칸 눌림 → 활성");
        ok(h.onText("start", "강남역", "edit") && "강남역".equals(h.text[0]), "글 고침");
        ok("강남역".equals(h.wantQuery()) && h.wantQuery().isEmpty(), "후보 찾을 글은 한 번만");
        java.util.List<Map<String, Object>> bus = new java.util.ArrayList<Map<String, Object>>();
        Map<String, Object> b1 = new java.util.LinkedHashMap<String, Object>(); b1.put("nodenm", "강남역.강남역사거리"); b1.put("nodeid", "GGB1"); b1.put("citycode", Double.valueOf(31010)); b1.put("gpslati", Double.valueOf(37.5)); b1.put("gpslong", Double.valueOf(127.02)); b1.put("dist", Double.valueOf(0));
        bus.add(b1);
        ok(h.setCands("강남역", true, bus), "후보 받기");
        ok(h.request(env, 18).contains("\"b\":[{\"n\":\"강남역.강남역사거리\",\"d\":0}]"), "요청에 버스 후보 실림");
        ok(h.act("sg.b.0", null) == HomeCore.R_FIELDS && h.loc[0] != null && "bus".equals(h.loc[0].type) && "GGB1".equals(h.loc[0].nodeId) && h.active == -1, "버스정류장 고르기");
        ok(h.request(env, 18).contains("\"startSet\":true"), "고른 뒤 startSet");
        ok(h.act("rt.go", null) == HomeCore.R_NEED_BOTH, "도착 비면 경로 탐색 안 함");
        h.onText("dest", "서울역", "edit");
        ok(h.act("rt.swap", null) == HomeCore.R_FIELDS && "서울역".equals(h.text[0]) && h.loc[1] != null && h.loc[0] == null, "바꾸기: 글·고른 장소 함께");
        ok(h.act("sg.b.9", null) == HomeCore.R_NONE, "엉터리 후보 번호 무시");
        h.setGpsStart(37.55, 126.97);
        ok("내 위치".equals(h.text[0]) && h.loc[0].ok() && !h.gps, "위치 감지 결과");
        // s246: 동 이름을 알면 출발칸에 동 이름(AI 승무원 카드와 같은 이름) · 엔진에는 계속 "내 위치"
        h.setGpsStart(37.55, 126.97, "송도3동");
        ok("송도3동".equals(h.text[0]) && "gps".equals(h.loc[0].type) && "내 위치".equals(h.sendName(0)), "내 위치 → 동 이름 표시, 서버 이름은 내 위치");
        ok(!h.relabelGps("송도3동") && h.relabelGps("송도1동") && "송도1동".equals(h.text[0]) && h.relabelGps("") && "내 위치".equals(h.text[0]), "늦게 알아낸 동 이름으로 바꾸기 · 모르면 내 위치");
        h.onText("start", h.text[0], "focus");
        ok(h.active == 0 && !h.relabelGps("송도9동") && "내 위치".equals(h.text[0]), "입력칸을 누르고 있는 동안은 건드리지 않는다");
        h.endActive(0);
        h.setGpsStart(37.55, 126.97, "송도3동");
        String gq = HomeCore.routeQuery(h.loc[0], new HomeCore.Loc(), 1L, false);
        ok(gq == null, "도착 좌표 없으면 질의 없음(동 이름 출발)");
        HomeCore.Loc dd = new HomeCore.Loc(); dd.name = "서울역"; dd.lat = 37.5547; dd.lng = 126.9707;
        gq = HomeCore.routeQuery(h.loc[0], dd, 1L, false);
        ok(gq != null && (gq.contains("SN=%EB%82%B4+%EC%9C%84%EC%B9%98") || gq.contains("SN=%EB%82%B4%20%EC%9C%84%EC%B9%98")), "경로 질의 SN 은 '내 위치': " + gq);
        h.setGpsStart(37.55, 126.97);
        ok(h.act("rt.gps", null) == HomeCore.R_GPS, "위치 단추");
        ok(h.act("bt.pick", null) == HomeCore.R_PICK_TIME && (h.baseMs = 5) == 5 && h.act("bt.now", null) == HomeCore.R_RENDER && h.baseMs == -1, "기준시각 열기·현재로");
        String hqs = HomeCore.routeQuery(h.loc[0], null, 1000L, false);
        ok(hqs == null, "도착 좌표 없으면 질의 없음");
        h.loc[1] = new HomeCore.Loc(); h.loc[1].name = "서울역"; h.loc[1].lat = 37.5547; h.loc[1].lng = 126.9707; h.text[1] = "서울역";
        hqs = HomeCore.routeQuery(h.loc[0], h.loc[1], 1000L, true);
        ok(hqs != null && hqs.startsWith("SX=126.97&SY=37.55&EX=126.9707&EY=37.5547&baseMs=1000&bf=1&SN=") && hqs.contains("EN=%EC%84%9C%EC%9A%B8%EC%97%AD"), "경로 질의: " + hqs);
        ok(h.act("rt.go", null) == HomeCore.R_GO, "둘 다 있으면 경로 탐색");
        h.onScreen("{\"info\":{\"pk\":{\"u\":[{\"name\":\"강남\",\"line\":\"2호선\",\"lat\":37.4979,\"lng\":127.0276}]}}}");
        h.onText("start", "강남", "focus");
        ok(h.act("sg.u.0", null) == HomeCore.R_FIELDS && "subway".equals(h.loc[0].type) && "강남".equals(h.text[0]) && "2호선".equals(h.loc[0].line), "지하철 후보 고르기(info.pk.u)");

        // ── 경로 결과 ──
        HomeCore r2 = new HomeCore();
        ok(!r2.hasRoute() && !r2.setRoute("not json", "a", "b", -1, 1) && !r2.setRoute("", "a", "b", -1, 1), "경로 응답이 객체가 아니면 버린다");
        ok(r2.setRoute("{\"result\":{\"path\":[]}}", "부평", "두정", -1, 1234L) && r2.hasRoute() && "fast".equals(r2.resTab), "경로 응답 보관");
        env.nowMs = 99L;
        String rreq = r2.resultRequest(env, 18, "dark", 0);
        ok(rreq.equals("{\"cap\":18,\"r\":{\"data\":{\"result\":{\"path\":[]}},\"tab\":\"fast\",\"a\":\"부평\",\"b\":\"두정\",\"bt\":null,\"rb\":1234,\"now\":99,\"tz\":540,\"th\":\"dark\",\"fav\":1}}"), "결과 요청 본문: " + rreq);
        // 같은 칸의 변형(방·방식)은 캐시 열쇠가 다르다 · 흐르는 문구 주소
        {
            ShellCore.MemStore ks = new ShellCore.MemStore();
            // s205: 맛집 캐시 열쇠는 도착지(없으면 지금 동네)마다 따로 — 미리 받아 둔 그 장소 화면이 바로 뜨고 다른 곳 화면이 먼저 뜨지 않는다
            ShellCore.MemStore fs0 = new ShellCore.MemStore();
            String fd = ShellCore.foodSig(true, 37.5665, 126.9780, null), fg = ShellCore.foodSig(false, 0, 0, new double[] { 37.5665, 126.9780 });
            ok(fd.startsWith("d") && fg.startsWith("g") && !fd.equals(fg) && fd.equals(ShellCore.foodSig(true, 37.56651, 126.97801, new double[] { 1, 2 })) && !fd.equals(ShellCore.foodSig(true, 37.5765, 126.9780, null)), "맛집 장소 표시: 도착지가 위치보다 먼저 · 55m 안은 같은 칸");
            ok("".equals(ShellCore.foodSig(false, 0, 0, null)) && "".equals(ShellCore.foodSig(true, 0, 0, null)) && fg.equals(ShellCore.foodSig(false, 0, 0, new double[] { 37.5666, 126.9781 })), "도착지도 위치도 없으면 빈 표시 · 위치는 550m 칸");
            String fk0 = ShellCore.cacheKey("food", fs0); fs0.put(ShellCore.K_FOODSIG, fd);
            ok(!fk0.equals(ShellCore.cacheKey("food", fs0)) && ShellCore.cacheKey("food", fs0).startsWith("food|") && "food".equals(ShellCore.expectId(ShellCore.cacheKey("food", fs0))) && ShellCore.diskTtl(ShellCore.cacheKey("food", fs0)) > 0L, "맛집 캐시 열쇠: 장소마다 따로 · 화면 이름은 food · 디스크에 둔다");
            String k0 = ShellCore.cacheKey("chat", ks); ks.put(ChatCore.K_SEL, "2호선");
            ok(!k0.equals(ShellCore.cacheKey("chat", ks)) && ShellCore.cacheKey("chat", ks).startsWith("chat|") && "chat".equals(ShellCore.expectId(ShellCore.cacheKey("chat", ks))), "채팅 방마다 다른 캐시 열쇠");
            String m0 = ShellCore.cacheKey("mapb", ks); ks.put(MapCore.K_MODE, "subway");
            String m1 = ShellCore.cacheKey("mapb", ks); ks.put(MapCore.K_FLT, "L2");
            ok(!m0.equals(m1) && !m1.equals(ShellCore.cacheKey("mapb", ks)) && !ShellCore.cacheKey("maph", ks).equals(ShellCore.cacheKey("mapb", ks)) && "map".equals(ShellCore.expectId(m1)), "노선도는 방식 · 분류마다 다른 캐시 열쇠");
            ok(ShellCore.hdrUrl(540, 1000L).equals("https://route-v2.phg0643.workers.dev/screen/hdr?tz=540&now=1000") && "hdr".equals(ShellCore.expectId("hdr")) && ShellCore.diskCacheable("hdr"), "흐르는 문구 주소 · 열쇠");
        }
        // 타일 지도 계산
        {
            java.util.List<TileMapCore.Pin> tp = TileMapCore.parsePins(TileMapCore.encodePin(37.5, 127.0, "s", "1", "한진, 정류장|x") + "|" + TileMapCore.encodePin(37.51, 127.01, "m", "", "내 위치") + "|엉터리|0,0,s,,|99,200,s,,");
            ok(tp.size() == 2 && "한진 정류장x".equals(tp.get(0).name) && "m".equals(tp.get(1).k) && "1".equals(tp.get(0).n), "핀 글 읽기: 쉼표·막대 제거, 엉터리·0,0·범위 밖 줄 건너뜀");
            TileMapCore.View tv = new TileMapCore.View(600, 400);
            tv.fit(tp, 40, 3, 17);
            double[] c = tv.toScreen(tv.cla, tv.clo);
            ok(Math.abs(c[0] - 300) < 0.01 && Math.abs(c[1] - 200) < 0.01, "가운데 좌표는 화면 가운데");
            double[] p0 = tv.toScreen(37.5, 127.0), p1 = tv.toScreen(37.51, 127.01);
            ok(p0[0] >= 40 - 1 && p0[0] <= 560 + 1 && p1[0] >= 39 && p1[0] <= 561 && p0[1] >= 39 && p0[1] <= 361 && p1[1] >= 39 && p1[1] <= 361, "맞춤: 두 핀이 여백 안에 들어온다 " + p0[0] + "," + p0[1] + " / " + p1[0] + "," + p1[1]);
            double[] bk = tv.toLatLng(p0[0], p0[1]);
            ok(Math.abs(bk[0] - 37.5) < 1e-7 && Math.abs(bk[1] - 127.0) < 1e-7, "화면↔좌표 왕복");
            java.util.List<int[]> tl = tv.tiles();
            boolean cover = !tl.isEmpty() && tl.size() <= 60;
            int minX = 99999, minY = 99999, maxX = -99999, maxY = -99999;
            for (int[] t : tl) { cover &= TileMapCore.tileUrl(t[0], t[1], t[2]) != null; minX = Math.min(minX, t[3]); minY = Math.min(minY, t[4]); maxX = Math.max(maxX, t[3] + t[5]); maxY = Math.max(maxY, t[4] + t[5]); }
            ok(cover && minX <= 0 && minY <= 0 && maxX >= 600 && maxY >= 400, "타일이 화면을 빈틈없이 덮는다(" + tl.size() + "장)");
            double zb = tv.zoom; double[] fp = tv.toLatLng(100, 90);
            tv.zoomBy(1.0, 100, 90);
            double[] fq = tv.toScreen(fp[0], fp[1]);
            ok(Math.abs(tv.zoom - Math.min(19, zb + 1)) < 1e-9 && Math.abs(fq[0] - 100) < 0.01 && Math.abs(fq[1] - 90) < 0.01, "확대해도 손가락 아래 점은 제자리");
            double[] before = tv.toScreen(37.5, 127.0);
            tv.pan(30, -20);
            double[] after = tv.toScreen(37.5, 127.0);
            ok(Math.abs(after[0] - before[0] - 30) < 0.01 && Math.abs(after[1] - before[1] + 20) < 0.01, "끌면 그만큼 따라온다");
            TileMapCore.View one = new TileMapCore.View(300, 200);
            one.fit(TileMapCore.parsePins(TileMapCore.encodePin(36.8, 127.1, "s", "1", "")), 30, 3, 17);
            ok(Math.abs(one.zoom - 16.0) < 1e-9 && Math.abs(one.cla - 36.8) < 1e-9, "핀 하나면 16배율로 그 자리");
            ok(TileMapCore.tileUrl(15, 27956, 12696).equals("https://tile.openstreetmap.org/15/27956/12696.png") && TileMapCore.tileUrl(2, 4, 0) == null && TileMapCore.tileUrl(20, 0, 0) == null, "타일 주소");
        }
        // 화면 못 받음 안내 · 캐시 열쇠
        try {
            ScreenCore.Screen es0 = ScreenCore.load(ShellCore.errorScreen());
            ok("error".equals(es0.id) && es0.body.size() == 2, "오류 안내 화면은 검증을 통과한다");
        } catch (Exception ex0) { ok(false, "오류 안내 화면: " + ex0); }
        ok("map".equals(ShellCore.expectId("maph")) && "map".equals(ShellCore.expectId("mapb")) && "shop".equals(ShellCore.expectId("shop|추천")) && "tabs".equals(ShellCore.expectId("tabs|home")) && "home".equals(ShellCore.expectId("home")), "칸이 기대하는 화면 이름");
        ok(ShellCore.cchipsKey("chat").equals("cchips|chat") && ShellCore.cchipsKey("zzz").equals("cchips|" + ShellCore.MODE_DEFAULT)
            && ShellCore.cchipsBody("board").contains("\"mode\":\"board\"") && ShellCore.cchipsBody("zzz").contains("\"mode\":\"" + ShellCore.MODE_DEFAULT + "\"")
            && "cchips".equals(ShellCore.expectId(ShellCore.cchipsKey("set"))), "칩 줄 미리 받기: 방식마다 본문과 열쇠");
        ok(ShellCore.diskCacheable("shop") && ShellCore.diskCacheable("cchips") && ShellCore.diskCacheable("home") && ShellCore.diskCacheable("news") && ShellCore.diskCacheable("chat") && ShellCore.diskCacheable("food")
            && !ShellCore.diskCacheable("write") && !ShellCore.diskCacheable("error") && ShellCore.diskTtl("mapb|bus|seoul|ALL") == ShellCore.BUS_STALE_MS && ShellCore.diskTtl("mapb|subway|seoul|ALL") > 3600000L
            && ShellCore.diskTtl("tabs|home") > 0L && ShellCore.diskTtl("news|전체") > 0L && ShellCore.diskTtl(null) == 0L, "모든 화면을 디스크에 둔다(버스 도착정보는 10분 — 그 안에선 흐른 초만큼 줄여 쓴다)");
        {
            ShellCore.MemStore ls = new ShellCore.MemStore();
            ok(ShellCore.lastLocGet(ls) == null, "처음엔 마지막 위치 없음");
            ShellCore.lastLocPut(ls, 37.5665, 126.978, 1000L); ShellCore.lastLocPut(ls, 0, 0, 2000L); ShellCore.lastLocPut(ls, Double.NaN, 1, 3L);
            double[] g = ShellCore.lastLocGet(ls);
            ok(g != null && Math.abs(g[0] - 37.5665) < 1e-9 && Math.abs(g[1] - 126.978) < 1e-9, "마지막 위치 저장 · 읽기(0,0 · NaN 은 무시)");
            ls.put(ShellCore.K_LASTLOC, "999,5,1"); ok(ShellCore.lastLocGet(ls) == null, "엉터리 좌표는 버린다");
            ShellCore.lastLocPut(ls, 37.5, 127.0, 5L);
            ok(ShellCore.skeletonScreen("home").contains("\"kind\":\"cards\"") && ShellCore.skeletonScreen("mapb").contains("\"kind\":\"map\"") && ShellCore.skeletonScreen("chat").contains("\"kind\":\"list\""), "스켈레톤 모양은 화면마다");
        }
        {
            List<String> cv = ShellCore.catValues("{\"body\":[{\"t\":\"chip\",\"act\":{\"a\":\"cat\",\"v\":\"패션\"}},{\"t\":\"chip\",\"act\":{\"a\":\"cat\",\"v\":\"식품\"}},{\"t\":\"chip\",\"act\":{\"a\":\"cat\",\"v\":\"패션\"}},{\"t\":\"b\",\"act\":{\"a\":\"call\",\"v\":\"x\"}}]}");
            ok(cv.size() == 2 && "패션".equals(cv.get(0)) && "식품".equals(cv.get(1)) && ShellCore.catValues("zzz").isEmpty(), "화면에서 분류 칩 값만 읽는다(중복 · 다른 행동 제외)");
            ok(ShellCore.shopUrl("").endsWith("/screen/shop?cap=" + ShellCore.CAP) && ShellCore.shopUrl("패션").contains("&cat=") && ShellCore.shopUrl(null).indexOf("cat=") < 0, "쇼핑 주소");
            ok(ShellCore.shopUrl("패션", true, null).endsWith("&alts=1") && !ShellCore.shopUrl("패션", false, null).contains("alts"), "쇼핑 주소: 모든 카테고리 한 번에(alts=1)");
            ok(ShellCore.shopUrl("", false, new double[] { 37.4979, 127.0276 }).endsWith("&lat=37.5&lng=127.0") && ShellCore.shopUrl("", false, new double[] { 37.52, 127.04 }).equals(ShellCore.shopUrl("", false, new double[] { 37.5, 127.0 })), "쇼핑 주소: 날씨용 위치는 0.1° 단위로 뭉친다(같은 동네면 주소가 같다)");
            ok(ShellCore.shopWx(null).isEmpty() && ShellCore.shopWx(new double[] { Double.NaN, 1 }).isEmpty() && ShellCore.shopWx(new double[] { 99, 1 }).isEmpty() && ShellCore.shopUrl("x", true, new double[] { 37.5, 127.0 }).contains("&alts=1&lat="), "쇼핑 주소: 위치가 없거나 이상하면 싣지 않는다");
            ShellCore.MemStore ms9 = new ShellCore.MemStore();
            ok(ShellCore.mapKey("mapb", "subway", ms9).equals("mapb|subway|seoul|ALL") && ShellCore.newsBody(ms9, new ShellCore.NewsRows(), true).contains("\"alts\":\"chips\"") && !ShellCore.newsBody(ms9, new ShellCore.NewsRows(), false).contains("alts"), "노선도 열쇠 · 소식 본문(모든 분류 요청)");
            MapCore mc9 = new MapCore(ms9); mc9.modeOverride = "subway";
            ok("subway".equals(mc9.mode()) && mc9.bodyRequest(1, "pastel").contains("subway") || "subway".equals(mc9.mode()), "노선도 미리 받기는 고른 방식과 따로 방식을 정한다");
            ChatCore c2 = new ChatCore(ms9);
            c2.addRoom("1호선", "{\"ok\":true,\"msgs\":[{\"id\":\"m1\",\"ts\":50,\"nick\":\"영희\",\"text\":\"지연\",\"kind\":\"delay\"}]}");
            String rq9 = c2.requestFor("1호선", false, 18, "pastel", -540, "나", 1000L);
            ok(rq9.contains("\"sel\":\"1호선\"") && rq9.contains("\"st\":\"ready\"") && rq9.contains("영희") && c2.act("ch.x.0", new java.util.HashMap<String, String>(), "나") == ChatCore.R_NONE, "고스트 요청: 방을 직접 정하고 눌림 번호표는 안 건드린다");
            ok(c2.requestFor("2호선", false, 18, "pastel", -540, "나", 1000L).contains("\"st\":\"fail\""), "받은 적 없는 방은 실패로 표시");
            {   // s289 방 상태는 '이 방' 기준 — 다른 방을 받은 것이 이 방을 '글 없음'으로 만들지 않는다(영상: 글이 있던 방이 "아직 글이 없어요")
                ChatCore lv = new ChatCore(new ShellCore.MemStore());
                ok(lv.addTalks("{\"ok\":true,\"talks\":[{\"id\":1,\"nick\":\"철수\",\"text\":\"안녕\",\"ts\":100,\"line\":\"\"}]}", "나") && lv.loaded, "전체 방을 받았다(loaded = true)");
                String l2 = lv.requestFor("2호선", true, 18, "pastel", -540, "나", 1000L);
                ok(l2.contains("\"sel\":\"2호선\"") && l2.contains("\"st\":\"loading\"") && !l2.contains("\"st\":\"ready\""), "다른 방을 받았어도 이 방 글이 없으면 '불러오는 중': " + l2);
                lv.failed = true;
                ok(lv.requestFor("2호선", true, 18, "pastel", -540, "나", 1000L).contains("\"st\":\"fail\""), "받기에 실패했으면 실패");
                lv.addRoom("2호선", "{\"ok\":true,\"msgs\":[]}");
                ok(lv.requestFor("2호선", true, 18, "pastel", -540, "나", 1000L).contains("\"st\":\"ready\""), "받았는데 정말 글이 없는 방은 준비됨(그때만 '글이 없어요')");
                ok(lv.requestFor("all", true, 18, "pastel", -540, "나", 1000L).contains("\"st\":\"ready\""), "전체 방은 글이 있으니 준비됨");
                ok(MapCore.cellsNear("bsc_37583_126708", "bsc_37584_126710", 3) && !MapCore.cellsNear("bsc_37583_126708", "bsc_37587_126708", 3) && !MapCore.cellsNear("bsc_37583_126708", "", 3) && !MapCore.cellsNear(null, "bsc_1_2", 3) && !MapCore.cellsNear("bsc_x_y", "bsc_1_2", 3) && MapCore.cellsNear("bsc_1_2", "bsc_1_2", 0), "위치 칸 이웃: 위 · 경도 3칸(약 330m) 이내");
            }
            {   // s274 모든 방을 한 요청으로(batchRequest) — 맨 위는 전체 방 · alts 는 글을 받아 둔 노선 방만(전체 방 줄 g 는 뺀다) · requestFor 는 예전과 같다
                c2.addTalks("{\"ok\":true,\"talks\":[{\"id\":1,\"nick\":\"철수\",\"text\":\"안녕\",\"ts\":100,\"line\":\"1호선\"}]}", "나");
                c2.addRoom("2호선", "{\"ok\":true,\"msgs\":[{\"id\":\"m9\",\"ts\":60,\"nick\":\"민수\",\"text\":\"혼잡\",\"kind\":\"\"}]}");
                java.util.List<String> bs = new java.util.ArrayList<String>(); bs.add("all"); bs.add("1호선"); bs.add("2호선"); bs.add("9호선");
                String bq = c2.batchRequest(bs, 18, "pastel", -540, "나");
                Object bo = null; try { bo = ScreenCore.parse(bq); } catch (Exception be) { }
                ok(bo instanceof java.util.Map && bq.startsWith("{\"cap\":18,\"f\":{\"sel\":\"all\"") && bq.contains("\"alts\":{\"1호선\":{\"f\":{\"sel\":\"1호선\"") && bq.contains("\"2호선\":{\"f\":{\"sel\":\"2호선\"") && !bq.contains("\"9호선\":") && !bq.contains("\"all\":{\"f\""), "묶음 요청: 전체 방이 맨 위 · 글 받은 노선 방만 alts · 못 받은 방(9호선)은 싣지 않는다");
                ok(bq.contains("\"st\":\"ready\"") && !bq.contains("\"st\":\"fail\"") && bq.contains("안녕") && bq.indexOf("혼잡") > bq.indexOf("\"alts\""), "묶음 요청: 방마다 준비됨 상태 · 전체 방 글은 맨 위에만");
                int gAt = bq.indexOf("\"2호선\":{"); ok(gAt > 0 && bq.indexOf("\"g\":[]", gAt) > gAt && bq.indexOf("안녕", gAt) < 0, "묶음 요청: 노선 방 항목에는 전체 방 줄(g)을 싣지 않는다(크기)");
                ok(c2.requestFor("1호선", false, 18, "pastel", -540, "나", 1000L).startsWith("{\"cap\":18,\"f\":{\"sel\":\"1호선\",\"sec\":") && c2.requestFor("1호선", false, 18, "pastel", -540, "나", 1000L).endsWith("}}"), "requestFor 모양은 그대로");
                java.util.Map<String, String> pb = ChatCore.parseBatch("{\"ok\":true,\"screen\":\"chat\",\"ver\":\"v\",\"head\":[],\"body\":[],\"alts\":{\"1호선\":{\"ok\":true,\"screen\":\"chat\",\"head\":[],\"body\":[]},\"2호선\":{\"ok\":false}}}");
                ok(pb.size() == 2 && pb.containsKey("all") && pb.containsKey("1호선") && !pb.get("all").contains("alts") && !pb.get("all").contains("\"ver\"") && ChatCore.parseBatch("x").isEmpty() && ChatCore.parseBatch(null).isEmpty() && ChatCore.parseBatch("{\"ok\":false,\"alts\":{}}").isEmpty(), "묶음 답: 맨 위 화면은 all · 성공한 방만 · 엉터리는 빈 표");
                ok(ChatCore.encSels(bs).equals("all\n1호선\n2호선\n9호선") && ChatCore.decSels("all\n1호선\n2호선\n9호선").equals(bs) && ChatCore.decSels("all").isEmpty() && ChatCore.decSels("").isEmpty() && ChatCore.decSels(null).isEmpty() && ChatCore.decSels("a\na\nb").size() == 2, "방 목록 저장/복원: 순서 그대로 · 방이 2개 미만이면 쓰지 않는다 · 중복 제거");
            }
        }
        // 앱이 죽었다 살아난 뒤 결과 카드 복원
        HomeCore snapSrc = new HomeCore();
        snapSrc.setRoute("{\"result\":{\"path\":[],\"q\":\"a\\\"b\"}}", "부평", "두정", 777L, 55L);
        snapSrc.act("rh.tab.bus", null);
        snapSrc.loc[1] = new HomeCore.Loc(); snapSrc.loc[1].name = "두정"; snapSrc.loc[1].lat = 36.83; snapSrc.loc[1].lng = 127.15;
        snapSrc.loc[0] = new HomeCore.Loc(); snapSrc.loc[0].name = "부평"; snapSrc.loc[0].lat = 37.49; snapSrc.loc[0].lng = 126.72;
        String snap = snapSrc.rideSnapshot();
        HomeCore snapDst = new HomeCore();
        ok(snapDst.restoreRide(snap) && snapDst.hasRoute() && snapDst.routeRaw.equals(snapSrc.routeRaw) && "bus".equals(snapDst.resTab) && "부평".equals(snapDst.resA) && snapDst.resBt == 777L && snapDst.resRb == 55L
            && snapDst.loc[1] != null && "두정".equals(snapDst.loc[1].name) && Math.abs(snapDst.loc[1].lat - 36.83) < 1e-9 && snapDst.loc[0] != null && "부평".equals(snapDst.loc[0].name), "결과 스냅샷 되살리기: " + snap);
        ok(new HomeCore().rideSnapshot().equals("") && !new HomeCore().restoreRide("") && !new HomeCore().restoreRide("{\"raw\":1}") && !new HomeCore().restoreRide("{\"raw\":\"{}\",\"tab\":\"zzz\"}"), "스냅샷: 빈 것·엉터리는 거부");
        int rev0 = r2.resRev;
        ok(r2.act("rh.tab.bus", null) == HomeCore.R_RESULT && "bus".equals(r2.resTab) && r2.resRev == rev0 + 1, "결과 탭 누름");
        ok(r2.act("rh.tab.bus", null) == HomeCore.R_RESULT && r2.resRev == rev0 + 1, "같은 탭을 또 눌러도 캐시 열쇠는 그대로");
        ok(r2.act("rh.tab.zzz", null) == HomeCore.R_NONE && r2.act("rh.ld.m.0", null) == HomeCore.R_NONE, "모르는 눌림 무시");
        ok(r2.act("rh.fav", null) == HomeCore.R_FAV, "즐겨찾기 누름");
        ok(r2.act("rh.close", null) == HomeCore.R_RENDER && !r2.hasRoute(), "닫기 → 결과 비움");
        String m1 = "{\"ok\":true,\"cover\":\"chips\",\"head\":[],\"body\":[{\"t\":\"spacer\",\"h\":4}],\"info\":{\"h\":1}}", m2 = "{\"ok\":true,\"body\":[{\"t\":\"text\",\"s\":\"가\",\"pad\":[0,0,0,8]}]}";
        String mm = ShellCore.mergeBodies(m1, m2);
        ok(mm.contains("\"spacer\"") && mm.contains("\"s\":\"가\"") && mm.indexOf("spacer") < mm.indexOf("\"가\"") && mm.contains("\"pad\":[0,0,0,8]") && mm.contains("\"cover\":\"chips\""), "본문 이어 붙이기: " + mm);
        ok(ShellCore.mergeBodies(m1, "zzz").equals(m1), "못 읽으면 첫 화면 그대로");
        {   // s217 경로 통합 카드: into:ai 카드가 slot:ai 자리로 합쳐진다(위에 선 하나) · 한쪽이 없으면 그대로
            String fzRs = "{\"ok\":true,\"body\":[{\"t\":\"panel\",\"kids\":[{\"t\":\"text\",\"s\":\"머리\"},{\"t\":\"trk\"},{\"t\":\"spacer\",\"h\":0,\"slot\":\"ai\"},{\"t\":\"row\",\"kids\":[]}]}]}";
            String fzHc = "{\"ok\":true,\"body\":[{\"t\":\"panel\",\"into\":\"ai\",\"kids\":[{\"t\":\"aih\",\"s\":\"AI 승무원 브리핑\"},{\"t\":\"text\",\"s\":\"본문\"}]},{\"t\":\"sec\",\"s\":\"혼잡도\"}]}";
            String fz = ShellCore.mergeBodies(fzRs, fzHc);
            ok(fz.indexOf("\"머리\"") < fz.indexOf("\"divider\"") && fz.indexOf("\"divider\"") < fz.indexOf("AI 승무원 브리핑") && fz.indexOf("본문") < fz.indexOf("\"row\"") && fz.indexOf("\"trk\"") < fz.indexOf("\"divider\""), "통합: 타임라인 아래 · 버튼 줄 위에 AI 내용이 들어간다");
            ok(!fz.contains("\"into\"") && fz.contains("혼잡도") && fz.indexOf("AI 승무원 브리핑") < fz.indexOf("혼잡도"), "통합: 따로 있던 AI 카드는 사라지고 나머지 카드는 아래에");
            String fz2 = ShellCore.mergeBodies(m1, fzHc);
            ok(fz2.contains("\"into\"") && fz2.contains("AI 승무원 브리핑"), "자리가 없으면 AI 카드를 그대로 둔다(내용이 사라지지 않는다)");
            String fz3 = ShellCore.mergeBodies(fzRs, m2);
            ok(fz3.contains("\"slot\"") && !fz3.contains("\"divider\""), "AI 카드가 없으면 자리는 0 높이로 그대로");
        }

        // ── 게시판 ──
        ShellCore.MemStore bs = new ShellCore.MemStore();
        BoardCore bc = new BoardCore(bs);
        ok(!bc.setPosts("zzz") && !bc.setPosts("{\"posts\":3}") && bc.loading, "엉터리 글 목록은 받지 않는다");
        ok(bc.setPosts("{\"posts\":[{\"id\":11,\"cat\":\"혼잡\",\"title\":\"사람 많아요\",\"body\":\"본문\",\"nick\":\"철수\",\"ts\":1700000000000,\"views\":0,\"likes\":2,\"lols\":1,\"sads\":0,\"cmts\":3,\"user\":1},{\"id\":12,\"title\":\"\"},{\"id\":13,\"title\":\"두 번째\"}]}") && !bc.loading && bc.posts.size() == 2, "서버 글 받기(제목 없는 글 제외)");
        String bq = bc.request(18, 1000L);
        ok(bq.startsWith("{\"cap\":18,\"f\":{\"n\":30,\"st\":\"ready\",\"arm\":null,\"rx\":{},\"rep\":[]},\"p\":[[\"11\",\"혼잡\",\"사람 많아요\",\"본문\",\"철수\",1700000000000,0,2,1,0,3,10,\"\",[]]"), "게시판 요청: " + bq);
        ok(bq.contains("[\"13\",\"잡담\",\"두 번째\",\"\",\"익명\""), "분류·글쓴이 기본값");
        bc.onScreen("{\"info\":{\"ids\":[\"p11\",\"p13\"],\"idx\":[0,1]}}");
        ok("p11".equals(bc.pidById.get("11")) && "c.11".equals(bc.commentKey("11")) && "11".equals(bc.idOfPid("p11")), "화면 번호 ↔ 글번호");
        ok(bc.act("bd.lk.0", null, 5L) == BoardCore.R_RENDER && bs.get("bd_rx", "").equals("{\"11\":{\"like\":1}}"), "좋아요 켜기");
        ok(bc.act("bd.lk.0", null, 6L) == BoardCore.R_RENDER && bs.get("bd_rx", "").equals("{}"), "한 번 더 누르면 끄기");
        ok(bc.act("bd.rp.0", null, 100L) == BoardCore.R_RENDER && bc.request(18, 200L).contains("\"arm\":{\"k\":\"rp\",\"id\":\"11\"}"), "신고 첫 눌림은 확인 대기");
        ok(bc.request(18, 100L + BoardCore.ARM_MS + 1).contains("\"arm\":null"), "대기는 3.5초 뒤 풀린다");
        bc.act("bd.rp.0", null, 300L);
        ok(bc.act("bd.rp.0", null, 400L) == BoardCore.R_REPORT && "11".equals(bc.pendingId) && bs.get("bd_rep", "").equals("[\"11\"]"), "두 번째 눌림은 신고 확정");
        ok(BoardCore.reportBody("11").equals("{\"post_id\":\"11\"}") && BoardCore.commentBody("11", "나", "안녕").equals("{\"post_id\":\"11\",\"nick\":\"나\",\"body\":\"안녕\"}"), "서버 본문");
        java.util.Map<String, String> ff = new java.util.HashMap<String, String>(); ff.put("c.11", "  좋은 글 ");
        ok(bc.act("bd.cm.0", ff, 500L) == BoardCore.R_COMMENT && "좋은 글".equals(bc.pendingText) && bc.act("bd.cm.0", new java.util.HashMap<String, String>(), 501L) == BoardCore.R_NONE, "댓글 등록(빈 글은 무시)");
        {
            BoardCore b2 = new BoardCore(new ShellCore.MemStore());
            b2.setPosts("{\"posts\":[{\"id\":11,\"title\":\"가\"},{\"id\":13,\"title\":\"나\"}]}");
            b2.onScreen("{\"info\":{\"ids\":[\"p13\",\"p11\"],\"idx\":[9,9],\"sid\":[\"13\",\"11\"]}}");
            ok("p13".equals(b2.pidById.get("13")) && "p11".equals(b2.pidById.get("11")) && "c.13".equals(b2.commentKey("13")), "화면이 글 고유 id(sid)를 주면 번호표 없이 맞춘다");
            ok(b2.act("bd.lk.0", "13", "", null, 5L) == BoardCore.R_RENDER && b2.act("bd.rp.0", "13", "", null, 100L) == BoardCore.R_RENDER && b2.act("bd.rp.0", "13", "", null, 200L) == BoardCore.R_REPORT && "13".equals(b2.pendingId), "눌린 글의 고유 id 로 가리킨다(목록이 바뀌어도 엉뚱한 글이 안 눌린다)");
            java.util.Map<String, String> f2 = new java.util.HashMap<String, String>(); f2.put("c.99", "답글");
            ok(b2.act("bd.cm.0", "13", "c.99", f2, 300L) == BoardCore.R_COMMENT && "답글".equals(b2.pendingText) && "13".equals(b2.pendingId), "댓글 입력칸 열쇠도 행동이 알려 준다");
        }
        bc.addLocalComment("11", "나", "좋은 글", 600L);
        ok(bc.request(18, 700L).contains("[\"loc600\",\"나\",\"좋은 글\",600,[]]"), "방금 쓴 댓글이 줄에 실린다");
        ok(bc.setComments("13", "{\"comments\":[{\"id\":7,\"nick\":\"영희\",\"body\":\"서버 댓글\",\"ts\":900}]}") && bc.request(18, 1000L).contains("[\"srv7\",\"영희\",\"서버 댓글\",900,[]]"), "서버 댓글 붙이기");
        ok(bc.act("bd.more", null, 0L) == BoardCore.R_RENDER && bc.n == 60 && bc.act("bd.write", null, 0L) == BoardCore.R_WRITE, "더 보기 · 글쓰기");
        ok(bc.act("bd.xx.0", null, 0L) == BoardCore.R_NONE && bc.act("bd.lk.99", null, 0L) == BoardCore.R_NONE && bc.act("zz", null, 0L) == BoardCore.R_NONE, "엉터리 눌림 무시");
        bc.addMine("L1", "잡담", "내 글", "내용", "나", 5000L, true);
        String mq = bc.request(18, 6000L);
        ok(mq.contains("[\"L1\",\"잡담\",\"내 글\",\"내용\",\"나\",5000,0,0,0,0,0,5,\"\",[]]"), "내 글(전송 대기)은 서버 글 위에 실린다");
        bc.markSent("L1", "99");
        ok(bc.isServerMine("99") && bc.request(18, 6000L).contains("[\"99\",\"잡담\",\"내 글\",\"내용\",\"나\",5000,0,0,0,0,0,9,"), "전송되면 서버 글 표시");
        ok(ShellCore.jsonId("{\"ok\":true,\"id\":42}").equals("42") && ShellCore.jsonId("{\"ok\":false}").isEmpty() && ShellCore.jsonError("{\"error\":\"이미 올렸어요\"}").equals("이미 올렸어요"), "서버 답 읽기");

        // ── 실시간소통 ──
        ShellCore.MemStore cs = new ShellCore.MemStore();
        ChatCore cc = new ChatCore(cs);
        ok("all".equals(cc.sel()), "처음엔 전체 방");
        cc.select("2호선"); ok("2호선".equals(cc.sel()) && "2호선".equals(cs.get("chat_sel", "")), "방 고르기 저장");
        cc.select("all");
        {   // s247: '불러오는 중' 화면 한꺼번에(엔진 alts) — 요청 모양 · 답 읽기
            java.util.List<String> ls = new java.util.ArrayList<String>(); ls.add("all"); ls.add("1호선"); ls.add("2호선");
            String lq = cc.loadingBatchRequest(ls, 18, "pastel", -540, "나");
            Object lo = null; try { lo = ScreenCore.parse(lq); } catch (Exception le) { }
            ok(lo instanceof java.util.Map && lq.contains("\"alts\":{\"all\":{\"f\":{\"sel\":\"all\"") && lq.contains("\"2호선\":{\"f\":{\"sel\":\"2호선\"") && lq.indexOf("\"st\":\"loading\"") > 0 && !lq.contains("\"st\":\"ready\""), "로딩 화면 요청: 모든 방을 alts 로, 사실은 loading");
            java.util.Map<String, String> lm = ChatCore.parseLoadingBatch("{\"ok\":true,\"alts\":{\"all\":{\"ok\":true,\"screen\":\"chat\",\"head\":[],\"body\":[]},\"1호선\":{\"ok\":false},\"2호선\":{\"ok\":true,\"screen\":\"chat\",\"head\":[],\"body\":[]}}}");
            ok(lm.size() == 2 && lm.containsKey("all") && lm.containsKey("2호선") && !lm.containsKey("1호선") && ChatCore.parseLoadingBatch("x").isEmpty() && ChatCore.parseLoadingBatch(null).isEmpty(), "로딩 화면 답 읽기: 성공한 방만, 엉터리는 빈 표");
        }

        ok(!cc.addTalks("zzz", "나") && cc.failed && !cc.loaded, "엉터리 대화는 실패로 표시");
        ok(cc.addTalks("{\"ok\":true,\"talks\":[{\"id\":1,\"nick\":\"철수\",\"text\":\"안녕\",\"ts\":100,\"line\":\"2호선\"},{\"id\":2,\"nick\":\"나\",\"text\":\"반가워\",\"ts\":200}]}", "나") && cc.loaded && !cc.failed && cc.sinceG == 200, "전체 대화 받기");
        ok(cc.addTalks("{\"ok\":true,\"talks\":[{\"id\":2,\"nick\":\"나\",\"text\":\"반가워\",\"ts\":200}]}", "나"), "같은 줄은 한 번만");
        String cq = cc.request(18, "pastel", -540, "나", 1000L);
        ok(cq.contains("\"g\":[[\"철수\",\"안녕\",100,0,\"2호선\"],[\"나\",\"반가워\",200,1,\"\"]]") && cq.contains("\"st\":\"ready\"") && cq.contains("\"tzo\":-540") && cq.contains("\"me\":\"나\"") && cq.contains("\"offOk\":0"), "채팅 요청: " + cq);
        cc.select("1호선");
        ok(cc.addRoom("1호선", "{\"ok\":true,\"msgs\":[{\"id\":\"m1\",\"ts\":50,\"nick\":\"영희\",\"text\":\"지연이에요\",\"kind\":\"delay\"}],\"alert\":{\"reporters\":3,\"stations\":[{\"stn\":\"부평\",\"n\":3}]}}") && cc.sinceR.get("1호선") == 50L, "노선 방 받기");
        ok(cc.roomUrl("1호선").endsWith("since=50") && ChatCore.talksUrl(0).endsWith("?limit=30") && ChatCore.talksUrl(7).endsWith("?since=7&limit=40"), "주소");
        cc.setNotices("{\"ok\":true,\"lines\":{\"1호선\":{\"text\":\"지연\",\"ts\":5}}}", 777L);
        cq = cc.request(18, "dark", -540, "나", 1000L);
        ok(cq.contains("\"r\":[[\"m1\",50,\"영희\",\"지연이에요\",\"delay\"]]") && cq.contains("\"off\":{\"text\":\"지연\",\"ts\":5}") && cq.contains("\"offOk\":1") && cq.contains("\"offAt\":777") && cq.contains("\"reporters\":3"), "노선 방 요청에 대화·공지·집계");
        java.util.Map<String, String> cf = new java.util.HashMap<String, String>(); cf.put("chat.room", " 안녕하세요 ");
        ok(cc.act("ch.send", cf, "") == ChatCore.R_NEED_ID && cc.act("ch.send", cf, "나") == ChatCore.R_SEND && "안녕하세요".equals(cc.pendingText) && "1호선".equals(cc.pendingLine), "보내기(아이디 없으면 안내)");
        ok(cc.act("ch.send", new java.util.HashMap<String, String>(), "나") == ChatCore.R_NONE, "빈 글은 무시");
        ok(cc.act("ch.x.0", null, "나") == ChatCore.R_REPORT && "m1".equals(cc.pendingId) && cc.act("ch.x.9", null, "나") == ChatCore.R_NONE, "노선 방 글 신고(번호 → 글번호)");
        ok(cc.act("ch.x.0", "m77", null, "나") == ChatCore.R_REPORT && "m77".equals(cc.pendingId) && cc.act("ch.x.9", "m5", null, "나") == ChatCore.R_REPORT && "m5".equals(cc.pendingId), "신고는 행동이 준 글 고유 id 를 우선(번호가 바뀌어도 그 글)");
        cc.hide("m1"); ok(cs.get("lrHidden", "").equals("[\"m1\"]"), "신고한 글 숨김 기록");
        cc.onScreen("{\"info\":{\"sel\":\"all\",\"pl\":\"4호선\"}}"); ok("4호선".equals(cc.postLine), "전체 방 글에 붙일 노선(엔진이 정함)");
        ok(ChatCore.sendBody("나", "안녕", "1호선").equals("{\"nick\":\"나\",\"text\":\"안녕\",\"line\":\"1호선\"}"), "보내기 본문");
        HomeCore hr = new HomeCore(); hr.onResult("{\"info\":{\"sec\":[\"수도권 1호선\",\"2호선\"]}}");
        ok(hr.resSec.size() == 2 && "2호선".equals(hr.resSec.get(1)), "결과 화면의 지하철 구간 이름");


        // ── 맛집 ──
        FoodCore fd = new FoodCore();
        ok(fd.needGps() && "idle".equals(fd.state()) && !fd.needData(), "처음엔 도착지도 위치도 없다");
        fd.locating = true; ok("locating".equals(fd.state()), "위치 확인 중"); fd.locating = false; fd.noperm = true; ok("noperm".equals(fd.state()), "위치 권한 없음");
        fd.setGps(37.4979, 127.0276); ok(!fd.needGps() && "loading".equals(fd.state()) && !fd.noperm, "위치가 오면 불러오는 중");
        String fq = fd.request(18, true);
        ok(fq.contains("\"stn\":\"\"") && fq.contains("\"st\":\"loading\"") && fq.contains("\"gps\":[37.4979,127.0276]") && fq.contains("\"dl\":null") && fq.contains("\"alts\":\"chips\"") && !fq.contains("\"s\":"), "첫 요청은 사실만");
        fd.onScreen("{\"info\":{\"ctr\":[37.5,127.0],\"stn\":\"강남\",\"go\":{\"c.0\":[\"맛집\",\"음식 > 한식\",\"서울 1\",37.5,127.0]}},\"alts\":{\"전체\":{\"ok\":true},\"카페\":{\"ok\":true,\"v\":1}}}");
        ok(fd.ctr != null && fd.ctr[0] == 37.5 && fd.needData(), "엔진이 정한 중심을 받으면 원자료를 받아야 한다");
        ok(fd.serverUrl().equals("https://gildongmu-food.phg0643.workers.dev/food?lat=37.5&lng=127.0&r=1500&limit=400") && ScreenCore.netAllowed(fd.serverUrl()), "서버 주소 · 통신 허용");
        ok(fd.sharedUrl().equals(ShellCore.BASE + "/food-pub?lat=37.5&lng=127.0") && ScreenCore.netAllowed(fd.sharedUrl()), "s206: 공유 저장소 주소(엔진 /food-pub) · 통신 허용");
        String pu = fd.publicUrl(2);
        ok(pu.startsWith(ShellCore.NEWS_BASE + "/tago?url=") && pu.contains("indsLclsCd%3DI2") && pu.contains("pageNo%3D2") && pu.contains("cx%3D127.0%26cy%3D37.5") && ScreenCore.netAllowed(pu), "공공데이터 주소(서버 대리)");
        ok(FoodCore.pageCount("{\"body\":{\"items\":[{\"bizesNm\":\"A\"},{\"bizesNm\":\"B\"}]}}") == 2 && FoodCore.pageCount("{\"response\":{\"body\":{\"items\":{\"bizesNm\":\"A\"}}}}") == 1 && FoodCore.pageCount("zzz") == -1 && FoodCore.pageCount("") == -1, "공공데이터 쪽 항목 수(두 가지 모양)");
        java.util.List<String> pgs = new java.util.ArrayList<String>();
        pgs.add("{\"body\":{\"items\":[{\"bizesNm\":\"공공A\",\"indsMclsNm\":\"한식\",\"indsSclsNm\":\"국밥\",\"rdnmAdr\":\"도로1\",\"lnoAdr\":\"지번1\",\"lat\":\"37.501\",\"lon\":\"127.002\",\"extra\":1}]}}");
        pgs.add("");
        FoodCore.Data fdat = FoodCore.parseData("{\"items\":[{\"n\":\"가\",\"c\":\"음식 > 한식\",\"a\":\"서울 1\",\"d\":300,\"la\":37.5,\"lo\":127.0}]}", pgs);
        ok(fdat.srvOk && fdat.srv.size() == 1 && fdat.pub.size() == 1, "원자료 읽기(서버 1 · 공공 1)");
        ok(!FoodCore.parseData("zzz", new java.util.ArrayList<String>()).srvOk, "서버 응답이 깨지면 실패로 표시");
        ok(!FoodCore.parseData("{\"error\":\"x\"}", new java.util.ArrayList<String>()).srvOk && FoodCore.parseData("{\"items\":[]}", new java.util.ArrayList<String>()).srvOk, "s255: items 가 없는 답(오류 봉투)은 못 받음 · 빈 목록은 정상");
        { java.util.List<String> bad1 = new java.util.ArrayList<String>(); bad1.add(""); java.util.List<String> emp = new java.util.ArrayList<String>(); emp.add("{\"response\":{\"body\":{\"items\":[]}}}");
          ok(!FoodCore.parseData("{\"items\":[]}", bad1).pubOk && FoodCore.parseData("{\"items\":[]}", emp).pubOk, "s255: 공공데이터 쪽이 안 읽히면 pubOk 거짓 · 빈 목록이라도 읽히면 참"); }
        fd.setData(fdat);
        fq = fd.request(18, true);
        ok(fd.loaded && !fd.failed && !fd.needData() && fq.contains("\"st\":\"done\"") && fq.contains("\"s\":[{") && fq.contains("\"n\":\"가\"") && fq.contains("\"u\":[[\"공공A\",\"한식\",\"국밥\",\"도로1\",\"지번1\",\"37.501\",\"127.002\"]]"), "받은 원자료를 그대로 엔진에 보낸다(고르는 것은 엔진)");
        ok(fd.pickChip("카페") && "카페".equals(fd.flt) && !fd.pickChip("주점") && "주점".equals(fd.flt), "칩: 엔진이 미리 계산해 둔 화면이 있으면 요청 없이");
        ok(fd.altOf("카페") != null && fd.altOf("카페").contains("\"v\":1") && fd.altOf("주점") == null, "칩 화면 보관");
        ok(fd.act("fm.c.0") == FoodCore.R_PANEL && fd.openKey.equals("c.0") && fd.pendingSel.contains("\"la\":37.5"), "가게 누름 → 카드 아래 지도 펼침(웹 토글)");
        ok(fd.act("fm.c.0") == FoodCore.R_UNPANEL && fd.openKey.length() == 0, "같은 카드를 또 누르면 접는다");
        ok(fd.act("fm.c.9") == FoodCore.R_NONE && fd.act("fm.close") == FoodCore.R_CLOSE && fd.act("zz") == FoodCore.R_NONE && fd.act("fm.ni") == FoodCore.R_NONE, "없는 가게 · 닫기 · 엉터리 · 펼침 없을 때 단추");
        fd.ctr = new double[] { 37.4979, 127.0276 }; fd.stnName = "강남";
        fd.act("fm.c.0");
        String prq = fd.panelRequest(18);
        ok(prq.contains("\"pn\":1") && prq.contains("\"sel\":" + fd.pendingSel) && prq.contains("\"ctr\":[37.4979,127.0276]") && prq.contains("\"stn\":\"강남\"") && !prq.contains("\"res\""), "펼침 요청 본문(원자료는 보내지 않는다)");
        fd.panelGot("rt", "{\"x\":1}");
        ok(fd.panelRequest(18).contains("\"res\":{\"rt\":\"{\\\"x\\\":1}\"}"), "받은 경로 글을 res 로 다시 보낸다");
        ok(fd.onPanel("{\"ok\":true,\"body\":[{\"t\":\"text\",\"s\":\"펼침\"}],\"info\":{\"need\":[{\"k\":\"ro\",\"url\":\"https://router.project-osrm.org/x\"},{\"k\":\"rt\",\"url\":\"https://a/b\"},{\"k\":\"zz\",\"url\":\"http://evil\"}],\"nv\":{\"ninfo\":{\"app\":\"nmap://i\",\"web\":\"https://map.naver.com/i\"}}}}"), "펼침 화면 읽기");
        ok(fd.panelNeed.size() == 1 && "ro".equals(fd.panelNeed.get(0)[0]), "받아 올 주소: 이미 받은 것 · https 아닌 것은 뺀다");
        String listTxt = "{\"ok\":true,\"rev\":\"f2:x\",\"body\":[{\"t\":\"text\",\"s\":\"위\"},{\"t\":\"place\",\"act\":{\"a\":\"call\",\"v\":\"fm.c.0\"}},{\"t\":\"text\",\"s\":\"아래\"}]}";
        String merged = fd.withPanel(listTxt);
        int ia = merged.indexOf("\"fm.c.0\""), ib = merged.indexOf("펼침"), ic = merged.indexOf("아래");
        ok(ia > 0 && ib > ia && ic > ib && merged.contains("f2:x+c.0:"), "펼침은 그 카드 바로 뒤에 끼운다 · rev 가 달라진다");
        ok(fd.withPanel(listTxt.replace("fm.c.0", "fm.c.7")).equals(listTxt.replace("fm.c.0", "fm.c.7")), "그 카드가 목록에 없으면 원래 글");
        ok(fd.sheetLink("fm.ni") != null && fd.act("fm.ni") == FoodCore.R_LINK && fd.act("fm.ki") == FoodCore.R_LINK, "펼침의 네이버 · 카카오 단추");
        fd.pickChip("전체");
        ok(fd.openKey.length() == 0 && fd.withPanel(listTxt).equals(listTxt), "칩을 바꾸면 펼침을 접는다");
        ok(fd.sheetRequest(18, new double[] { 37.4, 127.1 }).equals("{\"cap\":18,\"f\":{\"sel\":" + fd.pendingSel + ",\"me\":[37.4,127.1]}}") && fd.sheetRequest(18, null).endsWith("\"me\":null}}"), "시트 요청 본문");
        fd.onSheet("{\"info\":{\"nv\":{\"nroute\":{\"app\":\"nmap://x\",\"web\":\"https://map.naver.com/x\"},\"kinfo\":{\"app\":\"kakaomap://y\",\"web\":\"https://map.kakao.com/y\"}}}}");
        String[] fsl = fd.sheetLink("fm.nr");
        ok(fsl != null && "nmap://x".equals(fsl[0]) && "https://map.naver.com/x".equals(fsl[1]) && fd.sheetLink("fm.ki")[0].equals("kakaomap://y") && fd.sheetLink("fm.kr") == null && fd.sheetLink("zz") == null, "시트 단추 → 앱/웹 주소(엔진이 준 것만)");
        ok(!fd.setDest("강남역", 0, 0) == false && fd.dest.equals("강남역") && !fd.loaded && fd.dl == null, "도착지가 바뀌면 원자료를 비운다");
        ok(!fd.setDest("강남역", 0, 0), "같은 도착지면 그대로");
        fd.setDest("홍대입구", 37.557, 126.924); ok(fd.dl != null && fd.request(18, false).contains("\"stn\":\"홍대입구\"") && fd.request(18, false).contains("\"dl\":[37.557,126.924]"), "도착지 이름·좌표를 사실로 보낸다");
        fd.refresh(); ok(!fd.loaded && fd.ctr == null, "새로고침은 원자료를 비운다");


        // ── 지도 ──
        ShellCore.MemStore ms = new ShellCore.MemStore();
        MapCore mc = new MapCore(ms);
        ok("bus".equals(mc.mode()) && "seoul".equals(mc.reg()) && "ALL".equals(mc.flt()), "지도 처음엔 버스 · 수도권 · 전체");
        ok(mc.cat("m:subway") == MapCore.R_RENDER && "subway".equals(mc.mode()) && mc.cat("r:busan") == MapCore.R_RENDER && "busan".equals(mc.reg()) && "ALL".equals(mc.flt()), "안쪽 탭 · 지역 고르기(호선 필터는 초기화)");
        {   // 버스 도착정보: 한 정류장 응답이 잠깐 비어 와도 보던 줄을 지키고(45초), 값이 있으면 새 값으로 바꾼다
            MapCore bm = new MapCore(new ShellCore.MemStore());
            String good = "{\"response\":{\"body\":{\"items\":{\"item\":[{\"routeno\":\"991\",\"arrtime\":589,\"arrprevstationcnt\":8}]}}}}", empty = "{\"response\":{\"header\":{\"resultCode\":\"00\"},\"body\":{\"items\":\"\",\"totalCount\":0}}}", fresh = good.replace("589", "120");
            bm.addBusRes("a0", good); bm.addBusRes("a1", good);
            bm.dropArrivals();
            bm.addBusRes("a0", empty); bm.addBusRes("a1", fresh);
            ok(good.equals(bm.busRes.get("a0")) && fresh.equals(bm.busRes.get("a1")), "도착정보: 빈 응답은 보던 줄을 지키고 새 값은 바꾼다");
            ok(MapCore.hasArr(good) && !MapCore.hasArr(empty) && !MapCore.hasArr(null), "도착정보 판별");
            MapCore bn = new MapCore(new ShellCore.MemStore());
            bn.addBusRes("a0", empty); bn.dropArrivals(); bn.addBusRes("a0", empty);
            ok(empty.equals(bn.busRes.get("a0")), "처음부터 비어 있던 정류장은 그대로 비어 있다");
            // s170: 공공 API 오류 봉투(HTTP 200 으로 옴)는 받지 못한 것 — 'OpenAPI_ServiceResponse'. 통신 실패(빈 본문)도 '도착정보 없음'이 아니라 아직 못 받은 것으로 둔다
            String envl = "{\n  \"OpenAPI_ServiceResponse\": {\n    \"cmmMsgHeader\": {\n      \"errMsg\": \"HTTP_ERROR\",\n      \"returnReasonCode\": \"04\"\n    }\n  }\n}\n";
            ok(NetPost.busBodyBad(envl) && NetPost.busBodyBad("") && NetPost.busBodyBad(null) && !NetPost.busBodyBad(good) && !NetPost.busBodyBad(empty) && !NetPost.busBodyBad("<itemList><rtNm>1</rtNm></itemList>"), "버스 본문: 오류 봉투 · 빈 본문만 받지 못한 것");
            MapCore bo = new MapCore(new ShellCore.MemStore());
            bo.addBusRes("a0", ""); bo.addBusRes("a1", good);
            ok(!bo.busRes.containsKey("a0") && good.equals(bo.busRes.get("a1")), "통신에 실패한 정류장은 '없음'으로 굳히지 않고 비워 둔다(엔진이 불러오는 중으로 그린다)");
            {   // s181: 같은 주소의 오류 봉투가 캐시돼 돌아오는 정류장 — 다시 물을 때는 일회용 글자를 붙여 새로 받는다
                String bu = "https://gildongmu-bus.phg0643.workers.dev/tago?url=abc", bd = "https://gentle-lab.workers.dev/bus-stops?lat=1";
                String br1 = NetPost.busBust(bu, 1), br2 = NetPost.busBust(bu, 2);
                ok(NetPost.busBust(bu, 0).equals(bu) && br1.startsWith(bu + "&_r=") && br2.startsWith(bu + "&_r=") && !br1.equals(br2) && NetPost.busBust(bd, 1).equals(bd)
                    && NetPost.busBust("https://route-v2.phg0643.workers.dev/bus-tago?url=z", 1).contains("&_r="), "다시 물을 때만 일회용 글자(_r) — 첫 시도 · 버스 프록시가 아닌 주소는 그대로");
            }
            {   // s183: 받았지만 비어 있는 도착정보(totalCount 0)도 다시 묻는다 · 오버레이는 끈 적이 없으면 켜짐
                String em = "{\"response\":{\"header\":{\"resultCode\":\"00\"},\"body\":{\"items\":\"\",\"numOfRows\":10,\"pageNo\":1,\"totalCount\":0}}}";
                ok(NetPost.busEmpty(em) && !NetPost.busEmpty("") && !NetPost.busEmpty(null) && !NetPost.busEmpty("{\"response\":{\"body\":{\"items\":{\"item\":[{\"routeno\":\"1\"}]},\"totalCount\":1}}}") && !NetPost.busBodyBad(em), "빈 도착정보는 정상 본문이지만 '비어 있음'으로 알아본다");
                ok(!ShellCore.ovlOn("") && ShellCore.ovlOn("1") && !ShellCore.ovlOn("0"), "오버레이: 켜기로 고른 적이 있을 때만 켜짐(웹 _ovlEnabled)");
            }
            ok(NetPost.getBus("https://example.com/x", 1000, 1000).status == -1 && "blocked".equals(NetPost.getBus("https://example.com/x", 1000, 1000).err), "허용 안 된 주소는 다시 묻지 않고 막는다");
        }
        mc.cat("r:seoul"); ok(mc.cat("f:2호선") == MapCore.R_RENDER && "2호선".equals(mc.flt()) && mc.cat("zz") == MapCore.R_NONE, "호선 필터");
        String mh = mc.headRequest(18, "dark", "부평");
        ok(mh.contains("\"part\":\"h\"") && mh.contains("\"mode\":\"subway\"") && mh.contains("\"flt\":\"2호선\"") && mh.contains("\"th\":\"dark\"") && mh.contains("\"q\":\"부평\"") && !mh.contains("\"gps\""), "머리 요청 본문");
        mc.gps = new double[] { 37.5, 127.0 }; ok(mc.bodyRequest(18, "pastel").contains("\"gps\":[37.5,127.0]"), "위치가 있으면 사실로 보낸다"); mc.gps = null;
        java.util.Map<String, String> mf = new java.util.HashMap<String, String>();
        ok(mc.act("mp.find", mf) == MapCore.R_NONE && mc.act("mp.loc", mf) == MapCore.R_LOC, "빈 검색은 무시 · 내 위치");
        mf.put("mq", " 부 "); ok(mc.act("mp.find", mf) == MapCore.R_NONE, "한 글자 검색은 무시");
        mf.put("mq", "부평"); ok(mc.act("mp.find", mf) == MapCore.R_FIND, "검색");
        mc.onScreen("{\"info\":{\"view\":\"list\",\"rs\":[[\"부산\",\"부산1호선\"],[\"서면\",\"부산2호선\"]],\"find\":{\"name\":\"부평\"},\"near\":{\"name\":\"강남\"}}}");
        ok("list".equals(mc.view) && "부평".equals(mc.findName) && "강남".equals(mc.nearName), "머리·본문 응답 읽기");
        ok(mc.act("mr.1", null) == MapCore.R_STN && "서면".equals(mc.stn) && "부산2호선".equals(mc.stnLine) && mc.act("mr.9", null) == MapCore.R_NONE, "지방 노선 목록 역 누름(번호 → 역·노선)");
        mc.tapStation(" 강 남 "); ok("강남".equals(mc.stn) && mc.stnLine.isEmpty(), "노선도 역 글자 누름");
        String sr = mc.stnRequest(18, "dark"); ok(sr.contains("\"part\":\"stn\"") && sr.contains("\"stn\":\"강남\""), "역 팝업 요청");
        mc.onStn("{\"info\":{\"lines\":[\"2호선\",\"신분당선\"],\"pick\":{\"name\":\"강남\",\"line\":\"2호선\",\"la\":37.4979,\"lo\":127.0276}}}");
        mc.setLinesFromStn("{\"info\":{\"lines\":[\"2호선\",\"신분당선\"]}}");
        ok("강남".equals(mc.pickName) && mc.pickLa > 37 && mc.ttLines.size() == 2, "팝업 응답 읽기");
        ok(mc.sheetAct("mp.start") == MapCore.R_START && mc.sheetAct("mp.dest") == MapCore.R_DEST && mc.sheetAct("mp.close") == MapCore.R_CLOSE && mc.sheetAct("zz") == MapCore.R_NONE, "팝업 단추");
        int sq0 = mc.ttSeq;
        ok(mc.sheetAct("mp.tt") == MapCore.R_TT && mc.ttSeq == sq0 + 1 && "loading".equals(mc.ttState), "시간표 열기");
        {   // s248: 시간표는 서버(엔진)가 채운다 — 요청에 sv=1 · 팝업에서 미리 받는 첫 요청과 같은 글 · 채워 준 것(info.fill)을 모아 두고 · 못 채웠을 때만 한 번 기기가 받는다
            String tq0 = mc.ttRequest(18, "dark");
            ok(tq0.contains("\"sv\":1") && tq0.equals(mc.ttInitRequest(18, "dark")), "시간표 첫 요청 = 미리 받는 요청(같은 글)");
            mc.onTt("{\"info\":{\"lines\":[\"2호선\",\"신분당선\"],\"line\":\"2호선\",\"day\":\"\",\"need\":{\"line\":\"2호선\",\"day\":\"\"}}}");
            ok(mc.ttWantFetch() && !mc.ttWantFetch(), "서버가 못 채우면(need) 한 번만 예전 길로 받는다 — 같은 요청을 두 번 묻지 않는다");
            mc.onTt("{\"info\":{\"lines\":[\"2호선\",\"신분당선\"],\"line\":\"2호선\",\"day\":\"DAY\",\"fill\":{\"2호선|-\":{\"dayCode\":\"DAY\",\"dirs\":[]},\"신분당선|-\":{\"noData\":true}},\"need\":null}}");
            String tq1 = mc.ttRequest(18, "dark");
            ok(tq1.contains("\"2호선|-\":{") && tq1.contains("\"신분당선|-\":{") && "ok".equals(mc.ttState) && !mc.ttWantFetch() && !tq1.equals(tq0), "서버가 채워 준 시간표(info.fill)를 모아 다음 요청에 그대로 보낸다 · 더 받을 것 없음");
            mc.sheetAct("mp.tt");
        }
        String ab = mc.ttAskBody(1000L);
        ok(ab.contains("\"line\":\"2호선\"") && ab.contains("\"line\":\"신분당선\"") && ab.contains("\"op\":\"timetable\"") && ab.contains("\"from\":\"강남\"") && ab.contains("\"baseMs\":1000") && !ab.contains("\"day\""), "처음엔 모든 노선을 한 번에 묻는다");
        ok(!mc.addTt("{\"items\":[]}", mc.ttSeq - 1), "늦게 온 응답은 버린다");
        ok(mc.addTt("{\"items\":[{\"id\":0,\"dirs\":[],\"dayCode\":\"DAY\"},{\"id\":1,\"noData\":true}]}", mc.ttSeq) && "ok".equals(mc.ttState), "시간표 응답 모으기");
        String tr = mc.ttRequest(18, "dark");
        ok(tr.contains("\"reg\":\"") && tr.contains("\"sl\":\"\"") && sr.contains("\"reg\":\""), "s208: 역 팝업·시간표 요청에 권역(reg)과 노선(sl) — 같은 이름 지방 역 노선을 엔진이 가른다");
        ok(tr.contains("\"2호선|-\":{") && tr.contains("\"신분당선|-\":{") && tr.contains("\"st\":\"ok\""), "엔진에 응답을 그대로 보낸다");
        mc.onTt("{\"info\":{\"lines\":[\"2호선\",\"신분당선\"],\"line\":\"2호선\",\"day\":\"DAY\",\"dk\":\"상\",\"dks\":[\"상\",\"하\"],\"days\":[\"DAY\",\"SAT\"],\"need\":null}}");
        ok("2호선".equals(mc.ttLine) && mc.ttDks.size() == 2 && mc.ttDays.size() == 2, "시간표 화면 읽기");
        ok(mc.sheetAct("mt.k.1") == MapCore.R_TT_RENDER && "하".equals(mc.ttDk), "방향 고르기");
        ok(mc.sheetAct("mt.l.1") == MapCore.R_TT_RENDER && "신분당선".equals(mc.ttLine), "노선 바꾸기(받아 둔 응답이 있으면 요청 없이)");
        mc.ttLine = "2호선";
        int sq1 = mc.ttSeq;
        ok(mc.sheetAct("mt.d.SAT") == MapCore.R_TT_LOAD && "SAT".equals(mc.ttDay) && mc.ttSeq == sq1 + 1 && mc.needDay.equals("SAT"), "요일 고르기(없으면 그 노선·요일만 묻는다)");
        String ab2 = mc.ttAskBody(2000L); ok(ab2.contains("\"day\":\"SAT\"") && ab2.contains("\"line\":\"2호선\"") && !ab2.contains("신분당선"), "요일 요청 본문");
        ok(mc.addTt("{\"items\":[{\"id\":0,\"dirs\":[],\"dayCode\":\"SAT\"}]}", mc.ttSeq) && mc.ttRequest(18, "dark").contains("\"2호선|SAT\":{"), "요일 응답 보관");
        ok(mc.sheetAct("mt.d.SAT") == MapCore.R_TT_RENDER && mc.sheetAct("mt.retry") == MapCore.R_TT_LOAD, "받아 둔 요일은 요청 없이 · 다시 시도");
        ok(!mc.addTt("zzz", mc.ttSeq) && "fail".equals(mc.ttState), "깨진 응답은 실패");
        // 버스: 위치 → 엔진이 받아 오라는 주소 → 본문을 그대로 res 로
        mc.cat("m:bus");
        ok(mc.act("mp.loc", null) == MapCore.R_BUS_LOC && mc.bodyRequest(18, "dark").contains("\"bus\":{\"vw\":\"near\"") && !mc.bodyRequest(18, "dark").contains("\"lat\""), "버스 모드의 내 위치는 정류장 찾기 · 위치 전엔 lat/lng 없음(토글·즐겨찾기 값만)");
        mc.setBusLoc(37.5, 127.0);
        mc.onScreen("{\"info\":{\"view\":\"bus\",\"bus\":{\"st\":\"need\",\"need\":[{\"k\":\"tp\",\"url\":\"http://ws.bus.go.kr/api/rest/stationinfo/getStationByPos?tmX=127\"},{\"k\":\"tn\",\"url\":\"https://evil.example/x\"}]}}}");
        ok(mc.busNeed.size() == 2 && "tp".equals(mc.busNeed.get(0)[0]), "엔진이 준 주소 목록 읽기");
        ok(MapCore.busFetchUrl(mc.busNeed.get(0)[1]).startsWith(ShellCore.BUS_BASE + "/tago?url=http%3A%2F%2Fws.bus.go.kr") && MapCore.busFetchUrl(mc.busNeed.get(1)[1]).isEmpty(), "허용된 공공 API 주소만 프록시로 받는다");
        ok(MapCore.busFetchUrl("https://apis.data.go.kr/6410000/busarrivalservice/v2/getBusArrivalListv2?stationId=1&format=json").startsWith(ShellCore.BUS_BASE + "/tago?url=https%3A%2F%2Fapis.data.go.kr%2F6410000%2F")
            && MapCore.busFetchUrl(ShellCore.NEWS_BASE + "/bus-stops?lat=37.5&lng=127&radius=800").equals(ShellCore.NEWS_BASE + "/bus-stops?lat=37.5&lng=127&radius=800")
            && MapCore.busFetchUrl(ShellCore.NEWS_BASE + "/bus-stops?lat=1&x=<script>").isEmpty() && MapCore.busFetchUrl(ShellCore.NEWS_BASE + "/other?x=1").isEmpty() && MapCore.busFetchUrl("https://evil.example/bus-stops?lat=1").isEmpty(), "경기 GBIS 주소는 프록시로, 서버 정류장 표(D1)는 직접, 그 밖은 막는다");
        String rawU = "https://apis.data.go.kr/1613000/ArvlInfoInqireService/getX?cityCode=23&nodeId=ICB1";
        ok(MapCore.busAltUrl(rawU).startsWith(ShellCore.BASE + "/bus-tago?url=https%3A%2F%2Fapis.data.go.kr%2F") && ScreenCore.netAllowed(MapCore.busAltUrl(rawU)), "s172: 키 2개 중계 주소(/bus-tago)는 허용 목록 안");
        ok(MapCore.busAltUrl("https://evil.example/x").length() == 0 && MapCore.busAltUrl(null).length() == 0 && MapCore.busAltUrl(ShellCore.NEWS_BASE + "/bus-stops?a=1").length() == 0, "s172: 공공 API 가 아닌 주소는 두 길로 나누지 않는다");
        ok(MapCore.busGet("a1", "https://evil.example/x", 1000, 1000) == null, "s172: 허용 안 된 주소는 받지 않는다(null)");
        ok(NetPost.getBus2("https://example.com/x", "https://example.com/y", 1, true, 1000, 1000).status == -1, "s172: 두 길 다 막히면 못 받음");
        ok(ScreenCore.netAllowed(MapCore.busFetchUrl("https://apis.data.go.kr/6410000/busarrivalservice/v2/getBusArrivalListv2?stationId=1&format=json")) && ScreenCore.netAllowed(ShellCore.BUS_BASE + "/health") && ScreenCore.netAllowed(HomeSearchCore.busUrl(HomeSearchCore.BUS_BASE, "x")), "버스 프록시(gildongmu-bus)는 앱 통신 허용 목록에 있다(없으면 기기 버스 받기가 전부 blocked)");
        mc.addBusRes("tp", "<a/>"); mc.addBusRes("BAD KEY", "x");
        String bq2 = mc.bodyRequest(18, "dark");
        ok(bq2.contains("\"lat\":37.5,\"lng\":127.0,\"res\":{\"tp\":\"<a/>\"}}") && bq2.contains("\"fav\":[]") && bq2.contains("\"al\":{}") && !bq2.contains("BAD"), "받은 본문을 res 로 다시 보낸다(+ 즐겨찾기·별명 값)");
        mc.setBusLoc(37.4, 127.1); ok(!mc.bodyRequest(18, "dark").contains("\"tp\""), "위치를 다시 잡으면 이전 본문은 비운다");
        // s148: 서버가 정류장·도착정보를 한 번에 받는다(sv) — 요청에 sv:1, 응답의 bres 는 그대로 모아 두고, 한도는 정류장 40 · 주소 64
        {
            ShellCore.MemStore sv = new ShellCore.MemStore(); MapCore sm = new MapCore(sv);
            sm.setBusLoc(37.5, 127.0);
            ok(sm.bodyRequest(23, "dark").contains("\"sel\":-1,\"sv\":1,\"svb\":300,\"fav\""), "버스 요청에 sv:1(서버가 받아 줄 수 있다)");
            sm.onScreen("{\"info\":{\"view\":\"bus\",\"bus\":{\"st\":\"ok\"},\"bres\":{\"tp\":\"<a/>\",\"a0\":\"AAA\",\"BAD KEY\":\"x\"},\"svf\":2}}");
            ok(sm.svServer && sm.svFail == 2 && sm.bodyRequest(23, "dark").contains("\"a0\":\"AAA\"") && sm.bodyRequest(23, "dark").contains("\"tp\":\"<a/>\"") && !sm.bodyRequest(23, "dark").contains("BAD"), "info.bres 를 받은 본문으로 모은다 · 못 받은 수(svf)");
            sm.dropArrivals(); sm.onScreen("{\"info\":{\"view\":\"bus\",\"bus\":{\"st\":\"ok\"},\"bres\":{\"a1\":\"B\"},\"svf\":1}}");
            ok(sm.fillFromStash() == 1 && sm.bodyRequest(23, "dark").contains("\"a0\":\"AAA\"") && sm.bodyRequest(23, "dark").contains("\"a1\":\"B\""), "새로 못 받은 도착정보만 보던 값으로 채운다");
            sm.onScreen("{\"info\":{\"view\":\"bus\",\"bus\":{\"st\":\"need\",\"need\":[{\"k\":\"a0\",\"url\":\"http://ws.bus.go.kr/x\"}]}}}");
            ok(!sm.svServer && sm.svFail == 0 && sm.busNeed.size() == 1, "서버가 못 받았으면(need 가 남음) 기기가 받는 옛 길로");
            // s168: 정류장 뼈대 요청(도착정보 없이 · sv 끔) · 옛 도착정보 비우기 · 뼈대 열쇠
            sm.addBusRes("tn", "{\"response\":1}"); sm.addBusRes("a0", "OLD0"); sm.addBusRes("f1", "OLD1");
            String sk = sm.bodyRequest(23, "dark", true);
            ok(sk.contains("\"tn\"") && !sk.contains("\"a0\"") && !sk.contains("\"f1\"") && !sk.contains("\"sv\":1") && sk.contains("\"fav\":[]") && sm.bodyRequest(23, "dark").contains("\"a0\":\"OLD0\""), "뼈대 요청: 정류장 본문만 · 도착정보(a·f) 없음 · sv 끔(일반 요청은 그대로)");
            sm.clearArrivals();
            ok(!sm.bodyRequest(23, "dark").contains("\"a0\"") && !sm.bodyRequest(23, "dark").contains("\"f1\"") && sm.bodyRequest(23, "dark").contains("\"tn\"") && sm.busNeed.isEmpty(), "처음 그리기: 옛 도착정보는 비우고 정류장 목록은 둔다");
            ok(sm.stopsCell().equals("bsc_37500_127000") && ShellCore.busSkelKey(sv).equals("mapb|busskel|seoul|ALL") && ShellCore.diskTtl(ShellCore.busSkelKey(sv)) >= 3600000L && ShellCore.BUS_STALE_MS == ShellCore.BUS_FRESH_MS && ShellCore.diskTtl("mapb|bus|seoul|ALL") == ShellCore.BUS_FRESH_MS, "뼈대는 24시간 · 도착정보 화면은 8초(옛 숫자를 남기지 않는다)");
            ok(ShellCore.warmKeys(sv, "home").contains(ShellCore.busSkelKey(sv)), "뼈대도 켤 때 미리 읽는다");
            StringBuilder big = new StringBuilder("{\"info\":{\"view\":\"bus\",\"stops\":["), nd = new StringBuilder();
            for (int i = 0; i < 45; i++) { if (i > 0) { big.append(','); nd.append(','); } big.append("{\"nm\":\"s").append(i).append("\",\"id\":\"SEOUL:").append(i).append("\"}"); nd.append("{\"k\":\"a").append(i).append("\",\"url\":\"http://ws.bus.go.kr/").append(i).append("\"}"); }
            sm.onScreen(big.append("],\"bus\":{\"st\":\"need\",\"need\":[").append(nd).append("]}}}").toString());
            ok(sm.stopCount() == 40 && sm.busNeed.size() == 45, "반경 300m 정류장이 많아도 40곳까지 · 받을 주소 45개 모두");
            ShellCore.MemStore ls = new ShellCore.MemStore();
            ok(ShellCore.lastLocFresh(ls, 1800000L, 1000000L) == null, "저장된 위치 없음 = null");
            ShellCore.lastLocPut(ls, 37.5, 127.0, 900000L);
            ok(ShellCore.lastLocFresh(ls, 1800000L, 1000000L) != null && ShellCore.lastLocFresh(ls, 1800000L, 900000L + 1800001L) == null && ShellCore.lastLocFresh(ls, 1800000L, 800000L) == null, "마지막 위치는 30분 안일 때만 첫 화면에 쓴다(시계가 거꾸로 가도 안 쓴다)");
        }
        // 버스: 주변/즐겨찾기 전환 · 선택 · 즐겨찾기(12곳) · 별명
        {
            ShellCore.MemStore bsv = new ShellCore.MemStore(); MapCore bm = new MapCore(bsv);
            bm.setBusLoc(37.5, 127.0);
            bm.onScreen("{\"info\":{\"view\":\"bus\",\"stops\":[{\"nm\":\"가\",\"id\":\"SEOUL:1\",\"src\":\"topis\",\"la\":37.5,\"lo\":127.0,\"ars\":\"1\"},{\"nm\":\"나\",\"id\":\"SEOUL:2\",\"src\":\"topis\",\"la\":37.6,\"lo\":127.1,\"ars\":\"2\"}],\"favp\":{\"max\":12,\"al\":10,\"add\":\"즐겨찾기 추가\",\"rm\":\"즐겨찾기 해제\",\"full\":\"즐겨찾기는 최대 12개\"},\"bus\":{\"st\":\"ok\"}}}");
            ok(bm.stopJson.size() == 2 && bm.busView().equals("near"), "info.stops 를 읽어 둔다 · 처음은 주변");
            ok(bm.act("mp.pc.1", null) == MapCore.R_BUS_SEL && bm.busSel == 1 && bm.bodyRequest(18, "dark").contains("\"sel\":1") && bm.act("mp.pm.9", null) == MapCore.R_NONE && bm.busSel == 1, "카드·핀 누름 = 선택(범위 밖은 무시)");
            {   // s203: 카드 '다시 시도 ›'(mp.rt) — 도착정보·경유노선은 비우고 정류장 목록은 둔다 · 실패 신호(fl)는 요청에만
                bm.addBusRes("tn", "TN"); bm.addBusRes("a0", "A0"); bm.addBusRes("g1", "G1"); bm.addBusRes("t100", "T100"); bm.addBusRes("t0", "T0");
                bm.busFailShow = true;
                ok(bm.bodyRequest(18, "dark").contains("\"fl\":1"), "실패 신호가 켜지면 요청에 fl:1");
                ok(bm.act("mp.rt", null) == MapCore.R_BUS_REF && !bm.busFailShow && !bm.bodyRequest(18, "dark").contains("\"fl\":1"), "다시 시도 = 다시 받기 + 실패 신호 끔");
                String rq3 = bm.bodyRequest(18, "dark");
                ok(rq3.contains("\"tn\":\"TN\"") && !rq3.contains("\"a0\"") && !rq3.contains("\"g1\"") && !rq3.contains("\"t100\"") && !rq3.contains("\"t0\""), "다시 시도: 정류장 목록(tn)은 두고 도착정보·경유노선·좌표 보정은 비운다");
            }
            ok(bm.act("mp.fv.0", null) == MapCore.R_BUS_SEL && "즐겨찾기 추가".equals(bm.toast) && bsv.get(MapCore.K_BUSFAV, "").contains("SEOUL:1") && bm.bodyRequest(18, "dark").contains("\"fav\":[{"), "별 → 즐겨찾기 추가(저장 + 요청에 실림)");
            ok(bm.act("mp.fv.0", null) == MapCore.R_BUS_SEL && "즐겨찾기 해제".equals(bm.toast) && "[]".equals(bsv.get(MapCore.K_BUSFAV, "")), "다시 누르면 해제");
            for (int i = 0; i < 12; i++) { bm.stopJson.clear(); bm.stopJson.add("{\"nm\":\"s" + i + "\",\"id\":\"SEOUL:" + (10 + i) + "\",\"src\":\"topis\"}"); bm.act("mp.fv.0", null); }
            bm.stopJson.clear(); bm.stopJson.add("{\"nm\":\"x\",\"id\":\"SEOUL:99\",\"src\":\"topis\"}");
            ok(bm.act("mp.fv.0", null) == MapCore.R_NONE && "즐겨찾기는 최대 12개".equals(bm.toast) && !bsv.get(MapCore.K_BUSFAV, "").contains("SEOUL:99"), "즐겨찾기는 12곳까지");
            {   // s207: 한도 · 안내 글 · 별명 글자 수는 엔진이 알려 준 값을 따른다(앱에 박아 두지 않는다)
                bm.onScreen("{\"info\":{\"view\":\"bus\",\"stops\":[{\"nm\":\"z\",\"id\":\"SEOUL:77\",\"src\":\"topis\"}],\"favp\":{\"max\":13,\"al\":4,\"add\":\"담음\",\"rm\":\"뺌\",\"full\":\"가득\"},\"bus\":{\"st\":\"ok\"}}}");
                ok(bm.act("mp.fv.0", null) == MapCore.R_BUS_SEL && "담음".equals(bm.toast) && bsv.get(MapCore.K_BUSFAV, "").contains("SEOUL:77"), "엔진이 한도를 13으로 알리면 13번째가 들어가고 글도 엔진 글");
                bm.stopJson.clear(); bm.stopJson.add("{\"nm\":\"y\",\"id\":\"SEOUL:78\",\"src\":\"topis\"}");
                ok(bm.act("mp.fv.0", null) == MapCore.R_NONE && "가득".equals(bm.toast), "14번째는 엔진 글로 거절");
                bm.setAlias("k1", "일이삼사오육"); ok(bsv.get(MapCore.K_BUSAL, "").contains("일이삼사\"") && !bsv.get(MapCore.K_BUSAL, "").contains("오"), "별명은 엔진이 알린 4글자까지");
                bm.onScreen("{\"info\":{\"view\":\"bus\",\"stops\":[],\"favp\":{\"max\":12,\"al\":10,\"add\":\"즐겨찾기 추가\",\"rm\":\"즐겨찾기 해제\",\"full\":\"즐겨찾기는 최대 12개\"},\"bus\":{\"st\":\"ok\"}}}"); bsv.put(MapCore.K_BUSAL, "{}");
            }
            {   // s179: 버스 '주변' 화면 캐시는 위치 칸마다 따로 — 다른 동네의 정류장이 먼저 뜨지 않는다
                ShellCore.MemStore kcs = new ShellCore.MemStore();
                MapCore kcm = new MapCore(kcs); kcm.primary = true; kcm.setBusLoc(37.5827, 126.7078);
                MapCore ghost = new MapCore(kcs); ghost.setBusLoc(35.1796, 129.0756);
                String k1 = ShellCore.mapKey("mapb", "bus", kcs);
                kcm.setBusLoc(35.1796, 129.0756);
                String k2 = ShellCore.mapKey("mapb", "bus", kcs);
                ok(k1.equals("mapb|bus|seoul|ALL|near|bsc_37583_126708") && k2.equals("mapb|bus|seoul|ALL|near|bsc_35180_129076") && !k1.equals(k2) && MapCore.cellOf(35.1796, 129.0756).equals("bsc_35180_129076")
                    && ShellCore.mapKey("mapb", "bus", kcs, "bsc_1_2").endsWith("|near|bsc_1_2") && ShellCore.diskTtl(k1) == ShellCore.BUS_FRESH_MS && "map".equals(ShellCore.expectId(k1)), "버스 화면 열쇠에 위치 칸(주 상태기만 적는다 · 유령 상태기는 저장소를 건드리지 않는다)");
            }
            ok(bm.act("mp.vw.fav", null) == MapCore.R_BUS_VIEW && bm.busView().equals("fav") && ShellCore.mapKey("mapb", "bus", bsv).endsWith("|fav") && ShellCore.mapKey("maph", "bus", bsv).endsWith("|ALL") && bm.act("mp.vw.fav", null) == MapCore.R_NONE, "즐겨찾기로 전환(캐시 열쇠도 따로 · 머리는 그대로)");
            ok(bm.act("mp.rf", null) == MapCore.R_BUS_REF && bm.bodyRequest(18, "dark").contains("\"vw\":\"fav\"") && bm.act("mp.vw.near", null) == MapCore.R_BUS_VIEW && bm.act("mp.rf", null) == MapCore.R_BUS_LOC, "새로고침: 즐겨찾기는 도착정보만 · 주변은 위치부터");
            ok(bm.takeRefLoc() && !bm.takeRefLoc(), "s283: 즐겨찾기 새로고침은 현재 위치 재확인 표시를 한 번 남긴다");
            ok(bm.act("mp.rt", null) == MapCore.R_BUS_REF && !bm.takeRefLoc(), "s283: 카드의 다시 시도는 위치를 다시 확인하지 않는다");
            { ShellCore.MemStore fs = new ShellCore.MemStore(); MapCore fm = new MapCore(fs); fm.setBusLoc(37.5, 127.0); String ck = MapCore.cellOf(37.5, 127.0); fs.put(ck, "{\"t\":" + System.currentTimeMillis() + ",\"r\":{\"tp\":\"{}\"}}");
              fm.setBusLocFresh(37.5, 127.0); ok(fs.get(ck, "").length() > 0 && fm.busLL[0] == 37.5 && "{}".equals(fm.busRes.get("tp")), "s283: 새로고침 위치로 바꿔도 같은 칸의 정류장 목록 보관본은 바로 쓴다(3초 안에 뜨게)"); }
            bm.stopJson.clear(); bm.stopJson.add("{\"nm\":\"한진\",\"id\":\"SEOUL:5\",\"src\":\"topis\"}");
            ok(bm.act("mp.al.0", null) == MapCore.R_ALIAS && "SEOUL:5".equals(bm.aliasKey) && "한진".equals(bm.aliasName) && bm.aliasCur.isEmpty(), "✏️ → 별명 입력창 값");
            bm.setAlias("SEOUL:5", "  출근길  "); ok(bm.bodyRequest(18, "dark").contains("\"SEOUL:5\":\"출근길\"") && bm.act("mp.al.0", null) == MapCore.R_ALIAS && "출근길".equals(bm.aliasCur), "별명 저장(앞뒤 공백 제거) → 다음 요청에 실림");
            bm.setAlias("SEOUL:5", "가나다라마바사아자차카"); ok(bsv.get(MapCore.K_BUSAL, "").contains("가나다라마바사아자차\""), "별명은 10자까지");
            bm.setAlias("SEOUL:5", ""); ok(!bsv.get(MapCore.K_BUSAL, "").contains("SEOUL:5"), "빈 글이면 별명 삭제");
            bsv.put(MapCore.K_BUSFAV, "깨짐"); bsv.put(MapCore.K_BUSAL, "깨짐"); ok(bm.bodyRequest(18, "dark").contains("\"fav\":[]") && bm.bodyRequest(18, "dark").contains("\"al\":{}"), "깨진 저장값은 비운 것으로 본다");
            bm.setBusLoc(37.4, 127.1); ok(bm.busSel == -1, "위치를 다시 잡으면 선택을 푼다");
        }
        // 버스: 노선 상세(줄 → 노선 열기 · 정류장 목록 보관 · 출발지/도착지 고르기 · 8초 갱신은 위치만 비움)
        {
            ShellCore.MemStore rsv = new ShellCore.MemStore(); MapCore rm = new MapCore(rsv);
            rm.onScreen("{\"info\":{\"view\":\"bus\",\"stops\":[{\"nm\":\"가\",\"id\":\"GG:1\",\"src\":\"gbis\",\"la\":37.5,\"lo\":127.0,\"city\":\"\"}],\"rts\":{\"0\":[[\"R1\",\"13-4\",\"일반\"],[\"\",\"7000\",\"직행\"]]}}}");
            ok(rm.act("br.0.1", null) == MapCore.R_NONE && rm.act("br.5.0", null) == MapCore.R_NONE, "노선 id 가 없거나 범위 밖이면 열지 않는다");
            ok(rm.act("br.0.0", null) == MapCore.R_BR_OPEN && "R1".equals(rm.brRid) && "13-4".equals(rm.brNo) && "gbis".equals(rm.brSrc), "줄을 누르면 노선 열기(출처는 정류장에서)");
            String q1 = rm.brRequest(18, "dark");
            ok(q1.contains("\"part\":\"br\"") && q1.contains("\"rid\":\"R1\"") && q1.contains("\"o\":{\"id\":\"GG:1\"") && !q1.contains("\"stn\""), "요청에 노선·기준 정류장");
            rm.onBr("{\"info\":{\"br\":{\"st\":\"need\",\"need\":[{\"k\":\"gp\",\"url\":\"https://apis.data.go.kr/6410000/x\"}],\"via\":\"gg\",\"cc\":\"\",\"stn\":[[1,\"GG:1\",\"가\",\"001\",37.5,127.0,0],[2,\"GG:2\",\"나\",\"002\",37.51,127.0,1]],\"pos\":{\"known\":false,\"n\":0}}}}");
            ok(rm.brStn.size() == 2 && rm.brNeed.size() == 1 && "gp".equals(rm.brNeed.get(0)[0]) && rm.brStnJson.startsWith("[[1,") && "gg".equals(rm.brVia), "정류장 목록을 보관하고 더 받을 주소를 읽는다");
            rm.addBrRes("gp", "BODY"); String q2 = rm.brRequest(18, "dark");
            ok(q2.contains("\"stn\":[[1,\"GG:1\"") && q2.contains("\"via\":\"gg\"") && q2.contains("\"res\":{\"gp\":\"BODY\"}"), "이후 요청은 정류장을 다시 받지 않고 보낸다");
            rm.dropPositions(); ok(!rm.brRequest(18, "dark").contains("BODY") && rm.brRequest(18, "dark").contains("\"stn\""), "8초 갱신: 위치 본문만 비우고 정류장은 둔다");
            ok(rm.brAct("br.p.1") == MapCore.R_BR_RENDER && rm.brSel == 1 && rm.brRequest(18, "dark").contains("\"sel\":1") && rm.brAct("br.ss") == MapCore.R_BR_START, "정류장을 누르면 선택 → 출발지로 설정");
            rm.brPickStart(); ok("나".equals(rm.pkName) && rm.brRequest(18, "dark").contains("\"pk\":{\"n\":\"나\",\"i\":\"GG:2\"}") && rm.brSel == -1, "출발지를 정하면 요청에 pk");
            ok(rm.brAct("br.p.1") == MapCore.R_BR_SAME && rm.brAct("br.p.0") == MapCore.R_BR_FINISH && rm.brAct("br.st") == MapCore.R_BR_TOSTN && rm.brAct("br.cx") == MapCore.R_BR_CANCEL && rm.brAct("br.p.9") == MapCore.R_NONE, "출발지와 같은 정류장은 안내 · 다른 정류장은 도착지 · 역으로 · 취소");
            HomeCore hh = new HomeCore();
            hh.loc[0] = new HomeCore.Loc(); hh.loc[0].name = "집"; hh.loc[0].lat = 37.1; hh.loc[0].lng = 127.1; hh.text[0] = "집";
            hh.loc[1] = new HomeCore.Loc(); hh.loc[1].name = "회사"; hh.loc[1].lat = 37.2; hh.loc[1].lng = 127.2; hh.text[1] = "회사";
            hh.pickSnap(); hh.setBusStop(HomeCore.START, "나", "GG:2", "", 37.51, 127.0);
            ok("bus".equals(hh.loc[0].type) && "GG:2".equals(hh.loc[0].nodeId) && hh.loc[1] == null && hh.text[1].isEmpty(), "정류장을 출발지로 · 도착지는 비운다");
            ok(hh.pickRestore("나") && "집".equals(hh.loc[0].name) && "회사".equals(hh.loc[1].name) && !hh.pickRestore("나"), "도착지를 못 정하고 나가면 고르기 전으로");
            hh.pickSnap(); hh.setBusStop(HomeCore.START, "나", "GG:2", "", 37.51, 127.0); hh.setStation(HomeCore.START, "역", "2호선", 37.0, 127.0);
            ok(!hh.pickRestore("나"), "그 사이 출발지를 바꿨다면 건드리지 않는다");
            hh.setBusStop(HomeCore.START, "나", "GG:2", "", 37.51, 127.0); hh.setBusStop(HomeCore.DEST, "다", "GG:3", "", 37.52, 127.0);
            ok(hh.bothSet(), "정류장 둘이면 경로를 찾을 수 있다");
        }
        // 결과 카드 보조: 장거리 다시 고르기 · 공지 원자료 · 즐겨찾기
        {
            HomeCore h2 = new HomeCore();
            h2.setRoute("{\"result\":{}}", "부평", "강남", -1, 1L);
            h2.onResult("{\"info\":{\"sec\":[\"수도권 1호선\",\"2호선\"],\"ld\":{\"m\":[\"&ldMode=train&ldDepTs=100\",\"&ldMode=expbus\"],\"g\":[\"&ldMode=train&ldGrade=ITX&ldDepTs=200\",\"zz\"]}}}");
            ok(h2.actResult("rh.ld.m.0") == HomeCore.R_NONE, "지난 탐색 질의가 없으면 다시 고르기는 무시");
            h2.lastQs = "SX=1&SY=2";
            ok(h2.actResult("rh.ld.m.1") == HomeCore.R_LD && "&ldMode=expbus".equals(h2.ldPending) && h2.actResult("rh.ld.g.0") == HomeCore.R_LD && h2.ldPending.contains("ldGrade=ITX"), "장거리 칩 눌림 → 엔진이 만든 질의");
            ok(h2.actResult("rh.ld.g.1") == HomeCore.R_NONE && h2.actResult("rh.ld.m.9") == HomeCore.R_NONE, "엉뚱한 질의·번호는 버린다");
            ok(h2.actResult("rh.room.1") == HomeCore.R_ROOM && "2호선".equals(h2.roomLine) && h2.actResult("rh.room.5") == HomeCore.R_NONE, "노선 방 보기 번호 = info.sec 번호");
            ok(h2.actResult("rh.detail") == HomeCore.R_DETAIL && h2.detOpen.isEmpty(), "세부경로 보기 단추");
            ok(h2.actResult("rh.confirm") == HomeCore.R_CONFIRM && new HomeCore().actResult("rh.confirm") == HomeCore.R_NONE, "경로 확정 단추(안내 전·경로가 있을 때만)");
            ok(h2.actDetail("rd.tg.1") == HomeCore.D_RENDER && h2.detOpen.contains(1) && h2.actDetail("rd.tg.1") == HomeCore.D_RENDER && h2.detOpen.isEmpty() && h2.actDetail("rd.tg.99") == HomeCore.D_NONE && h2.actDetail("rd.close") == HomeCore.D_CLOSE && h2.actDetail("rd.kakao") == HomeCore.D_NONE, "세부경로: 펼침 토글 · 닫기 · 주소가 없으면 길안내 무시");
            h2.onDetail("{\"info\":{\"nav\":{\"kakao\":[\"kakaomap://route?ep=1,2&by=PUBLICTRANSIT\",\"https://map.kakao.com/x\"],\"naver\":[\"evil://x\",\"https://map.naver.com/y\"]}}}");
            ok(h2.actDetail("rd.kakao") == HomeCore.D_KAKAO && h2.actDetail("rd.naver") == HomeCore.D_NAVER && HomeCore.navAppOk(h2.navKakao[0]) && !HomeCore.navAppOk(h2.navNaver[0]), "세부경로: 길안내 주소 읽기 · 허용된 앱 주소만");
            h2.detOpen.add(2);
            String dq = h2.detailRequest(new HomeCore.Env(), 18, "dark");
            ok(dq.contains("\"view\":\"detail\",\"open\":[2]}}") && dq.startsWith("{\"cap\":18,\"r\":{") && new HomeCore().detailRequest(new HomeCore.Env(), 18, "dark").isEmpty(), "세부경로 요청: view/open 을 r 안에 넣는다, 경로가 없으면 보내지 않는다");
            // 탑승 추적: 상태 전달 · 새 탐색이면 탑승 표시가 사라진다
            ok(h2.actResult("rh.stop") == HomeCore.R_NONE && h2.actDetail("rd.confirm") == HomeCore.D_CONFIRM && h2.actDetail("rd.stop") == HomeCore.D_NONE, "탑승 전: 시작만 가능");
            h2.rideRouteId = h2.routeId;
            ok(h2.setRide("{\"on\":1,\"text\":\"다음 부평\"}", "{\"cur\":2,\"pos\":null,\"arr\":null}") && !h2.setRide("{\"on\":1,\"text\":\"다음 부평\"}", "{\"cur\":2,\"pos\":null,\"arr\":null}") && h2.riding(), "서비스 상태를 받으면 바뀐 때만 true");
            ok(h2.actResult("rh.stop") == HomeCore.R_STOP && h2.actDetail("rd.stop") == HomeCore.D_STOP && h2.actDetail("rd.confirm") == HomeCore.D_NONE, "탑승 중: 종료만 가능");
            String rf = h2.resultFacts(new HomeCore.Env(), "dark");
            ok(rf.contains("\"ride\":{\"on\":1,\"text\":\"다음 부평\"}") && rf.contains("\"lv\":{\"cur\":2"), "결과 사실에 탑승 상태(r.ride)와 내 위치(r.lv)가 실린다");
            {   // s214: 확정한 경로는 닫기 · 새로 찾기 · 바꾸기로 풀리지 않는다 — 안내를 끝내야(또는 도착해야) 풀린다
                HomeCore h4 = new HomeCore();
                h4.setRoute("{\"result\":{}}", "부평", "강남", -1, 1L); h4.text[0] = "부평"; h4.text[1] = "강남";
                ok(h4.act("rt.go", null) == HomeCore.R_GO && h4.actResult("rh.close") == HomeCore.R_RENDER && !h4.hasRoute(), "s214: 확정 전엔 닫기 · 찾기가 그대로 된다");
                h4.setRoute("{\"result\":{}}", "부평", "강남", -1, 1L); h4.text[0] = "부평"; h4.text[1] = "강남";
                h4.rideRouteId = h4.routeId; h4.setRide("{\"on\":1}", "{}");
                ok(h4.riding() && h4.actResult("rh.close") == HomeCore.R_LOCK && h4.hasRoute() && h4.riding(), "s214: 확정한 경로는 닫기(X)로 풀리지 않는다");
                ok(h4.act("rt.go", null) == HomeCore.R_LOCK && h4.act("rt.enter", null) == HomeCore.R_RENDER && h4.act("rt.swap", null) == HomeCore.R_LOCK && "부평".equals(h4.text[0]) && h4.riding(), "s214: 확정 중엔 새로 찾기 · 출발/도착 바꾸기를 받지 않는다");
                h4.setRide("", "");
                ok(!h4.riding() && h4.actResult("rh.close") == HomeCore.R_RENDER && !h4.hasRoute(), "s214: 안내가 끝나면(사용자 종료 · 도착) 다시 닫을 수 있다");
            }
            h2.setRoute("{\"result\":{}}", "부평", "강남", -1, 1L);
            ok(!h2.riding() && !h2.resultFacts(new HomeCore.Env(), "dark").contains("\"ride\""), "새 탐색이면 이전 탑승 표시는 붙지 않는다");
            h2.setRide("", "");
            h2.ld2Raw = "{\"result\":{\"path\":[]}}"; h2.setNotes(h2.secKey(), "{\"lines\":{}}", "{\"lines\":{}}", 1000L);
            String rq2 = h2.resultRequest(new HomeCore.Env(), 18, "dark", 0);
            ok(rq2.contains("\"ld2\":{") && rq2.contains("\"off\":{") && rq2.contains("\"al\":{"), "다시 받은 응답·공지 원자료를 엔진에 그대로 보낸다");
            ok(!h2.needNotes(1500L) && h2.needNotes(62000L), "공지는 60초 안에는 다시 받지 않는다");
            ok(h2.replaceRoute("{\"a\":1}") && h2.ld2Raw.isEmpty() && !h2.replaceRoute("zz"), "예상 재조회 결과로 바꾸기");
            {   // s201: 같은 찾기의 새 응답으로 바꿔 끼우기 — 보던 탭 · 경로 번호는 그대로, 탐색 시각만 새로
                HomeCore h3 = new HomeCore();
                h3.setRoute("{\"result\":{}}", "부평", "강남", -1, 10L);
                h3.resTab = "less"; int id3 = h3.routeId; int rev3 = h3.dataRev;
                ok(h3.replaceRouteSame("{\"b\":2}", 99L) && "less".equals(h3.resTab) && h3.routeId == id3 && h3.resRb == 99L && h3.dataRev != rev3 && !h3.replaceRouteSame("zz", 1L) && h3.resRb == 99L, "s201: 같은 찾기 새 응답은 탭·경로 번호를 지키고 시각만 새로");
            }
            ShellCore.MemStore fs = new ShellCore.MemStore();
            FavCore fv = new FavCore(fs);
            ok("[]".equals(fv.listJson()) && fv.request(18, "dark", "부평", "강남").contains("\"cur\":{\"s\":\"부평\""), "즐겨찾기 요청: 빈 목록 + 지금 경로");
            ok(fv.act("fv.add", null) == FavCore.R_RENDER && fv.request(18, "dark", "부평", "강남").contains("\"op\":{\"k\":\"quick\"}") && !fv.request(18, "dark", "", "").contains("\"op\""), "빠른 등록은 한 번만 실린다");
            fv.onScreen("{\"info\":{\"list\":[{\"s\":\"부평\",\"d\":\"강남\",\"name\":\"출근\"}],\"msg\":\"출근 등록 완료\",\"go\":[{\"s\":[\"부평\",\"수도권 1호선\",37.489,126.724],\"d\":[\"강남\",\"2호선\",37.497,127.027]},null]}}");
            ok(fs.get(FavCore.K_FAV, "").contains("출근") && "출근 등록 완료".equals(fv.msg) && fv.go.size() == 2, "엔진이 돌려준 새 목록을 그대로 저장");
            ok(fv.act("fv.go.0", null) == FavCore.R_GO && fv.go.get(0).dName.equals("강남") && Math.abs(fv.go.get(0).dLa - 37.497) < 1e-9 && fv.act("fv.go.1", null) == FavCore.R_NONE, "즐겨찾기로 경로 찾기(풀리지 않은 것은 무시)");
            ok(fv.request(18, "dark", "중동", "서면", "부산2호선", "부산2호선").contains("\"cur\":{\"s\":\"중동\",\"d\":\"서면\",\"sl\":\"부산2호선\",\"dl\":\"부산2호선\"}") && fv.request(18, "dark", "부평", "강남").contains("\"sl\":\"\",\"dl\":\"\""), "s208: 현재 경로 역의 노선 힌트(sl·dl)를 싣는다 — 같은 이름 지방 역은 엔진이 가른다");
            ok(fv.act("fv.del.0", null) == FavCore.R_RENDER && fv.request(18, "dark", "", "").contains("\"op\":{\"k\":\"del\",\"i\":0}") && fv.act("fv.close", null) == FavCore.R_CLOSE, "삭제 · 닫기");
            // 새로 등록 폼
            ShellCore.MemStore fsx = new ShellCore.MemStore(); FavCore fx = new FavCore(fsx);
            ok(fx.request(18, "dark", "", "").contains("\"form\":{\"n\":\"\",\"s\":\"\",\"d\":\"\",\"act\":\"\"}"), "폼은 처음엔 비어 있다");
            ok(fx.onText("fvs", "강", "focus") && fx.fact.equals("s") && fx.fs.equals("강") && fx.onText("fvd", "시청", "edit") && fx.fact.equals("d") && fx.fd.equals("시청") && !fx.onText("fvn", "x", "edit") && !fx.onText("fvs", "강", "blur"), "출발/도착 칸을 쓰면 그 칸이 '쓰는 중'(이름 칸·blur 는 다시 그리지 않음)");
            java.util.Map<String, String> fform = new java.util.HashMap<String, String>(); fform.put("fvn", "출근길"); fform.put("fvs", "부평"); fform.put("fvd", "강남");
            ok(fx.act("fv.new", fform) == FavCore.R_RENDER && fx.request(18, "dark", "", "").contains("\"n\":\"출근길\",\"s\":\"부평\",\"d\":\"강남\"") , "등록 누름: 입력칸 글을 폼에 옮긴다");
            fx.act("fv.new", fform);
            ok(fx.request(18, "dark", "", "").contains("\"op\":{\"k\":\"new\"}") && !fx.request(18, "dark", "", "").contains("\"op\""), "등록 요청은 한 번만 실린다");
            ok(fx.act("fv.pick.d.2", fform) == FavCore.R_RENDER && fx.request(18, "dark", "", "").contains("\"op\":{\"k\":\"pick\",\"w\":\"d\",\"j\":2}") && fx.act("fv.pick.x.1", fform) == FavCore.R_NONE && fx.act("fv.pick.s.12", fform) == FavCore.R_NONE, "후보 줄 고르기(칸 · 번호)");
            fx.onScreen("{\"info\":{\"list\":[],\"msg\":\"\",\"go\":[],\"form\":{\"n\":\"\",\"s\":\"강남\",\"d\":\"\",\"act\":\"d\"}}}");
            ok(fx.fs.equals("강남") && fx.fd.equals("") && fx.fact.equals("d") && fx.endActive() && fx.fact.equals("") && !fx.endActive(), "엔진이 돌려준 폼을 그대로 들고 있고, 칸이 풀리면 한 번만 알린다");
        }
        // 홈 카드 묶음
        {
            RideCore rc = new RideCore();
            ShellCore.MemStore ns = new ShellCore.MemStore();
            {   // 승차 대기 중 실시간 다음 차(s196): 엔진 ask → 서비스가 /board-live 로 → 받은 답은 다음 걸음 요청의 bl 로 한 번만
                RideCore rb = new RideCore();
                RideCore.Step s1 = rb.onStep("{\"v\":1,\"state\":{\"v\":1},\"ask\":{\"kind\":\"boardlive\",\"body\":{\"kind\":\"sub\",\"i\":1,\"line\":\"2호선\",\"nowMs\":5,\"fromMs\":9}}}");
                ok(s1.ok && s1.askBody.contains("\"kind\":\"sub\"") && s1.askBody.contains("\"line\":\"2호선\"") && !s1.askBody.contains("boardlive"), "엔진 ask 의 본문만 /board-live 로 보낸다");
                ok(rb.onStep("{\"v\":1,\"state\":{\"v\":1},\"ask\":null}").askBody.length() == 0 && rb.onStep("{\"v\":1,\"state\":{\"v\":1}}").askBody.length() == 0, "ask 가 없으면 묻지 않는다");
                ok(!rb.stepBody(1000L).contains("\"bl\""), "받은 답이 없으면 bl 을 싣지 않는다");
                rb.setBl("{\"ok\":true,\"kind\":\"sub\",\"i\":1,\"ms\":77,\"src\":\"realtime\",\"at\":5}");
                String sb = rb.stepBody(2000L);
                ok(sb.contains(",\"bl\":{\"ok\":true,\"kind\":\"sub\",\"i\":1,\"ms\":77"), "받은 답을 다음 걸음 요청에 bl 로 싣는다");
                rb.onStep("{\"v\":1,\"state\":{\"v\":1}}");
                ok(!rb.stepBody(3000L).contains("\"bl\""), "걸음이 끝나면 한 번 실은 답은 지운다");
                rb.setBl(""); rb.setBl(null); rb.setBl("{}");
                ok(!rb.stepBody(4000L).contains("\"bl\""), "빈 답·깨진 답은 싣지 않는다");
            }
            ok(RideCore.offKinds(ns).isEmpty() && RideCore.startBody(18, "{\"data\":{}}", RideCore.offKinds(ns)).equals("{\"cap\":18,\"r\":{\"data\":{}}}"), "알림을 안 껐으면 allowed 를 싣지 않는다");
            ns.put("np_arrive", "0"); ns.put("np_transfer", "0");
            ok(RideCore.offKinds(ns).size() == 5 && RideCore.startBody(18, "{\"data\":{}}", RideCore.offKinds(ns)).equals("{\"cap\":18,\"r\":{\"data\":{},\"allowed\":{\"near_arrive2\":false,\"near_arrive\":false,\"arrive\":false,\"transfer2\":false,\"transfer\":false}}}"), "끈 알림 종류가 allowed 로 실린다");
            ns.put("np_arrive", "1");
            ok(RideCore.offKinds(ns).toString().equals("[transfer2, transfer]") && RideCore.startBody(18, "", RideCore.offKinds(ns)).contains("\"r\":null"), "환승만 끄면 환승 2종만");
            ns.put("np_arrive_reco", "0");
            ok(RideCore.offKinds(ns).toString().equals("[transfer2, transfer, arrive_reco]"), "하차 추천 알림을 끄면 arrive_reco 가 꺼진 목록에 든다");
            ns.put("np_arrive_reco", "1");
            {
                String rqb = RideCore.recoBody((java.util.Map<String, Object>) ScreenCore.parse("{\"fire\":true,\"arrMs\":1760000000000,\"dest\":\"강남\",\"loc\":{\"lat\":37.5,\"lng\":127.02}}"));
                ok(rqb.startsWith("{\"arrMs\":1760000000000,\"nowMs\":") && rqb.contains("\"dest\":\"강남\"") && rqb.contains("\"loc\":{\"lat\":37.5,\"lng\":127.02},\"foodPref\":\"server\"") && rqb.endsWith(",\"aiCopy\":1,\"pickShop\":1}"), "추천 요청 본문: " + rqb);
                ok(RideCore.recoBody((java.util.Map<String, Object>) ScreenCore.parse("{\"fire\":false}")).length() == 0 && RideCore.recoBody((java.util.Map<String, Object>) ScreenCore.parse("{\"fire\":true}")).length() == 0, "fire 가 아니거나 도착 시각이 없으면 보내지 않는다");
                ok(!RideCore.recoBody((java.util.Map<String, Object>) ScreenCore.parse("{\"fire\":true,\"arrMs\":5,\"dest\":\"X\"}")).contains("loc"), "좌표가 없으면 loc 를 싣지 않는다");
                String[] tx = RideCore.recoText("{\"ok\":true,\"slot\":\"lunch\",\"title\":\"하차 5분 전\",\"body\":\"점심 어때요\"}");
                ok(tx != null && tx[0].equals("하차 5분 전") && tx[1].equals("점심 어때요"), "추천 글 읽기");
                {
                    RideCore wr = new RideCore();
                    wr.addFix(1000L, 37.5000, 127.0000, 10.0);
                    wr.onStep("{\"state\":{\"wait\":{\"i\":2,\"lat\":37.5009,\"lng\":127.0}},\"nextMs\":5000}");
                    ok(wr.lvJson().contains("\"wait\":{\"i\":2,\"lat\":37.5009,\"lng\":127.0,\"me\":[37.5,127.0]}"), "승차 대기 중이면 내 위치 JSON 에 대기 노드 · 탑승 지점 · 내 위치 좌표(거리는 엔진이 잰다, s271)");
                    wr.onStep("{\"state\":{},\"nextMs\":5000}");
                    ok(!wr.lvJson().contains("wait"), "대기가 끝나면 wait 가 빠진다");
                    RideCore wn = new RideCore();
                    wn.onStep("{\"state\":{\"wait\":{\"i\":3,\"lat\":37.5,\"lng\":127.0}},\"nextMs\":5000}");
                    ok(wn.lvJson().contains("\"wait\":{\"i\":3,\"lat\":37.5,\"lng\":127.0}") && !wn.lvJson().contains("\"me\""), "내 위치를 아직 모르면 me 없이 대기만");
                }
                {
                    String[] fr = RideCore.freshenReco(new String[] { "🚉 하차 7분 전 · 부평 ☕", "하차 7분 전이에요.\n부평 도착 예정 07:30\n\n카푸치노" }, 1760000000000L, 1760000000000L - 120000L);
                    ok(fr[0].equals("🚉 하차 2분 전 · 부평 ☕") && fr[1].equals("하차 2분 전이에요.\n부평 도착 예정 17:53\n\n카푸치노"), "받아 둔 추천 글: 남은 분 · 도착 시각을 지금 값으로(s225)");
                    ok(RideCore.freshenReco(new String[] { "하차 7분 전" }, 1760000000000L, 1760000000000L - 3600000L)[0].equals("하차 7분 전") && RideCore.freshenReco(new String[] { "하차 7분 전" }, 1760000000000L, 1760000000000L + 60000L)[0].equals("하차 1분 전") && RideCore.freshenReco(null, 1L, 1L) == null && RideCore.freshenReco(new String[] { "하차 7분 전" }, 0L, 5L)[0].equals("하차 7분 전"), "1~7분으로 맞춤 · 입력이 이상하면 그대로");
                }
                ok(RideCore.recoText("{\"ok\":true,\"slot\":\"none\"}") == null && RideCore.recoText("{\"ok\":false}") == null && RideCore.recoText("망가짐") == null, "시간대 아님·오류·깨진 응답은 글 없음");
            }
            {
                RideCore rr = new RideCore();
                ok(rr.recoStatJson().length() == 0, "한 번도 못 받았으면 상태 조각 없음");
                RideCore.Step st1 = rr.onStep("{\"state\":{\"v\":1},\"reco\":{\"fire\":false,\"dest\":\"강남\",\"remSec\":300,\"slot\":\"lunch\",\"dinner\":false,\"alertAt\":7}}");
                ok(st1.ok && st1.recoBody.length() == 0 && rr.recoStatJson().startsWith("\"dest\":\"강남\",\"slot\":\"lunch\",\"dinner\":false,\"rem\":300,\"alertAt\":7,\"tickAt\":"), "추천 상태 조각: " + rr.recoStatJson());
                RideCore.Step st2 = rr.onStep("{\"state\":{\"v\":1},\"reco\":{\"fire\":true,\"arrMs\":9000,\"dest\":\"강남\"}}");
                ok(st2.ok && st2.recoBody.startsWith("{\"arrMs\":9000,"), "fire 면 본문을 만든다");
            }
            ok(RideCore.startBody(18, "{\"data\":{}}", null, true).equals("{\"cap\":18,\"r\":{\"data\":{},\"pf\":true}}") && RideCore.startBody(18, "{\"data\":{}}", RideCore.offKinds(ns), true).endsWith(",\"pf\":true}}") && RideCore.startBody(18, "{\"data\":{}}", null, false).equals("{\"cap\":18,\"r\":{\"data\":{}}}"), "탑승 시작 요청: 위치 판단기 보정 스위치(pf)");
            ok(RideCore.startBody(18, "{\"data\":{}}").equals("{\"cap\":18,\"r\":{\"data\":{}}}") && RideCore.startBody(18, "").contains("\"r\":null"), "탑승 시작 요청 본문");
            ok(rc.onStart("{\"ok\":false,\"error\":\"longdist\",\"msg\":\"장거리 경로는 탑승 안내를 지원하지 않아요\"}").startsWith("장거리") && !rc.hasState(), "엔진이 거절하면 그 글을 그대로 돌려준다");
            ok(rc.onStart("zz").length() > 0 && rc.onStart("{\"ok\":true}").length() > 0 && !rc.hasState(), "이상한 응답은 시작하지 않는다");
            ok(rc.onStart("{\"ok\":true,\"v\":1,\"state\":{\"v\":1,\"eta\":{\"nodes\":[1]},\"etaMs\":[null,1792465720000,0.5]},\"text\":\"다음 S0 12:02\"}").isEmpty() && rc.hasState() && "다음 S0 12:02".equals(rc.text), "시작 응답에서 state 와 글을 받는다");
            rc.addFix(1000L, 37.5, 126.9, 15.0); rc.addFix(900L, 37.5, 126.9, 15.0); rc.addFix(2000L, 0, 0, 5.0); rc.addFix(3000L, 37.51, 126.91, 0.0);
            ok(rc.pendingFixes() == 2, "위치: 거꾸로 온 시각 · 0,0 은 버린다");
            String sb = rc.stepBody(5000L);
            ok(sb.startsWith("{\"nowMs\":5000,\"fixes\":[[1000,37.5,126.9,15],[3000,37.51,126.91,null]],\"state\":{") && sb.contains("\"eta\":{\"nodes\":[1]}") && sb.contains("\"etaMs\":[null,1792465720000,0.5]") && sb.contains("\"v\":1"), "5초 요청: 위치 + state 를 그대로: " + sb);
            RideCore.Step bad = rc.onStep("{\"error\":\"x\"}");
            ok(!bad.ok && rc.pendingFixes() == 2, "엔진 오류면 위치를 지우지 않고 다음에 다시 보낸다");
            RideCore.Step okS = rc.onStep("{\"v\":1,\"state\":{\"v\":1,\"eta\":{\"nodes\":[2]},\"steps\":1},\"ongoing\":{\"title\":\"길동무 경로 안내 중\",\"text\":\"다음 S1 12:04\"},\"alert\":{\"key\":\"6_2\",\"type\":\"near_arrive2\",\"title\":\"목적지 2정거장 전\",\"body\":\"S5까지 2정거장 남았어요\",\"vib\":[400,150,400]},\"done\":false,\"curIdx\":3,\"nextMs\":2500,\"pos\":{\"from\":3,\"to\":4,\"ratio\":0.5,\"moving\":true},\"arr\":[\"\",\"12:02\",\"12:04\"]}");
            ok(okS.ok && okS.alert && "near_arrive2".equals(okS.type) && "6_2".equals(okS.key) && okS.vib.length == 4 && okS.vib[0] == 0 && okS.vib[1] == 400 && !okS.done, "응답: 알림 · 진동 무늬(앞에 대기 0)");
            ok(rc.nextMs == 2500L && "다음 S1 12:04".equals(rc.text) && rc.cur == 3 && rc.pendingFixes() == 0 && rc.stepBody(9000L).contains("\"nodes\":[2]"), "응답: 간격 · 글 · 위치 · 보낸 위치 삭제 · 새 state");
            ok(rc.lvJson().startsWith("{\"cur\":3,\"pos\":{") && rc.lvJson().contains("\"ratio\":0.5") && rc.lvJson().endsWith(",\"arr\":[\"\",\"12:02\",\"12:04\"]}") && rc.rideJson().equals("{\"on\":1,\"text\":\"다음 S1 12:04\"}"), "결과 카드용 값(r.lv · r.ride)");
            rc.onStep("{\"state\":{\"v\":1,\"eta\":{}},\"nextMs\":99999}"); ok(rc.nextMs == RideCore.STEP_MAX_MS, "간격은 안전 범위 안으로");
            rc.onStep("{\"state\":{\"v\":1,\"eta\":{}},\"nextMs\":1}"); ok(rc.nextMs == RideCore.STEP_MIN_MS, "간격 하한");
            ok(rc.onStep("{\"state\":{\"v\":1,\"eta\":{}},\"done\":true}").done, "done 을 알린다");
            rc.onStep("{\"state\":{\"v\":1,\"eta\":{}},\"overlay\":{\"active\":true,\"line1\":\"강남 ▸ 역삼\",\"line2\":\"남은시간: 00시간 12분\",\"banner\":\"역삼까지 2정거장 남았어요\",\"alert\":2}}");
            ok(rc.ovActive && rc.ovLine1.equals("강남 ▸ 역삼") && rc.ovLine2.startsWith("남은시간") && rc.ovBanner.contains("2정거장") && rc.ovAlert == 2, "오버레이 값을 읽는다(글·단계는 엔진이 정한 그대로)");
            rc.onStep("{\"state\":{\"v\":1,\"eta\":{}},\"overlay\":{\"active\":true,\"line1\":\"x\",\"alert\":9}}"); ok(rc.ovAlert == 2, "단계는 0~2 안으로");
            rc.onStep("{\"state\":{\"v\":1,\"eta\":{}},\"overlay\":{\"active\":false}}"); ok(!rc.ovActive && rc.ovLine1.length() == 0, "active 가 아니면 치운다");
            rc.onStep("{\"state\":{\"v\":1,\"eta\":{}}}"); ok(!rc.ovActive, "overlay 가 없으면 치운다");
            RideCore rsc = new RideCore();
            rsc.onStep("{\"state\":{\"v\":1,\"tripSig\":\"abc\",\"eta\":{\"boarded\":true,\"nodes\":[{\"name\":\"출발\",\"isOrigin\":true},{\"name\":\"A\",\"isBus\":true,\"lineName\":\"6001\"},{\"name\":\"B\",\"isBus\":true,\"lineName\":\"6001\"}]}},\"curIdx\":1}");
            String sj = rsc.sceneJson();
            ok(sj.contains("\"here\":1") && sj.contains("\"boarded\":true") && sj.contains("\"key\":\"abc\"") && sj.contains("\"isOrigin\":true") && sj.contains("\"lineName\":\"6001\""), "탑승 장면 재료: 이름·종류·지금 위치 " + sj);
            rsc.onStep("{\"state\":{\"v\":1,\"wait\":{\"i\":1},\"eta\":{\"boarded\":false,\"nodes\":[{\"name\":\"출발\",\"isOrigin\":true},{\"name\":\"A\",\"isSub\":true,\"lineName\":\"2호선\"}]}}}");
            ok(rsc.sceneJson().contains("\"boarded\":false") && new RideCore().sceneJson().length() == 0, "승차 대기 중이면 boarded:false · 상태가 없으면 빈 글");
            HcardsCore hs = new HcardsCore(); HomeCore.Env en2 = new HomeCore.Env(); en2.nowMs = 1000000L; en2.tzoMin = -540;
            String k0 = hs.key(1, "fast", 60000L, 0, ""); hs.rideScene = sj;
            ok(hs.request(18, "dark", en2, "null", "[]").contains("\"rd\":{\"here\":1") && !k0.equals(hs.key(1, "fast", 60000L, 0, "")), "홈 카드 요청에 탑승 재료(rd)가 실리고 열쇠가 바뀐다");
            String sv = rc.save(10000L);
            RideCore back = RideCore.restore(sv, 10000L + 60000L);
            ok(back != null && back.hasState() && back.text.equals(rc.text) && RideCore.restore(sv, 10000L + RideCore.MAX_AGE_MS + 1) == null && RideCore.restore("", 1L) == null && RideCore.restore("{\"at\":1}", 5L) == null, "저장 · 복원(30분 지나면 버린다)");
            {   // s222: 긴 경로의 탑승 상태(1만 자 넘음)도 저장 · 복원된다 — 예전엔 8천 자 한도에 걸려 '저장본 없음'으로 읽혀 탑승 안내 서비스가 바로 끝났다
                StringBuilder big = new StringBuilder("{\"ok\":true,\"state\":{\"v\":1,\"tripSig\":\"x\",\"eta\":{\"nodes\":[");
                for (int bi = 0; bi < 120; bi++) { if (bi > 0) big.append(','); big.append("{\"name\":\"역").append(bi).append("\",\"isSub\":true,\"lineName\":\"수인분당선\",\"planMin\":").append(700 + bi).append('}'); }
                big.append("]}}}");
                RideCore bgc = new RideCore(); String berr = bgc.onStart(big.toString());
                String bsv = bgc.save(5000L);
                ok(berr.length() == 0 && bsv.length() > 8000 && RideCore.restore(bsv, 5000L + 1000L) != null && RideCore.restore(bsv, 5000L + 1000L).hasState(), "긴 탑승 상태(" + bsv.length() + "자)도 저장·복원 " + berr);
            }
            ok(RideCore.vibPattern(null).length == 2 && RideCore.vibPattern(java.util.Arrays.asList(Double.valueOf(5000.0), Double.valueOf(-5.0)))[1] == 1000L && RideCore.vibPattern(java.util.Arrays.asList(Double.valueOf(5000.0), Double.valueOf(-5.0)))[2] == 0L, "진동 무늬 안전 범위");
            HcardsCore hcc = new HcardsCore();
            HomeCore.Env en = new HomeCore.Env(); en.nowMs = 1000000L; en.tzoMin = -540;
            ok(hcc.ensureNext(1000L) && hcc.aiNextAt == 1000L + HcardsCore.AI_EVERY_MS && !hcc.ensureNext(2000L), "AI 갱신 시각: 없을 때만 새로 정한다");
            String rq3 = hcc.request(18, "dark", en, "null", "[]");
            ok(rq3.contains("\"gps\":null") && rq3.contains("\"r\":null") && rq3.contains("\"tz\":540") && rq3.contains("\"nextAt\":" + hcc.aiNextAt) && rq3.contains("\"tk\":{\"m\":[],\"fold\":0,\"tzo\":-540}"), "홈 카드 요청: 사실만 싣는다");
            hcc.setFix(37.5, 127.0, 5L);
            ok(hcc.request(18, "pastel", en, "{\"a\":1}", "[[\"하늘\",\"안녕\",1,0]]").contains("\"gps\":[37.5,127.0]") && hcc.request(18, "pastel", en, "{\"a\":1}", "[]").contains("\"r\":{\"a\":1}"), "위치·경로 사실");
            String k1 = hcc.key(1, "fast", 60000L, 3, "3:99"); hcc.refreshAi(70000L);
            ok(!k1.equals(hcc.key(1, "fast", 60000L, 3, "3:99")) && hcc.key(1, "fast", 60000L, 3, "3:99").equals(hcc.key(1, "fast", 61000L, 3, "3:99")), "열쇠: 새로고침하면 바뀌고 같은 분이면 같다");
            ok(hcc.act("share.loc", null) == HcardsCore.R_SHARE, "눌림: 내 위치 공유");
            // s216: 현위치 동 이름(경로 없이 브리핑을 '○○동 일대'로 연다)
            {
                HcardsCore hd = new HcardsCore();
                ok(hd.dongNow().length() == 0 && !hd.request(18, "dark", en, "null", "[]").contains("\"dong\""), "동 이름: 처음엔 요청에 싣지 않는다");
                hd.setFix(37.4979, 127.0276, 5L);
                int rv = hd.rev;
                ok(hd.setDong("역삼동", 37.4979, 127.0276) && hd.rev == rv + 1 && !hd.setDong("역삼동", 37.4979, 127.0276) && hd.rev == rv + 1 && !hd.setDong("", 1, 1), "동 이름: 바뀔 때만 rev 가 오른다 · 빈 이름은 받지 않는다");
                ok(hd.request(18, "dark", en, "null", "[]").contains("\"dong\":\"역삼동\"") && "역삼동".equals(hd.dongNow()), "동 이름: 같은 곳이면 요청에 싣는다");
                hd.setFix(37.52, 127.0276, 6L);
                ok(hd.dongNow().length() == 0 && !hd.request(18, "dark", en, "null", "[]").contains("\"dong\""), "동 이름: 300m 넘게 옮기면 옛 이름은 싣지 않는다");
                String dsv = hd.dongSaved();
                HcardsCore h2 = new HcardsCore(); h2.dongLoad(dsv);
                ok(dsv.endsWith(",역삼동") && h2.dongNow().length() == 0, "동 이름 저장: 위치(fix)가 없으면 쓰지 않는다");
                h2.setFix(37.4981, 127.0279, 1L); h2.dongLoad(dsv);
                HcardsCore h3 = new HcardsCore(); h3.setFix(37.60, 127.10, 1L); h3.dongLoad(dsv);
                ok("역삼동".equals(h2.dongNow()) && h3.dongNow().length() == 0 && new HcardsCore().dongSaved().length() == 0, "동 이름 저장: 같은 곳에서만 되살린다");
                String du = HcardsCore.dongUrl("https://x.workers.dev", 37.49791, 127.02761);
                ok(du.startsWith("https://x.workers.dev/kakao-local?path=geo%2Fcoord2regioncode.json&qs=") && du.endsWith("x%3D127.028%26y%3D37.498"), "동 이름 주소: 서버 캐시 격자(소수 3자리): " + du);
                String kb = "{\"meta\":{\"total_count\":2},\"documents\":[{\"region_type\":\"B\",\"region_2depth_name\":\"강남구\",\"region_3depth_name\":\"역삼동\"},{\"region_type\":\"H\",\"region_2depth_name\":\"강남구\",\"region_3depth_name\":\"역삼1동\"}]}";
                ok("역삼1동".equals(HcardsCore.parseDong(kb)), "동 이름 읽기: 행정동(H) 먼저");
                ok("역삼동".equals(HcardsCore.parseDong("{\"documents\":[{\"region_type\":\"B\",\"region_3depth_name\":\"역삼동\"}]}")) && "강남구".equals(HcardsCore.parseDong("{\"documents\":[{\"region_type\":\"H\",\"region_2depth_name\":\"강남구\",\"region_3depth_name\":\"\"}]}")), "동 이름 읽기: 법정동 · 구 이름으로 대신");
                ok(HcardsCore.parseDong("").length() == 0 && HcardsCore.parseDong("<html>").length() == 0 && HcardsCore.parseDong("{\"documents\":[]}").length() == 0 && HcardsCore.parseDong(null).length() == 0, "동 이름 읽기: 못 읽으면 빈 글");
            }
            // s216: 화면 글 안의 그림 주소(쇼핑 미리 받기)
            {
                String imgj = "{\"body\":[{\"t\":\"grid\",\"items\":[{\"t\":\"card\",\"name\":\"a\",\"img\":\"https://i.example.com/1.jpg\"},{\"t\":\"card\",\"name\":\"b\",\"img\":\"https://i.example.com/2.jpg\"},{\"t\":\"card\",\"name\":\"c\",\"img\":\"https://i.example.com/1.jpg\"},{\"t\":\"card\",\"name\":\"d\",\"img\":\"javascript:alert(1)\"},{\"t\":\"card\",\"name\":\"e\"}]}]}";
                java.util.List<String> iu = ScreenCore.imageUrls(imgj, 10);
                ok(iu.size() == 2 && iu.get(0).endsWith("/1.jpg") && iu.get(1).endsWith("/2.jpg"), "그림 주소: 중복 · 이상한 주소 · 없는 칸은 뺀다: " + iu);
                ok(ScreenCore.imageUrls(imgj, 1).size() == 1 && ScreenCore.imageUrls("깨짐", 5).isEmpty() && ScreenCore.imageUrls(null, 5).isEmpty() && ScreenCore.imageUrls("{\"x\":1}", 5).isEmpty(), "그림 주소: 개수 제한 · 깨진 글 · 그림 없음");
            }
            String ks0 = hcc.key(1, "fast", 60000L, 0, ""); hcc.share = true;
            ok(hcc.request(18, "dark", en, "null", "[]").contains(",\"sh\":1") && !ks0.equals(hcc.key(1, "fast", 60000L, 0, "")), "공유 재료가 있으면 요청에 sh=1 이 실리고 열쇠가 바뀐다");
            hcc.share = false;
            ShareCore.Share shr = ShareCore.parse("{\"text\":\"임학 - 계양 - 아라 (도착예정시간: 07시10분)\\n[남은시간: 00시14분]\",\"from\":\"임학\",\"cur\":\"계양\",\"to\":\"아라\",\"arr\":\"07:10\",\"rem\":\"14분\",\"foot\":\"다음 역 경인교대 이동 중 · 4개 역 남음\",\"lb\":{\"t\":\"글머리\",\"a\":\"도착: \",\"r\":\"남음 \"},\"stations\":[{\"n\":\"임학\",\"t\":\"06:50\"},{\"n\":\"박촌\",\"t\":\"06:53\"},{\"n\":\"계양\",\"t\":\"06:56\"},{\"n\":\"경인교대\",\"t\":\"06:59\"},{\"n\":\"작전\",\"t\":\"07:02\"},{\"n\":\"갈산\",\"t\":\"07:05\"},{\"n\":\"아라\",\"t\":\"07:10\"}],\"hit\":2,\"moving\":true,\"left\":4,\"next\":\"경인교대\"}");
            ok(shr != null && shr.names.size() == 7 && shr.hit == 2 && shr.left == 4 && shr.text.startsWith("임학 - 계양") && "다음 역 경인교대 이동 중 · 4개 역 남음".equals(ShareCore.footer(shr)), "위치 공유 재료를 읽는다");
            ok("글머리".equals(shr.lbT) && "도착: ".equals(shr.lbA) && "남음 ".equals(shr.lbR) && ShareCore.parse("{\"text\":\"a\",\"stations\":[{\"n\":\"가\"}]}").foot.length() == 0, "s207: 그림 아래 한 줄·글머리는 엔진 글을 그대로(없으면 비어 있다 — 앱이 글을 짓지 않는다)");
            ok(java.util.Arrays.equals(ShareCore.slots(7, 2), new int[] { 0, 1, 2, 3, -2, 6 }) && java.util.Arrays.equals(ShareCore.slots(3, 1), new int[] { 0, 1, 2 }) && ShareCore.slots(0, 0).length == 0, "그림 칸: 출발·앞뒤·도착만 남기고 사이는 건너뛴 역 수");
            OvCore.Ov ovv = OvCore.fromMap(ScreenCore.parse("{\"active\":true,\"line1\":\"계양 ▸ 경인교대\",\"pill\":\"경인교대 (이동중)\",\"cur\":2,\"base\":0,\"alert\":2,\"alertAt\":5,\"moving\":true,\"pre\":true,\"banner\":\"아라까지 2정거장\",\"line2\":\"남은시간: 00시간 14분\",\"theme\":{\"bg\":\"#ffffff\",\"fg\":\"#1a2533\",\"sub\":\"#6b8299\"},\"rs\":{\"st\":\"board\",\"end\":true,\"bt\":\"안내 종료\",\"k\":\"도착\"},\"cells\":[{\"n\":\"임학\",\"t\":\"06:50\",\"dk\":2,\"rc\":\"#0052a4\",\"dc\":\"#0052a4\",\"g\":\"1호선\"},{\"n\":\"박촌\",\"t\":\"06:53\",\"lc\":\"#0052a4\",\"rc\":\"#0052a4\"},{\"n\":\"계양\",\"t\":\"06:56\",\"lc\":\"#0052a4\",\"gp\":true,\"g\":\"↔ 공항\",\"gc\":\"#0090d2\"}]}"));
            ok(ovv.active && ovv.alert == 2 && ovv.cur == 2 && ovv.cells.length == 3 && ovv.moving && ovv.pre && ovv.hasTheme && ovv.bg == 0xFFFFFFFF && ovv.fg == 0xFF1A2533 && OvCore.arrived(ovv), "오버레이 값을 읽는다(칸 · 색 · 경고 · 도착 줄)");
            ok(!ovv.cells[0].hasL && ovv.cells[0].hasR && ovv.cells[0].dk == 2 && ovv.cells[0].dc == 0xFF0052A4 && ovv.cells[1].hasL && ovv.cells[1].hasR && ovv.cells[2].pill && ovv.cells[2].gc == 0xFF0090D2 && ovv.cells[1].dk == 1, "칸: 선 · 점 모양 · 배지 색");
            ok(OvCore.color("#fff", 7) == 0xFFFFFFFF && OvCore.color("#80ff0000", 7) == 0x80FF0000 && OvCore.color("red", 7) == 7 && OvCore.color(null, 7) == 7 && OvCore.color("#zzz", 7) == 7, "색 읽기: #rgb · #rrggbb · #aarrggbb, 못 읽으면 기본");
            ok(OvCore.centerPos(10, 0, 30) == 8f && OvCore.centerPos(0, 0, 30) == 0f && OvCore.centerPos(29, 0, 30) == 25f && OvCore.centerPos(1, 0, 3) == 0f && OvCore.centerPos(3, 100, 20) == 101f && OvCore.clampPos(-4f, 0, 30) == 0f, "다섯 칸 창: 현위치가 가운데 · 가장자리에서 멈춘다");
            ok("경인교대 (이동중)".equals(OvCore.pillText(ovv)) && OvCore.spinMs(1) < OvCore.spinMs(2) && OvCore.spinMs(0) == 0L && !OvCore.fromMap(null).active && !OvCore.fromMap(ScreenCore.parse("{\"active\":true}")).active, "알약 글 · 경고 테두리 속도 · 빈 값");
            OvCore.Ov ovp = OvCore.fromMap(ScreenCore.parse("{\"active\":true,\"line1\":\"계양 ▸ 경인교대\",\"pill\":\"경인교대(이동중)\",\"pillTxt\":\"경인교대(이동중) · 13:03 도착\",\"alert\":1,\"alertAt\":1700,\"alertVibe\":true}"));
            ok(ovp.alertVibe && ovp.alertAt == 1700L && "경인교대(이동중) · 13:03 도착".equals(OvCore.pillText(ovp)) && !OvCore.fromMap(ScreenCore.parse("{\"active\":true,\"line1\":\"a\",\"alert\":1}")).alertVibe && OvCore.spinMs(1) == 1100L && OvCore.spinMs(2) == 6000L, "s198: 알약 글(pillTxt)·진동 신호(alertVibe)는 엔진 값 그대로 · 테두리 1.1초/6초");
            ok(OvCore.glow(0.50, 0.50) == 1d && OvCore.glow(0.40, 0.50) > 0d && OvCore.glow(0.40, 0.50) < 1d && OvCore.glow(0.60, 0.50) == 0d && OvCore.glow(0.10, 0.50) == 0d && OvCore.glow(0.95, 0.05) > 0d
                && OvCore.ringAlpha(0.9, 0.1) >= OvCore.GLOW_BASE && OvCore.ringAlpha(0.5, 0.5) == 1d && OvCore.ringAlpha(0.8, 0.5) == OvCore.GLOW_BASE, "s237: 테두리 빛 — 머리에서 가장 밝고 꼬리로 갈수록 옅어지며(한 바퀴를 넘어 이어짐) 머리 앞은 옅은 둘레만");
            ok(!OvCore.arrived(OvCore.fromMap(ScreenCore.parse("{\"active\":true,\"line1\":\"a\",\"rs\":{\"st\":\"board\",\"bt\":\"탑승\",\"k\":\"S0 12:52 출발\",\"nm\":\"S0\"}}"))) && OvCore.fromMap(ScreenCore.parse("{\"active\":true,\"line1\":\"a\",\"rs\":{\"st\":\"undo\",\"bt\":\"되돌리기\"}}")).rsSt.equals("undo"), "탑승 줄은 도착 줄이 아니다(탑승 단추 ≠ 안내 종료)");
            {   // s143: 앱 탑승 시트 — 엔진 값 읽기 · 칸 · 눌림 · 쓸기
                OvCore.Ov rb = OvCore.fromMap(ScreenCore.parse("{\"active\":true,\"line1\":\"a\",\"rs\":{\"st\":\"board\",\"bt\":\"환승완료\",\"k\":\"T0 12:59 출발\",\"nm\":\"T0역\",\"kick\":\"2분 안에 도착 · 12:59\",\"mode\":\"sub\",\"chip\":\"2호선\",\"cbg\":\"#00a84d\",\"cfg\":\"#ffffff\",\"bar\":0.5,\"x\":1,\"late\":false}}"));
                ok(rb.rsKick.startsWith("2분") && rb.rsMode.equals("sub") && rb.rsChip.equals("2호선") && rb.rsCbg == 0xFF00A84D && rb.rsCfg == 0xFFFFFFFF && Math.abs(rb.rsBar - 0.5f) < 1e-6f && rb.rsX && !rb.rsLate, "탑승 시트 값(kick · 노선 글 · 색 · 막대 · 환승 구간)을 엔진 JSON 에서 읽는다");
                OvCore.Ov rw = OvCore.fromMap(ScreenCore.parse("{\"active\":true,\"line1\":\"a\",\"rs\":{\"st\":\"wait\",\"bt\":\"탑승\",\"chip\":\"150번\",\"mode\":\"bus\"}}"));
                OvCore.Ov ru = OvCore.fromMap(ScreenCore.parse("{\"active\":true,\"line1\":\"a\",\"rs\":{\"st\":\"undo\",\"bt\":\"되돌리기\",\"k\":\"탑승으로 기록했어요\"}}"));
                OvCore.Ov rh = OvCore.fromMap(ScreenCore.parse("{\"active\":true,\"line1\":\"a\",\"rs\":{\"st\":\"hidden\"}}"));
                OvCore.Ov re = OvCore.fromMap(ScreenCore.parse("{\"active\":true,\"line1\":\"a\",\"rs\":{\"st\":\"board\",\"end\":true,\"bt\":\"안내 종료\"}}"));
                ok(RsCore.heightDp(rb) == RsCore.H_BOARD && RsCore.heightDp(ru) == RsCore.H_UNDO && RsCore.heightDp(rw) == RsCore.H_PILL && RsCore.heightDp(rh) == 0 && RsCore.heightDp(re) == 0 && RsCore.heightDp(null) == 0, "시트 높이: 올라온 83 · 되돌리기 53 · 알약 52 · 숨김/도착 줄은 0(도착은 앱에 따로 있다)");
                float[] bb = RsCore.btn(rb, 360f);
                ok(Math.abs(bb[0] + bb[2] - 344f) < 0.01f && bb[2] == RsCore.btnW("환승완료") && RsCore.btnW("탑승") == 92f && "press".equals(RsCore.tap(rb, bb[0] + 5f, bb[1] + 5f, 360f, 0f)) && RsCore.tap(rb, 20f, 50f, 360f, 0f) == null, "[환승완료] 단추는 오른쪽 여백 16 · 누르면 press · 다른 곳은 무반응");
                float[] ub = RsCore.undoBtn(360f, 120f);
                float[] uc = RsCore.undoCap(360f, 120f);
                ok("undo".equals(RsCore.tap(ru, ub[0] + 3f, ub[1] + 3f, 360f, 120f)) && ub[3] == 39f && Math.abs(uc[0] * 2f + uc[2] - 360f) < 0.01f && RsCore.tap(ru, uc[0] + 4f, 20f, 360f, 120f) == null && RsCore.btnW("환승완료") == 98f, "기록 직후엔 [되돌리기] 가 undo · 캡슐은 가운데 정렬 · 안내 글 쪽은 무반응");
                ok(RsCore.heightDp(rb, true) == 83 && RsCore.heightDp(rb, false) == 0 && RsCore.heightDp(rw, true) == 0 && RsCore.heightDp(rw, false) == 52 && RsCore.heightDp(ru, false) == 53 && RsCore.heightDp(ru, true) == 0, "시트 뷰는 올라온 시트만 · 떠 있는 뷰는 알약 · 되돌리기만 맡는다");
                float[] pw = RsCore.pill(360f, 50f);
                ok("pill".equals(RsCore.tap(rw, pw[0] + 4f, pw[1] + 4f, 360f, 50f)) && RsCore.tap(rw, 10f, 10f, 360f, 50f) == null && Math.abs(pw[0] + pw[2] - 346f) < 0.01f && pw[2] == 94f && pw[3] == 38f, "대기 알약을 누르면 pill (오른쪽 14 · 높이 38)");
                ok("close".equals(RsCore.swipe(rb, 5f, 60f)) && RsCore.swipe(rb, 5f, 20f) == null && RsCore.swipe(rb, 80f, 60f) == null && "open".equals(RsCore.swipe(rw, 3f, -40f)) && RsCore.swipe(rw, 3f, -10f) == null && RsCore.swipe(ru, 0f, 90f) == null, "올라온 시트는 아래로 쓸면 close · 알약은 위로 쓸면 open · 짧거나 비스듬하면 무반응");
                ok("open".equals(RsCore.tabSwipe(rw, 3f, -40f)) && "open".equals(RsCore.tabSwipe(null, 0f, -50f)) && RsCore.tabSwipe(rb, 0f, -50f) == null && "close".equals(RsCore.tabSwipe(rb, 5f, 60f)) && RsCore.tabSwipe(rw, 5f, 60f) == null && RsCore.tabSwipe(null, 0f, 60f) == null && RsCore.tabSwipe(rw, 60f, -40f) == null && RsCore.tabSwipe(rw, 0f, -10f) == null, "하단 탭 막대: 위로 쓸면 open(시트가 올라와 있으면 무반응) · 올라온 시트는 아래로 쓸면 close · 짧거나 비스듬하면 무반응");

                float[] af = new float[20];
                ActRowCore.frame("push_in", 0f, 344f, 42f, 8f, af);
                ok(af[0] == 1f && Math.abs(af[3] - 168f) < 0.01f && af[10] == 1f && Math.abs(af[13] - (344f - 16f) / 3f) < 0.01f && af[15] == 0f, "버튼 줄: 밀고 들어옴 시작 = 두 칸 폭(반씩) · 새 칸은 오른쪽 끝");
                ActRowCore.frame("push_in", 1f, 344f, 42f, 8f, af);
                float w3 = (344f - 16f) / 3f;
                ok(Math.abs(af[3] - w3) < 0.01f && Math.abs(af[6] - (w3 + 8f)) < 0.01f && Math.abs(af[11] - 2f * (w3 + 8f)) < 0.01f && Math.abs(af[13] - w3) < 0.01f, "버튼 줄: 밀고 들어옴 끝 = 세 칸 같은 폭");
                ActRowCore.frame("slide_down", 0.5f, 344f, 42f, 8f, af);
                ok(af[10] == 1f && Math.abs(af[12] - (-21f)) < 0.01f && af[15] == 1f && Math.abs(af[17] - 21f) < 0.01f && af[5] == 1f, "버튼 줄: 위에서 내려오며 옛 칸을 아래로 민다");
                ActRowCore.frame("slide_up", 0.5f, 344f, 42f, 8f, af);
                ok(Math.abs(af[12] - 21f) < 0.01f && Math.abs(af[17] - (-21f)) < 0.01f, "버튼 줄: 아래에서 올라오며 옛 칸을 위로 민다");
                float[] ez = { 0.2f, 0f, 0f, 1f };
                ok(ActRowCore.ease(0f, ez) == 0f && ActRowCore.ease(1f, ez) == 1f && ActRowCore.ease(0.5f, ez) > 0.5f && ActRowCore.ease(0.25f, ez) < ActRowCore.ease(0.5f, ez), "버튼 줄: 곡선은 0→1, 앞에서 빠르게(CSS cubic-bezier 와 같은 식)");
                ok(ActRowCore.fresh(1000L, 1500L) && ActRowCore.fresh(1000L, 3000L) && !ActRowCore.fresh(1000L, 5000L) && !ActRowCore.fresh(0L, 100L) && ActRowCore.fresh(1000L, 0L) && !ActRowCore.fresh(10000L, 0L), "버튼 줄: 방금 일어난 전환만 그린다");
                ok(RsCore.barFill(rb, 328f) == 164f && RsCore.barFill(rw, 328f) == 0f, "막대 채움 너비");
            }
            OvCore.Ov rr = OvCore.fromMap(ScreenCore.parse("{\"active\":true,\"line1\":\"a\",\"reco\":{\"on\":true,\"ch\":\"dudung\",\"a\":\"맛있는집\",\"b\":\"점심 한 끼\",\"m\":\"120m\",\"go\":\"쿠팡 보기\",\"ok\":\"확인\",\"at\":77},\"getoff\":{\"on\":false}}"));
            ok(rr.row.kind == 1 && rr.row.ch.equals("dudung") && rr.row.a.equals("맛있는집") && rr.row.go.equals("쿠팡 보기") && rr.row.ok.equals("확인") && rr.row.at == 77L && rr.row.m.equals("120m"), "추천 줄을 읽는다");
            OvCore.Ov gg = OvCore.fromMap(ScreenCore.parse("{\"active\":true,\"line1\":\"a\",\"reco\":{\"on\":true,\"a\":\"x\"},\"getoff\":{\"on\":true,\"ch\":\"hack/../x\",\"a\":\"내릴 준비를 해주세요\",\"b\":\"수고했어요\",\"end\":\"앱 종료\",\"at\":9}}"));
            ok(gg.row.kind == 2 && gg.row.ch.isEmpty() && gg.row.end.equals("앱 종료") && gg.row.at == 9L && gg.row.b.equals("수고했어요"), "내릴 준비 줄이 추천보다 먼저 · 캐릭터 이름은 정해진 여섯 가지만");
            ok(OvCore.fromMap(ScreenCore.parse("{\"active\":true,\"line1\":\"a\",\"reco\":{\"on\":false,\"a\":\"x\"},\"getoff\":{\"on\":false}}")).row.kind == 0, "꺼진 줄은 없다");
            RideCore.RecoAd ad1 = RideCore.recoAd("{\"ok\":true,\"ad\":{\"k\":\"shop\",\"a\":\"휴대용 선풍기\",\"b\":\"여름 필수\",\"m\":\"\"},\"shopItem\":{\"n\":\"x\",\"u\":\"https://link.coupang.com/a/abc\"}}");
            RideCore.RecoAd ad2 = RideCore.recoAd("{\"ok\":true,\"ad\":{\"k\":\"place\",\"a\":\"맛있는집\",\"b\":\"한식\",\"m\":\"120m\"},\"shopItem\":{\"u\":\"http://evil\"}}");
            ok(ad1 != null && ad1.go.equals("쿠팡 보기") && ad1.url.equals("https://link.coupang.com/a/abc") && ad2 != null && ad2.go.equals("맛집 보기") && ad2.url.isEmpty() && RideCore.recoAd("{\"ok\":true}") == null && RideCore.recoAd("x") == null, "추천 줄(ad) 읽기: 쿠팡은 https 주소만");
            {
                RideCore rcx = new RideCore();
                ok(!rcx.stepBody(1L).contains("\"rc\"") && !rcx.stepBody(1L).contains("\"act\"") && !rcx.stepBody(1L).contains("rcDis"), "평소 요청엔 새 입력이 없다");
                rcx.setRecoAd(ad2); rcx.queueAct("press"); rcx.dismissReco(5L); rcx.queueAct("hack");
                String sbx = rcx.stepBody(2L);
                ok(sbx.contains("\"rc\":{\"a\":\"맛있는집\",\"b\":\"한식\",\"m\":\"120m\",\"go\":\"맛집 보기\"}") && sbx.contains("\"rcDis\":5") && sbx.contains("\"act\":\"press\"") && rcx.lastRecoAd() == ad2, "추천 줄 · 닫기 · 탑승 손짓을 다음 요청에 싣는다(모르는 손짓은 버린다)");
                ok(sbx.contains("\"act\":\"press\"") && rcx.stepBody(3L).contains("\"act\":\"press\""), "응답을 받기 전엔 계속 싣는다");
            }
            ok(FoodCore.kakaoIdLink("{\"ok\":true,\"id\":\"44\",\"app\":\"kakaomap://place?id=44\",\"web\":\"https://place.map.kakao.com/44\"}")[0].equals("kakaomap://place?id=44") && FoodCore.kakaoIdLink("{\"ok\":true,\"id\":null,\"app\":\"\",\"web\":\"\"}") == null && FoodCore.kakaoIdLink("{\"ok\":true,\"app\":\"intent://x\",\"web\":\"https://place.map.kakao.com/1\"}") == null && FoodCore.kakaoIdLink("x") == null, "카카오 장소 주소 응답 읽기(카카오맵 주소만 연다)");
            OvCore.Ov pl = OvCore.plain(true, "A ▸ B", "14분", "곧 내려요", 1);
            ok(pl.active && pl.alert == 1 && !OvCore.hasStrip(pl) && !OvCore.plain(false, "x", "", "", 0).active, "줄 글만 있는 막대(개발자 도구)");
            ok(ShareCore.parse("{\"text\":\"x\"}") == null && ShareCore.parse("garbage") == null && ShareCore.fromMap(null) == null, "모양이 안 맞는 공유 재료는 버린다");
            ok(hcc.act("ai.refresh", null) == HcardsCore.R_AI && hcc.act("tk.open", null) == HcardsCore.R_TALK_OPEN && hcc.act("tk.send", "  ") == HcardsCore.R_NONE && hcc.act("tk.send", " 안녕하세요 ") == HcardsCore.R_TALK_SEND && "안녕하세요".equals(hcc.sendText), "눌림: 새로고침 · 대화 열기 · 보내기(빈 글은 무시)");
        }
        HomeCore hm = new HomeCore();
        hm.setStation(HomeCore.START, "강남", "2호선", 37.4979, 127.0276);
        ok(!hm.bothSet() && "강남".equals(hm.text[HomeCore.START]) && "subway".equals(hm.loc[HomeCore.START].type), "노선도에서 출발역 정하기");
        hm.setStation(HomeCore.DEST, "홍대입구", "2호선", 37.557, 126.924);
        ok(hm.bothSet(), "도착역까지 정하면 경로를 찾을 수 있다");
        hm.setStation(HomeCore.START, "사당", "2호선", 37.476, 126.981);
        ok(!hm.bothSet() && hm.text[HomeCore.DEST].isEmpty(), "출발역을 다시 고르면 도착역은 비운다(웹과 같다)");

        {   // SWR: 켤 때 모든 탭의 마지막 화면을 미리 읽는 열쇠 목록
            ShellCore.MemStore ws = new ShellCore.MemStore();
            java.util.List<String> wk = ShellCore.warmKeys(ws, "shop");
            ok(wk.size() > 5 && wk.get(0).equals(ShellCore.S_HDR) && wk.get(1).equals("tabs|shop") && wk.get(2).startsWith(ShellCore.S_SHOP), "미리 읽기: 머리글 → 지금 탭 → 그 탭 화면 순서");
            boolean all = true;
            for (String t : ShellCore.TABS) all &= wk.contains("tabs|" + t);
            ok(all && wk.contains(ShellCore.S_HOME) && wk.contains(ShellCore.cacheKey(ShellCore.S_FOOD, ws)) && wk.contains(ShellCore.S_CCHIPS + "|" + ShellCore.mode(ws)), "미리 읽기: 모든 탭의 탭바와 화면이 들어간다");
            ok(new java.util.HashSet<String>(wk).size() == wk.size(), "미리 읽기: 중복 없음");
            boolean disk = true;
            for (String k : wk) disk &= ShellCore.diskTtl(k) > 0L;
            ok(disk && !wk.contains(ShellCore.S_PENDING), "미리 읽기: 디스크에 두지 않는 화면은 뺀다");
            ok(ShellCore.warmKeys(ws, "zzz").get(1).equals("tabs|" + ShellCore.DEFAULT_TAB), "미리 읽기: 모르는 탭이면 기본 탭부터");
        }

        {   // 버스 도착 초 카운트다운 글자(웹 _busFmtCd)
            ok("\uACE7 \uB3C4\uCC29".equals(ScreenCore.cdFmt(0)) && "\uACE7 \uB3C4\uCC29".equals(ScreenCore.cdFmt(-3)) && "1\uCD08".equals(ScreenCore.cdFmt(1)) && "59\uCD08".equals(ScreenCore.cdFmt(59)), "카운트다운 글자: 곧 도착 · N초");
            ok("1\uBD84 00\uCD08".equals(ScreenCore.cdFmt(60)) && "2\uBD84 05\uCD08".equals(ScreenCore.cdFmt(125)) && "12\uBD84 50\uCD08".equals(ScreenCore.cdFmt(770)) && "60\uBD84 00\uCD08".equals(ScreenCore.cdFmt(3600)) && "1\uBD84 22\uCD08".equals(ScreenCore.cdFmt(81.6)), "카운트다운 글자: M분 SS초(반올림)");
        }
        {   // 버스 도착정보 미리 받기(엔진이 준 주소를 되쓴다 · 정류장/보기가 바뀌면 쓰지 않는다)
            ShellCore.MemStore sp_ms = new ShellCore.MemStore();
            MapCore sp_m = new MapCore(sp_ms); sp_m.modeOverride = "bus"; sp_m.setBusLoc(37.5, 127.0);
            ok(sp_m.speculativeNeed().isEmpty(), "미리 받기: 처음엔 기억한 주소가 없다");
            sp_m.addBusRes("tp", "<stops a/>");
            java.util.List<String[]> sp_nd = new java.util.ArrayList<String[]>();
            sp_nd.add(new String[] { "a0", "http://ws.bus.go.kr/x?1" }); sp_nd.add(new String[] { "a1", "http://ws.bus.go.kr/x?2" }); sp_nd.add(new String[] { "tp", "http://ws.bus.go.kr/s" }); sp_nd.add(new String[] { "a2", "bad\turl" });
            sp_m.rememberNeed(sp_nd);
            java.util.List<String[]> sp_sp = sp_m.speculativeNeed();
            ok(sp_sp.size() == 2 && "a0".equals(sp_sp.get(0)[0]) && "http://ws.bus.go.kr/x?2".equals(sp_sp.get(1)[1]), "미리 받기: 도착정보(a · f) 주소만 · 이상한 글자 든 것은 뺀다");
            MapCore sp_m2 = new MapCore(sp_ms); sp_m2.modeOverride = "bus"; sp_m2.setBusLoc(37.5, 127.0); sp_m2.addBusRes("tp", "<stops a/>");
            ok(sp_m2.speculativeNeed().size() == 2, "미리 받기: 앱을 껐다 켜도(기기 보관) 같은 정류장 목록이면 쓴다");
            sp_m2.addBusRes("tp", "<stops b/>");
            ok(sp_m2.speculativeNeed().isEmpty(), "미리 받기: 정류장 목록이 달라지면 쓰지 않는다(다른 정류장 도착정보가 섞이지 않게)");
            sp_m.addBusRes("tp", "<stops a/>"); sp_ms.put(MapCore.K_BUSVW, MapCore.VW_FAV);
            ok(sp_m.speculativeNeed().isEmpty(), "미리 받기: 보기(주변 → 즐겨찾기)가 바뀌면 쓰지 않는다");
            MapCore sp_m3 = new MapCore(sp_ms); sp_m3.modeOverride = "bus";
            ok(sp_m3.speculativeNeed().isEmpty(), "미리 받기: 위치가 없으면 쓰지 않는다");
        }
        {   // 주변 정류장 끌어서 순서 바꾸기(웹 busNearOrder · _busPersistDomOrder): 저장 · 요청에 실림 · 받아 둔 도착정보 번호 옮김
            ShellCore.MemStore ro_ms = new ShellCore.MemStore();
            MapCore ro_m = new MapCore(ro_ms); ro_m.modeOverride = "bus"; ro_m.setBusLoc(37.5, 127.0);
            ro_m.addBusRes("tp", "<stops a/>"); ro_m.addBusRes("a0", "AAA"); ro_m.addBusRes("a1", "BBB"); ro_m.addBusRes("a2", "CCC");
            java.util.List<String[]> ro_nd = new java.util.ArrayList<String[]>();
            ro_nd.add(new String[] { "a0", "http://ws.bus.go.kr/u0" }); ro_nd.add(new String[] { "a1", "http://ws.bus.go.kr/u1" }); ro_nd.add(new String[] { "a2", "http://ws.bus.go.kr/u2" });
            ro_m.rememberNeed(ro_nd);
            ok(ro_m.bodyRequest(18, "dark").contains("\"ord\":[]"), "순서 바꾸기: 저장 전에는 ord 가 빈 목록");
            ok(!ro_m.reorderNear(new String[] { "A", "B" }, new int[] { 0, 0 }) && !ro_m.reorderNear(new String[] { "A", "B", "C" }, new int[] { 0, 1 }) && !ro_m.reorderNear(new String[] { "A", "", "C" }, new int[] { 0, 1, 2 }), "순서 바꾸기: 번호가 겹치거나 · 길이가 다르거나 · 열쇠가 비면 거부");
            ok(ro_ms.get(MapCore.K_BUSORD, "").length() == 0, "순서 바꾸기: 거부되면 저장하지 않는다");
            ok(ro_m.reorderNear(new String[] { "C", "A", "B" }, new int[] { 2, 0, 1 }), "순서 바꾸기: 정상 순서는 받는다");
            String ro_rq = ro_m.bodyRequest(18, "dark");
            ok(ro_rq.contains("\"ord\":[\"C\",\"A\",\"B\"]") && ro_rq.contains("\"a0\":\"CCC\"") && ro_rq.contains("\"a1\":\"AAA\"") && ro_rq.contains("\"a2\":\"BBB\""), "순서 바꾸기: 새 순서를 요청에 싣고 받아 둔 도착정보 번호를 옮긴다");
            java.util.List<String[]> ro_sp = ro_m.speculativeNeed();
            ok(ro_sp.size() == 3 && "a0".equals(ro_sp.get(0)[0]) && "http://ws.bus.go.kr/u2".equals(ro_sp.get(0)[1]) && "http://ws.bus.go.kr/u0".equals(ro_sp.get(1)[1]) && "http://ws.bus.go.kr/u1".equals(ro_sp.get(2)[1]), "순서 바꾸기: 미리 받기 주소도 같은 번호로 옮긴다(다른 정류장 도착정보가 섞이지 않게)");
            MapCore ro_m2 = new MapCore(ro_ms); ro_m2.modeOverride = "bus"; ro_m2.setBusLoc(37.5, 127.0); ro_m2.addBusRes("tp", "<stops a/>");
            ok(ro_m2.bodyRequest(18, "dark").contains("\"ord\":[\"C\",\"A\",\"B\"]") && ro_m2.speculativeNeed().size() == 3, "순서 바꾸기: 앱을 껐다 켜도 순서가 남는다");
            ro_ms.put(MapCore.K_BUSORD, "깨짐");
            ok(ro_m2.bodyRequest(18, "dark").contains("\"ord\":[]"), "순서 바꾸기: 깨진 저장값은 빈 목록으로 본다");
        }
        {   // 도보 안내 시트(웹 walkModal) — 엔진이 정한 길안내 주소 · 간격을 꺼내고 눌림을 행동 코드로
            WalkCore w = new WalkCore();
            w.open("arrive", "\uAC15\uB0A8\uC5ED", 37.505, 127.004);
            String r0 = w.request(18, 1760000000000L, -540, "dark");
            ok(r0.equals("{\"cap\":18,\"f\":{\"kind\":\"walk\",\"walk\":{\"mode\":\"arrive\",\"dest\":{\"name\":\"\uAC15\uB0A8\uC5ED\",\"lat\":37.505,\"lng\":127.004},\"nowMs\":1760000000000,\"tzoMin\":-540,\"theme\":\"dark\"}}}"), "도보: 내 위치가 아직 없으면 목적지와 시각만 보낸다 " + r0);
            w.setMe(37.5, 127.0);
            String r1 = w.request(18, 1L, -540, "light");
            ok(r1.contains("\"my\":{\"lat\":37.5,\"lng\":127}") && r1.contains("\"theme\":\"light\"") && w.hasMe, "도보: 내 위치가 생기면 함께 보낸다");
            w.setMe(0, 0);
            ok(w.hasMe && w.myLat == 37.5, "도보: 위치를 못 받으면 이 시트에서 앞서 받은 위치를 그대로 둔다");
            ok(w.act("wk.close") == WalkCore.W_CLOSE && w.act("wk.kakao") == WalkCore.W_KAKAO && w.act("wk.naver") == WalkCore.W_NAVER && w.act("rd.close") == WalkCore.W_NONE && w.act(null) == WalkCore.W_NONE, "도보: 눌림 → 행동 코드");
            w.onScreen("{\"ok\":true,\"v\":1,\"screen\":\"walk\",\"head\":[],\"body\":[],\"info\":{\"nav\":{\"kakao\":[\"kakaomap://route?sp=1,2&ep=3,4&by=FOOT\",\"https://map.kakao.com/link/to/x,3,4\"],\"naver\":[\"nmap://route/walk?dlat=3&dlng=4\",\"https://map.naver.com/p/directions/-/4,3,x,,-1/walk\"]},\"msg\":\"\",\"refresh\":30000}}");
            ok(w.navKakao != null && w.navNaver != null && HomeCore.navAppOk(w.navKakao[0]) && HomeCore.navAppOk(w.navNaver[0]) && w.refreshMs == 30000L, "도보: 길안내 주소 읽기 · 앱 주소 허용(도보 길안내 포함)");
            ok(!HomeCore.navAppOk("nmap://route/walk?a b") && !HomeCore.navAppOk("nmap://route/car?x=1") && !HomeCore.navAppOk("intent://x"), "도보: 허용 목록 밖은 거절");
            w.onScreen("{\"ok\":true,\"v\":1,\"screen\":\"walk\",\"head\":[],\"body\":[],\"info\":{\"nav\":null,\"msg\":\"\uBAA9\uC801\uC9C0 \uC88C\uD45C\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4\",\"refresh\":1}}");
            ok(w.navKakao == null && w.navNaver == null && w.msg.length() > 0 && w.refreshMs == WalkCore.REFRESH_MIN_MS, "도보: 목적지 좌표가 없으면 길안내 없음 · 간격은 최소 10초로 막는다");
            w.onScreen("not json");
            ok(w.navKakao == null && w.msg.length() == 0 && w.refreshMs == WalkCore.REFRESH_DEF_MS, "도보: 엉터리 응답은 안전하게 비운다");
            w.open("zzz", null, 0, 0);
            ok("arrive".equals(w.mode) && !w.hasDest && !w.hasMe && w.request(18, 1L, 0, "dark").contains("\"dest\":{\"name\":\"\"}"), "도보: 좌표 없는 목적지는 이름만 보낸다");
        }

        // ── 디바운스 · 연타 막기 · SWR 보관함 (s132) ──
        {
            final long[] t = { 1000L };
            final java.util.List<Object[]> q = new java.util.ArrayList<Object[]>();            // {실행 시각, Runnable}
            Debounce d = new Debounce(new Debounce.Clock() {
                public long now() { return t[0]; }
                public void post(Runnable r, long ms) { q.add(new Object[] { t[0] + ms, r }); }
                public void cancel(Runnable r) { for (int i = q.size() - 1; i >= 0; i--) if (q.get(i)[1] == r) q.remove(i); }
            });
            final java.util.List<String> ran = new java.util.ArrayList<String>();
            // 시계를 ms 만큼 앞으로: 시각이 된 예약을 순서대로 실행
            class Adv { void by(long ms) { long end = t[0] + ms; while (true) { Object[] nx = null; for (Object[] e : q) if ((Long) e[0] <= end && (nx == null || (Long) e[0] < (Long) nx[0])) nx = e; if (nx == null) break; q.remove(nx); t[0] = Math.max(t[0], (Long) nx[0]); ((Runnable) nx[1]).run(); } t[0] = end; } }
            Adv adv2 = new Adv();
            d.trailing("q", 300L, new Runnable() { public void run() { ran.add("a"); } });
            adv2.by(200L);
            d.trailing("q", 300L, new Runnable() { public void run() { ran.add("b"); } });       // 200ms 뒤 또 입력 — 앞의 것은 사라진다
            adv2.by(200L);
            ok(ran.isEmpty() && d.pending("q"), "디바운스: 입력이 이어지는 동안은 실행하지 않는다");
            adv2.by(150L);
            ok(ran.size() == 1 && "b".equals(ran.get(0)) && !d.pending("q"), "디바운스: 마지막 입력 300ms 뒤 마지막 것만 한 번 실행한다");
            d.trailing("x", 300L, new Runnable() { public void run() { ran.add("x"); } });
            d.cancel("x"); adv2.by(1000L);
            ok(ran.size() == 1, "디바운스: 취소하면 실행하지 않는다");
            d.trailing("y", 300L, new Runnable() { public void run() { ran.add("y"); } });
            d.trailing("z", 300L, new Runnable() { public void run() { ran.add("z"); } });
            adv2.by(300L);
            ok(ran.size() == 3 && ran.contains("y") && ran.contains("z"), "디바운스: 다른 열쇠는 서로 영향이 없다");
            d.trailing("w", 300L, new Runnable() { public void run() { ran.add("w"); } });
            d.cancelAll(); adv2.by(1000L);
            ok(ran.size() == 3, "디바운스: cancelAll 은 기다리던 것을 모두 없앤다");
            final int[] again = { 0 };
            d.trailing("r", 100L, new Runnable() { public void run() { again[0]++; } });
            adv2.by(100L);
            ok(again[0] == 1 && !d.pending("r"), "디바운스: 실행한 뒤에는 대기 목록에서 빠진다");
            t[0] = 5000L;
            ok(d.gate("tap", 350L) && !d.gate("tap", 350L), "연타 막기: 처음만 통과한다");
            t[0] = 5200L; ok(!d.gate("tap", 350L), "연타 막기: 350ms 안의 같은 버튼은 막는다");
            t[0] = 5350L; ok(d.gate("tap", 350L), "연타 막기: 350ms 뒤에는 다시 통과한다");
            ok(d.gate("other", 350L), "연타 막기: 다른 버튼은 따로 센다");
            t[0] = 100L; ok(d.gate("tap", 350L), "연타 막기: 시계가 뒤로 가도 막히지 않는다");

            Swr sw = new Swr(2);
            sw.put("k1", "AAA", 1000L);
            ok(sw.get("k1", 1000L + 5000L, 8000L, 600000L).state == Swr.FRESH, "SWR: 신선 시간 안이면 FRESH(통신 없이 쓴다)");
            Swr.Hit swSt = sw.get("k1", 1000L + 60000L, 8000L, 600000L);
            ok(swSt.state == Swr.STALE && "AAA".equals(swSt.body), "SWR: 신선 시간이 지나도 낡은 한도 안이면 STALE(먼저 보이고 뒤에서 새로 받는다)");
            ok(sw.get("none", 2000L, 8000L, 600000L).state == Swr.MISS && sw.get("none", 2000L, 8000L, 600000L).body.length() == 0, "SWR: 없으면 MISS");
            ok(sw.get("k1", 1000L + 700000L, 8000L, 600000L).state == Swr.MISS && sw.size() == 0, "SWR: 너무 낡으면 MISS 로 보고 지운다");
            sw.put("k1", "AAA", 1000L); sw.put("k1", "", 2000L); sw.put("k1", null, 2000L);
            ok("AAA".equals(sw.get("k1", 1500L, 8000L, 600000L).body), "SWR: 빈 글을 넣어도 옛 글이 지워지지 않는다(받기 실패가 캐시를 비우지 않는다)");
            ok(sw.get("k1", 500L, 8000L, 600000L).state == Swr.MISS, "SWR: 시계가 뒤로 간 글은 믿지 않는다");
            sw.put("a", "1", 1000L); sw.put("b", "2", 1000L); sw.get("a", 1100L, 8000L, 600000L); sw.put("c", "3", 1000L);
            ok(sw.size() == 2 && sw.get("a", 1100L, 8000L, 600000L).state == Swr.FRESH && sw.get("b", 1100L, 8000L, 600000L).state == Swr.MISS, "SWR: 용량이 차면 가장 오래 안 쓴 것부터 버린다");
            sw.drop("a"); ok(sw.get("a", 1100L, 8000L, 600000L).state == Swr.MISS, "SWR: drop 하면 없어진다");

            String q1 = HomeCore.routeQuery(swLoc("강남", 37.5, 127.0), swLoc("서울역", 37.55, 126.97), 111111L, false);
            String q2 = HomeCore.routeQuery(swLoc("강남", 37.5, 127.0), swLoc("서울역", 37.55, 126.97), 222222L, false);
            ok(q1 != null && HomeCore.routeSwrKey(q1, false, 111111L).equals(HomeCore.routeSwrKey(q2, false, 222222L)), "경로 SWR 열쇠: 지금 시각만 다른 같은 출발·도착은 같은 열쇠");
            ok(!HomeCore.routeSwrKey(q1, true, 111111L).equals(HomeCore.routeSwrKey(q2, true, 222222L)), "경로 SWR 열쇠: 고른 시각이 다르면 다른 열쇠");
            ok(HomeCore.routeSwrKey(null, false, 0L) == null && !HomeCore.routeSwrKey(q1, false, 1L).contains("baseMs"), "경로 SWR 열쇠: 없으면 null · 시각 값은 들어가지 않는다");
        }

        // ── 경로 탐색 로딩 캐릭터(RunnerCore · 웹 _RC) ──
        {
            for (String id : RunnerCore.ORDER) {
                SceneModel.Spec m = SceneModel.D3.get(id); RunnerCore.Spec r = RunnerCore.spec(id);
                ok(m != null && r != null && m.fps == r.fps && m.cell == r.cell && m.base == r.base && m.ox == r.ox && m.lift == r.lift && m.intro == r.intro && m.introFps == r.introFps, "로딩 캐릭터 " + id + ": 장면 시트 규격(SceneModel.D3)과 같다");
            }
            ok(RunnerCore.spec("nope") == null && RunnerCore.spec(null) == null, "로딩 캐릭터: 모르는 이름은 규격 없음");
            boolean rpk = true;
            for (String rprev : RunnerCore.ORDER) for (double r = 0d; r < 1d; r += 0.07d) { String n = RunnerCore.pick(rprev, r); if (n.equals(rprev) || RunnerCore.spec(n) == null) rpk = false; }
            ok(rpk && RunnerCore.pick("", 0.0).equals("dolsom") && RunnerCore.pick("dolsom", 0.0).equals("lovel") && RunnerCore.pick("dolsom", 5d).equals("chaeng") && RunnerCore.pick("dolsom", -1d).equals("lovel"), "로딩 캐릭터: 방금 나온 것은 다시 안 뽑고, 범위 밖 값도 안전하다");
            RunnerCore.Frame rf0 = RunnerCore.at("dolsom", 0L, 236f), rf1 = RunnerCore.at("dolsom", 1350L, 236f), rf2 = RunnerCore.at("dolsom", 2700L, 236f);
            ok(!rf0.done && rf0.x < 0f && rf0.idx == 0 && !rf1.done && rf1.x > 0f && rf1.x < 236f && rf2.done, "로딩 캐릭터: 왼쪽 밖에서 시작해 가로지르고 끝나면 done");
            ok(RunnerCore.at("dolsom", 500L, 236f).idx == (int) (Math.floor(0.5d * 19d) % 16) && RunnerCore.at("dolsom", 100000L, 236f).idx < 16 && RunnerCore.at("dolsom", -50L, 236f).idx == 0, "로딩 캐릭터: 프레임은 fps 로 돌고 0~15 안");
            RunnerCore.Frame rd0 = RunnerCore.at("dudung", 0L, 236f), rd1 = RunnerCore.at("dudung", 500L, 236f), rd2 = RunnerCore.at("dudung", 1100L, 236f);
            ok(rd0.intro && rd0.idx == 0 && rd1.intro && rd1.idx == 7 && !rd2.intro && rd2.x > rd1.x - 0.001f && rd1.x == rd0.x, "로딩 캐릭터: 두덩은 제자리에서 솟은 뒤 걸어 나간다");
            ok(RunnerCore.at("zzz", 0L, 236f).done, "로딩 캐릭터: 모르는 이름은 곧장 done");
            ok(RunnerCore.wheelPhase(0L) == 0f && Math.abs(RunnerCore.wheelRot(650L) - 540f) < 0.01f && Math.abs(RunnerCore.wheelX(0L, 150f) + 24f) < 0.001f && RunnerCore.wheelPhase(1300L) == 0f, "로딩 바퀴: 1.3초에 한 바퀴 · 1080도");
            ok(RunnerCore.dotAlpha(0L, 0) == 0f && Math.abs(RunnerCore.dotAlpha(560L, 0) - 1f) < 0.001f && RunnerCore.dotAlpha(1200L, 0) == 0f && RunnerCore.dotAlpha(100L, 1) == 0f && RunnerCore.dotAlpha(760L, 1) > 0.99f && Math.abs(RunnerCore.dotAlpha(280L, 0) - 0.5f) < 0.001f, "로딩 점: 0.2초씩 늦게 켜졌다 꺼진다");
        }

        System.out.println(fails == 0 ? "ALL OK " + oks : "FAILED " + fails + " / " + (oks + fails));
        if (fails > 0) System.exit(1);
    }
}

package com.dullyyj.subway;

import java.util.HashMap;
import java.util.Map;

/** ShellCore(네이티브 껍데기의 순수 계산) 시험 — 안드로이드 없이 JVM. 사용: java ShellJvmTest */
public class ShellJvmTest {
    static int fails = 0, oks = 0;
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

        // ── 탭 ──
        ok("home".equals(ShellCore.currentTab(st)), "처음엔 홈 탭");
        st.put("tab", "bogus");
        ok("home".equals(ShellCore.currentTab(st)), "모르는 탭 이름은 홈으로");
        ok(ShellCore.tabsBody("map").equals("{\"cap\":18,\"f\":{\"tab\":\"map\"}}"), "탭 막대 요청 본문");
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
                ok(ErrCore.count(es) == 0 && ErrCore.copyText(es).equals("(오류 없음)") && ErrCore.pageFacts(es).equals("{\"pf\":{\"nat\":true,\"nv\":true,\"errs\":[]}}"), "오류 로그: 처음엔 비어 있다");
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

        // ── 예전 값들: 아이디 · 포인트 · 출퇴근 브리핑(앱 본체 저장소 kv · localStorage 파일) ──
        {
            String kv = "{\"mk_favorites\":\"[{\\\"s\\\":\\\"A\\\",\\\"d\\\":\\\"B\\\"}]\",\"mk_comm_id\":\"\\\"홍길동_1\\\"\",\"mk_pt\":\"{\\\"total\\\":120,\\\"today\\\":5,\\\"today_str\\\":\\\"Wed Oct 21 2026\\\"}\",\"mk_pts\":\"{\\\"total\\\":150,\\\"date\\\":\\\"x\\\"}\","
                + "\"commuteAlarm\":\"{\\\"on\\\":true,\\\"morn\\\":\\\"08:10\\\",\\\"eve\\\":\\\"19:00\\\",\\\"from\\\":\\\"인하대\\\",\\\"to\\\":\\\"강남\\\",\\\"days\\\":[1,3,9],\\\"eFrom\\\":\\\"정류장Z\\\",\\\"eFromLat\\\":37.1,\\\"eFromLng\\\":127.2,\\\"eFromBus\\\":true,\\\"lastKey\\\":\\\"k\\\"}\"}";
            LegacyCore.Found fd = LegacyCore.find(null, kv);
            ok(fd.any() && LegacyCore.count(fd.fav) == 1 && "홍길동_1".equals(fd.id) && fd.pt.startsWith("{\"total\":150,") && fd.commute != null, "예전 값(앱 본체 저장소): 즐겨찾기 · 아이디 · 포인트(큰 쪽) · 출퇴근");
            ShellCore.MemStore ls = new ShellCore.MemStore();
            ok(LegacyCore.applyCommute(ls, fd.commute) && CmCore.on(ls) && "08:10".equals(CmCore.morn(ls)) && "19:00".equals(CmCore.eve(ls)) && CmCore.days(ls).toString().equals("[1, 3]")
               && "인하대".equals(CmCore.place(ls, "from")) && CmCore.placeJson(ls, "to").equals("{\"nm\":\"강남\"}") && CmCore.placeJson(ls, "eFrom").equals("{\"nm\":\"정류장Z\",\"lat\":37.1,\"lng\":127.2,\"bus\":true}"), "예전 출퇴근 설정 옮기기: " + ls.m);
            ok(!LegacyCore.applyCommute(new ShellCore.MemStore(), "{\"x\":1}") && !LegacyCore.applyCommute(new ShellCore.MemStore(), "망가짐") && LegacyCore.find(null, "{}").pt == null && LegacyCore.find(null, null).any() == false, "엉뚱한 값은 옮기지 않는다");
            ok(LegacyCore.idOf("\"a\"") == null && LegacyCore.idOf("\"새 이름!\"") == null && "abc".equals(LegacyCore.idOf("abc")) && LegacyCore.idOf("{\"a\":1}") == null, "아이디 규칙 검사");
            // localStorage 파일에서: 쓰기 기록 모양(UTF-16) 으로 아이디·포인트·출퇴근
            java.util.List<byte[]> files = new java.util.ArrayList<byte[]>();
            files.add(logRec("mk_comm_id", "\"길동무_7\""));
            files.add(logRec("mk_pt", "{\"total\":77,\"today\":1,\"today_str\":\"x\"}"));
            files.add(logRec("commuteAlarm", "{\"on\":false,\"morn\":\"07:00\",\"eve\":\"18:00\",\"from\":\"사당\"}"));
            LegacyCore.Found fg = LegacyCore.find(files, null);
            ok("길동무_7".equals(fg.id) && fg.pt != null && fg.pt.startsWith("{\"total\":77,") && fg.commute != null && fg.fav == null, "예전 값(localStorage 파일): 아이디 · 포인트 · 출퇴근");
            files.add(logRec("mk_pts", "{\"total\":90}"));
            ok(LegacyCore.find(files, null).pt.startsWith("{\"total\":90,"), "mk_pt 와 mk_pts 중 큰 포인트");
        }

        // ── 앱 규칙(엔진 /rules 쪽 껍데기) ──
        ShellCore.MemStore rs = new ShellCore.MemStore();
        long t0 = 1792454400000L;
        ok(RulesCore.day(t0).matches("20\\d\\d-\\d\\d-\\d\\d"), "오늘 날짜 글자: " + RulesCore.day(t0));
        String cb = RulesCore.checkBody(rs, "post", "잡담", t0, "제목", "내\"용");
        ok(cb.startsWith("{\"op\":\"check\",\"kind\":\"post\",\"cat\":\"잡담\"") && cb.contains("\"pt\":{}") && cb.endsWith("\"texts\":[\"제목\",\"내\\\"용\"]}"), "검사 요청: " + cb);
        ok("".equals(RulesCore.checkError("{\"ok\":true}")) && "".equals(RulesCore.checkError("")) && "".equals(RulesCore.checkError("<html>")), "통과 · 엔진 못 닿음 · 깨진 답은 막지 않는다");
        ok("욕설 안 돼요".equals(RulesCore.checkError("{\"ok\":false,\"msg\":\"욕설 안 돼요\"}")) && "등록할 수 없어요".equals(RulesCore.checkError("{\"ok\":false}")), "거절 문구");
        String rab = RulesCore.awardBody(rs, "report", t0, 0.25, false);
        ok(rab.contains("\"ev\":\"report\"") && rab.contains("\"rnd\":0.25") && rab.contains("\"sent\":false") && rab.contains("\"pt\":{}"), "적립 요청: " + rab);
        String msg = RulesCore.applyAward(rs, "{\"ok\":true,\"add\":10,\"msg\":\"글이 등록되었어요! +10P\",\"pt\":{\"total\":15,\"today\":15,\"todayStr\":\"2026-10-20\",\"rc\":0,\"rcStr\":\"\"}}");
        ok("글이 등록되었어요! +10P".equals(msg) && rs.get(RulesCore.K_PT, "").contains("\"total\":15") && rs.get(RulesCore.K_PT, "").contains("\"todayStr\":\"2026-10-20\""), "적립 → 문구 + 저장값: " + rs.get(RulesCore.K_PT, ""));
        ok(RulesCore.awardBody(rs, "write", t0, 0.5, true).contains("\"total\":15"), "저장값을 다음 요청에 그대로 실어 보낸다");
        ok("".equals(RulesCore.applyAward(rs, "{\"ok\":false}")) && rs.get(RulesCore.K_PT, "").contains("\"total\":15") && "".equals(RulesCore.applyAward(rs, "")), "실패하면 저장값을 건드리지 않는다");
        java.util.List<String> sec = new java.util.ArrayList<String>(); sec.add("2호선"); sec.add("수도권 1호선");
        String mb = RulesCore.mylinesBody("[{\"l\":\"2호선\",\"n\":3,\"t\":5}]", sec, t0);
        ok(mb.equals("{\"op\":\"mylines\",\"now\":1792454400000,\"my\":[{\"l\":\"2호선\",\"n\":3,\"t\":5}],\"sec\":[\"2호선\",\"수도권 1호선\"]}") && RulesCore.mylinesBody(null, null, 1L).contains("\"my\":[],\"sec\":[]"), "탄 노선 요청: " + mb);
        ok(RulesCore.applyMyLines(rs, "{\"ok\":true,\"my\":[{\"l\":\"1호선\",\"n\":1,\"t\":99}],\"lines\":[\"1호선\"]}") && rs.get(ChatCore.K_MY, "").startsWith("[{") && rs.get(ChatCore.K_MY, "").contains("\"l\":\"1호선\"") && rs.get(ChatCore.K_MY, "").contains("\"n\":1") && rs.get(ChatCore.K_MY, "").contains("\"t\":99") && !RulesCore.applyMyLines(rs, "{\"ok\":false}"), "탄 노선 기록 저장");

        // ── 설정 사실 ──
        ShellCore.MemStore s2 = new ShellCore.MemStore();
        String f = ShellCore.settingsFacts(s2);
        ok(f.equals("{\"id\":\"\",\"np\":{\"arrive\":1,\"transfer\":1,\"arrive_reco\":1},\"ovl\":0,\"sam\":0,\"samw\":0,\"cm\":0,\"errn\":0,\"pgs\":[\"sam\",\"ovl\",\"arr\",\"cm\",\"gw\",\"dev\"],\"rl\":1,\"th\":\"pastel\",\"pt\":{},\"day\":\"\"}"), "기본 기기 사실: " + f);
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
        ok("GET".equals(rq.method) && rq.url.equals("https://route-v2.phg0643.workers.dev/screen/shop?cap=18") && rq.body == null, "쇼핑 요청(분류 없음)");
        s4.put("shop_cat", "식사 & 간식");
        ok(ShellCore.request("shop", s4, new String[0]).url.endsWith("&cat=%EC%8B%9D%EC%82%AC+%26+%EA%B0%84%EC%8B%9D"), "쇼핑 분류 인코딩");
        rq = ShellCore.request("cchips", s4, null);
        ok("POST".equals(rq.method) && rq.body.equals("{\"cap\":18,\"f\":{\"mode\":\"news\"}}"), "칩 줄 요청: " + rq.body);
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
        s4.put("news_cat", "증시");
        rq = ShellCore.request("news", s4, new String[] { f0, f1 });
        ok(rq.body.startsWith("{\"cap\":18,\"f\":{\"cat\":\"증시\"},\"n\":[[") && ShellCore.netOk(rq.url), "뉴스 요청 본문");
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
        ok(ShellCore.newsDetailBody("[\"a\"]").equals("{\"cap\":18,\"d\":[\"a\"]}"), "상세 요청 본문");

        ok(ShellCore.palette("dark").length == 12 && ShellCore.palette("pastel").length == 12 && ShellCore.palette("zzz")[0] == 0xFFF0F4F8, "팔레트 12칸 · 기본은 파스텔");
        ok(ShellCore.palette("dark")[0] == 0xFF121214 && ShellCore.palette("dark")[5] == 0xFFD4AF37, "다크 배경·금색");

        // ── 홈 탭 입력 ──
        HomeCore h = new HomeCore();
        HomeCore.Env env = new HomeCore.Env(); env.nowMs = 0; env.tzoMin = -540; env.y = 2026; env.m = 9; env.d = 20;
        String hrq = h.request(env, 18);
        ok(hrq.equals("{\"cap\":18,\"f\":{\"start\":\"\",\"dest\":\"\",\"active\":\"\",\"startSet\":false,\"destSet\":false,\"gps\":false,\"base\":{\"ms\":null,\"tzo\":-540,\"today\":[2026,9,20],\"hol\":false}},\"d\":{}}"), "홈 요청 본문(빈 상태): " + hrq);
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
        // 화면 못 받음 안내 · 캐시 열쇠
        try {
            ScreenCore.Screen es0 = ScreenCore.load(ShellCore.errorScreen());
            ok("error".equals(es0.id) && es0.body.size() == 2, "오류 안내 화면은 검증을 통과한다");
        } catch (Exception ex0) { ok(false, "오류 안내 화면: " + ex0); }
        ok("map".equals(ShellCore.expectId("maph")) && "map".equals(ShellCore.expectId("mapb")) && "shop".equals(ShellCore.expectId("shop|추천")) && "tabs".equals(ShellCore.expectId("tabs|home")) && "home".equals(ShellCore.expectId("home")), "칸이 기대하는 화면 이름");
        ok(ShellCore.diskCacheable("shop") && ShellCore.diskCacheable("cchips") && !ShellCore.diskCacheable("home") && !ShellCore.diskCacheable("news") && !ShellCore.diskCacheable("mapb"), "디스크에 두는 화면은 상태 없는 것만");
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
        String pu = fd.publicUrl(2);
        ok(pu.startsWith(ShellCore.NEWS_BASE + "/tago?url=") && pu.contains("indsLclsCd%3DI2") && pu.contains("pageNo%3D2") && pu.contains("cx%3D127.0%26cy%3D37.5") && ScreenCore.netAllowed(pu), "공공데이터 주소(서버 대리)");
        ok(FoodCore.pageCount("{\"body\":{\"items\":[{\"bizesNm\":\"A\"},{\"bizesNm\":\"B\"}]}}") == 2 && FoodCore.pageCount("{\"response\":{\"body\":{\"items\":{\"bizesNm\":\"A\"}}}}") == 1 && FoodCore.pageCount("zzz") == -1 && FoodCore.pageCount("") == -1, "공공데이터 쪽 항목 수(두 가지 모양)");
        java.util.List<String> pgs = new java.util.ArrayList<String>();
        pgs.add("{\"body\":{\"items\":[{\"bizesNm\":\"공공A\",\"indsMclsNm\":\"한식\",\"indsSclsNm\":\"국밥\",\"rdnmAdr\":\"도로1\",\"lnoAdr\":\"지번1\",\"lat\":\"37.501\",\"lon\":\"127.002\",\"extra\":1}]}}");
        pgs.add("");
        FoodCore.Data fdat = FoodCore.parseData("{\"items\":[{\"n\":\"가\",\"c\":\"음식 > 한식\",\"a\":\"서울 1\",\"d\":300,\"la\":37.5,\"lo\":127.0}]}", pgs);
        ok(fdat.srvOk && fdat.srv.size() == 1 && fdat.pub.size() == 1, "원자료 읽기(서버 1 · 공공 1)");
        ok(!FoodCore.parseData("zzz", new java.util.ArrayList<String>()).srvOk, "서버 응답이 깨지면 실패로 표시");
        fd.setData(fdat);
        fq = fd.request(18, true);
        ok(fd.loaded && !fd.failed && !fd.needData() && fq.contains("\"st\":\"done\"") && fq.contains("\"s\":[{") && fq.contains("\"n\":\"가\"") && fq.contains("\"u\":[[\"공공A\",\"한식\",\"국밥\",\"도로1\",\"지번1\",\"37.501\",\"127.002\"]]"), "받은 원자료를 그대로 엔진에 보낸다(고르는 것은 엔진)");
        ok(fd.pickChip("카페") && "카페".equals(fd.flt) && !fd.pickChip("주점") && "주점".equals(fd.flt), "칩: 엔진이 미리 계산해 둔 화면이 있으면 요청 없이");
        ok(fd.altOf("카페") != null && fd.altOf("카페").contains("\"v\":1") && fd.altOf("주점") == null, "칩 화면 보관");
        ok(fd.act("fm.c.0") == FoodCore.R_SHEET && fd.pendingSel.equals("{\"n\":\"맛집\",\"c\":\"음식 > 한식\",\"a\":\"서울 1\",\"la\":37.5,\"lo\":127}") || fd.pendingSel.contains("\"la\":37.5"), "가게 누름 → 시트 요청 사실");
        ok(fd.act("fm.c.9") == FoodCore.R_NONE && fd.act("fm.close") == FoodCore.R_CLOSE && fd.act("zz") == FoodCore.R_NONE, "없는 가게 · 닫기 · 엉터리");
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
        String ab = mc.ttAskBody(1000L);
        ok(ab.contains("\"line\":\"2호선\"") && ab.contains("\"line\":\"신분당선\"") && ab.contains("\"op\":\"timetable\"") && ab.contains("\"from\":\"강남\"") && ab.contains("\"baseMs\":1000") && !ab.contains("\"day\""), "처음엔 모든 노선을 한 번에 묻는다");
        ok(!mc.addTt("{\"items\":[]}", mc.ttSeq - 1), "늦게 온 응답은 버린다");
        ok(mc.addTt("{\"items\":[{\"id\":0,\"dirs\":[],\"dayCode\":\"DAY\"},{\"id\":1,\"noData\":true}]}", mc.ttSeq) && "ok".equals(mc.ttState), "시간표 응답 모으기");
        String tr = mc.ttRequest(18, "dark");
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
        ok(mc.act("mp.loc", null) == MapCore.R_BUS_LOC && !mc.bodyRequest(18, "dark").contains("\"bus\":{"), "버스 모드의 내 위치는 정류장 찾기 · 위치 전엔 bus 없음");
        mc.setBusLoc(37.5, 127.0);
        mc.onScreen("{\"info\":{\"view\":\"bus\",\"bus\":{\"st\":\"need\",\"need\":[{\"k\":\"tp\",\"url\":\"http://ws.bus.go.kr/api/rest/stationinfo/getStationByPos?tmX=127\"},{\"k\":\"tn\",\"url\":\"https://evil.example/x\"}]}}}");
        ok(mc.busNeed.size() == 2 && "tp".equals(mc.busNeed.get(0)[0]), "엔진이 준 주소 목록 읽기");
        ok(MapCore.busFetchUrl(mc.busNeed.get(0)[1]).startsWith(ShellCore.NEWS_BASE + "/tago?url=http%3A%2F%2Fws.bus.go.kr") && MapCore.busFetchUrl(mc.busNeed.get(1)[1]).isEmpty(), "허용된 공공 API 주소만 프록시로 받는다");
        ok(MapCore.busFetchUrl("https://apis.data.go.kr/6410000/busarrivalservice/v2/getBusArrivalListv2?stationId=1&format=json").startsWith(ShellCore.NEWS_BASE + "/tago?url=https%3A%2F%2Fapis.data.go.kr%2F6410000%2F")
            && MapCore.busFetchUrl(ShellCore.NEWS_BASE + "/bus-stops?lat=37.5&lng=127&radius=800").equals(ShellCore.NEWS_BASE + "/bus-stops?lat=37.5&lng=127&radius=800")
            && MapCore.busFetchUrl(ShellCore.NEWS_BASE + "/bus-stops?lat=1&x=<script>").isEmpty() && MapCore.busFetchUrl(ShellCore.NEWS_BASE + "/other?x=1").isEmpty() && MapCore.busFetchUrl("https://evil.example/bus-stops?lat=1").isEmpty(), "경기 GBIS 주소는 프록시로, 서버 정류장 표(D1)는 직접, 그 밖은 막는다");
        mc.addBusRes("tp", "<a/>"); mc.addBusRes("BAD KEY", "x");
        String bq2 = mc.bodyRequest(18, "dark");
        ok(bq2.contains("\"bus\":{\"lat\":37.5,\"lng\":127.0,\"res\":{\"tp\":\"<a/>\"}}") && !bq2.contains("BAD"), "받은 본문을 res 로 다시 보낸다");
        mc.setBusLoc(37.4, 127.1); ok(!mc.bodyRequest(18, "dark").contains("\"tp\""), "위치를 다시 잡으면 이전 본문은 비운다");
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
            h2.setRoute("{\"result\":{}}", "부평", "강남", -1, 1L);
            ok(!h2.riding() && !h2.resultFacts(new HomeCore.Env(), "dark").contains("\"ride\""), "새 탐색이면 이전 탑승 표시는 붙지 않는다");
            h2.setRide("", "");
            h2.ld2Raw = "{\"result\":{\"path\":[]}}"; h2.setNotes(h2.secKey(), "{\"lines\":{}}", "{\"lines\":{}}", 1000L);
            String rq2 = h2.resultRequest(new HomeCore.Env(), 18, "dark", 0);
            ok(rq2.contains("\"ld2\":{") && rq2.contains("\"off\":{") && rq2.contains("\"al\":{"), "다시 받은 응답·공지 원자료를 엔진에 그대로 보낸다");
            ok(!h2.needNotes(1500L) && h2.needNotes(62000L), "공지는 60초 안에는 다시 받지 않는다");
            ok(h2.replaceRoute("{\"a\":1}") && h2.ld2Raw.isEmpty() && !h2.replaceRoute("zz"), "예상 재조회 결과로 바꾸기");
            ShellCore.MemStore fs = new ShellCore.MemStore();
            FavCore fv = new FavCore(fs);
            ok("[]".equals(fv.listJson()) && fv.request(18, "dark", "부평", "강남").contains("\"cur\":{\"s\":\"부평\""), "즐겨찾기 요청: 빈 목록 + 지금 경로");
            ok(fv.act("fv.add", null) == FavCore.R_RENDER && fv.request(18, "dark", "부평", "강남").contains("\"op\":{\"k\":\"quick\"}") && !fv.request(18, "dark", "", "").contains("\"op\""), "빠른 등록은 한 번만 실린다");
            fv.onScreen("{\"info\":{\"list\":[{\"s\":\"부평\",\"d\":\"강남\",\"name\":\"출근\"}],\"msg\":\"출근 등록 완료\",\"go\":[{\"s\":[\"부평\",\"수도권 1호선\",37.489,126.724],\"d\":[\"강남\",\"2호선\",37.497,127.027]},null]}}");
            ok(fs.get(FavCore.K_FAV, "").contains("출근") && "출근 등록 완료".equals(fv.msg) && fv.go.size() == 2, "엔진이 돌려준 새 목록을 그대로 저장");
            ok(fv.act("fv.go.0", null) == FavCore.R_GO && fv.go.get(0).dName.equals("강남") && Math.abs(fv.go.get(0).dLa - 37.497) < 1e-9 && fv.act("fv.go.1", null) == FavCore.R_NONE, "즐겨찾기로 경로 찾기(풀리지 않은 것은 무시)");
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
            ok(RideCore.vibPattern(null).length == 2 && RideCore.vibPattern(java.util.Arrays.asList(Double.valueOf(5000.0), Double.valueOf(-5.0)))[1] == 1000L && RideCore.vibPattern(java.util.Arrays.asList(Double.valueOf(5000.0), Double.valueOf(-5.0)))[2] == 0L, "진동 무늬 안전 범위");
            HcardsCore hcc = new HcardsCore();
            HomeCore.Env en = new HomeCore.Env(); en.nowMs = 1000000L; en.tzoMin = -540; en.hol = false;
            ok(hcc.ensureNext(1000L) && hcc.aiNextAt == 1000L + HcardsCore.AI_EVERY_MS && !hcc.ensureNext(2000L), "AI 갱신 시각: 없을 때만 새로 정한다");
            String rq3 = hcc.request(18, "dark", en, "null", "[]");
            ok(rq3.contains("\"gps\":null") && rq3.contains("\"r\":null") && rq3.contains("\"tz\":540") && rq3.contains("\"nextAt\":" + hcc.aiNextAt) && rq3.contains("\"tk\":{\"m\":[],\"fold\":0,\"tzo\":-540}"), "홈 카드 요청: 사실만 싣는다");
            hcc.setFix(37.5, 127.0, 5L);
            ok(hcc.request(18, "pastel", en, "{\"a\":1}", "[[\"하늘\",\"안녕\",1,0]]").contains("\"gps\":[37.5,127.0]") && hcc.request(18, "pastel", en, "{\"a\":1}", "[]").contains("\"r\":{\"a\":1}"), "위치·경로 사실");
            String k1 = hcc.key(1, "fast", 60000L, 3, "3:99"); hcc.refreshAi(70000L);
            ok(!k1.equals(hcc.key(1, "fast", 60000L, 3, "3:99")) && hcc.key(1, "fast", 60000L, 3, "3:99").equals(hcc.key(1, "fast", 61000L, 3, "3:99")), "열쇠: 새로고침하면 바뀌고 같은 분이면 같다");
            ok(hcc.act("share.loc", null) == HcardsCore.R_SHARE, "눌림: 내 위치 공유");
            String ks0 = hcc.key(1, "fast", 60000L, 0, ""); hcc.share = true;
            ok(hcc.request(18, "dark", en, "null", "[]").contains(",\"sh\":1") && !ks0.equals(hcc.key(1, "fast", 60000L, 0, "")), "공유 재료가 있으면 요청에 sh=1 이 실리고 열쇠가 바뀐다");
            hcc.share = false;
            ShareCore.Share shr = ShareCore.parse("{\"text\":\"임학 - 계양 - 아라 (도착예정시간: 07시10분)\\n[남은시간: 00시14분]\",\"from\":\"임학\",\"cur\":\"계양\",\"to\":\"아라\",\"arr\":\"07:10\",\"rem\":\"14분\",\"stations\":[{\"n\":\"임학\",\"t\":\"06:50\"},{\"n\":\"박촌\",\"t\":\"06:53\"},{\"n\":\"계양\",\"t\":\"06:56\"},{\"n\":\"경인교대\",\"t\":\"06:59\"},{\"n\":\"작전\",\"t\":\"07:02\"},{\"n\":\"갈산\",\"t\":\"07:05\"},{\"n\":\"아라\",\"t\":\"07:10\"}],\"hit\":2,\"moving\":true,\"left\":4,\"next\":\"경인교대\"}");
            ok(shr != null && shr.names.size() == 7 && shr.hit == 2 && shr.left == 4 && shr.text.startsWith("임학 - 계양") && "다음 역 경인교대 이동 중 · 4개 역 남음".equals(ShareCore.footer(shr)), "위치 공유 재료를 읽는다");
            ok(java.util.Arrays.equals(ShareCore.slots(7, 2), new int[] { 0, 1, 2, 3, -2, 6 }) && java.util.Arrays.equals(ShareCore.slots(3, 1), new int[] { 0, 1, 2 }) && ShareCore.slots(0, 0).length == 0, "그림 칸: 출발·앞뒤·도착만 남기고 사이는 건너뛴 역 수");
            OvCore.Ov ovv = OvCore.fromMap(ScreenCore.parse("{\"active\":true,\"line1\":\"계양 ▸ 경인교대\",\"pill\":\"경인교대 (이동중)\",\"cur\":2,\"base\":0,\"alert\":2,\"alertAt\":5,\"moving\":true,\"pre\":true,\"banner\":\"아라까지 2정거장\",\"line2\":\"남은시간: 00시간 14분\",\"theme\":{\"bg\":\"#ffffff\",\"fg\":\"#1a2533\",\"sub\":\"#6b8299\"},\"rs\":{\"st\":\"board\",\"end\":true,\"bt\":\"안내 종료\",\"k\":\"도착\"},\"cells\":[{\"n\":\"임학\",\"t\":\"06:50\",\"dk\":2,\"rc\":\"#0052a4\",\"dc\":\"#0052a4\",\"g\":\"1호선\"},{\"n\":\"박촌\",\"t\":\"06:53\",\"lc\":\"#0052a4\",\"rc\":\"#0052a4\"},{\"n\":\"계양\",\"t\":\"06:56\",\"lc\":\"#0052a4\",\"gp\":true,\"g\":\"↔ 공항\",\"gc\":\"#0090d2\"}]}"));
            ok(ovv.active && ovv.alert == 2 && ovv.cur == 2 && ovv.cells.length == 3 && ovv.moving && ovv.pre && ovv.hasTheme && ovv.bg == 0xFFFFFFFF && ovv.fg == 0xFF1A2533 && OvCore.arrived(ovv), "오버레이 값을 읽는다(칸 · 색 · 경고 · 도착 줄)");
            ok(!ovv.cells[0].hasL && ovv.cells[0].hasR && ovv.cells[0].dk == 2 && ovv.cells[0].dc == 0xFF0052A4 && ovv.cells[1].hasL && ovv.cells[1].hasR && ovv.cells[2].pill && ovv.cells[2].gc == 0xFF0090D2 && ovv.cells[1].dk == 1, "칸: 선 · 점 모양 · 배지 색");
            ok(OvCore.color("#fff", 7) == 0xFFFFFFFF && OvCore.color("#80ff0000", 7) == 0x80FF0000 && OvCore.color("red", 7) == 7 && OvCore.color(null, 7) == 7 && OvCore.color("#zzz", 7) == 7, "색 읽기: #rgb · #rrggbb · #aarrggbb, 못 읽으면 기본");
            ok(OvCore.centerPos(10, 0, 30) == 8f && OvCore.centerPos(0, 0, 30) == 0f && OvCore.centerPos(29, 0, 30) == 25f && OvCore.centerPos(1, 0, 3) == 0f && OvCore.centerPos(3, 100, 20) == 101f && OvCore.clampPos(-4f, 0, 30) == 0f, "다섯 칸 창: 현위치가 가운데 · 가장자리에서 멈춘다");
            ok("경인교대 (이동중)".equals(OvCore.pillText(ovv)) && OvCore.spinMs(1) < OvCore.spinMs(2) && OvCore.spinMs(0) == 0L && !OvCore.fromMap(null).active && !OvCore.fromMap(ScreenCore.parse("{\"active\":true}")).active, "알약 글 · 경고 테두리 속도 · 빈 값");
            ok(!OvCore.arrived(OvCore.fromMap(ScreenCore.parse("{\"active\":true,\"line1\":\"a\",\"rs\":{\"st\":\"board\",\"bt\":\"탑승\",\"k\":\"S0 12:52 출발\",\"nm\":\"S0\"}}"))) && OvCore.fromMap(ScreenCore.parse("{\"active\":true,\"line1\":\"a\",\"rs\":{\"st\":\"undo\",\"bt\":\"되돌리기\"}}")).rsSt.equals("undo"), "탑승 줄은 도착 줄이 아니다(탑승 단추 ≠ 안내 종료)");
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

        System.out.println(fails == 0 ? "ALL OK " + oks : "FAILED " + fails + " / " + (oks + fails));
        if (fails > 0) System.exit(1);
    }
}

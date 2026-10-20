package com.dullyyj.subway;   // ★ 앱 패키지와 같아야 한다

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 즐겨찾기(경로) 시트의 순수 자바 상태기 — 2026-10-20 (s92).
 * 등록·삭제 규칙(최대 8개, 중복, 같은 역)과 화면·안내 글은 엔진(/screen/fav)이 정한다.
 * 여기는 저장된 목록(JSON 글)을 그대로 들고 있다가 엔진에 보내고, 엔진이 돌려준 새 목록을 그대로 저장하며, 눌림의 뜻만 정한다.
 */
public final class FavCore {
    public static final String K_FAV = "mk_favorites";
    public static final int R_NONE = 0, R_RENDER = 1, R_CLOSE = 2, R_GO = 3;

    /** 엔진이 풀어 준 즐겨찾기 하나: 출발·도착 [이름, 노선, 위도, 경도]. */
    public static final class Go { public String sName = "", sLine = "", dName = "", dLine = ""; public double sLa, sLo, dLa, dLo; }

    private final ShellCore.Store st;
    public FavCore(ShellCore.Store st) { this.st = st; }

    public String msg = "";
    public final List<Go> go = new ArrayList<Go>();
    public int goIdx = -1;
    private String op = "";                                   // 다음 요청에 실을 눌림: '' · quick · del:<번호>

    /** 저장된 목록 글. 모양이 이상하면 빈 목록. */
    public String listJson() {
        String s = st.get(K_FAV, "[]");
        return s != null && s.length() > 1 && s.length() < 8000 && s.charAt(0) == '[' && s.charAt(s.length() - 1) == ']' ? s : "[]";
    }
    /** 엔진 POST /screen/fav 본문. curS·curD 는 지금 보는 경로의 출발·도착 이름(없으면 빈 글). */
    public String request(int cap, String theme, String curS, String curD) {
        StringBuilder b = new StringBuilder("{\"cap\":").append(cap).append(",\"f\":{\"list\":").append(listJson());
        b.append(",\"th\":").append(ShellCore.q("dark".equals(theme) ? "dark" : "pastel"));
        if (curS != null && curD != null && curS.length() > 0 && curD.length() > 0) b.append(",\"cur\":{\"s\":").append(ShellCore.q(curS)).append(",\"d\":").append(ShellCore.q(curD)).append('}');
        if ("quick".equals(op)) b.append(",\"op\":{\"k\":\"quick\"}");
        else if (op.startsWith("del:")) b.append(",\"op\":{\"k\":\"del\",\"i\":").append(op.substring(4)).append('}');
        op = "";
        return b.append("}}").toString();
    }
    /** 엔진이 돌려준 화면에서 새 목록을 저장하고, 안내 글과 '찾기' 정보를 읽는다. */
    @SuppressWarnings("unchecked")
    public void onScreen(String json) {
        msg = ""; go.clear();
        try {
            Object o = ScreenCore.parse(json);
            Object info = o instanceof Map ? ((Map<String, Object>) o).get("info") : null;
            if (!(info instanceof Map)) return;
            Map<String, Object> im = (Map<String, Object>) info;
            if (im.get("list") instanceof List) st.put(K_FAV, HomeSearchCore.toJson(im.get("list")));
            msg = BoardCore.s(im.get("msg"), 60);
            if (im.get("go") instanceof List) for (Object x : (List<Object>) im.get("go")) {
                Go g = new Go();
                if (x instanceof Map) {
                    Map<String, Object> m = (Map<String, Object>) x;
                    Object s = m.get("s"), d = m.get("d");
                    if (s instanceof List && d instanceof List && ((List<Object>) s).size() >= 4 && ((List<Object>) d).size() >= 4) {
                        List<Object> sl = (List<Object>) s, dl = (List<Object>) d;
                        g.sName = BoardCore.s(sl.get(0), 30); g.sLine = BoardCore.s(sl.get(1), 30); g.sLa = BoardCore.d(sl.get(2)); g.sLo = BoardCore.d(sl.get(3));
                        g.dName = BoardCore.s(dl.get(0), 30); g.dLine = BoardCore.s(dl.get(1), 30); g.dLa = BoardCore.d(dl.get(2)); g.dLo = BoardCore.d(dl.get(3));
                    }
                }
                go.add(g);
            }
        } catch (Exception e) { /* 이전 값 유지 */ }
    }
    /** 눌림. fv.add · fv.del.<i> 는 다시 그리기, fv.go.<i> 는 그 즐겨찾기로 경로 찾기. */
    public int act(String v) {
        if (v == null) return R_NONE;
        if ("fv.close".equals(v)) return R_CLOSE;
        if ("fv.add".equals(v)) { op = "quick"; return R_RENDER; }
        try {
            if (v.startsWith("fv.del.")) { int i = Integer.parseInt(v.substring(7)); if (i >= 0 && i < 20) { op = "del:" + i; return R_RENDER; } }
            if (v.startsWith("fv.go.")) { int i = Integer.parseInt(v.substring(6)); if (i >= 0 && i < go.size() && go.get(i).sName.length() > 0) { goIdx = i; return R_GO; } }
        } catch (NumberFormatException e) { /* 무시 */ }
        return R_NONE;
    }
}

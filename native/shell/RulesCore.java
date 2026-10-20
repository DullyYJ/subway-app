package com.dullyyj.subway;   // ★ 앱 패키지와 같아야 한다

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * 앱 규칙(욕설 거르기 · 포인트 · 탄 노선 기록) 쪽 껍데기. 판정과 계산은 전부 엔진(POST /rules)이 한다.
 * 여기는 요청 본문을 만들고, 답에서 문구와 새 저장값을 꺼내 저장소에 그대로 넣는 일만 한다. 순수 자바(안드로이드 몰라도 시험 가능).
 */
public final class RulesCore {
    private RulesCore() { }
    public static final String K_PT = "mk_pt";

    /** 앱 시계의 오늘 날짜 글자. 엔진은 시계가 없으므로 이 값으로 하루가 바뀌었는지 안다. */
    public static String day(long ms) { return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date(ms)); }

    static String ptOf(ShellCore.Store st) {
        String p = st == null ? null : st.get(K_PT, "{}");
        return p == null || !p.startsWith("{") ? "{}" : p;
    }

    /** 글·댓글·채팅을 올려도 되는지 묻는 요청. cat 이 비면 현장제보 한도는 보지 않는다. */
    public static String checkBody(ShellCore.Store st, String kind, String cat, long now, String... texts) {
        StringBuilder b = new StringBuilder("{\"op\":\"check\",\"kind\":").append(ShellCore.q(kind)).append(",\"cat\":").append(ShellCore.q(cat == null ? "" : cat));
        b.append(",\"day\":").append(ShellCore.q(day(now))).append(",\"pt\":").append(ptOf(st)).append(",\"texts\":[");
        for (int i = 0; i < texts.length; i++) { if (i > 0) b.append(','); b.append(ShellCore.q(texts[i] == null ? "" : texts[i])); }
        return b.append("]}").toString();
    }

    /** 포인트 적립 요청. ev: write · report · ride. rnd 는 기기가 뽑은 0~1 무작위 수(추첨용). */
    public static String awardBody(ShellCore.Store st, String ev, long now, double rnd, boolean sent) {
        return "{\"op\":\"award\",\"ev\":" + ShellCore.q(ev) + ",\"day\":" + ShellCore.q(day(now)) + ",\"rnd\":" + rnd + ",\"sent\":" + sent + ",\"pt\":" + ptOf(st) + "}";
    }

    /** 탄 노선 기록 요청. my 는 저장된 기록(JSON 배열), sec 는 이번 경로의 노선 이름들. */
    public static String mylinesBody(String myJson, List<String> sec, long now) {
        StringBuilder b = new StringBuilder("{\"op\":\"mylines\",\"now\":").append(now).append(",\"my\":").append(myJson == null || !myJson.startsWith("[") ? "[]" : myJson).append(",\"sec\":[");
        for (int i = 0; sec != null && i < sec.size(); i++) { if (i > 0) b.append(','); b.append(ShellCore.q(sec.get(i))); }
        return b.append("]}").toString();
    }

    /** 검사 결과: 올려도 되면 "", 안 되면 사용자에게 보일 문구. 엔진 답이 없거나 깨졌으면 막지 않는다(서버도 한 번 더 거른다). */
    @SuppressWarnings("unchecked")
    public static String checkError(String resp) {
        try {
            Object o = ScreenCore.parse(resp);
            if (!(o instanceof Map)) return "";
            Map<String, Object> m = (Map<String, Object>) o;
            if (Boolean.FALSE.equals(m.get("ok"))) { Object s = m.get("msg"); return s instanceof String && ((String) s).length() > 0 ? (String) s : "등록할 수 없어요"; }
        } catch (Exception e) { /* 판정 불가 → 통과 */ }
        return "";
    }

    /** 적립 결과를 저장소에 반영하고 보여 줄 문구를 돌려준다. 실패하면 "". */
    @SuppressWarnings("unchecked")
    public static String applyAward(ShellCore.Store st, String resp) {
        try {
            Object o = ScreenCore.parse(resp);
            if (!(o instanceof Map)) return "";
            Map<String, Object> m = (Map<String, Object>) o;
            if (!Boolean.TRUE.equals(m.get("ok"))) return "";
            Object pt = m.get("pt");
            if (pt instanceof Map) st.put(K_PT, toJson(pt));
            Object s = m.get("msg");
            return s instanceof String ? (String) s : "";
        } catch (Exception e) { return ""; }
    }

    /** 탄 노선 기록 답을 저장소(ChatCore.K_MY)에 반영한다. */
    @SuppressWarnings("unchecked")
    public static boolean applyMyLines(ShellCore.Store st, String resp) {
        try {
            Object o = ScreenCore.parse(resp);
            if (!(o instanceof Map)) return false;
            Map<String, Object> m = (Map<String, Object>) o;
            if (!Boolean.TRUE.equals(m.get("ok")) || !(m.get("my") instanceof List)) return false;
            st.put(ChatCore.K_MY, toJson(m.get("my")));
            return true;
        } catch (Exception e) { return false; }
    }

    /** 파싱된 값(Map · List · 문자열 · 숫자 · 불리언)을 다시 JSON 으로. 엔진이 준 값을 그대로 보관하기 위한 것. */
    @SuppressWarnings("unchecked")
    static String toJson(Object v) {
        if (v == null) return "null";
        if (v instanceof String) return ShellCore.q((String) v);
        if (v instanceof Boolean) return v.toString();
        if (v instanceof Number) { double d = ((Number) v).doubleValue(); return d == Math.rint(d) && Math.abs(d) < 1e15 ? Long.toString((long) d) : Double.toString(d); }
        if (v instanceof List) {
            StringBuilder b = new StringBuilder("[");
            boolean f = true; for (Object x : (List<Object>) v) { if (!f) b.append(','); f = false; b.append(toJson(x)); }
            return b.append(']').toString();
        }
        if (v instanceof Map) {
            StringBuilder b = new StringBuilder("{");
            boolean f = true; for (Map.Entry<String, Object> e : ((Map<String, Object>) v).entrySet()) { if (!f) b.append(','); f = false; b.append(ShellCore.q(e.getKey())).append(':').append(toJson(e.getValue())); }
            return b.append('}').toString();
        }
        return "null";
    }
}

package com.dullyyj.subway;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 캐릭터 시계 위젯 출퇴근 장면 목록(s272) — 순수 자바(안드로이드 없음, JVM 에서 시험한다).
 *
 * ★ 원칙(YJ): "모든 계산은 엔진이, 앱은 그림만." 어느 요일·몇 시에 장면이 뜨는지, 몇 분 동안 기다리는지, 버튼 이름·기본 문구는 엔진
 *   POST /commute-alarm {op:'wscene'}(engine/commute-alarm.js cmWidgetScenes)가 앞으로 14일치 목록으로 정한다.
 *   여기는 ① 그 요청 본문을 만들고 ② 응답을 읽고 ③ "지금 시각이 목록의 어느 칸에 드는가"를 가려낼 뿐이다 — 위젯은 앱이 꺼져 있어도 통신이 없어도 돌아야 하므로
 *   받은 목록을 기기에 두고 그 칸 조회만 기기에서 한다(요일·시각·공휴일 같은 규칙은 이 파일에 없다).
 */
final class WidgetSceneCore {
    private WidgetSceneCore() { }

    static final class Entry {
        final String k, key; final long at, until;
        Entry(String k, String key, long at, long until) { this.k = k; this.key = key; this.at = at; this.until = until; }
    }

    static final class Plan {
        long validMs, showMs;
        String[] btn = { "", "" };                          // [morn, eve]
        String[][] say = { { "", "" }, { "", "" } };
        final List<Entry> list = new ArrayList<Entry>();

        static int ix(String kind) { return "eve".equals(kind) ? 1 : 0; }
        String btnOf(String kind) { return btn[ix(kind)]; }
        String sayOf(String kind, int n) { return say[ix(kind)][n]; }
        Entry find(String key) {
            if (key == null || key.length() == 0) return null;
            for (Entry e : list) if (e.key.equals(key)) return e;
            return null;
        }
        /** now 가 [시작, 끝)에 드는 칸 중 가장 늦게 시작한 것(이미 끝낸 키 lastDone 은 뺀다). 없으면 null. */
        Entry pick(long now, String lastDone) {
            Entry best = null;
            for (Entry e : list) if (now >= e.at && now < e.until && !e.key.equals(lastDone) && (best == null || e.at >= best.at)) best = e;
            return best;
        }
        /** now+1초 뒤 첫 시작 시각(없으면 Long.MAX_VALUE) — 알람을 걸 때를 가린다. */
        long nextAt(long now) {
            long n = Long.MAX_VALUE;
            for (Entry e : list) if (e.at > now + 1000L && e.at < n) n = e.at;
            return n;
        }
    }

    /** POST /commute-alarm 본문(op:'wscene'). days[i] = 요일 i(0=일 … 6=토)를 켰나. */
    static String reqBody(long nowMs, boolean on, boolean mOn, boolean eOn, String morn, String eve, boolean[] days) {
        StringBuilder d = new StringBuilder();
        for (int i = 0; i < 7 && days != null && i < days.length; i++) if (days[i]) { if (d.length() > 0) d.append(','); d.append(i); }
        return "{\"op\":\"wscene\",\"nowMs\":" + nowMs + ",\"on\":" + on + ",\"mOn\":" + mOn + ",\"eOn\":" + eOn + ",\"morn\":" + q(morn) + ",\"eve\":" + q(eve) + ",\"days\":[" + d + "]}";
    }
    /** 이 설정으로 받은 목록인지 가리는 서명 — 설정이 바뀌면 옛 목록은 쓰지 않는다. */
    static String sig(boolean on, boolean mOn, boolean eOn, String morn, String eve, boolean[] days) {
        StringBuilder b = new StringBuilder().append(on ? 1 : 0).append(mOn ? 1 : 0).append(eOn ? 1 : 0).append('|').append(morn).append('|').append(eve).append('|');
        for (int i = 0; i < 7 && days != null && i < days.length; i++) b.append(days[i] ? '1' : '0');
        return b.toString();
    }

    /** 응답 → 목록. 이상하면 null. */
    @SuppressWarnings("unchecked")
    static Plan parse(String json) {
        try {
            Object o = ScreenCore.parse(json);
            if (!(o instanceof Map)) return null;
            Map<String, Object> m = (Map<String, Object>) o;
            if (!Boolean.TRUE.equals(m.get("ok")) || !(m.get("list") instanceof List)) return null;
            Plan p = new Plan();
            p.validMs = num(m.get("validMs")); p.showMs = num(m.get("showMs"));
            if (p.validMs <= 0L || p.showMs <= 0L) return null;
            if (m.get("btn") instanceof Map) { Map<String, Object> b = (Map<String, Object>) m.get("btn"); p.btn[0] = str(b.get("morn")); p.btn[1] = str(b.get("eve")); }
            if (m.get("say") instanceof Map) {
                Map<String, Object> s = (Map<String, Object>) m.get("say");
                for (int k = 0; k < 2; k++) {
                    Object v = s.get(k == 0 ? "morn" : "eve");
                    if (v instanceof List) { List<Object> l = (List<Object>) v; for (int n = 0; n < 2 && n < l.size(); n++) p.say[k][n] = str(l.get(n)); }
                }
            }
            List<Object> l = (List<Object>) m.get("list");
            for (int i = 0; i < l.size() && i < 80; i++) {
                if (!(l.get(i) instanceof Map)) continue;
                Map<String, Object> e = (Map<String, Object>) l.get(i);
                String k = str(e.get("k")), key = str(e.get("key"));
                long at = num(e.get("at")), until = num(e.get("until"));
                if (("morn".equals(k) || "eve".equals(k)) && key.length() > 0 && key.length() <= 40 && at > 0L && until > at) p.list.add(new Entry(k, key, at, until));
            }
            return p;
        } catch (ScreenCore.ParseError e) { return null; }
    }
    static String q(String s) {                         // 시각 글자만 들어온다(HH:MM) — 따옴표·역슬래시만 막는다
        StringBuilder b = new StringBuilder("\"");
        for (int i = 0; s != null && i < s.length() && i < 12; i++) { char ch = s.charAt(i); if (ch == '"' || ch == '\\' || ch < 32) continue; b.append(ch); }
        return b.append('"').toString();
    }
    static String str(Object o) { return o instanceof String ? (String) o : ""; }
    static long num(Object o) { return o instanceof Number ? ((Number) o).longValue() : 0L; }
}

package com.dullyyj.subway;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 오류 로그(순수 자바) — 앱이 멈춘 이유 등을 저장소에 모아 두고, 엔진 오류 로그 화면(settings p=erl)에 사실로 보낸다.
 * 한 건 = { t 시각 글, m 메시지, f 위치(파일:줄), s 호출 흔적, n 횟수 }. 같은 메시지·위치가 또 나면 횟수만 올린다. 최대 40건(오래된 것부터 버림).
 * 화면 글은 엔진(settingsPageErl)이 만든다. 시계를 부르지 않는다(시각 글은 밖에서 받는다).
 */
public final class ErrCore {
    private ErrCore() { }

    public static final String K_LOG = "err_log";
    public static final int MAX = 40;

    public static final class Entry { public String t = "", m = "", f = "", s = ""; public int n = 1; }

    static String cut(String s, int n) { return s == null ? "" : (s.length() > n ? s.substring(0, n) : s); }

    @SuppressWarnings("unchecked")
    public static List<Entry> list(ShellCore.Store st) {
        List<Entry> out = new ArrayList<Entry>();
        try {
            Object o = ScreenCore.parse(st.get(K_LOG, "[]"));
            if (!(o instanceof List)) return out;
            for (Object x : (List<Object>) o) {
                if (!(x instanceof Map)) continue;
                Map<String, Object> m = (Map<String, Object>) x;
                Entry e = new Entry();
                e.t = cut(str(m.get("t")), 24); e.m = cut(str(m.get("m")), 300); e.f = cut(str(m.get("f")), 200); e.s = cut(str(m.get("s")), 600);
                e.n = m.get("n") instanceof Number ? Math.max(1, Math.min(9999, ((Number) m.get("n")).intValue())) : 1;
                if (e.m.length() > 0) out.add(e);
            }
        } catch (ScreenCore.ParseError e) { out.clear(); }
        while (out.size() > MAX) out.remove(0);
        return out;
    }
    static String str(Object o) { return o instanceof String ? (String) o : ""; }

    public static int count(ShellCore.Store st) { return list(st).size(); }

    /** 한 건 적는다. 같은 메시지·위치가 이미 있으면 맨 뒤로 옮기고 횟수+1, 시각을 새로. */
    public static void add(ShellCore.Store st, String t, String m, String f, String s) {
        if (m == null || m.trim().length() == 0) return;
        List<Entry> l = list(st);
        Entry hit = null;
        for (Entry e : l) if (e.m.equals(cut(m, 300)) && e.f.equals(cut(f, 200))) { hit = e; break; }
        if (hit != null) { l.remove(hit); hit.n = Math.min(9999, hit.n + 1); hit.t = cut(t, 24); }
        else { hit = new Entry(); hit.t = cut(t, 24); hit.m = cut(m, 300); hit.f = cut(f, 200); hit.s = cut(s, 600); }
        l.add(hit);
        while (l.size() > MAX) l.remove(0);
        st.put(K_LOG, json(l));
    }
    public static void clear(ShellCore.Store st) { st.put(K_LOG, "[]"); }

    static String json(List<Entry> l) {
        StringBuilder b = new StringBuilder("[");
        for (int i = 0; i < l.size(); i++) {
            Entry e = l.get(i);
            if (i > 0) b.append(',');
            b.append("{\"t\":").append(ShellCore.q(e.t)).append(",\"m\":").append(ShellCore.q(e.m)).append(",\"f\":").append(ShellCore.q(e.f)).append(",\"s\":").append(ShellCore.q(e.s)).append(",\"n\":").append(e.n).append('}');
        }
        return b.append(']').toString();
    }

    /** 엔진 오류 로그 화면에 보내는 기기 사실(오래된 것부터). */
    public static String pageFacts(ShellCore.Store st) { return "{\"pf\":{\"nat\":true,\"nv\":true,\"errs\":" + json(list(st)) + "}}"; }

    /** 복사할 글(예전 웹 copyErrLog 와 같은 모양). */
    public static String copyText(ShellCore.Store st) {
        List<Entry> l = list(st);
        if (l.isEmpty()) return "(오류 없음)";
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < l.size(); i++) {
            Entry e = l.get(i);
            if (i > 0) b.append("\n\n");
            b.append('[').append(e.t).append(']').append(e.n > 1 ? "(" + e.n + "회)" : "").append(' ').append(e.m).append("\n  ").append(e.f);
            if (e.s.length() > 0) b.append("\n  ").append(e.s);
        }
        return b.toString();
    }
}

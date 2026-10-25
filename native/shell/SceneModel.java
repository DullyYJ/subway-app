package com.dullyyj.subway;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 엔진(/scene)이 준 답 + 캐릭터 시트 규격. 계산은 엔진이 했고, 여기는 받은 값을 담는 그릇일 뿐이다.
 * JSON 은 org.json 대신 아래 작은 해석기로 읽는다(그래야 JVM 시험에서도 같은 코드가 돈다).
 */
public final class SceneModel {
    private SceneModel() {}

    /** 시트 규격(웹 _RC.d3 와 같은 값) */
    public static final class Spec {
        public final int fps; public final double cell, base, ox, lift; public final int intro, introFps;
        Spec(int fps, double cell, double base, double ox, double lift, int intro, int introFps) {
            this.fps = fps; this.cell = cell; this.base = base; this.ox = ox; this.lift = lift; this.intro = intro; this.introFps = introFps;
        }
    }
    public static final String[] ORDER = {"dolsom", "lovel", "dudung", "sul", "ppopu", "chaeng"};
    public static final Map<String, Spec> D3 = new HashMap<>();
    static {
        D3.put("dolsom", new Spec(19, 86, 248.5, 120.8, 0, 0, 0));
        D3.put("lovel", new Spec(11, 88, 250, 117.9, 0, 0, 0));
        D3.put("ppopu", new Spec(19, 88, 248.5, 120.3, 0, 0, 0));
        D3.put("chaeng", new Spec(15, 88, 244.5, 154.5, 12, 0, 0));
        D3.put("sul", new Spec(20, 104, 230.5, 131, 0, 0, 0));
        D3.put("dudung", new Spec(13, 106, 222.5, 128, 0, 14, 14));
    }
    /** 다리를 모은 '서 있는' 프레임 */
    public static int stand(String id) {
        switch (id) {
            case "dolsom": return 13; case "lovel": return 10; case "ppopu": return 13;
            case "dudung": return 12; case "sul": return 13; case "chaeng": return 4; default: return 0;
        }
    }
    public static String kind(String id) {
        switch (id) {
            case "dolsom": case "ppopu": return "dog"; case "lovel": return "cat"; case "dudung": return "mole";
            case "chaeng": return "tad"; case "sul": return "eagle"; default: return "dog";
        }
    }

    public static final class Look {
        public String slot = "noon", slotKo = "", wk = "clear", wxKo = "", season = "autumn", emo = "", place = "street", placeKo = "";
        public boolean wxKnown, night, lit, hidesSun, hot, cold, sun, bright; public double temp; public int wind;
    }
    /** say: 날씨 반응 동작 이름 → 말풍선 글(엔진이 정한 글. 없으면 말풍선 없이 몸짓만) */
    public static final class Traits { public String land = ""; public List<String> acts = new ArrayList<>(); public Map<String, String> say = new HashMap<>(); }
    public static final class Res {
        public boolean ok; public String mode, venue = "", hero, hint = "", tag = "", line = "";
        public boolean nearEnd; public Look look = new Look(); public List<String> cast = new ArrayList<>();
        public Map<String, Traits> traits = new HashMap<>();
        public String raw;
    }

    @SuppressWarnings("unchecked")
    public static Res parse(String json) {
        Object o = Json.parse(json);
        Map<String, Object> m = o instanceof Map ? (Map<String, Object>) o : new HashMap<String, Object>();
        Res r = new Res();
        r.raw = json;
        r.ok = Json.bool(m.get("ok"));
        r.mode = Json.str(m.get("mode")); r.venue = Json.strOr(m.get("venue"), ""); r.hero = Json.str(m.get("hero"));
        r.hint = Json.strOr(m.get("hint"), ""); r.tag = Json.strOr(m.get("tag"), ""); r.line = Json.strOr(m.get("line"), "");
        r.nearEnd = Json.bool(m.get("nearEnd"));
        Object lo = m.get("look");
        if (lo instanceof Map) {
            Map<String, Object> l = (Map<String, Object>) lo; Look k = r.look;
            k.slot = Json.strOr(l.get("slot"), "noon"); k.slotKo = Json.strOr(l.get("slotKo"), ""); k.wk = Json.strOr(l.get("wk"), "clear");
            k.wxKo = Json.strOr(l.get("wxKo"), ""); k.season = Json.strOr(l.get("season"), "autumn"); k.emo = Json.strOr(l.get("emo"), "");
            k.wxKnown = Json.bool(l.get("wxKnown")); k.night = Json.bool(l.get("night")); k.lit = Json.bool(l.get("lit")); k.hidesSun = Json.bool(l.get("hidesSun"));
            Object tp = l.get("temp"); k.temp = tp instanceof Number ? ((Number) tp).doubleValue() : 0;
            k.place = Json.strOr(l.get("place"), "street"); k.placeKo = Json.strOr(l.get("placeKo"), "");
            k.hot = Json.bool(l.get("hot")); k.cold = Json.bool(l.get("cold")); k.sun = Json.bool(l.get("sun")); k.bright = Json.bool(l.get("bright"));
            Object wd = l.get("wind"); k.wind = wd instanceof Number ? Math.max(0, Math.min(2, ((Number) wd).intValue())) : 0;
        }
        Object co = m.get("cast");
        if (co instanceof List) for (Object x : (List<Object>) co) if (x instanceof String) r.cast.add((String) x);
        Object to = m.get("traits");
        if (to instanceof Map) for (Map.Entry<String, Object> e : ((Map<String, Object>) to).entrySet()) {
            if (!(e.getValue() instanceof Map)) continue;
            Map<String, Object> t = (Map<String, Object>) e.getValue(); Traits tr = new Traits();
            tr.land = Json.strOr(t.get("land"), "");
            Object ao = t.get("acts");
            if (ao instanceof List) for (Object x : (List<Object>) ao) if (x instanceof String) tr.acts.add((String) x);
            Object so = t.get("say");
            if (so instanceof Map) for (Map.Entry<String, Object> se : ((Map<String, Object>) so).entrySet()) if (se.getValue() instanceof String) tr.say.put(se.getKey(), (String) se.getValue());
            r.traits.put(e.getKey(), tr);
        }
        return r;
    }

    /** 아주 작은 JSON 해석기: 객체→LinkedHashMap, 배열→ArrayList, 숫자→Double, 글자→String, true/false→Boolean, null→null */
    public static final class Json {
        private final String s; private int i;
        private Json(String s) { this.s = s; }
        public static Object parse(String s) {
            if (s == null) return null;
            try { Json j = new Json(s); j.ws(); return j.val(); } catch (RuntimeException e) { return null; }
        }
        public static boolean bool(Object o) { return o instanceof Boolean && (Boolean) o; }
        public static String str(Object o) { return o instanceof String ? (String) o : null; }
        public static String strOr(Object o, String d) { return o instanceof String ? (String) o : d; }
        private void ws() { while (i < s.length() && s.charAt(i) <= ' ') i++; }
        private Object val() {
            char c = s.charAt(i);
            if (c == '{') {
                i++; Map<String, Object> m = new LinkedHashMap<>(); ws();
                if (s.charAt(i) == '}') { i++; return m; }
                while (true) { ws(); String k = string(); ws(); i++; /* : */ ws(); m.put(k, val()); ws(); char d = s.charAt(i++); if (d == '}') return m; }
            }
            if (c == '[') {
                i++; List<Object> a = new ArrayList<>(); ws();
                if (s.charAt(i) == ']') { i++; return a; }
                while (true) { ws(); a.add(val()); ws(); char d = s.charAt(i++); if (d == ']') return a; }
            }
            if (c == '"') return string();
            if (s.startsWith("true", i)) { i += 4; return Boolean.TRUE; }
            if (s.startsWith("false", i)) { i += 5; return Boolean.FALSE; }
            if (s.startsWith("null", i)) { i += 4; return null; }
            int st = i;
            while (i < s.length() && "+-0123456789.eE".indexOf(s.charAt(i)) >= 0) i++;
            if (st == i) throw new IllegalStateException("json");
            return Double.valueOf(s.substring(st, i));
        }
        private String string() {
            i++; StringBuilder b = new StringBuilder();
            while (true) {
                char c = s.charAt(i++);
                if (c == '"') return b.toString();
                if (c == '\\') {
                    char d = s.charAt(i++);
                    switch (d) {
                        case 'n': b.append('\n'); break; case 't': b.append('\t'); break; case 'r': b.append('\r'); break;
                        case 'b': b.append('\b'); break; case 'f': b.append('\f'); break;
                        case 'u': b.append((char) Integer.parseInt(s.substring(i, i + 4), 16)); i += 4; break;
                        default: b.append(d);
                    }
                } else b.append(c);
            }
        }
    }
}

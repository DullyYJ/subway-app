// 컴파일 점검용 안드로이드 API 스텁(실제 SDK 가 아님) — 코드가 쓰는 시그니처만 흉내 낸다.
package com.getcapacitor;
public class JSObject extends org.json.JSONObject { public JSObject() { super(); } public JSObject(String json) throws org.json.JSONException { super(json); }
  public JSObject put(String k, boolean v) { return this; } public JSObject put(String k, double v) { return this; } public JSObject put(String k, int v) { return this; } public JSObject put(String k, Object v) { return this; } }

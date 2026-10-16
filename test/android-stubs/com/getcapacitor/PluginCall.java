// 컴파일 점검용 안드로이드 API 스텁(실제 SDK 가 아님) — 코드가 쓰는 시그니처만 흉내 낸다.
package com.getcapacitor;
public class PluginCall { public String getString(String k, String d) { return d; } public String getString(String k) { return null; } public Float getFloat(String k) { return null; } public Float getFloat(String k, Float d) { return d; }
  public Boolean getBoolean(String k, Boolean d) { return d; } public Integer getInt(String k) { return null; } public Integer getInt(String k, Integer d) { return d; } public JSObject getObject(String k) { return null; } public JSObject getData() { return null; }
  public void resolve() {} public void reject(String m) {} public void resolve(JSObject o) {} }

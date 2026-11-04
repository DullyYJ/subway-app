package okhttp3;
public abstract class WebSocketListener { public void onOpen(WebSocket w, Response r){} public void onMessage(WebSocket w, String t){} public void onClosing(WebSocket w,int c,String r){} public void onClosed(WebSocket w,int c,String r){} public void onFailure(WebSocket w, Throwable t, Response r){} }

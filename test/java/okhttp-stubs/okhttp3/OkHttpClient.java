package okhttp3;
import java.util.concurrent.TimeUnit;
public class OkHttpClient { public static WebSocketListener LAST; public static int OPENS; public static class Builder { public Builder pingInterval(long a, TimeUnit u){return this;} public Builder connectTimeout(long a, TimeUnit u){return this;} public OkHttpClient build(){return new OkHttpClient();} }
 public WebSocket newWebSocket(Request r, WebSocketListener l){ LAST = l; OPENS++; return new WebSocket(){ public boolean close(int c,String s){return true;} public void cancel(){} public boolean send(String s){return true;} }; } }

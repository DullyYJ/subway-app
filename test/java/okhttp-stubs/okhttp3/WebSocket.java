package okhttp3;
public interface WebSocket { boolean close(int c, String r); void cancel(); boolean send(String s); }

package com.google.firebase.messaging;
public class FirebaseMessagingService extends android.app.Service {
    @Override public android.os.IBinder onBind(android.content.Intent i) { return null; }
    public void onNewToken(String token) { }
    public void onMessageReceived(RemoteMessage m) { }
}

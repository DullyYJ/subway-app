package com.android.billingclient.api;
import android.content.Context;
import android.app.Activity;
public abstract class BillingClient {
    public static final class ProductType { public static final String SUBS = "subs"; public static final String INAPP = "inapp"; }
    public static final class BillingResponseCode { public static final int OK = 0, USER_CANCELED = 1, ITEM_ALREADY_OWNED = 7; }
    public static Builder newBuilder(Context c) { return new Builder(); }
    public static final class Builder {
        public Builder setListener(PurchasesUpdatedListener l) { return this; }
        public Builder enablePendingPurchases(PendingPurchasesParams p) { return this; }
        public Builder enableAutoServiceReconnection() { return this; }
        public BillingClient build() { return null; }
    }
    public abstract boolean isReady();
    public abstract void startConnection(BillingClientStateListener l);
    public abstract void queryProductDetailsAsync(QueryProductDetailsParams p, ProductDetailsResponseListener l);
    public abstract BillingResult launchBillingFlow(Activity a, BillingFlowParams p);
    public abstract void queryPurchasesAsync(QueryPurchasesParams p, PurchasesResponseListener l);
}

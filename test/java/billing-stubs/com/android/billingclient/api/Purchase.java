package com.android.billingclient.api;
import java.util.List;
public class Purchase {
    public static final class PurchaseState { public static final int UNSPECIFIED_STATE = 0, PURCHASED = 1, PENDING = 2; }
    public int getPurchaseState() { return 0; }
    public String getPurchaseToken() { return ""; }
    public List<String> getProducts() { return null; }
}

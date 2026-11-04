package com.android.billingclient.api;
import java.util.List;
public interface PurchasesResponseListener { void onQueryPurchasesResponse(BillingResult r, List<Purchase> list); }

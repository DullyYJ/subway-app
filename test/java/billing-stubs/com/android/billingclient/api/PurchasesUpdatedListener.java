package com.android.billingclient.api;
import java.util.List;
public interface PurchasesUpdatedListener { void onPurchasesUpdated(BillingResult r, List<Purchase> list); }

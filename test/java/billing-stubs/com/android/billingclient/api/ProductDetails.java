package com.android.billingclient.api;
import java.util.List;
public final class ProductDetails {
    public String getProductId() { return ""; }
    public List<SubscriptionOfferDetails> getSubscriptionOfferDetails() { return null; }
    public static final class SubscriptionOfferDetails {
        public String getBasePlanId() { return ""; }
        public String getOfferId() { return null; }
        public String getOfferToken() { return ""; }
        public PricingPhases getPricingPhases() { return null; }
    }
    public static final class PricingPhases { public List<PricingPhase> getPricingPhaseList() { return null; } }
    public static final class PricingPhase { public long getPriceAmountMicros() { return 0L; } }
}

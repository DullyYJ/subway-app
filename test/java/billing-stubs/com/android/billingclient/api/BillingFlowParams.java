package com.android.billingclient.api;
import java.util.List;
public final class BillingFlowParams {
    public static Builder newBuilder() { return new Builder(); }
    public static final class Builder { public Builder setProductDetailsParamsList(List<ProductDetailsParams> l) { return this; } public BillingFlowParams build() { return new BillingFlowParams(); } }
    public static final class ProductDetailsParams {
        public static Builder newBuilder() { return new Builder(); }
        public static final class Builder { public Builder setProductDetails(ProductDetails p) { return this; } public Builder setOfferToken(String s) { return this; } public ProductDetailsParams build() { return new ProductDetailsParams(); } }
    }
}

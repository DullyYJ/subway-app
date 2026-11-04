package com.android.billingclient.api;
import java.util.List;
public final class QueryProductDetailsParams {
    public static Builder newBuilder() { return new Builder(); }
    public static final class Builder { public Builder setProductList(List<Product> l) { return this; } public QueryProductDetailsParams build() { return new QueryProductDetailsParams(); } }
    public static final class Product {
        public static Builder newBuilder() { return new Builder(); }
        public static final class Builder { public Builder setProductId(String s) { return this; } public Builder setProductType(String s) { return this; } public Product build() { return new Product(); } }
    }
}

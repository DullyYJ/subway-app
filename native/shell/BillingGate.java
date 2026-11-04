package com.dullyyj.subway;

import android.app.Activity;

import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.ProductDetailsResponseListener;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesResponseListener;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryProductDetailsResult;
import com.android.billingclient.api.QueryPurchasesParams;

import java.util.Collections;
import java.util.List;

/**
 * s431 구독 결제 문(門). 앱은 '결제 창을 띄우고 영수증(구매 토큰)을 서버에 전해 주는' 일만 한다 — 샀는지 · 언제까지인지는 서버가 구글에 직접 물어 정한다.
 * 서버가 구독을 꺼 두는 동안(BILLING_MODE 기본 off)에는 서버가 구독 화면을 보내지 않으므로 이 클래스는 만들어지지도 않는다(앱 시작 속도 그대로).
 * 처음 단추를 눌렀을 때에야 Play 결제에 연결한다. 상품 · 요금제 이름은 서버 화면이 준다.
 */
final class BillingGate implements PurchasesUpdatedListener {
    /** 결과를 앱 쪽에 전한다(모두 메인 스레드). */
    interface Out {
        void onToken(String token);          // 구매 토큰 — 서버에 보내 확인받는다
        void onMsg(String msg);              // 사용자에게 한 줄 안내
    }

    static final String PRODUCT = "gildongmu_gps";
    private final Activity act;
    private final Out out;
    private BillingClient bc;
    private String wantProduct = PRODUCT, wantPlan = "monthly";

    BillingGate(Activity act, Out out) { this.act = act; this.out = out; }

    /** 상품 · 요금제 이름이 서버가 준 모양인지(영문 소문자 · 숫자 · _ · -) */
    static boolean nameOk(String s) { return s != null && s.length() > 0 && s.length() <= 40 && s.matches("[a-z0-9_-]+"); }

    void buy(String product, String plan) {
        if (!nameOk(product) || !nameOk(plan)) { out.onMsg("결제 정보를 읽지 못했어요"); return; }
        wantProduct = product; wantPlan = plan;
        ready(new Runnable() { @Override public void run() { queryAndLaunch(); } });
    }

    void restore() {
        ready(new Runnable() { @Override public void run() { queryOwned(); } });
    }

    private void ready(final Runnable next) {
        if (bc == null) {
            PendingPurchasesParams pp = PendingPurchasesParams.newBuilder().enableOneTimeProducts().build();
            bc = BillingClient.newBuilder(act.getApplicationContext()).setListener(this).enablePendingPurchases(pp).enableAutoServiceReconnection().build();
        }
        if (bc.isReady()) { next.run(); return; }
        bc.startConnection(new BillingClientStateListener() {
            @Override public void onBillingSetupFinished(BillingResult r) {
                if (r.getResponseCode() == BillingClient.BillingResponseCode.OK) next.run();
                else out.onMsg("구글 Play 결제에 연결하지 못했어요. 잠시 뒤 다시 해 주세요");
            }
            @Override public void onBillingServiceDisconnected() { /* 자동 재연결(enableAutoServiceReconnection) */ }
        });
    }

    private void queryAndLaunch() {
        QueryProductDetailsParams.Product p = QueryProductDetailsParams.Product.newBuilder().setProductId(wantProduct).setProductType(BillingClient.ProductType.SUBS).build();
        QueryProductDetailsParams q = QueryProductDetailsParams.newBuilder().setProductList(Collections.singletonList(p)).build();
        bc.queryProductDetailsAsync(q, new ProductDetailsResponseListener() {
            @Override public void onProductDetailsResponse(BillingResult r, QueryProductDetailsResult res) {
                List<ProductDetails> l = r.getResponseCode() == BillingClient.BillingResponseCode.OK && res != null ? res.getProductDetailsList() : null;
                ProductDetails pd = l != null && !l.isEmpty() ? l.get(0) : null;
                String tok = pd == null ? "" : offerToken(pd.getSubscriptionOfferDetails(), wantPlan);
                if (pd == null || tok.length() == 0) { out.onMsg("지금은 구독 상품을 불러오지 못했어요"); return; }
                BillingFlowParams.ProductDetailsParams dp = BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(pd).setOfferToken(tok).build();
                BillingFlowParams fp = BillingFlowParams.newBuilder().setProductDetailsParamsList(Collections.singletonList(dp)).build();
                BillingResult lr = bc.launchBillingFlow(act, fp);
                int c = lr.getResponseCode();
                if (c == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) restore();
                else if (c != BillingClient.BillingResponseCode.OK) out.onMsg("결제 창을 열지 못했어요");
            }
        });
    }

    /** 그 요금제(basePlan)의 혜택 중 무료 체험이 있는 것을 먼저, 없으면 기본 요금(혜택 없는 것), 그것도 없으면 첫 번째. 요금제가 없으면 "" */
    static String offerToken(List<ProductDetails.SubscriptionOfferDetails> offers, String plan) {
        if (offers == null) return "";
        String trial = "", base = "", any = "";
        for (ProductDetails.SubscriptionOfferDetails o : offers) {
            if (o == null || !plan.equals(o.getBasePlanId())) continue;
            if (any.length() == 0) any = o.getOfferToken();
            List<ProductDetails.PricingPhase> ph = o.getPricingPhases() == null ? null : o.getPricingPhases().getPricingPhaseList();
            if (ph != null && !ph.isEmpty() && ph.get(0).getPriceAmountMicros() == 0L && trial.length() == 0) trial = o.getOfferToken();
            if (o.getOfferId() == null && base.length() == 0) base = o.getOfferToken();
        }
        return trial.length() > 0 ? trial : base.length() > 0 ? base : any;
    }

    private void queryOwned() {
        QueryPurchasesParams q = QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build();
        bc.queryPurchasesAsync(q, new PurchasesResponseListener() {
            @Override public void onQueryPurchasesResponse(BillingResult r, List<Purchase> list) {
                if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) { out.onMsg("구매 내역을 불러오지 못했어요"); return; }
                if (!deliver(list)) out.onMsg("복원할 구독이 없어요");
            }
        });
    }

    @Override public void onPurchasesUpdated(BillingResult r, List<Purchase> list) {
        int c = r.getResponseCode();
        if (c == BillingClient.BillingResponseCode.OK) { if (!deliver(list)) out.onMsg("결제 승인을 기다리고 있어요. 끝나면 자동으로 열려요"); }
        else if (c == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) restore();
        else if (c != BillingClient.BillingResponseCode.USER_CANCELED) out.onMsg("결제가 끝나지 않았어요");
    }

    /** 결제가 끝난(PURCHASED) 우리 상품의 토큰을 서버로 넘긴다. 승인 대기(PENDING)는 넘기지 않는다. */
    private boolean deliver(List<Purchase> list) {
        if (list == null) return false;
        for (Purchase p : list) {
            if (p == null || p.getPurchaseState() != Purchase.PurchaseState.PURCHASED) continue;
            if (p.getProducts() == null || !p.getProducts().contains(PRODUCT)) continue;
            out.onToken(p.getPurchaseToken());
            return true;
        }
        return false;
    }
}

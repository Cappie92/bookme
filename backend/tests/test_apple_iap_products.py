from utils.apple_iap_products import (
    APPLE_IAP_DURATIONS,
    APPLE_IAP_PAID_PLAN_NAMES,
    get_apple_product_id,
    list_apple_iap_product_ids,
    resolve_apple_product,
)


def test_twelve_unique_products():
    ids = list_apple_iap_product_ids()
    assert len(ids) == 12
    assert len(set(ids)) == 12


def test_basic_pro_premium_mapping():
    assert get_apple_product_id("Basic", 1) == "dedato_basic_1m"
    assert get_apple_product_id("Basic", 3) == "dedato_basic_3m"
    assert get_apple_product_id("Basic", 6) == "dedato_basic_6m"
    assert get_apple_product_id("Basic", 12) == "dedato_basic_12m"
    assert get_apple_product_id("Pro", 1) == "dedato_pro_1m"
    assert get_apple_product_id("Pro", 6) == "dedato_pro_6m"
    assert get_apple_product_id("Premium", 1) == "dedato_premium_1m"
    assert get_apple_product_id("Premium", 12) == "dedato_premium_12m"


def test_resolve_roundtrip():
    for plan in APPLE_IAP_PAID_PLAN_NAMES:
        for months in APPLE_IAP_DURATIONS:
            pid = get_apple_product_id(plan, months)
            assert resolve_apple_product(pid) == (plan, months)


def test_unknown_product():
    assert resolve_apple_product("dedato_unknown_1m") is None
    assert get_apple_product_id("Free", 1) is None

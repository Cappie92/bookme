from utils.apple_iap_products import (
    APPLE_IAP_DURATIONS,
    APPLE_IAP_PAID_PLAN_NAMES,
    get_apple_product_id,
    list_apple_iap_product_ids,
    resolve_apple_product,
    resolve_apple_product_details,
)

EXPECTED_PRODUCT_IDS = [
    "ru.dedato.subscription.basic.monthly",
    "ru.dedato.subscription.basic.3months",
    "ru.dedato.subscription.basic.6months",
    "ru.dedato.subscription.basic.yearly",
    "ru.dedato.subscription.standard.monthly",
    "ru.dedato.subscription.standard.3months",
    "ru.dedato.subscription.standard.6months",
    "ru.dedato.subscription.standard.yearly",
    "dedato_premium_monthly",
    "ru.dedato.subscription.premium.3months",
    "ru.dedato.subscription.premium.6months",
    "ru.dedato.subscription.premium.yearly",
]


def test_twelve_unique_products():
    ids = list_apple_iap_product_ids()
    assert ids == EXPECTED_PRODUCT_IDS
    assert len(set(ids)) == 12


def test_basic_pro_premium_mapping():
    assert get_apple_product_id("Basic", 1) == EXPECTED_PRODUCT_IDS[0]
    assert get_apple_product_id("Basic", 3) == EXPECTED_PRODUCT_IDS[1]
    assert get_apple_product_id("Basic", 6) == EXPECTED_PRODUCT_IDS[2]
    assert get_apple_product_id("Basic", 12) == EXPECTED_PRODUCT_IDS[3]
    assert get_apple_product_id("Pro", 1) == EXPECTED_PRODUCT_IDS[4]
    assert get_apple_product_id("Pro", 6) == EXPECTED_PRODUCT_IDS[6]
    assert get_apple_product_id("Premium", 1) == EXPECTED_PRODUCT_IDS[8]
    assert get_apple_product_id("Premium", 12) == EXPECTED_PRODUCT_IDS[11]


def test_apple_standard_resolves_to_internal_pro_only():
    product = resolve_apple_product_details("ru.dedato.subscription.standard.monthly")
    assert product is not None
    assert product.internal_plan_name == "Pro"
    assert product.external_tier == "Standard"
    assert "Standart" not in APPLE_IAP_PAID_PLAN_NAMES


def test_resolve_roundtrip():
    for plan in APPLE_IAP_PAID_PLAN_NAMES:
        for months in APPLE_IAP_DURATIONS:
            pid = get_apple_product_id(plan, months)
            assert resolve_apple_product(pid) == (plan, months)


def test_unknown_product():
    assert resolve_apple_product("dedato_unknown_1m") is None
    assert get_apple_product_id("Free", 1) is None

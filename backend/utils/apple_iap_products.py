"""
Canonical Apple IAP product IDs for DeDato subscriptions.

Keep in sync with shared/appleIapProducts.js
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

APPLE_IAP_DURATIONS: Tuple[int, ...] = (1, 3, 6, 12)
APPLE_IAP_PAID_PLAN_NAMES: Tuple[str, ...] = ("Basic", "Pro", "Premium")
APPLE_IAP_EXTERNAL_TIER_BY_PLAN: Dict[str, str] = {
    "Basic": "Basic",
    "Pro": "Standard",
    "Premium": "Premium",
}

APPLE_IAP_PRODUCT_MAP: Dict[str, Dict[int, str]] = {
    "Basic": {
        1: "ru.dedato.subscription.basic.monthly",
        3: "ru.dedato.subscription.basic.3months",
        6: "ru.dedato.subscription.basic.6months",
        12: "ru.dedato.subscription.basic.yearly",
    },
    "Pro": {
        1: "ru.dedato.subscription.standard.monthly",
        3: "ru.dedato.subscription.standard.3months",
        6: "ru.dedato.subscription.standard.6months",
        12: "ru.dedato.subscription.standard.yearly",
    },
    "Premium": {
        1: "dedato_premium_monthly",
        3: "ru.dedato.subscription.premium.3months",
        6: "ru.dedato.subscription.premium.6months",
        12: "ru.dedato.subscription.premium.yearly",
    },
}


@dataclass(frozen=True)
class AppleIapProduct:
    product_id: str
    duration_months: int
    internal_plan_name: str
    external_tier: str


def list_apple_iap_product_ids() -> List[str]:
    ids: List[str] = []
    for plan in APPLE_IAP_PAID_PLAN_NAMES:
        for months in APPLE_IAP_DURATIONS:
            ids.append(APPLE_IAP_PRODUCT_MAP[plan][months])
    return ids


def get_apple_product_id(plan_name: str, months: int) -> Optional[str]:
    by_plan = APPLE_IAP_PRODUCT_MAP.get(plan_name)
    if not by_plan:
        return None
    return by_plan.get(int(months))


def resolve_apple_product(product_id: str) -> Optional[Tuple[str, int]]:
    if not product_id:
        return None
    for plan in APPLE_IAP_PAID_PLAN_NAMES:
        for months in APPLE_IAP_DURATIONS:
            if APPLE_IAP_PRODUCT_MAP[plan][months] == product_id:
                return plan, months
    return None


def resolve_apple_product_details(product_id: str) -> Optional[AppleIapProduct]:
    resolved = resolve_apple_product(product_id)
    if resolved is None:
        return None
    plan_name, months = resolved
    return AppleIapProduct(
        product_id=product_id,
        duration_months=months,
        internal_plan_name=plan_name,
        external_tier=APPLE_IAP_EXTERNAL_TIER_BY_PLAN[plan_name],
    )


def is_apple_iap_paid_plan_name(plan_name: str) -> bool:
    return plan_name in APPLE_IAP_PAID_PLAN_NAMES

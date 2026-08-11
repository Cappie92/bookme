"""
Canonical Apple IAP product IDs for DeDato subscriptions.

Keep in sync with shared/appleIapProducts.js
"""

from __future__ import annotations

from typing import Dict, List, Optional, Tuple

APPLE_IAP_DURATIONS: Tuple[int, ...] = (1, 3, 6, 12)
APPLE_IAP_PAID_PLAN_NAMES: Tuple[str, ...] = ("Basic", "Pro", "Premium")

APPLE_IAP_PRODUCT_MAP: Dict[str, Dict[int, str]] = {
    "Basic": {
        1: "dedato_basic_1m",
        3: "dedato_basic_3m",
        6: "dedato_basic_6m",
        12: "dedato_basic_12m",
    },
    "Pro": {
        1: "dedato_pro_1m",
        3: "dedato_pro_3m",
        6: "dedato_pro_6m",
        12: "dedato_pro_12m",
    },
    "Premium": {
        1: "dedato_premium_1m",
        3: "dedato_premium_3m",
        6: "dedato_premium_6m",
        12: "dedato_premium_12m",
    },
}


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


def is_apple_iap_paid_plan_name(plan_name: str) -> bool:
    return plan_name in APPLE_IAP_PAID_PLAN_NAMES

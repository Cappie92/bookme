"""
Тесты для утилит проверки доступа к функциям подписки.
MVP: планы используют price_1month…price_12months; длительности 30/90/180/360 дней.
"""
import pytest
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

from constants import duration_months_to_days
from models import User, UserRole, Master, Subscription, SubscriptionPlan, SubscriptionType, SubscriptionStatus
from utils.subscription_features import (
    can_customize_domain,
    can_add_page_module,
    has_finance_access,
    has_extended_stats,
    get_master_features
)


@pytest.fixture
def master_user(db: Session):
    """Создает мастера для тестов."""
    from auth import get_password_hash
    user = User(
        email="master@test.com",
        phone="+79991234567",
        hashed_password=get_password_hash("testpass123"),
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    
    # Создаем профиль мастера
    master = Master(
        user_id=user.id,
        can_work_independently=True,
        can_work_in_salon=False
    )
    db.add(master)
    db.commit()
    db.refresh(master)
    
    return user


# service_functions: 1=booking, 2=extended_stats, 3=loyalty, 4=finance, 5=client_restrictions, 6=customize_domain

@pytest.fixture
def free_plan(db: Session):
    """Создает бесплатный план. MVP: price_1month…price_12months, service_functions по ID."""
    plan = SubscriptionPlan(
        name="Free",
        display_name="Free",
        subscription_type=SubscriptionType.MASTER,
        price_1month=0.0,
        price_3months=0.0,
        price_6months=0.0,
        price_12months=0.0,
        features={"service_functions": [], "max_page_modules": 0},
        limits={},
        is_active=True,
        display_order=1
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


@pytest.fixture
def basic_plan(db: Session):
    """Создает базовый план. service_functions 1,6 + max_page_modules 1."""
    plan = SubscriptionPlan(
        name="Basic",
        display_name="Basic",
        subscription_type=SubscriptionType.MASTER,
        price_1month=500.0,
        price_3months=450.0,
        price_6months=400.0,
        price_12months=350.0,
        features={"service_functions": [1, 6], "max_page_modules": 1},
        limits={},
        is_active=True,
        display_order=2
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


@pytest.fixture
def premium_plan(db: Session):
    """Создает премиум план. service_functions 1–6 + max_page_modules."""
    plan = SubscriptionPlan(
        name="Premium",
        display_name="Premium",
        subscription_type=SubscriptionType.MASTER,
        price_1month=3000.0,
        price_3months=2700.0,
        price_6months=2400.0,
        price_12months=2100.0,
        features={"service_functions": [1, 2, 3, 4, 5, 6], "max_page_modules": 999999},
        limits={},
        is_active=True,
        display_order=4
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


class TestSubscriptionFeatures:
    """Тесты проверки доступа к функциям."""

    def test_no_subscription_returns_false(self, db: Session, master_user: User):
        """Тест что без подписки все функции недоступны."""
        assert can_customize_domain(db, master_user.id) is False
        assert can_add_page_module(db, master_user.id) is False
        assert has_finance_access(db, master_user.id) is False
        assert has_extended_stats(db, master_user.id) is False

    def test_free_plan_restrictions(self, db: Session, master_user: User, free_plan: SubscriptionPlan):
        """Тест ограничений бесплатного плана. MVP: 30 дней через duration_months_to_days(1)."""
        days = duration_months_to_days(1)
        subscription = Subscription(
            user_id=master_user.id,
            subscription_type=SubscriptionType.MASTER,
            plan_id=free_plan.id,
            status=SubscriptionStatus.ACTIVE,
            is_active=True,
            start_date=datetime.utcnow(),
            end_date=datetime.utcnow() + timedelta(days=days),
            price=0.0,
            daily_rate=0.0
        )
        db.add(subscription)
        db.commit()
        assert can_customize_domain(db, master_user.id) is False
        assert has_finance_access(db, master_user.id) is False
        assert has_extended_stats(db, master_user.id) is False

    def test_basic_plan_features(self, db: Session, master_user: User, basic_plan: SubscriptionPlan):
        """Тест функций базового плана. MVP: daily_rate = price / duration_days; service_functions [1,6]."""
        days = duration_months_to_days(1)
        price = 500.0
        subscription = Subscription(
            user_id=master_user.id,
            subscription_type=SubscriptionType.MASTER,
            plan_id=basic_plan.id,
            status=SubscriptionStatus.ACTIVE,
            is_active=True,
            start_date=datetime.utcnow(),
            end_date=datetime.utcnow() + timedelta(days=days),
            price=price,
            daily_rate=price / days
        )
        db.add(subscription)
        db.commit()
        assert can_customize_domain(db, master_user.id) is True
        assert has_finance_access(db, master_user.id) is False
        assert has_extended_stats(db, master_user.id) is False

    def test_premium_plan_all_features(self, db: Session, master_user: User, premium_plan: SubscriptionPlan):
        """Тест что премиум план имеет все функции. service_functions [1–6]."""
        days = duration_months_to_days(1)
        price = 3000.0
        subscription = Subscription(
            user_id=master_user.id,
            subscription_type=SubscriptionType.MASTER,
            plan_id=premium_plan.id,
            status=SubscriptionStatus.ACTIVE,
            is_active=True,
            start_date=datetime.utcnow(),
            end_date=datetime.utcnow() + timedelta(days=days),
            price=price,
            daily_rate=price / days
        )
        db.add(subscription)
        db.commit()
        assert can_customize_domain(db, master_user.id) is True
        assert has_finance_access(db, master_user.id) is True
        assert has_extended_stats(db, master_user.id) is True

    def test_expired_subscription_returns_false(self, db: Session, master_user: User, premium_plan: SubscriptionPlan):
        """Тест что истекшая подписка не дает доступ."""
        days = duration_months_to_days(1)
        subscription = Subscription(
            user_id=master_user.id,
            subscription_type=SubscriptionType.MASTER,
            plan_id=premium_plan.id,
            status=SubscriptionStatus.EXPIRED,
            is_active=False,
            start_date=datetime.utcnow() - timedelta(days=60),
            end_date=datetime.utcnow() - timedelta(days=30),
            price=3000.0,
            daily_rate=3000.0 / days
        )
        db.add(subscription)
        db.commit()
        assert can_customize_domain(db, master_user.id) is False
        assert has_finance_access(db, master_user.id) is False

    def test_get_master_features(self, db: Session, master_user: User, basic_plan: SubscriptionPlan):
        """Тест получения всех функций мастера."""
        days = duration_months_to_days(1)
        price = 500.0
        subscription = Subscription(
            user_id=master_user.id,
            subscription_type=SubscriptionType.MASTER,
            plan_id=basic_plan.id,
            status=SubscriptionStatus.ACTIVE,
            is_active=True,
            start_date=datetime.utcnow(),
            end_date=datetime.utcnow() + timedelta(days=days),
            price=price,
            daily_rate=price / days
        )
        db.add(subscription)
        db.commit()
        features = get_master_features(db, master_user.id)
        assert features["can_customize_domain"] is True
        assert features["has_finance_access"] is False
        assert features["has_extended_stats"] is False
        assert features["max_page_modules"] == 1
        assert features["plan_name"] == "Basic"


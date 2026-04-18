"""
Тесты для API управления планами подписки (admin-only).
MVP: планы используют price_1month…price_12months.
Auth: admin_auth_headers, master_auth_headers из conftest.
"""
import pytest
from fastapi import status
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from models import SubscriptionPlan, SubscriptionType

# Цены по пакетам (1/3/6/12 мес.), 1m >= 3m >= 6m >= 12m
PLAN_PRICES = {
    "price_1month": 1000.0,
    "price_3months": 900.0,
    "price_6months": 800.0,
    "price_12months": 700.0,
}


class TestSubscriptionPlansCRUD:
    """Тесты CRUD операций для планов подписки."""

    def test_create_plan_as_admin(self, client: TestClient, admin_auth_headers):
        """Тест создания плана администратором. MVP: price_1month…price_12months."""
        plan_data = {
            "name": "Test Plan",
            "subscription_type": "master",
            **PLAN_PRICES,
            "features": {
                "can_customize_domain": True,
                "can_add_page_modules": True,
                "has_finance_access": False,
                "has_extended_stats": False,
                "max_page_modules": 3,
                "stats_retention_days": 90
            },
            "limits": {"bookings_per_month": 0, "services_count": 0},
            "is_active": True,
            "display_order": 1
        }
        response = client.post(
            "/api/admin/subscription-plans",
            json=plan_data,
            headers=admin_auth_headers
        )
        assert response.status_code in [status.HTTP_200_OK, status.HTTP_201_CREATED]
        data = response.json()
        assert data["name"] == "Test Plan"
        assert data["price_1month"] == PLAN_PRICES["price_1month"]
        assert data["features"]["can_customize_domain"] is True

    def test_create_plan_as_master_forbidden(self, client: TestClient, master_auth_headers):
        """Тест что мастер не может создавать планы."""
        plan_data = {
            "name": "Test Plan",
            "subscription_type": "master",
            **PLAN_PRICES,
            "features": {},
            "limits": {},
            "is_active": True,
            "display_order": 1
        }
        response = client.post(
            "/api/admin/subscription-plans",
            json=plan_data,
            headers=master_auth_headers
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_get_all_plans_as_admin(self, client: TestClient, admin_auth_headers, db: Session):
        """Тест получения всех планов администратором. MVP: price_1month…price_12months."""
        plan = SubscriptionPlan(
            name="Test Plan",
            subscription_type=SubscriptionType.MASTER,
            **PLAN_PRICES,
            features={"can_customize_domain": True},
            limits={},
            is_active=True,
            display_order=1
        )
        db.add(plan)
        db.commit()
        response = client.get(
            "/api/admin/subscription-plans",
            headers=admin_auth_headers
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1

    def test_update_plan(self, client: TestClient, admin_auth_headers, db: Session):
        """Тест обновления плана. MVP: price_1month…price_12months."""
        plan = SubscriptionPlan(
            name="Test Plan",
            subscription_type=SubscriptionType.MASTER,
            **PLAN_PRICES,
            features={},
            limits={},
            is_active=True,
            display_order=1
        )
        db.add(plan)
        db.commit()
        db.refresh(plan)
        update_data = {
            "price_1month": 1500.0,
            "price_3months": 1400.0,
            "price_6months": 1300.0,
            "price_12months": 1200.0,
            "features": {"can_customize_domain": True}
        }
        response = client.put(
            f"/api/admin/subscription-plans/{plan.id}",
            json=update_data,
            headers=admin_auth_headers
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["price_1month"] == 1500.0
        assert data["features"]["can_customize_domain"] is True

    def test_delete_plan(self, client: TestClient, admin_auth_headers, db: Session):
        """Тест удаления плана. MVP: price_1month…price_12months."""
        plan = SubscriptionPlan(
            name="Test Plan",
            subscription_type=SubscriptionType.MASTER,
            **PLAN_PRICES,
            features={},
            limits={},
            is_active=True,
            display_order=1
        )
        db.add(plan)
        db.commit()
        db.refresh(plan)
        response = client.delete(
            f"/api/admin/subscription-plans/{plan.id}",
            headers=admin_auth_headers
        )
        
        assert response.status_code == status.HTTP_204_NO_CONTENT
        
        # Проверяем что план удален
        deleted_plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == plan.id).first()
        assert deleted_plan is None


class TestPublicSubscriptionPlans:
    """Тесты публичного API для получения планов."""

    def test_get_public_plans(self, client: TestClient, db: Session):
        """Тест получения публичных планов без авторизации. MVP: price_1month…price_12months."""
        active_plan = SubscriptionPlan(
            name="Active Plan",
            subscription_type=SubscriptionType.MASTER,
            **PLAN_PRICES,
            features={},
            limits={},
            is_active=True,
            display_order=1
        )
        inactive_plan = SubscriptionPlan(
            name="Inactive Plan",
            subscription_type=SubscriptionType.MASTER,
            price_1month=2000.0,
            price_3months=1900.0,
            price_6months=1800.0,
            price_12months=1700.0,
            features={},
            limits={},
            is_active=False,
            display_order=2
        )
        db.add(active_plan)
        db.add(inactive_plan)
        db.commit()
        
        response = client.get("/api/subscription-plans/available?subscription_type=master")
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert isinstance(data, list)
        # Должны вернуться только активные планы
        plan_names = [p["name"] for p in data]
        assert "Active Plan" in plan_names
        assert "Inactive Plan" not in plan_names


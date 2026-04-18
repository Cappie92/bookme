"""
Тесты для API расширенной статистики.
"""
import pytest
from fastapi import status
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from datetime import datetime, timedelta

from models import User, UserRole, Master, Subscription, SubscriptionPlan, SubscriptionType, SubscriptionStatus, Booking, BookingStatus


@pytest.fixture
def master_with_premium(db: Session):
    """Создает мастера с премиум подпиской."""
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
    
    master = Master(
        user_id=user.id,
        can_work_independently=True
    )
    db.add(master)
    db.commit()
    db.refresh(master)
    
    # Создаем премиум план (доступ к расширенной статистике: service_functions 2 = has_extended_stats)
    plan = SubscriptionPlan(
        name="Premium",
        subscription_type=SubscriptionType.MASTER,
        price_1month=3000.0,
        price_3months=2800.0,
        price_6months=2600.0,
        price_12months=2400.0,
        features={
            "service_functions": [1, 2, 3, 4, 5, 6, 7],
            "max_page_modules": 3,
        },
        limits={},
        is_active=True,
        display_order=1
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    
    # Создаем подписку
    subscription = Subscription(
        user_id=user.id,
        subscription_type=SubscriptionType.MASTER,
        plan_id=plan.id,
        status=SubscriptionStatus.ACTIVE,
        start_date=datetime.utcnow(),
        end_date=datetime.utcnow() + timedelta(days=30),
        price=3000.0,
        daily_rate=3000.0 / 30
    )
    db.add(subscription)
    db.commit()
    
    return user


@pytest.fixture
def master_without_premium(db: Session):
    """Создает мастера без премиум подписки."""
    from auth import get_password_hash
    
    user = User(
        email="master2@test.com",
        phone="+79991234568",
        hashed_password=get_password_hash("testpass123"),
        role=UserRole.MASTER,
        is_active=True,
        is_verified=True
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    
    master = Master(
        user_id=user.id,
        can_work_independently=True
    )
    db.add(master)
    db.commit()
    
    return user


@pytest.fixture
def premium_token(client: TestClient, master_with_premium: User):
    """Получает токен мастера с премиум."""
    response = client.post(
        "/api/auth/login",
        json={"phone": master_with_premium.phone, "password": "testpass123"}
    )
    assert response.status_code == 200
    return response.json()["access_token"]


@pytest.fixture
def basic_token(client: TestClient, master_without_premium: User):
    """Получает токен мастера без премиум."""
    response = client.post(
        "/api/auth/login",
        json={"phone": master_without_premium.phone, "password": "testpass123"}
    )
    assert response.status_code == 200
    return response.json()["access_token"]


class TestExtendedStats:
    """Тесты для расширенной статистики."""

    def test_get_extended_stats_with_premium(self, client: TestClient, premium_token: str):
        """Тест получения расширенной статистики с премиум подпиской."""
        response = client.get(
            "/api/master/stats/extended?period=month&compare_period=true",
            headers={"Authorization": f"Bearer {premium_token}"}
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "current_period" in data
        assert "previous_period" in data
        assert "comparison" in data
        assert "trends" in data
        assert "forecast" in data

    def test_get_extended_stats_without_premium_forbidden(self, client: TestClient, basic_token: str):
        """Тест что без премиум подписки расширенная статистика недоступна."""
        response = client.get(
            "/api/master/stats/extended?period=month&compare_period=true",
            headers={"Authorization": f"Bearer {basic_token}"}
        )
        
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert "premium" in response.json()["detail"].lower() or "расширенная" in response.json()["detail"].lower()

    def test_extended_stats_includes_comparison(self, client: TestClient, premium_token: str, db: Session, master_with_premium: User):
        """Тест что расширенная статистика включает сравнение периодов."""
        # Создаем тестовые записи
        master = db.query(Master).filter(Master.user_id == master_with_premium.id).first()
        
        # Записи текущего месяца
        for i in range(5):
            booking = Booking(
                master_id=master.id,
                client_id=1,  # Заглушка
                service_id=1,  # Заглушка
                start_time=datetime.utcnow() - timedelta(days=i),
                end_time=datetime.utcnow() - timedelta(days=i) + timedelta(hours=1),
                status=BookingStatus.COMPLETED,
                payment_amount=1000.0
            )
            db.add(booking)
        
        # Записи прошлого месяца
        for i in range(3):
            booking = Booking(
                master_id=master.id,
                client_id=1,
                service_id=1,
                start_time=datetime.utcnow() - timedelta(days=35+i),
                end_time=datetime.utcnow() - timedelta(days=35+i) + timedelta(hours=1),
                status=BookingStatus.COMPLETED,
                payment_amount=1000.0
            )
            db.add(booking)
        
        db.commit()
        
        response = client.get(
            "/api/master/stats/extended?period=month&compare_period=true",
            headers={"Authorization": f"Bearer {premium_token}"}
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "comparison" in data
        assert "revenue_change_percent" in data["comparison"]
        assert "bookings_change_percent" in data["comparison"]


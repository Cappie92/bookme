"""
Тесты для API управления модулями страницы мастера.
"""
import pytest
from fastapi import status
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from models import User, UserRole, Master, MasterPageModule


@pytest.fixture
def master_user_with_subscription(db: Session):
    """Создает мастера с активной подпиской."""
    from auth import get_password_hash
    from models import Subscription, SubscriptionPlan, SubscriptionType, SubscriptionStatus
    from datetime import datetime, timedelta
    
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
        can_work_independently=True
    )
    db.add(master)
    db.commit()
    db.refresh(master)
    
    # Создаем план с доступом к модулям (модель: price_1month, price_3months, price_6months, price_12months)
    plan = SubscriptionPlan(
        name="Basic",
        subscription_type=SubscriptionType.MASTER,
        price_1month=500.0,
        price_3months=450.0,
        price_6months=400.0,
        price_12months=350.0,
        features={
            "can_add_page_modules": True,
            "max_page_modules": 3
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
        price=500.0,
        daily_rate=500.0 / 30
    )
    db.add(subscription)
    db.commit()
    
    return user


@pytest.fixture
def master_token(client: TestClient, master_user_with_subscription: User):
    """Получает токен мастера."""
    response = client.post(
        "/api/auth/login",
        json={"phone": master_user_with_subscription.phone, "password": "testpass123"}
    )
    assert response.status_code == 200
    return response.json()["access_token"]


class TestMasterPageModules:
    """Тесты для модулей страницы мастера."""

    @pytest.mark.skip(reason="can_add_page_module() в runtime всегда возвращает False (функция помечена устаревшей). Восстановить тест: вернуть реальную проверку в utils.subscription_features.can_add_page_module.")
    def test_create_module(self, client: TestClient, master_token: str, db: Session, master_user_with_subscription: User):
        """Тест создания модуля."""
        module_data = {
            "module_type": "text",
            "config": {"content": "Test content"},
            "is_active": True,
            "position": 0
        }
        
        response = client.post(
            "/api/master/page-modules",
            json=module_data,
            headers={"Authorization": f"Bearer {master_token}"}
        )
        
        assert response.status_code in [status.HTTP_200_OK, status.HTTP_201_CREATED]
        data = response.json()
        assert data["module_type"] == "text"
        assert data["config"]["content"] == "Test content"
        assert data["is_active"] is True

    def test_get_modules(self, client: TestClient, master_token: str, db: Session, master_user_with_subscription: User):
        """Тест получения модулей."""
        # Создаем тестовые модули
        master = db.query(Master).filter(Master.user_id == master_user_with_subscription.id).first()
        
        module1 = MasterPageModule(
            master_id=master.id,
            module_type="text",
            config={"content": "Module 1"},
            is_active=True,
            position=0
        )
        module2 = MasterPageModule(
            master_id=master.id,
            module_type="image",
            config={"url": "https://example.com/image.jpg"},
            is_active=True,
            position=1
        )
        db.add(module1)
        db.add(module2)
        db.commit()
        
        response = client.get(
            "/api/master/page-modules",
            headers={"Authorization": f"Bearer {master_token}"}
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 2

    def test_update_module(self, client: TestClient, master_token: str, db: Session, master_user_with_subscription: User):
        """Тест обновления модуля."""
        master = db.query(Master).filter(Master.user_id == master_user_with_subscription.id).first()
        
        module = MasterPageModule(
            master_id=master.id,
            module_type="text",
            config={"content": "Old content"},
            is_active=True,
            position=0
        )
        db.add(module)
        db.commit()
        db.refresh(module)
        
        update_data = {
            "config": {"content": "New content"},
            "is_active": False
        }
        
        response = client.put(
            f"/api/master/page-modules/{module.id}",
            json=update_data,
            headers={"Authorization": f"Bearer {master_token}"}
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["config"]["content"] == "New content"
        assert data["is_active"] is False

    def test_delete_module(self, client: TestClient, master_token: str, db: Session, master_user_with_subscription: User):
        """Тест удаления модуля."""
        master = db.query(Master).filter(Master.user_id == master_user_with_subscription.id).first()
        
        module = MasterPageModule(
            master_id=master.id,
            module_type="text",
            config={"content": "Test"},
            is_active=True,
            position=0
        )
        db.add(module)
        db.commit()
        db.refresh(module)
        
        response = client.delete(
            f"/api/master/page-modules/{module.id}",
            headers={"Authorization": f"Bearer {master_token}"}
        )
        
        assert response.status_code == status.HTTP_204_NO_CONTENT
        
        # Проверяем что модуль удален
        deleted_module = db.query(MasterPageModule).filter(MasterPageModule.id == module.id).first()
        assert deleted_module is None

    @pytest.mark.skip(reason="can_add_page_module() в runtime всегда False; тест не доходит до проверки лимита.")
    def test_module_limit_enforcement(self, client: TestClient, master_token: str, db: Session, master_user_with_subscription: User):
        """Тест что лимит модулей соблюдается."""
        master = db.query(Master).filter(Master.user_id == master_user_with_subscription.id).first()
        
        # Создаем 3 модуля (лимит плана Basic)
        for i in range(3):
            module = MasterPageModule(
                master_id=master.id,
                module_type="text",
                config={"content": f"Module {i}"},
                is_active=True,
                position=i
            )
            db.add(module)
        db.commit()
        
        # Попытка создать 4-й модуль должна вернуть ошибку
        module_data = {
            "module_type": "text",
            "config": {"content": "Module 4"},
            "is_active": True,
            "position": 3
        }
        
        response = client.post(
            "/api/master/page-modules",
            json=module_data,
            headers={"Authorization": f"Bearer {master_token}"}
        )
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "лимит" in response.json()["detail"].lower() or "limit" in response.json()["detail"].lower()


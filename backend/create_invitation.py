#!/usr/bin/env python3
"""
Скрипт для создания приглашения мастера в салон
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.orm import Session
from database import SessionLocal
from models import User, Master, Salon, SalonMasterInvitation, SalonMasterInvitationStatus

def create_invitation():
    db = SessionLocal()
    try:
        # Найдем тестового мастера (используем salon_master2)
        master_user = db.query(User).filter(User.email == "salon_master2@test.com").first()
        if not master_user:
            print("❌ Тестовый мастер не найден")
            return
        
        master = db.query(Master).filter(Master.user_id == master_user.id).first()
        if not master:
            print("❌ Профиль мастера не найден")
            return
        
        # Найдем тестовый салон (используем salon2)
        salon_user = db.query(User).filter(User.email == "salon2@test.com").first()
        if not salon_user:
            print("❌ Тестовый салон не найден")
            return
        
        salon = db.query(Salon).filter(Salon.user_id == salon_user.id).first()
        if not salon:
            print("❌ Профиль салона не найден")
            return
        
        # Проверим, есть ли уже приглашение
        existing_invitation = db.query(SalonMasterInvitation).filter(
            SalonMasterInvitation.salon_id == salon.id,
            SalonMasterInvitation.master_id == master.id
        ).first()
        
        if existing_invitation:
            print(f"✅ Приглашение уже существует со статусом: {existing_invitation.status}")
            return
        
        # Создаем новое приглашение со статусом PENDING
        invitation = SalonMasterInvitation(
            salon_id=salon.id,
            master_id=master.id,
            status=SalonMasterInvitationStatus.PENDING
        )
        
        db.add(invitation)
        db.commit()
        
        print(f"✅ Приглашение создано:")
        print(f"   - От салона: {salon.name} ({salon_user.email})")
        print(f"   - Для мастера: {master_user.email}")
        print(f"   - Статус: {invitation.status}")
        print(f"   - ID приглашения: {invitation.id}")
        
    except Exception as e:
        print(f"❌ Ошибка: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    create_invitation()

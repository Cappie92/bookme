#!/usr/bin/env python3
"""
Скрипт для отправки приглашения мастеру по номеру телефона
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.orm import Session
from database import SessionLocal
from models import User, Master, Salon, SalonMasterInvitation, SalonMasterInvitationStatus

def send_invitation_to_phone():
    db = SessionLocal()
    try:
        phone = "+79435774916"
        print(f"📱 Отправка приглашения мастеру с номером: {phone}")
        
        # Найдем мастера по номеру телефона
        user = db.query(User).filter(User.phone == phone).first()
        if not user:
            print(f"❌ Пользователь с номером {phone} не найден")
            return
        
        master = db.query(Master).filter(Master.user_id == user.id).first()
        if not master:
            print(f"❌ Профиль мастера не найден")
            return
        
        print(f"✅ Мастер найден: {user.email} (ID: {master.id})")
        
        # Найдем любой салон для отправки приглашения (используем salon1)
        salon_user = db.query(User).filter(User.email == "salon1@test.com").first()
        if not salon_user:
            print("❌ Тестовый салон не найден")
            return
        
        salon = db.query(Salon).filter(Salon.user_id == salon_user.id).first()
        if not salon:
            print("❌ Профиль салона не найден")
            return
        
        print(f"✅ Салон найден: {salon.name} (ID: {salon.id})")
        
        # Проверим, есть ли уже приглашение
        existing_invitation = db.query(SalonMasterInvitation).filter(
            SalonMasterInvitation.salon_id == salon.id,
            SalonMasterInvitation.master_id == master.id
        ).first()
        
        if existing_invitation:
            print(f"⚠️ Приглашение уже существует со статусом: {existing_invitation.status}")
            if existing_invitation.status == SalonMasterInvitationStatus.PENDING:
                print("✅ Приглашение уже ожидает ответа от мастера")
                return
            elif existing_invitation.status == SalonMasterInvitationStatus.ACCEPTED:
                print("✅ Мастер уже работает в этом салоне")
                return
            else:
                print("🔄 Обновляем статус приглашения на PENDING")
                existing_invitation.status = SalonMasterInvitationStatus.PENDING
                db.commit()
                print(f"✅ Приглашение обновлено:")
                print(f"   - От салона: {salon.name}")
                print(f"   - Для мастера: {user.email} ({phone})")
                print(f"   - Статус: {existing_invitation.status}")
                return
        
        # Создаем новое приглашение
        invitation = SalonMasterInvitation(
            salon_id=salon.id,
            master_id=master.id,
            status=SalonMasterInvitationStatus.PENDING
        )
        
        db.add(invitation)
        db.commit()
        
        print(f"✅ Приглашение создано:")
        print(f"   - От салона: {salon.name} ({salon_user.email})")
        print(f"   - Для мастера: {user.email} ({phone})")
        print(f"   - Статус: {invitation.status}")
        print(f"   - ID приглашения: {invitation.id}")
        
    except Exception as e:
        print(f"❌ Ошибка: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    send_invitation_to_phone()

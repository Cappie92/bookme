#!/usr/bin/env python3
"""
Скрипт для повторной отправки приглашения мастеру
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.orm import Session
from database import SessionLocal
from models import User, Master, Salon, SalonMasterInvitation, SalonMasterInvitationStatus

def resend_invitation():
    db = SessionLocal()
    try:
        phone = "+79435774916"
        print(f"📱 Повторная отправка приглашения мастеру с номером: {phone}")
        
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
        
        # Найдем салон для отправки приглашения (используем salon1)
        salon_user = db.query(User).filter(User.email == "salon1@test.com").first()
        if not salon_user:
            print("❌ Тестовый салон не найден")
            return
        
        salon = db.query(Salon).filter(Salon.user_id == salon_user.id).first()
        if not salon:
            print("❌ Профиль салона не найден")
            return
        
        print(f"✅ Салон найден: {salon.name} (ID: {salon.id})")
        
        # Проверим существующие приглашения
        existing_invitations = db.query(SalonMasterInvitation).filter(
            SalonMasterInvitation.salon_id == salon.id,
            SalonMasterInvitation.master_id == master.id
        ).all()
        
        if existing_invitations:
            print(f"⚠️ Найдено {len(existing_invitations)} существующих приглашений:")
            for inv in existing_invitations:
                print(f"   - ID: {inv.id}, Статус: {inv.status}")
            
            # Удаляем старые приглашения
            for inv in existing_invitations:
                db.delete(inv)
            print("🗑️ Старые приглашения удалены")
        
        # Создаем новое приглашение
        invitation = SalonMasterInvitation(
            salon_id=salon.id,
            master_id=master.id,
            status=SalonMasterInvitationStatus.PENDING
        )
        
        db.add(invitation)
        db.commit()
        
        print(f"✅ Новое приглашение создано:")
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
    resend_invitation()

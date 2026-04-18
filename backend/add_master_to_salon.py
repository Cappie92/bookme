#!/usr/bin/env python3
"""
Скрипт для добавления мастера в тестовый салон
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.orm import Session
from database import SessionLocal
from models import User, Master, Salon, SalonMasterInvitation, SalonMasterInvitationStatus

def add_master_to_salon():
    db = SessionLocal()
    try:
        # Найдем тестового мастера (используем salon_master1)
        master_user = db.query(User).filter(User.email == "salon_master1@test.com").first()
        if not master_user:
            print("❌ Тестовый мастер не найден")
            return
        
        master = db.query(Master).filter(Master.user_id == master_user.id).first()
        if not master:
            print("❌ Профиль мастера не найден")
            return
        
        # Найдем тестовый салон (используем salon1)
        salon_user = db.query(User).filter(User.email == "salon1@test.com").first()
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
            if existing_invitation.status == SalonMasterInvitationStatus.ACCEPTED:
                print("✅ Мастер уже работает в этом салоне")
                return
            elif existing_invitation.status == SalonMasterInvitationStatus.PENDING:
                print("✅ Приглашение уже отправлено")
                return
            else:
                # Обновляем статус на принятый
                existing_invitation.status = SalonMasterInvitationStatus.ACCEPTED
                db.commit()
                print("✅ Мастер добавлен в салон (приглашение принято)")
                return
        
        # Создаем приглашение и сразу принимаем его
        invitation = SalonMasterInvitation(
            salon_id=salon.id,
            master_id=master.id,
            status=SalonMasterInvitationStatus.ACCEPTED
        )
        
        db.add(invitation)
        
        # Добавляем мастера в салон через промежуточную таблицу
        from models import salon_masters
        db.execute(salon_masters.insert().values(
            salon_id=salon.id,
            master_id=master.id
        ))
        
        db.commit()
        
        print(f"✅ Мастер {master_user.email} добавлен в салон {salon.name}")
        print(f"   - ID мастера: {master.id}")
        print(f"   - ID салона: {salon.id}")
        print(f"   - Статус: {invitation.status}")
        print(f"   - Добавлен в таблицу salon_masters")
        
    except Exception as e:
        print(f"❌ Ошибка: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    add_master_to_salon()

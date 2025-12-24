from datetime import datetime, timedelta, date
from typing import Optional, Dict, Any, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import and_

from models import User, UserBalance, BalanceTransaction, Subscription, TransactionType, DailySubscriptionCharge, DailyChargeStatus, SubscriptionReservation, AdminOperation, SubscriptionPlan, SubscriptionFreeze


def rubles_to_kopecks(rubles: float) -> int:
    """Конвертировать рубли в копейки"""
    return int(rubles * 100)


def kopecks_to_rubles(kopecks: int) -> float:
    """Конвертировать копейки в рубли"""
    return kopecks / 100


def get_or_create_user_balance(db: Session, user_id: int) -> UserBalance:
    """Получить или создать баланс пользователя"""
    balance = db.query(UserBalance).filter(UserBalance.user_id == user_id).first()
    
    if not balance:
        balance = UserBalance(
            user_id=user_id,
            balance=0,
            currency="RUB"
        )
        db.add(balance)
        db.commit()
        db.refresh(balance)
    
    return balance


def get_user_reserved_total(db: Session, user_id: int) -> int:
    """Сумма зарезервированных средств по всем подпискам пользователя (в копейках)"""
    reservations = db.query(SubscriptionReservation).filter(SubscriptionReservation.user_id == user_id).all()
    return sum(r.reserved_kopecks for r in reservations)


def get_user_available_balance(db: Session, user_id: int) -> int:
    """Доступный баланс = общий баланс - резерв (в копейках)"""
    user_balance = get_or_create_user_balance(db, user_id)
    reserved_total = get_user_reserved_total(db, user_id)
    return max(0, user_balance.balance - reserved_total)


def move_available_to_reserve(db: Session, subscription: Subscription, amount_kopecks: int) -> bool:
    """Переместить средства из доступного баланса в резерв подписки. Не меняет общий баланс."""
    if amount_kopecks <= 0:
        return True
    available = get_user_available_balance(db, subscription.user_id)
    if available < amount_kopecks:
        return False
    # Находим/создаем резерв по подписке
    reservation = db.query(SubscriptionReservation).filter(SubscriptionReservation.subscription_id == subscription.id).first()
    if not reservation:
        reservation = SubscriptionReservation(
            user_id=subscription.user_id,
            subscription_id=subscription.id,
            reserved_kopecks=0
        )
        db.add(reservation)
        db.flush()
    # Увеличиваем резерв
    reservation.reserved_kopecks += amount_kopecks
    db.commit()
    return True


def reserve_full_subscription_price(db: Session, subscription: Subscription) -> Dict[str, Any]:
    """Резервировать полную стоимость подписки при оплате."""
    full_price_kopecks = rubles_to_kopecks(subscription.price)
    
    # Получаем или создаем резерв
    reservation = get_or_create_subscription_reservation(db, subscription.user_id, subscription.id)
    
    # Проверяем доступный баланс
    available_balance = get_available_balance(db, subscription.user_id)
    
    if available_balance < full_price_kopecks:
        return {
            "success": False,
            "message": "Недостаточно средств для резервирования полной стоимости подписки",
            "required": kopecks_to_rubles(full_price_kopecks),
            "available": kopecks_to_rubles(available_balance)
        }
    
    # Резервируем полную стоимость
    reservation.reserved_kopecks = full_price_kopecks
    
    # Создаем транзакцию резервирования
    add_balance_transaction(
        db=db,
        user_id=subscription.user_id,
        amount=-full_price_kopecks,
        transaction_type=TransactionType.WITHDRAWAL,
        description=f"Резервирование полной стоимости подписки {subscription.id}",
        subscription_id=subscription.id
    )
    
    db.add(reservation)
    db.commit()
    db.refresh(reservation)
    
    return {
        "success": True,
        "reserved_amount": subscription.price,
        "reserved_kopecks": full_price_kopecks
    }


def ensure_reserve_for_remaining_days(db: Session, subscription: Subscription, max_days: Optional[int] = None) -> Dict[str, Any]:
    """DEPRECATED: Использовать reserve_full_subscription_price для новых подписок."""
    days_until_end = max(0, (subscription.end_date.date() - date.today()).days)
    target_days = days_until_end if max_days is None else min(days_until_end, max_days)
    daily_rate = calculate_subscription_daily_rate(subscription)
    daily_rate_kopecks = rubles_to_kopecks(daily_rate)
    target_reserve = target_days * daily_rate_kopecks
    reservation = db.query(SubscriptionReservation).filter(SubscriptionReservation.subscription_id == subscription.id).first()
    current_reserved = reservation.reserved_kopecks if reservation else 0
    missing = max(0, target_reserve - current_reserved)
    ok = move_available_to_reserve(db, subscription, missing) if missing > 0 else True
    final_reserved = current_reserved + (missing if ok else 0)
    return {
        "target_days": target_days,
        "daily_rate": daily_rate,
        "requested": missing,
        "reserved_total": final_reserved,
        "ok": ok
    }


def auto_renew_subscription(db: Session, subscription: Subscription) -> Dict[str, Any]:
    """Автопродление подписки на тот же период."""
    if not subscription.payment_period:
        return {
            "success": False,
            "message": "Не указан период подписки для автопродления"
        }
    
    # Определяем новый период
    if subscription.payment_period == 'month':
        new_end_date = subscription.end_date + timedelta(days=30)
    elif subscription.payment_period == 'year':
        new_end_date = subscription.end_date + timedelta(days=365)
    else:
        return {
            "success": False,
            "message": f"Неизвестный период подписки: {subscription.payment_period}"
        }
    
    # Проверяем, достаточно ли средств в резерве для продления
    reservation = db.query(SubscriptionReservation).filter(
        SubscriptionReservation.subscription_id == subscription.id
    ).first()
    
    if not reservation or reservation.reserved_kopecks < rubles_to_kopecks(subscription.price):
        return {
            "success": False,
            "message": "Недостаточно зарезервированных средств для продления подписки"
        }
    
    # Продлеваем подписку
    subscription.end_date = new_end_date
    
    # Списываем средства из резерва (стоимость уже зарезервирована)
    reservation.reserved_kopecks -= rubles_to_kopecks(subscription.price)
    
    # Создаем транзакцию продления
    add_balance_transaction(
        db=db,
        user_id=subscription.user_id,
        amount=-rubles_to_kopecks(subscription.price),
        transaction_type=TransactionType.WITHDRAWAL,
        description=f"Автопродление подписки {subscription.id} на {subscription.payment_period}",
        subscription_id=subscription.id
    )
    
    db.add(subscription)
    db.add(reservation)
    db.commit()
    
    return {
        "success": True,
        "new_end_date": new_end_date,
        "charged_amount": subscription.price
    }


def sync_reserve_for_user(db: Session, user_id: int, max_days: Optional[int] = None) -> None:
    """Синхронизировать резерв для всех активных подписок пользователя."""
    active_subs = db.query(Subscription).filter(
        and_(Subscription.user_id == user_id, Subscription.is_active == True)
    ).all()
    for sub in active_subs:
        ensure_reserve_for_remaining_days(db, sub, max_days=max_days)


def add_balance_transaction(
    db: Session,
    user_id: int,
    amount: int,  # В копейках
    transaction_type: TransactionType,
    description: Optional[str] = None,
    subscription_id: Optional[int] = None
) -> BalanceTransaction:
    """Добавить транзакцию баланса"""
    
    # Получаем или создаем баланс пользователя
    user_balance = get_or_create_user_balance(db, user_id)
    
    # Сохраняем баланс до операции
    balance_before = user_balance.balance
    
    # Обновляем баланс
    user_balance.balance += amount
    balance_after = user_balance.balance
    
    # Создаем транзакцию
    transaction = BalanceTransaction(
        user_id=user_id,
        amount=amount,
        transaction_type=transaction_type,
        description=description,
        subscription_id=subscription_id,
        balance_before=balance_before,
        balance_after=balance_after
    )
    
    db.add(transaction)
    db.commit()
    db.refresh(transaction)
    
    return transaction


def deposit_balance(db: Session, user_id: int, amount_rubles: float, description: str = "Пополнение баланса") -> Dict[str, Any]:
    """Пополнить баланс пользователя"""
    amount_kopecks = rubles_to_kopecks(amount_rubles)
    
    transaction = add_balance_transaction(
        db=db,
        user_id=user_id,
        amount=amount_kopecks,
        transaction_type=TransactionType.DEPOSIT,
        description=description
    )
    
    return {
        "success": True,
        "transaction_id": transaction.id,
        "amount_rubles": amount_rubles,
        "balance_after": kopecks_to_rubles(transaction.balance_after)
    }


def withdraw_balance(db: Session, user_id: int, amount_rubles: float, description: str = "Списание") -> Dict[str, Any]:
    """Списать средства с баланса пользователя"""
    amount_kopecks = rubles_to_kopecks(amount_rubles)
    
    # Проверяем доступный баланс (за вычетом резерва)
    available = get_user_available_balance(db, user_id)
    if available < amount_kopecks:
        return {
            "success": False,
            "error": "Недостаточно средств на балансе",
            "required": amount_rubles,
            "available": kopecks_to_rubles(available)
        }
    
    user_balance = get_or_create_user_balance(db, user_id)
    transaction = add_balance_transaction(
        db=db,
        user_id=user_id,
        amount=-amount_kopecks,  # Отрицательная сумма для списания
        transaction_type=TransactionType.WITHDRAWAL,
        description=description
    )
    
    return {
        "success": True,
        "transaction_id": transaction.id,
        "amount_rubles": amount_rubles,
        "balance_after": kopecks_to_rubles(transaction.balance_after)
    }


def calculate_subscription_daily_rate(subscription: Subscription) -> float:
    """Рассчитать дневную ставку подписки"""
    total_days = (subscription.end_date - subscription.start_date).days
    if total_days <= 0:
        return 0
    
    return subscription.price / total_days


def calculate_upgrade_cost(
    current_subscription: Subscription,
    new_daily_rate: float,
    current_date: datetime = None
) -> Dict[str, Any]:
    """Рассчитать стоимость обновления тарифа"""
    
    if current_date is None:
        current_date = datetime.utcnow()
    
    # Если подписка еще не началась
    if current_date < current_subscription.start_date:
        return {
            "upgrade_cost": 0,
            "refund_amount": 0,
            "additional_payment": 0,
            "remaining_days": 0,
            "unused_balance": 0
        }
    
    # Если подписка уже закончилась
    if current_date >= current_subscription.end_date:
        return {
            "upgrade_cost": 0,
            "refund_amount": 0,
            "additional_payment": 0,
            "remaining_days": 0,
            "unused_balance": 0
        }
    
    # Рассчитываем оставшиеся дни
    remaining_days = (current_subscription.end_date - current_date).days
    
    # Рассчитываем неиспользованный баланс
    current_daily_rate = calculate_subscription_daily_rate(current_subscription)
    unused_balance = current_daily_rate * remaining_days
    
    # Рассчитываем стоимость нового тарифа на оставшиеся дни
    new_cost = new_daily_rate * remaining_days
    
    # Рассчитываем доплату (округляем вверх)
    additional_payment = max(0, new_cost - unused_balance)
    if additional_payment > 0:
        # Округляем вверх до копеек
        additional_payment = (int(additional_payment * 100) + 99) // 100 / 100
    
    return {
        "upgrade_cost": new_cost,
        "refund_amount": max(0, unused_balance - new_cost),
        "additional_payment": additional_payment,
        "remaining_days": remaining_days,
        "unused_balance": unused_balance,
        "current_daily_rate": current_daily_rate,
        "new_daily_rate": new_daily_rate
    }


def process_daily_charge(db: Session, subscription_id: int, charge_date: date = None) -> Dict[str, Any]:
    """Обработать ежедневное списание за подписку"""
    
    if charge_date is None:
        charge_date = date.today()
    
    # Получаем подписку
    subscription = db.query(Subscription).filter(Subscription.id == subscription_id).first()
    if not subscription:
        return {"success": False, "error": "Подписка не найдена"}
    
    # Проверяем, что подписка активна и действует в эту дату
    if not subscription.is_active or charge_date < subscription.start_date.date() or charge_date >= subscription.end_date.date():
        return {"success": False, "error": "Подписка не активна в указанную дату"}
    
    # Проверяем, не было ли уже списания за эту дату
    existing_charge = db.query(DailySubscriptionCharge).filter(
        and_(
            DailySubscriptionCharge.subscription_id == subscription_id,
            DailySubscriptionCharge.charge_date == charge_date
        )
    ).first()
    
    if existing_charge:
        return {"success": False, "error": "Списание за эту дату уже произведено"}
    
    # Проверяем, не находится ли дата в периоде заморозки
    charge_datetime = datetime.combine(charge_date, time.min)  # 00:00 указанной даты
    active_freeze = db.query(SubscriptionFreeze).filter(
        and_(
            SubscriptionFreeze.subscription_id == subscription_id,
            SubscriptionFreeze.is_cancelled == False,
            SubscriptionFreeze.start_date <= charge_datetime,
            SubscriptionFreeze.end_date >= charge_datetime
        )
    ).first()
    
    if active_freeze:
        # Получаем баланс пользователя для логирования
        user_balance = get_or_create_user_balance(db, subscription.user_id)
        balance_before = user_balance.balance
        
        # Создаем запись о пропущенном списании (для логирования)
        charge_record = DailySubscriptionCharge(
            subscription_id=subscription_id,
            charge_date=charge_date,
            amount=0,  # Не списываем
            daily_rate=rubles_to_kopecks(subscription.daily_rate),
            balance_before=balance_before,
            balance_after=balance_before,
            status=DailyChargeStatus.PENDING  # Помечаем как пропущенное
        )
        db.add(charge_record)
        db.commit()
        return {
            "success": True,
            "skipped": True,
            "reason": "Подписка заморожена",
            "freeze_id": active_freeze.id
        }
    
    # Используем сохраненную дневную ставку (чтобы не зависеть от изменения цен в планах)
    daily_rate = subscription.daily_rate
    daily_rate_kopecks = rubles_to_kopecks(daily_rate)
    
    # НЕ дозаполняем резерв при ежедневном списании - это должно происходить только при покупке подписки
    # ensure_reserve_for_remaining_days(db, subscription, max_days=None)
    reservation = db.query(SubscriptionReservation).filter(SubscriptionReservation.subscription_id == subscription.id).first()
    reserved = reservation.reserved_kopecks if reservation else 0
    user_balance = get_or_create_user_balance(db, subscription.user_id)
    balance_before = user_balance.balance
    
    if reserved < daily_rate_kopecks:
        # Недостаточно резерва - провал и пауза
        charge_record = DailySubscriptionCharge(
            subscription_id=subscription_id,
            charge_date=charge_date,
            amount=daily_rate_kopecks,
            daily_rate=daily_rate_kopecks,
            balance_before=balance_before,
            balance_after=balance_before,
            status=DailyChargeStatus.FAILED
        )
        db.add(charge_record)
        subscription.is_active = False
        db.commit()
        return {
            "success": False,
            "error": "Недостаточно средств в резерве",
            "daily_rate": daily_rate,
            "balance": kopecks_to_rubles(balance_before),
            "subscription_deactivated": True
        }
    
    # Списываем из резерва (уменьшаем только резерв)
    reservation.reserved_kopecks -= daily_rate_kopecks
    # Общий баланс будет изменен в add_balance_transaction
    
    # Создаем транзакцию-лог (списание из резерва, общий баланс уменьшается)
    add_balance_transaction(
        db=db,
        user_id=subscription.user_id,
        amount=-daily_rate_kopecks,  # При списании из резерва общий баланс уменьшается
        transaction_type=TransactionType.SUB_DAILY_FEE,
        description=f"Ежедневное списание из резерва за подписку {subscription_id}",
        subscription_id=subscription_id
    )
    
    # Получаем обновленный баланс после транзакции
    user_balance = get_or_create_user_balance(db, subscription.user_id)
    balance_after = user_balance.balance
    
    # Создаем запись о списании
    charge_record = DailySubscriptionCharge(
        subscription_id=subscription_id,
        charge_date=charge_date,
        amount=daily_rate_kopecks,
        daily_rate=daily_rate_kopecks,
        balance_before=balance_before,
        balance_after=balance_after,
        status=DailyChargeStatus.SUCCESS
    )
    db.add(charge_record)
    
    # Переводим деньги на админ баланс
    admin_user_id = get_admin_user_id(db)
    if admin_user_id:
        # Пополняем админ баланс
        add_balance_transaction(
            db=db,
            user_id=admin_user_id,
            amount=daily_rate_kopecks,
            transaction_type=TransactionType.SUB_DAILY_FEE,
            description=f"Ежедневная плата за подписку от пользователя {subscription.user_id}",
            subscription_id=subscription_id
        )
        
        # Создаем запись в админ операциях
        create_admin_operation(
            db=db,
            admin_user_id=admin_user_id,
            from_user_id=subscription.user_id,
            amount_kopecks=daily_rate_kopecks,
            operation_type="SUB_DAILY_FEE",
            service_description=f"Ежедневная плата за подписку {subscription_id}"
        )
    
    db.commit()
    
    return {
        "success": True,
        "daily_rate": daily_rate,
        "balance_before": kopecks_to_rubles(balance_before),
        "balance_after": kopecks_to_rubles(balance_after),
        "charge_id": charge_record.id
    }


def get_subscription_status(db: Session, user_id: int, subscription_type: str) -> Dict[str, Any]:
    """Получить статус подписки с обратным отсчетом"""
    
    # Проверяем, является ли пользователь is_always_free
    user = db.query(User).filter(User.id == user_id).first()
    is_always_free = user.is_always_free if user else False
    
    subscription = db.query(Subscription).filter(
        and_(
            Subscription.user_id == user_id,
            Subscription.subscription_type == subscription_type,
            Subscription.is_active == True
        )
    ).first()
    
    # Для is_always_free пользователей без активной подписки создаем подписку на план AlwaysFree
    if not subscription and is_always_free:
        # Находим план AlwaysFree
        always_free_plan = db.query(SubscriptionPlan).filter(
            SubscriptionPlan.name == 'AlwaysFree',
            SubscriptionPlan.subscription_type == subscription_type
        ).first()
        
        if always_free_plan:
            # Создаем подписку на план AlwaysFree
            from datetime import datetime as dt
            new_subscription = Subscription(
                user_id=user_id,
                subscription_type=subscription_type,
                plan_id=always_free_plan.id,
                status=SubscriptionStatus.ACTIVE,
                start_date=dt.utcnow(),
                end_date=dt(2099, 12, 31),
                price=0.0,
                daily_rate=0.0,
                auto_renewal=False,
                is_active=True,
                salon_branches=1 if subscription_type == SubscriptionType.SALON.value or (isinstance(subscription_type, str) and subscription_type == "salon") else 0,
                salon_employees=0,
                master_bookings=0
            )
            db.add(new_subscription)
            db.commit()
            db.refresh(new_subscription)
            subscription = new_subscription
        
        # Если план AlwaysFree не найден, возвращаем виртуальный статус
        if not subscription:
            return {
                "has_subscription": True,
                "subscription_id": None,
                "status": "always_free",
                "is_active": True,
                "start_date": None,
                "end_date": None,
                "days_remaining": None,
                "daily_rate": 0.0,
                "total_price": 0.0,
                "balance": 0.0,
                "can_continue": True,
                "is_frozen": False,
                "is_always_free": True,
                "next_charge_date": None,
                "max_branches": 0,
                "max_employees": 0,
                "reserved_days": 0,
                "is_unlimited": True,
                "plan_name": "AlwaysFree",
                "plan_display_name": "Always Free",
                "plan_display_order": None,
                "features": {},
                "limits": {}
            }
    
    if not subscription:
        return {
            "has_subscription": False,
            "message": "Нет активной подписки"
        }
    
    # Получаем баланс пользователя
    user_balance = get_or_create_user_balance(db, user_id)
    
    # Получаем план подписки для проверки типа
    plan = None
    is_free_plan = False
    if subscription.plan_id:
        plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == subscription.plan_id).first()
        if plan and plan.name == "Free":
            is_free_plan = True
    
    # Для Free плана не показываем дни и дату окончания
    plan_name = plan.name if plan else None
    plan_display_name = plan.display_name if plan else None
    plan_features = plan.features if plan else {}
    plan_limits = plan.limits if plan else {}
    
    if is_free_plan:
        return {
            "has_subscription": True,
            "subscription_id": subscription.id,
            "status": subscription.status.value,
            "is_active": subscription.is_active,
            "start_date": subscription.start_date,
            "end_date": None,  # Не показываем дату окончания для Free
            "days_remaining": None,  # Не показываем дни для Free
            "daily_rate": 0.0,
            "total_price": 0.0,
            "balance": kopecks_to_rubles(user_balance.balance),
            "can_continue": True,  # Free план всегда активен
            "next_charge_date": None,
            "max_branches": subscription.salon_branches,
            "max_employees": subscription.salon_employees,
            "reserved_days": 0,
            "is_unlimited": True,  # Флаг для фронтенда
            "plan_name": plan_name,  # Название плана
            "plan_display_name": plan_display_name,  # Отображаемое название плана
            "plan_display_order": plan.display_order if plan else None,
            "features": plan_features,
            "limits": plan_limits
        }
    
    # Рассчитываем оставшиеся дни
    current_date = datetime.utcnow()
    days_remaining = max(0, (subscription.end_date - current_date).days)
    
    # Рассчитываем дневную ставку
    daily_rate = calculate_subscription_daily_rate(subscription)
    
    # Проверяем наличие активной заморозки
    current_datetime = datetime.utcnow()
    active_freeze = db.query(SubscriptionFreeze).filter(
        SubscriptionFreeze.subscription_id == subscription.id,
        SubscriptionFreeze.is_cancelled == False,
        SubscriptionFreeze.start_date <= current_datetime,
        SubscriptionFreeze.end_date >= current_datetime
    ).first()
    
    is_frozen = active_freeze is not None
    
    # Для is_always_free пользователей подписка всегда может продолжаться (кроме заморозки)
    if is_always_free:
        can_continue = not is_frozen
    else:
        # Проверяем, может ли подписка продолжаться
        # Если есть активная заморозка, подписка не может продолжаться
        can_continue = not is_frozen and user_balance.balance >= rubles_to_kopecks(daily_rate)
    
    # Следующая дата списания
    next_charge_date = None
    if can_continue and days_remaining > 0:
        # Находим последнее списание
        last_charge = db.query(DailySubscriptionCharge).filter(
            DailySubscriptionCharge.subscription_id == subscription.id
        ).order_by(DailySubscriptionCharge.charge_date.desc()).first()
        
        if last_charge:
            next_charge_date = last_charge.charge_date + timedelta(days=1)
        else:
            next_charge_date = subscription.start_date.date()
    
    # Берем суммарный резерв пользователя и считаем покрытие в днях
    reserved_total = get_user_reserved_total(db, user_id)
    reserved_days = int(reserved_total // rubles_to_kopecks(daily_rate)) if daily_rate > 0 else 0

    # Получаем название плана и display_order
    plan_name = plan.name if plan else None
    plan_display_name = plan.display_name if plan else None
    plan_display_order = plan.display_order if plan else None
    plan_features = plan.features if plan else {}
    plan_limits = plan.limits if plan else {}
    
    # Формируем информацию о заморозке для is_frozen
    freeze_info = None
    if is_frozen and active_freeze:
        freeze_info = {
            "start_date": active_freeze.start_date.strftime("%d.%m.%Y") if active_freeze.start_date else None,
            "end_date": active_freeze.end_date.strftime("%d.%m.%Y") if active_freeze.end_date else None
        }
    
    return {
        "has_subscription": True,
        "subscription_id": subscription.id,
        "status": subscription.status.value,
        "is_active": subscription.is_active,
        "start_date": subscription.start_date,
        "end_date": subscription.end_date,
        "days_remaining": days_remaining,
        "daily_rate": daily_rate,
        "total_price": subscription.price,
        "balance": kopecks_to_rubles(user_balance.balance),
        "can_continue": can_continue,
        "is_frozen": is_frozen,  # Флаг заморозки
        "is_always_free": is_always_free,  # Флаг always free
        "freeze_info": freeze_info,  # Информация о заморозке (даты)
        "next_charge_date": next_charge_date,
        "max_branches": subscription.salon_branches,
        "max_employees": subscription.salon_employees,
        "reserved_days": reserved_days,
        "is_unlimited": False,
        "plan_name": plan_name,  # Название плана
        "plan_display_name": plan_display_name,  # Отображаемое название плана
        "plan_display_order": plan_display_order,
        "features": plan_features,
        "limits": plan_limits
    }


def get_admin_user_id(db: Session) -> Optional[int]:
    """Получить ID пользователя-админа"""
    admin_user = db.query(User).filter(
        User.phone == "+79031078685",
        User.role == "ADMIN"
    ).first()
    return admin_user.id if admin_user else None


def create_admin_operation(
    db: Session,
    admin_user_id: int,
    from_user_id: int,
    amount_kopecks: int,
    operation_type: str,
    service_description: str = None
) -> AdminOperation:
    """Создать запись об админ операции"""
    admin_operation = AdminOperation(
        admin_user_id=admin_user_id,
        from_user_id=from_user_id,
        amount_kopecks=amount_kopecks,
        operation_type=operation_type,
        service_description=service_description
    )
    db.add(admin_operation)
    return admin_operation 
"""
Роутер для управления бухгалтерией мастера
"""
import logging
from datetime import datetime, timedelta
from typing import Optional, List
from io import BytesIO
import csv
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, and_, or_

from database import get_db
from models import (
    User, Master, MasterExpense, BookingConfirmation, Booking, Income, 
    Service, BookingStatus, TaxRate
)
from auth import get_current_active_user

router = APIRouter(prefix="/api/master/accounting", tags=["accounting"])
logger = logging.getLogger(__name__)


@router.post("/update-booking-status/{booking_id}")
async def update_booking_status(
    booking_id: int,
    new_status: str = Query(..., regex="^(created|awaiting_confirmation|completed|cancelled|client_requested_early|client_requested_late)$"),
    cancellation_reason: str = Query(None, regex="^(client_requested|client_no_show|mutual_agreement|master_unavailable)$"),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Изменить статус прошедшей записи (редактирование ошибки мастера).
    Разрешенные значения: created, awaiting_confirmation, completed, cancelled.
    При изменении статуса:
    - Если переводим в completed: создаем BookingConfirmation и Income (если еще нет)
    - Если переводим из completed в другой: удаляем BookingConfirmation и связанные доходы
    - Для cancelled: просто меняем статус
    """
    try:
        master_id = get_master_id_from_user(current_user.id, db)

        booking = db.query(Booking).filter(
            Booking.id == booking_id,
            Booking.master_id == master_id
        ).first()
        if not booking:
            raise HTTPException(status_code=404, detail="Бронирование не найдено")
        
        # Проверяем, что запись не отменена клиентом (мастер не может изменять такие записи)
        if booking.status in [BookingStatus.CANCELLED_BY_CLIENT_EARLY, BookingStatus.CANCELLED_BY_CLIENT_LATE]:
            raise HTTPException(
                status_code=403, 
                detail="Нельзя изменять статус записи, отмененной клиентом"
            )

        # Очистка подтверждений/доходов, если уходим из completed
        if booking.status == BookingStatus.COMPLETED and new_status != "completed":
            confirmation = db.query(BookingConfirmation).filter(BookingConfirmation.booking_id == booking_id).first()
            if confirmation:
                db.delete(confirmation)
            income = db.query(Income).filter(Income.booking_id == booking_id).first()
            if income:
                db.delete(income)

        # Установка нового статуса
        if new_status == "created":
            booking.status = BookingStatus.CREATED
        elif new_status == "awaiting_confirmation":
            booking.status = BookingStatus.AWAITING_CONFIRMATION
        elif new_status == "cancelled":
            booking.status = BookingStatus.CANCELLED
            if cancellation_reason:
                booking.cancellation_reason = cancellation_reason
                booking.cancelled_by_user_id = current_user.id
        elif new_status == "client_requested_early":
            booking.status = BookingStatus.CANCELLED_BY_CLIENT_EARLY
            booking.cancellation_reason = "client_requested"
            booking.cancelled_by_user_id = booking.client_id  # Клиент отменил сам
        elif new_status == "client_requested_late":
            booking.status = BookingStatus.CANCELLED_BY_CLIENT_LATE
            booking.cancellation_reason = "client_requested"
            booking.cancelled_by_user_id = booking.client_id  # Клиент отменил сам
        elif new_status == "completed":
            booking.status = BookingStatus.COMPLETED
            # Создаем подтверждение и доход при необходимости
            existing_confirmation = db.query(BookingConfirmation).filter(
                BookingConfirmation.booking_id == booking_id
            ).first()
            if not existing_confirmation:
                confirmation = BookingConfirmation(
                    booking_id=booking_id,
                    master_id=master_id,
                    confirmed_income=booking.payment_amount or 0
                )
                db.add(confirmation)

            existing_income = db.query(Income).filter(Income.booking_id == booking_id).first()
            if not existing_income:
                income = Income(
                    indie_master_id=master_id,
                    booking_id=booking_id,
                    total_amount=booking.payment_amount or 0,
                    master_earnings=booking.payment_amount or 0,
                    salon_earnings=0,
                    income_date=datetime.utcnow().date(),
                    service_date=booking.start_time.date()
                )
                db.add(income)

        db.commit()
        return {"message": "Статус записи обновлен", "booking_id": booking_id, "new_status": new_status}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка при изменении статуса записи {booking_id}: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

def get_master_id_from_user(user_id: int, db: Session) -> int:
    """Получить Master.id по User.id"""
    master = db.query(Master).filter(Master.user_id == user_id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Профиль мастера не найден")
    return master.id


def get_tax_rate_for_date(master_id: int, target_date: datetime, db: Session) -> float:
    """Получить налоговую ставку для конкретной даты"""
    tax_rate = db.query(TaxRate).filter(
        TaxRate.master_id == master_id,
        TaxRate.effective_from_date <= target_date.date()
    ).order_by(desc(TaxRate.effective_from_date)).first()
    
    return tax_rate.rate if tax_rate else 0.0


# Вспомогательная функция для расчета периодов
def get_period_dates(period: str, offset: int = 0):
    """Расчет дат начала и конца периода с учетом offset"""
    today = datetime.now().date()
    
    if period == "day":
        center_date = today + timedelta(days=offset)
        start = datetime.combine(center_date - timedelta(days=2), datetime.min.time())
        end = datetime.combine(center_date + timedelta(days=2), datetime.max.time())
    elif period == "week":
        monday = today - timedelta(days=today.weekday()) + timedelta(weeks=offset)
        start = datetime.combine(monday - timedelta(weeks=2), datetime.min.time())
        end = datetime.combine(monday + timedelta(weeks=2, days=6), datetime.max.time())
    elif period == "month":
        target_month = today.replace(day=1)
        for _ in range(abs(offset)):
            if offset > 0:
                if target_month.month == 12:
                    target_month = target_month.replace(year=target_month.year + 1, month=1)
                else:
                    target_month = target_month.replace(month=target_month.month + 1)
            else:
                if target_month.month == 1:
                    target_month = target_month.replace(year=target_month.year - 1, month=12)
                else:
                    target_month = target_month.replace(month=target_month.month - 1)
        
        start_month = target_month.replace(day=1)
        for _ in range(2):
            if start_month.month == 1:
                start_month = start_month.replace(year=start_month.year - 1, month=12)
            else:
                start_month = start_month.replace(month=start_month.month - 1)
        
        end_month = target_month
        for _ in range(2):
            if end_month.month == 12:
                end_month = end_month.replace(year=end_month.year + 1, month=1)
            else:
                end_month = end_month.replace(month=end_month.month + 1)
        
        if end_month.month == 12:
            next_month = end_month.replace(year=end_month.year + 1, month=1)
        else:
            next_month = end_month.replace(month=end_month.month + 1)
        
        start = datetime.combine(start_month, datetime.min.time())
        end = datetime.combine(next_month - timedelta(days=1), datetime.max.time())
    elif period == "quarter":
        quarter = ((today.month - 1) // 3) + 1 + offset
        year = today.year
        while quarter > 4:
            quarter -= 4
            year += 1
        while quarter < 1:
            quarter += 4
            year -= 1
        
        q_start_month = (quarter - 1) * 3 + 1
        start_q = quarter - 2
        year_start = year
        while start_q < 1:
            start_q += 4
            year_start -= 1
        
        start = datetime.combine(datetime(year_start, (start_q - 1) * 3 + 1, 1), datetime.min.time())
        
        end_q = quarter + 2
        year_end = year
        while end_q > 4:
            end_q -= 4
            year_end += 1
        
        end_q_month = end_q * 3
        if end_q_month == 12:
            end = datetime.combine(datetime(year_end, 12, 31), datetime.max.time())
        else:
            next_month = datetime(year_end, end_q_month + 1, 1)
            end = datetime.combine(next_month - timedelta(days=1), datetime.max.time())
    elif period == "year":
        target_year = today.year + offset
        start = datetime.combine(datetime(target_year - 2, 1, 1), datetime.min.time())
        end = datetime.combine(datetime(target_year + 2, 12, 31), datetime.max.time())
    else:
        raise ValueError(f"Неизвестный период: {period}")
    
    return start, end


@router.get("/expenses")
async def get_expenses(
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    expense_type: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Получить список расходов мастера с фильтрами и пагинацией"""
    try:
        master_id = get_master_id_from_user(current_user.id, db)
        query = db.query(MasterExpense).filter(MasterExpense.master_id == master_id)
        
        if start_date:
            query = query.filter(MasterExpense.expense_date >= start_date)
        if end_date:
            query = query.filter(MasterExpense.expense_date <= end_date)
        if expense_type:
            query = query.filter(MasterExpense.expense_type == expense_type)
        
        total = query.count()
        expenses = query.order_by(desc(MasterExpense.expense_date)).offset((page - 1) * limit).limit(limit).all()
        
        return {
            "expenses": [
                {
                    "id": exp.id,
                    "name": exp.name,
                    "expense_type": exp.expense_type,
                    "amount": exp.amount,
                    "recurrence_type": exp.recurrence_type,
                    "condition_type": exp.condition_type,
                    "service_id": exp.service_id,
                    "expense_date": exp.expense_date,
                    "is_active": exp.is_active,
                    "created_at": exp.created_at,
                }
                for exp in expenses
            ],
            "total": total,
            "page": page,
            "limit": limit,
            "pages": (total + limit - 1) // limit
        }
    except Exception as e:
        logger.error(f"Ошибка при получении расходов: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/operations")
async def get_operations(
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    operation_type: Optional[str] = None,  # "income", "expense", "all"
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Получить все операции мастера (доходы + расходы) с фильтрами и пагинацией"""
    try:
        operations = []
        master_id = get_master_id_from_user(current_user.id, db)
        
        # Получаем доходы (подтвержденные)
        income_query = db.query(BookingConfirmation).filter(
            BookingConfirmation.master_id == master_id
        )
        
        if start_date:
            income_query = income_query.filter(BookingConfirmation.confirmed_at >= start_date)
        if end_date:
            income_query = income_query.filter(BookingConfirmation.confirmed_at <= end_date)
        
        if operation_type != "expense":
            incomes = income_query.order_by(desc(BookingConfirmation.confirmed_at)).all()
            for income in incomes:
                # Получаем налоговую ставку для даты подтверждения
                tax_rate = get_tax_rate_for_date(master_id, income.confirmed_at, db)
                gross_amount = income.confirmed_income
                tax_amount = gross_amount * (tax_rate / 100)
                net_amount = gross_amount - tax_amount
                
                operations.append({
                    "id": f"income_{income.id}",
                    "date": income.confirmed_at,
                    "name": f"Доход от услуги",
                    "type": "Доход",
                    "operation_type": "income",
                    "amount": net_amount,  # Чистый доход с учетом налога
                    "gross_amount": gross_amount,
                    "tax_rate": tax_rate,
                    "tax_amount": tax_amount,
                    "net_amount": net_amount,
                    "description": f"Подтвержденный доход от бронирования #{income.booking_id}"
                })
        
        # Получаем расходы
        expense_query = db.query(MasterExpense).filter(
            MasterExpense.master_id == master_id,
            MasterExpense.is_active == True
        )
        
        if start_date:
            expense_query = expense_query.filter(MasterExpense.expense_date >= start_date)
        if end_date:
            expense_query = expense_query.filter(MasterExpense.expense_date <= end_date)
        
        if operation_type != "income":
            expenses = expense_query.order_by(desc(MasterExpense.expense_date)).all()
            for expense in expenses:
                operations.append({
                    "id": f"expense_{expense.id}",
                    "date": expense.expense_date,
                    "name": expense.name,
                    "type": "Расход",
                    "operation_type": "expense",
                    "amount": -expense.amount,  # Отрицательное значение для расходов
                    "description": f"{expense.expense_type} - {expense.name}"
                })
        
        # Сортируем по дате (новые сначала), обрабатываем None
        operations.sort(key=lambda x: x["date"] if x["date"] is not None else datetime.min, reverse=True)
        
        # Применяем пагинацию
        total = len(operations)
        start_idx = (page - 1) * limit
        end_idx = start_idx + limit
        paginated_operations = operations[start_idx:end_idx]
        
        return {
            "operations": paginated_operations,
            "total": total,
            "page": page,
            "limit": limit,
            "pages": (total + limit - 1) // limit
        }
    except Exception as e:
        logger.error(f"Ошибка при получении операций: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/expenses")
async def create_expense(
    name: str,
    expense_type: str,
    amount: float,
    recurrence_type: Optional[str] = None,
    condition_type: Optional[str] = None,
    service_id: Optional[int] = None,
    expense_date: Optional[datetime] = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Создать новый расход"""
    try:
        # Валидация в зависимости от типа расхода
        if expense_type == "recurring" and not recurrence_type:
            raise HTTPException(status_code=400, detail="Для циклического расхода требуется recurrence_type")
        if expense_type == "service_based" and not service_id:
            raise HTTPException(status_code=400, detail="Для расхода по услуге требуется service_id")
        if expense_type == "one_time" and not expense_date:
            raise HTTPException(status_code=400, detail="Для разового расхода требуется expense_date")
        
        master_id = get_master_id_from_user(current_user.id, db)
        
        expense = MasterExpense(
            master_id=master_id,
            name=name,
            expense_type=expense_type,
            amount=amount,
            recurrence_type=recurrence_type,
            condition_type=condition_type,
            service_id=service_id,
            expense_date=expense_date or datetime.utcnow()
        )
        
        db.add(expense)
        db.commit()
        db.refresh(expense)
        
        logger.info(f"Создан расход {expense.id} для мастера {current_user.id}")
        
        return {
            "id": expense.id,
            "name": expense.name,
            "expense_type": expense.expense_type,
            "amount": expense.amount,
            "message": "Расход успешно создан"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка при создании расхода: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/expenses/{expense_id}")
async def update_expense(
    expense_id: int,
    name: Optional[str] = None,
    expense_type: Optional[str] = None,
    amount: Optional[float] = None,
    recurrence_type: Optional[str] = None,
    condition_type: Optional[str] = None,
    service_id: Optional[int] = None,
    expense_date: Optional[datetime] = None,
    is_active: Optional[bool] = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Редактировать расход"""
    try:
        master_id = get_master_id_from_user(current_user.id, db)
        expense = db.query(MasterExpense).filter(
            MasterExpense.id == expense_id,
            MasterExpense.master_id == master_id
        ).first()
        
        if not expense:
            raise HTTPException(status_code=404, detail="Расход не найден")
        
        if name is not None:
            expense.name = name
        if expense_type is not None:
            expense.expense_type = expense_type
        if amount is not None:
            expense.amount = amount
        if recurrence_type is not None:
            expense.recurrence_type = recurrence_type
        if condition_type is not None:
            expense.condition_type = condition_type
        if service_id is not None:
            expense.service_id = service_id
        if expense_date is not None:
            expense.expense_date = expense_date
        if is_active is not None:
            expense.is_active = is_active
        
        expense.updated_at = datetime.utcnow()
        db.commit()
        
        logger.info(f"Обновлен расход {expense_id} для мастера {current_user.id}")
        
        return {"message": "Расход успешно обновлен"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка при обновлении расхода: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/expenses/{expense_id}")
async def delete_expense(
    expense_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Удалить расход"""
    try:
        master_id = get_master_id_from_user(current_user.id, db)
        expense = db.query(MasterExpense).filter(
            MasterExpense.id == expense_id,
            MasterExpense.master_id == master_id
        ).first()
        
        if not expense:
            raise HTTPException(status_code=404, detail="Расход не найден")
        
        db.delete(expense)
        db.commit()
        
        logger.info(f"Удален расход {expense_id} для мастера {current_user.id}")
        
        return {"message": "Расход успешно удален"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка при удалении расхода: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/summary")
async def get_accounting_summary(
    period: str = Query("week", regex="^(day|week|month|quarter|year)$"),
    offset: int = Query(0),
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Получить сводку доходов/расходов с данными для графиков"""
    try:
        # Определяем даты периода
        if start_date and end_date:
            # Свободный выбор диапазона
            pass
        else:
            start_date, end_date = get_period_dates(period, offset)
        
        logger.info(f"Получение сводки за период {period} (offset={offset}), даты: {start_date} - {end_date}")
        
        master_id = get_master_id_from_user(current_user.id, db)
        
        # Получаем подтвержденные доходы (детально для расчета налога)
        confirmed_incomes_detailed = db.query(BookingConfirmation).filter(
            BookingConfirmation.master_id == master_id,
            BookingConfirmation.confirmed_at >= start_date,
            BookingConfirmation.confirmed_at <= end_date
        ).all()
        
        # Группируем по датам и рассчитываем налог
        income_by_date = {}
        for income in confirmed_incomes_detailed:
            date_str = str(income.confirmed_at.date())
            tax_rate = get_tax_rate_for_date(master_id, income.confirmed_at, db)
            net_amount = income.confirmed_income * (1 - tax_rate / 100)
            
            if date_str not in income_by_date:
                income_by_date[date_str] = 0
            income_by_date[date_str] += net_amount
        
        # Получаем ожидаемые доходы (неподтвержденные бронирования)
        expected_incomes = db.query(
            func.sum(Booking.payment_amount).label("total_expected_income"),
            func.date(Booking.start_time).label("date")
        ).filter(
            Booking.master_id == master_id,
            Booking.start_time >= start_date,
            Booking.start_time <= end_date,
            Booking.status.in_([BookingStatus.CREATED, BookingStatus.AWAITING_CONFIRMATION])
        ).group_by(func.date(Booking.start_time)).all()
        
        # Получаем расходы
        expenses_query = db.query(
            func.sum(MasterExpense.amount).label("total_expense"),
            func.date(MasterExpense.expense_date).label("date")
        ).filter(
            MasterExpense.master_id == master_id,
            MasterExpense.expense_date >= start_date,
            MasterExpense.expense_date <= end_date,
            MasterExpense.is_active == True
        ).group_by(func.date(MasterExpense.expense_date)).all()
        
        # Формируем данные для графиков
        expected_income_by_date = {str(row.date): float(row.total_expected_income or 0) for row in expected_incomes}
        expenses_by_date = {str(row.date): float(row.total_expense or 0) for row in expenses_query}
        
        # Объединяем данные по датам
        all_dates = sorted(set(list(income_by_date.keys()) + list(expected_income_by_date.keys()) + list(expenses_by_date.keys())))
        
        chart_data = []
        for date_str in all_dates:
            income = income_by_date.get(date_str, 0)
            expected_income = expected_income_by_date.get(date_str, 0)
            expense = expenses_by_date.get(date_str, 0)
            chart_data.append({
                "date": date_str,
                "income": income,
                "expected_income": expected_income,
                "expense": expense,
                "net_profit": income - expense
            })
        
        # Итоговые суммы
        total_income = sum(income_by_date.values())  # Уже чистый доход с налогом
        total_expected_income = sum(expected_income_by_date.values())
        total_expense = sum(expenses_by_date.values())
        net_profit = total_income - total_expense
        
        return {
            "total_income": total_income,
            "total_expected_income": total_expected_income,
            "total_expense": total_expense,
            "net_profit": net_profit,
            "chart_data": chart_data,
            "period": period,
            "start_date": start_date,
            "end_date": end_date
        }
    except Exception as e:
        logger.error(f"Ошибка при получении сводки: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pending-confirmations")
async def get_pending_confirmations(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Получить список услуг, ожидающих подтверждения"""
    try:
        master_id = get_master_id_from_user(current_user.id, db)
        
        # Получаем бронирования со статусом AWAITING_CONFIRMATION
        pending_bookings = db.query(Booking).outerjoin(
            BookingConfirmation,
            Booking.id == BookingConfirmation.booking_id
        ).filter(
            Booking.master_id == master_id,
            Booking.status == BookingStatus.AWAITING_CONFIRMATION,
            BookingConfirmation.id == None  # Без подтверждения
        ).all()
        
        result = []
        for booking in pending_bookings:
            service = db.query(Service).filter(Service.id == booking.service_id).first()
            result.append({
                "booking_id": booking.id,
                "client_name": booking.client_name if hasattr(booking, 'client_name') else "Клиент",
                "service_name": service.name if service else "Услуга",
                "date": booking.start_time.date(),  # Извлекаем дату из start_time
                "start_time": booking.start_time,
                "payment_amount": booking.payment_amount,
            })
        
        logger.info(f"Найдено {len(result)} услуг на подтверждение для мастера {current_user.id}")
        
        return {
            "pending_confirmations": result,
            "count": len(result)
        }
    except Exception as e:
        logger.error(f"Ошибка при получении услуг на подтверждение: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/confirm-booking/{booking_id}")
async def confirm_booking(
    booking_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Подтвердить завершение услуги и начислить доход/расходы"""
    try:
        master_id = get_master_id_from_user(current_user.id, db)
        
        # Проверяем, что бронирование принадлежит мастеру
        booking = db.query(Booking).filter(
            Booking.id == booking_id,
            Booking.master_id == master_id,
            Booking.status == BookingStatus.AWAITING_CONFIRMATION
        ).first()
        
        if not booking:
            raise HTTPException(status_code=404, detail="Бронирование не найдено или не может быть подтверждено")
        
        # Проверяем, не подтверждено ли уже
        existing_confirmation = db.query(BookingConfirmation).filter(
            BookingConfirmation.booking_id == booking_id
        ).first()
        
        if existing_confirmation:
            raise HTTPException(status_code=400, detail="Услуга уже подтверждена")
        
        # Создаем подтверждение
        confirmation = BookingConfirmation(
            booking_id=booking_id,
            master_id=master_id,
            confirmed_income=booking.payment_amount or 0
        )
        db.add(confirmation)
        
        # Создаем income запись
        income = Income(
            indie_master_id=master_id,
            booking_id=booking_id,
            total_amount=booking.payment_amount or 0,
            master_earnings=booking.payment_amount or 0,
            salon_earnings=0,  # Для индивидуальных мастеров
            income_date=datetime.utcnow().date(),
            service_date=booking.start_time.date()
        )
        db.add(income)
        
        # Создаем расходы типа service_based для этой услуги
        service_expenses = db.query(MasterExpense).filter(
            MasterExpense.master_id == master_id,
            MasterExpense.expense_type == "service_based",
            MasterExpense.service_id == booking.service_id,
            MasterExpense.is_active == True
        ).all()
        
        for template in service_expenses:
            expense_record = MasterExpense(
                master_id=master_id,
                name=f"{template.name} (услуга #{booking_id})",
                expense_type="one_time",  # Создаем как разовый
                amount=template.amount,
                expense_date=datetime.utcnow()
            )
            db.add(expense_record)
        
        # Обновляем статус бронирования на completed
        booking.status = BookingStatus.COMPLETED
        
        db.commit()
        
        logger.info(f"Подтверждена услуга {booking_id} для мастера {current_user.id}")
        
        return {
            "message": "Услуга успешно подтверждена",
            "confirmed_income": booking.payment_amount,
            "expenses_created": len(service_expenses)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка при подтверждении услуги: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/confirm-all")
async def confirm_all_bookings(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Подтвердить все неподтвержденные услуги"""
    try:
        master_id = get_master_id_from_user(current_user.id, db)
        
        # Получаем все confirmed бронирования в прошлом без подтверждения
        pending_bookings = db.query(Booking).outerjoin(
            BookingConfirmation,
            Booking.id == BookingConfirmation.booking_id
        ).filter(
            Booking.master_id == master_id,
            Booking.status == BookingStatus.AWAITING_CONFIRMATION,
            BookingConfirmation.id == None
        ).all()
        
        confirmed_count = 0
        for booking in pending_bookings:
            # Создаем подтверждение
            confirmation = BookingConfirmation(
                booking_id=booking.id,
                master_id=master_id,
                confirmed_income=booking.payment_amount or 0
            )
            db.add(confirmation)
            
            # Обновляем статус бронирования на completed
            booking.status = BookingStatus.COMPLETED
            
            confirmed_count += 1
        
        db.commit()
        
        logger.info(f"Подтверждено {confirmed_count} услуг для мастера {current_user.id}")
        
        return {
            "message": f"Подтверждено {confirmed_count} услуг",
            "confirmed_count": confirmed_count
        }
    except Exception as e:
        logger.error(f"Ошибка при массовом подтверждении услуг: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cancel-booking/{booking_id}")
async def cancel_booking(
    booking_id: int,
    cancellation_reason: str = Query(..., regex="^(client_requested|client_no_show|mutual_agreement|master_unavailable)$"),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Отклонить отдельную услугу"""
    try:
        master_id = get_master_id_from_user(current_user.id, db)
        
        # Проверяем, что бронирование принадлежит мастеру
        booking = db.query(Booking).filter(
            Booking.id == booking_id,
            Booking.master_id == master_id,
            Booking.status.in_([BookingStatus.CREATED, BookingStatus.AWAITING_CONFIRMATION])
        ).first()
        
        if not booking:
            raise HTTPException(status_code=404, detail="Бронирование не найдено или не может быть отклонено")
        
        # Проверяем, не подтверждено ли уже
        existing_confirmation = db.query(BookingConfirmation).filter(
            BookingConfirmation.booking_id == booking_id
        ).first()
        
        if existing_confirmation:
            raise HTTPException(status_code=400, detail="Услуга уже подтверждена")
        
        # Устанавливаем причину отмены и инициатора
        booking.cancelled_by_user_id = current_user.id
        booking.cancellation_reason = cancellation_reason
        
        # Обновляем статус бронирования на cancelled
        booking.status = BookingStatus.CANCELLED
        
        db.commit()
        
        logger.info(f"Отклонена услуга {booking_id} для мастера {current_user.id}")
        
        return {
            "message": "Услуга успешно отклонена",
            "booking_id": booking_id
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка при отклонении услуги {booking_id}: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cancel-all")
async def cancel_all_bookings(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Отменить все неподтвержденные услуги"""
    try:
        master_id = get_master_id_from_user(current_user.id, db)
        
        # Получаем все confirmed бронирования в прошлом без подтверждения
        pending_bookings = db.query(Booking).outerjoin(
            BookingConfirmation,
            Booking.id == BookingConfirmation.booking_id
        ).filter(
            Booking.master_id == master_id,
            Booking.status == BookingStatus.AWAITING_CONFIRMATION,
            BookingConfirmation.id == None
        ).all()
        
        cancelled_count = 0
        for booking in pending_bookings:
            # Обновляем статус бронирования на cancelled
            booking.status = BookingStatus.CANCELLED
            cancelled_count += 1
        
        db.commit()
        
        logger.info(f"Отменено {cancelled_count} услуг для мастера {current_user.id}")
        
        return {
            "message": f"Отменено {cancelled_count} услуг",
            "cancelled_count": cancelled_count
        }
    except Exception as e:
        logger.error(f"Ошибка при массовой отмене услуг: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/export")
async def export_data(
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    format: str = Query("csv", regex="^(csv|excel)$"),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Экспорт данных бухгалтерии в CSV или Excel"""
    try:
        # Получаем данные
        if not start_date:
            start_date = datetime.now() - timedelta(days=30)
        if not end_date:
            end_date = datetime.now()
        
        # Доходы
        incomes = db.query(BookingConfirmation).filter(
            BookingConfirmation.master_id == current_user.id,
            BookingConfirmation.confirmed_at >= start_date,
            BookingConfirmation.confirmed_at <= end_date
        ).all()
        
        # Расходы
        expenses = db.query(MasterExpense).filter(
            MasterExpense.master_id == current_user.id,
            MasterExpense.expense_date >= start_date,
            MasterExpense.expense_date <= end_date
        ).all()
        
        # Формируем данные для экспорта
        rows = []
        
        for income in incomes:
            rows.append({
                "Дата": income.confirmed_at.strftime("%Y-%m-%d %H:%M"),
                "Тип операции": "Доход",
                "Название": f"Услуга #{income.booking_id}",
                "Доход": income.confirmed_income,
                "Расход": 0,
            })
        
        for expense in expenses:
            rows.append({
                "Дата": expense.expense_date.strftime("%Y-%m-%d %H:%M") if expense.expense_date else "",
                "Тип операции": "Расход",
                "Название": expense.name,
                "Доход": 0,
                "Расход": expense.amount,
            })
        
        # Сортируем по дате
        rows.sort(key=lambda x: x["Дата"], reverse=True)
        
        # Добавляем баланс
        balance = 0
        for row in reversed(rows):
            balance += row["Доход"] - row["Расход"]
            row["Баланс"] = balance
        
        if format == "csv":
            # Создаем CSV
            output = BytesIO()
            output.write('\ufeff'.encode('utf-8'))  # BOM для корректного отображения кириллицы в Excel
            
            fieldnames = ["Дата", "Тип операции", "Название", "Доход", "Расход", "Баланс"]
            writer = csv.DictWriter(output, fieldnames=fieldnames, delimiter=';')
            writer.writeheader()
            writer.writerows(rows)
            
            output.seek(0)
            
            return Response(
                content=output.getvalue(),
                media_type="text/csv; charset=utf-8",
                headers={
                    "Content-Disposition": f"attachment; filename=accounting_{start_date.strftime('%Y%m%d')}_{end_date.strftime('%Y%m%d')}.csv"
                }
            )
        else:
            # Создаем Excel
            wb = Workbook()
            ws = wb.active
            ws.title = "Бухгалтерия"
            
            # Заголовки
            headers = ["Дата", "Тип операции", "Название", "Доход", "Расход", "Баланс"]
            ws.append(headers)
            
            # Стилизация заголовков
            header_fill = PatternFill(start_color="4CAF50", end_color="4CAF50", fill_type="solid")
            header_font = Font(bold=True, color="FFFFFF")
            header_alignment = Alignment(horizontal="center", vertical="center")
            
            for cell in ws[1]:
                cell.fill = header_fill
                cell.font = header_font
                cell.alignment = header_alignment
            
            # Данные
            for row in rows:
                ws.append([
                    row["Дата"],
                    row["Тип операции"],
                    row["Название"],
                    row["Доход"],
                    row["Расход"],
                    row["Баланс"]
                ])
            
            # Автоматическая ширина колонок
            for column in ws.columns:
                max_length = 0
                column_letter = column[0].column_letter
                for cell in column:
                    try:
                        if len(str(cell.value)) > max_length:
                            max_length = len(str(cell.value))
                    except:
                        pass
                adjusted_width = min(max_length + 2, 50)
                ws.column_dimensions[column_letter].width = adjusted_width
            
            # Форматирование чисел
            for row in ws.iter_rows(min_row=2, max_row=ws.max_row):
                # Доход (колонка 4)
                if row[3].value and row[3].value != 0:
                    row[3].font = Font(color="4CAF50")
                # Расход (колонка 5)
                if row[4].value and row[4].value != 0:
                    row[4].font = Font(color="F44336")
                # Баланс (колонка 6)
                if row[5].value:
                    if row[5].value >= 0:
                        row[5].font = Font(color="2196F3", bold=True)
                    else:
                        row[5].font = Font(color="F44336", bold=True)
            
            # Сохраняем в BytesIO
            output = BytesIO()
            wb.save(output)
            output.seek(0)
            
            return Response(
                content=output.getvalue(),
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={
                    "Content-Disposition": f"attachment; filename=accounting_{start_date.strftime('%Y%m%d')}_{end_date.strftime('%Y%m%d')}.xlsx"
                }
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка при экспорте данных: {e}")
        raise HTTPException(status_code=500, detail=str(e))


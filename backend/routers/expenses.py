from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, date
from decimal import Decimal

from database import get_db
from models import (
    ExpenseType, Expense, ExpenseTemplate, Salon, SalonBranch, IndieMaster, User, Income, MissedRevenue, Booking
)
from schemas import (
    ExpenseTypeCreate, ExpenseTypeUpdate, ExpenseType,
    ExpenseCreate, ExpenseUpdate, ExpenseOut,
    ExpenseTemplateCreate, ExpenseTemplateUpdate, ExpenseTemplate,
    ExpenseStats, ExpenseList,
    IncomeCreate, IncomeUpdate, IncomeOut, IncomeList,
    MissedRevenueCreate, MissedRevenueUpdate, MissedRevenueOut, MissedRevenueList,
    AccountingStats
)
from auth import require_salon, get_current_active_user

router = APIRouter(
    prefix="/expenses",
    tags=["expenses"],
)


# API для типов расходов салона
@router.get("/salon/types", response_model=List[ExpenseType], dependencies=[Depends(require_salon)])
def get_salon_expense_types(
    branch_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Получение типов расходов салона"""
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon profile not found")
    
    query = db.query(ExpenseType).filter(ExpenseType.salon_id == salon.id)
    
    if branch_id:
        # Проверяем, что филиал принадлежит салону
        branch = db.query(SalonBranch).filter(
            SalonBranch.id == branch_id,
            SalonBranch.salon_id == salon.id
        ).first()
        if not branch:
            raise HTTPException(status_code=404, detail="Branch not found")
        query = query.filter(ExpenseType.branch_id == branch_id)
    else:
        # Только общие типы салона (без филиалов)
        query = query.filter(ExpenseType.branch_id.is_(None))
    
    return query.all()


@router.post("/salon/types", response_model=ExpenseType, dependencies=[Depends(require_salon)])
def create_salon_expense_type(
    expense_type: ExpenseTypeCreate,
    branch_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Создание типа расхода"""
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon profile not found")
    
    if branch_id:
        # Проверяем, что филиал принадлежит салону
        branch = db.query(SalonBranch).filter(
            SalonBranch.id == branch_id,
            SalonBranch.salon_id == salon.id
        ).first()
        if not branch:
            raise HTTPException(status_code=404, detail="Branch not found")
    
    new_expense_type = ExpenseType(
        salon_id=salon.id,
        branch_id=branch_id,
        **expense_type.dict()
    )
    
    db.add(new_expense_type)
    db.commit()
    db.refresh(new_expense_type)
    
    return new_expense_type


# API для типов расходов мастера-индивидуала
@router.get("/master/types", response_model=List[ExpenseType])
def get_master_expense_types(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Получение типов расходов мастера-индивидуала"""
    master = db.query(IndieMaster).filter(IndieMaster.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Master profile not found")
    
    expense_types = db.query(ExpenseType).filter(
        ExpenseType.indie_master_id == master.id
    ).all()
    
    return expense_types


@router.post("/master/types", response_model=ExpenseType)
def create_master_expense_type(
    expense_type: ExpenseTypeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Создание типа расхода для мастера-индивидуала"""
    master = db.query(IndieMaster).filter(IndieMaster.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Master profile not found")
    
    new_expense_type = ExpenseType(
        indie_master_id=master.id,
        **expense_type.dict()
    )
    
    db.add(new_expense_type)
    db.commit()
    db.refresh(new_expense_type)
    
    return new_expense_type


# API для расходов салона
@router.get("/salon", response_model=ExpenseList, dependencies=[Depends(require_salon)])
def get_salon_expenses(
    branch_id: Optional[int] = None,
    month: Optional[str] = Query(None, description="Формат: YYYY-MM"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Получение расходов салона"""
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon profile not found")
    
    query = db.query(Expense).filter(Expense.salon_id == salon.id)
    
    if branch_id:
        # Проверяем, что филиал принадлежит салону
        branch = db.query(SalonBranch).filter(
            SalonBranch.id == branch_id,
            SalonBranch.salon_id == salon.id
        ).first()
        if not branch:
            raise HTTPException(status_code=404, detail="Branch not found")
        query = query.filter(Expense.branch_id == branch_id)
    
    if month:
        try:
            # Парсим месяц в формате "2024-01"
            year, month_num = month.split('-')
            start_date = date(int(year), int(month_num), 1)
            if int(month_num) == 12:
                end_date = date(int(year) + 1, 1, 1)
            else:
                end_date = date(int(year), int(month_num) + 1, 1)
            
            query = query.filter(
                Expense.expense_month >= start_date,
                Expense.expense_month < end_date
            )
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid month format. Use YYYY-MM")
    
    expenses = query.all()
    
    # Вычисляем статистику
    total_amount = sum(exp.amount_with_vat for exp in expenses)
    current_month = date.today().replace(day=1)
    current_month_expenses = [exp for exp in expenses if exp.expense_month == current_month]
    current_month_total = sum(exp.amount_with_vat for exp in current_month_expenses)
    
    return ExpenseList(
        expenses=expenses,
        total_amount=total_amount,
        total_count=len(expenses),
        current_month_total=current_month_total
    )


@router.post("/salon", response_model=ExpenseOut, dependencies=[Depends(require_salon)])
def create_salon_expense(
    expense: ExpenseCreate,
    branch_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Создание расхода для салона"""
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon profile not found")
    
    if branch_id:
        # Проверяем, что филиал принадлежит салону
        branch = db.query(SalonBranch).filter(
            SalonBranch.id == branch_id,
            SalonBranch.salon_id == salon.id
        ).first()
        if not branch:
            raise HTTPException(status_code=404, detail="Branch not found")
    
    # Проверяем, что тип расхода существует и принадлежит салону
    expense_type = db.query(ExpenseType).filter(
        ExpenseType.id == expense.expense_type_id,
        ExpenseType.salon_id == salon.id,
        ExpenseType.branch_id == branch_id
    ).first()
    
    if not expense_type:
        raise HTTPException(status_code=404, detail="Expense type not found")
    
    new_expense = Expense(
        salon_id=salon.id,
        branch_id=branch_id,
        **expense.dict()
    )
    
    db.add(new_expense)
    db.commit()
    db.refresh(new_expense)
    
    return new_expense


# API для расходов мастера-индивидуала
@router.get("/master", response_model=ExpenseList)
def get_master_expenses(
    month: Optional[str] = Query(None, description="Формат: YYYY-MM"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Получение расходов мастера-индивидуала"""
    master = db.query(IndieMaster).filter(IndieMaster.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Master profile not found")
    
    query = db.query(Expense).filter(Expense.indie_master_id == master.id)
    
    if month:
        try:
            # Парсим месяц в формате "2024-01"
            year, month_num = month.split('-')
            start_date = date(int(year), int(month_num), 1)
            if int(month_num) == 12:
                end_date = date(int(year) + 1, 1, 1)
            else:
                end_date = date(int(year), int(month_num) + 1, 1)
            
            query = query.filter(
                Expense.expense_month >= start_date,
                Expense.expense_month < end_date
            )
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid month format. Use YYYY-MM")
    
    expenses = query.all()
    
    # Вычисляем статистику
    total_amount = sum(exp.amount_with_vat for exp in expenses)
    current_month = date.today().replace(day=1)
    current_month_expenses = [exp for exp in expenses if exp.expense_month == current_month]
    current_month_total = sum(exp.amount_with_vat for exp in current_month_expenses)
    
    return ExpenseList(
        expenses=expenses,
        total_amount=total_amount,
        total_count=len(expenses),
        current_month_total=current_month_total
    )


@router.post("/master", response_model=ExpenseOut)
def create_master_expense(
    expense: ExpenseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Создание расхода для мастера-индивидуала"""
    master = db.query(IndieMaster).filter(IndieMaster.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Master profile not found")
    
    # Проверяем, что тип расхода существует и принадлежит мастеру
    expense_type = db.query(ExpenseType).filter(
        ExpenseType.id == expense.expense_type_id,
        ExpenseType.indie_master_id == master.id
    ).first()
    
    if not expense_type:
        raise HTTPException(status_code=404, detail="Expense type not found")
    
    new_expense = Expense(
        indie_master_id=master.id,
        **expense.dict()
    )
    
    db.add(new_expense)
    db.commit()
    db.refresh(new_expense)
    
    return new_expense


# API для шаблонов расходов
@router.get("/salon/templates", response_model=List[ExpenseTemplate], dependencies=[Depends(require_salon)])
def get_salon_expense_templates(
    branch_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Получение шаблонов расходов салона"""
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon profile not found")
    
    query = db.query(ExpenseTemplate).filter(ExpenseTemplate.salon_id == salon.id)
    
    if branch_id:
        # Проверяем, что филиал принадлежит салону
        branch = db.query(SalonBranch).filter(
            SalonBranch.id == branch_id,
            SalonBranch.salon_id == salon.id
        ).first()
        if not branch:
            raise HTTPException(status_code=404, detail="Branch not found")
        query = query.filter(ExpenseTemplate.branch_id == branch_id)
    else:
        # Только общие шаблоны салона (без филиалов)
        query = query.filter(ExpenseTemplate.branch_id.is_(None))
    
    return query.all()


@router.post("/salon/templates", response_model=ExpenseTemplate, dependencies=[Depends(require_salon)])
def create_salon_expense_template(
    template: ExpenseTemplateCreate,
    branch_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Создание шаблона расхода для салона"""
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon profile not found")
    
    if branch_id:
        # Проверяем, что филиал принадлежит салону
        branch = db.query(SalonBranch).filter(
            SalonBranch.id == branch_id,
            SalonBranch.salon_id == salon.id
        ).first()
        if not branch:
            raise HTTPException(status_code=404, detail="Branch not found")
    
    # Проверяем, что тип расхода существует и принадлежит салону
    expense_type = db.query(ExpenseType).filter(
        ExpenseType.id == template.expense_type_id,
        ExpenseType.salon_id == salon.id,
        ExpenseType.branch_id == branch_id
    ).first()
    
    if not expense_type:
        raise HTTPException(status_code=404, detail="Expense type not found")
    
    new_template = ExpenseTemplate(
        salon_id=salon.id,
        branch_id=branch_id,
        **template.dict()
    )
    
    db.add(new_template)
    db.commit()
    db.refresh(new_template)
    
    return new_template


@router.get("/master/templates", response_model=List[ExpenseTemplate])
def get_master_expense_templates(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Получение шаблонов расходов мастера-индивидуала"""
    master = db.query(IndieMaster).filter(IndieMaster.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Master profile not found")
    
    templates = db.query(ExpenseTemplate).filter(
        ExpenseTemplate.indie_master_id == master.id
    ).all()
    
    return templates


@router.post("/master/templates", response_model=ExpenseTemplate)
def create_master_expense_template(
    template: ExpenseTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Создание шаблона расхода для мастера-индивидуала"""
    master = db.query(IndieMaster).filter(IndieMaster.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Master profile not found")
    
    # Проверяем, что тип расхода существует и принадлежит мастеру
    expense_type = db.query(ExpenseType).filter(
        ExpenseType.id == template.expense_type_id,
        ExpenseType.indie_master_id == master.id
    ).first()
    
    if not expense_type:
        raise HTTPException(status_code=404, detail="Expense type not found")
    
    new_template = ExpenseTemplate(
        indie_master_id=master.id,
        **template.dict()
    )
    
    db.add(new_template)
    db.commit()
    db.refresh(new_template)
    
    return new_template


# API для статистики расходов
@router.get("/salon/stats", response_model=ExpenseStats, dependencies=[Depends(require_salon)])
def get_salon_expense_stats(
    branch_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Получение статистики расходов салона"""
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon profile not found")
    
    query = db.query(Expense).filter(Expense.salon_id == salon.id)
    
    if branch_id:
        # Проверяем, что филиал принадлежит салону
        branch = db.query(SalonBranch).filter(
            SalonBranch.id == branch_id,
            SalonBranch.salon_id == salon.id
        ).first()
        if not branch:
            raise HTTPException(status_code=404, detail="Branch not found")
        query = query.filter(Expense.branch_id == branch_id)
    
    expenses = query.all()
    
    if not expenses:
        return ExpenseStats(
            total_expenses=0,
            total_without_vat=0,
            total_vat=0,
            expenses_count=0,
            monthly_average=0,
            top_expense_types=[],
            recent_expenses=[]
        )
    
    # Вычисляем статистику
    total_expenses = sum(exp.amount_with_vat for exp in expenses)
    total_without_vat = sum(exp.amount_without_vat for exp in expenses)
    total_vat = total_expenses - total_without_vat
    
    # Среднемесячные расходы
    months_count = len(set((exp.expense_month.year, exp.expense_month.month) for exp in expenses))
    monthly_average = total_expenses / months_count if months_count > 0 else 0
    
    # Топ типов расходов
    expense_type_stats = {}
    for exp in expenses:
        exp_type_name = exp.expense_type.name
        if exp_type_name not in expense_type_stats:
            expense_type_stats[exp_type_name] = 0
        expense_type_stats[exp_type_name] += exp.amount_with_vat
    
    top_expense_types = [
        {"name": name, "amount": amount}
        for name, amount in sorted(expense_type_stats.items(), key=lambda x: x[1], reverse=True)[:5]
    ]
    
    # Последние расходы
    recent_expenses = sorted(expenses, key=lambda x: x.created_at, reverse=True)[:10]
    
    return ExpenseStats(
        total_expenses=total_expenses,
        total_without_vat=total_without_vat,
        total_vat=total_vat,
        expenses_count=len(expenses),
        monthly_average=monthly_average,
        top_expense_types=top_expense_types,
        recent_expenses=recent_expenses
    )


# API для доходов салона
@router.get("/salon/incomes", response_model=IncomeList, dependencies=[Depends(require_salon)])
def get_salon_incomes(
    branch_id: Optional[int] = None,
    month: Optional[str] = Query(None, description="Формат: YYYY-MM"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Получение доходов салона"""
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon profile not found")
    
    query = db.query(Income).filter(Income.salon_id == salon.id)
    
    if branch_id:
        # Проверяем, что филиал принадлежит салону
        branch = db.query(SalonBranch).filter(
            SalonBranch.id == branch_id,
            SalonBranch.salon_id == salon.id
        ).first()
        if not branch:
            raise HTTPException(status_code=404, detail="Branch not found")
        query = query.filter(Income.branch_id == branch_id)
    
    if month:
        try:
            # Парсим месяц в формате "2024-01"
            year, month_num = month.split('-')
            start_date = date(int(year), int(month_num), 1)
            if int(month_num) == 12:
                end_date = date(int(year) + 1, 1, 1)
            else:
                end_date = date(int(year), int(month_num) + 1, 1)
            
            query = query.filter(
                Income.income_date >= start_date,
                Income.income_date < end_date
            )
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid month format. Use YYYY-MM")
    
    incomes = query.all()
    
    # Вычисляем статистику
    total_amount = sum(inc.total_amount for inc in incomes)
    current_month = date.today().replace(day=1)
    current_month_incomes = [inc for inc in incomes if inc.income_date == current_month]
    current_month_total = sum(inc.total_amount for inc in current_month_incomes)
    
    return IncomeList(
        incomes=incomes,
        total_amount=total_amount,
        total_count=len(incomes),
        current_month_total=current_month_total
    )


@router.post("/salon/incomes", response_model=IncomeOut, dependencies=[Depends(require_salon)])
def create_salon_income(
    income: IncomeCreate,
    branch_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Создание дохода для салона"""
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon profile not found")
    
    if branch_id:
        # Проверяем, что филиал принадлежит салону
        branch = db.query(SalonBranch).filter(
            SalonBranch.id == branch_id,
            SalonBranch.salon_id == salon.id
        ).first()
        if not branch:
            raise HTTPException(status_code=404, detail="Branch not found")
    
    new_income = Income(
        salon_id=salon.id,
        branch_id=branch_id,
        **income.dict()
    )
    
    db.add(new_income)
    db.commit()
    db.refresh(new_income)
    
    return new_income


# API для доходов мастера-индивидуала
@router.get("/master/incomes", response_model=IncomeList)
def get_master_incomes(
    month: Optional[str] = Query(None, description="Формат: YYYY-MM"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Получение доходов мастера-индивидуала"""
    master = db.query(IndieMaster).filter(IndieMaster.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Master profile not found")
    
    query = db.query(Income).filter(Income.indie_master_id == master.id)
    
    if month:
        try:
            # Парсим месяц в формате "2024-01"
            year, month_num = month.split('-')
            start_date = date(int(year), int(month_num), 1)
            if int(month_num) == 12:
                end_date = date(int(year) + 1, 1, 1)
            else:
                end_date = date(int(year), int(month_num) + 1, 1)
            
            query = query.filter(
                Income.income_date >= start_date,
                Income.income_date < end_date
            )
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid month format. Use YYYY-MM")
    
    incomes = query.all()
    
    # Вычисляем статистику
    total_amount = sum(inc.total_amount for inc in incomes)
    current_month = date.today().replace(day=1)
    current_month_incomes = [inc for inc in incomes if inc.income_date == current_month]
    current_month_total = sum(inc.total_amount for inc in current_month_incomes)
    
    return IncomeList(
        incomes=incomes,
        total_amount=total_amount,
        total_count=len(incomes),
        current_month_total=current_month_total
    )


@router.post("/master/incomes", response_model=IncomeOut)
def create_master_income(
    income: IncomeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Создание дохода для мастера-индивидуала"""
    master = db.query(IndieMaster).filter(IndieMaster.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Master profile not found")
    
    new_income = Income(
        indie_master_id=master.id,
        **income.dict()
    )
    
    db.add(new_income)
    db.commit()
    db.refresh(new_income)
    
    return new_income


# API для упущенной выгоды салона
@router.get("/salon/missed-revenues", response_model=MissedRevenueList, dependencies=[Depends(require_salon)])
def get_salon_missed_revenues(
    branch_id: Optional[int] = None,
    month: Optional[str] = Query(None, description="Формат: YYYY-MM"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Получение упущенной выгоды салона"""
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon profile not found")
    
    query = db.query(MissedRevenue).filter(MissedRevenue.salon_id == salon.id)
    
    if branch_id:
        # Проверяем, что филиал принадлежит салону
        branch = db.query(SalonBranch).filter(
            SalonBranch.id == branch_id,
            SalonBranch.salon_id == salon.id
        ).first()
        if not branch:
            raise HTTPException(status_code=404, detail="Branch not found")
        query = query.filter(MissedRevenue.branch_id == branch_id)
    
    if month:
        try:
            # Парсим месяц в формате "2024-01"
            year, month_num = month.split('-')
            start_date = date(int(year), int(month_num), 1)
            if int(month_num) == 12:
                end_date = date(int(year) + 1, 1, 1)
            else:
                end_date = date(int(year), int(month_num) + 1, 1)
            
            query = query.filter(
                MissedRevenue.missed_date >= start_date,
                MissedRevenue.missed_date < end_date
            )
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid month format. Use YYYY-MM")
    
    missed_revenues = query.all()
    
    # Вычисляем статистику
    total_amount = sum(mr.missed_amount for mr in missed_revenues)
    current_month = date.today().replace(day=1)
    current_month_missed = [mr for mr in missed_revenues if mr.missed_date == current_month]
    current_month_total = sum(mr.missed_amount for mr in current_month_missed)
    
    return MissedRevenueList(
        missed_revenues=missed_revenues,
        total_amount=total_amount,
        total_count=len(missed_revenues),
        current_month_total=current_month_total
    )


@router.post("/salon/missed-revenues", response_model=MissedRevenueOut, dependencies=[Depends(require_salon)])
def create_salon_missed_revenue(
    missed_revenue: MissedRevenueCreate,
    branch_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Создание записи об упущенной выгоде для салона"""
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon profile not found")
    
    if branch_id:
        # Проверяем, что филиал принадлежит салону
        branch = db.query(SalonBranch).filter(
            SalonBranch.id == branch_id,
            SalonBranch.salon_id == salon.id
        ).first()
        if not branch:
            raise HTTPException(status_code=404, detail="Branch not found")
    
    new_missed_revenue = MissedRevenue(
        salon_id=salon.id,
        branch_id=branch_id,
        **missed_revenue.dict()
    )
    
    db.add(new_missed_revenue)
    db.commit()
    db.refresh(new_missed_revenue)
    
    return new_missed_revenue


# API для упущенной выгоды мастера-индивидуала
@router.get("/master/missed-revenues", response_model=MissedRevenueList)
def get_master_missed_revenues(
    month: Optional[str] = Query(None, description="Формат: YYYY-MM"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Получение упущенной выгоды мастера-индивидуала"""
    master = db.query(IndieMaster).filter(IndieMaster.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Master profile not found")
    
    query = db.query(MissedRevenue).filter(MissedRevenue.indie_master_id == master.id)
    
    if month:
        try:
            # Парсим месяц в формате "2024-01"
            year, month_num = month.split('-')
            start_date = date(int(year), int(month_num), 1)
            if int(month_num) == 12:
                end_date = date(int(year) + 1, 1, 1)
            else:
                end_date = date(int(year), int(month_num) + 1, 1)
    
            query = query.filter(
                MissedRevenue.missed_date >= start_date,
                MissedRevenue.missed_date < end_date
            )
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid month format. Use YYYY-MM")
    
    missed_revenues = query.all()
    
    # Вычисляем статистику
    total_amount = sum(mr.missed_amount for mr in missed_revenues)
    current_month = date.today().replace(day=1)
    current_month_missed = [mr for mr in missed_revenues if mr.missed_date == current_month]
    current_month_total = sum(mr.missed_amount for mr in current_month_missed)
    
    return MissedRevenueList(
        missed_revenues=missed_revenues,
        total_amount=total_amount,
        total_count=len(missed_revenues),
        current_month_total=current_month_total
    )


@router.post("/master/missed-revenues", response_model=MissedRevenueOut)
def create_master_missed_revenue(
    missed_revenue: MissedRevenueCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Создание записи об упущенной выгоде для мастера-индивидуала"""
    master = db.query(IndieMaster).filter(IndieMaster.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Master profile not found")
    
    new_missed_revenue = MissedRevenue(
        indie_master_id=master.id,
        **missed_revenue.dict()
    )
    
    db.add(new_missed_revenue)
    db.commit()
    db.refresh(new_missed_revenue)
    
    return new_missed_revenue


# API для общей статистики бухгалтерии
@router.get("/salon/accounting/stats", response_model=AccountingStats, dependencies=[Depends(require_salon)])
def get_salon_accounting_stats(
    branch_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Получение общей статистики бухгалтерии салона"""
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if not salon:
        raise HTTPException(status_code=404, detail="Salon profile not found")
    
    # Получаем доходы
    income_query = db.query(Income).filter(Income.salon_id == salon.id)
    if branch_id:
        income_query = income_query.filter(Income.branch_id == branch_id)
    incomes = income_query.all()
    
    # Получаем расходы
    expense_query = db.query(Expense).filter(Expense.salon_id == salon.id)
    if branch_id:
        expense_query = expense_query.filter(Expense.branch_id == branch_id)
    expenses = expense_query.all()
    
    # Получаем упущенную выгоду
    missed_revenue_query = db.query(MissedRevenue).filter(MissedRevenue.salon_id == salon.id)
    if branch_id:
        missed_revenue_query = missed_revenue_query.filter(MissedRevenue.branch_id == branch_id)
    missed_revenues = missed_revenue_query.all()
    
    # Вычисляем статистику
    total_income = sum(inc.total_amount for inc in incomes)
    total_expenses = sum(exp.amount_with_vat for exp in expenses)
    total_missed_revenue = sum(mr.missed_amount for mr in missed_revenues)
    net_profit = total_income - total_expenses
    
    # Текущий месяц
    current_month = date.today().replace(day=1)
    monthly_income = sum(inc.total_amount for inc in incomes if inc.income_date == current_month)
    monthly_expenses = sum(exp.amount_with_vat for exp in expenses if exp.expense_month == current_month)
    monthly_profit = monthly_income - monthly_expenses
    
    return AccountingStats(
        total_income=total_income,
        total_expenses=total_expenses,
        net_profit=net_profit,
        total_missed_revenue=total_missed_revenue,
        income_count=len(incomes),
        expense_count=len(expenses),
        missed_revenue_count=len(missed_revenues),
        monthly_income=monthly_income,
        monthly_expenses=monthly_expenses,
        monthly_profit=monthly_profit
    )


@router.get("/master/accounting/stats", response_model=AccountingStats)
def get_master_accounting_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Получение общей статистики бухгалтерии мастера-индивидуала"""
    master = db.query(IndieMaster).filter(IndieMaster.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Master profile not found")
    
    # Получаем доходы
    incomes = db.query(Income).filter(Income.indie_master_id == master.id).all()
    
    # Получаем расходы
    expenses = db.query(Expense).filter(Expense.indie_master_id == master.id).all()
    
    # Получаем упущенную выгоду
    missed_revenues = db.query(MissedRevenue).filter(MissedRevenue.indie_master_id == master.id).all()
    
    # Вычисляем статистику
    total_income = sum(inc.total_amount for inc in incomes)
    total_expenses = sum(exp.amount_with_vat for exp in expenses)
    total_missed_revenue = sum(mr.missed_amount for mr in missed_revenues)
    net_profit = total_income - total_expenses
    
    # Текущий месяц
    current_month = date.today().replace(day=1)
    monthly_income = sum(inc.total_amount for inc in incomes if inc.income_date == current_month)
    monthly_expenses = sum(exp.amount_with_vat for exp in expenses if exp.expense_month == current_month)
    monthly_profit = monthly_income - monthly_expenses
    
    return AccountingStats(
        total_income=total_income,
        total_expenses=total_expenses,
        net_profit=net_profit,
        total_missed_revenue=total_missed_revenue,
        income_count=len(incomes),
        expense_count=len(expenses),
        missed_revenue_count=len(missed_revenues),
        monthly_income=monthly_income,
        monthly_expenses=monthly_expenses,
        monthly_profit=monthly_profit
    )


@router.get("/master/stats", response_model=ExpenseStats)
def get_master_expense_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Получение статистики расходов мастера-индивидуала"""
    master = db.query(IndieMaster).filter(IndieMaster.user_id == current_user.id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Master profile not found")
    
    expenses = db.query(Expense).filter(Expense.indie_master_id == master.id).all()
    
    if not expenses:
        return ExpenseStats(
            total_expenses=0,
            total_without_vat=0,
            total_vat=0,
            expenses_count=0,
            monthly_average=0,
            top_expense_types=[],
            recent_expenses=[]
        )
    
    # Вычисляем статистику
    total_expenses = sum(exp.amount_with_vat for exp in expenses)
    total_without_vat = sum(exp.amount_without_vat for exp in expenses)
    total_vat = total_expenses - total_without_vat
    
    # Среднемесячные расходы
    months_count = len(set((exp.expense_month.year, exp.expense_month.month) for exp in expenses))
    monthly_average = total_expenses / months_count if months_count > 0 else 0
    
    # Топ типов расходов
    expense_type_stats = {}
    for exp in expenses:
        exp_type_name = exp.expense_type.name
        if exp_type_name not in expense_type_stats:
            expense_type_stats[exp_type_name] = 0
        expense_type_stats[exp_type_name] += exp.amount_with_vat
    
    top_expense_types = [
        {"name": name, "amount": amount}
        for name, amount in sorted(expense_type_stats.items(), key=lambda x: x[1], reverse=True)[:5]
    ]
    
    # Последние расходы
    recent_expenses = sorted(expenses, key=lambda x: x.created_at, reverse=True)[:10]
    
    return ExpenseStats(
        total_expenses=total_expenses,
        total_without_vat=total_without_vat,
        total_vat=total_vat,
        expenses_count=len(expenses),
        monthly_average=monthly_average,
        top_expense_types=top_expense_types,
        recent_expenses=recent_expenses
    )

from datetime import datetime
from typing import List, Optional, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import or_

from auth import require_admin
from database import get_db
from models import ServiceFunction
from schemas import (
    ServiceFunctionCreate,
    ServiceFunctionUpdate,
    ServiceFunctionOut
)

router = APIRouter(
    prefix="/api/admin/service-functions",
    tags=["admin-service-functions"],
    dependencies=[Depends(require_admin)],
)


@router.get("", response_model=List[ServiceFunctionOut])
def get_service_functions(
    function_type: Optional[str] = None,
    is_active: Optional[bool] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
) -> List[ServiceFunctionOut]:
    """
    Получить список функций сервиса.
    """
    query = db.query(ServiceFunction)
    
    if function_type:
        # В БД типы храним в верхнем регистре (FREE / SUBSCRIPTION / VOLUME_BASED)
        db_function_type = function_type.upper()
        query = query.filter(ServiceFunction.function_type == db_function_type)
    
    if is_active is not None:
        query = query.filter(ServiceFunction.is_active == is_active)
    
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                ServiceFunction.name.ilike(search_term),
                ServiceFunction.description.ilike(search_term)
            )
        )
    
    functions = query.order_by(ServiceFunction.display_order, ServiceFunction.id).all()
    return functions


@router.get("/{function_id}", response_model=ServiceFunctionOut)
def get_service_function(
    function_id: int,
    db: Session = Depends(get_db),
) -> ServiceFunctionOut:
    """
    Получить функцию сервиса по ID.
    """
    function = db.query(ServiceFunction).filter(ServiceFunction.id == function_id).first()
    if not function:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Функция не найдена")
    return function


@router.post("", response_model=ServiceFunctionOut)
def create_service_function(
    function_in: ServiceFunctionCreate,
    db: Session = Depends(get_db),
) -> ServiceFunctionOut:
    """
    Создать новую функцию сервиса.
    """
    # Нормализуем тип к верхнему регистру для хранения в БД
    func_type = (function_in.function_type or "").upper()
    if func_type not in ["FREE", "SUBSCRIPTION", "VOLUME_BASED"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Неверный тип функции: {function_in.function_type}"
        )
    
    function = ServiceFunction(
        name=function_in.name,
        description=function_in.description,
        function_type=func_type,
        is_active=function_in.is_active
    )
    db.add(function)
    db.commit()
    db.refresh(function)
    return function


@router.put("/{function_id}", response_model=ServiceFunctionOut)
def update_service_function(
    function_id: int,
    function_update: ServiceFunctionUpdate,
    db: Session = Depends(get_db),
) -> ServiceFunctionOut:
    """
    Обновить функцию сервиса.
    """
    function = db.query(ServiceFunction).filter(ServiceFunction.id == function_id).first()
    if not function:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Функция не найдена")
    
    update_data = function_update.dict(exclude_unset=True)
    
    if "function_type" in update_data:
        func_type = (update_data["function_type"] or "").upper()
        if func_type not in ["FREE", "SUBSCRIPTION", "VOLUME_BASED"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Неверный тип функции: {update_data['function_type']}"
            )
        update_data["function_type"] = func_type
    
    for field, value in update_data.items():
        setattr(function, field, value)
    
    function.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(function)
    return function


@router.delete("/{function_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_service_function(
    function_id: int,
    db: Session = Depends(get_db),
) -> None:
    """
    Удалить функцию сервиса.
    """
    function = db.query(ServiceFunction).filter(ServiceFunction.id == function_id).first()
    if not function:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Функция не найдена")
    db.delete(function)
    db.commit()
    return None


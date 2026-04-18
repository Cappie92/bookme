from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import and_

from auth import get_current_active_user
from database import get_db
from models import User, Master, MasterPageModule
from schemas import (
    MasterPageModuleCreate,
    MasterPageModuleUpdate,
    MasterPageModuleOut
)
from utils.subscription_features import (
    can_add_page_module,
    get_max_page_modules,
    get_current_page_modules_count
)

router = APIRouter(
    prefix="/api/master/page-modules",
    tags=["master-page-modules"],
)


@router.get("", response_model=List[MasterPageModuleOut])
def get_master_page_modules(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> List[MasterPageModuleOut]:
    """
    Получить список модулей страницы мастера.
    """
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if not master:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Профиль мастера не найден"
        )
    
    modules = db.query(MasterPageModule).filter(
        MasterPageModule.master_id == master.id
    ).order_by(MasterPageModule.position, MasterPageModule.id).all()
    
    return modules


@router.post("", response_model=MasterPageModuleOut, status_code=status.HTTP_201_CREATED)
def create_master_page_module(
    module_data: MasterPageModuleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> MasterPageModuleOut:
    """
    Создать новый модуль на странице мастера.
    """
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if not master:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Профиль мастера не найден"
        )
    
    # Проверяем доступ к функции добавления модулей
    if not can_add_page_module(db, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Добавление модулей на страницу доступно только на планах Basic и выше. Обновите подписку для доступа к этой функции."
        )
    
    # Проверяем лимит модулей
    max_modules = get_max_page_modules(db, current_user.id)
    current_count = get_current_page_modules_count(db, master.id)
    
    if current_count >= max_modules:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Достигнут лимит модулей ({max_modules}). Обновите план для добавления большего количества модулей."
        )
    
    # Определяем позицию (последняя + 1)
    last_module = db.query(MasterPageModule).filter(
        MasterPageModule.master_id == master.id
    ).order_by(MasterPageModule.position.desc()).first()
    
    position = (last_module.position + 1) if last_module else 0
    
    module = MasterPageModule(
        master_id=master.id,
        module_type=module_data.module_type,
        position=position,
        config=module_data.config or {},
        is_active=module_data.is_active
    )
    
    db.add(module)
    db.commit()
    db.refresh(module)
    
    return module


@router.put("/{module_id}", response_model=MasterPageModuleOut)
def update_master_page_module(
    module_id: int,
    module_data: MasterPageModuleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> MasterPageModuleOut:
    """
    Обновить модуль страницы мастера.
    """
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if not master:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Профиль мастера не найден"
        )
    
    module = db.query(MasterPageModule).filter(
        and_(
            MasterPageModule.id == module_id,
            MasterPageModule.master_id == master.id
        )
    ).first()
    
    if not module:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Модуль не найден"
        )
    
    update_data = module_data.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(module, field, value)
    
    db.commit()
    db.refresh(module)
    
    return module


@router.delete("/{module_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_master_page_module(
    module_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> None:
    """
    Удалить модуль страницы мастера.
    """
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if not master:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Профиль мастера не найден"
        )
    
    module = db.query(MasterPageModule).filter(
        and_(
            MasterPageModule.id == module_id,
            MasterPageModule.master_id == master.id
        )
    ).first()
    
    if not module:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Модуль не найден"
        )
    
    db.delete(module)
    db.commit()


@router.put("/reorder", response_model=List[MasterPageModuleOut])
def reorder_master_page_modules(
    module_ids: List[int],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> List[MasterPageModuleOut]:
    """
    Изменить порядок модулей на странице мастера.
    """
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if not master:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Профиль мастера не найден"
        )
    
    # Проверяем, что все модули принадлежат мастеру
    modules = db.query(MasterPageModule).filter(
        and_(
            MasterPageModule.id.in_(module_ids),
            MasterPageModule.master_id == master.id
        )
    ).all()
    
    if len(modules) != len(module_ids):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Некоторые модули не найдены или не принадлежат мастеру"
        )
    
    # Обновляем позиции
    for position, module_id in enumerate(module_ids):
        module = next((m for m in modules if m.id == module_id), None)
        if module:
            module.position = position
    
    db.commit()
    
    # Возвращаем обновленные модули
    updated_modules = db.query(MasterPageModule).filter(
        MasterPageModule.master_id == master.id
    ).order_by(MasterPageModule.position, MasterPageModule.id).all()
    
    return updated_modules


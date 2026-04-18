from datetime import datetime
from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from auth import get_current_active_user, require_admin, get_password_hash
from database import get_db
from models import User, UserRole, ModeratorPermissions
from schemas import (
    ModeratorCreate, 
    ModeratorUpdate, 
    ModeratorOut, 
    ModeratorPermissionsCreate,
    ModeratorPermissionsUpdate
)

router = APIRouter(
    prefix="/admin/moderators",
    tags=["moderators"],
    dependencies=[Depends(require_admin)],
)


@router.get("/", response_model=List[ModeratorOut])
@router.get("", response_model=List[ModeratorOut], include_in_schema=False)
def get_moderators(
    skip: int = 0,
    limit: int = 100,
    search: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Получение списка модераторов.
    """
    query = db.query(User).filter(User.role == UserRole.MODERATOR)
    
    # Поиск по имени или email
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            (User.full_name.ilike(search_term)) |
            (User.email.ilike(search_term)) |
            (User.phone.ilike(search_term))
        )
    
    # Сортировка по дате создания (новые сначала)
    query = query.order_by(User.created_at.desc())
    
    moderators = query.offset(skip).limit(limit).all()
    
    # Добавляем права для каждого модератора
    result = []
    for moderator in moderators:
        permissions = db.query(ModeratorPermissions).filter(
            ModeratorPermissions.user_id == moderator.id
        ).first()
        
        moderator_dict = {
            "id": moderator.id,
            "email": moderator.email,
            "phone": moderator.phone,
            "full_name": moderator.full_name,
            "role": moderator.role,
            "is_active": moderator.is_active,
            "is_verified": moderator.is_verified,
            "created_at": moderator.created_at,
            "updated_at": moderator.updated_at,
            "permissions": permissions
        }
        result.append(moderator_dict)
    
    return result


@router.post("/", response_model=ModeratorOut)
@router.post("", response_model=ModeratorOut, include_in_schema=False)
def create_moderator(
    moderator_in: ModeratorCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Создание нового модератора.
    """
    # Проверяем, что email не занят
    existing_user = db.query(User).filter(User.email == moderator_in.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Проверяем, что телефон не занят
    existing_phone = db.query(User).filter(User.phone == moderator_in.phone).first()
    if existing_phone:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phone number already registered"
        )
    
    # Создаем пользователя-модератора
    moderator = User(
        email=moderator_in.email,
        phone=moderator_in.phone,
        full_name=moderator_in.full_name,
        hashed_password=get_password_hash(moderator_in.password),
        role=UserRole.MODERATOR,
        is_active=True,
        is_verified=True,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(moderator)
    db.commit()
    db.refresh(moderator)
    
    # Создаем права модератора
    permissions = ModeratorPermissions(
        user_id=moderator.id,
        **moderator_in.permissions.dict()
    )
    db.add(permissions)
    db.commit()
    db.refresh(permissions)
    
    return {
        "id": moderator.id,
        "email": moderator.email,
        "phone": moderator.phone,
        "full_name": moderator.full_name,
        "role": moderator.role,
        "is_active": moderator.is_active,
        "is_verified": moderator.is_verified,
        "created_at": moderator.created_at,
        "updated_at": moderator.updated_at,
        "permissions": permissions
    }


@router.get("/{moderator_id}", response_model=ModeratorOut)
def get_moderator(
    moderator_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Получение информации о модераторе.
    """
    moderator = db.query(User).filter(
        User.id == moderator_id,
        User.role == UserRole.MODERATOR
    ).first()
    
    if not moderator:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Moderator not found"
        )
    
    permissions = db.query(ModeratorPermissions).filter(
        ModeratorPermissions.user_id == moderator.id
    ).first()
    
    return {
        "id": moderator.id,
        "email": moderator.email,
        "phone": moderator.phone,
        "full_name": moderator.full_name,
        "role": moderator.role,
        "is_active": moderator.is_active,
        "is_verified": moderator.is_verified,
        "created_at": moderator.created_at,
        "updated_at": moderator.updated_at,
        "permissions": permissions
    }


@router.put("/{moderator_id}", response_model=ModeratorOut)
def update_moderator(
    moderator_id: int,
    moderator_in: ModeratorUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Обновление информации о модераторе.
    """
    moderator = db.query(User).filter(
        User.id == moderator_id,
        User.role == UserRole.MODERATOR
    ).first()
    
    if not moderator:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Moderator not found"
        )
    
    # Проверяем, что не пытаемся удалить админа
    if moderator.role == UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot modify admin account"
        )
    
    # Обновляем основные данные
    update_data = moderator_in.dict(exclude_unset=True, exclude={"permissions"})
    if update_data:
        for field, value in update_data.items():
            if field == "password" and value:
                setattr(moderator, "hashed_password", get_password_hash(value))
            elif field != "password":
                setattr(moderator, field, value)
        moderator.updated_at = datetime.utcnow()
    
    # Обновляем права
    if moderator_in.permissions:
        permissions = db.query(ModeratorPermissions).filter(
            ModeratorPermissions.user_id == moderator.id
        ).first()
        
        if permissions:
            update_permissions = moderator_in.permissions.dict(exclude_unset=True)
            for field, value in update_permissions.items():
                setattr(permissions, field, value)
            permissions.updated_at = datetime.utcnow()
        else:
            # Создаем права, если их нет
            permissions = ModeratorPermissions(
                user_id=moderator.id,
                **moderator_in.permissions.dict()
            )
            db.add(permissions)
    
    db.commit()
    db.refresh(moderator)
    db.refresh(permissions)
    
    return {
        "id": moderator.id,
        "email": moderator.email,
        "phone": moderator.phone,
        "full_name": moderator.full_name,
        "role": moderator.role,
        "is_active": moderator.is_active,
        "is_verified": moderator.is_verified,
        "created_at": moderator.created_at,
        "updated_at": moderator.updated_at,
        "permissions": permissions
    }


@router.delete("/{moderator_id}")
def delete_moderator(
    moderator_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Удаление модератора.
    """
    moderator = db.query(User).filter(
        User.id == moderator_id,
        User.role == UserRole.MODERATOR
    ).first()
    
    if not moderator:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Moderator not found"
        )
    
    # Проверяем, что не пытаемся удалить админа
    if moderator.role == UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot delete admin account"
        )
    
    # Удаляем права модератора
    permissions = db.query(ModeratorPermissions).filter(
        ModeratorPermissions.user_id == moderator.id
    ).first()
    if permissions:
        db.delete(permissions)
    
    # Удаляем пользователя
    db.delete(moderator)
    db.commit()
    
    return {"message": "Moderator deleted successfully"}


@router.put("/{moderator_id}/permissions", response_model=ModeratorOut)
def update_moderator_permissions(
    moderator_id: int,
    permissions_in: ModeratorPermissionsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Any:
    """
    Обновление прав модератора.
    """
    moderator = db.query(User).filter(
        User.id == moderator_id,
        User.role == UserRole.MODERATOR
    ).first()
    
    if not moderator:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Moderator not found"
        )
    
    # Проверяем, что не пытаемся изменить права админа
    if moderator.role == UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot modify admin permissions"
        )
    
    permissions = db.query(ModeratorPermissions).filter(
        ModeratorPermissions.user_id == moderator.id
    ).first()
    
    if permissions:
        update_data = permissions_in.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(permissions, field, value)
        permissions.updated_at = datetime.utcnow()
    else:
        # Создаем права, если их нет
        permissions = ModeratorPermissions(
            user_id=moderator.id,
            **permissions_in.dict()
        )
        db.add(permissions)
    
    db.commit()
    db.refresh(permissions)
    
    return {
        "id": moderator.id,
        "email": moderator.email,
        "phone": moderator.phone,
        "full_name": moderator.full_name,
        "role": moderator.role,
        "is_active": moderator.is_active,
        "is_verified": moderator.is_verified,
        "created_at": moderator.created_at,
        "updated_at": moderator.updated_at,
        "permissions": permissions
    } 
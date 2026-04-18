"""
API раздела «Клиенты» для мастера.
Список клиентов: все, у кого есть ≥1 запись (future/past, любой статус). Карточка, метаданные, ограничения.
"""
import re
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, or_, and_
from pydantic import BaseModel, Field

from database import get_db
from utils.subscription_features import has_clients_access
from models import (
    Booking,
    BookingStatus,
    Master,
    MasterClientMetadata,
    User,
    Service,
    ClientRestriction,
    IndieMaster,
)
from auth import get_current_active_user

router = APIRouter(prefix="/api/master/clients", tags=["master-clients"])

CANCELLED_STATUSES = (
    BookingStatus.CANCELLED,
    BookingStatus.CANCELLED_BY_CLIENT_EARLY,
    BookingStatus.CANCELLED_BY_CLIENT_LATE,
)


def _normalize_phone(phone: Optional[str]) -> str:
    if not phone:
        return ""
    return re.sub(r"\D", "", str(phone))


def _get_master(db: Session, user_id: int) -> Master:
    master = db.query(Master).filter(Master.user_id == user_id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Профиль мастера не найден")
    return master


def _get_client_phone_from_booking(db: Session, booking: Booking) -> Optional[str]:
    if booking.client_id:
        user = db.query(User).filter(User.id == booking.client_id).first()
        return user.phone if user else None
    return None


def _resolve_client_key(db: Session, client_key: str, master_id: int) -> tuple[Optional[int], Optional[str]]:
    """client_key = 'user:{id}' или 'phone:{phone}' или plain phone. Возвращает (client_id, client_phone)."""
    if client_key.startswith("user:"):
        try:
            uid = int(client_key[5:])
            user = db.query(User).filter(User.id == uid).first()
            if user and user.phone:
                return uid, user.phone
            return uid, (user.phone if user else None)
        except ValueError:
            raise HTTPException(status_code=400, detail="Неверный client_key")
    if client_key.startswith("phone:"):
        phone = client_key[6:].strip()
        if not phone:
            raise HTTPException(status_code=400, detail="Неверный client_key")
        user = db.query(User).filter(User.phone == phone).first()
        return (user.id if user else None), phone
    # Plain phone as fallback
    user = db.query(User).filter(User.phone == client_key).first()
    if user:
        return user.id, user.phone
    phone = _normalize_phone(client_key)
    if phone:
        user = db.query(User).filter(User.phone == phone).first()
        if user:
            return user.id, user.phone
    return None, (client_key if len(client_key) > 5 else None)


def _get_booking_crit(db: Session, master_id: int):
    """Критерий для бронирований мастера (master_id или indie_master_id)."""
    master = db.query(Master).filter(Master.id == master_id).first()
    indie_id = None
    if master:
        indie = db.query(IndieMaster).filter(IndieMaster.user_id == master.user_id).first()
        indie_id = indie.id if indie else None
    if indie_id:
        return or_(Booking.master_id == master_id, Booking.indie_master_id == indie_id)
    return Booking.master_id == master_id


def _get_clients_with_completed(db: Session, master_id: int) -> List[Dict[str, Any]]:
    """Клиенты с ≥1 completed booking. Список/поиск показывают только completed-клиентов."""
    crit = _get_booking_crit(db, master_id)

    completed = (
        db.query(Booking)
        .filter(crit, Booking.status == BookingStatus.COMPLETED, Booking.client_id.isnot(None))
        .all()
    )

    by_client: Dict[int, Dict[str, Any]] = {}
    for b in completed:
        if not b.client_id:
            continue
        cid = b.client_id
        if cid not in by_client:
            user = db.query(User).filter(User.id == cid).first()
            by_client[cid] = {
                "client_id": cid,
                "client_phone": user.phone if user else "",
                "full_name": (user.full_name if user and user.full_name else None) or None,
                "completed_count": 0,
                "cancelled_count": 0,
                "last_visit_at": None,
                "total_revenue": 0.0,
                "has_note": False,
            }
        by_client[cid]["completed_count"] += 1
        by_client[cid]["total_revenue"] += float(b.payment_amount or 0)
        if b.start_time and (by_client[cid]["last_visit_at"] is None or b.start_time > by_client[cid]["last_visit_at"]):
            by_client[cid]["last_visit_at"] = b.start_time

    cancelled_all = (
        db.query(Booking.client_id, func.count(Booking.id).label("cnt"))
        .filter(crit, Booking.status.in_(CANCELLED_STATUSES), Booking.client_id.isnot(None))
        .group_by(Booking.client_id)
        .all()
    )
    for cid, cnt in cancelled_all:
        if cid and cid in by_client:
            by_client[cid]["cancelled_count"] = cnt

    metadata_map = {}
    for m in db.query(MasterClientMetadata).filter(MasterClientMetadata.master_id == master_id).all():
        metadata_map[(master_id, m.client_phone)] = m

    for cid, row in by_client.items():
        user = db.query(User).filter(User.id == cid).first()
        phone = user.phone if user else ""
        meta = metadata_map.get((master_id, phone))
        row["master_client_name"] = meta.alias_name if meta and meta.alias_name else None
        row["note"] = meta.note if meta and meta.note else None
        row["has_note"] = bool(meta and meta.note)
        row["client_key"] = f"user:{cid}" if cid else f"phone:{phone}"
        row["full_name"] = (user.full_name if user and user.full_name else None) or None

    return list(by_client.values())


# --- Schemas ---


class MasterClientListItem(BaseModel):
    client_key: str
    client_id: Optional[int] = None
    client_phone: str
    master_client_name: Optional[str] = None
    completed_count: int
    cancelled_count: int
    last_visit_at: Optional[datetime] = None
    total_revenue: float
    has_note: bool


class MasterClientMetadataUpdate(BaseModel):
    alias_name: Optional[str] = Field(None, max_length=255)
    note: Optional[str] = Field(None, max_length=280)


class TopServiceItem(BaseModel):
    service_id: int
    service_name: str
    count: int


class CancellationBreakdownItem(BaseModel):
    reason: str
    reason_label: str
    count: int


class MasterClientDetail(MasterClientListItem):
    note: Optional[str] = None
    top_services: List[TopServiceItem] = []
    cancellations_breakdown: List[CancellationBreakdownItem] = []
    restrictions: List[Dict[str, Any]] = []
    applicable_discounts: List[Dict[str, Any]] = []


# --- Endpoints ---


def _apply_sort(rows: List[Dict[str, Any]], sort_by: str, sort_dir: str) -> List[Dict[str, Any]]:
    """Сортировка с NULLS LAST для last_visit_at."""
    rev = sort_dir.lower() == "desc"

    if sort_by == "completed_count":
        return sorted(rows, key=lambda x: (x.get("completed_count") or 0), reverse=rev)
    if sort_by == "total_revenue":
        return sorted(rows, key=lambda x: float(x.get("total_revenue") or 0), reverse=rev)
    if sort_by == "last_visit_at":
        # NULLS LAST: (0, dt) для real, (1, min) для null; при reverse (0, newest) > (0, oldest) > (1, min)
        def _key(r):
            lv = r.get("last_visit_at")
            return (1 if lv is None else 0, lv or datetime.min)

        return sorted(rows, key=_key, reverse=rev)
    return rows


def _ensure_clients_access(db: Session, user_id: int) -> None:
    """Проверка доступа к разделу «Клиенты»; 403 при отсутствии."""
    if not has_clients_access(db, user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Clients feature not available in your plan",
            headers={"X-Error-Code": "FEATURE_NOT_AVAILABLE"},
        )


@router.get("", response_model=List[MasterClientListItem])
def list_clients(
    q: Optional[str] = Query(None, description="Поиск по телефону, alias или full_name"),
    sort_by: Optional[str] = Query(
        "last_visit_at",
        description="Сортировка: completed_count, total_revenue, last_visit_at",
    ),
    sort_dir: Optional[str] = Query("desc", description="Направление: asc, desc"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Список клиентов мастера (≥1 completed booking). Поиск q, сортировка sort_by/sort_dir."""
    _ensure_clients_access(db, current_user.id)
    master = _get_master(db, current_user.id)
    rows = _get_clients_with_completed(db, master.id)

    if q:
        qn = q.strip().lower()
        qn_digits = _normalize_phone(q)
        if qn or qn_digits:
            filtered = []
            for r in rows:
                phone_digits = _normalize_phone(r.get("client_phone") or "")
                if qn_digits and qn_digits in phone_digits:
                    filtered.append(r)
                elif qn and r.get("master_client_name") and qn in (r["master_client_name"] or "").lower():
                    filtered.append(r)
                elif qn and r.get("full_name") and qn in (r["full_name"] or "").lower():
                    filtered.append(r)
            rows = filtered

    sort_col = sort_by if sort_by in ("completed_count", "total_revenue", "last_visit_at") else "last_visit_at"
    sort_d = sort_dir if sort_dir in ("asc", "desc") else "desc"
    rows = _apply_sort(rows, sort_col, sort_d)
    return rows


def _client_has_any_booking(db: Session, master_id: int, client_id: Optional[int], client_phone: Optional[str]) -> bool:
    """Есть ли хотя бы одно бронирование мастера для клиента."""
    crit = _get_booking_crit(db, master_id)
    q = db.query(Booking).filter(crit, Booking.client_id.isnot(None))
    if client_id:
        q = q.filter(Booking.client_id == client_id)
    elif client_phone:
        uid = db.query(User.id).filter(User.phone == client_phone).scalar()
        if not uid:
            return False
        q = q.filter(Booking.client_id == uid)
    else:
        return False
    return q.first() is not None


def _client_has_metadata(db: Session, master_id: int, client_phone: Optional[str]) -> bool:
    """Есть ли MasterClientMetadata для (master_id, client_phone)."""
    if not client_phone:
        return False
    return db.query(MasterClientMetadata).filter(
        MasterClientMetadata.master_id == master_id,
        MasterClientMetadata.client_phone == client_phone,
    ).first() is not None


@router.get("/{client_key}", response_model=MasterClientDetail)
def get_client_detail(
    client_key: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Карточка клиента: метрики, top_services, cancellations, restrictions, applicable_discounts."""
    _ensure_clients_access(db, current_user.id)
    master = _get_master(db, current_user.id)
    client_id, client_phone = _resolve_client_key(db, client_key, master.id)
    if not client_phone and not client_id:
        raise HTTPException(status_code=404, detail="Клиент не найден")

    if not client_phone and client_id:
        user = db.query(User).filter(User.id == client_id).first()
        client_phone = user.phone if user else ""

    has_booking = _client_has_any_booking(db, master.id, client_id, client_phone)
    has_metadata = _client_has_metadata(db, master.id, client_phone)
    if not has_booking and not has_metadata:
        raise HTTPException(status_code=404, detail="Клиент не найден")

    rows = _get_clients_with_completed(db, master.id)
    row = next((r for r in rows if r["client_key"] == client_key or (r.get("client_phone") == client_phone) or (r.get("client_id") == client_id)), None)

    if not row:
        # Только metadata, нет бронирований — собираем минимальную карточку
        user = db.query(User).filter(User.id == client_id).first() if client_id else db.query(User).filter(User.phone == client_phone).first()
        meta = db.query(MasterClientMetadata).filter(
            MasterClientMetadata.master_id == master.id,
            MasterClientMetadata.client_phone == client_phone,
        ).first()
        row = {
            "client_id": client_id,
            "client_phone": client_phone or "",
            "client_key": f"user:{client_id}" if client_id else f"phone:{client_phone}",
            "master_client_name": meta.alias_name if meta and meta.alias_name else None,
            "note": meta.note if meta and meta.note else None,
            "has_note": bool(meta and meta.note),
            "completed_count": 0,
            "cancelled_count": 0,
            "last_visit_at": None,
            "total_revenue": 0.0,
        }
    meta = db.query(MasterClientMetadata).filter(
        MasterClientMetadata.master_id == master.id,
        MasterClientMetadata.client_phone == client_phone,
    ).first()
    if meta:
        row["note"] = meta.note
        row["master_client_name"] = meta.alias_name

    # Top services
    uid = client_id
    if not uid and client_phone:
        uid = db.query(User.id).filter(User.phone == client_phone).scalar()
    if not uid:
        row["top_services"] = []
    else:
        indie = db.query(IndieMaster).filter(IndieMaster.user_id == master.user_id).first()
        bc = or_(Booking.master_id == master.id, Booking.indie_master_id == indie.id) if indie else (Booking.master_id == master.id)
        top_svc = (
            db.query(Service.id, Service.name, func.count(Booking.id).label("cnt"))
            .join(Booking, Booking.service_id == Service.id)
            .filter(bc, Booking.client_id == uid, Booking.status == BookingStatus.COMPLETED)
            .group_by(Service.id, Service.name)
            .order_by(desc("cnt"))
            .limit(5)
            .all()
        )
        row["top_services"] = [{"service_id": s[0], "service_name": s[1], "count": s[2]} for s in top_svc]

    # Cancellations breakdown
    from utils.booking_status import get_cancellation_reasons
    reasons_map = get_cancellation_reasons()
    cb = []
    if uid:
        indie2 = db.query(IndieMaster).filter(IndieMaster.user_id == master.user_id).first()
        bc2 = or_(Booking.master_id == master.id, Booking.indie_master_id == indie2.id) if indie2 else (Booking.master_id == master.id)
        cb = (
            db.query(Booking.cancellation_reason, func.count(Booking.id).label("cnt"))
            .filter(bc2, Booking.client_id == uid, Booking.status.in_(CANCELLED_STATUSES), Booking.cancellation_reason.isnot(None))
            .group_by(Booking.cancellation_reason)
            .all()
        )
    row["cancellations_breakdown"] = [
        {"reason": r[0], "reason_label": reasons_map.get(r[0], r[0]), "count": r[1]}
        for r in cb
    ]

    # Restrictions: master-only по master_id, legacy по indie_master_id
    from utils.master_canon import LEGACY_INDIE_MODE
    q = db.query(ClientRestriction).filter(
        ClientRestriction.client_phone == client_phone,
        ClientRestriction.is_active == True,
    )
    if not LEGACY_INDIE_MODE:
        q = q.filter(ClientRestriction.master_id == master.id)
    else:
        indie = db.query(IndieMaster).filter(IndieMaster.user_id == master.user_id).first()
        q = q.filter(ClientRestriction.indie_master_id == indie.id) if indie else q.filter(ClientRestriction.id < 0)
    restr = q.all()
    row["restrictions"] = [{"id": r.id, "type": r.restriction_type.value if hasattr(r.restriction_type, "value") else str(r.restriction_type), "reason": r.reason} for r in restr]

    # Applicable discounts
    from utils.loyalty_discounts import evaluate_discount_candidates
    from datetime import datetime as dt
    now = dt.utcnow()
    booking_payload = {"start_time": now, "service_id": None, "category_id": None}
    try:
        candidates, best = evaluate_discount_candidates(
            master_id=master.id,
            client_id=uid,
            client_phone=client_phone,
            booking_payload=booking_payload,
            db=db,
            now=now,
        )
        applicable = [c for c in candidates if c.get("match")]
        if best and best.get("match") and not any(a["rule_id"] == best["rule_id"] for a in applicable):
            applicable.append(best)
        row["applicable_discounts"] = [
            {
                "rule_id": c["rule_id"],
                "rule_type": c["rule_type"],
                "name": c["name"],
                "condition_type": c.get("condition_type"),
                "discount_percent": c["discount_percent"],
                "max_discount_amount": c.get("max_discount_amount"),
            }
            for c in applicable
        ]
    except Exception:
        row["applicable_discounts"] = []

    return row


class RestrictionCreate(BaseModel):
    restriction_type: str = Field(..., pattern="^(blacklist|advance_payment_only)$")
    reason: Optional[str] = None


@router.post("/{client_key}/restrictions")
def add_client_restriction(
    client_key: str,
    body: RestrictionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Добавить ограничение клиенту (blacklist / advance_payment_only)."""
    _ensure_clients_access(db, current_user.id)
    master = _get_master(db, current_user.id)
    client_id, client_phone = _resolve_client_key(db, client_key, master.id)
    if not client_phone and client_id:
        user = db.query(User).filter(User.id == client_id).first()
        client_phone = user.phone if user else ""
    if not client_phone:
        raise HTTPException(status_code=400, detail="Не удалось определить телефон клиента")

    from utils.master_canon import LEGACY_INDIE_MODE
    indie = db.query(IndieMaster).filter(IndieMaster.user_id == master.user_id).first()
    if LEGACY_INDIE_MODE and not indie:
        raise HTTPException(status_code=400, detail="Ограничения доступны только для мастеров-индивидуалов")

    existing_q = db.query(ClientRestriction).filter(
        ClientRestriction.client_phone == client_phone,
        ClientRestriction.restriction_type == body.restriction_type,
        ClientRestriction.is_active == True,
    )
    if not LEGACY_INDIE_MODE:
        existing_q = existing_q.filter(ClientRestriction.master_id == master.id)
    else:
        existing_q = existing_q.filter(ClientRestriction.indie_master_id == indie.id)
    existing = existing_q.first()
    if existing:
        raise HTTPException(status_code=400, detail="Такое ограничение уже существует")

    new_r = ClientRestriction(
        master_id=master.id if not LEGACY_INDIE_MODE else None,
        indie_master_id=indie.id if LEGACY_INDIE_MODE else None,
        client_phone=client_phone,
        restriction_type=body.restriction_type,
        reason=body.reason or None,
    )
    db.add(new_r)
    db.commit()
    db.refresh(new_r)
    return {"id": new_r.id, "type": body.restriction_type, "reason": new_r.reason}


@router.delete("/{client_key}/restrictions/{restriction_id}")
def remove_client_restriction(
    client_key: str,
    restriction_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Удалить ограничение (деактивация is_active=False)."""
    _ensure_clients_access(db, current_user.id)
    master = _get_master(db, current_user.id)
    from utils.master_canon import LEGACY_INDIE_MODE
    q = db.query(ClientRestriction).filter(ClientRestriction.id == restriction_id)
    if not LEGACY_INDIE_MODE:
        q = q.filter(ClientRestriction.master_id == master.id)
    else:
        indie = db.query(IndieMaster).filter(IndieMaster.user_id == master.user_id).first()
        if not indie:
            raise HTTPException(status_code=404, detail="Ограничения не найдены")
        q = q.filter(ClientRestriction.indie_master_id == indie.id)
    r = q.first()
    if not r:
        raise HTTPException(status_code=404, detail="Ограничение не найдено")
    r.is_active = False
    db.commit()
    return {"message": "Ограничение удалено"}


@router.patch("/{client_key}")
def update_client_metadata(
    client_key: str,
    body: MasterClientMetadataUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Обновить alias_name и/или note. note max 280."""
    _ensure_clients_access(db, current_user.id)
    master = _get_master(db, current_user.id)
    client_id, client_phone = _resolve_client_key(db, client_key, master.id)
    if not client_phone and client_id:
        user = db.query(User).filter(User.id == client_id).first()
        client_phone = user.phone if user else ""
    if not client_phone:
        raise HTTPException(status_code=400, detail="Не удалось определить телефон клиента")

    if body.note is not None and len(body.note) > 280:
        raise HTTPException(status_code=400, detail="Заметка не более 280 символов")

    meta = db.query(MasterClientMetadata).filter(
        MasterClientMetadata.master_id == master.id,
        MasterClientMetadata.client_phone == client_phone,
    ).first()
    if not meta:
        meta = MasterClientMetadata(master_id=master.id, client_phone=client_phone)
        db.add(meta)
        db.flush()

    if body.alias_name is not None:
        v = body.alias_name
        meta.alias_name = (v.strip() if isinstance(v, str) else None) or None
    if body.note is not None:
        v = body.note
        meta.note = (v.strip() if isinstance(v, str) else None) or None

    db.commit()
    db.refresh(meta)
    return {
        "alias_name": meta.alias_name,
        "note": meta.note,
        "has_note": bool(meta.note and str(meta.note).strip()),
    }

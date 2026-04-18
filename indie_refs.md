# Indie references scan

```
backend/routers/master_clients.py:24:    IndieMaster,
backend/routers/master_clients.py:87:    """Критерий для бронирований мастера (master_id или indie_master_id)."""
backend/routers/master_clients.py:91:        indie = db.query(IndieMaster).filter(IndieMaster.user_id == master.user_id).first()
backend/routers/master_clients.py:94:        return or_(Booking.master_id == master_id, Booking.indie_master_id == indie_id)
backend/routers/master_clients.py:350:        indie = db.query(IndieMaster).filter(IndieMaster.user_id == master.user_id).first()
backend/routers/master_clients.py:351:        bc = or_(Booking.master_id == master.id, Booking.indie_master_id == indie.id) if indie else (Booking.master_id == master.id)
backend/routers/master_clients.py:368:        indie2 = db.query(IndieMaster).filter(IndieMaster.user_id == master.user_id).first()
backend/routers/master_clients.py:369:        bc2 = or_(Booking.master_id == master.id, Booking.indie_master_id == indie2.id) if indie2 else (Booking.master_id == master.id)
backend/routers/master_clients.py:381:    # Restrictions (indie_master)
backend/routers/master_clients.py:382:    indie = db.query(IndieMaster).filter(IndieMaster.user_id == master.user_id).first()
backend/routers/master_clients.py:386:            ClientRestriction.indie_master_id == indie.id,
backend/routers/master_clients.py:449:    indie = db.query(IndieMaster).filter(IndieMaster.user_id == master.user_id).first()
backend/routers/master_clients.py:454:        ClientRestriction.indie_master_id == indie.id,
backend/routers/master_clients.py:463:        indie_master_id=indie.id,
backend/routers/master_clients.py:484:    indie = db.query(IndieMaster).filter(IndieMaster.user_id == master.user_id).first()
backend/routers/master_clients.py:490:        ClientRestriction.indie_master_id == indie.id,
backend/routers/dev_testdata.py:25:    IndieMaster,
backend/routers/dev_testdata.py:110:class EnsureIndieMasterRequest(BaseModel):
backend/routers/dev_testdata.py:118:    indie_master_id: int = Field(..., description="ID IndieMaster")
backend/routers/dev_testdata.py:136:    is_indie: bool = Field(False, description="True = indie-запись (indie_master_id, salon_id=NULL)")
backend/routers/dev_testdata.py:488:@router.post("/ensure_indie_master")
backend/routers/dev_testdata.py:489:def ensure_indie_master(
backend/routers/dev_testdata.py:490:    body: EnsureIndieMasterRequest,
backend/routers/dev_testdata.py:495:    Создать IndieMaster (alias/bridge) для мастера, если нет.
backend/routers/dev_testdata.py:496:    MASTER_CANON: indie_masters.master_id NOT NULL, UNIQUE — обязательно проставляем master_id.
backend/routers/dev_testdata.py:499:    from models import IndieMasterSchedule
backend/routers/dev_testdata.py:506:    indie = db.query(IndieMaster).filter(IndieMaster.master_id == master.id).first()
backend/routers/dev_testdata.py:508:        indie = db.query(IndieMaster).filter(IndieMaster.user_id == master.user_id).first()
backend/routers/dev_testdata.py:515:        return {"success": True, "indie_master_id": indie.id, "master_id": master.id, "created": False}
backend/routers/dev_testdata.py:518:    existing = db.query(IndieMaster).filter(IndieMaster.domain.like(f"{domain_base}%")).count()
backend/routers/dev_testdata.py:521:    indie = IndieMaster(
backend/routers/dev_testdata.py:544:        db.add(IndieMasterSchedule(
backend/routers/dev_testdata.py:545:            indie_master_id=indie.id,
backend/routers/dev_testdata.py:553:    return {"success": True, "indie_master_id": indie.id, "master_id": master.id, "created": True}
backend/routers/dev_testdata.py:562:    """Создать indie-услугу (Service.salon_id=NULL, indie_master_id set)."""
backend/routers/dev_testdata.py:565:    indie = db.query(IndieMaster).filter(IndieMaster.id == body.indie_master_id).first()
backend/routers/dev_testdata.py:567:        raise HTTPException(status_code=404, detail="IndieMaster not found")
backend/routers/dev_testdata.py:575:        indie_master_id=indie.id,
backend/routers/dev_testdata.py:582:    return {"success": True, "service_id": svc.id, "indie_master_id": indie.id}
backend/routers/dev_testdata.py:602:    indie = db.query(IndieMaster).filter(IndieMaster.user_id == master.user_id).first()
backend/routers/dev_testdata.py:603:    indie_master_id = indie.id if indie else None
backend/routers/dev_testdata.py:631:            if not indie_master_id or svc.indie_master_id != indie_master_id:
backend/routers/dev_testdata.py:663:        owner_id = indie_master_id if is_indie_item else body.master_id
backend/routers/dev_testdata.py:680:        if norm.get("indie_master_id"):
backend/routers/dev_testdata.py:696:        "master_has_indie": indie_master_id is not None,
backend/routers/dev_testdata.py:707:    """Статистика indie_masters и бронирований для sanity-check после reseed."""
backend/routers/dev_testdata.py:710:    indie_count = db.query(func.count(IndieMaster.id)).scalar() or 0
backend/routers/dev_testdata.py:714:        indie = db.query(IndieMaster).filter(IndieMaster.user_id == m.user_id).first()
backend/routers/dev_testdata.py:717:            (Booking.master_id == m.id) | (Booking.indie_master_id == indie_id)
backend/routers/dev_testdata.py:729:            "indie_master_id": indie_id,
backend/routers/dev_testdata.py:731:            "completed_with_indie": sum(1 for b in completed if b.indie_master_id),
backend/routers/dev_testdata.py:734:            "future_with_indie": sum(1 for b in future if b.indie_master_id),
backend/routers/dev_testdata.py:737:    return {"indie_masters_count": indie_count, "per_master": per_master}
backend/routers/dev_testdata.py:807:    indie_ids = [i.id for i in db.query(IndieMaster).filter(IndieMaster.user_id.in_(user_ids)).all()]
backend/routers/dev_testdata.py:832:        IndieMasterSchedule,
backend/routers/dev_testdata.py:893:            db.query(ClientRestriction).filter(ClientRestriction.indie_master_id == iid).delete(
backend/routers/dev_testdata.py:904:            db.query(IndieMasterSchedule).filter(
backend/routers/dev_testdata.py:905:                IndieMasterSchedule.indie_master_id.in_(indie_ids)
backend/routers/dev_testdata.py:907:        db.query(IndieMaster).filter(IndieMaster.user_id.in_(user_ids)).delete(synchronize_session=False)
backend/routers/dev_testdata.py:919:            db.query(Service).filter(Service.indie_master_id == iid).delete(synchronize_session=False)
backend/routers/dev_testdata.py:968:        cond.append(Booking.indie_master_id.in_(indie_ids))
backend/routers/dev_testdata.py:1018:        cond.append(Booking.indie_master_id.in_(indie_ids))
backend/routers/expenses.py:9:    ExpenseType, Expense, ExpenseTemplate, Salon, SalonBranch, IndieMaster, User, Income, MissedRevenue, Booking
backend/routers/expenses.py:99:    master = db.query(IndieMaster).filter(IndieMaster.user_id == current_user.id).first()
backend/routers/expenses.py:104:        ExpenseType.indie_master_id == master.id
backend/routers/expenses.py:117:    master = db.query(IndieMaster).filter(IndieMaster.user_id == current_user.id).first()
backend/routers/expenses.py:122:        indie_master_id=master.id,
backend/routers/expenses.py:243:    master = db.query(IndieMaster).filter(IndieMaster.user_id == current_user.id).first()
backend/routers/expenses.py:247:    query = db.query(Expense).filter(Expense.indie_master_id == master.id)
backend/routers/expenses.py:289:    master = db.query(IndieMaster).filter(IndieMaster.user_id == current_user.id).first()
backend/routers/expenses.py:296:        ExpenseType.indie_master_id == master.id
backend/routers/expenses.py:303:        indie_master_id=master.id,
backend/routers/expenses.py:394:    master = db.query(IndieMaster).filter(IndieMaster.user_id == current_user.id).first()
backend/routers/expenses.py:399:        ExpenseTemplate.indie_master_id == master.id
backend/routers/expenses.py:412:    master = db.query(IndieMaster).filter(IndieMaster.user_id == current_user.id).first()
backend/routers/expenses.py:419:        ExpenseType.indie_master_id == master.id
backend/routers/expenses.py:426:        indie_master_id=master.id,
backend/routers/expenses.py:610:    master = db.query(IndieMaster).filter(IndieMaster.user_id == current_user.id).first()
backend/routers/expenses.py:614:    query = db.query(Income).filter(Income.indie_master_id == master.id)
backend/routers/expenses.py:656:    master = db.query(IndieMaster).filter(IndieMaster.user_id == current_user.id).first()
backend/routers/expenses.py:661:        indie_master_id=master.id,
backend/routers/expenses.py:772:    master = db.query(IndieMaster).filter(IndieMaster.user_id == current_user.id).first()
backend/routers/expenses.py:776:    query = db.query(MissedRevenue).filter(MissedRevenue.indie_master_id == master.id)
backend/routers/expenses.py:818:    master = db.query(IndieMaster).filter(IndieMaster.user_id == current_user.id).first()
backend/routers/expenses.py:823:        indie_master_id=master.id,
backend/routers/expenses.py:896:    master = db.query(IndieMaster).filter(IndieMaster.user_id == current_user.id).first()
backend/routers/expenses.py:901:    incomes = db.query(Income).filter(Income.indie_master_id == master.id).all()
backend/routers/expenses.py:904:    expenses = db.query(Expense).filter(Expense.indie_master_id == master.id).all()
backend/routers/expenses.py:907:    missed_revenues = db.query(MissedRevenue).filter(MissedRevenue.indie_master_id == master.id).all()
backend/routers/expenses.py:941:    master = db.query(IndieMaster).filter(IndieMaster.user_id == current_user.id).first()
backend/routers/expenses.py:945:    expenses = db.query(Expense).filter(Expense.indie_master_id == master.id).all()
backend/routers/accounting.py:18:    User, Master, IndieMaster, MasterExpense, BookingConfirmation, Booking, Income,
backend/routers/accounting.py:57:        # - Booking.master_id / indie_master_id — проверка владения (салон / инди)
backend/routers/accounting.py:131:                    # Income.indie_master_id -> FK на indie_masters.id (не masters.id)
backend/routers/accounting.py:132:                    indie_master_id=None,
backend/routers/accounting.py:160:    """Возвращает (master_id, indie_master_id) для проверки владения Booking.
backend/routers/accounting.py:161:    Booking имеет либо master_id (салон), либо indie_master_id (инди)."""
backend/routers/accounting.py:163:    indie = db.query(IndieMaster).filter(IndieMaster.user_id == user_id).first()
backend/routers/accounting.py:172:    """Условие владения: master_id или indie_master_id."""
backend/routers/accounting.py:177:        conds.append(Booking.indie_master_id == indie_id)
backend/routers/accounting.py:888:            # Income.indie_master_id -> FK на indie_masters.id (не masters.id)
backend/routers/accounting.py:889:            indie_master_id=None,
backend/routers/domain.py:5:from models import Salon, IndieMaster, Master, MasterPageModule, Booking, BookingStatus, Subscription, SubscriptionPlan, SubscriptionType, SubscriptionStatus, User, MasterService, MasterServiceCategory
backend/routers/domain.py:42:    indie_master = db.query(IndieMaster).filter(IndieMaster.domain == subdomain).first()
backend/routers/domain.py:43:    if indie_master:
backend/routers/domain.py:44:        user = indie_master.user
backend/routers/domain.py:46:            "owner_type": "indie_master",
backend/routers/domain.py:47:            "owner_id": indie_master.id,
backend/routers/domain.py:49:            "description": indie_master.bio or "",
backend/routers/domain.py:52:            "website": getattr(indie_master, "website", None),
backend/routers/domain.py:53:            "logo": getattr(indie_master, "logo", None),
backend/routers/domain.py:54:            "address": indie_master.address,
backend/routers/domain.py:55:            "city": indie_master.city,
backend/routers/domain.py:56:            "timezone": indie_master.timezone,
backend/routers/domain.py:57:            "experience_years": indie_master.experience_years,
backend/routers/domain.py:127:    indie_master = db.query(IndieMaster).filter(IndieMaster.domain == subdomain).first()
backend/routers/domain.py:128:    if indie_master:
backend/routers/domain.py:130:        for service in indie_master.services:
backend/routers/domain.py:240:    indie_master = db.query(IndieMaster).filter(IndieMaster.domain == subdomain).first()
backend/routers/domain.py:241:    if indie_master:
backend/routers/domain.py:262:        # Проверяем indie_master
backend/routers/domain.py:263:        indie_master = db.query(IndieMaster).filter(IndieMaster.domain == subdomain).first()
backend/routers/domain.py:264:        if not indie_master:
backend/routers/domain.py:266:        master_id = indie_master.id
backend/routers/domain.py:267:        user_id = indie_master.user_id
backend/routers/domain.py:282:                Booking.indie_master_id == master_id,
backend/routers/bookings.py:151:    elif booking.indie_master_id:
backend/routers/bookings.py:153:        owner_id = booking.indie_master_id
backend/routers/bookings.py:156:        if not check_master_working_hours(db, booking.indie_master_id, booking.start_time, booking.end_time):
backend/routers/bookings.py:263:    elif booking.indie_master_id:
backend/routers/bookings.py:264:        from models import IndieMaster
backend/routers/bookings.py:265:        indie_master = db.query(IndieMaster).filter(IndieMaster.id == booking.indie_master_id).first()
backend/routers/bookings.py:268:    owner_type_str = "indie" if booking.indie_master_id else "salon"
backend/routers/bookings.py:269:    owner_id_val = booking.indie_master_id or booking.master_id
backend/routers/bookings.py:271:        raise HTTPException(status_code=400, detail="master_id or indie_master_id required")
backend/routers/bookings.py:326:    elif booking.indie_master_id:
backend/routers/bookings.py:328:        owner_id = booking.indie_master_id
backend/routers/bookings.py:331:        if not check_master_working_hours(db, booking.indie_master_id, booking.start_time, booking.end_time):
backend/routers/bookings.py:429:    elif booking.indie_master_id:
backend/routers/bookings.py:430:        from models import IndieMaster
backend/routers/bookings.py:432:        indie_master = db.query(IndieMaster).filter(IndieMaster.id == booking.indie_master_id).first()
backend/routers/bookings.py:433:        # Пока оставляем CREATED для indie_master, можно добавить позже
backend/routers/bookings.py:468:    owner_type_str = "indie" if booking.indie_master_id else "salon"
backend/routers/bookings.py:469:    owner_id_val = booking.indie_master_id or booking.master_id
backend/routers/dev_e2e.py:25:    IndieMaster,
backend/routers/dev_e2e.py:26:    IndieMasterSchedule,
backend/routers/dev_e2e.py:93:    indie_masters = db.query(IndieMaster).filter(
backend/routers/dev_e2e.py:94:        IndieMaster.domain.in_([MASTER_A_DOMAIN, MASTER_B_DOMAIN])
backend/routers/dev_e2e.py:95:    ).filter(IndieMaster.user_id.in_(user_ids)).all()
backend/routers/dev_e2e.py:96:    indie_master_ids = [im.id for im in indie_masters]
backend/routers/dev_e2e.py:100:        (Booking.client_id.in_(user_ids)) | (Booking.indie_master_id.in_(indie_master_ids))
backend/routers/dev_e2e.py:107:        (Booking.client_id.in_(user_ids)) | (Booking.indie_master_id.in_(indie_master_ids))
backend/routers/dev_e2e.py:112:        | (ClientFavorite.indie_master_id.in_(indie_master_ids))
backend/routers/dev_e2e.py:114:    db.query(Service).filter(Service.indie_master_id.in_(indie_master_ids)).delete(synchronize_session=False)
backend/routers/dev_e2e.py:115:    db.query(IndieMasterSchedule).filter(
backend/routers/dev_e2e.py:116:        IndieMasterSchedule.indie_master_id.in_(indie_master_ids)
backend/routers/dev_e2e.py:119:    db.query(IndieMaster).filter(IndieMaster.id.in_(indie_master_ids)).delete(synchronize_session=False)
backend/routers/dev_e2e.py:123:    logger.info("E2E reset: удалены users=%s, masters=%s, indie_masters=%s", user_ids, master_ids, indie_master_ids)
backend/routers/dev_e2e.py:258:    # IndieMaster для A и B
backend/routers/dev_e2e.py:259:    def ensure_indie(master: Master, domain: str) -> IndieMaster:
backend/routers/dev_e2e.py:260:        im = db.query(IndieMaster).filter(IndieMaster.user_id == master.user_id).first()
backend/routers/dev_e2e.py:267:        im = IndieMaster(
backend/routers/dev_e2e.py:282:    def ensure_services(indie: IndieMaster, names: list[tuple[str, int, float]]) -> list[Service]:
backend/routers/dev_e2e.py:283:        existing = db.query(Service).filter(Service.indie_master_id == indie.id).all()
backend/routers/dev_e2e.py:292:                    indie_master_id=indie.id,
backend/routers/dev_e2e.py:307:            ex = db.query(IndieMasterSchedule).filter(
backend/routers/dev_e2e.py:308:                IndieMasterSchedule.indie_master_id == im.id,
backend/routers/dev_e2e.py:309:                IndieMasterSchedule.day_of_week == dow,
backend/routers/dev_e2e.py:317:                db.add(IndieMasterSchedule(
backend/routers/dev_e2e.py:318:                    indie_master_id=im.id,
backend/routers/dev_e2e.py:330:        Booking.indie_master_id == im_a.id,
backend/routers/dev_e2e.py:337:        past_booking.indie_master_id = im_a.id
backend/routers/dev_e2e.py:347:            indie_master_id=im_a.id,
backend/routers/dev_e2e.py:361:        Booking.indie_master_id == im_a.id,
backend/routers/dev_e2e.py:367:        client_cancel_booking.indie_master_id = im_a.id
backend/routers/dev_e2e.py:377:            indie_master_id=im_a.id,
backend/routers/dev_e2e.py:390:        Booking.indie_master_id == im_b.id,
backend/routers/dev_e2e.py:396:        pre_visit_booking.indie_master_id = im_b.id
backend/routers/dev_e2e.py:406:            indie_master_id=im_b.id,
backend/routers/client.py:16:    User, Salon, Master, IndieMaster, Service, SalonBranch, Booking, 
backend/routers/client.py:57:        if booking.indie_master:
backend/routers/client.py:58:            return getattr(booking.indie_master, "timezone", None) or fallback
backend/routers/client.py:77:# MASTER_CANON: response_model без indie_master_id в MODE=1
backend/routers/client.py:99:            joinedload(Booking.indie_master).joinedload(IndieMaster.user),
backend/routers/client.py:163:            elif b.indie_master and b.indie_master.domain:
backend/routers/client.py:164:                master_domain = b.indie_master.domain
backend/routers/client.py:168:                if MASTER_CANON_DEBUG and b.indie_master_id:
backend/routers/client.py:184:                if MASTER_CANON_DEBUG and b.indie_master_id:
backend/routers/client.py:209:                elif b.indie_master and b.indie_master.user:
backend/routers/client.py:210:                    master_name = b.indie_master.user.full_name or "-"
backend/routers/client.py:225:                    indie_master_id=b.indie_master_id,
backend/routers/client.py:267:            joinedload(Booking.indie_master).joinedload(IndieMaster.user),
backend/routers/client.py:331:            elif b.indie_master and b.indie_master.domain:
backend/routers/client.py:332:                master_domain = b.indie_master.domain
backend/routers/client.py:335:                if MASTER_CANON_DEBUG and b.indie_master_id:
backend/routers/client.py:351:                if MASTER_CANON_DEBUG and b.indie_master_id:
backend/routers/client.py:376:                elif b.indie_master and b.indie_master.user:
backend/routers/client.py:377:                    master_name = b.indie_master.user.full_name or "-"
backend/routers/client.py:392:                    indie_master_id=b.indie_master_id,
backend/routers/client.py:455:        elif booking.indie_master:
backend/routers/client.py:457:            owner_id = booking.indie_master.id
backend/routers/client.py:569:                | (Booking.indie_master_id == booking_in.indie_master_id)
backend/routers/client.py:642:    owner_type_str = "indie" if booking_in.indie_master_id else "salon"
backend/routers/client.py:643:    owner_id_val = booking_in.indie_master_id or booking_in.master_id
backend/routers/client.py:645:        raise HTTPException(status_code=400, detail="master_id or indie_master_id required")
backend/routers/client.py:707:                    | (Booking.indie_master_id == booking.indie_master_id)
backend/routers/client.py:1729:        top_indie_masters = (
backend/routers/client.py:1731:                Booking.indie_master_id,
backend/routers/client.py:1736:                Booking.indie_master_id.isnot(None)
backend/routers/client.py:1738:            .group_by(Booking.indie_master_id)
backend/routers/client.py:1745:        indie_master_names = {}
backend/routers/client.py:1746:        for indie_master_id, _ in top_indie_masters:
backend/routers/client.py:1747:            if indie_master_id:
backend/routers/client.py:1748:                indie_master = db.query(IndieMaster).filter(IndieMaster.id == indie_master_id).first()
backend/routers/client.py:1749:                if indie_master and indie_master.user:
backend/routers/client.py:1750:                    indie_master_names[indie_master_id] = indie_master.user.full_name
backend/routers/client.py:1752:        top_indie_masters_with_names = [
backend/routers/client.py:1754:                "indie_master_id": indie_master_id,
backend/routers/client.py:1755:                "indie_master_name": indie_master_names.get(indie_master_id, "Неизвестный мастер"),
backend/routers/client.py:1758:            for indie_master_id, count in top_indie_masters
backend/routers/client.py:1788:            "top_indie_masters": top_indie_masters_with_names,
backend/routers/client.py:1814:                if favorite_data.favorite_type == "indie_master" or favorite_data.indie_master_id:
backend/routers/client.py:1817:        elif favorite_data.favorite_type == "indie_master" and MASTER_CANON_DEBUG:
backend/routers/client.py:1818:            logger.info("MASTER_CANON deprecated: POST /favorites with favorite_type=indie_master")
backend/routers/client.py:1843:        elif favorite_data.indie_master_id:
backend/routers/client.py:1848:                    ClientFavorite.favorite_type == 'indie_master',
backend/routers/client.py:1849:                    ClientFavorite.indie_master_id == favorite_data.indie_master_id
backend/routers/client.py:1878:        elif favorite_data.favorite_type == 'indie_master' and favorite_data.indie_master_id:
backend/routers/client.py:1879:            indie_master = db.query(IndieMaster).options(joinedload(IndieMaster.user)).filter(IndieMaster.id == favorite_data.indie_master_id).first()
backend/routers/client.py:1880:            if indie_master and indie_master.user:
backend/routers/client.py:1881:                favorite_name = indie_master.user.full_name
backend/routers/client.py:1892:            indie_master_id=favorite_data.indie_master_id,
backend/routers/client.py:1914:def get_indie_master_profile(
backend/routers/client.py:1924:        indie_master = (
backend/routers/client.py:1925:            db.query(IndieMaster)
backend/routers/client.py:1926:            .options(joinedload(IndieMaster.user))
backend/routers/client.py:1927:            .filter(IndieMaster.id == master_id)
backend/routers/client.py:1931:        if not indie_master:
backend/routers/client.py:1935:            "id": indie_master.id,
backend/routers/client.py:1936:            "name": indie_master.user.full_name if indie_master.user else "Неизвестный мастер",
backend/routers/client.py:1937:            "domain": indie_master.domain,
backend/routers/client.py:1938:            "city": indie_master.city,
backend/routers/client.py:1939:            "timezone": indie_master.timezone
backend/routers/client.py:2071:        elif favorite_type == 'indie_master' or favorite_type == 'indie-masters' or favorite_type == 'indieMasters':
backend/routers/client.py:2076:                    ClientFavorite.favorite_type == 'indie_master',
backend/routers/client.py:2077:                    ClientFavorite.indie_master_id == item_id
backend/routers/client.py:2137:                "indie_master_id": fav.indie_master_id,
backend/routers/client.py:2142:                "indie_master": None,
backend/routers/client.py:2192:                "indie_master_id": fav.indie_master_id,
backend/routers/client.py:2197:                "indie_master": None,
backend/routers/client.py:2228:@profile_router.get("/favorites/indie-masters")
backend/routers/client.py:2229:def get_favorite_indie_masters(
backend/routers/client.py:2245:            .options(joinedload(ClientFavorite.indie_master).joinedload(IndieMaster.user))
backend/routers/client.py:2248:                ClientFavorite.favorite_type == 'indie_master'
backend/routers/client.py:2261:                "indie_master_id": fav.indie_master_id,
backend/routers/client.py:2266:                "indie_master": None,
backend/routers/client.py:2269:            if fav.indie_master:
backend/routers/client.py:2270:                indie_master_data = {
backend/routers/client.py:2271:                    "id": fav.indie_master.id,
backend/routers/client.py:2272:                    "user_id": fav.indie_master.user_id,
backend/routers/client.py:2273:                    "domain": getattr(fav.indie_master, 'domain', None),
backend/routers/client.py:2274:                    "city": getattr(fav.indie_master, 'city', None),
backend/routers/client.py:2275:                    "address": getattr(fav.indie_master, 'address', None),
backend/routers/client.py:2276:                    "bio": getattr(fav.indie_master, 'bio', None),
backend/routers/client.py:2277:                    "experience_years": getattr(fav.indie_master, 'experience_years', None),
backend/routers/client.py:2280:                if fav.indie_master.user:
backend/routers/client.py:2281:                    indie_master_data["user"] = {
backend/routers/client.py:2282:                        "id": fav.indie_master.user.id,
backend/routers/client.py:2283:                        "full_name": fav.indie_master.user.full_name,
backend/routers/client.py:2284:                        "phone": getattr(fav.indie_master.user, 'phone', None),
backend/routers/client.py:2285:                        "email": getattr(fav.indie_master.user, 'email', None)
backend/routers/client.py:2287:                fav_dict["indie_master"] = indie_master_data
backend/routers/client.py:2313:                joinedload(ClientFavorite.indie_master)
backend/routers/client.py:2330:                "indie_master_id": fav.indie_master_id,
backend/routers/client.py:2335:                "indie_master": None,
backend/routers/client.py:2352:            if fav.indie_master:
backend/routers/client.py:2353:                fav_dict["indie_master"] = {
backend/routers/client.py:2354:                    "id": fav.indie_master.id,
backend/routers/client.py:2355:                    "domain": fav.indie_master.domain,
backend/routers/client.py:2356:                    "city": fav.indie_master.city
backend/routers/client.py:2402:        elif favorite_type == 'indie_master':
backend/routers/client.py:2407:                    ClientFavorite.favorite_type == 'indie_master',
backend/routers/client.py:2408:                    ClientFavorite.indie_master_id == item_id
backend/routers/admin.py:1286:            "indie_master_id": service.indie_master_id,
backend/routers/master.py:19:from models import Booking, Master, MasterSchedule, MasterScheduleSettings, User, BookingStatus, Service, ServiceCategory, MasterServiceCategory, MasterService, SalonMasterInvitation, SalonMasterInvitationStatus, ClientRestriction, Salon, SalonBranch, Income, Subscription, SubscriptionType, SubscriptionStatus, SubscriptionFreeze, ClientRestrictionRule, MasterPaymentSettings, IndieMaster, AppliedDiscount, MasterClientMetadata
backend/routers/master.py:208:            "indie_master_id": booking.indie_master_id,
backend/routers/master.py:263:            or_(Booking.master_id == master.id, Booking.indie_master_id == master.id),
backend/routers/master.py:825:    # Учитываем записи как для мастера, так и для indie_master
backend/routers/master.py:829:            or_(Booking.master_id == master.id, Booking.indie_master_id == master.id),
backend/routers/master.py:2754:def _get_indie_master_id_for_restrictions(db: Session, master: Master) -> int:
backend/routers/master.py:2755:    """Возвращает IndieMaster.id по master. Нужен для ClientRestriction.indie_master_id (FK на indie_masters)."""
backend/routers/master.py:2756:    indie = db.query(IndieMaster).filter(IndieMaster.user_id == master.user_id).first()
backend/routers/master.py:2760:            detail="IndieMaster profile not found. Restrictions require an indie master profile."
backend/routers/master.py:2779:    indie_id = _get_indie_master_id_for_restrictions(db, master)
backend/routers/master.py:2781:    # Используем модель БД, а не pydantic-схему; indie_master_id = indie_masters.id
backend/routers/master.py:2783:        ClientRestrictionModel.indie_master_id == indie_id,
backend/routers/master.py:2812:    indie_id = _get_indie_master_id_for_restrictions(db, master)
backend/routers/master.py:2816:        ClientRestrictionModel.indie_master_id == indie_id,
backend/routers/master.py:2826:        indie_master_id=indie_id,
backend/routers/master.py:2855:    indie_id = _get_indie_master_id_for_restrictions(db, master)
backend/routers/master.py:2859:        ClientRestriction.indie_master_id == indie_id
backend/routers/master.py:2891:    indie_id = _get_indie_master_id_for_restrictions(db, master)
backend/routers/master.py:2895:        ClientRestriction.indie_master_id == indie_id
backend/routers/master.py:2924:    indie_id = _get_indie_master_id_for_restrictions(db, master)
backend/routers/master.py:2927:        ClientRestriction.indie_master_id == indie_id,
backend/routers/master.py:3224:        from models import Income, Service, SalonBranch, BookingStatus, Subscription, IndieMaster, Salon
backend/routers/master.py:3235:        is_indie_master = master.can_work_independently
backend/routers/master.py:3236:        logger.info(f"✅ ШАГ 0.3: is_indie_master={is_indie_master}")
backend/routers/master.py:3240:        if is_indie_master:
backend/routers/master.py:3516:                    or_(Booking.master_id == master.id, Booking.indie_master_id == master.id),
backend/routers/master.py:3526:                    or_(Booking.master_id == master.id, Booking.indie_master_id == master.id),
backend/routers/master.py:3544:                    or_(Booking.master_id == master.id, Booking.indie_master_id == master.id),
backend/routers/master.py:3554:                    or_(Booking.master_id == master.id, Booking.indie_master_id == master.id),
backend/routers/master.py:3582:                        or_(Booking.master_id == master.id, Booking.indie_master_id == master.id),
backend/routers/master.py:3608:                or_(Booking.master_id == master.id, Booking.indie_master_id == master.id),
backend/routers/master.py:3715:                or_(Booking.master_id == master.id, Booking.indie_master_id == master.id),
backend/routers/master.py:3726:                or_(Booking.master_id == master.id, Booking.indie_master_id == master.id),
backend/routers/master.py:3805:        indie_master = db.query(IndieMaster).filter(IndieMaster.user_id == current_user.id).first()
backend/routers/master.py:3809:            or_(Booking.master_id == master.id, Booking.indie_master_id == master.id),
backend/routers/master.py:3814:        if indie_master:
backend/routers/master.py:3815:            indie_services = db.query(func.count(Service.id)).filter(Service.indie_master_id == indie_master.id).scalar()
backend/routers/master.py:3816:            logger.info(f"🔍 Услуг у IndieMaster: {indie_services}")
backend/routers/master.py:3818:            logger.info("🔍 IndieMaster профиль не найден")
backend/routers/master.py:3826:        if indie_master is not None:
backend/routers/master.py:3828:                or_(Booking.master_id == master.id, Booking.indie_master_id == indie_master.id),
backend/routers/master.py:3844:        # Но если у IndieMaster нет услуг, показываем все услуги мастера
backend/routers/master.py:3845:        if indie_master is not None:
backend/routers/master.py:3846:            indie_services_count = db.query(func.count(Service.id)).filter(Service.indie_master_id == indie_master.id).scalar()
backend/routers/master.py:3848:                q_bookings = q_bookings.join(Service, Service.id == Booking.service_id).filter(Service.indie_master_id == indie_master.id)
backend/routers/master.py:3849:                logger.info("🔍 Фильтруем по IndieMaster услугам")
backend/routers/master.py:3851:                logger.info("🔍 IndieMaster услуг нет, показываем все услуги мастера")
backend/routers/master.py:3872:        if is_indie_master:
backend/routers/master.py:3877:                Income.indie_master_id == master.id,
backend/routers/master.py:3884:            if indie_master is not None:
backend/routers/master.py:3885:                indie_services_count = db.query(func.count(Service.id)).filter(Service.indie_master_id == indie_master.id).scalar()
backend/routers/master.py:3887:                    earnings_query = earnings_query.join(Service, Service.id == Booking.service_id).filter(Service.indie_master_id == indie_master.id)
backend/routers/master.py:3890:            if indie_master is not None:
backend/routers/master.py:3895:                    or_(Booking.master_id == master.id, Booking.indie_master_id == indie_master.id),
backend/routers/master.py:3910:            if indie_master is not None:
backend/routers/master.py:3911:                indie_services_count = db.query(func.count(Service.id)).filter(Service.indie_master_id == indie_master.id).scalar()
backend/routers/master.py:3913:                    earnings_query = earnings_query.join(Service, Service.id == Booking.service_id).filter(Service.indie_master_id == indie_master.id)
backend/routers/master.py:3919:            if indie_master is not None:
backend/routers/master.py:3924:                    or_(Booking.master_id == master.id, Booking.indie_master_id == indie_master.id),
backend/routers/master.py:3939:            if indie_master is not None:
backend/routers/master.py:3940:                indie_services_count = db.query(func.count(Service.id)).filter(Service.indie_master_id == indie_master.id).scalar()
backend/routers/master.py:3942:                    q_fallback = q_fallback.join(Service, Service.id == Booking.service_id).filter(Service.indie_master_id == indie_master.id)
backend/routers/master.py:3997:                "is_indie_master": bool(is_indie_master),
backend/routers/master.py:4066:        from models import Income, Service, BookingStatus, IndieMaster
backend/routers/master.py:4074:        is_indie_master = master.can_work_independently
backend/routers/master.py:4075:        indie_master = None
backend/routers/master.py:4076:        if is_indie_master:
backend/routers/master.py:4077:            indie_master = db.query(IndieMaster).filter(IndieMaster.user_id == current_user.id).first()
backend/routers/master.py:4122:        if indie_master:
backend/routers/master.py:4125:                Booking.indie_master_id == indie_master.id
backend/test_migration_integrity.py:16:from models import Base, User, UserRole, Master, IndieMaster, Salon, SalonBranch
backend/test_migration_integrity.py:37:        new_tables = ['salon_masters', 'indie_masters']
backend/test_migration_integrity.py:82:            indie_masters_count = db.execute(text("""
backend/test_migration_integrity.py:83:                SELECT COUNT(*) FROM indie_masters
backend/test_migration_integrity.py:86:            if masters_with_indie_work == indie_masters_count:
backend/test_migration_integrity.py:87:                print(f"   ✅ Все независимые мастера мигрированы: {indie_masters_count}")
backend/test_migration_integrity.py:90:                print(f"   ❌ Несоответствие: независимых мастеров: {masters_with_indie_work}, мигрировано: {indie_masters_count}")
backend/test_migration_integrity.py:251:                'idx_indie_masters_master',
backend/test_migration_integrity.py:252:                'idx_indie_masters_domain'
backend/TEST_SYSTEM_README.md:18:- **Email**: `indie_master1@test.com` - `indie_master3@test.com`
backend/models.py:37:    INDIE_MASTER = "indie_master"
backend/models.py:71:    indie_profile = relationship("IndieMaster", back_populates="user", uselist=False)
backend/models.py:147:    indie_master_id = Column(Integer, ForeignKey("indie_masters.id"), nullable=True)
backend/models.py:152:    indie_master = relationship("IndieMaster", back_populates="services")
backend/models.py:226:class IndieMaster(Base):
backend/models.py:227:    __tablename__ = "indie_masters"
backend/models.py:246:    master = relationship("Master", backref="indie_master_profile")
backend/models.py:247:    services = relationship("Service", back_populates="indie_master")
backend/models.py:248:    bookings = relationship("Booking", back_populates="indie_master")
backend/models.py:249:    schedule = relationship("IndieMasterSchedule", back_populates="indie_master")
backend/models.py:281:    indie_master_id = Column(Integer, ForeignKey("indie_masters.id"), nullable=True)
backend/models.py:308:    indie_master = relationship("IndieMaster", back_populates="bookings")
backend/models.py:359:class IndieMasterSchedule(Base):
backend/models.py:360:    __tablename__ = "indie_master_schedules"
backend/models.py:363:    indie_master_id = Column(Integer, ForeignKey("indie_masters.id"))
backend/models.py:369:    indie_master = relationship("IndieMaster", back_populates="schedule")
backend/models.py:1249:    indie_master_id = Column(Integer, ForeignKey("indie_masters.id"), nullable=True)  # ID мастера-индивидуала (null для салонов)
backend/models.py:1267:    indie_master = relationship("IndieMaster", overlaps="client_restrictions,expense_types,expenses,expense_templates")
backend/models.py:1272:        Index("idx_client_restriction_indie_master", "indie_master_id"),
backend/models.py:1276:        Index("idx_client_restriction_unique", "salon_id", "indie_master_id", "client_phone", "restriction_type", unique=True),
backend/models.py:1365:    indie_master_id = Column(Integer, ForeignKey("indie_masters.id"), nullable=True)  # ID мастера-индивидуала (null для салонов)
backend/models.py:1378:    indie_master = relationship("IndieMaster", overlaps="client_restrictions,expense_types,expenses,expense_templates")
backend/models.py:1384:        Index("idx_expense_type_indie_master", "indie_master_id"),
backend/models.py:1395:    indie_master_id = Column(Integer, ForeignKey("indie_masters.id"), nullable=True)  # ID мастера-индивидуала (null для салонов)
backend/models.py:1421:    indie_master = relationship("IndieMaster", overlaps="client_restrictions,expense_types,expenses,expense_templates")
backend/models.py:1428:        Index("idx_expense_indie_master", "indie_master_id"),
backend/models.py:1441:    indie_master_id = Column(Integer, ForeignKey("indie_masters.id"), nullable=True)  # ID мастера-индивидуала (null для салонов)
backend/models.py:1455:    indie_master = relationship("IndieMaster", overlaps="client_restrictions,expense_types,expenses,expense_templates")
backend/models.py:1462:        Index("idx_expense_template_indie_master", "indie_master_id"),
backend/models.py:1473:    indie_master_id = Column(Integer, ForeignKey("indie_masters.id"), nullable=True)  # ID мастера-индивидуала (null для салонов)
backend/models.py:1494:    indie_master = relationship("IndieMaster", overlaps="client_restrictions,expense_types,expenses,expense_templates")
backend/models.py:1501:        Index("idx_income_indie_master", "indie_master_id"),
backend/models.py:1514:    indie_master_id = Column(Integer, ForeignKey("indie_masters.id"), nullable=True)  # ID мастера-индивидуала (null для салонов)
backend/models.py:1540:    indie_master = relationship("IndieMaster", overlaps="client_restrictions,expense_types,expenses,expense_templates")
backend/models.py:1548:        Index("idx_missed_revenue_indie_master", "indie_master_id"),
backend/models.py:1563:    favorite_type = Column(String, nullable=False)  # 'salon', 'master', 'indie_master', 'service'
backend/models.py:1568:    indie_master_id = Column(Integer, ForeignKey("indie_masters.id"), nullable=True)
backend/models.py:1578:    indie_master = relationship("IndieMaster", overlaps="client_restrictions,expense_types,expenses,expense_templates")
backend/models.py:1585:        UniqueConstraint('client_id', 'favorite_type', 'indie_master_id', name='unique_indie_master_favorite'),
backend/models.py:1595:    note_type = Column(String, nullable=False)  # 'salon', 'master', 'indie_master'
backend/generate_excel_table.py:8:from models import User, UserRole, Master, IndieMaster, Salon
backend/generate_excel_table.py:28:        for indie_master in db.query(IndieMaster).all():
backend/generate_excel_table.py:29:            if indie_master.user_id in master_info:
backend/generate_excel_table.py:30:                master_info[indie_master.user_id] = "Гибридный мастер"
backend/generate_excel_table.py:32:                master_info[indie_master.user_id] = "Индивидуальный мастер"
backend/setup_working_hours.py:16:from models import User, Salon, Master, IndieMaster, AvailabilitySlot, OwnerType
backend/setup_working_hours.py:122:        regular_indie_masters = db.query(IndieMaster).filter(~IndieMaster.id.in_([5, 6, 7])).all()
backend/setup_working_hours.py:124:        for indie_master in regular_indie_masters:
backend/setup_working_hours.py:125:            print(f"  - Независимый мастер: {indie_master.user.full_name if indie_master.user else 'Неизвестно'} (ID: {indie_master.id})")
backend/setup_working_hours.py:130:                AvailabilitySlot.owner_id == indie_master.id
backend/setup_working_hours.py:137:                    owner_id=indie_master.id,
backend/setup_working_hours.py:152:        print(f"   - Независимые мастера: {len(regular_indie_masters)}")
backend/setup_working_hours.py:154:        print(f"   - Всего слотов доступности: {(len(salons) + len(regular_masters) + len(regular_indie_masters) + len(hybrid_master_ids)) * len(work_days)}")
backend/update_unified_logic.py:16:from models import Base, User, UserRole, Master, IndieMaster, Salon, SalonBranch
backend/update_unified_logic.py:163:            UPDATE indie_master_schedules 
backend/update_unified_logic.py:166:                FROM indie_masters_new im 
backend/update_unified_logic.py:167:                WHERE im.id = indie_master_schedules.indie_work_id
backend/update_unified_logic.py:218:        db.execute(text("CREATE INDEX IF NOT EXISTS idx_indie_master_schedules_master ON indie_master_schedules(master_id)"))
backend/update_unified_logic.py:219:        db.execute(text("CREATE INDEX IF NOT EXISTS idx_indie_master_schedules_indie_work ON indie_master_schedules(indie_work_id)"))
backend/check_client_bookings.py:33:                    im.user_id as indie_master_user_id,
backend/check_client_bookings.py:38:                LEFT JOIN indie_masters im ON b.indie_master_id = im.id
backend/check_client_bookings.py:64:                LEFT JOIN indie_masters im ON b.indie_master_id = im.id
backend/check_client_bookings.py:69:            indie_master_count = result.scalar()
backend/check_client_bookings.py:70:            print(f"🎯 Записей к 'Индивидуальный мастер 3': {indie_master_count}")
backend/cleanup_old_data.py:16:from models import Base, User, UserRole, Master, IndieMaster, Salon, SalonBranch
backend/cleanup_old_data.py:53:        # Удаляем поле indie_master_id
backend/cleanup_old_data.py:54:        db.execute(text("ALTER TABLE bookings DROP COLUMN IF EXISTS indie_master_id"))
backend/cleanup_old_data.py:61:        # Удаляем поле indie_master_id
backend/cleanup_old_data.py:62:        db.execute(text("ALTER TABLE services DROP COLUMN IF EXISTS indie_master_id"))
backend/cleanup_old_data.py:69:        # Удаляем поле indie_master_id
backend/cleanup_old_data.py:70:        db.execute(text("ALTER TABLE client_restrictions DROP COLUMN IF EXISTS indie_master_id"))
backend/cleanup_old_data.py:77:        # Удаляем поле indie_master_id
backend/cleanup_old_data.py:78:        db.execute(text("ALTER TABLE incomes DROP COLUMN IF EXISTS indie_master_id"))
backend/cleanup_old_data.py:85:        # Удаляем поле indie_master_id
backend/cleanup_old_data.py:86:        db.execute(text("ALTER TABLE expenses DROP COLUMN IF EXISTS indie_master_id"))
backend/cleanup_old_data.py:93:        # Удаляем поле indie_master_id
backend/cleanup_old_data.py:94:        db.execute(text("ALTER TABLE expense_types DROP COLUMN IF EXISTS indie_master_id"))
backend/cleanup_old_data.py:101:        # Удаляем поле indie_master_id
backend/cleanup_old_data.py:102:        db.execute(text("ALTER TABLE expense_templates DROP COLUMN IF EXISTS indie_master_id"))
backend/cleanup_old_data.py:109:        # Удаляем поле indie_master_id
backend/cleanup_old_data.py:110:        db.execute(text("ALTER TABLE missed_revenues DROP COLUMN IF EXISTS indie_master_id"))
backend/cleanup_old_data.py:114:        # 10. Удаляем старые поля из таблицы indie_master_schedules
backend/cleanup_old_data.py:115:        print("📋 Удаляем старые поля из таблицы indie_master_schedules...")
backend/cleanup_old_data.py:117:        # Удаляем поле indie_master_id
backend/cleanup_old_data.py:118:        db.execute(text("ALTER TABLE indie_master_schedules DROP COLUMN IF EXISTS indie_master_id"))
backend/cleanup_old_data.py:120:        print("✅ Старые поля удалены из таблицы indie_master_schedules")
backend/cleanup_old_data.py:125:        # Переименовываем indie_masters_new в indie_masters
backend/cleanup_old_data.py:126:        db.execute(text("ALTER TABLE indie_masters RENAME TO indie_masters_old"))
backend/cleanup_old_data.py:127:        db.execute(text("ALTER TABLE indie_masters_new RENAME TO indie_masters"))
backend/cleanup_old_data.py:131:        # 12. Удаляем старую таблицу indie_masters_old
backend/cleanup_old_data.py:132:        print("📋 Удаляем старую таблицу indie_masters_old...")
backend/cleanup_old_data.py:134:        db.execute(text("DROP TABLE IF EXISTS indie_masters_old"))
backend/cleanup_old_data.py:136:        print("✅ Старая таблица indie_masters_old удалена")
backend/cleanup_old_data.py:157:        # Создаем связь между masters и indie_masters
backend/cleanup_old_data.py:159:            ALTER TABLE indie_masters 
backend/cleanup_old_data.py:160:            ADD CONSTRAINT fk_indie_masters_master 
backend/cleanup_old_data.py:174:        # Индексы для indie_masters
backend/cleanup_old_data.py:175:        db.execute(text("CREATE INDEX IF NOT EXISTS idx_indie_masters_master ON indie_masters(master_id)"))
backend/cleanup_old_data.py:176:        db.execute(text("CREATE INDEX IF NOT EXISTS idx_indie_masters_domain ON indie_masters(domain)"))
backend/cleanup_old_data.py:190:        indie_masters_count = db.execute(text("SELECT COUNT(*) FROM indie_masters")).scalar()
backend/cleanup_old_data.py:194:        print(f"   - Независимых мастеров: {indie_masters_count}")
backend/schemas_backup.py:150:    indie_master_id: Optional[int] = None
backend/schemas_backup.py:160:    indie_master_id: Optional[int]
backend/schemas_backup.py:240:class IndieMasterBase(MasterBase):
backend/schemas_backup.py:249:class IndieMasterCreate(IndieMasterBase):
backend/schemas_backup.py:253:class IndieMasterUpdate(IndieMasterBase):
backend/schemas_backup.py:257:class IndieMasterPaymentUpdate(BaseModel):
backend/schemas_backup.py:262:class IndieMaster(IndieMasterBase):
backend/schemas_backup.py:291:    indie_master_id: Optional[int]
backend/schemas_backup.py:301:    indie_master_id: Optional[int] = None
backend/schemas_backup.py:321:    indie_master_id: Optional[int] = None
backend/schemas_backup.py:362:    indie_master_id: Optional[int] = None
backend/schemas_backup.py:1474:    indie_master_id: Optional[int] = None
backend/schemas_backup.py:1520:    indie_master_id: Optional[int] = None
backend/schemas_backup.py:1567:    indie_master_id: Optional[int] = None
backend/schemas_backup.py:1615:    indie_master_id: Optional[int] = None
backend/schemas_backup.py:1666:    indie_master_id: Optional[int] = None
backend/schemas_backup.py:1715:    indie_master_id: Optional[int] = None
backend/check_working_days.py:61:            AvailabilitySlot.owner_id.in_([im.id for im in indie_masters])
backend/migrate_unified_master.py:16:from models import Base, User, UserRole, Master, IndieMaster, Salon, SalonBranch
backend/migrate_unified_master.py:68:            # Создаем запись в indie_masters
backend/migrate_unified_master.py:70:                INSERT INTO indie_masters (user_id, can_work_independently, domain, address, city, timezone, payment_on_visit, payment_advance, is_active, created_at, updated_at)
backend/migrate_unified_master.py:93:            # Находим профиль IndieMaster
backend/migrate_unified_master.py:94:            indie_master = db.query(IndieMaster).filter(IndieMaster.user_id == user.id).first()
backend/migrate_unified_master.py:96:            if indie_master:
backend/migrate_unified_master.py:97:                # Создаем запись в indie_masters
backend/migrate_unified_master.py:99:                    INSERT INTO indie_masters (user_id, can_work_independently, domain, address, city, timezone, payment_on_visit, payment_advance, is_active, created_at, updated_at)
backend/migrate_unified_master.py:102:                    'user_id': indie_master.id,  # Используем ID из старой таблицы
backend/migrate_unified_master.py:104:                    'domain': indie_master.domain,
backend/migrate_unified_master.py:105:                    'address': indie_master.address,
backend/migrate_unified_master.py:106:                    'city': indie_master.city,
backend/migrate_unified_master.py:107:                    'timezone': indie_master.timezone,
backend/migrate_unified_master.py:108:                    'payment_on_visit': indie_master.payment_on_visit,
backend/migrate_unified_master.py:109:                    'payment_advance': indie_master.payment_advance,
backend/migrate_unified_master.py:119:        # Обновляем бронирования с indie_master_id на master_id
backend/migrate_unified_master.py:124:                FROM indie_masters im 
backend/migrate_unified_master.py:125:                WHERE im.id = bookings.indie_master_id
backend/migrate_unified_master.py:127:            WHERE indie_master_id IS NOT NULL
backend/migrate_unified_master.py:135:        # Обновляем услуги с indie_master_id на master_id
backend/migrate_unified_master.py:140:                FROM indie_masters im 
backend/migrate_unified_master.py:141:                WHERE im.id = services.indie_master_id
backend/migrate_unified_master.py:143:            WHERE indie_master_id IS NOT NULL
backend/migrate_unified_master.py:151:        # Обновляем ограничения с indie_master_id на master_id
backend/migrate_unified_master.py:156:                FROM indie_masters im 
backend/migrate_unified_master.py:157:                WHERE im.id = client_restrictions.indie_master_id
backend/migrate_unified_master.py:159:            WHERE indie_master_id IS NOT NULL
backend/migrate_unified_master.py:167:        # Обновляем доходы с indie_master_id на master_id
backend/migrate_unified_master.py:172:                FROM indie_masters im 
backend/migrate_unified_master.py:173:                WHERE im.id = incomes.indie_master_id
backend/migrate_unified_master.py:175:            WHERE indie_master_id IS NOT NULL
backend/migrate_unified_master.py:183:        # Обновляем расходы с indie_master_id на master_id
backend/migrate_unified_master.py:188:                FROM indie_masters im 
backend/migrate_unified_master.py:189:                WHERE im.id = expenses.indie_master_id
backend/migrate_unified_master.py:191:            WHERE indie_master_id IS NOT NULL
backend/migrate_unified_master.py:199:        # Обновляем типы расходов с indie_master_id на master_id
backend/migrate_unified_master.py:204:                FROM indie_masters im 
backend/migrate_unified_master.py:205:                WHERE im.id = expense_types.indie_master_id
backend/migrate_unified_master.py:207:            WHERE indie_master_id IS NOT NULL
backend/migrate_unified_master.py:215:        # Обновляем шаблоны расходов с indie_master_id на master_id
backend/migrate_unified_master.py:220:                FROM indie_masters im 
backend/migrate_unified_master.py:221:                WHERE im.id = expense_templates.indie_master_id
backend/migrate_unified_master.py:223:            WHERE indie_master_id IS NOT NULL
backend/migrate_unified_master.py:231:        # Обновляем пропущенные доходы с indie_master_id на master_id
backend/migrate_unified_master.py:236:                FROM indie_masters im 
backend/migrate_unified_master.py:237:                WHERE im.id = missed_revenues.indie_master_id
backend/migrate_unified_master.py:239:            WHERE indie_master_id IS NOT NULL
backend/migrate_unified_master.py:247:        # Обновляем расписание с indie_master_id на master_id
backend/migrate_unified_master.py:249:            UPDATE indie_master_schedules 
backend/migrate_unified_master.py:252:                FROM indie_masters im 
backend/migrate_unified_master.py:253:                WHERE im.id = indie_master_schedules.indie_master_id
backend/migrate_unified_master.py:255:            WHERE indie_master_id IS NOT NULL
backend/migrate_unified_master.py:281:        indie_masters_count = db.execute(text("SELECT COUNT(*) FROM indie_masters")).scalar()
backend/migrate_unified_master.py:284:        print(f"   - Независимых мастеров: {indie_masters_count}")
backend/tests/test_manual_confirm_switch.py:104:        service = Service(name="Test", price=1000, duration=60, salon_id=None, indie_master_id=None)
backend/tests/test_manual_confirm_switch.py:115:            indie_master_id=None,
backend/tests/test_manual_confirm_switch.py:125:            indie_master_id=None,
backend/tests/test_manual_confirm_switch.py:190:        service = Service(name="Test", price=1000, duration=60, salon_id=None, indie_master_id=None)
backend/tests/test_manual_confirm_switch.py:218:            indie_master_id=None,
backend/tests/test_manual_confirm_switch.py:254:        service = Service(name="Test", price=1000, duration=60, salon_id=None, indie_master_id=None)
backend/tests/test_manual_confirm_switch.py:265:            indie_master_id=None,
backend/tests/test_create_completed_bookings_owner.py:29:    """Master with IndieMaster and indie service (salon_id=NULL)."""
backend/tests/test_create_completed_bookings_owner.py:30:    from models import Master, IndieMaster, Service, User
backend/tests/test_create_completed_bookings_owner.py:49:    indie = IndieMaster(user_id=mu.id, domain="test-indie-owner")
backend/tests/test_create_completed_bookings_owner.py:58:        indie_master_id=indie.id,
backend/tests/test_create_completed_bookings_owner.py:111:    assert b.indie_master_id is not None
backend/tests/test_loyalty_discounts.py:80:    s = Service(name="S1", price=1000.0, duration=60, salon_id=None, indie_master_id=None)
backend/tests/test_booking_factory.py:10:def _service(salon_id=None, indie_master_id=None):
backend/tests/test_booking_factory.py:16:    s.indie_master_id = indie_master_id
backend/tests/test_booking_factory.py:22:    svc = _service(salon_id=None, indie_master_id=10)
backend/tests/test_booking_factory.py:24:    assert out["indie_master_id"] == 10
backend/tests/test_booking_factory.py:32:    svc = _service(salon_id=None, indie_master_id=5)
backend/tests/test_booking_factory.py:39:    svc = _service(salon_id=100, indie_master_id=None)
backend/tests/test_booking_factory.py:42:    assert out["indie_master_id"] is None
backend/tests/test_booking_factory.py:48:        validate_booking_invariants({"master_id": 1, "indie_master_id": 2})
backend/tests/test_booking_factory.py:50:        validate_booking_invariants({"master_id": None, "indie_master_id": None})
backend/tests/test_booking_factory.py:57:            "indie_master_id": 1,
backend/tests/test_booking_factory.py:66:            "indie_master_id": None,
backend/tests/test_accounting_post_visit_phase1.py:5:- Indie master: pending-confirmations возвращает записи с indie_master_id, confirm работает
backend/tests/test_accounting_post_visit_phase1.py:17:    IndieMaster,
backend/tests/test_accounting_post_visit_phase1.py:126:        service = Service(name="Test", price=1000, duration=60, salon_id=None, indie_master_id=None)
backend/tests/test_accounting_post_visit_phase1.py:136:            indie_master_id=None,
backend/tests/test_accounting_post_visit_phase1.py:175:        service = Service(name="Test", price=1000, duration=60, salon_id=None, indie_master_id=None)
backend/tests/test_accounting_post_visit_phase1.py:185:            indie_master_id=None,
backend/tests/test_accounting_post_visit_phase1.py:226:        service = Service(name="Test", price=1000, duration=60, salon_id=None, indie_master_id=None)
backend/tests/test_accounting_post_visit_phase1.py:236:            indie_master_id=None,
backend/tests/test_accounting_post_visit_phase1.py:270:        service = Service(name="Test", price=1000, duration=60, salon_id=None, indie_master_id=None)
backend/tests/test_accounting_post_visit_phase1.py:280:            indie_master_id=None,
backend/tests/test_accounting_post_visit_phase1.py:371:class TestIndieMasterPostVisit:
backend/tests/test_accounting_post_visit_phase1.py:372:    """Indie master: pending-confirmations и confirm работают для записей с indie_master_id."""
backend/tests/test_accounting_post_visit_phase1.py:374:    def test_indie_master_pending_confirmations_returns_booking(self, client, db):
backend/tests/test_accounting_post_visit_phase1.py:375:        """Indie master: pending-confirmations возвращает запись с indie_master_id."""
backend/tests/test_accounting_post_visit_phase1.py:411:        indie = IndieMaster(
backend/tests/test_accounting_post_visit_phase1.py:444:            indie_master_id=indie.id,
backend/tests/test_accounting_post_visit_phase1.py:455:            indie_master_id=indie.id,
backend/tests/test_accounting_post_visit_phase1.py:473:    def test_indie_master_confirm_booking_works(self, client, db):
backend/tests/test_accounting_post_visit_phase1.py:474:        """Indie master: confirm-booking для записи с indie_master_id работает."""
backend/tests/test_accounting_post_visit_phase1.py:510:        indie = IndieMaster(
backend/tests/test_accounting_post_visit_phase1.py:543:            indie_master_id=indie.id,
backend/tests/test_accounting_post_visit_phase1.py:554:            indie_master_id=indie.id,
backend/tests/test_master_restrictions_api.py:4:from models import Master, User, UserRole, IndieMaster
backend/tests/test_master_restrictions_api.py:14:def indie_master_user(db):
backend/tests/test_master_restrictions_api.py:15:    """Мастер с IndieMaster (user_id = master.user_id) для тестов restrictions."""
backend/tests/test_master_restrictions_api.py:32:    indie = IndieMaster(user_id=user.id, domain="restrictions-test")
backend/tests/test_master_restrictions_api.py:38:def test_get_restrictions_empty(client, db, indie_master_user):
backend/tests/test_master_restrictions_api.py:40:    headers = _auth_headers(client, indie_master_user.phone, "test123")
backend/tests/test_master_restrictions_api.py:51:def test_get_restriction_rules_empty(client, db, indie_master_user):
backend/tests/test_master_restrictions_api.py:53:    headers = _auth_headers(client, indie_master_user.phone, "test123")
backend/tests/test_master_restrictions_api.py:59:def test_create_and_get_restriction(client, db, indie_master_user):
backend/tests/test_master_restrictions_api.py:61:    headers = _auth_headers(client, indie_master_user.phone, "test123")
backend/tests/test_master_restrictions_api.py:80:def test_restriction_visible_in_master_clients(client, db, indie_master_user):
backend/tests/test_master_restrictions_api.py:82:    from models import Master, IndieMaster, Service, Booking, BookingStatus
backend/tests/test_master_restrictions_api.py:84:    master = db.query(Master).filter(Master.user_id == indie_master_user.id).first()
backend/tests/test_master_restrictions_api.py:85:    indie = db.query(IndieMaster).filter(IndieMaster.user_id == indie_master_user.id).first()
backend/tests/test_master_restrictions_api.py:107:        indie_master_id=indie.id,
backend/tests/test_master_restrictions_api.py:118:        indie_master_id=indie.id,
backend/tests/test_master_restrictions_api.py:127:    headers = _auth_headers(client, indie_master_user.phone, "test123")
backend/models_unified.py:41:class IndieMasterNew(Base):
backend/models_unified.py:43:    __tablename__ = "indie_masters_new"
backend/models_unified.py:89:    indie_work = relationship("IndieMasterNew", back_populates="master")
backend/models_unified.py:115:    indie_work_id = Column(Integer, ForeignKey("indie_masters_new.id"), nullable=True)
backend/models_unified.py:130:    indie_work = relationship("IndieMasterNew")
backend/models_unified.py:149:    indie_work_id = Column(Integer, ForeignKey("indie_masters_new.id"), nullable=True)
backend/models_unified.py:157:    indie_work = relationship("IndieMasterNew")
backend/models_unified.py:172:    indie_work_id = Column(Integer, ForeignKey("indie_masters_new.id"), nullable=True)
backend/models_unified.py:184:    indie_work = relationship("IndieMasterNew")
backend/models_unified.py:196:    indie_work_id = Column(Integer, ForeignKey("indie_masters_new.id"), nullable=True)
backend/models_unified.py:207:    indie_work = relationship("IndieMasterNew")
backend/models_unified.py:219:    indie_work_id = Column(Integer, ForeignKey("indie_masters_new.id"), nullable=True)
backend/models_unified.py:231:    indie_work = relationship("IndieMasterNew")
backend/models_unified.py:244:    indie_work_id = Column(Integer, ForeignKey("indie_masters_new.id"), nullable=True)
backend/models_unified.py:255:    indie_work = relationship("IndieMasterNew")
backend/models_unified.py:268:    indie_work_id = Column(Integer, ForeignKey("indie_masters_new.id"), nullable=True)
backend/models_unified.py:280:    indie_work = relationship("IndieMasterNew")
backend/models_unified.py:292:    indie_work_id = Column(Integer, ForeignKey("indie_masters_new.id"), nullable=True)
backend/models_unified.py:304:    indie_work = relationship("IndieMasterNew")
backend/models_unified.py:307:class IndieMasterScheduleUnified(Base):
backend/models_unified.py:309:    __tablename__ = "indie_master_schedules"
backend/models_unified.py:313:    indie_work_id = Column(Integer, ForeignKey("indie_masters_new.id"), nullable=True)
backend/models_unified.py:323:    indie_work = relationship("IndieMasterNew")
backend/test_schedule_creation.py:191:            "indie_master_id": master_id,
backend/utils/client_restrictions.py:39:    indie_master_id: Optional[int] = None
backend/utils/client_restrictions.py:50:        indie_master_id: ID индивидуального мастера (опционально)
backend/utils/client_restrictions.py:55:    # Формируем условие для поиска по master_id или indie_master_id
backend/utils/client_restrictions.py:57:    if indie_master_id:
backend/utils/client_restrictions.py:58:        master_condition = or_(Booking.master_id == master_id, Booking.indie_master_id == indie_master_id)
backend/utils/client_restrictions.py:149:    # Находим indie_master_id по master_id (через user_id)
backend/utils/client_restrictions.py:150:    from models import Master, IndieMaster
backend/utils/client_restrictions.py:160:    # Ищем соответствующего indie_master
backend/utils/client_restrictions.py:161:    indie_master = db.query(IndieMaster).filter(IndieMaster.user_id == master.user_id).first()
backend/utils/client_restrictions.py:162:    indie_master_id = indie_master.id if indie_master else None
backend/utils/client_restrictions.py:165:    if indie_master_id:
backend/utils/client_restrictions.py:167:            ClientRestriction.indie_master_id == indie_master_id,
backend/utils/client_restrictions.py:201:            db, master_id, client_id, rule.cancellation_reason, rule.period_days, indie_master_id
backend/utils/client_restrictions.py:206:            apply_automatic_restrictions(db, master_id, indie_master_id, client_id, client_phone, rule.id, 'blacklist')
backend/utils/client_restrictions.py:218:            db, master_id, client_id, rule.cancellation_reason, rule.period_days, indie_master_id
backend/utils/client_restrictions.py:223:            apply_automatic_restrictions(db, master_id, indie_master_id, client_id, client_phone, rule.id, 'advance_payment_only')
backend/utils/client_restrictions.py:242:    indie_master_id: Optional[int],
backend/utils/client_restrictions.py:255:        indie_master_id: ID индивидуального мастера (может быть None)
backend/utils/client_restrictions.py:261:    if not indie_master_id:
backend/utils/client_restrictions.py:262:        # Если нет indie_master_id, не можем создать ограничение
backend/utils/client_restrictions.py:274:        ClientRestriction.indie_master_id == indie_master_id,
backend/utils/client_restrictions.py:288:            indie_master_id=indie_master_id,
backend/utils/master_canon.py:3:Резолв indie_master_id -> master_id через indie_masters.master_id.
backend/utils/master_canon.py:19:    Использует только indie_masters.master_id (никаких матчей по имени).
backend/utils/master_canon.py:31:    # Привязка к indie_master — резолв через indie_masters.master_id
backend/utils/master_canon.py:32:    if booking.indie_master_id and booking.indie_master:
backend/utils/master_canon.py:33:        im = booking.indie_master
backend/utils/master_canon.py:36:            # master_name из indie_master.user (display)
backend/utils/master_canon.py:41:        # indie_master без master_id — невозможный кейс после Этапа 1
backend/utils/master_canon.py:43:            f"Booking {booking.id}: indie_master_id={booking.indie_master_id} "
backend/utils/master_canon.py:44:            "but indie_master.master_id is NULL. Run Stage 1 migration."
backend/utils/booking_factory.py:31:    Нормализует master_id, indie_master_id, salon_id, branch_id по owner_type.
backend/utils/booking_factory.py:35:    - owner_type='indie' => indie_master_id=owner_id, master_id=NULL, salon_id=NULL, branch_id=NULL
backend/utils/booking_factory.py:36:    - owner_type='salon' => master_id=owner_id, indie_master_id=NULL,
backend/utils/booking_factory.py:42:        out["indie_master_id"] = owner_id
backend/utils/booking_factory.py:52:        out["indie_master_id"] = None
backend/utils/booking_factory.py:71:    A) ровно один владелец: (master_id IS NULL) != (indie_master_id IS NULL)
backend/utils/booking_factory.py:76:    indie_id = booking_data.get("indie_master_id")
backend/utils/booking_factory.py:84:            "Exactly one of master_id, indie_master_id must be set"
backend/seed_test_system.py:11:from models import Base, User, UserRole, Master, IndieMaster, Salon, SalonBranch, Service, ServiceCategory, MasterServiceCategory, MasterService, SalonMasterServiceSettings, Booking, BookingStatus
backend/seed_test_system.py:108:        indie_masters = []
backend/seed_test_system.py:113:                email=f"indie_master{i+1}@test.com",
backend/seed_test_system.py:126:            indie_master = IndieMaster(
backend/seed_test_system.py:135:            db.add(indie_master)
backend/seed_test_system.py:137:            db.refresh(indie_master)
backend/seed_test_system.py:138:            indie_masters.append(indie_master)
backend/seed_test_system.py:199:            indie_master = IndieMaster(
backend/seed_test_system.py:208:            db.add(indie_master)
backend/seed_test_system.py:210:            db.refresh(indie_master)
backend/seed_test_system.py:211:            indie_masters.append(indie_master)
backend/seed_test_system.py:236:        for indie_master in indie_masters:
backend/seed_test_system.py:239:                    name=f"{category.name} - {indie_master.user.full_name}",
backend/seed_test_system.py:240:                    description=f"Описание услуги {category.name} от {indie_master.user.full_name}",
backend/seed_test_system.py:330:                        indie_master = None
backend/seed_test_system.py:331:                        for im in indie_masters:
backend/seed_test_system.py:333:                                indie_master = im
backend/seed_test_system.py:336:                        if indie_master:
backend/seed_test_system.py:340:                                indie_master_id=indie_master.id,
backend/seed_test_system.py:361:        print(f"   • Индивидуальных мастеров: {len(indie_masters)}")
backend/seed_test_system.py:369:            'indie_masters': indie_masters,
backend/seed.py:11:    IndieMaster,
backend/seed.py:90:        indie_masters = []
backend/seed.py:103:            indie_master = IndieMaster(
backend/seed.py:109:            db.add(indie_master)
backend/seed.py:111:            indie_masters.append(indie_master)
backend/seed.py:141:        for indie_master in indie_masters:
backend/seed.py:148:                    indie_master_id=indie_master.id,
backend/seed.py:182:                indie_master_id=service.indie_master_id,
backend/schemas.py:172:    indie_master_id: Optional[int] = None
backend/schemas.py:182:    indie_master_id: Optional[int]
backend/schemas.py:269:class IndieMasterBase(MasterBase):
backend/schemas.py:278:class IndieMasterCreate(IndieMasterBase):
backend/schemas.py:282:class IndieMasterUpdate(IndieMasterBase):
backend/schemas.py:291:class IndieMasterPaymentUpdate(BaseModel):
backend/schemas.py:296:class IndieMaster(IndieMasterBase):
backend/schemas.py:325:    indie_master_id: Optional[int]
backend/schemas.py:335:    indie_master_id: Optional[int] = None
backend/schemas.py:359:    indie_master_id: Optional[int] = None
backend/schemas.py:400:    indie_master_id: Optional[int] = None
backend/schemas.py:663:    indie_master_id: Optional[int] = None
backend/schemas.py:673:# MASTER_CANON: без indie_master_id (жёсткий контракт master-only)
backend/schemas.py:713:    indie_master_id: Optional[int] = None
backend/schemas.py:723:# MASTER_CANON: без indie_master_id (жёсткий контракт master-only)
backend/schemas.py:1818:    indie_master_id: Optional[int] = None
backend/schemas.py:1951:    indie_master_id: Optional[int] = None
backend/schemas.py:1998:    indie_master_id: Optional[int] = None
backend/schemas.py:2046:    indie_master_id: Optional[int] = None
backend/schemas.py:2097:    indie_master_id: Optional[int] = None
backend/schemas.py:2146:    indie_master_id: Optional[int] = None
backend/schemas.py:2211:    indie_master_id: Optional[int] = None
backend/schemas.py:2220:    indie_master_id: Optional[int] = None
backend/schemas.py:2226:    indie_master: Optional[dict] = None
backend/schemas.py:2239:    note_type: str  # 'salon', 'master', 'indie_master'
backend/reset_test_system.py:9:from models import Base, User, UserRole, Master, IndieMaster, Salon, SalonBranch, Service, ServiceCategory, MasterServiceCategory, MasterService, SalonMasterServiceSettings, Booking, BookingStatus
backend/reset_test_system.py:35:        db.query(IndieMaster).delete()
backend/reset_test_system.py:151:        indie_masters = []
backend/reset_test_system.py:156:                email=f"indie_master{i+1}@test.com",
backend/reset_test_system.py:169:            indie_master = IndieMaster(
backend/reset_test_system.py:178:            db.add(indie_master)
backend/reset_test_system.py:180:            db.refresh(indie_master)
backend/reset_test_system.py:181:            indie_masters.append(indie_master)
backend/reset_test_system.py:242:            indie_master = IndieMaster(
backend/reset_test_system.py:251:            db.add(indie_master)
backend/reset_test_system.py:253:            db.refresh(indie_master)
backend/reset_test_system.py:254:            indie_masters.append(indie_master)
backend/reset_test_system.py:279:        for indie_master in indie_masters:
backend/reset_test_system.py:282:                    name=f"{category.name} - {indie_master.user.full_name}",
backend/reset_test_system.py:283:                    description=f"Описание услуги {category.name} от {indie_master.user.full_name}",
backend/reset_test_system.py:373:                        indie_master = None
backend/reset_test_system.py:374:                        for im in indie_masters:
backend/reset_test_system.py:376:                                indie_master = im
backend/reset_test_system.py:379:                        if indie_master:
backend/reset_test_system.py:383:                                indie_master_id=indie_master.id,
backend/reset_test_system.py:404:        print(f"   • Индивидуальных мастеров: {len(indie_masters)}")
backend/reset_test_system.py:414:            'indie_masters': indie_masters,
backend/seed_domains.py:8:from models import Salon, IndieMaster, User, UserRole
backend/seed_domains.py:52:        test_master = db.query(IndieMaster).filter(IndieMaster.domain == "test-master").first()
backend/seed_domains.py:67:            test_master = IndieMaster(
backend/test_migration_functionality.py:18:from models import Base, User, UserRole, Master, IndieMaster, Salon, SalonBranch
backend/test_migration_functionality.py:133:            indie_masters = db.execute(text("""
backend/test_migration_functionality.py:136:                FROM indie_masters im
backend/test_migration_functionality.py:141:            if len(indie_masters) > 0:
backend/test_migration_functionality.py:142:                print(f"   ✅ Найдено {len(indie_masters)} независимых мастеров")
backend/scripts/fix_test_accounts_subscriptions.py:23:        "email": "indie_master1@test.com",
backend/scripts/verify_master_canon.py:38:        "SELECT COUNT(*) FROM bookings WHERE indie_master_id IS NOT NULL"
backend/scripts/verify_master_canon.py:40:    # Для master-only reseed: indie_master_id должен быть NULL у новых
backend/scripts/verify_master_canon.py:42:    print(f"  [INFO] bookings indie_master_id NOT NULL: {indie_not_null}")
backend/scripts/verify_master_canon.py:45:        "SELECT COUNT(*) FROM client_favorites WHERE favorite_type='indie_master'"
backend/scripts/verify_master_canon.py:48:        print(f"  [FAIL] client_favorites favorite_type=indie_master: {indie_fav} (expect 0)")
backend/scripts/verify_master_canon.py:51:        print(f"  [OK] client_favorites favorite_type=indie_master: 0")
backend/scripts/verify_master_canon.py:54:        "SELECT COUNT(*) FROM indie_masters WHERE master_id IS NULL"
backend/scripts/verify_master_canon.py:57:        print(f"  [FAIL] indie_masters master_id NULL: {im_null} (expect 0)")
backend/scripts/verify_master_canon.py:60:        print(f"  [OK] indie_masters master_id NULL: 0")
backend/scripts/verify_master_canon.py:64:            SELECT master_id, COUNT(*) as c FROM indie_masters
backend/scripts/verify_master_canon.py:69:        print(f"  [FAIL] indie_masters UNIQUE(master_id) violations: {im_dups} (expect 0)")
backend/scripts/verify_master_canon.py:72:        print(f"  [OK] indie_masters UNIQUE(master_id) violations: 0")
backend/scripts/verify_master_canon.py:75:        "SELECT COUNT(*) FROM bookings WHERE master_id IS NULL AND indie_master_id IS NULL"
backend/scripts/verify_master_canon.py:110:            nonnull_indie = sum(1 for b in data if b.get("indie_master_id") is not None)
backend/scripts/verify_master_canon.py:111:            has_indie_key = any("indie_master_id" in b for b in data)
backend/scripts/verify_master_canon.py:116:                print(f"  [FAIL] GET {path} indie_master_id present (expect absent in MODE=1)")
backend/scripts/verify_master_canon.py:118:        print(f"  [OK] GET /bookings/ + /past: master_id null=0, indie_master_id absent")
backend/scripts/verify_master_canon.py:120:        # GET /api/client/favorites/indie-masters -> 410
backend/scripts/verify_master_canon.py:123:                f"{BASE_URL}/api/client/favorites/indie-masters",
backend/scripts/verify_master_canon.py:127:            print("  [FAIL] GET /favorites/indie-masters: expected 410, got 200")
backend/scripts/verify_master_canon.py:131:                print(f"  [FAIL] GET /favorites/indie-masters: expected 410, got {e.code}")
backend/scripts/verify_master_canon.py:133:        print("  [OK] GET /favorites/indie-masters: 410 Gone")
backend/scripts/reseed_local_test_data.py:126:        help="Создать IndieMaster + indie-услуги + брони с indie_master_id (legacy). По умолчанию OFF — master-only.",
backend/scripts/reseed_local_test_data.py:139:        print("Режим --legacy-indie-bookings: IndieMaster + indie-услуги + брони с indie_master_id.")
backend/scripts/reseed_local_test_data.py:291:                        f"{base}/api/dev/testdata/ensure_indie_master",
backend/scripts/reseed_local_test_data.py:297:                    indie_master_id_val = indie_data.get("indie_master_id")
backend/scripts/reseed_local_test_data.py:299:                    if indie_master_id_val:
backend/scripts/reseed_local_test_data.py:305:                                    "indie_master_id": indie_master_id_val,
backend/scripts/reseed_local_test_data.py:317:                    indie_master_id_val = None
backend/scripts/reseed_local_test_data.py:320:                indie_master_id_val = None
backend/scripts/reseed_local_test_data.py:407:                "indie_master_id": indie_master_id_val if not no_salon else None,
backend/scripts/reseed_local_test_data.py:449:                indie_id = m.get("indie_master_id")
backend/scripts/reseed_local_test_data.py:463:                        owner_type = "indie_master" if use_indie and indie_id else "master"
backend/scripts/reseed_local_test_data.py:495:                                    "indie_master_id": indie_id,
backend/scripts/reseed_local_test_data.py:585:                    indie_id = m.get("indie_master_id")
backend/scripts/reseed_local_test_data.py:594:                    owner_type = "indie_master" if use_indie and indie_id else "master"
backend/scripts/reseed_local_test_data.py:628:                                booking["indie_master_id"] = indie_id
backend/scripts/reseed_local_test_data.py:805:                    print(f"  indie_masters: {sanity.get('indie_masters_count', 0)}")
backend/scripts/reseed_local_test_data.py:812:                    indie_cnt = sanity.get("indie_masters_count", 0)
backend/scripts/reseed_local_test_data.py:813:                    assert indie_cnt > 0, "indie_masters must be > 0"
backend/scripts/reseed_local_test_data.py:815:                    assert any_compl_indie, "At least one master must have completed bookings with indie_master_id"
backend/scripts/reseed_local_test_data.py:817:                    assert any_future_indie, "At least one master must have future bookings with indie_master_id"
backend/scripts/reseed_local_test_data.py:932:                    "SELECT COUNT(*) FROM bookings WHERE master_id IS NULL AND indie_master_id IS NULL"
backend/scripts/reseed_local_test_data.py:936:                    "SELECT COUNT(*) FROM client_favorites WHERE favorite_type='indie_master'"
backend/scripts/reseed_local_test_data.py:939:                    "SELECT COUNT(*) FROM indie_masters WHERE master_id IS NULL"
backend/scripts/reseed_local_test_data.py:943:                        SELECT master_id, COUNT(*) as c FROM indie_masters
backend/scripts/reseed_local_test_data.py:964:                    print(f"  [FAIL] client_favorites favorite_type=indie_master: {indie_fav} (expect 0)")
backend/scripts/reseed_local_test_data.py:967:                    print(f"  [OK] client_favorites favorite_type=indie_master: 0")
backend/scripts/reseed_local_test_data.py:969:                    print(f"  [FAIL] indie_masters master_id NULL: {im_null} (expect 0)")
backend/scripts/reseed_local_test_data.py:972:                    print(f"  [OK] indie_masters master_id NULL: 0")
backend/scripts/reseed_local_test_data.py:974:                    print(f"  [FAIL] indie_masters UNIQUE(master_id) violations: {im_dups} (expect 0)")
backend/scripts/reseed_local_test_data.py:977:                    print(f"  [OK] indie_masters UNIQUE(master_id) violations: 0")
backend/scripts/run_master_canon_prechecks.py:23:        FROM indie_masters
backend/scripts/run_master_canon_prechecks.py:31:        JOIN indie_masters im ON im.user_id = m.user_id
backend/scripts/run_master_canon_prechecks.py:35:    "total_indie_masters": "SELECT COUNT(*) AS total FROM indie_masters",
backend/scripts/run_master_canon_prechecks.py:36:    "no_user_id": "SELECT COUNT(*) AS cnt FROM indie_masters WHERE user_id IS NULL",
backend/scripts/run_master_canon_prechecks.py:39:        FROM indie_masters im
backend/scripts/run_master_canon_prechecks.py:45:        FROM indie_masters im
backend/scripts/run_master_canon_prechecks.py:51:        SELECT COUNT(*) AS cnt FROM client_favorites WHERE favorite_type = 'indie_master'
backend/scripts/run_master_canon_prechecks.py:56:        JOIN indie_masters im ON im.id = cf.indie_master_id
backend/scripts/run_master_canon_prechecks.py:58:        WHERE cf.favorite_type = 'indie_master'
backend/scripts/run_master_canon_prechecks.py:95:        "indie_masters_no_user_id": no_uid,
backend/scripts/run_master_canon_prechecks.py:96:        "indie_masters_orphan_user": orphan,
backend/scripts/run_master_canon_prechecks.py:97:        "indie_masters_no_master": no_mast,
backend/scripts/run_master_canon_prechecks.py:131:| Дубли indie_masters.user_id | {len(dup)} строк |
backend/scripts/run_master_canon_prechecks.py:133:| indie_masters без user_id | {no_uid} |
backend/scripts/run_master_canon_prechecks.py:134:| indie_masters с user_id, но без users | {orphan} |
backend/scripts/run_master_canon_prechecks.py:135:| indie_masters без Master (кандидаты на создание) | {no_mast} |
backend/scripts/run_master_canon_prechecks.py:136:| client_favorites indie_master | {results['summary']['indie_fav_count']} |
backend/scripts/run_master_canon_prechecks.py:155:{QUERIES['total_indie_masters'].strip()}
backend/alembic/versions/63f4fee107cd_add_accounting_tables_income_and_missed_.py:27:        sa.Column('indie_master_id', sa.Integer(), nullable=True),
backend/alembic/versions/63f4fee107cd_add_accounting_tables_income_and_missed_.py:39:        sa.ForeignKeyConstraint(['indie_master_id'], ['indie_masters.id'], ),
backend/alembic/versions/63f4fee107cd_add_accounting_tables_income_and_missed_.py:48:    op.create_index('idx_income_indie_master', 'incomes', ['indie_master_id'], unique=False)
backend/alembic/versions/63f4fee107cd_add_accounting_tables_income_and_missed_.py:56:        sa.Column('indie_master_id', sa.Integer(), nullable=True),
backend/alembic/versions/63f4fee107cd_add_accounting_tables_income_and_missed_.py:70:        sa.ForeignKeyConstraint(['indie_master_id'], ['indie_masters.id'], ),
backend/alembic/versions/63f4fee107cd_add_accounting_tables_income_and_missed_.py:80:    op.create_index('idx_missed_revenue_indie_master', 'missed_revenues', ['indie_master_id'], unique=False)
backend/alembic/versions/63f4fee107cd_add_accounting_tables_income_and_missed_.py:89:    op.drop_index('idx_missed_revenue_indie_master', table_name='missed_revenues')
backend/alembic/versions/63f4fee107cd_add_accounting_tables_income_and_missed_.py:100:    op.drop_index('idx_income_indie_master', table_name='incomes')
backend/alembic/versions/20250127_simple_unified_master_update.py:72:    # Добавляем work_type в indie_master_schedules
backend/alembic/versions/20250127_simple_unified_master_update.py:73:    op.add_column('indie_master_schedules', sa.Column('work_type', sa.String(), nullable=True))
backend/alembic/versions/20250127_simple_unified_master_update.py:74:    op.add_column('indie_master_schedules', sa.Column('master_id', sa.Integer(), nullable=True))
backend/alembic/versions/20250127_simple_unified_master_update.py:75:    op.add_column('indie_master_schedules', sa.Column('indie_work_id', sa.Integer(), nullable=True))
backend/alembic/versions/20250127_simple_unified_master_update.py:90:    # 3. Обновляем таблицу indie_masters - добавляем недостающие поля
backend/alembic/versions/20250127_simple_unified_master_update.py:91:    print("Обновляем таблицу indie_masters...")
backend/alembic/versions/20250127_simple_unified_master_update.py:93:    # Добавляем поля в indie_masters
backend/alembic/versions/20250127_simple_unified_master_update.py:94:    op.add_column('indie_masters', sa.Column('can_work_independently', sa.Boolean(), nullable=True, default=True))
backend/alembic/versions/20250127_simple_unified_master_update.py:95:    op.add_column('indie_masters', sa.Column('is_active', sa.Boolean(), nullable=True, default=True))
backend/alembic/versions/20250127_simple_unified_master_update.py:96:    op.add_column('indie_masters', sa.Column('created_at', sa.DateTime(), nullable=True))
backend/alembic/versions/20250127_simple_unified_master_update.py:97:    op.add_column('indie_masters', sa.Column('updated_at', sa.DateTime(), nullable=True))
backend/alembic/versions/20250127_simple_unified_master_update.py:100:    op.execute("UPDATE indie_masters SET can_work_independently = 1, is_active = 1, created_at = datetime('now'), updated_at = datetime('now')")
backend/alembic/versions/20250127_simple_unified_master_update.py:132:    op.drop_column('indie_master_schedules', 'indie_work_id')
backend/alembic/versions/20250127_simple_unified_master_update.py:133:    op.drop_column('indie_master_schedules', 'master_id')
backend/alembic/versions/20250127_simple_unified_master_update.py:134:    op.drop_column('indie_master_schedules', 'work_type')
backend/alembic/versions/20250127_simple_unified_master_update.py:182:    # Удаляем поля из indie_masters
backend/alembic/versions/20250127_simple_unified_master_update.py:183:    op.drop_column('indie_masters', 'updated_at')
backend/alembic/versions/20250127_simple_unified_master_update.py:184:    op.drop_column('indie_masters', 'created_at')
backend/alembic/versions/20250127_simple_unified_master_update.py:185:    op.drop_column('indie_masters', 'is_active')
backend/alembic/versions/20250127_simple_unified_master_update.py:186:    op.drop_column('indie_masters', 'can_work_independently')
backend/alembic/versions/20260128_add_booking_owner_check_constraints.py:3:A) exactly one owner: (master_id IS NULL) != (indie_master_id IS NULL)
backend/alembic/versions/20260128_add_booking_owner_check_constraints.py:25:            CHECK ((master_id IS NULL) <> (indie_master_id IS NULL))
backend/alembic/versions/20260128_add_booking_owner_check_constraints.py:29:            CHECK (indie_master_id IS NULL OR (salon_id IS NULL AND branch_id IS NULL))
backend/alembic/versions/2e8aadb81db1_add_expense_management_tables.py:27:        sa.Column('indie_master_id', sa.Integer(), nullable=True),
backend/alembic/versions/2e8aadb81db1_add_expense_management_tables.py:35:        sa.ForeignKeyConstraint(['indie_master_id'], ['indie_masters.id'], ),
backend/alembic/versions/2e8aadb81db1_add_expense_management_tables.py:42:    op.create_index('idx_expense_type_indie_master', 'expense_types', ['indie_master_id'], unique=False)
backend/alembic/versions/2e8aadb81db1_add_expense_management_tables.py:50:        sa.Column('indie_master_id', sa.Integer(), nullable=True),
backend/alembic/versions/2e8aadb81db1_add_expense_management_tables.py:60:        sa.ForeignKeyConstraint(['indie_master_id'], ['indie_masters.id'], ),
backend/alembic/versions/2e8aadb81db1_add_expense_management_tables.py:67:    op.create_index('idx_expense_template_indie_master', 'expense_templates', ['indie_master_id'], unique=False)
backend/alembic/versions/2e8aadb81db1_add_expense_management_tables.py:75:        sa.Column('indie_master_id', sa.Integer(), nullable=True),
backend/alembic/versions/2e8aadb81db1_add_expense_management_tables.py:92:        sa.ForeignKeyConstraint(['indie_master_id'], ['indie_masters.id'], ),
backend/alembic/versions/2e8aadb81db1_add_expense_management_tables.py:99:    op.create_index('idx_expense_indie_master', 'expenses', ['indie_master_id'], unique=False)
backend/alembic/versions/2e8aadb81db1_add_expense_management_tables.py:114:    op.drop_index('idx_expense_indie_master', table_name='expenses')
backend/alembic/versions/2e8aadb81db1_add_expense_management_tables.py:123:    op.drop_index('idx_expense_template_indie_master', table_name='expense_templates')
backend/alembic/versions/2e8aadb81db1_add_expense_management_tables.py:132:    op.drop_index('idx_expense_type_indie_master', table_name='expense_types')
backend/alembic/versions/83aa1dd21aac_add_automation_settings_to_salon_and_.py:28:    # Добавляем новые поля для автоматизации ограничений в таблицу indie_masters
backend/alembic/versions/83aa1dd21aac_add_automation_settings_to_salon_and_.py:29:    op.add_column('indie_masters', sa.Column('missed_sessions_advance_payment_threshold', sa.Integer(), nullable=True, server_default='3'))
backend/alembic/versions/83aa1dd21aac_add_automation_settings_to_salon_and_.py:30:    op.add_column('indie_masters', sa.Column('missed_sessions_blacklist_threshold', sa.Integer(), nullable=True, server_default='5'))
backend/alembic/versions/83aa1dd21aac_add_automation_settings_to_salon_and_.py:31:    op.add_column('indie_masters', sa.Column('cancellation_grace_period_hours', sa.Integer(), nullable=True, server_default='24'))
backend/alembic/versions/83aa1dd21aac_add_automation_settings_to_salon_and_.py:35:    op.execute("UPDATE indie_masters SET missed_sessions_advance_payment_threshold = 3, missed_sessions_blacklist_threshold = 5, cancellation_grace_period_hours = 24")
backend/alembic/versions/83aa1dd21aac_add_automation_settings_to_salon_and_.py:41:    # Удаляем поля из таблицы indie_masters
backend/alembic/versions/83aa1dd21aac_add_automation_settings_to_salon_and_.py:42:    op.drop_column('indie_masters', 'cancellation_grace_period_hours')
backend/alembic/versions/83aa1dd21aac_add_automation_settings_to_salon_and_.py:43:    op.drop_column('indie_masters', 'missed_sessions_blacklist_threshold')
backend/alembic/versions/83aa1dd21aac_add_automation_settings_to_salon_and_.py:44:    op.drop_column('indie_masters', 'missed_sessions_advance_payment_threshold')
backend/alembic/versions/9d61976d31ea_add_master_expenses_and_booking_.py:23:    op.drop_column('indie_masters', 'can_work_independently')
backend/alembic/versions/9d61976d31ea_add_master_expenses_and_booking_.py:24:    op.drop_column('indie_masters', 'updated_at')
backend/alembic/versions/9d61976d31ea_add_master_expenses_and_booking_.py:25:    op.drop_column('indie_masters', 'is_active')
backend/alembic/versions/9d61976d31ea_add_master_expenses_and_booking_.py:39:    op.add_column('indie_masters', sa.Column('is_active', sa.BOOLEAN(), server_default=sa.text('1'), nullable=True))
backend/alembic/versions/9d61976d31ea_add_master_expenses_and_booking_.py:40:    op.add_column('indie_masters', sa.Column('updated_at', sa.DATETIME(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True))
backend/alembic/versions/9d61976d31ea_add_master_expenses_and_booking_.py:41:    op.add_column('indie_masters', sa.Column('can_work_independently', sa.BOOLEAN(), server_default=sa.text('1'), nullable=True))
backend/alembic/versions/20260216_migrate_favorites_indie_to_master.py:1:"""MASTER_CANON Stage 3: migrate client_favorites indie_master -> master
backend/alembic/versions/20260216_migrate_favorites_indie_to_master.py:3:- Перевести favorite_type='indie_master' -> 'master'
backend/alembic/versions/20260216_migrate_favorites_indie_to_master.py:4:- master_id = indie_masters.master_id (join по indie_master_id)
backend/alembic/versions/20260216_migrate_favorites_indie_to_master.py:6:- После миграции: favorite_type='indie_master' = 0
backend/alembic/versions/20260216_migrate_favorites_indie_to_master.py:34:            JOIN indie_masters im ON im.id = cf.indie_master_id AND im.master_id IS NOT NULL
backend/alembic/versions/20260216_migrate_favorites_indie_to_master.py:35:            WHERE cf.favorite_type = 'indie_master'
backend/alembic/versions/20260216_migrate_favorites_indie_to_master.py:46:    # 2. Мигрировать оставшиеся indie_master -> master
backend/alembic/versions/20260216_migrate_favorites_indie_to_master.py:51:            master_id = (SELECT im.master_id FROM indie_masters im WHERE im.id = client_favorites.indie_master_id LIMIT 1),
backend/alembic/versions/20260216_migrate_favorites_indie_to_master.py:52:            indie_master_id = NULL
backend/alembic/versions/20260216_migrate_favorites_indie_to_master.py:53:        WHERE favorite_type = 'indie_master'
backend/alembic/versions/20260216_migrate_favorites_indie_to_master.py:54:          AND indie_master_id IN (
backend/alembic/versions/20260216_migrate_favorites_indie_to_master.py:55:            SELECT id FROM indie_masters WHERE master_id IS NOT NULL
backend/alembic/versions/20260216_migrate_favorites_indie_to_master.py:59:    # 3. Post-check: не должно остаться indie_master
backend/alembic/versions/20260216_migrate_favorites_indie_to_master.py:61:        text("SELECT COUNT(*) FROM client_favorites WHERE favorite_type = 'indie_master'")
backend/alembic/versions/20260216_migrate_favorites_indie_to_master.py:65:            f"Post-check failed: {remaining} client_favorites still have favorite_type='indie_master'. "
backend/alembic/versions/20260216_migrate_favorites_indie_to_master.py:66:            "Some indie_master_id may have no master_id."
backend/alembic/versions/20260216_migrate_favorites_indie_to_master.py:71:    # Откат: не восстанавливаем indie_master (данные потеряны при миграции).
backend/alembic/versions/7fadfa330abd_add_timezone_to_indie_master.py:1:"""add_timezone_to_indie_master
backend/alembic/versions/7fadfa330abd_add_timezone_to_indie_master.py:28:    op.add_column('indie_masters', sa.Column('city', sa.String(), nullable=True))
backend/alembic/versions/7fadfa330abd_add_timezone_to_indie_master.py:29:    op.add_column('indie_masters', sa.Column('timezone', sa.String(), nullable=True))
backend/alembic/versions/7fadfa330abd_add_timezone_to_indie_master.py:35:    op.drop_column('indie_masters', 'timezone')
backend/alembic/versions/7fadfa330abd_add_timezone_to_indie_master.py:36:    op.drop_column('indie_masters', 'city')
backend/alembic/versions/20260216_add_indie_masters_master_id_bridge.py:1:"""add indie_masters.master_id bridge column (MASTER_CANON Stage 1.1)
backend/alembic/versions/20260216_add_indie_masters_master_id_bridge.py:3:Добавить колонку indie_masters.master_id (nullable), индекс.
backend/alembic/versions/20260216_add_indie_masters_master_id_bridge.py:25:        "indie_masters",
backend/alembic/versions/20260216_add_indie_masters_master_id_bridge.py:29:        "ix_indie_masters_master_id",
backend/alembic/versions/20260216_add_indie_masters_master_id_bridge.py:30:        "indie_masters",
backend/alembic/versions/20260216_add_indie_masters_master_id_bridge.py:37:    op.drop_index("ix_indie_masters_master_id", table_name="indie_masters")
backend/alembic/versions/20260216_add_indie_masters_master_id_bridge.py:38:    op.drop_column("indie_masters", "master_id")
backend/alembic/versions/20260216_add_indie_masters_master_id_constraints.py:1:"""add constraints to indie_masters.master_id (MASTER_CANON Stage 1.3)
backend/alembic/versions/20260216_add_indie_masters_master_id_constraints.py:25:    null_count = conn.execute(text("SELECT COUNT(*) FROM indie_masters WHERE master_id IS NULL")).scalar()
backend/alembic/versions/20260216_add_indie_masters_master_id_constraints.py:27:        raise RuntimeError(f"Post-check failed: {null_count} indie_masters have NULL master_id")
backend/alembic/versions/20260216_add_indie_masters_master_id_constraints.py:30:            SELECT master_id, COUNT(*) as cnt FROM indie_masters
backend/alembic/versions/20260216_add_indie_masters_master_id_constraints.py:46:    with op.batch_alter_table("indie_masters", schema=None) as batch_op:
backend/alembic/versions/20260216_add_indie_masters_master_id_constraints.py:55:    op.drop_index("ix_indie_masters_master_id", table_name="indie_masters")
backend/alembic/versions/20260216_add_indie_masters_master_id_constraints.py:57:        "uq_indie_masters_master_id",
backend/alembic/versions/20260216_add_indie_masters_master_id_constraints.py:58:        "indie_masters",
backend/alembic/versions/20260216_add_indie_masters_master_id_constraints.py:67:    op.drop_index("uq_indie_masters_master_id", table_name="indie_masters")
backend/alembic/versions/20260216_add_indie_masters_master_id_constraints.py:68:    op.create_index("ix_indie_masters_master_id", "indie_masters", ["master_id"], unique=False)
backend/alembic/versions/20260216_add_indie_masters_master_id_constraints.py:69:    with op.batch_alter_table("indie_masters", schema=None) as batch_op:
backend/alembic/versions/4a3162c37a1c_add_payment_methods_to_salon_and_master.py:28:    op.add_column('indie_masters', sa.Column('payment_on_visit', sa.Boolean(), nullable=True, server_default='1'))
backend/alembic/versions/4a3162c37a1c_add_payment_methods_to_salon_and_master.py:29:    op.add_column('indie_masters', sa.Column('payment_advance', sa.Boolean(), nullable=True, server_default='0'))
backend/alembic/versions/4a3162c37a1c_add_payment_methods_to_salon_and_master.py:39:    op.execute("UPDATE indie_masters SET payment_on_visit = 1, payment_advance = 0 WHERE payment_on_visit IS NULL")
backend/alembic/versions/4a3162c37a1c_add_payment_methods_to_salon_and_master.py:53:    op.drop_column('indie_masters', 'payment_advance')
backend/alembic/versions/4a3162c37a1c_add_payment_methods_to_salon_and_master.py:54:    op.drop_column('indie_masters', 'payment_on_visit')
backend/alembic/versions/20250127_unified_master_structure.py:39:    # Создаем таблицу indie_masters_new для независимой работы мастеров
backend/alembic/versions/20250127_unified_master_structure.py:40:    op.create_table('indie_masters_new',
backend/alembic/versions/20250127_unified_master_structure.py:62:    op.create_index('idx_indie_masters_new_master', 'indie_masters_new', ['master_id'])
backend/alembic/versions/20250127_unified_master_structure.py:63:    op.create_index('idx_indie_masters_new_domain', 'indie_masters_new', ['domain'])
backend/alembic/versions/20250127_unified_master_structure.py:68:    op.drop_index('idx_indie_masters_new_domain', table_name='indie_masters_new')
backend/alembic/versions/20250127_unified_master_structure.py:69:    op.drop_index('idx_indie_masters_new_master', table_name='indie_masters_new')
backend/alembic/versions/20250127_unified_master_structure.py:72:    op.drop_table('indie_masters_new')
backend/alembic/versions/20250127_final_unified_master_update.py:22:    # 1. Добавляем недостающие поля в indie_masters
backend/alembic/versions/20250127_final_unified_master_update.py:23:    print("Обновляем таблицу indie_masters...")
backend/alembic/versions/20250127_final_unified_master_update.py:25:    # Добавляем поля в indie_masters
backend/alembic/versions/20250127_final_unified_master_update.py:26:    op.add_column('indie_masters', sa.Column('can_work_independently', sa.Boolean(), nullable=True, default=True))
backend/alembic/versions/20250127_final_unified_master_update.py:27:    op.add_column('indie_masters', sa.Column('is_active', sa.Boolean(), nullable=True, default=True))
backend/alembic/versions/20250127_final_unified_master_update.py:28:    op.add_column('indie_masters', sa.Column('created_at', sa.DateTime(), nullable=True))
backend/alembic/versions/20250127_final_unified_master_update.py:29:    op.add_column('indie_masters', sa.Column('updated_at', sa.DateTime(), nullable=True))
backend/alembic/versions/20250127_final_unified_master_update.py:32:    op.execute("UPDATE indie_masters SET can_work_independently = 1, is_active = 1, created_at = datetime('now'), updated_at = datetime('now')")
backend/alembic/versions/20250127_final_unified_master_update.py:108:    # Проверяем и добавляем work_type в indie_master_schedules
backend/alembic/versions/20250127_final_unified_master_update.py:110:        op.add_column('indie_master_schedules', sa.Column('work_type', sa.String(), nullable=True))
backend/alembic/versions/20250127_final_unified_master_update.py:111:        op.add_column('indie_master_schedules', sa.Column('master_id', sa.Integer(), nullable=True))
backend/alembic/versions/20250127_final_unified_master_update.py:112:        op.add_column('indie_master_schedules', sa.Column('indie_work_id', sa.Integer(), nullable=True))
backend/alembic/versions/20250127_final_unified_master_update.py:114:        print("Поля work_type уже существуют в indie_master_schedules")
backend/alembic/versions/20250127_final_unified_master_update.py:209:        op.drop_column('indie_master_schedules', 'indie_work_id')
backend/alembic/versions/20250127_final_unified_master_update.py:210:        op.drop_column('indie_master_schedules', 'master_id')
backend/alembic/versions/20250127_final_unified_master_update.py:211:        op.drop_column('indie_master_schedules', 'work_type')
backend/alembic/versions/20250127_final_unified_master_update.py:278:    # Удаляем поля из indie_masters
backend/alembic/versions/20250127_final_unified_master_update.py:280:        op.drop_column('indie_masters', 'updated_at')
backend/alembic/versions/20250127_final_unified_master_update.py:281:        op.drop_column('indie_masters', 'created_at')
backend/alembic/versions/20250127_final_unified_master_update.py:282:        op.drop_column('indie_masters', 'is_active')
backend/alembic/versions/20250127_final_unified_master_update.py:283:        op.drop_column('indie_masters', 'can_work_independently')
backend/alembic/versions/20250127_add_updated_at.py:1:"""Add updated_at to indie_masters
backend/alembic/versions/20250127_add_updated_at.py:19:    """Добавляем поле updated_at в indie_masters"""
backend/alembic/versions/20250127_add_updated_at.py:21:    # Добавляем поле updated_at в indie_masters
backend/alembic/versions/20250127_add_updated_at.py:22:    op.add_column('indie_masters', sa.Column('updated_at', sa.DateTime(), nullable=True))
backend/alembic/versions/20250127_add_updated_at.py:25:    op.execute("UPDATE indie_masters SET updated_at = datetime('now')")
backend/alembic/versions/20250127_add_updated_at.py:27:    print("Поле updated_at добавлено в indie_masters")
backend/alembic/versions/20250127_add_updated_at.py:32:    op.drop_column('indie_masters', 'updated_at')
backend/alembic/versions/20260216_backfill_indie_masters_master_id.py:1:"""backfill indie_masters.master_id (MASTER_CANON Stage 1.2)
backend/alembic/versions/20260216_backfill_indie_masters_master_id.py:3:Заполнить master_id по user_id. Создать Master для IndieMaster без Master.
backend/alembic/versions/20260216_backfill_indie_masters_master_id.py:26:    """Backfill indie_masters.master_id. Create Master if missing."""
backend/alembic/versions/20260216_backfill_indie_masters_master_id.py:27:    total = conn.execute(text("SELECT COUNT(*) FROM indie_masters")).scalar()
backend/alembic/versions/20260216_backfill_indie_masters_master_id.py:31:    # 1) Link existing: indie_masters with user_id -> masters with same user_id
backend/alembic/versions/20260216_backfill_indie_masters_master_id.py:34:            UPDATE indie_masters
backend/alembic/versions/20260216_backfill_indie_masters_master_id.py:35:            SET master_id = (SELECT m.id FROM masters m WHERE m.user_id = indie_masters.user_id LIMIT 1)
backend/alembic/versions/20260216_backfill_indie_masters_master_id.py:37:              AND EXISTS (SELECT 1 FROM masters m WHERE m.user_id = indie_masters.user_id)
backend/alembic/versions/20260216_backfill_indie_masters_master_id.py:42:    # 2) Create Master for IndieMaster without Master (user_id exists, User exists)
backend/alembic/versions/20260216_backfill_indie_masters_master_id.py:47:            FROM indie_masters im
backend/alembic/versions/20260216_backfill_indie_masters_master_id.py:91:            text("UPDATE indie_masters SET master_id = :mid WHERE id = :iid"),
backend/alembic/versions/20260216_backfill_indie_masters_master_id.py:99:            UPDATE indie_masters
backend/alembic/versions/20260216_backfill_indie_masters_master_id.py:100:            SET master_id = (SELECT m.id FROM masters m WHERE m.user_id = indie_masters.user_id LIMIT 1)
backend/alembic/versions/20260216_backfill_indie_masters_master_id.py:106:    null_count = conn.execute(text("SELECT COUNT(*) FROM indie_masters WHERE master_id IS NULL")).scalar()
backend/alembic/versions/20260216_backfill_indie_masters_master_id.py:109:            f"Backfill incomplete: {null_count} indie_masters still have NULL master_id. "
backend/alembic/versions/20260216_backfill_indie_masters_master_id.py:113:    print(f"[MASTER_CANON] Backfill: indie_masters total={total}, linked={linked}, created={created}, null_remaining=0")
backend/alembic/versions/20260216_backfill_indie_masters_master_id.py:122:    op.execute(text("UPDATE indie_masters SET master_id = NULL"))
backend/alembic/versions/20d3129ef7ad_add_client_restrictions_table.py:27:        sa.Column('indie_master_id', sa.Integer(), nullable=True),
backend/alembic/versions/20d3129ef7ad_add_client_restrictions_table.py:34:        sa.ForeignKeyConstraint(['indie_master_id'], ['indie_masters.id'], ),
backend/alembic/versions/20d3129ef7ad_add_client_restrictions_table.py:41:    op.create_index('idx_client_restriction_indie_master', 'client_restrictions', ['indie_master_id'], unique=False)
backend/alembic/versions/20d3129ef7ad_add_client_restrictions_table.py:45:    op.create_index('idx_client_restriction_unique', 'client_restrictions', ['salon_id', 'indie_master_id', 'client_phone', 'restriction_type'], unique=True)
backend/alembic/versions/20d3129ef7ad_add_client_restrictions_table.py:56:    op.drop_index('idx_client_restriction_indie_master', table_name='client_restrictions')
backend/generate_csv_table.py:7:from models import User, UserRole, Master, IndieMaster, Salon
backend/generate_csv_table.py:30:        for indie_master in db.query(IndieMaster).all():
backend/generate_csv_table.py:31:            if indie_master.user_id in master_info:
backend/generate_csv_table.py:32:                master_info[indie_master.user_id] = "Гибридный мастер"
backend/generate_csv_table.py:34:                master_info[indie_master.user_id] = "Индивидуальный мастер"
backend/test_migration_comparison.py:16:from models import Base, User, UserRole, Master, IndieMaster, Salon, SalonBranch
backend/test_migration_comparison.py:81:            indie_masters_count = db.execute(text("""
backend/test_migration_comparison.py:82:                SELECT COUNT(*) FROM indie_masters
backend/test_migration_comparison.py:86:            print(f"   📊 Независимые мастера: {masters_with_indie} -> {indie_masters_count}")
backend/test_migration_comparison.py:88:            if masters_with_salon == salon_masters_count and masters_with_indie == indie_masters_count:
backend/services/bookings_limit_monitor.py:73:                        or_(Booking.master_id == master.id, Booking.indie_master_id == master.id),
backend/services/scheduling.py:99:        query = query.filter(Booking.indie_master_id == owner_id)
backend/services/scheduling.py:246:        from models import IndieMasterSchedule
backend/services/scheduling.py:247:        indie_master_schedule = (
backend/services/scheduling.py:248:            db.query(IndieMasterSchedule)
backend/services/scheduling.py:250:                IndieMasterSchedule.indie_master_id == owner_id,
backend/services/scheduling.py:251:                IndieMasterSchedule.day_of_week == day_of_week,  # Используем нашу схему 1-7
backend/services/scheduling.py:252:                IndieMasterSchedule.is_available == True
backend/services/scheduling.py:254:            .order_by(IndieMasterSchedule.start_time)
backend/services/scheduling.py:258:        if indie_master_schedule:
backend/services/scheduling.py:260:            print(f"DEBUG: Найдено {len(indie_master_schedule)} слотов индивидуального расписания")
backend/services/scheduling.py:270:            for schedule in indie_master_schedule:
backend/services/scheduling.py:335:        existing_bookings_query = existing_bookings_query.filter(Booking.indie_master_id == owner_id)
backend/services/recalc_favorites.py:6:from models import User, Booking, Salon, Master, IndieMaster, ClientFavorites
backend/services/recalc_favorites.py:61:                if b.indie_master and b.indie_master.user:
backend/services/recalc_favorites.py:62:                    key = f'indie_service_{b.indie_master.id}_{service_id}'
backend/services/recalc_favorites.py:68:                        'indie_master_id': b.indie_master.id,
backend/services/recalc_favorites.py:69:                        'indie_master_name': b.indie_master.user.full_name,
backend/create_users_from_csv.py:61:                        # Также создаем запись в indie_masters для независимой работы
backend/create_users_from_csv.py:63:                            INSERT INTO indie_masters (user_id, can_work_independently, domain, address, city, timezone, 
backend/create_users_from_csv.py:88:                        # Создаем запись в indie_masters
backend/create_users_from_csv.py:90:                            INSERT INTO indie_masters (user_id, can_work_independently, domain, address, city, timezone, 
backend/create_users_from_csv.py:106:                            INSERT INTO indie_masters (user_id, can_work_independently, domain, address, city, timezone, 
backend/generate_access_table.py:8:from models import User, UserRole, Master, IndieMaster, Salon
backend/generate_access_table.py:34:        for indie_master in db.query(IndieMaster).all():
backend/generate_access_table.py:35:            if indie_master.user_id in master_info:
backend/generate_access_table.py:36:                master_info[indie_master.user_id] = "Гибридный мастер"
backend/generate_access_table.py:38:                master_info[indie_master.user_id] = "Индивидуальный мастер"
mobile/__tests__/unit/services/api/favorites.test.ts:18:    it('should combine salons, masters, services (master-only, no indie-masters)', async () => {
mobile/CLIENT_DASHBOARD_SETUP.md:309:3. Убедитесь, что backend возвращает `master_id` или `indie_master_id` в bookings.
mobile/src/utils/clientDashboard.ts:121: * Master-only: используем только master_id (indie_master_id не используется для favorites).
mobile/src/services/api/favorites.ts:3:/** Master-only: salon, master, service (indie_master убран) */
mobile/src/services/api/favorites.ts:58: * Master-only для мастеров: indie-masters не загружаются.
mobile/src/services/api/master.ts:93:  is_indie_master?: boolean;
mobile/src/services/api/master.ts:218:  indie_master_id: number | null;
mobile/src/services/api/bookings.ts:23:  indie_master_id: number | null;
docs/E2E_E2E_FIX_REPORT.md:54:- **MasterBookingModule:** передаётся `ownerType` из SubdomainPage для indie_master
docs/SALONS_FEATURE_FLAG_IMPLEMENTATION.md:78:    "top_indie_masters": top_indie_masters_with_names,
docs/CLIENT_DASHBOARD_MOBILE_IMPLEMENTATION.md:17:- `getMasterKey(row)` → нормализация master ID из различных полей (master_id, indie_master_id, etc)
docs/CLIENT_DASHBOARD_MOBILE_IMPLEMENTATION.md:310:     const type = masterData.indie_master_id ? 'indie_master' : 'master'
docs/CLIENT_DASHBOARD_MOBILE_IMPLEMENTATION.md:311:     const itemId = masterData.indie_master_id || masterData.master_id
docs/CLIENT_DASHBOARD_FINAL_MICRO_POLISH_REPORT.md:24:  const id = row.master_id ?? row.indie_master_id ?? row.masterId ?? 
docs/CLIENT_DASHBOARD_FINAL_MICRO_POLISH_REPORT.md:52:      type={b.indie_master_id ? "indie_master" : "master"}
docs/CLIENT_DASHBOARD_FINAL_MICRO_POLISH_REPORT.md:53:      itemId={b.indie_master_id || b.master_id}
docs/CLIENT_DASHBOARD_MICRO_POLISH.md:118:  } else if (fav.type === 'indie_master' && fav.indie_master_id) {
docs/CLIENT_DASHBOARD_MICRO_POLISH.md:119:    masterIds.add(fav.indie_master_id)
docs/CLIENT_DASHBOARD_MICRO_POLISH.md:129:  if (type === 'master' || type === 'indie_master') {
docs/MASTER_CANON_PRECHECK_RESULTS.md:9:| Дубли indie_masters.user_id | 0 строк |
docs/MASTER_CANON_PRECHECK_RESULTS.md:11:| indie_masters без user_id | 0 |
docs/MASTER_CANON_PRECHECK_RESULTS.md:12:| indie_masters с user_id, но без users | 0 |
docs/MASTER_CANON_PRECHECK_RESULTS.md:13:| indie_masters без Master (кандидаты на создание) | 0 |
docs/MASTER_CANON_PRECHECK_RESULTS.md:14:| client_favorites indie_master | 1 |
docs/MASTER_CANON_PRECHECK_RESULTS.md:28:        FROM indie_masters
docs/MASTER_CANON_PRECHECK_RESULTS.md:36:        JOIN indie_masters im ON im.user_id = m.user_id
docs/MASTER_CANON_PRECHECK_RESULTS.md:41:SELECT COUNT(*) AS total FROM indie_masters
docs/MASTER_CANON_PRECHECK_RESULTS.md:42:SELECT COUNT(*) AS cnt FROM indie_masters WHERE user_id IS NULL
docs/MASTER_CANON_PRECHECK_RESULTS.md:44:        FROM indie_masters im
docs/MASTER_CANON_PRECHECK_RESULTS.md:48:        FROM indie_masters im
docs/MASTER_CANON_PRECHECK_RESULTS.md:54:SELECT COUNT(*) AS cnt FROM client_favorites WHERE favorite_type = 'indie_master'
docs/MASTER_CANON_PRECHECK_RESULTS.md:57:        JOIN indie_masters im ON im.id = cf.indie_master_id
docs/MASTER_CANON_PRECHECK_RESULTS.md:59:        WHERE cf.favorite_type = 'indie_master'
docs/MASTER_CANON_STAGE3_REPORT.md:9:| 20260216_fav_migrate | 20260216_migrate_favorites_indie_to_master.py | indie_master → master, дедуп |
docs/MASTER_CANON_STAGE3_REPORT.md:13:1. Удалить `client_favorites` с `favorite_type='indie_master'`, где уже есть master-favorite на того же `master_id` (дубли)
docs/MASTER_CANON_STAGE3_REPORT.md:14:2. Обновить оставшиеся: `favorite_type='master'`, `master_id=indie_masters.master_id`, `indie_master_id=NULL`
docs/MASTER_CANON_STAGE3_REPORT.md:15:3. Post-check: `favorite_type='indie_master'` = 0
docs/MASTER_CANON_STAGE3_REPORT.md:21:| indie_master до миграции | (зависит от данных) |
docs/MASTER_CANON_STAGE3_REPORT.md:22:| indie_master после | 0 |
docs/MASTER_CANON_STAGE3_REPORT.md:31:### GET /api/client/favorites/indie-masters
docs/MASTER_CANON_STAGE3_REPORT.md:42:| MASTER_CANON_MODE=0 | Старое (salon, master, indie_master, service) |
docs/MASTER_CANON_STAGE3_REPORT.md:50:| MASTER_CANON_MODE=1 | `indie_master` / `indie-masters` → **410 Gone** |
docs/MASTER_CANON_STAGE3_REPORT.md:55:SELECT COUNT(*) FROM client_favorites WHERE favorite_type='indie_master';  -- 0
docs/MASTER_CANON_STAGE3_REPORT.md:64:sqlite3 bookme.db "SELECT COUNT(*) FROM client_favorites WHERE favorite_type='indie_master';"
docs/MASTER_CANON_FINAL_CHECKLIST.md:8:- [ ] GET /api/client/bookings/ и /past не возвращают `indie_master_id`
docs/MASTER_CANON_FINAL_CHECKLIST.md:9:- [ ] GET /api/client/favorites/indie-masters → 410
docs/MASTER_CANON_FINAL_CHECKLIST.md:38:### 4. Проверка API контракта (indie_master_id отсутствует)
docs/MASTER_CANON_FINAL_CHECKLIST.md:45:    assert 'indie_master_id' not in b, 'indie_master_id must be absent'
docs/MASTER_CANON_FINAL_CHECKLIST.md:46:print('OK: indie_master_id absent')
docs/MASTER_CANON_CLEANUP_REPORT.md:9:| `backend/schemas.py` | Добавлены BookingFutureShortCanon, BookingPastShortCanon (без indie_master_id) |
docs/MASTER_CANON_CLEANUP_REPORT.md:17:- **Client bookings API:** при MASTER_CANON_MODE=1 поле `indie_master_id` отсутствует в ответе (схемы Canon).
docs/MASTER_CANON_CLEANUP_REPORT.md:19:- **Favorites:** GET /favorites/indie-masters → 410; POST/DELETE indie_* → 400/410.
docs/MASTER_CANON_CLEANUP_REPORT.md:44:# 5. Проверка отсутствия indie_master_id в ответе
docs/MASTER_CANON_CLEANUP_REPORT.md:49:    assert 'indie_master_id' not in b
docs/MASTER_CANON_CLEANUP_REPORT.md:56:- IndieMaster таблица/модели не удалены (отдельный рефактор позже).
docs/TEST_ACCOUNTS_AUDIT.md:40:| **seed.py** | `create_test_data`: `User` (ADMIN, SALON, MASTER, INDIE, CLIENT), `Salon`, `Master`, `IndieMaster`, `Service`, `Booking`. Мастера — без city/timezone. Нет подписок, балансов, резервов. |
docs/TEST_ACCOUNTS_AUDIT.md:84:   - **Stats / Extended stats**: нужны `Master` (и при indie — `IndieMaster`), подписка с фичами (например Pro/Premium для extended).  
docs/TEST_ACCOUNTS_AUDIT.md:200:| seed User/Master/IndieMaster | `backend/seed.py` | 22–201 |
docs/PRE_POST_VISIT_PHASE1_IMPLEMENTATION_REPORT.md:68:- [ ] Создать запись с `indie_master_id`, `master_id=NULL`, статус AWAITING_CONFIRMATION, `start_time` в прошлом.
docs/CLIENTS_MODULE_PHASE0_INVENTORY.md:31:- **ClientRestriction** — client_restrictions (client_phone, indie_master_id, salon_id, restriction_type, reason)
docs/CLIENTS_MODULE_PHASE0_INVENTORY.md:33:- Master API: `GET/POST/PUT/DELETE /api/master/restrictions` — но использует **indie_master_id**
docs/CLIENTS_MODULE_PHASE0_INVENTORY.md:34:- `check_client_restrictions()` — находит IndieMaster по Master.user_id
docs/CLIENTS_MODULE_PHASE0_INVENTORY.md:74:- ClientRestriction привязан к **indie_master_id**.
docs/CLIENTS_MODULE_PHASE0_INVENTORY.md:75:- Мастер в ЛК — `Master` (user_id). Связь: IndieMaster.user_id == Master.user_id.
docs/CLIENTS_MODULE_PHASE0_INVENTORY.md:76:- Для Clients API будем использовать **master_id** (masters.id); при работе с restrictions — получать indie_master_id через user_id.
docs/RESEED_BOOKINGS_PUBLIC_CONTRACT.md:29:    indie_master_id: Optional[int] = None
docs/MASTER_CANON_STAGE2_REPORT.md:20:| `MASTER_CANON_MODE=0` | Без изменений: `master_id`, `indie_master_id` в ответе |
docs/MASTER_CANON_STAGE2_REPORT.md:21:| `MASTER_CANON_MODE=1` | Только `master_id`, `master_name`. `indie_master_id` не отдаётся (null). Резолв через `indie_masters.master_id` |
docs/MASTER_CANON_STAGE2_REPORT.md:26:- Источник: только `indie_masters.master_id` (никаких матчей по имени)
docs/MASTER_CANON_STAGE2_REPORT.md:27:- При `indie_master` без `master_id`: `ValueError` (остановка, remediation)
docs/MASTER_CANON_STAGE2_REPORT.md:32:- `with_indie` — сколько bookings с `indie_master_id`
docs/MASTER_CANON_STAGE2_REPORT.md:47:curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/client/bookings/ | jq '.[0] | {master_id, indie_master_id}'
docs/MASTER_CANON_STAGE2_REPORT.md:50:MASTER_CANON_MODE=1 curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/client/bookings/ | jq '.[0] | {master_id, indie_master_id}'
docs/MASTER_CANON_STAGE2_REPORT.md:51:# indie_master_id должен быть null
docs/CLIENT_DASHBOARD_UI_REFACTOR_REPORT.md:123:- Часть броней через indie_master, часть через master (для разнообразия)
docs/RESEED_CLIENTS_CHANGESET_AUDIT.md:41:    # indie_master_id — НЕ задаётся (остаётся NULL)
docs/RESEED_CLIENTS_CHANGESET_AUDIT.md:48:    crit = or_(Booking.master_id == master_id, Booking.indie_master_id == indie_id)
docs/RESEED_CLIENTS_CHANGESET_AUDIT.md:53:Бронирования с `master_id` и `indie_master_id=NULL` попадают по `Booking.master_id == master_id`. Остальные API (detailed, past, future, dashboard) в master.py используют `or_(master_id, indie_master_id)` — наши брони совпадают по `master_id`.
docs/RESEED_CLIENTS_CHANGESET_AUDIT.md:55:**2.3 Вывод:** Текущая генерация корректна. Услуги reseed — salon-сервисы, привязка по `master_id` ожидаема. Дополнительно выставлять `indie_master_id` не требуется.
docs/E2E_FIX_DIFF_SUMMARY.md:5:**Проблема:** `IndieMaster` не имеет полей `website`, `logo` → AttributeError при GET `/api/domain/{slug}/info`.
docs/E2E_FIX_DIFF_SUMMARY.md:7:**Решение:** Использовать `getattr(indie_master, "website", None)` и `getattr(indie_master, "logo", None)`. Поля `bio` и `email` обёрнуты в fallback (or "").
docs/E2E_FIX_DIFF_SUMMARY.md:10:- "website": indie_master.website,
docs/E2E_FIX_DIFF_SUMMARY.md:11:- "logo": indie_master.logo,
docs/E2E_FIX_DIFF_SUMMARY.md:12:+ "website": getattr(indie_master, "website", None),
docs/E2E_FIX_DIFF_SUMMARY.md:13:+ "logo": getattr(indie_master, "logo", None),
docs/E2E_FIX_DIFF_SUMMARY.md:41:| `backend/routers/domain.py` | getattr для website, logo у IndieMaster |
docs/E2E_STATUS_AUDIT.md:11:| **Страница** | `frontend/src/pages/SubdomainPage.jsx` | Загрузка owner (master/indie_master/salon), YandexMap, MasterBookingModule, фон по background_color |
docs/E2E_STATUS_AUDIT.md:12:| **Данные** | Master/IndieMaster | `domain`, `bio`, `address`, `logo`, `website`, `background_color`, `site_description` |
docs/E2E_STATUS_AUDIT.md:28:- Модели: `backend/models.py` (Master, IndieMaster, MasterPageModule)
docs/PENDING_CONFIRMATIONS_DIAGNOSTIC_VERDICT.md:5:**Фильтр:** `Booking.status == AWAITING_CONFIRMATION` И нет `BookingConfirmation`, owner_cond (master_id OR indie_master_id).
docs/PENDING_CONFIRMATIONS_DIAGNOSTIC_VERDICT.md:12:- Дублей по owner-filter быть не должно: используется `_booking_owner_filter` (master_id OR indie_master_id), один owner на запись.
docs/architecture/database-schema.md:37:    indie_masters {
docs/architecture/database-schema.md:90:        int indie_master_id FK
docs/architecture/database-schema.md:115:        int indie_master_id FK
docs/architecture/database-schema.md:158:        int indie_master_id FK
docs/architecture/database-schema.md:197:    users ||--o{ indie_masters : "has profile"
docs/architecture/database-schema.md:210:    indie_masters ||--o{ services : "offers"
docs/architecture/database-schema.md:211:    indie_masters ||--o{ bookings : "receives"
docs/architecture/database-schema.md:212:    indie_masters ||--o{ incomes : "earns"
docs/architecture/database-schema.md:279:#### `indie_masters` - Независимые мастера
docs/architecture/database-schema.md:364:| `indie_master_id` | INTEGER FK | Ссылка на indie_masters.id |
docs/architecture/database-schema.md:400:| `indie_master_id` | INTEGER FK | ID независимого мастера |
docs/architecture/database-schema.md:474:| `indie_master_id` | INTEGER FK | ID независимого мастера |
docs/architecture/database-schema.md:537:CREATE INDEX idx_incomes_master_date ON incomes(indie_master_id, income_date);
docs/architecture/business-logic.md:48:        indie_master_id=master_id,
docs/architecture/business-logic.md:192:        Income.indie_master_id == master_id,
docs/architecture/business-logic.md:254:        indie_master_id=master_id,
docs/architecture/business-logic.md:364:        service_subquery = db.query(Service.indie_master_id)
docs/architecture/business-logic.md:479:        Income.indie_master_id == master_id,
docs/ACCOUNTING_404_FIX_REPORT.md:5:Записи indie-мастера имеют `indie_master_id` и `master_id = NULL`. Роутер accounting проверял только `Booking.master_id == master_row_id`, из‑за чего записи indie не находились и возвращался 404.
docs/ACCOUNTING_404_FIX_REPORT.md:10:- Добавлены `get_booking_owner_ids()` и `_booking_owner_filter()` для проверки владения по `master_id` **или** `indie_master_id`.
docs/ACCOUNTING_404_FIX_REPORT.md:28:  - Импорт `IndieMaster`
docs/ACCOUNTING_404_FIX_REPORT.md:30:  - Обновлены `update_booking_status`, `confirm_booking`, `cancel_booking`, `confirm_all`, `cancel_all` — использование `or_(Booking.master_id, Booking.indie_master_id)`
docs/MASTER_CANON_MOBILE_MASTER_ONLY_PLAN.md:3:**Цель:** favKey только `"master:N"`, hydrate только `/favorites/masters`, убрать indie_master из UI/логики.
docs/MASTER_CANON_MOBILE_MASTER_ONLY_PLAN.md:31:| **Заменить** | 142 | `FavoriteType = 'master' \| 'indie_master'` → `FavoriteType = 'master'` |
docs/MASTER_CANON_MOBILE_MASTER_ONLY_PLAN.md:32:| **Заменить** | 155-165 | `getFavoriteKeyFromBooking`: убрать ветку `indie_master_id`. Использовать только `master_id` → `getFavoriteKey('master', id)` |
docs/MASTER_CANON_MOBILE_MASTER_ONLY_PLAN.md:33:| **Заменить** | 171-176 | `getFavoriteKeyFromFavorite`: убрать `indie_master`. Всегда `type='master'`, `itemId=fav.master_id` |
docs/MASTER_CANON_MOBILE_MASTER_ONLY_PLAN.md:34:| **Заменить** | 182-186 | `parseFavoriteKey`: убрать `indie_master`. Только `type === 'master'` |
docs/MASTER_CANON_MOBILE_MASTER_ONLY_PLAN.md:45:| **Удалить** | 64-72 | Блок `apiClient.get('/api/client/favorites/indie-masters')` и `allFavorites.push(...indie.map(...))` |
docs/MASTER_CANON_MOBILE_MASTER_ONLY_PLAN.md:47:| **Заменить** | 139-142 | `toggleFavoriteByKey` REMOVE: убрать ветку `indie_master`. Всегда `favType='master'`, `favItemId=matched.master_id` |
docs/MASTER_CANON_MOBILE_MASTER_ONLY_PLAN.md:57:| **Заменить** | 4 | `FavoriteType`: убрать `'indie-master' \| 'indie_master'` |
docs/MASTER_CANON_MOBILE_MASTER_ONLY_PLAN.md:58:| **Удалить** | 86-99 | Блок загрузки indie-masters в `getAllFavorites` |
docs/MASTER_CANON_MOBILE_MASTER_ONLY_PLAN.md:59:| **Заменить** | 130-140 | `addToFavorites`: убрать `indie_master`. Только `master`, `salon`, `service` |
docs/MASTER_CANON_MOBILE_MASTER_ONLY_PLAN.md:60:| **Заменить** | 148-152 | `removeFromFavorites`: убрать нормализацию `indie-master`/`indie_master` |
docs/MASTER_CANON_MOBILE_MASTER_ONLY_PLAN.md:72:| **Заменить** | 21 | `addContext?: { type: 'master' \| 'indie_master'; ... }` → `addContext?: { type: 'master'; ... }` |
docs/MASTER_CANON_MOBILE_MASTER_ONLY_PLAN.md:73:| **Заменить** | 44-47 | `resolvedType`: убрать `indie_master`, только `master` |
docs/MASTER_CANON_MOBILE_MASTER_ONLY_PLAN.md:74:| **Заменить** | 55 | Лог: убрать `indie_master_id` (опционально) |
docs/MASTER_CANON_MOBILE_MASTER_ONLY_PLAN.md:82:| **Заменить** | 21 | `addContext?: { type: 'master' \| 'indie_master'; ... }` → `addContext?: { type: 'master'; ... }` |
docs/MASTER_CANON_MOBILE_MASTER_ONLY_PLAN.md:83:| **Заменить** | 44-47 | `resolvedType`: убрать `indie_master` |
docs/MASTER_CANON_MOBILE_MASTER_ONLY_PLAN.md:91:| **Заменить** | 102 | `handleToggleFavorite`: `addContext?: { type: 'master' \| 'indie_master'; ... }` → `type: 'master'` |
docs/MASTER_CANON_MOBILE_MASTER_ONLY_PLAN.md:93:| **Заменить** | 234-245 | FavoriteCard map: `fav.master_id ?? fav.indie_master_id` → только `fav.master_id` |
docs/MASTER_CANON_MOBILE_MASTER_ONLY_PLAN.md:101:| **Заменить** | 51 | `addContext?: { type: 'master' \| 'indie_master'; ... }` → `type: 'master'` |
docs/MASTER_CANON_MOBILE_MASTER_ONLY_PLAN.md:109:| **Заменить** | 51 | `addContext?: { type: 'master' \| 'indie_master'; ... }` → `type: 'master'` |
docs/MASTER_CANON_MOBILE_MASTER_ONLY_PLAN.md:117:| **Заменить** | 64-69 | `getFavoriteType`: убрать `if (item.indie_master_id) return 'indie-master'`. Только `master`, `salon` |
docs/MASTER_CANON_MOBILE_MASTER_ONLY_PLAN.md:118:| **Заменить** | 72 | `favoriteItemId`: `item.master_id || item.salon_id` (убрать indie_master_id) |
docs/MASTER_CANON_MOBILE_MASTER_ONLY_PLAN.md:140:- [ ] Нет `indie_master:*` в логах
docs/MASTER_CANON_STAGE1_REPORT.md:9:| 20260216_bridge | 20260216_add_indie_masters_master_id_bridge.py | Добавлена колонка master_id (nullable), индекс |
docs/MASTER_CANON_STAGE1_REPORT.md:10:| 20260216_backfill | 20260216_backfill_indie_masters_master_id.py | Backfill по user_id, создание Master при отсутствии |
docs/MASTER_CANON_STAGE1_REPORT.md:11:| 20260216_constraints | 20260216_add_indie_masters_master_id_constraints.py | NOT NULL, UNIQUE(master_id) |
docs/MASTER_CANON_STAGE1_REPORT.md:20:SELECT COUNT(*) FROM indie_masters WHERE master_id IS NULL;  -- 0
docs/MASTER_CANON_STAGE1_REPORT.md:21:SELECT master_id, COUNT(*) FROM indie_masters WHERE master_id IS NOT NULL GROUP BY master_id HAVING COUNT(*) > 1;  -- 0 строк
docs/MASTER_CANON_STAGE1_REPORT.md:28:| indie_masters total | 10 |
docs/MASTER_CANON_STAGE1_REPORT.md:29:| indie_masters with master_id | 10 |
docs/MASTER_CANON_STAGE1_REPORT.md:36:- **backend/models.py:** добавлены `IndieMaster.master_id`, `IndieMaster.master` relationship
docs/MASTER_CANON_STAGE1_REPORT.md:54:    r = conn.execute(text('SELECT id, user_id, master_id FROM indie_masters LIMIT 3'))
docs/LOYALTY_ONBOARDING_READONLY_AUDIT.md:57:- **Модель `IndieMaster`** (`backend/models.py` ~212):  
docs/LOYALTY_ONBOARDING_READONLY_AUDIT.md:58:  `timezone = Column(String, default="Europe/Moscow")` — дефолт есть, но онбординг в аудите про **Master**, не IndieMaster.
docs/LOYALTY_ONBOARDING_READONLY_AUDIT.md:66:**Вывод:** для онбординга мастера (Master) дефолта/автоподстановки TZ при регистрации нет. Риск только у `IndieMaster` при необходимости того же онбординга.
docs/PRE_POST_VISIT_CONFIRMATIONS_VERDICT_REPORT.md:154:| Инди-мастера: `pending-confirmations` фильтрует по `Booking.master_id`; у инди-записей `indie_master_id` | **Доп. баг:** нужно учитывать `indie_master_id` в запросе |
docs/PRE_POST_VISIT_CONFIRMATIONS_VERDICT_REPORT.md:161:1. **Инди-мастера и pending-confirmations:** Сейчас запрос использует `Booking.master_id == master_row_id`. Для инди-мастеров записи имеют `indie_master_id`. Нужно расширить фильтр по аналогии с `_booking_owner_filter`: `master_id == X OR indie_master_id == Y`.
docs/c4/03-component-backend.md:531:- `indie_master_id` - ID мастера
docs/LOYALTY_STEP0_RESEARCH.md:9:- **Timezone мастера:** в `Master` есть поле `timezone` (default `"Europe/Moscow"`). Аналогично у `Salon`, `IndieMaster`. У `User` нет. В `client.py` используются `get_master_timezone(booking)` (master/salon/indie) и `get_current_time_in_timezone(tz)` через `pytz`.
docs/TEST_DATA_RESEED_READONLY_AUDIT.md:25:| **IndieMaster** | `user_id` → User | `domain` (unique) | Отдельная модель; услуги через `Service` (indie_master_id). |
docs/TEST_DATA_RESEED_READONLY_AUDIT.md:27:| **Service** | `salon_id` или `indie_master_id` | `name`, `duration`, `price` | Используется в **Booking** (`service_id`). |
docs/TEST_DATA_RESEED_READONLY_AUDIT.md:34:| **IndieMasterSchedule** | `indie_master_id` → IndieMaster | `day_of_week`, `start_time`, `end_time` | Для инди-мастеров. |
docs/TEST_DATA_RESEED_READONLY_AUDIT.md:35:| **Booking** | `client_id` → User, `service_id` → Service | `service_id`, `start_time`, `end_time`, один из `master_id` / `indie_master_id` / `salon_id` | Статусы: created, awaiting_confirmation, completed, cancelled и др. |
docs/TEST_DATA_RESEED_READONLY_AUDIT.md:135:| Создание (клиент) | `/api/client/bookings/` | POST | `BookingCreate`: `service_id`, `master_id`|`indie_master_id`|`salon_id`, `start_time`, `end_time`, `client_name`, `service_name`, `service_duration`, `service_price`, `use_loyalty_points?` | `routers/client.py` | 421–656 |
docs/TEST_DATA_RESEED_READONLY_AUDIT.md:143:- **Конфликты:** `check_booking_conflicts` по `start_time`/`end_time` и владельцу. Рабочие часы: `check_master_working_hours` (MasterSchedule / IndieMasterSchedule и т.п.).  
docs/TEST_DATA_RESEED_READONLY_AUDIT.md:228:- Пользователи (кроме админа выше), мастеры, инди-мастера, салоны, услуги, категории (master + salon), расписание (MasterSchedule, IndieMasterSchedule, AvailabilitySlot, MasterScheduleSettings), брони (Booking, TemporaryBooking, BookingEditRequest), подписки, балансы, транзакции, списания, резервы, снепшоты, платежи и т.д.
docs/TEST_DATA_RESEED_READONLY_AUDIT.md:236:3. `master_schedules`, `indie_master_schedules`, `availability_slots`, `master_schedule_settings`.  
docs/TEST_DATA_RESEED_READONLY_AUDIT.md:239:6. `masters`, `indie_masters`, `salons`, …  
docs/TEST_DATA_RESEED_READONLY_AUDIT.md:290:| User, Master, IndieMaster, Service, Booking | `backend/models.py` | 47–50, 160–200, 202–228, 137–158, 247–287 |
docs/FAVORITES_DIAGNOSTIC_REPORT.md:17:| **GET** | `/favorites/indie-masters` | client.py:2117 |
docs/FAVORITES_DIAGNOSTIC_REPORT.md:25:- LIST indie-masters: `GET /api/client/favorites/indie-masters`
docs/FAVORITES_DIAGNOSTIC_REPORT.md:42:    indie_master_id: Optional[int] = None
docs/FAVORITES_DIAGNOSTIC_REPORT.md:50:- `indie_master_id` — опционально, для indie_master
docs/FAVORITES_DIAGNOSTIC_REPORT.md:66:- `indie_master` — indie_master_id
docs/FAVORITES_DIAGNOSTIC_REPORT.md:72:- `indie_master` / `indie-masters` / `indieMasters`
docs/FAVORITES_DIAGNOSTIC_REPORT.md:95:    elif favorite_type == 'indie_master' or favorite_type == 'indie-masters' or favorite_type == 'indieMasters':
docs/FAVORITES_DIAGNOSTIC_REPORT.md:98:            ClientFavorite.favorite_type == 'indie_master',
docs/FAVORITES_DIAGNOSTIC_REPORT.md:99:            ClientFavorite.indie_master_id == item_id
docs/FAVORITES_DIAGNOSTIC_REPORT.md:106:- indie_master: `indie_master_id`
docs/FAVORITES_DIAGNOSTIC_REPORT.md:121:  const normalizedType = type === 'indie-master' || type === 'indie_master' ? 'indie_master' : type;
docs/FAVORITES_DIAGNOSTIC_REPORT.md:129:  else if (normalizedType === 'indie_master') body.indie_master_id = itemId;
docs/FAVORITES_DIAGNOSTIC_REPORT.md:138:- **Body:** `{ favorite_type, favorite_name, master_id? | indie_master_id? }`
docs/FAVORITES_DIAGNOSTIC_REPORT.md:145:  const apiType = type === 'indie-master' || type === 'indie_master' ? 'indie_master' : type;
docs/FAVORITES_DIAGNOSTIC_REPORT.md:151:- **URL:** `/api/client/favorites/{favorite_type}/{item_id}` — `favorite_type` = `master` или `indie_master`
docs/FAVORITES_DIAGNOSTIC_REPORT.md:155:- `GET /api/client/favorites/indie-masters`
docs/FAVORITES_DIAGNOSTIC_REPORT.md:182:- `favoriteKeys: Set<string>` — ключи вида `"master:12"`, `"indie_master:5"`
docs/FAVORITES_DIAGNOSTIC_REPORT.md:188:// GET /api/client/favorites/indie-masters → маппинг type: 'indie_master'
docs/FAVORITES_DIAGNOSTIC_REPORT.md:206:- `favType = matched.type === 'indie_master' ? 'indie_master' : 'master'`
docs/FAVORITES_DIAGNOSTIC_REPORT.md:207:- `favId = matched.indie_master_id` или `matched.master_id`
docs/FAVORITES_DIAGNOSTIC_REPORT.md:220:  const domain = booking.master_domain || booking.master?.domain || booking.indie_master?.domain
docs/FAVORITES_DIAGNOSTIC_REPORT.md:223:  const name = booking.master_name || booking.master?.user?.full_name || booking.indie_master?.user?.full_name
docs/FAVORITES_DIAGNOSTIC_REPORT.md:236:  const domain = fav.master?.domain ?? fav.indie_master?.domain
docs/FAVORITES_DIAGNOSTIC_REPORT.md:239:  const name = fav.favorite_name || fav.master?.user?.full_name || fav.indie_master?.user?.full_name
docs/FAVORITES_DIAGNOSTIC_REPORT.md:242:  const type = fav.type === 'indie_master' ? 'indie_master' : 'master'
docs/FAVORITES_DIAGNOSTIC_REPORT.md:243:  const id = type === 'indie_master' ? fav.indie_master_id : fav.master_id
docs/FAVORITES_DIAGNOSTIC_REPORT.md:254:3. `master:id` или `indie_master:id`
docs/FAVORITES_DIAGNOSTIC_REPORT.md:275:**1. Один мастер в bookings (master_id) и в favorites (indie_master_id):**
docs/FAVORITES_DIAGNOSTIC_REPORT.md:277:- Разные `type:id` → `master:1` vs `indie_master:1` — разные ключи.
docs/FAVORITES_DIAGNOSTIC_REPORT.md:279:- Если domain нет: booking — `master:1`, favorite — `indie_master:1` → разные ключи, возможен рассинхрон.
docs/FAVORITES_DIAGNOSTIC_REPORT.md:334:| ADD body | `favorite_type`, `favorite_name`, `master_id`/`indie_master_id` | `favorite_type`, `favorite_name`, `master_id`/`indie_master_id` | ✅ |
docs/FAVORITES_DIAGNOSTIC_REPORT.md:337:| favorite_type | `master`, `indie_master` | `master`, `indie_master` | ✅ |
docs/FAVORITES_DIAGNOSTIC_REPORT.md:339:| item_id для indie_master | `indie_master_id` | `indie_master_id` | ✅ |
docs/FAVORITES_DIAGNOSTIC_REPORT.md:341:| LIST indie-masters | `GET /api/client/favorites/indie-masters` | `GET /api/client/favorites/indie-masters` | ✅ |
docs/FAVORITES_DIAGNOSTIC_REPORT.md:351:2. **Рассинхрон master vs indie_master:** без domain один и тот же человек может быть `master:1` и `indie_master:1` — разные displayKey.
docs/FAVORITES_DIAGNOSTIC_REPORT.md:352:3. **Backend:** в GET `/favorites/masters` и `/favorites/indie-masters` есть `master.domain` и `indie_master.domain`; в bookings — `master_domain`. Если эти поля заполнены, `domain:` даёт стабильный ключ.
docs/LOYALTY_PREIMPLEMENTATION_AUDIT.md:25:| Модель Salon, IndieMaster | `backend/models.py` | `timezone = Column(String, default="Europe/Moscow")` (стр. 105, 211) |
docs/LOYALTY_PREIMPLEMENTATION_AUDIT.md:66:| `models.py` | `Master`, `Salon`, `IndieMaster` | Хранение `timezone` |
docs/MASTER_CANON_MIGRATION_PLAN.md:3:**Цель:** Устранить коллизии favorites (одинаковый `master_name`, разные `favKey`: `master:1` vs `indie_master:1`), сделав `master` единственным источником истины. `indie_master` исчезает из рантайма в MVP.
docs/MASTER_CANON_MIGRATION_PLAN.md:11:### 0.A. IndieMaster → Master bridge
docs/MASTER_CANON_MIGRATION_PLAN.md:15:| `indie_masters.master_id` | NOT NULL, FK на `masters(id)` | Каждый indie_master обязан быть связан с master |
docs/MASTER_CANON_MIGRATION_PLAN.md:16:| UNIQUE(`indie_masters.master_id`) | Да (1:1) | Один master — один indie_master. Если нужен 1:many — явно описать и обосновать. |
docs/MASTER_CANON_MIGRATION_PLAN.md:17:| После cutover: `indie_master_id` в API | Не отдавать (или только под `MASTER_CANON_DEBUG=1`) | Клиент не должен видеть indie_master_id в ответах bookings |
docs/MASTER_CANON_MIGRATION_PLAN.md:23:**Стабильный ключ:** `user_id`. Связь: `IndieMaster.user_id` = `Master.user_id` = `User.id`.
docs/MASTER_CANON_MIGRATION_PLAN.md:29:   UPDATE indie_masters im
docs/MASTER_CANON_MIGRATION_PLAN.md:35:2. **Если Master не найден (IndieMaster без Master):**
docs/MASTER_CANON_MIGRATION_PLAN.md:36:   - Создать запись в `masters` для каждого такого `indie_master`:
docs/MASTER_CANON_MIGRATION_PLAN.md:37:     - `user_id` = `indie_master.user_id`
docs/MASTER_CANON_MIGRATION_PLAN.md:43:   - `SELECT COUNT(*) FROM indie_masters WHERE master_id IS NULL` — должно быть 0.
docs/MASTER_CANON_MIGRATION_PLAN.md:48:- `favorite_type='indie_master'` → `favorite_type='master'`, `master_id` = `indie_masters.master_id`, `indie_master_id` = NULL.
docs/MASTER_CANON_MIGRATION_PLAN.md:60:JOIN indie_masters im ON im.id = cf.indie_master_id AND im.master_id IS NOT NULL
docs/MASTER_CANON_MIGRATION_PLAN.md:61:WHERE cf.favorite_type = 'indie_master';
docs/MASTER_CANON_MIGRATION_PLAN.md:77:SET favorite_type = 'master', master_id = im.master_id, indie_master_id = NULL
docs/MASTER_CANON_MIGRATION_PLAN.md:78:FROM indie_masters im
docs/MASTER_CANON_MIGRATION_PLAN.md:79:WHERE cf.indie_master_id = im.id AND cf.favorite_type = 'indie_master'
docs/MASTER_CANON_MIGRATION_PLAN.md:93:| **GET /favorites/indie-masters** | Deprecated. Срок: 1 релиз после mobile cutover. Поведение: **410 Gone** с `{"detail": "Use /favorites/masters. Indie-masters merged into masters."}` |
docs/MASTER_CANON_MIGRATION_PLAN.md:101:| **1** | Bridge + Backfill | Alembic: добавить `indie_masters.master_id`, backfill по user_id, NOT NULL, UNIQUE | ✅ Выполнен (см. [MASTER_CANON_STAGE1_REPORT.md](./MASTER_CANON_STAGE1_REPORT.md)) |
docs/MASTER_CANON_MIGRATION_PLAN.md:102:| **2** | Backend read-resolve | В client router: при отдаче bookings — всегда `master_id`, не отдавать `indie_master_id` (или под DEBUG) | ✅ Выполнен (см. [MASTER_CANON_STAGE2_REPORT.md](./MASTER_CANON_STAGE2_REPORT.md)) |
docs/MASTER_CANON_MIGRATION_PLAN.md:104:| **4** | Mobile master-only | Убрать indie-masters hydrate, favKey только `master:N` |
docs/MASTER_CANON_MIGRATION_PLAN.md:105:| **5** | Disable/deprecate | 410 на /indie-masters, 400 на POST не-master |
docs/MASTER_CANON_MIGRATION_PLAN.md:118:# До: GET /api/client/bookings/ — есть indie_master_id
docs/MASTER_CANON_MIGRATION_PLAN.md:119:# После: GET /api/client/bookings/ — master_id всегда, indie_master_id отсутствует (или под DEBUG)
docs/MASTER_CANON_MIGRATION_PLAN.md:122:# GET /api/client/favorites/indie-masters — 410 после cutover
docs/MASTER_CANON_MIGRATION_PLAN.md:127:SELECT COUNT(*) FROM indie_masters WHERE master_id IS NULL;  -- 0
docs/MASTER_CANON_MIGRATION_PLAN.md:128:SELECT COUNT(*) FROM client_favorites WHERE favorite_type = 'indie_master';  -- 0 после миграции
docs/MASTER_CANON_MIGRATION_PLAN.md:132:**Mobile checks:** Логи `[FAV][hydrate]`, `[FAV][row]` — нет `indie_master:*` в favKey.
docs/MASTER_CANON_MIGRATION_PLAN.md:137:- [ ] Mobile: откат на версию с indie-masters (если уже задеплоена)
docs/MASTER_CANON_MIGRATION_PLAN.md:145:### 0.G.1. Дубли indie_masters.user_id
docs/MASTER_CANON_MIGRATION_PLAN.md:148:-- user_id с несколькими indie_masters
docs/MASTER_CANON_MIGRATION_PLAN.md:150:FROM indie_masters
docs/MASTER_CANON_MIGRATION_PLAN.md:160:-- После backfill: сколько masters будут иметь >1 indie_master
docs/MASTER_CANON_MIGRATION_PLAN.md:161:-- (если user_id дублируется — один master получит несколько indie_masters)
docs/MASTER_CANON_MIGRATION_PLAN.md:164:JOIN indie_masters im ON im.user_id = m.user_id
docs/MASTER_CANON_MIGRATION_PLAN.md:168:**Ожидание:** 0 строк (при отсутствии дублей user_id в indie_masters).
docs/MASTER_CANON_MIGRATION_PLAN.md:170:### 0.G.3. Статистика indie_masters
docs/MASTER_CANON_MIGRATION_PLAN.md:173:-- Всего indie_masters
docs/MASTER_CANON_MIGRATION_PLAN.md:174:SELECT COUNT(*) AS total FROM indie_masters;
docs/MASTER_CANON_MIGRATION_PLAN.md:177:SELECT COUNT(*) AS no_user_id FROM indie_masters WHERE user_id IS NULL;
docs/MASTER_CANON_MIGRATION_PLAN.md:181:FROM indie_masters im
docs/MASTER_CANON_MIGRATION_PLAN.md:187:FROM indie_masters im
docs/MASTER_CANON_MIGRATION_PLAN.md:199:WHERE favorite_type = 'indie_master';
docs/MASTER_CANON_MIGRATION_PLAN.md:204:JOIN indie_masters im ON im.id = cf.indie_master_id
docs/MASTER_CANON_MIGRATION_PLAN.md:206:WHERE cf.favorite_type = 'indie_master'
docs/MASTER_CANON_MIGRATION_PLAN.md:217:## 0.H. Разрешение коллизий (несколько indie_masters на один user_id)
docs/MASTER_CANON_MIGRATION_PLAN.md:219:**Если на один user_id > 1 indie_master:**
docs/MASTER_CANON_MIGRATION_PLAN.md:229:**Влияние на UNIQUE(indie_masters.master_id):**
docs/MASTER_CANON_MIGRATION_PLAN.md:239:| **Скрывать indie_master_id в bookings** | Этап 2 (Backend read-resolve) | Только при `MASTER_CANON_MODE=1`. При `MASTER_CANON_MODE=0` — старое поведение (отдаём оба поля). |
docs/MASTER_CANON_MIGRATION_PLAN.md:240:| **410 на GET /favorites/indie-masters** | Этап 5, **после** релиза mobile master-only | Не раньше. Пока mobile может вызывать indie-masters — эндпоинт возвращает данные. Переход: mobile релиз → затем 410. |
docs/MASTER_CANON_MIGRATION_PLAN.md:245:3. Этап 5: включаем `MASTER_CANON_MODE=1`, 410 на indie-masters.
docs/MASTER_CANON_MIGRATION_PLAN.md:249:## 0.J. Backfill: создание Master для IndieMaster
docs/MASTER_CANON_MIGRATION_PLAN.md:251:**Когда:** IndieMaster с `user_id` есть, Master с тем же `user_id` отсутствует.
docs/MASTER_CANON_MIGRATION_PLAN.md:257:| `user_id` | NOT NULL | `indie_master.user_id` | Не создаём Master (ошибка) |
docs/MASTER_CANON_MIGRATION_PLAN.md:260:| `bio` | nullable | `indie_master.bio` | NULL |
docs/MASTER_CANON_MIGRATION_PLAN.md:261:| `experience_years` | nullable | `indie_master.experience_years` | NULL |
docs/MASTER_CANON_MIGRATION_PLAN.md:262:| `domain` | unique, nullable | `indie_master.domain` | NULL (или сгенерировать `master-{user_id}-{ts}` если нужен) |
docs/MASTER_CANON_MIGRATION_PLAN.md:263:| `address` | nullable | `indie_master.address` | NULL |
docs/MASTER_CANON_MIGRATION_PLAN.md:264:| `city` | nullable | `indie_master.city` | NULL или 'Москва' |
docs/MASTER_CANON_MIGRATION_PLAN.md:265:| `timezone` | nullable | `indie_master.timezone` | 'Europe/Moscow' |
docs/MASTER_CANON_MIGRATION_PLAN.md:279:FROM indie_masters im
docs/MASTER_CANON_MIGRATION_PLAN.md:285:**Конфликт domain:** если `indie_master.domain` уже занят в masters — использовать NULL или `master-{user_id}`.
docs/MASTER_CANON_MIGRATION_PLAN.md:292:- [ ] Дубли `indie_masters.user_id`: 0 (или план разрешения по 0.H)
docs/MASTER_CANON_MIGRATION_PLAN.md:294:- [ ] IndieMaster без user_id: обработаны (исключены или user_id восстановлен)
docs/MASTER_CANON_MIGRATION_PLAN.md:295:- [ ] IndieMaster с user_id, но без User: 0 (или разобраны)
docs/MASTER_CANON_MIGRATION_PLAN.md:296:- [ ] IndieMaster без Master: план создания Master (0.J) согласован
docs/MASTER_CANON_MIGRATION_PLAN.md:306:### 1.1. Инвентаризация: где упоминаются indie_master / favorite_type / endpoints
docs/MASTER_CANON_MIGRATION_PLAN.md:310:| **indie_master_id** (в booking) | Booking model, API response | `backend/models.py:279` (Booking), `backend/routers/client.py:177,304` (future/past), `backend/schemas.py:172,182,325,335,...` |
docs/MASTER_CANON_MIGRATION_PLAN.md:311:| **indie_master_id** (в favorite) | ClientFavorite model, API | `backend/models.py:1566`, `backend/routers/client.py:1746,1776,1966,2026,2081,2144,2213,2285,2291` |
docs/MASTER_CANON_MIGRATION_PLAN.md:312:| **indie_master** (таблица) | IndieMaster model, relationships | `backend/models.py:227-251`, Service.indie_master_id, Booking.indie_master_id, ClientFavorite.indie_master_id, ClientRestriction, ExpenseType, Expense, etc. |
docs/MASTER_CANON_MIGRATION_PLAN.md:315:| **GET /favorites/indie-masters** | Mobile, Frontend | `mobile/src/stores/favoritesStore.ts:65`, `mobile/src/services/api/favorites.ts:89`, `frontend/src/pages/ClientDashboard.jsx:237`, `frontend/src/pages/ClientFavorite.jsx:109` |
docs/MASTER_CANON_MIGRATION_PLAN.md:317:| **Выбор типа из booking** | `master_id ? master : indie_master` | `mobile/src/utils/clientDashboard.ts:156-158` (getFavoriteKeyFromBooking), `frontend/src/pages/ClientDashboard.jsx:134,1124,1269,1874,2007` |
docs/MASTER_CANON_MIGRATION_PLAN.md:326:│ indie_masters (id, user_id, ...)  ← связь через user_id с Master                  │
docs/MASTER_CANON_MIGRATION_PLAN.md:327:│ bookings (master_id, indie_master_id, ...)  ← один из двух заполнен              │
docs/MASTER_CANON_MIGRATION_PLAN.md:328:│ client_favorites (favorite_type, master_id, indie_master_id)                     │
docs/MASTER_CANON_MIGRATION_PLAN.md:329:│ services (master_id, indie_master_id)  ← для indie: indie_master_id              │
docs/MASTER_CANON_MIGRATION_PLAN.md:336:│ GET /api/client/bookings/        → BookingFutureShort (master_id, indie_master_id)│
docs/MASTER_CANON_MIGRATION_PLAN.md:337:│ GET /api/client/bookings/past    → BookingPastShort (master_id, indie_master_id) │
docs/MASTER_CANON_MIGRATION_PLAN.md:339:│ GET /api/client/favorites/indie-masters → [{favorite_type, indie_master_id, ...}]│
docs/MASTER_CANON_MIGRATION_PLAN.md:340:│ POST /api/client/favorites       → body: favorite_type, master_id | indie_master_id│
docs/MASTER_CANON_MIGRATION_PLAN.md:348:│ favoritesStore: hydrateFavorites() → 2 запроса (masters + indie-masters)         │
docs/MASTER_CANON_MIGRATION_PLAN.md:349:│   → favoriteKeys = Set<"master:1" | "indie_master:5">                            │
docs/MASTER_CANON_MIGRATION_PLAN.md:350:│ getFavoriteKeyFromBooking(booking) → indie_master_id ? "indie_master:N" : "master:N"│
docs/MASTER_CANON_MIGRATION_PLAN.md:351:│ addContext = { type: 'master'|'indie_master', itemId, name }                      │
docs/MASTER_CANON_MIGRATION_PLAN.md:359:│ favKey = getFavoriteKeyFromBooking(booking)  ← приоритет indie_master_id над master_id│
docs/MASTER_CANON_MIGRATION_PLAN.md:361:│ Коллизия: booking A (master_id=1) → "master:1", booking B (indie_master_id=1) →   │
docs/MASTER_CANON_MIGRATION_PLAN.md:362:│           "indie_master:1" — разные ключи при одном display name                 │
docs/MASTER_CANON_MIGRATION_PLAN.md:371:| `backend/models.py` | IndieMaster (227-251), Booking.indie_master_id (279), Service.indie_master_id (147), ClientFavorite (1554-1586), ClientRestriction.indie_master_id (1247), ExpenseType/Expense/ExpenseTemplate/Income/MissedRevenue.indie_master_id |
docs/MASTER_CANON_MIGRATION_PLAN.md:372:| `backend/schemas.py` | BookingFutureShort, BookingPastShort, ClientFavoriteCreate, ClientFavoriteOut — indie_master_id в ~15 схемах |
docs/MASTER_CANON_MIGRATION_PLAN.md:373:| `backend/routers/client.py` | get_future_bookings (71-195), get_past_bookings (197-323), add_to_favorites (1708-1810), remove_from_favorites (1926-1995), get_favorite_masters (2054-2112), get_favorite_indie_masters (2118-2172), get_favorites_check (2252-2310), dashboard/stats (1637-1666) |
docs/MASTER_CANON_MIGRATION_PLAN.md:374:| `backend/routers/master.py` | get_future_bookings_paginated (263: `Booking.indie_master_id == master.id` — потенциальный баг), _get_indie_master_id_for_restrictions (2754), ClientRestriction CRUD |
docs/MASTER_CANON_MIGRATION_PLAN.md:375:| `backend/routers/dev_e2e.py` | seed, reset — indie_master_ids, Booking.indie_master_id |
docs/MASTER_CANON_MIGRATION_PLAN.md:376:| `backend/routers/dev_testdata.py` | ensure_indie_master (488), create_indie_service (548) |
docs/MASTER_CANON_MIGRATION_PLAN.md:377:| `backend/routers/admin.py` | service.indie_master_id (1286) |
docs/MASTER_CANON_MIGRATION_PLAN.md:392:| `mobile/src/services/api/bookings.ts` | Booking interface (indie_master_id) |
docs/MASTER_CANON_MIGRATION_PLAN.md:397:| `frontend/src/pages/ClientDashboard.jsx` | fetch favorites (masters + indie-masters), type/itemId для FavoriteButton, indie_master_id в booking rows |
docs/MASTER_CANON_MIGRATION_PLAN.md:398:| `frontend/src/pages/ClientFavorite.jsx` | fetch masters + indie-masters |
docs/MASTER_CANON_MIGRATION_PLAN.md:399:| `frontend/src/components/FavoriteButton.jsx` | favorite_type, indie_master_id в body |
docs/MASTER_CANON_MIGRATION_PLAN.md:400:| `frontend/src/components/ClientDashboardStats.jsx` | indie_master_id в key |
docs/MASTER_CANON_MIGRATION_PLAN.md:406:| `backend/scripts/reseed_local_test_data.py` | ensure_indie_master (280), create_indie_service (291), create_completed_bookings с owner_type indie_master (449, 577), indie_master_id в booking (393, 481, 611), indie_sanity (777-793) |
docs/MASTER_CANON_MIGRATION_PLAN.md:407:| `backend/routers/dev_testdata.py` | ensure_indie_master (488), create_indie_service (548) |
docs/MASTER_CANON_MIGRATION_PLAN.md:408:| `backend/routers/dev_e2e.py` | ensure_indie (278), IndieMasterSchedule, Booking.indie_master_id (330, 347, 361, 377, 390, 406) |
docs/MASTER_CANON_MIGRATION_PLAN.md:410:**Связь Master ↔ IndieMaster:** Один User может иметь и Master, и IndieMaster (оба с user_id). Master.id и IndieMaster.id — разные PK. Резолв: `IndieMaster.query.filter(user_id == Master.user_id).first()`.
docs/MASTER_CANON_MIGRATION_PLAN.md:414:**Backend: indie_master_id / favorite_type**
docs/MASTER_CANON_MIGRATION_PLAN.md:418:| `models.py` | IndieMaster, Booking, Service, ClientFavorite, ClientRestriction, Expense* | FK, relationships | Добавить IndieMaster.master_id |
docs/MASTER_CANON_MIGRATION_PLAN.md:419:| `schemas.py` | BookingFutureShort, BookingPastShort, ClientFavorite* | Pydantic поля | Убрать indie_master_id из client response (или optional) |
docs/MASTER_CANON_MIGRATION_PLAN.md:420:| `routers/client.py` | get_future_bookings, get_past_bookings | Возврат master_id, indie_master_id | Read-resolve: всегда master_id |
docs/MASTER_CANON_MIGRATION_PLAN.md:421:| `routers/client.py` | add_to_favorites, remove_from_favorites | Обработка indie_master_id | Guard: только master |
docs/MASTER_CANON_MIGRATION_PLAN.md:422:| `routers/client.py` | get_favorite_indie_masters | GET /favorites/indie-masters | 410 Gone |
docs/MASTER_CANON_MIGRATION_PLAN.md:423:| `routers/client.py` | dashboard/stats | top_indie_masters | Резолв в master или объединение |
docs/MASTER_CANON_MIGRATION_PLAN.md:424:| `routers/master.py` | get_future_bookings_paginated | `Booking.indie_master_id == master.id` | Исправить: использовать indie_master.id по user_id |
docs/MASTER_CANON_MIGRATION_PLAN.md:425:| `routers/master.py` | _get_indie_master_id_for_restrictions | ClientRestriction по indie_master_id | Оставить (внутренняя логика) |
docs/MASTER_CANON_MIGRATION_PLAN.md:426:| `routers/dev_testdata.py` | ensure_indie_master, create_indie_service | Seed | Установить master_id при создании |
docs/MASTER_CANON_MIGRATION_PLAN.md:428:| `scripts/reseed_local_test_data.py` | ensure_indie_master, create_completed_bookings | Reseed | Обновить |
docs/MASTER_CANON_MIGRATION_PLAN.md:430:**Backend: favorite_type='indie_master' / /favorites/indie-masters**
docs/MASTER_CANON_MIGRATION_PLAN.md:436:**Mobile: indie_master_id, favKey "indie_master:*", hydrate indie-masters**
docs/MASTER_CANON_MIGRATION_PLAN.md:440:| `favoritesStore.ts` | hydrateFavorites | GET indie-masters, маппинг type | Убрать запрос, только masters |
docs/MASTER_CANON_MIGRATION_PLAN.md:441:| `favoritesStore.ts` | toggleFavoriteByKey | REMOVE по indie_master | Только master |
docs/MASTER_CANON_MIGRATION_PLAN.md:442:| `favorites.ts` | getAllFavorites, addToFavorites, removeFromFavorites | indie-masters, body | Только master |
docs/MASTER_CANON_MIGRATION_PLAN.md:443:| `clientDashboard.ts` | getFavoriteKeyFromBooking | indie_master_id → "indie_master:N" | Только master_id → "master:N" |
docs/MASTER_CANON_MIGRATION_PLAN.md:444:| `clientDashboard.ts` | getFavoriteKeyFromFavorite | type indie_master | Только master_id |
docs/MASTER_CANON_MIGRATION_PLAN.md:445:| `BookingRowFuture.tsx` | addContext | type: master \| indie_master | Только master |
docs/MASTER_CANON_MIGRATION_PLAN.md:447:| `dashboard.tsx` | handleToggleFavorite, FavoriteCard map | addContext, fav.master_id \| indie_master_id | Только master |
docs/MASTER_CANON_MIGRATION_PLAN.md:450:| `bookings.ts` | Booking interface | indie_master_id | Оставить optional, не использовать в favKey |
docs/MASTER_CANON_MIGRATION_PLAN.md:451:| `AllBookingsModal.tsx` | favoriteItemId | indie_master_id \|\| master_id | Только master_id |
docs/MASTER_CANON_MIGRATION_PLAN.md:453:| `favorites.test.ts` | Mock indie-masters | Тесты | Обновить/удалить |
docs/MASTER_CANON_MIGRATION_PLAN.md:464:| indie_master_id | Optional, для indie | **Убрать из контракта** (не возвращать клиенту) |
docs/MASTER_CANON_MIGRATION_PLAN.md:465:| master_name | Из master.user или indie_master.user | master_name (источник — резолв через master_id) |
docs/MASTER_CANON_MIGRATION_PLAN.md:468:**Резолв:** Для записей с `indie_master_id` backend при отдаче клиенту подставляет `master_id` через связь `IndieMaster.user_id → Master.user_id` (или через будущую колонку `indie_masters.master_id`).
docs/MASTER_CANON_MIGRATION_PLAN.md:474:| Эндпоинты | /masters, /indie-masters | Один: /masters (все избранные мастера) |
docs/MASTER_CANON_MIGRATION_PLAN.md:475:| favorite_type | master, indie_master | Только master (или deprecated, не используется в рантайме) |
docs/MASTER_CANON_MIGRATION_PLAN.md:476:| favKey | "master:N" \| "indie_master:N" | Только "master:N" |
docs/MASTER_CANON_MIGRATION_PLAN.md:477:| ClientFavorite в БД | favorite_type + master_id \| indie_master_id | Миграция: indie_master → master_id через резолв |
docs/MASTER_CANON_MIGRATION_PLAN.md:484:| **indie_masters** | Вариант A: **alias/bridge** — оставить таблицу, добавить `master_id` (FK на masters), все API/сервисы резолвят в master_id. Либо Вариант B: слияние данных + remap. |
docs/MASTER_CANON_MIGRATION_PLAN.md:485:| **bookings** | Поле `indie_master_id` — nullable, но API всегда отдаёт `master_id`. Внутренняя логика может использовать оба для обратной совместимости. |
docs/MASTER_CANON_MIGRATION_PLAN.md:486:| **client_favorites** | Записи с favorite_type='indie_master' мигрировать: установить master_id через IndieMaster→Master, favorite_type='master'. |
docs/MASTER_CANON_MIGRATION_PLAN.md:499:| Объём работ | Большой: миграция всех таблиц с indie_master_id | Умеренный: одна миграция + изменения в роутах |
docs/MASTER_CANON_MIGRATION_PLAN.md:504:1. IndieMaster и Master связаны через user_id. Добавить `indie_masters.master_id` (FK на masters) и заполнить из `Master.query.filter(user_id=indie.user_id).first()`.
docs/MASTER_CANON_MIGRATION_PLAN.md:505:2. Все API, отдающие booking/favorite клиенту, подставляют `master_id` (если пришёл indie_master_id — резолв через indie_masters.master_id).
docs/MASTER_CANON_MIGRATION_PLAN.md:506:3. Внутренняя логика (ClientRestriction, Expense и т.д.) может временно оставаться на indie_master_id; критично только клиентский контракт.
docs/MASTER_CANON_MIGRATION_PLAN.md:513:| **1. Добавить indie_masters.master_id** | `ALTER TABLE indie_masters ADD COLUMN master_id INTEGER REFERENCES masters(id)`; заполнить из `Master.id WHERE Master.user_id = IndieMaster.user_id`. |
docs/MASTER_CANON_MIGRATION_PLAN.md:514:| **2. Миграция client_favorites** | Для записей с `favorite_type='indie_master'`: установить `master_id` из `IndieMaster.master_id`, `favorite_type='master'`, `indie_master_id=NULL` (или оставить для аудита). Уникальность: `unique_master_favorite` по (client_id, master_id). |
docs/MASTER_CANON_MIGRATION_PLAN.md:515:| **3. (Опционально) Индексы** | Индекс на `indie_masters.master_id` для быстрого резолва. |
docs/MASTER_CANON_MIGRATION_PLAN.md:518:- Есть ли IndieMaster без соответствующего Master (user_id без Master)?
docs/MASTER_CANON_MIGRATION_PLAN.md:519:- Есть ли дубли (один master_id — несколько indie_masters)?
docs/MASTER_CANON_MIGRATION_PLAN.md:525:| `mobile/src/utils/clientDashboard.ts` | `getFavoriteKeyFromBooking`: всегда `master_id` → `"master:"+id`. Убрать ветку `indie_master_id`. `FavoriteType` = только `'master'`. `getFavoriteKeyFromFavorite`: только master_id. |
docs/MASTER_CANON_MIGRATION_PLAN.md:526:| `mobile/src/stores/favoritesStore.ts` | `hydrateFavorites`: один запрос `GET /api/client/favorites/masters`. Убрать запрос indie-masters. `toggleFavoriteByKey`: только master, убрать indie_master. |
docs/MASTER_CANON_MIGRATION_PLAN.md:527:| `mobile/src/services/api/favorites.ts` | Убрать `getAllFavorites` вызов indie-masters. `addToFavorites`: только type='master', body.master_id. `removeFromFavorites`: только type='master'. Убрать indie_master из типов. |
docs/MASTER_CANON_MIGRATION_PLAN.md:528:| `mobile/src/components/client/BookingRowFuture.tsx` | `addContext`: только `{ type: 'master', itemId: master_id, name }`. Убрать `indie_master` из типов. |
docs/MASTER_CANON_MIGRATION_PLAN.md:533:| `mobile/src/services/api/bookings.ts` | Booking: `indie_master_id` оставить в интерфейсе как optional (для обратной совместимости), но не использовать в favKey. |
docs/MASTER_CANON_MIGRATION_PLAN.md:539:| `GET /favorites/indie-masters` | Deprecated. Возвращать пустой массив или 410 Gone. Либо оставить до cutover, затем убрать. |
docs/MASTER_CANON_MIGRATION_PLAN.md:540:| `POST /favorites` с `indie_master_id` | Принимать, но резолвить в master_id и сохранять как master. Пометить deprecated. |
docs/MASTER_CANON_MIGRATION_PLAN.md:541:| `DELETE /favorites/indie_master/{id}` | Резолвить indie_master_id→master_id, удалять по master_id. Deprecated. |
docs/MASTER_CANON_MIGRATION_PLAN.md:542:| Поле `indie_master_id` в booking response | Вариант 1: перестать отдавать. Вариант 2: оставить для отладки, deprecated. |
docs/MASTER_CANON_MIGRATION_PLAN.md:543:| **Cutover** | Mobile перестаёт вызывать `/indie-masters` и использовать indie_master в addContext. Backend продолжает принимать старые запросы с резолвом. |
docs/MASTER_CANON_MIGRATION_PLAN.md:554:| IndieMaster без Master | user_id есть в IndieMaster, нет в Master | Проверка перед миграцией: `SELECT * FROM indie_masters im WHERE NOT EXISTS (SELECT 1 FROM masters m WHERE m.user_id = im.user_id)`. |
docs/MASTER_CANON_MIGRATION_PLAN.md:555:| Дубли master_id | Несколько IndieMaster на одного Master | Обычно 1:1. Проверка: `SELECT master_id, COUNT(*) FROM indie_masters GROUP BY master_id HAVING COUNT(*)>1`. |
docs/MASTER_CANON_MIGRATION_PLAN.md:556:| Ссылки в bookings | booking.indie_master_id без master_id | Текущая модель допускает. Резолв: при отдаче подставлять master_id. |
docs/MASTER_CANON_MIGRATION_PLAN.md:557:| Favorites в БД | client_favorites с indie_master_id | Миграция в отдельном шаге с проверкой уникальности. |
docs/MASTER_CANON_MIGRATION_PLAN.md:558:| Seed / E2E | reseed, dev_e2e создают indie_master | Обновить seed: создавать master_id, при необходимости оба. |
docs/MASTER_CANON_MIGRATION_PLAN.md:562:1. **Лог резолва:** при отдаче booking с indie_master_id — логировать `resolved master_id=X from indie_master_id=Y`.
docs/MASTER_CANON_MIGRATION_PLAN.md:563:2. **Счётчик миграции favorites:** сколько записей client_favorites переведено из indie_master в master.
docs/MASTER_CANON_MIGRATION_PLAN.md:564:3. **Лог deprecated:** вызовы GET /favorites/indie-masters, POST с indie_master_id.
docs/MASTER_CANON_MIGRATION_PLAN.md:570:- [ ] Выгружена структура: `indie_masters`, `masters`, `bookings`, `client_favorites` — количество записей, наличие user_id/master_id.
docs/MASTER_CANON_MIGRATION_PLAN.md:571:- [ ] Проверка: нет IndieMaster без Master.
docs/MASTER_CANON_MIGRATION_PLAN.md:572:- [ ] Проверка: нет дублей master_id в indie_masters (если добавляем колонку).
docs/MASTER_CANON_MIGRATION_PLAN.md:573:- [ ] Решение по судьбе GET /favorites/indie-masters (deprecated vs удаление).
docs/MASTER_CANON_MIGRATION_PLAN.md:585:| Add favorite на booking (бывший indie_master_id, теперь master_id) | Сердце заполнено, favKey=master:N |
docs/MASTER_CANON_MIGRATION_PLAN.md:591:| Старые записи | Booking с indie_master_id — backend отдаёт master_id (резолв) |
docs/MASTER_CANON_MIGRATION_PLAN.md:596:- ClientRestriction, Expense и др. — работают (внутренняя логика на indie_master_id может остаться).
docs/MASTER_CANON_MIGRATION_PLAN.md:607:| indie_master_id (Booking) | API response | client.py:177,304 |
docs/MASTER_CANON_MIGRATION_PLAN.md:608:| indie_master_id (ClientFavorite) | CRUD, list | client.py:1746,1776,1966,2026,2081,2144,2213,2285,2291 |
docs/MASTER_CANON_MIGRATION_PLAN.md:618:| Booking response | master_id?, indie_master_id? | master_id (обязателен), indie_master_id не отдавать |
docs/MASTER_CANON_MIGRATION_PLAN.md:620:| GET /favorites/indie-masters | Список indie favorites | Deprecated / пустой |
docs/MASTER_CANON_MIGRATION_PLAN.md:621:| favKey | "master:N" \| "indie_master:N" | Только "master:N" |
docs/MASTER_CANON_MIGRATION_PLAN.md:622:| addContext | type: master \| indie_master | type: master |
docs/MASTER_CANON_MIGRATION_PLAN.md:628:| 1 | Добавить indie_masters.master_id, заполнить | — |
docs/MASTER_CANON_MIGRATION_PLAN.md:631:| 4 | Deprecated /favorites/indie-masters | Убрать вызов indie-masters |
docs/MASTER_CANON_MIGRATION_PLAN.md:639:1. **Стабильный ключ — user_id.** Сопоставление IndieMaster↔Master только по `user_id`. Никаких матчей по имени.
docs/MASTER_CANON_MIGRATION_PLAN.md:640:2. **IndieMaster без Master:** создаём Master для каждого такого IndieMaster, затем проставляем `master_id`.
docs/MASTER_CANON_MIGRATION_PLAN.md:641:3. **1:1 constraint:** UNIQUE(`indie_masters.master_id`) — один master, один indie_master.
docs/MASTER_CANON_MIGRATION_PLAN.md:642:4. **API:** после cutover не отдаём `indie_master_id` в bookings (или только под DEBUG). Favorites — только master.
docs/MASTER_CANON_MIGRATION_PLAN.md:644:6. **Deprecated:** GET /favorites/indie-masters → 410 Gone после mobile cutover.
docs/MASTER_CANON_MIGRATION_PLAN.md:653:| IndieMaster без Master | Pre-check: `SELECT * FROM indie_masters im WHERE NOT EXISTS (SELECT 1 FROM masters m WHERE m.user_id = im.user_id)`. Backfill: создаём Master. |
docs/MASTER_CANON_MIGRATION_PLAN.md:654:| Дубли master_id в indie_masters | UNIQUE constraint. Pre-check: `SELECT master_id, COUNT(*) FROM indie_masters GROUP BY master_id HAVING COUNT(*)>1`. |
docs/MASTER_CANON_MIGRATION_PLAN.md:656:| Регрессия ClientRestriction/Expense | Внутренняя логика остаётся на indie_master_id (FK). Не трогаем. |
docs/MASTER_CANON_MIGRATION_PLAN.md:666:| 1 | **Bridge + Backfill** | Alembic migration: `indie_masters.master_id` NOT NULL, UNIQUE, backfill по user_id |
docs/MASTER_CANON_MIGRATION_PLAN.md:667:| 2 | **Backend read-resolve** | client router: bookings всегда с master_id, без indie_master_id в response |
docs/MASTER_CANON_MIGRATION_PLAN.md:670:| 5 | **Disable/deprecate** | 410 на /indie-masters, 400 на POST не-master, MASTER_CANON_MODE |
docs/MASTER_CANON_MIGRATION_PLAN.md:677:1. [ ] Выгрузить данные: `indie_masters`, `bookings.indie_master_id`, `client_favorites` с `favorite_type='indie_master'`
docs/MASTER_CANON_MIGRATION_PLAN.md:678:2. [ ] Pre-check: нет IndieMaster без Master (или план создания Master)
docs/CLIENT_DASHBOARD_MICRO_FIX_REPORT.md:23:- Основная таблица "Будущие записи" (2 места: `indie_master` и `master`)
docs/E2E_PLAYWRIGHT_DIFF_SUMMARY.md:25:- **Master A**: phone +79991111111, password e2e123, Free plan, IndieMaster, domain e2e-master-a
docs/E2E_PLAYWRIGHT_DIFF_SUMMARY.md:26:- **Master B**: phone +79992222222, password e2e123, Pro plan, IndieMaster, domain e2e-master-b, pre_visit_confirmations_enabled=true
docs/MASTER_CANON_RUNTIME.md:7:| `MASTER_CANON_MODE` | `0` | `1` — master-only: client bookings/favorites API не возвращают `indie_master_id`, GET `/favorites/indie-masters` → 410 Gone |
docs/MASTER_CANON_RUNTIME.md:29:- **GET /api/client/bookings/** — поле `indie_master_id` отсутствует в ответе (схема `BookingFutureShortCanon`)
docs/MASTER_CANON_RUNTIME.md:30:- **GET /api/client/bookings/past** — поле `indie_master_id` отсутствует в ответе (схема `BookingPastShortCanon`)
docs/MASTER_CANON_RUNTIME.md:31:- **GET /api/client/favorites/indie-masters** — 410 Gone
docs/MASTER_CANON_RUNTIME.md:32:- **POST /api/client/favorites** с `favorite_type=indie_master` — 400
docs/MASTER_CANON_RUNTIME.md:33:- **DELETE /api/client/favorites/indie_master/{id}** — 410
docs/MASTER_CANON_RUNTIME.md:37:- GET `/favorites/indie-masters` — 200 (для отката/тестирования)
docs/CLIENTS_MODULE_AUDIT_REPORT.md:13:| GET /api/master/restrictions | master.py:2682-2684 | `ClientRestriction.indie_master_id == master.id` | **master.id** (masters.id) | ❌ Ошибка: indie_master_id — FK на indie_masters.id, master.id — masters.id. Разные таблицы. |
docs/CLIENTS_MODULE_AUDIT_REPORT.md:14:| POST /api/master/restrictions | master.py:2713-2726 | то же + `indie_master_id=master.id` при создании | **master.id** | ❌ То же: в колонку indie_master_id пишется masters.id |
docs/CLIENTS_MODULE_AUDIT_REPORT.md:15:| PUT /api/master/restrictions/{id} | master.py:2753-2755 | `ClientRestriction.indie_master_id == master.id` | **master.id** | ❌ То же |
docs/CLIENTS_MODULE_AUDIT_REPORT.md:20:| GET /api/master/clients/{key} (restrictions) | master_clients.py:284-291 | `ClientRestriction.indie_master_id == indie.id` | **indie.id** | ✓ OK: indie = IndieMaster по master.user_id |
docs/CLIENTS_MODULE_AUDIT_REPORT.md:23:| check_client_restrictions (util) | client_restrictions.py:166-167 | `ClientRestriction.indie_master_id == indie_master_id` | **indie_master_id** (резолвится из master) | ✓ OK: indie_master_id = IndieMaster.id |
docs/CLIENTS_MODULE_AUDIT_REPORT.md:27:### 1.2 masters.id и indie_masters.id
docs/CLIENTS_MODULE_AUDIT_REPORT.md:29:**Не равны по гарантии.** Это PK двух разных таблиц с автоинкрементом. Один User может иметь Master (user_id) и IndieMaster (user_id) — тогда masters.id ≠ indie_masters.id.
docs/CLIENTS_MODULE_AUDIT_REPORT.md:32:- **Web «Правила» / client-restrictions (mobile):** если используют `/api/master/restrictions` — фильтр `indie_master_id == master.id` не находит записи (индекс по indie_masters.id, а подставляется masters.id). Ограничения либо пустые, либо видны «чужие» при коллизии id.
docs/CLIENTS_MODULE_AUDIT_REPORT.md:35:**Рекомендация (не внедрять):** Везде для ClientRestriction использовать `IndieMaster.id` (indie.id), получаемый как `IndieMaster.filter(user_id == master.user_id).first().id`. Единая истина: `client_restrictions.indie_master_id` должен ссылаться только на `indie_masters.id`.
docs/CLIENTS_MODULE_AUDIT_REPORT.md:170:| **A1** Хранение ограничений | `backend/models.py:1240-1273` (ClientRestriction) | Таблица `client_restrictions`, поля: id, salon_id, indie_master_id, client_phone, restriction_type, reason, is_active | `SELECT * FROM client_restrictions LIMIT 5` |
docs/CLIENTS_MODULE_AUDIT_REPORT.md:172:| **A3** Restriction по мастеру | `master_clients.py:286-291, 386-389` | Фильтр `ClientRestriction.indie_master_id == indie.id` (indie по master.user_id); client_phone из _resolve_client_key | POST restriction для client_key → убедиться, что другой мастер не видит |
docs/CLIENTS_MODULE_AUDIT_REPORT.md:196:- `indie_master_id` — FK → indie_masters.id (nullable для салонов)
docs/CLIENTS_MODULE_AUDIT_REPORT.md:211:- `indie_master_id = indie.id` (IndieMaster по `master.user_id`)
docs/CLIENTS_MODULE_AUDIT_REPORT.md:213:- Проверка дубликата: (indie_master_id, client_phone, restriction_type, is_active)
docs/CLIENTS_MODULE_AUDIT_REPORT.md:217:- Фильтр: `ClientRestriction.id == restriction_id AND ClientRestriction.indie_master_id == indie.id`
docs/CLIENTS_MODULE_AUDIT_REPORT.md:220:**Гарантия «только этот мастер»:** мастер получается по `current_user.id` → Master; IndieMaster по `master.user_id`. Restriction привязан к `indie_master_id`. Чужой мастер имеет другой indie_master_id и не пройдёт фильтр.
docs/CLIENTS_MODULE_AUDIT_REPORT.md:222:**Важно:** В `master.py` restrictions (стр. 2683, 2714) используют `ClientRestrictionModel.indie_master_id == master.id` — т.е. сравнивают `masters.id` с FK `indie_master_id` (indie_masters.id). В `master_clients.py` используется `indie.id` (IndieMaster.id), что логически верно. Если masters.id ≠ indie_masters.id для одного пользователя, endpoint `/api/master/restrictions` в master.py может работать некорректно; `master_clients` restrictions используют indie.id.
docs/CLIENTS_MODULE_AUDIT_REPORT.md:271:    crit,  # master_id или indie_master_id
docs/CLIENTS_MODULE_AUDIT_REPORT.md:287:- `(Booking.master_id == master.id) OR (Booking.indie_master_id == indie.id)` (для того же мастера);
docs/CLIENTS_MODULE_AUDIT_REPORT.md:309:**Примечание:** `get_detailed_bookings` и `past-appointments` фильтруют только по `Booking.master_id == master.id` (без indie_master_id). `get_future_bookings` и dashboard `next_bookings` используют `or_(master_id, indie_master_id)`. При работе мастера через IndieMaster часть броней может не попадать в detailed/past.
docs/CLIENTS_MODULE_AUDIT_REPORT.md:505:24. **Чужой мастер:** metadata и restrictions привязаны к master_id/indie_master_id; при запросах под другим мастером — свои данные, чужие недоступны.
docs/RESEED_MASTER_CANON_FIX_REPORT.md:3:## Root cause (ensure_indie_master 500)
docs/RESEED_MASTER_CANON_FIX_REPORT.md:5:**500 на POST /api/dev/testdata/ensure_indie_master** возникал из‑за того, что при создании `IndieMaster` не задавался `master_id`. После MASTER_CANON Stage 1 поле `indie_masters.master_id` стало NOT NULL и UNIQUE, поэтому INSERT падал с нарушением constraint.
docs/RESEED_MASTER_CANON_FIX_REPORT.md:17:| `backend/routers/dev_testdata.py` | `ensure_indie_master`: поиск по `master_id`/`user_id`, при создании задаётся `master_id=master.id`, в ответ добавлен `master_id` |
docs/RESEED_MASTER_CANON_FIX_REPORT.md:22:- **POST /api/dev/testdata/ensure_indie_master** — исправлен, возвращает `master_id` и `indie_master_id`
docs/RESEED_MASTER_CANON_FIX_REPORT.md:50:SELECT 'bookings both_null' as check_name, COUNT(*) as cnt FROM bookings WHERE master_id IS NULL AND indie_master_id IS NULL
docs/RESEED_MASTER_CANON_FIX_REPORT.md:54:SELECT 'client_favorites indie_master', COUNT(*) FROM client_favorites WHERE favorite_type='indie_master'
docs/RESEED_MASTER_CANON_FIX_REPORT.md:56:SELECT 'indie_masters master_id NULL', COUNT(*) FROM indie_masters WHERE master_id IS NULL;
docs/RESEED_MASTER_CANON_FIX_REPORT.md:60:### 5. curl-проверка ensure_indie_master
docs/RESEED_MASTER_CANON_FIX_REPORT.md:68:# ensure_indie_master (требует master_id)
docs/RESEED_MASTER_CANON_FIX_REPORT.md:69:curl -s -X POST "http://localhost:8000/api/dev/testdata/ensure_indie_master" \
docs/RESEED_MASTER_CANON_FIX_REPORT.md:73:# Ожидается: {"success":true,"indie_master_id":N,"master_id":1,"created":true|false}
docs/RESEED_MASTER_CANON_FIX_REPORT.md:82:3. **client_favorites** favorite_type='indie_master' = 0
docs/RESEED_MASTER_CANON_FIX_REPORT.md:83:4. **indie_masters** master_id NULL = 0, UNIQUE(master_id) violations = 0
docs/RESEED_MASTER_CANON_FIX_REPORT.md:100:**Ожидаемый результат:** `length` > 0 (например 4), sample ids: [105, 106, 107, 108]. Все записи с `status: "completed"`, `master_id` задан, `indie_master_id: null`.
```

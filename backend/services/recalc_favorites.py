import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from database import SessionLocal
from models import User, Booking, Salon, Master, IndieMaster, ClientFavorites

def recalc_favorites():
    db: Session = SessionLocal()
    try:
        # Только бронирования за последний год
        one_year_ago = datetime.utcnow() - timedelta(days=365)
        clients = db.query(User).filter(User.role == 'client').all()
        for client in clients:
            bookings = db.query(Booking).filter(
                Booking.client_id == client.id,
                Booking.start_time >= one_year_ago
            ).all()
            
            # Словарь для подсчёта баллов и отслеживания последнего использования
            combinations = defaultdict(lambda: {'score': 0, 'last_used': None})
            
            for b in bookings:
                if not b.service:
                    continue
                    
                service_id = b.service.id
                service_name = b.service.name
                
                # Салон + услуга
                if b.salon:
                    key = f'salon_service_{b.salon.id}_{service_id}'
                    combinations[key]['score'] += 1
                    if not combinations[key]['last_used'] or b.start_time > combinations[key]['last_used']:
                        combinations[key]['last_used'] = b.start_time
                    combinations[key].update({
                        'type': 'salon_service',
                        'salon_id': b.salon.id,
                        'salon_name': b.salon.name,
                        'service_id': service_id,
                        'service_name': service_name
                    })
                
                # Салон + мастер + услуга
                if b.salon and b.master and b.master.user:
                    key = f'salon_master_service_{b.salon.id}_{b.master.id}_{service_id}'
                    combinations[key]['score'] += 1
                    if not combinations[key]['last_used'] or b.start_time > combinations[key]['last_used']:
                        combinations[key]['last_used'] = b.start_time
                    combinations[key].update({
                        'type': 'salon_master_service',
                        'salon_id': b.salon.id,
                        'salon_name': b.salon.name,
                        'master_id': b.master.id,
                        'master_name': b.master.user.full_name,
                        'service_id': service_id,
                        'service_name': service_name
                    })
                
                # Индивидуальный мастер + услуга
                if b.indie_master and b.indie_master.user:
                    key = f'indie_service_{b.indie_master.id}_{service_id}'
                    combinations[key]['score'] += 1
                    if not combinations[key]['last_used'] or b.start_time > combinations[key]['last_used']:
                        combinations[key]['last_used'] = b.start_time
                    combinations[key].update({
                        'type': 'indie_service',
                        'indie_master_id': b.indie_master.id,
                        'indie_master_name': b.indie_master.user.full_name,
                        'service_id': service_id,
                        'service_name': service_name
                    })
            
            # Сортируем по баллам (по убыванию), при равенстве - по дате последнего использования (по убыванию)
            sorted_combinations = sorted(
                combinations.values(),
                key=lambda x: (x['score'], x['last_used']),
                reverse=True
            )
            
            # Берём топ-6
            top = sorted_combinations[:6]
            
            # Сохраняем
            fav = db.query(ClientFavorites).filter(ClientFavorites.client_id == client.id).first()
            if fav:
                fav.favorites = top
                fav.updated_at = datetime.utcnow()
            else:
                fav = ClientFavorites(client_id=client.id, favorites=top, updated_at=datetime.utcnow())
                db.add(fav)
        db.commit()
        print(f"Favorites recalculated for {len(clients)} clients.")
    finally:
        db.close()

if __name__ == "__main__":
    recalc_favorites() 
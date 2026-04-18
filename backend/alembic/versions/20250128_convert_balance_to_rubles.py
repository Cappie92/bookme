"""convert_balance_to_rubles

Revision ID: convert_balance_to_rubles
Revises: add_payments_table
Create Date: 2025-01-28 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision: str = 'convert_balance_to_rubles'
down_revision: Union[str, None] = 'add_payments_table'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    
    # Проверяем, нужно ли конвертировать балансы
    # Если колонки уже Float, значит конвертация уже была выполнена
    
    # 1. Конвертируем UserBalance.balance (копейки -> рубли)
    try:
        user_balance_columns = {col['name']: col for col in inspector.get_columns('user_balances')}
        if 'balance' in user_balance_columns:
            balance_type = str(user_balance_columns['balance']['type'])
            if 'INTEGER' in balance_type or 'Integer' in balance_type:
                print("Конвертируем UserBalance.balance (копейки -> рубли)...")
                # Создаем временную колонку
                op.add_column('user_balances', sa.Column('balance_temp', sa.Float(), nullable=True))
                # Конвертируем данные
                conn.execute(text("""
                    UPDATE user_balances 
                    SET balance_temp = CAST(balance AS REAL) / 100.0
                """))
                # Удаляем старую колонку
                op.drop_column('user_balances', 'balance')
                # Переименовываем временную колонку
                conn.execute(text("ALTER TABLE user_balances RENAME COLUMN balance_temp TO balance"))
                # Устанавливаем значения по умолчанию
                conn.execute(text("UPDATE user_balances SET balance = 0.0 WHERE balance IS NULL"))
                print("✅ UserBalance.balance сконвертирован")
            else:
                print("✅ UserBalance.balance уже в рублях")
    except Exception as e:
        print(f"⚠️ Ошибка при проверке UserBalance: {e}")
    
    # 2. Конвертируем BalanceTransaction (копейки -> рубли)
    try:
        balance_transaction_columns = {col['name']: col for col in inspector.get_columns('balance_transactions')}
        
        if 'amount' in balance_transaction_columns:
            amount_type = str(balance_transaction_columns['amount']['type'])
            if 'INTEGER' in amount_type or 'Integer' in amount_type:
                print("Конвертируем BalanceTransaction.amount...")
                op.add_column('balance_transactions', sa.Column('amount_temp', sa.Float(), nullable=True))
                conn.execute(text("UPDATE balance_transactions SET amount_temp = CAST(amount AS REAL) / 100.0"))
                op.drop_column('balance_transactions', 'amount')
                conn.execute(text("ALTER TABLE balance_transactions RENAME COLUMN amount_temp TO amount"))
                conn.execute(text("UPDATE balance_transactions SET amount = 0.0 WHERE amount IS NULL"))
                print("✅ BalanceTransaction.amount сконвертирован")
            else:
                print("✅ BalanceTransaction.amount уже в рублях")
        
        if 'balance_before' in balance_transaction_columns:
            balance_before_type = str(balance_transaction_columns['balance_before']['type'])
            if 'INTEGER' in balance_before_type or 'Integer' in balance_before_type:
                print("Конвертируем BalanceTransaction.balance_before...")
                op.add_column('balance_transactions', sa.Column('balance_before_temp', sa.Float(), nullable=True))
                conn.execute(text("UPDATE balance_transactions SET balance_before_temp = CAST(balance_before AS REAL) / 100.0"))
                op.drop_column('balance_transactions', 'balance_before')
                conn.execute(text("ALTER TABLE balance_transactions RENAME COLUMN balance_before_temp TO balance_before"))
                conn.execute(text("UPDATE balance_transactions SET balance_before = 0.0 WHERE balance_before IS NULL"))
                print("✅ BalanceTransaction.balance_before сконвертирован")
            else:
                print("✅ BalanceTransaction.balance_before уже в рублях")
        
        if 'balance_after' in balance_transaction_columns:
            balance_after_type = str(balance_transaction_columns['balance_after']['type'])
            if 'INTEGER' in balance_after_type or 'Integer' in balance_after_type:
                print("Конвертируем BalanceTransaction.balance_after...")
                op.add_column('balance_transactions', sa.Column('balance_after_temp', sa.Float(), nullable=True))
                conn.execute(text("UPDATE balance_transactions SET balance_after_temp = CAST(balance_after AS REAL) / 100.0"))
                op.drop_column('balance_transactions', 'balance_after')
                conn.execute(text("ALTER TABLE balance_transactions RENAME COLUMN balance_after_temp TO balance_after"))
                conn.execute(text("UPDATE balance_transactions SET balance_after = 0.0 WHERE balance_after IS NULL"))
                print("✅ BalanceTransaction.balance_after сконвертирован")
            else:
                print("✅ BalanceTransaction.balance_after уже в рублях")
    except Exception as e:
        print(f"⚠️ Ошибка при проверке BalanceTransaction: {e}")
    
    # 3. Конвертируем SubscriptionReservation (копейки -> рубли)
    try:
        reservation_columns = {col['name']: col for col in inspector.get_columns('subscription_reservations')}
        
        if 'reserved_kopecks' in reservation_columns and 'reserved_amount' not in reservation_columns:
            print("Конвертируем SubscriptionReservation (reserved_kopecks -> reserved_amount)...")
            op.add_column('subscription_reservations', sa.Column('reserved_amount', sa.Float(), nullable=True))
            conn.execute(text("UPDATE subscription_reservations SET reserved_amount = CAST(reserved_kopecks AS REAL) / 100.0"))
            op.drop_column('subscription_reservations', 'reserved_kopecks')
            conn.execute(text("UPDATE subscription_reservations SET reserved_amount = 0.0 WHERE reserved_amount IS NULL"))
            print("✅ SubscriptionReservation сконвертирован")
        elif 'reserved_amount' in reservation_columns:
            print("✅ SubscriptionReservation.reserved_amount уже существует")
    except Exception as e:
        print(f"⚠️ Ошибка при проверке SubscriptionReservation: {e}")
    
    print("✅ Конвертация балансов завершена!")


def downgrade() -> None:
    conn = op.get_bind()
    
    # Обратная конвертация (рубли -> копейки)
    # UserBalance
    try:
        op.add_column('user_balances', sa.Column('balance_old', sa.Integer(), nullable=True))
        conn.execute(text("UPDATE user_balances SET balance_old = CAST(balance * 100 AS INTEGER)"))
        op.drop_column('user_balances', 'balance')
        conn.execute(text("ALTER TABLE user_balances RENAME COLUMN balance_old TO balance"))
    except Exception as e:
        print(f"Ошибка при откате UserBalance: {e}")
    
    # BalanceTransaction
    try:
        op.add_column('balance_transactions', sa.Column('amount_old', sa.Integer(), nullable=True))
        conn.execute(text("UPDATE balance_transactions SET amount_old = CAST(amount * 100 AS INTEGER)"))
        op.drop_column('balance_transactions', 'amount')
        conn.execute(text("ALTER TABLE balance_transactions RENAME COLUMN amount_old TO amount"))
        
        op.add_column('balance_transactions', sa.Column('balance_before_old', sa.Integer(), nullable=True))
        conn.execute(text("UPDATE balance_transactions SET balance_before_old = CAST(balance_before * 100 AS INTEGER)"))
        op.drop_column('balance_transactions', 'balance_before')
        conn.execute(text("ALTER TABLE balance_transactions RENAME COLUMN balance_before_old TO balance_before"))
        
        op.add_column('balance_transactions', sa.Column('balance_after_old', sa.Integer(), nullable=True))
        conn.execute(text("UPDATE balance_transactions SET balance_after_old = CAST(balance_after * 100 AS INTEGER)"))
        op.drop_column('balance_transactions', 'balance_after')
        conn.execute(text("ALTER TABLE balance_transactions RENAME COLUMN balance_after_old TO balance_after"))
    except Exception as e:
        print(f"Ошибка при откате BalanceTransaction: {e}")
    
    # SubscriptionReservation
    try:
        op.add_column('subscription_reservations', sa.Column('reserved_kopecks', sa.Integer(), nullable=True))
        conn.execute(text("UPDATE subscription_reservations SET reserved_kopecks = CAST(reserved_amount * 100 AS INTEGER)"))
        op.drop_column('subscription_reservations', 'reserved_amount')
        conn.execute(text("ALTER TABLE subscription_reservations RENAME COLUMN reserved_kopecks TO reserved_kopecks"))
    except Exception as e:
        print(f"Ошибка при откате SubscriptionReservation: {e}")

#!/usr/bin/env python3
import sqlite3

# Подключаемся к базе данных
conn = sqlite3.connect('../bookme.db')
cursor = conn.cursor()

# Проверяем пользователей
cursor.execute('SELECT id, email, phone, role FROM users')
users = cursor.fetchall()
print(f'Всего пользователей: {len(users)}')
print('Пользователи:')
for user in users:
    print(f'ID: {user[0]}, Email: {user[1]}, Phone: {user[2]}, Role: {user[3]}')

# Проверяем мастеров
cursor.execute('SELECT id, user_id FROM masters')
masters = cursor.fetchall()
print(f'\nВсего мастеров: {len(masters)}')
for master in masters:
    print(f'Master ID: {master[0]}, User ID: {master[1]}')

# Проверяем салоны
cursor.execute('SELECT id, name FROM salons')
salons = cursor.fetchall()
print(f'\nВсего салонов: {len(salons)}')
for salon in salons:
    print(f'Salon ID: {salon[0]}, Name: {salon[1]}')

conn.close()

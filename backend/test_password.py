import bcrypt

# Хеш из базы данных
hashed_password = "$2b$12$dxPoquszZfUTukgO8A7VA.nzr1n5E0RclTD8Hhl0F0PCSu/U1rvjK"

# Попробуем разные пароли
test_passwords = ["123456", "password", "password123", "admin", "test", "qwerty", "123123", "111111", "000000", "salon", "master"]

for password in test_passwords:
    if bcrypt.checkpw(password.encode('utf-8'), hashed_password.encode('utf-8')):
        print(f"Пароль найден: {password}")
        break
else:
    print("Пароль не найден среди тестовых вариантов") 
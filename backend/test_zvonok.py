#!/usr/bin/env python3
"""
Тест интеграции с Zvonok API
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from services.zvonok_service import zvonok_service

def test_zvonok_service():
    """Тестирует основные функции Zvonok сервиса"""
    
    print("🔧 Тестирование Zvonok сервиса...")
    
    # Тест генерации кода
    print("\n1. Тест генерации кода верификации:")
    code = zvonok_service.generate_verification_code()
    print(f"   Сгенерированный код: {code}")
    print(f"   Длина кода: {len(code)}")
    
    # Тест очистки номера телефона
    print("\n2. Тест очистки номера телефона:")
    test_phones = [
        "+79123456789",
        "89123456789", 
        "79123456789",
        "+7 (912) 345-67-89",
        "8 (912) 345-67-89"
    ]
    
    for phone in test_phones:
        cleaned = zvonok_service._clean_phone_number(phone)
        print(f"   {phone} -> {cleaned}")
    
    # Тест создания кампании (только если API доступен)
    print("\n3. Тест создания кампании:")
    try:
        campaign_id = zvonok_service.create_campaign("Test Campaign")
        if campaign_id:
            print(f"   ✅ Кампания создана с ID: {campaign_id}")
        else:
            print("   ❌ Не удалось создать кампанию")
    except Exception as e:
        print(f"   ⚠️  Ошибка создания кампании: {e}")
    
    # Тест отправки звонка (только если API доступен)
    print("\n4. Тест отправки звонка:")
    test_phone = "+79123456789"
    
    try:
        result = zvonok_service.send_verification_call(test_phone)
        if result["success"]:
            print(f"   ✅ Звонок отправлен: {result}")
            call_id = result.get("call_id")
            
            # Тест проверки введенных цифр
            print("\n5. Тест проверки введенных цифр:")
            test_digits = "1234"
            verify_result = zvonok_service.verify_phone_digits(call_id, test_digits)
            if verify_result["success"]:
                print(f"   ✅ Цифры проверены: {verify_result}")
            else:
                print(f"   ❌ Ошибка проверки цифр: {verify_result}")
        else:
            print(f"   ❌ Ошибка отправки звонка: {result}")
    except Exception as e:
        print(f"   ⚠️  Ошибка отправки звонка: {e}")
    
    print("\n✅ Тестирование завершено!")

if __name__ == "__main__":
    test_zvonok_service()

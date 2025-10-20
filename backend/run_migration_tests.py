#!/usr/bin/env python3
"""
Главный тестовый скрипт для проверки миграции
Запускает все тесты и выдает итоговый отчет
"""

import sys
import os
import subprocess
from datetime import datetime

def run_migration_tests():
    """Запуск всех тестов миграции"""
    
    print("🚀 Запуск тестов миграции унифицированной структуры мастеров")
    print("=" * 60)
    print(f"📅 Время запуска: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)
    
    tests = [
        {
            'name': 'Проверка целостности данных',
            'script': 'test_migration_integrity.py',
            'description': 'Проверяет, что все данные корректно мигрированы в новую структуру'
        },
        {
            'name': 'Проверка функциональности',
            'script': 'test_migration_functionality.py',
            'description': 'Проверяет основные функции системы с новой структурой'
        },
        {
            'name': 'Сравнение данных',
            'script': 'test_migration_comparison.py',
            'description': 'Сравнивает данные до и после миграции'
        }
    ]
    
    results = []
    
    for i, test in enumerate(tests, 1):
        print(f"\n🧪 Тест {i}/{len(tests)}: {test['name']}")
        print(f"📝 Описание: {test['description']}")
        print("-" * 40)
        
        try:
            # Запускаем тест
            result = subprocess.run(
                [sys.executable, test['script']],
                capture_output=True,
                text=True,
                cwd=os.path.dirname(os.path.abspath(__file__))
            )
            
            # Выводим результат
            if result.stdout:
                print(result.stdout)
            
            if result.stderr:
                print("❌ Ошибки:")
                print(result.stderr)
            
            # Сохраняем результат
            success = result.returncode == 0
            results.append({
                'name': test['name'],
                'success': success,
                'returncode': result.returncode
            })
            
            if success:
                print(f"✅ Тест '{test['name']}' пройден успешно")
            else:
                print(f"❌ Тест '{test['name']}' провален (код: {result.returncode})")
                
        except Exception as e:
            print(f"❌ Ошибка при запуске теста '{test['name']}': {e}")
            results.append({
                'name': test['name'],
                'success': False,
                'returncode': -1
            })
    
    # Итоговый отчет
    print("\n" + "=" * 60)
    print("📊 ИТОГОВЫЙ ОТЧЕТ")
    print("=" * 60)
    
    passed_tests = sum(1 for r in results if r['success'])
    failed_tests = len(results) - passed_tests
    
    print(f"📈 Всего тестов: {len(results)}")
    print(f"✅ Пройдено: {passed_tests}")
    print(f"❌ Провалено: {failed_tests}")
    print(f"📊 Процент успеха: {(passed_tests / len(results)) * 100:.1f}%")
    
    print("\n📋 Детальные результаты:")
    for result in results:
        status = "✅ ПРОЙДЕН" if result['success'] else "❌ ПРОВАЛЕН"
        print(f"   {result['name']}: {status}")
    
    if failed_tests == 0:
        print("\n🎉 ВСЕ ТЕСТЫ ПРОЙДЕНЫ УСПЕШНО!")
        print("✅ Миграция выполнена корректно")
        print("✅ Система готова к работе")
        print("✅ Можно переходить к очистке старых данных")
        return True
    else:
        print(f"\n⚠️  ОБНАРУЖЕНЫ ПРОБЛЕМЫ В {failed_tests} ТЕСТАХ!")
        print("❌ Требуется дополнительная проверка")
        print("❌ НЕ РЕКОМЕНДУЕТСЯ переходить к очистке старых данных")
        print("❌ Рекомендуется исправить проблемы перед продолжением")
        return False

def main():
    """Главная функция"""
    try:
        success = run_migration_tests()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\n⚠️  Тестирование прервано пользователем")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n❌ Критическая ошибка: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()


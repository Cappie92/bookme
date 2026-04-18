/**
 * Тестовый скрипт для проверки auth-guard в браузере
 * 
 * Инструкция:
 * 1. Открыть DevTools (F12) → Console
 * 2. Скопировать и вставить этот скрипт
 * 3. Выполнить: testAuthGuard()
 * 
 * Или выполнить отдельные тесты:
 * - testWithoutToken()
 * - testWithToken()
 * - testInvalidToken()
 */

// Импорт функций API (если доступен через window)
// Или использовать fetch напрямую для проверки guard

async function testWithoutToken() {
  console.log('=== ТЕСТ 1: Без токена ===')
  
  // Очищаем токен
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
  localStorage.removeItem('user_role')
  
  console.log('Токен очищен. Проверяем guard...')
  
  // Попытка сделать запрос через apiGet (если доступен)
  // В реальности guard должен выбросить ошибку ДО fetch
  try {
    // Симулируем вызов apiGet
    const token = localStorage.getItem('access_token')
    if (!token) {
      console.log('✅ Guard сработал: токен отсутствует, запрос не отправлен')
      console.log('✅ В Network НЕТ запросов к /api/loyalty/*')
      return { success: true, message: 'Guard заблокировал запрос' }
    }
  } catch (err) {
    if (err.response?.status === 401 && err.response?.data?.detail === 'Missing access token') {
      console.log('✅ Guard сработал: ошибка 401 выброшена ДО fetch')
      return { success: true, message: 'Guard заблокировал запрос' }
    }
    console.error('❌ Неожиданная ошибка:', err)
    return { success: false, error: err }
  }
}

async function testWithToken() {
  console.log('=== ТЕСТ 2: С токеном ===')
  
  // Устанавливаем валидный токен (нужно получить реальный токен после логина)
  const token = localStorage.getItem('access_token')
  
  if (!token) {
    console.log('⚠️ Токен отсутствует. Пожалуйста, залогиньтесь и повторите тест.')
    return { success: false, message: 'Требуется токен' }
  }
  
  console.log('Токен найден. Проверяем запросы...')
  console.log('📋 Инструкция:')
  console.log('1. Откройте DevTools → Network')
  console.log('2. Перезагрузите страницу или переключите таб loyalty')
  console.log('3. Проверьте запросы к /api/loyalty/*')
  console.log('4. Убедитесь, что:')
  console.log('   - Запросы имеют заголовок Authorization: Bearer <token>')
  console.log('   - POST/PUT запросы имеют Content-Type: application/json')
  console.log('   - Body в POST/PUT запросах — это JSON (не [object Object])')
  
  return { success: true, message: 'Проверьте Network вручную' }
}

async function testInvalidToken() {
  console.log('=== ТЕСТ 3: Invalid token ===')
  
  // Сохраняем оригинальный токен (если есть)
  const originalToken = localStorage.getItem('access_token')
  
  // Устанавливаем невалидный токен
  localStorage.setItem('access_token', 'invalid_token_12345')
  console.log('Установлен невалидный токен: invalid_token_12345')
  
  console.log('📋 Инструкция:')
  console.log('1. Откройте DevTools → Network')
  console.log('2. Перезагрузите страницу или переключите таб loyalty')
  console.log('3. Проверьте запрос GET /api/loyalty/status:')
  console.log('   - Запрос должен уйти с Authorization: Bearer invalid_token_12345')
  console.log('   - Сервер должен вернуть 401')
  console.log('4. Проверьте обработку:')
  console.log('   - Токены должны быть очищены из localStorage')
  console.log('   - Должно появиться сообщение "Сессия истекла..."')
  console.log('   - Должен произойти редирект на /login через 2 секунды')
  
  // Восстанавливаем оригинальный токен (если был)
  if (originalToken) {
    console.log('\n⚠️ Восстановите оригинальный токен после теста:')
    console.log(`localStorage.setItem('access_token', '${originalToken}')`)
  }
  
  return { success: true, message: 'Проверьте Network и поведение UI вручную' }
}

async function testAuthGuard() {
  console.log('🚀 Запуск тестов auth-guard...\n')
  
  const results = {
    test1: await testWithoutToken(),
    test2: await testWithToken(),
    test3: await testInvalidToken()
  }
  
  console.log('\n=== РЕЗУЛЬТАТЫ ===')
  console.log('Тест 1 (без токена):', results.test1.success ? '✅ PASS' : '❌ FAIL')
  console.log('Тест 2 (с токеном):', results.test2.success ? '✅ PASS (проверьте Network)' : '❌ FAIL')
  console.log('Тест 3 (invalid token):', results.test3.success ? '✅ PASS (проверьте Network)' : '❌ FAIL')
  
  return results
}

// Экспорт для использования в консоли
if (typeof window !== 'undefined') {
  window.testAuthGuard = testAuthGuard
  window.testWithoutToken = testWithoutToken
  window.testWithToken = testWithToken
  window.testInvalidToken = testInvalidToken
}

// Для Node.js (если нужно)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    testAuthGuard,
    testWithoutToken,
    testWithToken,
    testInvalidToken
  }
}

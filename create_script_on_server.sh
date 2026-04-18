#!/bin/bash
# Эта команда создаст скрипт fix_missing_files_on_server.sh прямо на сервере
# Выполните её на сервере через SSH

cat > /home/root/dedato/fix_missing_files_on_server.sh << 'SCRIPT_EOF'
#!/bin/bash

# Скрипт для создания всех недостающих файлов на сервере
# Выполнять на сервере в директории /home/root/dedato

set -e

echo "🔍 Проверяю и создаю недостающие файлы..."

cd /home/root/dedato

# Создаем директорию hooks если её нет
mkdir -p frontend/src/hooks

# 1. Создаем useMasterSubscription.js
if [ ! -f "frontend/src/hooks/useMasterSubscription.js" ]; then
    echo "📝 Создаю useMasterSubscription.js..."
    cat > frontend/src/hooks/useMasterSubscription.js << 'HOOK_EOF'
import { useState, useEffect } from 'react'
import { API_BASE_URL } from '../utils/config'

export function useMasterSubscription() {
  const [features, setFeatures] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadFeatures()
  }, [])

  const loadFeatures = async () => {
    try {
      setLoading(true)
      setError(null)
      const token = localStorage.getItem('access_token')
      
      const response = await fetch(`${API_BASE_URL}/api/master/subscription/features`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setFeatures(data)
      } else {
        setError('Не удалось загрузить информацию о подписке')
      }
    } catch (err) {
      console.error('Ошибка при загрузке функций подписки:', err)
      setError('Ошибка сети')
    } finally {
      setLoading(false)
    }
  }

  return {
    features,
    loading,
    error,
    refresh: loadFeatures,
    canCustomizeDomain: features?.can_customize_domain || false,
    canAddPageModules: features?.can_add_page_modules || false,
    hasFinanceAccess: features?.has_finance_access || false,
    hasExtendedStats: features?.has_extended_stats || false,
    hasClientRestrictions: features?.has_client_restrictions || false,
    maxPageModules: features?.max_page_modules || 0,
    currentPageModules: features?.current_page_modules || 0,
    canAddMoreModules: features?.can_add_more_modules || false,
    planName: features?.plan_name || null
  }
}
HOOK_EOF
    echo "✅ useMasterSubscription.js создан"
else
    echo "✓ useMasterSubscription.js уже существует"
fi

# 2. Создаем MasterLoyalty.jsx (обертка для LoyaltySystem)
if [ ! -f "frontend/src/components/MasterLoyalty.jsx" ]; then
    echo "📝 Создаю MasterLoyalty.jsx..."
    cat > frontend/src/components/MasterLoyalty.jsx << 'LOYALTY_EOF'
import React from 'react'
import LoyaltySystem from './LoyaltySystem'

export default function MasterLoyalty({ getAuthHeaders }) {
  return <LoyaltySystem getAuthHeaders={getAuthHeaders} />
}
LOYALTY_EOF
    echo "✅ MasterLoyalty.jsx создан"
else
    echo "✓ MasterLoyalty.jsx уже существует"
fi

# 3. Создаем Tooltip.jsx
if [ ! -f "frontend/src/components/Tooltip.jsx" ]; then
    echo "📝 Создаю Tooltip.jsx..."
    cat > frontend/src/components/Tooltip.jsx << 'TOOLTIP_EOF'
import { useState } from 'react'

export default function Tooltip({ children, text, content, position = 'top' }) {
  const [isVisible, setIsVisible] = useState(false)

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2'
  }

  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-gray-800 border-l-transparent border-r-transparent border-b-transparent',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-gray-800 border-l-transparent border-r-transparent border-t-transparent',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-gray-800 border-t-transparent border-b-transparent border-r-transparent',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-gray-800 border-t-transparent border-b-transparent border-l-transparent'
  }

  // Если передан content (JSX), используем его, иначе используем text
  const tooltipContent = content || text

  return (
    <div
      className="relative inline-block w-full"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && tooltipContent && (
        <div
          className={`absolute z-50 ${positionClasses[position]} pointer-events-none`}
        >
          <div className={`bg-gray-800 text-white text-xs rounded py-1.5 px-2.5 shadow-lg ${content ? 'whitespace-normal max-w-xs' : 'whitespace-nowrap'}`}>
            {tooltipContent}
            <div
              className={`absolute w-0 h-0 border-4 ${arrowClasses[position]}`}
            />
          </div>
        </div>
      )}
    </div>
  )
}
TOOLTIP_EOF
    echo "✅ Tooltip.jsx создан"
else
    echo "✓ Tooltip.jsx уже существует"
fi

# 4. Создаем MasterLoyaltyStats.jsx (если используется)
if [ ! -f "frontend/src/components/MasterLoyaltyStats.jsx" ]; then
    echo "📝 Создаю MasterLoyaltyStats.jsx..."
    cat > frontend/src/components/MasterLoyaltyStats.jsx << 'STATS_EOF'
import React from 'react'

export default function MasterLoyaltyStats() {
  return (
    <div className="p-4">
      <p>Статистика системы лояльности</p>
    </div>
  )
}
STATS_EOF
    echo "✅ MasterLoyaltyStats.jsx создан"
else
    echo "✓ MasterLoyaltyStats.jsx уже существует"
fi

# 5. Создаем MasterLoyaltyHistory.jsx (если используется)
if [ ! -f "frontend/src/components/MasterLoyaltyHistory.jsx" ]; then
    echo "📝 Создаю MasterLoyaltyHistory.jsx..."
    cat > frontend/src/components/MasterLoyaltyHistory.jsx << 'HISTORY_EOF'
import React from 'react'

export default function MasterLoyaltyHistory() {
  return (
    <div className="p-4">
      <p>История системы лояльности</p>
    </div>
  )
}
HISTORY_EOF
    echo "✅ MasterLoyaltyHistory.jsx создан"
else
    echo "✓ MasterLoyaltyHistory.jsx уже существует"
fi

# 6. Проверяем и исправляем импорт MasterLoyalty в MasterDashboard.jsx
if grep -q "import MasterLoyalty from '../components/LoyaltySystem'" frontend/src/pages/MasterDashboard.jsx; then
    echo "📝 Исправляю импорт MasterLoyalty в MasterDashboard.jsx..."
    sed -i "s|import MasterLoyalty from '../components/LoyaltySystem'|import MasterLoyalty from '../components/MasterLoyalty'|g" frontend/src/pages/MasterDashboard.jsx
    echo "✅ Импорт исправлен"
fi

# Проверяем, что MasterLoyalty получает getAuthHeaders
# Ищем использование MasterLoyalty и проверяем, передается ли getAuthHeaders
if grep -q "<MasterLoyalty" frontend/src/pages/MasterDashboard.jsx; then
    if ! grep -q "getAuthHeaders" frontend/src/pages/MasterDashboard.jsx || grep -q "<MasterLoyalty />" frontend/src/pages/MasterDashboard.jsx; then
        echo "📝 Добавляю getAuthHeaders для MasterLoyalty в MasterDashboard.jsx..."
        # Создаем функцию getAuthHeaders если её нет, и передаем её в MasterLoyalty
        if ! grep -q "const getAuthHeaders" frontend/src/pages/MasterDashboard.jsx && ! grep -q "function getAuthHeaders" frontend/src/pages/MasterDashboard.jsx; then
            # Добавляем функцию getAuthHeaders перед использованием MasterLoyalty
            sed -i '/<MasterLoyalty/i\
  const getAuthHeaders = () => ({\
    '\''Authorization'\'': `Bearer ${localStorage.getItem('\''access_token'\'')}`,\
    '\''Content-Type'\'': '\''application/json'\''\
  })
' frontend/src/pages/MasterDashboard.jsx
        fi
        # Заменяем <MasterLoyalty /> на <MasterLoyalty getAuthHeaders={getAuthHeaders} />
        sed -i 's|<MasterLoyalty />|<MasterLoyalty getAuthHeaders={getAuthHeaders} />|g' frontend/src/pages/MasterDashboard.jsx
        # Также заменяем, если уже есть какой-то другой вариант
        sed -i 's|<MasterLoyalty getAuthHeaders={() => ({.*})} />|<MasterLoyalty getAuthHeaders={getAuthHeaders} />|g' frontend/src/pages/MasterDashboard.jsx
        echo "✅ getAuthHeaders добавлен"
    else
        echo "✓ getAuthHeaders уже передается в MasterLoyalty"
    fi
fi

echo ""
echo "✅ Все недостающие файлы созданы!"
echo ""
echo "📋 Список созданных файлов:"
ls -la frontend/src/hooks/useMasterSubscription.js 2>/dev/null && echo "  ✓ useMasterSubscription.js"
ls -la frontend/src/components/MasterLoyalty.jsx 2>/dev/null && echo "  ✓ MasterLoyalty.jsx"
ls -la frontend/src/components/Tooltip.jsx 2>/dev/null && echo "  ✓ Tooltip.jsx"
ls -la frontend/src/components/MasterLoyaltyStats.jsx 2>/dev/null && echo "  ✓ MasterLoyaltyStats.jsx"
ls -la frontend/src/components/MasterLoyaltyHistory.jsx 2>/dev/null && echo "  ✓ MasterLoyaltyHistory.jsx"

echo ""
echo "🔄 Теперь можно пересобрать контейнеры:"
echo "   docker-compose -f docker-compose.prod.yml up -d --build"
SCRIPT_EOF

chmod +x /home/root/dedato/fix_missing_files_on_server.sh
echo "✅ Скрипт создан и готов к использованию!"





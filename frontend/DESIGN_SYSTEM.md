# Дизайн-система Appointo

## Обзор

Эта дизайн-система обеспечивает консистентность визуального оформления во всем приложении Appointo. Она включает в себя цветовую палитру, типографику, компоненты и утилиты, основанные на UI kit.

## Логотип

### Компонент Logo
```jsx
import { Logo } from '../components/ui'

// Логотип
<Logo size="md" />

// Различные размеры
<Logo size="sm" />   // Маленький
<Logo size="md" />   // Средний
<Logo size="lg" />   // Большой
<Logo size="xl" />   // Очень большой
<Logo size="full" /> // Полная высота контейнера
```

### Описание логотипа
- **Изображение**: `Logo Dedato.png` - официальный логотип бренда
- **Адаптивность**: Поддерживает различные размеры
- **Полная высота**: Размер `full` для использования на полную высоту контейнера
- **Расположение**: `/public/Logo Dedato.png`

## Цветовая палитра

### Основные цвета (Primary)
- **primary-50**: #DFF5EC - Cool Mint (очень светлый)
- **primary-100**: #DFF5EC - Cool Mint (светлый)
- **primary-200**: #C8E8D8 - Средне-светлый зеленый
- **primary-300**: #B1DBC4 - Средний зеленый
- **primary-400**: #9ACEB0 - Средне-темный зеленый
- **primary-500**: #4CAF50 - Vibrant Green (основной цвет бренда)
- **primary-600**: #45A049 - Темный зеленый
- **primary-700**: #3D8B42 - Очень темный зеленый
- **primary-800**: #35773B - Самый темный зеленый
- **primary-900**: #2D6334 - Почти черный зеленый

### Дополнительные цвета (Secondary)
- **secondary-50**: #F9F7F6 - Светлый нейтральный
- **secondary-100**: #F9F7F6 - Светлый нейтральный
- **secondary-200**: #E7E2DF - Средний нейтральный
- **secondary-300**: #D4CEC9 - Средне-темный нейтральный
- **secondary-400**: #C1BAB3 - Темный нейтральный
- **secondary-500**: #6AA66A - Дополнительный зеленый
- **secondary-600**: #5F955F - Темный дополнительный зеленый
- **secondary-700**: #548454 - Очень темный дополнительный зеленый
- **secondary-800**: #497349 - Самый темный дополнительный зеленый
- **secondary-900**: #3E623E - Почти черный дополнительный зеленый

### Нейтральные цвета
- **neutral-50**: #F9F7F6 - Светлый фон
- **neutral-100**: #F9F7F6 - Светлый фон
- **neutral-200**: #E7E2DF - Средний фон
- **neutral-300**: #D4CEC9 - Средне-темный фон
- **neutral-400**: #A3A3A3 - Средний серый
- **neutral-500**: #737373 - Основной серый
- **neutral-600**: #525252 - Темный серый
- **neutral-700**: #404040 - Очень темный серый
- **neutral-800**: #2D2D2D - Темный нейтральный
- **neutral-900**: #171717 - Черный

### Цвета для статусов

#### Success (Успех)
- **success-500**: #4CAF50 - Vibrant Green (основной зеленый)
- **success-600**: #45A049 - Темный зеленый

#### Warning (Предупреждение)
- **warning-500**: #f59e0b - Основной оранжевый
- **warning-600**: #d97706 - Темный оранжевый

#### Error (Ошибка)
- **error-500**: #ef4444 - Основной красный
- **error-600**: #dc2626 - Темный красный

## Типографика

### Шрифты
- **Основной**: Inter (sans-serif) - с поддержкой кириллицы
- **Моноширинный**: JetBrains Mono (monospace)

### Размеры шрифтов
- **xs**: 0.75rem (12px)
- **sm**: 0.875rem (14px)
- **base**: 1rem (16px)
- **lg**: 1.125rem (18px)
- **xl**: 1.25rem (20px)
- **2xl**: 1.5rem (24px)
- **3xl**: 1.875rem (30px)
- **4xl**: 2.25rem (36px)
- **5xl**: 3rem (48px)
- **6xl**: 3.75rem (60px)

### Начертания
- **light**: 300
- **normal**: 400
- **medium**: 500
- **semibold**: 600
- **bold**: 700
- **extrabold**: 800

## Компоненты

### Кнопки
```jsx
import { Button } from '../components/ui'

// Основные варианты
<Button variant="primary">Primary Button</Button>
<Button variant="secondary">Secondary button</Button>
<Button variant="disabled" disabled>Disabled button</Button>
<Button variant="hover">Hover</Button>

// Размеры
<Button size="sm">Small</Button>
<Button size="md">Medium</Button>
<Button size="lg">Large</Button>
```

### Формы
```jsx
import { Input, Checkbox, Radio } from '../components/ui'

// Текстовое поле
<Input 
  label="Text Input"
  value={value} 
  onChange={handleChange} 
  placeholder="Placeholder" 
/>

// Dropdown
<Input 
  label="Dropdown"
  value="dedato" 
  readOnly 
/>

// Чекбокс
<Checkbox
  checked={checked}
  onChange={handleChange}
  label="Yes"
/>

// Радио-кнопка
<Radio
  name="radio-group"
  value="option1"
  checked={radioValue === 'option1'}
  onChange={handleChange}
  label="Check"
/>
```

### Карточки
```jsx
import { Card, ProfileCard, ServiceCard } from '../components/ui'

// Обычная карточка
<Card>
  <h3>Заголовок</h3>
  <p>Содержимое карточки</p>
</Card>

// Карточка профиля
<ProfileCard
  name="Julia Parker"
  specialty="specialistst"
  rating={4.9}
  reviews={75}
/>

// Карточка услуги
<ServiceCard
  title="Haircut"
  duration="45 min"
  price={50}
  icon={<ScissorsIcon />}
/>
```

### Статусные индикаторы
```jsx
import { StatusIndicator } from '../components/ui'

// Успех
<StatusIndicator
  type="success"
  message="An esromessage"
/>

// Ошибка
<StatusIndicator
  type="error"
  message="An info message"
  optional="optional"
  onClose={handleClose}
/>
```

### Вкладки
```jsx
import { Tabs } from '../components/ui'

const tabs = [
  { label: 'Home / Services', value: 'services' },
  { label: '1', value: 'tab1' },
  { label: '2', value: 'tab2' },
  { label: '>', value: 'next' }
]

<Tabs
  tabs={tabs}
  activeTab={activeTab}
  onTabChange={setActiveTab}
/>
```

### Навигация
```jsx
// Services / Appointments
<div className="flex space-x-2">
  <Button variant="secondary">Services</Button>
  <Button variant="secondary" className="flex items-center space-x-2">
    <span>Appointments</span>
    <ArrowIcon />
  </Button>
</div>

// Breadcrumbs
<p className="text-sm text-neutral-700">Home / Services</p>
```

### Date/Time Picker
```jsx
// Available today
<Input value="Available today" readOnly />

// With checkmark
<div className="relative">
  <Input value="recifers" readOnly />
  <CheckmarkIcon className="absolute right-3 top-1/2 transform -translate-y-1/2" />
</div>

// Error message
<StatusIndicator
  type="error"
  message="An error message"
  optional="optional"
  onClose={handleClose}
/>
```

## Утилиты

### Контейнеры
```css
.container        /* max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 */
.container-sm     /* max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 */
.container-lg     /* max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 */
```

### Секции
```css
.section          /* py-12 lg:py-16 */
.section-sm       /* py-8 lg:py-12 */
.section-lg       /* py-16 lg:py-24 */
```

### Сетки
```css
.grid-auto-fit    /* grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 */
.grid-auto-fill   /* grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 */
```

### Анимации
```css
.animate-fade-in    /* fadeIn 0.5s ease-in-out */
.animate-slide-up   /* slideUp 0.3s ease-out */
.animate-slide-down /* slideDown 0.3s ease-out */
.animate-scale-in   /* scaleIn 0.2s ease-out */
```

### Тени
```css
.shadow-soft       /* Мягкая тень */
.shadow-medium     /* Средняя тень */
.shadow-strong     /* Сильная тень */
```

### Градиенты
```css
.gradient-primary  /* bg-gradient-to-r from-primary-500 to-primary-700 */
.gradient-secondary /* bg-gradient-to-r from-secondary-500 to-secondary-700 */
```

## Использование в проекте

### Импорт компонентов
```jsx
import { 
  Logo,
  Button, 
  Card, 
  Input, 
  Checkbox, 
  Radio, 
  ProfileCard, 
  ServiceCard, 
  StatusIndicator, 
  Tabs 
} from '../components/ui'
```

### Использование цветов
```jsx
// В Tailwind классах
<div className="bg-primary-500 text-white">Зеленый фон</div>
<div className="text-secondary-600">Нейтральный текст</div>
<div className="border-error-300">Красная рамка</div>

// В CSS
.my-class {
  color: var(--color-primary-500);
  background-color: var(--color-secondary-100);
}
```

## Принципы использования

1. **Консистентность**: Всегда используйте определенные цвета и компоненты
2. **Доступность**: Обеспечивайте достаточный контраст (минимум 4.5:1)
3. **Адаптивность**: Используйте responsive классы для разных экранов
4. **Производительность**: Используйте готовые компоненты вместо создания новых
5. **Масштабируемость**: Добавляйте новые варианты только при необходимости

## Расширение системы

При добавлении новых компонентов или стилей:

1. Добавьте их в соответствующий файл в `src/components/ui/`
2. Обновите `src/components/ui/index.js`
3. Добавьте документацию в этот файл
4. Протестируйте на разных экранах и в разных браузерах

## Цветовые схемы

### Светлая тема (по умолчанию)
- Фон: `neutral-50` (#F9F7F6)
- Текст: `neutral-900` (#171717)
- Акценты: `primary-500` (#4CAF50)

### Темная тема (будущее)
- Фон: `neutral-900` (#171717)
- Текст: `neutral-50` (#F9F7F6)
- Акценты: `primary-400` (#9ACEB0) 
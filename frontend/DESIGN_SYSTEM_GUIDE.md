# Краткое руководство по дизайн-системе

## Быстрый старт

### 1. Импорт компонентов
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

### 2. Логотип
```jsx
// Логотип
<Logo size="md" />

// Различные размеры
<Logo size="sm" />   // Маленький
<Logo size="md" />   // Средний
<Logo size="lg" />   // Большой
<Logo size="xl" />   // Очень большой
<Logo size="full" /> // Полная высота контейнера
```

### 3. Использование цветов
```jsx
// Основные цвета
<div className="bg-primary-500 text-white">Vibrant Green фон</div>
<div className="bg-primary-50 text-primary-800">Cool Mint фон</div>

// Цвета статусов
<div className="bg-success-500">Успех</div>
<div className="bg-warning-500">Предупреждение</div>
<div className="bg-error-500">Ошибка</div>

// Нейтральные цвета
<div className="bg-neutral-50">Светлый фон</div>
<div className="text-neutral-900">Темный текст</div>
```

### 4. Кнопки
```jsx
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

### 5. Формы
```jsx
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

### 6. Карточки
```jsx
// Обычная карточка
<Card>
  <h3>Заголовок</h3>
  <p>Содержимое</p>
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

### 7. Статусные индикаторы
```jsx
<StatusIndicator
  type="success"
  message="An esromessage"
/>

<StatusIndicator
  type="error"
  message="An info message"
  optional="optional"
  onClose={handleClose}
/>
```

### 8. Вкладки
```jsx
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

### 9. Навигация
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

### 10. Date/Time Picker
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
.container        /* Центрированный контейнер */
.container-sm     /* Маленький контейнер */
.container-lg     /* Большой контейнер */
```

### Секции
```css
.section          /* Стандартная секция */
.section-sm       /* Маленькая секция */
.section-lg       /* Большая секция */
```

### Сетки
```css
.grid-auto-fit    /* Адаптивная сетка */
.grid-auto-fill   /* Автозаполнение */
```

### Анимации
```css
.animate-fade-in    /* Появление */
.animate-slide-up   /* Слайд вверх */
.animate-slide-down /* Слайд вниз */
.animate-scale-in   /* Масштабирование */
```

### Тени
```css
.shadow-soft       /* Мягкая тень */
.shadow-medium     /* Средняя тень */
.shadow-strong     /* Сильная тень */
```

### Градиенты
```css
.gradient-primary  /* Основной градиент */
.gradient-secondary /* Дополнительный градиент */
```

## Принципы использования

1. **Всегда используйте готовые компоненты** вместо создания новых
2. **Следуйте цветовой палитре** - не изобретайте новые цвета
3. **Используйте правильные размеры** для типографики
4. **Обеспечивайте контраст** для доступности
5. **Тестируйте на разных экранах** для адаптивности

## Демо-страница

Посмотрите все компоненты в действии: `/design-system`

## Документация

Полная документация: `DESIGN_SYSTEM.md`

## Брендовые цвета

### Основные цвета
- **Vibrant Green**: #4CAF50 (primary-500)
- **Cool Mint**: #DFF5EC (primary-50/100)

### Нейтральные цвета
- **Светлый фон**: #F9F7F6 (neutral-50/100)
- **Средний фон**: #E7E2DF (neutral-200)
- **Темный текст**: #2D2D2D (neutral-800)
- **Дополнительный зеленый**: #6AA66A (secondary-500)

### Шрифт
- **Inter** с поддержкой кириллицы

## UI Kit Компоненты

### Логотип
- Официальный логотип `Logo Dedato.png`
- Поддержка различных размеров
- Размер `full` для использования на полную высоту контейнера

### Кнопки
- Primary Button (зеленая)
- Secondary button (белая с рамкой)
- Disabled button (серая)
- Hover (фиолетовая)

### Формы
- Text Input (с placeholder)
- Dropdown (с иконкой стрелки)
- Checkbox (с галочкой)
- Radio Button (с точкой)

### Карточки
- Profile Card (с фото, именем, рейтингом)
- Service Card (с иконкой, названием, ценой)
- Info Card (с иконками и данными)
- Status Card (с статусом записи)

### Статусные индикаторы
- Success (зеленая галочка)
- Error (красная иконка i)

### Вкладки
- Home / Services
- Нумерованные вкладки
- Стрелка навигации 
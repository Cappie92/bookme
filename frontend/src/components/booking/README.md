# Модули записи

Этот модуль содержит универсальные компоненты для создания записей в системе.

## Компоненты

### SalonBookingModule

Универсальный компонент для записи в салон с возможностью выбора мастера.

#### Пропсы

- `salonId` (number, обязательный) - ID салона
- `onBookingSuccess` (function, опциональный) - колбэк при успешной записи
- `onBookingError` (function, опциональный) - колбэк при ошибке записи
- `showUserInfo` (boolean, опциональный) - показывать ли информацию о пользователе (по умолчанию true)
- `title` (string, опциональный) - заголовок формы (по умолчанию "Запись на услугу")
- `className` (string, опциональный) - дополнительные CSS классы

#### Пример использования

```jsx
import { SalonBookingModule } from '../../components/booking'

function SalonPage() {
  const handleBookingSuccess = (result) => {
    console.log('Запись создана:', result)
  }

  const handleBookingError = (error) => {
    console.error('Ошибка:', error)
  }

  return (
    <SalonBookingModule
      salonId={1}
      onBookingSuccess={handleBookingSuccess}
      onBookingError={handleBookingError}
      title="Запись в салон красоты"
    />
  )
}
```

### MasterBookingModule

Универсальный компонент для записи к конкретному мастеру.

#### Пропсы

- `masterId` (number, обязательный) - ID мастера
- `onBookingSuccess` (function, опциональный) - колбэк при успешной записи
- `onBookingError` (function, опциональный) - колбэк при ошибке записи
- `showUserInfo` (boolean, опциональный) - показывать ли информацию о пользователе (по умолчанию true)
- `title` (string, опциональный) - заголовок формы (по умолчанию "Запись к мастеру")
- `className` (string, опциональный) - дополнительные CSS классы

#### Пример использования

```jsx
import { MasterBookingModule } from '../../components/booking'

function MasterPage() {
  const handleBookingSuccess = (result) => {
    console.log('Запись к мастеру создана:', result)
  }

  const handleBookingError = (error) => {
    console.error('Ошибка:', error)
  }

  return (
    <MasterBookingModule
      masterId={1}
      onBookingSuccess={handleBookingSuccess}
      onBookingError={handleBookingError}
      title="Запись к мастеру Анне"
    />
  )
}
```

## Функциональность

Оба компонента включают:

- Выбор услуги из списка доступных
- Выбор даты с календарем доступности
- Выбор времени из доступных слотов
- Валидацию формы
- Обработку авторизованных и неавторизованных пользователей
- Модальное окно для ввода телефона неавторизованным пользователям
- Отображение информации о выбранной услуге
- Поле для дополнительных заметок

## Отличия

- **SalonBookingModule**: включает выбор мастера (или "любой мастер")
- **MasterBookingModule**: запись только к конкретному мастеру

## API Endpoints

Компоненты используют следующие API endpoints:

- `/salon/masters/list?salon_id={id}` - список мастеров салона
- `/salon/services/public?salon_id={id}` - публичные услуги салона
- `/master/services/public?master_id={id}` - услуги мастера
- `/bookings/available-slots/public` - доступные слоты
- `/client/bookings` - создание записи (авторизованный пользователь)
- `/bookings/public` - создание записи (неавторизованный пользователь)
- `/auth/users/me` - информация о текущем пользователе

## Стилизация

Компоненты используют Tailwind CSS и включают:
- Адаптивный дизайн
- Состояния загрузки
- Валидацию полей
- Модальные окна
- Интерактивные элементы (кнопки, селекты)

## Тестовые страницы

- `/test/booking` - тест SalonBookingModule
- `/test/master-booking` - тест MasterBookingModule 
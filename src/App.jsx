import { useState, useEffect } from 'react';
<h1 className="text-6xl text-red-600 font-extrabold">Проверка Tailwind!</h1>
const App = () => {
  const [activeScreen, setActiveScreen] = useState('home');
  const [userType, setUserType] = useState(null); // null | 'client' | 'provider'
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const renderScreen = () => {
    switch (activeScreen) {
      case 'home':
        return <HomeScreen onNavigate={setActiveScreen} />;
      case 'about':
        return <AboutScreen onNavigate={setActiveScreen} />;
      case 'contact':
        return <ContactScreen onNavigate={setActiveScreen} />;
      case 'login':
        return <LoginScreen onNavigate={setActiveScreen} onLogin={() => setIsLoggedIn(true)} />;
      case 'dashboardClient':
        return <DashboardClient onNavigate={setActiveScreen} />;
      case 'bookingsClient':
        return <BookingsClient onNavigate={setActiveScreen} />;
      case 'editBookingClient':
        return <EditBookingClient onNavigate={setActiveScreen} />;
      case 'settingsClient':
        return <SettingsClient onNavigate={setActiveScreen} />;
      case 'dashboardProvider':
        return <DashboardProvider onNavigate={setActiveScreen} />;
      case 'todayBookingsProvider':
        return <TodayBookingsProvider onNavigate={setActiveScreen} />;
      case 'slotsProvider':
        return <SlotsProvider onNavigate={setActiveScreen} />;
      case 'staffProvider':
        return <StaffProvider onNavigate={setActiveScreen} />;
      case 'servicesProvider':
        return <ServicesProvider onNavigate={setActiveScreen} />;
      case 'settingsProvider':
        return <SettingsProvider onNavigate={setActiveScreen} />;
      case 'selectService':
        return <SelectService onNavigate={setActiveScreen} />;
      case 'selectSpecialist':
        return <SelectSpecialist onNavigate={setActiveScreen} />;
      case 'confirmBooking':
        return <ConfirmBooking onNavigate={setActiveScreen} />;
      case 'bookingSuccess':
        return <BookingSuccess onNavigate={setActiveScreen} />;
      default:
        return <HomeScreen onNavigate={setActiveScreen} />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        activeScreen={activeScreen}
        isLoggedIn={isLoggedIn}
        userType={userType}
        onNavigate={setActiveScreen}
        onLogout={() => {
          setIsLoggedIn(false);
          setUserType(null);
          setActiveScreen('home');
        }}
      />
      <main className="container mx-auto py-8 px-4 md:px-6 lg:px-8">{renderScreen()}</main>
      <Footer onNavigate={setActiveScreen} />
    </div>
  );
};

// === HEADER COMPONENT ===
const Header = ({ activeScreen, isLoggedIn, userType, onNavigate, onLogout }) => {
  return (
    <header className="bg-white shadow-sm sticky top-0 z-10">
      <div className="container mx-auto flex justify-between items-center py-4 px-4 md:px-6">
        <div className="flex items-center space-x-2 cursor-pointer" onClick={() => onNavigate('home')}>
          <svg className="w-8 h-8 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="text-xl font-bold text-gray-800">BookNow</span>
        </div>

        <nav className="hidden md:flex space-x-6">
          <button onClick={() => onNavigate('home')} className={`font-medium ${activeScreen === 'home' ? 'text-indigo-600' : 'text-gray-600 hover:text-indigo-600'}`}>
            Главная
          </button>
          <button onClick={() => onNavigate('about')} className={`font-medium ${activeScreen === 'about' ? 'text-indigo-600' : 'text-gray-600 hover:text-indigo-600'}`}>
            О сервисе
          </button>
          <button onClick={() => onNavigate('contact')} className={`font-medium ${activeScreen === 'contact' ? 'text-indigo-600' : 'text-gray-600 hover:text-indigo-600'}`}>
            Контакты
          </button>
        </nav>

        <div className="flex items-center space-x-4">
          {isLoggedIn ? (
            <>
              <button
                onClick={() => onNavigate(userType === 'client' ? 'dashboardClient' : 'dashboardProvider')}
                className="px-4 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
              >
                Личный кабинет
              </button>
              <button onClick={onLogout} className="text-gray-600 hover:text-red-500">
                Выйти
              </button>
            </>
          ) : (
            <button
              onClick={() => onNavigate('login')}
              className="px-4 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
            >
              Войти / Регистрация
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

// === FOOTER COMPONENT ===
const Footer = ({ onNavigate }) => {
  return (
    <footer className="bg-white border-t mt-12">
      <div className="container mx-auto py-8 px-4 md:px-6 grid grid-cols-1 md:grid-cols-3 gap-8">
        <div>
          <h3 className="font-semibold text-lg mb-4">BookNow</h3>
          <p className="text-gray-600">
            Платформа для удобной записи на услуги. Мы делаем бронирование проще и доступнее.
          </p>
        </div>
        <div>
          <h3 className="font-semibold text-lg mb-4">Навигация</h3>
          <ul className="space-y-2">
            <li><button onClick={() => onNavigate('home')} className="text-gray-600 hover:text-indigo-600">Главная</button></li>
            <li><button onClick={() => onNavigate('about')} className="text-gray-600 hover:text-indigo-600">О сервисе</button></li>
            <li><button onClick={() => onNavigate('contact')} className="text-gray-600 hover:text-indigo-600">Контакты</button></li>
          </ul>
        </div>
        <div>
          <h3 className="font-semibold text-lg mb-4">Социальные сети</h3>
          <div className="flex space-x-4">
            <a href="#" className="text-gray-600 hover:text-indigo-600">Facebook</a>
            <a href="#" className="text-gray-600 hover:text-indigo-600">Instagram</a>
            <a href="#" className="text-gray-600 hover:text-indigo-600">Telegram</a>
          </div>
        </div>
      </div>
      <div className="bg-gray-100 py-3 text-center text-sm text-gray-500">
        © 2025 BookNow. Все права защищены.
      </div>
    </footer>
  );
};

// === SCREENS ===

// Home Screen
const HomeScreen = ({ onNavigate }) => {
  return (
    <section className="text-center max-w-3xl mx-auto">
      <h1 className="text-4xl font-bold text-gray-900 mb-4">Запись на услуги легко как никогда</h1>
      <p className="text-lg text-gray-600 mb-8">
        Найдите специалиста, выберите услугу и забронируйте удобное время всего за несколько кликов.
      </p>

      <div className="mb-8">
        <div className="relative">
          <input
            type="text"
            placeholder="Поиск по названию, мастеру или категории"
            className="w-full p-4 pl-12 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <svg className="absolute left-4 top-4 w-5 h-5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="11" cy="11" r="8" strokeWidth="2" />
            <path d="M21 21l-4.35-4.35" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
        {['Парикмахеры', 'Маникюр', 'Массаж', 'Фитнес', 'Услуги IT', 'Репетиторы'].map((service, index) => (
          <div key={index} className="bg-white p-6 rounded-lg shadow hover:shadow-md transition-shadow border border-gray-200">
            <h3 className="text-xl font-semibold text-gray-800">{service}</h3>
          </div>
        ))}
      </div>

      <div className="flex justify-center space-x-4">
        <button
          onClick={() => onNavigate('selectService')}
          className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Выбрать услугу
        </button>
        <button
          onClick={() => onNavigate('login')}
          className="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
        >
          Стать партнером
        </button>
      </div>
    </section>
  );
};
// About Screen
const AboutScreen = ({ onNavigate }) => {
  return (
    <section className="max-w-4xl mx-auto">
      <h2 className="text-3xl font-bold text-gray-900 mb-6">О сервисе</h2>
      <div className="prose max-w-none">
        <p className="text-lg text-gray-700 mb-4">
          BookNow — это платформа, которая объединяет клиентов с профессионалами в различных сферах услуг.
        </p>
        <p className="text-lg text-gray-700 mb-6">
          Мы создали простую и интуитивно понятную систему записи, чтобы вы могли экономить время и сосредоточиться на важном.
        </p>

        <h3 className="text-xl font-semibold text-gray-800 mb-3">Преимущества сервиса:</h3>
        <ul className="list-disc pl-6 mb-6 space-y-2 text-gray-700">
          <li>Быстрое бронирование через интернет</li>
          <li>Доступ к множеству проверенных специалистов</li>
          <li>Отзывы и рейтинги для выбора лучшего мастера</li>
          <li>Гибкий график и возможность отмены</li>
          <li>Интуитивный интерфейс для всех устройств</li>
        </ul>

        <h3 className="text-xl font-semibold text-gray-800 mb-3">Как пользоваться сервисом:</h3>
        <ol className="list-decimal pl-6 mb-6 space-y-2 text-gray-700">
          <li>Выберите услугу из каталога</li>
          <li>Подберите подходящего специалиста</li>
          <li>Выберите удобное время</li>
          <li>Подтвердите запись</li>
        </ol>

        <div className="mt-8 flex justify-center">
          <button
            onClick={() => onNavigate('selectService')}
            className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Начать подбор услуги
          </button>
        </div>
      </div>
    </section>
  );
};

// Contact Screen
const ContactScreen = ({ onNavigate }) => {
  return (
    <section className="max-w-4xl mx-auto">
      <h2 className="text-3xl font-bold text-gray-900 mb-6">Контакты</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <h3 className="text-xl font-semibold text-gray-800 mb-4">Свяжитесь с нами</h3>
          <form className="space-y-4">
            <div>
              <label className="block text-gray-700 mb-1">Имя</label>
              <input type="text" className="w-full p-3 border border-gray-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-gray-700 mb-1">Email</label>
              <input type="email" className="w-full p-3 border border-gray-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-gray-700 mb-1">Сообщение</label>
              <textarea rows="5" className="w-full p-3 border border-gray-300 rounded-lg"></textarea>
            </div>
            <button
              type="submit"
              className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Отправить сообщение
            </button>
          </form>
        </div>

        <div>
          <h3 className="text-xl font-semibold text-gray-800 mb-4">Контактная информация</h3>
          <div className="space-y-4 text-gray-700">
            <p>Адрес: г. Москва, ул. Примерная, д. 1</p>
            <p>Телефон: +7 (999) 123-45-67</p>
            <p>Email: support@booknow.ru</p>
          </div>

          <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-4">Социальные сети</h3>
          <div className="flex space-x-4">
            <a href="#" className="text-gray-600 hover:text-indigo-600">Facebook</a>
            <a href="#" className="text-gray-600 hover:text-indigo-600">Instagram</a>
            <a href="#" className="text-gray-600 hover:text-indigo-600">Telegram</a>
          </div>
        </div>
      </div>
    </section>
  );
};

// Login Screen
const LoginScreen = ({ onNavigate, onLogin }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [userType, setUserType] = useState('client');

  return (
    <section className="max-w-lg mx-auto">
      <h2 className="text-3xl font-bold text-gray-900 mb-6 text-center">
        {isRegister ? 'Регистрация' : 'Вход'}
      </h2>

      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <div className="mb-6">
          <div className="flex border-b">
            <button
              onClick={() => setIsRegister(false)}
              className={`py-2 px-4 font-medium ${!isRegister ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-gray-600'}`}
            >
              Вход
            </button>
            <button
              onClick={() => setIsRegister(true)}
              className={`py-2 px-4 font-medium ${isRegister ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-gray-600'}`}
            >
              Регистрация
            </button>
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-gray-700 mb-2">Тип пользователя</label>
          <div className="flex space-x-4">
            <label className="flex items-center">
              <input
                type="radio"
                name="userType"
                value="client"
                checked={userType === 'client'}
                onChange={(e) => setUserType(e.target.value)}
                className="mr-2"
              />
              Клиент
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                name="userType"
                value="provider"
                checked={userType === 'provider'}
                onChange={(e) => setUserType(e.target.value)}
                className="mr-2"
              />
              Поставщик услуг
            </label>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-gray-700 mb-1">Email</label>
            <input type="email" className="w-full p-3 border border-gray-300 rounded-lg" />
          </div>
          {!isRegister && (
            <div>
              <label className="block text-gray-700 mb-1">Пароль</label>
              <input type="password" className="w-full p-3 border border-gray-300 rounded-lg" />
            </div>
          )}

          {isRegister && (
            <>
              <div>
                <label className="block text-gray-700 mb-1">Имя</label>
                <input type="text" className="w-full p-3 border border-gray-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-gray-700 mb-1">Телефон</label>
                <input type="tel" className="w-full p-3 border border-gray-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-gray-700 mb-1">Пароль</label>
                <input type="password" className="w-full p-3 border border-gray-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-gray-700 mb-1">Подтверждение пароля</label>
                <input type="password" className="w-full p-3 border border-gray-300 rounded-lg" />
              </div>
            </>
          )}

          <button
            onClick={() => {
              onLogin();
              onNavigate(userType === 'client' ? 'dashboardClient' : 'dashboardProvider');
            }}
            className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            {isRegister ? 'Зарегистрироваться' : 'Войти'}
          </button>

          {!isRegister && (
            <button
              onClick={() => alert('Сброс пароля пока не реализован')}
              className="text-indigo-600 hover:underline block w-full text-center"
            >
              Забыли пароль?
            </button>
          )}
        </div>
      </div>

      <div className="text-center">
        <button
          onClick={() => alert('Вход через соцсети пока не реализован')}
          className="text-indigo-600 hover:underline"
        >
          Войти через социальные сети
        </button>
      </div>
    </section>
  );
};

// CLIENT DASHBOARD
const DashboardClient = ({ onNavigate }) => {
  return (
    <section className="max-w-4xl mx-auto">
      <h2 className="text-3xl font-bold text-gray-900 mb-6">Личный кабинет клиента</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
          <h3 className="text-xl font-semibold text-gray-800 mb-4">Ближайшие записи</h3>
          <ul className="space-y-3">
            <li className="flex justify-between items-center">
              <span>Стрижка мужская</span>
              <span className="text-indigo-600">25 мая, 14:00</span>
            </li>
            <li className="flex justify-between items-center">
              <span>Массаж спины</span>
              <span className="text-indigo-600">27 мая, 16:30</span>
            </li>
          </ul>
          <button
            onClick={() => onNavigate('bookingsClient')}
            className="mt-4 text-indigo-600 hover:underline text-sm"
          >
            Посмотреть все записи
          </button>
        </div>

        <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
          <h3 className="text-xl font-semibold text-gray-800 mb-4">История услуг</h3>
          <ul className="space-y-3">
            <li className="flex justify-between items-center">
              <span>Маникюр классический</span>
              <span className="text-gray-500">10 мая</span>
            </li>
            <li className="flex justify-between items-center">
              <span>Репетитор по математике</span>
              <span className="text-gray-500">5 мая</span>
            </li>
          </ul>
          <button
            onClick={() => alert('История услуг пока не реализована')}
            className="mt-4 text-indigo-600 hover:underline text-sm"
          >
            Посмотреть всю историю
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
        <h3 className="text-xl font-semibold text-gray-800 mb-4">Быстрые действия</h3>
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => onNavigate('selectService')}
            className="p-4 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors"
          >
            Новая запись
          </button>
          <button
            onClick={() => onNavigate('settingsClient')}
            className="p-4 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors"
          >
            Настройки профиля
          </button>
        </div>
      </div>
    </section>
  );
};

// CLIENT BOOKINGS
const BookingsClient = ({ onNavigate }) => {
  return (
    <section className="max-w-4xl mx-auto">
      <h2 className="text-3xl font-bold text-gray-900 mb-6">Мои записи</h2>

      <div className="space-y-6">
        {[
          { service: 'Стрижка мужская', date: '25 мая 2025', time: '14:00', specialist: 'Иван Петров' },
          { service: 'Массаж спины', date: '27 мая 2025', time: '16:30', specialist: 'Ольга Смирнова' },
          { service: 'Маникюр классический', date: '10 мая 2025', time: '11:00', specialist: 'Елена Иванова' },
        ].map((booking, index) => (
          <div key={index} className="bg-white p-6 rounded-lg shadow border border-gray-200">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xl font-semibold text-gray-800">{booking.service}</h3>
                <p className="text-gray-600">{booking.specialist}</p>
                <p className="text-gray-500">{`${booking.date}, ${booking.time}`}</p>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => onNavigate('editBookingClient')}
                  className="px-3 py-1 bg-blue-100 text-blue-600 rounded hover:bg-blue-200"
                >
                  Изменить
                </button>
                <button
                  onClick={() => confirm('Вы уверены, что хотите отменить запись?') && alert('Запись отменена')}
                  className="px-3 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200"
                >
                  Отменить
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 text-center">
        <button
          onClick={() => onNavigate('selectService')}
          className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Записаться на новую услугу
        </button>
      </div>
    </section>
  );
};

// EDIT BOOKING CLIENT
const EditBookingClient = ({ onNavigate }) => {
  return (
    <section className="max-w-lg mx-auto">
      <h2 className="text-3xl font-bold text-gray-900 mb-6">Редактирование записи</h2>

      <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
        <div className="space-y-4">
          <div>
            <label className="block text-gray-700 mb-1">Дата</label>
            <input type="date" className="w-full p-3 border border-gray-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-gray-700 mb-1">Время</label>
            <select className="w-full p-3 border border-gray-300 rounded-lg">
              <option>10:00</option>
              <option>11:00</option>
              <option>12:00</option>
              <option>14:00</option>
              <option>15:00</option>
              <option>16:00</option>
            </select>
          </div>
          <div>
            <label className="block text-gray-700 mb-1">Специалист</label>
            <select className="w-full p-3 border border-gray-300 rounded-lg">
              <option>Иван Петров</option>
              <option>Ольга Смирнова</option>
              <option>Елена Иванова</option>
            </select>
          </div>
        </div>

        <div className="mt-6 flex space-x-4">
          <button
            onClick={() => alert('Запись обновлена')}
            className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Сохранить изменения
          </button>
          <button
            onClick={() => onNavigate('bookingsClient')}
            className="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
          >
            Отменить
          </button>
        </div>
      </div>
    </section>
  );
};

// SETTINGS CLIENT
const SettingsClient = ({ onNavigate }) => {
  return (
    <section className="max-w-lg mx-auto">
      <h2 className="text-3xl font-bold text-gray-900 mb-6">Настройки профиля</h2>

      <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
        <div className="space-y-4">
          <div>
            <label className="block text-gray-700 mb-1">Имя</label>
            <input type="text" defaultValue="Александр" className="w-full p-3 border border-gray-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-gray-700 mb-1">Email</label>
            <input type="email" defaultValue="alex@example.com" className="w-full p-3 border border-gray-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-gray-700 mb-1">Телефон</label>
            <input type="tel" defaultValue="+7 (999) 123-45-67" className="w-full p-3 border border-gray-300 rounded-lg" />
          </div>
        </div>

        <div className="mt-6 flex space-x-4">
          <button
            onClick={() => alert('Настройки сохранены')}
            className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Сохранить изменения
          </button>
          <button
            onClick={() => onNavigate('dashboardClient')}
            className="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
          >
            Отменить
          </button>
        </div>
      </div>
    </section>
  );
};

// PROVIDER DASHBOARD
const DashboardProvider = ({ onNavigate }) => {
  return (
    <section className="max-w-4xl mx-auto">
      <h2 className="text-3xl font-bold text-gray-900 mb-6">Личный кабинет поставщика услуг</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow border border-gray-200 text-center">
          <h3 className="text-xl font-semibold text-gray-800 mb-2">Новые заявки</h3>
          <p className="text-3xl font-bold text-indigo-600">12</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow border border-gray-200 text-center">
          <h3 className="text-xl font-semibold text-gray-800 mb-2">Загруженность</h3>
          <p className="text-3xl font-bold text-indigo-600">65%</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow border border-gray-200 text-center">
          <h3 className="text-xl font-semibold text-gray-800 mb-2">Отзывы</h3>
          <p className="text-3xl font-bold text-indigo-600">4.8 ★</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
        <h3 className="text-xl font-semibold text-gray-800 mb-4">Ближайшие записи</h3>
        <ul className="space-y-3">
          <li className="flex justify-between items-center">
            <span>Стрижка мужская</span>
            <span className="text-indigo-600">25 мая, 14:00</span>
          </li>
          <li className="flex justify-between items-center">
            <span>Массаж спины</span>
            <span className="text-indigo-600">27 мая, 16:30</span>
          </li>
          <li className="flex justify-between items-center">
            <span>Маникюр классический</span>
            <span className="text-indigo-600">28 мая, 11:00</span>
          </li>
        </ul>
        <button
          onClick={() => onNavigate('todayBookingsProvider')}
          className="mt-4 text-indigo-600 hover:underline text-sm"
        >
          Посмотреть сегодняшние записи
        </button>
      </div>
    </section>
  );
};

// TODAY BOOKINGS PROVIDER
const TodayBookingsProvider = ({ onNavigate }) => {
  return (
    <section className="max-w-4xl mx-auto">
      <h2 className="text-3xl font-bold text-gray-900 mb-6">Записи на сегодня</h2>

      <div className="space-y-6">
        {[
          { service: 'Стрижка мужская', time: '14:00', client: 'Александр Иванов', phone: '+7 999 123-45-67' },
          { service: 'Массаж спины', time: '16:30', client: 'Мария Петрова', phone: '+7 987 654-32-10' },
        ].map((booking, index) => (
          <div key={index} className="bg-white p-6 rounded-lg shadow border border-gray-200">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xl font-semibold text-gray-800">{booking.service}</h3>
                <p className="text-gray-600">{booking.client}</p>
                <p className="text-gray-500">{booking.phone}</p>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => alert('Связь с клиентом пока не реализована')}
                  className="px-3 py-1 bg-green-100 text-green-600 rounded hover:bg-green-200"
                >
                  Связаться
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

// SLOTS PROVIDER
const SlotsProvider = ({ onNavigate }) => {
  return (
    <section className="max-w-4xl mx-auto">
      <h2 className="text-3xl font-bold text-gray-900 mb-6">Управление слотами</h2>

      <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
        <div className="mb-6">
          <h3 className="text-xl font-semibold text-gray-800 mb-4">Календарь доступных слотов</h3>
          <div className="grid grid-cols-7 gap-2 text-center text-sm text-gray-600 mb-2">
            <div>Пн</div>
            <div>Вт</div>
            <div>Ср</div>
            <div>Чт</div>
            <div>Пт</div>
            <div>Сб</div>
            <div>Вс</div>
          </div>
          <div className="grid grid-cols-7 gap-2">
            {[...Array(35)].map((_, i) => (
              <div
                key={i}
                className={`h-12 flex items-center justify-center border rounded ${
                  i % 7 === 5 || i % 7 === 6 ? `bg-gray-100` : ``
                }`}
              >
                {i + 1}
              </div>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <h3 className="text-xl font-semibold text-gray-800 mb-4">Доступное время</h3>
          <div className="grid grid-cols-4 gap-4">
            <button className="px-4 py-2 bg-indigo-100 text-indigo-600 rounded hover:bg-indigo-200">
              10:00
            </button>
            <button className="px-4 py-2 bg-indigo-100 text-indigo-600 rounded hover:bg-indigo-200">
              11:00
            </button>
            <button className="px-4 py-2 bg-indigo-100 text-indigo-600 rounded hover:bg-indigo-200">
              12:00
            </button>
            <button className="px-4 py-2 bg-indigo-100 text-indigo-600 rounded hover:bg-indigo-200">
              14:00
            </button>
            <button className="px-4 py-2 bg-indigo-100 text-indigo-600 rounded hover:bg-indigo-200">
              15:00
            </button>
            <button className="px-4 py-2 bg-indigo-100 text-indigo-600 rounded hover:bg-indigo-200">
              16:00
            </button>
            <button className="px-4 py-2 bg-indigo-100 text-indigo-600 rounded hover:bg-indigo-200">
              17:00
            </button>
            <button className="px-4 py-2 bg-indigo-100 text-indigo-600 rounded hover:bg-indigo-200">
              18:00
            </button>
          </div>
        </div>

        <div className="flex justify-end space-x-4">
          <button
            onClick={() => alert('Слот добавлен')}
            className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Добавить слот
          </button>
        </div>
      </div>
    </section>
  );
};

// STAFF PROVIDER
const StaffProvider = ({ onNavigate }) => {
  return (
    <section className="max-w-4xl mx-auto">
      <h2 className="text-3xl font-bold text-gray-900 mb-6">Управление специалистами</h2>

      <div className="bg-white p-6 rounded-lg shadow border border-gray-200 mb-6">
        <h3 className="text-xl font-semibold text-gray-800 mb-4">Список специалистов</h3>
        <div className="space-y-4">
          {[
            { name: 'Иван Петров', specialty: 'Парикмахер', rating: '4.9 ★' },
            { name: 'Ольга Смирнова', specialty: 'Массажист', rating: '4.7 ★' },
            { name: 'Елена Иванова', specialty: 'Мастер маникюра', rating: '4.8 ★' },
          ].map((staff, index) => (
            <div key={index} className="flex justify-between items-center p-4 border rounded-lg">
              <div>
                <h4 className="font-semibold text-gray-800">{staff.name}</h4>
                <p className="text-gray-600">{staff.specialty}</p>
              </div>
              <div className="text-indigo-600">{staff.rating}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => alert('Добавление специалиста пока не реализовано')}
          className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Добавить нового специалиста
        </button>
      </div>
    </section>
  );
};

// SERVICES PROVIDER
const ServicesProvider = ({ onNavigate }) => {
  return (
    <section className="max-w-4xl mx-auto">
      <h2 className="text-3xl font-bold text-gray-900 mb-6">Управление услугами</h2>

      <div className="bg-white p-6 rounded-lg shadow border border-gray-200 mb-6">
        <h3 className="text-xl font-semibold text-gray-800 mb-4">Список услуг</h3>
        <div className="space-y-4">
          {[
            { name: 'Стрижка мужская', duration: '45 мин', price: '1500 ₽' },
            { name: 'Массаж спины', duration: '60 мин', price: '2000 ₽' },
            { name: 'Маникюр классический', duration: '30 мин', price: '800 ₽' },
          ].map((service, index) => (
            <div key={index} className="flex justify-between items-center p-4 border rounded-lg">
              <div>
                <h4 className="font-semibold text-gray-800">{service.name}</h4>
                <p className="text-gray-600">{service.duration}</p>
              </div>
              <div className="text-indigo-600 font-medium">{service.price}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => alert('Добавление услуги пока не реализовано')}
          className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Добавить новую услугу
        </button>
      </div>
    </section>
  );
};

// SETTINGS PROVIDER
const SettingsProvider = ({ onNavigate }) => {
  return (
    <section className="max-w-lg mx-auto">
      <h2 className="text-3xl font-bold text-gray-900 mb-6">Настройки профиля</h2>

      <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
        <div className="space-y-4">
          <div>
            <label className="block text-gray-700 mb-1">Название компании</label>
            <input type="text" defaultValue="Салон красоты 'Элегия'" className="w-full p-3 border border-gray-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-gray-700 mb-1">Описание</label>
            <textarea rows="4" className="w-full p-3 border border-gray-300 rounded-lg">
              Современный салон красоты с опытными мастерами и комфортной атмосферой.
            </textarea>
          </div>
          <div>
            <label className="block text-gray-700 mb-1">Email</label>
            <input type="email" defaultValue="salon@example.com" className="w-full p-3 border border-gray-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-gray-700 mb-1">Телефон</label>
            <input type="tel" defaultValue="+7 (999) 123-45-67" className="w-full p-3 border border-gray-300 rounded-lg" />
          </div>
        </div>

        <div className="mt-6 flex space-x-4">
          <button
            onClick={() => alert('Настройки сохранены')}
            className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Сохранить изменения
          </button>
          <button
            onClick={() => onNavigate('dashboardProvider')}
            className="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
          >
            Отменить
          </button>
        </div>
      </div>
    </section>
  );
};

// SELECT SERVICE
const SelectService = ({ onNavigate }) => {
  return (
    <section className="max-w-4xl mx-auto">
      <h2 className="text-3xl font-bold text-gray-900 mb-6">Выберите услугу</h2>

      <div className="mb-6">
        <div className="relative">
          <input
            type="text"
            placeholder="Поиск услуги..."
            className="w-full p-4 pl-12 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <svg className="absolute left-4 top-4 w-5 h-5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="11" cy="11" r="8" strokeWidth="2" />
            <path d="M21 21l-4.35-4.35" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {[
          { name: 'Парикмахер', count: 45 },
          { name: 'Маникюр', count: 32 },
          { name: 'Массаж', count: 28 },
          { name: 'Фитнес', count: 15 },
          { name: 'IT-услуги', count: 9 },
          { name: 'Репетиторы', count: 21 },
        ].map((category, index) => (
          <div
            key={index}
            className="bg-white p-6 rounded-lg shadow hover:shadow-md transition-shadow border border-gray-200 cursor-pointer"
            onClick={() => onNavigate('selectSpecialist')}
          >
            <h3 className="text-xl font-semibold text-gray-800">{category.name}</h3>
            <p className="text-gray-500 mt-1">{category.count} специалистов</p>
          </div>
        ))}
      </div>
    </section>
  );
};

// SELECT SPECIALIST
const SelectSpecialist = ({ onNavigate }) => {
  return (
    <section className="max-w-4xl mx-auto">
      <h2 className="text-3xl font-bold text-gray-900 mb-6">Выберите мастера</h2>

      <div className="bg-white p-6 rounded-lg shadow border border-gray-200 mb-6">
        <h3 className="text-xl font-semibold text-gray-800 mb-4">Доступные мастера</h3>
        <div className="space-y-6">
          {[
            { name: 'Иван Петров', specialty: 'Парикмахер', rating: '4.9 ★', clients: 125 },
            { name: 'Ольга Смирнова', specialty: 'Массажист', rating: '4.7 ★', clients: 98 },
            { name: 'Елена Иванова', specialty: 'Мастер маникюра', rating: '4.8 ★', clients: 150 },
          ].map((staff, index) => (
            <div key={index} className="flex items-center space-x-4">
              <img src="https://placehold.co/100x100" alt={staff.name} className="w-16 h-16 rounded-full object-cover" />
              <div className="flex-1">
                <h4 className="font-semibold text-gray-800">{staff.name}</h4>
                <p className="text-gray-600">{staff.specialty}</p>
                <div className="flex items-center mt-1">
                  <span className="text-indigo-600 mr-2">{staff.rating}</span>
                  <span className="text-gray-500">({staff.clients} клиентов)</span>
                </div>
              </div>
              <button
                onClick={() => onNavigate('confirmBooking')}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Выбрать
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

// CONFIRM BOOKING
const ConfirmBooking = ({ onNavigate }) => {
  return (
    <section className="max-w-lg mx-auto">
      <h2 className="text-3xl font-bold text-gray-900 mb-6">Подтверждение записи</h2>

      <div className="bg-white p-6 rounded-lg shadow border border-gray-200 mb-6">
        <h3 className="text-xl font-semibold text-gray-800 mb-4">Детали записи</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-gray-700 mb-1">Услуга</label>
            <p className="text-gray-800">Стрижка мужская</p>
          </div>
          <div>
            <label className="block text-gray-700 mb-1">Специалист</label>
            <p className="text-gray-800">Иван Петров</p>
          </div>
          <div>
            <label className="block text-gray-700 mb-1">Дата и время</label>
            <p className="text-gray-800">25 мая 2025, 14:00</p>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow border border-gray-200 mb-6">
        <h3 className="text-xl font-semibold text-gray-800 mb-4">Ваши данные</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-gray-700 mb-1">Имя</label>
            <input type="text" placeholder="Введите ваше имя" className="w-full p-3 border border-gray-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-gray-700 mb-1">Email</label>
            <input type="email" placeholder="Введите ваш email" className="w-full p-3 border border-gray-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-gray-700 mb-1">Телефон</label>
            <input type="tel" placeholder="Введите ваш телефон" className="w-full p-3 border border-gray-300 rounded-lg" />
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow border border-gray-200 mb-6">
        <h3 className="text-xl font-semibold text-gray-800 mb-4">Оплата</h3>
        <div className="flex items-center">
          <input type="checkbox" id="payOnline" className="mr-2" />
          <label htmlFor="payOnline" className="text-gray-700">
            Оплатить онлайн (необязательно)
          </label>
        </div>
      </div>

      <div className="flex justify-between">
        <button
          onClick={() => onNavigate('selectSpecialist')}
          className="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
        >
          Назад
        </button>
        <button
          onClick={() => onNavigate('bookingSuccess')}
          className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Подтвердить запись
        </button>
      </div>
    </section>
  );
};

// BOOKING SUCCESS
const BookingSuccess = ({ onNavigate }) => {
  return (
    <section className="max-w-lg mx-auto text-center">
      <div className="bg-white p-8 rounded-lg shadow border border-green-200">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Запись успешно подтверждена!</h2>
        <p className="text-gray-600 mb-6">
          Ваша запись на стрижку мужскую к Ивану Петрову на 25 мая в 14:00 успешно оформлена.
        </p>
        <button
          onClick={() => onNavigate('bookingsClient')}
          className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors inline-block"
        >
          Перейти к моим записям
        </button>
      </div>
    </section>
  );
};

export default App;
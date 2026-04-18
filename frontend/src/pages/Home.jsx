import { CalendarDaysIcon, ChartBarSquareIcon, CurrencyDollarIcon, DevicePhoneMobileIcon, NoSymbolIcon, RectangleStackIcon, UserGroupIcon } from '@heroicons/react/24/outline'
import { Button } from '../components/ui'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'

const FEATURES = [
  {
    title: 'Онлайн-запись и расписание',
    text: 'Страница записи, слоты, переносы и загрузка дня.',
    icon: CalendarDaysIcon,
  },
  {
    title: 'Клиентская база',
    text: 'История, заметки и ограничения.',
    icon: UserGroupIcon,
  },
  {
    title: 'Скидки',
    text: 'Автоматические и индивидуальные.',
    icon: ChartBarSquareIcon,
  },
  {
    title: 'Финансовый учёт',
    text: 'Доходы, расходы, итог по периоду.',
    icon: CurrencyDollarIcon,
  },
  {
    title: 'Статистика',
    text: 'Ключевые показатели в одном месте.',
    icon: ChartBarSquareIcon,
  },
  {
    title: 'Стоп-листы и ограничения',
    text: 'Защита расписания от проблемных записей.',
    icon: NoSymbolIcon,
  },
]

const AVAILABLE_NOW = [
  'Личная страница мастера',
  'Автоматические и индивидуальные скидки',
  'Статистика',
  'Финансовый учёт',
  'Списки клиентов',
  'Стоп-листы',
]

const COMING_SOON = [
  'Рассылки',
  'Предоплата и оплата',
]

export default function Home() {
  const { openAuthModal } = useAuth()
  const navigate = useNavigate()

  const handleTryFreeClick = () => openAuthModal('master', 'register')
  const handleDemoCabinetClick = () => navigate('/demo/master')

  return (
    <div className="pt-[104px] bg-white overflow-x-hidden">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12 md:pb-16">
        {/* Hero */}
        <section className="py-6 md:py-10 lg:py-12 grid lg:grid-cols-12 gap-8 lg:gap-10 items-center">
          <div className="lg:col-span-5">
            <h1 className="text-3xl md:text-5xl font-bold text-neutral-900 leading-tight max-w-xl">
              Онлайн-запись и управление клиентами для частных мастеров
            </h1>
            <p className="mt-4 text-base md:text-lg text-neutral-600 max-w-lg">
              Расписание, записи, клиенты и выручка — в вебе, на iPhone и Android.
            </p>
            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <Button variant="primary" size="lg" onClick={handleTryFreeClick} className="w-full sm:w-auto">
                Попробовать бесплатно
              </Button>
              <Button variant="secondary" size="lg" onClick={handleDemoCabinetClick} className="w-full sm:w-auto">
                Демо-кабинет
              </Button>
            </div>
            <ul className="mt-5 space-y-1.5 text-sm text-neutral-700">
              <li>Онлайн-запись для клиентов</li>
              <li>Расписание, клиенты и финансы в одном сервисе</li>
              <li>Веб, iOS и Android</li>
            </ul>
          </div>
          <div className="relative lg:col-span-7">
            <div className="rounded-2xl border border-neutral-200 bg-gradient-to-br from-neutral-50 to-white p-3 md:p-4 shadow-sm">
              <div className="h-[340px] md:h-[420px] lg:h-[460px] rounded-xl border border-dashed border-neutral-300 bg-white flex items-center justify-center text-center px-6 relative overflow-hidden">
                <div className="absolute -top-8 -right-8 h-32 w-32 rounded-full bg-[#4CAF50]/10" />
                <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-neutral-200/40" />
                <div>
                  <p className="text-sm font-semibold text-neutral-800">Главный product shot</p>
                  <p className="mt-2 text-sm text-neutral-500">
                    Место под скринкаст или серию скриншотов.
                  </p>
                </div>
              </div>
              <p className="mt-2 text-xs text-neutral-500">Placeholder готов к замене на реальные медиа.</p>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="py-6 md:py-8">
          <h2 className="text-2xl md:text-3xl font-bold text-neutral-900">
            Всё, что нужно мастеру для работы с записью и клиентами
          </h2>
          <div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {FEATURES.map((item) => {
              const Icon = item.icon
              return (
                <div key={item.title} className="rounded-xl border border-neutral-200 px-4 py-4 bg-white">
                  <div className="flex items-start gap-3">
                    <Icon className="h-6 w-6 text-[#4CAF50] mt-0.5" />
                    <div>
                      <h3 className="font-semibold text-neutral-900 text-base">{item.title}</h3>
                      <p className="mt-1 text-sm text-neutral-600">{item.text}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* How it works */}
        <section className="py-6 md:py-8">
          <h2 className="text-2xl md:text-3xl font-bold text-neutral-900">Начать работать можно быстро</h2>
          <div className="mt-5 grid md:grid-cols-3 gap-3">
            <div className="rounded-xl border border-neutral-200 p-4">
              <p className="text-[#4CAF50] font-semibold">1. Создайте свою страницу мастера</p>
              <p className="mt-1.5 text-sm text-neutral-600">Профиль, услуги, расписание.</p>
            </div>
            <div className="rounded-xl border border-neutral-200 p-4">
              <p className="text-[#4CAF50] font-semibold">2. Принимайте записи онлайн</p>
              <p className="mt-1.5 text-sm text-neutral-600">Клиенты бронируют свободные слоты.</p>
            </div>
            <div className="rounded-xl border border-neutral-200 p-4">
              <p className="text-[#4CAF50] font-semibold">3. Управляйте клиентами и выручкой</p>
              <p className="mt-1.5 text-sm text-neutral-600">Клиенты, скидки, статистика, финансы.</p>
            </div>
          </div>
        </section>

        {/* Devices */}
        <section className="py-6 md:py-8">
          <h2 className="text-2xl md:text-3xl font-bold text-neutral-900">Работайте там, где удобно</h2>
          <p className="mt-2 text-neutral-600 max-w-2xl">
            Браузер, iPhone и Android — один рабочий процесс на любом устройстве.
          </p>
          <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <button
              type="button"
              onClick={handleTryFreeClick}
              className="rounded-xl border border-neutral-200 bg-white p-4 text-left hover:bg-neutral-50 transition-colors"
            >
              <p className="font-semibold text-neutral-900">Web</p>
              <p className="mt-1 text-sm text-neutral-600">Открыть регистрацию мастера</p>
            </button>
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="rounded-xl border border-neutral-200 bg-white p-4 text-left hover:bg-neutral-50 transition-colors"
              aria-disabled="true"
            >
              <div className="flex items-center gap-2">
                <DevicePhoneMobileIcon className="h-5 w-5 text-[#4CAF50]" />
                <p className="font-semibold text-neutral-900">App Store</p>
              </div>
              <p className="mt-1 text-sm text-neutral-600">Скоро</p>
            </a>
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="rounded-xl border border-neutral-200 bg-white p-4 text-left hover:bg-neutral-50 transition-colors"
              aria-disabled="true"
            >
              <div className="flex items-center gap-2">
                <DevicePhoneMobileIcon className="h-5 w-5 text-[#4CAF50]" />
                <p className="font-semibold text-neutral-900">Google Play</p>
              </div>
              <p className="mt-1 text-sm text-neutral-600">Скоро</p>
            </a>
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="rounded-xl border border-neutral-200 bg-white p-4 text-left hover:bg-neutral-50 transition-colors"
              aria-disabled="true"
            >
              <div className="flex items-center gap-2">
                <DevicePhoneMobileIcon className="h-5 w-5 text-[#4CAF50]" />
                <p className="font-semibold text-neutral-900">RuStore</p>
              </div>
              <p className="mt-1 text-sm text-neutral-600">Скоро</p>
            </a>
          </div>
        </section>

        {/* Available / Soon */}
        <section className="py-6 md:py-8 grid lg:grid-cols-2 gap-3">
          <div className="rounded-xl border border-green-200 bg-green-50 p-4">
            <h3 className="font-semibold text-neutral-900">Уже доступно</h3>
            <ul className="mt-2 grid sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm text-neutral-700">
              {AVAILABLE_NOW.map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <h3 className="font-semibold text-neutral-900">Скоро появится</h3>
            <ul className="mt-2 space-y-1.5 text-sm text-neutral-700">
              {COMING_SOON.map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-6 md:py-8">
          <div className="rounded-2xl bg-neutral-900 px-6 py-8 md:px-10 md:py-9 text-center">
            <h2 className="text-2xl md:text-3xl font-bold text-white">
              Начните принимать записи и управлять клиентами в одном сервисе
            </h2>
            <p className="mt-2 text-neutral-300">
              Создайте свою страницу мастера и попробуйте DeDato в работе.
            </p>
            <div className="mt-5 flex flex-col sm:flex-row justify-center gap-3">
              <Button variant="primary" size="lg" onClick={handleTryFreeClick} className="w-full sm:w-auto">
                Попробовать бесплатно
              </Button>
              <Button variant="secondary" size="lg" onClick={handleDemoCabinetClick} className="w-full sm:w-auto bg-white text-neutral-900 border-white hover:bg-neutral-100">
                Демо-кабинет
              </Button>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
import { useEffect } from 'react'
import {
  CalendarDaysIcon,
  ChartBarSquareIcon,
  CurrencyDollarIcon,
  DevicePhoneMobileIcon,
  NoSymbolIcon,
  RectangleStackIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline'
import { ArrowRightIcon, CheckIcon } from '@heroicons/react/24/solid'
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

  useEffect(() => {
    const id = window.location.hash.replace(/^#/, '')
    if (!id) return
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [])

  return (
    <div className="pt-[104px] bg-[#F9F7F6] overflow-x-hidden">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12 md:pb-16">
        {/* Hero — фон как в design ref: docs/archive/design-references/dedato-landing-v2.html (radial), без preview-shell */}
        <section
          className="rounded-2xl md:rounded-3xl py-8 md:py-12 lg:py-14 px-3 sm:px-6 md:px-8 grid lg:grid-cols-12 gap-8 lg:gap-10 items-center"
          style={{
            backgroundImage:
              'radial-gradient(ellipse 900px 420px at 110% -10%, rgba(76,175,80,0.07), transparent 55%), radial-gradient(ellipse 500px 300px at -5% 110%, rgba(76,175,80,0.04), transparent 55%)',
          }}
        >
          <div className="lg:col-span-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#C8E8D8] bg-[#DFF5EC] px-3 py-1 text-xs font-semibold text-[#3D8B42]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#4CAF50] shadow-[0_0_0_4px_rgba(76,175,80,0.20)]" />
              Для частных мастеров услуг
            </div>
            <h1 className="mt-4 text-3xl md:text-5xl font-bold text-neutral-900 leading-[1.08] tracking-[-0.02em] max-w-xl">
              Онлайн-запись и&nbsp;клиенты&nbsp;— в&nbsp;одном{' '}
              <span className="text-[#45A049] relative">
                сервисе
                <span className="absolute left-0 right-0 bottom-1 h-2 bg-[#DFF5EC] -z-10 rounded-[4px]" />
              </span>
            </h1>
            <p className="mt-4 text-base md:text-lg text-neutral-600 max-w-lg leading-relaxed">
              Расписание, онлайн-бронирование, клиентская база, скидки и финансовый учёт. Работает в браузере, на iPhone
              и Android.
            </p>
            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <Button variant="primary" size="lg" onClick={handleTryFreeClick} className="w-full sm:w-auto">
                Попробовать бесплатно
                <ArrowRightIcon className="h-4 w-4 ml-2" />
              </Button>
              <Button variant="secondary" size="lg" onClick={handleDemoCabinetClick} className="w-full sm:w-auto">
                Демо-кабинет
              </Button>
            </div>

            {/* Trust bullets (без proof-аватарок) */}
            <ul className="mt-5 space-y-2 text-sm text-neutral-600">
              {[
                'Личная страница записи — клиенты бронируют сами',
                'Расписание, клиенты, скидки и финансы в одном месте',
                'Веб, iOS и Android — один рабочий процесс',
              ].map((t) => (
                <li key={t} className="flex items-start gap-2.5">
                  <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#DFF5EC] text-[#45A049] flex-shrink-0">
                    <CheckIcon className="h-3.5 w-3.5" />
                  </span>
                  <span className="leading-snug">{t}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Schedule mock — визуальный мотив */}
          <div className="relative lg:col-span-7 min-w-0">
            <div className="rounded-2xl border border-[#E7E2DF] bg-white/70 backdrop-blur p-3 md:p-4 shadow-[0_24px_60px_-20px_rgba(45,45,45,0.20)] lg:[perspective:1800px]">
              <div className="rounded-2xl border border-[#E7E2DF] bg-white p-4 md:p-5 lg:[transform:rotateY(-6deg)_rotateX(2deg)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">Моё расписание</p>
                    <p className="mt-0.5 text-xs text-neutral-500">Пн, 21 апреля · 5 записей</p>
                  </div>
                  <div className="flex gap-1.5">
                    <span className="h-8 w-8 rounded-lg bg-[#F4F1EF] border border-[#E7E2DF] flex items-center justify-center">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M15 18l-6-6 6-6" />
                      </svg>
                    </span>
                    <span className="h-8 w-8 rounded-lg bg-[#F4F1EF] border border-[#E7E2DF] flex items-center justify-center">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-7 gap-1.5">
                  {[
                    { w: 'Вс', d: '20', dot: true },
                    { w: 'Пн', d: '21', active: true, dot: true },
                    { w: 'Вт', d: '22', dot: true },
                    { w: 'Ср', d: '23' },
                    { w: 'Чт', d: '24', dot: true },
                    { w: 'Пт', d: '25', dot: true },
                    { w: 'Сб', d: '26' },
                  ].map((x) => (
                    <div
                      key={`${x.w}${x.d}`}
                      className={
                        x.active
                          ? 'relative rounded-xl bg-[#4CAF50] text-white px-1 py-2 text-center'
                          : 'relative rounded-xl bg-[#F4F1EF] text-neutral-600 px-1 py-2 text-center border border-[#E7E2DF]'
                      }
                    >
                      <div className="text-[10px] leading-none">{x.w}</div>
                      <div className="mt-1 text-base font-semibold leading-none">{x.d}</div>
                      {x.dot ? (
                        <span
                          className={
                            x.active
                              ? 'absolute bottom-1 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-white/70'
                              : 'absolute bottom-1 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-[#4CAF50]'
                          }
                        />
                      ) : null}
                    </div>
                  ))}
                </div>

                <div className="mt-4 space-y-1.5">
                  {[
                    { time: '10:00', title: 'Женская стрижка', sub: 'Анна К. · 1 500 ₽', tone: 'green' },
                    { time: '11:30', title: 'Окрашивание + уход', sub: 'Мария С. · 4 200 ₽', tone: 'amber' },
                    { time: '14:00', title: '— свободно —', sub: '', tone: 'free' },
                    { time: '15:00', title: 'Укладка', sub: 'Катя Л. · 900 ₽', tone: 'green' },
                  ].map((s) => {
                    const base = 'flex items-center gap-3 rounded-xl px-3 py-2.5'
                    const left = 'w-12 text-xs text-neutral-500 tabular-nums'
                    if (s.tone === 'green') {
                      return (
                        <div key={s.time} className={`${base} bg-[#DFF5EC] border-l-4 border-[#4CAF50]`}>
                          <div className={left}>{s.time}</div>
                          <div className="h-1.5 w-1.5 rounded-full bg-[#4CAF50]" />
                          <div className="flex-1">
                            <div className="text-sm font-medium text-neutral-900">{s.title}</div>
                            <div className="text-xs text-neutral-600">{s.sub}</div>
                          </div>
                        </div>
                      )
                    }
                    if (s.tone === 'amber') {
                      return (
                        <div key={s.time} className={`${base} bg-[#FFF7E6] border-l-4 border-[#F59E0B]`}>
                          <div className={left}>{s.time}</div>
                          <div className="h-1.5 w-1.5 rounded-full bg-[#F59E0B]" />
                          <div className="flex-1">
                            <div className="text-sm font-medium text-neutral-900">{s.title}</div>
                            <div className="text-xs text-neutral-600">{s.sub}</div>
                          </div>
                        </div>
                      )
                    }
                    return (
                      <div
                        key={s.time}
                        className={`${base} bg-[#F4F1EF] border border-[#E7E2DF]`}
                        aria-hidden="true"
                      >
                        <div className={left}>{s.time}</div>
                        <div className="h-1.5 w-1.5 rounded-full bg-[#E7E2DF]" />
                        <div className="flex-1">
                          <div className="text-sm font-medium text-neutral-500">{s.title}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Floating cards */}
              <div className="hidden sm:flex absolute -top-4 -right-3 rotate-[2deg] rounded-2xl border border-[#E7E2DF] bg-white px-4 py-3 shadow-[0_6px_20px_-6px_rgba(45,45,45,0.12)] items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-[#DFF5EC] text-[#45A049] flex items-center justify-center">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 17l6-6 4 4 8-8" />
                    <path d="M14 7h7v7" />
                  </svg>
                </div>
                <div>
                  <div className="text-[10px] text-neutral-400">Выручка · апрель</div>
                  <div className="text-sm font-semibold text-[#45A049]">+ 92 400 ₽</div>
                </div>
              </div>
              <div className="hidden sm:flex absolute -bottom-5 -left-3 -rotate-[2deg] rounded-2xl border border-[#E7E2DF] bg-white px-4 py-3 shadow-[0_6px_20px_-6px_rgba(45,45,45,0.12)] items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-[#FEF3E8] text-[#D97706] flex items-center justify-center">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
                  </svg>
                </div>
                <div>
                  <div className="text-[10px] text-neutral-400">Новая запись</div>
                  <div className="text-sm font-semibold text-neutral-900">Ольга П. · маникюр</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-28 py-6 md:py-8">
          <div className="text-center max-w-2xl mx-auto">
            <div className="text-[#45A049] text-[11px] font-semibold tracking-[0.12em] uppercase">Возможности</div>
            <h2 className="mt-2 text-2xl md:text-3xl font-bold text-neutral-900 tracking-[-0.02em]">
            Всё, что нужно мастеру для работы с записью и клиентами
            </h2>
            <p className="mt-2 text-neutral-600">
              Один сервис вместо блокнота, таблицы и пересылок в мессенджере.
            </p>
          </div>
          <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {FEATURES.map((item) => {
              const Icon = item.icon
              return (
                <div
                  key={item.title}
                  className="rounded-2xl border border-[#E7E2DF] px-5 py-5 bg-white shadow-[0_1px_2px_rgba(45,45,45,0.06)] hover:shadow-[0_6px_20px_-6px_rgba(45,45,45,0.12)] hover:-translate-y-0.5 transition-all"
                >
                  <div className="flex items-start gap-3.5">
                    <span className="h-11 w-11 rounded-xl bg-[#DFF5EC] text-[#45A049] flex items-center justify-center flex-shrink-0">
                      <Icon className="h-6 w-6" />
                    </span>
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
        <section
          id="how"
          className="scroll-mt-28 py-8 md:py-10 mt-2 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 bg-[#F4F1EF] border-y border-[#E7E2DF]"
        >
          <div className="max-w-7xl mx-auto">
            <div className="text-center max-w-2xl mx-auto">
              <div className="text-[#45A049] text-[11px] font-semibold tracking-[0.12em] uppercase">Как начать</div>
              <h2 className="mt-2 text-2xl md:text-3xl font-bold text-neutral-900 tracking-[-0.02em]">
                Запустить онлайн-запись можно за один вечер
              </h2>
            </div>
            <div className="mt-6 grid md:grid-cols-3 gap-3">
              {[
                { n: 1, t: 'Создайте страницу мастера', d: 'Профиль, услуги, расписание — около 10 минут.' },
                { n: 2, t: 'Дайте ссылку клиентам', d: 'Клиенты бронируют свободные слоты сами, без звонков.' },
                { n: 3, t: 'Ведите клиентов и выручку', d: 'База, скидки, статистика и финансы — в одном месте.' },
              ].map((s) => (
                <div key={s.n} className="rounded-2xl border border-[#E7E2DF] bg-white p-5">
                  <div className="h-9 w-9 rounded-full bg-[#4CAF50] text-white font-bold flex items-center justify-center shadow-[0_0_0_6px_#DFF5EC]">
                    {s.n}
                  </div>
                  <h3 className="mt-4 font-semibold text-neutral-900">{s.t}</h3>
                  <p className="mt-1.5 text-sm text-neutral-600 leading-relaxed">{s.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Devices */}
        <section id="devices" className="scroll-mt-28 py-8 md:py-10">
          <div className="text-center max-w-2xl mx-auto">
            <div className="text-[#45A049] text-[11px] font-semibold tracking-[0.12em] uppercase">Где работает</div>
            <h2 className="mt-2 text-2xl md:text-3xl font-bold text-neutral-900 tracking-[-0.02em]">
              Работайте там, где удобно
            </h2>
            <p className="mt-2 text-neutral-600">
              Браузер, iPhone и Android — один рабочий процесс на любом устройстве.
            </p>
          </div>

          <div className="mt-6 flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-center gap-3">
            <button
              type="button"
              onClick={handleTryFreeClick}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#4CAF50] text-white font-semibold px-5 py-3 shadow-[0_2px_0_#3D8B42,0_4px_14px_-2px_rgba(76,175,80,0.35)] hover:bg-[#45A049] active:scale-[0.99] transition"
            >
              <RectangleStackIcon className="h-5 w-5" />
              Открыть в браузере
            </button>

            <div className="hidden sm:block w-px h-10 bg-[#E7E2DF]" />

            {[
              { name: 'App Store' },
              { name: 'Google Play' },
              { name: 'RuStore' },
            ].map((x) => (
              <a
                key={x.name}
                href="#"
                onClick={(e) => e.preventDefault()}
                aria-disabled="true"
                className="relative inline-flex items-center justify-center gap-2 rounded-2xl bg-neutral-900 text-white px-5 py-3 border border-neutral-800 opacity-55 select-none"
              >
                <DevicePhoneMobileIcon className="h-5 w-5" />
                <span className="font-semibold">{x.name}</span>
                <span className="absolute -top-2 -right-2 rounded-full border border-[#E7E2DF] bg-[#F4F1EF] px-2 py-0.5 text-[10px] font-semibold text-neutral-500">
                  Скоро
                </span>
              </a>
            ))}
          </div>
        </section>

        {/* Available / Soon */}
        <section className="py-6 md:py-8 grid lg:grid-cols-2 gap-3">
          <div className="rounded-2xl border border-[#C8E8D8] bg-[#DFF5EC] p-5">
            <h3 className="font-semibold text-neutral-900 flex items-center gap-2">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#4CAF50] text-white">
                <CheckIcon className="h-3 w-3" />
              </span>
              Уже доступно
            </h3>
            <ul className="mt-3 grid sm:grid-cols-2 gap-x-4 gap-y-2 text-sm text-neutral-800">
              {AVAILABLE_NOW.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-0.5 inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[#4CAF50] text-white flex-shrink-0">
                    <CheckIcon className="h-3 w-3" />
                  </span>
                  <span className="leading-snug">{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-[#E7E2DF] bg-[#F4F1EF] p-5">
            <h3 className="font-semibold text-neutral-900">Скоро появится</h3>
            <ul className="mt-3 space-y-2 text-sm text-neutral-800">
              {COMING_SOON.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-0.5 inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border border-[#E7E2DF] bg-white text-neutral-500 flex-shrink-0">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 7v5l3 2" />
                    </svg>
                  </span>
                  <span className="leading-snug">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-6 md:py-8">
          <div
            className="rounded-[28px] bg-neutral-900 px-6 py-10 md:px-12 md:py-14 text-center text-white overflow-hidden relative"
            style={{
              backgroundImage:
                'radial-gradient(ellipse 700px 350px at 85% 0%, rgba(76,175,80,0.22), transparent 60%), radial-gradient(ellipse 520px 260px at 0% 100%, rgba(76,175,80,0.12), transparent 60%)',
            }}
          >
            <h2 className="text-2xl md:text-3xl font-bold tracking-[-0.02em]">
              Начните принимать записи и вести клиентов в одном сервисе
            </h2>
            <p className="mt-3 text-white/70 max-w-2xl mx-auto">
              Создайте страницу мастера и попробуйте DeDato в работе — это бесплатно.
            </p>
            <div className="mt-6 flex flex-col sm:flex-row justify-center gap-3">
              <Button variant="primary" size="lg" onClick={handleTryFreeClick} className="w-full sm:w-auto">
                Зарегистрироваться бесплатно
                <ArrowRightIcon className="h-4 w-4 ml-2" />
              </Button>
              <Button
                variant="secondary"
                size="lg"
                onClick={handleDemoCabinetClick}
                className="w-full sm:w-auto bg-white/10 text-white border-white/20 hover:bg-white/15"
              >
                Демо-кабинет
              </Button>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
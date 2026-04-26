import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import {
  CalendarDaysIcon,
  ClockIcon,
  SparklesIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline'
import { ArrowRightIcon } from '@heroicons/react/24/solid'
import { Button } from '../components/ui'
import { useAuth } from '../contexts/AuthContext'

const PAGE_BG = 'bg-[#F9F7F6]'

const STATS = [
  {
    title: 'Для мастеров',
    text: 'Сервис для частных специалистов и небольших практик.',
  },
  {
    title: 'Онлайн-запись',
    text: 'Клиент выбирает время сам, без лишних переписок.',
  },
  {
    title: 'Управление клиентами',
    text: 'История визитов и заметки в одном месте.',
  },
  {
    title: 'Единое рабочее пространство',
    text: 'Расписание, клиенты и учёт без прыжков между приложениями.',
  },
]

const VALUES = [
  {
    title: 'Простота',
    text: 'Без перегруженных экранов: только то, что нужно для записи и работы с днём.',
    Icon: SparklesIcon,
  },
  {
    title: 'Экономия времени',
    text: 'Меньше ручной рутины — больше времени на клиентов и на отдых.',
    Icon: ClockIcon,
  },
  {
    title: 'Порядок в записи',
    text: 'Слоты, переносы и ограничения помогают держать день предсказуемым.',
    Icon: CalendarDaysIcon,
  },
  {
    title: 'Фокус на мастере',
    text: 'Инструмент под ваш формат: личная страница записи и кабинет в одной связке.',
    Icon: UserCircleIcon,
  },
]

/** Подсветка первого слова заголовка — без числовых метрик. */
function StatCell({ title, text }) {
  const parts = title.trim().split(/\s+/)
  const first = parts[0] ?? title
  const rest = parts.slice(1).join(' ')
  return (
    <div className="bg-white px-5 py-8 sm:px-7 sm:py-9 text-center transition-colors hover:bg-[#DFF5EC]/60">
      <p className="text-lg sm:text-xl md:text-2xl font-bold tracking-[-0.02em] text-neutral-900 leading-tight mb-2">
        <span className="text-[#45A049]">{first}</span>
        {rest ? ` ${rest}` : ''}
      </p>
      <p className="text-xs sm:text-sm text-neutral-600 leading-snug max-w-[240px] mx-auto">{text}</p>
    </div>
  )
}

export default function About() {
  const { openAuthModal } = useAuth()

  const handleTryFree = () => openAuthModal('master', 'register')

  return (
    <div className={`${PAGE_BG} pt-[104px] overflow-x-hidden min-h-full`}>
      <Helmet>
        <title>О нас — DeDato</title>
        <meta
          name="description"
          content="DeDato — сервис для индивидуальных мастеров: запись, клиенты и рабочие процессы без лишней сложности."
        />
      </Helmet>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-14 md:pb-20">
        {/* Hero */}
        <section
          className="rounded-2xl md:rounded-3xl py-12 md:py-16 lg:py-20 px-4 sm:px-8 text-center mb-10 md:mb-14"
          style={{
            backgroundImage:
              'radial-gradient(ellipse 800px 400px at 50% -20%, rgba(76,175,80,0.07), transparent 60%), radial-gradient(ellipse 400px 300px at 10% 110%, rgba(76,175,80,0.04), transparent 60%)',
          }}
        >
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-[3.25rem] font-bold text-neutral-900 leading-[1.08] tracking-[-0.03em] max-w-3xl mx-auto">
            DeDato помогает мастерам вести{' '}
            <span className="text-[#45A049] relative">
              запись проще
              <span className="absolute left-0 right-0 bottom-1 h-2.5 bg-[#DFF5EC] -z-10 rounded-[4px] sm:h-3" />
            </span>
          </h1>
          <p className="mt-5 text-base md:text-lg text-neutral-600 max-w-xl mx-auto leading-relaxed">
            DeDato — сервис для индивидуальных мастеров: записи, клиенты и привычные рабочие шаги в одном месте, без
            лишней сложности.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center items-stretch sm:items-center">
            <Button variant="primary" size="lg" onClick={handleTryFree} className="w-full sm:w-auto">
              Попробовать бесплатно
              <ArrowRightIcon className="h-4 w-4 ml-2" />
            </Button>
            <Link
              to="/pricing"
              className="inline-flex items-center justify-center rounded-lg font-medium px-6 py-3 text-base border border-[#E7E2DF] bg-white text-neutral-900 hover:bg-[#FAFAF9] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#4CAF50] transition-colors w-full sm:w-auto"
            >
              Посмотреть тарифы
            </Link>
          </div>
        </section>

        {/* Направления ценности (без метрик и неподтверждённых цифр) */}
        <section aria-labelledby="about-stats-heading" className="mb-12 md:mb-16">
          <h2 id="about-stats-heading" className="sr-only">
            Что даёт DeDato
          </h2>
          <div className="rounded-2xl md:rounded-3xl border border-[#E7E2DF] overflow-hidden bg-[#E7E2DF] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px shadow-sm">
            {STATS.map((s) => (
              <StatCell key={s.title} title={s.title} text={s.text} />
            ))}
          </div>
        </section>

        {/* Ценности */}
        <section aria-labelledby="about-values-heading" className="mb-12 md:mb-16">
          <div className="text-center max-w-2xl mx-auto mb-10 md:mb-12">
            <h2
              id="about-values-heading"
              className="text-2xl md:text-3xl lg:text-[2.25rem] font-bold text-neutral-900 tracking-[-0.02em] leading-tight"
            >
              Зачем мы это делаем
            </h2>
            <p className="mt-3 text-base text-neutral-600 leading-relaxed">
              Коротко о том, на что опирается продукт — без обещаний «на весь рынок».
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-5">
            {VALUES.map(({ title, text, Icon }) => (
              <article
                key={title}
                className="rounded-2xl border border-[#E7E2DF] bg-[#F9F7F6] p-6 md:p-7 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-[#B1DBC4] hover:bg-white"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#DFF5EC] text-[#3D8B42] mb-4">
                  <Icon className="h-6 w-6" aria-hidden />
                </div>
                <h3 className="text-base font-semibold text-neutral-900 mb-2">{title}</h3>
                <p className="text-sm text-neutral-600 leading-relaxed">{text}</p>
              </article>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section aria-labelledby="about-cta-heading" className="pt-2">
          <div className="relative overflow-hidden rounded-[28px] bg-[#4CAF50] px-6 py-10 md:px-12 md:py-12 lg:flex lg:items-center lg:justify-between lg:gap-10">
            <div
              className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/[0.08]"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute right-12 bottom-[-40px] h-44 w-44 rounded-full bg-white/[0.05]"
              aria-hidden
            />
            <div className="relative max-w-xl lg:max-w-2xl text-center lg:text-left mx-auto lg:mx-0">
              <h2
                id="about-cta-heading"
                className="text-2xl md:text-3xl font-bold text-white tracking-[-0.02em] leading-tight"
              >
                Попробуйте DeDato и наведите порядок в записи клиентов
              </h2>
              <p className="mt-2 text-sm md:text-base text-white/85">
                Зарегистрируйтесь и посмотрите, как сервис ложится на ваш привычный день.
              </p>
            </div>
            <div className="relative mt-8 lg:mt-0 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-center lg:justify-end flex-shrink-0">
              <button
                type="button"
                onClick={handleTryFree}
                className="inline-flex items-center justify-center font-medium rounded-xl px-6 py-3 text-base bg-white text-[#1C1917] hover:bg-[#F4F1EF] shadow-md transition-colors"
              >
                Начать бесплатно
                <ArrowRightIcon className="h-4 w-4 ml-2 text-[#45A049]" />
              </button>
              <Link
                to="/pricing"
                className="inline-flex items-center justify-center rounded-xl px-5 py-3 text-base font-medium text-white border border-white/40 hover:bg-white/10 transition-colors"
              >
                Перейти к тарифам
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

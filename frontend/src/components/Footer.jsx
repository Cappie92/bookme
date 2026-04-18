import { Link } from 'react-router-dom'

export default function Footer({ compact = false }) {
  return (
    <footer
      className={
        compact
          ? 'py-1.5 px-3 max-md:rounded-t-xl md:py-3 md:px-6 md:rounded-t-2xl bg-[#F5F5F5] w-full relative z-40'
          : 'py-3 px-6 bg-[#F5F5F5] w-full rounded-t-2xl relative z-40'
      }
    >
      <div className="container mx-auto">
        {/* Описание системы */}
        <div
          className={
            compact
              ? 'text-center mb-1 md:mb-3'
              : 'text-center mb-3'
          }
        >
          <h3
            className={
              compact
                ? 'text-sm md:text-lg font-semibold text-neutral-800 mb-0 md:mb-1'
                : 'text-lg font-semibold text-neutral-800 mb-1'
            }
          >
            DeDato
          </h3>
          <p
            className={
              compact
                ? 'text-[11px] md:text-sm leading-snug text-neutral-600'
                : 'text-sm text-neutral-600'
            }
          >
            Система управления записями для индивидуальных мастеров
          </p>
        </div>

        {/* Навигация - горизонтально на десктопе, вертикально на мобильном */}
        <div
          className={
            compact
              ? 'flex flex-col md:flex-row flex-wrap justify-center gap-1 md:gap-4 mb-1 md:mb-3'
              : 'flex flex-col md:flex-row flex-wrap justify-center gap-2 md:gap-4 mb-3'
          }
        >
          <Link
            to="/"
            className={
              compact
                ? 'text-xs md:text-sm text-neutral-600 hover:text-neutral-900 transition-colors'
                : 'text-sm text-neutral-600 hover:text-neutral-900 transition-colors'
            }
          >
            Главная
          </Link>
          <Link
            to="/pricing"
            className={
              compact
                ? 'text-xs md:text-sm text-neutral-600 hover:text-neutral-900 transition-colors'
                : 'text-sm text-neutral-600 hover:text-neutral-900 transition-colors'
            }
          >
            Тарифы
          </Link>
          <Link
            to="/blog"
            className={
              compact
                ? 'text-xs md:text-sm text-neutral-600 hover:text-neutral-900 transition-colors'
                : 'text-sm text-neutral-600 hover:text-neutral-900 transition-colors'
            }
          >
            Блог
          </Link>
          <Link
            to="/about"
            className={
              compact
                ? 'text-xs md:text-sm text-neutral-600 hover:text-neutral-900 transition-colors'
                : 'text-sm text-neutral-600 hover:text-neutral-900 transition-colors'
            }
          >
            О нас
          </Link>
        </div>

        {/* Копирайт и контакты */}
        <div
          className={
            compact
              ? 'text-center text-[11px] md:text-sm text-neutral-500 leading-tight md:leading-normal'
              : 'text-center text-sm text-neutral-500'
          }
        >
          <div>
            <a href="mailto:support@dedato.ru" className="text-neutral-600 hover:text-neutral-900 transition-colors">
              support@dedato.ru
            </a>
          </div>
          <div className={compact ? 'mt-0.5 md:mt-1' : 'mt-1'}>
            © {new Date().getFullYear()} DeDato. Все права защищены.
          </div>
        </div>
      </div>
    </footer>
  )
} 
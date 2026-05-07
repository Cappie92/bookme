import { useState } from 'react'
import './HomeFeatureShowreel.css'
import {
  DesktopAnalytics,
  DesktopLoyalty,
  DesktopMaster,
  DesktopSchedule,
  DesktopSocial,
  MobileAnalytics,
  MobileLoyalty,
  MobileMaster,
  MobileSchedule,
  MobileSocial,
} from './HomeFeatureShowreelTemplates'

const SLIDES = [
  {
    title: 'Публичная страница мастера',
    desc: 'Аккуратная публичная страница с информацией о мастере, адресом, скидкой для клиента и пошаговой записью через услугу, дату и время.',
    caption:
      'Мастер видит, что клиенты будут записываться через понятный flow, а не через сложную CRM-форму.',
    Desktop: DesktopMaster,
    Mobile: MobileMaster,
  },
  {
    title: 'Расписание и гибкое управление услугами',
    desc: 'Экран расписания показывает, как мастер управляет днями, слотами и услугами, быстро замечая новые записи, занятые окна и свободные промежутки без перегруза интерфейса.',
    caption:
      'Слайд показывает аккуратное живое расписание: выбранный день, занятые и свободные окна, плюс две смысловые карточки поверх основного экрана.',
    Desktop: DesktopSchedule,
    Mobile: MobileSchedule,
  },
  {
    title: 'Аналитика',
    desc: 'Понятные KPI и тренды по выручке, загрузке и повторным визитам дают мастеру быстрый ответ, как растёт его практика и где есть возможности для роста.',
    caption: 'Экран аналитики остаётся прикладным: ключевые метрики, динамика и загрузка без выдуманного слоя функциональности.',
    Desktop: DesktopAnalytics,
    Mobile: MobileAnalytics,
  },
  {
    title: 'Лояльность',
    desc: 'Баллы, скидки и возврат клиентов встроены в продукт естественно: мастер понимает, кто вернётся, сколько бонусов накоплено и какие сценарии удержания доступны прямо в системе.',
    caption: 'Лояльность подана как рабочий инструмент: баллы, скидки и понятные состояния клиента внутри продукта.',
    Desktop: DesktopLoyalty,
    Mobile: MobileLoyalty,
  },
  {
    title: 'Создание поста для соцсетей',
    desc: 'Система помогает быстро собрать пост со свободными слотами на выбранный день, чтобы мастер мог открыть запись для своей лояльной аудитории без ручной сборки публикации.',
    caption:
      'Экран постов теперь строится вокруг выбранного дня: календарь с доступными окнами на фоне и сама готовая публикация поверх него.',
    Desktop: DesktopSocial,
    Mobile: MobileSocial,
  },
]

function SlidePager({ current, onPrev, onNext, onDot, count }) {
  return (
    <div className="pager">
      <button type="button" onClick={onPrev} aria-label="Предыдущий слайд">
        ←
      </button>
      <div className="dots">
        {Array.from({ length: count }, (_, i) => (
          <button
            key={i}
            type="button"
            className={i === current ? 'active' : ''}
            aria-label={`Слайд ${i + 1}`}
            aria-current={i === current ? true : undefined}
            onClick={() => onDot(i)}
          />
        ))}
      </div>
      <button type="button" onClick={onNext} aria-label="Следующий слайд">
        →
      </button>
    </div>
  )
}

export default function HomeFeatureShowreel() {
  const [current, setCurrent] = useState(0)
  const n = SLIDES.length
  const slide = SLIDES[current]
  const DesktopCmp = slide.Desktop
  const MobileCmp = slide.Mobile

  const goPrev = () => setCurrent((i) => (i - 1 + n) % n)
  const goNext = () => setCurrent((i) => (i + 1) % n)

  return (
    <div className="dedato-home-showreel w-full min-w-0 max-w-full overflow-x-hidden mt-8 md:mt-12 lg:mt-14">
      <section className="stage">
        <div className="frame desktop dedato-showreel-desktop-only">
          <div className="preview-shell min-w-0 dedato-showreel-desktop-preview-shell">
            <div className="dedato-showreel-desktop-card max-w-full">
              <div className="hero">
                <div className="hero-copy">
                  <h3>{slide.title}</h3>
                  <p>{slide.desc}</p>
                  <div className="copy-spacer" />
                </div>
                <div
                  className={`artboard min-w-0${[2, 3, 4].includes(current) ? ' artboard--float-visible' : ''}`}
                >
                  <DesktopCmp key={current} />
                </div>
              </div>
              <div className="caption">
                <div>
                  <div className="caption-title">{slide.title}</div>
                  <div className="caption-text">{slide.caption}</div>
                </div>
                <SlidePager
                  current={current}
                  onPrev={goPrev}
                  onNext={goNext}
                  onDot={setCurrent}
                  count={n}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="frame mobile dedato-showreel-mobile-only">
          <div className="preview-shell min-w-0 dedato-showreel-mobile-preview-shell">
            <div className="mobile-shell w-full max-w-[286px]">
              <div className="mobile-screen">
                <div className="mobile-status">
                  <span>18:30</span>
                  <span>Dedato</span>
                  <span>100%</span>
                </div>
                <div className="mobile-body">
                  <div className="mobile-card">
                    <div className="mshot min-w-0">
                      <MobileCmp key={current} />
                    </div>
                    <div className="mmeta">
                      <h4>{slide.title}</h4>
                      <p>{slide.desc}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="caption dedato-showreel-mobile-caption">
              <div>
                <div className="caption-title">{slide.title}</div>
                <div className="caption-text">{slide.caption}</div>
              </div>
              <SlidePager
                current={current}
                onPrev={goPrev}
                onNext={goNext}
                onDot={setCurrent}
                count={n}
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

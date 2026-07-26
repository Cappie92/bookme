import { useState } from 'react'
import './HomeFeatureShowreel.css'
import {
  DesktopAnalytics,
  DesktopBooking,
  DesktopLoyalty,
  DesktopMaster,
  DesktopSchedule,
  DesktopSocial,
  MobileAnalytics,
  MobileBooking,
  MobileLoyalty,
  MobileMaster,
  MobileSchedule,
  MobileSocial,
} from './HomeFeatureShowreelTemplates'

const SLIDES = [
  {
    title: 'Публичная страница мастера',
    desc: 'Аккуратная публичная страница с информацией о мастере, адресом, скидкой для клиента и пошаговой записью.',
    caption: 'Услуги, адрес и скидка — клиент сразу переходит к записи.',
    Desktop: DesktopMaster,
    Mobile: MobileMaster,
  },
  {
    title: 'Запись к мастеру',
    desc: 'Клиент выбирает услугу, дату и свободный слот и подтверждает запись без звонков.',
    caption: 'Услуга, дата и слот — запись за минуту, без звонков.',
    Desktop: DesktopBooking,
    Mobile: MobileBooking,
  },
  {
    title: 'Расписание',
    desc: 'Мастер видит день целиком: свободные окна, записи и загрузку без перегруза.',
    caption: 'Свободные окна и записи дня — всё на одном экране.',
    Desktop: DesktopSchedule,
    Mobile: MobileSchedule,
  },
  {
    title: 'Аналитика',
    desc: 'Выручка, загрузка и рост практики — понятные KPI и тренды сразу на экране.',
    caption: 'Выручка и рост практики — цифры, которые хочется открывать.',
    Desktop: DesktopAnalytics,
    Mobile: MobileAnalytics,
  },
  {
    title: 'Лояльность',
    desc: 'Баллы и скидки помогают возвращать клиентов без сложных настроек.',
    caption: 'Баллы и бонусы, которые клиенты реально хотят копить.',
    Desktop: DesktopLoyalty,
    Mobile: MobileLoyalty,
  },
  {
    title: 'Пост для соцсетей',
    desc: 'Свободные окна превращаются в готовый пост для аудитории мастера.',
    caption: 'Готовый пост — осталось нажать «Опубликовать».',
    Desktop: DesktopSocial,
    Mobile: MobileSocial,
  },
]

const DESKTOP_FLOAT_SLIDES = new Set([3, 4, 5])

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

function PhoneStatusBar() {
  return (
    <div className="mobile-status" aria-hidden>
      <span className="mobile-status-time">9:41</span>
      <span className="mobile-status-island" />
      <span className="mobile-status-icons">
        <i />
        <i />
        <i />
      </span>
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
    <div className="dedato-home-showreel w-full min-w-0 max-w-full overflow-x-hidden mt-5 md:mt-12 lg:mt-14">
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
                  className={`artboard min-w-0${DESKTOP_FLOAT_SLIDES.has(current) ? ' artboard--float-visible' : ''}`}
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
            <div className="dedato-showreel-mobile-stage">
              <div className="dedato-showreel-mobile-device">
                <div className="mobile-shell">
                  <div className="mobile-shell-side mobile-shell-side--left" aria-hidden />
                  <div className="mobile-shell-side mobile-shell-side--right" aria-hidden />
                  <div className="mobile-screen">
                    <PhoneStatusBar />
                    <div className="mobile-app" key={current}>
                      <MobileCmp />
                    </div>
                  </div>
                </div>
              </div>

              <div className="caption dedato-showreel-mobile-caption">
                <div className="dedato-showreel-mobile-copy">
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
      </section>
    </div>
  )
}

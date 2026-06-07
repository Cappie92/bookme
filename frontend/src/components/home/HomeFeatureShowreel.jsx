import { useCallback, useRef, useState } from 'react'
import './HomeFeatureShowreel.css'
import { slidesData } from './slidesData'
import { renderPhoneSlide } from './PhoneSlideRenderers'

const SLIDE_COUNT = slidesData.length
const SWIPE_THRESHOLD_PX = 48

function SliderPagination({ current, onDot, onPrev, onNext }) {
  const atStart = current === 0
  const atEnd = current === SLIDE_COUNT - 1

  return (
    <div className="slider-controls">
      <button
        type="button"
        className="slider-prev"
        aria-label="Предыдущий экран"
        onClick={onPrev}
        disabled={atStart}
      >
        ‹
      </button>
      <div className="slider-pagination" role="tablist" aria-label="Экраны продукта">
        {slidesData.map((slide, index) => (
          <button
            key={slide.id}
            type="button"
            role="tab"
            className={index === current ? 'active' : ''}
            aria-label={`Перейти к слайду ${index + 1}: ${slide.title}`}
            aria-selected={index === current}
            onClick={() => onDot(index)}
          />
        ))}
      </div>
      <button
        type="button"
        className="slider-next"
        aria-label="Следующий экран"
        onClick={onNext}
        disabled={atEnd}
      >
        ›
      </button>
    </div>
  )
}

export default function HomeFeatureShowreel() {
  const [activeSlide, setActiveSlide] = useState(0)
  const touchStartX = useRef(null)

  const goToSlide = useCallback((index) => {
    setActiveSlide(Math.max(0, Math.min(SLIDE_COUNT - 1, index)))
  }, [])

  const goPrev = useCallback(() => {
    goToSlide(activeSlide - 1)
  }, [activeSlide, goToSlide])

  const goNext = useCallback(() => {
    goToSlide(activeSlide + 1)
  }, [activeSlide, goToSlide])

  const onTouchStart = (e) => {
    touchStartX.current = e.changedTouches[0]?.clientX ?? null
  }

  const onTouchEnd = (e) => {
    const start = touchStartX.current
    if (start == null) return
    const end = e.changedTouches[0]?.clientX ?? start
    const delta = end - start
    touchStartX.current = null
    if (Math.abs(delta) < SWIPE_THRESHOLD_PX) return
    if (delta < 0) {
      setActiveSlide((i) => Math.min(SLIDE_COUNT - 1, i + 1))
    } else {
      setActiveSlide((i) => Math.max(0, i - 1))
    }
  }

  return (
    <section className="mobile-showcase dedato-home-showreel" aria-label="Превью мобильного приложения">
      <div className="phone-shell">
        <div className="phone-frame">
          <div className="phone-screen">
            <div className="phone-status-bar" aria-hidden="true">
              <span>9:41</span>
              <span>Dedato</span>
              <span>100%</span>
            </div>

            <div
              className="slider-viewport"
              onTouchStart={onTouchStart}
              onTouchEnd={onTouchEnd}
            >
              <div
                className="slider-track"
                style={{ transform: `translateX(-${activeSlide * 100}%)` }}
              >
                {slidesData.map((slide, index) => (
                  <div
                    key={slide.id}
                    className="slider-slide"
                    role="tabpanel"
                    aria-hidden={index !== activeSlide}
                    aria-label={slide.title}
                  >
                    {renderPhoneSlide(slide)}
                  </div>
                ))}
              </div>
            </div>

            <SliderPagination
              current={activeSlide}
              onDot={goToSlide}
              onPrev={goPrev}
              onNext={goNext}
            />
          </div>
        </div>
      </div>
    </section>
  )
}

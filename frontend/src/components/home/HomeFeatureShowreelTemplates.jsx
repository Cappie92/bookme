import { Fragment } from 'react'

const MASTER_PHOTO = '/showreel/master-anna.jpg'

function MasterAvatar({ className = 'm-book-avatar' }) {
  return <img className={className} src={MASTER_PHOTO} alt="" draggable={false} />
}

export function DesktopMaster() {
  return (
    <Fragment>
      <div className="mock-main master-preview">
        <div className="master-layout">
          <div className="master-side">
            <MasterAvatar className="avatar avatar--hero" />
            <div className="v1">Анна Смирнова</div>
            <div className="v2">Парикмахер · стилист · запись онлайн</div>
            <div className="master-meta-row">
              <span className="master-pill">★ 4.9</span>
              <span className="master-pill master-pill--soft">8 лет стажа</span>
            </div>
            <div className="label">Телефон</div>
            <div className="v1" style={{ color: '#3aa047' }}>
              +7 999 000 00 08
            </div>
            <div className="label">Адрес</div>
            <div className="v1">Москва · м. Сокол</div>
            <div className="v2">Салон рядом с метро, вход со двора</div>
            <div className="map-btn">Открыть в Яндекс Картах</div>
          </div>
          <div className="master-main">
            <div className="banner">Скидка на первый визит — 10%</div>
            <div className="label" style={{ margin: '0 0 6px' }}>
              Услуги
            </div>
            <div className="master-service">
              <div>
                <b>Стрижка женская</b>
                <span>60 мин</span>
              </div>
              <em>1 500 ₽</em>
            </div>
            <div className="master-service">
              <div>
                <b>Окрашивание</b>
                <span>120 мин</span>
              </div>
              <em>4 200 ₽</em>
            </div>
            <div className="master-review">
              <div className="master-review-top">
                <span>Мария С. · отзыв</span>
                <span>★ 5.0</span>
              </div>
              <p>«Подобрала форму идеально. Записалась снова через ссылку.»</p>
            </div>
            <div className="master-cta">Записаться онлайн</div>
          </div>
        </div>
      </div>
      <div className="float-card" style={{ top: 38, right: 0, width: 210, padding: '16px 18px' }}>
        <div style={{ fontSize: 12, color: '#7b857c', fontWeight: 700 }}>Рейтинг мастера</div>
        <div style={{ marginTop: 8, fontSize: 18, fontWeight: 800, letterSpacing: '-.03em' }}>★ 4.9</div>
        <div style={{ marginTop: 6, fontSize: 12, color: '#617061' }}>128 отзывов · онлайн-запись</div>
      </div>
    </Fragment>
  )
}

export function DesktopBooking() {
  return (
    <Fragment>
      <div className="mock-main master-preview">
        <div className="master-layout">
          <div className="master-side master-side--compact">
            <div className="master-book-head">
              <MasterAvatar className="avatar avatar--sm" />
              <div>
                <div className="v1">Анна Смирнова</div>
                <div className="v2">Москва · м. Сокол</div>
              </div>
            </div>
            <div className="master-book-badge">−10% первый визит</div>
            <div className="label">Адрес</div>
            <div className="v1">Москва</div>
            <div className="v2">Салон у метро, вход со двора</div>
            <div className="map-btn">Открыть в Яндекс Картах</div>
          </div>
          <div className="master-main">
            <div className="banner">Happy Hours до 12:00 — скидка 13%</div>
            <div className="step">
              <div className="label" style={{ margin: '0 0 6px' }}>
                1. Услуга
              </div>
              <div className="field">
                <span>Стрижка женская — 1 500 ₽, 60 мин</span>
                <span style={{ color: '#c38717', fontWeight: 800 }}>−13%</span>
              </div>
            </div>
            <div className="step">
              <div className="label" style={{ margin: '0 0 6px' }}>
                2. Дата
              </div>
              <div className="field">
                <span>Выбрано: 22 июля</span>
                <span style={{ color: '#4caf50', fontWeight: 700 }}>Изменить</span>
              </div>
            </div>
            <div className="step">
              <div className="label" style={{ margin: '0 0 6px' }}>
                3. Время
              </div>
              <div className="slots">
                <div className="slot">
                  10:30<small>−13%</small>
                </div>
                <div className="slot active">
                  11:00<small>−13%</small>
                </div>
                <div className="slot">11:30</div>
                <div className="slot">12:00</div>
              </div>
            </div>
            <div className="summary">
              <b>Итого:</b> 22 июля · 11:00
              <br />
              <b>Скидка:</b> −195 ₽ (13%) · <b>К оплате:</b> 1 305 ₽
            </div>
          </div>
        </div>
      </div>
      <div className="float-card" style={{ top: 38, right: 0, width: 210, padding: '16px 18px' }}>
        <div style={{ fontSize: 12, color: '#7b857c', fontWeight: 700 }}>Ближайшая запись</div>
        <div style={{ marginTop: 8, fontSize: 18, fontWeight: 800, letterSpacing: '-.03em' }}>11:00</div>
        <div style={{ marginTop: 6, fontSize: 12, color: '#617061' }}>Стрижка · −13%</div>
      </div>
    </Fragment>
  )
}

export function DesktopSchedule() {
  return (
    <Fragment>
      <div className="mock-main">
        <div className="sched-wrap">
          <div className="sched-frame">
            <div className="sched-top">
              <div>
                <div className="ui-title" style={{ fontSize: 18 }}>
                  Моё расписание
                </div>
                <div className="ui-sub">Вт, 22 июля · Анна Смирнова · 5 записей</div>
              </div>
              <div className="sched-nav">
                <button type="button">‹</button>
                <button type="button">›</button>
              </div>
            </div>
            <div className="week">
              {[
                ['Вс', '20'],
                ['Пн', '21'],
                ['Вт', '22', true],
                ['Ср', '23'],
                ['Чт', '24'],
                ['Пт', '25'],
                ['Сб', '26'],
              ].map(([w, d, active]) => (
                <div key={d} className={`day${active ? ' active' : ''}`}>
                  <div className="d1">{w}</div>
                  <div className="d2">{d}</div>
                </div>
              ))}
            </div>
            <div className="appt">
              <div>10:00</div>
              <div className="dotline" />
              <div>
                <div>Женская стрижка</div>
                <div>Анна К. · 1 500 ₽</div>
              </div>
            </div>
            <div className="appt yellow">
              <div>11:30</div>
              <div className="dotline" />
              <div>
                <div>Окрашивание + уход</div>
                <div>Мария С. · 4 200 ₽</div>
              </div>
            </div>
            <div className="appt gray">
              <div>14:00</div>
              <div className="dotline" />
              <div>
                <div>— свободно —</div>
                <div>Открыть запись · 60 мин</div>
              </div>
            </div>
            <div className="appt">
              <div>15:00</div>
              <div className="dotline" />
              <div>
                <div>Укладка</div>
                <div>Катя Л. · 900 ₽</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="float-card money-card">
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 16,
              background: '#e8faf0',
              display: 'grid',
              placeItems: 'center',
              color: '#3aa047',
              fontSize: 24,
            }}
          >
            ↗
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#7a857a', fontWeight: 700 }}>Выручка · июль</div>
            <div className="big">+ 92 400 ₽</div>
          </div>
        </div>
      </div>
      <div className="float-card new-card schedule-new-float">
        <div className="new-card-body">
          <div className="new-card-icon" aria-hidden>
            +
          </div>
          <div className="new-card-copy">
            <div className="new-card-label">Новая запись</div>
            <div className="new-card-title">Ольга П. · маникюр</div>
          </div>
        </div>
      </div>
    </Fragment>
  )
}

const chartSvg = (
  <svg viewBox="0 0 180 70" fill="none" aria-hidden>
    <path
      d="M6 54 C26 48, 32 32, 48 34 S76 14, 96 18 S126 46, 148 28 S166 20, 174 8"
      stroke="#53ba5c"
      strokeWidth="4"
      strokeLinecap="round"
    />
    <circle cx="174" cy="8" r="4" fill="#53ba5c" />
    <path d="M6 62 H174" stroke="#e3e8df" strokeWidth="2" />
  </svg>
)

export function DesktopAnalytics() {
  return (
    <Fragment>
      <div className="mock-main">
        <div className="analytics">
          <div className="kpi kpi--accent">
            <div className="k1">Выручка за месяц</div>
            <div className="k2">92 400 ₽</div>
            <div className="k3">
              <span className="kpi-chip">↗ +14%</span> к прошлому месяцу
            </div>
          </div>
          <div className="kpi">
            <div className="k1">Повторные визиты</div>
            <div className="k2">38%</div>
            <div className="k3">
              <span className="kpi-chip">↗ +6 п.п.</span> к марту
            </div>
          </div>
          <div className="kpi">
            <div className="k1">Средний чек</div>
            <div className="k2">2 180 ₽</div>
            <div className="k3">
              <span className="kpi-chip">↗ +5%</span> за счёт комплексов
            </div>
          </div>
          <div className="chart-card">
            <div className="chart-card-head">
              <div>
                <div className="ui-title">Динамика выручки</div>
                <div className="ui-sub">Последние 6 недель · Анна Смирнова</div>
              </div>
              <span className="kpi-chip">План 78%</span>
            </div>
            <div className="bars">
              <div className="bar" style={{ height: 52 }} />
              <div className="bar b2" />
              <div className="bar b3" />
              <div className="bar b4 is-peak" />
              <div className="bar b5" />
              <div className="bar b6 is-now" />
            </div>
            <div className="analytics-progress" aria-hidden>
              <span style={{ width: '78%' }} />
            </div>
            <div className="mini-stack">
              <div className="tiny-kpi">
                <div className="k1">Записей за месяц</div>
                <div className="k2">128</div>
                <div className="k3">Плотная запись в середине недели</div>
              </div>
              <div className="tiny-kpi">
                <div className="k1">Отмены</div>
                <div className="k2">7</div>
                <div className="k3">Низкий уровень отмен и переносов</div>
              </div>
            </div>
          </div>
          <div className="small-chart">
            <div className="ui-title">Загрузка по дням</div>
            <div className="ui-sub">Процент занятых слотов</div>
            <div className="line">{chartSvg}</div>
            <div className="table-mini">
              {[
                ['Пн', '68%', false],
                ['Вт', '74%', false],
                ['Ср', '71%', false],
                ['Чт', '89%', true],
              ].map(([a, b, hot]) => (
                <div key={a} className={`row${hot ? ' row--hot' : ''}`}>
                  <span>{a}</span>
                  <b>{b}</b>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="float-card analytics-insight-float">
        <div style={{ fontSize: 11, color: '#7b857c', fontWeight: 700 }}>Срез месяца</div>
        <div className="analytics-insight-float__text">
          Выручка растёт, а повторные визиты удерживаются выше 35%
        </div>
      </div>
    </Fragment>
  )
}

export function DesktopLoyalty() {
  return (
    <Fragment>
      <div className="mock-main">
        <div className="loyal-grid">
          <div className="wallet">
            <div>
              <div className="wallet-top">
                <div className="w1">Баллы клиентов</div>
                <span className="wallet-level">Уровень Gold</span>
              </div>
              <div className="w2">12 480</div>
              <div className="w3">готовы к списанию</div>
              <div className="wallet-meter" aria-hidden>
                <span style={{ width: '64%' }} />
              </div>
              <div className="wallet-meter-meta">до следующего уровня — 1 520 баллов</div>
            </div>
            <div className="wallet-meta">
              <div className="wallet-stat">+18% к прошлому месяцу</div>
              <div className="wallet-stat">+120 баллов после каждого визита</div>
            </div>
          </div>
          <div className="stat-stack">
            <div className="mini-panel">
              <div className="ui-title">Лояльный клиент</div>
              <div className="ui-sub">Екатерина Л. · 740 баллов доступны к списанию</div>
              <div className="benefits-list">
                <div className="benefit">
                  <b>Бонус за визит</b>
                  <span>+120 баллов после оплаты</span>
                </div>
                <div className="coupon loyalty-coupon-compact">
                  <span>Скидка</span>
                  <b>−300 ₽</b>
                </div>
              </div>
            </div>
            <div className="mini-panel">
              <div className="ui-title">История начислений</div>
              <div className="loyal-history">
                <div>
                  <span>Стрижка · 22 июля</span>
                  <b>+120</b>
                </div>
                <div>
                  <span>Окрашивание · 14 июля</span>
                  <b>+240</b>
                </div>
                <div>
                  <span>Укладка · 3 июля</span>
                  <b>+80</b>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="float-card loyalty-client-float">
        <div style={{ fontSize: 11, color: '#7b857c', fontWeight: 700 }}>Лояльный клиент</div>
        <div style={{ fontSize: 16, fontWeight: 800, marginTop: 4, letterSpacing: '-.02em' }}>Екатерина Л.</div>
        <div style={{ marginTop: 4, fontSize: 12, color: '#5f6e5f', lineHeight: 1.35 }}>
          740 баллов · уровень Gold
        </div>
      </div>
    </Fragment>
  )
}

export function DesktopSocial() {
  return (
    <Fragment>
      <div className="mock-main">
        <div className="social-layout calendar-mode">
          <div className="calendar-bg">
            <div className="calendar-sheet calendar-sheet--social-desktop">
              <div className="calendar-month">
                <div className="calendar-month-head">
                  <div className="ui-title social-showreel-card-title">Свободные часы</div>
                  <div className="ui-sub">вторник, 23 июля</div>
                </div>
                <div className="m-chip m-chip--social-tight">для публикации</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
                <MasterAvatar className="social-avatar-placeholder" />
                <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1.1 }}>
                  Анна Смирнова
                </div>
              </div>
              <div className="calendar-grid">
                {[
                  ['11:00', 'стрижка женская', true],
                  ['12:30', 'укладка'],
                  ['15:00', 'окрашивание'],
                  ['16:00', 'стрижка женская'],
                  ['17:00', 'маникюр'],
                  ['18:00', 'укладка'],
                ].map(([t, s, active]) => (
                  <div key={t} className={`slot-card${active ? ' active' : ''}`}>
                    <b>{t}</b>
                    <span>{s}</span>
                    <i />
                  </div>
                ))}
              </div>
              <div
                style={{
                  position: 'absolute',
                  left: 18,
                  right: 18,
                  bottom: 16,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: 12,
                  color: '#6a756a',
                }}
              >
                <span>Запись: dedato.ru/m/anna</span>
                <span style={{ fontWeight: 800, color: '#38a144' }}>dedato</span>
              </div>
            </div>
          </div>
          <div className="post-generator">
            <div className="post-sheet">
              <div className="post-headline">
                <b className="social-showreel-card-title">Пост со свободными слотами</b>
                <span>Готовая публикация для аудитории Анны</span>
              </div>
              <div className="generated-post">
                <div className="post-hero post-hero--photo">
                  <MasterAvatar className="post-hero-photo" />
                  <div className="post-hero-veil">
                    <h5 className="social-showreel-card-title">Свободные окна на 23 июля</h5>
                    <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.45, color: 'rgba(255,255,255,.92)' }}>
                      Есть время для записи — выберите удобный слот.
                    </div>
                  </div>
                </div>
                <div className="slots-preview-grid" style={{ marginTop: 12 }}>
                  <div className="slot-mini">
                    11:00<span>стрижка женская</span>
                  </div>
                  <div className="slot-mini">
                    12:30<span>укладка</span>
                  </div>
                  <div className="slot-mini">
                    15:00<span>окрашивание</span>
                  </div>
                  <div className="slot-mini">
                    17:00<span>маникюр</span>
                  </div>
                </div>
                <div className="post-cap">
                  <b>Анна Смирнова</b>
                  <br />
                  Запись онлайн · dedato.ru — осталось нажать «Опубликовать».
                </div>
                <div className="actions">
                  <div className="a">Опубликовать</div>
                  <div className="a secondary">Скопировать текст</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="float-card social-slots-float">
        <div style={{ fontSize: 11, color: '#7b857c', fontWeight: 700 }}>Публикация по слотам</div>
        <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.22, marginTop: 4, letterSpacing: '-.02em' }}>
          Свободные окна на выбранный день
        </div>
      </div>
    </Fragment>
  )
}

export function MobileBooking() {
  return (
    <div className="m-app m-app--booking">
      <div className="m-app-nav">
        <span className="m-app-nav-back" aria-hidden>
          ‹
        </span>
        <span className="m-app-nav-title">Запись</span>
        <span className="m-app-nav-spacer" />
      </div>
      <div className="m-app-scroll">
        <div className="m-book-master">
          <MasterAvatar className="m-book-avatar" />
          <div className="m-book-master-copy">
            <div className="m-book-name">Анна Смирнова</div>
            <div className="m-book-meta">Москва · м. Сокол</div>
          </div>
          <div className="m-book-badge">−10%</div>
        </div>

        <div className="m-book-section">
          <div className="m-book-label">1. Услуга</div>
          <div className="m-book-row m-book-row--active">
            <div>
              <div className="m-book-row-title">Стрижка женская</div>
              <div className="m-book-row-sub">1 500 ₽ · 60 мин</div>
            </div>
            <span className="m-book-check" aria-hidden>
              ✓
            </span>
          </div>
        </div>

        <div className="m-book-section">
          <div className="m-book-label">2. Дата</div>
          <div className="m-book-dates">
            {[
              ['Пн', '21'],
              ['Вт', '22', true],
              ['Ср', '23'],
              ['Чт', '24'],
              ['Пт', '25'],
            ].map(([w, d, active]) => (
              <div key={d} className={`m-book-date${active ? ' is-active' : ''}`}>
                <span>{w}</span>
                <b>{d}</b>
              </div>
            ))}
          </div>
        </div>

        <div className="m-book-section">
          <div className="m-book-label">3. Время</div>
          <div className="m-book-slots">
            <div className="m-book-slot">
              10:30<small>−13%</small>
            </div>
            <div className="m-book-slot is-active">
              11:00<small>−13%</small>
            </div>
            <div className="m-book-slot">11:30</div>
            <div className="m-book-slot">12:00</div>
            <div className="m-book-slot">12:30</div>
            <div className="m-book-slot">14:00</div>
          </div>
        </div>

        <div className="m-book-summary">
          <div>Стрижка · 22 июля · 11:00</div>
          <b>К оплате 1 305 ₽</b>
        </div>
      </div>
      <div className="m-app-cta">Записаться</div>
    </div>
  )
}

export function MobileMaster() {
  return (
    <div className="m-app m-app--master">
      <div className="m-app-nav">
        <span className="m-app-nav-back" aria-hidden>
          ‹
        </span>
        <span className="m-app-nav-title">Мастер</span>
        <span className="m-app-nav-spacer" />
      </div>
      <div className="m-app-scroll">
        <div className="m-pub-hero">
          <MasterAvatar className="m-pub-avatar" />
          <div className="m-pub-name">Анна Смирнова</div>
          <div className="m-pub-role">Парикмахер · стилист</div>
          <div className="m-pub-addr">Москва · салон у м. Сокол</div>
          <div className="m-pub-actions">
            <span>Карта</span>
            <span>Позвонить</span>
          </div>
        </div>
        <div className="m-pub-banner">Скидка на первый визит — 10%</div>
        <div className="m-book-label">Услуги</div>
        <div className="m-pub-service">
          <div>
            <div className="m-book-row-title">Стрижка женская</div>
            <div className="m-book-row-sub">60 мин</div>
          </div>
          <b>1 500 ₽</b>
        </div>
        <div className="m-pub-service">
          <div>
            <div className="m-book-row-title">Окрашивание</div>
            <div className="m-book-row-sub">120 мин</div>
          </div>
          <b>4 200 ₽</b>
        </div>
        <div className="m-pub-service">
          <div>
            <div className="m-book-row-title">Укладка</div>
            <div className="m-book-row-sub">40 мин</div>
          </div>
          <b>900 ₽</b>
        </div>
      </div>
      <div className="m-app-cta">Записаться онлайн</div>
    </div>
  )
}

export function MobileSchedule() {
  return (
    <div className="m-app m-app--sched">
      <div className="m-app-nav m-app-nav--plain">
        <span className="m-app-nav-title">Моё расписание</span>
      </div>
      <div className="m-app-scroll">
        <div className="m-sched-toolbar">
          <span>‹</span>
          <b>Сегодня</b>
          <span>›</span>
        </div>
        <div className="m-sched-date">Вторник, 22 июля</div>
        <div className="m-sched-kpi">
          <div>
            <span>Свободно</span>
            <b>3.5 ч</b>
          </div>
          <div>
            <span>Занято</span>
            <b>4 ч</b>
          </div>
          <div>
            <span>Записей</span>
            <b>5</b>
          </div>
        </div>
        <div className="m-sched-timeline">
          <div className="m-sched-row m-sched-row--busy">
            <span>10:00</span>
            <div>
              <b>Стрижка</b>
              <small>Анна К. · 1 500 ₽</small>
            </div>
          </div>
          <div className="m-sched-row m-sched-row--free">
            <span>11:00</span>
            <div>
              <b>Свободно</b>
              <small>Открыть запись</small>
            </div>
          </div>
          <div className="m-sched-row m-sched-row--busy m-sched-row--accent">
            <span>11:30</span>
            <div>
              <b>Окрашивание</b>
              <small>Мария С. · 4 200 ₽</small>
            </div>
          </div>
          <div className="m-sched-row m-sched-row--free">
            <span>14:00</span>
            <div>
              <b>Свободно</b>
              <small>Окно 60 мин</small>
            </div>
          </div>
          <div className="m-sched-row m-sched-row--busy">
            <span>15:00</span>
            <div>
              <b>Укладка</b>
              <small>Катя Л. · 900 ₽</small>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function MobileAnalytics() {
  return (
    <div className="m-app m-app--stats">
      <div className="m-app-nav m-app-nav--plain">
        <span className="m-app-nav-title">Статистика</span>
      </div>
      <div className="m-app-scroll">
        <div className="m-stats-period">
          <span>Неделя</span>
          <span className="is-active">Месяц</span>
          <span>Год</span>
        </div>
        <div className="m-stats-hero">
          <div className="m-stats-hero-top">
            <span>Выручка за июль</span>
            <em className="m-stats-chip">↗ +14%</em>
          </div>
          <b className="m-stats-hero-value">92 400 ₽</b>
          <div className="m-stats-hero-sub">на 11 400 ₽ больше июня</div>
          <div className="m-stats-progress" aria-hidden>
            <span style={{ width: '78%' }} />
          </div>
          <div className="m-stats-progress-meta">
            <span>План 118 000 ₽</span>
            <b>78%</b>
          </div>
        </div>
        <div className="m-stats-kpis m-stats-kpis--compact">
          <div className="m-stats-kpi">
            <span>Записи</span>
            <b>128</b>
            <em>+9%</em>
          </div>
          <div className="m-stats-kpi">
            <span>Средний чек</span>
            <b>2 180 ₽</b>
            <em>+5%</em>
          </div>
        </div>
        <div className="m-stats-chart">
          <div className="m-stats-chart-head">
            <b>Динамика</b>
            <span>по неделям</span>
          </div>
          <div className="m-stats-bars m-stats-bars--rich" aria-hidden>
            <i style={{ height: '38%' }} />
            <i style={{ height: '52%' }} />
            <i style={{ height: '44%' }} />
            <i className="is-peak" style={{ height: '86%' }} />
            <i style={{ height: '68%' }} />
            <i style={{ height: '74%' }} />
            <i className="is-now" style={{ height: '92%' }} />
          </div>
          <div className="m-stats-bars-labels" aria-hidden>
            <span>1</span>
            <span>2</span>
            <span>3</span>
            <span>4</span>
            <span>5</span>
            <span>6</span>
            <span>7</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export function MobileLoyalty() {
  return (
    <div className="m-app m-app--loyal">
      <div className="m-app-nav m-app-nav--plain">
        <span className="m-app-nav-title">Лояльность</span>
      </div>
      <div className="m-app-scroll">
        <div className="m-loyal-tabs">
          <span>Скидки</span>
          <span className="is-active">Баллы</span>
        </div>
        <div className="m-loyal-wallet">
          <div className="m-loyal-wallet-top">
            <span>Баллы клиентов</span>
            <span className="m-loyal-gift" aria-hidden>
              ✦
            </span>
          </div>
          <b>12 480</b>
          <em>готовы к списанию</em>
          <div className="m-loyal-meter" aria-hidden>
            <span style={{ width: '64%' }} />
          </div>
          <div className="m-loyal-meter-meta">до следующего уровня — 1 520 баллов</div>
        </div>
        <div className="m-loyal-bonus">
          <div className="m-loyal-bonus-icon" aria-hidden>
            ★
          </div>
          <div className="m-loyal-bonus-copy">
            <b>Бонус за визит</b>
            <span>+120 баллов после оплаты</span>
          </div>
        </div>
        <div className="m-loyal-card m-loyal-card--warm">
          <div>
            <div className="m-book-row-title">Первый визит</div>
            <div className="m-book-row-sub">Для новых клиентов</div>
          </div>
          <b className="m-loyal-pct">−10%</b>
        </div>
        <div className="m-loyal-card">
          <div>
            <div className="m-book-row-title">Happy Hours</div>
            <div className="m-book-row-sub">Будни до 12:00</div>
          </div>
          <b className="m-loyal-pct">−13%</b>
        </div>
      </div>
    </div>
  )
}

export function MobileSocial() {
  return (
    <div className="m-app m-app--social">
      <div className="m-app-nav m-app-nav--plain">
        <span className="m-app-nav-title">Свободные окна</span>
      </div>
      <div className="m-app-scroll">
        <div className="m-social-periods">
          <span>Сегодня</span>
          <span className="is-active">Завтра</span>
          <span>Неделя</span>
        </div>
        <div className="m-social-card m-social-card--hero">
          <div className="m-social-banner">
            <MasterAvatar className="m-social-avatar m-social-avatar--lg" />
            <div className="m-social-banner-copy">
              <b>Анна Смирнова</b>
              <span>Свободные окна · 23 июля</span>
            </div>
          </div>
          <div className="m-social-preview">
            <div className="m-social-media" aria-hidden>
              <MasterAvatar className="m-social-media-photo" />
              <div className="m-social-media-veil">
                <span>Свободные окна</span>
                <b>23 июля</b>
              </div>
            </div>
            <div className="m-social-preview-label">Есть время для записи</div>
            <div className="m-social-slots">
              <span>11:00</span>
              <span>12:30</span>
              <span>15:00</span>
              <span>17:30</span>
            </div>
          </div>
          <div className="m-social-brand">
            <span className="m-social-brand-mark" aria-hidden />
            <span>Запись онлайн · dedato.ru</span>
          </div>
          <div className="m-social-actions">
            <div className="m-social-btn m-social-btn--primary">Опубликовать</div>
            <div className="m-social-btn">Сохранить</div>
          </div>
        </div>
      </div>
    </div>
  )
}


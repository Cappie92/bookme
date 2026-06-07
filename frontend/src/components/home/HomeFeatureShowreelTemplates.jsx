import { Fragment } from 'react'

export function DesktopMaster() {
  return (
    <Fragment>
      <div className="mock-main master-preview">
        <div className="master-layout">
          <div className="master-side">
            <div className="avatar" />
            <div className="v1">Мастер Premium 8</div>
            <div className="v2">Мастер принимает по записи</div>
            <div className="label">Телефон</div>
            <div className="v1" style={{ color: '#3aa047' }}>
              +7 999 000 00 08
            </div>
            <div className="label">Адрес</div>
            <div className="v1">Москва</div>
            <div className="v2">Салон рядом с метро, вход со двора</div>
            <div className="map-btn">Открыть в Яндекс Картах</div>
            <div className="label">Местное время</div>
            <div className="v2">Москва (UTC+3)</div>
          </div>
          <div className="master-main">
            <div className="banner">Скидка на первый визит — 10%</div>
            <div className="step">
              <div className="label" style={{ margin: '0 0 6px' }}>
                1. Услуга
              </div>
              <div className="field">
                <span>Стрижка мужская — 1000 ₽, 30 мин</span>
                <span style={{ color: '#c38717', fontWeight: 800 }}>−9%</span>
              </div>
            </div>
            <div className="step">
              <div className="label" style={{ margin: '0 0 6px' }}>
                2. Дата
              </div>
              <div className="field">
                <span>Выбрано: Завтра</span>
                <span style={{ color: '#4caf50', fontWeight: 700 }}>Изменить дату</span>
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
                <div className="slot">12:30</div>
                <div className="slot">13:00</div>
                <div className="slot">13:30</div>
                <div className="slot">14:00</div>
              </div>
            </div>
            <div className="summary">
              <b>Услуга:</b> Стрижка мужская — 1000 ₽, 30 мин
              <br />
              <b>Дата:</b> Завтра
              <br />
              <b>Время:</b> 11:00
              <br />
              <b>Скидка:</b> −130 ₽ (13%)
              <br />
              <b>К оплате:</b> 870 ₽
            </div>
          </div>
        </div>
      </div>
      <div className="float-card" style={{ top: 38, right: 0, width: 210, padding: '16px 18px' }}>
        <div style={{ fontSize: 12, color: '#7b857c', fontWeight: 700 }}>Ближайшая запись</div>
        <div style={{ marginTop: 8, fontSize: 18, fontWeight: 800, letterSpacing: '-.03em' }}>11:00</div>
        <div style={{ marginTop: 6, fontSize: 12, color: '#617061' }}>Стрижка мужская</div>
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
                <div className="ui-sub">Пн, 21 апреля · 5 записей</div>
              </div>
              <div className="sched-nav">
                <button type="button">‹</button>
                <button type="button">›</button>
              </div>
            </div>
            <div className="week">
              {[
                ['Вс', '20'],
                ['Пн', '21', true],
                ['Вт', '22'],
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
                <div>Слот можно открыть для записи</div>
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
            <div style={{ fontSize: 12, color: '#7a857a', fontWeight: 700 }}>Выручка · апрель</div>
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
    <path d="M6 62 H174" stroke="#e3e8df" strokeWidth="2" />
  </svg>
)

export function DesktopAnalytics() {
  return (
    <Fragment>
      <div className="mock-main">
        <div className="analytics">
          <div className="kpi">
            <div className="k1">Выручка за месяц</div>
            <div className="k2">92 400 ₽</div>
            <div className="k3">+14% к прошлому месяцу</div>
          </div>
          <div className="kpi">
            <div className="k1">Повторные визиты</div>
            <div className="k2">38%</div>
            <div className="k3">+6 п.п. к марту</div>
          </div>
          <div className="kpi">
            <div className="k1">Средний чек</div>
            <div className="k2">1 860 ₽</div>
            <div className="k3">рост за счёт комплексных услуг</div>
          </div>
          <div className="chart-card">
            <div className="ui-title">Динамика выручки</div>
            <div className="ui-sub">Последние 6 недель</div>
            <div className="bars">
              <div className="bar" style={{ height: 72 }} />
              <div className="bar b2" />
              <div className="bar b3" />
              <div className="bar b4" />
              <div className="bar b5" />
              <div className="bar b6" />
            </div>
            <div className="mini-stack">
              <div className="tiny-kpi">
                <div className="k1">Записей за месяц</div>
                <div className="k2">146</div>
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
                ['Пн', '68%'],
                ['Вт', '74%'],
                ['Ср', '71%'],
                ['Чт', '89%'],
              ].map(([a, b]) => (
                <div key={a} className="row">
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
              <div className="w1">Программа лояльности</div>
              <div className="w2">12 480</div>
              <div className="w3">активных баллов у клиентов</div>
            </div>
            <div className="wallet-meta">
              <div className="wallet-stat">+18% к прошлому месяцу</div>
              <div className="wallet-stat">72% клиентов используют бонусы повторно</div>
            </div>
          </div>
          <div className="stat-stack">
            <div className="mini-panel">
              <div className="ui-title">Лояльный клиент</div>
              <div className="ui-sub">Екатерина Л. · 740 баллов доступны к списанию</div>
              <div className="benefits-list">
                <div className="benefit">
                  <b>Персональная скидка</b>
                  <span>Для новых клиентов — 10%</span>
                </div>
                <div className="coupon loyalty-coupon-compact">
                  <span>Скидка</span>
                  <b>−300 ₽</b>
                </div>
              </div>
            </div>
            <div className="mini-panel">
              <div className="ui-title">Сценарии удержания</div>
              <div className="benefits-list">
                <div className="benefit">
                  <b>Баллы после визита</b>
                  <span>Начисляются автоматически после завершения записи</span>
                </div>
                <div className="benefit">
                  <b>Мягкий возврат клиента</b>
                  <span>Скидка и бонусы подталкивают к повторной записи</span>
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
          740 баллов доступны к списанию
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
                  <div className="ui-sub">вторник, 12 мая 2026 г.</div>
                </div>
                <div className="m-chip m-chip--social-tight">для публикации</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
                <div className="social-avatar-placeholder" aria-hidden="true">
                  <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="24" cy="17" r="9" fill="#c8d2c8" />
                    <path
                      d="M10 39.5c0-7.732 6.268-14 14-14s14 6.268 14 14"
                      stroke="#9aaa9a"
                      strokeWidth="2.25"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1.1 }}>
                  Мастер
                </div>
              </div>
              <div className="calendar-grid">
                {[
                  ['11:00', 'стрижка мужская', true],
                  ['12:00', 'стрижка женская'],
                  ['13:00', 'окрашивание корней'],
                  ['14:00', 'укладка'],
                  ['15:00', 'маникюр'],
                  ['16:00', 'стрижка мужская'],
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
                <span>Запись: dedato.ru/m/master</span>
                <span style={{ fontWeight: 800, color: '#38a144' }}>dedato</span>
              </div>
            </div>
          </div>
          <div className="post-generator">
            <div className="post-sheet">
              <div className="post-headline">
                <b className="social-showreel-card-title">Пост со свободными слотами</b>
                <span>Готовая публикация для своей лояльной аудитории на выбранный день</span>
              </div>
              <div className="generated-post">
                <div className="post-hero">
                  <div>
                    <h5 className="social-showreel-card-title">Свободные окна на 12 мая</h5>
                    <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.5, color: '#55705a' }}>
                      Откройте запись по ссылке и выберите удобное время.
                    </div>
                  </div>
                  <div className="slots-preview-grid">
                    <div className="slot-mini">
                      11:00<span>стрижка мужская</span>
                    </div>
                    <div className="slot-mini">
                      13:00<span>окрашивание корней</span>
                    </div>
                    <div className="slot-mini">
                      15:00<span>маникюр</span>
                    </div>
                    <div className="slot-mini">
                      16:00<span>стрижка мужская</span>
                    </div>
                  </div>
                </div>
                <div className="post-cap">
                  <b>Мастер</b>
                  <br />
                  Система собирает пост по свободным слотам на выбранный день, а мастеру остаётся только проверить и
                  опубликовать.
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

export function MobileMaster() {
  return (
    <div className="m-master">
      <div className="m-head">Запись к мастеру</div>
      <div className="m-pad">
        <div className="m-chip">скидка 10%</div>
        <div style={{ marginTop: 10, fontSize: 18, fontWeight: 800 }}>Мастер Premium 8</div>
        <div
          style={{
            marginTop: 10,
            height: 44,
            border: '1px solid #dfe6dc',
            borderRadius: 14,
            padding: '12px 14px',
            fontSize: 12,
          }}
        >
          Стрижка мужская — 1000 ₽
        </div>
        <div
          style={{
            marginTop: 8,
            height: 44,
            border: '1px solid #dfe6dc',
            borderRadius: 14,
            padding: '12px 14px',
            fontSize: 12,
          }}
        >
          Завтра
        </div>
        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
          <div className="slot">
            10:30<small>−13%</small>
          </div>
          <div className="slot active">
            11:00<small>−13%</small>
          </div>
          <div className="slot">11:30</div>
          <div className="slot">12:00</div>
        </div>
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 16,
            background: '#eef9ef',
            border: '1px solid #d7efd8',
            fontSize: 11,
            lineHeight: 1.5,
          }}
        >
          К оплате: <b>870 ₽</b>
          <br />
          Запись подтверждается после выбора слота
        </div>
      </div>
    </div>
  )
}

export function MobileSchedule() {
  return (
    <div className="m-sched">
      <div className="m-head">Моё расписание</div>
      <div className="m-pad">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
          {[
            ['Пн', '21'],
            ['Вт', '22', true],
            ['Ср', '23'],
            ['Чт', '24'],
          ].map(([w, d, active]) => (
            <div key={d} className={`day${active ? ' active' : ''}`}>
              <div className="d1">{w}</div>
              <div className="d2">{d}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12 }} className="appt">
          <div style={{ fontSize: 14 }}>10:00</div>
          <div className="dotline" />
          <div>
            <div style={{ fontSize: 14, fontWeight: 800 }}>Стрижка</div>
            <div style={{ fontSize: 11, color: '#5f6c5f' }}>1 500 ₽</div>
          </div>
        </div>
        <div className="appt yellow">
          <div style={{ fontSize: 14 }}>11:30</div>
          <div className="dotline" />
          <div>
            <div style={{ fontSize: 14, fontWeight: 800 }}>Окрашивание</div>
            <div style={{ fontSize: 11, color: '#766a55' }}>4 200 ₽</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function MobileAnalytics() {
  return (
    <div className="m-analytics">
      <div className="m-head">Аналитика</div>
      <div className="m-pad">
        <div className="kpi">
          <div className="k1">Выручка</div>
          <div className="k2" style={{ fontSize: 22 }}>
            92 400 ₽
          </div>
          <div className="k3">+14%</div>
        </div>
        <div style={{ marginTop: 12 }} className="small-chart">
          <div className="ui-title">Загрузка</div>
          <div className="line">{chartSvg}</div>
        </div>
      </div>
    </div>
  )
}

export function MobileLoyalty() {
  return (
    <div className="m-loyal">
      <div className="m-head">Лояльность</div>
      <div className="m-pad">
        <div className="wallet" style={{ minHeight: 180, padding: 16 }}>
          <div className="w1">Баллы клиентов</div>
          <div className="w2" style={{ fontSize: 32 }}>
            12 480
          </div>
          <div className="w3">готовы к списанию</div>
        </div>
        <div className="coupon">
          <span>Скидка на первый визит</span>
          <b>10%</b>
        </div>
      </div>
    </div>
  )
}

export function MobileSocial() {
  return (
    <div className="m-social">
      <div className="m-head">Пост для соцсетей</div>
      <div className="m-pad">
        <div className="textarea" style={{ height: 120 }}>
          Сегодня у мастера 5 завершённых записей и несколько свободных окон на завтра. Готовый пост уже собран
          автоматически.
        </div>
        <div className="post-img" style={{ marginTop: 12, height: 120, borderRadius: 18 }}>
          Свободные окна
        </div>
        <div className="actions">
          <div className="a">Опубликовать</div>
        </div>
      </div>
    </div>
  )
}

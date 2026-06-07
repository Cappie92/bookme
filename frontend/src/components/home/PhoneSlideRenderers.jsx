import { PRICING_PLANS } from './slidesData'

function AppBar({ title }) {
  return (
    <div className="phone-app-bar">
      <span className="phone-app-bar__back" aria-hidden="true">
        ‹
      </span>
      <span className="phone-app-bar__title">{title}</span>
      <span className="phone-app-bar__spacer" aria-hidden="true" />
    </div>
  )
}

function SocialPostSlide({ slide }) {
  return (
    <div className="phone-slide-inner phone-slide-inner--feature">
      <AppBar title="Пост" />
      <div className="phone-slide-scroll">
        <h2 className="phone-slide-title">{slide.title}</h2>
        <p className="phone-slide-desc">{slide.description}</p>

        <div className="phone-mock-card">
          <div className="phone-field-label">Тема поста</div>
          <div className="phone-field">Свободные окна на завтра</div>

          <div className="phone-chips">
            {['Instagram', 'Telegram', 'VK'].map((net) => (
              <span key={net} className="phone-chip">
                {net}
              </span>
            ))}
          </div>

          <button type="button" className="phone-btn phone-btn--primary" disabled>
            Создать пост
          </button>

          <div className="phone-preview-block">
            <div className="phone-preview-label">Превью</div>
            <div className="phone-preview-card">
              <div className="phone-preview-card__title">Свободные часы</div>
              <div className="phone-preview-slots">
                <span>11:00</span>
                <span>13:00</span>
                <span>15:00</span>
              </div>
              <div className="phone-preview-link">dedato.ru/m/master</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function FeaturePlaceholderSlide({ slide }) {
  return (
    <div className="phone-slide-inner phone-slide-inner--feature">
      <AppBar title={slide.title} />
      <div className="phone-slide-scroll">
        <h2 className="phone-slide-title">{slide.title}</h2>
        <p className="phone-slide-desc">{slide.description}</p>

        <div className="phone-mock-card">
          <div className="phone-illus-block" data-screen={slide.screenType}>
            <div className="phone-illus-bar" />
            <div className="phone-illus-row" />
            <div className="phone-illus-row phone-illus-row--short" />
            <div className="phone-illus-grid">
              <span />
              <span />
              <span />
            </div>
          </div>

          <div className="phone-compact-cards">
            <div className="phone-compact-card">
              <b>Шаг 1</b>
              <span>Компактный UI-элемент</span>
            </div>
            <div className="phone-compact-card">
              <b>Шаг 2</b>
              <span>Заглушка под контент dedato.ru</span>
            </div>
          </div>

          <button type="button" className="phone-btn phone-btn--secondary" disabled>
            Действие
          </button>
        </div>
      </div>
    </div>
  )
}

function PricingSlide({ slide }) {
  return (
    <div className="phone-slide-inner phone-slide-inner--pricing">
      <AppBar title="Тарифы" />
      <div className="phone-slide-scroll phone-slide-scroll--with-footer">
        <h2 className="phone-slide-title">Выберите план</h2>
        <p className="phone-slide-desc">{slide.description}</p>

        <div className="phone-pricing-list">
          {PRICING_PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`phone-pricing-card${plan.recommended ? ' phone-pricing-card--recommended' : ''}`}
            >
              {plan.recommended ? <div className="phone-pricing-badge">Рекомендуем</div> : null}
              <div className="phone-pricing-name">{plan.name}</div>
              <div className="phone-pricing-price">
                {plan.price}
                {plan.period ? <small>{plan.period}</small> : null}
              </div>
              <ul className="phone-pricing-perks">
                {plan.perks.map((perk) => (
                  <li key={perk}>{perk}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="phone-fixed-cta">
        <button type="button" className="phone-btn phone-btn--primary" disabled>
          Выбрать тариф
        </button>
      </div>
    </div>
  )
}

function RegistrationSlide({ slide }) {
  return (
    <div className="phone-slide-inner phone-slide-inner--auth">
      <div className="phone-step-indicator">Шаг 1 из 1</div>
      <AppBar title="Регистрация" />
      <div className="phone-slide-scroll">
        <h2 className="phone-slide-title">{slide.title}</h2>
        <p className="phone-slide-desc">Создайте аккаунт за минуту</p>

        <div className="phone-form">
          <label className="phone-form-field">
            <span>Имя</span>
            <input type="text" placeholder="Анна" disabled readOnly />
          </label>
          <label className="phone-form-field">
            <span>Телефон</span>
            <input type="tel" placeholder="+7 999 000-00-00" disabled readOnly />
          </label>
          <label className="phone-form-field">
            <span>Пароль</span>
            <input type="password" placeholder="••••••••" disabled readOnly />
          </label>

          <button type="button" className="phone-btn phone-btn--primary" disabled>
            Создать аккаунт
          </button>
          <button type="button" className="phone-btn phone-btn--link" disabled>
            Уже есть аккаунт?
          </button>
          <p className="phone-legal">Продолжая, вы соглашаетесь с условиями сервиса.</p>
        </div>
      </div>
    </div>
  )
}

export function renderPhoneSlide(slide) {
  if (slide.screenType === 'social-post') {
    return <SocialPostSlide slide={slide} />
  }
  if (slide.type === 'pricing') {
    return <PricingSlide slide={slide} />
  }
  if (slide.type === 'auth') {
    return <RegistrationSlide slide={slide} />
  }
  return <FeaturePlaceholderSlide slide={slide} />
}

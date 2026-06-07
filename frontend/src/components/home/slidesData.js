/** Конфиг слайдов главного phone showcase — тексты 1–5 заменяются без правки вёрстки. */
export const slidesData = [
  {
    id: 1,
    title: 'Создание поста для соцсетей',
    description: 'Соберите текст, визуал и публикацию в одном мобильном сценарии.',
    type: 'feature',
    screenType: 'social-post',
    illustrationType: 'post-generator',
  },
  {
    id: 2,
    title: 'Сценарий продукта 2',
    description: 'Временный текст. Заменить на точный текст с dedato.ru.',
    type: 'feature',
    screenType: 'feature-2',
    illustrationType: 'feature-card',
  },
  {
    id: 3,
    title: 'Сценарий продукта 3',
    description: 'Временный текст. Заменить на точный текст с dedato.ru.',
    type: 'feature',
    screenType: 'feature-3',
    illustrationType: 'feature-card',
  },
  {
    id: 4,
    title: 'Сценарий продукта 4',
    description: 'Временный текст. Заменить на точный текст с dedato.ru.',
    type: 'feature',
    screenType: 'feature-4',
    illustrationType: 'feature-card',
  },
  {
    id: 5,
    title: 'Сценарий продукта 5',
    description: 'Временный текст. Заменить на точный текст с dedato.ru.',
    type: 'feature',
    screenType: 'feature-5',
    illustrationType: 'feature-card',
  },
  {
    id: 6,
    title: 'Тарифы',
    description: 'Выберите подходящий план',
    type: 'pricing',
    screenType: 'pricing',
  },
  {
    id: 7,
    title: 'Регистрация',
    description: 'Создайте аккаунт и начните работу',
    type: 'auth',
    screenType: 'registration',
  },
]

export const PRICING_PLANS = [
  {
    id: 'start',
    name: 'Старт',
    price: '0 ₽',
    period: '',
    recommended: false,
    perks: ['Базовые функции', 'Ограниченное количество действий'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '990 ₽',
    period: '/ мес',
    recommended: true,
    perks: ['Расширенные функции', 'Статистика', 'Публикации'],
  },
  {
    id: 'business',
    name: 'Business',
    price: 'по запросу',
    period: '',
    recommended: false,
    perks: ['Команда', 'Поддержка', 'Расширенные лимиты'],
  },
]

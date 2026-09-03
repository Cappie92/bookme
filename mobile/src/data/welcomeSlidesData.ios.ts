import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

export type WelcomeRole = 'master' | 'client';
export type WelcomeSlideType = 'feature' | 'registration';
export type WelcomeIllustrationType =
  | 'public-page'
  | 'schedule-services'
  | 'analytics'
  | 'loyalty'
  | 'social-post'
  | 'master-dashboard'
  | 'client-masters'
  | 'client-loyalty'
  | 'client-reschedule'
  | 'client-dashboard';

export type WelcomeSlide = {
  id: string;
  role: WelcomeRole;
  title: string;
  description: string;
  badge?: string;
  icon?: ComponentProps<typeof Ionicons>['name'];
  illustration: WelcomeIllustrationType;
  type: WelcomeSlideType;
  ctaLabel?: string;
  ctaRoute?: string;
};

const MASTER_SLIDES: Omit<WelcomeSlide, 'role'>[] = [
  {
    id: 'master-public-page',
    title: 'Публичная страница мастера',
    description: 'Показывайте услуги, адрес и свободное время на аккуратной странице онлайн-записи.',
    badge: 'Запись',
    icon: 'globe-outline',
    illustration: 'public-page',
    type: 'feature',
  },
  {
    id: 'master-schedule',
    title: 'Расписание и услуги',
    description: 'Управляйте рабочими днями, слотами, категориями и услугами прямо в приложении.',
    badge: 'Работа',
    icon: 'calendar-outline',
    illustration: 'schedule-services',
    type: 'feature',
  },
  {
    id: 'master-dashboard',
    title: 'Записи и показатели',
    description: 'Просматривайте, подтверждайте и переносите записи, следите за недельной динамикой.',
    badge: 'Дашборд',
    icon: 'stats-chart-outline',
    illustration: 'analytics',
    type: 'feature',
  },
  {
    id: 'master-social-post',
    title: 'Свободные окна для соцсетей',
    description: 'Создавайте карточку со свободными слотами и делитесь ею с клиентами.',
    badge: 'Продвижение',
    icon: 'share-social-outline',
    illustration: 'social-post',
    type: 'feature',
  },
  {
    id: 'master-registration',
    title: 'Начните как мастер',
    description: 'Создайте страницу записи, настройте услуги и расписание — клиенты смогут записываться онлайн.',
    badge: 'Регистрация',
    icon: 'cut-outline',
    illustration: 'master-dashboard',
    type: 'registration',
    ctaLabel: 'Создать аккаунт мастера',
    ctaRoute: '/login?tab=register&role=master',
  },
];

const CLIENT_SLIDES: Omit<WelcomeSlide, 'role'>[] = [
  {
    id: 'client-favorites',
    title: 'Все ваши любимые мастера в одном месте',
    description: 'Записывайтесь к разным мастерам из одного приложения — история визитов всегда под рукой.',
    badge: 'Удобство',
    icon: 'people-outline',
    illustration: 'client-masters',
    type: 'feature',
  },
  {
    id: 'client-loyalty',
    title: 'Скидки и баллы после регистрации',
    description: 'Накапливайте бонусы у мастеров и получайте персональные скидки от повторных визитов.',
    badge: 'Выгода',
    icon: 'ribbon-outline',
    illustration: 'client-loyalty',
    type: 'feature',
  },
  {
    id: 'client-reschedule',
    title: 'Быстрый перенос или отмена записи',
    description: 'Измените время или отмените визит без звонков, когда планы меняются.',
    badge: 'Гибкость',
    icon: 'swap-horizontal-outline',
    illustration: 'client-reschedule',
    type: 'feature',
  },
  {
    id: 'client-registration',
    title: 'Записывайтесь онлайн',
    description: 'Зарегистрируйтесь за минуту — выбирайте услугу, дату и время у любимого мастера.',
    badge: 'Регистрация',
    icon: 'person-outline',
    illustration: 'client-dashboard',
    type: 'registration',
    ctaLabel: 'Создать аккаунт клиента',
    ctaRoute: '/login?tab=register&role=client',
  },
];

function withRole(slides: Omit<WelcomeSlide, 'role'>[], role: WelcomeRole): WelcomeSlide[] {
  return slides.map((slide) => ({ ...slide, role }));
}

export function getWelcomeSlidesForRole(role: WelcomeRole): WelcomeSlide[] {
  return role === 'master' ? withRole(MASTER_SLIDES, role) : withRole(CLIENT_SLIDES, role);
}

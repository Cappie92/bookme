export type RegistrationPromoRole = 'client' | 'master';
export type RegistrationFieldKey =
  | 'role'
  | 'fullName'
  | 'email'
  | 'phone'
  | 'city'
  | 'password'
  | 'confirmPassword'
  | 'promoCode';

const REQUIRED_REGISTRATION_FIELDS = new Set<RegistrationFieldKey>([
  'role',
  'fullName',
  'phone',
  'city',
  'password',
  'confirmPassword',
]);

const REGISTRATION_FIELD_LABELS: Record<RegistrationFieldKey, string> = {
  role: 'Тип аккаунта',
  fullName: 'Имя',
  email: 'Email',
  phone: 'Номер телефона',
  city: 'Город',
  password: 'Пароль',
  confirmPassword: 'Повторный ввод пароля',
  promoCode: 'Промокод',
};

type MaybeParam = string | string[] | undefined;

function firstParam(value: MaybeParam): string {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

export function shouldShowRegistrationPromoField(role: RegistrationPromoRole): boolean {
  return role === 'master';
}

export function isRegistrationFieldRequired(field: RegistrationFieldKey): boolean {
  return REQUIRED_REGISTRATION_FIELDS.has(field);
}

export function getRegistrationFieldLabel(field: RegistrationFieldKey): string {
  return REGISTRATION_FIELD_LABELS[field];
}

export function getCityPickerListBottomPadding(bottomInset: number): number {
  return Math.max(bottomInset, 16) + 16;
}

export function normalizeRegistrationPromoCode(value: MaybeParam): string {
  return firstParam(value).trim().toUpperCase();
}

export function getRegistrationPromoCodeFromParams(params: {
  promo_code?: MaybeParam;
  ref?: MaybeParam;
}): string {
  return normalizeRegistrationPromoCode(params.promo_code || params.ref);
}

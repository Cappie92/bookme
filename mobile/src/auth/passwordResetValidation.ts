export function validateNewPassword(password: string, confirmation: string): string | null {
  if (password.length < 6) return 'Пароль должен содержать минимум 6 символов';
  if (password !== confirmation) return 'Пароли не совпадают';
  return null;
}

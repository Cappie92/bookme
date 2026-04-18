/**
 * Публичная ветка: /m/[slug] без авторизации.
 * Не используем name="m" — в nested children только "m/[slug]". Явно объявляем m/[slug], чтобы не было "No route named m".
 */
import { Stack } from 'expo-router';

export default function PublicLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="m/[slug]" />
    </Stack>
  );
}

import { Stack } from 'expo-router';

export default function SubscriptionsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        title: 'Подписки',
      }}
    />
  );
}


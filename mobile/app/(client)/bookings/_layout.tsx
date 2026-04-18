import { Stack } from 'expo-router';

export default function ClientBookingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        title: 'Бронирования',
      }}
    />
  );
}

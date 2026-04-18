/**
 * Layout для Client секции
 * statusBarTranslucent (Android): хедер тянется под status bar, убирает белый зазор над «Мой кабинет».
 * statusBarStyle: тёмные иконки на белом фоне.
 */

import { Platform } from 'react-native'
import { Stack } from 'expo-router'

export default function ClientLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: '#ffffff',
        },
        headerTintColor: '#111827',
        headerTitleStyle: {
          fontWeight: '600',
          fontSize: 18,
        },
        headerShadowVisible: false,
        ...(Platform.OS === 'android' && {
          statusBarTranslucent: true,
        }),
        statusBarStyle: 'dark',
      }}
    >
      <Stack.Screen
        name="dashboard"
        options={{
          title: 'Мой кабинет',
          headerShown: true,
        }}
      />
      <Stack.Screen
        name="bookings-future"
        options={{
          title: 'Будущие записи',
          headerShown: true,
        }}
      />
      <Stack.Screen
        name="bookings-past"
        options={{
          title: 'Прошедшие записи',
          headerShown: true,
        }}
      />
      <Stack.Screen
        name="loyalty-points"
        options={{
          title: 'Мои баллы',
          headerShown: true,
        }}
      />
      <Stack.Screen
        name="loyalty-history"
        options={{
          title: 'История баллов',
          headerShown: true,
        }}
      />
    </Stack>
  )
}

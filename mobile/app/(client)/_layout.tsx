/**
 * Client-ветка: без MasterMenuProvider, MasterHamburgerMenu, getMasterSettings.
 * ClientBottomNav не импортирует master-хуки.
 */
import { Stack } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { ClientBottomNav } from '@src/components/ClientBottomNav';

export default function ClientLayout() {
  return (
    <View style={styles.container}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="client" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="notes" />
        <Stack.Screen name="bookings" />
      </Stack>
      <ClientBottomNav />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});

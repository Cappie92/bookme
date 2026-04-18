import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function MasterLayout() {
  return (
    <SafeAreaProvider>
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="services" />
        <Stack.Screen name="schedule" />
        <Stack.Screen name="finance" />
        <Stack.Screen name="stats" />
        <Stack.Screen name="loyalty" />
        <Stack.Screen name="clients" />
        <Stack.Screen name="client-restrictions" />
        <Stack.Screen name="invitations" />
        <Stack.Screen name="settings" />
      </Stack>
    </SafeAreaProvider>
  );
}


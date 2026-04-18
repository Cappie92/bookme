/**
 * Master-ветка: MasterMenuProvider, MasterHamburgerMenu, BottomNavigationCarousel.
 * Монтируются ТОЛЬКО когда user.role=master. Client никогда не попадает сюда.
 */
import { Stack } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { MasterMenuProvider, useMasterMenu } from '@src/contexts/MasterMenuContext';
import { BottomNavigationCarousel } from '@src/components/BottomNavigationCarousel';
import { MasterHamburgerMenu } from '@src/components/MasterHamburgerMenu';

function MasterLayoutNav() {
  const { isMenuVisible, closeMenu } = useMasterMenu();
  return (
    <View style={styles.container}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="master" />
        <Stack.Screen name="subscriptions" />
        <Stack.Screen name="bookings" />
      </Stack>
      <BottomNavigationCarousel />
      <MasterHamburgerMenu visible={isMenuVisible} onClose={closeMenu} />
    </View>
  );
}

export default function MasterLayout() {
  return (
    <MasterMenuProvider>
      <MasterLayoutNav />
    </MasterMenuProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});

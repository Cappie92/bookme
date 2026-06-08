import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';

type WelcomeTopNavProps = {
  onHomePress: () => void;
  onPricingPress: () => void;
  onAuthPress: () => void;
};

export function WelcomeTopNav({ onHomePress, onPricingPress, onAuthPress }: WelcomeTopNavProps) {
  return (
    <View style={styles.container}>
      <View style={styles.brandRow}>
        <Image
          source={require('../../../assets/dedato_trnsp.png')}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="DeDato"
        />
        <Text style={styles.brand}>DeDato</Text>
      </View>
      <View style={styles.navRow}>
        <TouchableOpacity
          style={[styles.navItem, styles.navItemActive]}
          onPress={onHomePress}
          testID="welcome-nav-home"
          accessibilityRole="button"
        >
          <Text style={[styles.navText, styles.navTextActive]} numberOfLines={1}>
            Главная
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.navItem}
          onPress={onPricingPress}
          testID="welcome-nav-pricing"
          accessibilityRole="button"
        >
          <Text style={styles.navText} numberOfLines={1}>
            Цены
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.navItem}
          onPress={onAuthPress}
          testID="welcome-nav-auth"
          accessibilityRole="button"
        >
          <Text style={styles.navText} numberOfLines={2}>
            Вход
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 12,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  logo: {
    width: 44,
    height: 44,
    marginRight: 10,
  },
  brand: {
    fontSize: 22,
    fontWeight: '700',
    color: '#2e7d32',
  },
  navRow: {
    flexDirection: 'row',
    gap: 6,
  },
  navItem: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e8e8e8',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  navItemActive: {
    borderColor: '#c8e6c9',
    backgroundColor: '#f1f8f1',
  },
  navText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#555',
    textAlign: 'center',
  },
  navTextActive: {
    color: '#2e7d32',
  },
});

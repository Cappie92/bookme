import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  onRegisterPress: () => void;
  onLoginPress: () => void;
};

export function WelcomeIosTopBar({ onRegisterPress, onLoginPress }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.brandRow}>
        <Image
          source={require('../../../assets/dedato_trnsp.png')}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="DeDato"
        />
        <View style={styles.badge} testID="welcome-ios-companion-badge">
          <Text style={styles.badgeText} numberOfLines={1}>
            Бесплатный компаньон
          </Text>
        </View>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.action, styles.actionPrimary]}
          onPress={onRegisterPress}
          testID="welcome-ios-register"
          accessibilityRole="button"
        >
          <Text style={[styles.actionText, styles.actionTextPrimary]}>Регистрация</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.action}
          onPress={onLoginPress}
          testID="welcome-ios-login"
          accessibilityRole="button"
        >
          <Text style={styles.actionText}>Вход</Text>
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
    justifyContent: 'space-between',
    gap: 12,
  },
  logo: {
    width: 99,
    height: 99,
    flexShrink: 0,
  },
  badge: {
    flexShrink: 1,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#f1f8f1',
    borderWidth: 1,
    borderColor: '#c8e6c9',
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2e7d32',
  },
  actions: {
    marginTop: 12,
    alignSelf: 'stretch',
    width: '100%',
    flexDirection: 'row',
    gap: 8,
  },
  action: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#c8e6c9',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  actionPrimary: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  actionText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2e7d32',
  },
  actionTextPrimary: {
    color: '#fff',
  },
});

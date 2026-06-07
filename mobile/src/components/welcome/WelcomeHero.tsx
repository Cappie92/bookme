import { View, Text, Image, StyleSheet } from 'react-native';

export function WelcomeHero() {
  return (
    <View style={styles.container}>
      <Image
        source={require('../../../assets/dedato_trnsp.png')}
        style={styles.logo}
        resizeMode="contain"
        accessibilityLabel="DeDato"
      />
      <Text style={styles.brand}>DeDato</Text>
      <Text style={styles.headline}>
        Онлайн-запись и управление клиентами в одном приложении
      </Text>
      <Text style={styles.description}>
        DeDato помогает мастерам вести расписание, принимать записи, управлять клиентами,
        финансами и лояльностью.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 24,
  },
  logo: {
    width: 96,
    height: 96,
    marginBottom: 12,
  },
  brand: {
    fontSize: 28,
    fontWeight: '700',
    color: '#2e7d32',
    marginBottom: 12,
  },
  headline: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    lineHeight: 28,
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  description: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 4,
  },
});

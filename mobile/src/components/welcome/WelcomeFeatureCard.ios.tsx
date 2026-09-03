import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@src/components/Card';
import type { WelcomeSlide } from '@src/data/welcomeSlidesData.ios';
import { WelcomeSlideIllustration } from './WelcomeSlideIllustration';

export function WelcomeFeatureCard({ slide }: { slide: WelcomeSlide }) {
  return (
    <Card style={styles.card} padding={16}>
      <View style={styles.body}>
        <View style={styles.header}>
          {slide.badge ? <View style={styles.badge}><Text style={styles.badgeText}>{slide.badge}</Text></View> : null}
          <View style={styles.iconWrap}><Ionicons name={slide.icon ?? 'sparkles-outline'} size={22} color="#4CAF50" /></View>
        </View>
        <Text style={styles.title}>{slide.title}</Text>
        <Text style={styles.description} numberOfLines={3}>{slide.description}</Text>
        <View style={styles.illustrationWrap}><WelcomeSlideIllustration type={slide.illustration} large /></View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, minHeight: 480 },
  body: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  badge: { backgroundColor: '#e8f5e9', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 12, fontWeight: '600', color: '#2e7d32' },
  iconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#e8f5e9', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: '#333', lineHeight: 22, marginBottom: 2 },
  description: { fontSize: 13, color: '#666', lineHeight: 18, marginBottom: 4 },
  illustrationWrap: { flex: 1, minHeight: 248, marginTop: 2 },
});

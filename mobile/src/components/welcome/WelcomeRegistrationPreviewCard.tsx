import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Card } from '@src/components/Card';
import { PrimaryButton } from '@src/components/PrimaryButton';
import type { WelcomeSlide } from '@src/data/welcomeSlidesData';
import { WelcomeSlideIllustration } from './WelcomeSlideIllustration';

type WelcomeRegistrationPreviewCardProps = {
  slide: WelcomeSlide;
};

export function WelcomeRegistrationPreviewCard({ slide }: WelcomeRegistrationPreviewCardProps) {
  const isMaster = slide.role === 'master';
  const route = slide.ctaRoute ?? (isMaster ? '/login?tab=register&role=master' : '/login?tab=register&role=client');
  const ctaLabel = slide.ctaLabel ?? (isMaster ? 'Создать аккаунт мастера' : 'Создать аккаунт клиента');

  return (
    <Card style={styles.card} padding={16}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          {slide.badge ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{slide.badge}</Text>
            </View>
          ) : null}
          <View style={styles.previewPill}>
            <Text style={styles.previewPillText}>Превью</Text>
          </View>
        </View>
        <Text style={styles.title}>{slide.title}</Text>
        <Text style={styles.previewHint}>
          Это превью. Нажмите кнопку ниже, чтобы перейти к регистрации.
        </Text>
        <WelcomeSlideIllustration type={slide.illustration} />
        <Text style={styles.description}>{slide.description}</Text>
        <PrimaryButton
          title={ctaLabel}
          testID={isMaster ? 'welcome-register-master-button' : 'welcome-register-client-button'}
          onPress={() => router.push(route as any)}
          style={styles.cta}
        />
      </ScrollView>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 420,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  badge: {
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2e7d32',
  },
  previewPill: {
    backgroundColor: '#ececec',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  previewPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#777',
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    lineHeight: 24,
    marginBottom: 6,
  },
  previewHint: {
    fontSize: 12,
    color: '#888',
    lineHeight: 18,
    marginBottom: 4,
    fontStyle: 'italic',
  },
  description: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginTop: 8,
    marginBottom: 16,
  },
  cta: {
    width: '100%',
  },
});

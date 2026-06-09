import { useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ListRenderItem,
} from 'react-native';
import type { WelcomeSlide } from '@src/data/welcomeSlidesData';
import type { WelcomePricingPlan } from '@src/data/welcomePricingData';
import type { WelcomePeriodMonths } from '@src/utils/welcomePricing';
import { WelcomeFeatureCard } from './WelcomeFeatureCard';
import { WelcomeRegistrationPreviewCard } from './WelcomeRegistrationPreviewCard';

const SCREEN_WIDTH = Dimensions.get('window').width;

type WelcomeCardCarouselProps = {
  slides: WelcomeSlide[];
  pricingPlans: WelcomePricingPlan[];
  pricingLoading?: boolean;
  pricingFallbackUsed?: boolean;
  selectedPeriodMonths: WelcomePeriodMonths;
  onPeriodChange: (months: WelcomePeriodMonths) => void;
  selectedPlanId: string;
  onSelectPlan: (planId: string) => void;
  onPricingPress: () => void;
  resetKey?: string;
};

export function WelcomeCardCarousel({
  slides,
  pricingPlans,
  pricingLoading = false,
  pricingFallbackUsed = false,
  selectedPeriodMonths,
  onPeriodChange,
  selectedPlanId,
  onSelectPlan,
  onPricingPress,
  resetKey,
}: WelcomeCardCarouselProps) {
  const listRef = useRef<FlatList<WelcomeSlide>>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [resetKey]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
      if (index >= 0 && index < slides.length) {
        setActiveIndex(index);
      }
    },
    [slides.length]
  );

  const renderItem: ListRenderItem<WelcomeSlide> = useCallback(
    ({ item }) => (
      <View style={styles.slidePage}>
        {item.type === 'registration' ? (
          <WelcomeRegistrationPreviewCard slide={item} />
        ) : (
          <WelcomeFeatureCard
            slide={item}
            pricingPlans={pricingPlans}
            pricingLoading={pricingLoading}
            pricingFallbackUsed={pricingFallbackUsed}
            selectedPeriodMonths={selectedPeriodMonths}
            onPeriodChange={onPeriodChange}
            selectedPlanId={selectedPlanId}
            onSelectPlan={onSelectPlan}
            onPricingPress={onPricingPress}
          />
        )}
      </View>
    ),
    [
      pricingPlans,
      pricingLoading,
      pricingFallbackUsed,
      selectedPeriodMonths,
      onPeriodChange,
      selectedPlanId,
      onSelectPlan,
      onPricingPress,
    ]
  );

  return (
    <View style={styles.container} testID="welcome-carousel">
      <FlatList
        ref={listRef}
        data={slides}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        decelerationRate="fast"
        extraData={`${selectedPeriodMonths}-${selectedPlanId}-${pricingPlans.length}-${pricingLoading}`}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
      />
      <View style={styles.dots}>
        {slides.map((slide, i) => (
          <View
            key={slide.id}
            style={[styles.dot, i === activeIndex && styles.dotActive]}
            accessibilityLabel={`Слайд ${i + 1} из ${slides.length}`}
          />
        ))}
      </View>
    </View>
  );
}

const H_PADDING = 16;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  slidePage: {
    width: SCREEN_WIDTH,
    paddingHorizontal: H_PADDING,
    paddingBottom: 8,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#ccc',
  },
  dotActive: {
    width: 20,
    backgroundColor: '#4CAF50',
  },
});

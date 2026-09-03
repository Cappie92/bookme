import { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, FlatList, StyleSheet, View, type ListRenderItem, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import type { WelcomeSlide } from '@src/data/welcomeSlidesData.ios';
import { WelcomeFeatureCard } from './WelcomeFeatureCard.ios';
import { WelcomeRegistrationPreviewCard } from './WelcomeRegistrationPreviewCard';

const SCREEN_WIDTH = Dimensions.get('window').width;

export function WelcomeCardCarousel({ slides, resetKey }: { slides: WelcomeSlide[]; resetKey?: string }) {
  const listRef = useRef<FlatList<WelcomeSlide>>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [resetKey]);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (index >= 0 && index < slides.length) setActiveIndex(index);
  }, [slides.length]);

  const renderItem: ListRenderItem<WelcomeSlide> = ({ item }) => (
    <View style={styles.slidePage}>
      {item.type === 'registration' ? <WelcomeRegistrationPreviewCard slide={item} /> : <WelcomeFeatureCard slide={item} />}
    </View>
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
        getItemLayout={(_, index) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * index, index })}
      />
      <View style={styles.dots}>
        {slides.map((slide, index) => (
          <View key={slide.id} style={[styles.dot, index === activeIndex && styles.dotActive]} accessibilityLabel={`Слайд ${index + 1} из ${slides.length}`} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  slidePage: { width: SCREEN_WIDTH, paddingHorizontal: 16, paddingBottom: 8 },
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: 12 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#ccc' },
  dotActive: { width: 20, backgroundColor: '#4CAF50' },
});

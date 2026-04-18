import { ReactNode } from 'react';
import { View, StyleSheet, ScrollView, ScrollViewProps } from 'react-native';
import { SafeAreaView, SafeAreaViewProps } from 'react-native-safe-area-context';

interface ScreenContainerProps {
  children: ReactNode;
  scrollable?: boolean;
  scrollViewProps?: ScrollViewProps;
  safeAreaProps?: SafeAreaViewProps;
  backgroundColor?: string;
  /** Уменьшить верхний отступ (когда экран уже имеет header) */
  compactTop?: boolean;
}

export function ScreenContainer({
  children,
  scrollable = false,
  scrollViewProps,
  safeAreaProps,
  backgroundColor = '#f5f5f5',
  compactTop = false,
}: ScreenContainerProps) {
  const containerStyle = [styles.container, { backgroundColor }];

  // compactTop: без top edge (header уже есть), без лишнего paddingTop
  const defaultEdges = safeAreaProps?.edges !== undefined ? safeAreaProps.edges : (compactTop ? ['left', 'right'] : ['top', 'left', 'right']);
  
  if (scrollable) {
    const mergedContentStyle = scrollViewProps?.contentContainerStyle
      ? [styles.scrollContent, scrollViewProps.contentContainerStyle]
      : styles.scrollContent;
    
    return (
      <SafeAreaView style={containerStyle} edges={defaultEdges} {...safeAreaProps}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={mergedContentStyle}
          showsVerticalScrollIndicator={scrollViewProps?.showsVerticalScrollIndicator !== undefined 
            ? scrollViewProps.showsVerticalScrollIndicator 
            : false}
          keyboardShouldPersistTaps={scrollViewProps?.keyboardShouldPersistTaps || 'handled'}
          {...scrollViewProps}
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    );
  }

  const viewStyle = compactTop ? [styles.view, styles.viewCompactTop] : styles.view;
  return (
    <SafeAreaView style={containerStyle} edges={defaultEdges} {...safeAreaProps}>
      <View style={viewStyle}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingTop: 16, // Отступ сверху (SafeAreaView уже дал отступ для status bar)
    paddingBottom: 90, // Отступ для нижней навигации
  },
  view: {
    flex: 1,
    padding: 16,
    paddingTop: 16,
    paddingBottom: 90,
  },
  viewCompactTop: {
    paddingTop: 8,
  },
});


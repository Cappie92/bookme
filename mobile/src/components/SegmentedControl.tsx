import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface SegmentedControlProps {
  segments: Array<{ key: string; label: string }>;
  selectedIndex: number;
  onSegmentChange: (index: number) => void;
  disabledIndexes?: number[];
}

export function SegmentedControl({ segments, selectedIndex, onSegmentChange, disabledIndexes }: SegmentedControlProps) {
  return (
    <View style={styles.container}>
      {segments.map((segment, index) => {
        const isSelected = index === selectedIndex;
        const isDisabled = disabledIndexes?.includes(index) === true;
        return (
          <TouchableOpacity
            key={segment.key}
            style={[
              styles.segment,
              isSelected && styles.segmentSelected,
              isDisabled && styles.segmentDisabled,
            ]}
            onPress={() => {
              if (isDisabled) return;
              onSegmentChange(index);
            }}
            activeOpacity={isDisabled ? 1 : 0.7}
            disabled={isDisabled}
          >
            <Text
              style={[
                styles.segmentText,
                isSelected && styles.segmentTextSelected,
                isDisabled && styles.segmentTextDisabled,
              ]}
            >
              {segment.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentSelected: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentDisabled: {
    opacity: 0.55,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  segmentTextSelected: {
    color: '#4CAF50',
    fontWeight: '600',
  },
  segmentTextDisabled: {
    color: '#999',
  },
});


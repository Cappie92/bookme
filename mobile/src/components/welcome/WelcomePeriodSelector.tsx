import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import {
  WELCOME_PERIOD_OPTIONS,
  type WelcomePeriodMonths,
} from '@src/utils/welcomePricing';

type WelcomePeriodSelectorProps = {
  value: WelcomePeriodMonths;
  onChange: (months: WelcomePeriodMonths) => void;
  compact?: boolean;
  testIDPrefix?: string;
};

export function WelcomePeriodSelector({
  value,
  onChange,
  compact = false,
  testIDPrefix = 'welcome-period',
}: WelcomePeriodSelectorProps) {
  return (
    <View style={[styles.row, compact && styles.rowCompact]}>
      {WELCOME_PERIOD_OPTIONS.map((months) => {
        const active = value === months;
        return (
          <TouchableOpacity
            key={months}
            style={[styles.chip, compact && styles.chipCompact, active && styles.chipActive]}
            onPress={() => onChange(months)}
            testID={`${testIDPrefix}-${months}`}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.chipText, compact && styles.chipTextCompact, active && styles.chipTextActive]}>
              {months} мес
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 6,
    marginVertical: 8,
  },
  rowCompact: {
    marginVertical: 4,
  },
  chip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#eee',
    alignItems: 'center',
  },
  chipCompact: {
    paddingVertical: 6,
  },
  chipActive: {
    backgroundColor: '#4CAF50',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
  },
  chipTextCompact: {
    fontSize: 11,
  },
  chipTextActive: {
    color: '#fff',
  },
});

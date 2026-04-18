import { Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';

interface StatusBadgeProps {
  label: string;
  color: string;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export function StatusBadge({ label, color, style, textStyle }: StatusBadgeProps) {
  return (
    <Text
      style={[
        styles.badge,
        { backgroundColor: color + '20', color },
        style,
        textStyle,
      ]}
    >
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    fontSize: 12,
    fontWeight: '600',
    overflow: 'hidden',
  },
});


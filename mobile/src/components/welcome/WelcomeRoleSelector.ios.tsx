import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { WelcomeRole } from '@src/data/welcomeSlidesData.ios';

type Props = { role: WelcomeRole; onRoleChange: (role: WelcomeRole) => void };

const ROLE_HELP: Record<WelcomeRole, string> = {
  master: 'Записи, расписание, услуги и рабочие показатели',
  client: 'Любимые мастера, записи, баллы и скидки',
};

const ROLE_CHIPS: Record<WelcomeRole, string[]> = {
  master: ['Записи', 'Расписание', 'Услуги'],
  client: ['Мастера', 'Баллы', 'Перенос'],
};

export function WelcomeRoleSelector({ role, onRoleChange }: Props) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.container}>
        {(['client', 'master'] as const).map((item) => (
          <TouchableOpacity
            key={item}
            style={[styles.option, role === item && styles.optionActive]}
            onPress={() => onRoleChange(item)}
            testID={`welcome-role-${item}`}
            accessibilityRole="button"
            accessibilityState={{ selected: role === item }}
          >
            <Ionicons name={item === 'client' ? 'person-outline' : 'cut-outline'} size={16} color={role === item ? '#fff' : '#666'} />
            <Text style={[styles.optionText, role === item && styles.optionTextActive]}>
              {item === 'client' ? 'Клиент' : 'Мастер'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.helper}>{ROLE_HELP[role]}</Text>
      <View style={styles.chipRow}>
        {ROLE_CHIPS[role].map((chip) => <View key={chip} style={styles.chip}><Text style={styles.chipText}>{chip}</Text></View>)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 12 },
  container: { flexDirection: 'row', backgroundColor: '#e8e8e8', borderRadius: 10, padding: 4 },
  option: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 8 },
  optionActive: { backgroundColor: '#4CAF50' },
  optionText: { fontSize: 15, fontWeight: '600', color: '#666' },
  optionTextActive: { color: '#fff' },
  helper: { fontSize: 12, color: '#888', textAlign: 'center', marginTop: 8, lineHeight: 16 },
  chipRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 6 },
  chip: { backgroundColor: '#F0EFED', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  chipText: { fontSize: 10, color: '#666', fontWeight: '500' },
});

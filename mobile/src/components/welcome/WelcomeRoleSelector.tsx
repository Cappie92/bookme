import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { WelcomeRole } from '@src/data/welcomeSlidesData';

type WelcomeRoleSelectorProps = {
  role: WelcomeRole;
  onRoleChange: (role: WelcomeRole) => void;
};

export function WelcomeRoleSelector({ role, onRoleChange }: WelcomeRoleSelectorProps) {
  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.option, role === 'client' && styles.optionActive]}
        onPress={() => onRoleChange('client')}
        testID="welcome-role-client"
        accessibilityRole="button"
        accessibilityState={{ selected: role === 'client' }}
      >
        <Ionicons
          name="person-outline"
          size={16}
          color={role === 'client' ? '#fff' : '#666'}
          style={styles.icon}
        />
        <Text style={[styles.optionText, role === 'client' && styles.optionTextActive]}>Клиент</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.option, role === 'master' && styles.optionActive]}
        onPress={() => onRoleChange('master')}
        testID="welcome-role-master"
        accessibilityRole="button"
        accessibilityState={{ selected: role === 'master' }}
      >
        <Ionicons
          name="cut-outline"
          size={16}
          color={role === 'master' ? '#fff' : '#666'}
          style={styles.icon}
        />
        <Text style={[styles.optionText, role === 'master' && styles.optionTextActive]}>Мастер</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#e8e8e8',
    borderRadius: 10,
    padding: 4,
    marginBottom: 16,
  },
  option: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
  },
  optionActive: {
    backgroundColor: '#4CAF50',
  },
  icon: {
    marginRight: 6,
  },
  optionText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
  },
  optionTextActive: {
    color: '#fff',
  },
});

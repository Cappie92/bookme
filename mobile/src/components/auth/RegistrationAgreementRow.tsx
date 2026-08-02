import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { logger } from '@src/utils/logger';
import {
  openLegalDocument,
  PERSONAL_DATA_CONSENT_PATH,
  USER_AGREEMENT_PATH,
} from '@src/utils/legalDocuments';

type Props = {
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  openURL?: (url: string) => Promise<unknown>;
};

export function RegistrationAgreementRow({
  checked,
  onToggle,
  disabled = false,
  openURL = Linking.openURL,
}: Props) {
  const openDoc = (path: string) => {
    openLegalDocument(path, openURL).catch((error) => {
      logger.error('[legal] Failed to open document', error);
    });
  };

  return (
    <View style={styles.checkboxRow}>
      <TouchableOpacity
        testID="agreement-checkbox"
        onPress={onToggle}
        disabled={disabled}
        accessibilityRole="checkbox"
        accessibilityState={{ checked, disabled }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
          {checked && <Ionicons name="checkmark" size={14} color="#fff" />}
        </View>
      </TouchableOpacity>
      <Text style={styles.checkboxLabel}>
        Нажимая на кнопку Зарегистрироваться, я подтверждаю свое согласие с{' '}
        <Text
          testID="user-agreement-link"
          style={styles.checkboxLink}
          onPress={() => openDoc(USER_AGREEMENT_PATH)}
          accessibilityRole="link"
        >
          условиями пользовательского соглашения
        </Text>
        {' '}и даю согласие на{' '}
        <Text
          testID="personal-data-consent-link"
          style={styles.checkboxLink}
          onPress={() => openDoc(PERSONAL_DATA_CONSENT_PATH)}
          accessibilityRole="link"
        >
          обработку персональных данных
        </Text>{' '}
        <Text style={styles.required}>*</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: '#ddd',
    borderRadius: 4,
    marginRight: 10,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  checkboxChecked: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 12,
    color: '#666',
    lineHeight: 18,
  },
  checkboxLink: {
    color: '#4CAF50',
    textDecorationLine: 'underline',
  },
  required: {
    color: '#F44336',
  },
});

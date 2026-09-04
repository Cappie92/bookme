import { useState } from 'react';
import { Alert, Linking, StyleSheet } from 'react-native';
import { SecondaryButton } from '@src/components/SecondaryButton';
import { createWebHandoff, type WebHandoffDestination } from '@src/services/api/auth';
import { openWebHandoffDestination } from '@src/services/auth/openWebHandoffDestination';

type Props = {
  destination: WebHandoffDestination;
  title: string;
  testID: string;
};

export function WebEditorButton({ destination, title, testID }: Props) {
  const [loading, setLoading] = useState(false);
  const openEditor = async () => {
    setLoading(true);
    try {
      await openWebHandoffDestination(destination, {
        platformOS: 'ios',
        createWebHandoff,
        openURL: (url) => Linking.openURL(url),
        showError: (title, message) => Alert.alert(title, message),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SecondaryButton
      title={title}
      onPress={openEditor}
      loading={loading}
      testID={testID}
      accessibilityHint="Откроет защищённый редактор в браузере"
      style={styles.button}
    />
  );
}

const styles = StyleSheet.create({
  button: { marginHorizontal: 16, marginBottom: 12 },
});

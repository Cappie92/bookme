import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Props {
  visible: boolean;
  onAllow: () => void;
  onNotNow: () => void;
}

export function PushPermissionEducationModal({ visible, onAllow, onNotNow }: Props) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onNotNow}>
      <View style={styles.overlay}>
        <View style={styles.content} accessibilityViewIsModal>
          <Text style={styles.title}>Уведомления о записях</Text>
          <Text style={styles.body} testID="push-permission-education-body">
            Разрешите уведомления о новых и изменённых записях
          </Text>
          <TouchableOpacity
            style={styles.allowButton}
            onPress={onAllow}
            testID="push-permission-education-allow"
          >
            <Text style={styles.allowButtonText}>Разрешить</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.dismissButton}
            onPress={onNotNow}
            testID="push-permission-education-dismiss"
          >
            <Text style={styles.dismissButtonText}>Не сейчас</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 20,
    backgroundColor: '#fff',
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1917',
    marginBottom: 12,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: '#44403C',
    marginBottom: 20,
  },
  allowButton: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  allowButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  dismissButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissButtonText: {
    color: '#57534E',
    fontSize: 16,
  },
});

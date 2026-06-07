import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@src/components/Card';

export function WelcomePreview() {
  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Как выглядит запись клиента</Text>
      <Card style={styles.card} padding={16}>
        <View style={styles.urlRow}>
          <Ionicons name="link-outline" size={18} color="#4CAF50" />
          <Text style={styles.urlText}>dedato.ru/m/your-name</Text>
        </View>
        <View style={styles.mockSlot}>
          <View style={styles.mockService}>
            <Text style={styles.mockServiceTitle}>Стрижка</Text>
            <Text style={styles.mockServiceMeta}>45 мин · 1 500 ₽</Text>
          </View>
          <View style={styles.mockDivider} />
          <View style={styles.mockTimeRow}>
            <Ionicons name="calendar-outline" size={16} color="#666" />
            <Text style={styles.mockTimeText}>Ср, 14 июня · 15:00</Text>
          </View>
          <View style={styles.mockButton}>
            <Text style={styles.mockButtonText}>Записаться</Text>
          </View>
        </View>
        <Text style={styles.hint}>
          Клиент выбирает услугу и время — без звонков и переписок
        </Text>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  card: {
    overflow: 'hidden',
  },
  urlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  urlText: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '500',
  },
  mockSlot: {
    backgroundColor: '#fafafa',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  mockService: {
    marginBottom: 10,
  },
  mockServiceTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  mockServiceMeta: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  mockDivider: {
    height: 1,
    backgroundColor: '#eee',
    marginBottom: 10,
  },
  mockTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
  },
  mockTimeText: {
    fontSize: 14,
    color: '#333',
  },
  mockButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  mockButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  hint: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
    textAlign: 'center',
  },
});

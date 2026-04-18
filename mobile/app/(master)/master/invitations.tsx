import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { ScreenContainer } from '@src/components/ScreenContainer';
import { Card } from '@src/components/Card';
import { PrimaryButton } from '@src/components/PrimaryButton';
import { SecondaryButton } from '@src/components/SecondaryButton';
import { getInvitations, respondToInvitation, Invitation } from '@src/services/api/master';

export default function MasterInvitationsScreen() {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [responding, setResponding] = useState<number | null>(null);

  const loadInvitations = async () => {
    try {
      setError(null);
      const data = await getInvitations();
      setInvitations(data);
    } catch (err: any) {
      setError(err.message || 'Ошибка загрузки приглашений');
      console.error('Error loading invitations:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadInvitations();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadInvitations();
  };

  const handleRespond = async (invitationId: number, response: 'accepted' | 'rejected') => {
    setResponding(invitationId);
    try {
      await respondToInvitation(invitationId, response);
      Alert.alert('Успех', response === 'accepted' ? 'Приглашение принято' : 'Приглашение отклонено');
      loadInvitations();
    } catch (err: any) {
      Alert.alert('Ошибка', err.message || 'Не удалось ответить на приглашение');
    } finally {
      setResponding(null);
    }
  };

  const pendingInvitations = invitations.filter(inv => inv.status === 'pending');

  if (loading) {
    return (
      <ScreenContainer>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Загрузка...</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scrollable>
      <View style={styles.header}>
        <Text style={styles.title}>Приглашения в салоны</Text>
        {pendingInvitations.length > 0 && (
          <Text style={styles.pendingCount}>
            {pendingInvitations.length} ожидают ответа
          </Text>
        )}
      </View>

      {error && (
        <Card style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </Card>
      )}

      <FlatList
        data={invitations}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        contentContainerStyle={styles.content}
        ListEmptyComponent={
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyText}>Нет приглашений</Text>
          </Card>
        }
        renderItem={({ item }) => (
          <Card style={styles.invitationCard}>
            <View style={styles.invitationHeader}>
              <Text style={styles.salonName}>{item.salon_name}</Text>
              {item.branch_name && (
                <Text style={styles.branchName}>Филиал: {item.branch_name}</Text>
              )}
            </View>
            <Text style={styles.invitationDate}>
              {new Date(item.created_at).toLocaleDateString('ru-RU')}
            </Text>
            <View style={styles.invitationStatus}>
              <Text
                style={[
                  styles.statusText,
                  item.status === 'pending' && styles.statusPending,
                  item.status === 'accepted' && styles.statusAccepted,
                  item.status === 'rejected' && styles.statusRejected,
                ]}
              >
                {item.status === 'pending' && 'Ожидает ответа'}
                {item.status === 'accepted' && 'Принято'}
                {item.status === 'rejected' && 'Отклонено'}
              </Text>
            </View>
            {item.status === 'pending' && (
              <View style={styles.invitationActions}>
                <PrimaryButton
                  title="Принять"
                  onPress={() => handleRespond(item.id, 'accepted')}
                  loading={responding === item.id}
                  style={styles.actionButton}
                />
                <SecondaryButton
                  title="Отклонить"
                  onPress={() => handleRespond(item.id, 'rejected')}
                  disabled={responding === item.id}
                  style={styles.actionButton}
                />
              </View>
            )}
          </Card>
        )}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  header: {
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  pendingCount: {
    fontSize: 14,
    color: '#FF9800',
    fontWeight: '600',
  },
  errorCard: {
    backgroundColor: '#FFEBEE',
    margin: 16,
  },
  errorText: {
    color: '#F44336',
    fontSize: 14,
  },
  content: {
    padding: 16,
  },
  invitationCard: {
    marginBottom: 16,
  },
  invitationHeader: {
    marginBottom: 8,
  },
  salonName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  branchName: {
    fontSize: 14,
    color: '#666',
  },
  invitationDate: {
    fontSize: 12,
    color: '#999',
    marginBottom: 8,
  },
  invitationStatus: {
    marginBottom: 12,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  statusPending: {
    color: '#FF9800',
  },
  statusAccepted: {
    color: '#4CAF50',
  },
  statusRejected: {
    color: '#F44336',
  },
  invitationActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
  },
  emptyCard: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
  },
});


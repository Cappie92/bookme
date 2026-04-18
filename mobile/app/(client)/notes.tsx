import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Alert, Modal, TextInput, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { ScreenContainer } from '@src/components/ScreenContainer';
import { Card } from '@src/components/Card';
import { PrimaryButton } from '@src/components/PrimaryButton';
import { SecondaryButton } from '@src/components/SecondaryButton';
import { getAllNotes, ClientNote, deleteMasterNote, deleteSalonNote, createOrUpdateMasterNote, createOrUpdateSalonNote } from '@src/services/api/notes';

export default function NotesScreen() {
  const [notes, setNotes] = useState<ClientNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [editingNote, setEditingNote] = useState<ClientNote | null>(null);
  const [editText, setEditText] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadNotes = async () => {
    try {
      setError(null);
      const data = await getAllNotes();
      // Сортируем по дате создания (хронологический порядок добавления)
      const sorted = data.sort((a, b) => {
        const dateA = new Date(a.created_at).getTime();
        const dateB = new Date(b.created_at).getTime();
        return dateA - dateB; // Старые сначала
      });
      setNotes(sorted);
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Ошибка загрузки заметок';
      setError(errorMessage);
      console.error('Error loading notes:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadNotes();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadNotes();
  };

  const handleEdit = (note: ClientNote) => {
    setEditingNote(note);
    setEditText(note.note);
  };

  const handleSave = async () => {
    if (!editingNote || !editText.trim()) {
      Alert.alert('Ошибка', 'Заметка не может быть пустой');
      return;
    }

    setSaving(true);
    try {
      if (editingNote.type === 'master' && editingNote.master_id) {
        await createOrUpdateMasterNote({
          master_id: editingNote.master_id,
          salon_id: editingNote.salon_id || null,
          note: editText.trim(),
        });
      } else if (editingNote.type === 'salon' && editingNote.salon_id) {
        await createOrUpdateSalonNote({
          salon_id: editingNote.salon_id,
          branch_id: editingNote.branch_id || null,
          note: editText.trim(),
        });
      }
      
      Alert.alert('Успешно', 'Заметка сохранена');
      setEditingNote(null);
      setEditText('');
      loadNotes();
    } catch (err: any) {
      console.error('Error saving note:', err);
      const errorMessage = err.response?.data?.detail || err.message || 'Не удалось сохранить заметку';
      Alert.alert('Ошибка', errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (note: ClientNote) => {
    Alert.alert(
      'Удалить заметку',
      'Вы уверены, что хотите удалить эту заметку?',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              if (note.type === 'master' && note.master_id) {
                await deleteMasterNote(note.master_id);
              } else if (note.type === 'salon' && note.salon_id) {
                await deleteSalonNote(note.salon_id, note.branch_id);
              }
              
              Alert.alert('Успешно', 'Заметка удалена');
              loadNotes();
            } catch (err: any) {
              console.error('Error deleting note:', err);
              const errorMessage = err.response?.data?.detail || err.message || 'Не удалось удалить заметку';
              Alert.alert('Ошибка', errorMessage);
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${day}.${month}.${year} ${hours}:${minutes}`;
  };

  const renderNoteItem = ({ item }: { item: ClientNote }) => {
    return (
      <Card style={styles.noteCard}>
        <View style={styles.noteHeader}>
          <View style={styles.noteHeaderLeft}>
            <View style={styles.noteTypeBadge}>
              <Text style={[
                styles.noteTypeText,
                item.type === 'master' ? styles.noteTypeMaster : styles.noteTypeSalon
              ]}>
                {item.type === 'master' ? 'О мастере' : 'О салоне'}
              </Text>
            </View>
            <View style={styles.noteTitleContainer}>
              <Text style={styles.noteTitle}>
                {item.type === 'master' 
                  ? (item.master_name || `Мастер #${item.master_id}`)
                  : (item.salon_name || `Салон #${item.salon_id}`)
                }
              </Text>
              {item.type === 'master' && item.salon_name && (
                <Text style={styles.noteSubtitle}>{item.salon_name}</Text>
              )}
              {item.type === 'salon' && item.branch_name && (
                <Text style={styles.noteSubtitle}>Филиал: {item.branch_name}</Text>
              )}
            </View>
          </View>
        </View>
        
        <Text style={styles.noteText}>{item.note}</Text>
        
        <View style={styles.noteFooter}>
          <Text style={styles.noteDate}>{formatDate(item.updated_at)}</Text>
          <View style={styles.noteActions}>
            <TouchableOpacity
              onPress={() => handleEdit(item)}
              style={styles.actionButton}
            >
              <Ionicons name="create-outline" size={20} color="#4CAF50" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleDelete(item)}
              style={[styles.actionButton, styles.deleteButton]}
              disabled={deleting}
            >
              <Ionicons name="trash-outline" size={20} color="#d32f2f" />
            </TouchableOpacity>
          </View>
        </View>
      </Card>
    );
  };

  if (loading) {
    return (
      <ScreenContainer>
        <Stack.Screen
          options={{
            title: 'Мои заметки',
            headerShown: true,
          }}
        />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Загрузка заметок...</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (error) {
    return (
      <ScreenContainer>
        <Stack.Screen
          options={{
            title: 'Мои заметки',
            headerShown: true,
          }}
        />
        <View style={styles.centerContainer}>
          <Text style={styles.errorTitle}>Ошибка</Text>
          <Text style={styles.errorText}>{error}</Text>
          <PrimaryButton title="Повторить" onPress={loadNotes} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <Stack.Screen
        options={{
          title: 'Мои заметки',
          headerShown: true,
        }}
      />
      
      {notes.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyTitle}>Нет заметок</Text>
          <Text style={styles.emptyText}>
            У вас пока нет заметок. Создавайте заметки о мастерах и салонах при бронировании услуг.
          </Text>
        </View>
      ) : (
        <FlatList
          data={notes}
          renderItem={renderNoteItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={['#4CAF50']}
            />
          }
        />
      )}

      {/* Модальное окно редактирования */}
      <Modal
        visible={editingNote !== null}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setEditingNote(null);
          setEditText('');
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Редактировать заметку</Text>
            
            <ScrollView style={styles.modalScrollView}>
              <TextInput
                style={styles.modalTextInput}
                multiline
                numberOfLines={8}
                value={editText}
                onChangeText={setEditText}
                placeholder="Введите текст заметки..."
                textAlignVertical="top"
              />
            </ScrollView>

            <View style={styles.modalButtons}>
              <SecondaryButton
                title="Отмена"
                onPress={() => {
                  setEditingNote(null);
                  setEditText('');
                }}
                disabled={saving}
                style={styles.modalButton}
              />
              <PrimaryButton
                title={saving ? "Сохранение..." : "Сохранить"}
                onPress={handleSave}
                disabled={saving || !editText.trim()}
                loading={saving}
                style={styles.modalButton}
              />
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#F44336',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  listContent: {
    padding: 16,
  },
  noteCard: {
    marginBottom: 16,
  },
  noteHeader: {
    marginBottom: 12,
  },
  noteHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  noteTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#E3F2FD',
  },
  noteTypeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  noteTypeMaster: {
    color: '#1976D2',
  },
  noteTypeSalon: {
    color: '#388E3C',
  },
  noteTitleContainer: {
    flex: 1,
  },
  noteTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  noteSubtitle: {
    fontSize: 12,
    color: '#666',
  },
  noteText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
    marginBottom: 12,
  },
  noteFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  noteDate: {
    fontSize: 12,
    color: '#999',
  },
  noteActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
  },
  deleteButton: {
    backgroundColor: '#FFEBEE',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 20,
    width: '90%',
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#333',
  },
  modalScrollView: {
    maxHeight: 300,
  },
  modalTextInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    minHeight: 150,
    textAlignVertical: 'top',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  modalButton: {
    flex: 1,
  },
});

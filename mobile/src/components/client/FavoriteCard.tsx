/**
 * FavoriteCard - компактная карточка избранного мастера.
 * Toggle = remove (onToggleFavorite создаётся родителем с замыканием на favKey).
 */

import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { FavoriteButtonControlled } from './FavoriteButtonControlled'

interface FavoriteCardProps {
  masterName: string
  onPress?: () => void
  onToggleFavorite: () => void | Promise<void>
  isFavorite: boolean
}

export function FavoriteCard({
  masterName,
  onPress,
  onToggleFavorite,
  isFavorite
}: FavoriteCardProps) {
  return (
    <View style={styles.card}>
      <TouchableOpacity
        onPress={onPress}
        style={styles.content}
        activeOpacity={0.7}
      >
        <Text style={styles.name} numberOfLines={2}>
          {masterName}
        </Text>
      </TouchableOpacity>

      <View style={styles.heartContainer}>
        <FavoriteButtonControlled
          isFavorite={isFavorite}
          onToggle={onToggleFavorite}
          size={18}
          containerSize={32}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    minHeight: 60,
    width: '100%',
  },
  content: {
    flex: 1,
    marginRight: 8,
  },
  name: {
    fontSize: 14,
    fontWeight: '500',
    color: '#16a34a',
  },
  heartContainer: {
    marginTop: -4,
  },
})

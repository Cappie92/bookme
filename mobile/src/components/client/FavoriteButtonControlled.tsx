/**
 * Controlled FavoriteButton — только isFavorite и onToggle.
 * Логика toggle живёт в родителе (store).
 */

import React from 'react'
import { TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

interface FavoriteButtonControlledProps {
  isFavorite: boolean
  onToggle: () => void | Promise<void>
  size?: number
  containerSize?: number
  disabled?: boolean
}

export function FavoriteButtonControlled({
  isFavorite,
  onToggle,
  size = 24,
  containerSize,
  disabled = false
}: FavoriteButtonControlledProps) {
  const [isLoading, setIsLoading] = React.useState(false)
  const box = containerSize ?? size + 8

  const handlePress = async () => {
    if (disabled || isLoading) return

    setIsLoading(true)
    try {
      await onToggle()
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <TouchableOpacity
        style={[styles.button, { width: box, height: box }]}
        disabled
      >
        <ActivityIndicator size="small" color="#16a34a" />
      </TouchableOpacity>
    )
  }

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={disabled}
      style={[styles.button, { width: box, height: box }]}
      activeOpacity={0.6}
    >
      <Ionicons
        name={isFavorite ? 'heart' : 'heart-outline'}
        size={size}
        color={isFavorite ? '#dc2626' : '#9ca3af'}
      />
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  button: {
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
})

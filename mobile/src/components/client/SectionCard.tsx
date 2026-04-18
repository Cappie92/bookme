/**
 * SectionCard - общая обёртка для секций ClientDashboard
 * Белая карточка с заголовком и опциональными кнопками справа
 */

import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'

interface SectionCardProps {
  title: string
  children: React.ReactNode
  secondaryButton?: {
    label: string
    onPress: () => void
  }
  footerButton?: {
    label: string
    onPress: () => void
  }
}

export function SectionCard({ title, children, secondaryButton, footerButton }: SectionCardProps) {
  return (
    <View style={styles.card}>
      {/* Header — только secondary (История и т.п.), rightButton перенесён в footer */}
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {secondaryButton && (
          <TouchableOpacity
            onPress={secondaryButton.onPress}
            style={styles.secondaryButton}
            activeOpacity={0.7}
          >
            <Text style={styles.secondaryButtonText}>{secondaryButton.label}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Content */}
      <View style={styles.content}>
        {children}
      </View>

      {/* Footer — "Посмотреть все" и аналогичные CTA */}
      {footerButton && (
        <TouchableOpacity
          onPress={footerButton.onPress}
          style={styles.footerButton}
          activeOpacity={0.7}
        >
          <Text style={styles.footerButtonText}>{footerButton.label}</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  secondaryButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#4b5563',
  },
  content: {
    padding: 16,
  },
  footerButton: {
    marginHorizontal: 16,
    marginBottom: 16,
    marginTop: 4,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  footerButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#16a34a',
  },
})

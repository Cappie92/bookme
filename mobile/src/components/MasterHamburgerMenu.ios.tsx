import React, { type ComponentProps } from 'react';
import {
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IOS_MASTER_CAPABILITIES } from '@src/config/iosMasterCapabilities';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

interface MasterHamburgerMenuProps {
  visible: boolean;
  onClose: (reason?: string) => void;
}

const IOS_MENU_ITEMS: ReadonlyArray<{
  id: 'schedule' | 'services';
  label: string;
  icon: IoniconName;
  route: '/master/schedule' | '/master/services';
}> = [
  { id: 'schedule', label: 'Расписание', icon: 'calendar-outline', route: '/master/schedule' },
  { id: 'services', label: 'Услуги', icon: 'cut-outline', route: '/master/services' },
];

export function MasterHamburgerMenu({ visible, onClose }: MasterHamburgerMenuProps) {
  const insets = useSafeAreaInsets();
  const sheetMaxHeight = Math.round(Dimensions.get('window').height * 0.82);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => onClose('hardware_back')}
      statusBarTranslucent
      presentationStyle="overFullScreen"
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.overlayTouchable}
          activeOpacity={1}
          onPress={() => onClose('overlay_press')}
          accessibilityLabel="Закрыть меню"
        />
        <View style={[styles.sheet, { maxHeight: sheetMaxHeight }]}>
          <View style={styles.header}>
            <Text style={styles.title}>Меню</Text>
            <TouchableOpacity
              onPress={() => onClose('close_button')}
              style={styles.closeButton}
              hitSlop={8}
              accessibilityLabel="Закрыть меню"
            >
              <Ionicons name="close" size={22} color="#666" />
            </TouchableOpacity>
          </View>
          <ScrollView
            contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 12) + 16 }}
            showsVerticalScrollIndicator={false}
          >
            {IOS_MENU_ITEMS.map((item) => (
              <TouchableOpacity
                key={item.id}
                testID={`ios-master-menu-${item.id}`}
                style={styles.menuItem}
                activeOpacity={0.7}
                onPress={() => {
                  onClose('nav_action');
                  router.push(item.route);
                }}
              >
                <View style={styles.menuIconWrap}>
                  <Ionicons name={item.icon} size={22} color="#333" />
                </View>
                <Text style={styles.menuLabel}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={22} color="#999" />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

if (!IOS_MASTER_CAPABILITIES.schedule || !IOS_MASTER_CAPABILITIES.services) {
  throw new Error('Invalid fixed iOS master menu policy');
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  overlayTouchable: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuItem: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  menuIconWrap: { width: 38, alignItems: 'flex-start' },
  menuLabel: { flex: 1, fontSize: 16, color: '#333' },
});

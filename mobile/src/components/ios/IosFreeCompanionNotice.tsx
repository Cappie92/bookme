import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Linking from 'expo-linking';
import {
  IOS_CLIENT_FREE_FEATURES,
  IOS_FREE_COMPANION_BODY,
  IOS_FREE_COMPANION_PRICES,
  IOS_FREE_COMPANION_TITLE,
  IOS_FREE_COMPANION_WELCOME,
  IOS_MASTER_FREE_FEATURES,
} from '@src/content/iosFreeCompanion';
import { logger } from '@src/utils/logger';
import {
  IOS_FREE_COMPANION_PATH,
  openLegalDocument,
  USER_AGREEMENT_PATH,
} from '@src/utils/legalDocuments';

type Variant = 'welcome' | 'master' | 'client';

type Props = {
  variant: Variant;
  openURL?: (url: string) => Promise<unknown>;
};

export function IosFreeCompanionNotice({ variant, openURL = Linking.openURL }: Props) {
  const openDoc = (path: string) => {
    openLegalDocument(path, openURL).catch((error) => {
      logger.error('[legal] Failed to open iOS companion document', error);
    });
  };

  return (
    <View
      testID={`ios-free-companion-${variant}`}
      style={variant === 'welcome' ? styles.welcome : styles.card}
    >
      <Text style={styles.title}>{IOS_FREE_COMPANION_TITLE}</Text>
      {variant === 'welcome' ? (
        <Text style={styles.body}>{IOS_FREE_COMPANION_WELCOME}</Text>
      ) : (
        <Text style={styles.body}>{IOS_FREE_COMPANION_BODY}</Text>
      )}
      {variant !== 'welcome' ? (
        <View style={styles.list}>
          {(variant === 'master' ? IOS_MASTER_FREE_FEATURES : IOS_CLIENT_FREE_FEATURES).map((item) => (
            <Text key={item} style={styles.item}>
              {'• '}
              {item}
            </Text>
          ))}
        </View>
      ) : null}
      <Text style={styles.note}>{IOS_FREE_COMPANION_PRICES}</Text>
      {variant !== 'welcome' ? (
        <View style={styles.links}>
          <TouchableOpacity
            testID="ios-user-agreement-link"
            onPress={() => openDoc(USER_AGREEMENT_PATH)}
            accessibilityRole="link"
          >
            <Text style={styles.link}>Пользовательское соглашение</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="ios-free-companion-link"
            onPress={() => openDoc(IOS_FREE_COMPANION_PATH)}
            accessibilityRole="link"
          >
            <Text style={styles.link}>Подробнее о версии для iOS</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  welcome: {
    marginTop: 12,
    marginBottom: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  card: {
    marginTop: 8,
    marginBottom: 8,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e7e2df',
  },
  title: { fontSize: 16, fontWeight: '700', color: '#1c1917' },
  body: { marginTop: 6, fontSize: 14, lineHeight: 20, color: '#44403c' },
  list: { marginTop: 8 },
  item: { fontSize: 13, lineHeight: 18, color: '#44403c' },
  note: { marginTop: 8, fontSize: 13, lineHeight: 18, color: '#57534e' },
  links: { marginTop: 10, gap: 8 },
  link: { fontSize: 14, color: '#2e7d32', fontWeight: '600' },
});

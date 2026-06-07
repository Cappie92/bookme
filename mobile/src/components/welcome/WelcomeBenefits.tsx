import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@src/components/Card';

type BenefitItem = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
};

const BENEFITS: BenefitItem[] = [
  {
    icon: 'calendar-outline',
    title: 'Запись 24/7',
    description: 'Клиенты записываются сами по ссылке',
  },
  {
    icon: 'time-outline',
    title: 'Расписание под рукой',
    description: 'Смены, слоты, подтверждения',
  },
  {
    icon: 'people-outline',
    title: 'Клиенты и лояльность',
    description: 'История, скидки, баллы',
  },
  {
    icon: 'stats-chart-outline',
    title: 'Финансы и статистика',
    description: 'Доходы, операции, загрузка',
  },
];

export function WelcomeBenefits() {
  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Возможности</Text>
      <View style={styles.grid}>
        {BENEFITS.map((item) => (
          <Card key={item.title} style={styles.card} padding={14}>
            <View style={styles.row}>
              <View style={styles.iconWrap}>
                <Ionicons name={item.icon} size={22} color="#4CAF50" />
              </View>
              <View style={styles.textCol}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.description}>{item.description}</Text>
              </View>
            </View>
          </Card>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  grid: {
    gap: 12,
  },
  card: {},
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e8f5e9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  textCol: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  description: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
});

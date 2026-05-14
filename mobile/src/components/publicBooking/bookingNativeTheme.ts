/**
 * Визуальные токены публичной записи: iOS (grouped) vs Android Material 3.
 * Только UI — бизнес-логика остаётся в экране.
 */
import { Platform, StyleSheet, type TextStyle, type ViewStyle } from 'react-native';

export type BookingNativeVariant = 'ios' | 'android';

export function getBookingNativeVariant(): BookingNativeVariant {
  return Platform.OS === 'ios' ? 'ios' : 'android';
}

const GREEN = '#50b95a';
const GREEN_DARK = '#2b7b34';
const GREEN_TINT = '#eaf7ea';
const GREEN_BORDER = '#d8f0da';
const BG_IOS = '#f4f6f4';
const BG_ANDROID = '#f4f6f4';
const CARD = '#ffffff';
const LINE = '#dfe7df';
const MUTED = '#6f7a70';
const TEXT = '#182218';

export type BookingNativeTheme = {
  variant: BookingNativeVariant;
  colors: {
    screenBg: string;
    cardBg: string;
    cardBorder: string;
    text: string;
    muted: string;
    primary: string;
    primaryInk: string;
    primaryTint: string;
    primaryBorder: string;
    navBg: string;
    tonalBannerBg: string;
    tonalBannerBorder: string;
    summaryBg: string;
    summaryBorder: string;
    chipBorder: string;
    chipSelectedBg: string;
    chipSelectedBorder: string;
    disabledRowBg: string;
    ctaShadow: string;
  };
  radii: {
    card: number;
    row: number;
    chip: number;
    sheet: number;
    nav: number;
  };
  font: {
    navTitle: TextStyle;
    sectionTitle: TextStyle;
    body: TextStyle;
    caption: TextStyle;
    masterName: TextStyle;
  };
  elevation: {
    card: ViewStyle;
    cta: ViewStyle;
  };
};

function iosTheme(): BookingNativeTheme {
  return {
    variant: 'ios',
    colors: {
      screenBg: BG_IOS,
      cardBg: CARD,
      cardBorder: LINE,
      text: TEXT,
      muted: MUTED,
      primary: GREEN,
      primaryInk: GREEN_DARK,
      primaryTint: GREEN_TINT,
      primaryBorder: GREEN_BORDER,
      navBg: 'rgba(244,246,244,0.96)',
      tonalBannerBg: GREEN_TINT,
      tonalBannerBorder: GREEN_BORDER,
      summaryBg: '#edf8ef',
      summaryBorder: '#d2ebd6',
      chipBorder: LINE,
      chipSelectedBg: GREEN,
      chipSelectedBorder: GREEN,
      disabledRowBg: '#f5f5f5',
      ctaShadow: GREEN,
    },
    radii: { card: 22, row: 16, chip: 16, sheet: 24, nav: 0 },
    font: {
      navTitle: { fontSize: 17, fontWeight: '700', color: TEXT },
      sectionTitle: { fontSize: 15, fontWeight: '700', color: TEXT, letterSpacing: -0.2 },
      body: { fontSize: 15, color: TEXT },
      caption: { fontSize: 12, color: MUTED, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },
      masterName: { fontSize: 22, fontWeight: '800', color: TEXT, letterSpacing: -0.4 },
    },
    elevation: {
      card: {
        shadowColor: '#1b2c1d',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 20,
        elevation: 3,
      },
      cta: {
        shadowColor: GREEN,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.22,
        shadowRadius: 16,
        elevation: 6,
      },
    },
  };
}

function androidTheme(): BookingNativeTheme {
  return {
    variant: 'android',
    colors: {
      screenBg: BG_ANDROID,
      cardBg: '#f8fbf8',
      cardBorder: '#dfe7df',
      text: TEXT,
      muted: MUTED,
      primary: GREEN,
      primaryInk: GREEN_DARK,
      primaryTint: '#e9f6ea',
      primaryBorder: '#d4ead7',
      navBg: 'rgba(248,251,248,0.98)',
      tonalBannerBg: '#e9f6ea',
      tonalBannerBorder: '#d4ead7',
      summaryBg: '#edf8ef',
      summaryBorder: '#cfe8d3',
      chipBorder: '#d7e2d7',
      chipSelectedBg: '#dff4e1',
      chipSelectedBorder: '#8fd49a',
      disabledRowBg: '#f1f3f1',
      ctaShadow: '#000',
    },
    radii: { card: 26, row: 18, chip: 18, sheet: 28, nav: 0 },
    font: {
      navTitle: { fontSize: 20, fontWeight: '700', color: TEXT, letterSpacing: -0.3 },
      sectionTitle: { fontSize: 15, fontWeight: '700', color: TEXT },
      body: { fontSize: 15, color: TEXT },
      caption: { fontSize: 11, color: '#879287', fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
      masterName: { fontSize: 22, fontWeight: '700', color: TEXT, letterSpacing: -0.3 },
    },
    elevation: {
      card: {
        shadowColor: '#1b2c1d',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.1,
        shadowRadius: 16,
        elevation: 2,
      },
      cta: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
        elevation: 4,
      },
    },
  };
}

export function getBookingNativeTheme(): BookingNativeTheme {
  return getBookingNativeVariant() === 'ios' ? iosTheme() : androidTheme();
}

/** Общие отступы горизонтали для карточек и шагов */
export const BOOKING_H_PAD = 16;

export function createBookingNativeStyles(t: BookingNativeTheme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.colors.screenBg },
    navRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: BOOKING_H_PAD,
      paddingBottom: 10,
      paddingTop: 4,
      backgroundColor: t.colors.navBg,
    },
    navIconBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: t.colors.cardBorder,
      backgroundColor: t.colors.cardBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    /** Гость: «Войти» + иконка в одной капсуле (не декоративные три точки). */
    navRightGuest: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      minHeight: 40,
      paddingLeft: 10,
      paddingRight: 12,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: t.colors.cardBorder,
      backgroundColor: t.colors.cardBg,
    },
    navRightGuestLabel: {
      fontSize: 15,
      fontWeight: '700',
      color: t.colors.text,
    },
    navTitleWrap: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
    scrollContent: { paddingTop: 6, paddingHorizontal: BOOKING_H_PAD, paddingBottom: 120 },
    card: {
      backgroundColor: t.colors.cardBg,
      borderRadius: t.radii.card,
      borderWidth: 1,
      borderColor: t.colors.cardBorder,
      padding: 16,
      marginBottom: 14,
      ...t.elevation.card,
    },
    masterRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 },
    avatar: {
      width: 64,
      height: 64,
      borderRadius: t.variant === 'ios' ? 18 : 20,
      backgroundColor: '#eef0ee',
    },
    avatarPh: {
      width: 64,
      height: 64,
      borderRadius: t.variant === 'ios' ? 18 : 20,
      backgroundColor: '#eef0ee',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: t.colors.cardBorder,
    },
    metaBlock: { gap: 10, marginTop: 4 },
    metaLabel: { ...t.font.caption },
    metaValue: { fontSize: 16, fontWeight: '600', color: t.colors.text },
    metaHint: { fontSize: 13, color: t.colors.muted, lineHeight: 18 },
    mapsBtn: {
      minHeight: 48,
      borderRadius: t.radii.row,
      backgroundColor: t.colors.primaryTint,
      borderWidth: 1,
      borderColor: t.colors.primaryBorder,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      marginTop: 6,
      alignSelf: 'stretch',
    },
    mapsBtnText: { fontSize: 15, fontWeight: '700', color: t.colors.primaryInk },
    actionBtnStack: { gap: 10, marginTop: 4, alignSelf: 'stretch' },
    phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
    phoneText: { fontSize: 16, fontWeight: '600', color: t.colors.primary },
    tonalBanner: {
      borderRadius: t.variant === 'ios' ? 18 : 20,
      backgroundColor: t.colors.tonalBannerBg,
      borderWidth: 1,
      borderColor: t.colors.tonalBannerBorder,
      padding: 14,
      marginBottom: 14,
    },
    tonalBannerTitle: { fontSize: 16, fontWeight: '800', color: t.colors.primaryInk, letterSpacing: -0.2 },
    tonalBannerSub: { fontSize: 13, color: '#55835d', marginTop: 4, lineHeight: 18 },
    sectionHead: { marginBottom: 8, marginTop: 4 },
    stepRow: {
      minHeight: 54,
      borderRadius: t.radii.row,
      borderWidth: 1,
      borderColor: t.colors.cardBorder,
      backgroundColor: t.colors.cardBg,
      paddingHorizontal: 14,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      marginBottom: 10,
    },
    stepRowDisabled: { backgroundColor: t.colors.disabledRowBg, opacity: 0.95 },
    stepPrimary: { flex: 1, fontSize: 15, fontWeight: '700', color: t.colors.text },
    stepMuted: { flex: 1, fontSize: 15, color: t.colors.muted },
    stepMutedDis: { color: '#9aa59b' },
    stepAction: { fontSize: 13, fontWeight: '800', color: t.colors.primary },
    chev: { color: '#8a968a' },
    summarySpacer: {
      height: 22,
    },
    summaryBox: {
      borderRadius: t.variant === 'ios' ? 20 : 22,
      backgroundColor: '#ffffff',
      borderWidth: 1.5,
      borderColor: t.variant === 'ios' ? '#c8e6c9' : '#b8d9be',
      padding: 16,
      marginBottom: 16,
      shadowColor: '#1b2c1d',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: t.variant === 'ios' ? 0.08 : 0.06,
      shadowRadius: 12,
      elevation: t.variant === 'ios' ? 3 : 2,
    },
    summaryHeading: {
      marginBottom: 12,
    },
    sumKvRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 12,
      marginBottom: 12,
    },
    sumKvRowDetailLast: {
      marginBottom: 0,
    },
    sumKvLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: t.colors.muted,
      minWidth: 86,
      maxWidth: '36%',
      paddingTop: 2,
    },
    sumKvValue: {
      flex: 1,
      fontSize: 15,
      fontWeight: '600',
      color: t.colors.text,
      lineHeight: 21,
      textAlign: 'right',
    },
    sumSectionSep: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: '#cfe8d3',
      marginTop: 4,
      marginBottom: 12,
    },
    sumKvRowPay: {
      marginTop: 2,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: '#cfe8d3',
    },
    sumKvLabelPay: {
      fontSize: 15,
      fontWeight: '800',
      color: t.colors.primaryInk,
      minWidth: 86,
      maxWidth: '36%',
      paddingTop: 2,
    },
    sumKvValuePay: {
      flex: 1,
      fontSize: 17,
      fontWeight: '800',
      color: t.colors.primaryInk,
      lineHeight: 22,
      textAlign: 'right',
    },
    ctaBar: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: BOOKING_H_PAD,
      paddingTop: 20,
      backgroundColor: t.colors.screenBg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: LINE,
    },
    ctaBtn: {
      minHeight: 54,
      borderRadius: t.variant === 'ios' ? 18 : 20,
      backgroundColor: t.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      ...t.elevation.cta,
    },
    ctaBtnDisabled: { opacity: 0.65 },
    ctaText: { color: '#fff', fontSize: 17, fontWeight: '800' },
    badge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: '#fff7e6',
      borderWidth: 1,
      borderColor: '#f2deb0',
    },
    badgeText: { fontSize: 11, fontWeight: '800', color: '#976400' },
    sheetModal: {
      marginHorizontal: 16,
      marginBottom: 24,
      borderRadius: t.radii.sheet,
      backgroundColor: t.colors.cardBg,
      borderWidth: 1,
      borderColor: t.colors.cardBorder,
      maxHeight: '88%',
      overflow: 'hidden',
      ...t.elevation.card,
    },
    sheetGrab: {
      width: 42,
      height: 5,
      borderRadius: 999,
      backgroundColor: '#d9dfd9',
      alignSelf: 'center',
      marginTop: 10,
      marginBottom: 8,
    },
    sheetTitle: { fontSize: 18, fontWeight: '800', color: t.colors.text },
    sheetBtn: { paddingVertical: 8, paddingHorizontal: 4 },
    sheetBtnText: { fontSize: 15, fontWeight: '800', color: t.colors.primary },
    bookingPreviewBox: {
      backgroundColor: t.colors.primaryTint,
      borderRadius: t.radii.row,
      borderWidth: 1,
      borderColor: t.colors.primaryBorder,
      padding: 14,
      gap: 6,
    },
    bookingPreviewLine: { fontSize: 15, color: t.colors.primaryInk, lineHeight: 21 },
    ghostBtn: { paddingVertical: 14, alignItems: 'center' },
    ghostText: { fontSize: 16, fontWeight: '600', color: '#495549' },
  });
}

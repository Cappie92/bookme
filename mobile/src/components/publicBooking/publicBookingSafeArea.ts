import type { EdgeInsets } from 'react-native-safe-area-context';

/** Резерв под фиксированную CTA «Записаться» на экране wizard. */
export const PUBLIC_BOOKING_CTA_SCROLL_RESERVE = 120;

const MIN_BOTTOM_INSET = 8;

/** Нижний safe inset для публичной записи (system nav / home indicator). */
export function publicBookingBottomInset(insets: EdgeInsets): number {
  return Math.max(insets.bottom, MIN_BOTTOM_INSET);
}

/** paddingBottom для bottom sheet (услуга, дата, guest auth). */
export function publicBookingSheetBottomPadding(insets: EdgeInsets, extra = 16): number {
  return publicBookingBottomInset(insets) + extra;
}

/** paddingBottom для ScrollView главного экрана wizard с фиксированной CTA. */
export function publicBookingScrollBottomPadding(insets: EdgeInsets): number {
  return PUBLIC_BOOKING_CTA_SCROLL_RESERVE + publicBookingBottomInset(insets);
}

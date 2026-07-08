import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { buildMasterPublicBookingUrl } from '@src/utils/masterPublicBooking';
import { normalizeMasterDomainSlug } from '@src/utils/masterDomainSlug';
import { env } from '@src/config/env';
import type { MasterSettings } from '@src/services/api/master';

export function useMasterQuickActions(masterSettings: MasterSettings | null) {
  const [socialPostVisible, setSocialPostVisible] = useState(false);
  const [notificationsVisible, setNotificationsVisible] = useState(false);
  const [copyToastMessage, setCopyToastMessage] = useState<string | null>(null);
  const copyToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const publicBookingUrl = useMemo(
    () => buildMasterPublicBookingUrl(masterSettings?.master?.domain, env.WEB_URL),
    [masterSettings?.master?.domain]
  );

  const masterSlug = useMemo(
    () => normalizeMasterDomainSlug(masterSettings?.master?.domain || ''),
    [masterSettings?.master?.domain]
  );

  const showCopyToast = useCallback((message: string) => {
    if (copyToastTimerRef.current) clearTimeout(copyToastTimerRef.current);
    setCopyToastMessage(message);
    copyToastTimerRef.current = setTimeout(() => {
      setCopyToastMessage(null);
      copyToastTimerRef.current = null;
    }, 2200);
  }, []);

  useEffect(
    () => () => {
      if (copyToastTimerRef.current) clearTimeout(copyToastTimerRef.current);
    },
    []
  );

  const copyPublicLink = useCallback(async () => {
    if (!publicBookingUrl) {
      showCopyToast('Ссылка пока недоступна');
      return;
    }
    try {
      await Clipboard.setStringAsync(publicBookingUrl);
      showCopyToast('Ссылка скопирована');
    } catch {
      showCopyToast('Не удалось скопировать');
    }
  }, [publicBookingUrl, showCopyToast]);

  const openSocialPost = useCallback(() => {
    if (!masterSlug || !publicBookingUrl) {
      showCopyToast('Сначала настройте страницу записи');
      return;
    }
    setSocialPostVisible(true);
  }, [masterSlug, publicBookingUrl, showCopyToast]);

  return {
    publicBookingUrl,
    masterSlug,
    socialPostVisible,
    setSocialPostVisible,
    notificationsVisible,
    setNotificationsVisible,
    copyToastMessage,
    copyPublicLink,
    openSocialPost,
  };
}

import React from 'react';
import { MasterSettings } from '@src/services/api/master';
import { FreeSlotsShareCardModal } from '@src/components/modals/FreeSlotsShareCardModal';
import { buildMasterPublicBookingUrl } from '@src/utils/masterPublicBooking';
import { masterDomainSlugFromStored } from '@src/utils/masterDomainSlug';
import { env } from '@src/config/env';

interface MasterFreeSlotsShareHostProps {
  visible: boolean;
  onClose: () => void;
  settings: MasterSettings | null;
}

/** Единая точка монтирования модалки «Пост для соцсетей» (dashboard + settings). */
export function MasterFreeSlotsShareHost({ visible, onClose, settings }: MasterFreeSlotsShareHostProps) {
  const slug = masterDomainSlugFromStored(settings?.master?.domain);
  const bookingUrl = buildMasterPublicBookingUrl(settings?.master?.domain, env.WEB_URL);

  if (!slug || !bookingUrl) return null;

  return (
    <FreeSlotsShareCardModal
      visible={visible}
      onClose={onClose}
      slug={slug}
      bookingUrl={bookingUrl}
      masterNameFallback={settings?.user?.full_name || ''}
    />
  );
}

import React from 'react';
import { CANCELLATION_REASONS } from '../../../utils/bookingOutcome';
import { masterZClass } from '../../../config/masterOverlayZIndex';
import MasterActionSheet from './MasterActionSheet';

const DEFAULT_CANCEL_Z = masterZClass('bookingCancel');

/** Выбор причины отмены — те же ключи, что в CANCELLATION_REASONS */
export default function MasterBookingCancelSheet({
  isOpen,
  onClose,
  onSelectReason,
  zIndexClass = DEFAULT_CANCEL_Z,
  disableEscapeKey = false,
}) {
  return (
    <MasterActionSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Причина отмены"
      zIndexClass={zIndexClass}
      labelledBy="master-cancel-reason-title"
      disableEscapeKey={disableEscapeKey}
    >
      <div className="space-y-2">
        {Object.entries(CANCELLATION_REASONS).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => onSelectReason(key)}
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-800 hover:bg-gray-50 active:bg-gray-100"
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full rounded-xl py-3 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          Отмена
        </button>
      </div>
    </MasterActionSheet>
  );
}

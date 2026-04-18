import React, { useEffect, useLayoutEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { masterZClass } from '../../../config/masterOverlayZIndex';
import { lockMasterBodyScroll, unlockMasterBodyScroll } from '../../../utils/masterBodyScrollLock';

const DEFAULT_SHEET_Z = masterZClass('bookingDetail');

/**
 * Нижний action sheet (mobile). Только разметка + закрытие; контент — children.
 * @param {boolean} [disableEscapeKey] — если родитель сам обрабатывает Escape (вложенные модалки).
 */
export default function MasterActionSheet({
  isOpen,
  onClose,
  title,
  children,
  zIndexClass = DEFAULT_SHEET_Z,
  labelledBy,
  disableEscapeKey = false,
}) {
  useLayoutEffect(() => {
    if (!isOpen) return undefined;
    lockMasterBodyScroll();
    return () => {
      unlockMasterBodyScroll();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || disableEscapeKey) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose, disableEscapeKey]);

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 ${zIndexClass} flex flex-col justify-end`} role="presentation">
      <button
        type="button"
        aria-label="Закрыть"
        className="absolute inset-0 bg-black/45"
        onClick={onClose}
      />
      <div
        className="relative flex max-h-[min(92dvh,900px)] flex-col rounded-t-2xl bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? labelledBy || 'master-action-sheet-title' : labelledBy}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-100 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          {title ? (
            <h2
              id={labelledBy || 'master-action-sheet-title'}
              className="min-w-0 flex-1 text-base font-semibold text-gray-900 truncate pr-2"
            >
              {title}
            </h2>
          ) : (
            <span id={labelledBy || undefined} className="sr-only">
              Панель действий
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100"
            aria-label="Закрыть"
          >
            <XMarkIcon className="h-6 w-6" strokeWidth={2} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>
  );
}

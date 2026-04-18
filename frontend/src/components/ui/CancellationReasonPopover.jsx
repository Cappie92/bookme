/**
 * Popover для отображения причины отмены записи.
 * Якорный, закрывается по клику вне, Esc.
 */
import React, { useEffect, useRef } from 'react';

export default function CancellationReasonPopover({ content, anchorRect, onClose }) {
  const popoverRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const onMouseDown = (e) => {
      if (!popoverRef.current) return;
      if (popoverRef.current.contains(e.target)) return;
      if (e.target.closest('.reason-trigger-btn')) return;
      onClose();
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [onClose]);

  if (!anchorRect) return null;

  return (
    <div
      ref={popoverRef}
      className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-md py-2.5 px-3 max-w-[320px]"
      style={{
        left: Math.min(anchorRect.left, window.innerWidth - 324),
        top: anchorRect.bottom + 4,
      }}
    >
      <p className="text-xs font-medium text-gray-500 mb-1">Причина отмены</p>
      <p className="text-gray-700 text-sm">{content || 'Причина не указана'}</p>
    </div>
  );
}

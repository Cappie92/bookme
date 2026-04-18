/**
 * Компактный popover для заметки о клиенте.
 * Без overlay/backdrop — якорный, закрывается по клику вне, Esc, повторному клику по триггеру.
 *
 * Режимы:
 * - clientKey: fetch из GET /api/master/clients/{client_key}
 * - content: отобразить текст напрямую (без запроса)
 */
import React, { useState, useEffect, useRef } from 'react';
import { apiGet } from '../../utils/api';

export default function NotePopover({ clientKey, content, anchorRect, onClose }) {
  const [text, setText] = useState(content != null ? String(content) : '');
  const [loading, setLoading] = useState(!content && !!clientKey);
  const popoverRef = useRef(null);

  useEffect(() => {
    if (content != null) {
      setText(String(content || '').trim() || 'Заметки нет');
      setLoading(false);
      return;
    }
    if (!clientKey) return;
    setLoading(true);
    setText('');
    apiGet(`/api/master/clients/${encodeURIComponent(clientKey)}`)
      .then((data) => {
        const note = (data.note || '').trim();
        setText(note || 'Заметки нет');
      })
      .catch(() => setText('Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [clientKey, content]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const onMouseDown = (e) => {
      if (!popoverRef.current) return;
      if (popoverRef.current.contains(e.target)) return;
      if (e.target.closest('.note-trigger-btn')) return;
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
      {loading ? (
        <p className="text-gray-500 text-sm">Загрузка…</p>
      ) : (
        <p className="text-gray-700 text-sm whitespace-pre-wrap break-words">{text}</p>
      )}
    </div>
  );
}

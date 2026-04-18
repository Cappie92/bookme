import React, { useState, useRef, useEffect } from 'react';
import { getCheapestPlanForFeature } from '../utils/getCheapestPlanForFeature';
import MasterNavTabIcon from './master/MasterNavTabIcon';

/**
 * Пункт меню в locked-состоянии (серый) с popover "Тестовый доступ".
 * Показывает: "Тестовый доступ", план, кнопки "Открыть демо" и "Перейти к тарифам".
 */
export default function LockedNavItem({
  /** tab key для MasterNavTabIcon (без emoji) */
  navTab,
  label,
  hasAccess,
  serviceFunctionId,
  tab,
  activeTab,
  handleTabChange,
  subscriptionPlans,
  dataTestId,
}) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setPopoverOpen(false);
    };
    if (popoverOpen) document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [popoverOpen]);

  if (hasAccess) return null;

  const planName = getCheapestPlanForFeature(subscriptionPlans || [], serviceFunctionId);
  const planText = planName ? `Раздел доступен с тарифа ${planName}` : 'Раздел доступен с тарифа Standard';

  return (
    <div ref={ref} className="relative" data-testid={dataTestId || undefined}>
      <div
        onClick={() => setPopoverOpen((v) => !v)}
        className="w-full text-left px-4 py-2 rounded-lg text-gray-400 cursor-pointer hover:bg-gray-100/50 transition-colors flex items-center justify-between"
      >
        <span className="flex items-center gap-2 min-w-0">
          {navTab ? <MasterNavTabIcon tab={navTab} className="h-5 w-5 shrink-0 text-gray-400" /> : null}
          <span className="truncate">{label}</span>
        </span>
      </div>
      {popoverOpen && (
        <div className="absolute left-full ml-2 top-0 z-50 w-56 bg-white rounded-lg shadow-lg border border-gray-200 p-3" data-testid="locked-popover">
          <p className="text-sm font-semibold text-gray-900 mb-1">Тестовый доступ</p>
          <p className="text-xs text-gray-600 mb-3">{planText}</p>
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              data-testid="locked-open-demo"
              onClick={() => {
                handleTabChange?.(tab);
                setPopoverOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 rounded hover:bg-green-100"
            >
              Открыть демо
            </button>
            <button
              type="button"
              data-testid="locked-go-tariffs"
              onClick={() => {
                handleTabChange?.('tariff');
                setPopoverOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 rounded hover:bg-blue-100"
            >
              Перейти к тарифам
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState, useRef, useEffect } from 'react';
import { LockClosedIcon } from '@heroicons/react/24/outline';
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
      <button
        type="button"
        onClick={() => setPopoverOpen((v) => !v)}
        className="group flex w-full cursor-pointer items-center justify-between gap-2 rounded-[10px] px-3 py-[9px] text-left text-[13px] font-medium leading-snug text-[#A0A0A0] transition-[background-color,color] duration-150 hover:bg-[#F4F1EF]/90 hover:text-[#8C8C8C] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4CAF50]/25 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          {navTab ? (
            <MasterNavTabIcon tab={navTab} className="h-[18px] w-[18px] shrink-0 opacity-50 group-hover:opacity-[0.65]" />
          ) : null}
          <span className="truncate">{label}</span>
        </span>
        <LockClosedIcon
          className="h-3.5 w-3.5 shrink-0 text-[#A0A0A0] opacity-50 group-hover:opacity-[0.65]"
          strokeWidth={2}
          aria-hidden
        />
      </button>
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

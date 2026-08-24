export type AppleIapErrorPresentation = {
  title: string;
  message: string;
  retryPending: boolean;
};

type HttpLikeError = {
  code?: unknown;
  message?: unknown;
  response?: {
    status?: unknown;
    data?: { detail?: unknown };
  };
};

function errorParts(error: unknown): { code: string; detail: string; status?: number } {
  const value = (error && typeof error === 'object' ? error : {}) as HttpLikeError;
  const status = typeof value.response?.status === 'number' ? value.response.status : undefined;
  const detailValue = value.response?.data?.detail;
  const detail = typeof detailValue === 'string'
    ? detailValue
    : typeof value.message === 'string'
      ? value.message
      : '';
  const code = typeof value.code === 'string' ? value.code : detail;
  return { code: code.toLowerCase(), detail: detail.toLowerCase(), status };
}

/** Stable user-facing semantics for direct StoreKit checkout failures. */
export function getAppleIapErrorPresentation(error: unknown): AppleIapErrorPresentation {
  const { code, detail, status } = errorParts(error);
  const combined = `${code} ${detail}`;

  if (
    combined.includes('app account token') ||
    combined.includes('app_account_token') ||
    combined.includes('another user') ||
    combined.includes('identity mismatch') ||
    combined.includes('apple_iap_session_changed')
  ) {
    return {
      title: 'Проверьте аккаунт DeDato',
      message:
        'Покупка связана с другим аккаунтом или аккаунт изменился во время операции. Войдите в нужный аккаунт DeDato и повторите восстановление покупок.',
      retryPending: false,
    };
  }

  if (
    combined.includes('provider') ||
    combined.includes('non_apple') ||
    combined.includes('non-apple') ||
    combined.includes('blocked_by_active')
  ) {
    return {
      title: 'Подписка уже активна',
      message:
        'Для аккаунта действует подписка через другой способ оплаты. Дождитесь окончания текущего периода или обратитесь в поддержку.',
      retryPending: false,
    };
  }

  if (
    combined.includes('unverified') ||
    combined.includes('invalid_signed_transaction') ||
    combined.includes('product_mismatch') ||
    combined.includes('product_not_allowed')
  ) {
    return {
      title: 'Покупка не подтверждена',
      message:
        'App Store не подтвердил транзакцию. Подписка не была активирована. Попробуйте восстановить покупки позже.',
      retryPending: false,
    };
  }

  if (
    status === 503 ||
    status === 502 ||
    status === 500 ||
    combined.includes('network') ||
    combined.includes('timeout') ||
    combined.includes('econnaborted') ||
    combined.includes('unavailable') ||
    combined.includes('acceptance_incomplete') ||
    combined.includes('status_refresh') ||
    combined.includes('failed to record')
  ) {
    return {
      title: 'Проверка покупки отложена',
      message:
        'Не удалось связаться с сервером DeDato. Если App Store уже подтвердил покупку, повторное списание не требуется: транзакция будет проверена снова автоматически.',
      retryPending: true,
    };
  }

  if (combined.includes('product_not_found') || combined.includes('native_module_unavailable')) {
    return {
      title: 'Покупка временно недоступна',
      message: 'Не удалось загрузить выбранную подписку из App Store. Попробуйте ещё раз позже.',
      retryPending: false,
    };
  }

  return {
    title: 'Не удалось завершить покупку',
    message: 'Попробуйте ещё раз или восстановите покупки, если App Store уже подтвердил оплату.',
    retryPending: false,
  };
}

export function getSubscriptionPeriodLabel(months: number): string {
  if (months === 1) return '1 месяц';
  if (months === 3) return '3 месяца';
  if (months === 6) return '6 месяцев';
  if (months === 12) return '1 год';
  return `${months} мес.`;
}

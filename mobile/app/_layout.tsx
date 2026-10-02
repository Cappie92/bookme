/**
 * AuthGate: Splash при загрузке, редирект по роли в useEffect.
 * Master/Client ветки монтируются раздельно — client никогда не импортирует master-компоненты.
 *
 * Cold start deeplink: getInitialURL один раз за запуск (module-level initialUrlResult).
 * Переход на /m/<slug> выполняет usePendingPublicBooking и только пока navigator готов.
 * Intent снят, когда текущий маршрут совпал со slug, либо попытка replace бросила исключение.
 */
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@src/auth/AuthContext';
import {
  acceptPublicBookingSlug,
  currentPublicBookingSlug,
  isCurrentPublicBookingRoute,
  publicIntentPreemptsRoleRouting,
  resolvePasswordResetAuthGateRoute,
  resolvePhoneVerificationAuthGateRoute,
  resolveUnauthenticatedWelcomeAction,
} from '@src/auth/authFlowRouting';
import { useUnauthenticatedWelcomeRedirect } from '@src/auth/useUnauthenticatedWelcomeRedirect';
import { usePendingPublicBooking, useExpoNavigationReady } from '@src/auth/usePendingPublicBooking';
import {
  PasswordResetRecoveryProvider,
  usePasswordResetRecovery,
} from '@src/auth/PasswordResetRecoveryContext';
import { TabBarHeightProvider } from '@src/contexts/TabBarHeightContext';
import { View, Text, ActivityIndicator, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { router, useNavigationContainerRef, useSegments, usePathname } from 'expo-router';
import { getPublicBookingDraft, isDraftValidForPostLoginRedirect } from '@src/stores/publicBookingDraftStore';
import { logger } from '@src/utils/logger';
import { env } from '@src/config/env';
import { withTimeout } from '@src/utils/promiseWithTimeout';
import {
  appInternalRouteToPath,
  parseAppInternalRouteFromUrl,
} from '@src/utils/parseAppInternalRoute';
import {
  clearPendingMasterRoute,
  peekPendingMasterRoute,
  setPendingMasterRoute,
} from '@src/utils/pendingMasterRoute';
import { installMobileErrorDebugHandlers } from '@src/debug/mobileErrorDebugBootstrap';
import { MobileErrorDebugPanel } from '@src/debug/MobileErrorDebugPanel';
import { authTrace } from '@src/debug/authRuntimeTrace';
import { analytics, AcquisitionService, isAppMetricaTestEventEnabled } from '@src/services/analytics';
import { AppleIapLifecycleHost } from '@src/components/subscriptions/AppleIapLifecycleHost';
import { PushRegistrationHost } from '@src/components/push/PushRegistrationHost';

const FAILSAFE_MS = 8000;
const DRAFT_TIMEOUT_MS = 2000;

// ——— Module-level guards: переживают remount; warm deeplink имеет приоритет над initial ———
type InitialUrlResult = { isPublic: boolean; slug: string | null; url?: string; source?: 'initial' | 'event' };
let initialUrlResult: InitialUrlResult | null = null;
/** Public booking slug whose screen has already been reached. A warm link clears this. */
let consumedPublicSlug: string | null = null;

function navigateToSubscriptionsRoute(source: string) {
  const target = appInternalRouteToPath('subscriptions');
  try {
    if (__DEV__ && (env.DEBUG_AUTH || env.DEBUG_LOGS)) {
      logger.debug('auth', `[DEEPLINK] internal route navigate (${source})`);
    }
    router.replace(target as any);
  } catch (e) {
    if (__DEV__ && env.DEBUG_AUTH) logger.debug('auth', '[DEEPLINK] subscriptions replace error', e);
  }
}

function Splash() {
  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color="#4CAF50" />
      <Text style={styles.loadingText}>Загрузка...</Text>
    </View>
  );
}

function FailsafeScreen({
  onRetry,
  onLogout,
  onHardReset,
}: {
  onRetry: () => void;
  onLogout: () => void;
  onHardReset: () => void;
}) {
  return (
    <View style={styles.loadingContainer}>
      <Text style={styles.failsafeTitle}>Не удалось загрузить сессию</Text>
      <Text style={styles.failsafeText}>Попробуйте повторить или сбросить сессию</Text>
      <TouchableOpacity style={styles.failsafeButton} onPress={onRetry}>
        <Text style={styles.failsafeButtonText}>Повторить</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.failsafeButton, styles.failsafeButtonSecondary]} onPress={onLogout}>
        <Text style={styles.failsafeButtonTextSecondary}>Выйти</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.failsafeButton, styles.failsafeButtonDanger]} onPress={onHardReset}>
        <Text style={styles.failsafeButtonText}>Hard reset (очистить токен)</Text>
      </TouchableOpacity>
    </View>
  );
}

function AuthGate({ children, rootInstanceId }: { children: React.ReactNode; rootInstanceId: string }) {
  const {
    isAuthenticated,
    isLoading,
    token,
    user,
    pendingPhoneVerification,
    pendingVerificationNeedsLogin,
    logout,
    retryInit,
    ensureNoTokenOnLogin,
  } = useAuth();
  const {
    pendingPasswordReset,
    passwordResetNeedsLogin,
    isPasswordResetLoading,
  } = usePasswordResetRecovery();
  const segments = useSegments();
  const pathname = usePathname();
  const didRedirectRef = useRef(false);
  const redirectInProgressRef = useRef(false);
  const effectRunRef = useRef(0);
  const didEnsureRef = useRef(false);
  const [initialUrlIsPublic, setInitialUrlIsPublic] = useState<boolean | null>(null);
  const [ready, setReady] = useState(false);
  const [failsafe, setFailsafe] = useState(false);

  const setReadyWithReason = (value: boolean, reason: string) => {
    setReady((prev) => {
      if (prev === value) return prev;
      if (__DEV__ && (env.DEBUG_AUTH || env.DEBUG_LOGS)) logger.debug('auth', '[AuthGate] setReady(', value, ') reason=', reason);
      return value;
    });
  };

  useEffect(() => {
    if (!__DEV__ || (!env.DEBUG_AUTH && !env.DEBUG_LOGS)) return;
    logger.debug('auth', '[AuthGate] ready/authState', { ready, isAuthenticated, isLoading });
  }, [ready, isAuthenticated, isLoading]);

  const showSplash = isLoading || isPasswordResetLoading || (isAuthenticated && !ready);
  const navigationRef = useNavigationContainerRef();
  const navigationReady = useExpoNavigationReady(navigationRef);
  const pathStr = (pathname != null ? String(pathname) : '') || '';
  const segmentsArr = (Array.isArray(segments) ? segments : []) as string[];
  const publicSlugNow = currentPublicBookingSlug(pathStr, segmentsArr);
  const onCurrentPublicBooking = isCurrentPublicBookingRoute(pathStr, segmentsArr);
  const { pendingSlug: pendingPublicSlug, requestUrl: requestPublicUrl } = usePendingPublicBooking({
    navigationReady,
    currentSlug: publicSlugNow,
    onConsumed: (slug) => { consumedPublicSlug = slug; },
  });

  const INITIAL_URL_TIMEOUT_MS = 2500;
  const initialUrlSlugRef = useRef<string | null>(null);
  const initialUrlResolvedRef = useRef(false);

  // Cold start: getInitialURL ровно один раз за запуск (module-level initialUrlResult переживает remount).
  useEffect(() => {
    if (initialUrlResult !== null) {
      if (initialUrlIsPublic !== null) return;
      setInitialUrlIsPublic(initialUrlResult.isPublic);
      if (initialUrlResult.slug) {
        initialUrlSlugRef.current = initialUrlResult.slug;
        if (acceptPublicBookingSlug(initialUrlResult.slug) && initialUrlResult.slug !== consumedPublicSlug) {
          requestPublicUrl(initialUrlResult.url);
        }
      }
      return;
    }
    if (initialUrlIsPublic !== null) return;
    initialUrlResolvedRef.current = false;
    let cancelled = false;
    const t = setTimeout(() => {
      if (cancelled || initialUrlResolvedRef.current) return;
      initialUrlResolvedRef.current = true;
      if (initialUrlResult === null) {
        initialUrlResult = { isPublic: false, slug: null };
        setInitialUrlIsPublic(false);
      }
    }, INITIAL_URL_TIMEOUT_MS);
    Linking.getInitialURL()
      .then((url) => {
        if (cancelled) return;
        initialUrlResolvedRef.current = true;
        if (initialUrlResult !== null) return;
        const internalRoute = parseAppInternalRouteFromUrl(url);
        if (internalRoute) {
          setPendingMasterRoute(appInternalRouteToPath(internalRoute) as '/' | '/subscriptions');
          initialUrlResult = { isPublic: false, slug: null, url: url ?? undefined, source: 'initial' };
          setInitialUrlIsPublic(false);
          void AcquisitionService.recordTouchFromUrl(url);
          if (__DEV__ && (env.DEBUG_AUTH || env.DEBUG_LOGS)) {
            logger.debug('auth', '[DEEPLINK] initialUrl internalRoute=', internalRoute, 'url=', url);
          }
          return;
        }
        const parsedSlug = requestPublicUrl(url);
        if (parsedSlug) {
          initialUrlResult = { isPublic: true, slug: parsedSlug, url: url ?? undefined, source: 'initial' };
          setInitialUrlIsPublic(true);
          initialUrlSlugRef.current = parsedSlug;
          void AcquisitionService.recordTouchFromUrl(url);
          if (__DEV__ && (env.DEBUG_AUTH || env.DEBUG_LOGS)) {
            logger.debug('auth', '[DEEPLINK] initialUrl=', url, 'parsedSlug=', parsedSlug);
          }
        } else {
          initialUrlResult = { isPublic: false, slug: null };
          setInitialUrlIsPublic(false);
        }
      })
      .catch(() => {
        if (!cancelled && initialUrlResult === null) {
          initialUrlResolvedRef.current = true;
          initialUrlResult = { isPublic: false, slug: null };
          setInitialUrlIsPublic(false);
        }
      });
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [initialUrlIsPublic, requestPublicUrl]);

  // Warm deeplink: приоритет над initial; синхронизируем initialUrlResult чтобы не откатиться на старый slug.
  useEffect(() => {
    const handler = ({ url }: { url: string }) => {
      void AcquisitionService.recordTouchFromUrl(url);
      const internalRoute = parseAppInternalRouteFromUrl(url);
      if (internalRoute) {
        requestPublicUrl(null);
        initialUrlResult = { isPublic: false, slug: null, url, source: 'event' };
        setInitialUrlIsPublic(false);
        setPendingMasterRoute(appInternalRouteToPath(internalRoute) as '/' | '/subscriptions');
        navigateToSubscriptionsRoute('event');
        return;
      }
      const parsedSlug = requestPublicUrl(url);
      if (!parsedSlug) {
        initialUrlResult = { isPublic: false, slug: null, source: 'event' };
        setInitialUrlIsPublic(false);
        return;
      }
      const currentPath = pathStr || '';
      initialUrlResult = { isPublic: true, slug: parsedSlug, url, source: 'event' };
      consumedPublicSlug = null;
      setInitialUrlIsPublic(true);
      if (currentPublicBookingSlug(currentPath, segmentsArr) === parsedSlug) {
        if (__DEV__ && (env.DEBUG_AUTH || env.DEBUG_LOGS)) logger.debug('auth', '[DEEPLINK] event handled slug=', parsedSlug, 'currentPath=', currentPath, 'skip=already_on_slug');
        return;
      }
      if (__DEV__ && (env.DEBUG_AUTH || env.DEBUG_LOGS)) logger.debug('auth', '[DEEPLINK] event handled slug=', parsedSlug, 'currentPath=', currentPath);
    };
    const sub = Linking.addEventListener('url', handler);
    return () => sub.remove();
  }, [pathStr, requestPublicUrl]);

  const startupSegments = segmentsArr.join(',');
  const phoneVerificationRoute = resolvePhoneVerificationAuthGateRoute({
    isAuthenticated,
    hasPendingVerification: !!pendingPhoneVerification,
    pendingVerificationNeedsLogin,
  });
  const passwordResetRoute = resolvePasswordResetAuthGateRoute({
    isAuthenticated,
    pending: pendingPasswordReset,
    passwordResetNeedsLogin,
  });
  const higherPriorityRoute = phoneVerificationRoute ?? passwordResetRoute;
  const welcomeAction = resolveUnauthenticatedWelcomeAction({
    bootstrapComplete: !isLoading,
    passwordResetBootstrapComplete: !isPasswordResetLoading,
    navigationReady,
    isAuthenticated,
    pathname: pathStr,
    segments: segmentsArr,
    higherPriorityRoute,
    initialUrlResolved: initialUrlIsPublic !== null,
    pendingPublicSlug:
      acceptPublicBookingSlug(pendingPublicSlug) && publicSlugNow !== pendingPublicSlug
        ? pendingPublicSlug
        : null,
  });

  useUnauthenticatedWelcomeRedirect({
    action: welcomeAction,
    pathname: pathStr,
    navigationReady,
    didRedirect: didRedirectRef.current,
    revision: [
      isLoading,
      isPasswordResetLoading,
      isAuthenticated,
      String(initialUrlIsPublic),
      pendingPublicSlug ?? '',
      higherPriorityRoute ?? '',
      startupSegments,
    ].join('|'),
  });

  const isAlreadyOnRoute = (target: string) => {
    const t = target.replace(/^\//, '');
    if (pathStr === target || pathStr === t) return true;
    if (target === '/login' && pathStr.includes('login')) return true;
    if (target === '/verify-phone' && pathStr.includes('verify-phone')) return true;
    if (target === '/welcome' && pathStr.includes('welcome')) return true;
    if (target === '/client/dashboard' && (pathStr.includes('client/dashboard') || pathStr.includes('client')))
      return true;
    if (target === '/' && (pathStr === '/' || pathStr === '' || pathStr.includes('(master)'))) return true;
    if (target === '/subscriptions' && pathStr.includes('subscriptions')) return true;
    if (t.startsWith('m/') && pathStr.includes('m/')) return true;
    return false;
  };

  useEffect(() => {
    effectRunRef.current += 1;
    if (__DEV__ && env.DEBUG_AUTH) {
      logger.debug('auth', '[AuthGate] effect', { run: effectRunRef.current, pathname: pathStr });
    }
    if (isLoading || isPasswordResetLoading) return;

    const first = (segments as string[])[0];
    const onLoginScreen = first === 'login' || pathStr.includes('login');
    const onVerifyPhoneScreen = first === 'verify-phone' || pathStr.includes('verify-phone');
    const onPasswordResetVerifyScreen =
      first === 'password-reset-verify' || pathStr.includes('password-reset-verify');
    const onResetPasswordScreen =
      first === 'reset-password' || pathStr.includes('reset-password');

    const phoneVerificationRoute = resolvePhoneVerificationAuthGateRoute({
      isAuthenticated,
      hasPendingVerification: !!pendingPhoneVerification,
      pendingVerificationNeedsLogin,
    });

    if (phoneVerificationRoute === '/verify-phone') {
      if (!onVerifyPhoneScreen) {
        didRedirectRef.current = true;
        router.replace('/verify-phone');
      }
      setReadyWithReason(true, 'pending phone verification');
      return;
    }

    if (phoneVerificationRoute === '/login') {
      if (!onLoginScreen) {
        didRedirectRef.current = true;
        router.replace('/login');
      }
      setReadyWithReason(true, 'expired pending verification → login');
      return;
    }

    const passwordResetRoute = resolvePasswordResetAuthGateRoute({
      isAuthenticated,
      pending: pendingPasswordReset,
      passwordResetNeedsLogin,
    });
    if (passwordResetRoute === '/password-reset-verify') {
      if (!onPasswordResetVerifyScreen) router.replace('/password-reset-verify');
      setReadyWithReason(true, 'pending password reset verification');
      return;
    }
    if (passwordResetRoute === '/reset-password') {
      if (!onResetPasswordScreen) router.replace('/reset-password');
      setReadyWithReason(true, 'pending password reset token');
      return;
    }
    if (passwordResetRoute === '/login') {
      if (!onLoginScreen) router.replace('/login');
      setReadyWithReason(true, 'password reset finished or expired');
      return;
    }
    const willCallEnsure = onLoginScreen && !isAuthenticated && !token;
    authTrace(
      `[AuthGate] path=${pathStr} firstSeg=${String(first)} onLoginScreen=${onLoginScreen} isLoading=false isAuthenticated=${isAuthenticated} tokenInContext=${!!token} userPresent=${!!user} willCallEnsureNoTokenOnLogin=${willCallEnsure} initialUrlIsPublic=${String(initialUrlIsPublic)} inPublic=${onCurrentPublicBooking}`
    );
    // ensureNoTokenOnLogin только если в context нет токена: иначе ломается partial restore (token есть, user ещё null).
    // Плюс: при полной сессии на /login до редиректа — не трогать storage.
    if (willCallEnsure) {
      if (!didEnsureRef.current) {
        didEnsureRef.current = true;
        authTrace('[AuthGate] CALLING ensureNoTokenOnLogin()');
        (async () => {
          try {
            await ensureNoTokenOnLogin();
          } catch (err) {
            logger.error('[AuthGate] ensureNoTokenOnLogin failed', err);
          } finally {
            setReadyWithReason(true, 'onLoginScreen: after ensureNoTokenOnLogin');
          }
        })();
      } else {
        setReadyWithReason(true, 'onLoginScreen: didEnsure already');
      }
      return;
    }

    didEnsureRef.current = false;

    if (onCurrentPublicBooking || publicIntentPreemptsRoleRouting(pendingPublicSlug, publicSlugNow)) {
      setReadyWithReason(true, onCurrentPublicBooking ? 'inPublic' : 'pending public target');
      return;
    }

    if (!isAuthenticated) {
      setReadyWithReason(true, `notAuth: ${welcomeAction}`);
      return;
    }

    // После cold start Android часто: сначала /login + redirect на /login при !auth, didRedirectRef=true;
    // затем restore сессии — но без этого условия мы выходим здесь и никогда не делаем replace на / или dashboard.
    if (didRedirectRef.current && !(isAuthenticated && onLoginScreen)) {
      setReadyWithReason(true, 'didRedirectRef already');
      return;
    }

    if (redirectInProgressRef.current) return;
    redirectInProgressRef.current = true;

    const role = typeof user?.role === 'string' ? user.role.toLowerCase() : '';
    const isClient = role === 'client';

    const doRedirect = (target: string) => {
      didRedirectRef.current = true;
      try {
        if (!isAlreadyOnRoute(target)) {
          logger.debug('auth', '[AuthGate] redirect →', target);
          router.replace(target);
        } else {
          logger.debug('auth', '[AuthGate] already on target', target);
        }
      } catch (e) {
        logger.debug('auth', '[AuthGate] router.replace error', e);
      } finally {
        setReadyWithReason(true, 'doRedirect: ' + target);
        redirectInProgressRef.current = false;
      }
    };

    withTimeout(getPublicBookingDraft(), DRAFT_TIMEOUT_MS)
      .then((draft) => {
        const pendingRoute = !isClient ? peekPendingMasterRoute() : null;
        const target =
          pendingRoute ??
          (isDraftValidForPostLoginRedirect(draft)
            ? `/m/${draft.slug}`
            : isClient
              ? '/client/dashboard'
              : '/');
        if (pendingRoute) {
          clearPendingMasterRoute();
        }
        authTrace(`[AuthGate] redirect target=${target} draft=${isDraftValidForPostLoginRedirect(draft) ? 'valid' : 'none'}`);
        if (__DEV__ && env.DEBUG_AUTH) logger.debug('auth', '[AuthGate] redirect →', target, { draftValid: isDraftValidForPostLoginRedirect(draft), isClient });
        doRedirect(target);
      })
      .catch((err) => {
        const target = isClient ? '/client/dashboard' : '/';
        authTrace(`[AuthGate] getPublicBookingDraft catch → ${target} err=${(err as Error)?.message ?? ''}`);
        logger.debug('auth', '[AuthGate] getPublicBookingDraft timeout/catch', (err as Error)?.message);
        doRedirect(target);
      });
  }, [
    isAuthenticated,
    isLoading,
    token,
    user,
    pendingPhoneVerification,
    pendingVerificationNeedsLogin,
    pendingPasswordReset,
    passwordResetNeedsLogin,
    isPasswordResetLoading,
    segments,
    pathname,
    initialUrlIsPublic,
    navigationReady,
    pendingPublicSlug,
    welcomeAction,
    onCurrentPublicBooking,
    publicSlugNow,
  ]);

  // Failsafe: если > 8 сек на Splash — показываем экран восстановления (только __DEV__)
  useEffect(() => {
    if (!__DEV__) return;
    if (!showSplash) {
      setFailsafe(false);
      return;
    }
    const t = setTimeout(() => {
      setFailsafe(true);
      logger.debug('auth', '[AuthGate] FAILSAFE: loading > 8s');
    }, FAILSAFE_MS);
    return () => clearTimeout(t);
  }, [showSplash]);

  const handleRetry = async () => {
    setFailsafe(false);
    didRedirectRef.current = false;
    redirectInProgressRef.current = false;
    setReadyWithReason(false, 'handleRetry');
    await retryInit();
  };

  const handleLogout = async () => {
    if (__DEV__ && env.DEBUG_AUTH) logger.info('auth', '[LOGOUT] pressed', { path: pathStr || 'failsafe' });
    setFailsafe(false);
    await logout();
    didRedirectRef.current = true;
    setReadyWithReason(true, 'handleLogout');
    try {
      router.replace('/welcome');
    } catch {}
  };

  const handleHardReset = async () => {
    if (__DEV__ && env.DEBUG_AUTH) logger.info('auth', '[LOGOUT] pressed', { path: pathStr || 'failsafe-hard-reset' });
    setFailsafe(false);
    await logout();
    didRedirectRef.current = true;
    setReadyWithReason(true, 'handleHardReset');
    try {
      router.replace('/welcome');
    } catch {}
  };

  if (__DEV__ && failsafe) {
    return (
      <FailsafeScreen onRetry={handleRetry} onLogout={handleLogout} onHardReset={handleHardReset} />
    );
  }

  if (isLoading || isPasswordResetLoading) return <Splash />;
  if (isAuthenticated && !ready) return <Splash />;

  return <>{children}</>;
}

let didSendAppMetricaTestEvent = false;

export default function RootLayout() {
  const rootInstanceIdRef = useRef(Math.random().toString(16).slice(2, 10));
  useEffect(() => {
    installMobileErrorDebugHandlers();
  }, []);
  useEffect(() => {
    void (async () => {
      try {
        await analytics.init();
        if (isAppMetricaTestEventEnabled() && !didSendAppMetricaTestEvent) {
          didSendAppMetricaTestEvent = true;
          analytics.trackIntegrationTest();
        }
      } catch {
        /* analytics must never break bootstrap */
      }
    })();
  }, []);
  useEffect(() => {
    if (__DEV__ && (env.DEBUG_AUTH || env.DEBUG_LOGS)) logger.debug('auth', '[ROOT_LAYOUT] mount', { rootInstanceId: rootInstanceIdRef.current });
    return () => {
      if (__DEV__ && (env.DEBUG_AUTH || env.DEBUG_LOGS)) logger.debug('auth', '[ROOT_LAYOUT] unmount', { rootInstanceId: rootInstanceIdRef.current });
    };
  }, []);
  // SafeAreaProvider в корне покрывает все route groups: login, (master), (client), (public).
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <PasswordResetRecoveryProvider>
          <AppleIapLifecycleHost />
          <PushRegistrationHost />
          <TabBarHeightProvider>
            <AuthGate rootInstanceId={rootInstanceIdRef.current}>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="welcome" />
                <Stack.Screen name="login" />
                <Stack.Screen name="verify-phone" options={{ gestureEnabled: false }} />
                <Stack.Screen name="forgot-password" options={{ gestureEnabled: false }} />
                <Stack.Screen name="password-reset-verify" options={{ gestureEnabled: false }} />
                <Stack.Screen name="reset-password" options={{ gestureEnabled: false }} />
                <Stack.Screen name="(master)" />
                <Stack.Screen name="(client)" />
                <Stack.Screen name="(public)" />
              </Stack>
            </AuthGate>
          </TabBarHeightProvider>
        </PasswordResetRecoveryProvider>
      </AuthProvider>
      {/* Строго DEBUG_MOBILE_ERRORS=1 (не true/yes) — иначе FAB всплывает при опечатках в .env. */}
      {env.SHOW_DBG_FLOATING_PANEL ? <MobileErrorDebugPanel /> : null}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  failsafeTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  failsafeText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 24,
  },
  failsafeButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginBottom: 12,
    minWidth: 160,
    alignItems: 'center',
  },
  failsafeButtonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#666',
  },
  failsafeButtonDanger: {
    backgroundColor: '#FF5722',
    marginTop: 8,
  },
  failsafeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  failsafeButtonTextSecondary: {
    color: '#666',
    fontSize: 16,
  },
});

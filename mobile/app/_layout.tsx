/**
 * AuthGate: Splash при загрузке, редирект по роли в useEffect.
 * Master/Client ветки монтируются раздельно — client никогда не импортирует master-компоненты.
 *
 * Стабильность cold start deeplink: getInitialURL и router.replace('/m/<slug>') выполняются
 * ровно один раз за запуск приложения за счёт module-level guard'ов (переживают remount).
 */
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@src/auth/AuthContext';
import { TabBarHeightProvider } from '@src/contexts/TabBarHeightContext';
import { View, Text, ActivityIndicator, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { router, useSegments, usePathname } from 'expo-router';
import { getPublicBookingDraft, isDraftValidForPostLoginRedirect } from '@src/stores/publicBookingDraftStore';
import { logger } from '@src/utils/logger';
import { env } from '@src/config/env';
import { withTimeout } from '@src/utils/promiseWithTimeout';
import { parsePublicMasterSlugFromUrl } from '@src/utils/parsePublicMasterDeepLink';
import { installMobileErrorDebugHandlers } from '@src/debug/mobileErrorDebugBootstrap';
import { MobileErrorDebugPanel } from '@src/debug/MobileErrorDebugPanel';
import { authTrace } from '@src/debug/authRuntimeTrace';

const FAILSAFE_MS = 8000;
const DRAFT_TIMEOUT_MS = 2000;

// ——— Module-level guards: переживают remount; warm deeplink имеет приоритет над initial ———
type InitialUrlResult = { isPublic: boolean; slug: string | null; url?: string; source?: 'initial' | 'event' };
let initialUrlResult: InitialUrlResult | null = null;
/** Последний slug, на который уже выполнили router.replace; при новом slug (warm/cold) навигируем и обновляем. */
let didNavigateSlugOnce: string | null = null;
/** Warm deeplink: последний обработанный slug и время; initial-effect не навигирует, если недавно был warm (приоритет warm). */
let lastDeeplinkSlug: string | null = null;
let lastDeeplinkAtMs: number = 0;
const WARM_PRIORITY_MS = 10000;

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

/** Проверка: маршрут публичный (/(public)/m/[slug] или path /m/...) — без авторизации показываем экран записи, редирект на /login не делаем. */
function isPublicRoute(pathStr: string, segments: string[]): boolean {
  const first = segments[0];
  if (first === '(public)' || first === 'm') return true;
  if (pathStr.startsWith('/m/') || pathStr.startsWith('m/') || pathStr.includes('/m/')) return true;
  if (pathStr.includes('(public)')) return true;
  if (segments.includes('m')) return true;
  return false;
}

function AuthGate({ children, rootInstanceId }: { children: React.ReactNode; rootInstanceId: string }) {
  const { isAuthenticated, isLoading, token, user, logout, retryInit, ensureNoTokenOnLogin } = useAuth();
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

  const showSplash = isLoading || (isAuthenticated && !ready);
  const pathStr = (pathname != null ? String(pathname) : '') || '';
  const segmentsArr = (Array.isArray(segments) ? segments : []) as string[];
  const inPublic = isPublicRoute(pathStr, segmentsArr) || initialUrlIsPublic === true;

  const INITIAL_URL_TIMEOUT_MS = 2500;
  const initialUrlSlugRef = useRef<string | null>(null);
  const initialUrlResolvedRef = useRef(false);

  // Cold start: getInitialURL ровно один раз за запуск (module-level initialUrlResult переживает remount).
  useEffect(() => {
    if (initialUrlResult !== null) {
      setInitialUrlIsPublic(initialUrlResult.isPublic);
      if (initialUrlResult.slug) initialUrlSlugRef.current = initialUrlResult.slug;
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
        const parsedSlug = parsePublicMasterSlugFromUrl(url);
        if (parsedSlug) {
          initialUrlResult = { isPublic: true, slug: parsedSlug, url, source: 'initial' };
          setInitialUrlIsPublic(true);
          initialUrlSlugRef.current = parsedSlug;
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
  }, [initialUrlIsPublic]);

  // Cold start only: router.replace('/m/<slug>') по initialUrlResult. Не выполнять, если недавно был warm deeplink или уже на /m/.
  useEffect(() => {
    if (initialUrlIsPublic !== true) return;
    const result = initialUrlResult;
    if (!result?.isPublic || !result.slug) return;
    const now = Date.now();
    if (lastDeeplinkSlug != null && now - lastDeeplinkAtMs < WARM_PRIORITY_MS) {
      if (__DEV__ && (env.DEBUG_AUTH || env.DEBUG_LOGS)) logger.debug('auth', '[DEEPLINK] initial effect skipped reason=recent_warm_event', { lastDeeplinkSlug, lastDeeplinkAtMs });
      return;
    }
    if (pathStr.startsWith('/m/') || pathStr.includes('/m/')) {
      if (__DEV__ && (env.DEBUG_AUTH || env.DEBUG_LOGS)) logger.debug('auth', '[DEEPLINK] initial effect skipped reason=already_on_public', { pathStr });
      return;
    }
    if (didNavigateSlugOnce === result.slug) return;
    if (pathStr.includes(result.slug)) return;
    didNavigateSlugOnce = result.slug;
    try {
      if (__DEV__ && (env.DEBUG_AUTH || env.DEBUG_LOGS)) logger.debug('auth', '[DEEPLINK] navigate -> /m/' + result.slug);
      router.replace(`/m/${result.slug}` as any);
    } catch (e) {
      if (__DEV__ && env.DEBUG_AUTH) logger.debug('auth', '[AuthGate] router.replace deeplink error', e);
    }
  }, [initialUrlIsPublic, pathname, pathStr]);

  // Warm deeplink: приоритет над initial; синхронизируем initialUrlResult чтобы не откатиться на старый slug.
  useEffect(() => {
    const handler = ({ url }: { url: string }) => {
      const parsedSlug = parsePublicMasterSlugFromUrl(url);
      if (!parsedSlug) return;
      const currentPath = pathStr || '';
      if (currentPath.includes('/m/') && currentPath.includes(parsedSlug)) {
        if (__DEV__ && (env.DEBUG_AUTH || env.DEBUG_LOGS)) logger.debug('auth', '[DEEPLINK] event handled slug=', parsedSlug, 'currentPath=', currentPath, 'skip=already_on_slug');
        return;
      }
      lastDeeplinkSlug = parsedSlug;
      lastDeeplinkAtMs = Date.now();
      initialUrlResult = { isPublic: true, slug: parsedSlug, url, source: 'event' };
      didNavigateSlugOnce = parsedSlug;
      if (__DEV__ && (env.DEBUG_AUTH || env.DEBUG_LOGS)) logger.debug('auth', '[DEEPLINK] event handled slug=', parsedSlug, 'currentPath=', currentPath);
      try {
        if (__DEV__ && (env.DEBUG_AUTH || env.DEBUG_LOGS)) logger.debug('auth', '[DEEPLINK] navigate -> /m/' + parsedSlug);
        router.replace(`/m/${parsedSlug}` as any);
      } catch (e) {
        if (__DEV__ && env.DEBUG_AUTH) logger.debug('auth', '[DEEPLINK] replace error', e);
      }
    };
    const sub = Linking.addEventListener('url', handler);
    return () => sub.remove();
  }, [pathStr]);

  const isAlreadyOnRoute = (target: string) => {
    const t = target.replace(/^\//, '');
    if (pathStr === target || pathStr === t) return true;
    if (target === '/login' && pathStr.includes('login')) return true;
    if (target === '/client/dashboard' && (pathStr.includes('client/dashboard') || pathStr.includes('client')))
      return true;
    if (target === '/' && (pathStr === '/' || pathStr === '' || pathStr.includes('(master)'))) return true;
    if (t.startsWith('m/') && pathStr.includes('m/')) return true;
    return false;
  };

  useEffect(() => {
    effectRunRef.current += 1;
    if (__DEV__ && env.DEBUG_AUTH) {
      logger.debug('auth', '[AuthGate] effect', { run: effectRunRef.current, pathname: pathStr });
    }
    if (isLoading) return;

    const first = (segments as string[])[0];
    const onLoginScreen = first === 'login' || pathStr.includes('login');
    const willCallEnsure = onLoginScreen && !isAuthenticated && !token;
    authTrace(
      `[AuthGate] path=${pathStr} firstSeg=${String(first)} onLoginScreen=${onLoginScreen} isLoading=false isAuthenticated=${isAuthenticated} tokenInContext=${!!token} userPresent=${!!user} willCallEnsureNoTokenOnLogin=${willCallEnsure} initialUrlIsPublic=${String(initialUrlIsPublic)} inPublic=${inPublic}`
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

    if (inPublic) {
      setReadyWithReason(true, 'inPublic');
      return;
    }

    if (!isAuthenticated) {
      if (initialUrlIsPublic === null) {
        setReadyWithReason(true, 'notAuth: initialUrlIsPublic still null');
        return;
      }
      if (!inPublic && !didRedirectRef.current) {
        if (!pathStr.includes('login')) {
          didRedirectRef.current = true;
          authTrace('[AuthGate] redirect → /login (not authenticated)');
          logger.debug('auth', '[AuthGate] redirect → /login (not authenticated)');
          try {
            router.replace('/login');
          } catch (e) {
            logger.debug('auth', '[AuthGate] router.replace error', e);
          }
        }
      }
      setReadyWithReason(true, 'notAuth: finally');
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
        const target = isDraftValidForPostLoginRedirect(draft) ? `/m/${draft.slug}` : isClient ? '/client/dashboard' : '/';
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
  }, [isAuthenticated, isLoading, token, user, segments, pathname, initialUrlIsPublic]);

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
      router.replace('/login');
    } catch {}
  };

  const handleHardReset = async () => {
    if (__DEV__ && env.DEBUG_AUTH) logger.info('auth', '[LOGOUT] pressed', { path: pathStr || 'failsafe-hard-reset' });
    setFailsafe(false);
    await logout();
    didRedirectRef.current = true;
    setReadyWithReason(true, 'handleHardReset');
    try {
      router.replace('/login');
    } catch {}
  };

  if (__DEV__ && failsafe) {
    return (
      <FailsafeScreen onRetry={handleRetry} onLogout={handleLogout} onHardReset={handleHardReset} />
    );
  }

  if (isLoading) return <Splash />;
  if (isAuthenticated && !ready) return <Splash />;

  return <>{children}</>;
}

export default function RootLayout() {
  const rootInstanceIdRef = useRef(Math.random().toString(16).slice(2, 10));
  useEffect(() => {
    installMobileErrorDebugHandlers();
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
        <TabBarHeightProvider>
          <AuthGate rootInstanceId={rootInstanceIdRef.current}>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="login" />
              <Stack.Screen name="(master)" />
              <Stack.Screen name="(client)" />
              <Stack.Screen name="(public)" />
            </Stack>
          </AuthGate>
        </TabBarHeightProvider>
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

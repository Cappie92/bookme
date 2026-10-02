import { useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { acceptPublicBookingSlug } from '@src/auth/authFlowRouting';
import { parsePublicMasterSlugFromUrl } from '@src/utils/parsePublicMasterDeepLink';

type NavigationReadySource = {
  isReady: () => boolean;
  addListener: (event: 'ready', listener: () => void) => () => void;
};

/** The existing Expo Router navigationRef readiness subscription. No second mechanism. */
export function useExpoNavigationReady(navigationRef: NavigationReadySource): boolean {
  const [navigationReady, setNavigationReady] = useState(false);
  useEffect(() => {
    if (navigationRef.isReady()) {
      setNavigationReady(true);
      return;
    }
    return navigationRef.addListener('ready', () => {
      setNavigationReady(true);
    });
  }, [navigationRef]);
  return navigationReady;
}

/** Keep the existing parser's scheme/host policy; reject truncated/normalized targets. */
export function parsePublicBookingIntentUrl(url: string | null | undefined): string | null {
  try {
    const slug = acceptPublicBookingSlug(parsePublicMasterSlugFromUrl(url));
    if (!slug || !url) return null;
    // The legacy parser can truncate custom-scheme /m/alice/extra or normalize
    // URL dot segments. Require its result to be the actual final /m/<slug>.
    const rawTarget = url.trim().split(/[?#]/)[0].match(
      /^(?:dedato:\/*|[a-z][a-z\d+.-]*:\/\/[^/]+\/(?:--\/)?)m\/([^/]+)\/?$/i
    );
    return rawTarget && decodeURIComponent(rawTarget[1]) === slug ? slug : null;
  } catch {
    return null;
  }
}

/** Owns cold/warm pending state; only the observed route consumes an intent. */
export function usePendingPublicBooking(input: {
  navigationReady: boolean;
  currentSlug: string | null;
  onConsumed: (slug: string) => void;
}) {
  // A new object distinguishes a new link event even when the slug is identical.
  const [intent, setIntent] = useState<{ slug: string } | null>(null);
  const inFlightRef = useRef<typeof intent>(null);
  const abandonedRef = useRef<string | null>(null);
  const wasReadyRef = useRef(false);
  const onConsumedRef = useRef(input.onConsumed);
  onConsumedRef.current = input.onConsumed;

  const requestUrl = useCallback((url: string | null | undefined): string | null => {
    const slug = parsePublicBookingIntentUrl(url);
    // Any replacement, including invalid input, cancels old retry state.
    abandonedRef.current = null;
    inFlightRef.current = null;
    setIntent(slug ? { slug } : null);
    return slug;
  }, []);

  const { navigationReady, currentSlug } = input;
  useEffect(() => {
    if (!navigationReady) inFlightRef.current = null;
    if (!intent) return;
    if (currentSlug === intent.slug) {
      inFlightRef.current = null;
      abandonedRef.current = null;
      setIntent((current) => current === intent ? null : current);
      onConsumedRef.current(intent.slug);
      return;
    }
    if (!navigationReady || inFlightRef.current === intent) return;
    inFlightRef.current = intent;
    try {
      // Escape parentheses too: Expo Router treats raw (...) as route groups.
      const encodedSlug = encodeURIComponent(intent.slug).replace(
        /[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
      );
      router.replace(`/m/${encodedSlug}` as never);
    } catch {
      inFlightRef.current = null;
      abandonedRef.current = intent.slug;
      setIntent((current) => current === intent ? null : current);
    }
  }, [intent, navigationReady, currentSlug]);

  useEffect(() => {
    const becameReady = navigationReady && !wasReadyRef.current;
    wasReadyRef.current = navigationReady;
    if (!becameReady || intent) return;
    const slug = abandonedRef.current;
    if (!slug || currentSlug === slug) return;
    abandonedRef.current = null;
    setIntent({ slug });
  }, [navigationReady, intent, currentSlug]);

  return { pendingSlug: intent?.slug ?? null, requestUrl };
}

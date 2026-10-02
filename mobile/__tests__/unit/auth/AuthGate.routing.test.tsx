import React, { useEffect, useState } from 'react';
import { router } from 'expo-router';
import {
  currentPublicBookingSlug,
  publicIntentPreemptsRoleRouting,
  resolveUnauthenticatedWelcomeAction,
} from '@src/auth/authFlowRouting';
import { useUnauthenticatedWelcomeRedirect } from '@src/auth/useUnauthenticatedWelcomeRedirect';
import { usePendingPublicBooking, useExpoNavigationReady } from '@src/auth/usePendingPublicBooking';

(globalThis as typeof globalThis & { __DEV__: boolean; IS_REACT_ACT_ENVIRONMENT: boolean }).__DEV__ = false;
(globalThis as typeof globalThis & { __DEV__: boolean; IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { act, create } = require('react-test-renderer') as {
  act: (callback: () => void | Promise<void>) => Promise<void>;
  create: (element: React.ReactElement) => {
    update: (element: React.ReactElement) => void;
    unmount: () => void;
    root: { findByProps: (props: { testID: string }) => { props: { ready: boolean } } };
  };
};

type ProbeProps = {
  pathname: string;
  segments?: readonly string[];
  isAuthenticated?: boolean;
  navigationReady?: boolean;
  bootstrapComplete?: boolean;
  passwordResetBootstrapComplete?: boolean;
  initialUrlResolved?: boolean;
  pendingPublicSlug?: string | null;
  higherPriorityRoute?: string | null;
  didRedirect?: boolean;
  revision?: string;
};

function WelcomeProbe(props: ProbeProps) {
  const action = resolveUnauthenticatedWelcomeAction({
    bootstrapComplete: props.bootstrapComplete ?? true,
    passwordResetBootstrapComplete: props.passwordResetBootstrapComplete ?? true,
    navigationReady: props.navigationReady ?? true,
    isAuthenticated: props.isAuthenticated ?? false,
    pathname: props.pathname,
    segments: props.segments ?? [],
    higherPriorityRoute: props.higherPriorityRoute ?? null,
    initialUrlResolved: props.initialUrlResolved ?? true,
    pendingPublicSlug: props.pendingPublicSlug ?? null,
  });
  useUnauthenticatedWelcomeRedirect({
    action,
    pathname: props.pathname,
    navigationReady: props.navigationReady ?? true,
    didRedirect: props.didRedirect ?? false,
    revision: props.revision ?? props.pathname,
  });
  return null;
}

function replaceMock(): jest.Mock {
  return router.replace as jest.Mock;
}

describe('AuthGate unauthenticated welcome redirect', () => {
  beforeEach(() => {
    replaceMock().mockReset();
    replaceMock().mockImplementation(() => undefined);
  });

  async function renderProbe(props: ProbeProps) {
    let renderer: { update: (element: React.ReactElement) => void; unmount: () => void };
    await act(async () => {
      renderer = create(<WelcomeProbe {...props} />);
    });
    return renderer!;
  }

  it('replaces / with /welcome and does it again after the route returns to /', async () => {
    const renderer = await renderProbe({ pathname: '/', segments: ['(master)'] });
    expect(replaceMock()).toHaveBeenCalledTimes(1);
    expect(replaceMock()).toHaveBeenCalledWith('/welcome');

    replaceMock().mockClear();
    await act(async () => {
      renderer.update(<WelcomeProbe pathname="/welcome" segments={['welcome']} />);
    });
    expect(replaceMock()).not.toHaveBeenCalled();

    await act(async () => {
      renderer.update(<WelcomeProbe pathname="/" segments={['(master)']} />);
    });
    expect(replaceMock()).toHaveBeenCalledTimes(1);
    expect(replaceMock()).toHaveBeenCalledWith('/welcome');
    renderer.unmount();
  });

  it('allows login, forgot-password, and the current public booking', async () => {
    const renderer = await renderProbe({ pathname: '/login', segments: ['login'] });
    await act(async () => {
      renderer.update(<WelcomeProbe pathname="/forgot-password" segments={['forgot-password']} />);
    });
    await act(async () => {
      renderer.update(<WelcomeProbe pathname="/m/master-a" segments={['(public)', 'm', 'master-a']} />);
    });
    expect(replaceMock()).not.toHaveBeenCalled();
    renderer.unmount();
  });

  it('does not steal a protected route while a concrete public target is pending', async () => {
    const renderer = await renderProbe({
      pathname: '/',
      segments: ['(master)'],
      pendingPublicSlug: 'master-a',
    });
    expect(replaceMock()).not.toHaveBeenCalled();

    await act(async () => {
      renderer.update(
        <WelcomeProbe pathname="/m/master-a" segments={['m', 'master-a']} pendingPublicSlug="master-a" />
      );
    });
    expect(replaceMock()).not.toHaveBeenCalled();

    await act(async () => {
      renderer.update(<WelcomeProbe pathname="/" segments={['(master)']} pendingPublicSlug={null} />);
    });
    expect(replaceMock()).toHaveBeenCalledWith('/welcome');
    renderer.unmount();
  });

  it('replaces the previous pending public target with the warm target', async () => {
    const renderer = await renderProbe({
      pathname: '/',
      segments: ['(master)'],
      pendingPublicSlug: 'master-a',
    });
    await act(async () => {
      renderer.update(<WelcomeProbe pathname="/" segments={['(master)']} pendingPublicSlug="master-b" />);
    });
    expect(replaceMock()).not.toHaveBeenCalled();
    renderer.unmount();
  });

  it('preserves verification and password-reset priority', async () => {
    const renderer = await renderProbe({
      pathname: '/',
      segments: ['(master)'],
      higherPriorityRoute: '/verify-phone',
    });
    await act(async () => {
      renderer.update(
        <WelcomeProbe pathname="/" segments={['(master)']} higherPriorityRoute="/password-reset-verify" />
      );
    });
    await act(async () => {
      renderer.update(<WelcomeProbe pathname="/" segments={['(master)']} higherPriorityRoute="/reset-password" />);
    });
    expect(replaceMock()).not.toHaveBeenCalled();
    renderer.unmount();
  });

  it('does not send an authenticated session to welcome or retrigger it across master and client routes', async () => {
    const renderer = await renderProbe({
      pathname: '/',
      segments: ['(master)'],
      isAuthenticated: true,
    });
    await act(async () => {
      renderer.update(
        <WelcomeProbe pathname="/master/settings" segments={['(master)', 'master', 'settings']} isAuthenticated />
      );
    });
    await act(async () => {
      renderer.update(
        <WelcomeProbe pathname="/master/services" segments={['(master)', 'master', 'services']} isAuthenticated />
      );
    });
    await act(async () => {
      renderer.update(
        <WelcomeProbe pathname="/client/dashboard" segments={['(client)', 'client', 'dashboard']} isAuthenticated />
      );
    });
    expect(replaceMock()).not.toHaveBeenCalled();
    renderer.unmount();
  });

  it('waits until the navigator is ready and then redirects', async () => {
    const renderer = await renderProbe({ pathname: '/', segments: ['(master)'], navigationReady: false });
    expect(replaceMock()).not.toHaveBeenCalled();
    await act(async () => {
      renderer.update(<WelcomeProbe pathname="/" segments={['(master)']} navigationReady />);
    });
    expect(replaceMock()).toHaveBeenCalledWith('/welcome');
    renderer.unmount();
  });

  it('retries after a thrown replace on the next route update and ignores a stale didRedirect flag', async () => {
    replaceMock().mockImplementationOnce(() => {
      throw new Error('replace failed');
    });
    const renderer = await renderProbe({ pathname: '/', segments: ['(master)'], didRedirect: true });
    expect(replaceMock()).toHaveBeenCalledTimes(1);

    replaceMock().mockImplementation(() => undefined);
    await act(async () => {
      renderer.update(
        <WelcomeProbe pathname="/subscriptions" segments={['(master)', 'subscriptions']} didRedirect />
      );
    });
    expect(replaceMock()).toHaveBeenCalledTimes(2);
    expect(replaceMock()).toHaveBeenLastCalledWith('/welcome');
    renderer.unmount();
  });

  it('redirects a protected route after logout even when didRedirect was already true', async () => {
    const renderer = await renderProbe({
      pathname: '/',
      segments: ['(master)'],
      isAuthenticated: true,
      didRedirect: true,
      revision: 'authenticated',
    });
    expect(replaceMock()).not.toHaveBeenCalled();
    await act(async () => {
      renderer.update(
        <WelcomeProbe
          pathname="/settings"
          segments={['(client)', 'settings']}
          isAuthenticated={false}
          didRedirect
          revision="logged-out"
        />
      );
    });
    expect(replaceMock()).toHaveBeenCalledWith('/welcome');
    renderer.unmount();
  });

  it.each(['/verify-phone', '/password-reset-verify', '/reset-password'] as const)(
    'does not send %s to welcome when that screen has no pending auth state',
    async (pathname) => {
      const renderer = await renderProbe({ pathname, segments: [pathname.slice(1)] });
      expect(replaceMock()).not.toHaveBeenCalled();
      renderer.unmount();
    }
  );

  it('keeps a special auth screen when its resolver already chose that route', async () => {
    const renderer = await renderProbe({
      pathname: '/verify-phone',
      segments: ['verify-phone'],
      higherPriorityRoute: '/verify-phone',
    });
    expect(replaceMock()).not.toHaveBeenCalled();
    renderer.unmount();
  });
});

type ReadySource = {
  isReady: () => boolean;
  addListener: (event: 'ready', listener: () => void) => () => void;
};

function readySource(initiallyReady = false) {
  let ready = initiallyReady;
  const listeners = new Set<() => void>();
  const remove = jest.fn((listener: () => void) => { listeners.delete(listener); });
  return {
    isReady: () => ready,
    addListener: jest.fn((_event: 'ready', listener: () => void) => {
      listeners.add(listener);
      return () => remove(listener);
    }),
    becomeReady: () => { ready = true; listeners.forEach((listener) => listener()); },
    remove,
  };
}

type Controller = ReturnType<typeof usePendingPublicBooking>;
type LifecycleProps = {
  pathname: string;
  source: ReadySource;
  initialUrl: string | null;
  isAuthenticated?: boolean;
  onConsumed: (slug: string) => void;
  observe: (controller: Controller, roleBlocked: boolean) => void;
};

function PublicIntentLifecycle(props: LifecycleProps) {
  // Same production readiness -> controller -> policy chain as AuthGate.
  const navigationReady = useExpoNavigationReady(props.source);
  const current = currentPublicBookingSlug(props.pathname, []);
  const controller = usePendingPublicBooking({
    navigationReady, currentSlug: current, onConsumed: props.onConsumed,
  });
  const [initialUrlResolved, setInitialUrlResolved] = useState(false);
  const requestUrl = controller.requestUrl;
  useEffect(() => {
    requestUrl(props.initialUrl);
    setInitialUrlResolved(true);
  }, [props.initialUrl, requestUrl]);

  const action = resolveUnauthenticatedWelcomeAction({
    bootstrapComplete: true,
    passwordResetBootstrapComplete: true,
    navigationReady,
    isAuthenticated: props.isAuthenticated ?? false,
    pathname: props.pathname,
    segments: [],
    higherPriorityRoute: null,
    initialUrlResolved,
    pendingPublicSlug: controller.pendingSlug,
  });
  useUnauthenticatedWelcomeRedirect({
    action, pathname: props.pathname, navigationReady, didRedirect: false,
    revision: JSON.stringify([initialUrlResolved, controller.pendingSlug, props.isAuthenticated]),
  });
  props.observe(controller, publicIntentPreemptsRoleRouting(controller.pendingSlug, current));
  return null;
}

describe('production public booking URL / intent lifecycle', () => {
  beforeEach(() => {
    replaceMock().mockReset();
    replaceMock().mockImplementation(() => undefined);
  });

  async function start(options: { ready?: boolean; url?: string | null; authenticated?: boolean } = {}) {
    const source = readySource(options.ready ?? true);
    const consumed = jest.fn();
    let controller!: Controller;
    let roleBlocked = false;
    let renderer!: ReturnType<typeof create>;
    const props: LifecycleProps = {
      pathname: '/', source,
      initialUrl: options.url === undefined ? 'dedato://m/alice' : options.url,
      isAuthenticated: options.authenticated,
      onConsumed: consumed,
      observe: (value, blocked) => { controller = value; roleBlocked = blocked; },
    };
    await act(async () => { renderer = create(<PublicIntentLifecycle {...props} />); });
    return {
      source, consumed,
      pending: () => controller.pendingSlug,
      roleBlocked: () => roleBlocked,
      // Feed the actual production URL entry point, never a test-owned pending setter.
      link: async (url: string | null) => {
        await act(async () => { controller.requestUrl(url); });
      },
      route: async (pathname: string) => {
        props.pathname = pathname;
        await act(async () => { renderer.update(<PublicIntentLifecycle {...props} />); });
      },
      close: async () => { await act(async () => { renderer.unmount(); }); },
    };
  }

  it('waits for the real ready listener, then applies the cold URL and unsubscribes', async () => {
    const app = await start({ ready: false });
    expect(app.pending()).toBe('alice');
    expect(replaceMock()).not.toHaveBeenCalled();
    expect(app.source.addListener).toHaveBeenCalledWith('ready', expect.any(Function));
    await act(async () => { app.source.becomeReady(); });
    expect(replaceMock()).toHaveBeenCalledTimes(1);
    expect(replaceMock()).toHaveBeenCalledWith('/m/alice');
    expect(app.pending()).toBe('alice');
    await app.close();
    expect(app.source.remove).toHaveBeenCalledTimes(1);
  });

  it('uses already-ready navigation without installing a ready listener', async () => {
    const app = await start();
    expect(app.source.addListener).not.toHaveBeenCalled();
    expect(replaceMock()).toHaveBeenCalledWith('/m/alice');
    await app.close();
  });

  it('does not consume on returned replace, consumes on matching route, then protects a later /', async () => {
    const app = await start();
    expect(app.pending()).toBe('alice');
    expect(app.consumed).not.toHaveBeenCalled();
    await app.route('/m/bob');
    expect(app.pending()).toBe('alice');
    expect(app.consumed).not.toHaveBeenCalled();
    expect(replaceMock()).toHaveBeenCalledTimes(1);
    await app.route('/m/alice');
    expect(app.pending()).toBeNull();
    expect(app.consumed).toHaveBeenCalledTimes(1);
    expect(app.consumed).toHaveBeenCalledWith('alice');
    await app.route('/');
    expect(replaceMock()).toHaveBeenLastCalledWith('/welcome');
    await app.close();
  });

  it('abandons a thrown replace, restores welcome, and retries on a new same-slug link without looping', async () => {
    replaceMock().mockImplementationOnce(() => { throw new Error('navigation'); });
    const app = await start();
    expect(app.pending()).toBeNull();
    expect(app.roleBlocked()).toBe(false);
    expect(replaceMock().mock.calls).toEqual([['/m/alice'], ['/welcome']]);
    await app.route('/welcome');
    await app.link('dedato://m/alice');
    expect(app.pending()).toBe('alice');
    expect(replaceMock()).toHaveBeenLastCalledWith('/m/alice');
    expect(replaceMock()).toHaveBeenCalledTimes(3);
    await app.close();
  });

  it('replaces cold pending alice with warm bob before readiness', async () => {
    const app = await start({ ready: false });
    await app.link('dedato://m/bob');
    expect(app.pending()).toBe('bob');
    await act(async () => { app.source.becomeReady(); });
    expect(replaceMock().mock.calls).toEqual([['/m/bob']]);
    await app.close();
  });

  it('replaces an in-flight alice target with a new bob intent', async () => {
    const app = await start();
    await app.link('dedato://m/bob');
    expect(replaceMock().mock.calls).toEqual([['/m/alice'], ['/m/bob']]);
    await app.route('/m/alice');
    expect(app.pending()).toBe('bob');
    expect(app.consumed).not.toHaveBeenCalled();
    await app.route('/m/bob');
    expect(app.pending()).toBeNull();
    await app.close();
  });

  it('allows the same slug as a new warm event after consumption and leaving the route', async () => {
    const app = await start();
    await app.route('/m/alice');
    await app.route('/');
    replaceMock().mockClear();
    await app.link('dedato://m/alice');
    expect(replaceMock().mock.calls).toEqual([['/m/alice']]);
    await app.close();
  });

  it('invalid warm URL cancels an existing pending target, not just a cold invalid target', async () => {
    const app = await start({ ready: false });
    await app.link('dedato://m/alice/extra');
    expect(app.pending()).toBeNull();
    await act(async () => { app.source.becomeReady(); });
    expect(replaceMock().mock.calls).toEqual([['/welcome']]);
    await app.close();
  });

  const invalidUrls = [
    'dedato://m/', 'dedato://m/[slug]', 'dedato://m/.', 'dedato://m/..',
    'dedato://m/%2e%2e', 'dedato://m/alice%3Ffoo', 'dedato://m/alice%23foo',
    'dedato://m/foo%2Fbar', 'dedato://m/foo%5Cbar', 'dedato://m/foo%252Fbar',
    'dedato://m/%', 'dedato://m/%E0%A4%A', 'dedato://m/alice/extra',
    'dedato://m/alice/extra/m/alice',
    'dedato://m/%09alice', 'dedato://m/alice%0A',
    'https://localhost/m/alice/../bob', 'https://localhost/m/%2e%2e',
    'https://localhost/m/alice/extra', 'https://untrusted.example/m/alice',
  ];
  it.each(invalidUrls)('rejects %s without public replace or permanent welcome suppression', async (url) => {
    const app = await start({ url });
    expect(app.pending()).toBeNull();
    expect(app.roleBlocked()).toBe(false);
    expect(replaceMock().mock.calls).toEqual([['/welcome']]);
    await app.close();
  });

  it.each(['dedato:/m/alice', 'dedato:///m/alice/', 'https://localhost/m/alice?source=test#booking'])(
    'consumes the actual serialized destination of %s', async (url) => {
      const app = await start({ url });
      const destination = replaceMock().mock.calls[0][0] as string;
      expect(destination).toBe('/m/alice');
      await app.route(new URL(destination, 'https://localhost').pathname);
      expect(app.pending()).toBeNull();
      expect(app.consumed).toHaveBeenCalledWith('alice');
      await app.route('/');
      expect(replaceMock()).toHaveBeenLastCalledWith('/welcome');
      await app.close();
    }
  );

  it.each([
    ['мастер', '/m/%D0%BC%D0%B0%D1%81%D1%82%D0%B5%D1%80'],
    ['(alice)', '/m/%28alice%29'],
    ['alice smith', '/m/alice%20smith'],
  ])('round-trips slug %s through URL, encoded destination and current route', async (slug, expectedPath) => {
    const app = await start({ url: `dedato:/${expectedPath}` });
    expect(app.pending()).toBe(slug);
    const destination = replaceMock().mock.calls[0][0] as string;
    expect(destination).toBe(expectedPath);
    await app.route(new URL(destination, 'https://localhost').pathname);
    expect(app.pending()).toBeNull();
    expect(app.consumed).toHaveBeenCalledWith(slug);
    await app.close();
  });

  it('releases authenticated routing after a public replace throws', async () => {
    replaceMock().mockImplementation(() => { throw new Error('navigation'); });
    const app = await start({ ready: false, authenticated: true });
    expect(app.roleBlocked()).toBe(true);
    await act(async () => { app.source.becomeReady(); });
    expect(app.pending()).toBeNull();
    expect(app.roleBlocked()).toBe(false);
    expect(replaceMock().mock.calls).toEqual([['/m/alice']]);
    await app.close();
  });

  it('does not let an invalid URL suppress authenticated routing', async () => {
    const app = await start({ authenticated: true, url: 'dedato://m/..' });
    expect(app.pending()).toBeNull();
    expect(app.roleBlocked()).toBe(false);
    expect(replaceMock()).not.toHaveBeenCalled();
    await app.close();
  });

  it.each([null, 'dedato://m/bob', 'dedato://m/%']) (
    'replaces abandoned retry state with a new URL %p', async (newUrl) => {
      let controller!: Controller;
      function Probe({ ready }: { ready: boolean }) {
        controller = usePendingPublicBooking({
          navigationReady: ready, currentSlug: null, onConsumed: jest.fn(),
        });
        return null;
      }
      let renderer!: ReturnType<typeof create>;
      await act(async () => { renderer = create(<Probe ready />); });
      replaceMock().mockImplementationOnce(() => { throw new Error('navigation'); });
      await act(async () => { controller.requestUrl('dedato://m/alice'); });
      expect(controller.pendingSlug).toBeNull();
      await act(async () => { renderer.update(<Probe ready={false} />); });
      await act(async () => { controller.requestUrl(newUrl); });
      replaceMock().mockClear();
      await act(async () => { renderer.update(<Probe ready />); });
      expect(replaceMock().mock.calls).toEqual(newUrl === 'dedato://m/bob' ? [['/m/bob']] : []);
      await act(async () => { renderer.unmount(); });
    }
  );

  it('retries an abandoned intent once on a readiness edge without immediate retry after throw', async () => {
    let controller!: Controller;
    function Probe({ ready }: { ready: boolean }) {
      controller = usePendingPublicBooking({
        navigationReady: ready, currentSlug: null, onConsumed: jest.fn(),
      });
      return null;
    }
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<Probe ready />); });
    replaceMock().mockImplementationOnce(() => { throw new Error('navigation'); });
    await act(async () => { controller.requestUrl('dedato://m/alice'); });
    expect(replaceMock()).toHaveBeenCalledTimes(1);
    expect(controller.pendingSlug).toBeNull();
    await act(async () => { renderer.update(<Probe ready={false} />); });
    await act(async () => { renderer.update(<Probe ready />); });
    expect(replaceMock().mock.calls).toEqual([['/m/alice'], ['/m/alice']]);
    expect(controller.pendingSlug).toBe('alice');
    await act(async () => { renderer.update(<Probe ready />); });
    expect(replaceMock()).toHaveBeenCalledTimes(2);
    await act(async () => { renderer.unmount(); });
  });
});

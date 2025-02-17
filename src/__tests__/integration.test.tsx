import React, { ReactElement, useEffect } from 'react';
import ReactDOMServer from 'react-dom/server';
import { render, act } from '@testing-library/react';

import LooselyLazy, {
  lazyForPaint,
  lazyAfterPaint,
  LazySuspense,
  useLazyPhase,
  MODE,
} from '..';
import { PHASE } from '../constants';
import { createMockImport, nextTick } from './utils';
import { isNodeEnvironment } from '../utils';

jest.mock('../utils', () => ({
  ...jest.requireActual<any>('../utils'),
  isNodeEnvironment: jest.fn(),
}));

const createApp = ({
  server,
  ssr,
  hydrate,
  phase = undefined,
}: {
  server: boolean;
  ssr: boolean;
  hydrate: boolean;
  phase?: number;
}) => {
  (isNodeEnvironment as any).mockImplementation(() => server);

  const Child = jest.fn(() => <p className="p">Content</p>);
  const Fallback = jest.fn<any, void[]>(() => <i>Fallback</i>);
  const { mockImport, resolveImport } = createMockImport(Child, ssr && server);
  const lazyFn = phase === PHASE.AFTER_PAINT ? lazyAfterPaint : lazyForPaint;
  // @ts-ignore - We are mocking the import
  const AsyncComponent = lazyFn(() => mockImport, {
    ssr,
    moduleId: './mock',
  });

  LooselyLazy.init({
    mode: hydrate ? MODE.HYDRATE : MODE.RENDER,
    manifest: {
      publicPath: '/',
      assets: {
        './mock': [''],
      },
    },
  });

  const App = () => (
    <LazySuspense fallback={<Fallback />}>
      <AsyncComponent />
    </LazySuspense>
  );

  return { App, resolveImport, Fallback, Child };
};

describe('hydrate without priority', () => {
  const hydrate = true;

  describe('with SSR', () => {
    it('should render content in SSR, persist SSR output while loading, and finally replace', async () => {
      const ssr = true;
      const { App: ServerApp } = createApp({ server: true, ssr, hydrate });

      document.body.innerHTML = `<div>${ReactDOMServer.renderToString(
        <ServerApp />
      )}</div>`;
      // expect ssr to render content
      expect(document.body).toContainHTML('<p class="p">Content</p>');

      const { App: ClientApp, Child, resolveImport } = createApp({
        server: false,
        ssr,
        hydrate,
      });
      render(<ClientApp />, {
        hydrate,
        container: document.body.firstChild as HTMLElement,
      });
      // expect client to use placeholder and persit ssr content
      expect(Child).not.toHaveBeenCalled();
      expect(document.body).toContainHTML('<p class="p">Content</p>');

      await act(resolveImport);

      // expect component to be live after being resolved
      expect(Child).toHaveBeenCalled();
      expect(document.body).toContainHTML('<p class="p">Content</p>');
      expect(document.body).not.toContainHTML('<input');
    });
  });

  describe('without SSR', () => {
    it('should render fallback in SSR, persist SSR output initially, render fallback, and finally replace', async () => {
      const ssr = false;
      const { App: ServerApp } = createApp({ server: true, ssr, hydrate });

      document.body.innerHTML = `<div>${ReactDOMServer.renderToString(
        <ServerApp />
      )}</div>`;
      // expect ssr to render fallback
      expect(document.body).toContainHTML('<i>Fallback</i>');

      const { App: ClientApp, Fallback, Child, resolveImport } = createApp({
        server: false,
        ssr,
        hydrate,
      });

      render(<ClientApp />, {
        hydrate,
        container: document.body.firstChild as HTMLElement,
      });

      // expect client to use live fallback ASAP
      expect(Child).not.toHaveBeenCalled();
      expect(Fallback).toHaveBeenCalled();
      expect(document.body).toContainHTML('<i>Fallback</i>');
      expect(document.body).not.toContainHTML('<input');

      await act(resolveImport);

      // expect component to be live after being resolved
      expect(Child).toHaveBeenCalled();
      expect(document.body).toContainHTML('<p class="p">Content</p>');
    });
  });
});

describe('render without priority', () => {
  const hydrate = false;

  describe('with SSR', () => {
    it('should render content in SSR, persist SSR output while loading, and finally replace', async () => {
      const ssr = true;
      const { App: ServerApp } = createApp({ server: true, ssr, hydrate });

      document.body.innerHTML = `<div>${ReactDOMServer.renderToString(
        <ServerApp />
      )}</div>`;
      // expect ssr to render content
      expect(document.body).toContainHTML('<p class="p">Content</p>');

      const { App: ClientApp, Child, resolveImport } = createApp({
        server: false,
        ssr,
        hydrate,
      });
      render(<ClientApp />, {
        hydrate,
        container: document.body.firstChild as HTMLElement,
      });
      // expect client to use placeholder and persit ssr content
      expect(Child).not.toHaveBeenCalled();
      expect(document.body).toContainHTML('<p class="p">Content</p>');

      await act(resolveImport);

      // expect component to be live after being resolved
      expect(Child).toHaveBeenCalled();
      expect(document.body).toContainHTML('<p class="p">Content</p>');
      expect(document.body).not.toContainHTML('<input');
    });
  });

  describe('without SSR', () => {
    it('should render fallback in SSR, render fallback asap, and finally replace', async () => {
      const ssr = false;
      const { App: ServerApp } = createApp({ server: true, ssr, hydrate });

      document.body.innerHTML = `<div>${ReactDOMServer.renderToString(
        <ServerApp />
      )}</div>`;
      // expect ssr to render fallback
      expect(document.body).toContainHTML('<i>Fallback</i>');

      const { App: ClientApp, Fallback, Child, resolveImport } = createApp({
        server: false,
        ssr,
        hydrate,
      });
      render(<ClientApp />, {
        hydrate,
        container: document.body.firstChild as HTMLElement,
      });
      // expect client to use live fallback ASAP
      expect(Child).not.toHaveBeenCalled();
      expect(Fallback).toHaveBeenCalled();
      expect(document.body).toContainHTML('<i>Fallback</i>');
      expect(document.body).not.toContainHTML('<input');

      await act(resolveImport);

      // expect component to be live after being resolved
      expect(Child).toHaveBeenCalled();
      expect(document.body).toContainHTML('<p class="p">Content</p>');
    });
  });
});

describe('with static phase', () => {
  const Wrapper = ({
    children,
    phase,
  }: {
    children: ReactElement;
    phase?: number;
  }) => {
    const { startNextPhase } = useLazyPhase();
    useEffect(() => {
      if (phase === PHASE.AFTER_PAINT) startNextPhase();
    }, [phase, startNextPhase]);

    return children;
  };

  describe('with SSR', () => {
    it('should render content in SSR, persist SSR output while loading, and finally replace', async () => {
      const hydrate = true;
      const ssr = true;
      const { App: ServerApp } = createApp({
        server: true,
        ssr,
        hydrate,
        phase: PHASE.AFTER_PAINT,
      });

      document.body.innerHTML = `<div>${ReactDOMServer.renderToString(
        <Wrapper>
          <ServerApp />
        </Wrapper>
      )}</div>`;
      // expect ssr to render content
      expect(document.body).toContainHTML('<p class="p">Content</p>');

      const { App: ClientApp, Child, resolveImport } = createApp({
        server: false,
        ssr,
        hydrate,
        phase: PHASE.AFTER_PAINT,
      });
      const { rerender } = render(
        <Wrapper>
          <ClientApp />
        </Wrapper>,
        {
          hydrate,
          container: document.body.firstChild as HTMLElement,
        }
      );
      // simulate component being ready on next tick
      await act(resolveImport);

      // expect client to use placeholder and persit ssr content regardless
      expect(Child).not.toHaveBeenCalled();
      expect(document.body).toContainHTML('<p class="p">Content</p>');

      rerender(
        <Wrapper phase={PHASE.AFTER_PAINT}>
          <ClientApp />
        </Wrapper>
      );
      await nextTick();

      // expect component to be live after phase changed
      expect(Child).toHaveBeenCalled();
      expect(document.body).toContainHTML('<p class="p">Content</p>');
      expect(document.body).not.toContainHTML('<input');
    });
  });

  describe('without SSR', () => {
    it('should render fallback in SSR, render fallback asap, and finally replace', async () => {
      const hydrate = true;
      const ssr = false;
      const { App: ServerApp } = createApp({
        server: true,
        ssr,
        hydrate,
        phase: PHASE.AFTER_PAINT,
      });

      document.body.innerHTML = `<div>${ReactDOMServer.renderToString(
        <Wrapper>
          <ServerApp />
        </Wrapper>
      )}</div>`;
      // expect ssr to render fallback
      expect(document.body).toContainHTML('<i>Fallback</i>');

      const { App: ClientApp, Fallback, Child, resolveImport } = createApp({
        server: false,
        ssr,
        hydrate,
        phase: PHASE.AFTER_PAINT,
      });
      const { rerender } = render(
        <Wrapper>
          <ClientApp />
        </Wrapper>,
        {
          hydrate,
          container: document.body.firstChild as HTMLElement,
        }
      );

      // simulate component being ready on next tick
      await act(resolveImport);

      // expect client to use live fallback ASAP
      expect(Child).not.toHaveBeenCalled();
      expect(Fallback).toHaveBeenCalled();
      expect(document.body).toContainHTML('<i>Fallback</i>');
      expect(document.body).not.toContainHTML('<input');

      rerender(
        <Wrapper phase={PHASE.AFTER_PAINT}>
          <ClientApp />
        </Wrapper>
      );
      await nextTick();

      // expect component to be live after phase changed
      expect(Child).toHaveBeenCalled();
      expect(document.body).toContainHTML('<p class="p">Content</p>');
      expect(document.body).not.toContainHTML('<input');
    });
  });
});

// describe('with wait priority', () => {
//   describe('with SSR', () => {
//     it('should render content in SSR, persist SSR output while loading, and finally replace', () => {});
//   });

//   describe('without SSR', () => {
//     it('should render fallback in SSR, persist SSR output initially, render fallback, and finally replace', () => {});
//   });
// });

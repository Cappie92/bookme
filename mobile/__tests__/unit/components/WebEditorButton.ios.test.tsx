import React from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TestRenderer = require('react-test-renderer');
const { WebEditorButton } = require('@src/components/WebEditorButton.ios');
const { WebEditorButton: AndroidWebEditorButton } = require('@src/components/WebEditorButton.tsx');

describe('WebEditorButton iOS browser boundary', () => {
  it('renders nothing for schedule, services and settings destinations', () => {
    for (const destination of ['schedule', 'services', 'settings'] as const) {
      let tree: { toJSON: () => unknown };
      TestRenderer.act(() => {
        tree = TestRenderer.create(
          React.createElement(WebEditorButton, {
            destination,
            title: 'Редактировать в браузере',
            testID: `ios-web-editor-${destination}`,
          })
        );
      });
      expect(tree!.toJSON()).toBeNull();
    }
  });

  it('does not import Linking, handoff helpers or browser CTA copy', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const source = readFileSync(join(__dirname, '../../../src/components/WebEditorButton.ios.tsx'), 'utf8');
    expect(source).toContain('return null');
    expect(source).not.toContain('Linking');
    expect(source).not.toContain('openWebHandoff');
    expect(source).not.toContain('createWebHandoff');
    expect(source).not.toContain('в браузере');
  });

  it('keeps the Android WebEditorButton implementation as a no-op', () => {
    let tree: { toJSON: () => unknown };
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        React.createElement(AndroidWebEditorButton, {
          destination: 'schedule',
          title: 'Редактировать расписание в браузере',
          testID: 'android-web-editor-schedule',
        })
      );
    });
    expect(tree!.toJSON()).toBeNull();
  });
});

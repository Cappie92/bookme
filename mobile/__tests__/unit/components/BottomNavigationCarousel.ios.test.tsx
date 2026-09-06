import React from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockReplace = jest.fn();
let mockSegments: string[] = ['(master)', 'index'];

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSegments: () => mockSegments,
}));

jest.mock('react-native', () => {
  const ReactLib = require('react');
  const host = (name: string) => ({ children, ...props }: Record<string, unknown>) =>
    ReactLib.createElement(name, props, children);
  return {
    Platform: { OS: 'ios' },
    StyleSheet: { create: (styles: Record<string, unknown>) => styles },
    Text: host('Text'),
    TouchableOpacity: host('TouchableOpacity'),
    View: host('View'),
  };
});

jest.mock('react-native-safe-area-context', () => {
  const ReactLib = require('react');
  return {
    SafeAreaView: ({ children, ...props }: Record<string, unknown>) =>
      ReactLib.createElement('SafeAreaView', props, children),
  };
});

jest.mock('@expo/vector-icons', () => {
  const ReactLib = require('react');
  return {
    Ionicons: (props: Record<string, unknown>) => ReactLib.createElement('Ionicons', props),
  };
});

const mockSetTabBarHeight = jest.fn();
jest.mock('@src/contexts/TabBarHeightContext', () => ({
  useTabBarHeight: () => ({ setTabBarHeight: mockSetTabBarHeight }),
}));

const TestRenderer = require('react-test-renderer');
const { BottomNavigationCarousel } = require('@src/components/BottomNavigationCarousel.ios');

describe('BottomNavigationCarousel iOS', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSegments = ['(master)', 'index'];
  });

  it('renders exactly four accessible tabs and no Menu destination', () => {
    let tree: any;
    TestRenderer.act(() => {
      tree = TestRenderer.create(React.createElement(BottomNavigationCarousel));
    });

    const expectedIds = [
      'bottom-nav-dashboard',
      'bottom-nav-schedule',
      'bottom-nav-services',
      'bottom-nav-settings',
    ];
    const tabs = tree.root.findAll(
      (node: any) => node.type === 'TouchableOpacity' && node.props.accessibilityRole === 'tab',
    );
    expect(tabs.map((node: any) => node.props.testID)).toEqual(expectedIds);
    expect(tree.root.findAllByProps({ testID: 'bottom-nav-menu' })).toHaveLength(0);
    expect(tabs[0].props.accessibilityState).toEqual({ selected: true });
  });

  it.each([
    ['dashboard', ['(master)', 'master', 'schedule'], '/'],
    ['schedule', ['(master)', 'index'], '/master/schedule'],
    ['services', ['(master)', 'index'], '/master/services'],
    ['settings', ['(master)', 'index'], '/master/settings'],
  ] as const)('routes the %s press without stacking a duplicate tab', (id, segments, route) => {
    mockSegments = [...segments];
    let tree: any;
    TestRenderer.act(() => {
      tree = TestRenderer.create(React.createElement(BottomNavigationCarousel));
    });

    TestRenderer.act(() => {
      tree.root.findByProps({ testID: `bottom-nav-${id}` }).props.onPress();
    });

    expect(mockReplace).toHaveBeenCalledWith(route);
  });

  it('does not navigate when the selected tab is pressed again', () => {
    mockSegments = ['(master)', 'master', 'services'];
    let tree: any;
    TestRenderer.act(() => {
      tree = TestRenderer.create(React.createElement(BottomNavigationCarousel));
    });

    TestRenderer.act(() => {
      tree.root.findByProps({ testID: 'bottom-nav-services' }).props.onPress();
    });

    expect(mockReplace).not.toHaveBeenCalled();
  });
});

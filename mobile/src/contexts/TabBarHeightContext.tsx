import React, { createContext, useContext, useState, useMemo, ReactNode } from 'react';

interface TabBarHeightContextType {
  tabBarHeight: number | null;
  setTabBarHeight: (height: number) => void;
}

const TabBarHeightContext = createContext<TabBarHeightContextType | undefined>(undefined);

export function TabBarHeightProvider({ children }: { children: ReactNode }) {
  const [tabBarHeight, setTabBarHeight] = useState<number | null>(null);
  const value = useMemo(() => ({ tabBarHeight, setTabBarHeight }), [tabBarHeight]);

  return (
    <TabBarHeightContext.Provider value={value}>
      {children}
    </TabBarHeightContext.Provider>
  );
}

export function useTabBarHeight() {
  const context = useContext(TabBarHeightContext);
  if (context === undefined) {
    throw new Error('useTabBarHeight must be used within a TabBarHeightProvider');
  }
  return context;
}


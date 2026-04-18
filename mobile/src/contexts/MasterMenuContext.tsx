import React, { createContext, useContext, useState, ReactNode, useRef } from 'react';

interface MasterMenuContextType {
  isMenuVisible: boolean;
  openMenu: () => void;
  closeMenu: (reason?: string) => void;
}

const MasterMenuContext = createContext<MasterMenuContextType | undefined>(undefined);

export function MasterMenuProvider({ children }: { children: ReactNode }) {
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const openedAtRef = useRef<number>(0);

  const openMenu = () => {
    if (isOpening || isMenuVisible) {
      return;
    }
    setIsOpening(true);
    openedAtRef.current = Date.now();
    setIsMenuVisible(true);
    setIsOpening(false);
  };

  const closeMenu = (reason: string = 'unknown') => {
    const now = Date.now();
    const ageMs = now - (openedAtRef.current || 0);
    // Игнорируем overlay_press сразу после открытия — это tap-through/release от тапа по таб-бару.
    if (reason === 'overlay_press' && ageMs >= 0 && ageMs < 250) {
      return;
    }
    setIsMenuVisible(false);
    setIsOpening(false);
  };

  return (
    <MasterMenuContext.Provider value={{ isMenuVisible, openMenu, closeMenu }}>
      {children}
    </MasterMenuContext.Provider>
  );
}

export function useMasterMenu() {
  const context = useContext(MasterMenuContext);
  if (context === undefined) {
    throw new Error('useMasterMenu must be used within a MasterMenuProvider');
  }
  return context;
}

/** No-op провайдер для client-ветки: меню не используется, но BottomNav может вызывать closeMenu. */
export function MasterMenuProviderNoOp({ children }: { children: ReactNode }) {
  const noop = () => {};
  return (
    <MasterMenuContext.Provider value={{ isMenuVisible: false, openMenu: noop, closeMenu: noop }}>
      {children}
    </MasterMenuContext.Provider>
  );
}


import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/** Высота клавиатуры для bottom-sheet модалок (0 когда закрыта). */
export function useModalKeyboardHeight(active: boolean): number {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (!active) {
      setKeyboardHeight(0);
      return;
    }
    const applyHeight = (height: number) => {
      setKeyboardHeight(Math.max(0, Math.round(height)));
    };
    const subs: { remove: () => void }[] = [];
    if (Platform.OS === 'ios') {
      subs.push(
        Keyboard.addListener('keyboardWillShow', (e) => applyHeight(e.endCoordinates?.height ?? 0))
      );
      subs.push(Keyboard.addListener('keyboardWillHide', () => applyHeight(0)));
    } else {
      subs.push(
        Keyboard.addListener('keyboardDidShow', (e) => applyHeight(e.endCoordinates?.height ?? 0))
      );
      subs.push(Keyboard.addListener('keyboardDidHide', () => applyHeight(0)));
      subs.push(
        Keyboard.addListener('keyboardDidChangeFrame', (e) => {
          const h = e.endCoordinates?.height ?? 0;
          if (h > 0) applyHeight(h);
        })
      );
    }
    return () => {
      subs.forEach((s) => s.remove());
    };
  }, [active]);

  return keyboardHeight;
}

import { useEffect } from 'react';
import type { ThemeId } from '../types';

export function useTheme(theme: ThemeId) {
  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
  }, [theme]);
}












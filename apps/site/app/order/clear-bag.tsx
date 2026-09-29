'use client';

import { useEffect } from 'react';

/** The order went through, so the bag this browser was keeping is done with. */
export function ClearBag() {
  useEffect(() => {
    try {
      window.localStorage.removeItem('wm-bag');
    } catch {
      // Storage is off; nothing was kept.
    }
  }, []);
  return null;
}

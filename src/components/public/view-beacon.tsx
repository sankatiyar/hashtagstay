'use client';

import { useEffect } from 'react';

/** Records one listing view per page load, once, after hydration. */
export function ViewBeacon({ propertyId }: { propertyId: string }) {
  useEffect(() => {
    const key = `hs_viewed_${propertyId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {
      // Storage blocked: still count the view.
    }
    void fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'listing.viewed', propertyId }),
      keepalive: true,
    });
  }, [propertyId]);
  return null;
}

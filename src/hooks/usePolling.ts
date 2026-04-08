"use client";

import { useEffect, useRef, useCallback } from 'react';

export function usePolling(callback: () => void, intervalMs: number, enabled = true) {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;
    const tick = () => savedCallback.current();
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);
}

export function useFetchPolling<T>(
  url: string,
  intervalMs: number,
  onData: (data: T) => void,
  enabled = true
) {
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        onData(data);
      }
    } catch { /* ignore polling errors */ }
  }, [url, onData]);

  usePolling(fetchData, intervalMs, enabled);
}

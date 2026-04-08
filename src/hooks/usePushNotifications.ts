"use client";

import { useEffect, useState } from "react";

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    const isSupported = "Notification" in window && "serviceWorker" in navigator;
    setSupported(isSupported);
    if (isSupported) {
      setPermission(Notification.permission);
    }
  }, []);

  async function requestPermission(): Promise<boolean> {
    if (!supported) return false;
    try {
      // Register service worker
      await navigator.serviceWorker.register("/sw.js");
      const result = await Notification.requestPermission();
      setPermission(result);
      return result === "granted";
    } catch {
      return false;
    }
  }

  // Send a local notification (for events detected via polling)
  function sendLocalNotification(title: string, body: string, url?: string) {
    if (permission !== "granted") return;
    navigator.serviceWorker.ready.then((reg) => {
      reg.showNotification(title, {
        body,
        icon: "/icon-192.png",
        data: { url: url || "/dashboard" },
        tag: "golf-" + Date.now(),
      });
    });
  }

  return { permission, supported, requestPermission, sendLocalNotification };
}

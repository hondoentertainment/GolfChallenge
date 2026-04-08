"use client";

import { useState, useEffect } from "react";

export function useCountdown(targetDate: Date | string | null) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    if (!targetDate) { setTimeLeft(""); return; }
    const target = typeof targetDate === "string" ? new Date(targetDate) : targetDate;

    function update() {
      const now = Date.now();
      const diff = target.getTime() - now;
      if (diff <= 0) { setTimeLeft("Expired"); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (h > 24) {
        const d = Math.floor(h / 24);
        setTimeLeft(`${d}d ${h % 24}h`);
      } else {
        setTimeLeft(`${h}h ${m}m ${s}s`);
      }
    }

    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [targetDate]);

  return timeLeft;
}

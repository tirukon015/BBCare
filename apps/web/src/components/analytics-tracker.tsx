"use client";

import { usePathname } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";
import { useEffect, useRef } from "react";
import { flushOnExit, sessionId, track } from "@/lib/client/analytics";

/** Page views, scroll depth on exit, tagged clicks, web vitals and JS errors. */
export function AnalyticsTracker() {
  const pathname = usePathname();
  const maxScroll = useRef(0);
  const enteredAt = useRef(0);
  const first = useRef(true);

  useReportWebVitals((metric) => {
    if (["LCP", "INP", "CLS", "TTFB"].includes(metric.name)) {
      track("performance_error", { kind: "web_vital", name: metric.name, value: Math.max(0, Math.round(metric.name === "CLS" ? metric.value * 1000 : metric.value)), route: location.pathname.slice(0, 200) });
    }
  });

  useEffect(() => {
    const { isNew } = sessionId();
    if (isNew) track("session_started", { entry_page_type: pathname?.split("/")[2] || "home" });
    track("page_view", first.current ? { landing: true } : {});
    first.current = false;
    maxScroll.current = 0;
    enteredAt.current = Date.now();
    return () => {
      const bucket = [0, 25, 50, 75, 100].filter((b) => b <= maxScroll.current).at(-1) ?? 0;
      track("navigation_exit", { max_scroll_pct: bucket, time_on_page_s: Math.min(86400, Math.round((Date.now() - enteredAt.current) / 1000)) });
    };
  }, [pathname]);

  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const pct = h.scrollHeight <= h.clientHeight ? 100 : ((h.scrollTop + h.clientHeight) / h.scrollHeight) * 100;
      maxScroll.current = Math.max(maxScroll.current, Math.min(100, pct));
    };
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-track]");
      const key = el?.dataset.track;
      if (key && /^[a-z0-9_.-]{1,64}$/.test(key)) track("ui_click", { element_key: key });
    };
    const onError = (e: ErrorEvent) => track("performance_error", { kind: "js_error", name: (e.error?.name ?? "Error").slice(0, 64), route: location.pathname.slice(0, 200) });
    const onHide = () => {
      if (document.visibilityState === "hidden") {
        const bucket = [0, 25, 50, 75, 100].filter((b) => b <= maxScroll.current).at(-1) ?? 0;
        track("navigation_exit", { max_scroll_pct: bucket, time_on_page_s: Math.min(86400, Math.round((Date.now() - enteredAt.current) / 1000)) });
        flushOnExit();
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("click", onClick);
    window.addEventListener("error", onError);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("click", onClick);
      window.removeEventListener("error", onError);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);

  return null;
}

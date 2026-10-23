"use client";

import { useEffect } from "react";
import { track } from "@/lib/client/analytics";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    track("performance_error", { kind: "js_error", name: (error.name || "Error").slice(0, 64), route: location.pathname.slice(0, 200) });
  }, [error]);
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">Something went wrong / Berlaku ralat</h1>
      <p className="mt-2 text-ink-soft">Please try again in a moment. / Sila cuba lagi sebentar lagi.</p>
      {error.digest ? <p className="mt-2 text-xs text-muted">Ref: {error.digest}</p> : null}
      <button type="button" onClick={reset} className="mt-6 min-h-11 rounded-lg bg-olive px-4 text-sm font-semibold text-white">Try again / Cuba lagi</button>
    </div>
  );
}

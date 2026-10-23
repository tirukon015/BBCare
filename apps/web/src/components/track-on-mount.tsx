"use client";

import { useEffect } from "react";
import { track } from "@/lib/client/analytics";

/** Fire one analytics event when a server-rendered page mounts. */
export function TrackOnMount({ name, props }: { name: string; props: Record<string, unknown> }) {
  const key = JSON.stringify(props);
  useEffect(() => {
    track(name, JSON.parse(key) as Record<string, unknown>);
  }, [name, key]);
  return null;
}

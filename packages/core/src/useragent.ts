/** Coarse user-agent classification. The raw user agent is never stored. */
export interface UaInfo {
  deviceCategory: "mobile" | "tablet" | "desktop" | "bot" | "unknown";
  browserFamily: string;
  osFamily: string;
}

const BOT = /bot|crawler|spider|crawling|headless|lighthouse|slurp|bingpreview|facebookexternalhit|preview/i;

export function classifyUserAgent(ua: string | null | undefined): UaInfo {
  if (!ua) return { deviceCategory: "unknown", browserFamily: "unknown", osFamily: "unknown" };
  if (BOT.test(ua)) return { deviceCategory: "bot", browserFamily: "bot", osFamily: "bot" };
  const tablet = /ipad|tablet|(android(?!.*mobile))/i.test(ua);
  const mobile = !tablet && /mobi|iphone|ipod|android/i.test(ua);
  const os = /windows/i.test(ua)
    ? "Windows"
    : /iphone|ipad|ipod/i.test(ua)
      ? "iOS"
      : /mac os x|macintosh/i.test(ua)
        ? "macOS"
        : /android/i.test(ua)
          ? "Android"
          : /cros/i.test(ua)
            ? "ChromeOS"
            : /linux/i.test(ua)
              ? "Linux"
              : "other";
  const browser = /edg\//i.test(ua)
    ? "Edge"
    : /samsungbrowser/i.test(ua)
      ? "Samsung Internet"
      : /opr\/|opera/i.test(ua)
        ? "Opera"
        : /firefox|fxios/i.test(ua)
          ? "Firefox"
          : /chrome|crios/i.test(ua)
            ? "Chrome"
            : /safari/i.test(ua)
              ? "Safari"
              : "other";
  return { deviceCategory: tablet ? "tablet" : mobile ? "mobile" : "desktop", browserFamily: browser, osFamily: os };
}

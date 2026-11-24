// Build-time settings and runtime platform detection.
export const HUB_URL = (import.meta.env.VITE_HUB_URL as string | undefined)?.trim() || "";
export const WISDOM_URL = (import.meta.env.VITE_WISDOM_URL as string | undefined)?.trim() || "";
export const ISSUER_PKH = (import.meta.env.VITE_ISSUER_PKH as string | undefined)?.trim() || "";
export const VERSION = __APP_VERSION__;

/** True inside the Android app (Capacitor shell). */
export const IN_APP = typeof window !== "undefined" && !!(window as any).Capacitor?.isNativePlatform?.();

/** Small persistent store; storage can be missing or throw in some WebViews. */
export const store = {
  get(k: string): string | null {
    try { return localStorage.getItem("wdhub:" + k); } catch { return null; }
  },
  set(k: string, v: string | null) {
    try { v === null ? localStorage.removeItem("wdhub:" + k) : localStorage.setItem("wdhub:" + k, v); } catch { /* ignore */ }
  },
};

/** Open outside the app (system browser / wallet). */
export function openExternal(url: string) {
  if (IN_APP) window.location.href = url; // Capacitor hands non-app URLs to Android
  else window.open(url, "_blank", "noopener");
}

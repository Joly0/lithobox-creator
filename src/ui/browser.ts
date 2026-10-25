// Rough browser family, only used to show the right "turn on 3D" steps.
export type BrowserFamily = 'firefox' | 'edge' | 'chrome' | 'safari' | 'other';

export function browserFamily(ua = navigator.userAgent): BrowserFamily {
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/Edg\//.test(ua)) return 'edge';
  if (/Chrome\/|Chromium\//.test(ua)) return 'chrome';
  if (/Safari\//.test(ua)) return 'safari';
  return 'other';
}

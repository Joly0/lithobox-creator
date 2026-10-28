// Usage counts for the self-hosted Umami. Its script (index.html) defines window.umami; when it is
// blocked, still loading, or off this domain (dev), the call does nothing.
export function track(event: string, data: Record<string, string>): void {
  (window as { umami?: { track(event: string, data: object): void } }).umami?.track(event, data);
}

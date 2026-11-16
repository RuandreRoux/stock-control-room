// Stock Control Room - shows admin alerts (for example a new sign-up waiting for
// approval), even when the app is not open. Does nothing else: no caching, no offline.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let alert = {};
  try {
    alert = event.data ? event.data.json() : {};
  } catch {
    alert = {};
  }
  const url = typeof alert.url === "string" && alert.url.startsWith("/") ? alert.url : "/admin?view=users";
  event.waitUntil(
    self.registration.showNotification(alert.title || "Stock Control Room", {
      body: alert.body || "Something needs your attention.",
      icon: "/icon.png",
      badge: "/icon.png",
      tag: alert.tag || "stock-control-room",
      renotify: true,
      requireInteraction: true,
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/admin?view=users", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of open) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(target);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

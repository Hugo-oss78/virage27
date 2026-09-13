// Service worker minimal : sert uniquement à satisfaire les critères d'installation
// de Chrome/Android ("Installer l'application"). Ne met rien en cache pour éviter
// d'afficher une version obsolète de l'app après une mise à jour.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});

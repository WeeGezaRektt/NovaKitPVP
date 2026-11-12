// A best-effort local fallback. Never exposes staff/private database data.
export function cachePublicData(key, data) {
  try { localStorage.setItem('nova-v2-public-' + key, JSON.stringify({data, time: Date.now()})); } catch {}
}
export function getPublicData(key) {
  try { return JSON.parse(localStorage.getItem('nova-v2-public-' + key) || 'null'); } catch { return null; }
}
export function showOfflineNotice(message) {
  const banner = document.getElementById('novaOfflineNotice');
  if (banner) { banner.hidden = false; banner.textContent = message; }
}

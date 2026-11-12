// Nova V2: cached public appearance assets. Existing icon contents are never changed.
const KEY = 'nova-v2-public-assets-v1';
const TTL = 15 * 60 * 1000;
let pending = null;
export async function loadNovaAssets(supabase, {force = false} = {}) {
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch {}
  if (!force && cached && Array.isArray(cached.rows) && Date.now() - cached.time < TTL)
    return {data: cached.rows, error: null, cached: true};
  if (pending && !force) return pending;
  const task = (async () => {
    try {
      const result = await supabase.from('site_assets').select('asset_key,asset_value');
      if (!result.error && Array.isArray(result.data)) {
        try { localStorage.setItem(KEY, JSON.stringify({rows: result.data, time: Date.now()})); } catch {}
        return result;
      }
      if (cached && Array.isArray(cached.rows)) return {data: cached.rows, error: null, cached: true};
      return result;
    } catch (error) {
      if (cached && Array.isArray(cached.rows)) return {data: cached.rows, error: null, cached: true};
      throw error;
    }
  })();
  if (!force) pending = task;
  try { return await task; } finally { if (!force) pending = null; }
}
export function cacheNovaAssets(rows) {
  try { localStorage.setItem(KEY, JSON.stringify({rows, time: Date.now()})); } catch {}
}

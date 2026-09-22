let cached;
export async function getSupabase(){
  if(cached) return cached;
  const cfgRes = await fetch('/api/config');
  if(!cfgRes.ok) throw new Error('NovaKitPVP database is not configured yet.');
  const cfg = await cfgRes.json();
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  cached = createClient(cfg.url,cfg.anonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  return cached;
}

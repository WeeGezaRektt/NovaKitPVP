module.exports = async function handler(req,res){
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  const name=String(req.query?.name||'').trim();
  if(!/^[A-Za-z0-9_]{3,16}$/.test(name)) return res.status(400).json({error:'Invalid Minecraft username'});
  try{
    const r=await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`);
    if(r.status===204||r.status===404) return res.status(404).json({error:'Java profile not found'});
    if(!r.ok) return res.status(502).json({error:'Mojang profile lookup failed'});
    const data=await r.json();
    res.setHeader('Cache-Control','public, max-age=3600, s-maxage=86400');
    return res.status(200).json({uuid:String(data.id||'').toLowerCase(),name:data.name||name});
  }catch(error){console.error('java-profile',error);return res.status(500).json({error:'Could not resolve Java profile'})}
};

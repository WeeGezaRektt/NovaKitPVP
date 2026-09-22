module.exports = async function handler(req,res){
  return res.status(410).json({error:'Minecraft account linking has been retired. NovaKitPVP staff access is email-based.'});
};

// ⚠️ FICHIER TEMPORAIRE - À SUPPRIMER APRÈS DEBUG
export default function handler(req, res) {
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  
  res.status(200).json({
    token_exists: !!token,
    token_length: token ? token.length : 0,
    token_preview: token ? `${token.substring(0, 5)}...${token.substring(token.length - 3)}` : null,
    all_env_keys: Object.keys(process.env).filter(k => 
      k.includes('WHATSAPP') || k.includes('SUPABASE') || k.includes('GEMINI')
    )
  });
}
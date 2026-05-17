// ============================================================
// lib/supabase-admin.js
// Client Supabase côté backend (service_role)
// ⚠️ NE JAMAIS exposer ce fichier ou cette clé côté client
// ============================================================

const { createClient } = require('@supabase/supabase-js');

let supabaseAdmin = null;

/**
 * Retourne un client Supabase singleton avec la clé service_role
 * Le service_role bypasse toutes les RLS policies
 */
function getSupabaseAdmin() {
  if (!supabaseAdmin) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Variables SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquantes');
    }
    supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );
  }
  return supabaseAdmin;
}

module.exports = { getSupabaseAdmin };

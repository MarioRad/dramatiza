require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Supabase es opcional — ya no se usa por defecto (BD local 192.168.100.129).
// Si no hay credenciales, se exporta un stub para no romper imports.
let supabase = null;
let supabaseAdmin = null;

if (supabaseUrl && supabaseAnonKey) {
  try {
    const { createClient } = require('@supabase/supabase-js');
    supabase = createClient(supabaseUrl, supabaseAnonKey);
    supabaseAdmin = supabaseServiceKey
      ? createClient(supabaseUrl, supabaseServiceKey)
      : supabase;
  } catch (e) {
    console.warn('[Supabase] No se pudo inicializar:', e.message);
  }
} else {
  // Stub inofensivo — storage fallará suavemente y server.js usa filesystem local
  const stubStorage = {
    from: () => ({
      upload: async () => ({ error: { message: 'Supabase no configurado — usando storage local' } }),
      remove: async () => ({ error: null }),
      getPublicUrl: () => ({ data: { publicUrl: null } }),
    }),
  };
  supabase = { storage: stubStorage };
  supabaseAdmin = { storage: stubStorage };
}

module.exports = { supabase, supabaseAdmin };

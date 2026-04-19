// ============================================================
// JUNQO – Supabase client
// ============================================================
// 1) Crea tu proyecto en Supabase.
// 2) Ve a Project Settings > API.
// 3) Reemplaza estos valores por tu Project URL y anon public key.
// NO pegues aquí la service_role key.

const SUPABASE_URL = "PEGA_AQUI_TU_SUPABASE_URL";
const SUPABASE_ANON_KEY = "PEGA_AQUI_TU_SUPABASE_ANON_KEY";

const supabaseClient = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);
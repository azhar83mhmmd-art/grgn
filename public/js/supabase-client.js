/* ============================================================
   Gragon Store — supabase-client.js
   Konfigurasi terpusat Supabase client (browser).
   JANGAN PERNAH memasukkan SUPABASE_SERVICE_ROLE_KEY di sini.
   ============================================================ */

const SUPABASE_URL = 'https://gffapbemophftiovoobk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_javC7KkbLB3U_NEtu2AkyA_6x7UiOh-';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

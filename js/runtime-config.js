/* VERSIONE ONLINE GRATUITA: app su GitHub Pages, dati su Supabase.
   Modifica SOLO le due righe tra virgolette (Supabase → Project Settings → API):
   - Project URL                       → supabaseUrl
   - chiave "anon" / "publishable"     → supabaseKey   (è pubblica per natura: i dati sono protetti dalla funzione ga() del database)
   NON inserire mai qui la chiave "service_role" / "secret". */
GA.config.storage.driver = "supabase";
GA.config.storage.supabaseUrl = "https://cfjtwgiqfwcqqwtcwhdg.supabase.co";
GA.config.storage.supabaseKey = "sb_publishable_krDStrFNmKcr6Fi0VUoLbA_POcM0h1n";
GA.config.serverMode = true;

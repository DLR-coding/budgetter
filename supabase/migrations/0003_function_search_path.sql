-- Fige le search_path des fonctions appelées par l'appli (alerte 0011 de l'advisor Supabase) :
-- un rôle ne peut plus détourner les noms de tables non qualifiés via son propre search_path.

alter function generate_recurrences(date) set search_path = public, pg_temp;
alter function seed_default_categories() set search_path = public, pg_temp;

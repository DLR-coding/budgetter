-- Droits d'accès à l'API (Data API) pour l'utilisateur connecté.
-- Le projet n'expose pas automatiquement les nouvelles tables : sans ces GRANT,
-- l'appli reçoit « permission denied » même connectée. La RLS de 0001 continue
-- de limiter chaque utilisateur à ses propres lignes. Rien pour `anon`.

grant select, insert, update, delete on
  groups, categories, planned_overrides, entries, entry_lines, recurrences, balance_adjustments
  to authenticated;

grant select on line_amounts to authenticated;

revoke execute on function generate_recurrences(date), seed_default_categories() from public, anon;
grant execute on function generate_recurrences(date), seed_default_categories() to authenticated;

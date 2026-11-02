-- Remplace les lignes d'une saisie en une seule transaction (« Modifier les articles ») :
-- si une étape échoue, rien ne change (jamais deux jeux de lignes, jamais une saisie vide).
-- security invoker : la RLS de 0001 limite toujours aux lignes de l'utilisateur connecté.

create or replace function replace_entry_lines(p_entry_id uuid, p_lines jsonb)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  perform 1 from entries where id = p_entry_id and user_id = auth.uid() for update;
  if not found then
    raise exception 'Saisie introuvable : %', p_entry_id using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Une saisie doit garder au moins une ligne' using errcode = '22023';
  end if;

  delete from entry_lines where entry_id = p_entry_id;

  insert into entry_lines (entry_id, category_id, label, raw_label, quantity, unit_price_cents, position)
  select p_entry_id, l.category_id, l.label, l.raw_label, coalesce(l.quantity, 1), l.unit_price_cents,
         coalesce(l.position, 0)
  from jsonb_to_recordset(p_lines)
    as l(category_id uuid, label text, raw_label text, quantity int, unit_price_cents int, position int);
end $$;

revoke execute on function replace_entry_lines(uuid, jsonb) from public, anon;
grant execute on function replace_entry_lines(uuid, jsonb) to authenticated;

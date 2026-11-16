-- Charges récurrentes (validé avec l'utilisateur) :
-- 1. Une charge n'est créée que le jour venu : le 25 apparaît le 25, pas dès le 1er. D'ici là, le prévu
--    de sa catégorie compte. `up_to` = le jour local du téléphone (current_date est en UTC côté serveur).
-- 2. Modifier une charge met aussi à jour la saisie déjà créée pour le mois en cours. Si le nouveau
--    jour n'est pas encore arrivé, cette saisie est retirée et sera recréée le jour venu.
-- security invoker : la RLS limite tout au budget actif de l'utilisateur connecté.

create or replace function generate_recurrences(up_to date default current_date)
returns int language plpgsql security invoker set search_path = public, pg_temp as $$
declare r recurrences; m date; n int := 0; eid uuid;
begin
  for r in select * from recurrences where user_id = auth.uid() and active loop
    m := coalesce(r.last_generated_month + interval '1 month', date_trunc('month', up_to))::date;
    while m + (r.day_of_month - 1) <= up_to loop
      insert into entries (date, merchant, source, recurrence_id)
        values (m + (r.day_of_month - 1), r.label, 'recurrence', r.id) returning id into eid;
      insert into entry_lines (entry_id, category_id, label, unit_price_cents)
        values (eid, r.category_id, r.label, r.amount_cents);
      update recurrences set last_generated_month = m where id = r.id;
      m := (m + interval '1 month')::date;
      n := n + 1;
    end loop;
  end loop;
  return n;
end $$;

create or replace function apply_recurrence_to_month(p_id uuid, p_today date)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare r recurrences; m date := date_trunc('month', p_today)::date; eid uuid;
begin
  select * into r from recurrences where id = p_id;
  if not found then
    raise exception 'Charge récurrente introuvable : %', p_id using errcode = 'P0002';
  end if;
  select id into eid from entries
    where recurrence_id = p_id and date >= m and date < (m + interval '1 month')::date
    order by date limit 1;
  if eid is null then return; end if; -- pas encore créée, ou supprimée à la main : on n'y touche pas

  if m + (r.day_of_month - 1) > p_today then
    delete from entries where id = eid;
    update recurrences set last_generated_month = (m - interval '1 month')::date where id = p_id;
  else
    update entries set date = m + (r.day_of_month - 1), merchant = r.label where id = eid;
    delete from entry_lines where entry_id = eid;
    insert into entry_lines (entry_id, category_id, label, unit_price_cents)
      values (eid, r.category_id, r.label, r.amount_cents);
  end if;
end $$;

revoke execute on function apply_recurrence_to_month(uuid, date) from public, anon;
grant execute on function apply_recurrence_to_month(uuid, date) to authenticated;

-- Catégories manquantes de l'Excel : « Autre » dans Fixes et Variables, quelques Variables,
-- et un groupe « Autres » placé juste avant « Épargne ». Prévu 0, pas de charge récurrente.
-- Idempotente (rien si le nom existe déjà) et sans auth.uid() : elle peut être collée dans le
-- SQL Editor ; elle complète chaque utilisateur qui a déjà des groupes.

-- 1. Groupe « Autres » (dépense), à la place d'« Épargne » qui recule d'un cran.
do $$
declare u uuid; p int;
begin
  for u in select distinct g.user_id from groups g
           where not exists (select 1 from groups x where x.user_id = g.user_id and lower(x.name) = 'autres') loop
    select min(position) into p from groups where user_id = u and name = 'Épargne';
    if p is null then
      select max(position) + 1 into p from groups where user_id = u;
    else
      update groups set position = position + 1 where user_id = u and position >= p;
    end if;
    insert into groups (user_id, name, kind, position) values (u, 'Autres', 'depense', p);
  end loop;
end $$;

-- 2. Catégories, à la suite de celles du groupe (le max est lu avant l'insertion : n.ord les départage).
insert into categories (user_id, group_id, name, default_planned_cents, position)
select g.user_id, g.id, n.name, 0,
       coalesce((select max(c.position) from categories c where c.group_id = g.id), -1) + n.ord
from groups g
join (values
  ('Fixes', 'Autre', 1),
  ('Variables', 'Médicaments / médecin', 1), ('Variables', 'Habits', 2),
  ('Variables', 'Salon de coiffure', 3), ('Variables', 'Autre', 4),
  ('Autres', 'Argent envoyé', 1), ('Autres', 'Cadeaux', 2),
  ('Autres', 'Loisirs extérieurs', 3), ('Autres', 'Autre', 4)
) as n(group_name, name, ord) on g.name = n.group_name
where not exists (
  select 1 from categories c where c.group_id = g.id and lower(trim(c.name)) = lower(n.name)
);

-- 3. Même jeu pour un nouveau compte (security invoker et search_path figé comme en 0003 ;
--    create or replace garde les droits d'exécution de 0002).
create or replace function seed_default_categories()
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare g_rev uuid; g_fix uuid; g_bouffe uuid; g_var uuid; g_autres uuid; g_ep uuid;
begin
  if exists (select 1 from groups where user_id = auth.uid()) then return; end if;

  insert into groups (name, kind, position) values ('Revenus', 'revenu', 0) returning id into g_rev;
  insert into groups (name, kind, position) values ('Fixes', 'depense', 1) returning id into g_fix;
  insert into groups (name, kind, position) values ('Bouffe', 'depense', 2) returning id into g_bouffe;
  insert into groups (name, kind, position) values ('Variables', 'depense', 3) returning id into g_var;
  insert into groups (name, kind, position) values ('Autres', 'depense', 4) returning id into g_autres;
  insert into groups (name, kind, position) values ('Épargne', 'epargne', 5) returning id into g_ep;

  insert into categories (group_id, name, default_planned_cents, position) values
    (g_rev, 'Transferts', 0, 0), (g_rev, 'Activités professionnelles', 0, 1), (g_rev, 'APL', 0, 2),
    (g_rev, 'Cash', 0, 3), (g_rev, 'Remboursement', 0, 4), (g_rev, 'Autre', 0, 5),
    (g_fix, 'Loyer', 56500, 0), (g_fix, 'Électricité', 6500, 1), (g_fix, 'Eau', 0, 2),
    (g_fix, 'Téléphone', 2000, 3), (g_fix, 'CTS', 2800, 4), (g_fix, 'Mutuelle', 2142, 5),
    (g_fix, 'Assurance habitation', 634, 6), (g_fix, 'Sobrio', 350, 7), (g_fix, 'Autre', 0, 8),
    (g_bouffe, 'Nourriture', 4000, 0), (g_bouffe, 'Resto', 0, 1),
    (g_bouffe, 'Bouffe avec des gens', 0, 2), (g_bouffe, 'Bouffe pas pour moi', 0, 3),
    (g_var, 'Laverie', 1200, 0), (g_var, 'Offrande', 1000, 1),
    (g_var, 'Autre groceries', 500, 2), (g_var, 'Selfcare', 500, 3),
    (g_var, 'Médicaments / médecin', 0, 4), (g_var, 'Habits', 0, 5),
    (g_var, 'Salon de coiffure', 0, 6), (g_var, 'Autre', 0, 7),
    (g_autres, 'Argent envoyé', 0, 0), (g_autres, 'Cadeaux', 0, 1),
    (g_autres, 'Loisirs extérieurs', 0, 2), (g_autres, 'Autre', 0, 3),
    (g_ep, 'Livret A', 0, 0), (g_ep, 'N26', 0, 1), (g_ep, 'Summeria', 0, 2), (g_ep, 'Kraken', 0, 3);

  insert into recurrences (category_id, label, amount_cents, day_of_month)
  select id, name, default_planned_cents, 1 from categories
  where user_id = auth.uid() and group_id = g_fix and default_planned_cents > 0;
end $$;

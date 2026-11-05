-- Plusieurs budgets par utilisateur (« comme changer de compte »).
-- Un budget = un espace complet : groupes, catégories, prévus, saisies, récurrences, ajustements, interrupteurs.
-- Le budget actif est gardé côté serveur (profiles.current_budget_id) : la RLS filtre chaque table
-- sur ce budget, et budget_id prend par défaut le budget actif. L'appli n'a donc rien à filtrer elle-même.

-- 1. Budgets et budget actif
create table budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index on budgets (user_id);

create table profiles (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  current_budget_id uuid references budgets on delete set null
);

alter table budgets enable row level security;
create policy "own rows" on budgets for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter table profiles enable row level security;
create policy "own rows" on profiles for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, insert, update, delete on budgets to authenticated;
grant select on profiles to authenticated; -- écrit seulement via les fonctions ci-dessous

create or replace function current_budget_id()
returns uuid language sql stable security invoker set search_path = public, pg_temp as $$
  select current_budget_id from profiles where user_id = auth.uid()
$$;

-- 2. Les données existantes vont dans un premier budget « Mon budget », par utilisateur.
insert into budgets (user_id, name)
select distinct user_id, 'Mon budget' from groups;
insert into profiles (user_id, current_budget_id)
select user_id, id from budgets;

do $$
declare t text;
begin
  foreach t in array array['groups','categories','planned_overrides','entries','entry_lines',
                           'recurrences','balance_adjustments','month_settings'] loop
    execute format('alter table %I add column budget_id uuid references budgets on delete cascade', t);
    execute format('update %I x set budget_id = b.id from budgets b where b.user_id = x.user_id', t);
    execute format('alter table %I alter column budget_id set not null', t);
    execute format('alter table %I alter column budget_id set default current_budget_id()', t);
    execute format('create index on %I (budget_id)', t);
    execute format('drop policy "own rows" on %I', t);
    execute format($p$create policy "own rows" on %I for all
                     using (user_id = (select auth.uid()) and budget_id = (select current_budget_id()))
                     with check (user_id = (select auth.uid()) and budget_id = (select current_budget_id()))$p$, t);
  end loop;
end $$;

-- 3. Unicités par budget (et non plus par utilisateur).
alter table balance_adjustments drop constraint balance_adjustments_user_id_month_key;
alter table balance_adjustments add constraint balance_adjustments_budget_id_month_key unique (budget_id, month);
alter table month_settings drop constraint month_settings_user_id_month_kind_key;
alter table month_settings add constraint month_settings_budget_id_month_kind_key unique (budget_id, month, kind);
create index on entries (budget_id, date);

-- 4. Premier lancement : le premier budget reçoit les catégories de l'Excel. Les budgets créés
--    ensuite partent vides (create_budget). generate_recurrences et replace_entry_lines restent
--    inchangées : en security invoker, la RLS les limite déjà au budget actif.
create or replace function seed_default_categories()
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare b uuid; g_rev uuid; g_fix uuid; g_bouffe uuid; g_var uuid; g_autres uuid; g_ep uuid;
begin
  if exists (select 1 from budgets where user_id = auth.uid()) then return; end if;

  insert into budgets (name) values ('Mon budget') returning id into b;
  perform set_current_budget(b);

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
  where group_id = g_fix and default_planned_cents > 0;
end $$;

-- Rend actif un budget de l'utilisateur (la RLS de budgets refuse ceux des autres).
create or replace function set_current_budget(p_budget_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from budgets where id = p_budget_id and user_id = auth.uid()) then
    raise exception 'Budget introuvable' using errcode = 'P0002';
  end if;
  insert into profiles (user_id, current_budget_id) values (auth.uid(), p_budget_id)
    on conflict (user_id) do update set current_budget_id = excluded.current_budget_id;
end $$;

-- Nouveau budget, vide sauf trois groupes (sans groupe, on ne peut pas créer de catégorie), puis actif.
create or replace function create_budget(p_name text)
returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare b uuid;
begin
  insert into budgets (name, position)
    values (trim(p_name), coalesce((select max(position) + 1 from budgets where user_id = auth.uid()), 0))
    returning id into b;
  perform set_current_budget(b);
  insert into groups (name, kind, position) values
    ('Revenus', 'revenu', 0), ('Dépenses', 'depense', 1), ('Épargne', 'epargne', 2);
  return b;
end $$;

-- Supprime un budget et tout son contenu (cascade). Refusé pour le dernier budget.
-- Renvoie les chemins des photos de tickets, que l'appli supprime ensuite du stockage.
create or replace function delete_budget(p_budget_id uuid)
returns text[] language plpgsql security definer set search_path = public, pg_temp as $$
declare paths text[]; next_id uuid;
begin
  if not exists (select 1 from budgets where id = p_budget_id and user_id = auth.uid()) then
    raise exception 'Budget introuvable' using errcode = 'P0002';
  end if;
  select id into next_id from budgets where user_id = auth.uid() and id <> p_budget_id order by position, created_at limit 1;
  if next_id is null then
    raise exception 'Impossible de supprimer le dernier budget' using errcode = '22023';
  end if;
  select coalesce(array_agg(receipt_path), '{}') into paths
    from entries where budget_id = p_budget_id and receipt_path is not null;
  if (select current_budget_id from profiles where user_id = auth.uid()) is not distinct from p_budget_id then
    update profiles set current_budget_id = next_id where user_id = auth.uid();
  end if;
  delete from budgets where id = p_budget_id;
  return paths;
end $$;

revoke execute on function current_budget_id(), set_current_budget(uuid), create_budget(text), delete_budget(uuid)
  from public, anon;
grant execute on function current_budget_id(), set_current_budget(uuid), create_budget(text), delete_budget(uuid)
  to authenticated;

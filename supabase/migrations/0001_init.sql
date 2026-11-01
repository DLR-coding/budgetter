-- Budget app : schéma initial.
-- Montants en centimes (integer). Un mois = premier jour du mois (date).
-- Chaque table porte user_id et la sécurité par ligne (RLS) ne laisse voir
-- à chacun que ses propres données.

create type group_kind as enum ('depense', 'revenu', 'epargne');
create type entry_source as enum ('manuel', 'formule', 'ticket', 'recurrence');

-- Groupes : Fixes, Variables, Bouffe, Revenus, Épargne...
create table groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  kind group_kind not null,
  position int not null default 0
);

-- Catégories : Loyer, Nourriture, Resto...
create table categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  group_id uuid not null references groups on delete restrict,
  name text not null,
  icon text,
  default_planned_cents int not null default 0,
  archived boolean not null default false,
  position int not null default 0
);

-- Prévu propre à un mois (remplace le prévu par défaut pour ce mois-là).
create table planned_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  category_id uuid not null references categories on delete cascade,
  month date not null check (extract(day from month) = 1),
  amount_cents int not null,
  unique (category_id, month)
);

-- Une saisie = un achat, un ticket, un revenu... composé d'une ou plusieurs lignes.
create table entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null default current_date,
  merchant text,
  note text,
  exceptional boolean not null default false,
  source entry_source not null default 'manuel',
  formula text,              -- la formule tapée, si source = 'formule'
  receipt_path text,         -- chemin de la photo dans le stockage, si source = 'ticket'
  recurrence_id uuid,
  created_at timestamptz not null default now()
);

create table entry_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  entry_id uuid not null references entries on delete cascade,
  category_id uuid not null references categories on delete restrict,
  label text,
  raw_label text,            -- texte brut lu sur le ticket (« OEUFS PA X30 »)
  quantity int not null default 1 check (quantity >= 1),
  unit_price_cents int not null,
  position int not null default 0
);

-- Charges récurrentes : loyer, CTS, mutuelle...
create table recurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  category_id uuid not null references categories on delete cascade,
  label text not null,
  amount_cents int not null,
  day_of_month int not null default 1 check (day_of_month between 1 and 28),
  active boolean not null default true,
  last_generated_month date
);

alter table entries add constraint entries_recurrence_fk
  foreign key (recurrence_id) references recurrences on delete set null;

-- Recalage du solde de départ d'un mois avec le solde bancaire réel.
create table balance_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  month date not null check (extract(day from month) = 1),
  balance_cents int not null,
  unique (user_id, month)
);

create index on entries (user_id, date);
create index on entry_lines (entry_id);
create index on entry_lines (category_id);

-- Vue pratique : une ligne par article, avec son mois et son montant total.
create view line_amounts with (security_invoker = true) as
select l.id, l.user_id, l.entry_id, l.category_id,
       date_trunc('month', e.date)::date as month,
       l.quantity * l.unit_price_cents as amount_cents,
       e.exceptional
from entry_lines l join entries e on e.id = l.entry_id;

-- Sécurité par ligne
do $$
declare t text;
begin
  foreach t in array array['groups','categories','planned_overrides','entries',
                           'entry_lines','recurrences','balance_adjustments'] loop
    execute format('alter table %I enable row level security', t);
    execute format($p$create policy "own rows" on %I for all
                     using (user_id = auth.uid()) with check (user_id = auth.uid())$p$, t);
  end loop;
end $$;

-- Génère les saisies des charges récurrentes jusqu'au mois donné (inclus).
-- Appelée par l'appli à l'ouverture : idempotente, ne crée jamais de doublon.
create or replace function generate_recurrences(up_to date default current_date)
returns int language plpgsql security invoker as $$
declare r recurrences; m date; n int := 0; eid uuid;
begin
  for r in select * from recurrences where user_id = auth.uid() and active loop
    m := coalesce(r.last_generated_month + interval '1 month', date_trunc('month', current_date))::date;
    while m <= date_trunc('month', up_to)::date loop
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

-- Crée les groupes et catégories de départ, repris de ton Excel 2026.
-- Appelée une seule fois par l'appli, au premier lancement.
create or replace function seed_default_categories()
returns void language plpgsql security invoker as $$
declare g_rev uuid; g_fix uuid; g_bouffe uuid; g_var uuid; g_ep uuid;
begin
  if exists (select 1 from groups where user_id = auth.uid()) then return; end if;

  insert into groups (name, kind, position) values ('Revenus', 'revenu', 0) returning id into g_rev;
  insert into groups (name, kind, position) values ('Fixes', 'depense', 1) returning id into g_fix;
  insert into groups (name, kind, position) values ('Bouffe', 'depense', 2) returning id into g_bouffe;
  insert into groups (name, kind, position) values ('Variables', 'depense', 3) returning id into g_var;
  insert into groups (name, kind, position) values ('Épargne', 'epargne', 4) returning id into g_ep;

  insert into categories (group_id, name, default_planned_cents, position) values
    (g_rev, 'Transferts', 0, 0), (g_rev, 'Activités professionnelles', 0, 1), (g_rev, 'APL', 0, 2),
    (g_rev, 'Cash', 0, 3), (g_rev, 'Remboursement', 0, 4), (g_rev, 'Autre', 0, 5),
    (g_fix, 'Loyer', 56500, 0), (g_fix, 'Électricité', 6500, 1), (g_fix, 'Eau', 0, 2),
    (g_fix, 'Téléphone', 2000, 3), (g_fix, 'CTS', 2800, 4), (g_fix, 'Mutuelle', 2142, 5),
    (g_fix, 'Assurance habitation', 634, 6), (g_fix, 'Sobrio', 350, 7),
    (g_bouffe, 'Nourriture', 4000, 0), (g_bouffe, 'Resto', 0, 1),
    (g_bouffe, 'Bouffe avec des gens', 0, 2), (g_bouffe, 'Bouffe pas pour moi', 0, 3),
    (g_var, 'Laverie', 1200, 0), (g_var, 'Offrande', 1000, 1),
    (g_var, 'Autre groceries', 500, 2), (g_var, 'Selfcare', 500, 3),
    (g_ep, 'Livret A', 0, 0), (g_ep, 'N26', 0, 1), (g_ep, 'Summeria', 0, 2), (g_ep, 'Kraken', 0, 3);

  insert into recurrences (category_id, label, amount_cents, day_of_month)
  select id, name, default_planned_cents, 1 from categories
  where user_id = auth.uid() and group_id = g_fix and default_planned_cents > 0;
end $$;

-- Photos de tickets : bucket privé, chaque utilisateur dans son dossier.
insert into storage.buckets (id, name, public) values ('receipts', 'receipts', false)
  on conflict do nothing;
create policy "own receipts" on storage.objects for all
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

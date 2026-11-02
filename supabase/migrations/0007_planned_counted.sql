-- Interrupteurs « Compter le prévu » : pour le mois en cours et les mois futurs, une catégorie compte
-- son prévu si l'interrupteur du mois (revenus ou dépenses) ET celui de la catégorie sont activés,
-- sinon son réel. La règle de calcul est dans mobile/src/lib/budget.ts (summarizeMonths).

-- Interrupteur par catégorie et par mois, sur la ligne du prévu propre au mois.
-- amount_cents null = le mois garde le prévu par défaut (ligne créée seulement pour l'interrupteur).
alter table planned_overrides alter column amount_cents drop not null;
alter table planned_overrides add column counted boolean not null default true;

-- Interrupteur d'ensemble du mois, pour les revenus ou pour les dépenses. Pas de ligne = activé.
create table month_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  month date not null check (extract(day from month) = 1),
  kind text not null check (kind in ('revenu', 'depense')),
  planned_counted boolean not null default true,
  unique (user_id, month, kind)
);

alter table month_settings enable row level security;
create policy "own rows" on month_settings for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, insert, update, delete on month_settings to authenticated;

-- L'ajustement du solde redevient un solde de début de mois (« Départ »), sans date :
-- la règle de 0006 (ajustement daté du jour J) est abandonnée.
alter table balance_adjustments drop column adjusted_on;

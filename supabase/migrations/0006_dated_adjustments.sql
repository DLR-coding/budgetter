-- Ajustement du solde daté : un recalage fait le 15 inclut déjà les saisies du 1er au 15.
-- adjusted_on = dernier jour déjà compté dans le solde saisi ; NULL = début de mois (comme avant).
-- La règle de calcul est dans mobile/src/lib/budget.ts (summarizeMonths).

alter table balance_adjustments add column adjusted_on date;
alter table balance_adjustments add constraint balance_adjustments_adjusted_on_in_month
  check (adjusted_on is null or date_trunc('month', adjusted_on)::date = month);

-- Ajoute le jour de la saisie (colonne `date`) à la fin : les colonnes existantes ne bougent pas.
create or replace view line_amounts with (security_invoker = true) as
select l.id, l.user_id, l.entry_id, l.category_id,
       date_trunc('month', e.date)::date as month,
       l.quantity * l.unit_price_cents as amount_cents,
       e.exceptional,
       e.date
from entry_lines l join entries e on e.id = l.entry_id;

-- create or replace view conserve les droits de 0002 ; redit par sécurité (sans effet s'ils existent).
grant select on line_amounts to authenticated;

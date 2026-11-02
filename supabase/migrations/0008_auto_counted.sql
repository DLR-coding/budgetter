-- Interrupteur « Compter le prévu » d'une catégorie : automatique tant qu'on n'y a pas touché.
-- counted null = automatique (prévu compté tant que le réel ne dépasse pas le prévu) ;
-- true / false = choix manuel, qui l'emporte (on peut recompter le prévu malgré un dépassement).
-- La règle de calcul est dans mobile/src/lib/budget.ts (categoryCounted).

alter table planned_overrides alter column counted drop not null;
alter table planned_overrides alter column counted set default null;
-- Jusqu'ici, true était la valeur par défaut, jamais un choix explicite : repasse en automatique.
update planned_overrides set counted = null where counted;

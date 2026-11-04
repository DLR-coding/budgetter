# Budget — appli Android perso

Remplace un fichier Excel de budget. Usage personnel, un seul utilisateur, Android.
Toute l'interface est en français.

## Stack (décidée, ne pas changer sans demander)

- **Expo (React Native) + Expo Router + TypeScript strict**, dans `mobile/`.
- **Styles : `StyleSheet.create` + jetons de `mobile/src/theme.ts`.** Pas de NativeWind,
  pas de couleur en dur dans les écrans : toujours `colors.*`, `radius.*`, `font.*`.
- Les effets visuels spéciaux (verre, etc.) vivent dans des composants isolés
  (ex. `src/components/GlassTabBar.tsx`). Plus tard possiblement avec React Native Skia.
- **Supabase** (Postgres + Auth + Storage). Schéma : `supabase/migrations/`.
  Toute modification de schéma = nouvelle migration numérotée, jamais d'édition de `0001`.
- **Edge Function `supabase/functions/parse-receipt`** : lecture de tickets par un modèle de vision servi par
  LiteLLM (API compatible OpenAI ; secrets `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`).
  La clé API reste côté serveur.

## Design

Maquettes de référence : `docs/maquettes/` (exports PNG du canevas Claude Design).
Toujours s'y conformer avant d'inventer une mise en page.

- Fond noir `#0B0C0E`, cartes `#16181B`, bordures fines `#26292E`, grands arrondis (22 px).
- Accent **bleu nuit** `#2F52AE` (boutons, « + », barres) ; `#6F8FDB` pour texte/icônes d'accent.
- Revenus en **vert calme** `#8CCBA5` ; dépassements et « à vérifier » en **orange** `#FF9E57`.
- Navbar flottante en verre (flou + translucide), bouton « + » rond séparé à droite.
- Police Inter. Apostrophes typographiques (’) et guillemets « » dans les textes affichés.

## Modèle de données (voir la migration)

`groups` → `categories` (prévu par défaut) → `planned_overrides` (prévu propre à un mois).
Une **saisie** (`entries`) = un achat/ticket/revenu, composée de **lignes** (`entry_lines`) :
libellé, quantité, prix unitaire, catégorie. Une dépense simple = 1 ligne.
`recurrences` (charges fixes générées chaque mois), `balance_adjustments` (recalage du solde).
**Tous les montants en centimes (int).**

## Règles métier (validées avec l'utilisateur)

- Chaque mois a son prévu par catégorie. Un dépassement ou une économie **ne se reporte jamais**
  sur les mois suivants.
- Mois passés : on compte toujours le réel. Mois en cours et futurs : chaque catégorie compte son
  prévu (exactement, même si le réel est plus petit ou plus grand) si elle est « comptée », sinon son réel.
  Comptée = interrupteur « Compter le prévu » d’ensemble du mois (revenus ou dépenses, écran Mois,
  activé par défaut) ET interrupteur de la catégorie pour ce mois (Détail catégorie). Celui de la
  catégorie est automatique tant qu’on n’y touche pas : activé, désactivé dès que le réel dépasse le
  prévu ; un choix manuel l’emporte. Tables `month_settings` et `planned_overrides.counted` (null = auto).
- Correspondance avec l’Excel : montant compté d’une catégorie = sa cellule ; gros montant des cards
  Dépenses / Revenus = « Dépenses totales » / « Revenu total » ; solde projeté = « Solde final projeté »
  = Départ + Revenus − Dépenses, vérifiable à la main depuis l’écran Mois.
- Solde de départ (« Départ ») = ajustement du mois s'il existe — solde en **début de mois**, avant
  toute saisie —, sinon solde final du mois précédent.
- L’écran Mois et la projection lisent uniquement `summarizeMonths` : aucun calcul de solde parallèle.
- « Jusqu’à quand je tiens » = dernier mois dont le solde projeté reste ≥ 0.
- Saisie : **montant simple par défaut**. Une formule `(12+2+1.55+(5*2.99))` est acceptée
  (mode avancé, jamais imposé) et devient plusieurs lignes ; `5*2.99` = quantité 5 × 2,99.
- Une dépense peut être marquée « exceptionnelle » (exclue du total « sans imprévus »).

La logique pure est dans `src/lib/budget.ts` et `src/lib/formula.ts` : la garder sans
dépendance à React ni Supabase, et la couvrir de tests.

## Feuille de route

- [x] Étape 0 : stack, schéma, logique testée, écran Mois, saisie de base
- [ ] Étape 1 : saisie rapide complète (pavé numérique, mode plusieurs articles),
      écran Saisies (liste par jour, recherche, filtres), détail d’une saisie (modifier/supprimer)
- [ ] Étape 2 : Réglages (catégories, prévus, récurrences), Ajuster le solde, écran Projection
- [ ] Étape 3 : scan de ticket (photo → Edge Function → écran de validation)
- [ ] V1 : import de l’historique Excel, mémorisation des catégories par commerçant

## Commandes (dans `mobile/`)

- `npm run typecheck` (= `npx tsc --noEmit`), `npm test` (runner intégré `node --test`,
  TS lu nativement par Node 24 : importer avec l'extension `./budget.ts`), `npx expo-doctor`.
- Ajouter un paquet : toujours `npx expo install <paquet>` (versions compatibles SDK).
- Expo **SDK 58** : les onglets JS viennent de `expo-router/js-tabs` (plus de `@react-navigation`).

## Environnement

- Développement sous **WSL (Debian)**. Le téléphone Android utilise Expo Go :
  lancer avec `npx expo start --tunnel` (le réseau WSL n’est pas joignable directement).
- Variables dans `mobile/.env` (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`).
  Ne jamais committer `.env`.

## Façon de travailler

- Avant de coder une étape : proposer un plan court, attendre validation.
- Après chaque changement : `npx tsc --noEmit` et les tests doivent passer.
- Commits petits et explicites, en français.

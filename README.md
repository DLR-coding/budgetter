# Budget — appli Android

Remplace le fichier Excel de budget : saisie rapide (montant, formule ou ticket scanné),
prévu vs réel par catégorie, charges récurrentes, et « jusqu'à quand je tiens ».

## Stack

| Brique | Rôle |
|---|---|
| **Expo (React Native) + Expo Router** | L'appli Android. Installée en APK directement sur le téléphone. |
| **Supabase** (Postgres + Auth + Storage) | Base de données, sauvegarde, photos des tickets. Offre gratuite suffisante. |
| **Supabase Edge Function `parse-receipt`** | Envoie la photo du ticket à LiteLLM. La clé API reste côté serveur. |
| **LiteLLM (modèle de vision, ex. Qwen3.5)** | Lit le ticket et classe chaque article dans tes catégories. |

## Contenu

```
supabase/
  migrations/0001_init.sql        schéma, sécurité RLS, catégories de l'Excel, récurrences
  functions/parse-receipt/        lecture des tickets par LiteLLM (étape 3)
mobile/
  app/                            écrans (Expo Router)
    _layout.tsx                   connexion + premier lancement
    (tabs)/index.tsx              écran Mois (branché sur les vraies données)
    (tabs)/saisies.tsx            à construire
    (tabs)/reglages.tsx           à construire
    saisie.tsx                    saisie rapide (montant ou formule)
  src/lib/formula.ts              « (12+2+5*2,99) » -> articles
  src/lib/*.test.ts               tests de la logique (`npm test`)
  src/lib/budget.ts               prévu / réel, soldes, projection
  src/lib/data.ts                 lecture / écriture Supabase
  src/components/GlassTabBar.tsx  navbar en verre + bouton « + »
  src/theme.ts                    couleurs et typo des maquettes
```

## Mise en route (une seule fois, ~30 min)

### 1. Supabase
1. Crée un compte et un projet sur supabase.com (région Europe).
2. **SQL Editor** → colle le contenu de `supabase/migrations/0001_init.sql` → *Run*.
3. **Authentication → Users → Add user** : ton e-mail + un mot de passe (coche *Auto confirm*).
4. **Project Settings → API** : note l'URL du projet et la clé `anon`.

### 2. L'appli
Prérequis : Node.js 24 (`nvm use` dans `mobile/`) et l'appli **Expo Go** (SDK 58) sur ton
téléphone Android.

```bash
cd mobile
npm install
cp .env.example .env   # puis remplis l'URL et la clé anon de l'étape 1.4
npx expo start --tunnel   # --tunnel : le réseau WSL n'est pas joignable depuis le téléphone
```

Scanne le QR code avec Expo Go : l'appli s'ouvre sur ton téléphone. Connecte-toi
avec le compte créé à l'étape 1.3. Tes catégories de l'Excel et tes charges fixes
sont créées automatiquement au premier lancement.

### 3. Ton solde de départ
En attendant l'écran « Ajuster le solde » (étape 2) : dans Supabase,
**Table Editor → balance_adjustments → Insert row**, avec `month` = premier jour du
mois en cours (ex. `2026-11-01`) et `balance_cents` = ton solde actuel en centimes
(ex. `152343` pour 1 523,43 €).

### 4. Installer l'APK (quand tu veux te passer d'Expo Go)
```bash
npm i -g eas-cli && eas login
eas build -p android --profile preview
```
EAS te donne un lien vers un fichier `.apk` à installer sur le téléphone.

### 5. Lecture des tickets (étape 3)
```bash
npx supabase secrets set LLM_BASE_URL=https://<proxy-litellm> LLM_API_KEY=<clé> LLM_MODEL=Qwen/Qwen3.5-35B-A3B
npx supabase functions deploy parse-receipt
```

### Vérifier (dans `mobile/`)
```bash
npm run typecheck   # tsc --noEmit
npm test            # node --test, sans dépendance
```

## Règles de calcul (validées)

- Chaque mois a son **prévu** par catégorie : le prévu par défaut, ou une valeur propre au mois.
- Un dépassement ou une économie **ne se reporte jamais** sur les mois suivants.
- Mois passés : on compte le **réel**. Mois en cours et futurs : on compte le **prévu**.
- Solde de départ = l'**ajustement** saisi pour ce mois s'il existe, sinon le solde final du mois précédent.
- Tous les montants sont stockés en **centimes** (pas d'erreurs d'arrondi).

## Feuille de route

- [x] **Étape 0** : stack, base de données, logique de calcul testée, écran Mois, saisie de base
- [ ] **Étape 1** : saisie rapide complète (pavé, plusieurs articles), écran Saisies, détail d'une saisie
- [ ] **Étape 2** : réglages (catégories, prévus, récurrences), ajuster le solde, projection
- [ ] **Étape 3** : scan de ticket + validation
- [ ] **V1** : import de l'historique Excel, mémorisation des catégories par commerçant

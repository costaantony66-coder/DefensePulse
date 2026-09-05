# Defense Pulse

Application de veille défense (PWA) : agrège plusieurs flux RSS, propose une
lecture in-app, des favoris, une recherche, un filtrage par mots-clés
détectés automatiquement, et un « briefing IA » (analyse fréquentielle des
thèmes dominants, calculée localement, sans appel à un LLM).

## Ce qui a changé par rapport à ta version

Ta version originale interrogeait `rss2json.com` **depuis le téléphone**,
à chaque ouverture de l'app. Ça marche, mais :
- c'est dépendant d'un service tiers gratuit (quotas, fiabilité incertaine) ;
- ça ne se met à jour que quand tu ouvres l'app (pas de vraie automatisation) ;
- pas de vrai mode hors-ligne (les flux ne sont jamais mis en cache).

Nouvelle architecture :

```
Toutes les 20 min ──▶ GitHub Actions ──▶ interroge les flux RSS directement
                                      ──▶ écrit data/latest.json
                                      ──▶ commit + push automatique
                                              │
                                              ▼
                                    GitHub Pages republie le site
                                              │
                                              ▼
                        Ton téléphone lit data/latest.json (statique, rapide,
                        met en cache localement, aucune clé d'API requise)
```

L'app ne fait donc plus **aucun** appel réseau vers les flux RSS eux-mêmes :
c'est une GitHub Action qui s'en charge en arrière-plan, en continu, que
l'app soit ouverte ou non. Le bouton « actualiser » recharge simplement le
fichier `data/latest.json` le plus récent.

## Structure du dépôt

```
index.html                       → l'application (interface + logique)
manifest.json                    → métadonnées PWA (icône, nom, couleurs)
service-worker.js                → cache hors-ligne
feeds.config.json                → liste des flux RSS (SEULE source de vérité)
data/latest.json                 → dépêches pré-générées (écrit par l'Action)
scripts/fetch-feeds.mjs          → script Node qui interroge les flux RSS
package.json                     → dépendance npm du script (rss-parser)
.github/workflows/update-feeds.yml → l'automatisation (cron GitHub Actions)
```

## Installation, étape par étape

### 1. Créer le dépôt GitHub

1. Va sur [github.com/new](https://github.com/new).
2. Choisis un nom (ex. `defense-pulse`), et **visibilité "Public"**.
   > Important : les dépôts publics ont des minutes GitHub Actions
   > **illimitées et gratuites**, et GitHub Pages gratuit ne fonctionne
   > qu'avec un dépôt public sur un compte personnel classique. Un dépôt
   > privé a un quota mensuel d'Actions limité (2 000 min/mois) qu'une synchro
   > toutes les 20 min consomme presque entièrement.
3. Ne coche aucune option d'initialisation (pas de README auto).

### 2. Envoyer les fichiers

Sur ton ordinateur, dans le dossier contenant tous ces fichiers :

```bash
git init
git add .
git commit -m "Initial commit — Defense Pulse"
git branch -M main
git remote add origin https://github.com/<ton-utilisateur>/<ton-repo>.git
git push -u origin main
```

(Tu peux aussi passer par l'interface web de GitHub : "Add file" →
"Upload files", en conservant l'arborescence des dossiers `.github/`,
`scripts/` et `data/`.)

### 3. Autoriser l'Action à publier ses mises à jour

Par défaut, GitHub interdit à une Action d'écrire dans le dépôt. Il faut
l'autoriser une seule fois :

1. Dans ton dépôt → **Settings** → **Actions** → **General**.
2. Descends jusqu'à **"Workflow permissions"**.
3. Sélectionne **"Read and write permissions"**.
4. Clique **Save**.

### 4. Activer GitHub Pages

1. **Settings** → **Pages**.
2. Sous "Build and deployment" → Source : **"Deploy from a branch"**.
3. Branch : **`main`**, dossier **`/ (root)`**.
4. Sauvegarde. Ton URL sera du type :
   `https://<ton-utilisateur>.github.io/<ton-repo>/`
   (l'activation prend 1 à 2 minutes la première fois).

### 5. Lancer la première synchronisation

Le fichier `data/latest.json` fourni est vide (il attend la première
exécution). Pour ne pas attendre le cron automatique :

1. Va dans l'onglet **Actions** de ton dépôt.
2. Clique sur le workflow **"Mise à jour des flux"** dans la liste à gauche.
3. Clique **"Run workflow"** → **Run workflow** (bouton vert).
4. Attends ~30 secondes, rafraîchis : un commit automatique
   `chore: mise à jour automatique des flux` doit apparaître.

Après ça, le site publié sur GitHub Pages contient déjà des dépêches.

### 6. Installer l'app sur ton téléphone

1. Ouvre `https://<ton-utilisateur>.github.io/<ton-repo>/` dans Chrome
   (Android) ou Safari (iPhone).
2. **Android/Chrome** : menu ⋮ → "Ajouter à l'écran d'accueil" (ou une
   bannière d'installation apparaît automatiquement).
3. **iPhone/Safari** : bouton Partager → "Sur l'écran d'accueil".
4. L'icône apparaît comme une vraie app, plein écran, sans barre d'adresse.

## Fréquence de mise à jour

Le cron est réglé sur `*/20 * * * *` (toutes les 20 minutes) dans
`.github/workflows/update-feeds.yml`. Pour changer la fréquence, modifie
cette ligne, par exemple :

- `*/10 * * * *` → toutes les 10 min (plus réactif, consomme plus de minutes
  Actions — reste gratuit et illimité sur un dépôt **public**)
- `0 * * * *` → toutes les heures (le plus économe)

⚠️ GitHub n'exécute pas toujours le cron pile à l'heure prévue sous forte
charge de la plateforme : un délai de quelques minutes est normal.

## Ajouter, retirer ou modifier une source RSS

Édite uniquement **`feeds.config.json`** :

```json
{
  "key": "identifiant_court_unique",
  "label": "Nom affiché dans l'app",
  "url": "https://exemple.fr/feed/"
}
```

Ajoute une entrée au tableau, commit, push. Le prochain passage de l'Action
(ou un déclenchement manuel via "Run workflow") récupère automatiquement
la nouvelle source — **aucune modification de `index.html` n'est
nécessaire**, les onglets et couleurs de l'app sont générés dynamiquement
à partir de ce fichier.

Pour trouver l'URL du flux RSS d'un site : cherche un lien "RSS" en bas de
page, ou essaie `https://lesite.fr/feed/` ou `.../rss.xml` (formats les
plus courants).

## Debug / vérifications utiles

- **La synchro échoue en silence pour une source** : regarde les logs de
  l'Action (onglet Actions → dernier run → étape "Récupération des flux
  RSS"). Le script affiche `OK` ou `ECHEC` par source ; en cas d'échec, il
  conserve automatiquement les derniers articles connus pour ne pas vider
  la catégorie.
- **Le site ne se met pas à jour après un commit de l'Action** : GitHub
  Pages peut mettre 1 à 2 minutes à republier, et le CDN de Pages peut
  garder une version en cache quelques minutes de plus. Le bouton
  "actualiser" de l'app force un rechargement sans cache (`cache: no-store`)
  côté navigateur, mais ne peut pas contourner un éventuel cache CDN
  en amont.
- **Le service worker sert une vieille version de l'app après une mise à
  jour d'`index.html`** : c'est le comportement normal des service workers
  (mise à jour en arrière-plan, effective au prochain lancement). Un
  changement de `CACHE_VERSION` dans `service-worker.js` force le
  renouvellement du cache si besoin.

## Notes de conception

- Le script `scripts/fetch-feeds.mjs` tourne côté serveur (GitHub Actions),
  donc sans restriction CORS — c'est ce qui permet de se passer entièrement
  de `rss2json.com`.
- Chaque flux est limité à 40 articles et l'ensemble à 300 articles, pour
  garder `data/latest.json` léger et l'app rapide à charger sur mobile.
- Le "briefing IA" reste un calcul 100% local (fréquence de mots-clés
  pondérée par un lexique métier défense) : aucune donnée n'est envoyée à
  un service externe.

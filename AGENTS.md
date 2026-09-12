# Profil pi : power-dev

## Git

Format des commits : `<type>[(scope)][!]: <description>`, corps et footers
séparés par une ligne vide.

Types : `feat` (MINOR) · `fix` (PATCH) · `refactor` · `test` · `docs` · `ci` ·
`chore` · `perf` · `build`.
Breaking change : `!` après le type/scope **ou** footer `BREAKING CHANGE:`
(MAJOR, sensible à la casse).
Référence : https://www.conventionalcommits.org/en/v1.0.0/

Gitflow : branches `feature/*`, `fix/*`, `release/*` depuis `develop`, merge
vers `main` à la release. Ne **jamais** merge en fast-forward, toujours
`--no-ff`.

## RTK — Rust Token Killer

Proxy CLI optimisé tokens (60-90 % d'économie sur les opérations de dev).

Méta-commandes, à taper telles quelles :

```bash
rtk gain              # Analytics des économies de tokens
rtk gain --history    # Historique des commandes avec économies
rtk discover          # Repère les opportunités manquées
rtk proxy <cmd>       # Exécute une commande brute sans filtrage (debug)
```

Toutes les autres commandes sont réécrites automatiquement par
`extensions/rtk.ts` : `git status` devient `rtk git status` avant exécution.
Aucun préfixe à taper à la main. `rtk hook check "<cmd>"` montre la
réécriture sans l'appliquer.

⚠ Collision de nom : si `rtk gain` échoue, c'est probablement
reachingforthejack/rtk (Rust Type Kit) qui est installé à la place.

## Commandes Bash

Préférer ces outils aux équivalents par défaut. Fallback silencieux si absent.

- **Recherche de contenu** : `rg` plutôt que `grep`
- **Recherche de fichiers** : `fd` plutôt que `find`
- **JSON** : `jq` pour tout parsing, filtrage ou transformation
- **YAML/TOML** : `yq`
- **GitHub** : `gh` pour PRs, issues, reviews, CI, releases. Ne pas scraper
  github.com ni taper l'API REST quand `gh` suffit.
- **GitLab** : `glab` pour MRs, issues, reviews, CI, releases. Idem.

## Workflow agents

- **Invoquer `/skill:using-superpowers` en début de session** pour toute
  demande de développement, fonctionnalité ou implémentation ; pas pour une
  question simple.
- Pour toute tâche non triviale (3+ étapes ou décision d'architecture),
  commencer par `/skill:brainstorming`. pi n'a pas de plan mode : la
  discipline vient du skill, pas du harness.
- **Vérifier dans le navigateur** (`/skill:playwright-cli`) sur **toute** US
  à incidence UI.
- Toujours terminer une tâche de code par `/simplify`, puis
  `/skill:ponytail-review`, puis appliquer les ajustements.

## Orchestration

- Si ça dérape, STOP et re-planifier immédiatement — ne pas s'acharner.
- Écrire des specs détaillées en amont pour réduire l'ambiguïté.
- Utiliser l'outil `subagent` librement pour garder le contexte principal
  propre : déléguer recherche, exploration et analyse parallèle. Les agents
  disponibles sont définis dans `agents/`.
- Après TOUTE correction de l'utilisateur : noter le pattern dans
  `tasks/lessons.md` et écrire une règle pour soi-même.
- Ne jamais marquer une tâche comme terminée sans prouver qu'elle fonctionne :
  lancer les tests, vérifier les logs, démontrer la correction.
- Pour les changements non triviaux : se demander « existe-t-il une façon plus
  élégante ? ». Sauter cette étape pour les fixes simples et évidents.

## Principes

- **Simplicité d'abord** : rendre chaque changement aussi simple que possible.
- **Pas de paresse** : trouver les causes racines. Pas de fix temporaire.
- **Impact minimal** : ne toucher que le nécessaire.

## Langue

Répondre en anglais. Termes techniques et identifiants de code restent tels
quels.

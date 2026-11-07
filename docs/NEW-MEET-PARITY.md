# New Meet — audit de parité AppDeploy V6 → Netlify (prévisualisation)

Source de référence : application AppDeploy `fondvideo-meet-preview-lt48b2`, version `v6` du 7 novembre 2026 (snapshot `1794081317651`).

Destination : dépôt `nathsrb/fondvideo-new-meet-netlify`, branche `preview/new-meet-appdeploy-parity` dérivée de `preview/captions-whisper-large-v3`. **Ne pas merger vers main sans tests.**

## Résultat de la comparaison des sources

Le transfert initial des principaux fichiers avait déjà été effectué dans `main` :
- `src/App.tsx` : réunions, permissions caméra/micro, WebRTC pair-à-pair, signalisation, chat, modération, partage d'écran, détection de l'intervenant actif, enregistrement audio/vidéo, bibliothèque d'enregistrements, Google Drive.
- `src/index.css` : interface et responsive mobile.
- `src/live-background.ts` : pipeline de traitement caméra, détourage et fonds.
- `src/recording-library.ts` : **identique** à la V6 AppDeploy.
- `fondvideo.html` et `src/fondvideo/*` : studio vidéo, amélioré dans la V3 Netlify avec Groq.
- `netlify/functions/api.mts` et `src/netlify-transport.ts` : adaptation du backend AppDeploy.

Comparaison ligne à ligne : sur `src/App.tsx`, seulement 14 lignes non vides de la V6 n'existent pas textuellement dans Netlify ; la plupart correspondent à des adaptations de comportement, de libellés ou de méthodes d'enregistrement. Netlify comporte aussi des ajouts (importation de vidéos dans la bibliothèque, affichage « remplir l'écran », options de partage iOS). **Cela ne remplace pas un test fonctionnel.**

## Différences d'infrastructure à prendre en compte

| AppDeploy | Netlify | Conséquence |
| --- | --- | --- |
| `@appdeploy/client` + WebSocket | `src/netlify-transport.ts` avec polling | Les notifications et la négociation WebRTC passent par des requêtes périodiques, avec latence et consommation de quotas Netlify |
| `@appdeploy/sdk` + `db` + `ws` | Netlify Functions + Netlify Blobs (`getDeployStore`) | Les salles et événements sont isolés par déploiement ; ne pas mélanger les URLs de prévisualisation entre participants |
| `secrets.readSecret('GOOGLE_OAUTH_CLIENT_ID')` | Variable Netlify `GOOGLE_OAUTH_CLIENT_ID` | **Pas configurée dans Deploy previews lors de l'audit** ; la connexion Drive n'est pas opérationnelle automatiquement |
| STUN Google uniquement | STUN Google uniquement | Certains réseaux NAT symétriques/mobiles nécessitent un **relais TURN** pour une vraie fiabilité |
| Studio Whisper local | Studio Whisper Large V3 via Groq (prévisualisation V3) | `GROQ_API_KEY` est présente uniquement dans le contexte Deploy previews |

## Corrections apportées ici

1. `index.html` : la page principale affiche désormais **New Meet**, au lieu de rediriger silencieusement vers `fondvideo.html`. Le studio reste accessible depuis la navigation.
2. `scripts/meet-smoke.mjs` : test API volontairement limité aux URLs `deploy-preview-*--fondvideo-new-meet-preview.netlify.app` (ou permalinks de déploiement). Il vérifie : healthcheck, double adhésion, host, chat, signalisation, modération, sortie.
3. `npm run test:meet-preview` : commande de validation du backend, **sans modifier la production**.

Pour lancer le test avec accès HTTP :

```bash
MEET_BASE_URL=https://deploy-preview-2--fondvideo-new-meet-preview.netlify.app npm run test:meet-preview
```

## Matrice de validation restante

- [ ] Build Netlify sur PR de la branche de parité.
- [ ] Exécution réelle du script de smoke test sur l'URL de déploiement.
- [ ] Connexion de deux navigateurs/appareils à **la même URL de déploiement** et à la même salle : caméra et microphone dans les deux sens.
- [ ] Vérification du partage d'écran depuis ordinateur et du comportement compatible iPhone.
- [ ] Vérification de la caméra frontale, du mode portrait et des effets de fond.
- [ ] Vérification d'un enregistrement local (vidéo et audio), lecture, téléchargement et partage iPhone.
- [ ] Vérification du mode intervenant actif lors d'un enregistrement à plusieurs.
- [ ] Configuration de `GOOGLE_OAUTH_CLIENT_ID` dans les Deploy previews, autorisation de l'origine correspondante dans Google Cloud, test OAuth et upload de fichier volumineux.
- [ ] Mise en place d'un service TURN avec identifiants temporaires pour permettre les appels sur réseaux restrictifs.
- [ ] Durcissement des accès aux flux de signalisation et nettoyage des données de salles, avant usage de production.

## Points de prudence

La compilation réussie prouve que le code est compilable, **pas** que les appels WebRTC fonctionnent de bout en bout. Sans relais TURN et sans test à deux appareils, ne pas qualifier la migration de « complètement fonctionnelle ». Garder AppDeploy V6 et la production Netlify intacts pendant l'intégration.

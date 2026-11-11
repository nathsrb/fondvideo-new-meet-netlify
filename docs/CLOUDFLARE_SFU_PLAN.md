# SCELYO — préparation Cloudflare Realtime SFU

Statut : préparation uniquement. Aucune intégration SFU active, aucun compte Cloudflare lié, aucun service provisionné. Ne pas déployer en production.

## Objectif
- Conserver Netlify pour l'application et les exports Google Drive.
- Conserver WebRTC P2P pour les appels de 2 à 4 personnes.
- Utiliser Cloudflare Realtime SFU pour les réunions de 5 participants et plus, après vérification de la compatibilité et des quotas du compte.
- Limiter à trois vidéos souscrites par invité (intervenant principal et deux autres), tout en permettant une mosaïque complète à l'organisateur si la bande passante le permet.
- Ne jamais assimiler l'organisateur à l'intervenant actif. La vidéo enregistrée doit suivre l'intervenant sélectionné / actif, avec les voix de tous les participants autorisés.
- Préserver la musique et l'audio existants ; ne pas séparer leurs pistes sans demande explicite.
- Ne jamais exposer les jetons/secrets Cloudflare dans le bundle client.

## Prérequis externes non réalisés
1. Connexion au compte Cloudflare par son propriétaire et vérification des offres Realtime SFU / TURN, conditions de facturation et quotas actuels.
2. Création des ressources et identifiants Cloudflare nécessaires, côté serveur uniquement.
3. Configuration des secrets dans l'environnement de prévisualisation et non dans GitHub.
4. Déploiement d'un composant de signalisation/authentification temps réel adapté (Workers ou autre), avec contrôle d'accès aux réunions.
5. Vérification du coût et du comportement TURN ; mise en place d'alertes et de limites avant facturation.

## Travail Codex
1. Auditer src/App.tsx, src/netlify-transport.ts et les Netlify Functions de signalisation ; documenter les événements existants, les rôles et le cycle de vie d'une réunion.
2. Créer une abstraction de transport (P2P / SFU) sans modifier le rendu Live, le Studio, Vault ou Google Drive.
3. Gérer la transition à partir du cinquième participant avec reconnexion/renégociation contrôlée, sans déconnecter les participants existants ni perdre les pistes audio.
4. Abonnements sélectifs aux vidéos côté SFU : maximum trois pour un invité ; la voix de chaque participant doit rester audible indépendamment des caméras visibles. Adapter la qualité aux réseaux mobiles.
5. Ne pas prétendre que le simple masquage de caméras réduit le trafic : vérifier les flux réellement souscrits.
6. Conserver le fonctionnement actuel d'enregistrement local. Tester sur iPhone Chrome et Safari : enregistrer A puis B puis A, en gardant les voix et la synchronisation. Corriger seulement si le test échoue.
7. Prévoir un repli explicite si le SFU est indisponible : message clair, sans retour silencieux à un mesh de 20 personnes.
8. Réduire les appels de polling Netlify pendant les réunions et vérifier qu'aucune boucle n'entraîne des coûts excessifs.
9. Tests unitaires et de charge : 2, 4, 5 et 20 participants ; réunions longues ; bascule de rôle ; coupure réseau ; iPhone ; enregistrement et export Google Drive.
10. Documenter les coûts, quotas, configuration et procédure de retour arrière. Ne pas déployer en production avant validation humaine.

## Sécurité et coût
- Secrets et clés uniquement côté serveur.
- Authentification et autorisations pour rejoindre/publier/souscrire.
- Consentement et indication claire lors des enregistrements.
- Quotas et alertes ; ne jamais promettre zéro euro garanti.
- Prévisualisation d'abord ; production inchangée.

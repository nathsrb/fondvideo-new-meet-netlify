# FondVidéo New Meet

Source for the Netlify deployment.


## V3 — Sous-titres cloud (Deploy Preview)

- Génération via **DeepInfra / Whisper Large V3** (appel côté fonction Netlify `netlify/functions/transcribe.mts`).
- Import de vidéo depuis mobile, extraction par segments WAV mono 16 kHz de 24 secondes avec chevauchement ; la vidéo reste dans le navigateur, des extraits **audio** sont envoyés au service IA.
- Édition mot par mot, ajustement temporel, recherche/remplacement et annuler/rétablir.
- Les 36 styles animés existants restent disponibles.
- **Configuration nécessaire :** variable secrète `DEEPINFRA_API_KEY` dans le contexte **Deploy previews** de Netlify. Ne jamais utiliser `VITE_DEEPINFRA_API_KEY`.
- **Important :** ce déploiement n'a pas encore été validé sur une véritable vidéo/iPhone et l'API cloud ne peut pas répondre sans cette clé.
- La PR est destinée aux tests uniquement ; ne pas la fusionner à `main` avant validation.

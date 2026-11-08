# FondVidéo New Meet

Source for the Netlify deployment.

## V3 — Sous-titres cloud (Deploy Preview)

- Génération via **Groq / Whisper Large V3** avec appel côté fonction Netlify `netlify/functions/transcribe.mts`.
- Import de vidéo depuis mobile, extraction par segments WAV mono 16 kHz de 24 secondes avec chevauchement ; la vidéo reste dans le navigateur, seuls les extraits audio sont envoyés au service IA.
- Édition mot par mot, ajustement temporel, recherche/remplacement et annuler/rétablir.
- Les 36 styles animés existants restent disponibles.
- **Configuration nécessaire :** variable secrète `GROQ_API_KEY` dans le contexte **Deploy previews** de Netlify, avec accès Functions. Ne jamais utiliser `VITE_GROQ_API_KEY`.
- Modèle utilisé : `whisper-large-v3`, avec réponse `verbose_json` et horodatages mot par mot.
- La PR est destinée aux tests uniquement ; ne pas la fusionner à `main` avant validation.

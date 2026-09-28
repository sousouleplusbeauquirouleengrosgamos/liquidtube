# LiquidTube

1. Crée un dépôt GitHub (privé) et envoie-y tout le contenu de ce dossier.
2. Onglet **Actions** > "Build APK et Linux" > **Run workflow**.
3. Après 10-15 min, en bas de l'exécution, télécharge les deux fichiers séparés :
   - **LiquidTube-Android** (contient le .apk)
   - **LiquidTube-Linux** (contient le .AppImage : `chmod +x` puis lance-le)

Test en local : `npm install && npx tauri icon app-icon.png && npx tauri dev`

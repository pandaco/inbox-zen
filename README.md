# 🧘 Inbox Zen: Retrouvez la sérénité dans votre boîte Gmail

**Inbox Zen** est une extension de navigateur intelligente conçue pour transformer votre gestion d'emails. Ne vous laissez plus submerger par le bruit : identifiez, triez et nettoyez votre boîte de réception en quelques clics.

---

## 🚀 Pourquoi Inbox Zen ?

Gmail est un outil formidable, mais il accumule vite des milliers de messages inutiles qui polluent votre espace mental et numérique. Inbox Zen analyse intelligemment votre boîte de réception (Inbox) pour mettre en lumière ce qui mérite d'être supprimé ou archivé.

### ✨ Fonctionnalités Clés

#### 📧 Analyse Intelligente des Expéditeurs
- **Score de Bruit (Noise Score)** : Identifiez immédiatement les expéditeurs les plus "bruyants" basés sur la fréquence et la récence de leurs envois.
- **Désinscription en 1 Clic** : Détection automatique des liens `List-Unsubscribe` pour vous désabonner sans même ouvrir l'email.

#### 🧹 Nettoyage des Emails Éphémères
- **Raccourcis OTP** : Identifiez les codes de vérification et mots de passe temporaires déjà expirés (> 24h).
- **Suivi de Colis** : Regroupez toutes vos notifications de livraison. L'extension est assez maligne pour grouper les messages similaires même si les numéros de suivi diffèrent.
- **Invitations Passées** : Retrouvez les anciennes invitations calendrier (`.ics`) qui n'ont plus aucune utilité.

#### 🕰 Filtres de Péremption
- **Vieux Messages** : Ciblez les emails de plus d'un an qui dorment dans votre boîte de réception sans aucun libellé.
- **Fils Redondants** : Détectez les conversations interminables qui encombrent votre vue.

#### ⚡ Mode "Challenge 0-Inbox"
Un mode de tri rapide et ludique ! Traitez vos messages les plus anciens un par un avec une interface de décision instantanée : **Garder** ou **Jeter**. C'est la méthode la plus efficace pour vider une boîte saturée.

#### 🔍 Filtres Rapides & Personnalisables
Accès direct à des recherches puissantes : "Newsletters", "Liens de désinscription", et bien d'autres pour un nettoyage chirurgical.

---

## 🛠 Performance & Confidentialité

- **Optimisation Massive** : Grâce à notre technologie de "Crawl Unique", l'extension récupère toutes les données en un seul passage, préservant ainsi votre batterie et votre quota Google API.
- **Vue Confort** : Un bouton dédié vous permet de passer du mode "Pop-in" (dans Gmail) à un onglet plein écran pour un tri plus spacieux.
- **Sécurité First** : Vos données restent chez vous. L'extension communique directement avec l'API Gmail sans serveur intermédiaire.

---

## 💻 Installation (Développeurs)

1. **Cloner le dépôt** : `git clone https://github.com/votre-compte/inbox-zen.git`
2. **Installer les dépendances** : `npm install`
3. **Build du projet** : `npm run build`
4. **Charger dans Chrome** :
   - Allez sur `chrome://extensions/`
   - Activez le **Mode développeur**
   - Cliquez sur **Charger l'extension décompressée**
   - Sélectionnez le dossier `apps/extension/dist`

---

## 📜 Commandes Utiles

- `npm run start` : Lancer le serveur de développement Angular.
- `npm run build` : Compiler l'extension complète.
- `npm run lint` : Vérifier la qualité du code.
- `npm run test` : Lancer les tests unitaires.

---

*Transformez votre chaos numérique en un havre de paix avec Inbox Zen.* 🕊️

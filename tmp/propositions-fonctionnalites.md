# Propositions de Nouvelles Fonctionnalités pour Inbox-Zen

Pour améliorer le tri et l'identification des emails superflus, voici plusieurs axes d'évolution basés sur l'analyse des métadonnées Gmail et l'expérience utilisateur.

## 1. Aide à la Désinscription (Unsubscribe Helper)
Identifier les listes de diffusion et faciliter le nettoyage des abonnements inutiles.
- [x] **Détection de `List-Unsubscribe`** : Extraire le header `List-Unsubscribe` pour identifier les emails de masse et proposer un bouton "Se désinscrire" directement dans l'extension.
- [x] **Score de "Bruit"** : Classer les expéditeurs par fréquence d'envoi. Un expéditeur qui envoie 5 mails par jour sans interaction mérite une proposition de désinscription.

## 2. Identification des Emails Temporaires
Beaucoup d'emails n'ont qu'une durée de vie utile très courte.
- [x] **Codes OTP / Vérification** : Identifier les mots clés comme "Verification code", "OTP", "One-time password" et proposer de les supprimer s'ils datent de plus de 24h.
- [x] **Suivi de Colis** : Identifier les notifications de livraison. Une fois le colis livré (détecté par mots clés), proposer l'archivage ou la suppression.

## 3. Analyse Avancée des Pièces Jointes
Au-delà de la taille de l'email, le type de contenu est crucial pour le nettoyage.
- [ ] **Types de fichiers obsolètes** : Identifier les vieux documents (.doc vs .docx, .xls vs .xlsx) qui prennent de la place et sont probablement obsolètes.
- [ ] **Doublons de pièces jointes** : Détecter si le même fichier (par nom et taille approchée) a été reçu plusieurs fois de différents expéditeurs ou dans différents fils de discussion.

## 4. Filtres de "Péremption" (Expiration Filters)
Permettre à l'utilisateur de définir des règles de nettoyage basées sur l'âge du mail.
- [ ] **Emails > 2 ans sans Label** : Identifier les mails anciens qui n'ont jamais été classés manuellement (probablement du bruit).
- [ ] **Invitations Calendrier passées** : Identifier les invitations à des réunions ou événements terminés depuis longtemps.

## 5. Visualisations et Actions Groupées (Batch Actions)
Améliorer l'interface pour agir plus vite.
- [ ] **Nettoyage par Expéditeur (One-Click Cleanup)** : Ajouter un bouton "Tout supprimer" ou "Tout archiver" à côté de chaque ligne dans l'onglet "Top Senders".
- [ ] **Heatmap de l'Inbox** : Afficher une vue calendaire montrant les jours/mois où l'accumulation de mails a été la plus forte pour cibler les périodes à nettoyer.

## 6. Détection de Redondance dans les Fils (Thread Optimization)
- [ ] **Dernier message du fil** : Identifier les messages intermédiaires dans un long fil de discussion qui ne contiennent aucune information supplémentaire par rapport au message final.

## 7. Mode "Zéro-Inbox" Challenge
- [ ] **Gamification** : Afficher un score de santé de l'inbox et proposer des sessions de "Nettoyage Rapide" de 1 minute où l'utilisateur swipe (gauche/droite) pour jeter ou garder les mails les plus anciens.

## 8. Confort d'utilisation et Interface
Améliorer l'espace de travail de l'extension pour plus de visibilité.
- [x] **Agrandir ou Ouvrir dans un Nouvel Onglet** : Bouton permettant d'ouvrir l'extension dans un onglet dédié ou d'agrandir la popup si possible, afin de ne pas se sentir à l'étroit.

## 9. Filtres Pré-remplis Rapides
Filtres d'accès rapide avec des mots-clés pré-définis (extensibles manuellement).
- [x] **Filtres de nettoyage rapide** : Accès direct à des recherches comme "newsletter", "se désinscrire", "se désabonner" ou "unsubscribe" dans le contenu de l'email pour purger rapidement.

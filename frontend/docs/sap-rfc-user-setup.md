# Création de l'utilisateur RFC SAPscope

**Destinataire :** Consultant SAPscope
**Durée totale :** 5 à 30 minutes selon l'infrastructure client

---

## Étape 0 — Identifier l'infrastructure client

Poser ces deux questions au Basis avant d'arriver sur site :

| Question | Réponse | Script à utiliser |
|---|---|---|
| Avez-vous CUA (Central User Administration) ? | Oui | `ZSAPSCOPE_SETUP_CUA` |
| Avez-vous Solution Manager encore en place ? | Oui (et pas de CUA) | `ZSAPSCOPE_SETUP_SOLMAN` |
| Ni l'un ni l'autre | — | `ZSAPSCOPE_SETUP` sur chaque système |

---

## Cas 1 — CUA disponible ✦ le plus simple

**Où :** Système central CUA
**Script :** `ZSAPSCOPE_SETUP_CUA.abap`

1. SE38 → créer `ZSAPSCOPE_SETUP_CUA` → coller → activer → F8
2. Saisir le mot de passe → exécuter
3. L'user `SAPSCOPE` est répliqué sur tous les systèmes enfants automatiquement

**Limite CUA :** les autorisations (rôles) sont toujours **locales** par système.
Après la création centrale, il faut quand même créer le rôle `Z_SAPSCOPE` dans chaque système enfant avec `ZSAPSCOPE_SETUP`, puis l'assigner via SU01.

> En pratique : user créé une fois (CUA), rôle créé N fois (une par système). Gain de temps si le client a beaucoup de systèmes.

---

## Cas 2 — Solution Manager disponible (sans CUA)

**Où :** SAP Solution Manager
**Script :** `ZSAPSCOPE_SETUP_SOLMAN.abap`

1. SE38 → créer `ZSAPSCOPE_SETUP_SOLMAN` → coller → activer
2. Vérifier que les destinations RFC vers les systèmes managés existent (SM59)
3. F8 → cocher **Test** pour voir quels systèmes sont détectés dans LMDB
4. Décocher Test → exécuter → le script tourne sur tous les systèmes en une passe

**Note :** Solution Manager ne sera plus disponible après 2027. Si la migration vers SAP Cloud ALM est en cours, utiliser le Cas 3 directement.

---

## Cas 3 — Aucune infrastructure centrale (dernier recours)

**Où :** Chaque système SAP individuellement
**Script :** `ZSAPSCOPE_SETUP.abap`

1. SE38 sur **chaque** système → créer `ZSAPSCOPE_SETUP` → coller → activer → F8
2. Saisir le mot de passe → exécuter
3. Le script crée le rôle `Z_SAPSCOPE` et l'user `SAPSCOPE` en une passe
4. Répéter pour DEV, QAS, PRD, BW, etc.

Le script est **idempotent** — sans danger si exécuté deux fois sur le même système.

---

## Ce que font les scripts

| Action | Objet créé |
|---|---|
| Utilisateur `SAPSCOPE` type `S` | Pas d'accès GUI, pas d'expiration mot de passe |
| Rôle `Z_SAPSCOPE` | S_RFC (RFC_READ_TABLE, RFC_SYSTEM_INFO) + S_TABU_NAM (CVERS, PAT03, TADIR) en lecture |

L'agent **ne modifie aucune donnée SAP**. Lecture seule.

---

## Ce que le consultant reçoit après

Le Basis transmet :
- Le mot de passe défini pour `SAPSCOPE`
- Confirmation que le script s'est exécuté sans erreur

Le consultant lance alors :
```bash
sudo bash install.sh --token <token> --sap-pass <mot-de-passe>
```

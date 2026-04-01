# Administration — Clients et tokens d'ingestion

**Accès :** Compte admin uniquement

---

## Concepts

- **Client** = une entreprise (ex : ACME Industries). Regroupe tous ses systèmes SAP.
- **Token** = clé d'authentification utilisée par l'agent de collecte pour envoyer des snapshots à SAPscope.

---

## Créer un client

1. **⚙ admin** → onglet **Clients**
2. Cliquer **Nouveau client**
3. Saisir le **nom du client** → valider

Le client apparaît dans la liste. Il est vide tant qu'aucun snapshot n'a été envoyé.

```bash
# API directe
curl -X POST "https://sapscope.luku.fr/api/v1/admin/clients?name=ACME%20Industries" \
  -H "Authorization: Bearer <token_admin>"
```

---

## Générer un token d'ingestion

1. Dans la liste des clients → cliquer sur le client concerné
2. Section **Tokens** → cliquer **Nouveau token**
3. Saisir un **libellé** (ex : `agent-prd`, `agent-dev`) → valider
4. **Copier le token immédiatement** — il n'est affiché qu'une seule fois

```bash
# API directe
curl -X POST "https://sapscope.luku.fr/api/v1/admin/clients/<client_id>/tokens?label=agent-prd" \
  -H "Authorization: Bearer <token_admin>"
```

> Ce token est ensuite transmis à l'agent de collecte lors de son installation côté client.

---

## Utiliser le token dans l'agent

Lors de l'installation de l'agent sur le serveur client :

```bash
sudo bash install.sh --token <token_ingestion> --sap-pass <mot-de-passe-SAPSCOPE>
```

---

## Lister les tokens d'un client

```bash
curl https://sapscope.luku.fr/api/v1/admin/clients/<client_id>/tokens \
  -H "Authorization: Bearer <token_admin>"
```

---

## Révoquer un token

1. Dans la fiche client → section **Tokens**
2. Cliquer **Révoquer** à côté du token concerné → confirmer

L'agent utilisant ce token ne pourra plus envoyer de snapshots. Générer un nouveau token et reconfigurer l'agent si nécessaire.

```bash
# API directe
curl -X DELETE https://sapscope.luku.fr/api/v1/admin/clients/<client_id>/tokens/<token_id> \
  -H "Authorization: Bearer <token_admin>"
```

---

## Bonne pratique

| Situation | Recommandation |
|---|---|
| Un token par environnement | `agent-dev`, `agent-qas`, `agent-prd` — facilite la traçabilité |
| Fin de mission | Révoquer le token dès la fin du contrat |
| Token compromis | Révoquer immédiatement et en générer un nouveau |

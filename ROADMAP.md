# SAPscope — Roadmap & Plan

**Situation (avril 2026)**
- 0 client payant / Stripe en test / pricing non défini
- Cible : ESN et cabinets de conseil SAP
- Réseau SAP faible → visibilité = blocage principal
- Side project → temps limité
- Objectif 6 mois : **1er client payant**

---

## 🔴 Actions business bloquantes (faire avant tout le reste)

| # | Action | Pourquoi urgent | Fait ? |
|---|---|---|---|
| B1 | **Définir le pricing** | Sans prix, impossible de vendre | ❌ |
| B2 | **Passer Stripe en live** | sk_test_ → sk_live_ | ❌ |
| B3 | **Page pricing sur sapscope.com** | Les ESN veulent voir les tarifs avant de contacter | ❌ |
| B4 | **Démo 15 min préparée** | Toute conversation commerciale finit par "montre-moi" | ❌ |
| B5 | **UptimeRobot sur /healthz** | Crédibilité produit | ❌ |

### Proposition pricing ESN

| Tier | Cible | Prix suggéré | Contenu |
|---|---|---|---|
| **Solo** | Consultant indépendant | 49€/mois | 1 utilisateur, 3 clients SAP |
| **Team** | Petite ESN (2-5 consultants) | 149€/mois | 5 utilisateurs, 20 clients SAP |
| **Enterprise** | Grande ESN | 399€/mois ou sur devis | Illimité + white-label |

> À valider. La logique : une ESN qui gère 10 clients SAP économise facilement 2h/client/mois en reporting. À 100€/h consultant, ça vaut 2000€/mois — 149€ est une évidence.

---

## 📣 GTM — Aller chercher le 1er client

### Canaux (réseau faible → construire avant de pitcher)

**1. LinkedIn — priorité absolue**
- Créer une page LinkedIn SAPscope
- Publier 2-3x/semaine sur des sujets SAP Basis concrets :
  - "Les 5 signes qu'un système SAP va tomber"
  - "Comment surveiller HANA System Replication sans CCMS"
  - "Transport queue à 200 entrées — ce que ça veut dire"
- Objectif : 500 abonnés en 3 mois → pipeline organique

**2. blogs.sap.com (SAP Community)**
- Publier 1 article/mois sur un sujet Basis technique
- Mention naturelle de SAPscope en fin d'article
- Audience : exactement les Basis admins et chefs de practice SAP

**3. Cold outreach LinkedIn**
- Cibler : Directeurs de Practice SAP, Managers delivery SAP dans les ESN françaises (Capgemini, Sopra, Accenture, CGI, Unilog, Axians, etc.)
- Message court : problème → solution → "je vous offre un essai 30 jours"
- Volume : 5-10 DM/semaine

**4. Freelances SAP Basis (prescripteurs)**
- Les indépendants Basis parlent entre eux
- 1 freelance convaincu = potentiellement 3-5 clients via bouche-à-oreille
- Offrir un tier gratuit permanent aux freelances en échange de recommandations

### Séquence pour le 1er client

```
Semaine 1-2 : pricing + Stripe live + page pricing
Semaine 3-4 : démo préparée + premiers posts LinkedIn
Mois 2 : 10 DM/semaine + 1 article SAP Community
Mois 3 : 1er appel de démo → 1er essai gratuit
Mois 4-5 : conversion essai → payant
```

---

## 🔧 Features backlog

### P1 — Ce qui fait signer (manque pour convaincre les ESN)

| Feature | Valeur ESN | Complexité |
|---|---|---|
| **Essai gratuit 30 jours auto** | Baisse la barrière à l'entrée, pas besoin de contacter | Faible |
| **White-label basique** | L'ESN présente SAPscope sous son nom à ses clients | Moyenne |
| **Rapport PDF avec logo client** | Déjà fait (logo SAPscope) → permettre logo custom | Faible |
| **Multi-mandant sécurité** | Scanner tous les clients SAP d'un système, pas juste le client 100 | Moyenne |

### P2 — Ce qui fait garder (rétention)

| Feature | Valeur | Complexité |
|---|---|---|
| **Diff cross-systèmes** | Comparer PRD vs QAS ou deux clients différents | Faible (déjà analysé) |
| **BW process chains** | Clients BW/4HANA ont besoin de voir les chaînes en erreur | Moyenne |
| **PI/PO queues XI** | Clients PI/PO | Moyenne |
| **Certificats SSL/TLS** | Surveillance expiration PSE ABAP + HANA | Haute (besoin système test) |

### P3 — Nice to have

| Feature | Notes |
|---|---|
| Alertes email hebdo | Résumé automatique par email (pas temps réel — voir décision produit) |
| API publique | Pour intégration dans les outils ESN existants |
| SSO / SAML | Entreprises avec AD/LDAP |
| App mobile | Dashboard lecture seule |

### ✅ Déjà fait

- HANA HSR monitoring
- Connexion Message Server + SAProuter (systems.yaml)
- Diff temporel (snapshots)
- Rapport PDF client
- Health score multi-domaines
- Sizing SAP
- Rapport email journalier
- Inventaire global
- Notes système
- Landscape view multi-clients

---

## 🏗️ Roadmap technique (agents parallèles)

Une fois le plan business lancé, voici l'ordre d'implémentation technique :

```
Sprint 1 (cette semaine)
├── B1-B5 : pricing / Stripe / démo (manuel)
└── Feature : essai gratuit 30 jours auto (backend + UI)

Sprint 2
├── Feature : white-label basique (logo custom dans rapports)
└── Feature : diff cross-systèmes

Sprint 3
├── Feature : multi-mandant sécurité
└── Feature : BW process chains

Sprint 4+
└── Certificats SSL/TLS (dès accès système SAP test)
```

---

## 📊 KPIs à suivre

| Métrique | Objectif 3 mois | Objectif 6 mois |
|---|---|---|
| Abonnés LinkedIn SAPscope | 200 | 500 |
| Démos réalisées | 5 | 15 |
| Essais gratuits actifs | 3 | 10 |
| Clients payants | 0 | 1 |
| MRR | 0€ | 149€+ |

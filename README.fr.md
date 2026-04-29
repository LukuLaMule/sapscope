🇬🇧 [English](README.md) | 🇫🇷 Français

# SAPscope

Outil de surveillance et de diagnostic de paysages SAP. Collecte automatiquement les métadonnées de vos systèmes (composants, support packages, kernel, objets custom) et génère des analyses par intelligence artificielle.

Deux modes de déploiement : **SaaS** (hébergé sur sapscope.com) et **self-hosted** (sur votre infrastructure).

---

## SaaS — Démarrage rapide

1. Créez un compte sur [app.sapscope.com](https://app.sapscope.com/app)
2. Contactez [contact@sapscope.com](mailto:contact@sapscope.com) pour activer votre périmètre
3. Un administrateur crée votre client SAP, génère un token agent et vous l'envoie
4. Installez l'agent sur votre serveur SAP (voir section Agent ci-dessous)

---

## Self-hosted — Déploiement

### Prérequis

- Docker + Docker Compose
- Une clé de licence SAPscope (contactez [contact@sapscope.com](mailto:contact@sapscope.com))
- Une clé API Anthropic
- Un reverse proxy avec TLS (Traefik, nginx, Caddy…)

### Installation

```bash
git clone <repo> sapscope
cd sapscope
cp .env.example .env
```

Remplissez `.env` :

```env
POSTGRES_PASSWORD=changeme
SAPSCOPE_JWT_SECRET=une-chaine-aleatoire-de-32-caracteres-minimum
ANTHROPIC_API_KEY=sk-ant-...
LICENSE_KEY=<votre-cle-de-licence>
REGISTRATION_ENABLED=false
ALLOWED_ORIGINS=https://votre-domaine.com
```

Démarrez :

```bash
docker compose up -d
```

### Premier démarrage

Créez le compte administrateur via l'API (une seule fois) :

```bash
# Activez temporairement l'inscription
# REGISTRATION_ENABLED=true dans .env, puis redémarrez le backend

curl -X POST https://votre-domaine.com/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@votre-entreprise.com","password":"motdepasse-securise"}'

# Récupérez l'ID utilisateur dans la réponse, puis passez-le admin en base :
docker compose exec db psql -U sapscope -c \
  "UPDATE users SET is_admin = true WHERE email = 'admin@votre-entreprise.com';"

# Remettez REGISTRATION_ENABLED=false et redémarrez
```

### Générer une licence (vendeurs uniquement)

```bash
cd backend
python generate_license.py --org "Nom du client" --tier enterprise --months 12
```

La clé privée doit être dans `backend/sapscope_license.pem` (non versionnée, à conserver en lieu sûr).

Tiers disponibles :

| Tier       | Utilisateurs | Clients SAP |
|------------|-------------|-------------|
| solo       | 1           | 3           |
| team       | 5           | 20          |
| enterprise | illimité    | illimité    |

---

## Agent SAP

L'agent se déploie sur le serveur d'application SAP. Il se connecte en RFC local et envoie un snapshot toutes les 24h.

### Installation

Exécutez l'installeur sur le serveur d'application SAP (Linux, nécessite root) :

```bash
curl -sSL https://app.sapscope.com/install.sh | sudo bash -s -- \
  --token <token-depuis-le-panel-admin>
```

L'installeur va :
- Détecter Python (l'installer si nécessaire)
- Découvrir automatiquement les systèmes SAP depuis `/usr/sap/`
- Créer un timer systemd pour la collecte automatique
- Lancer une première collecte immédiatement

#### Installation manuelle (sans l'installeur)

```bash
curl -O https://app.sapscope.com/dist/agent.tar.gz
curl -O https://app.sapscope.com/dist/agent.tar.gz.sha256
sha256sum --check agent.tar.gz.sha256
tar xzf agent.tar.gz && cd agent
pip install -r requirements.txt
```

Créez un fichier `.env` :

```env
SAPSCOPE_BACKEND_URL=https://app.sapscope.com
SAPSCOPE_TOKEN=<token-depuis-le-panel-admin>
SAP_USER=SAPSCOPE_RFC
SAP_PASSWD=<mot-de-passe>
SAP_CLIENT=100
```

Testez et lancez :

```bash
python -m agent --dry-run   # vérifie la connexion RFC, affiche le JSON
python -m agent             # collecte et envoie
```

### Modes de connexion

Par défaut, l'agent se connecte directement à un serveur d'application (`mode ashost`). Deux modes supplémentaires sont disponibles pour les déploiements distants ou les landscapes load-balancés.

#### Option 1 — `systems.yaml` (recommandé pour les setups distants ou multi-systèmes)

Créez un fichier `systems.yaml` à côté du package agent :

```yaml
systems:
  # Connexion directe au serveur d'application (défaut — agent sur l'AS)
  - mode: ashost
    ashost: localhost
    sysnr: "00"
    client: "100"

  # Message server — connexion via load balancer (agent sur un hôte séparé)
  - mode: mshost
    mshost: sapms.company.com   # nom d'hôte du message server
    msserv: "3601"              # port ou nom de service (ex. "sapmsP01")
    r3name: P01                 # SID SAP
    group: PUBLIC               # logon group (défaut : PUBLIC)
    client: "100"

  # Connexion directe via un SAProuter
  - mode: ashost
    ashost: 10.0.1.5
    sysnr: "00"
    saprouter: /H/saprouter.company.com/H/
    client: "000"
```

Les credentials (`SAP_USER` / `SAP_PASSWD`) sont toujours lus depuis les variables d'environnement. Des valeurs `user`/`passwd` par entrée sont possibles mais déconseillées.

Le fichier `systems.yaml` est prioritaire sur `SAPSCOPE_SYSTEMS` et la découverte automatique `/usr/sap/`.

#### Option 2 — Variable `SAPSCOPE_SYSTEMS` (multi-systèmes simples sur le même hôte)

```env
SAPSCOPE_SYSTEMS=P01:00 Q01:01 D01:02
```

Chaque entrée est `SID:SYSNR`, connexion en `localhost` sur ce numéro de système. À utiliser quand l'agent tourne directement sur le serveur d'application SAP.

#### Priorité de découverte

| Priorité | Source | Cas d'usage |
|---|---|---|
| 1 | `systems.yaml` | Hôtes distants, message server, SAProuter |
| 2 | Variable `SAPSCOPE_SYSTEMS` | Plusieurs SID locaux sur le même hôte |
| 3 | Découverte auto `/usr/sap/` | Systèmes auto-détectés sur l'hôte local |

### Utilisateur RFC requis côté SAP

Voir [docs/sap-rfc-user-setup.md](docs/sap-rfc-user-setup.md) pour la création de l'utilisateur de communication et les autorisations minimales requises.

---

## Test local de l'agent (SAP ABAP Trial)

Vous pouvez tester le pipeline de collecte complet sur un système SAP ABAP Trial gratuit tournant sur votre machine.

### 1 — Démarrer un container SAP ABAP Trial

Prérequis : Docker, 8 Go de RAM, ~150 Go de disque, [SAP Universal ID](https://account.sap.com) (gratuit).

```bash
docker login   # authentifiez-vous avec votre SAP Universal ID
docker pull sapse/abap-platform-trial:1909

docker run -d \
  --name sap-trial \
  --hostname vhcalnplci \
  --stop-timeout 3600 \
  -p 3200:3200 -p 8443:8443 \
  sapse/abap-platform-trial:1909

# Suivre le démarrage (environ 45 min au premier lancement)
docker logs -f sap-trial | grep -E "started|ICM|Dispatcher"
```

Connexion par défaut : host `localhost`, numéro système `00`, client `001`, user `DEVELOPER`, mot de passe `ABAPtr1909`.

### 2 — Installer le SAP NW RFC SDK

Téléchargez **SAP NW RFC SDK 7.50** (Linux 64-bit) depuis [SAP Software Downloads](https://support.sap.com/swdc) (S-User requis).

```bash
unzip nwrfc750*.zip -d /usr/local/sap
export SAPNWRFC_HOME=/usr/local/sap/nwrfc750
echo 'export SAPNWRFC_HOME=/usr/local/sap/nwrfc750' >> ~/.bashrc
```

### 3 — Installer les dépendances de l'agent

```bash
cd agent
pip install -r requirements.txt   # inclut pyrfc
```

### 4 — Configurer l'utilisateur RFC dans SAP

- **SE38** → créer et exécuter le programme `ZSAPSCOPE_SETUP` (source : `docs/ZSAPSCOPE_SETUP.abap`)
- **SU01** → créer l'utilisateur `SAPSCOPE` selon `docs/sap-rfc-user-setup.md`

### 5 — Lancer l'agent en mode dry-run

```bash
SAPSCOPE_BACKEND_URL=https://app.sapscope.com \
SAPSCOPE_TOKEN=<token-depuis-le-panel-admin> \
SAP_USER=SAPSCOPE \
SAP_PASSWD=<mot-de-passe> \
SAP_HOST=localhost \
SAP_SYSNR=00 \
SAP_CLIENT=001 \
SAPSCOPE_SYSTEMS="NPL:00" \
python -m agent --dry-run   # affiche le JSON collecté sans l'envoyer
```

Supprimez `--dry-run` pour envoyer le snapshot au backend et le voir apparaître dans l'interface.

---

## Administration

Depuis l'interface web (onglet Admin, visible uniquement pour les comptes `is_admin`) :

- **Clients** : créer un périmètre SAP, générer des tokens agent, révoquer des tokens
- **Utilisateurs** : créer des comptes consultants, assigner les clients visibles par chaque consultant

---

## Variables d'environnement

| Variable              | Requis | Description                                                  |
|-----------------------|--------|--------------------------------------------------------------|
| `DATABASE_URL`        | oui    | URL PostgreSQL asyncpg                                       |
| `SAPSCOPE_JWT_SECRET` | oui    | Secret JWT (min. 32 caractères)                              |
| `ANTHROPIC_API_KEY`   | oui    | Clé API Anthropic pour les analyses                          |
| `LICENSE_KEY`         | self-hosted | JWT de licence signé par Sapscope                       |
| `REGISTRATION_ENABLED`| non    | `true` (SaaS) / `false` (self-hosted). Défaut : `true`       |
| `ALLOWED_ORIGINS`     | non    | Origines CORS autorisées. Défaut : `https://app.sapscope.com` |
| `ENV`                 | non    | `development` active les logs SQL et `/docs`. Défaut : `production` |

---

## Healthcheck

```bash
curl https://votre-domaine.com/healthz
```

---

## Licence

Logiciel propriétaire — © 2026 SAPscope. Tous droits réservés.
Toute redistribution ou modification sans autorisation écrite est interdite.

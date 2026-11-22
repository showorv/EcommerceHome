# Deploying the shop (free: Oracle Cloud + Cloudflare)

The whole shop runs on one server with Docker: **Caddy** (HTTPS) → **web** (Next.js) + **worker**,
**MongoDB** and **Redis**. Everything here is free except the domain name (about $10 a year for a
`.com`). Free plans change; check each provider's current terms when you sign up.

| Piece            | Service                                   | Cost              |
| ---------------- | ----------------------------------------- | ----------------- |
| Server           | Oracle Cloud "Always Free" ARM VM         | free (card check) |
| Domain           | Any registrar (Cloudflare, Namecheap, BD) | ~$10/year         |
| DNS, CDN, shield | Cloudflare Free                           | free              |
| HTTPS            | Caddy + Let's Encrypt                     | free              |
| Media            | Cloudinary Free                           | free              |
| Errors           | Sentry Developer                          | free              |
| Uptime alerts    | UptimeRobot Free                          | free              |

---

## 1. Create the server (Oracle Cloud)

1. Sign up at oracle.com/cloud/free. Pick a **home region** near Bangladesh: **Mumbai** or
   **Hyderabad** (Singapore also works). The home region can't be changed later.
2. **Compute → Instances → Create instance**
   - Image: **Ubuntu 24.04** (the full one, not "Minimal").
   - Shape: **Ampere → VM.Standard.A1.Flex**, **4 OCPUs, 24 GB memory** (the free maximum).
     If it says "out of capacity", try another availability domain, or try again later.
   - Networking: keep "Assign a public IPv4 address".
   - SSH keys: upload your public key (on your Mac: `cat ~/.ssh/id_ed25519.pub`; make one with
     `ssh-keygen -t ed25519` if you have none).
   - Boot volume: 100 GB (up to 200 GB is free).
3. Open ports 80 and 443: **Instance → Subnet → Security list → Add ingress rules**: source
   `0.0.0.0/0`, TCP, destination ports `80,443`. (Also UDP 443 for HTTP/3, optional.)
4. Note the instance's **public IP**.

## 2. Prepare the server

```bash
ssh ubuntu@<public-ip>
```

Ubuntu images on Oracle also block ports in the server's own firewall. Open 80 and 443 there too:

```bash
sudo iptables -I INPUT 6 -p tcp -m multiport --dports 80,443 -j ACCEPT
sudo iptables -I INPUT 6 -p udp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

Install Docker and turn on automatic security updates:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu && newgrp docker
sudo apt-get install -y unattended-upgrades && sudo dpkg-reconfigure -plow unattended-upgrades
```

## 3. Get the code

The repository is private, so give the server read-only access with a **deploy key**:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/github_deploy -N ""
cat ~/.ssh/github_deploy.pub
```

On GitHub: **repo → Settings → Deploy keys → Add deploy key**, paste it, leave "write access" off.
Then:

```bash
printf 'Host github.com\n  IdentityFile ~/.ssh/github_deploy\n' >> ~/.ssh/config
git clone git@github.com:<you>/<repo>.git shop && cd shop
git checkout main   # or the branch you deploy
```

## 4. Domain and Cloudflare

1. Add your domain to Cloudflare (free plan) and change the registrar's name servers to Cloudflare's.
2. **DNS**: an `A` record for `@` (and `www`) → the server's public IP, **Proxy status: DNS only (grey
   cloud) for now**, so Caddy can get its certificate in step 6.
3. **SSL/TLS → Overview**: **Full (strict)**.

No domain yet? Use a free DuckDNS name (`yourshop.duckdns.org` → the server IP) and skip Cloudflare
until you buy one. Everything else works the same.

## 5. Settings

```bash
cd ~/shop/deploy
cp env.production.example .env.production
chmod 600 .env.production
nano .env.production
```

Fill in every `change-me` and empty secret (`openssl rand -base64 32` for each), with the **same**
passwords in the `MONGO_*`, `MONGODB_*`, `REDIS_*` lines. Set `APP_URL=https://<domain>` and
`DOMAIN=<domain>`. Cloudinary keys are needed for uploading product pictures. Then the database key
file:

```bash
mkdir -p secrets && openssl rand -base64 756 > secrets/mongo-keyfile && chmod 600 secrets/mongo-keyfile
```

Keep a copy of `.env.production` somewhere safe (a password manager). Losing `ENCRYPTION_KEY` makes
the keys saved in Admin → Integrations unreadable.

## 6. First start

```bash
cd ~/shop/deploy
docker compose up -d mongo redis          # the database first: the build reads from it
docker compose up -d --build              # builds the shop (5–10 minutes the first time) and starts all
docker compose ps                         # all "healthy"/"running"
curl -s https://<domain>/api/health       # {"ok":true,...}
```

Create the owner account (the email is sent with your SMTP settings):

```bash
docker compose exec web node_modules/.bin/tsx scripts/create-owner.ts --email you@example.com --name "Your Name"
```

Then sign in at `https://<domain>/admin`, and set up the shop: Delivery, Payments, Storefront,
products.

## 7. Turn on Cloudflare's protection

Once the site works on https:

1. DNS: switch the records to **Proxied (orange cloud)**.
2. **Security → WAF → Rate limiting rules** (free plan has one rule): e.g. `URI Path starts with /api/`
   → 60 requests per 10 seconds per IP → Block. Search suggestions and listings have no limit of
   their own and rely on this.
3. **Speed → Optimization**: turn off "Rocket Loader" (it breaks Next.js pages).

The shop reads the visitor's real address from Cloudflare only when the request truly comes from
Cloudflare (see `deploy/Caddyfile`), so per-IP limits keep working.

## 8. Error tracking and uptime alerts

- **Sentry** (sentry.io, Developer plan): create a project of type **Next.js**, copy its DSN into
  both `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN`, then `docker compose up -d --build`. Reports carry
  no cookies, form data, IP addresses or query strings.
- **UptimeRobot** (uptimerobot.com, free): a **Keyword** monitor on `https://<domain>/api/health`
  for the text `"ok":true`, every 5 minutes, with email alerts to both founders (NFR-AV-01).

## 9. Updating the shop

By hand, on the server:

```bash
~/shop/deploy/update.sh
```

It pulls the latest `main`, rebuilds, and waits until every service is healthy. The old version keeps
serving while the new one builds; the switch takes a few seconds.

### Automatic: every push to `main`

The **Deploy** workflow (`.github/workflows/deploy.yml`) runs `update.sh` on the server whenever CI
passes on `main`. Pull-request runs and failed CI never deploy. Until the secrets below exist it does
nothing. One-time set-up:

1. **On your Mac**, make a key only GitHub will use:

   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/shop_actions -N "" -C github-actions-deploy
   ```

2. **On the server**, let that key run the update script and nothing else (`restrict` also turns off
   shells, port forwarding and the rest). Paste the whole public key (`cat ~/.ssh/shop_actions.pub` on
   the Mac) where shown:

   ```bash
   echo 'command="/home/ubuntu/shop/deploy/update.sh",restrict <paste ~/.ssh/shop_actions.pub here>' >> ~/.ssh/authorized_keys
   ```

3. **On your Mac**, read the server's own key, so GitHub can check it is talking to your server:

   ```bash
   ssh-keyscan -t ed25519 <public-ip>
   ```

4. **On GitHub: repo → Settings → Secrets and variables → Actions**
   - Secrets:
     - `DEPLOY_HOST`: the server's public IP (not the Cloudflare domain)
     - `DEPLOY_SSH_KEY`: the whole private key, from `cat ~/.ssh/shop_actions`
     - `DEPLOY_KNOWN_HOSTS`: the line(s) from step 3
     - optional: `DEPLOY_USER` (default `ubuntu`) and `DEPLOY_PORT` (default `22`)
   - Variable (optional): `SHOP_URL` = `https://<domain>`. The workflow checks `/api/health` after
     deploying.

5. Try it: **Actions → Deploy → Run workflow**. The log shows the build and `✓ Deployed`.

Pushes to other branches don't deploy; merge them into `main` (or open a pull request) first. If an
update fails, the previous version keeps running: read the Actions log, fix, push again. Delete the
`DEPLOY_HOST` secret to pause automatic deploys.

## 10. Day to day

```bash
docker compose logs -f web            # web app log (also: worker, caddy, mongo)
docker compose restart worker         # e.g. after changing SMS settings in .env.production
docker compose exec mongo mongosh -u root -p --authenticationDatabase admin   # database shell
```

Logs are kept per service, 5 files × 20 MB. Backups come in step 3.7.

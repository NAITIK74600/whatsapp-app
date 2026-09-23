# 🟣 Deploying WA-AKG on Hostinger (Web App / Node.js hosting)

This guide covers **Hostinger Business / Cloud web hosting** using the hPanel **Node.js web app**
feature together with a **Hostinger MySQL database** on the same plan.

> **Important:** WA-AKG uses a *custom server* (Socket.IO + WhatsApp engine + scheduler).
> Do **not** let Hostinger use the `Next.js` framework preset — it would start Next's own standalone
> server and skip the WhatsApp engine. Use the **Other** preset with the entry file `server.mjs`.

---

## 1. Create the MySQL database

1. hPanel → **Websites → Dashboard → Databases → Management**
2. Create a database, a user, and a strong password. Your current Hostinger database values are:
   - Database: `u545116183_whatsapp`
   - User: `u545116183_naitik`
   - Remote MySQL hostname for external connections only: `srv2069.hstgr.io` (or IP `72.60.86.18`)
3. Your connection string is:

   ```
   mysql://u545116183_naitik:YOUR_PASSWORD@localhost:3306/u545116183_whatsapp?connection_limit=5&pool_timeout=20
   ```

   - Host is `localhost` because the Node app runs on the same plan.
   - Use `srv2069.hstgr.io` only when connecting from your computer or another external server after allowing that IP in **Remote MySQL**.
   - **URL-encode** special characters in the password (`@` → `%40`, `#` → `%23`, `/` → `%2F`, `:` → `%3A`).
   - Keep `connection_limit=5` — Hostinger caps MySQL connections per user; Prisma's default pool is larger and would trigger *"Too many connections"*.
   - The tables are created automatically on first start (`prisma db push`). No manual SQL needed.

---

## 2. Push the code to GitHub

Push this repository (as-is) to a GitHub repo you own. Do **not** commit `.env`.

---

## 3. Create the Web App in hPanel

1. hPanel → **Websites → Add Website → Node.js web app**
2. **Import Git repository** → connect GitHub → pick your repo → **Deploy**
3. On the deploy settings screen set **exactly**:

   | Field              | Value                                   |
   | ------------------ | --------------------------------------- |
   | Framework preset   | **Other**                               |
   | Node.js version    | **22** (20 also works)                  |
   | Root directory     | `/` (leave empty)                       |
   | Build script       | `build`                                 |
   | Output directory   | `.next`                                 |
   | Entry file         | `server.mjs`                            |
   | Package manager    | `npm`                                   |

4. In **Set environment variables**, click **Import .env** and upload `hostinger-production.env.example`, then edit the values (next section).
5. Click **Deploy**. The first build takes several minutes (installs deps, generates Prisma client, builds Next.js).

---

## 4. Environment variables (hPanel → Environment variables)

Set these **literal** values (Hostinger does not expand `${BASE_URL}` references):

| Key | Value |
| --- | --- |
| `DATABASE_URL` | `mysql://u545116183_naitik:CHANGE_DB_PASSWORD@localhost:3306/u545116183_whatsapp?connection_limit=5&pool_timeout=20` |
| `AUTH_SECRET` | random secret — run `openssl rand -base64 32` (or any 32+ char random string) |
| `BASE_URL` | `https://azure-dinosaur-903216.hostingersite.com` |
| `NEXTAUTH_URL` | `https://azure-dinosaur-903216.hostingersite.com` |
| `NEXT_PUBLIC_APP_URL` | `https://azure-dinosaur-903216.hostingersite.com` |
| `NEXT_PUBLIC_API_URL` | `https://azure-dinosaur-903216.hostingersite.com/api` |
| `AUTH_TRUST_HOST` | `true` |
| `NODE_ENV` | `production` |
| `ADMIN_EMAIL` | your login email (SuperAdmin is created automatically on first start) |
| `ADMIN_PASSWORD` | your login password |
| `NEXT_PUBLIC_SWAGGER_PASSWORD` | change from the default |
| `TZ` | e.g. `Asia/Kolkata` |
| `KEEP_ALIVE_ENABLED` | `true` |

If you change to a custom domain later, replace the URL in all four variables:

```env
BASE_URL="https://azure-dinosaur-903216.hostingersite.com"
NEXTAUTH_URL="https://azure-dinosaur-903216.hostingersite.com"
NEXT_PUBLIC_APP_URL="https://azure-dinosaur-903216.hostingersite.com"
NEXT_PUBLIC_API_URL="https://azure-dinosaur-903216.hostingersite.com/api"
```

Optional AI auto-reply variables:

| Key | Value |
| --- | --- |
| `AI_API_KEY` | your OpenAI / OpenAI-compatible provider key |
| `AI_API_URL` | `https://api.openai.com/v1/chat/completions` |
| `AI_MODEL` | `gpt-4o-mini` or another chat model supported by your provider |
| `AI_TEMPERATURE` | `0.7` |
| `AI_MAX_TOKENS` | `500` |
| `AI_SYSTEM_PROMPT` | default personality/instructions for AI replies |

**Remove** `PORT` and `HOSTNAME` — Hostinger injects `PORT` itself.

Saving the variables triggers a redeploy.

---

## 4.1 Enable AI auto-replies

After deployment:

1. Add the optional `AI_*` variables above in hPanel and redeploy.
2. Log in → **Bot Settings** → **Automation & Presence**.
3. Enable **AI Auto-Reply** for the selected WhatsApp session.
4. Choose the trigger mode:
   - **Fallback only**: keyword auto-reply rules are checked first; AI replies only if no rule matches.
   - **Always**: AI replies to every allowed text message, even if a keyword rule also matched.
5. Set the **AI System Prompt** to describe your business, tone, limits, and handoff instructions.

AI replies use the same Auto Reply access controls, whitelist/blacklist, and group/private permissions as normal auto-replies.

---

## 5. Keep the process alive (critical for WhatsApp)

Hostinger **stops idle Node processes** after a period without incoming HTTP traffic. A stopped process
means WhatsApp disconnects, scheduled messages don't send, and auto-replies stop.

WA-AKG mitigates this in two layers — **do both**:

1. **Built-in self ping** (already on): every `KEEP_ALIVE_INTERVAL_MINUTES` (default 4) the server requests
   `BASE_URL/api/health`, which counts as incoming traffic.
2. **External uptime monitor** (required for cold starts / after redeploys): create a free monitor on
   [UptimeRobot](https://uptimerobot.com) or [cron-job.org](https://cron-job.org) that calls
   `https://azure-dinosaur-903216.hostingersite.com/api/health` **every 5 minutes**. This also alerts you if the app goes down.

`/api/health` is public and returns `{"status":true,"database":"ok",...}` when the DB is reachable.

---

## 6. First login

Open `https://azure-dinosaur-903216.hostingersite.com` → log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` → **Sessions** → create a
session → scan the QR code with WhatsApp. Session credentials are stored in MySQL, so they survive redeploys.

---

## 7. Updating

Push to the connected branch → Hostinger rebuilds and restarts. The server re-runs `prisma db push` on
start, so schema changes are applied automatically.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Build log: *Next.js build produced no standalone server* | Framework preset is set to **Next.js**. Change it to **Other** with entry file `server.mjs`. |
| Runtime log: `AUTH_SECRET is not set` | Add `AUTH_SECRET` in Environment variables and save. |
| `Authentication failed against database server` | Wrong `DATABASE_URL` user/password/db name, or password not URL-encoded. |
| `Too many connections` | Add `?connection_limit=5&pool_timeout=20` to `DATABASE_URL`. |
| Login redirects to `${BASE_URL}` or `localhost` | `NEXTAUTH_URL` / `NEXT_PUBLIC_*` contain `${...}` or localhost — set literal https URLs. |
| WhatsApp disconnects after a few minutes of no dashboard use | Process was stopped for idleness — set up the external uptime monitor (step 5). |
| Media files disappear after redeploy | Downloaded media in `data/media` is on disk and is replaced on redeploy; messages/contacts/sessions are in MySQL and are safe. |
| Slow first request after a while | Cold start after idle stop — expected on shared hosting; the uptime monitor minimises it. |

### Resource notes
- Shared hosting RAM/CPU is limited. Keep `BAILEYS_LOG_LEVEL=error`, avoid dozens of simultaneous WhatsApp sessions, and use conservative broadcast delays.
- If you outgrow shared hosting, the same repo deploys unchanged to a **Hostinger VPS** with `./start.sh` (PM2) or `docker compose up -d`.

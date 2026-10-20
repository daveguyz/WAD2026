# Deploying CampusPulse to Cloudflare

The project runs in two ways from the same front end (`public/`):

| | Local (assignment demo) | Cloudflare (online) |
|---|---|---|
| Server | `server.js` – Node.js + Express | `cloudflare/worker.js` – Cloudflare Worker |
| Database | MySQL / MariaDB (`database/*.sql`) | Cloudflare D1, relational SQLite (`cloudflare/d1/*.sql`) |
| Passwords | bcrypt | PBKDF2-SHA256 (Web Crypto) |
| Sessions | express-session (memory) | `sessions` table in D1 |

Both expose the **same `/api/...` endpoints**, so the HTML, CSS and JavaScript are identical. Validation rules are shared (`utils/validate.js`).

GitHub Pages cannot host this project: it only serves static files and cannot run the server or database. That is why the Pages URL only shows the README.

---

## One-time setup (about 5 minutes)

Run these in a terminal inside the `campuspulse` folder (Windows PowerShell or CMD is fine).

```bash
# 1. install dependencies (includes the wrangler CLI)
npm install

# 2. log in to your Cloudflare account (opens the browser)
npx wrangler login

# 3. create the D1 database
npx wrangler d1 create campuspulse-db
```

Step 3 prints a block containing `database_id = "xxxxxxxx-...."`.
Copy that ID into **`wrangler.toml`**, replacing `REPLACE_WITH_YOUR_D1_DATABASE_ID`.

```bash
# 4. create the tables and sample data in the online database
npm run cf:db:remote

# 5. deploy
npm run cf:deploy
```

Wrangler prints your live URL, e.g. `https://campuspulse.<your-subdomain>.workers.dev`.
Log in with `admin@nust.na / Admin@123` or `200000@nust.na / Student@123`.

---

## Everyday commands

| Task | Command |
|---|---|
| Deploy latest code | `npm run cf:deploy` |
| Reset online data (fresh demo dates) | `npm run cf:db:remote` |
| Run the Cloudflare version locally | `npm run cf:db:local` once, then `npm run cf:dev` → http://localhost:8787 |
| View live logs | `npx wrangler tail` |

> `npm run cf:db:remote` **drops and recreates all tables**. Use it to reset the demo, not on real data.

## Optional: auto-deploy from GitHub

Cloudflare dashboard → **Workers & Pages** → `campuspulse` → **Settings → Build** → connect the `daveguyz/WAD2026` repository.
Leave the build command empty and keep the deploy command `npx wrangler deploy`. Every push to `main` then redeploys.
(Commit `wrangler.toml` with the real `database_id` first. The ID is not a secret.)

## Optional: custom domain

Workers & Pages → `campuspulse` → **Settings → Domains & Routes → Add custom domain** (the domain's DNS must be on Cloudflare).

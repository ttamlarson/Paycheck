# Paycheck backend (bank sync + AI assistant)

A single Cloudflare Worker. It keeps your Plaid and Anthropic keys off the website.

## Setup
1. Create a Plaid account (free sandbox) and copy your `client_id` and sandbox `secret`. Check that your bank's country is covered; other aggregators (TrueLayer, Basiq, Akahu) can replace the Plaid calls in `worker.js`.
2. Create an Anthropic API key at console.anthropic.com.
3. In this folder:
   ```
   npm i -g wrangler && wrangler login
   wrangler kv namespace create STORE      # paste the printed id into wrangler.toml
   wrangler secret put PLAID_CLIENT_ID
   wrangler secret put PLAID_SECRET
   wrangler secret put ANTHROPIC_API_KEY
   wrangler secret put APP_TOKEN           # a long random string only you know
   ```
4. Edit `wrangler.toml`: set `ALLOWED_ORIGIN` to your GitHub Pages origin (no path), plus `PLAID_COUNTRIES`.
5. `wrangler deploy`. Note the `https://paycheck-api.<you>.workers.dev` URL.

## Link your bank (once per bank)
Open `https://paycheck-api.<you>.workers.dev/link?key=YOUR_APP_TOKEN` and follow the prompts. In sandbox, use `user_good` / `pass_good`. Clear that URL from your browser history afterwards.

## Connect the app
In Paycheck, tap **Backend settings**, paste the Worker URL and your `APP_TOKEN`, then use **Sync bank** or **Ask about your budget**.

## Notes
- Production Plaid access needs Plaid's approval and has costs. Sync pulls up to 500 transactions per bank per request.
- The assistant receives a summary of your budget (totals, categories, goals, debts), not account numbers.
- Anyone with `APP_TOKEN` can read your transactions, so keep it secret and rotate it with `wrangler secret put APP_TOKEN` if exposed.
- Sync is on demand. For automatic refresh, call it on app open or add a Plaid webhook.

# Deploying to cPanel Node.js hosting

Target: Node.js 20 LTS or 22 LTS.

## What runs where

- `vite build` produces:
  - `dist/public/` — static client assets
  - `dist/server/` — the SSR + server-function bundle (standalone Node server)
- `server.js` (project root) is the Passenger/cPanel entry point. It loads
  `.env`, applies defaults (`PORT`, `HOST`, `NODE_ENV`) and imports
  `dist/server/index.mjs`.

## Steps

1. Upload the project (or a ZIP of it) containing:
   `server.js`, `package.json`, `package-lock.json`, `.env.example`, `src/`,
   `public/`, `vite.config.ts` — and `dist/` if you build locally.
2. In cPanel → Setup Node.js App:
   - Application root: the uploaded folder
   - Application startup file: `server.js`
   - Node version: 20 or 22
3. Copy `.env.example` to `.env` and fill in the values.
   `VITE_*` values are inlined at build time, so set them **before** building.
4. Run in the app's terminal:

   ```bash
   npm install
   npm run build
   npm start   # cPanel/Passenger does this for you
   ```

## Notes

- `SUPABASE_SERVICE_ROLE_KEY` is read only inside server functions. Never give
  it a `VITE_` prefix and never import it from client code.
- No serverless/edge/Vercel/Netlify features are used; the build targets the
  Nitro `node-server` preset (`vite.config.ts`).
- `PORT` is provided by Passenger; `server.js` falls back to `3000` locally.

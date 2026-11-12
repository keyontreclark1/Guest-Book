# Guestbook

A React and TypeScript guestbook with GitHub sign-in and permanent MongoDB storage.

## Run locally

Requirements: Node.js 20+ and MongoDB (local or MongoDB Atlas).

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and set your GitHub OAuth app's client ID and secret.
   For local development, set its callback URL to
   `http://localhost:3001/auth/github/callback`.
3. Set `MONGODB_URI` to your MongoDB connection string and `SESSION_SECRET` to a
   long, random value.
4. Start the app: `npm run dev`
5. Open <http://localhost:5173>.

The Vite development server proxies API and sign-in requests to the local Node
server. Create a GitHub OAuth app at
<https://github.com/settings/developers>.

## Deploy to Vercel

The Vite build outputs the React site to `public/`; Vercel serves it as static
assets and deploys the Express app as a serverless function.

1. Push this repository to GitHub and import it into Vercel.
2. Set the build command to `npm run build`. Vercel detects the Express entry
   point in the root `index.ts`; no custom output directory is needed.
3. Add `NODE_ENV=production`, `MONGODB_URI`, `SESSION_SECRET`,
   `GITHUB_CLIENT_ID`, and `GITHUB_CLIENT_SECRET` in Vercel's Production
   environment settings. Use a MongoDB Atlas connection string reachable from
   Vercel.
4. After the first deployment, set `GITHUB_CALLBACK_URL` to
   `https://<your-vercel-domain>/auth/github/callback` in Vercel, then add that
   same URL as the callback URL in your GitHub OAuth app. Redeploy after setting
   the environment variable.
5. Set the GitHub OAuth app homepage URL to your Vercel domain.

Use the deployed Vercel URL as the public guestbook address. The OAuth session
and messages are stored in MongoDB, not on Vercel's temporary filesystem.

## Local production build

Run `npm run build`, then `npm start`. The local Node server serves the built
React app and API on `PORT` (3001 by default).

## Environment

See `.env.example` for the required variables. Keep credentials in environment
settings, not in source control. Messages are stored without an expiry policy;
the UI exposes no edit or delete action.

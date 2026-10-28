# Walking Challenge

A responsive web application for district walking and marathon challenges in Kerala. People sign in, join a challenge, and record a walk from a phone browser. Administrators manage users, challenges, participants, sessions, and the leaderboard.

The application follows the same stack as the VMS visitor app: Next.js App Router, React, Neon PostgreSQL, JWT session cookies, bcrypt password hashes, and Tailwind CSS. It does not use the visitor database, visitor screens, multi-tenant schemas, or any payment or subscription feature.

## Technology

- Next.js 16.2.3 and React 19
- PostgreSQL on Neon, accessed with `@neondatabase/serverless` and `pg`
- HTTP-only JWT session cookie signed with `jose`, checked in `src/proxy.js` before protected pages load
- Passwords hashed with `bcryptjs`
- Tailwind CSS 4
- Leaflet and OpenStreetMap for maps
- Zod for server-side validation

The VMS application is multi-tenant and includes subscription billing. This application is a single organization with two roles, `admin` and `user`. The session cookie is named `walking_session` so it does not collide with the VMS cookie on localhost.

## Local setup

1. Create a Neon project or database that is separate from the VMS database. The database name `walkingapp` is used in the example below.
2. Copy `.env.example` to `.env.local`.
3. Set `DATABASE_URL` to that database's connection string.
4. Set `SESSION_SECRET` to a random string of at least 16 characters.
5. Set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_FULL_NAME`, and optionally `ADMIN_MOBILE`. The password must be at least 10 characters and include letters and numbers. Do not commit these values.
6. Install, create the tables, and create the administrator:

```bash
npm install
npm run db:schema
npm run db:seed
npm run dev
```

Open http://localhost:3010 and sign in with `ADMIN_EMAIL`. The seed command reads `ADMIN_PASSWORD` from the environment and does not print it. If that administrator already exists, run `ADMIN_RESET=1 npm run db:seed` to replace the password.

`npm run db:schema` applies `sql/001_schema.sql`. It can be run again. It only changes the database named in `DATABASE_URL`.

## Tests

```bash
npm test
npm run test:flow
```

`npm test` checks distance, progress, and GPS filtering with simulated points. `npm run test:flow` uses the configured database, records a short simulated walk, checks that finishing twice does not double the distance, and then deletes that test data.

Set `NEXT_PUBLIC_GPS_SIMULATION=true` only on a local machine if you want an **Add simulated step** button while a walk is running. Leave it `false` or unset in production.

## Publish from the app

Administrators have a Publish page. It asks for a GitHub token and a Vercel token, creates a private repository, pushes the code without environment files, stores the database and session settings as encrypted Vercel variables, and then shows the public HTTPS link on that same page. Open it from the project running on your computer. The hosted copy cannot upload the source.

## Deployment

The app is a standard Next.js server application. Deployment files are `Dockerfile`, `docker-compose.yml`, `deploy/Caddyfile`, and `vercel.json`. Do not put real secrets in those files. Set them in the host environment or in `.env.local`, which is not copied into the image.

Prepare the database from a trusted machine before the first start:

```bash
npm run db:schema
npm run db:seed
```

### Docker

`.env.local` must contain `DATABASE_URL` and `SESSION_SECRET`. Then:

```bash
docker compose up --build -d
```

The site listens on port 3010. For a public phone, GPS needs HTTPS. Set `SITE_ADDRESS` to the domain that points at this machine, set `NEXT_PUBLIC_APP_URL` to `https://` that domain, and start the HTTPS proxy:

```bash
docker compose --profile https up --build -d
```

Caddy obtains the certificate and forwards traffic to the app. Rebuild the image after changing `NEXT_PUBLIC_APP_URL`, because that value is included at build time.

### Vercel

`vercel.json` selects the Next.js build. In the project settings, add `DATABASE_URL`, `SESSION_SECRET`, `SESSION_MAX_AGE_SECONDS`, and `NEXT_PUBLIC_APP_URL`. Set `NEXT_PUBLIC_GPS_SIMULATION` to `false`.

### Node host

```bash
npm ci
npm run build
npm run start
```

Set the same variables as `.env.example`. `DATABASE_URL` and `SESSION_SECRET` must be server environment variables, never `NEXT_PUBLIC_` values.

Use HTTPS in production. Mobile browsers generally provide GPS only on `https://` pages and on `http://localhost` during development. The first walk asks for location permission. The page explains that location is used to measure the walk.

## Roles

Administrators see Dashboard, Users, Challenge Settings, Challenge Participants, Walking Sessions, Leaderboard, My Walking, and Logout.

Participants see their own dashboard and logout. They can join an active challenge, view the map, and start, pause, resume, or finish a walk. They cannot open administrator pages or another person's sessions.

## Progress

For each participant:

- completed distance is the sum of that person's walking-session distances for the challenge
- remaining distance is zero or the official challenge distance minus the completed distance
- progress percentage is that ratio, capped at 100

The official challenge distance is entered by an administrator. A map suggestion can fill it in, and the administrator can change it. The percentage is cumulative walked distance. The map shows the recorded GPS path and, when available, a separate district-to-district reference line. The walker is not placed along the reference line according to the percentage.

## Features

- Email and password login, logout, and inactive-account rejection
- Administrator user list, create, edit, view, activate, deactivate, delete when unused, and password reset
- Challenge create, edit, view, activate, cancel, and draft delete
- Kerala district lists and an optional route-distance suggestion
- Joining a challenge once
- Mobile walking screen with start, pause, resume, finish, and recovery of an open session after refresh
- GPS filtering for poor accuracy, stationary noise, and impossible jumps
- Batched GPS saves and server-side distance calculation
- Read-only route inspection for administrators
- Leaderboard ranked within each challenge
- Separate Neon database and environment-variable configuration

## Limitations

- A normal mobile browser can stop GPS updates when the phone is locked or the browser is in the background. This app saves progress regularly and restores an open session, but it cannot promise continuous background tracking. A native app would be required for that.
- Browser GPS can be inaccurate or spoofed. Distances are filtered and calculated on the server, but they are not a legal or surveyed measurement.
- The district-to-district line comes from the public OSRM demo service when it is reachable. It is a reference only. If OSRM is unavailable, the form still saves the distance the administrator enters.
- Login rate limits are kept in memory on each server process.
- Installing the site to a phone home screen does not enable background GPS.
- There is no payment, subscription, or membership billing.

## Security notes

- Database credentials stay in server environment variables.
- Passwords are bcrypt hashes.
- Administrator actions are checked on the server, not only by hiding menus.
- Session cookies are HTTP-only and, in production, secure.
- State-changing requests from another website origin are rejected.
- Client-submitted distance totals are not trusted. The server sums accepted GPS points inside a database transaction.
- Recorded GPS points have no edit screen.

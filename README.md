# Halo

A focused Nostr client for reading, searching, and publishing notes.

Live site: [https://haloapp.fyi](https://haloapp.fyi)

## What Halo includes

- Multi-account Nostr login flows (`nsec`, `npub`, NIP-07 extension, Bunker, and Nostr Connection)
- Four primary surfaces: Home, Search, Notifications, and Account
- Three visible feeds: Following, Trending, and Saved
- A centered reading column on desktop and mobile
- Contextual note composition from Home
- Nostr note rendering, replies, reactions, moderation, and relay-backed publishing
- Long-form article and live-stream deep links
- Backup and restore via local JSON export/import and Nostr sync using NIP-78
- Advanced relay, publishing, specialist-feed, and scheduled-post settings
- PWA setup via `vite-plugin-pwa` and route-level lazy loading

## Tech Stack

- React + TypeScript + Vite
- Tailwind CSS + Radix UI
- Central Icons, rounded outlines with filled variants for selected states
- `nostr-tools` for protocol/event handling
- i18next for localization

## Local Development

Set `CENTRAL_LICENSE_KEY` in your shell before installing dependencies or building
with Docker. Central's licensed packages check this variable during installation.
Docker Compose passes it as a build secret, so it stays out of the image.
For CI and hosted builds, set the same variable in the app's build secrets.
Never use a `VITE_` prefix for the license key or commit it to the repository.

Icons use individual imports from the official `@central-icons-react` packages.
Convert icons in newly generated UI components to Central imports too.
`npm run dev` and `npm run build` generate the emoji picker's icon assets from
these packages; the generated files are ignored by Git.

### Option 1: Docker (recommended for URL preview/proxy support)

```bash
git clone git@github.com:karnagebitcoin/halo.git
cd halo
docker compose up -d
```

App: `http://localhost:8089`

### Option 2: Node only (fastest app iteration)

```bash
git clone git@github.com:karnagebitcoin/halo.git
cd halo
npm install
npm run dev
```

### Option 3: Dev stack with local relay

```bash
docker compose -f docker-compose.dev.yml up -d
```

This starts:
- Halo app (`8089`)
- proxy server (`8090`)
- local `nostr-rs-relay` (`7000`)

## Useful Scripts

```bash
npm run dev
npm run build
npm run lint
npm run typecheck
npm run test
npm run guardrails:staged
npm run guardrails:full
npm run format
npm run audit:maintainability
```

## Change Guardrails

We now keep a shared change-safety checklist in [docs/CHANGE_GUARDRAILS.md](docs/CHANGE_GUARDRAILS.md) and use it on every change.

- `npm run guardrails:staged` is the fast gate for day-to-day commits. It lints staged files, runs related regression tests, typechecks the app, and builds when config-sensitive files change.
- `npm run guardrails:full` is the deeper pass for cross-cutting or risky work. It runs repo-wide lint, typecheck, tests, and production build.
- `npm install` automatically configures the repo's `pre-commit` hook through the `prepare` script, and each completed change should be committed immediately after the guardrails pass.

## Acknowledgment

Halo is forked from Cody Tseng's Jumble project.

Huge thanks to Cody Tseng for building and open-sourcing the foundation this project is built on.

Original project: [https://github.com/CodyTseng/halo](https://github.com/CodyTseng/halo)

## License

MIT

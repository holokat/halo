# Halo

A customizable Nostr client focused on real-time social feeds, lists, reads, live activity, and widgets.

Live site: [https://halo.social](https://halo.social)

## What Halo Includes

- Multi-account Nostr login flows (`nsec`, `npub`, NIP-07 extension, Bunker, and Nostr Connection)
- Core social surfaces: Home, Explore, Reads, Notifications, Search, Profile
- Rich feed switching: following, bookmarks, one-note-per-person, relay sets, custom feeds
- List system: create/edit/follow/share lists, list pages, and list previews
- Long-form article support with markdown rendering and Nostr-aware links
- Live stream support (NIP-53 style flows): discovery and live detail view
- Backup and restore via local JSON export/import and Nostr sync using NIP-78
- Highly customizable UI (themes, palette, font controls, radii, media style, sidebar/menu controls, widget sidebar controls)
- Optional widgets including Trending Notes, Bitcoin Ticker, Pinned Note widgets, and Invite widget
- Media and post tooling: image/gallery flows, GIF picker, polls, note expiration, relay targeting, upload service settings
- PWA setup via `vite-plugin-pwa` and route-level lazy loading for better performance

## Tech Stack

- React + TypeScript + Vite
- Tailwind CSS + Radix UI
- `nostr-tools` for protocol/event handling
- i18next for localization

## Local Development

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

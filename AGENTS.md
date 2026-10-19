This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## This project (ODOS)

ODOS is a single-screen GPS app (no Expo Router): a full-screen Mapbox map with bottom sheets.

- `src/core/` — pure TypeScript logic with no React Native imports: geometry, fuel model, gas-stop
  picking, lane scoring (70% live / 30% human-flow), route parsing, turn-by-turn tracking, vehicle
  registry and search. Keep it that way so it stays unit-testable with `npm test`.
- `src/services/` — network and device I/O: Mapbox APIs, fueleconomy.gov / NHTSA, Overpass,
  Recreation.gov, offline tile packs, AsyncStorage.
- `src/state/useOdos.ts` — the hook that owns app state and wires core + services together;
  `src/state/useWeather.ts` handles weather and feeds a fuel-efficiency factor back into it.
- `src/ui/` — components and sheets. All touch targets are at least 56 px and labeled for screen readers.
- Tunable rules (50-mile buffer, 15–30 mile gas window, 2-hour rest limit, lane weights) live in `src/config.ts`.

Before declaring a change done, run `npm test`, `npm run typecheck` and `npm run lint`.

Sheets that load data are mounted only while open (fresh state each time) and load through
`src/ui/useAsync.ts`; follow that pattern rather than calling setState at the top of an effect.

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

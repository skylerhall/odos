# ODOS

*ὁδός (odós): Greek for "road" or "way."*

A road-trip GPS app for Android, built with Expo and Mapbox. It gives turn-by-turn directions with
live traffic, and it also handles the things other map apps leave to you: when to get gas, where to
stop for the night, and how to get around on trails with no signal.

ODOS is open source under the [MIT License](LICENSE). Fork it, learn from it, build on it.

## Features

| Feature | How it works |
|---|---|
| **Turn-by-turn** | Mapbox routing with live traffic, a route line colored by congestion, voice prompts and automatic rerouting. Long trips past Mapbox's per-request distance limit are routed in pieces and joined into one route. |
| **Trip controls** | Search from the top bar to add a stop or reroute mid-trip, go back to the original trip, or end navigation. Long-press anywhere on the map to drop a pin and go there. |
| **Avoid tolls** | One toggle. If no toll-free route exists, ODOS says so and uses the toll route. |
| **Speed** | A small capsule shows your speed with the posted limit beside it, and turns red when you're more than 5 mph over. |
| **Vehicle match** | Type "dodge" and you get every Dodge in the built-in list (about 390 vehicles, works offline). Add the year, like "2007 tundra 4.7", and the same search also pulls exact matches from the EPA list of every US vehicle since 1984. You can also decode a VIN through NHTSA or enter your own numbers. Your position marker is a car, pickup or van to match. |
| **Fuel tracking** | Set your starting fuel level in eighths. Fuel burns as you drive at your vehicle's EPA MPG, adjusted for speed. Range is estimated at the pace you'll drive on this route. |
| **50-mile buffer** | When range drops to 50 miles, ODOS alerts you, searches for gas **15–30 miles ahead on your route**, and adds the best station as a stop. "Nearest gas station" in search lists what's close. |
| **Rest finder (≤ 2 hrs)** | Hotels, campgrounds (including federal ones) and free overnight parking (rest areas, truck stops, free campsites) within a 2-hour drive of you, your next stop, your destination or a dropped pin. |
| **Trail Mode** | Download trails around a point ahead of time, then navigate them with no signal: on foot or off-road (vehicles stay off footpaths and are warned about gates). Includes a topo map, a breadcrumb track with a route back, dead-end warnings, and a compass arrow when you're off the trail network. |
| **Offline** | When a trip starts, ODOS saves map tiles along the route plus gas stations, hotels and campgrounds along the corridor, so the fuel alert and pickers keep working without signal. |
| **Weather** | Current conditions, the forecast along your route for the hour you'll reach each point, National Weather Service alerts, and rain, snow and fog drawn on the map. Bad weather lowers the range estimate. |
| **Saved places** | Recent places, plus shortcuts like Home and Work. |
| **Day and night** | Switches to the dark map at sunset and back at sunrise for where you are, or by hand. Portrait and landscape layouts. |
| **Share / copy** | Share your coordinates with a map link that works on any phone, or copy `lat, lon`. |
| **Accessibility** | Every button is at least 56 px, high-contrast and labeled for screen readers. |
| **Sim mode** | Drives your route at 1×, 4×, 16× or 60× so you can watch the fuel alert and auto gas stop without leaving the couch. |

## Try it

The latest Android build is always at
[Releases → ODOS for Android (latest build)](https://github.com/skylerhall/odos/releases/latest).
On your phone, tap `odos.apk`, then Install. Android asks once to allow installs from your browser;
that's normal for apps from outside the Play Store.

## Build your own

You need Node 22 and a free [Mapbox](https://www.mapbox.com) account.

1. **Get a Mapbox public token.** Open [Access tokens](https://account.mapbox.com/access-tokens) and
   copy the **Default public token** (it starts with `pk.`).
2. **Install and add the token:**
   ```bash
   git clone https://github.com/skylerhall/odos.git
   cd odos
   npm install
   cp .env.example .env      # then paste your pk. token into .env
   ```
3. *(Optional)* Add a free [Recreation.gov RIDB key](https://ridb.recreation.gov) to `.env` as
   `EXPO_PUBLIC_RIDB_KEY` for federal campgrounds in the rest finder.

Then pick one:

- **Build in GitHub Actions (nothing to install).** In your fork, enable Actions, then add a
  repository secret named `MAPBOX_TOKEN` (Settings → Secrets and variables → Actions). Every push to
  `main` builds an APK and publishes it to your fork's Releases.
- **Build on your computer** (needs Android Studio once): `npm run apk` builds `odos.apk`.
- **Build with EAS** (Expo's cloud):
  ```bash
  npx eas-cli@latest login
  npx eas-cli@latest env:create --name EXPO_PUBLIC_MAPBOX_TOKEN --value pk.your_token --environment preview --visibility plaintext
  npx eas-cli@latest build -p android --profile preview
  ```
- **Develop with live reload:** `npm run android` with a phone plugged in or an emulator running.
  ODOS uses native Mapbox, so it doesn't run in Expo Go.

### Signing

Without signing secrets, builds use the shared Android debug key. That's fine for trying the app, but
only builds signed with the same key install over each other, and Google Play needs your own key. To
sign with yours, create a keystore with the alias `odos` and add two repository secrets:
`ANDROID_KEYSTORE_BASE64` (the keystore file, base64-encoded) and `ANDROID_KEYSTORE_PASSWORD`. See
`scripts/ci/load-signing-key.sh` and `plugins/withReleaseSigning.js`. Never commit a keystore.

### Publishing a fork

If you publish your own build, please make it your own:

- Change `name`, `slug` and `android.package` in `app.json` (the package name must be unique on
  Google Play).
- Use your own name and icon (see [Name and logo](#name-and-logo)).
- Set `APP_CONTACT` in `src/config.ts` to your app's name and a page people can reach you through.
  OpenStreetMap and the National Weather Service ask apps to identify themselves.
- Check the terms of the data services below, especially if your app is commercial.
- Write your own privacy policy. `docs/privacy-policy.md` describes this app and is a starting point.

## Data sources

| Service | Used for | Terms to know |
|---|---|---|
| [Mapbox](https://www.mapbox.com) | Maps, routing, traffic, search | Free tier, then paid. Its logo and attribution must stay visible on the map. |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) via [Overpass](https://wiki.openstreetmap.org/wiki/Overpass_API) | Trails, free overnight parking | © OpenStreetMap contributors, [ODbL](https://opendatacommons.org/licenses/odbl/). The public Overpass servers are shared; keep requests light. |
| [Open-Meteo](https://open-meteo.com) | Weather and forecasts | The free API is for **non-commercial use**. Commercial apps need an Open-Meteo plan. |
| [National Weather Service](https://www.weather.gov/documentation/services-web-api) | Weather alerts (US) | Public domain. |
| [fueleconomy.gov](https://www.fueleconomy.gov/feg/ws/) and [NHTSA vPIC](https://vpic.nhtsa.dot.gov/api/) | Vehicle MPG, VIN decoding | US government data. |
| [Recreation.gov RIDB](https://ridb.recreation.gov) | Federal campgrounds | Free key. |

## Project layout

```
src/
  config.ts       Tunable rules: 50-mi buffer, 15–30 mi gas window, 2-hr rest limit, trail settings
  core/           Pure TypeScript, unit-tested: geometry, fuel, routes, turn-by-turn, trails, vehicles, search
  services/       Network and device I/O: Mapbox, Overpass, Open-Meteo, NWS, EPA, NHTSA, offline packs, storage
  state/          useOdos (GPS, routing, fuel, persistence), useWeather, useTrail
  ui/             Map, banner, panels, sheets
tests/            npm test (tests/live hits real APIs: npm run test:live)
plugins/          Expo config plugins (release signing)
scripts/          APK build, CI helpers, position-marker artwork
```

Checks before a pull request: `npm test`, `npm run typecheck` and `npm run lint`. See
[CONTRIBUTING.md](CONTRIBUTING.md).

## Roadmap

- **Lane advice on screen.** The lane-scoring engine (70% live lane speed, 30% historical flow) is in
  `src/core/lanes.ts`, but no public API provides live per-lane speeds, so it only runs in Sim mode
  and isn't shown while driving.
- **Background navigation:** keep guiding with the screen off.
- **Live location sharing:** a link that updates as you drive.
- **Hazard reports:** police, closures and road hazards, through a small backend.
- **iOS.** The app is built with Expo and should build for iOS, but it's only been tested on Android.

## Privacy

ODOS has no accounts, no ads, no analytics of its own and no server. Your location goes only to the
map, routing, weather and search services above, to answer your request. Trips, vehicles and saved
places stay on your phone. The Mapbox map sends anonymous usage data to Mapbox, which you can turn
off from the (i) button on the map. Full policy: [docs/privacy-policy.md](docs/privacy-policy.md).

ODOS asks for location permission the normal way and never tries to get around the phone's settings.

## Name and logo

The code is MIT-licensed. The ODOS name and logo are not part of that license: if you publish a fork,
please give it its own name and icon so people can tell them apart.

## License

[MIT](LICENSE) © 2026 Egghead Development

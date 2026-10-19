# ODOS

*ὁδός (odós): Greek for "road" or "way."*

A GPS app for road trips. It does turn-by-turn directions with live traffic, and it also handles the
things Google Maps and Waze leave to you: when to get gas, where to stop, which lane to be in, and
how to send someone your location.

## What it does

| Feature | How it works |
|---|---|
| **Vehicle match** | Type "dodge" and you get every Dodge in the built-in list (about 300 vehicles, works offline). For an exact match, step through the official EPA list (year → make → model → engine) or decode a VIN through NHTSA. You can also type in your own numbers. |
| **Fuel tracking** | Fuel burns as you drive, at your vehicle's EPA MPG, adjusted for speed (efficiency drops above 55 mph). Range is estimated at the pace you'll actually drive on this route, and the app shows how much range you'll have left when you arrive. |
| **50-mile buffer** | When range drops to 50 miles, ODOS alerts you, searches for gas **15–30 miles ahead on your route**, and adds the best station as a stop automatically. |
| **One-tap fill-up** | Tap "I just filled up" and the tank resets to full, the auto gas stop is cleared, and ODOS tells you how many miles until the next fuel alert. |
| **Rest finder (≤ 2 hrs)** | Shows hotels, campgrounds (including federal ones) and free overnight parking (rest areas, truck stops, Walmart lots, free campsites) within a 2-hour drive. You choose the starting point: you, the next stop, the destination, or any pin you drop by long-pressing the map. Tap **+ Add** and it becomes the next stop. |
| **Turn-by-turn** | Mapbox routing with live traffic, a route line colored by congestion, voice prompts, automatic rerouting, and lane arrows for the next turn. |
| **Lane advice** | Each lane is scored as **70% live speed + 30% historical "human-flow" speed**. When that 30% changes which lane wins (the "slow lane is actually faster" case), it's labeled *human-flow flip*. Suggestions only change after a lane has been best for 8 seconds and is at least 3 mph faster, so they don't flicker. |
| **Offline** | When a trip starts, ODOS saves map tiles along the whole route (20 miles each side at low zoom, 2 miles each side at street level). It also saves gas stations, hotels and campgrounds along the corridor, so the fuel alert, gas picker and rest finder keep working without signal. |
| **Weather** | A badge next to the map shows the conditions and temperature, and turns amber for hazards. The map shows the weather too: Mapbox-rendered rain and snow that tilt with the 3D view, plus a sun glow, drifting clouds, fog banks, and lightning flashes in storms. ODOS checks the forecast **along your route for the hour you'll reach each point**, warns you once about hazards ahead ("Heavy snow on your route in about 40 miles"), reads official National Weather Service alerts, and lowers the range estimate for rain, snow and cold (much more for EVs). Effects can be turned off, pause when the phone's Reduce Motion setting is on, and can be previewed from the weather sheet. |
| **Share / copy** | One tap opens the share sheet with your coordinates and a map link that works on any phone. Another tap copies `lat, lon` to the clipboard. |
| **Accessibility** | One-tap toggles for voice, night mode, traffic and Sim. Every button is at least 56 px, high-contrast and labeled for screen readers. |
| **Sim mode** | Drives your route at 1×, 4×, 16× or 60× speed so you can watch the fuel alert, auto gas stop and lane logic happen without leaving the couch. |

## Setup (one time)

1. **Get a Mapbox token.** Create a free account at mapbox.com, open
   [Access tokens](https://account.mapbox.com/access-tokens), and copy the **Default public token**
   (it starts with `pk.`). The secret download token older guides mention isn't required anymore.
2. **Install and add the token:**
   ```bash
   git clone https://github.com/skylerhall/odos.git
   cd odos
   npm install
   cp .env.example .env      # then paste your pk. token into .env
   ```
3. *(Optional)* Get a free [Recreation.gov RIDB key](https://ridb.recreation.gov) and add it to `.env`
   as `EXPO_PUBLIC_RIDB_KEY`. This adds federal campgrounds to the rest finder.

## Put it on your phone

**Option A: build the APK on your computer** (you need Android Studio installed once):

```bash
npm run apk
```

This checks your token, Java and the Android SDK, builds a release APK, and saves it as `odos.apk`
in the project folder. Upload it to Google Drive, open it on your phone, and tap Install. Android
asks once to allow installs from Drive; that's normal for sideloading.

**Option B: build in the cloud** (nothing to install except Node):

```bash
npx eas-cli@latest login
npx eas-cli@latest env:create --name EXPO_PUBLIC_MAPBOX_TOKEN --value pk.your_token --environment preview --visibility plaintext
npx eas-cli@latest build -p android --profile preview
```

When the build finishes, EAS gives you a link and QR code. Open it on your phone to install.

**For development** (live reload while you change code): `npm run android` with the phone plugged in
or an emulator running. ODOS uses native Mapbox, so it won't run in Expo Go.

## Project layout

```
src/
  config.ts          The rules: 50-mi buffer, 15–30 mi gas window, 2-hr rest limit, lane weights
  core/              Pure logic, unit-tested: geo, fuel, places, lanes, route, nav, vehicles
  services/          Mapbox, fueleconomy.gov, NHTSA, OpenStreetMap, Recreation.gov, Open-Meteo, NWS, offline packs
  state/             useOdos (GPS, routing, fuel, lanes) and useWeather (conditions, route forecast, alerts)
  ui/                Map, maneuver + lane banner, fuel panel, weather effects, sheets
tests/              npm test
scripts/build-apk.sh npm run apk
```

Checks: `npm test`, `npm run typecheck` and `npm run lint`.

## What's real and what's next

What works now:
- Routing, traffic, lane arrows, voice prompts, rerouting, search, gas and rest lookups, weather,
  and offline map tiles all use real APIs.
- The fuel model, the 50-mile buffer and the 15–30 mile gas window run on real GPS distance.

What's still simulated:
- **Live per-lane speeds.** No public traffic API provides them. Lane arrows (which lanes make your
  next turn) are real map data. The speed-based 70/30 lane advice runs on simulated lane speeds in
  Sim mode until a real data source exists.

Roadmap, in order:
1. **Camera lane detection.** An on-device model works out which lane you're in from a dash-mounted
   phone. That makes "move one lane left" possible instead of only "best lane."
2. **Crowdsourced lane speeds.** Camera-equipped ODOS drivers report lane speeds anonymously. That
   supplies the live 70% and builds the historical 30% human-flow data.
3. **Waze-style reports.** Hazards, police and closures, through a small backend.
4. **Live location sharing.** A link that updates as you drive. This needs the same backend.
5. **Background navigation.** Keep guiding with the screen off.
6. **Native Mapbox Navigation SDK module.** Rerouting even with no signal at all.

A note on phone settings: ODOS asks for location permission the normal way and never tries to get
around the phone's settings. Android blocks that, and apps that try get flagged as malware.

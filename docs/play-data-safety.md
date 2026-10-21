# Google Play: Data safety answers for ODOS

Answers for Play Console → **App content → Data safety**, based on what the code does as of
October 21, 2026. Re-check them whenever a feature adds a new service or a new kind of data.

Play's definitions, as they apply here:
- **Collected** means it leaves the phone, including requests your app sends to an API directly.
- **Shared** means it goes to a third party for that party's own use. Sending data to a service that
  processes it for you (Mapbox routing, weather lookups) counts as collected, not shared. So does
  anything sent where the user explicitly asked (Share location).

## Step 1: Data collection and security

| Question | Answer | Why |
| --- | --- | --- |
| Does your app collect or share any of the required user data types? | **Yes** | Location, searches, VIN (see Step 2) |
| Is all of the user data collected by your app encrypted in transit? | **Yes** | Every endpoint is HTTPS |
| Which of the following methods of account creation does your app support? | **My app does not allow users to create an account** | No accounts |
| Do you provide a way for users to request that their data is deleted? | **No** (if offered, add: "ODOS stores data only on the device; uninstalling or clearing app storage deletes it.") | The developer holds no user data, and the deletion URL is only required for apps with accounts |
| Has your app undergone an independent security review? | **No** | |

## Step 2: Data types

Mark everything **not** listed here as not collected: personal info (except below), financial info,
health and fitness, messages, photos and videos, audio, files and docs, calendar, contacts, web
browsing.

### Location → Precise location *(also select Approximate location, same answers)*
- Collected: **Yes**. Shared: **Yes** (only the Mapbox telemetry below is sharing).
- Processed ephemerally: **No**. The services may keep logs, and ODOS can't promise they don't.
- Required or optional: **Optional**. Users can deny the permission and still search and pin places.
- Purposes, collected: **App functionality**.
- Purposes, shared: **Analytics**. The Mapbox map sends Mapbox de-identified location and usage
  telemetry to improve its maps. Users can turn it off with the (i) button on the map.

### App activity → In-app search history
- Collected: **Yes**. Shared: **No**. Place searches go to Mapbox Search to get results.
- Processed ephemerally: **No**. Required or optional: **Optional**. Purpose: **App functionality**.

### Personal info → Other info
- Collected: **Yes**. Shared: **No**. A VIN, if the user chooses to decode one, goes to NHTSA vPIC.
- Processed ephemerally: **No**. Required or optional: **Optional**. Purpose: **App functionality**.
- Arguably a VIN isn't personal information, but declaring it is the cautious choice.

### Device or other IDs
- Collected: **Yes**. Shared: **Yes**.
- Processed ephemerally: **No**. Required or optional: **Required**.
- Purposes, collected: **App functionality** (the Mapbox library uses an anonymous
  per-installation ID to count monthly active users for billing).
- Purposes, shared: **Analytics** (Mapbox telemetry, which users can turn off).
- Mapbox doesn't document this for Play's form, so these answers are the cautious reading of
  [mapbox.com/telemetry](https://www.mapbox.com/telemetry). Mapbox says it collects no advertising IDs.

## Things that are *not* collection
- **Share location / Copy coordinates**: done only when the user taps, and sent only where they choose.
- **Vehicle year/make/model** sent to fueleconomy.gov: describes a car model, not a person.
- **Settings, vehicle, fuel level, shortcuts (Home, Work…), recent places, offline maps, Trail Mode areas and tracks**: stored only on
  the device.
- **Automatic night map**: sunset and sunrise are calculated on the phone; nothing is sent.
- **Spoken directions**: the phone's built-in text-to-speech.

## Other App content forms
- **Privacy policy**: https://skylerhall.github.io/odos-privacy/
- **Ads**: No ads.
- **App access**: All functionality is available without special access (no login).
- **Target audience**: 18 and over (a driving app). This keeps it out of the Families program.
- **Content rating**: fill in the questionnaire honestly (no violence, user-generated content or
  gambling; the app shares the user's location only when they choose). Expect an "Everyone" rating
  with a "Shares location" notice.
- **Location permission**: ODOS asks only for location while in use, not background location, so no
  background-location declaration is needed.

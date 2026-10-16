// Tunable rules from the ODOS spec live here so they are easy to find and change.

export const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';
/** Optional: free key from https://ridb.recreation.gov for federal campgrounds. */
export const RIDB_KEY = process.env.EXPO_PUBLIC_RIDB_KEY ?? '';

export const FUEL = {
  /** Alert and auto-plan a gas stop when estimated range drops to this many miles. */
  bufferMiles: 50,
  /** Auto gas stops are placed this far ahead of the current position, measured along the route. */
  stopMinMiles: 15,
  stopMaxMiles: 30,
  /** How far off the route line a station may sit and still count as "on the way". */
  maxDetourMiles: 1,
};

export const REST = {
  /** Hotels, campgrounds and free lots must be within this drive time of the chosen stopping point. */
  maxDriveHours: 2,
  /** Straight-line search radius used to gather candidates before drive times are checked. */
  searchRadiusMiles: 90,
};

export const LANES = {
  /** Lane score = liveWeight × live speed + humanWeight × historical "human-flow" speed. */
  liveWeight: 0.7,
  humanWeight: 0.3,
  /** Only suggest a lane change when it is at least this much faster... */
  minGainMph: 3,
  /** ...and that lane has stayed best for this long (stops the suggestion flapping). */
  holdSeconds: 8,
};

export const NAV = {
  /** A fix farther than this from the route line counts toward going off-route. */
  offRouteMeters: 60,
  /** Consecutive off-route fixes before rerouting. */
  offRouteFixes: 3,
  /** Within this distance of a stop, it counts as reached. */
  arriveMeters: 90,
};

export const OFFLINE = {
  /** Low-zoom overview tiles cover this many miles either side of the route. */
  wideBufferMiles: 20,
  wideZoom: [5, 11] as const,
  /** Street-level tiles cover a tighter band. */
  nearBufferMiles: 2,
  nearZoom: [12, 15] as const,
  /** Routes are cut into chunks this long, one tile pack per chunk and zoom tier. */
  chunkMiles: 40,
};

export const STYLE = {
  day: 'mapbox://styles/mapbox/streets-v12',
  night: 'mapbox://styles/mapbox/dark-v11',
  /** Live traffic tiles drawn on top of the base style when the Traffic toggle is on. */
  trafficTiles: 'mapbox://mapbox.mapbox-traffic-v1',
};

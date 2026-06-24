// POST /api/search-nearby
// Primary: OpenStreetMap Overpass API — free, no API key required.
// Optional upgrade: set MAPBOX_ACCESS_TOKEN to use Mapbox instead.

import { Router } from "express";

const router = Router();

const TIMEOUT_MS = 10_000;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return parseFloat((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(1));
}

// Query keyword → OSM tag filter
const OVERPASS_TAGS: Record<string, string> = {
  gym:        `["leisure"="fitness_centre"]`,
  fitness:    `["leisure"="fitness_centre"]`,
  "健身房":   `["leisure"="fitness_centre"]`,
  "健身中心": `["leisure"="fitness_centre"]`,
  yoga:       `["sport"="yoga"]`,
  "瑜伽":     `["sport"="yoga"]`,
  swimming:   `["leisure"="swimming_pool"]["access"!="private"]`,
  pool:       `["leisure"="swimming_pool"]["access"!="private"]`,
  "游泳池":   `["leisure"="swimming_pool"]["access"!="private"]`,
  park:       `["leisure"="park"]`,
  nature:     `["leisure"="park"]`,
  outdoor:    `["leisure"="park"]`,
  "公園":     `["leisure"="park"]`,
  "公园":     `["leisure"="park"]`,
  restaurant: `["amenity"="restaurant"]`,
  "餐廳":     `["amenity"="restaurant"]`,
  "餐厅":     `["amenity"="restaurant"]`,
  "餐館":     `["amenity"="restaurant"]`,
  "食肆":     `["amenity"="restaurant"]`,
};

function toOverpassTag(query: string): string {
  const lower = query.trim().toLowerCase();
  for (const [key, tag] of Object.entries(OVERPASS_TAGS)) {
    if (lower.includes(key.toLowerCase())) return tag;
  }
  return `["leisure"="fitness_centre"]`;
}

interface PlaceResult {
  name: string;
  address: string;
  rating: number | null;
  distance: number | null;
  mapsUrl: string;
}

async function searchOverpass(lat: number, lng: number, query: string): Promise<PlaceResult[]> {
  const tag = toOverpassTag(query);
  const radius = 5000;
  const oql = `[out:json][timeout:15];(node${tag}(around:${radius},${lat},${lng});way${tag}(around:${radius},${lat},${lng}););out center 10;`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const resp = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "CalorieCoachApp/1.0 (contact: kenyuen1019@gmail.com)",
      },
      body: `data=${encodeURIComponent(oql)}`,
      signal: controller.signal,
    });

    if (!resp.ok) throw new Error(`Overpass API error ${resp.status}`);

    const data = (await resp.json()) as {
      elements?: Array<{
        lat?: number;
        lon?: number;
        center?: { lat: number; lon: number };
        tags?: Record<string, string>;
      }>;
    };

    return (data.elements ?? [])
      .filter((el) => el.tags?.name)
      .map((el) => {
        const pLat = el.lat ?? el.center?.lat ?? lat;
        const pLng = el.lon ?? el.center?.lon ?? lng;
        const tags = el.tags ?? {};
        const addrParts = [
          tags["addr:housenumber"],
          tags["addr:street"],
          tags["addr:city"] ?? tags["addr:suburb"],
        ].filter(Boolean);
        return {
          name: tags.name ?? "",
          address: addrParts.join(", "),
          rating: null,
          distance: haversineKm(lat, lng, pLat, pLng),
          mapsUrl: `https://maps.google.com/?q=${pLat},${pLng}`,
        };
      })
      .sort((a, b) => (a.distance ?? 99) - (b.distance ?? 99));
  } finally {
    clearTimeout(timer);
  }
}

async function searchMapbox(lat: number, lng: number, query: string, token: string): Promise<PlaceResult[]> {
  const CATEGORY_MAP: Record<string, string> = {
    gym: "gym", fitness: "gym", "健身房": "gym", "健身中心": "gym",
    yoga: "yoga studio", "瑜伽": "yoga studio",
    swimming: "swimming pool", pool: "swimming pool", "游泳池": "swimming pool",
    park: "park", nature: "park", outdoor: "park", "公園": "park", "公园": "park",
    restaurant: "restaurant", "餐廳": "restaurant", "餐厅": "restaurant",
    "餐館": "restaurant", "食肆": "restaurant",
  };
  const lower = query.trim().toLowerCase();
  const keyword = Object.entries(CATEGORY_MAP).find(([k]) => lower.includes(k))?.[1] ?? "gym";

  const LAT_DELTA = 0.225;
  const LNG_DELTA = LAT_DELTA / Math.cos((lat * Math.PI) / 180);
  const bbox = `${lng - LNG_DELTA},${lat - LAT_DELTA},${lng + LNG_DELTA},${lat + LAT_DELTA}`;

  const url = new URL("https://api.mapbox.com/search/searchbox/v1/forward");
  url.searchParams.set("q", keyword);
  url.searchParams.set("proximity", `${lng},${lat}`);
  url.searchParams.set("bbox", bbox);
  url.searchParams.set("limit", "10");
  url.searchParams.set("access_token", token);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const resp = await fetch(url.toString(), { signal: controller.signal });
    if (!resp.ok) throw new Error(`Mapbox error ${resp.status}`);

    const data = (await resp.json()) as {
      features?: Array<{
        geometry?: { coordinates?: [number, number] };
        properties?: { name?: string; full_address?: string; place_formatted?: string };
      }>;
    };

    return (data.features ?? []).map((f) => {
      const pLng = f.geometry?.coordinates?.[0] ?? lng;
      const pLat = f.geometry?.coordinates?.[1] ?? lat;
      const props = f.properties ?? {};
      return {
        name: props.name ?? "",
        address: props.full_address ?? props.place_formatted ?? "",
        rating: null,
        distance: haversineKm(lat, lng, pLat, pLng),
        mapsUrl: `https://maps.google.com/?q=${pLat},${pLng}`,
      };
    });
  } finally {
    clearTimeout(timer);
  }
}

router.post("/search-nearby", async (req, res) => {
  const { query = "gym", lat, lng } = req.body as {
    query?: string;
    lat?: number;
    lng?: number;
    appLanguage?: string;
  };

  if (typeof lat !== "number" || typeof lng !== "number") {
    return res.status(400).json({ success: false, error: "lat and lng are required numbers" });
  }

  try {
    const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN;
    let places: PlaceResult[];

    if (mapboxToken) {
      console.log(`[search-nearby] Mapbox lat=${lat} lng=${lng} query="${query}"`);
      places = await searchMapbox(lat, lng, query, mapboxToken);
    } else {
      console.log(`[search-nearby] Overpass lat=${lat} lng=${lng} query="${query}"`);
      places = await searchOverpass(lat, lng, query);
    }

    return res.json({ success: true, places });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return res.status(504).json({ success: false, error: "Location search timed out. Please try again." });
    }
    console.error("[search-nearby] error:", err);
    const detail = err instanceof Error ? err.message.slice(0, 300) : "";
    return res.status(500).json({ success: false, error: detail || "Could not search nearby places. Please try again." });
  }
});

export default router;

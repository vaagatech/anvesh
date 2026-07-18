/**
 * Geo helpers — haversine distance, point parsing, radius & bounding-box filters.
 */

import type { GeoBoundingBox, GeoPoint, GeoQuery, JsonValue } from "../types.js";
import { AnveshError } from "../messaging/vaakly.js";

const EARTH_RADIUS_KM = 6371.0088;

export function isValidGeoPoint(p: GeoPoint): boolean {
  return (
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lon) &&
    p.lat >= -90 &&
    p.lat <= 90 &&
    p.lon >= -180 &&
    p.lon <= 180
  );
}

/** Parse `{lat,lon}`, `{lat,lng}`, `[lon,lat]`, or `"lat,lon"`. */
export function parseGeoPoint(value: unknown): GeoPoint | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "string") {
    const parts = value.split(",").map((s) => s.trim());
    if (parts.length !== 2) return null;
    const lat = Number(parts[0]);
    const lon = Number(parts[1]);
    const p = { lat, lon };
    return isValidGeoPoint(p) ? p : null;
  }

  if (Array.isArray(value) && value.length >= 2) {
    const lon = Number(value[0]);
    const lat = Number(value[1]);
    const p = { lat, lon };
    return isValidGeoPoint(p) ? p : null;
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const lat = Number(obj.lat);
    const lon = Number(obj.lon ?? obj.lng);
    const p = { lat, lon };
    return isValidGeoPoint(p) ? p : null;
  }

  return null;
}

export function assertGeoPoint(value: unknown, field: string): GeoPoint {
  const p = parseGeoPoint(value);
  if (!p) {
    throw new AnveshError("ERR_VALIDATION", {
      detail: `field "${field}" must be a geo point ({lat,lon}, [lon,lat], or "lat,lon")`,
    });
  }
  return p;
}

/** Great-circle distance in kilometers (haversine). */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function inBoundingBox(point: GeoPoint, box: GeoBoundingBox): boolean {
  if (point.lat > box.top || point.lat < box.bottom) return false;
  if (box.left <= box.right) {
    return point.lon >= box.left && point.lon <= box.right;
  }
  // Antimeridian-crossing boxes (left > right)
  return point.lon >= box.left || point.lon <= box.right;
}

export function matchesGeo(fieldValue: JsonValue | undefined, geo: GeoQuery): boolean {
  const point = parseGeoPoint(fieldValue);
  if (!point) return false;

  if (geo.boundingBox && !inBoundingBox(point, geo.boundingBox)) return false;

  if (geo.distanceKm !== undefined) {
    if (!geo.origin) {
      throw new AnveshError("ERR_VALIDATION", {
        detail: "geo.distanceKm requires geo.origin",
      });
    }
    if (haversineKm(geo.origin, point) > geo.distanceKm) return false;
  }

  return true;
}

export function distanceFromOrigin(
  fieldValue: JsonValue | undefined,
  origin: GeoPoint,
): number | null {
  const point = parseGeoPoint(fieldValue);
  if (!point) return null;
  return haversineKm(origin, point);
}

export function validateGeoQuery(geo: GeoQuery): void {
  if (!geo.field) {
    throw new AnveshError("ERR_VALIDATION", { detail: "geo.field is required" });
  }
  if (geo.origin && !isValidGeoPoint(geo.origin)) {
    throw new AnveshError("ERR_VALIDATION", { detail: "geo.origin must be a valid lat/lon" });
  }
  if (geo.distanceKm !== undefined) {
    if (!Number.isFinite(geo.distanceKm) || geo.distanceKm < 0) {
      throw new AnveshError("ERR_VALIDATION", {
        detail: "geo.distanceKm must be a non-negative number",
      });
    }
    if (!geo.origin) {
      throw new AnveshError("ERR_VALIDATION", { detail: "geo.distanceKm requires geo.origin" });
    }
  }
  if (geo.boundingBox) {
    const b = geo.boundingBox;
    if (![b.top, b.left, b.bottom, b.right].every(Number.isFinite)) {
      throw new AnveshError("ERR_VALIDATION", {
        detail: "geo.boundingBox values must be finite numbers",
      });
    }
    if (b.top < b.bottom) {
      throw new AnveshError("ERR_VALIDATION", { detail: "geo.boundingBox.top must be >= bottom" });
    }
  }
  if (!geo.origin && geo.distanceKm === undefined && !geo.boundingBox) {
    throw new AnveshError("ERR_VALIDATION", {
      detail: "geo requires origin (for distance sort/radius), distanceKm, and/or boundingBox",
    });
  }
}

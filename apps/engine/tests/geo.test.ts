import { describe, it, expect, beforeEach } from "vitest";
import { AnveshEngine } from "../src/core/engine.js";
import { MemoryStorage } from "../src/storage/memory.js";
import { haversineKm, parseGeoPoint } from "../src/core/geo.js";

describe("geo helpers", () => {
  it("parses geo point formats", () => {
    expect(parseGeoPoint({ lat: 12.97, lon: 77.59 })).toEqual({ lat: 12.97, lon: 77.59 });
    expect(parseGeoPoint({ lat: 12.97, lng: 77.59 })).toEqual({ lat: 12.97, lon: 77.59 });
    expect(parseGeoPoint([77.59, 12.97])).toEqual({ lat: 12.97, lon: 77.59 });
    expect(parseGeoPoint("12.97,77.59")).toEqual({ lat: 12.97, lon: 77.59 });
  });

  it("computes haversine distance for nearby points", () => {
    const a = { lat: 12.9716, lon: 77.5946 }; // Bengaluru
    const b = { lat: 12.9352, lon: 77.6245 }; // ~5–6 km away
    const km = haversineKm(a, b);
    expect(km).toBeGreaterThan(4);
    expect(km).toBeLessThan(8);
  });
});

describe("geo search", () => {
  let engine: AnveshEngine;

  beforeEach(async () => {
    engine = new AnveshEngine(new MemoryStorage());
    await engine.init();
    await engine.createIndex("places", {
      name: { type: "text" },
      category: { type: "keyword" },
      location: { type: "geo_point" },
    });

    await engine.indexDocument("places", {
      id: "cafe-mg",
      fields: {
        name: "Cafe on MG Road",
        category: "cafe",
        location: { lat: 12.975, lon: 77.606 },
      },
    });
    await engine.indexDocument("places", {
      id: "park-lalbagh",
      fields: {
        name: "Lalbagh Botanical Garden",
        category: "park",
        location: [77.5847, 12.9507],
      },
    });
    await engine.indexDocument("places", {
      id: "cafe-mysore",
      fields: {
        name: "Cafe in Mysore",
        category: "cafe",
        location: "12.2958,76.6394",
      },
    });
  });

  it("finds places within a radius sorted by distance", () => {
    const result = engine.search("places", {
      mode: "geo",
      geo: {
        field: "location",
        origin: { lat: 12.9716, lon: 77.5946 },
        distanceKm: 10,
        sortByDistance: true,
      },
    });
    expect(result.total).toBe(2);
    expect(result.hits[0]?.id).toBe("cafe-mg");
    expect(result.hits[0]?.distanceKm).toBeDefined();
    expect(result.hits.every((h) => (h.distanceKm ?? 999) <= 10)).toBe(true);
    expect(result.hits.find((h) => h.id === "cafe-mysore")).toBeUndefined();
  });

  it("filters with a bounding box", () => {
    const result = engine.search("places", {
      geo: {
        field: "location",
        boundingBox: {
          top: 13.0,
          left: 77.55,
          bottom: 12.94,
          right: 77.65,
        },
      },
    });
    expect(result.hits.map((h) => h.id).sort()).toEqual(["cafe-mg", "park-lalbagh"]);
  });

  it("combines keyword search with geo radius", () => {
    const result = engine.search("places", {
      q: "cafe",
      mode: "keyword",
      geo: {
        field: "location",
        origin: { lat: 12.9716, lon: 77.5946 },
        distanceKm: 15,
      },
    });
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]?.id).toBe("cafe-mg");
    expect(result.hits[0]?.distanceKm).toBeDefined();
  });

  it("rejects invalid geo points on index", async () => {
    await expect(
      engine.indexDocument("places", {
        fields: { name: "Bad", category: "x", location: { lat: 200, lon: 0 } },
      }),
    ).rejects.toThrow(/geo point/i);
  });
});

---
title: Geo search
section: Guides
description: Location fields, radius search, bounding boxes, and distance sorting.
permalink: /guides/geo/
---

## Map a geo field

```json
{
  "name": "places",
  "mappings": {
    "name": { "type": "text" },
    "location": { "type": "geo_point" }
  }
}
```

## Point formats

Accepted on write (normalized to `{ lat, lon }`):

| Format | Example |
|--------|---------|
| Object | `{ "lat": 12.975, "lon": 77.606 }` |
| lng alias | `{ "lat": 12.975, "lng": 77.606 }` |
| GeoJSON array | `[77.606, 12.975]` (lon, lat) |
| String | `"12.975,77.606"` |

## Radius + sort

```json
{
  "mode": "geo",
  "geo": {
    "field": "location",
    "origin": { "lat": 12.9716, "lon": 77.5946 },
    "distanceKm": 5,
    "sortByDistance": true
  }
}
```

Hits include `distanceKm` when `origin` is set.

## Bounding box

```json
{
  "geo": {
    "field": "location",
    "boundingBox": {
      "top": 13.0,
      "left": 77.55,
      "bottom": 12.94,
      "right": 77.65
    }
  }
}
```

Boxes that cross the antimeridian (`left > right`) are supported.

## Text near me

```json
{
  "q": "cafe",
  "mode": "keyword",
  "geo": {
    "field": "location",
    "origin": { "lat": 12.9716, "lon": 77.5946 },
    "distanceKm": 10
  }
}
```

## Implementation notes

- Distance uses **haversine** great-circle kilometers.
- Geo filtering applies in keyword / semantic / hybrid candidate selection.
- Pure geo mode does not require `q` or `vector`.

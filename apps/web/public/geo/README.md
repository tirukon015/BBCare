# Malaysia state boundaries

`malaysia-states.json` is a GeoJSON FeatureCollection of the 13 states and 3 federal territories of Malaysia, extracted from Natural Earth 10m "Admin 1 States, Provinces" (public domain, https://www.naturalearthdata.com/about/terms-of-use/). Coordinates are rounded to three decimals (about 100 m) because the map shows aggregate activity per state, never positions. Each feature carries `code` (ISO 3166-2:MY, for example `MY-14`), `name`, `type` and the Natural Earth label point (`lat`, `lon`).

Regenerate with `infra/scripts/geo-boundaries.py` after downloading the Natural Earth GeoJSON.

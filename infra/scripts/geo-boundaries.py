#!/usr/bin/env python3
"""Extract Malaysian admin-1 boundaries from the Natural Earth 10m states/provinces GeoJSON (public domain).

Usage: geo-boundaries.py ne_10m_admin_1_states_provinces.geojson apps/web/public/geo/malaysia-states.json
Download the input from https://github.com/nvkelso/natural-earth-vector/tree/master/geojson
"""
import json
import sys


def rnd(c):
    if isinstance(c[0], (int, float)):
        return [round(c[0], 3), round(c[1], 3)]
    return [rnd(x) for x in c]


src, dst = sys.argv[1], sys.argv[2]
data = json.load(open(src))
out = {"type": "FeatureCollection", "name": "Natural Earth 10m admin-1, Malaysia (public domain)", "features": []}
for f in data["features"]:
    p = f["properties"]
    if p.get("iso_a2") != "MY" and p.get("adm0_a3") != "MYS":
        continue
    out["features"].append({
        "type": "Feature",
        "properties": {"code": p.get("iso_3166_2"), "name": p.get("name"), "type": p.get("type_en"), "lat": p.get("latitude"), "lon": p.get("longitude")},
        "geometry": {"type": f["geometry"]["type"], "coordinates": rnd(f["geometry"]["coordinates"])},
    })
assert len(out["features"]) == 16, len(out["features"])
json.dump(out, open(dst, "w"), separators=(",", ":"))
print("wrote", dst, len(out["features"]), "features")

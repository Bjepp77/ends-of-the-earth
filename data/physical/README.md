# Physical layer data

`physical.json` (rivers, lakes, mountain ranges, deserts) and `relief.webp` (shaded relief, shadow only,
Web Mercator, 82 N to 62 S) are built by `tools/build_physical.py` from Natural Earth:
ne_10m_rivers_lake_centerlines, ne_10m_lakes, ne_10m_geography_regions_polys and SR_50M.
Raw downloads go to `build-src/physical/`, which is gitignored.

Licence: Natural Earth is in the public domain (https://www.naturalearthdata.com/about/terms-of-use/).
No names are kept; the layer is unlabelled.

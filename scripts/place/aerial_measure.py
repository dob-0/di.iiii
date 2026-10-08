#!/usr/bin/env python3
"""aerial_measure.py: measure the MOXIR hall (Charentsavan) from above, in metres.

Independent sources, each fetched and kept with its licence:
  osm       OpenStreetMap through the Overpass API (ODbL 1.0). Every building way/relation
            within --radius of the pin, plus way 289841504.
  ms        Microsoft Global ML Building Footprints (ODbL 1.0), the zoom-9 quadkey file.
  overture  Overture Maps buildings (ODbL 1.0 for OSM-derived rows, CDLA-Permissive-2.0 for
            Microsoft/Google-derived rows; each row names its source).
  imagery   Esri World Imagery tiles (current) and Esri World Imagery Wayback releases.
            Esri terms: display with attribution "Esri, Maxar, Earthstar Geographics, and
            the GIS User Community"; no redistribution of the imagery. Tiles are cached in
            --cache (scratch, never in the repo); derived PNGs stay private to the owner.
  meta      Esri's imagery metadata (source, date, resolution) at the pin, per release.

Geometry (published method):
  - Coordinates: WGS84 -> UTM zone 38N (EPSG:32638) with pyproj (PROJ).
  - Footprint size: the minimum-area oriented bounding box (rotating calipers; Freeman &
    Shapira 1975) via shapely, in UTM metres; bearings by the geodesic inverse (Karney 2013).
  - Imagery georeferencing: Web Mercator tile maths (EPSG:3857, OGC WMTS / Bing tile scheme);
    each output pixel's lon/lat -> tile pixel, bilinear resample (OpenCV remap).
  - Rectification into the HALL FRAME: u across the hall (m), v along it (m), from a centre
    and a bearing; one pixel = --res metres.
  - Measurement (profile): edge profiles (first derivative of the mean intensity, Canny 1986
    style smoothing) across the hall for walls/spans/lanterns; along the hall the
    autocorrelation and the FFT power spectrum (Wiener-Khinchin) of the detrended profile
    give the bay pitch, with the peak width as the +- estimate.

Usage (venv ~/tools/geo/.venv, packages pinned in scripts/place/aerial_requirements.txt):
  python aerial_measure.py osm       --out DIR
  python aerial_measure.py ms        --out DIR
  python aerial_measure.py overture  --out DIR
  python aerial_measure.py releases  --out DIR            # distinct Wayback captures at the pin
  python aerial_measure.py imagery   --out DIR --release current|<wayback id> [--zoom 19]
  python aerial_measure.py profile   --out DIR --release ... --center E N --bearing DEG
  python aerial_measure.py draw      --out DIR --release ... (overlays for the owner)
"""
import argparse, gzip, hashlib, io, json, math, os, sys, time
import numpy as np
import requests
from pyproj import Geod, Transformer

PIN = (40.406524, 44.636560)  # owner's pin, lat, lon
OSM_WAY = 289841504
UTM = "EPSG:32638"
TO_UTM = Transformer.from_crs("EPSG:4326", UTM, always_xy=True)
TO_LL = Transformer.from_crs(UTM, "EPSG:4326", always_xy=True)
GEOD = Geod(ellps="WGS84")
UA = {"User-Agent": "di.iiii-aerial-measure/1.0 (+https://github.com/dob-0/di.iiii)"}
OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter",
            "https://maps.mail.ru/osm/tools/overpass/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
ESRI_TILE = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
WB_TILE = "https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/{r}/{z}/{y}/{x}"
WB_CONFIG = "https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json"
ESRI_META = "https://metadata.maptiles.arcgis.com/arcgis/rest/services/World_Imagery_Metadata/MapServer"
ESRI_ATTR = "Imagery: Esri, Maxar, Earthstar Geographics, and the GIS User Community (Esri World Imagery)"


def get(url, **kw):
    for i in range(4):
        try:
            r = requests.get(url, headers=UA, timeout=90, **kw)
            if r.status_code == 200:
                return r
            if r.status_code in (404, 400):
                return r
        except requests.RequestException as e:
            print("retry", url, e, file=sys.stderr)
        time.sleep(2 + 3 * i)
    raise RuntimeError("failed: " + url)


def wjson(path, obj):
    with open(path, "w") as f:
        json.dump(obj, f, indent=1)
    print("wrote", path)


# ---------------------------------------------------------------- footprints
def ring_utm(lonlat):
    e, n = TO_UTM.transform([p[0] for p in lonlat], [p[1] for p in lonlat])
    return list(zip(e, n))


def obb(poly):
    """Minimum-area oriented bounding box of a shapely polygon in UTM: long, short, bearing."""
    r = poly.minimum_rotated_rectangle
    xy = list(r.exterior.coords)[:4]
    sides = [(xy[i], xy[(i + 1) % 4]) for i in range(4)]
    lens = [math.dist(a, b) for a, b in sides]
    i = int(np.argmax(lens))
    a, b = sides[i]
    lon, lat = TO_LL.transform([a[0], b[0]], [a[1], b[1]])
    az, _, _ = GEOD.inv(lon[0], lat[0], lon[1], lat[1])
    az = az % 180.0
    c = r.centroid
    clon, clat = TO_LL.transform(c.x, c.y)
    return {"long_m": round(max(lens), 2), "short_m": round(min(lens), 2),
            "long_axis_bearing_deg": round(az, 2), "centre_utm": [round(c.x, 2), round(c.y, 2)],
            "centre_latlon": [round(clat, 7), round(clon, 7)], "corners_utm": [[round(x, 2), round(y, 2)] for x, y in xy]}


def describe(poly, extra):
    from shapely.geometry import Point
    pe, pn = TO_UTM.transform(PIN[1], PIN[0])
    d = dict(extra)
    d.update({"area_m2": round(poly.area, 1), "vertices": len(poly.exterior.coords) - 1,
              "inner_rings": len(poly.interiors), "contains_pin": poly.contains(Point(pe, pn)),
              "dist_to_pin_m": round(poly.distance(Point(pe, pn)), 1), "obb": obb(poly),
              "exterior_utm": [[round(x, 2), round(y, 2)] for x, y in poly.exterior.coords]})
    return d


def cmd_osm(a):
    from shapely.geometry import Polygon
    q = f"""[out:json][timeout:90];
(way({OSM_WAY});
 way["building"](around:{a.radius},{PIN[0]},{PIN[1]});
 way["building:part"](around:{a.radius},{PIN[0]},{PIN[1]});
 relation["building"](around:{a.radius},{PIN[0]},{PIN[1]});
 way["landuse"](around:50,{PIN[0]},{PIN[1]}););
out geom tags meta;"""
    raw = None
    for ep in OVERPASS:
        try:
            r = requests.post(ep, data={"data": q}, headers=UA, timeout=150)
            if r.status_code == 200:
                raw = r.json(); raw["endpoint"] = ep; break
            print(ep, r.status_code, file=sys.stderr)
        except requests.RequestException as e:
            print(ep, e, file=sys.stderr)
    if raw is None:
        raise SystemExit("every Overpass endpoint failed")
    wjson(os.path.join(a.out, "osm_raw.json"), raw)
    out = []
    for el in raw["elements"]:
        if el["type"] == "way" and "geometry" in el and len(el["geometry"]) >= 4:
            p = Polygon(ring_utm([(g["lon"], g["lat"]) for g in el["geometry"]]))
            out.append(describe(p, {"id": f"way/{el['id']}", "tags": el.get("tags", {}),
                                    "version": el.get("version"), "timestamp": el.get("timestamp"),
                                    "user": el.get("user")}))
        elif el["type"] == "relation":
            outers = [m for m in el.get("members", []) if m.get("role") == "outer" and "geometry" in m]
            inners = [m for m in el.get("members", []) if m.get("role") == "inner" and "geometry" in m]
            if outers:
                p = Polygon(ring_utm([(g["lon"], g["lat"]) for g in outers[0]["geometry"]]),
                            [ring_utm([(g["lon"], g["lat"]) for g in m["geometry"]]) for m in inners])
                out.append(describe(p, {"id": f"relation/{el['id']}", "tags": el.get("tags", {}),
                                        "version": el.get("version"), "timestamp": el.get("timestamp")}))
    out.sort(key=lambda d: d["dist_to_pin_m"])
    wjson(os.path.join(a.out, "osm_buildings.json"), {
        "source": "OpenStreetMap contributors via Overpass API (" + raw["endpoint"] + ")", "licence": "ODbL 1.0",
        "fetched": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "query": q,
        "osm_base": raw.get("osm3s", {}).get("timestamp_osm_base"), "buildings": out})
    for d in out[:12]:
        o = d["obb"]
        print(d["id"], d["tags"].get("building", d["tags"].get("landuse")), f"{o['long_m']} x {o['short_m']} m",
              f"bearing {o['long_axis_bearing_deg']}", "area", d["area_m2"], "pin" if d["contains_pin"] else d["dist_to_pin_m"],
              "inner", d["inner_rings"])


def quadkey(lat, lon, z):
    n = 2 ** z
    x = int((lon + 180) / 360 * n)
    y = int((1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n)
    q = ""
    for i in range(z, 0, -1):
        d = 0
        m = 1 << (i - 1)
        if x & m: d += 1
        if y & m: d += 2
        q += str(d)
    return q


def cmd_ms(a):
    from shapely.geometry import shape, Point
    links = get("https://minedbuildings.z5.web.core.windows.net/global-buildings/dataset-links.csv").text.splitlines()
    qk = quadkey(PIN[0], PIN[1], 9)
    rows = [l for l in links[1:] if l.split(",")[1] == qk]
    print("quadkey", qk, rows)
    pe, pn = TO_UTM.transform(PIN[1], PIN[0])
    out = []
    for row in rows:
        loc, _, url, size = row.split(",")[:4]
        raw = get(url).content
        for line in gzip.decompress(raw).decode().splitlines():
            f = json.loads(line)
            g = shape(f["geometry"])
            lon, lat = g.exterior.coords[0]
            if abs(lat - PIN[0]) > 0.004 or abs(lon - PIN[1]) > 0.005:
                continue
            from shapely.geometry import Polygon
            p = Polygon(ring_utm(list(g.exterior.coords)))
            if p.distance(Point(pe, pn)) > a.radius:
                continue
            out.append(describe(p, {"id": f"ms/{loc}/{len(out)}", "properties": f.get("properties", {}), "file": url}))
    out.sort(key=lambda d: d["dist_to_pin_m"])
    wjson(os.path.join(a.out, "ms_buildings.json"), {
        "source": "Microsoft Global ML Building Footprints (github.com/microsoft/GlobalMLBuildingFootprints)",
        "licence": "ODbL 1.0", "quadkey_z9": qk, "fetched": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "buildings": out})
    for d in out[:12]:
        o = d["obb"]
        print(d["id"], d["properties"], f"{o['long_m']} x {o['short_m']} m", f"bearing {o['long_axis_bearing_deg']}",
              "area", d["area_m2"], "pin" if d["contains_pin"] else d["dist_to_pin_m"])


def cmd_overture(a):
    from shapely import wkb
    from shapely.geometry import Polygon, Point
    from shapely.ops import transform as stransform
    from overturemaps import core
    dlat, dlon = 0.0035, 0.0045
    bbox = (PIN[1] - dlon, PIN[0] - dlat, PIN[1] + dlon, PIN[0] + dlat)
    rdr = core.record_batch_reader("building", bbox)
    tab = rdr.read_all()
    pe, pn = TO_UTM.transform(PIN[1], PIN[0])
    out = []
    for row in tab.to_pylist():
        g = wkb.loads(row["geometry"])
        if g.geom_type != "Polygon":
            g = max(g.geoms, key=lambda x: x.area)
        p = stransform(lambda x, y, z=None: TO_UTM.transform(x, y), g)
        if p.distance(Point(pe, pn)) > a.radius:
            continue
        out.append(describe(p, {"id": "overture/" + row["id"], "sources": row.get("sources"),
                                "height": row.get("height"), "class": row.get("class")}))
    out.sort(key=lambda d: d["dist_to_pin_m"])
    wjson(os.path.join(a.out, "overture_buildings.json"), {
        "source": "Overture Maps Foundation, theme buildings (latest release via overturemaps-py)",
        "licence": "ODbL 1.0 (OSM rows) / CDLA-Permissive-2.0 (ML rows); per-row sources kept",
        "fetched": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "buildings": out}, )
    for d in out[:8]:
        o = d["obb"]
        print(d["id"][:40], [s.get("dataset") for s in (d["sources"] or [])], f"{o['long_m']} x {o['short_m']} m",
              f"bearing {o['long_axis_bearing_deg']}", "pin" if d["contains_pin"] else d["dist_to_pin_m"])


# ---------------------------------------------------------------- imagery
def merc_px(lat, lon, z):
    n = 256 * 2 ** z
    x = (lon + 180) / 360 * n
    lr = np.radians(lat)
    y = (1 - np.log(np.tan(lr) + 1 / np.cos(lr)) / math.pi) / 2 * n
    return x, y


def tile_url(release, z, x, y):
    if release == "current":
        return ESRI_TILE.format(z=z, y=y, x=x)
    return WB_TILE.format(r=release, z=z, y=y, x=x)


def fetch_tile(release, z, x, y, cache):
    from PIL import Image
    p = os.path.join(cache, str(release), str(z), f"{x}_{y}.jpg")
    if not os.path.exists(p):
        os.makedirs(os.path.dirname(p), exist_ok=True)
        r = get(tile_url(release, z, x, y))
        if r.status_code != 200:
            return None
        open(p, "wb").write(r.content)
        time.sleep(0.05)
    try:
        return np.asarray(Image.open(p).convert("RGB"))
    except Exception:
        return None


def warp(release, z, lat, lon, cache):
    """Sample imagery at arrays of lat/lon (any shape) -> RGB image, bilinear."""
    import cv2
    px, py = merc_px(lat, lon, z)
    x0, x1 = int(px.min() // 256), int(px.max() // 256)
    y0, y1 = int(py.min() // 256), int(py.max() // 256)
    mosaic = np.zeros(((y1 - y0 + 1) * 256, (x1 - x0 + 1) * 256, 3), np.uint8)
    for tx in range(x0, x1 + 1):
        for ty in range(y0, y1 + 1):
            t = fetch_tile(release, z, tx, ty, cache)
            if t is not None:
                mosaic[(ty - y0) * 256:(ty - y0 + 1) * 256, (tx - x0) * 256:(tx - x0 + 1) * 256] = t[:256, :256]
    mx = (px - x0 * 256).astype(np.float32)
    my = (py - y0 * 256).astype(np.float32)
    return cv2.remap(mosaic, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)


def utm_grid(e0, n0, e1, n1, res):
    es = np.arange(e0, e1, res) + res / 2
    ns = np.arange(n1, n0, -res) - res / 2
    E, N = np.meshgrid(es, ns)
    lon, lat = TO_LL.transform(E, N)
    return lat, lon, (e0, n1, res)


def hall_grid(ce, cn, bearing, half_u, half_v, res):
    """Hall frame (as moxir-site-2026-09-28.json): v along `bearing` (grid azimuth, ~144 = SE),
    u across toward bearing-90 (~54 = NE). Image rows: v from -half_v (top, NW end) to +half_v;
    columns: u from -half_u (left, SW) to +half_u (right, NE). Bearings here are UTM grid azimuths;
    at this point grid north is 0.24 deg from true north (meridian convergence), reported, not hidden."""
    us = np.arange(-half_u, half_u, res) + res / 2
    vs = np.arange(-half_v, half_v, res) + res / 2
    U, V = np.meshgrid(us, vs)
    b = math.radians(bearing)
    ve, vn = math.sin(b), math.cos(b)          # unit along (v)
    ue, un = -math.cos(b), math.sin(b)         # unit across (u), azimuth bearing-90
    E = ce + U * ue + V * ve
    N = cn + U * un + V * vn
    lon, lat = TO_LL.transform(E, N)
    return lat, lon, us, vs


def esri_identify(lat, lon, url=ESRI_META):
    d = 0.0008
    q = {"geometry": f"{lon},{lat}", "geometryType": "esriGeometryPoint", "sr": 4326, "layers": "all",
         "tolerance": 2, "mapExtent": f"{lon-d},{lat-d},{lon+d},{lat+d}", "imageDisplay": "800,800,96",
         "returnGeometry": "false", "f": "json"}
    try:
        res = get(url + "/identify", params=q).json().get("results", [])
    except Exception as e:
        return [{"error": str(e)}]
    keep = []
    for r in res:
        at = r.get("attributes", {})
        keep.append({k: at.get(k) for k in at if k.upper() in ("SRC_DATE", "SRC_DATE2", "SRC_RES", "SRC_ACC", "SRC_DESC", "NICE_NAME", "NICE_DESC", "MinMapLevel", "MaxMapLevel")} | {"layer": r.get("layerName")})
    return keep


def cmd_releases(a):
    cfg = get(WB_CONFIG).json()
    rel = sorted(((int(k), v) for k, v in cfg.items()), key=lambda kv: kv[1]["itemTitle"].split()[-1].rstrip(")"))
    z = 18
    px, py = merc_px(np.array(PIN[0]), np.array(PIN[1]), z)
    tx, ty = int(px // 256), int(py // 256)
    seen, out = {}, []
    for rid, v in rel:
        r = get(tile_url(rid, z, tx, ty))
        if r.status_code != 200:
            continue
        h = hashlib.md5(r.content).hexdigest()
        if h in seen:
            continue
        seen[h] = rid
        meta = esri_identify(PIN[0], PIN[1], v.get("metadataLayerUrl", ESRI_META)) if v.get("metadataLayerUrl") else []
        out.append({"release": rid, "title": v["itemTitle"], "tile_md5": h, "metadata": meta})
        print(rid, v["itemTitle"], h[:8], meta[:1])
    cur = esri_identify(PIN[0], PIN[1])
    wjson(os.path.join(a.out, "wayback_releases.json"), {"source": "Esri World Imagery Wayback", "terms": ESRI_ATTR,
          "distinct_at_pin_z18": out, "current_metadata": cur})


def cmd_imagery(a):
    from PIL import Image
    pe, pn = TO_UTM.transform(PIN[1], PIN[0])
    h = a.half
    lat, lon, gt = utm_grid(pe - h, pn - h, pe + h, pn + h, a.res)
    img = warp(a.release, a.zoom, lat, lon, a.cache)
    tag = f"r{a.release}_z{a.zoom}"
    p = os.path.join(a.out, f"utm_{tag}.png")
    Image.fromarray(img).save(p)
    with open(p[:-4] + ".pgw", "w") as f:  # ESRI world file, UTM 38N
        f.write(f"{gt[2]}\n0\n0\n{-gt[2]}\n{gt[0]+gt[2]/2}\n{gt[1]-gt[2]/2}\n")
    wjson(p[:-4] + ".json", {"crs": UTM, "ul_e": gt[0], "ul_n": gt[1], "res_m": gt[2], "release": a.release,
                             "zoom": a.zoom, "terms": ESRI_ATTR, "metadata": esri_identify(PIN[0], PIN[1])})


# ---------------------------------------------------------------- measurement
def gsmooth(x, sigma_px):
    from scipy.ndimage import gaussian_filter1d
    return gaussian_filter1d(np.asarray(x, float), sigma_px)


def rectify(a, bearing, half_u, half_v):
    lat, lon, us, vs = hall_grid(a.center[0], a.center[1], bearing, half_u, half_v, a.res)
    img = warp(a.release, a.zoom, lat, lon, a.cache)
    gray = img.astype(float) @ np.array([0.299, 0.587, 0.114])
    return img, gray, us, vs


def best_bearing(a, b0, span=2.0, step=0.1):
    """Projection-profile deskew (the Radon-transform method used for document skew,
    e.g. Hull 1998): the bearing at which the across-hall edge profile is sharpest."""
    best = None
    for b in np.arange(b0 - span, b0 + span + 1e-9, step):
        _, g, us, vs = rectify(a, b, 62, 62)
        pu = g.mean(axis=0); pv = g.mean(axis=1)
        score = np.sum(np.diff(gsmooth(pu, 1)) ** 2) + np.sum(np.diff(gsmooth(pv, 1)) ** 2)
        if best is None or score > best[1]:
            best = (round(float(b), 2), score)
    return best[0]


def edges(profile, coords, sigma_m, res, n=12, prom=None):
    from scipy.signal import find_peaks
    d = np.gradient(gsmooth(profile, sigma_m / res)) / res
    pk, pr = find_peaks(np.abs(d), distance=max(1, int(1.5 / res)), prominence=prom if prom is not None else 0)
    order = np.argsort(-pr["prominences"])[:n]
    out = []
    for i in sorted(pk[order]):
        # sub-pixel by parabola through |d| at i-1, i, i+1
        if 0 < i < len(d) - 1:
            y0, y1, y2 = abs(d[i - 1]), abs(d[i]), abs(d[i + 1])
            off = 0.5 * (y0 - y2) / (y0 - 2 * y1 + y2) if (y0 - 2 * y1 + y2) != 0 else 0
        else:
            off = 0
        out.append({"at_m": round(float(coords[i] + off * res), 2), "sign": "+" if d[i] > 0 else "-",
                    "strength": round(float(abs(d[i])), 2)})
    return out, d


def periodicity(profile, res, lo=3.0, hi=30.0):
    """Bay pitch from a 1-D profile: detrend (subtract a 12 m Gaussian), Hann window, then
    (1) autocorrelation peaks and (2) the FFT power peak with parabolic interpolation; +- = the
    half-width at half-maximum of the spectral peak converted to a period."""
    from scipy.signal import find_peaks
    x = np.asarray(profile, float)
    x = x - gsmooth(x, 12 / res)
    x = x - x.mean()
    n = len(x)
    ac = np.correlate(x, x, "full")[n - 1:]
    ac = ac / ac[0]
    lags = np.arange(n) * res
    sel = (lags >= lo) & (lags <= hi)
    pk, _ = find_peaks(ac)
    acp = [(round(float(lags[i]), 2), round(float(ac[i]), 3)) for i in pk if sel[i]]
    acp.sort(key=lambda t: -t[1])
    pad = 16 * n
    w = x * np.hanning(n)
    P = np.abs(np.fft.rfft(w, pad)) ** 2
    f = np.fft.rfftfreq(pad, res)
    band = (f >= 1 / hi) & (f <= 1 / lo)
    idx = np.where(band)[0]
    peaks, _ = find_peaks(P[idx])
    spec = []
    for j in peaks:
        i = idx[j]
        half = P[i] / 2
        l = i
        while l > 0 and P[l] > half: l -= 1
        r = i
        while r < len(P) - 1 and P[r] > half: r += 1
        per = 1 / f[i]
        spec.append({"period_m": round(float(per), 3), "pm_m": round(float((1 / f[l] - 1 / f[r]) / 2 if f[l] > 0 else per), 3),
                     "rel_power": float(P[i])})
    tot = sum(s["rel_power"] for s in spec) or 1
    for s in spec: s["rel_power"] = round(s["rel_power"] / tot, 3)
    spec.sort(key=lambda s: -s["rel_power"])
    return {"autocorr_peaks_m_r": acp[:6], "fft_peaks": spec[:6], "length_m": round(n * res, 1)}


def comb(profile, coords, period, ref, lo=4.0, hi=9.0, guard=0.35):
    """Fourier amplitude at one period (a 1-bin DFT, Hann-windowed) with its phase as the position
    of the maxima relative to `ref` (mod period), and a z-score against the amplitudes at all other
    periods in [lo, hi] outside +-guard (the empirical null)."""
    x = np.asarray(profile, float)
    res = coords[1] - coords[0]
    x = x - gsmooth(x, 12 / abs(res)); x = (x - x.mean()) * np.hanning(len(x))
    def amp(P):
        return np.sum(x * np.exp(-2j * np.pi * coords / P))
    A = amp(period)
    pos = (np.angle(A) / (2 * np.pi) * period) % period
    null = [abs(amp(P)) for P in np.arange(lo, hi, 0.02) if abs(P - period) > guard and abs(P - 2 * period) > guard]
    z = (abs(A) - np.mean(null)) / np.std(null)
    return {"period_m": period, "max_at_from_ref_m": round(float((pos - ref) % period), 2), "z": round(float(z), 2)}


def cmd_comb(a):
    """Bay-rhythm test: in many thin strips along the hall, the 6 m (and 12 m) Fourier component;
    a real bay rhythm has the same phase in every strip (the bay lines cross the whole roof)."""
    g = np.load(os.path.join(a.out, f"hall_r{a.release}_z{a.zoom}_gray.npy"))
    n = g.shape[0]
    us = np.arange(-a.half, a.half, a.res)[:g.shape[1]] + a.res / 2
    vs = np.arange(-a.half, a.half, a.res)[:n] + a.res / 2
    ins = (vs > a.vrange[0]) & (vs < a.vrange[1])
    out = []
    for s in filter(None, a.strips.split(";")):
        u0, u1 = map(float, s.split(":"))
        for uu in np.arange(u0, u1, 3.0):
            cols = (us >= uu) & (us < uu + 3)
            prof = g[:, cols].mean(axis=1)[ins]
            row = {"u": [round(float(uu), 1), round(float(uu) + 3, 1)]}
            for P in (6.0, 12.0):
                row[f"p{int(P)}"] = comb(prof, vs[ins], P, a.ref, hi=9.0 if P == 6 else 16.0, lo=4.0 if P == 6 else 8.0)
            out.append(row)
    for P in ("p6", "p12"):
        ph = np.array([r[P]["max_at_from_ref_m"] for r in out]); per = out[0][P]["period_m"]
        ang = np.exp(2j * np.pi * ph / per)
        R = abs(ang.mean())  # Rayleigh resultant length: 1 = all strips in phase, ~1/sqrt(n) = random
        nrm = len(ph)
        pval = math.exp(-nrm * R * R) * (1 + (2 * nrm * R * R - (nrm * R * R) ** 2) / (4 * nrm))  # Zar 1999 eq. 27.4
        print(P, "strips", nrm, "Rayleigh R", round(R, 3), "p", f"{max(pval, 0):.1e}" if pval > 1e-4 else "< 1e-4", "mean phase", round((np.angle(ang.mean()) / (2 * np.pi) * per) % per, 2),
              "median z", round(float(np.median([r[P]["z"] for r in out])), 2))
    wjson(os.path.join(a.out, f"comb_r{a.release}_z{a.zoom}.json"), {"ref_v_m": a.ref, "vrange": a.vrange, "strips": out})


def site_model_utm(site):
    """The model's grid as placed by rigs/moxir-site-2026-09-28.json (origin + true bearings u 54 / v 144,
    nave_u, joint_v), returned as UTM polylines: column rows, bay lines, end walls, lanterns."""
    lat0, lon0 = site["origin_lat_lon"]
    ub, vb = site["u_bearing_deg"], site["v_bearing_deg"]
    nu, jv = site["hall_from_building"]["nave_u_m"], site["hall_from_building"]["joint_v_m"]
    def P(u, v):
        lon, lat, _ = GEOD.fwd(lon0, lat0, ub, u)
        lon, lat, _ = GEOD.fwd(lon, lat, vb, v)
        return TO_UTM.transform(lon, lat)
    def hz(x, z):  # hall frame (x across, +x = SW; z along, +z = NW) -> building u, v
        return P(nu - x, jv - z)
    rows = [-36, -12, 12, 36, 60]            # hall.json geometry.rows_x_m (+x = house right = SW)
    out = {"rows": [[hz(x, 54), hz(x, -54)] for x in rows],
           "bays": [[hz(-36, z), hz(60, z)] for z in [0.5, -0.5] + [6 * k for k in range(-9, 10) if k]],
           # hall.py: outer wall faces 0.4 + 0.3 m beyond the outer rows; end walls' outer face at L/2 + 0.5 + 0.3
           "outline": [hz(-36.7, 54.8), hz(60.7, 54.8), hz(60.7, -54.8), hz(-36.7, -54.8)],
           "lanterns": []}
    for xc in (0, 24):                       # hall.py lantern_spans [0, 1]: the nave and the next span to the right (SW)
        for z0, z1 in ((7.25, 45.75), (-45.75, -7.25)):
            out["lanterns"].append([hz(xc - 6, z0), hz(xc + 6, z0), hz(xc + 6, z1), hz(xc - 6, z1)])
    return out


def sun_position(when_utc, lat, lon):
    """Solar azimuth/elevation (deg) by the NOAA General Solar Position equations (Spencer 1971 series;
    NOAA ESRL 'General Solar Position Calculations'); refraction ignored (< 0.03 deg above 30 deg)."""
    import datetime as dt
    doy = when_utc.timetuple().tm_yday
    hr = when_utc.hour + when_utc.minute / 60 + when_utc.second / 3600
    g = 2 * math.pi / 365 * (doy - 1 + (hr - 12) / 24)
    eqt = 229.18 * (0.000075 + 0.001868 * math.cos(g) - 0.032077 * math.sin(g) - 0.014615 * math.cos(2 * g) - 0.040849 * math.sin(2 * g))
    decl = (0.006918 - 0.399912 * math.cos(g) + 0.070257 * math.sin(g) - 0.006758 * math.cos(2 * g) + 0.000907 * math.sin(2 * g)
            - 0.002697 * math.cos(3 * g) + 0.00148 * math.sin(3 * g))
    tst = hr * 60 + eqt + 4 * lon
    ha = math.radians(tst / 4 - 180)
    la = math.radians(lat)
    cz = math.sin(la) * math.sin(decl) + math.cos(la) * math.cos(decl) * math.cos(ha)
    zen = math.acos(cz)
    az = math.degrees(math.atan2(math.sin(ha), math.cos(ha) * math.sin(la) - math.tan(decl) * math.cos(la))) + 180
    return az % 360, 90 - math.degrees(zen)


def cmd_shadow(a):
    """Lantern height from its shadow: the shadow vector (u, v) measured on the roof gives the sun azimuth;
    the sun elevation at that azimuth on the capture date (NOAA equations) turns the shadow length into a height."""
    import datetime as dt
    meas = json.load(open(a.measured))
    for rel, c in meas["per_capture"].items():
        sh = c.get("lantern_shadow_m")
        if not sh:
            continue
        bb = math.radians(c["bearing_grid_deg"])
        u, v = sh["across_ne"], -sh["along_nw"]
        E = u * -math.cos(bb) + v * math.sin(bb); N = u * math.sin(bb) + v * math.cos(bb)
        L = math.hypot(E, N)
        sun_az = (math.degrees(math.atan2(E, N)) + 180 - 0.24) % 360   # grid -> true (convergence -0.24)
        day = dt.datetime.strptime(sh["date"], "%Y-%m-%d")
        best = min(((abs(sun_position(day + dt.timedelta(minutes=m), PIN[0], PIN[1])[0] - sun_az), m) for m in range(300, 660)))
        t = day + dt.timedelta(minutes=best[1])
        az, el = sun_position(t, PIN[0], PIN[1])
        h = L * math.tan(math.radians(el))
        dh = h * math.hypot(sh["pm_m"] / L, math.radians(2) / (math.sin(math.radians(el)) * math.cos(math.radians(el))))
        print(rel, f"shadow {L:.2f} m toward {(sun_az+180)%360:.1f}; sun az {az:.1f} el {el:.1f} at {t:%H:%M} UTC -> lantern {h:.2f} +- {dh:.2f} m")


def cmd_draw(a):
    """Owner-facing overlays in the hall frame (NW entry end at the top), labelled in metres."""
    import cv2
    prof = json.load(open(os.path.join(a.out, f"profile_r{a.release}_z{a.zoom}.json")))
    meas = json.load(open(a.measured))
    m = meas["per_capture"][str(a.release)]
    site = json.load(open(a.site))
    b = prof["bearing_grid_deg"]; ce, cn = prof["center_utm"]
    img = cv2.imread(os.path.join(a.out, f"hall_r{a.release}_z{a.zoom}.png"))
    K = a.scale
    img = cv2.resize(img, None, fx=K, fy=K, interpolation=cv2.INTER_CUBIC)
    H, W = img.shape[:2]
    bb = math.radians(b)
    def to_px(e, n):
        de, dn = e - ce, n - cn
        u = de * -math.cos(bb) + dn * math.sin(bb); v = de * math.sin(bb) + dn * math.cos(bb)
        return int(round((u + a.half) / a.res * K)), int(round((v + a.half) / a.res * K))
    def uv_px(u, v):
        return int(round((u + a.half) / a.res * K)), int(round((v + a.half) / a.res * K))
    def put(t, xy, col, sc=0.45, th=1):
        cv2.putText(img, t, xy, cv2.FONT_HERSHEY_SIMPLEX, sc, (0, 0, 0), th + 2, cv2.LINE_AA)
        cv2.putText(img, t, xy, cv2.FONT_HERSHEY_SIMPLEX, sc, col, th, cv2.LINE_AA)
    RED, CYAN, YEL, GRN, WHT = (40, 40, 255), (255, 255, 0), (0, 230, 255), (60, 255, 60), (255, 255, 255)
    layers = a.layers.split(",")
    legend = []
    if "osm" in layers:
        bl = json.load(open(os.path.join(a.out, "osm_buildings.json")))["buildings"]
        w = next(x for x in bl if x["id"] == f"way/{OSM_WAY}")
        cv2.polylines(img, [np.array([to_px(*p) for p in w["exterior_utm"]], np.int32)], True, RED, 2, cv2.LINE_AA)
        o = w["obb"]; legend.append((RED, f"OSM way {OSM_WAY}: {o['long_m']:.1f} x {o['short_m']:.1f} m (ODbL)"))
    if "ms" in layers:
        bl = json.load(open(os.path.join(a.out, "ms_buildings.json")))["buildings"]
        w = next(x for x in bl if x["contains_pin"])
        cv2.polylines(img, [np.array([to_px(*p) for p in w["exterior_utm"]], np.int32)], True, CYAN, 2, cv2.LINE_AA)
        o = w["obb"]; legend.append((CYAN, f"Microsoft ML footprint: {o['long_m']:.1f} x {o['short_m']:.1f} m (ODbL)"))
    if "model" in layers:
        mod = site_model_utm(site)
        for ln in mod["rows"] + mod["bays"]:
            cv2.line(img, to_px(*ln[0]), to_px(*ln[1]), YEL, 1, cv2.LINE_AA)
        cv2.polylines(img, [np.array([to_px(*p) for p in mod["outline"]], np.int32)], True, YEL, 2, cv2.LINE_AA)
        for lt in mod["lanterns"]:
            cv2.polylines(img, [np.array([to_px(*p) for p in lt], np.int32)], True, YEL, 2, cv2.LINE_AA)
        legend.append((YEL, "model as placed by moxir-site-2026-09-28: 4 x 24 m, 18 x 6 m, lanterns 38.5 m"))
    if "measured" in layers:
        u0, u1 = m["roof_u"]; v0, v1 = m["roof_v"]; j = m["joint_v"]
        cv2.rectangle(img, uv_px(u0, v0), uv_px(u1, v1), GRN, 2)
        for u in m["rows_u"]:
            cv2.line(img, uv_px(u, v0), uv_px(u, v1), GRN, 1, cv2.LINE_AA)
        for k in range(-9, 10):
            v = j + 6 * k
            cv2.line(img, uv_px(u0 - 2.5, v), uv_px(u0, v), GRN, 2)
            cv2.line(img, uv_px(u1, v), uv_px(u1 + 2.5, v), GRN, 2)
            if k % 3 == 0:
                put(f"{-6*k:+d}", (uv_px(u1 + 3, v)[0], uv_px(u1 + 3, v)[1] + 4), GRN, 0.4)
        cv2.line(img, uv_px(u0, j), uv_px(u1, j), GRN, 2, cv2.LINE_AA)
        put("joint", (uv_px(u0 + 1, j - 1)[0], uv_px(u0 + 1, j - 1)[1]), GRN)
        for (lu0, lu1) in m.get("lantern_u", []):
            for (lv0, lv1) in m.get("lantern_v", []):
                cv2.rectangle(img, uv_px(lu0, lv0), uv_px(lu1, lv1), GRN, 2)
        for i in range(4):
            uc = (m["rows_u"][i] + m["rows_u"][i + 1]) / 2
            put(f"span {i+1}", (uv_px(uc - 4, v1 + 3)[0], uv_px(uc, v1 + 3)[1]), GRN)
            put(f"{m['rows_u'][i+1]-m['rows_u'][i]:.1f} m", (uv_px(uc - 4, v1 + 6)[0], uv_px(uc, v1 + 6)[1]), GRN)
        put(f"{u1-u0:.1f} m", (uv_px((u0+u1)/2 - 4, v0 - 2)[0], uv_px(0, v0 - 2)[1]), GRN, 0.5)
        put(f"{v1-v0:.1f} m", (uv_px(u0 - 12, (v0+v1)/2)[0], uv_px(0, (v0+v1)/2)[1]), GRN, 0.5)
        legend.append((GRN, f"measured on this image: roof {v1-v0:.1f} x {u1-u0:.1f} m, rows every 24 m, bay ticks 6 m from the joint"))
    # north arrow (grid north in the hall frame) and scale bar
    nx, ny = W - 60, 70
    e, n = 0, 1  # unit north in E/N
    u = e * -math.cos(bb) + n * math.sin(bb); v = e * math.sin(bb) + n * math.cos(bb)
    cv2.arrowedLine(img, (nx, ny), (int(nx + 40 * u), int(ny + 40 * v)), WHT, 2, tipLength=0.3)
    put("N", (int(nx + 50 * u) - 5, int(ny + 50 * v) + 5), WHT, 0.6, 2)
    x0, y0 = 20, H - 25; L = int(24 / a.res * K)
    cv2.rectangle(img, (x0, y0), (x0 + L, y0 + 6), WHT, -1)
    put("24 m", (x0 + L + 6, y0 + 7), WHT, 0.5)
    y = 22
    put(a.title, (12, y), WHT, 0.55, 1); y += 20
    for col, t in legend:
        put(t, (12, y), col, 0.42); y += 17
    put(m["attribution"], (12, H - 40), WHT, 0.36)
    put("hall frame: NW (entry) end at top, SW long wall at left; metres", (12, H - 55), WHT, 0.36)
    os.makedirs(os.path.dirname(a.png), exist_ok=True)
    cv2.imwrite(a.png, img)
    print("wrote", a.png)


def cmd_profile(a):
    from PIL import Image
    if a.bearing is None:
        a.bearing = 144.83
    b = best_bearing(a, a.bearing) if not a.fixed_bearing else a.bearing
    img, g, us, vs = rectify(a, b, a.half, a.half)
    tag = f"r{a.release}_z{a.zoom}"
    Image.fromarray(img).save(os.path.join(a.out, f"hall_{tag}.png"))
    np.save(os.path.join(a.out, f"hall_{tag}_gray.npy"), g.astype(np.float32))
    res = {"release": a.release, "zoom": a.zoom, "res_m": a.res, "center_utm": a.center, "bearing_grid_deg": b,
           "frame": "u across (azimuth bearing-90, NE+), v along (azimuth bearing, SE+), metres from center_utm"}
    pe, pn = TO_UTM.transform(PIN[1], PIN[0])
    bb = math.radians(b)
    de, dn = pe - a.center[0], pn - a.center[1]
    res["pin_uv_m"] = [round(de * -math.cos(bb) + dn * math.sin(bb), 2), round(de * math.sin(bb) + dn * math.cos(bb), 2)]
    # across: whole length and the two halves; along: per strip given by --strips
    res["across_edges"], _ = edges(g.mean(axis=0), us, 0.5, a.res, n=20)
    res["along_edges"], _ = edges(g.mean(axis=1), vs, 0.5, a.res, n=20)
    res["strips"] = {}
    for s in filter(None, a.strips.split(";")):
        u0, u1 = map(float, s.split(":"))
        cols = (us >= u0) & (us < u1)
        prof = g[:, cols].mean(axis=1)
        e, _ = edges(prof, vs, 0.5, a.res, n=14)
        ins = (vs > a.vrange[0]) & (vs < a.vrange[1])
        res["strips"][s] = {"along_edges": e, "periodicity": periodicity(prof[ins], a.res)}
    for s in filter(None, a.vstrips.split(";")):
        v0, v1 = map(float, s.split(":"))
        rows = (vs >= v0) & (vs < v1)
        e, _ = edges(g[rows].mean(axis=0), us, 0.5, a.res, n=16)
        res["strips"]["v" + s] = {"across_edges": e}
    wjson(os.path.join(a.out, f"profile_{tag}.json"), res)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd")
    ap.add_argument("--out", required=True)
    ap.add_argument("--cache", default=os.environ.get("AERIAL_CACHE", "/tmp/aerial-cache"))
    ap.add_argument("--radius", type=float, default=300)
    ap.add_argument("--release", default="current")
    ap.add_argument("--zoom", type=int, default=19)
    ap.add_argument("--res", type=float, default=0.25)
    ap.add_argument("--half", type=float, default=110)
    ap.add_argument("--center", type=float, nargs=2)
    ap.add_argument("--bearing", type=float)
    ap.add_argument("--fixed-bearing", action="store_true")
    ap.add_argument("--measured", help="measured values json (rigs/moxir-aerial-2026-10-07.json)")
    ap.add_argument("--site", help="rigs/moxir-site-2026-09-28.json")
    ap.add_argument("--layers", default="osm,ms,model,measured")
    ap.add_argument("--png")
    ap.add_argument("--title", default="")
    ap.add_argument("--scale", type=float, default=1.6)
    ap.add_argument("--ref", type=float, default=0.0, help="v of the expansion joint line, for phases")
    ap.add_argument("--strips", default="", help="u0:u1 strips for along-hall profiles, ;-separated: --strips=\"-48:-30;5:14\"")
    ap.add_argument("--vstrips", default="", help="v0:v1 strips for across-hall profiles, ;-separated")
    ap.add_argument("--vrange", type=float, nargs=2, default=(-52, 52), help="v window for the pitch spectrum")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    globals()["cmd_" + a.cmd](a)

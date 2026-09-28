"""What the photographs themselves say: time, camera, lens, GPS, and where the sun was.

    python3 scripts/place/photo_meta.py --photos <dir> --site rigs/<site>.json --out <meta.json>
        [--poses <vggt poses_scaled.json>] [--sat <satellite stitch.png> --sat-out <plot.png>]

For every JPEG in <dir> it reads the EXIF (Pillow) and writes one record:

  - capture time with its UTC offset, device, lens, 35 mm-equivalent focal;
  - the pinhole intrinsics that follow from it (`fx_px`): the 35 mm-equivalent
    focal is defined on the diagonal of a 36 x 24 mm frame (CIPA DC-008,
    Exif 2.32, FocalLengthIn35mmFilm), so fx = f35 / 43.27 mm * the diagonal
    of the sensor's NATIVE frame in pixels. A phone that crops (1:1, 16:9)
    keeps its native equivalent focal, so the native frame is the 4:3 frame
    with the image's long side — `native_4_3` says when that was assumed;
  - the GPS fix, turned into metres on the local tangent plane (WGS-84 radii of
    curvature at the site, flat within 0.01 % over 200 m), then into the
    building frame (u, v) and the HALL frame (x, z) of hall.json, by the site
    file (origin, axis bearings, where the nave and the joint are);
  - the sun at that moment, by the NOAA solar position algorithm (the NOAA
    Global Monitoring Laboratory's solar calculator equations, after Meeus,
    'Astronomical Algorithms'; ~0.01 deg for 1800-2100), with the NOAA
    refraction correction; plus the sun's azimuth relative to the hall axis.

With `--poses` (VGGT cameras, `x` along the hall, `y` across) it fits a 2-D
similarity transform (Umeyama 1991, least squares, proper rotation) from the
VGGT positions of the photos that have a GPS fix to their GPS positions. That
gives the reconstruction's scale and the bearing of its hall axis from the GPS
alone — independent of the satellite and of the column counting — with the
residuals, so the GPS's own error is on the table.

With `--sat` it plots every fix on the satellite stitch (north up), each with a
circle of the GPS's typical indoor error. Needs Pillow and numpy only.
"""
import argparse
import datetime as dt
import glob
import json
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from PIL.ExifTags import GPSTAGS, TAGS

DIAG_35 = math.hypot(36.0, 24.0)  # 43.27 mm
INDOOR_GPS_ERR_M = (5.0, 20.0)  # a phone under a steel roof: the range to expect (see README)


# --------------------------------------------------------------------------
# NOAA solar position (the GML solar calculator's spreadsheet equations).
# --------------------------------------------------------------------------
def julian_day(t_utc):
    a = (14 - t_utc.month) // 12
    y = t_utc.year + 4800 - a
    m = t_utc.month + 12 * a - 3
    jdn = t_utc.day + (153 * m + 2) // 5 + 365 * y + y // 4 - y // 100 + y // 400 - 32045
    frac = (t_utc.hour - 12) / 24 + t_utc.minute / 1440 + (t_utc.second + t_utc.microsecond / 1e6) / 86400
    return jdn + frac


def sun_noaa(t_utc, lat, lon):
    """Sun azimuth (deg from north, clockwise) and elevation (deg, refraction-corrected)."""
    r = math.radians
    d = math.degrees
    jc = (julian_day(t_utc) - 2451545.0) / 36525.0
    l0 = (280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360
    m = 357.52911 + jc * (35999.05029 - 0.0001537 * jc)
    e = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc)
    c = (math.sin(r(m)) * (1.914602 - jc * (0.004817 + 0.000014 * jc))
         + math.sin(r(2 * m)) * (0.019993 - 0.000101 * jc) + math.sin(r(3 * m)) * 0.000289)
    true_long = l0 + c
    omega = 125.04 - 1934.136 * jc
    app_long = true_long - 0.00569 - 0.00478 * math.sin(r(omega))
    obliq0 = 23 + (26 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60) / 60
    obliq = obliq0 + 0.00256 * math.cos(r(omega))
    decl = d(math.asin(math.sin(r(obliq)) * math.sin(r(app_long))))
    yy = math.tan(r(obliq / 2)) ** 2
    eot = 4 * d(yy * math.sin(2 * r(l0)) - 2 * e * math.sin(r(m)) + 4 * e * yy * math.sin(r(m)) * math.cos(2 * r(l0))
                - 0.5 * yy * yy * math.sin(4 * r(l0)) - 1.25 * e * e * math.sin(2 * r(m)))
    minutes = t_utc.hour * 60 + t_utc.minute + (t_utc.second + t_utc.microsecond / 1e6) / 60
    tst = (minutes + eot + 4 * lon) % 1440
    ha = tst / 4 + 180 if tst / 4 < 0 else tst / 4 - 180
    cos_z = math.sin(r(lat)) * math.sin(r(decl)) + math.cos(r(lat)) * math.cos(r(decl)) * math.cos(r(ha))
    zen = d(math.acos(max(-1.0, min(1.0, cos_z))))
    elev = 90 - zen
    # NOAA refraction (degrees)
    if elev > 85:
        refr = 0.0
    else:
        te = math.tan(r(elev))
        if elev > 5:
            refr = 58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5
        elif elev > -0.575:
            refr = 1735 + elev * (-518.2 + elev * (103.4 + elev * (-12.79 + elev * 0.711)))
        else:
            refr = -20.772 / te
        refr /= 3600
    k = (math.sin(r(lat)) * math.cos(r(zen)) - math.sin(r(decl))) / (math.cos(r(lat)) * math.sin(r(zen)))
    k = max(-1.0, min(1.0, k))
    az = (d(math.acos(k)) + 180) % 360 if ha > 0 else (540 - d(math.acos(k))) % 360
    return {'azimuth_deg': round(az, 3), 'elevation_deg': round(elev + refr, 3), 'declination_deg': round(decl, 4),
            'equation_of_time_min': round(eot, 3)}


def sun_michalsky(t_utc, lat, lon):
    """A second, independent algorithm (Michalsky 1988, the Astronomical Almanac's
    low-precision formulae; ~0.01 deg 1950-2050) — only to cross-check sun_noaa."""
    r = math.radians
    d = math.degrees
    n = julian_day(t_utc) - 2451545.0
    lm = (280.460 + 0.9856474 * n) % 360
    g = r((357.528 + 0.9856003 * n) % 360)
    ecl_long = r(lm + 1.915 * math.sin(g) + 0.020 * math.sin(2 * g))
    ep = r(23.439 - 0.0000004 * n)
    ra = math.atan2(math.cos(ep) * math.sin(ecl_long), math.cos(ecl_long))
    dec = math.asin(math.sin(ep) * math.sin(ecl_long))
    gmst = (6.697375 + 0.0657098242 * n + t_utc.hour + t_utc.minute / 60 + t_utc.second / 3600) % 24
    lmst = (gmst + lon / 15) % 24
    ha = r(lmst * 15) - ra
    el = math.asin(math.sin(dec) * math.sin(r(lat)) + math.cos(dec) * math.cos(r(lat)) * math.cos(ha))
    az = math.atan2(-math.sin(ha), math.tan(dec) * math.cos(r(lat)) - math.sin(r(lat)) * math.cos(ha))
    return {'azimuth_deg': round(d(az) % 360, 3), 'elevation_deg': round(d(el), 3)}


# --------------------------------------------------------------------------
# Geodesy: a small area around the site, WGS-84.
# --------------------------------------------------------------------------
WGS84_A = 6378137.0
WGS84_E2 = 6.69437999014e-3


def enu(lat, lon, lat0, lon0):
    """East, north metres of (lat, lon) from (lat0, lon0) on the local tangent plane."""
    p = math.radians(lat0)
    w = math.sqrt(1 - WGS84_E2 * math.sin(p) ** 2)
    rn = WGS84_A / w  # prime vertical
    rm = WGS84_A * (1 - WGS84_E2) / w ** 3  # meridian
    return math.radians(lon - lon0) * rn * math.cos(p), math.radians(lat - lat0) * rm


def building_uv(e, n, site):
    ub = math.radians(site['u_bearing_deg'])
    vb = math.radians(site['v_bearing_deg'])
    return e * math.sin(ub) + n * math.cos(ub), e * math.sin(vb) + n * math.cos(vb)


def hall_xz(u, v, site):
    h = site['hall_from_building']
    return h['nave_u_m'] - u, -(v - h['joint_v_m'])


# --------------------------------------------------------------------------
# EXIF
# --------------------------------------------------------------------------
def rational(v):
    return float(v) if v is not None else None


def dms(t):
    return float(t[0]) + float(t[1]) / 60 + float(t[2]) / 3600


def read_exif(path):
    im = Image.open(path)
    ex = im.getexif()
    tags = {TAGS.get(k, k): v for k, v in ex.items()}
    tags.update({TAGS.get(k, k): v for k, v in ex.get_ifd(0x8769).items()})
    gps = {GPSTAGS.get(k, k): v for k, v in ex.get_ifd(0x8825).items()}
    w, h = im.size
    if tags.get('Orientation') in (5, 6, 7, 8):
        w, h = h, w
    return im.size, (w, h), tags, gps


def intrinsics(size, f35):
    """fx in pixels from the 35 mm-equivalent focal (diagonal definition)."""
    if not f35:
        return None
    w, h = size
    long_side = max(w, h)
    ratio = long_side / min(w, h)
    native = abs(ratio - 4 / 3) > 0.02 and abs(ratio - 3 / 2) > 0.02
    if native:
        # A crop (1:1, 16:9): the phone reports its native equivalent focal;
        # take the native 4:3 frame on the same long side... for 1:1 the
        # square IS the short side of the 4:3 frame.
        nw, nh = (long_side * 4 / 3, long_side) if abs(ratio - 1) < 0.02 else (long_side, long_side * 3 / 4)
    else:
        nw, nh = w, h
    diag = math.hypot(nw, nh)
    fx = f35 / DIAG_35 * diag
    return {'fx_px': round(fx, 1), 'cx_px': w / 2, 'cy_px': h / 2, 'native_4_3': native,
            'hfov_deg': round(math.degrees(2 * math.atan(w / 2 / fx)), 1),
            'vfov_deg': round(math.degrees(2 * math.atan(h / 2 / fx)), 1)}


# --------------------------------------------------------------------------
# Umeyama similarity in 2-D.
# --------------------------------------------------------------------------
def similarity_2d(src, dst):
    src = np.asarray(src, float)
    dst = np.asarray(dst, float)
    ms, md = src.mean(0), dst.mean(0)
    a, b = src - ms, dst - md
    cov = b.T @ a / len(src)
    u, s, vt = np.linalg.svd(cov)
    d = np.eye(2)
    if np.linalg.det(u) * np.linalg.det(vt) < 0:
        d[1, 1] = -1
    rot = u @ d @ vt
    var = (a ** 2).sum() / len(src)
    scale = np.trace(np.diag(s) @ d) / var
    t = md - scale * rot @ ms
    res = dst - (scale * (rot @ src.T).T + t)
    return scale, rot, t, np.linalg.norm(res, axis=1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--photos', required=True)
    ap.add_argument('--site', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--poses')
    ap.add_argument('--sat')
    ap.add_argument('--sat-out')
    ap.add_argument('--exclude-gps', default='', help='comma-separated photo prefixes whose fix is not used for the fit')
    a = ap.parse_args()
    site = json.load(open(a.site))
    lat0, lon0 = site['origin_lat_lon']
    tz = dt.timedelta(hours=site.get('utc_offset_h', 0))
    records = {}
    for path in sorted(glob.glob(os.path.join(a.photos, '*'))):
        if not path.lower().endswith(('.jpg', '.jpeg')):
            continue
        name = os.path.basename(path)
        raw, size, tags, gps = read_exif(path)
        rec = {'image_px': list(size), 'make': tags.get('Make'), 'model': tags.get('Model'), 'lens': tags.get('LensModel'),
               'focal_mm': rational(tags.get('FocalLength')), 'focal_35mm_eq': tags.get('FocalLengthIn35mmFilm')}
        if not tags.get('DateTimeOriginal'):
            rec['stripped'] = True
            records[name] = rec
            continue
        off = tags.get('OffsetTimeOriginal')
        local = dt.datetime.strptime(tags['DateTimeOriginal'], '%Y:%m:%d %H:%M:%S')
        offset = dt.timedelta(hours=int(off[:3]), minutes=int(off[0] + off[4:6])) if off else tz
        t_utc = local - offset
        rec['local_time'] = local.isoformat() + (off or '')
        rec['utc'] = t_utc.isoformat() + 'Z'
        rec['intrinsics'] = intrinsics(size, rec['focal_35mm_eq'])
        lat, lon = lat0, lon0
        if gps.get('GPSLatitude'):
            lat = dms(gps['GPSLatitude']) * (-1 if gps.get('GPSLatitudeRef') == 'S' else 1)
            lon = dms(gps['GPSLongitude']) * (-1 if gps.get('GPSLongitudeRef') == 'W' else 1)
            e, n = enu(lat, lon, lat0, lon0)
            u, v = building_uv(e, n, site)
            x, z = hall_xz(u, v, site)
            # a fix quantised to 4 decimals in BOTH axes (~10 m cells) is a coarse, network-grade one
            digits = max(len(repr(round(lat, 7)).split('.')[-1]), len(repr(round(lon, 7)).split('.')[-1]))
            rec['gps'] = {'lat': round(lat, 7), 'lon': round(lon, 7), 'alt_m': rational(gps.get('GPSAltitude')),
                          'h_error_m': rational(gps.get('GPSHPositioningError')), 'img_direction_deg': rational(gps.get('GPSImgDirection')),
                          'enu_m': [round(e, 2), round(n, 2)], 'building_uv_m': [round(u, 2), round(v, 2)], 'hall_xz_m': [round(x, 2), round(z, 2)],
                          'coarse': digits <= 4}
        sun = sun_noaa(t_utc, lat, lon)
        check = sun_michalsky(t_utc, lat, lon)
        sun['cross_check_michalsky'] = check
        sun['cross_check_diff_deg'] = [round(abs((sun['azimuth_deg'] - check['azimuth_deg'] + 180) % 360 - 180), 3),
                                       round(abs(sun['elevation_deg'] - check['elevation_deg']), 3)]
        # Where sunlight through an opening H metres up lands on the floor: moved
        # H * cot(elevation) along the light's heading (azimuth + 180), written in
        # the hall frame (+x = the u axis reversed, +z = the v axis reversed).
        if sun['elevation_deg'] > 1:
            cot = 1 / math.tan(math.radians(sun['elevation_deg']))
            head = math.radians(sun['azimuth_deg'] + 180)
            he, hn = math.sin(head) * cot, math.cos(head) * cot
            ub, vb = math.radians(site['u_bearing_deg']), math.radians(site['v_bearing_deg'])
            du = he * math.sin(ub) + hn * math.cos(ub)
            dv = he * math.sin(vb) + hn * math.cos(vb)
            sun['floor_shift_per_m_drop_hall_xz'] = [round(-du, 3), round(-dv, 3)]
        rel = (sun['azimuth_deg'] - site['v_bearing_deg'] + 180) % 360 - 180
        sun['from_hall_axis_deg'] = round(rel, 2)
        sun['note'] = ('azimuth relative to the hall axis toward the far (SE) end: + = the sun stands to the right of '
                       'that axis (the SW side), so its light falls toward the NE side (hall -x)')
        rec['sun'] = sun
        records[name] = rec

    out = {'site': site['site'], 'method': __doc__.strip().split('\n\n')[0], 'photos': records}
    fixes = {k: r for k, r in records.items() if 'gps' in r}
    if fixes:
        excluded = [k for k in fixes if any(k.startswith(p) for p in a.exclude_gps.split(',') if p) or fixes[k]['gps']['coarse']]
        use = {k: r for k, r in fixes.items() if k not in excluded}
        xz = np.array([r['gps']['hall_xz_m'] for r in use.values()])
        alts = np.array([r['gps']['alt_m'] for r in use.values() if r['gps']['alt_m'] is not None])
        out['gps_summary'] = {
            'fixes': len(fixes), 'used': len(use), 'excluded': excluded,
            'hall_x_m': [round(float(xz[:, 0].min()), 1), round(float(xz[:, 0].max()), 1)],
            'hall_z_m': [round(float(xz[:, 1].min()), 1), round(float(xz[:, 1].max()), 1)],
            'alt_m': [round(float(alts.min()), 2), round(float(alts.max()), 2)] if len(alts) else None,
            'h_error_reported': any(r['gps']['h_error_m'] for r in fixes.values()),
            'img_direction_reported': any(r['gps']['img_direction_deg'] is not None for r in fixes.values())
        }
    if a.poses and fixes:
        poses = {c['image'].rsplit('.', 1)[0]: c for c in json.load(open(a.poses))['cameras']}
        pairs = []
        for k, r in fixes.items():
            if k in out['gps_summary']['excluded']:
                continue
            stem = k.rsplit('.', 1)[0]
            p = poses.get(stem)
            if p:
                pairs.append((k, p['pos_m'][:2], r['gps']['enu_m'], p['pos_m'][2]))
        src = [p[1] for p in pairs]
        dst = [p[2] for p in pairs]
        scale, rot, t, res = similarity_2d(src, dst)
        # the bearing of the reconstruction's +x (along the hall, toward the far end) in the GPS's frame
        ax = rot @ np.array([1.0, 0.0])
        bearing = math.degrees(math.atan2(ax[0], ax[1])) % 360
        # leave-one-out spread of the bearing
        loo = []
        for i in range(len(src)):
            s2, r2, _, _ = similarity_2d(src[:i] + src[i + 1:], dst[:i] + dst[i + 1:])
            ax2 = r2 @ np.array([1.0, 0.0])
            loo.append(math.degrees(math.atan2(ax2[0], ax2[1])) % 360)
        out['registration'] = {
            'method': 'Umeyama 2-D similarity, VGGT (x, y) of the photos with a fix -> their GPS east/north; proper rotation',
            'pairs': [{'photo': p[0], 'vggt_xy': p[1], 'gps_en': p[2], 'vggt_height_m': p[3], 'residual_m': round(float(res[i]), 2)} for i, p in enumerate(pairs)],
            'scale_vs_assumed': round(float(scale), 3),
            'scale_note': 'the VGGT positions were already in metres at an assumed 30.8 m/unit (span 24 m); 1.0 = the GPS agrees',
            'axis_bearing_deg': round(bearing, 1),
            'axis_bearing_leave_one_out_deg': [round(min(loo), 1), round(max(loo), 1)],
            'satellite_axis_bearing_deg': site['v_bearing_deg'],
            'rms_residual_m': round(float(np.sqrt((res ** 2).mean())), 2),
            'max_residual_m': round(float(res.max()), 2)
        }
    json.dump(out, open(a.out, 'w'), indent=1, default=str)
    print(f'[photo_meta] {a.out}: {len(records)} photos, {len(fixes)} with GPS')
    if 'gps_summary' in out:
        print('[photo_meta] gps', json.dumps(out['gps_summary']))
    if 'registration' in out:
        rg = out['registration']
        print(f"[photo_meta] registration: scale {rg['scale_vs_assumed']}, axis bearing {rg['axis_bearing_deg']} "
              f"(LOO {rg['axis_bearing_leave_one_out_deg']}; satellite {rg['satellite_axis_bearing_deg']}), "
              f"rms {rg['rms_residual_m']} m, max {rg['max_residual_m']} m")
    if a.sat and a.sat_out and fixes:
        plot_sat(a.sat, a.sat_out, site, fixes, out)


def plot_sat(src, dst, site, fixes, out):
    heights = {p['photo']: p['vggt_height_m'] for p in out.get('registration', {}).get('pairs', [])}
    sat = site['satellite']
    m = sat['m_per_px']
    cx, cy = sat['origin_px']
    k = 3
    im = Image.open(src).convert('RGB')
    im = im.resize((im.width * k, im.height * k), Image.LANCZOS)
    d = ImageDraw.Draw(im)
    try:
        f = ImageFont.truetype('/usr/share/fonts/TTF/DejaVuSans.ttf', 26)
    except OSError:
        f = ImageFont.load_default()
    ub, vb = math.radians(site['u_bearing_deg']), math.radians(site['v_bearing_deg'])

    def px_en(e, n):
        return (cx + e / m) * k, (cy - n / m) * k

    def px_uv(u, v):
        return px_en(u * math.sin(ub) + v * math.sin(vb), u * math.cos(ub) + v * math.cos(vb))

    h = site['hall_from_building']
    # the nave (span 3): hall x -12..12 -> u = nave_u - x ; hall z -54..54 -> v = joint_v - z
    nu, jv = h['nave_u_m'], h['joint_v_m']
    d.polygon([px_uv(nu - 12, jv - 54), px_uv(nu + 12, jv - 54), px_uv(nu + 12, jv + 54), px_uv(nu - 12, jv + 54)], outline=(255, 255, 0), width=5)
    d.line([px_uv(nu - 60, jv), px_uv(nu + 60, jv)], fill=(255, 140, 0), width=3)
    for name, r in fixes.items():
        e, n = r['gps']['enu_m']
        x, y = px_en(e, n)
        for rad, col in ((INDOOR_GPS_ERR_M[1], (0, 160, 0)),):
            rr = rad / m * k
            d.ellipse([x - rr, y - rr, x + rr, y + rr], outline=col, width=2)
        hgt = heights.get(name)
        col = (0, 255, 0) if hgt is None or hgt < 4 else (255, 60, 60)
        d.ellipse([x - 10, y - 10, x + 10, y + 10], fill=col, outline=(0, 0, 0))
        d.text((x + 12, y - 14), name[:3], fill=col, font=f, stroke_width=2, stroke_fill=(0, 0, 0))
    lat0, lon0 = site['origin_lat_lon']
    e, n = enu(*site['owner_pin'], lat0, lon0)
    x, y = px_en(e, n)
    d.ellipse([x - 14, y - 14, x + 14, y + 14], outline=(255, 0, 255), width=5)
    d.text((x + 16, y), 'owner pin', fill=(255, 0, 255), font=f, stroke_width=2, stroke_fill=(0, 0, 0))
    x0, y0 = px_uv(nu, jv - 50)  # hall +z (NW) is -v
    d.text((x0 - 60, y0), 'NW (entry, crane)', fill=(255, 255, 255), font=f, stroke_width=3, stroke_fill=(0, 0, 0))
    bx = [px_uv(nu + du, jv + dv) for du in (-120, 120) for dv in (-120, 120)]
    xs = [p[0] for p in bx]
    ys = [p[1] for p in bx]
    im = im.crop((max(0, int(min(xs))), max(0, int(min(ys))), min(im.width, int(max(xs))), min(im.height, int(max(ys)))))
    d = ImageDraw.Draw(im)
    d.text((40, 40), 'N up. Yellow: the nave (hall x -12..12, z -54..54). Orange: expansion joint (z 0). Red: camera > 4 m up in VGGT (crane, '
           'platforms), green: on the floor or not in VGGT. Green rings: 20 m (indoor GPS error, upper end).', fill=(255, 255, 255), font=f, stroke_width=3, stroke_fill=(0, 0, 0))
    d.text((40, im.height - 50), 'Esri World Imagery Wayback 37890 (Maxar WV-3, 2020-10-30) - Esri, Maxar, Earthstar Geographics. Internal measurement only.',
           fill=(255, 255, 255), font=f, stroke_width=3, stroke_fill=(0, 0, 0))
    im.thumbnail((2000, 2000))
    im.save(dst)
    print(f'[photo_meta] {dst}')


if __name__ == '__main__':
    main()

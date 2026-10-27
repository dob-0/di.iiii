#!/usr/bin/env python3
"""osm_footprint.py: one building's footprint from OpenStreetMap, in WGS84 and in local metres (di.iiii).

Source: the OSM API 0.6 `way/<id>/full` (ODbL 1.0, "(c) OpenStreetMap contributors"). Used when Overpass is unreachable.
Local metres: east/north of an origin (the address node by default) on the local tangent plane (equirectangular about the
origin; at < 200 m the error against UTM is under 1 cm). Edges: length (m) and bearing (deg from north), in ring order.
  python3 scripts/place/osm_footprint.py --way 457239427 [--origin-node 13296475769 | --origin LAT LON] --out FILE.json
"""
import argparse, datetime, json, math, urllib.request, xml.etree.ElementTree as ET
UA = {'User-Agent': 'di.iiii-osm-footprint/1.0 (+https://diiii.xyz)'}
API = 'https://api.openstreetmap.org/api/0.6'


def get(path):
    return ET.fromstring(urllib.request.urlopen(urllib.request.Request(API + path, headers=UA), timeout=30).read())


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--way', required=True); ap.add_argument('--origin-node'); ap.add_argument('--origin', nargs=2, type=float)
    ap.add_argument('--out', required=True); ap.add_argument('--note', default='')
    a = ap.parse_args()
    r = get(f'/way/{a.way}/full'); nodes = {n.get('id'): n for n in r.iter('node')}; w = r.find('way')
    ring = [(float(nodes[nd.get('ref')].get('lat')), float(nodes[nd.get('ref')].get('lon'))) for nd in w.iter('nd')]
    tags = {t.get('k'): t.get('v') for t in w.iter('tag')}
    origin = {'kind': 'centroid'}
    if a.origin_node:
        n = get(f'/node/{a.origin_node}').find('node'); lat0, lon0 = float(n.get('lat')), float(n.get('lon'))
        origin = {'kind': 'osm node', 'id': int(a.origin_node), 'version': int(n.get('version')), 'tags': {t.get('k'): t.get('v') for t in n.iter('tag')}}
    elif a.origin: lat0, lon0 = a.origin; origin = {'kind': 'given'}
    else: lat0, lon0 = sum(p[0] for p in ring[:-1])/(len(ring) - 1), sum(p[1] for p in ring[:-1])/(len(ring) - 1)
    origin.update(lat=lat0, lon=lon0)
    R = 6371008.8; k = math.cos(math.radians(lat0))
    en = [(round(math.radians(lo - lon0)*R*k, 3), round(math.radians(la - lat0)*R, 3)) for la, lo in ring]
    edges = [{'from': i, 'to': i + 1, 'length_m': round(math.dist(en[i], en[i + 1]), 2),
              'bearing_deg': round(math.degrees(math.atan2(en[i + 1][0] - en[i][0], en[i + 1][1] - en[i][1])) % 360, 1)} for i in range(len(en) - 1)]
    area = 0.5*abs(sum(en[i][0]*en[i + 1][1] - en[i + 1][0]*en[i][1] for i in range(len(en) - 1)))
    out = {'source': {'what': f'OpenStreetMap way {a.way}', 'url': f'https://www.openstreetmap.org/way/{a.way}', 'api': f'{API}/way/{a.way}/full',
                      'version': int(w.get('version')), 'edited': w.get('timestamp'), 'editor': w.get('user'), 'licence': 'ODbL 1.0, (c) OpenStreetMap contributors',
                      'fetched': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')},
           'tags': tags, 'origin': origin, 'frame': 'local tangent plane at the origin: x east (m), y north (m)',
           'wgs84': [[la, lo] for la, lo in ring], 'local_m': en, 'edges': edges, 'area_m2': round(area, 1), 'note': a.note}
    json.dump(out, open(a.out, 'w'), indent=1, ensure_ascii=False); print(json.dumps({k: out[k] for k in ('source', 'edges', 'area_m2')}, ensure_ascii=False)[:1500])


if __name__ == '__main__':
    main()

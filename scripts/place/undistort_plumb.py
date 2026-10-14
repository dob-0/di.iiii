#!/usr/bin/env python3
"""Plumb-line undistortion of a wide-angle photo (one-parameter division model), before any fit or projection.

Method: plumb-line ("straight lines have to be straight", Devernay & Faugeras, MVA 2001) with the one-parameter
division model (Fitzgibbon, CVPR 2001): p_u = p_d / (1 + k |p_d|^2), centred on the image centre, r normalised by the
half-diagonal. k is found as in Aleman-Flores, Alvarez, Gomez & Santana-Cedres (IPOL 2014, "Automatic lens distortion
correction using one-parameter division models"): Canny edge points are undistorted for each candidate k and the
Hough transform's strongest 40 lines are scored; the k with the most votes on its strongest lines makes the long
edges (space-frame chords, runway girder, lantern edges, column sides) straightest. Golden-section refine after a
grid. Straightness residual = rms distance of the edge points within 3 px of those 40 lines, before and after.
(A first attempt on traced Canny chains found only 7 chains >= 700 px in this cluttered roof and did not move k:
superseded.)
The division model is the identity at the centre, so the undistorted image keeps the EXIF focal length in px.

Output: <out>/<stem>-undist.png (same size, centre crop of the undistorted field) and <stem>-undist.json
(k, the straightness rms before and after on the same pieces, the number of pieces, f_px).

  ~/tools/photo-analysis/.venv/bin/python scripts/place/undistort_plumb.py PHOTO --f 1502 --out DIR
"""
import argparse, json, os
import numpy as np
import cv2
from PIL import Image, ImageOps
from scipy.optimize import minimize_scalar

MIN_LEN, PIECE = 700, 700  # long chains: the sagitta of barrel distortion grows with chord length squared


def pieces(gray):
    e = cv2.Canny(cv2.GaussianBlur(gray, (0, 0), 1.5), 40, 120)
    cs, _ = cv2.findContours(e, cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
    out = []
    for c in cs:
        c = c[:, 0, :].astype(float)
        if len(c) < MIN_LEN:
            continue
        for i in range(0, len(c) - PIECE + 1, PIECE):
            q = c[i:i + PIECE]
            if np.linalg.norm(q[-1] - q[0]) > 0.9 * PIECE:  # an open, roughly straight chain (not a loop or blob)
                out.append(q)
    return out


def line_rms(q):
    q = q - q.mean(0)
    return np.sqrt(np.linalg.eigvalsh(q.T @ q / len(q))[0])


def undist_pts(q, k, c, R):
    p = (q - c) / R
    return c + R * p / (1 + k * (p ** 2).sum(1, keepdims=True))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('photo'); ap.add_argument('--f', type=float, required=True); ap.add_argument('--out', required=True)
    a = ap.parse_args()
    im = np.array(ImageOps.exif_transpose(Image.open(a.photo)).convert('RGB'))
    H, W = im.shape[:2]
    c, R = np.array([W / 2, H / 2]), np.hypot(W, H) / 2
    g = cv2.cvtColor(im, cv2.COLOR_RGB2GRAY)
    e = cv2.Canny(cv2.GaussianBlur(g, (0, 0), 1.5), 40, 120)
    ys, xs = np.nonzero(e)
    E = np.c_[xs, ys].astype(float)
    S = 0.5  # Hough on a half-size canvas

    def hough(k, top=40):
        q = undist_pts(E, k, c, R) if k else E
        q = (q - c) * S / max(1.0, np.abs(q - c).max() / (W / 2)) + c * S
        canvas = np.zeros((int(H * S), int(W * S)), np.uint8)
        qi = np.round(q).astype(int); m = (qi[:, 0] >= 0) & (qi[:, 0] < canvas.shape[1]) & (qi[:, 1] >= 0) & (qi[:, 1] < canvas.shape[0])
        canvas[qi[m, 1], qi[m, 0]] = 255
        L = cv2.HoughLinesWithAccumulator(canvas, 1, np.pi / 720, 60)
        if L is None:
            return 0.0, None, q
        L = L[np.argsort(-L[:, 0, 2])][:top, 0]
        return float(L[:, 2].sum()), L, q

    def resid(k):
        _, L, q = hough(k)
        d = np.abs(q[:, 0, None] * np.cos(L[None, :, 1]) + q[:, 1, None] * np.sin(L[None, :, 1]) - L[None, :, 0])
        dm = d.min(1); inl = dm < 3 * S
        return float(np.sqrt(np.mean((dm[inl] / S) ** 2))), int(inl.sum())

    grid = np.linspace(-0.5, 0.5, 41)
    sc = [hough(k)[0] for k in grid]
    k0 = grid[int(np.argmax(sc))]
    k = minimize_scalar(lambda kk: -hough(kk)[0], bounds=(k0 - 0.03, k0 + 0.03), method='bounded').x
    (rb, nb), (ra, na) = resid(0.0), resid(k)
    P, keep = [0] * len(sc), [0]
    # remap: output pixel (undistorted) -> source (distorted), inverse of the division model in closed form
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float64)
    pu = np.stack([(xx - c[0]) / R, (yy - c[1]) / R], -1)
    ru = np.hypot(pu[..., 0], pu[..., 1]); ru[ru == 0] = 1e-12
    disc = 1 - 4 * k * ru ** 2
    rd = np.where(disc > 0, (1 - np.sqrt(np.clip(disc, 0, None))) / (2 * k * ru), np.nan) if k != 0 else ru
    s = rd / ru
    mx = (c[0] + R * pu[..., 0] * s).astype(np.float32); my = (c[1] + R * pu[..., 1] * s).astype(np.float32)
    und = cv2.remap(im, mx, my, cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT)
    os.makedirs(a.out, exist_ok=True)
    stem = os.path.basename(a.photo).rsplit('.', 1)[0]
    cv2.imwrite(os.path.join(a.out, f'{stem}-undist.png'), cv2.cvtColor(und, cv2.COLOR_RGB2BGR))
    res = {'photo': a.photo, 'model': 'division, 1 parameter (Fitzgibbon 2001), centre = image centre, r normalised by half-diagonal',
           'method': 'plumb-line, Hough-scored (Aleman-Flores et al., IPOL 2014)', 'k': float(k),
           'score_grid': {f'{kk:+.3f}': round(v) for kk, v in zip(grid, sc)}, 'f_px': a.f, 'size': [W, H], 'edge_points': int(len(E)),
           'straightness_rms_px_before': rb, 'inliers_on_40_lines_before': nb,
           'straightness_rms_px_after': ra, 'inliers_on_40_lines_after': na}
    json.dump(res, open(os.path.join(a.out, f'{stem}-undist.json'), 'w'), indent=1)
    print(json.dumps(res, indent=1))


if __name__ == '__main__':
    main()

"""Find the floor in a reconstructed mesh, and a doorway to measure it by.

Reads {"glb": path, ...} on stdin, writes one JSON object on stdout. All
lengths are in the model's own units — nothing here knows what a metre is;
turning units into metres is fit.mjs's job, with a number from a tape measure
or a doorway it calls a GUESS.

What it does:

  floor   RANSAC for the largest flat surface in the mesh. In a room that is
          the floor or the ceiling, and nothing in the geometry alone says
          which — so the normal is turned to point at whichever side holds
          the body of the room, and a separate check (rooms have their
          clutter near the floor, never near the ceiling) says how sure that
          is. `flip: true` overrules it.

  door    In the frame where the floor is flat, every column of the mesh is
          looked at from the floor up. A solid wall is occupied all the way;
          an open doorway has a gap that starts at the floor and ends at the
          lintel. The tallest such gap, shorter than the room itself, is the
          doorway. A window's gap does not start at the floor, so it is not
          mistaken for one.

Needs numpy + trimesh.
"""
import json
import sys

import numpy as np
import trimesh


def load_points(path, limit=200_000):
    """Points spread evenly over the SURFACE, not the mesh's vertices.

    Every measurement here is really a question about area — which face of the
    room is biggest, where the mesh is dense. Vertices answer a different
    question: a modeller's wall and floor carry the same vertex count however
    different their size, and a simplifier moves vertices around by curvature.
    Sampling the surface makes one point mean one patch of room, which is what
    a scan's own points would have been.
    """
    loaded = trimesh.load(path, process=False)
    if isinstance(loaded, trimesh.Scene):
        # dump() bakes each node's transform into its geometry. Reading
        # scene.geometry directly skips those transforms, and a glTF writer is
        # free to put the whole size of the room on a node.
        parts = loaded.dump()
        loaded = trimesh.util.concatenate(parts) if len(parts) > 1 else parts[0]
    faces = int(np.asarray(loaded.faces).shape[0])
    try:
        # A fixed seed: the same mesh must fit the same way twice.
        points, _face_index = trimesh.sample.sample_surface(loaded, limit, seed=7)
        points = np.asarray(points, dtype=np.float64)
    except Exception:
        points = np.asarray(loaded.vertices, dtype=np.float64)
        if points.shape[0] > limit:
            rng = np.random.default_rng(7)
            points = points[rng.choice(points.shape[0], limit, replace=False)]
    return points, faces


def box_axes(points):
    """The three directions the room itself runs in.

    A room is a box. Its oriented bounding box gives the three axes that box
    stands on, whatever angle the camera was held at — and the floor is a face
    of it. Falls back to the principal axes if the hull cannot be built.
    """
    try:
        obb = trimesh.points.PointCloud(points).bounding_box_oriented
        matrix = np.asarray(obb.primitive.transform)[:3, :3]
        axes = [matrix[:, i] / np.linalg.norm(matrix[:, i]) for i in range(3)]
        extents = [float(value) for value in obb.primitive.extents]
    except Exception:
        centred = points - points.mean(axis=0)
        _u, _s, vh = np.linalg.svd(centred, full_matrices=False)
        axes = [vh[i] / np.linalg.norm(vh[i]) for i in range(3)]
        extents = [float(np.ptp(centred @ axis)) for axis in axes]
    return axes, extents


def face_plane(points, axis, low_end, tolerance):
    """The boundary plane at one end of an axis, and how much mesh lies on it.

    The plane sits at the MEDIAN of the outermost slab, not at the extreme
    point. A scan's surface is a noisy band, and a plane pinned to the
    furthest stray point counts almost none of that band as its own — which is
    how a wall out-scored a floor twice on 2026-09-21.
    """
    projected = points @ axis
    low, high = float(projected.min()), float(projected.max())
    band = max(tolerance * 3, (high - low) * 0.02)
    if low_end:
        slab = projected[projected < low + band]
        normal = np.asarray(axis, dtype=np.float64)
        offset = -float(np.median(slab))
    else:
        slab = projected[projected > high - band]
        normal = -np.asarray(axis, dtype=np.float64)
        offset = float(np.median(slab))
    inliers = np.abs(points @ normal + offset) < tolerance
    return normal, offset, int(inliers.sum()), inliers


def refine(points, normal, offset, tolerance):
    """Least squares over the face's own points: a plane that is right, not near."""
    inliers = np.abs(points @ normal + offset) < tolerance
    chosen = points[inliers]
    if chosen.shape[0] < 16:
        return normal, offset, int(inliers.sum())
    centroid = chosen.mean(axis=0)
    _u, _s, vh = np.linalg.svd(chosen - centroid, full_matrices=False)
    refined = vh[2] / np.linalg.norm(vh[2])
    if float(refined @ normal) < 0:
        refined = -refined
    return refined, -float(refined @ centroid), int(inliers.sum())


def find_floor_plane(points, tolerance_fraction=0.006):
    """Which way is up, and where the floor is.

    Counting inliers alone picks a wall as readily as a floor — a hall's wall
    is as big and as flat as its floor, and "everything is on one side of it"
    is true of every face of the box, not just the floor (it picked a wall
    twice, 2026-09-21). What is actually true of a room is this: the floor and
    the ceiling are the biggest PAIR of opposite faces, because a hall is
    wider than it is tall. So each of the box's three axes is scored by both
    its faces together, and the winner is the vertical.

    Floor against ceiling is then settled by where the clutter is — rooms have
    theirs near the floor — and that is a guess, which is why --flip exists.
    """
    extent = float(np.linalg.norm(points.max(axis=0) - points.min(axis=0)))
    tolerance = max(extent * tolerance_fraction, 1e-9)
    axes, extents = box_axes(points)

    scored = []
    for index, axis in enumerate(axes):
        low = face_plane(points, axis, True, tolerance)
        high = face_plane(points, axis, False, tolerance)
        scored.append({
            'index': index,
            'axis': axis,
            'extent': extents[index],
            'low': low,
            'high': high,
            'pair': low[2] + high[2],
        })
    best = max(scored, key=lambda entry: entry['pair'])

    # Which end of that axis is the floor: the end the clutter sits near.
    axis = np.asarray(best['axis'], dtype=np.float64)
    along = points @ axis
    span = float(along.max() - along.min())
    from_low = along - along.min()
    near_low = float(((from_low > span * 0.05) & (from_low < span * 0.35)).mean())
    near_high = float(((from_low > span * 0.65) & (from_low < span * 0.95)).mean())
    low_is_floor = near_low >= near_high

    normal, offset, hits, _mask = best['low'] if low_is_floor else best['high']
    normal, offset, hits = refine(points, normal, offset, tolerance)

    # Stand the room square, not just upright. The shortest turn that takes
    # the floor to horizontal leaves the room spun by whatever angle the
    # camera wandered — and a walkable floor is declared as axis-aligned
    # rectangles, so a room left at 23 degrees would have its corners walled
    # off and air to walk into. The box already knows where the walls run:
    # its longest horizontal axis becomes +X.
    horizontal = [entry for entry in scored if entry['index'] != best['index']]
    longest = max(horizontal, key=lambda entry: entry['extent'])
    right = np.asarray(longest['axis'], dtype=np.float64)
    right = right - normal * float(right @ normal)      # square it to the floor
    right = right / np.linalg.norm(right)
    forward = np.cross(right, normal)
    forward = forward / np.linalg.norm(forward)
    basis = np.vstack([right, normal, forward])          # rows: model → room

    return {
        'normal': normal,
        'offset': offset,
        'hits': hits,
        'tolerance': tolerance,
        'basis': basis,
        'axisExtents': extents,
        'verticalExtent': best['extent'],
        'faceInliers': {'low': best['low'][2], 'high': best['high'][2]},
        'clutter': {'nearFloor': near_low, 'nearCeiling': near_high},
        'lowIsFloor': bool(low_is_floor),
    }


def quaternion_from_matrix(matrix):
    """Rotation matrix (rows = the new axes) → quaternion [x, y, z, w]."""
    m = np.asarray(matrix, dtype=np.float64).T   # columns = new axes
    trace = m[0, 0] + m[1, 1] + m[2, 2]
    if trace > 0:
        scale = np.sqrt(trace + 1.0) * 2
        return np.array([(m[2, 1] - m[1, 2]) / scale, (m[0, 2] - m[2, 0]) / scale,
                         (m[1, 0] - m[0, 1]) / scale, 0.25 * scale])
    if m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
        scale = np.sqrt(1.0 + m[0, 0] - m[1, 1] - m[2, 2]) * 2
        return np.array([0.25 * scale, (m[0, 1] + m[1, 0]) / scale,
                         (m[0, 2] + m[2, 0]) / scale, (m[2, 1] - m[1, 2]) / scale])
    if m[1, 1] > m[2, 2]:
        scale = np.sqrt(1.0 + m[1, 1] - m[0, 0] - m[2, 2]) * 2
        return np.array([(m[0, 1] + m[1, 0]) / scale, 0.25 * scale,
                         (m[1, 2] + m[2, 1]) / scale, (m[0, 2] - m[2, 0]) / scale])
    scale = np.sqrt(1.0 + m[2, 2] - m[0, 0] - m[1, 1]) * 2
    return np.array([(m[0, 2] + m[2, 0]) / scale, (m[1, 2] + m[2, 1]) / scale,
                     0.25 * scale, (m[1, 0] - m[0, 1]) / scale])


def find_door(points, floor_y, height, cells=110):
    """The tallest gap that starts at the floor and stops short of the ceiling."""
    if height <= 0:
        return None
    xs, ys, zs = points[:, 0], points[:, 1] - floor_y, points[:, 2]
    x_min, x_max = float(xs.min()), float(xs.max())
    z_min, z_max = float(zs.min()), float(zs.max())
    step = max((x_max - x_min), (z_max - z_min)) / cells
    if step <= 0:
        return None
    ix = np.floor((xs - x_min) / step).astype(np.int64)
    iz = np.floor((zs - z_min) / step).astype(np.int64)
    key = ix * 100_000 + iz
    order = np.argsort(key, kind='stable')
    key_sorted = key[order]
    y_sorted = ys[order]
    boundaries = np.flatnonzero(np.diff(key_sorted)) + 1
    starts = np.concatenate(([0], boundaries))
    ends = np.concatenate((boundaries, [key_sorted.shape[0]]))

    floor_band = height * 0.12      # a doorway's gap starts at the floor
    ceiling_band = height * 0.90    # above this it is just open air, not a door
    smallest = height * 0.25        # below this it is furniture
    best = None
    for start, end in zip(starts, ends):
        if end - start < 12:
            continue
        column = np.sort(y_sorted[start:end])
        gaps = np.diff(column)
        index = int(np.argmax(gaps))
        low = float(column[index])
        gap_top = float(column[index + 1])
        if low > floor_band:
            continue  # a window, a shelf — not something you walk through
        if not (smallest < gap_top < ceiling_band):
            continue
        # A doorway has a LINTEL: wall between the top of the opening and the
        # ceiling. Open floor in the middle of the room also shows a gap from
        # the floor to the ceiling, and without this test it is read as a
        # three-metre door (it was, 2026-09-21).
        lintel = column[(column > gap_top + height * 0.04) & (column < ceiling_band)]
        if lintel.shape[0] < 4:
            continue
        if best is None or gap_top > best['height']:
            cell = key_sorted[start]
            best = {
                'height': gap_top,
                'x': x_min + (cell // 100_000 + 0.5) * step,
                'z': z_min + (cell % 100_000 + 0.5) * step,
            }
    return best


def uprightness(clutter):
    """How sure we are that the floor is the floor and not the ceiling.

    Read off the same numbers the choice was made with, never recomputed — a
    confidence that can contradict the decision it describes is worse than no
    confidence at all.
    """
    near_floor = clutter['nearFloor']
    near_ceiling = clutter['nearCeiling']
    if near_ceiling <= 0 and near_floor <= 0:
        return {'verdict': 'uncertain', 'note': 'the room is empty — nothing says which way is up',
                **clutter}
    ratio = near_floor / near_ceiling if near_ceiling > 0 else float('inf')
    if ratio >= 1.25:
        return {'verdict': 'likely', 'ratio': ratio, **clutter,
                'note': 'more of the room sits near this surface than near the opposite one, as a floor does'}
    return {'verdict': 'uncertain', 'ratio': ratio, **clutter,
            'note': 'the room is evenly spread top to bottom — look at the picture before trusting which way is up, and use --flip if it hangs from the sky'}


def main():
    request = json.load(sys.stdin)
    points, faces = load_points(request['glb'], int(request.get('samples', 200_000)))
    found = find_floor_plane(points)
    normal, offset, basis = found['normal'], found['offset'], found['basis']
    if request.get('flip'):
        normal, offset = -normal, -offset
        # Turning the room over keeps it square: the floor axis flips and one
        # horizontal axis flips with it, or the basis stops being right-handed.
        basis = np.vstack([basis[0], -basis[1], -basis[2]])

    quaternion = quaternion_from_matrix(basis)
    aligned = points @ basis.T
    on_plane = np.abs(points @ normal + offset) < found['tolerance']
    floor_y = float(np.median(aligned[on_plane][:, 1]))
    minimum = aligned.min(axis=0)
    maximum = aligned.max(axis=0)
    height = float(maximum[1] - floor_y)

    json.dump({
        'faces': faces,
        'sampled': int(points.shape[0]),
        'floor': {
            'normal': [float(value) for value in normal],
            'offset': float(offset),
            'inliers': int(found['hits']),
            'inlierFraction': float(found['hits'] / points.shape[0]),
            'tolerance': float(found['tolerance']),
            'y': floor_y,
            'axisExtents': found['axisExtents'],
            'faceInliers': found['faceInliers'],
        },
        'quaternion': [float(value) for value in quaternion],
        'bounds': {
            'min': [float(value) for value in minimum],
            'max': [float(value) for value in maximum],
        },
        'height': height,
        'door': find_door(aligned, floor_y, height),
        'confidence': uprightness(found['clutter']),
    }, sys.stdout)


if __name__ == '__main__':
    main()

/* The license text can be found in the LICENSE file */

// Concave hull whose result depends on the geometry only, never on point or
// traversal order or on the orientation of the coordinate axes, so a point
// set that is symmetric about any line yields a hull symmetric about it.
//
// Like `hull.js`, it starts from the convex hull and digs long edges towards
// inner points, but:
// - every round, all edges propose a point against the same frozen outline,
//   and the proposals are applied together;
// - each edge searches a growing distance around itself, not a grid box;
// - candidates are ranked by their larger end angle, then by their angle
//   sum, and everything within `ANGLE_TOL` of the best counts as a tie;
// - points tied for best on one edge go in together, ordered along the edge;
// - two proposals that compete equally for a point, or dig across each
//   other, are both rejected and their edges look for the next best point;
// - geometric tests use a tolerance, so float noise between the two mirrored
//   halves cannot flip a decision.
//
// Every input point stays inside the outline or within the tolerance of it.

'use strict';

const convexHull = require('monotone-convex-hull-2d');
const segmentsIntersect = require('robust-segment-intersect');

const ANGLE_TOL = 1e-9; // radians
const MAX_ANGLE = Math.PI / 2 - ANGLE_TOL;
const MAX_SEARCH_SIZE_PERCENT = 0.6;

function _byX(a, b) {
    return (a[0] - b[0]) || (a[1] - b[1]);
}

function _cross(o, a, b) {
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function _sqLength(a, b) {
    return (b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]);
}

// Angle at o between o -> a and o -> b, in [0, PI].
function _angle(o, a, b) {
    return Math.atan2(Math.abs(_cross(o, a, b)),
        (a[0] - o[0]) * (b[0] - o[0]) + (a[1] - o[1]) * (b[1] - o[1]));
}

function _dot(o, a, b) {
    return (a[0] - o[0]) * (b[0] - o[0]) + (a[1] - o[1]) * (b[1] - o[1]);
}

// How far q is past p in the direction a -> b.
function _alongDelta(p, q, a, b) {
    return ((q[0] - p[0]) * (b[0] - a[0]) + (q[1] - p[1]) * (b[1] - a[1])) / Math.sqrt(_sqLength(a, b));
}

// Distance from p to segment a-b. Computed the same way whichever end comes
// first, so mirrored (and reversed) edges give equal results on exact inputs.
function _pointSegDist(p, a, b) {
    if (_dot(a, b, p) <= 0) {
        return Math.sqrt(_sqLength(a, p));
    }
    if (_dot(b, a, p) <= 0) {
        return Math.sqrt(_sqLength(b, p));
    }
    return Math.abs(_cross(a, b, p)) / Math.sqrt(_sqLength(a, b));
}

// Do segments a-b and c-d cross or come within tol of each other?
function _segsTouch(a, b, c, d, tol) {
    return segmentsIntersect(a, b, c, d) ||
        _pointSegDist(a, c, d) < tol || _pointSegDist(b, c, d) < tol ||
        _pointSegDist(c, a, b) < tol || _pointSegDist(d, a, b) < tol;
}

// Same, but segments sharing an end point only conflict if they fold onto
// each other.
function _segsConflict(a, b, c, d, tol) {
    const shared = a === c || a === d ? a : b === c || b === d ? b : null;
    if (shared === null) {
        return _segsTouch(a, b, c, d, tol);
    }
    const x = a === shared ? b : a,
        y = c === shared ? d : c;
    return _pointSegDist(x, shared, y) < tol || _pointSegDist(y, shared, x) < tol;
}

// Bounding box of points, grown by margin. Only used to narrow down
// candidates for exact distance tests, so it does not affect results.
function _bBox(points, margin) {
    const box = [Infinity, Infinity, -Infinity, -Infinity];
    for (let i = 0; i < points.length; i++) {
        box[0] = Math.min(box[0], points[i][0]);
        box[1] = Math.min(box[1], points[i][1]);
        box[2] = Math.max(box[2], points[i][0]);
        box[3] = Math.max(box[3], points[i][1]);
    }
    return [box[0] - margin, box[1] - margin, box[2] + margin, box[3] + margin];
}

function _bBoxesOverlap(a, b) {
    return a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
}

// Same as _bBoxesOverlap(box, _bBox([a, b], 0)), without building a box.
function _segmentBoxOverlap(a, b, box) {
    return box[0] <= Math.max(a[0], b[0]) && Math.min(a[0], b[0]) <= box[2] &&
        box[1] <= Math.max(a[1], b[1]) && Math.min(a[1], b[1]) <= box[3];
}

// First index in an x-sorted pointset whose x is >= x.
function _lowerBound(pointset, x) {
    let lo = 0, hi = pointset.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (pointset[mid][0] < x) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    return lo;
}

// Points of an x-sorted pointset inside box.
function _inBox(pointset, box) {
    const found = [];
    for (let i = _lowerBound(pointset, box[0]); i < pointset.length && pointset[i][0] <= box[2]; i++) {
        const p = pointset[i];
        if (p[1] >= box[1] && p[1] <= box[3]) {
            found.push(p);
        }
    }
    return found;
}

// The best primary score, and the best secondary score among those within
// ANGLE_TOL of it. This is the score of the whole band below: it depends
// only on the set of scores, not on which one comes first.
function _bestScore(scores) {
    let best0 = -Infinity, best1 = -Infinity;
    scores.forEach(function(s) { best0 = Math.max(best0, s[0]); });
    scores.forEach(function(s) {
        if (s[0] >= best0 - ANGLE_TOL) {
            best1 = Math.max(best1, s[1]);
        }
    });
    return [best0, best1];
}

// Indices of the scores ([primary, secondary], higher is better) that tie
// for best: primary within ANGLE_TOL of the best primary, then secondary
// within ANGLE_TOL of the best secondary among those. Unlike pairwise
// tolerant comparisons this is well defined and independent of order.
function _topBand(scores) {
    const best = _bestScore(scores), best0 = best[0], best1 = best[1];
    const band = [];
    scores.forEach(function(s, i) {
        if (s[0] >= best0 - ANGLE_TOL && s[1] >= best1 - ANGLE_TOL) {
            band.push(i);
        }
    });
    return band;
}

// Drops exact duplicates. pointset has to be sorted by X.
function _filterDuplicates(pointset) {
    return pointset.filter(function(p, i) {
        return i === 0 || _byX(p, pointset[i - 1]) !== 0;
    });
}

// Smallest circle enclosing points, as [center, squared radius]. Points
// within slack of the circle count as inside, so rounding noise between near
// identical points cannot force a circle through three nearly collinear ones.
function _enclosingCircle(points, slack) {
    const contains = function(circle, p) {
        return circle !== null && Math.sqrt(_sqLength(circle[0], p)) <= Math.sqrt(circle[1]) + slack;
    };
    const around = function(a, b) {
        const center = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        return [center, _sqLength(center, a)];
    };
    const through = function(a, b, c) {
        const bx = b[0] - a[0], by = b[1] - a[1], cx = c[0] - a[0], cy = c[1] - a[1];
        const d = 2 * (bx * cy - by * cx),
            b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
        const center = [a[0] + (cy * b2 - by * c2) / d, a[1] + (bx * c2 - cx * b2) / d];
        return [center, _sqLength(center, a)];
    };
    let circle = null;
    for (let i = 0; i < points.length; i++) {
        if (contains(circle, points[i])) {
            continue;
        }
        circle = [points[i], 0];
        for (let j = 0; j < i; j++) {
            if (contains(circle, points[j])) {
                continue;
            }
            circle = around(points[i], points[j]);
            for (let k = 0; k < j; k++) {
                if (!contains(circle, points[k])) {
                    circle = through(points[i], points[j], points[k]);
                }
            }
        }
    }
    return circle;
}

// Merges each group of points linked by distances below tol into the center
// of its smallest enclosing circle. Groups are found geometrically, so they
// do not depend on point order, and the center depends only on the outer
// points of the group: not on duplicates, near duplicates of the same corner
// or points inside it, which rounding can leave in one half and not the
// other. A group that does not fit in a circle of radius tol (a chain of near
// points) is kept as it is. pointset has to be sorted by X and free of exact
// duplicates.
function _mergeNearDuplicates(pointset, tol) {
    const parent = pointset.map(function(p, i) { return i; });
    const find = function(i) {
        while (parent[i] !== i) {
            parent[i] = parent[parent[i]];
            i = parent[i];
        }
        return i;
    };
    for (let i = 1; i < pointset.length; i++) {
        for (let j = i - 1; j >= 0 && pointset[i][0] - pointset[j][0] < tol; j--) {
            if (_sqLength(pointset[i], pointset[j]) < tol * tol) {
                parent[find(i)] = find(j);
            }
        }
    }

    const groups = new Map();
    pointset.forEach(function(p, i) {
        const root = find(i);
        if (!groups.has(root)) {
            groups.set(root, []);
        }
        groups.get(root).push(p);
    });

    const merged = [];
    groups.forEach(function(group) {
        const circle = group.length > 1 ? _enclosingCircle(group, tol * 1e-6) : null;
        if (circle !== null && circle[1] < tol * tol) {
            merged.push(circle[0]);
        } else {
            merged.push.apply(merged, group);
        }
    });
    return merged.sort(_byX);
}

function _farthestPair(points) {
    let best = -1, pair = null;
    for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
            const d = _sqLength(points[i], points[j]);
            if (d > best) {
                best = d;
                pair = [points[i], points[j]];
            }
        }
    }
    return pair;
}

// Is there another pair within tol of the diameter? Then picking one of
// them would be arbitrary (the two diagonals of a square).
function _diameterAmbiguous(points, ends, tol) {
    const limit = Math.sqrt(_sqLength(ends[0], ends[1])) - tol;
    for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
            const p = points[i], q = points[j];
            const same = (p === ends[0] && q === ends[1]) || (p === ends[1] && q === ends[0]);
            if (!same && Math.sqrt(_sqLength(p, q)) > limit) {
                return true;
            }
        }
    }
    return false;
}

// Convex hull plus the points within tol of exactly one of its edges,
// ordered along it. Exact collinearity is not reliable under float noise:
// one of two mirrored points can come out a vertex and the other just
// inside. Taking both keeps the vertices symmetric. Points near two edges,
// too close along an edge to order reliably, or whose edge would then leave
// an input point outside, are left inside. points must not be collinear.
// hull is the convex hull of points, as convexHull gives it.
function _convex(points, originals, tol, hull) {
    const onHull = new Set(hull);
    const near = new Map(); // point -> edges within tol
    hull.forEach(function(a, i) {
        const b = hull[(i + 1) % hull.length];
        _inBox(points, _bBox([a, b], tol)).forEach(function(p) {
            if (!onHull.has(p) && _pointSegDist(p, a, b) < tol) {
                if (!near.has(p)) {
                    near.set(p, []);
                }
                near.get(p).push(i);
            }
        });
    });

    const extra = hull.map(function() { return []; });
    near.forEach(function(edges, p) {
        if (edges.length === 1) {
            const a = hull[edges[0]], b = hull[(edges[0] + 1) % hull.length];
            if (_dot(a, b, p) > 0 && _dot(b, a, p) > 0) {
                extra[edges[0]].push(p);
            }
        }
    });

    const ring = [];
    hull.forEach(function(a, i) {
        const b = hull[(i + 1) % hull.length];
        const pts = extra[i].sort(function(p, q) { return _alongDelta(q, p, a, b); });
        ring.push(a);
        for (let k = 1; k < pts.length; k++) {
            if (_alongDelta(pts[k - 1], pts[k], a, b) < tol) {
                return;
            }
        }
        if (pts.length > 0 && !_swallows([a].concat(pts, [b]), originals, tol)) {
            ring.push.apply(ring, pts);
        }
    });
    return ring;
}

// Is chain e0 -> ... -> e1 simple and free of the ring, except for the edge
// e0-e1 it replaces?
function _chainFree(chain, ring, tol) {
    for (let i = 0; i < chain.length - 1; i++) {
        for (let j = i + 1; j < chain.length - 1; j++) {
            if (_segsConflict(chain[i], chain[i + 1], chain[j], chain[j + 1], tol)) {
                return false;
            }
        }
    }

    const e0 = chain[0],
        e1 = chain[chain.length - 1],
        box = _bBox(chain, tol);
    for (let i = 0; i < ring.length; i++) {
        const c = ring[i],
            d = ring[(i + 1) % ring.length];
        if ((c === e0 && d === e1) || (c === e1 && d === e0) ||
            !_segmentBoxOverlap(c, d, box)) {
            continue;
        }
        for (let k = 0; k < chain.length - 1; k++) {
            if (_segsConflict(chain[k], chain[k + 1], c, d, tol)) {
                return false;
            }
        }
    }
    return true;
}

// Would replacing edge e0-e1 with chain leave an input point outside the
// outline by tol or more? Points cut off by the chain, or within tol of the
// edge being removed, have to end up within tol of the chain itself.
function _swallows(chain, originals, tol) {
    const e0 = chain[0], e1 = chain[chain.length - 1];
    const candidates = _inBox(originals, _bBox(chain, tol));
    for (let k = 0; k < candidates.length; k++) {
        const p = candidates[k];
        let nearChain = false;
        for (let i = 0; i < chain.length - 1 && !nearChain; i++) {
            nearChain = _pointSegDist(p, chain[i], chain[i + 1]) < tol;
        }
        if (nearChain) {
            continue;
        }
        if (_pointSegDist(p, e0, e1) < tol) {
            return true;
        }
        let inside = false;
        for (let i = 0, j = chain.length - 1; i < chain.length; j = i++) {
            const a = chain[i], b = chain[j];
            if ((a[1] > p[1]) !== (b[1] > p[1]) &&
                p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) {
                inside = !inside;
            }
        }
        if (inside) {
            return true;
        }
    }
    return false;
}

function _scoreOf(candidate) {
    return candidate.score;
}

function _chainOf(proposal) {
    return [proposal.e0].concat(proposal.points, [proposal.e1]);
}

// Do two proposals claim the same point or dig across each other?
function _clash(a, b, tol) {
    for (let i = 0; i < a.points.length; i++) {
        if (b.points.indexOf(a.points[i]) >= 0) {
            return true;
        }
    }
    if (!_bBoxesOverlap(a.box, b.box)) {
        return false;
    }
    const ca = _chainOf(a), cb = _chainOf(b);
    for (let i = 0; i < ca.length - 1; i++) {
        for (let j = 0; j < cb.length - 1; j++) {
            if (_segsConflict(ca[i], ca[i + 1], cb[j], cb[j + 1], tol)) {
                return true;
            }
        }
    }
    return false;
}

// Area and diameter of a convex polygon.
function _measure(polygon) {
    let area = 0;
    for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i], b = polygon[(i + 1) % polygon.length];
        area += a[0] * b[1] - b[0] * a[1];
    }
    const ends = _farthestPair(polygon);
    return {area: Math.abs(area) / 2, diameter: Math.sqrt(_sqLength(ends[0], ends[1]))};
}

// Digs the ring (in `monotone-convex-hull-2d` order) towards the inner
// points. points are the x-sorted, merged points; originals the x-sorted
// input points that have to stay contained.
function _concave(points, originals, ring, maxEdgeLen, tol) {
    // `hull.js` grows its search box by the grid cell size, (occupied area) /
    // (number of points), until the box spans 60% of the occupied width and
    // height. Here the search reaches a growing distance from the edge until
    // it spans 60% of the diameter, measured independently of the axes.
    // Thresholds that exact inputs can hit exactly (grids) get a tol margin,
    // so float noise cannot decide them differently for mirrored edges.
    const size = _measure(ring),
        step = size.area / points.length || size.diameter,
        maxSearch = size.diameter * MAX_SEARCH_SIZE_PERCENT;

    const ids = new Map();
    points.forEach(function(p, i) { ids.set(p, i); });
    const edgeKey = function(a, b) {
        const i = ids.get(a), j = ids.get(b);
        return i < j ? i * points.length + j : j * points.length + i;
    };

    const onRing = new Set(ring);
    let inner = points.filter(function(p) { return !onRing.has(p); });
    const banned = new Map(); // edge -> points it may no longer claim
    const skip = new Set();   // edges with nothing left to claim

    const ban = function(proposal) {
        const key = edgeKey(proposal.e0, proposal.e1);
        if (!banned.has(key)) {
            banned.set(key, new Set());
        }
        proposal.points.forEach(function(p) { banned.get(key).add(p); });
    };

    // Free candidates of edge e0-e1 within radius of it that tie for best,
    // ordered along the edge, or null.
    const bestCandidates = function(e0, e1, radius) {
        const off = banned.get(edgeKey(e0, e1));
        const candidates = [];
        const box = _bBox([e0, e1], radius);
        for (let i = _lowerBound(inner, box[0]); i < inner.length && inner[i][0] <= box[2]; i++) {
            const p = inner[i];
            // same test as _inBox
            if (!(p[1] >= box[1] && p[1] <= box[3]) || (off && off.has(p))) {
                continue;
            }
            // _angle passes this same dot product to atan2: when it is
            // negative (not -0), the angle is at least 90 degrees and fails
            // MAX_ANGLE below, whatever the cross product, even NaN.
            if (_dot(e0, e1, p) < 0 || _dot(e1, e0, p) < 0 || _pointSegDist(p, e0, e1) > radius) {
                continue;
            }
            const a0 = _angle(e0, e1, p);
            if (a0 < MAX_ANGLE) {
                const a1 = _angle(e1, e0, p);
                if (a1 < MAX_ANGLE) {
                    candidates.push({point: p, score: [-Math.max(a0, a1), -(a0 + a1)]});
                }
            }
        }
        candidates.sort(function(a, b) { return b.score[0] - a.score[0]; });

        // walk down from the best primary score, keeping free candidates
        // within ANGLE_TOL of the first free one
        const free = [];
        for (let i = 0; i < candidates.length; i++) {
            if (free.length > 0 && candidates[i].score[0] < free[0].score[0] - ANGLE_TOL) {
                break;
            }
            if (_chainFree([e0, candidates[i].point, e1], ring, tol)) {
                free.push(candidates[i]);
            }
        }
        if (free.length === 0) {
            return null;
        }
        const scores = free.map(_scoreOf);
        const band = _topBand(scores).map(function(i) { return free[i]; });
        return {
            points: band.map(function(c) { return c.point; }).sort(function(p, q) {
                return _alongDelta(q, p, e0, e1);
            }),
            score: _bestScore(scores)
        };
    };

    // Ties too close along the edge have no reliable order.
    const ordered = function(proposal) {
        const pts = proposal.points;
        for (let i = 1; i < pts.length; i++) {
            if (_alongDelta(pts[i - 1], pts[i], proposal.e0, proposal.e1) < tol) {
                return false;
            }
        }
        return true;
    };

    // Best usable candidate(s) for edge e0-e1 against the frozen ring.
    const propose = function(e0, e1) {
        let radius = 0;
        for (let scale = 0; ; scale++) {
            radius += scale * step;
            for (;;) {
                const best = bestCandidates(e0, e1, radius + tol);
                if (best === null) {
                    break;
                }
                const proposal = {e0: e0, e1: e1, points: best.points, score: best.score};
                const chain = _chainOf(proposal);
                if (ordered(proposal) && _chainFree(chain, ring, tol) && !_swallows(chain, originals, tol)) {
                    proposal.box = _bBox(chain, tol);
                    return proposal;
                }
                ban(proposal); // not usable as a group: try the next best
            }
            if (2 * radius + tol >= maxSearch) {
                skip.add(edgeKey(e0, e1));
                return null;
            }
        }
    };

    // Accepts proposals best band first. Within a band, proposals that clash
    // with each other are all rejected and banned (a mirrored pair has equal
    // scores); proposals that clash with an already accepted, better one are
    // rejected. Every round accepts or bans something, so digging ends.
    const clashesWithAny = function(p, others) {
        for (let i = 0; i < others.length; i++) {
            if (others[i] !== p && _clash(p, others[i], tol)) {
                return true;
            }
        }
        return false;
    };
    const resolve = function(proposals) {
        const accepted = [];
        let pending = proposals;
        while (pending.length > 0) {
            const band = new Set(_topBand(pending.map(_scoreOf)));
            const top = [], rest = [];
            for (let i = 0; i < pending.length; i++) {
                (band.has(i) ? top : rest).push(pending[i]);
            }
            pending = rest;

            const alive = [];
            for (let i = 0; i < top.length; i++) {
                if (!clashesWithAny(top[i], accepted)) {
                    alive.push(top[i]);
                }
            }
            const winners = [];
            for (let i = 0; i < alive.length; i++) {
                if (clashesWithAny(alive[i], alive)) {
                    ban(alive[i]);
                } else {
                    winners.push(alive[i]);
                }
            }
            accepted.push.apply(accepted, winners);
        }
        return accepted;
    };

    for (;;) {
        const proposals = [];
        for (let i = 0; i < ring.length; i++) {
            const e0 = ring[i], e1 = ring[(i + 1) % ring.length];
            if (Math.sqrt(_sqLength(e0, e1)) < maxEdgeLen - tol || skip.has(edgeKey(e0, e1))) {
                continue;
            }
            const proposal = propose(e0, e1);
            if (proposal !== null) {
                proposals.push(proposal);
            }
        }
        if (proposals.length === 0) {
            return ring;
        }

        const inserts = new Map(), taken = new Set();
        resolve(proposals).forEach(function(proposal) {
            inserts.set(proposal.e0, proposal.points);
            proposal.points.forEach(function(p) { taken.add(p); });
        });
        if (inserts.size > 0) {
            const next = [];
            ring.forEach(function(p) {
                next.push(p);
                if (inserts.has(p)) {
                    next.push.apply(next, inserts.get(p));
                }
            });
            ring = next;
            inner = inner.filter(function(p) { return !taken.has(p); });
        }
    }
}

// points: [x, y] pairs. Returns a closed ring in the same winding as the
// default mode. Like the default mode, fewer than four distinct points come
// back sorted by X. Points that are collinear within tol give their two end
// points, unless those are ambiguous; then the convex outline is kept.
function symmetricHull(points, maxEdgeLen, tol) {
    if (points.length === 0) {
        return [];
    }

    const originals = _filterDuplicates(points.slice().sort(_byX));
    const merged = _mergeNearDuplicates(originals, tol);
    if (merged.length < 4) {
        return merged.concat([merged[0]]);
    }

    const hull = convexHull(merged).map(function(idx) { return merged[idx]; }),
        ends = _farthestPair(hull);
    if (originals.every(function(p) { return _pointSegDist(p, ends[0], ends[1]) < tol; }) &&
        (hull.length < 3 || !_diameterAmbiguous(hull, ends, tol))) {
        return ends.concat([ends[0]]);
    }

    const ring = _concave(merged, originals, _convex(merged, originals, tol, hull), maxEdgeLen, tol).reverse();
    return ring.concat([ring[0]]);
}

symmetricHull._topBand = _topBand;

module.exports = symmetricHull;

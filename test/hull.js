const assert = require("assert"),
    hull = require('../src/hull.js'),
    issue162 = require('./fixtures/issue162.json'),
    roundedBoard = require('./fixtures/rounded-board.json'),
    roundedCorners = require('./fixtures/rounded-corners.json');

const SYMMETRIC = {symmetric: true};

function _distToSegment(p, a, b) {
    const l2 = Math.pow(b[0] - a[0], 2) + Math.pow(b[1] - a[1], 2);
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / l2));
    return Math.hypot(p[0] - a[0] - t * (b[0] - a[0]), p[1] - a[1] - t * (b[1] - a[1]));
}

// Mirror about the vertical line x = axis.
function mirrorX(axis) {
    return function(p) { return [2 * axis - p[0], p[1]]; };
}

// Mirror about the line through o at angle phi.
function mirrorLine(o, phi) {
    const c = Math.cos(2 * phi), s = Math.sin(2 * phi);
    return function(p) {
        const x = p[0] - o[0], y = p[1] - o[1];
        return [o[0] + c * x + s * y, o[1] + s * x - c * y];
    };
}

// The mirrored outline visits the same vertices in the same cyclic order.
function assertMirrorSymmetric(polygon, mirror, eps) {
    const ring = polygon.slice(0, -1), n = ring.length;
    const mirrored = ring.map(mirror);
    const close = function(p, q) { return Math.hypot(p[0] - q[0], p[1] - q[1]) <= eps; };
    const matches = [mirrored, mirrored.slice().reverse()].some(function(m) {
        return ring.some(function(v, shift) {
            return ring.every(function(w, i) { return close(w, m[(i + shift) % n]); });
        });
    });
    assert(matches, 'outline is not symmetric: ' + JSON.stringify(polygon));
}

// Every point is inside the polygon or within eps of its outline.
function assertContains(polygon, points, eps) {
    points.forEach(function(p) {
        let inside = false;
        for (let i = 0; i < polygon.length - 1; i++) {
            const a = polygon[i], b = polygon[i + 1];
            if (_distToSegment(p, a, b) < eps) {
                return;
            }
            if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) {
                inside = !inside;
            }
        }
        assert(inside, p + ' is outside the hull');
    });
}

// No crossing, touching or overlapping edges, and no edge folding back onto
// its neighbour.
function assertSimple(polygon) {
    const cross = function(o, a, b) {
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    };
    const n = polygon.length - 1;
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            const a = polygon[i], b = polygon[i + 1], c = polygon[j], d = polygon[j + 1];
            if (j === i + 1 || (i === 0 && j === n - 1)) {
                const s = j === i + 1 ? [a, b, d] : [c, a, b];
                assert(_distToSegment(s[2], s[0], s[1]) > 0 && _distToSegment(s[0], s[1], s[2]) > 0,
                    'edges ' + i + ' and ' + j + ' fold');
                continue;
            }
            const cs = [cross(a, b, c), cross(a, b, d), cross(c, d, a), cross(c, d, b)];
            const crossing = cs.every(function(v) { return Math.abs(v) > 1e-9; }) && cs[0] * cs[1] < 0 && cs[2] * cs[3] < 0;
            const touching = Math.min(_distToSegment(a, c, d), _distToSegment(b, c, d),
                _distToSegment(c, a, b), _distToSegment(d, a, b)) === 0;
            assert(!crossing && !touching, 'edges ' + i + ' and ' + j + ' intersect');
        }
    }
}

function assertValid(polygon, points, mirror, tolerance) {
    assertMirrorSymmetric(polygon, mirror, 1e-9);
    assertContains(polygon, points, tolerance);
    assertSimple(polygon);
}

function signedArea(polygon) {
    let area = 0;
    for (let i = 0; i < polygon.length - 1; i++) {
        area += polygon[i][0] * polygon[i + 1][1] - polygon[i + 1][0] * polygon[i][1];
    }
    return area / 2;
}

function mirrored(half, axis) {
    const points = [];
    half.forEach(function(p) {
        points.push(p);
        if (p[0] !== axis) {
            points.push([2 * axis - p[0], p[1]]);
        }
    });
    return points;
}

module.exports = function() {
    it('should return correct hull of the "?" symbol', function() {
        const points = [[162, 332], [182, 299], [141, 292], [158, 264], [141, 408], [160, 400], [177, 430], [151, 442], [155, 425], [134, 430], [126, 447], [139, 466], [160, 471], [167, 447], [182, 466], [192, 442], [187, 413], [173, 403], [168, 425], [153, 413], [179, 275], [163, 292], [134, 270], [143, 315], [177, 320], [163, 311], [162, 281], [182, 255], [141, 226], [156, 235], [173, 207], [187, 230], [204, 194], [165, 189], [145, 201], [158, 167], [190, 165], [206, 145], [179, 153], [204, 114], [221, 138], [243, 112], [248, 139], [177, 122], [179, 99], [196, 82], [219, 90], [240, 75], [218, 61], [228, 53], [211, 34], [197, 51], [179, 65], [155, 70], [165, 85], [134, 80], [124, 58], [153, 44], [173, 34], [192, 27], [156, 19], [119, 32], [128, 17], [138, 36], [100, 58], [112, 73], [100, 92], [78, 100], [83, 78], [61, 63], [80, 44], [100, 26], [60, 39], [43, 71], [34, 54], [32, 90], [53, 104], [60, 82], [66, 99], [247, 94], [187, 180], [221, 168]];
        const expected = [[34,54], [60,39], [100,26], [128,17], [156,19], [192,27], [211,34], [228,53], [240,75], [247,94], [248,139], [221,168], [204,194], [187,230], [182,255], [182,299], [177,320], [162,332], [160,400], [173,403], [187,413], [192,442], [182,466], [160,471], [139,466], [126,447], [134,430], [141,408], [143,315], [141,292], [134,270], [141,226], [145,201], [158,167], [177,122], [165,85], [134,80], [100,92], [78,100], [53,104], [32,90], [34,54]];
        assert.deepEqual(hull(points, 50), expected);
    });

    it('should return only outer hull of the polygon with hole', function() {
        const points = [[141, 408], [160, 400], [177, 430], [151, 442], [155, 425], [134, 430], [126, 447], [139, 466], [160, 471], [167, 447], [182, 466], [192, 442], [187, 413], [173, 403], [165, 430], [171, 430], [177, 437], [175, 443], [172, 444], [163, 448], [156, 447], [153, 438], [154, 431], [160, 428]];
        const expected = [[141,408], [160,400], [173,403], [187,413], [192,442], [182,466], [160,471], [139,466], [126,447], [141,408]];
        assert.deepEqual(hull(points, 50), expected);
    });

    it('should return concave hull with lngs and lats', function() {
        let points,
            expected;

        points = [{lng:-0.206792373176235, lat:51.4911165465815 }, {lng:-0.207062672933557, lat:51.4915703125214 }, {lng:-0.207465840096923, lat:51.4912077781219 }, {lng:-0.210193421020222, lat:51.4918159814458 }, {lng:-0.214944392455692, lat:51.4929945001276 }, {lng:-0.208133371509344, lat:51.4910830915252 }, {lng:-0.214162055384851, lat:51.4905275966855 }, {lng:-0.208161917730384, lat:51.4903551232517 }, {lng:-0.209680931181673, lat:51.4901894811742 }, {lng:-0.212571431609104, lat:51.4903145141462 }, {lng:-0.216849005460861, lat:51.4921781720221}];
        expected = [{lng: -0.214162055384851, lat: 51.4905275966855}, {lng: -0.212571431609104, lat: 51.4903145141462 }, {lng: -0.210193421020222, lat:51.4918159814458}, {lng: -0.208133371509344, lat: 51.4910830915252}, {lng: -0.209680931181673, lat: 51.4901894811742}, {lng: -0.208161917730384, lat: 51.4903551232517}, {lng: -0.207465840096923, lat: 51.4912077781219}, {lng: -0.206792373176235, lat: 51.4911165465815}, {lng: -0.207062672933557, lat: 51.4915703125214}, {lng: -0.214944392455692, lat: 51.4929945001276}, {lng: -0.216849005460861, lat: 51.4921781720221}, {lng: -0.214162055384851, lat: 51.4905275966855}];
        assert.deepEqual(hull(points, 0.0011, ['.lng', '.lat']), expected);

        points = [{lat: 10, lng: 10}, {lat: 100, lng: 10}, {lat: 100, lng: 100}];
        expected = [{lat: 10, lng: 10}, {lat: 100, lng: 10}, {lat: 100, lng: 100}, {lat: 10, lng: 10}];
        assert.deepEqual(hull(points, 10, ['.lng', '.lat']), expected);
    });

    it('should append the first point', function() {
        const points = [[141, 408], [160, 400], [177, 430]];
        const expected = [[141, 408], [160, 400], [177, 430], [141, 408]];
        assert.deepEqual(hull(points, 50), expected);
    });

    it('should not append the first point', function() {
        const points = [[141, 408], [160, 400], [141, 408]];
        const expected = [[141, 408], [160, 400], [141, 408]];
        assert.deepEqual(hull(points, 50), expected);
    });

    it('should not append the first point', function() {
        const points = [[141, 408], [160, 400], [177, 430], [141, 408]];
        const expected = [[141, 408], [160, 400], [177, 430], [141, 408]];
        assert.deepEqual(hull(points, 50), expected);
    });

    it('should not change the default hull when symmetric is off', function() {
        const points = [[0, 0], [10, 0], [10, 10], [0, 10], [3, 8], [7, 8], [5, 2]];
        const expected = [[10, 0], [7, 8], [10, 10], [3, 8], [0, 10], [5, 2], [0, 0], [10, 0]];
        assert.deepEqual(hull(points, 1), expected);
        assert.deepEqual(hull(points, 1, undefined, {}), expected);
        assert.deepEqual(hull(points, 1, undefined, {symmetric: false}), expected);
    });

    it('should return a symmetric hull of a mirrored keyboard (symmetric)', function() {
        const points = issue162.points;
        const xs = points.map(function(p) { return p[0]; });
        const axis = (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2;
        const result = hull(points, issue162.concavity, undefined, SYMMETRIC);
        assertMirrorSymmetric(result, mirrorX(axis), 1e-6);
        assertContains(result, points, 1e-6);
        assertSimple(result);
        assert(Math.sign(signedArea(result)) === Math.sign(signedArea(hull(points, issue162.concavity))));
    });

    it('should return symmetric hulls of keyboards with rounded corners (symmetric)', function() {
        // ergogen rounds coordinates, so the corners where keys touch come out
        // as groups of points 1e-7 apart, with exact or near identical
        // duplicates in one half and not in the other. Captured from rotated,
        // mirrored boards that used to give asymmetric hulls.
        [roundedBoard, roundedCorners].forEach(function(fixture) {
            const xs = fixture.points.map(function(p) { return p[0]; });
            const axis = (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2;
            const result = hull(fixture.points, fixture.concavity, undefined, SYMMETRIC);
            assertMirrorSymmetric(result, mirrorX(axis), 1e-6);
            assertContains(result, fixture.points, 1e-5);
            assertSimple(result);
        });
    });

    it('should return a symmetric hull for an oblique mirror axis (symmetric)', function() {
        // the axis is rotated by 0.3 rad, so axis-aligned search boxes differ
        // between the two halves
        const rotate = function(p) {
            return [p[0] * Math.cos(0.3) - p[1] * Math.sin(0.3), p[0] * Math.sin(0.3) + p[1] * Math.cos(0.3)];
        };
        const points = mirrored([[7.5, 0.9], [4.8, 8.1], [4.6, 5.3], [5.5, 2.3], [9.2, 8.3], [3.3, 8.7], [5, 4.9]], 0).map(rotate);
        const result = hull(points, 1, undefined, SYMMETRIC);
        assertValid(result, points, mirrorLine([0, 0], Math.PI / 2 + 0.3), 1e-5);
    });

    it('should insert tied candidates of one edge together (symmetric)', function() {
        // [3, 8] and [7, 8] tie for the top edge; the default mode takes one of
        // them for the top edge and the other for a side edge
        const points = [[0, 0], [10, 0], [10, 10], [0, 10], [3, 8], [7, 8], [5, 2]];
        const expected = [[5, 2], [10, 0], [10, 10], [7, 8], [3, 8], [0, 10], [0, 0], [5, 2]];
        assert.deepEqual(hull(points, 1, undefined, SYMMETRIC), expected);
        assertValid(expected, points, mirrorX(5), 1e-5);
    });

    it('should not order points stacked across an edge arbitrarily (symmetric)', function() {
        // points on the mirror axis, or mirrored pairs at the same position
        // along an edge, have no order that both halves agree on
        let points = [[-100, 0], [100, 0], [100, 50], [0, 50], [-100, 50], [0, 0.0001], [0, 0.003]];
        assertValid(hull(points, 60, undefined, SYMMETRIC), points, mirrorX(0), 1e-5);

        points = mirrored([[7, 0], [2, 1.5e-5], [2, 2.7e-5], [1, 5], [3, 5], [4, 7], [5, 3], [5, 9]], 0);
        assertValid(hull(points, 2, undefined, SYMMETRIC), points, mirrorX(0), 1e-5);
    });

    it('should only add points near one convex hull edge (symmetric)', function() {
        // [0, 10 - 1.2e-5] is within the tolerance of both edges at the apex
        let points = [[0, 10], [-10, 0], [10, 0], [0, 10 - 1.2e-5], [-3, 4], [3, 4], [-2, 2], [2, 2], [0, 1]];
        assertValid(hull(points, 5, undefined, SYMMETRIC), points, mirrorX(0), 1e-5);

        points = [[0.8921979833394289, 9.670952307060361], [-0.8921979833394289, 9.670952307060361],
            [0.09299464151263237, 2.2427594964392483], [-0.09299464151263237, 2.2427594964392483],
            [0, 8.19945560535416], [0, 4.12408564472571]];
        assertValid(hull(points, 8, undefined, {symmetric: true, tolerance: 1}), points, mirrorX(0), 1);
    });

    it('should keep points near a removed edge within the tolerance (symmetric)', function() {
        // S sits just past the tolerance from C, near the edge that a later
        // dig removes
        const dy = Math.sqrt(1600 - 64), u = [0.2, dy / 40], n = [dy / 40, -0.2], c = [-8, 50 - dy], r = 4e-5;
        const s = [c[0] + r * u[1] * u[0] + r * 0.2 * n[0], c[1] + r * u[1] * u[1] + r * 0.2 * n[1]];
        const points = [[-60, 0], [-40, 0], [-20, 0], [0, 0], [20, 0], [40, 0], [60, 0], [0, 50], c, [8, c[1]],
            s, [-s[0], s[1]], [0, 50 - 0.0005], [-1, 15], [1, 15]];
        assertValid(hull(points, 25, undefined, SYMMETRIC), points, mirrorX(0), 1e-5);
    });

    it('should keep points near an acute apex within the tolerance (symmetric)', function() {
        [0.1, 1e-5].forEach(function(tolerance) {
            const half = 7.5 * Math.PI / 180, apex = [0, 10 / Math.tan(half)];
            const u = [Math.sin(half), Math.cos(half)], n = [-Math.cos(half), Math.sin(half)];
            const q = [apex[0] - 3 * tolerance * u[0] + 0.1 * tolerance * n[0], apex[1] - 3 * tolerance * u[1] + 0.1 * tolerance * n[1]];
            const dir = [-Math.cos(Math.PI / 3) * u[0] + Math.sin(Math.PI / 3) * n[0], -Math.cos(Math.PI / 3) * u[1] + Math.sin(Math.PI / 3) * n[1]];
            const c = [apex[0] + 8 * dir[0], apex[1] + 8 * dir[1]];
            const points = [apex, q, c, [-c[0], c[1]], [0, 150]];
            for (let y = 0; y <= 150; y += 10) {
                points.push([-10, y], [10, y]);
            }
            const result = hull(points, 15, undefined, {symmetric: true, tolerance: tolerance});
            assertContains(result, points, tolerance);
            assertSimple(result);
        });
    });

    it('should merge near duplicates into a symmetric hull (symmetric)', function() {
        // the mirrored pairs of near duplicates come in opposite orders, like
        // adjacent key corners rounded differently
        const points = [[0, 0], [10, 0], [10, 10], [0, 10], [3, 8], [3 + 2e-7, 8 - 1e-7], [7 - 2e-7, 8 - 1e-7], [7, 8], [5, 2]];
        const result = hull(points, 1, undefined, SYMMETRIC);
        assert.equal(result.length, 8);
        assertValid(result, points, mirrorX(5), 1e-5);
    });

    it('should not let exact duplicates weigh on merged points (symmetric)', function() {
        const points = [[0, 0], [10, 0], [10, 10], [0, 10], [5, 2], [3, 8], [3, 8], [3 + 0.8e-5, 8], [3 + 1.6e-5, 8],
            [7, 8], [7 - 0.8e-5, 8], [7 - 1.6e-5, 8]];
        assertValid(hull(points, 1, undefined, SYMMETRIC), points, mirrorX(5), 1e-5);
    });

    it('should not merge chains of near points into one (symmetric)', function() {
        // consecutive points are just over 1e-5 apart, and greedy merging
        // used to group the two mirrored chains differently
        const points = [[-10, -10], [10, -10], [-5, 0], [-4.999992, 0.000008], [-4.999984, 0.000016], [5, 0], [4.999992, 0.000008], [4.999984, 0.000016]];
        const result = hull(points, Infinity, undefined, SYMMETRIC);
        assertValid(result, points, mirrorX(0), 1e-9);
        assert.deepEqual(hull(points.slice().reverse(), Infinity, undefined, SYMMETRIC), result);
    });

    it('should keep every point of a dense convex set (symmetric)', function() {
        // neighbouring points are nearly collinear; removing them one by one
        // used to drift the outline inside the set
        const points = [];
        for (let i = 0; i < 5000; i++) {
            points.push([Math.cos(i * 2 * Math.PI / 5000), Math.sin(i * 2 * Math.PI / 5000)]);
        }
        const result = hull(points, Infinity, undefined, SYMMETRIC);
        // every point is a vertex, so none is left outside
        assert.equal(result.length, 5001);
        const vertices = new Set(result);
        assert(points.every(function(p) { return vertices.has(p); }));
    });

    it('should keep a noisy straight row simple (symmetric)', function() {
        const points = [];
        for (let i = 0; i <= 20; i++) {
            points.push([i * 19.05 - 190.5, (i % 3 - 1) * 1e-15], [i * 19.05 - 190.5, 60]);
        }
        points.push([0, 30]);
        const result = hull(points, 25, undefined, SYMMETRIC);
        assertContains(result, points, 1e-5);
        assertSimple(result);
    });

    it('should keep the convex outline when the diameter is ambiguous (symmetric)', function() {
        // within the tolerance of either diagonal, but picking one is arbitrary
        const flipX = mirrorX(0), flipY = function(p) { return [p[0], -p[1]]; };
        [
            [[[-1, -1], [-1, 1], [1, -1], [1, 1]], 1.5],
            [[[-5e-6, -5e-6], [-5e-6, 5e-6], [5e-6, -5e-6], [5e-6, 5e-6]], 1e-5],
            [[[-8e-6, -5.5e-6], [-8e-6, 5.5e-6], [8e-6, -5.5e-6], [8e-6, 5.5e-6]], 1e-5]
        ].forEach(function(test) {
            const result = hull(test[0], Infinity, undefined, {symmetric: true, tolerance: test[1]});
            assert.equal(result.length, 5);
            assertValid(result, test[0], flipX, test[1]);
            assertMirrorSymmetric(result, flipY, 1e-9);
        });

        const rotate = function(p) {
            return [p[0] * Math.cos(0.3) - p[1] * Math.sin(0.3), p[0] * Math.sin(0.3) + p[1] * Math.cos(0.3)];
        };
        const square = [[-1, -1], [-1, 1], [1, -1], [1, 1]].map(rotate);
        const result = hull(square, Infinity, undefined, {symmetric: true, tolerance: 1.5});
        assert.equal(result.length, 5);
        assertValid(result, square, mirrorLine([0, 0], 0.3), 1.5);
    });

    it('should not see crossings between rotated collinear edges (symmetric)', function() {
        // columns of key corners share x; once rotated, float cross products
        // of separated collinear edges can come out with crossing signs
        const half = [[34.436, 29.737], [34.436, 30.787], [54.536, 37.431], [34.436, 49.837], [92.636, 11.362],
            [54.536, 18.381], [34.436, 48.787], [54.536, 56.481], [34.436, -7.313], [72.536, -18.669],
            [54.536, 38.481], [34.436, 11.737], [92.636, 30.412], [72.536, 37.431], [72.536, -0.669]];
        [23.67, 28.84].forEach(function(degrees) {
            const t = degrees * Math.PI / 180;
            const rotate = function(p) { return [p[0] * Math.cos(t) - p[1] * Math.sin(t), p[0] * Math.sin(t) + p[1] * Math.cos(t)]; };
            const points = mirrored(half, 0).map(rotate);
            assertValid(hull(points, 10, undefined, SYMMETRIC), points, mirrorLine([0, 0], Math.PI / 2 + t), 1e-5);
        });
    });

    it('should score a tied group the same in both halves (symmetric)', function() {
        // candidates tie on the primary score but not on the secondary one;
        // the group's score must not depend on which comes first
        const half = [[-14, 3], [-14, 0], [-10, 0], [-5, 0], [0, 0], [-10, 10], [-10.500078077830436, 3.0233787982696665],
            [-8.24325829859757, 6.972813419265555], [-5.642049463847206, 2.4904805527997578]];
        const points = mirrored(half, 0);
        assertValid(hull(points, 7.5, undefined, SYMMETRIC), points, mirrorX(0), 1e-5);
    });

    it('should measure exact mirrored inputs exactly alike (symmetric)', function() {
        // distances to a reversed edge and centroids of mirrored groups used
        // to round differently in the two halves
        let points = [[-8, 6], [0, 0], [8, 6], [-4, 8], [0, 9], [4, 8], [-1, 2], [1, 2], [-3, 5], [3, 5]];
        assertValid(hull(points, 9.5, undefined, {symmetric: true, tolerance: 1}), points, mirrorX(0), 1);

        const half = [[-1.5, 0], [-1, 0], [-0.5, 0], [-1.5, 10], [-1, 10], [-0.5, 10], [0, 5], [0, -2], [0, 12]];
        points = half.concat(half.map(mirrorX(0)));
        const result = hull(points, Infinity, undefined, {symmetric: true, tolerance: 1});
        assert.deepEqual(result, [[0, -2], [1, 0], [1, 10], [0, 12], [-1, 10], [-1, 0], [0, -2]]);
        assertValid(result, points, mirrorX(0), 1);
    });

    it('should handle small and collinear sets (symmetric)', function() {
        assert.deepEqual(hull([], 20, undefined, SYMMETRIC), []);
        assert.deepEqual(hull([], 20, ['.x', '.y'], SYMMETRIC), []);
        assert.deepEqual(hull([[1, 2], [1, 2]], 20, undefined, SYMMETRIC), [[1, 2], [1, 2]]);
        assert.deepEqual(hull([[3, 0], [1, 2]], 20, undefined, SYMMETRIC), [[1, 2], [3, 0], [1, 2]]);
        assert.deepEqual(hull([[0, 0], [2, 0], [1, 0], [3, 0]], 20, undefined, SYMMETRIC), [[0, 0], [3, 0], [0, 0]]);
        assert.deepEqual(hull([[0, 0], [2, 1e-6], [1, 0], [3, 0]], 20, undefined, SYMMETRIC), [[0, 0], [3, 0], [0, 0]]);

        // fewer than four points come back like the default hull
        const triangle = [[0, 0], [10, 0], [5, 8]];
        assert.deepEqual(hull(triangle, 20, undefined, SYMMETRIC), hull(triangle, 20));
    });

    it('should reject an invalid tolerance (symmetric)', function() {
        const points = [[0, 0], [10, 0], [10, 10], [0, 10], [5, 2], [5, 2], [0, 0]];
        [0, -1, NaN, Infinity, '1e-5', null].forEach(function(tolerance) {
            assert.throws(function() {
                hull(points, 1, undefined, {symmetric: true, tolerance: tolerance});
            }, RangeError);
        });
        assert.deepEqual(hull(points, 1, undefined, {tolerance: 'ignored'}), hull(points, 1));
    });

    it('should support format (symmetric)', function() {
        const points = [[0, 0], [10, 0], [10, 10], [0, 10], [3, 8], [7, 8], [5, 2]];
        const objects = points.map(function(p) { return {lng: p[0], lat: p[1]}; });
        assert.deepEqual(hull(objects, 1, ['.lng', '.lat'], SYMMETRIC),
            hull(points, 1, undefined, SYMMETRIC).map(function(p) { return {lng: p[0], lat: p[1]}; }));
    });
}

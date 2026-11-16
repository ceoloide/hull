/* The license text can be found in the LICENSE file */

'use strict';

const intersect = require('robust-segment-intersect');
const grid = require('./grid.js');
const formatUtil = require('./format.js');
const convexHull = require('monotone-convex-hull-2d');
const symmetricHull = require('./symmetric.js');

function _filterDuplicates(pointset) {
    const unique = [pointset[0]];
    let lastPoint = pointset[0];
    for (let i = 1; i < pointset.length; i++) {
        const currentPoint = pointset[i];
        if (lastPoint[0] !== currentPoint[0] || lastPoint[1] !== currentPoint[1]) {
            unique.push(currentPoint);
        }
        lastPoint = currentPoint;
    }
    return unique;
}

function _sortByX(pointset) {
    return pointset.sort(function(a, b) {
        return (a[0] - b[0]) || (a[1] - b[1]);
    });
}

function _sqLength(a, b) {
    return Math.pow(b[0] - a[0], 2) + Math.pow(b[1] - a[1], 2);
}

function _cos(o, a, b) {
    const ax = a[0] - o[0], ay = a[1] - o[1],
        bx = b[0] - o[0], by = b[1] - o[1],
        sqALen = Math.pow(ax, 2) + Math.pow(ay, 2),
        sqBLen = Math.pow(bx, 2) + Math.pow(by, 2),
        dot = ax * bx + ay * by;

    return dot / Math.sqrt(sqALen * sqBLen);
}

// Exact segment tests never report segments whose bounding boxes are apart
// as intersecting, so those can be skipped. robust-segment-intersect is exact
// unless its arithmetic overflows or underflows, which it cannot when every
// coordinate is a number, 0 or of magnitude 2^-100 to 2^100. Otherwise (NaN,
// infinite, huge or tiny coordinates) its answers stand as they are.
function _boxTestSafe(pointset) {
    for (let i = 0; i < pointset.length; i++) {
        for (let k = 0; k < 2; k++) {
            const v = pointset[i][k];
            if (typeof v !== 'number' || v !== 0 && !(Math.abs(v) >= EXACT_MIN && Math.abs(v) <= EXACT_MAX)) {
                return false;
            }
        }
    }
    return true;
}

// Does segment a-b intersect the polyline pointset? Segments of the polyline
// that share a's position are ignored.
function _intersect(a, b, pointset, boxTest) {
    const minX = Math.min(a[0], b[0]), maxX = Math.max(a[0], b[0]),
        minY = Math.min(a[1], b[1]), maxY = Math.max(a[1], b[1]);
    for (let i = 0; i < pointset.length - 1; i++) {
        const c = pointset[i], d = pointset[i + 1];
        if (a[0] === c[0] && a[1] === c[1] || a[0] === d[0] && a[1] === d[1]) {
            continue;
        }
        if (boxTest && (c[0] < minX && d[0] < minX || c[0] > maxX && d[0] > maxX ||
            c[1] < minY && d[1] < minY || c[1] > maxY && d[1] > maxY)) {
            continue;
        }
        if (intersect(a, b, c, d)) {
            return true;
        }
    }
    return false;
}

function _occupiedArea(pointset) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (let i = pointset.length - 1; i >= 0; i--) {
        if (pointset[i][0] < minX) {
            minX = pointset[i][0];
        }
        if (pointset[i][1] < minY) {
            minY = pointset[i][1];
        }
        if (pointset[i][0] > maxX) {
            maxX = pointset[i][0];
        }
        if (pointset[i][1] > maxY) {
            maxY = pointset[i][1];
        }
    }

    return [
        maxX - minX, // width
        maxY - minY  // height
    ];
}

function _bBoxAround(edge) {
    return [
        Math.min(edge[0][0], edge[1][0]), // left
        Math.min(edge[0][1], edge[1][1]), // top
        Math.max(edge[0][0], edge[1][0]), // right
        Math.max(edge[0][1], edge[1][1])  // bottom
    ];
}

function _midPoint(edge, innerPoints, convex, boxTest) {
    let point = null,
        angle1Cos = MAX_CONCAVE_ANGLE_COS,
        angle2Cos = MAX_CONCAVE_ANGLE_COS,
        a1Cos, a2Cos;

    for (let i = 0; i < innerPoints.length; i++) {
        a1Cos = _cos(edge[0], edge[1], innerPoints[i]);
        a2Cos = _cos(edge[1], edge[0], innerPoints[i]);

        if (a1Cos > angle1Cos && a2Cos > angle2Cos &&
            !_intersect(edge[0], innerPoints[i], convex, boxTest) &&
            !_intersect(edge[1], innerPoints[i], convex, boxTest)) {

            angle1Cos = a1Cos;
            angle2Cos = a2Cos;
            point = innerPoints[i];
        }
    }

    return point;
}

function _concave(convex, maxSqEdgeLen, maxSearchArea, grid, edgeSkipList, boxTest) {
    let midPointInserted = false;

    for (let i = 0; i < convex.length - 1; i++) {
        const edge = [convex[i], convex[i + 1]];
        if (_sqLength(edge[0], edge[1]) < maxSqEdgeLen) { continue; }

        // generate a key in the format X0,Y0,X1,Y1
        const keyInSkipList = edge[0][0] + ',' + edge[0][1] + ',' + edge[1][0] + ',' + edge[1][1];
        if (edgeSkipList.has(keyInSkipList)) { continue; }

        let scaleFactor = 0;
        let bBoxAround = _bBoxAround(edge);
        let bBoxWidth;
        let bBoxHeight;
        let midPoint;
        do {
            bBoxAround = grid.extendBbox(bBoxAround, scaleFactor);
            bBoxWidth = bBoxAround[2] - bBoxAround[0];
            bBoxHeight = bBoxAround[3] - bBoxAround[1];

            midPoint = _midPoint(edge, grid.rangePoints(bBoxAround), convex, boxTest);
            scaleFactor++;
        }  while (midPoint === null && (maxSearchArea[0] > bBoxWidth || maxSearchArea[1] > bBoxHeight));

        if (bBoxWidth >= maxSearchArea[0] && bBoxHeight >= maxSearchArea[1]) {
            edgeSkipList.add(keyInSkipList);
        }

        if (midPoint !== null) {
            convex.splice(i + 1, 0, midPoint);
            grid.removePoint(midPoint);
            midPointInserted = true;
        }
    }

    if (midPointInserted) {
        return _concave(convex, maxSqEdgeLen, maxSearchArea, grid, edgeSkipList, boxTest);
    }

    return convex;
}

function hull(pointset, concavity, format, options) {
    let maxEdgeLen = concavity || 20;

    if (options && options.symmetric) {
        const tolerance = options.tolerance === undefined ? DEFAULT_TOLERANCE : options.tolerance;
        if (typeof tolerance !== 'number' || !isFinite(tolerance) || tolerance <= 0) {
            throw new RangeError('hull: tolerance must be a finite positive number');
        }
        const concave = symmetricHull(formatUtil.toXy(pointset, format), maxEdgeLen, tolerance);
        return format ? formatUtil.fromXy(concave, format) : concave;
    }

    const points = _filterDuplicates(_sortByX(formatUtil.toXy(pointset, format)));

    if (points.length < 4) {
        const concave = points.concat([points[0]]);
        return format ? formatUtil.fromXy(concave, format) : concave;
    }

    const occupiedArea = _occupiedArea(points);
    const maxSearchArea = [
        occupiedArea[0] * MAX_SEARCH_BBOX_SIZE_PERCENT,
        occupiedArea[1] * MAX_SEARCH_BBOX_SIZE_PERCENT
    ];

    const convex = convexHull(points).reverse().map(idx => points[idx]); // ccw -> cw, indices -> points
    convex.push(convex[0]);

    const innerPoints = points.filter(function(pt) {
        return convex.indexOf(pt) < 0;
    });

    const cellSize = Math.ceil(1 / (points.length / (occupiedArea[0] * occupiedArea[1])));

    const concave = _concave(
        convex, Math.pow(maxEdgeLen, 2),
        maxSearchArea, grid(innerPoints, cellSize), new Set(), _boxTestSafe(points));

    return format ? formatUtil.fromXy(concave, format) : concave;
}

const MAX_CONCAVE_ANGLE_COS = Math.cos(90 / (180 / Math.PI)); // angle = 90 deg
const MAX_SEARCH_BBOX_SIZE_PERCENT = 0.6;
const DEFAULT_TOLERANCE = 1e-5;
const EXACT_MIN = Math.pow(2, -100);
const EXACT_MAX = Math.pow(2, 100);

module.exports = hull;

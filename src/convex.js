function _ccw(p1, p2, p3, clockwise) {
    const crossProduct = (p2[0] - p1[0]) * (p3[1] - p1[1]) - (p2[1] - p1[1]) * (p3[0] - p1[0]);
    // For anti-clockwise (default): return true if clockwise or collinear (crossProduct <= 0)
    // For clockwise: return true if counter-clockwise or collinear (crossProduct >= 0)
    return clockwise ? crossProduct >= 0 : crossProduct <= 0;
}

function _tangent(pointset, clockwise) {
    const res = [];
    for (let t = 0; t < pointset.length; t++) {
        while (res.length > 1 && _ccw(res[res.length - 2], res[res.length - 1], pointset[t], clockwise)) {
            res.pop();
        }
        res.push(pointset[t]);
    }
    res.pop();
    return res;
}

// pointset has to be sorted by X
function convex(pointset, clockwise) {
    clockwise = clockwise || false; // default to anti-clockwise
    const upper = _tangent(pointset, clockwise),
          lower = _tangent(pointset.reverse(), clockwise);
    const convex = lower.concat(upper);
    convex.push(pointset[0]);
    return convex;
}

module.exports = convex;

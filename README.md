## NOTE: This library is unmaintained and deprecated.

<details>
    <summary>Click to expand library description</summary>

JavaScript library that builds concave hull by set of points.

Usage:

	var points = [ [236, 126], [234, 115], [238, 109], [247, 102], ... ];
	hull(points, 50); // returns points of the hull (in clockwise order)

Params:

* 1st param - array of coordinates in format: `[[x1, y1], [x2, y2], ..., [xn, yn]]`.
* 2nd param - concavity. `1` - thin shape. `Infinity` - convex hull. By default `20`.
* 3rd param - points format. For example: `['.lng', '.lat']` if you have `{lng: x, lat: y}` points. By default you can use `[x, y]` points.
* 4th param - options:
  * `symmetric` - build the hull from the geometry only, independent of point order and of the orientation of the axes, so a point set symmetric about any line yields a hull symmetric about it. By default `false`.
  * `tolerance` - with `symmetric`, a finite positive number in the units of the points; anything else throws a `RangeError`. Groups of points within this distance of each other merge into the center of their smallest enclosing circle when it fits within this radius, points this close to exactly one convex hull edge become vertices, and edges this close count as touching. Every input point ends up inside the hull or within this distance of it. By default `1e-5`.

With `symmetric`, an empty set returns `[]`, fewer than four points left after merging come back sorted by X and closed like the default mode, and points collinear within `tolerance` return a closed line through the two end points (the convex outline is kept when the two end points are ambiguous, as in a square smaller than `tolerance`). Symmetry is guaranteed for inputs that are symmetric up to float rounding; points that miss their mirror image by more than that can still give an asymmetric hull. Keep `tolerance` well below the smallest real spacing in the design: when spacings fall right at a tolerance-based threshold (for example a 0.05 grid with `tolerance: 0.1`), float noise can still decide differently for the two halves, and moving the tolerance slightly away from such a value avoids it.

	hull(points, 50, undefined, { symmetric: true });

## NPM package

It is still possible to fetch the latest version of the library by using [GitHub URL](https://docs.npmjs.com/cli/v10/configuring-npm/package-json#github-urls) as a dependency, but **since the entire library is now deprecated, it is recommended to look for alternative solutions**.

Publishing this library to the public NPM registry under a different name and encouraging other users using unmaintained package is not recommended.

## Related papers

<details>
    <summary>Expand</summary>

* <a target="_blank" href="http://www.it.uu.se/edu/course/homepage/projektTDB/ht13/project10/Project-10-report.pdf">Implementation of a fast and efficient concave hull algorithm</a>.
* <a target="_blank" href="http://www.cs.jhu.edu/~misha/Fall05/09.13.05.pdf">Computational Geometry: Convex Hulls</a>.
* <a target="_blank" href="https://en.wikibooks.org/wiki/Algorithm_Implementation/Geometry/Convex_hull/Monotone_chain">Andrew's monotone chain convex hull algorithm</a>.
* <a target="_blank" href="http://bryceboe.com/2006/10/23/line-segment-intersection-algorithm/">Line Segment Intersection Algorithm</a>.
* <a target="_blank" href="http://allenchou.net/2013/07/cross-product-of-2d-vectors/">Game Math: "Cross Product" of 2D Vectors</a>.
* <a target="_blank" href="http://users.livejournal.com/_winnie/237714.html">Угол между двумя векторами</a>.
* <a target="_blank" href="http://habrahabr.ru/post/105882/">Когда не нужна тригонометрия</a>.
</details>

## Changelog

<details>
    <summary>Expand</summary>

### 1.0.13 - 08.02.2025
- Prepare for archiving: remove helper files, examples, and most of documentation.
### 1.0.12 - 26.01.2025
- Some cleanup and deprecation.
### 1.0.11 - 11.12.2024
- Minor fixes in package.json.
### 1.0.10 - 07.11.2024
- Fix vulnerability issue.
### 1.0.9 - 29.10.2024
- Update NPM dependencies to address vulnerability issues.
### 1.0.8 - 31.05.2024
- Deprecate library on [npmjs registry](https://docs.npmjs.com/cli/v10/using-npm/registry).
### 1.0.7 - 03.05.2024
Squash previous tiny releases into one bigger commit with the following minor changes:
- Fix issue with formatting when users pass less than 4 points as an input.
- Remove bower and travis files as they are deprecated.
### 1.0.2 — 26.09.2021
- Clean up .gitignore.
- Add "debug" folder to .npmignore to reduce tarball size.
### 1.0.1 — 24.10.2020
- Fix that avoids hitting stack size limit on large arrays.
### 1.0.0 — 28.06.2019
- Change language level to ES6.
- Performance improvements.
### 0.2.11 — 05.05.2019
- Minor changes: return the first point as the last point when fewer than 4 unique points are provided.
### 0.2.10 — 04.09.2016
- Minor changes: fix missing "var" declaration.
### 0.2.9 — 28.07.2016
- Fix modification of the initial array.
- Add filtration of the duplicates.
### 0.2.8 — 01.04.2016
- Add edgeSkipList to increase performance of the highly accurate shapes (with the small `concavity` number) + some refactoring.
### 0.2.7 — 01.05.2015
- Minor changes: fix bower.json.
### 0.2.6 — 01.05.2015
- Minor changes: fix bower.json.
### 0.2.5 — 01.05.2015
- Minor changes: Bower support.
### 0.2.4 — 23.03.2015
- Minor changes: copyrights.
### 0.2.3 — 04.02.2015
- Minor changes: readme, package.json.
### 0.2.2 — 04.02.2015
- Configurable point format, now you can use points like `{x: 10, y: 10}` and `{lat: 52, lng: 82}`.
### 0.2.1 — 21.10.2014
- Minor changes: doc, package.json, etc.
### 0.2.0 — 20.10.2014
- Second version with better performance inspired by <a href="http://www.it.uu.se/edu/course/homepage/projektTDB/ht13/project10/Project-10-report.pdf" target="_blank">this</a> article.
### 0.1.0 — 06.09.2014
- First version based on Delaunay triangulation.
</details>

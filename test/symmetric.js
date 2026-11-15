const assert = require("assert"),
    symmetricHull = require('../src/symmetric.js');

module.exports = function() {
    it('should pick the same best band in any order', function() {
        // pairwise tolerant comparison is cyclic here: A > B > C > A
        const scores = {A: [0.5, 1.400000003], B: [0.50000000075, 1.4000000015], C: [0.5000000015, 1.4]};
        [['A', 'B', 'C'], ['B', 'C', 'A'], ['C', 'A', 'B'], ['C', 'B', 'A']].forEach(function(order) {
            const band = symmetricHull._topBand(order.map(function(k) { return scores[k]; }));
            assert.deepEqual(band.map(function(i) { return order[i]; }), ['B']);
        });
    });

    it('should keep ties within the tolerance together', function() {
        assert.deepEqual(symmetricHull._topBand([[0.5, 1], [0.5 + 1e-12, 1 - 1e-12], [0.4, 2]]), [0, 1]);
    });
}

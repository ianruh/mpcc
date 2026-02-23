"""Tests verifying similarity_search against stumpy as the source of truth."""

import unittest

import numpy as np
import stumpy

from python import mpcc_py as mpcc


class TestSimilaritySearch(unittest.TestCase):

    def test_basic(self):
        """Distance profile matches stumpy.mass on a typical sequence."""
        rng = np.random.default_rng(42)
        sequence = rng.standard_normal(100)
        query    = rng.standard_normal(10)

        result   = mpcc.similarity_search(sequence, query)
        expected = stumpy.mass(query, sequence)

        np.testing.assert_allclose(result, expected, rtol=1e-6)

    def test_output_shape(self):
        """Output length is len(sequence) - len(query) + 1."""
        n, m = 50, 8
        sequence = np.ones(n)
        query    = np.ones(m)

        result = mpcc.similarity_search(sequence, query)

        self.assertEqual(result.shape, (n - m + 1,))

    def test_returns_ndarray(self):
        """Return value is a numpy ndarray."""
        sequence = np.arange(20, dtype=np.float64)
        query    = np.arange(5,  dtype=np.float64)

        result = mpcc.similarity_search(sequence, query)

        self.assertIsInstance(result, np.ndarray)

    def test_query_same_length_as_sequence(self):
        """Single-window case: query length equals sequence length gives one distance value."""
        rng = np.random.default_rng(7)
        sequence = rng.standard_normal(20)
        query    = rng.standard_normal(20)

        result   = mpcc.similarity_search(sequence, query)
        expected = stumpy.mass(query, sequence)

        self.assertEqual(result.shape, (1,))
        np.testing.assert_allclose(result, expected, rtol=1e-6)

    def test_long_sequence(self):
        """Distance profile matches stumpy.mass on a longer sequence."""
        rng = np.random.default_rng(123)
        sequence = rng.standard_normal(1000)
        query    = rng.standard_normal(50)

        result   = mpcc.similarity_search(sequence, query)
        expected = stumpy.mass(query, sequence)

        np.testing.assert_allclose(result, expected, rtol=1e-6)

    def test_known_exact_match(self):
        """A subsequence identical to the query should produce a distance of zero."""
        rng = np.random.default_rng(99)
        query    = rng.standard_normal(10)
        sequence = np.concatenate([rng.standard_normal(20), query, rng.standard_normal(20)])

        result = mpcc.similarity_search(sequence, query)

        # The window aligned with the embedded query should have distance ~0.
        # Find the minimum and confirm it is near zero.
        self.assertAlmostEqual(float(np.min(result)), 0.0, places=5)

    def test_query_longer_than_sequence_raises(self):
        """ValueError is raised when query is longer than sequence."""
        sequence = np.ones(5,  dtype=np.float64)
        query    = np.ones(10, dtype=np.float64)

        with self.assertRaises(ValueError):
            mpcc.similarity_search(sequence, query)


class TestMatrixProfileNaive(unittest.TestCase):

    def test_distances_match_stumpy(self):
        """Matrix profile distances match stumpy.stump on a typical sequence."""
        rng = np.random.default_rng(42)
        sequence = rng.standard_normal(200).astype(np.float64)
        m = 20

        mp, _ = mpcc.matrix_profile_naive(sequence, m)
        expected = stumpy.stump(sequence, m)

        np.testing.assert_allclose(mp, expected[:, 0].astype(np.float64), rtol=1e-5)

    def test_output_shapes(self):
        """Both output arrays have shape (n - m + 1,)."""
        n, m = 80, 12
        sequence = np.random.default_rng(0).standard_normal(n).astype(np.float64)

        mp, mpi = mpcc.matrix_profile_naive(sequence, m)

        self.assertEqual(mp.shape,  (n - m + 1,))
        self.assertEqual(mpi.shape, (n - m + 1,))

    def test_return_dtypes(self):
        """Distances are float64 and indices are int64."""
        sequence = np.random.default_rng(1).standard_normal(50).astype(np.float64)

        mp, mpi = mpcc.matrix_profile_naive(sequence, 10)

        self.assertEqual(mp.dtype,  np.float64)
        self.assertEqual(mpi.dtype, np.int64)

    def test_index_self_consistency(self):
        """For each i, recomputing the distance profile confirms that mp[i] equals the
        distance to the subsequence at mpi[i]."""
        rng = np.random.default_rng(7)
        sequence = rng.standard_normal(100).astype(np.float64)
        m = 15

        mp, mpi = mpcc.matrix_profile_naive(sequence, m)
        profile_len = len(sequence) - m + 1

        for i in range(profile_len):
            query = sequence[i : i + m]
            dist_profile = mpcc.similarity_search(sequence, query)
            j = int(mpi[i])
            self.assertAlmostEqual(float(mp[i]), float(dist_profile[j]), places=5,
                msg=f"mp[{i}]={mp[i]:.6f} does not match dist_profile[{j}]={dist_profile[j]:.6f}")

    def test_known_motif(self):
        """Embedding a repeated pattern produces a near-zero matrix profile minimum."""
        rng = np.random.default_rng(99)
        motif = rng.standard_normal(20).astype(np.float64)
        # Place the motif at two well-separated locations in the sequence.
        sequence = np.concatenate([
            rng.standard_normal(30).astype(np.float64),
            motif,
            rng.standard_normal(30).astype(np.float64),
            motif,
            rng.standard_normal(30).astype(np.float64),
        ])

        mp, _ = mpcc.matrix_profile_naive(sequence, len(motif))

        self.assertAlmostEqual(float(np.min(mp)), 0.0, places=5)

    def test_m_zero_raises(self):
        """ValueError is raised when m is 0."""
        sequence = np.ones(20, dtype=np.float64)

        with self.assertRaises(ValueError):
            mpcc.matrix_profile_naive(sequence, 0)

    def test_m_larger_than_n_raises(self):
        """ValueError is raised when m is larger than the sequence length."""
        sequence = np.ones(10, dtype=np.float64)

        with self.assertRaises(ValueError):
            mpcc.matrix_profile_naive(sequence, 20)


if __name__ == "__main__":
    unittest.main()

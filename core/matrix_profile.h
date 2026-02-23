#pragma once

#include <algorithm>
#include <cmath>
#include <limits>
#include <xtensor/containers/xadapt.hpp>
#include <xtensor/containers/xtensor.hpp>
#include <xtensor/views/xview.hpp>

namespace MPCC {

enum class SimilaritySearchStatus {
    Success,
    SequenceNotOneDimensional,
    QueryNotOneDimensional,
    DistanceNotOneDimensional,
    QueryLongerThanSequence,
    DistanceWrongSize,
};

/// @brief Run a similarity search for the provided query on the provided sequence. The distance profile
/// of the query is set in distance.
template <class S, class Q, class D>
SimilaritySearchStatus similaritySearch(
    const xt::xexpression<S>& sequence,
    const xt::xexpression<Q>& query,
    xt::xexpression<D>& distance
) {
    // Ensure the inputs are one-dimensional at compile time, if possible.
    static_assert(xt::get_rank<S>::value == 1 || xt::get_rank<S>::value == SIZE_MAX, "sequence must be 1-dimensional");
    static_assert(xt::get_rank<Q>::value == 1 || xt::get_rank<Q>::value == SIZE_MAX, "query must be 1-dimensional");
    static_assert(xt::get_rank<D>::value == 1 || xt::get_rank<D>::value == SIZE_MAX, "distance must be 1-dimensional");

    const auto& seq  = sequence.derived_cast();
    const auto& qry  = query.derived_cast();
    auto&       dist = distance.derived_cast();

    // Check the dimesnions at runtime if required, and also assert the sizes line up
    if (seq.dimension() != 1)  return SimilaritySearchStatus::SequenceNotOneDimensional;
    if (qry.dimension() != 1)  return SimilaritySearchStatus::QueryNotOneDimensional;
    if (dist.dimension() != 1) return SimilaritySearchStatus::DistanceNotOneDimensional;
    if (qry.size() > seq.size()) return SimilaritySearchStatus::QueryLongerThanSequence;
    if (dist.size() != seq.size() - qry.size() + 1) return SimilaritySearchStatus::DistanceWrongSize;

    const size_t m = qry.size();
    const size_t n = seq.size();

    // Pre-compute query mean and std deviation (constant across all windows).
    const double mean_q = xt::mean(qry)();
    const double std_q  = std::sqrt(xt::variance(qry)());

    // Initialize running sum and sum-of-squares for the first window.
    const auto first_window = xt::view(seq, xt::range(0ul, m));
    double sum_s    = xt::sum(first_window)();
    double sum_sq_s = xt::sum(xt::square(first_window))();

    // We loop through the sequence in order, and incrementally maintain both the mean and std-deviation of the
    // subsequence being considered.
    for (size_t i = 0; i < n - m + 1; i++) {
        const double mean_s = sum_s / static_cast<double>(m);
        const double std_s  = std::sqrt(sum_sq_s / static_cast<double>(m) - mean_s * mean_s);

        // Compute the dot product of the current window with the query.
        const auto window  = xt::view(seq, xt::range(i, i + m));
        const double dot   = xt::sum(window * qry)();

        // Z-normalized Euclidean distance via Pearson correlation. Clamp to [-1, 1]
        // to guard against floating-point rounding.
        const double pearson = (dot - static_cast<double>(m) * mean_s * mean_q)
                             / (static_cast<double>(m) * std_s * std_q);
        dist[i] = std::sqrt(2.0 * static_cast<double>(m) * (1.0 - std::clamp(pearson, -1.0, 1.0)));

        // Slide the window: drop seq[i], admit seq[i + m].
        if (i + m < n) {
            sum_s    += seq(i + m) - seq(i);
            sum_sq_s += seq(i + m) * seq(i + m) - seq(i) * seq(i);
        }
    }

    return SimilaritySearchStatus::Success;
}

enum class MatrixProfileStatus {
    Success,
    SequenceNotOneDimensional,
    SubsequenceLengthZero,
    SubsequenceLongerThanSequence,
    DistanceWrongSize,
    IndexWrongSize,
    SimilaritySearchFailed,
};

/// @brief Compute the full matrix profile naively by running similaritySearch for every possible
/// subsequence of length m. The exclusion zone (m/4) prevents trivial self-matches on the diagonal.
///
/// @param sequence  The input time series (1-D).
/// @param m         Subsequence length.
/// @param mp        Output matrix profile: mp[i] is the z-normalized distance from subsequence i
///                  to its nearest non-trivial neighbor. Must be pre-allocated with size n-m+1.
/// @param mpi       Output matrix profile index: mpi[i] is the starting index of the nearest
///                  neighbor of subsequence i. Must be pre-allocated with size n-m+1.
///                  Entries remain at the sentinel value (-1 cast to the index type) if no
///                  neighbor outside the exclusion zone exists.
template <class S, class D, class I>
MatrixProfileStatus matrixProfileNaive(
    const xt::xexpression<S>& sequence,
    size_t m,
    xt::xexpression<D>& mp,
    xt::xexpression<I>& mpi
) {
    static_assert(xt::get_rank<S>::value == 1 || xt::get_rank<S>::value == SIZE_MAX, "sequence must be 1-dimensional");
    static_assert(xt::get_rank<D>::value == 1 || xt::get_rank<D>::value == SIZE_MAX, "mp must be 1-dimensional");
    static_assert(xt::get_rank<I>::value == 1 || xt::get_rank<I>::value == SIZE_MAX, "mpi must be 1-dimensional");

    const auto& seq = sequence.derived_cast();
    auto&       mp_ = mp.derived_cast();
    auto&       mpi_= mpi.derived_cast();

    if (seq.dimension() != 1) return MatrixProfileStatus::SequenceNotOneDimensional;
    if (m == 0)               return MatrixProfileStatus::SubsequenceLengthZero;
    if (m > seq.size())       return MatrixProfileStatus::SubsequenceLongerThanSequence;

    const size_t n           = seq.size();
    const size_t profile_len = n - m + 1;

    if (mp_.size()  != profile_len) return MatrixProfileStatus::DistanceWrongSize;
    if (mpi_.size() != profile_len) return MatrixProfileStatus::IndexWrongSize;

    using idx_t = typename std::decay_t<decltype(mpi_)>::value_type;

    // Standard exclusion zone: floor(m / 4) on each side of the diagonal.
    const size_t exclusion_zone = m / 4;

    std::fill(mp_.begin(),  mp_.end(),  std::numeric_limits<double>::infinity());
    std::fill(mpi_.begin(), mpi_.end(), static_cast<idx_t>(-1));

    xt::xtensor<double, 1> dist_profile = xt::empty<double>({profile_len});

    for (size_t i = 0; i < profile_len; i++) {
        const auto query = xt::view(seq, xt::range(i, i + m));

        const auto status = similaritySearch(seq, query, dist_profile);
        if (status != SimilaritySearchStatus::Success) {
            return MatrixProfileStatus::SimilaritySearchFailed;
        }

        // Find the nearest neighbor outside the exclusion zone.
        for (size_t j = 0; j < profile_len; j++) {
            const size_t diff = (i > j) ? (i - j) : (j - i);
            if (diff <= exclusion_zone) continue;

            if (dist_profile[j] < mp_[i]) {
                mp_[i]  = dist_profile[j];
                mpi_[i] = static_cast<idx_t>(j);
            }
        }
    }

    return MatrixProfileStatus::Success;
}

} // namespace MPCC
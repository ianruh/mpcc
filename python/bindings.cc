#include <nanobind/nanobind.h>
#include <nanobind/ndarray.h>
#include <xtensor/containers/xadapt.hpp>
#include <xtensor/containers/xtensor.hpp>

#include "core/matrix_profile.h"

namespace nb = nanobind;

using InputArray      = nb::ndarray<double,  nb::ndim<1>, nb::c_contig, nb::device::cpu>;
using OutputArray     = nb::ndarray<nb::numpy, double,  nb::ndim<1>>;
using OutputArrayInt64= nb::ndarray<nb::numpy, int64_t, nb::ndim<1>>;

NB_MODULE(mpcc_py, m) {
    m.doc() = "MPCC Python bindings";

    m.def("similarity_search", [](InputArray sequence, InputArray query) -> OutputArray {
        const size_t n = sequence.shape(0);
        const size_t m = query.shape(0);

        if (m > n) {
            throw nb::value_error("query must not be longer than sequence");
        }

        // Adapt the input numpy arrays to xtensor views (zero-copy).
        auto seq = xt::adapt(sequence.data(), n, xt::no_ownership(), std::vector<size_t>{n});
        auto qry = xt::adapt(query.data(),    m, xt::no_ownership(), std::vector<size_t>{m});

        // Allocate the output array and adapt it to an xtensor view.
        const size_t out_size  = n - m + 1;
        double*      dist_data = new double[out_size];
        auto dist = xt::adapt(dist_data, out_size, xt::no_ownership(), std::vector<size_t>{out_size});

        const auto status = MPCC::similaritySearch(seq, qry, dist);

        if (status != MPCC::SimilaritySearchStatus::Success) {
            delete[] dist_data;
            switch (status) {
                case MPCC::SimilaritySearchStatus::SequenceNotOneDimensional:
                    throw nb::value_error("sequence must be 1-dimensional");
                case MPCC::SimilaritySearchStatus::QueryNotOneDimensional:
                    throw nb::value_error("query must be 1-dimensional");
                case MPCC::SimilaritySearchStatus::DistanceNotOneDimensional:
                    throw nb::value_error("distance must be 1-dimensional");
                case MPCC::SimilaritySearchStatus::QueryLongerThanSequence:
                    throw nb::value_error("query must not be longer than sequence");
                case MPCC::SimilaritySearchStatus::DistanceWrongSize:
                    throw nb::value_error("distance has wrong size");
                default:
                    throw nb::value_error("similarity search failed");
            }
        }

        // Transfer ownership of dist_data to Python via a capsule.
        size_t shape[1] = {out_size};
        return OutputArray(
            dist_data,
            1,
            shape,
            nb::capsule(dist_data, [](void* p) noexcept { delete[] static_cast<double*>(p); })
        );
    }, nb::arg("sequence"), nb::arg("query"),
       "Compute the z-normalized distance profile of query over sequence.");

    m.def("matrix_profile_naive", [](InputArray sequence, size_t m) -> nb::tuple {
        const size_t n = sequence.shape(0);

        if (m == 0) throw nb::value_error("m must be greater than 0");
        if (m > n)  throw nb::value_error("m must not be larger than sequence length");

        auto seq = xt::adapt(sequence.data(), n, xt::no_ownership(), std::vector<size_t>{n});

        const size_t profile_len = n - m + 1;

        double*  mp_data  = new double[profile_len];
        int64_t* mpi_data = new int64_t[profile_len];

        auto mp_  = xt::adapt(mp_data,  profile_len, xt::no_ownership(), std::vector<size_t>{profile_len});
        auto mpi_ = xt::adapt(mpi_data, profile_len, xt::no_ownership(), std::vector<size_t>{profile_len});

        const auto status = MPCC::matrixProfileNaive(seq, m, mp_, mpi_);

        if (status != MPCC::MatrixProfileStatus::Success) {
            delete[] mp_data;
            delete[] mpi_data;
            switch (status) {
                case MPCC::MatrixProfileStatus::SequenceNotOneDimensional:
                    throw nb::value_error("sequence must be 1-dimensional");
                case MPCC::MatrixProfileStatus::SubsequenceLengthZero:
                    throw nb::value_error("m must be greater than 0");
                case MPCC::MatrixProfileStatus::SubsequenceLongerThanSequence:
                    throw nb::value_error("m must not be larger than sequence length");
                case MPCC::MatrixProfileStatus::DistanceWrongSize:
                    throw nb::value_error("distance has wrong size");
                case MPCC::MatrixProfileStatus::IndexWrongSize:
                    throw nb::value_error("index has wrong size");
                case MPCC::MatrixProfileStatus::SimilaritySearchFailed:
                    throw nb::value_error("similarity search failed");
                default:
                    throw nb::value_error("matrix profile failed");
            }
        }

        size_t shape[1] = {profile_len};

        auto mp_out = OutputArray(
            mp_data, 1, shape,
            nb::capsule(mp_data,  [](void* p) noexcept { delete[] static_cast<double* >(p); })
        );
        auto mpi_out = OutputArrayInt64(
            mpi_data, 1, shape,
            nb::capsule(mpi_data, [](void* p) noexcept { delete[] static_cast<int64_t*>(p); })
        );

        return nb::make_tuple(mp_out, mpi_out);
    }, nb::arg("sequence"), nb::arg("m"),
       "Compute the full matrix profile naively (O(n^2)). "
       "Returns (distances, indices) where distances[i] is the z-normalized distance from "
       "subsequence i to its nearest non-trivial neighbor and indices[i] is that neighbor's "
       "starting position. The exclusion zone is floor(m/4) on each side of the diagonal.");
}

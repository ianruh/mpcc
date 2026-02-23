#include <emscripten/bind.h>
#include <emscripten/val.h>

#include <cstdint>
#include <stdexcept>
#include <vector>

#include <xtensor/containers/xadapt.hpp>

#include "core/matrix_profile.h"

using namespace emscripten;

// Accepts any JS array-like (Array or TypedArray) and returns a Float64Array
// of the z-normalized distance profile of query over sequence.
static val similarity_search(val sequence_val, val query_val) {
    // convertJSArrayToNumberVector does a bulk typed-array copy when possible,
    // falling back to element-wise conversion for plain JS Arrays.
    std::vector<double> seq = convertJSArrayToNumberVector<double>(sequence_val);
    std::vector<double> qry = convertJSArrayToNumberVector<double>(query_val);

    const size_t n = seq.size();
    const size_t m = qry.size();

    if (m > n) throw std::invalid_argument("query must not be longer than sequence");

    const size_t out_size = n - m + 1;

    auto seq_xt  = xt::adapt(seq.data(),  n,        xt::no_ownership(), std::vector<size_t>{n});
    auto qry_xt  = xt::adapt(qry.data(),  m,        xt::no_ownership(), std::vector<size_t>{m});

    std::vector<double> dist(out_size);
    auto dist_xt = xt::adapt(dist.data(), out_size, xt::no_ownership(), std::vector<size_t>{out_size});

    const auto status = MPCC::similaritySearch(seq_xt, qry_xt, dist_xt);
    if (status != MPCC::SimilaritySearchStatus::Success) {
        switch (status) {
            case MPCC::SimilaritySearchStatus::QueryLongerThanSequence:
                throw std::invalid_argument("query must not be longer than sequence");
            default:
                throw std::runtime_error("similarity search failed");
        }
    }

    // Copy the result into a new JS Float64Array and return it.
    return val::global("Float64Array").new_(typed_memory_view(out_size, dist.data()));
}

// Returned by matrixProfileNaive as a JS object with two typed-array fields.
struct MatrixProfileResult {
    val distances;  // Float64Array: z-normalized distance to nearest non-trivial neighbor
    val indices;    // Int32Array:   starting index of that neighbor (-1 if none)
};

// Accepts any JS array-like sequence and a subsequence length m.
// Returns { distances: Float64Array, indices: Int32Array } of length n-m+1.
static MatrixProfileResult matrix_profile_naive(val sequence_val, size_t m) {
    std::vector<double> seq = convertJSArrayToNumberVector<double>(sequence_val);
    const size_t n = seq.size();

    if (m == 0) throw std::invalid_argument("m must be greater than 0");
    if (m > n)  throw std::invalid_argument("m must not be larger than sequence length");

    const size_t profile_len = n - m + 1;

    auto seq_xt = xt::adapt(seq.data(), n, xt::no_ownership(), std::vector<size_t>{n});

    std::vector<double>  mp_data(profile_len);
    std::vector<int32_t> mpi_data(profile_len);

    auto mp_xt  = xt::adapt(mp_data.data(),  profile_len, xt::no_ownership(), std::vector<size_t>{profile_len});
    auto mpi_xt = xt::adapt(mpi_data.data(), profile_len, xt::no_ownership(), std::vector<size_t>{profile_len});

    const auto status = MPCC::matrixProfileNaive(seq_xt, m, mp_xt, mpi_xt);
    if (status != MPCC::MatrixProfileStatus::Success) {
        switch (status) {
            case MPCC::MatrixProfileStatus::SubsequenceLengthZero:
                throw std::invalid_argument("m must be greater than 0");
            case MPCC::MatrixProfileStatus::SubsequenceLongerThanSequence:
                throw std::invalid_argument("m must not be larger than sequence length");
            default:
                throw std::runtime_error("matrix profile computation failed");
        }
    }

    // Copy results into new JS typed arrays before the C++ vectors are freed.
    return {
        val::global("Float64Array").new_(typed_memory_view(profile_len, mp_data.data())),
        val::global("Int32Array").new_(typed_memory_view(profile_len, mpi_data.data())),
    };
}

EMSCRIPTEN_BINDINGS(mpcc) {
    value_object<MatrixProfileResult>("MatrixProfileResult")
        .field("distances", &MatrixProfileResult::distances)
        .field("indices",   &MatrixProfileResult::indices);

    function("similaritySearch",   &similarity_search);
    function("matrixProfileNaive", &matrix_profile_naive);
}

# MPCC – Matrix Profile (in C++)

Playground for experimenting with matrix profiles. Core functions written in C++ in `core/`, with python bindings (using these to compare results to stumpy as the source of truth) in `python/`, and WASM bindings in `wasm/`.

See [the playground](https://ian.ruh.io/mpcc/) to mess around with it. So far, this is focused on learning, not performance, so the matrix profile implementation is raltively naive.

## Fun Examples

- Grab the ISS TLE history from [Celestrak](https://celestrak.org/NORAD/elements/graph-orbit-data.php?CATNR=25544) and select the semi-major axis series. Maneuvers should be easily identifiable, along with anomalous TLEs.
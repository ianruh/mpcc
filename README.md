# MPCC – Matrix Profile (in C++)

Playground for experimenting with matrix profiles. Core functions written in C++ in `core/`, with python bindings (using these to compare results to stumpy as the source of truth) in `python/`, and WASM bindings in `wasm/`.

See [the playground](https://ian.ruh.io/mpcc/) to mess around with it. So far, this is focused on learning, not performance, so the matrix profile implementation is raltively naive.

<img width="1709" height="981" alt="Screenshot 2026-02-22 at 8 12 14 PM" src="https://github.com/user-attachments/assets/aa6e8780-0883-4174-89bb-1d63471f5201" />

*The playground with the ISS TLE history loaded and a short motif representing a maneuvering being identified, along with the distance profile to the rest of the sequence at the bottom.*

## Matrix Profile Background

See the [original papers' authors' page](https://www.cs.ucr.edu/~eamonn/MatrixProfile.html).

## Fun Examples

- Grab the ISS TLE history from [Celestrak](https://celestrak.org/NORAD/elements/graph-orbit-data.php?CATNR=25544) and select the semi-major axis series. Maneuvers should be easily identifiable, along with anomalous TLEs.

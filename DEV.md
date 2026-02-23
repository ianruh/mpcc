# Very Very Loose Dev Roadmap

**Core**

- [ ] Make the core WASM functions async to avoid locking the main thread
- [ ] Create a matrix profile container in the core C++ code. Use that for motif extraction/finding similar motifs given a threshold.
- [ ] Support k-nearest neigbor matrix profiles
- [ ] Add a FFT-based matrix profile calculation function.
- [ ] Sparse matrix profile calculation
- [ ] Streaming matrix profile and serialization
- [ ] Multi-dimensional series support

**UI**

- [ ] Motif extraction distance slider -> highlight motifs -> overlay motifs together
- [ ] Annotation vectors to reject motifs

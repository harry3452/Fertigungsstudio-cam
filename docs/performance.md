# Facing planner performance

Reproduce with `cargo run --release --locked --offline --example facing_bench`.
Original synthetic rectangular-stock fixtures, not imported customer CAD.

Measured locally on Windows, Rust 1.99.1, on 25 November 2026. Release profile,
ten warmups, 21 batches per fixture. Each sample is elapsed batch wall time
divided by the number of repetitions; min/median/max describe these batch
averages, not single-call latency percentiles. Allocation, generation and drop
are included. Console output and the retained reference path are not timed.

| Case | Moves | Move buffer bytes | Repetitions/batch | Min µs | Median µs | Max µs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| small | 88 | 3,520 | 1,000 | 0.192 | 0.227 | 0.447 |
| medium | 4,040 | 161,600 | 100 | 8.805 | 9.154 | 11.244 |
| near limit | 96,096 | 3,843,840 | 10 | 1,010.400 | 1,092.490 | 1,246.240 |

Move-buffer bytes are capacity times the native Move size, not measured process
memory or peak RSS. The planner limits output to 100,000 moves before allocating.
The benchmark holds one reference path as well as the currently timed path.

These are diagnostic measurements, not a stable performance guarantee or a CI
pass/fail threshold. Repeat under comparable hardware/load before comparing.
The algorithm is a simple rectangular raster. There is no CAD tessellation,
part/fixture verification, stock simulation, NC export or UI in this measurement.
Responsive GUI scheduling, cancellation and performance of other operations
remain future work. Do not infer machine safety from these timings.

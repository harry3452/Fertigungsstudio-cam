//! Diagnostic release benchmark; no machine commands or performance pass threshold.
use fertigungsstudio_cam_core::{Facing, FlatTool, Point3, Setup, StockBox, face};
use std::{
    hint::black_box,
    io::{self, Write},
    time::Instant,
};

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let mut out = io::stdout().lock();
    writeln!(
        out,
        "case,moves,estimated_move_bytes,batch_repetitions,min_us,median_us,max_us"
    )?;
    for (name, length, depth, repetitions) in [
        ("small", 10.0, 2.0, 1000),
        ("medium", 100.0, 10.0, 100),
        ("near_limit", 1000.0, 24.0, 10),
    ] {
        let setup = Setup {
            stock: StockBox {
                min: Point3 {
                    x: 0.0,
                    y: 0.0,
                    z: 0.0,
                },
                max: Point3 {
                    x: 120.0,
                    y: length,
                    z: 30.0,
                },
            },
            clearance_z: 35.0,
        };
        let tool = FlatTool {
            diameter: 10.0,
            cutting_length: 30.0,
        };
        let op = Facing {
            bottom_z: 30.0 - depth,
            stepdown: 1.0,
            stepover: 1.0,
            cutting_feed: 800.0,
            plunge_feed: 200.0,
        };
        let reference = face(setup, tool, op)?;
        let count = reference.moves.len();
        let bytes =
            reference.moves.capacity() * std::mem::size_of::<fertigungsstudio_cam_core::Move>();
        // Warm up allocation and code. Exclude terminal output from measured work.
        for _ in 0..10 {
            black_box(face(setup, tool, op)?);
        }
        let mut samples = Vec::with_capacity(21);
        for _ in 0..21 {
            let start = Instant::now();
            for _ in 0..repetitions {
                black_box(face(black_box(setup), black_box(tool), black_box(op))?);
            }
            samples.push(start.elapsed().as_secs_f64() * 1_000_000.0 / repetitions as f64);
        }
        samples.sort_by(f64::total_cmp);
        writeln!(
            out,
            "{name},{count},{bytes},{repetitions},{:.3},{:.3},{:.3}",
            samples[0], samples[10], samples[20]
        )?;
    }
    Ok(())
}

fn main() -> std::process::ExitCode {
    match run() {
        Ok(()) => std::process::ExitCode::SUCCESS,
        Err(err) => {
            let _ = writeln!(io::stderr().lock(), "Benchmark failed: {err}");
            std::process::ExitCode::FAILURE
        }
    }
}

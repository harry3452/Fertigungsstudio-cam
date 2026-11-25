//! Experimental host-independent CAM planning. Millimetres, mm/min, work +Z up.
//! Original implementation; no CAD host, GUI, filesystem or post dependency.
//! Rectangular raw stock only: this is not a part/fixture collision verifier.

use std::fmt;

const MAX_COORD: f64 = 1_000_000.0;
const MAX_MOVES: usize = 100_000;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Point3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

#[derive(Clone, Copy, Debug)]
pub struct StockBox {
    pub min: Point3,
    pub max: Point3,
}

/// A flat, centre-cutting tool. Other tool geometries are not supported yet.
#[derive(Clone, Copy, Debug)]
pub struct FlatTool {
    pub diameter: f64,
    pub cutting_length: f64,
}

/// One fixed 3-axis work frame; all supplied geometry is already in work coordinates.
#[derive(Clone, Copy, Debug)]
pub struct Setup {
    pub stock: StockBox,
    pub clearance_z: f64,
}

#[derive(Clone, Copy, Debug)]
pub struct Facing {
    pub bottom_z: f64,
    pub stepdown: f64,
    pub stepover: f64,
    pub cutting_feed: f64,
    pub plunge_feed: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Motion {
    Rapid,
    Feed { mm_per_min: f64 },
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Move {
    pub to: Point3,
    pub motion: Motion,
}

/// Caller must establish this start position before executing any move.
/// No motion from an unknown machine position is implied.
#[derive(Debug)]
pub struct Toolpath {
    pub start: Point3,
    pub moves: Vec<Move>,
    pub depth_passes: usize,
    pub rows_per_pass: usize,
}

/// Stable machine-readable error codes; translate these at the UI boundary.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Error {
    InvalidStock,
    InvalidTool,
    InvalidClearance,
    InvalidDepth,
    InvalidStep,
    InvalidFeed,
    TooManyMoves,
    CoordinateLimit,
    Cancelled,
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{self:?}")
    }
}

impl std::error::Error for Error {}

fn coordinate(v: f64) -> bool {
    v.is_finite() && v.abs() <= MAX_COORD
}

fn point_valid(p: Point3) -> bool {
    coordinate(p.x) && coordinate(p.y) && coordinate(p.z)
}

fn positive(v: f64) -> bool {
    v.is_finite() && v > 0.0 && v <= MAX_COORD
}

/// Generate one-direction raster facing passes over a rectangular stock top.
/// Each row starts/ends one tool diameter outside stock X, with clearance
/// retracts between rows. Assumes unlimited free space outside the stock.
/// Coverage uses a flat cylindrical tool; cutter forces/holders are not modeled.
pub fn face(setup: Setup, tool: FlatTool, op: Facing) -> Result<Toolpath, Error> {
    face_with_cancel(setup, tool, op, || false)
}

/// Cooperative cancellation, checked before allocation, before every row and
/// before publishing the result. Return true to discard the whole calculation.
/// A background worker can read an AtomicBool here; no GUI or threading runtime
/// is required. The callback must be fast, non-blocking and must not panic.
/// This never returns a partial toolpath on cancellation.
pub fn face_with_cancel(
    setup: Setup,
    tool: FlatTool,
    op: Facing,
    mut cancelled: impl FnMut() -> bool,
) -> Result<Toolpath, Error> {
    let stock = setup.stock;
    if !point_valid(stock.min)
        || !point_valid(stock.max)
        || stock.min.x >= stock.max.x
        || stock.min.y >= stock.max.y
        || stock.min.z >= stock.max.z
    {
        return Err(Error::InvalidStock);
    }
    if !positive(tool.diameter) || !positive(tool.cutting_length) {
        return Err(Error::InvalidTool);
    }
    if !coordinate(setup.clearance_z) || setup.clearance_z <= stock.max.z {
        return Err(Error::InvalidClearance);
    }
    let depth = stock.max.z - op.bottom_z;
    if !coordinate(op.bottom_z)
        || op.bottom_z < stock.min.z
        || depth <= 0.0
        || depth > tool.cutting_length
    {
        return Err(Error::InvalidDepth);
    }
    if !positive(op.stepdown) || !positive(op.stepover) || op.stepover > tool.diameter / 2.0 {
        return Err(Error::InvalidStep);
    }
    if !positive(op.cutting_feed) || !positive(op.plunge_feed) {
        return Err(Error::InvalidFeed);
    }
    let passes = (depth / op.stepdown).ceil().max(1.0);
    let intervals = ((stock.max.y - stock.min.y) / op.stepover).ceil().max(1.0);
    // Bound before integer conversion or allocation, including pathological tiny steps.
    let count = passes * (intervals + 1.0) * 4.0;
    if !count.is_finite() || count > MAX_MOVES as f64 {
        return Err(Error::TooManyMoves);
    }
    let passes = passes as usize;
    let intervals = intervals as usize;
    let left = stock.min.x - tool.diameter;
    let right = stock.max.x + tool.diameter;
    if !coordinate(left) || !coordinate(right) {
        return Err(Error::CoordinateLimit);
    }
    let start = Point3 {
        x: left,
        y: stock.min.y,
        z: setup.clearance_z,
    };
    if cancelled() {
        return Err(Error::Cancelled);
    }
    let mut moves = Vec::with_capacity(count as usize);
    for pass in 1..=passes {
        let z = if pass == passes {
            op.bottom_z
        } else {
            (stock.max.z - pass as f64 * op.stepdown).max(op.bottom_z)
        };
        for row in 0..=intervals {
            if cancelled() {
                return Err(Error::Cancelled);
            }
            let y = stock.min.y + (stock.max.y - stock.min.y) * row as f64 / intervals as f64;
            let at = Point3 {
                x: left,
                y,
                z: setup.clearance_z,
            };
            moves.push(Move {
                to: at,
                motion: Motion::Rapid,
            });
            moves.push(Move {
                to: Point3 { z, ..at },
                motion: Motion::Feed {
                    mm_per_min: op.plunge_feed,
                },
            });
            moves.push(Move {
                to: Point3 { x: right, y, z },
                motion: Motion::Feed {
                    mm_per_min: op.cutting_feed,
                },
            });
            moves.push(Move {
                to: Point3 {
                    x: right,
                    y,
                    z: setup.clearance_z,
                },
                motion: Motion::Rapid,
            });
        }
    }
    if cancelled() {
        return Err(Error::Cancelled);
    }
    Ok(Toolpath {
        start,
        moves,
        depth_passes: passes,
        rows_per_pass: intervals + 1,
    })
}

#[cfg(test)]
mod tests;

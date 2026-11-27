//! Experimental host-independent CAM planning. Millimetres, mm/min, work +Z up.
//! Original implementation; no CAD host, GUI, filesystem or post dependency.
//! Rectangular raw stock only: this is not a part/fixture collision verifier.

use std::fmt;

pub mod domain;
pub mod milling;
pub mod tools;

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

/// Raster-line connection strategy for planar facing.
/// Rounded turns remain at cutting Z and require clear free space outside stock.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FacingTurn {
    /// Retract to safe height and rapid to the next row.
    Lift,
    /// Serpentine rows linked by segmented semicircular feed moves.
    Rounded,
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
    InvalidBounds,
    InvalidPoint,
    InvalidPeck,
    NoDrillPoints,
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
    cancelled: impl FnMut() -> bool,
) -> Result<Toolpath, Error> {
    face_with_turn(setup, tool, op, FacingTurn::Lift, cancelled)
}

/// Continuous serpentine raster or classic safe retracts.
/// Rounded bends are represented by line-segment feed motions with max chord
/// error 0.02 mm. No G2/G3, machine limits or collision clearance is implied.
pub fn face_with_turn(
    setup: Setup,
    tool: FlatTool,
    op: Facing,
    turn: FacingTurn,
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
    // Every semicircular bend is sampled with <=0.02 mm sagitta error and
    // a minimum of 16 feed segments. Reject move counts before allocation.
    let arc_segments = if turn == FacingTurn::Rounded {
        let radius = (stock.max.y - stock.min.y) / intervals / 2.0;
        let ratio = (0.02 / radius).min(1.0);
        let half_angle = (1.0 - ratio).acos();
        if half_angle <= 0.0 {
            return Err(Error::TooManyMoves);
        }
        (std::f64::consts::PI / (2.0 * half_angle)).ceil().max(16.0)
    } else {
        0.0
    };
    // Lift: four moves per row, rounded: 2 initial + 1 cut per row +
    // one segmented turn per interval + 1 retract per depth pass.
    let per_pass = match turn {
        FacingTurn::Lift => (intervals + 1.0) * 4.0,
        FacingTurn::Rounded => 3.0 + (intervals + 1.0) + intervals * arc_segments,
    };
    let count = passes * per_pass;
    if !count.is_finite() || count > MAX_MOVES as f64 {
        return Err(Error::TooManyMoves);
    }
    let passes = passes as usize;
    let intervals = intervals as usize;
    let arc_segments = arc_segments as usize;
    let left = stock.min.x - tool.diameter;
    let right = stock.max.x + tool.diameter;
    let bulge = if turn == FacingTurn::Rounded {
        (stock.max.y - stock.min.y) / intervals as f64 / 2.0
    } else {
        0.0
    };
    if !coordinate(left - bulge) || !coordinate(right + bulge) {
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
        match turn {
            FacingTurn::Lift => {
                // Preserve legacy one-way behavior and cancellation points.
                for row in 0..=intervals {
                    if cancelled() {
                        return Err(Error::Cancelled);
                    }
                    let y =
                        stock.min.y + (stock.max.y - stock.min.y) * row as f64 / intervals as f64;
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
            FacingTurn::Rounded => {
                let feed = Motion::Feed {
                    mm_per_min: op.cutting_feed,
                };
                let y_step = (stock.max.y - stock.min.y) / intervals as f64;
                let radius = y_step / 2.0;
                // Between depth layers, retreat and rapid back to the start.
                let at = Point3 {
                    x: left,
                    y: stock.min.y,
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
                for row in 0..=intervals {
                    if cancelled() {
                        return Err(Error::Cancelled);
                    }
                    let y = stock.min.y + y_step * row as f64;
                    let rightward = row % 2 == 0;
                    let endpoint_x = if rightward { right } else { left };
                    moves.push(Move {
                        to: Point3 {
                            x: endpoint_x,
                            y,
                            z,
                        },
                        motion: feed,
                    });
                    if row == intervals {
                        // Last row of this depth finished: retract exactly once.
                        moves.push(Move {
                            to: Point3 {
                                x: endpoint_x,
                                y,
                                z: setup.clearance_z,
                            },
                            motion: Motion::Rapid,
                        });
                        break;
                    }
                    // A tangent semicircle in free space outside stock X:
                    // start tangent parallel to X, end tangent opposite to X.
                    let sign = if rightward { 1.0 } else { -1.0 };
                    let y_next = stock.min.y + y_step * (row + 1) as f64;
                    for segment in 1..=arc_segments {
                        if segment % 64 == 0 && cancelled() {
                            return Err(Error::Cancelled);
                        }
                        let (x, yy) = if segment == arc_segments {
                            (endpoint_x, y_next)
                        } else {
                            let angle = std::f64::consts::PI * segment as f64 / arc_segments as f64;
                            (
                                endpoint_x + sign * radius * angle.sin(),
                                y + radius * (1.0 - angle.cos()),
                            )
                        };
                        if !coordinate(x) || !coordinate(yy) {
                            return Err(Error::CoordinateLimit);
                        }
                        moves.push(Move {
                            to: Point3 { x, y: yy, z },
                            motion: feed,
                        });
                    }
                }
            }
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

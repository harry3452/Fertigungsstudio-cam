//! Bounded experimental 3-axis paths. Not verified for machine execution.
//! Work coordinates in mm, +Z up. No CAD, fixtures, holders, or controller output.
//!
//! Contour: external outline of the entire rectangular stock.
//! Pocket: zigzag clearing of one axis-aligned rectangular region. Internal
//! corners remain radiused. A centre-cutting flat tool is required.
//! Drilling: axial drills at supplied XY points, optionally full-retract pecks.
//! Every new toolpath has an explicit starting point at clearance height.

use crate::{
    Error, FlatTool, MAX_MOVES, Motion, Move, Point3, Setup, Toolpath, coordinate, point_valid,
    positive,
};

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Cut {
    pub bottom_z: f64,
    pub stepdown_mm: f64,
    pub cutting_feed_mm_min: f64,
    pub plunge_feed_mm_min: f64,
}

/// Axis-aligned XY rectangle, with all coordinates already in the work frame.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RectangleXY {
    pub min_x: f64,
    pub min_y: f64,
    pub max_x: f64,
    pub max_y: f64,
}

impl RectangleXY {
    fn valid(self) -> bool {
        coordinate(self.min_x)
            && coordinate(self.min_y)
            && coordinate(self.max_x)
            && coordinate(self.max_y)
            && self.min_x < self.max_x
            && self.min_y < self.max_y
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Pocket {
    pub rectangle: RectangleXY,
    pub cut: Cut,
    pub stepover_mm: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct DrillPoint {
    pub x: f64,
    pub y: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct DrillBit {
    pub diameter_mm: f64,
    pub flute_length_mm: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Drilling<'a> {
    pub points: &'a [DrillPoint],
    pub bottom_z: f64,
    pub peck_mm: Option<f64>,
    pub feed_mm_min: f64,
}

fn validate_setup(setup: Setup) -> Result<(), Error> {
    let s = setup.stock;
    if !point_valid(s.min)
        || !point_valid(s.max)
        || s.min.x >= s.max.x
        || s.min.y >= s.max.y
        || s.min.z >= s.max.z
    {
        return Err(Error::InvalidStock);
    }
    if !coordinate(setup.clearance_z) || setup.clearance_z <= s.max.z {
        return Err(Error::InvalidClearance);
    }
    Ok(())
}

fn validate_depth(setup: Setup, bottom_z: f64, cutting_length: f64) -> Result<f64, Error> {
    let top = setup.stock.max.z;
    let depth = top - bottom_z;
    if !coordinate(bottom_z)
        || bottom_z < setup.stock.min.z
        || !positive(depth)
        || !positive(cutting_length)
        || depth > cutting_length
    {
        return Err(Error::InvalidDepth);
    }
    Ok(depth)
}

fn validate_cut(setup: Setup, tool: FlatTool, cut: Cut) -> Result<(f64, f64), Error> {
    validate_setup(setup)?;
    if !positive(tool.diameter) || !positive(tool.cutting_length) {
        return Err(Error::InvalidTool);
    }
    let depth = validate_depth(setup, cut.bottom_z, tool.cutting_length)?;
    if !positive(cut.stepdown_mm) {
        return Err(Error::InvalidStep);
    }
    if !positive(cut.cutting_feed_mm_min) || !positive(cut.plunge_feed_mm_min) {
        return Err(Error::InvalidFeed);
    }
    let passes = (depth / cut.stepdown_mm).ceil().max(1.0);
    if !passes.is_finite() || passes > MAX_MOVES as f64 {
        return Err(Error::TooManyMoves);
    }
    Ok((depth, passes))
}

fn depth_at(top: f64, cut: Cut, pass: usize, passes: usize) -> f64 {
    if pass == passes {
        cut.bottom_z
    } else {
        (top - pass as f64 * cut.stepdown_mm).max(cut.bottom_z)
    }
}

fn bound_moves(amount: f64) -> Result<usize, Error> {
    if !amount.is_finite() || amount > MAX_MOVES as f64 || amount < 0.0 {
        Err(Error::TooManyMoves)
    } else {
        Ok(amount as usize)
    }
}

fn rapid(x: f64, y: f64, z: f64) -> Move {
    Move {
        to: Point3 { x, y, z },
        motion: Motion::Rapid,
    }
}

fn feed(x: f64, y: f64, z: f64, mm_per_min: f64) -> Move {
    Move {
        to: Point3 { x, y, z },
        motion: Motion::Feed { mm_per_min },
    }
}

/// A simple external rectangular profile of the *stock*, offset by tool radius.
///
/// The assumed free space around stock and the vertical plunge outside it
/// have not been checked against fixtures, holders or the actual target part.
/// No tabs, lead-ins, stock allowances or machine kinematics are modeled.
pub fn outside_contour(setup: Setup, tool: FlatTool, cut: Cut) -> Result<Toolpath, Error> {
    outside_contour_with_cancel(setup, tool, cut, || false)
}

pub fn outside_contour_with_cancel(
    setup: Setup,
    tool: FlatTool,
    cut: Cut,
    mut cancelled: impl FnMut() -> bool,
) -> Result<Toolpath, Error> {
    let (_, pass_count) = validate_cut(setup, tool, cut)?;
    let cap = bound_moves(pass_count * 7.0)?;
    let passes = pass_count as usize;
    let r = tool.diameter / 2.0;
    let s = setup.stock;
    let (x0, x1, y0, y1) = (s.min.x - r, s.max.x + r, s.min.y - r, s.max.y + r);
    if !coordinate(x0) || !coordinate(x1) || !coordinate(y0) || !coordinate(y1) {
        return Err(Error::CoordinateLimit);
    }
    if cancelled() {
        return Err(Error::Cancelled);
    }
    let mut moves = Vec::with_capacity(cap);
    for pass in 1..=passes {
        if cancelled() {
            return Err(Error::Cancelled);
        }
        let z = depth_at(s.max.z, cut, pass, passes);
        moves.push(rapid(x0, y0, setup.clearance_z));
        moves.push(feed(x0, y0, z, cut.plunge_feed_mm_min));
        for (x, y) in [(x1, y0), (x1, y1), (x0, y1), (x0, y0)] {
            moves.push(feed(x, y, z, cut.cutting_feed_mm_min));
        }
        moves.push(rapid(x0, y0, setup.clearance_z));
    }
    if cancelled() {
        return Err(Error::Cancelled);
    }
    Ok(Toolpath {
        start: Point3 {
            x: x0,
            y: y0,
            z: setup.clearance_z,
        },
        moves,
        depth_passes: passes,
        rows_per_pass: 1,
    })
}

/// Cutter-center offset relative to a programmed rectangular contour.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ContourSide {
    Outside,
    Inside,
}

/// Walking direction of the tool center around the rectangular contour,
/// viewed from positive Z. This is not a CNC spindle setting.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ContourDirection {
    CounterClockwise,
    Clockwise,
}

/// Calculate a rectangular 2D contour with an exact perpendicular tool-radius
/// offset on all four straight sides. This is not a general CAD contour offset.
/// The outer mode only accepts the full stock rectangle (free-space plunge);
/// the inner mode accepts a rectangle strictly within stock and needs verified
/// prior material removal for its axial plunge. No machine collision check.
pub fn rectangular_contour_with_cancel(
    setup: Setup,
    tool: FlatTool,
    cut: Cut,
    rectangle: RectangleXY,
    side: ContourSide,
    direction: ContourDirection,
    mut cancelled: impl FnMut() -> bool,
) -> Result<Toolpath, Error> {
    let (_, pass_count) = validate_cut(setup, tool, cut)?;
    let stock = setup.stock;
    if !rectangle.valid() {
        return Err(Error::InvalidBounds);
    }
    let r = tool.diameter / 2.0;
    let (x0, x1, y0, y1) = match side {
        ContourSide::Outside => {
            // A different outer rectangle may traverse uncut material, so reject it.
            if rectangle.min_x != stock.min.x
                || rectangle.min_y != stock.min.y
                || rectangle.max_x != stock.max.x
                || rectangle.max_y != stock.max.y
            {
                return Err(Error::InvalidBounds);
            }
            (
                rectangle.min_x - r,
                rectangle.max_x + r,
                rectangle.min_y - r,
                rectangle.max_y + r,
            )
        }
        ContourSide::Inside => {
            if rectangle.min_x <= stock.min.x
                || rectangle.min_y <= stock.min.y
                || rectangle.max_x >= stock.max.x
                || rectangle.max_y >= stock.max.y
                || rectangle.max_x - rectangle.min_x <= tool.diameter
                || rectangle.max_y - rectangle.min_y <= tool.diameter
            {
                return Err(Error::InvalidBounds);
            }
            (
                rectangle.min_x + r,
                rectangle.max_x - r,
                rectangle.min_y + r,
                rectangle.max_y - r,
            )
        }
    };
    if ![x0, x1, y0, y1].iter().all(|x| coordinate(*x)) {
        return Err(Error::CoordinateLimit);
    }
    let capacity = bound_moves(pass_count * 7.0)?;
    if cancelled() {
        return Err(Error::Cancelled);
    }
    let passes = pass_count as usize;
    let mut moves = Vec::with_capacity(capacity);
    let sequence = match direction {
        ContourDirection::CounterClockwise => [(x1, y0), (x1, y1), (x0, y1), (x0, y0)],
        ContourDirection::Clockwise => [(x0, y1), (x1, y1), (x1, y0), (x0, y0)],
    };
    for pass in 1..=passes {
        if cancelled() {
            return Err(Error::Cancelled);
        }
        let z = depth_at(stock.max.z, cut, pass, passes);
        moves.push(rapid(x0, y0, setup.clearance_z));
        moves.push(feed(x0, y0, z, cut.plunge_feed_mm_min));
        for (x, y) in sequence {
            if cancelled() {
                return Err(Error::Cancelled);
            }
            moves.push(feed(x, y, z, cut.cutting_feed_mm_min));
        }
        moves.push(rapid(x0, y0, setup.clearance_z));
    }
    if cancelled() {
        return Err(Error::Cancelled);
    }
    Ok(Toolpath {
        start: Point3 {
            x: x0,
            y: y0,
            z: setup.clearance_z,
        },
        moves,
        depth_passes: passes,
        rows_per_pass: 1,
    })
}

/// Geometric XY contour offsets for a simple, non-self-intersecting polygon.
/// STL tessellation is approximated by straight segments; all units mm.
///
/// The caller is responsible for verifying that the entry position is clear.
/// No fixture, part-solid, holder, tool load or machine travel checks occur.
pub fn polygon_contour_with_cancel(
    setup: Setup,
    tool: FlatTool,
    cut: Cut,
    vertices: &[DrillPoint],
    side: ContourSide,
    direction: ContourDirection,
    mut cancelled: impl FnMut() -> bool,
) -> Result<Toolpath, Error> {
    let (_, pass_count) = validate_cut(setup, tool, cut)?;
    if vertices.len() < 3 || vertices.len() > 2048 {
        return Err(Error::InvalidBounds);
    }
    let stock = setup.stock;
    if vertices.iter().any(|v| {
        !coordinate(v.x) || !coordinate(v.y)
            || v.x < stock.min.x || v.x > stock.max.x
            || v.y < stock.min.y || v.y > stock.max.y
    }) {
        return Err(Error::InvalidBounds);
    }
    let n = vertices.len();
    let cross = |a: DrillPoint, b: DrillPoint| a.x * b.y - a.y * b.x;
    let minus = |a: DrillPoint, b: DrillPoint| DrillPoint {
        x: a.x - b.x, y: a.y - b.y,
    };
    let area2: f64 = (0..n).map(|i| cross(vertices[i], vertices[(i + 1) % n])).sum();
    if !area2.is_finite() || area2.abs() < 1e-8 {
        return Err(Error::InvalidBounds);
    }
    let intersect = |a: DrillPoint, b: DrillPoint, c: DrillPoint, d: DrillPoint| {
        let u = minus(b, a);
        let v = minus(d, c);
        let w = minus(c, a);
        let det = cross(u, v);
        if det.abs() < 1e-10 { return false; }
        let t = cross(w, v) / det;
        let q = cross(w, u) / det;
        t > 1e-8 && t < 1.0 - 1e-8 && q > 1e-8 && q < 1.0 - 1e-8
    };
    // Reject zero-length edges, doubled-back edges and crossing geometry.
    for i in 0..n {
        if cancelled() { return Err(Error::Cancelled); }
        let a=vertices[i];let b=vertices[(i+1)%n];
        let v=minus(b,a);
        if !v.x.is_finite() || !v.y.is_finite() || v.x.hypot(v.y)<1e-5 {
            return Err(Error::InvalidBounds);
        }
        for j in i+1..n {
            if j==i+1 || (i==0 && j==n-1) { continue; }
            if intersect(a,b,vertices[j],vertices[(j+1)%n]) {
                return Err(Error::InvalidBounds);
            }
        }
    }
    let sign = if area2 > 0.0 { 1.0 } else { -1.0 };
    let left_offset = if side == ContourSide::Inside { sign } else { -sign };
    let radius=tool.diameter/2.0;
    let mut offset=Vec::with_capacity(n);
    for i in 0..n {
        if cancelled() {return Err(Error::Cancelled);}
        let a=vertices[(i+n-1)%n];let b=vertices[i];let c=vertices[(i+1)%n];
        let v=minus(b,a);let w=minus(c,b);
        let len_v=v.x.hypot(v.y);let len_w=w.x.hypot(w.y);
        let u=DrillPoint{x:v.x/len_v,y:v.y/len_v};
        let t=DrillPoint{x:w.x/len_w,y:w.y/len_w};
        let delta=radius*left_offset;
        let p=DrillPoint{x:b.x-delta*u.y,y:b.y+delta*u.x};
        let q=DrillPoint{x:b.x-delta*t.y,y:b.y+delta*t.x};
        let det=cross(u,t);
        let hit=if det.abs()<1e-10 {
            if u.x*t.x+u.y*t.y<0.0 {return Err(Error::InvalidBounds);}
            p
        } else {
            let k=cross(minus(q,p),t)/det;
            DrillPoint{x:p.x+u.x*k,y:p.y+u.y*k}
        };
        if !coordinate(hit.x) || !coordinate(hit.y)
            || (hit.x-b.x).hypot(hit.y-b.y)>radius*12.0 {
            return Err(Error::InvalidBounds);
        }
        offset.push(hit);
    }
    let offset_area2: f64 = (0..n).map(|i| cross(offset[i],offset[(i+1)%n])).sum();
    if !offset_area2.is_finite() || offset_area2*area2<=0.0 {
        return Err(Error::InvalidBounds);
    }
    for i in 0..n {
        let a=offset[i];let b=offset[(i+1)%n];
        if minus(b,a).x.hypot(minus(b,a).y)<1e-6 {return Err(Error::InvalidBounds);}
        for j in i+1..n {
            if j==i+1 || (i==0&&j==n-1) {continue;}
            if intersect(a,b,offset[j],offset[(j+1)%n]){
                return Err(Error::InvalidBounds);
            }
        }
    }
    let moves_per_pass=n+3;
    let cap=bound_moves(pass_count*(moves_per_pass as f64))?;
    if cancelled(){return Err(Error::Cancelled);}
    let passes=pass_count as usize;
    let origin=offset[0];
    let ccw=offset_area2>0.0;
    let forward=(direction==ContourDirection::CounterClockwise)==ccw;
    let mut moves=Vec::with_capacity(cap);
    for layer in 1..=passes {
        if cancelled() {return Err(Error::Cancelled);}
        let z=depth_at(stock.max.z,cut,layer,passes);
        moves.push(rapid(origin.x,origin.y,setup.clearance_z));
        moves.push(feed(origin.x,origin.y,z,cut.plunge_feed_mm_min));
        for step in 1..=n {
            if cancelled() {return Err(Error::Cancelled);}
            let index=if forward {step%n} else {(n-step)%n};
            let v=offset[index];
            moves.push(feed(v.x,v.y,z,cut.cutting_feed_mm_min));
        }
        moves.push(rapid(origin.x,origin.y,setup.clearance_z));
    }
    if cancelled(){return Err(Error::Cancelled);}
    Ok(Toolpath {
        start: Point3{x:origin.x,y:origin.y,z:setup.clearance_z},
        moves,depth_passes:passes,rows_per_pass:1,
    })
}

/// Zigzag pocket of a bounded rectangle using a centre-cutting flat tool.
///
/// The raster spans cutter-center bounds. Sharp internal corners are not
/// geometrically achievable with a round tool; this is not a wall-finish pass.
/// Every depth pass retracts to clearance before moving laterally to restart.
pub fn rectangular_pocket(setup: Setup, tool: FlatTool, pocket: Pocket) -> Result<Toolpath, Error> {
    rectangular_pocket_with_cancel(setup, tool, pocket, || false)
}

pub fn rectangular_pocket_with_cancel(
    setup: Setup,
    tool: FlatTool,
    pocket: Pocket,
    mut cancelled: impl FnMut() -> bool,
) -> Result<Toolpath, Error> {
    let (_, pass_count) = validate_cut(setup, tool, pocket.cut)?;
    let stock = setup.stock;
    let rect = pocket.rectangle;
    if !rect.valid()
        || rect.min_x < stock.min.x
        || rect.max_x > stock.max.x
        || rect.min_y < stock.min.y
        || rect.max_y > stock.max.y
    {
        return Err(Error::InvalidBounds);
    }
    if !positive(pocket.stepover_mm) || pocket.stepover_mm > tool.diameter / 2.0 {
        return Err(Error::InvalidStep);
    }
    if rect.max_x - rect.min_x < tool.diameter || rect.max_y - rect.min_y < tool.diameter {
        return Err(Error::InvalidBounds);
    }
    let r = tool.diameter / 2.0;
    let (x0, x1, y0, y1) = (
        rect.min_x + r,
        rect.max_x - r,
        rect.min_y + r,
        rect.max_y - r,
    );
    let y_span = y1 - y0;
    let intervals = if y_span == 0.0 {
        0.0
    } else {
        (y_span / pocket.stepover_mm).ceil()
    };
    let rows = intervals + 1.0;
    let cap = bound_moves(pass_count * (rows * 2.0 + 2.0))?;
    let passes = pass_count as usize;
    let rows = rows as usize;
    if cancelled() {
        return Err(Error::Cancelled);
    }
    let mut moves = Vec::with_capacity(cap);
    for pass in 1..=passes {
        if cancelled() {
            return Err(Error::Cancelled);
        }
        let z = depth_at(stock.max.z, pocket.cut, pass, passes);
        moves.push(rapid(x0, y0, setup.clearance_z));
        moves.push(feed(x0, y0, z, pocket.cut.plunge_feed_mm_min));
        let mut current_x = x0;
        for row in 0..rows {
            if cancelled() {
                return Err(Error::Cancelled);
            }
            let y = if row + 1 == rows {
                y1
            } else if rows == 1 {
                y0
            } else {
                y0 + y_span * (row as f64 / (rows - 1) as f64)
            };
            let target_x = if row % 2 == 0 { x1 } else { x0 };
            if current_x != target_x {
                moves.push(feed(target_x, y, z, pocket.cut.cutting_feed_mm_min));
                current_x = target_x;
            }
            if row + 1 < rows {
                let next_y = if row + 2 == rows {
                    y1
                } else {
                    y0 + y_span * ((row + 1) as f64 / (rows - 1) as f64)
                };
                moves.push(feed(current_x, next_y, z, pocket.cut.cutting_feed_mm_min));
            }
        }
        moves.push(rapid(current_x, y1, setup.clearance_z));
    }
    if cancelled() {
        return Err(Error::Cancelled);
    }
    Ok(Toolpath {
        start: Point3 {
            x: x0,
            y: y0,
            z: setup.clearance_z,
        },
        moves,
        depth_passes: passes,
        rows_per_pass: rows,
    })
}

/// Drill supplied XY holes, optionally in pecks with *full clearance retract*
/// between pecks. No rapid moves into the existing hole are generated.
///
/// This neutral motion list does not model a drill-point angle, centre drilling,
/// tool deflection, chip evacuation, through-hole breakthrough or fixture safety.
/// The `Toolpath.rows_per_pass` field counts hole locations for this operation.
pub fn drill_points(setup: Setup, bit: DrillBit, drill: Drilling<'_>) -> Result<Toolpath, Error> {
    drill_points_with_cancel(setup, bit, drill, || false)
}

pub fn drill_points_with_cancel(
    setup: Setup,
    bit: DrillBit,
    drill: Drilling<'_>,
    mut cancelled: impl FnMut() -> bool,
) -> Result<Toolpath, Error> {
    validate_setup(setup)?;
    if !positive(bit.diameter_mm) || !positive(bit.flute_length_mm) {
        return Err(Error::InvalidTool);
    }
    let depth = validate_depth(setup, drill.bottom_z, bit.flute_length_mm)?;
    if !positive(drill.feed_mm_min) {
        return Err(Error::InvalidFeed);
    }
    if drill.points.is_empty() {
        return Err(Error::NoDrillPoints);
    }
    let pecks = match drill.peck_mm {
        None => 1.0,
        Some(d) if positive(d) => (depth / d).ceil().max(1.0),
        Some(_) => return Err(Error::InvalidPeck),
    };
    let cap = bound_moves((drill.points.len() as f64) * (1.0 + 2.0 * pecks))?;
    let pecks = pecks as usize;
    let r = bit.diameter_mm / 2.0;
    let s = setup.stock;
    for p in drill.points {
        if !coordinate(p.x)
            || !coordinate(p.y)
            || p.x - r < s.min.x
            || p.x + r > s.max.x
            || p.y - r < s.min.y
            || p.y + r > s.max.y
        {
            return Err(Error::InvalidPoint);
        }
    }
    if cancelled() {
        return Err(Error::Cancelled);
    }
    let first = drill.points[0];
    let mut moves = Vec::with_capacity(cap);
    for hole in drill.points {
        if cancelled() {
            return Err(Error::Cancelled);
        }
        moves.push(rapid(hole.x, hole.y, setup.clearance_z));
        for step in 1..=pecks {
            if cancelled() {
                return Err(Error::Cancelled);
            }
            let z = if step == pecks {
                drill.bottom_z
            } else {
                (s.max.z - step as f64 * drill.peck_mm.unwrap_or(depth)).max(drill.bottom_z)
            };
            moves.push(feed(hole.x, hole.y, z, drill.feed_mm_min));
            moves.push(rapid(hole.x, hole.y, setup.clearance_z));
        }
    }
    if cancelled() {
        return Err(Error::Cancelled);
    }
    Ok(Toolpath {
        start: Point3 {
            x: first.x,
            y: first.y,
            z: setup.clearance_z,
        },
        moves,
        depth_passes: pecks,
        rows_per_pass: drill.points.len(),
    })
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used)]
    use super::*;
    use crate::StockBox;

    fn fixture() -> (Setup, FlatTool, Cut) {
        (
            Setup {
                stock: StockBox {
                    min: Point3 {
                        x: 0.0,
                        y: 0.0,
                        z: 0.0,
                    },
                    max: Point3 {
                        x: 40.0,
                        y: 30.0,
                        z: 10.0,
                    },
                },
                clearance_z: 15.0,
            },
            FlatTool {
                diameter: 6.0,
                cutting_length: 12.0,
            },
            Cut {
                bottom_z: 6.0,
                stepdown_mm: 2.0,
                cutting_feed_mm_min: 500.0,
                plunge_feed_mm_min: 100.0,
            },
        )
    }

    fn lateral_rapids_at_clearance(path: &Toolpath, clearance: f64) {
        let mut previous = path.start;
        for movement in &path.moves {
            if movement.motion == Motion::Rapid
                && (movement.to.x != previous.x || movement.to.y != previous.y)
            {
                assert_eq!(previous.z, clearance);
                assert_eq!(movement.to.z, clearance);
            }
            assert!(point_valid(movement.to));
            previous = movement.to;
        }
        assert_eq!(previous.z, clearance);
    }

    #[test]
    fn external_contour_is_radius_offset_and_closed_for_each_depth() {
        let (setup, tool, cut) = fixture();
        let path = outside_contour(setup, tool, cut).unwrap();
        assert_eq!(
            path.start,
            Point3 {
                x: -3.0,
                y: -3.0,
                z: 15.0
            }
        );
        assert_eq!(path.depth_passes, 2);
        assert_eq!(path.moves.len(), 14); // 7 moves per pass
        assert_eq!(
            path.moves[2].to,
            Point3 {
                x: 43.0,
                y: -3.0,
                z: 8.0
            }
        );
        assert_eq!(
            path.moves[5].to,
            Point3 {
                x: -3.0,
                y: -3.0,
                z: 8.0
            }
        );
        assert_eq!(
            path.moves[12].to,
            Point3 {
                x: -3.0,
                y: -3.0,
                z: 6.0
            }
        );
        lateral_rapids_at_clearance(&path, setup.clearance_z);
    }

    #[test]
    fn polygon_profile_offsets_and_reverses_non_rectangular_contours() {
        let (setup,tool,cut)=fixture();
        let shape=[
            DrillPoint{x:10.0,y:10.0},
            DrillPoint{x:30.0,y:10.0},
            DrillPoint{x:33.0,y:20.0},
            DrillPoint{x:12.0,y:23.0},
        ];
        let outside=polygon_contour_with_cancel(setup,tool,cut,&shape,ContourSide::Outside,ContourDirection::CounterClockwise,||false).unwrap();
        let inside=polygon_contour_with_cancel(setup,tool,cut,&shape,ContourSide::Inside,ContourDirection::Clockwise,||false).unwrap();
        assert_eq!(outside.moves.len(),14);
        assert_eq!(inside.moves.len(),14);
        assert!(outside.start.x<shape[0].x);
        assert!(outside.start.y<shape[0].y);
        assert!(inside.start.x>shape[0].x);
        assert!(inside.start.y>shape[0].y);
        assert_eq!(outside.moves[5].to.x,outside.start.x);
        assert_eq!(inside.moves[5].to.y,inside.start.y);
        assert_ne!(outside.moves[2].to.x,inside.moves[2].to.x);
        lateral_rapids_at_clearance(&outside,setup.clearance_z);
        lateral_rapids_at_clearance(&inside,setup.clearance_z);
    }
    #[test]
    fn polygon_profile_rejects_crossings_invalid_offsets_and_cancellation() {
        let (setup,tool,cut)=fixture();
        let bow=[
            DrillPoint{x:10.0,y:10.0},DrillPoint{x:30.0,y:20.0},
            DrillPoint{x:10.0,y:20.0},DrillPoint{x:30.0,y:10.0},
        ];
        assert_eq!(polygon_contour_with_cancel(setup,tool,cut,&bow,ContourSide::Outside,ContourDirection::Clockwise,||false).unwrap_err(),Error::InvalidBounds);
        let bad=[
            DrillPoint{x:-1.0,y:5.0},DrillPoint{x:20.0,y:5.0},
            DrillPoint{x:20.0,y:20.0},
        ];
        assert_eq!(polygon_contour_with_cancel(setup,tool,cut,&bad,ContourSide::Outside,ContourDirection::Clockwise,||false).unwrap_err(),Error::InvalidBounds);
        let valid=[
            DrillPoint{x:10.0,y:10.0},DrillPoint{x:30.0,y:10.0},
            DrillPoint{x:30.0,y:20.0},DrillPoint{x:10.0,y:20.0},
        ];
        assert_eq!(polygon_contour_with_cancel(setup,tool,cut,&valid,ContourSide::Inside,ContourDirection::Clockwise,||true).unwrap_err(),Error::Cancelled);
        let large=FlatTool{diameter:40.0,..tool};
        assert_eq!(polygon_contour_with_cancel(setup,large,cut,&valid,ContourSide::Inside,ContourDirection::Clockwise,||false).unwrap_err(),Error::InvalidBounds);
    }

    #[test]
    fn pocket_rows_cover_inner_centerline_and_last_depth() {
        let (setup, tool, cut) = fixture();
        let pocket = Pocket {
            rectangle: RectangleXY {
                min_x: 5.0,
                min_y: 5.0,
                max_x: 35.0,
                max_y: 25.0,
            },
            cut,
            stepover_mm: 3.0,
        };
        let path = rectangular_pocket(setup, tool, pocket).unwrap();
        assert_eq!(
            path.start,
            Point3 {
                x: 8.0,
                y: 8.0,
                z: 15.0
            }
        );
        assert_eq!(path.depth_passes, 2);
        assert_eq!(path.rows_per_pass, 6);
        assert_eq!(path.moves[1].to.z, 8.0);
        assert!(path.moves.iter().any(|m| m.to
            == Point3 {
                x: 32.0,
                y: 22.0,
                z: 6.0
            }));
        lateral_rapids_at_clearance(&path, setup.clearance_z);
    }

    #[test]
    fn pocket_rejects_nonfitting_tools_and_invalid_steps() {
        let (setup, tool, cut) = fixture();
        let mut pocket = Pocket {
            rectangle: RectangleXY {
                min_x: 1.0,
                min_y: 1.0,
                max_x: 5.0,
                max_y: 20.0,
            },
            cut,
            stepover_mm: 3.0,
        };
        assert_eq!(
            rectangular_pocket(setup, tool, pocket).unwrap_err(),
            Error::InvalidBounds
        );
        pocket.rectangle.max_x = 20.0;
        pocket.stepover_mm = f64::MIN_POSITIVE;
        assert_eq!(
            rectangular_pocket(setup, tool, pocket).unwrap_err(),
            Error::TooManyMoves
        );
        pocket.stepover_mm = 5.0;
        assert_eq!(
            rectangular_pocket(setup, tool, pocket).unwrap_err(),
            Error::InvalidStep
        );
    }

    #[test]
    fn drill_pecks_retract_fully_and_reach_explicit_bottom() {
        let (setup, _, _) = fixture();
        let holes = [
            DrillPoint { x: 10.0, y: 10.0 },
            DrillPoint { x: 30.0, y: 20.0 },
        ];
        let path = drill_points(
            setup,
            DrillBit {
                diameter_mm: 5.0,
                flute_length_mm: 10.0,
            },
            Drilling {
                points: &holes,
                bottom_z: 5.0,
                peck_mm: Some(2.0),
                feed_mm_min: 120.0,
            },
        )
        .unwrap();
        assert_eq!(path.depth_passes, 3);
        assert_eq!(path.rows_per_pass, 2);
        assert_eq!(path.moves.len(), 14);
        let feeds: Vec<_> = path
            .moves
            .iter()
            .filter(|m| matches!(m.motion, Motion::Feed { .. }))
            .collect();
        assert_eq!(
            feeds.iter().map(|m| m.to.z).collect::<Vec<_>>(),
            vec![8.0, 6.0, 5.0, 8.0, 6.0, 5.0]
        );
        lateral_rapids_at_clearance(&path, setup.clearance_z);
    }

    #[test]
    fn drill_rejects_bad_holes_and_pecks() {
        let (setup, _, _) = fixture();
        let holes = [DrillPoint { x: 0.0, y: 10.0 }];
        let bit = DrillBit {
            diameter_mm: 5.0,
            flute_length_mm: 10.0,
        };
        let op = Drilling {
            points: &holes,
            bottom_z: 5.0,
            peck_mm: None,
            feed_mm_min: 120.0,
        };
        assert_eq!(
            drill_points(setup, bit, op).unwrap_err(),
            Error::InvalidPoint
        );
        let valid = [DrillPoint { x: 10.0, y: 10.0 }];
        let op = Drilling {
            points: &valid,
            peck_mm: Some(0.0),
            ..op
        };
        assert_eq!(
            drill_points(setup, bit, op).unwrap_err(),
            Error::InvalidPeck
        );
        let op = Drilling {
            points: &[],
            peck_mm: None,
            ..op
        };
        assert_eq!(
            drill_points(setup, bit, op).unwrap_err(),
            Error::NoDrillPoints
        );
    }

    #[test]
    fn all_planners_cancel_without_publishing_partial_paths() {
        let (setup, tool, cut) = fixture();
        assert_eq!(
            outside_contour_with_cancel(setup, tool, cut, || true).unwrap_err(),
            Error::Cancelled
        );
        let pocket = Pocket {
            rectangle: RectangleXY {
                min_x: 5.0,
                min_y: 5.0,
                max_x: 35.0,
                max_y: 25.0,
            },
            cut,
            stepover_mm: 3.0,
        };
        assert_eq!(
            rectangular_pocket_with_cancel(setup, tool, pocket, || true).unwrap_err(),
            Error::Cancelled
        );
        let holes = [DrillPoint { x: 10.0, y: 10.0 }];
        assert_eq!(
            drill_points_with_cancel(
                setup,
                DrillBit {
                    diameter_mm: 5.0,
                    flute_length_mm: 10.0
                },
                Drilling {
                    points: &holes,
                    bottom_z: 5.0,
                    peck_mm: None,
                    feed_mm_min: 120.0
                },
                || true,
            )
            .unwrap_err(),
            Error::Cancelled
        );
    }
    #[test]
    fn rectangular_contour_outside_and_inside_keep_tool_on_correct_side() {
        let (setup, tool, cut) = fixture();
        let outside = rectangular_contour_with_cancel(
            setup,
            tool,
            cut,
            RectangleXY {
                min_x: 0.0,
                min_y: 0.0,
                max_x: 40.0,
                max_y: 30.0,
            },
            ContourSide::Outside,
            ContourDirection::CounterClockwise,
            || false,
        )
        .unwrap();
        assert_eq!(
            outside.start,
            Point3 {
                x: -3.0,
                y: -3.0,
                z: 15.0
            }
        );
        assert_eq!(outside.moves.len(), 14);
        assert_eq!(
            outside.moves[2].to,
            Point3 {
                x: 43.0,
                y: -3.0,
                z: 8.0
            }
        );
        assert_eq!(outside.moves[6].to.z, 15.0);
        let inside = rectangular_contour_with_cancel(
            setup,
            tool,
            cut,
            RectangleXY {
                min_x: 6.0,
                min_y: 7.0,
                max_x: 34.0,
                max_y: 23.0,
            },
            ContourSide::Inside,
            ContourDirection::Clockwise,
            || false,
        )
        .unwrap();
        assert_eq!(
            inside.start,
            Point3 {
                x: 9.0,
                y: 10.0,
                z: 15.0
            }
        );
        assert_eq!(
            inside.moves[2].to,
            Point3 {
                x: 9.0,
                y: 20.0,
                z: 8.0
            }
        );
        assert_eq!(
            inside.moves[3].to,
            Point3 {
                x: 31.0,
                y: 20.0,
                z: 8.0
            }
        );
        assert_eq!(
            inside.moves[5].to,
            Point3 {
                x: 9.0,
                y: 10.0,
                z: 8.0
            }
        );
        assert_eq!(inside.moves[12].to.z, 6.0);
        lateral_rapids_at_clearance(&outside, setup.clearance_z);
        lateral_rapids_at_clearance(&inside, setup.clearance_z);
    }
    #[test]
    fn rectangular_contour_rejects_unsafe_geometry_and_cancel() {
        let (setup, tool, cut) = fixture();
        let stock_rect = RectangleXY {
            min_x: 0.0,
            min_y: 0.0,
            max_x: 40.0,
            max_y: 30.0,
        };
        let inner = RectangleXY {
            min_x: 2.0,
            min_y: 3.0,
            max_x: 38.0,
            max_y: 27.0,
        };
        assert_eq!(
            rectangular_contour_with_cancel(
                setup,
                tool,
                cut,
                stock_rect,
                ContourSide::Inside,
                ContourDirection::Clockwise,
                || false
            )
            .unwrap_err(),
            Error::InvalidBounds
        );
        assert_eq!(
            rectangular_contour_with_cancel(
                setup,
                tool,
                cut,
                inner,
                ContourSide::Outside,
                ContourDirection::Clockwise,
                || false
            )
            .unwrap_err(),
            Error::InvalidBounds
        );
        let small = RectangleXY {
            min_x: 9.0,
            min_y: 9.0,
            max_x: 14.0,
            max_y: 14.0,
        };
        assert_eq!(
            rectangular_contour_with_cancel(
                setup,
                tool,
                cut,
                small,
                ContourSide::Inside,
                ContourDirection::Clockwise,
                || false
            )
            .unwrap_err(),
            Error::InvalidBounds
        );
        assert_eq!(
            rectangular_contour_with_cancel(
                setup,
                tool,
                cut,
                inner,
                ContourSide::Inside,
                ContourDirection::Clockwise,
                || true
            )
            .unwrap_err(),
            Error::Cancelled
        );
        let mut tiny_cut = cut;
        tiny_cut.stepdown_mm = f64::MIN_POSITIVE;
        assert_eq!(
            rectangular_contour_with_cancel(
                setup,
                tool,
                tiny_cut,
                inner,
                ContourSide::Inside,
                ContourDirection::Clockwise,
                || false
            )
            .unwrap_err(),
            Error::TooManyMoves
        );
    }
}

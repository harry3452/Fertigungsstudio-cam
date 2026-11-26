//! Experimental live routes for rectangular contour/pocket and drilling.
//! These are not verified NC programs. The server remains loopback-only.

use fertigungsstudio_cam_core::milling::{
    Cut, DrillBit, DrillPoint, Drilling, Pocket, RectangleXY, drill_points_with_cancel,
    outside_contour_with_cancel, rectangular_pocket_with_cancel,
};
use fertigungsstudio_cam_core::{FlatTool, Motion, Point3, Setup, StockBox, Toolpath};
use std::fmt::Write as _;

/// Shared input fields: stock width/length/height, removal depth, tool
/// diameter, depth step, stepover, tool number, flute length, feed and plunge.
/// Pocket/drilling append X and Y margins measured from stock boundaries.
/// The 3-axis fixed-X/Y layout is intentionally limited to a demo.
pub(super) fn calculate(
    route: &str,
    body: &str,
    cancelled: impl FnMut() -> bool,
) -> Result<String, String> {
    let args = body
        .split_whitespace()
        .map(str::parse::<f64>)
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "InvalidNumbers")?;
    let expected = if route == "/api/contour" { 11 } else { 13 };
    if args.len() != expected {
        return Err("InvalidNumberCount".into());
    }
    if args.iter().any(|n| !n.is_finite()) {
        return Err("InvalidNumbers".into());
    }
    let [
        width,
        length,
        height,
        depth,
        diameter,
        stepdown,
        stepover,
        number,
        cutting_length,
        cutting_feed,
        plunge_feed,
    ] = &args[..11]
    else {
        return Err("InvalidNumberCount".into());
    };
    if *number < 1.0 || *number > 9999.0 || number.fract() != 0.0 {
        return Err("InvalidToolNumber".into());
    }
    if *depth <= 0.0 {
        return Err("InvalidDepth".into());
    }
    let setup = Setup {
        stock: StockBox {
            min: Point3 {
                x: 0.0,
                y: 0.0,
                z: 0.0,
            },
            max: Point3 {
                x: *width,
                y: *length,
                z: *height,
            },
        },
        clearance_z: height + 5.0,
    };
    let cut = Cut {
        bottom_z: height - depth,
        stepdown_mm: *stepdown,
        cutting_feed_mm_min: *cutting_feed,
        plunge_feed_mm_min: *plunge_feed,
    };
    let (operation, path) = match route {
        "/api/contour" => (
            "contour",
            outside_contour_with_cancel(
                setup,
                FlatTool {
                    diameter: *diameter,
                    cutting_length: *cutting_length,
                },
                cut,
                cancelled,
            ),
        ),
        "/api/pocket" => {
            let [margin_x, margin_y] = &args[11..] else {
                return Err("InvalidNumberCount".into());
            };
            (
                "pocket",
                rectangular_pocket_with_cancel(
                    setup,
                    FlatTool {
                        diameter: *diameter,
                        cutting_length: *cutting_length,
                    },
                    Pocket {
                        rectangle: RectangleXY {
                            min_x: *margin_x,
                            min_y: *margin_y,
                            max_x: width - margin_x,
                            max_y: length - margin_y,
                        },
                        cut,
                        stepover_mm: *stepover,
                    },
                    cancelled,
                ),
            )
        }
        "/api/drilling" => {
            let [margin_x, margin_y] = &args[11..] else {
                return Err("InvalidNumberCount".into());
            };
            let holes = [
                DrillPoint {
                    x: *margin_x,
                    y: *margin_y,
                },
                DrillPoint {
                    x: width - margin_x,
                    y: *margin_y,
                },
                DrillPoint {
                    x: width - margin_x,
                    y: length - margin_y,
                },
                DrillPoint {
                    x: *margin_x,
                    y: length - margin_y,
                },
            ];
            let peck_mm = if *stepdown == 0.0 {
                None
            } else {
                Some(*stepdown)
            };
            let drilling = Drilling {
                points: &holes,
                bottom_z: cut.bottom_z,
                peck_mm,
                feed_mm_min: *cutting_feed,
            };
            (
                "drilling",
                drill_points_with_cancel(
                    setup,
                    DrillBit {
                        diameter_mm: *diameter,
                        flute_length_mm: *cutting_length,
                    },
                    drilling,
                    cancelled,
                ),
            )
        }
        _ => return Err("UnknownOperation".into()),
    };
    let path = path.map_err(|e| e.to_string())?;
    serialize(
        operation,
        setup,
        &path,
        *number as u16,
        *diameter,
        *cutting_length,
        *cutting_feed,
        *plunge_feed,
        cut.bottom_z,
    )
}

fn serialize(
    operation: &str,
    setup: Setup,
    path: &Toolpath,
    number: u16,
    diameter: f64,
    cutting_length: f64,
    cutting_feed: f64,
    plunge_feed: f64,
    bottom_z: f64,
) -> Result<String, String> {
    let max = setup.stock.max;
    let mut json = format!(
        "{{\"format\":\"fertigungsstudio-toolpath-v1\",\"operation\":\"{operation}\",         \"units\":\"mm\",\"stock\":{{\"min\":[0,0,0],\"max\":[{},{},{}]}},         \"tool_diameter\":{diameter},\"bottom_z\":{bottom_z},\"clearance_z\":{},         \"start\":[{},{},{}],\"moves\":[",
        max.x, max.y, max.z, setup.clearance_z, path.start.x, path.start.y, path.start.z,
    );
    for (index, movement) in path.moves.iter().enumerate() {
        if index > 0 {
            json.push(',');
        }
        let kind = if movement.motion == Motion::Rapid {
            "rapid"
        } else {
            "feed"
        };
        write!(
            json,
            "{{\"to\":[{},{},{}],\"motion\":\"{kind}\"}}",
            movement.to.x, movement.to.y, movement.to.z,
        )
        .map_err(|_| "FormatError")?;
    }
    write!(
        json,
        "],\"tool_number\":{number},\"cutting_length\":{cutting_length},         \"cutting_feed\":{cutting_feed},\"plunge_feed\":{plunge_feed}}}",
    ).map_err(|_| "FormatError")?;
    Ok(json)
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used)]
    use super::*;
    use fertigungsstudio_cam_core::Error;

    #[test]
    fn contour_pocket_and_drilling_routes_return_distinct_valid_data() {
        let cases = [
            ("/api/contour", "40 30 10 4 6 2 3 1 12 500 100", "contour"),
            ("/api/pocket", "40 30 10 4 6 2 3 1 12 500 100 5 5", "pocket"),
            (
                "/api/drilling",
                "40 30 10 5 5 2 2 3 10 120 100 10 10",
                "drilling",
            ),
        ];
        for (route, input, operation) in cases {
            let json = calculate(route, input, || false).unwrap();
            assert!(json.contains("\"fertigungsstudio-toolpath-v1\""));
            assert!(json.contains(&format!("\"operation\":\"{operation}\"")));
            assert!(json.contains("\"moves\":["));
        }
    }

    #[test]
    fn routes_reject_invalid_geometry_and_cancellation() {
        assert_eq!(
            calculate("/api/pocket", "40 30 10 4 6 2 3 1 12 500 100 19 5", || {
                false
            }),
            Err(Error::InvalidBounds.to_string()),
        );
        assert_eq!(
            calculate("/api/drilling", "40 30 10 5 5 2 2 3 10 120 100 1 1", || {
                false
            }),
            Err(Error::InvalidPoint.to_string()),
        );
        assert_eq!(
            calculate("/api/contour", "40 30 10 4 6 2 3 1 12 500 100", || true),
            Err(Error::Cancelled.to_string()),
        );
        assert_eq!(
            calculate("/api/pocket", "40 30 10 4 6 2 3 1 12 500 100", || false),
            Err("InvalidNumberCount".into()),
        );
        assert_eq!(
            calculate("/api/contour", "40 30 10 4 6 2 3 1.5 12 500 100", || false),
            Err("InvalidToolNumber".into()),
        );
    }
}

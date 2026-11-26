//! Experimental neutral toolpath demonstration. This does NOT output NC code.
use fertigungsstudio_cam_core::milling::{
    Cut, DrillBit, DrillPoint, Drilling, Pocket, RectangleXY, drill_points,
    outside_contour, rectangular_pocket,
};
use fertigungsstudio_cam_core::{FlatTool, Point3, Setup, StockBox};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let setup = Setup {
        stock: StockBox {
            min: Point3 { x: 0.0, y: 0.0, z: 0.0 },
            max: Point3 { x: 40.0, y: 30.0, z: 10.0 },
        },
        clearance_z: 15.0,
    };
    let tool = FlatTool { diameter: 6.0, cutting_length: 12.0 };
    let cut = Cut {
        bottom_z: 6.0, stepdown_mm: 2.0,
        cutting_feed_mm_min: 500.0, plunge_feed_mm_min: 100.0,
    };
    let contour = outside_contour(setup, tool, cut)?;
    let pocket = rectangular_pocket(
        setup, tool,
        Pocket {
            rectangle: RectangleXY { min_x: 5.0, min_y: 5.0, max_x: 35.0, max_y: 25.0 },
            cut, stepover_mm: 3.0,
        },
    )?;
    let holes = [DrillPoint { x: 10.0, y: 10.0 }, DrillPoint { x: 30.0, y: 20.0 }];
    let drilling = drill_points(
        setup, DrillBit { diameter_mm: 5.0, flute_length_mm: 10.0 },
        Drilling { points: &holes, bottom_z: 5.0, peck_mm: Some(2.0), feed_mm_min: 120.0 },
    )?;
    for (label, path) in [("OUTSIDE_CONTOUR", contour), ("RECTANGULAR_POCKET", pocket), ("DRILLING", drilling)] {
        println!("{label}: {} neutral moves, {} depth steps, {} rows/holes, required start = ({:.3}, {:.3}, {:.3}) mm",
            path.moves.len(), path.depth_passes, path.rows_per_pass,
            path.start.x, path.start.y, path.start.z);
    }
    println!("EXPERIMENTAL ONLY - no NC code, machine collision verification or safety approval");
    Ok(())
}

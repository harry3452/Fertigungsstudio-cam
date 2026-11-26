//! Run: cargo run --example facing -- [width length height depth diameter stepdown stepover]
//! Output is an experimental move report, never a machine program.
use fertigungsstudio_cam_core::{Facing, FlatTool, Motion, Point3, Setup, face};
use std::io::{self, Write};

fn report(args: &[String], out: &mut impl Write) -> Result<(), Box<dyn std::error::Error>> {
    if args.iter().any(|s| s == "--help" || s == "-h") {
        writeln!(
            out,
            "Usage: facing [--json] [width length height depth diameter stepdown stepover]"
        )?;
        writeln!(
            out,
            "All lengths in mm. Supply all seven values or none. Defaults: 120 80 12 2 10 1 4."
        )?;
        return Ok(());
    }
    let json = args.first().is_some_and(|s| s == "--json");
    let args = if json { &args[1..] } else { args };
    let mut values: [f64; 7] = [120.0, 80.0, 12.0, 2.0, 10.0, 1.0, 4.0];
    if !args.is_empty() {
        if args.len() != 7 {
            return Err("Supply exactly seven numeric arguments; use --help for usage.".into());
        }
        for (value, arg) in values.iter_mut().zip(args) {
            *value = arg.parse()?;
        }
    }
    let [width, length, height, depth, diameter, stepdown, stepover] = values;
    if !depth.is_finite() || depth <= 0.0 {
        return Err("Depth must be finite and positive.".into());
    }
    let setup = Setup {
        stock: fertigungsstudio_cam_core::StockBox {
            min: Point3 {
                x: 0.0,
                y: 0.0,
                z: 0.0,
            },
            max: Point3 {
                x: width,
                y: length,
                z: height,
            },
        },
        clearance_z: height + 5.0,
    };
    // Demo tool only: its explicitly stated cutting length is 20 mm.
    let tool = FlatTool {
        diameter,
        cutting_length: 20.0,
    };
    let op = Facing {
        bottom_z: height - depth,
        stepdown,
        stepover,
        cutting_feed: 800.0,
        plunge_feed: 200.0,
    };
    let path = face(setup, tool, op)?;
    if json {
        writeln!(
            out,
            "{{\"format\":\"fertigungsstudio-facing-v1\",\"units\":\"mm\","
        )?;
        writeln!(
            out,
            "\"stock\":{{\"min\":[0,0,0],\"max\":[{width},{length},{height}]}},"
        )?;
        writeln!(
            out,
            "\"tool_diameter\":{diameter},\"bottom_z\":{},\"clearance_z\":{},",
            op.bottom_z, setup.clearance_z
        )?;
        writeln!(
            out,
            "\"start\":[{},{},{}],\"moves\":[",
            path.start.x, path.start.y, path.start.z
        )?;
        for (i, m) in path.moves.iter().enumerate() {
            let motion = if m.motion == Motion::Rapid {
                "rapid"
            } else {
                "feed"
            };
            writeln!(
                out,
                "{{\"to\":[{},{},{}],\"motion\":\"{motion}\"}}{}",
                m.to.x,
                m.to.y,
                m.to.z,
                if i + 1 == path.moves.len() { "" } else { "," }
            )?;
        }
        writeln!(out, "]}}")?;
        return Ok(());
    }
    writeln!(
        out,
        "Fertigungsstudio CAM - experimental move report (NOT G-code)"
    )?;
    writeln!(
        out,
        "Units: mm, mm/min. Fixed 3-axis work frame. Demo tool cutting length: 20 mm."
    )?;
    writeln!(
        out,
        "No fixture/holder/machine collision verification; outside stock assumed free."
    )?;
    writeln!(
        out,
        "Depth passes: {}; rows/pass: {}; moves: {}",
        path.depth_passes,
        path.rows_per_pass,
        path.moves.len()
    )?;
    writeln!(
        out,
        "Required start: {},{},{}",
        path.start.x, path.start.y, path.start.z
    )?;
    writeln!(out, "index,motion,x_mm,y_mm,z_mm,feed_mm_min")?;
    for (index, m) in path.moves.iter().enumerate() {
        let (kind, feed) = match m.motion {
            Motion::Rapid => ("rapid", String::new()),
            Motion::Feed { mm_per_min } => ("feed", mm_per_min.to_string()),
        };
        writeln!(
            out,
            "{},{},{},{},{},{}",
            index + 1,
            kind,
            m.to.x,
            m.to.y,
            m.to.z,
            feed
        )?;
    }
    Ok(())
}

fn main() -> std::process::ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match report(&args, &mut io::stdout().lock()) {
        Ok(()) => std::process::ExitCode::SUCCESS,
        Err(e) => {
            let _ = writeln!(io::stderr().lock(), "Facing report failed: {e}");
            std::process::ExitCode::FAILURE
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn report_has_known_counts_and_refuses_bad_arguments() -> Result<(), Box<dyn std::error::Error>>
    {
        let mut output = Vec::new();
        report(&[], &mut output)?;
        let text = String::from_utf8(output)?;
        assert!(text.contains("Depth passes: 2; rows/pass: 21; moves: 168"));
        assert!(text.contains("Required start: -10,0,17"));
        assert!(report(&["12".into()], &mut Vec::new()).is_err());
        let invalid = ["120", "80", "12", "-1", "10", "1", "4"].map(String::from);
        assert!(report(&invalid, &mut Vec::new()).is_err());
        Ok(())
    }
}

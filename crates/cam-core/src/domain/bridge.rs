//! Explicit adapter between validated multi-process records and the existing
//! bounded 3-axis rectangular facing planner.
//! This produces neutral, unverified paths; it never produces machine NC code.

use super::operation::{MillingOperation, OperationKind};
use super::plan::{PlanDefinition, PlanError};
use super::setup::StockGeometry;
use super::tool::{MillingToolKind, ToolGeometry};
use crate::milling::{
    Cut, DrillBit, Drilling, Pocket, drill_points_with_cancel, outside_contour_with_cancel,
    rectangular_pocket_with_cancel,
};
use crate::tools::ToolLibrary;
use crate::{Error, Facing, Point3, Setup, StockBox, Toolpath};

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum BridgeError {
    InvalidPlan(PlanError),
    UnknownOperation,
    NotFacing,
    WrongMillingOperation,
    UnsupportedStock,
    UnsupportedTool,
    UnknownLibraryTool,
    ToolGeometryMismatch,
    Planner(Error),
}

fn point(v: super::motion::Vec3) -> Point3 {
    Point3 {
        x: v.x,
        y: v.y,
        z: v.z,
    }
}

/// Run the existing facing planner using the shared domain plan and a tool
/// selected in the existing UI tool library. The operation settings retain
/// their explicitly supplied step/depth and tool-feed values from the library.
///
/// Stock dimensions must already be expressed in the setup work frame.
/// No CAD conversion, machine-axis mapping or collision proof is performed.
pub fn face_plan_operation(
    plan: &PlanDefinition,
    library: &ToolLibrary,
    operation_id: &str,
    clearance_z_mm: f64,
    facing: Facing,
    cancelled: impl FnMut() -> bool,
) -> Result<Toolpath, BridgeError> {
    plan.validate().map_err(BridgeError::InvalidPlan)?;
    let operation = plan
        .operations
        .iter()
        .find(|op| op.id == operation_id)
        .ok_or(BridgeError::UnknownOperation)?;
    if operation.kind != OperationKind::Milling(MillingOperation::Facing) {
        return Err(BridgeError::NotFacing);
    }
    let setup = plan
        .setups
        .iter()
        .find(|setup| setup.id == operation.setup_id)
        .ok_or(BridgeError::UnknownOperation)?;
    let tool = plan
        .tools
        .iter()
        .find(|tool| tool.id == operation.tool_id)
        .ok_or(BridgeError::UnknownOperation)?;
    let stock = match setup.stock {
        StockGeometry::Box { min_mm, max_mm } => StockBox {
            min: point(min_mm),
            max: point(max_mm),
        },
        _ => return Err(BridgeError::UnsupportedStock),
    };
    let (diameter_mm, flute_length_mm) = match tool.geometry {
        ToolGeometry::Milling {
            kind: MillingToolKind::FlatEndMill,
            diameter_mm,
            flute_length_mm,
            center_cutting: true,
            ..
        } => (diameter_mm, flute_length_mm),
        _ => return Err(BridgeError::UnsupportedTool),
    };
    let number = tool.station_number.ok_or(BridgeError::UnknownLibraryTool)?;
    let number = u16::try_from(number).map_err(|_| BridgeError::UnknownLibraryTool)?;
    let selected = library.get(number).ok_or(BridgeError::UnknownLibraryTool)?;
    let geometry = selected.geometry();
    if geometry.diameter != diameter_mm || geometry.cutting_length != flute_length_mm {
        return Err(BridgeError::ToolGeometryMismatch);
    }
    selected
        .face(
            Setup {
                stock,
                clearance_z: clearance_z_mm,
            },
            facing,
            cancelled,
        )
        .map_err(BridgeError::Planner)
}

/// Concrete experimental 3-axis milling calculations. Not a postprocessor.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum MillingJob<'a> {
    OutsideContour(Cut),
    RectangularPocket(Pocket),
    Drilling(Drilling<'a>),
}

/// Resolve the operation from the existing shared project records.
/// A contour or pocket uses the existing milling-tool library's feeds;
/// a drill uses an explicitly supplied feed and its drilling-tool geometry.
///
/// This only converts already work-aligned rectangular stock. There is no
/// 5-axis kinematics, CAD projection, fixture clearance, or NC verification.
pub fn milling_plan_operation(
    plan: &PlanDefinition,
    library: &ToolLibrary,
    operation_id: &str,
    clearance_z_mm: f64,
    request: MillingJob<'_>,
    cancelled: impl FnMut() -> bool,
) -> Result<Toolpath, BridgeError> {
    plan.validate().map_err(BridgeError::InvalidPlan)?;
    let op = plan
        .operations
        .iter()
        .find(|op| op.id == operation_id)
        .ok_or(BridgeError::UnknownOperation)?;
    let setup = plan
        .setups
        .iter()
        .find(|s| s.id == op.setup_id)
        .ok_or(BridgeError::UnknownOperation)?;
    let tool = plan
        .tools
        .iter()
        .find(|t| t.id == op.tool_id)
        .ok_or(BridgeError::UnknownOperation)?;
    let stock = match setup.stock {
        StockGeometry::Box { min_mm, max_mm } => StockBox {
            min: point(min_mm),
            max: point(max_mm),
        },
        _ => return Err(BridgeError::UnsupportedStock),
    };
    let setup = Setup { stock, clearance_z: clearance_z_mm };
    match (op.kind, request) {
        (OperationKind::Milling(MillingOperation::Contour2D), MillingJob::OutsideContour(mut cut)) => {
            let selected = select_flat_mill(tool, library)?;
            cut.cutting_feed_mm_min = selected.cutting_feed();
            cut.plunge_feed_mm_min = selected.plunge_feed();
            outside_contour_with_cancel(setup, selected.geometry(), cut, cancelled)
                .map_err(BridgeError::Planner)
        }
        (OperationKind::Milling(MillingOperation::Pocket2D), MillingJob::RectangularPocket(mut pocket)) => {
            let selected = select_flat_mill(tool, library)?;
            pocket.cut.cutting_feed_mm_min = selected.cutting_feed();
            pocket.cut.plunge_feed_mm_min = selected.plunge_feed();
            rectangular_pocket_with_cancel(setup, selected.geometry(), pocket, cancelled)
                .map_err(BridgeError::Planner)
        }
        (OperationKind::Milling(MillingOperation::Drilling), MillingJob::Drilling(drilling)) => {
            let bit = match tool.geometry {
                ToolGeometry::Milling {
                    kind: MillingToolKind::Drill,
                    diameter_mm,
                    flute_length_mm,
                    ..
                } => DrillBit { diameter_mm, flute_length_mm },
                _ => return Err(BridgeError::UnsupportedTool),
            };
            drill_points_with_cancel(setup, bit, drilling, cancelled).map_err(BridgeError::Planner)
        }
        _ => Err(BridgeError::WrongMillingOperation),
    }
}

fn select_flat_mill<'a>(
    tool: &super::tool::ToolDefinition,
    library: &'a ToolLibrary,
) -> Result<&'a crate::tools::MillingTool, BridgeError> {
    let (diameter, flute_length) = match tool.geometry {
        ToolGeometry::Milling {
            kind: MillingToolKind::FlatEndMill,
            diameter_mm,
            flute_length_mm,
            center_cutting: true,
            ..
        } => (diameter_mm, flute_length_mm),
        _ => return Err(BridgeError::UnsupportedTool),
    };
    let station = tool.station_number.ok_or(BridgeError::UnknownLibraryTool)?;
    let number = u16::try_from(station).map_err(|_| BridgeError::UnknownLibraryTool)?;
    let selected = library.get(number).ok_or(BridgeError::UnknownLibraryTool)?;
    let geometry = selected.geometry();
    if geometry.diameter != diameter || geometry.cutting_length != flute_length {
        return Err(BridgeError::ToolGeometryMismatch);
    }
    Ok(selected)
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used)]
    use super::*;
    use crate::domain::machine::{AxisMotion, AxisName, AxisSpec, MachineClass, MachineDefinition};
    use crate::domain::motion::Vec3;
    use crate::domain::plan::OperationDefinition;
    use crate::domain::setup::{SetupDefinition, WorkFrame};
    use crate::domain::tool::{ToolDefinition, ToolGeometry};
    use crate::tools::MillingTool;
    use crate::{FlatTool, Motion};

    fn fixture() -> (PlanDefinition, ToolLibrary, Facing) {
        let frame = WorkFrame::new(
            Vec3::new(0.0, 0.0, 0.0),
            Vec3::new(1.0, 0.0, 0.0),
            Vec3::new(0.0, 0.0, 1.0),
        )
        .unwrap();
        let plan = PlanDefinition {
            machines: vec![MachineDefinition {
                id: "mill".into(),
                class: MachineClass::Mill3,
                axes: vec![
                    AxisSpec {
                        name: AxisName::X,
                        motion: AxisMotion::LinearMm,
                        min: -100.0,
                        max: 100.0,
                    },
                    AxisSpec {
                        name: AxisName::Y,
                        motion: AxisMotion::LinearMm,
                        min: -100.0,
                        max: 100.0,
                    },
                    AxisSpec {
                        name: AxisName::Z,
                        motion: AxisMotion::LinearMm,
                        min: -100.0,
                        max: 100.0,
                    },
                ],
                turning_x_mode: None,
            }],
            tools: vec![ToolDefinition {
                id: "T1".into(),
                station_number: Some(1),
                geometry: ToolGeometry::Milling {
                    kind: MillingToolKind::FlatEndMill,
                    diameter_mm: 6.0,
                    flute_length_mm: 10.0,
                    overall_length_mm: 60.0,
                    center_cutting: true,
                },
            }],
            setups: vec![SetupDefinition {
                id: "S1".into(),
                machine_id: "mill".into(),
                work_offset: 1,
                frame,
                stock: StockGeometry::Box {
                    min_mm: Vec3::new(0.0, 0.0, 0.0),
                    max_mm: Vec3::new(20.0, 10.0, 5.0),
                },
            }],
            operations: vec![OperationDefinition {
                id: "OP1".into(),
                setup_id: "S1".into(),
                tool_id: "T1".into(),
                kind: OperationKind::Milling(MillingOperation::Facing),
            }],
        };
        let mut library = ToolLibrary::default();
        library
            .insert(
                MillingTool::new(
                    1,
                    "Flat tool".into(),
                    FlatTool {
                        diameter: 6.0,
                        cutting_length: 10.0,
                    },
                    650.0,
                    90.0,
                )
                .unwrap(),
            )
            .unwrap();
        let facing = Facing {
            bottom_z: 2.5,
            stepdown: 1.0,
            stepover: 3.0,
            cutting_feed: 10.0,
            plunge_feed: 10.0,
        };
        (plan, library, facing)
    }

    #[test]
    fn existing_facing_planner_and_library_are_reused() {
        let (plan, library, facing) = fixture();
        let toolpath = face_plan_operation(&plan, &library, "OP1", 10.0, facing, || false).unwrap();
        assert_eq!(toolpath.moves.len(), 60);
        assert_eq!(toolpath.moves[1].motion, Motion::Feed { mm_per_min: 90.0 },);
        assert_eq!(toolpath.moves[2].motion, Motion::Feed { mm_per_min: 650.0 },);
    }

    #[test]
    fn changed_library_geometry_is_not_silently_used() {
        let (plan, mut library, facing) = fixture();
        library
            .replace(
                MillingTool::new(
                    1,
                    "Wrong tool".into(),
                    FlatTool {
                        diameter: 8.0,
                        cutting_length: 10.0,
                    },
                    650.0,
                    90.0,
                )
                .unwrap(),
            )
            .unwrap();
        assert_eq!(
            face_plan_operation(&plan, &library, "OP1", 10.0, facing, || false).unwrap_err(),
            BridgeError::ToolGeometryMismatch,
        );
    }

    #[test]
    fn non_center_cutting_tool_is_refused() {
        let (mut plan, library, facing) = fixture();
        if let ToolGeometry::Milling {
            ref mut center_cutting,
            ..
        } = plan.tools[0].geometry
        {
            *center_cutting = false;
        }
        assert_eq!(
            face_plan_operation(&plan, &library, "OP1", 10.0, facing, || false).unwrap_err(),
            BridgeError::UnsupportedTool,
        );
    }

    #[test]
    fn cancel_propagates_without_partial_toolpaths() {
        let (plan, library, facing) = fixture();
        assert_eq!(
            face_plan_operation(&plan, &library, "OP1", 10.0, facing, || true).unwrap_err(),
            BridgeError::Planner(Error::Cancelled),
        );
    }
    #[test]
    fn contour_and_pocket_reuse_selected_mill_and_feed() {
        let (mut plan, library, facing) = fixture();
        let cut = Cut {
            bottom_z: facing.bottom_z,
            stepdown_mm: facing.stepdown,
            cutting_feed_mm_min: 1.0,
            plunge_feed_mm_min: 1.0,
        };
        plan.operations[0].kind = OperationKind::Milling(MillingOperation::Contour2D);
        let outside = milling_plan_operation(
            &plan, &library, "OP1", 10.0, MillingJob::OutsideContour(cut), || false,
        ).unwrap();
        assert_eq!(outside.depth_passes, 3);
        assert_eq!(outside.moves[2].motion, Motion::Feed { mm_per_min: 650.0 });
        assert_eq!(outside.moves[1].motion, Motion::Feed { mm_per_min: 90.0 });

        plan.operations[0].kind = OperationKind::Milling(MillingOperation::Pocket2D);
        let pocket = Pocket {
            rectangle: crate::milling::RectangleXY {
                min_x: 1.0, min_y: 1.0, max_x: 19.0, max_y: 9.0,
            },
            cut,
            stepover_mm: 3.0,
        };
        let path = milling_plan_operation(
            &plan, &library, "OP1", 10.0, MillingJob::RectangularPocket(pocket), || false,
        ).unwrap();
        assert_eq!(path.depth_passes, 3);
        assert_eq!(path.moves[1].motion, Motion::Feed { mm_per_min: 90.0 });
        assert_eq!(path.moves[2].motion, Motion::Feed { mm_per_min: 650.0 });
        assert_eq!(
            milling_plan_operation(&plan, &library, "OP1", 10.0, MillingJob::OutsideContour(cut), || false)
                .unwrap_err(),
            BridgeError::WrongMillingOperation,
        );
    }

    #[test]
    fn drilling_is_explicitly_matched_to_drill_tool() {
        let (mut plan, library, _) = fixture();
        plan.operations[0].kind = OperationKind::Milling(MillingOperation::Drilling);
        plan.tools[0].geometry = ToolGeometry::Milling {
            kind: MillingToolKind::Drill,
            diameter_mm: 4.0,
            flute_length_mm: 10.0,
            overall_length_mm: 60.0,
            center_cutting: true,
        };
        let points = [crate::milling::DrillPoint { x: 10.0, y: 5.0 }];
        let drill = Drilling {
            points: &points, bottom_z: 2.5, peck_mm: Some(1.0), feed_mm_min: 120.0,
        };
        let path = milling_plan_operation(
            &plan, &library, "OP1", 10.0, MillingJob::Drilling(drill), || false,
        ).unwrap();
        assert_eq!(path.depth_passes, 3);
        assert_eq!(path.moves.last().unwrap().to.z, 10.0);
        plan.tools[0].geometry = ToolGeometry::Milling {
            kind: MillingToolKind::FlatEndMill,
            diameter_mm: 4.0, flute_length_mm: 10.0,
            overall_length_mm: 60.0, center_cutting: true,
        };
        assert_eq!(
            milling_plan_operation(&plan, &library, "OP1", 10.0, MillingJob::Drilling(drill), || false)
                .unwrap_err(),
            BridgeError::UnsupportedTool,
        );
    }

}

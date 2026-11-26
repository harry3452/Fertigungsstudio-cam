//! Explicit adapter between validated multi-process records and the existing
//! bounded 3-axis rectangular facing planner.
//! This produces neutral, unverified paths; it never produces machine NC code.

use super::operation::{MillingOperation, OperationKind};
use super::plan::{PlanDefinition, PlanError};
use super::setup::StockGeometry;
use super::tool::{MillingToolKind, ToolGeometry};
use crate::tools::ToolLibrary;
use crate::{Error, Facing, Point3, Setup, StockBox, Toolpath};

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum BridgeError {
    InvalidPlan(PlanError),
    UnknownOperation,
    NotFacing,
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

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used)]
    use super::*;
    use crate::domain::machine::{
        AxisMotion, AxisName, AxisSpec, MachineClass, MachineDefinition,
    };
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
                    AxisSpec { name: AxisName::X, motion: AxisMotion::LinearMm, min: -100.0, max: 100.0 },
                    AxisSpec { name: AxisName::Y, motion: AxisMotion::LinearMm, min: -100.0, max: 100.0 },
                    AxisSpec { name: AxisName::Z, motion: AxisMotion::LinearMm, min: -100.0, max: 100.0 },
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
        let toolpath = face_plan_operation(
            &plan, &library, "OP1", 10.0, facing, || false,
        )
        .unwrap();
        assert_eq!(toolpath.moves.len(), 60);
        assert_eq!(
            toolpath.moves[1].motion,
            Motion::Feed { mm_per_min: 90.0 },
        );
        assert_eq!(
            toolpath.moves[2].motion,
            Motion::Feed { mm_per_min: 650.0 },
        );
    }

    #[test]
    fn changed_library_geometry_is_not_silently_used() {
        let (plan, mut library, facing) = fixture();
        library
            .replace(
                MillingTool::new(
                    1, "Wrong tool".into(),
                    FlatTool { diameter: 8.0, cutting_length: 10.0 },
                    650.0, 90.0,
                )
                .unwrap(),
            )
            .unwrap();
        assert_eq!(
            face_plan_operation(&plan, &library, "OP1", 10.0, facing, || false)
                .unwrap_err(),
            BridgeError::ToolGeometryMismatch,
        );
    }

    #[test]
    fn non_center_cutting_tool_is_refused() {
        let (mut plan, library, facing) = fixture();
        if let ToolGeometry::Milling { ref mut center_cutting, .. } = plan.tools[0].geometry {
            *center_cutting = false;
        }
        assert_eq!(
            face_plan_operation(&plan, &library, "OP1", 10.0, facing, || false)
                .unwrap_err(),
            BridgeError::UnsupportedTool,
        );
    }

    #[test]
    fn cancel_propagates_without_partial_toolpaths() {
        let (plan, library, facing) = fixture();
        assert_eq!(
            face_plan_operation(&plan, &library, "OP1", 10.0, facing, || true)
                .unwrap_err(),
            BridgeError::Planner(Error::Cancelled),
        );
    }
}

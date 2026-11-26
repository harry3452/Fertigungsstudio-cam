//! Non-persistent references tying machines, setups, tools and operations together.
//! The persisted project format is deliberately not defined in this first change.

use super::machine::{MachineClass, MachineDefinition, MachineError};
use super::operation::{MillingOperation, OperationKind, Process};
use super::setup::{SetupDefinition, SetupError};
use super::tool::{ToolDefinition, ToolError};

#[derive(Clone, Debug, PartialEq)]
pub struct OperationDefinition {
    pub id: String,
    pub setup_id: String,
    pub tool_id: String,
    pub kind: OperationKind,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct PlanDefinition {
    pub machines: Vec<MachineDefinition>,
    pub tools: Vec<ToolDefinition>,
    pub setups: Vec<SetupDefinition>,
    pub operations: Vec<OperationDefinition>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PlanError {
    DuplicateMachineId,
    DuplicateToolId,
    DuplicateSetupId,
    DuplicateOperationId,
    InvalidMachine(MachineError),
    InvalidTool(ToolError),
    InvalidSetup(SetupError),
    EmptyOperationId,
    UnknownMachine,
    UnknownSetup,
    UnknownTool,
    MachineDoesNotSupportProcess,
    ToolDoesNotSupportProcess,
    RequiresFiveAxisMill,
}

fn process_for_class(class: MachineClass) -> Process {
    match class {
        MachineClass::Mill3 | MachineClass::Mill5 => Process::Milling,
        MachineClass::Lathe => Process::Turning,
        MachineClass::Laser => Process::Laser,
    }
}

impl PlanDefinition {
    /// Cross-reference validation only. It does not verify toolpaths or stock/fixture clearance.
    pub fn validate(&self) -> Result<(), PlanError> {
        for (i, machine) in self.machines.iter().enumerate() {
            machine.validate().map_err(PlanError::InvalidMachine)?;
            if self.machines[..i].iter().any(|other| other.id == machine.id) {
                return Err(PlanError::DuplicateMachineId);
            }
        }
        for (i, tool) in self.tools.iter().enumerate() {
            tool.validate().map_err(PlanError::InvalidTool)?;
            if self.tools[..i].iter().any(|other| other.id == tool.id) {
                return Err(PlanError::DuplicateToolId);
            }
        }
        for (i, setup) in self.setups.iter().enumerate() {
            if self.setups[..i].iter().any(|other| other.id == setup.id) {
                return Err(PlanError::DuplicateSetupId);
            }
            let machine = self.machines.iter().find(|m| m.id == setup.machine_id)
                .ok_or(PlanError::UnknownMachine)?;
            setup.validate(machine).map_err(PlanError::InvalidSetup)?;
        }
        for (i, op) in self.operations.iter().enumerate() {
            if op.id.trim().is_empty() { return Err(PlanError::EmptyOperationId); }
            if self.operations[..i].iter().any(|other| other.id == op.id) {
                return Err(PlanError::DuplicateOperationId);
            }
            let setup = self.setups.iter().find(|s| s.id == op.setup_id)
                .ok_or(PlanError::UnknownSetup)?;
            let machine = self.machines.iter().find(|m| m.id == setup.machine_id)
                .ok_or(PlanError::UnknownMachine)?;
            let tool = self.tools.iter().find(|t| t.id == op.tool_id)
                .ok_or(PlanError::UnknownTool)?;
            if process_for_class(machine.class) != op.kind.process() {
                return Err(PlanError::MachineDoesNotSupportProcess);
            }
            if tool.geometry.process() != op.kind.process() {
                return Err(PlanError::ToolDoesNotSupportProcess);
            }
            if matches!(op.kind, OperationKind::Milling(
                MillingOperation::Indexed3Plus2 | MillingOperation::Simultaneous5Axis
            )) && machine.class != MachineClass::Mill5 {
                return Err(PlanError::RequiresFiveAxisMill);
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used)]
    use super::*;
    use super::super::machine::{AxisMotion, AxisName, AxisSpec, TurningXMode};
    use super::super::motion::Vec3;
    use super::super::operation::{LaserOperation, TurningOperation};
    use super::super::setup::{LinearAxis, StockGeometry, WorkFrame};
    use super::super::tool::{MillingToolKind, ToolGeometry, TurningToolKind};

    fn axis(name: AxisName) -> AxisSpec {
        AxisSpec {
            name, motion: match name {
                AxisName::X | AxisName::Y | AxisName::Z => AxisMotion::LinearMm,
                _ => AxisMotion::RotaryDeg,
            },
            min: -200.0, max: 200.0,
        }
    }

    fn frame() -> WorkFrame {
        WorkFrame::new(Vec3::new(0.0, 0.0, 0.0),
            Vec3::new(1.0, 0.0, 0.0), Vec3::new(0.0, 0.0, 1.0)).unwrap()
    }

    fn sample(class: MachineClass, op_kind: OperationKind, tool_geom: ToolGeometry) -> PlanDefinition {
        let axes = match class {
            MachineClass::Mill3 => vec![axis(AxisName::X), axis(AxisName::Y), axis(AxisName::Z)],
            MachineClass::Mill5 => vec![
                axis(AxisName::X), axis(AxisName::Y), axis(AxisName::Z),
                axis(AxisName::B), axis(AxisName::C),
            ],
            MachineClass::Lathe => vec![axis(AxisName::X), axis(AxisName::Z)],
            MachineClass::Laser => vec![axis(AxisName::X), axis(AxisName::Y)],
        };
        let stock = if class == MachineClass::Lathe {
            StockGeometry::Cylinder { base_center_mm: Vec3::new(0.0, 0.0, 0.0),
                axis: LinearAxis::Z, diameter_mm: 50.0, length_mm: 80.0 }
        } else {
            StockGeometry::Box { min_mm: Vec3::new(0.0, 0.0, -10.0),
                max_mm: Vec3::new(100.0, 100.0, 0.0) }
        };
        PlanDefinition {
            machines: vec![MachineDefinition {
                id: "M1".into(), class, axes,
                turning_x_mode: if class == MachineClass::Lathe { Some(TurningXMode::Diameter) } else { None },
            }],
            tools: vec![ToolDefinition {
                id: "T1".into(),
                station_number: if class == MachineClass::Laser { None } else { Some(1) },
                geometry: tool_geom,
            }],
            setups: vec![SetupDefinition {
                id: "S1".into(), machine_id: "M1".into(),
                work_offset: 1, frame: frame(), stock,
            }],
            operations: vec![OperationDefinition {
                id: "OP1".into(), setup_id: "S1".into(), tool_id: "T1".into(),
                kind: op_kind,
            }],
        }
    }

    fn mill_tool() -> ToolGeometry {
        ToolGeometry::Milling { kind: MillingToolKind::FlatEndMill,
            diameter_mm: 6.0, flute_length_mm: 20.0, overall_length_mm: 60.0,
            center_cutting: true }
    }

    #[test]
    fn valid_milling_turning_and_laser_plans() {
        assert!(sample(MachineClass::Mill3,
            OperationKind::Milling(MillingOperation::Facing), mill_tool()).validate().is_ok());
        assert!(sample(MachineClass::Mill5,
            OperationKind::Milling(MillingOperation::Simultaneous5Axis), mill_tool()).validate().is_ok());
        assert!(sample(MachineClass::Lathe,
            OperationKind::Turning(TurningOperation::Facing),
            ToolGeometry::Turning { kind: TurningToolKind::External,
                nose_radius_mm: 0.4, stickout_mm: 20.0 }).validate().is_ok());
        assert!(sample(MachineClass::Laser,
            OperationKind::Laser(LaserOperation::ProfileCut),
            ToolGeometry::Laser { kerf_mm: 0.2 }).validate().is_ok());
    }

    #[test]
    fn five_axis_operation_cannot_run_on_three_axis_machine() {
        let plan = sample(MachineClass::Mill3,
            OperationKind::Milling(MillingOperation::Indexed3Plus2), mill_tool());
        assert_eq!(plan.validate(), Err(PlanError::RequiresFiveAxisMill));
    }

    #[test]
    fn missing_references_and_tool_family_are_rejected() {
        let mut plan = sample(MachineClass::Mill3,
            OperationKind::Milling(MillingOperation::Facing), mill_tool());
        plan.operations[0].tool_id = "unregistered".into();
        assert_eq!(plan.validate(), Err(PlanError::UnknownTool));
        plan.operations[0].tool_id = "T1".into();
        plan.tools[0].geometry = ToolGeometry::Laser { kerf_mm: 0.1 };
        plan.tools[0].station_number = None;
        assert_eq!(plan.validate(), Err(PlanError::ToolDoesNotSupportProcess));
    }

    #[test]
    fn duplicate_stable_ids_are_rejected() {
        let mut plan = sample(MachineClass::Mill3,
            OperationKind::Milling(MillingOperation::Facing), mill_tool());
        plan.tools.push(plan.tools[0].clone());
        assert_eq!(plan.validate(), Err(PlanError::DuplicateToolId));
    }
}

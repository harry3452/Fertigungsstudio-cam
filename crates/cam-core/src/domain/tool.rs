//! Tool-library records shared by the three manufacturing families.
//! These are dimensions and identities, not cutting conditions or verified tool models.

use super::machine::MachineClass;
use super::operation::Process;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MillingToolKind {
    FlatEndMill,
    BallEndMill,
    Drill,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TurningToolKind {
    External,
    Internal,
    Grooving,
    Parting,
    Threading,
    Drill,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum ToolGeometry {
    Milling {
        kind: MillingToolKind,
        diameter_mm: f64,
        flute_length_mm: f64,
        overall_length_mm: f64,
        /// Required by the initial straight-plunge facing planner.
        center_cutting: bool,
    },
    Turning {
        kind: TurningToolKind,
        nose_radius_mm: f64,
        stickout_mm: f64,
    },
    Laser {
        /// Nominal kerf, not a calibrated material- and power-dependent result.
        kerf_mm: f64,
    },
}

impl ToolGeometry {
    pub fn process(self) -> Process {
        match self {
            Self::Milling { .. } => Process::Milling,
            Self::Turning { .. } => Process::Turning,
            Self::Laser { .. } => Process::Laser,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct ToolDefinition {
    pub id: String,
    pub station_number: Option<u32>,
    pub geometry: ToolGeometry,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ToolError {
    EmptyId,
    MissingStation,
    InvalidStation,
    InvalidDiameter,
    InvalidCuttingLength,
    InvalidOverallLength,
    CuttingLengthExceedsOverall,
    InvalidNoseRadius,
    InvalidStickout,
    InvalidKerf,
    IncompatibleMachine,
}

fn positive_length(value: f64) -> bool {
    value.is_finite() && value > 0.0 && value <= 1_000_000.0
}

impl ToolDefinition {
    pub fn validate(&self) -> Result<(), ToolError> {
        if self.id.trim().is_empty() {
            return Err(ToolError::EmptyId);
        }
        match self.station_number {
            Some(0) | Some(10_000..) => return Err(ToolError::InvalidStation),
            None if self.geometry.process() != Process::Laser => {
                return Err(ToolError::MissingStation);
            }
            _ => {}
        }
        match self.geometry {
            ToolGeometry::Milling {
                diameter_mm,
                flute_length_mm,
                overall_length_mm,
                ..
            } => {
                if !positive_length(diameter_mm) {
                    return Err(ToolError::InvalidDiameter);
                }
                if !positive_length(flute_length_mm) {
                    return Err(ToolError::InvalidCuttingLength);
                }
                if !positive_length(overall_length_mm) {
                    return Err(ToolError::InvalidOverallLength);
                }
                if flute_length_mm > overall_length_mm {
                    return Err(ToolError::CuttingLengthExceedsOverall);
                }
            }
            ToolGeometry::Turning {
                nose_radius_mm,
                stickout_mm,
                ..
            } => {
                if !nose_radius_mm.is_finite() || !(0.0..=1_000_000.0).contains(&nose_radius_mm) {
                    return Err(ToolError::InvalidNoseRadius);
                }
                if !positive_length(stickout_mm) {
                    return Err(ToolError::InvalidStickout);
                }
            }
            ToolGeometry::Laser { kerf_mm } => {
                if !positive_length(kerf_mm) {
                    return Err(ToolError::InvalidKerf);
                }
            }
        }
        Ok(())
    }

    pub fn validate_for_machine(&self, class: MachineClass) -> Result<(), ToolError> {
        self.validate()?;
        let matches = matches!(
            (self.geometry.process(), class),
            (Process::Milling, MachineClass::Mill3 | MachineClass::Mill5)
                | (Process::Turning, MachineClass::Lathe)
                | (Process::Laser, MachineClass::Laser)
        );
        if matches {
            Ok(())
        } else {
            Err(ToolError::IncompatibleMachine)
        }
    }
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used)]
    use super::*;

    fn mill() -> ToolDefinition {
        ToolDefinition {
            id: "T1".into(),
            station_number: Some(1),
            geometry: ToolGeometry::Milling {
                kind: MillingToolKind::FlatEndMill,
                diameter_mm: 6.0,
                flute_length_mm: 18.0,
                overall_length_mm: 60.0,
                center_cutting: true,
            },
        }
    }

    #[test]
    fn mill_tool_checks_dimensions_and_machine_family() {
        let mut tool = mill();
        assert!(tool.validate_for_machine(MachineClass::Mill5).is_ok());
        assert_eq!(
            tool.validate_for_machine(MachineClass::Lathe),
            Err(ToolError::IncompatibleMachine)
        );
        tool.geometry = ToolGeometry::Milling {
            kind: MillingToolKind::Drill,
            diameter_mm: 6.0,
            flute_length_mm: 61.0,
            overall_length_mm: 60.0,
            center_cutting: true,
        };
        assert_eq!(tool.validate(), Err(ToolError::CuttingLengthExceedsOverall));
    }

    #[test]
    fn stations_and_turning_geometry_are_checked() {
        let mut tool = ToolDefinition {
            id: "T0101".into(),
            station_number: Some(1),
            geometry: ToolGeometry::Turning {
                kind: TurningToolKind::External,
                nose_radius_mm: 0.4,
                stickout_mm: 30.0,
            },
        };
        assert!(tool.validate_for_machine(MachineClass::Lathe).is_ok());
        tool.station_number = None;
        assert_eq!(tool.validate(), Err(ToolError::MissingStation));
        tool.station_number = Some(1);
        tool.geometry = ToolGeometry::Turning {
            kind: TurningToolKind::External,
            nose_radius_mm: -0.4,
            stickout_mm: 30.0,
        };
        assert_eq!(tool.validate(), Err(ToolError::InvalidNoseRadius));
    }

    #[test]
    fn laser_geometry_does_not_require_a_tool_change_number() {
        let mut tool = ToolDefinition {
            id: "laser-head".into(),
            station_number: None,
            geometry: ToolGeometry::Laser { kerf_mm: 0.2 },
        };
        assert!(tool.validate_for_machine(MachineClass::Laser).is_ok());
        tool.geometry = ToolGeometry::Laser { kerf_mm: f64::NAN };
        assert_eq!(tool.validate(), Err(ToolError::InvalidKerf));
    }
}

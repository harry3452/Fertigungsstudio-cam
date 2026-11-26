//! Machine classes and axis requirements. Kinematics and collision checks are future work.

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum AxisName {
    X,
    Y,
    Z,
    A,
    B,
    C,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AxisMotion {
    LinearMm,
    RotaryDeg,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MachineClass {
    Mill3,
    Mill5,
    Lathe,
    Laser,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TurningXMode {
    Radius,
    Diameter,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct AxisSpec {
    pub name: AxisName,
    pub motion: AxisMotion,
    pub min: f64,
    pub max: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct MachineDefinition {
    pub id: String,
    pub class: MachineClass,
    pub axes: Vec<AxisSpec>,
    /// Required for a lathe; X output cannot be assumed to mean diameter.
    pub turning_x_mode: Option<TurningXMode>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MachineError {
    EmptyId,
    InvalidLimit(AxisName),
    InvalidAxisType(AxisName),
    DuplicateAxis(AxisName),
    MissingAxis(AxisName),
    MissingRotaryAxes,
    MissingTurningXMode,
    TurningModeOnNonLathe,
}

impl MachineDefinition {
    /// Validates the initial structural contract, not machine kinematics or safety.
    pub fn validate(&self) -> Result<(), MachineError> {
        if self.id.trim().is_empty() {
            return Err(MachineError::EmptyId);
        }
        for (i, axis) in self.axes.iter().enumerate() {
            if !axis.min.is_finite() || !axis.max.is_finite() || axis.min >= axis.max {
                return Err(MachineError::InvalidLimit(axis.name));
            }
            let expected = match axis.name {
                AxisName::X | AxisName::Y | AxisName::Z => AxisMotion::LinearMm,
                AxisName::A | AxisName::B | AxisName::C => AxisMotion::RotaryDeg,
            };
            if axis.motion != expected {
                return Err(MachineError::InvalidAxisType(axis.name));
            }
            if self.axes[..i].iter().any(|other| other.name == axis.name) {
                return Err(MachineError::DuplicateAxis(axis.name));
            }
        }
        let required: &[AxisName] = match self.class {
            MachineClass::Mill3 | MachineClass::Mill5 => &[AxisName::X, AxisName::Y, AxisName::Z],
            MachineClass::Lathe => &[AxisName::X, AxisName::Z],
            MachineClass::Laser => &[AxisName::X, AxisName::Y],
        };
        for &name in required {
            if !self.axes.iter().any(|axis| axis.name == name) {
                return Err(MachineError::MissingAxis(name));
            }
        }
        if self.class == MachineClass::Lathe && self.turning_x_mode.is_none() {
            return Err(MachineError::MissingTurningXMode);
        }
        if self.class != MachineClass::Lathe && self.turning_x_mode.is_some() {
            return Err(MachineError::TurningModeOnNonLathe);
        }
        if self.class == MachineClass::Mill5
            && self
                .axes
                .iter()
                .filter(|axis| axis.motion == AxisMotion::RotaryDeg)
                .count()
                < 2
        {
            return Err(MachineError::MissingRotaryAxes);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used)]
    use super::*;

    fn axis(name: AxisName) -> AxisSpec {
        let motion = match name {
            AxisName::X | AxisName::Y | AxisName::Z => AxisMotion::LinearMm,
            _ => AxisMotion::RotaryDeg,
        };
        AxisSpec {
            name,
            motion,
            min: -100.0,
            max: 100.0,
        }
    }

    #[test]
    fn three_axis_mill_needs_xyz() {
        let machine = MachineDefinition {
            id: "mill".into(),
            class: MachineClass::Mill3,
            axes: vec![axis(AxisName::X), axis(AxisName::Y)],
            turning_x_mode: None,
        };
        assert_eq!(
            machine.validate(),
            Err(MachineError::MissingAxis(AxisName::Z))
        );
    }

    #[test]
    fn five_axis_mill_needs_two_rotaries() {
        let mut machine = MachineDefinition {
            id: "mill5".into(),
            class: MachineClass::Mill5,
            axes: vec![
                axis(AxisName::X),
                axis(AxisName::Y),
                axis(AxisName::Z),
                axis(AxisName::B),
            ],
            turning_x_mode: None,
        };
        assert_eq!(machine.validate(), Err(MachineError::MissingRotaryAxes));
        machine.axes.push(axis(AxisName::C));
        assert!(machine.validate().is_ok());
    }

    #[test]
    fn lathe_requires_explicit_diameter_or_radius() {
        let mut machine = MachineDefinition {
            id: "lathe".into(),
            class: MachineClass::Lathe,
            axes: vec![axis(AxisName::X), axis(AxisName::Z)],
            turning_x_mode: None,
        };
        assert_eq!(machine.validate(), Err(MachineError::MissingTurningXMode));
        machine.turning_x_mode = Some(TurningXMode::Radius);
        assert!(machine.validate().is_ok());
    }

    #[test]
    fn duplicate_and_invalid_limits_are_refused() {
        let mut machine = MachineDefinition {
            id: "lathe".into(),
            class: MachineClass::Lathe,
            axes: vec![axis(AxisName::X), axis(AxisName::Z)],
            turning_x_mode: Some(TurningXMode::Diameter),
        };
        machine.axes.push(axis(AxisName::X));
        assert_eq!(
            machine.validate(),
            Err(MachineError::DuplicateAxis(AxisName::X))
        );
        machine.axes.pop();
        machine.axes[0].max = f64::INFINITY;
        assert_eq!(
            machine.validate(),
            Err(MachineError::InvalidLimit(AxisName::X))
        );
    }
}

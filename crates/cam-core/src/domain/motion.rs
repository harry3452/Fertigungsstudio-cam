//! Controller-neutral motion and process state contracts.
//! A neutral path is not a verified or executable NC program.

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Vec3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

impl Vec3 {
    pub fn new(x: f64, y: f64, z: f64) -> Self {
        Self { x, y, z }
    }
    pub fn is_finite(self) -> bool {
        self.x.is_finite() && self.y.is_finite() && self.z.is_finite()
    }
    pub fn length(self) -> f64 {
        self.x.hypot(self.y).hypot(self.z)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MotionError {
    NonFinite,
    InvalidDirection,
    InvalidFeed,
    InvalidPower,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ToolPose {
    /// Position in the active work coordinate frame, millimetres.
    pub position: Vec3,
    /// Unit-length tool-axis direction, for indexed and simultaneous machining.
    pub direction: Vec3,
}

impl ToolPose {
    pub fn new(position: Vec3, direction: Vec3) -> Result<Self, MotionError> {
        if !position.is_finite() || !direction.is_finite() {
            return Err(MotionError::NonFinite);
        }
        let length = direction.length();
        if !length.is_finite() || length <= 1e-12 {
            return Err(MotionError::InvalidDirection);
        }
        Ok(Self {
            position,
            direction: Vec3::new(
                direction.x / length,
                direction.y / length,
                direction.z / length,
            ),
        })
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum FeedRate {
    MillimetresPerMinute(f64),
    MillimetresPerRevolution(f64),
    InverseMinutes(f64),
}

impl FeedRate {
    pub fn validate(self) -> Result<(), MotionError> {
        let v = match self {
            Self::MillimetresPerMinute(v)
            | Self::MillimetresPerRevolution(v)
            | Self::InverseMinutes(v) => v,
        };
        if v.is_finite() && v > 0.0 {
            Ok(())
        } else {
            Err(MotionError::InvalidFeed)
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Motion {
    Rapid {
        to: ToolPose,
    },
    Linear {
        to: ToolPose,
        feed: FeedRate,
    },
    /// Arc semantics will be specified before NC output is implemented.
    Arc {
        to: ToolPose,
        center: Vec3,
        clockwise: bool,
        feed: FeedRate,
    },
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum ProcessCommand {
    SpindleOn { rpm: f64, clockwise: bool },
    SpindleOff,
    CoolantOn,
    CoolantOff,
    LaserOn { power: f64 },
    LaserOff,
}

impl ProcessCommand {
    /// Laser power is a normalized 0..=1 request, not a machine-controller word.
    pub fn validate(self) -> Result<(), MotionError> {
        match self {
            Self::SpindleOn { rpm, .. } if !rpm.is_finite() || rpm <= 0.0 => {
                Err(MotionError::InvalidFeed)
            }
            Self::LaserOn { power } if !power.is_finite() || !(0.0..=1.0).contains(&power) => {
                Err(MotionError::InvalidPower)
            }
            _ => Ok(()),
        }
    }
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used)]
    use super::*;

    #[test]
    fn tool_pose_normalizes_direction_and_rejects_nonfinite_values() {
        let p = ToolPose::new(Vec3::new(1.0, 2.0, 3.0), Vec3::new(0.0, 0.0, 5.0)).unwrap();
        assert_eq!(p.direction, Vec3::new(0.0, 0.0, 1.0));
        assert_eq!(
            ToolPose::new(Vec3::new(0.0, 0.0, 0.0), Vec3::new(0.0, 0.0, 0.0)),
            Err(MotionError::InvalidDirection)
        );
        assert_eq!(
            ToolPose::new(Vec3::new(f64::NAN, 0.0, 0.0), Vec3::new(0.0, 0.0, 1.0)),
            Err(MotionError::NonFinite)
        );
    }

    #[test]
    fn feed_units_are_explicit_and_positive() {
        assert!(FeedRate::MillimetresPerMinute(100.0).validate().is_ok());
        assert!(FeedRate::MillimetresPerRevolution(0.1).validate().is_ok());
        assert!(FeedRate::InverseMinutes(1.0).validate().is_ok());
        assert_eq!(
            FeedRate::MillimetresPerMinute(0.0).validate(),
            Err(MotionError::InvalidFeed)
        );
    }

    #[test]
    fn laser_power_does_not_allow_values_outside_normalized_range() {
        assert!(ProcessCommand::LaserOn { power: 1.0 }.validate().is_ok());
        assert_eq!(
            ProcessCommand::LaserOn { power: 1.1 }.validate(),
            Err(MotionError::InvalidPower)
        );
    }
}

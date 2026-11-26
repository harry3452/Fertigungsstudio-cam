//! Work frames, raw stock and setups. No machine collision or clearance proof.

use super::machine::{MachineDefinition, MachineError};
use super::motion::Vec3;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SetupError {
    NonFinite,
    InvalidAxis,
    NonOrthogonalAxes,
    EmptyId,
    MissingMachine,
    InvalidMachine(MachineError),
    InvalidWorkOffset,
    InvalidStock,
}

fn unit(v: Vec3) -> Option<Vec3> {
    let n = v.length();
    if !n.is_finite() || n <= 1e-12 { return None; }
    Some(Vec3::new(v.x / n, v.y / n, v.z / n))
}

fn dot(a: Vec3, b: Vec3) -> f64 {
    a.x * b.x + a.y * b.y + a.z * b.z
}

fn cross(a: Vec3, b: Vec3) -> Vec3 {
    Vec3::new(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x)
}

/// A right-handed orthonormal WCS frame built from an origin and X/Z hints.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct WorkFrame {
    origin_mm: Vec3,
    x: Vec3,
    y: Vec3,
    z: Vec3,
}

impl WorkFrame {
    pub fn new(origin_mm: Vec3, x_hint: Vec3, z_hint: Vec3) -> Result<Self, SetupError> {
        if !origin_mm.is_finite() || !x_hint.is_finite() || !z_hint.is_finite() {
            return Err(SetupError::NonFinite);
        }
        let z = unit(z_hint).ok_or(SetupError::InvalidAxis)?;
        let x_hint = unit(x_hint).ok_or(SetupError::InvalidAxis)?;
        let skew = dot(x_hint, z);
        // Only correct small numeric skew; materially non-orthogonal frames are invalid.
        if !skew.is_finite() || skew.abs() > 1e-3 { return Err(SetupError::NonOrthogonalAxes); }
        let x = unit(Vec3::new(
            x_hint.x - skew * z.x, x_hint.y - skew * z.y, x_hint.z - skew * z.z
        )).ok_or(SetupError::InvalidAxis)?;
        let y = unit(cross(z, x)).ok_or(SetupError::InvalidAxis)?;
        Ok(Self { origin_mm, x, y, z })
    }

    pub fn origin_mm(self) -> Vec3 { self.origin_mm }
    pub fn axes(self) -> (Vec3, Vec3, Vec3) { (self.x, self.y, self.z) }

    pub fn to_local(self, p: Vec3) -> Result<Vec3, SetupError> {
        if !p.is_finite() { return Err(SetupError::NonFinite); }
        let q = Vec3::new(p.x - self.origin_mm.x, p.y - self.origin_mm.y, p.z - self.origin_mm.z);
        Ok(Vec3::new(dot(q, self.x), dot(q, self.y), dot(q, self.z)))
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LinearAxis { X, Y, Z }

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum StockGeometry {
    Box { min_mm: Vec3, max_mm: Vec3 },
    /// Base centre and positive extent along a work-frame axis.
    Cylinder {
        base_center_mm: Vec3,
        axis: LinearAxis,
        diameter_mm: f64,
        length_mm: f64,
    },
    /// Rectangular sheet in the active work frame. Polygon sheets are future work.
    Sheet { min_mm: Vec3, max_mm: Vec3 },
}

impl StockGeometry {
    pub fn validate(self) -> Result<(), SetupError> {
        match self {
            Self::Box { min_mm, max_mm } | Self::Sheet { min_mm, max_mm } => {
                if !min_mm.is_finite() || !max_mm.is_finite() ||
                    min_mm.x >= max_mm.x || min_mm.y >= max_mm.y || min_mm.z >= max_mm.z {
                    Err(SetupError::InvalidStock)
                } else { Ok(()) }
            }
            Self::Cylinder { base_center_mm, diameter_mm, length_mm, .. } => {
                if !base_center_mm.is_finite() ||
                    !diameter_mm.is_finite() || !(0.0..=1_000_000.0).contains(&diameter_mm) ||
                    diameter_mm == 0.0 || !length_mm.is_finite() ||
                    !(0.0..=1_000_000.0).contains(&length_mm) || length_mm == 0.0 {
                    Err(SetupError::InvalidStock)
                } else { Ok(()) }
            }
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct SetupDefinition {
    pub id: String,
    /// Stable machine identifier, resolved against the machine library.
    pub machine_id: String,
    /// Standard WCS slot 1..=6. A post decides whether to output G54..G59.
    pub work_offset: u8,
    pub frame: WorkFrame,
    pub stock: StockGeometry,
}

impl SetupDefinition {
    pub fn validate(&self, machine: &MachineDefinition) -> Result<(), SetupError> {
        if self.id.trim().is_empty() { return Err(SetupError::EmptyId); }
        if self.machine_id != machine.id { return Err(SetupError::MissingMachine); }
        machine.validate().map_err(SetupError::InvalidMachine)?;
        if !(1..=6).contains(&self.work_offset) { return Err(SetupError::InvalidWorkOffset); }
        self.stock.validate()
    }
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used)]
    use super::*;
    use super::super::machine::{AxisMotion, AxisName, AxisSpec, MachineClass};

    fn laser() -> MachineDefinition {
        MachineDefinition {
            id: "laser-1".into(), class: MachineClass::Laser,
            axes: vec![
                AxisSpec { name: AxisName::X, motion: AxisMotion::LinearMm, min: 0.0, max: 1000.0 },
                AxisSpec { name: AxisName::Y, motion: AxisMotion::LinearMm, min: 0.0, max: 1000.0 },
            ],
            turning_x_mode: None,
        }
    }

    #[test]
    fn nearly_cardinal_work_frame_is_orthonormal() {
        let frame = WorkFrame::new(
            Vec3::new(10.0, 0.0, 0.0), Vec3::new(1.0, 0.0, 0.0),
            Vec3::new(0.00004, 0.0, 1.0),
        ).unwrap();
        let (x, y, z) = frame.axes();
        assert!(dot(x, z).abs() < 1e-12);
        assert!(dot(y, z).abs() < 1e-12);
        assert!(dot(x, y).abs() < 1e-12);
        assert!((x.length() - 1.0).abs() < 1e-12);
        let translated = frame.to_local(Vec3::new(10.0, 0.0, 0.0)).unwrap();
        assert_eq!(translated, Vec3::new(0.0, 0.0, 0.0));
    }

    #[test]
    fn skewed_work_frame_is_refused() {
        assert_eq!(
            WorkFrame::new(Vec3::new(0.0, 0.0, 0.0),
                Vec3::new(1.0, 0.0, 0.0), Vec3::new(1.0, 0.0, 1.0)),
            Err(SetupError::NonOrthogonalAxes)
        );
    }

    #[test]
    fn stock_and_wcs_are_checked() {
        let frame = WorkFrame::new(
            Vec3::new(0.0, 0.0, 0.0), Vec3::new(1.0, 0.0, 0.0),
            Vec3::new(0.0, 0.0, 1.0)
        ).unwrap();
        let mut setup = SetupDefinition {
            id: "Top".into(), machine_id: "laser-1".into(), work_offset: 1, frame,
            stock: StockGeometry::Sheet {
                min_mm: Vec3::new(0.0, 0.0, -3.0),
                max_mm: Vec3::new(100.0, 50.0, 0.0),
            },
        };
        assert!(setup.validate(&laser()).is_ok());
        setup.work_offset = 7;
        assert_eq!(setup.validate(&laser()), Err(SetupError::InvalidWorkOffset));
        setup.work_offset = 1;
        setup.stock = StockGeometry::Sheet {
            min_mm: Vec3::new(0.0, 0.0, 0.0),
            max_mm: Vec3::new(100.0, 50.0, 0.0),
        };
        assert_eq!(setup.validate(&laser()), Err(SetupError::InvalidStock));
    }

    #[test]
    fn round_stock_is_supported_for_turning() {
        let stock = StockGeometry::Cylinder {
            base_center_mm: Vec3::new(0.0, 0.0, 0.0),
            axis: LinearAxis::Z, diameter_mm: 50.0, length_mm: 120.0,
        };
        assert!(stock.validate().is_ok());
    }
}

//! Machining families are separate, so milling rules cannot silently govern laser or turning.

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Process {
    Milling,
    Turning,
    Laser,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MillingOperation {
    Facing,
    Contour2D,
    Pocket2D,
    Drilling,
    Indexed3Plus2,
    Simultaneous5Axis,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TurningOperation {
    Facing,
    Roughing,
    Finishing,
    Grooving,
    Parting,
    Boring,
    Drilling,
    Threading,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LaserOperation {
    ProfileCut,
    Engraving,
    Marking,
    Piercing,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OperationKind {
    Milling(MillingOperation),
    Turning(TurningOperation),
    Laser(LaserOperation),
}

impl OperationKind {
    pub fn process(self) -> Process {
        match self {
            Self::Milling(_) => Process::Milling,
            Self::Turning(_) => Process::Turning,
            Self::Laser(_) => Process::Laser,
        }
    }
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used)]
    use super::*;

    #[test]
    fn distinct_operation_families() {
        assert_eq!(
            OperationKind::Milling(MillingOperation::Simultaneous5Axis).process(),
            Process::Milling
        );
        assert_eq!(
            OperationKind::Turning(TurningOperation::Threading).process(),
            Process::Turning
        );
        assert_eq!(
            OperationKind::Laser(LaserOperation::ProfileCut).process(),
            Process::Laser
        );
    }
}

//! Original milling-tool library. UI/locale/persistence independent.
use crate::{Error, Facing, FacingTurn, FlatTool, Setup, Toolpath, face_with_turn, positive};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ToolError {
    InvalidNumber,
    InvalidName,
    InvalidGeometry,
    InvalidFeed,
    DuplicateNumber,
    MissingTool,
    Capacity,
}

#[derive(Debug, Clone)]
pub struct MillingTool {
    number: u16,
    name: String,
    geometry: FlatTool,
    cutting_feed: f64,
    plunge_feed: f64,
}

impl MillingTool {
    pub fn new(
        number: u16,
        name: String,
        geometry: FlatTool,
        cutting_feed: f64,
        plunge_feed: f64,
    ) -> Result<Self, ToolError> {
        if !(1..=9999).contains(&number) {
            return Err(ToolError::InvalidNumber);
        }
        if name.trim().is_empty() || name.chars().count() > 80 || name.chars().any(char::is_control)
        {
            return Err(ToolError::InvalidName);
        }
        if !positive(geometry.diameter) || !positive(geometry.cutting_length) {
            return Err(ToolError::InvalidGeometry);
        }
        if !positive(cutting_feed) || !positive(plunge_feed) {
            return Err(ToolError::InvalidFeed);
        }
        Ok(Self {
            number,
            name,
            geometry,
            cutting_feed,
            plunge_feed,
        })
    }
    pub fn number(&self) -> u16 {
        self.number
    }
    pub fn name(&self) -> &str {
        &self.name
    }
    pub fn geometry(&self) -> FlatTool {
        self.geometry
    }
    pub fn cutting_feed(&self) -> f64 {
        self.cutting_feed
    }
    pub fn plunge_feed(&self) -> f64 {
        self.plunge_feed
    }

    /// Tool feeds override the operation's placeholder feeds. No machine data is inferred.
    pub fn face(
        &self,
        setup: Setup,
        mut operation: Facing,
        cancelled: impl FnMut() -> bool,
    ) -> Result<Toolpath, Error> {
        operation.cutting_feed = self.cutting_feed;
        operation.plunge_feed = self.plunge_feed;
        face_with_turn(setup, self.geometry, operation, FacingTurn::Lift, cancelled)
    }

    /// An optional smooth-looking U-turn between successive raster rows.
    pub fn face_with_turn(
        &self,
        setup: Setup,
        mut operation: Facing,
        turn: FacingTurn,
        cancelled: impl FnMut() -> bool,
    ) -> Result<Toolpath, Error> {
        operation.cutting_feed = self.cutting_feed;
        operation.plunge_feed = self.plunge_feed;
        face_with_turn(setup, self.geometry, operation, turn, cancelled)
    }
}

#[derive(Debug, Default)]
pub struct ToolLibrary {
    tools: BTreeMap<u16, MillingTool>,
}
impl ToolLibrary {
    pub fn insert(&mut self, tool: MillingTool) -> Result<(), ToolError> {
        if self.tools.contains_key(&tool.number) {
            return Err(ToolError::DuplicateNumber);
        }
        if self.tools.len() >= 1024 {
            return Err(ToolError::Capacity);
        }
        self.tools.insert(tool.number, tool);
        Ok(())
    }
    pub fn replace(&mut self, tool: MillingTool) -> Result<(), ToolError> {
        if !self.tools.contains_key(&tool.number) {
            return Err(ToolError::MissingTool);
        }
        self.tools.insert(tool.number, tool);
        Ok(())
    }
    pub fn get(&self, number: u16) -> Option<&MillingTool> {
        self.tools.get(&number)
    }
    pub fn remove(&mut self, number: u16) -> Result<MillingTool, ToolError> {
        self.tools.remove(&number).ok_or(ToolError::MissingTool)
    }
    pub fn iter(&self) -> impl Iterator<Item = &MillingTool> {
        self.tools.values()
    }
}

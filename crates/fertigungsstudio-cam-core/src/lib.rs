//! Machine-independent building blocks for Fertigungsstudio CAM.
//! No cutting algorithms, posts, or executable NC programs exist in this crate yet.
#![forbid(unsafe_code)]

pub mod machine;
pub mod motion;
pub mod operation;

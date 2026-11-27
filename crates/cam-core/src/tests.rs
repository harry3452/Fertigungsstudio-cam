#![allow(clippy::unwrap_used)]

use super::*;

#[test]
fn tools_are_validated_and_library_updates_are_explicit() {
    use crate::tools::*;
    let (_, geometry, _) = fixture();
    let make = |number| MillingTool::new(number, "Flat mill".into(), geometry, 500.0, 100.0);
    assert_eq!(make(0).unwrap_err(), ToolError::InvalidNumber);
    assert_eq!(
        MillingTool::new(1, "\n".into(), geometry, 500.0, 100.0).unwrap_err(),
        ToolError::InvalidName
    );
    assert_eq!(
        MillingTool::new(1, "Tool".into(), geometry, f64::NAN, 100.0).unwrap_err(),
        ToolError::InvalidFeed
    );
    let mut library = ToolLibrary::default();
    library.insert(make(2).unwrap()).unwrap();
    library.insert(make(1).unwrap()).unwrap();
    assert_eq!(
        library.iter().map(MillingTool::number).collect::<Vec<_>>(),
        vec![1, 2]
    );
    assert_eq!(
        library.insert(make(2).unwrap()),
        Err(ToolError::DuplicateNumber)
    );
    assert_eq!(
        library.replace(make(3).unwrap()),
        Err(ToolError::MissingTool)
    );
    library.replace(make(2).unwrap()).unwrap();
    assert_eq!(library.get(2).unwrap().name(), "Flat mill");
    assert_eq!(library.remove(2).unwrap().number(), 2);
    assert!(library.get(2).is_none());
}

#[test]
fn selected_tool_controls_feeds_and_limits_depth() {
    use crate::tools::*;
    let (setup, geometry, op) = fixture();
    let tool = MillingTool::new(7, "Facing tool".into(), geometry, 650.0, 90.0).unwrap();
    let path = tool.face(setup, op, || false).unwrap();
    assert_eq!(path.moves[1].motion, Motion::Feed { mm_per_min: 90.0 });
    assert_eq!(path.moves[2].motion, Motion::Feed { mm_per_min: 650.0 });
    let short = MillingTool::new(
        7,
        "Short".into(),
        FlatTool {
            cutting_length: 1.0,
            ..geometry
        },
        650.0,
        90.0,
    )
    .unwrap();
    assert_eq!(
        short.face(setup, op, || false).unwrap_err(),
        Error::InvalidDepth
    );
}

#[test]
fn cancellation_discards_work_before_during_and_after_generation() {
    let (setup, tool, op) = fixture();
    let original = face(setup, tool, op).unwrap();
    let mut calls = 0;
    let completed = face_with_cancel(setup, tool, op, || {
        calls += 1;
        false
    })
    .unwrap();
    assert_eq!(completed.moves, original.moves);
    assert_eq!(calls, 17); // before allocation, 15 rows, before return
    for cancel_at in [1, 2, 8, 17] {
        let mut calls = 0;
        let result = face_with_cancel(setup, tool, op, || {
            calls += 1;
            calls >= cancel_at
        });
        assert_eq!(result.unwrap_err(), Error::Cancelled);
        assert_eq!(calls, cancel_at);
    }
}

#[test]
fn worker_can_read_shared_cancel_flag() {
    use std::sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    };
    let (setup, tool, op) = fixture();
    let flag = Arc::new(AtomicBool::new(true));
    let worker_flag = Arc::clone(&flag);
    let worker = std::thread::spawn(move || {
        face_with_cancel(setup, tool, op, || worker_flag.load(Ordering::Relaxed))
    });
    assert_eq!(worker.join().unwrap().unwrap_err(), Error::Cancelled);
}

fn fixture() -> (Setup, FlatTool, Facing) {
    (
        Setup {
            stock: StockBox {
                min: Point3 {
                    x: 0.0,
                    y: 0.0,
                    z: 0.0,
                },
                max: Point3 {
                    x: 20.0,
                    y: 10.0,
                    z: 5.0,
                },
            },
            clearance_z: 10.0,
        },
        FlatTool {
            diameter: 6.0,
            cutting_length: 10.0,
        },
        Facing {
            bottom_z: 2.5,
            stepdown: 1.0,
            stepover: 3.0,
            cutting_feed: 800.0,
            plunge_feed: 200.0,
        },
    )
}

#[test]
fn analytic_rectangle_has_full_coverage_and_exact_last_depth() {
    let (setup, tool, op) = fixture();
    let path = face(setup, tool, op).unwrap();
    assert_eq!(
        (path.depth_passes, path.rows_per_pass, path.moves.len()),
        (3, 5, 60)
    );
    let cuts: Vec<_> = path
        .moves
        .iter()
        .filter(|m| m.motion == Motion::Feed { mm_per_min: 800.0 })
        .collect();
    for (pass, expected_z) in [4.0, 3.0, 2.5].into_iter().enumerate() {
        for (row, expected_y) in [0.0, 2.5, 5.0, 7.5, 10.0].into_iter().enumerate() {
            assert_eq!(
                cuts[pass * 5 + row].to,
                Point3 {
                    x: 26.0,
                    y: expected_y,
                    z: expected_z
                }
            );
        }
    }
    // Independent footprint checks at corners and on a fine rectangle grid.
    for x in 0..=40 {
        for y in 0..=20 {
            let p = Point3 {
                x: x as f64 / 2.0,
                y: y as f64 / 2.0,
                z: 2.5,
            };
            assert!(
                cuts.iter()
                    .any(|m| m.to.z == p.z && (m.to.y - p.y).abs() <= 3.0)
            );
        }
    }
}

#[test]
fn rapids_never_traverse_at_cutting_height() {
    let (setup, tool, op) = fixture();
    let path = face(setup, tool, op).unwrap();
    let mut prev = path.start;
    for m in &path.moves {
        if m.motion == Motion::Rapid {
            if m.to.x != prev.x || m.to.y != prev.y {
                assert_eq!(prev.z, setup.clearance_z);
                assert_eq!(m.to.z, setup.clearance_z);
            } else {
                assert!(m.to.z >= prev.z);
            }
        }
        assert!(point_valid(m.to));
        assert!(m.to.z >= op.bottom_z);
        prev = m.to;
    }
    assert_eq!(prev.z, setup.clearance_z);
}

#[test]
fn invalid_and_unbounded_inputs_are_refused() {
    let (setup, tool, op) = fixture();
    for bad in [f64::NAN, f64::INFINITY, -1.0, 0.0] {
        assert_eq!(
            face(
                setup,
                FlatTool {
                    diameter: bad,
                    ..tool
                },
                op
            )
            .unwrap_err(),
            Error::InvalidTool
        );
        assert_eq!(
            face(
                setup,
                tool,
                Facing {
                    stepover: bad,
                    ..op
                }
            )
            .unwrap_err(),
            Error::InvalidStep
        );
        assert_eq!(
            face(
                setup,
                tool,
                Facing {
                    cutting_feed: bad,
                    ..op
                }
            )
            .unwrap_err(),
            Error::InvalidFeed
        );
    }
    assert_eq!(
        face(
            setup,
            tool,
            Facing {
                stepdown: f64::MIN_POSITIVE,
                ..op
            }
        )
        .unwrap_err(),
        Error::TooManyMoves
    );
    assert_eq!(
        face(
            setup,
            tool,
            Facing {
                bottom_z: -1.0,
                ..op
            }
        )
        .unwrap_err(),
        Error::InvalidDepth
    );
    assert_eq!(
        face(
            Setup {
                clearance_z: 5.0,
                ..setup
            },
            tool,
            op
        )
        .unwrap_err(),
        Error::InvalidClearance
    );
    assert_eq!(
        face(
            setup,
            FlatTool {
                cutting_length: 2.0,
                ..tool
            },
            op
        )
        .unwrap_err(),
        Error::InvalidDepth
    );
    assert_eq!(
        face(
            setup,
            tool,
            Facing {
                stepover: 3.1,
                ..op
            }
        )
        .unwrap_err(),
        Error::InvalidStep
    );
}

#[test]
fn translated_stock_uses_work_coordinates_and_single_pass_is_exact() {
    let (mut setup, tool, mut op) = fixture();
    setup.stock.min = Point3 {
        x: -100.0,
        y: 40.0,
        z: -20.0,
    };
    setup.stock.max = Point3 {
        x: -80.0,
        y: 50.0,
        z: -15.0,
    };
    setup.clearance_z = -10.0;
    op.bottom_z = -15.5;
    let path = face(setup, tool, op).unwrap();
    assert_eq!(path.depth_passes, 1);
    assert_eq!(
        path.start,
        Point3 {
            x: -106.0,
            y: 40.0,
            z: -10.0
        }
    );
    assert_eq!(
        path.moves[2].to,
        Point3 {
            x: -74.0,
            y: 40.0,
            z: -15.5
        }
    );
}

#[test]
fn tiny_positive_extents_do_not_produce_nonfinite_moves() {
    let (mut setup, tool, mut op) = fixture();
    setup.stock.min = Point3 {
        x: 0.0,
        y: 0.0,
        z: 0.0,
    };
    setup.stock.max = Point3 {
        x: 1.0,
        y: f64::from_bits(1),
        z: f64::from_bits(1),
    };
    setup.clearance_z = 1.0;
    op.bottom_z = 0.0;
    let path = face(setup, tool, op).unwrap();
    assert_eq!((path.depth_passes, path.rows_per_pass), (1, 2));
    assert!(path.moves.iter().all(|m| point_valid(m.to)));
}


#[test]
fn rounded_facing_stays_at_cutting_depth_and_reverses_tangentially() {
    let (setup, tool, op) = fixture();
    let path = face_with_turn(setup, tool, op, FacingTurn::Rounded, || false).unwrap();
    assert_eq!((path.depth_passes, path.rows_per_pass, path.moves.len()), (3, 5, 216));
    let per_pass = 72;
    for pass in 0..3 {
        let start = pass * per_pass;
        let expected_z = [4.0, 3.0, 2.5][pass];
        assert_eq!(path.moves[start].motion, Motion::Rapid);
        assert_eq!(path.moves[start + 1].to.z, expected_z);
        assert_eq!(path.moves[start + 2].to, Point3 { x: 26.0, y: 0.0, z: expected_z });
        // A 16-segment semicircle goes beyond the 6 mm exit offset and
        // comes back to the same X, now at the next row.
        assert!(path.moves[start + 3].to.x > 26.0);
        assert_eq!(path.moves[start + 18].to, Point3 { x: 26.0, y: 2.5, z: expected_z });
        assert_eq!(path.moves[start + 19].to, Point3 { x: -6.0, y: 2.5, z: expected_z });
        assert!(path.moves[start + 20].to.x < -6.0);
        // The curve stays entirely at the same depth; no intermediate lift.
        for move_item in &path.moves[start + 2..start + per_pass - 1] {
            assert_eq!(move_item.motion, Motion::Feed { mm_per_min: 800.0 });
            assert_eq!(move_item.to.z, expected_z);
        }
        assert_eq!(path.moves[start + per_pass - 1].motion, Motion::Rapid);
        assert_eq!(path.moves[start + per_pass - 1].to.z, setup.clearance_z);
    }
    let mut prev = path.start;
    for m in &path.moves {
        if m.motion == Motion::Rapid
            && (m.to.x != prev.x || m.to.y != prev.y)
        {
            assert_eq!(prev.z, setup.clearance_z);
            assert_eq!(m.to.z, setup.clearance_z);
        }
        assert!(point_valid(m.to));
        prev = m.to;
    }
    assert_eq!(prev.z, setup.clearance_z);
}

#[test]
fn rounded_turns_respect_depth_count_limits_cancel_and_coordinate_limits() {
    let (mut setup, tool, mut op) = fixture();
    assert_eq!(
        face_with_turn(
            setup,
            tool,
            Facing {
                stepover: f64::MIN_POSITIVE,
                ..op
            },
            FacingTurn::Rounded,
            || false
        ).unwrap_err(),
        Error::TooManyMoves
    );

    let mut calls = 0;
    let expected = face_with_turn(setup, tool, op, FacingTurn::Rounded, || {
        calls += 1;
        false
    }).unwrap();
    assert!(!expected.moves.is_empty());
    for at in [1, 2, 5, calls] {
        let mut n = 0;
        let res = face_with_turn(setup, tool, op, FacingTurn::Rounded, || {
            n += 1;
            n >= at
        });
        assert_eq!(res.unwrap_err(), Error::Cancelled);
    }

    setup.stock.max.x = 999_996.0;
    assert_eq!(
        face_with_turn(setup, tool, op, FacingTurn::Rounded, || false).unwrap_err(),
        Error::CoordinateLimit
    );

    setup.stock.max.x = 20.0;
    op.stepover = 2.0;
    let p = face_with_turn(setup, tool, op, FacingTurn::Rounded, || false).unwrap();
    assert_eq!(p.rows_per_pass, 6);
}

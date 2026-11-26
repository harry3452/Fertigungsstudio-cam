//! Local-only prototype bridge. Run with cargo run --example preview_server.
//! No filesystem writes, remote binding, arbitrary file serving or machine output.
use fertigungsstudio_cam_core::{Error, Facing, FlatTool, Motion, Point3, Setup, StockBox};
use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    sync::{
        Arc,
        atomic::{AtomicU64, AtomicUsize, Ordering},
    },
    time::Duration,
};

#[path = "preview_server/milling_routes.rs"]
mod milling_routes;

const PAGE: &str = include_str!("../../../prototype/fertigungsstudio-kacheln.html");
const LIVE: &str = include_str!("../../../prototype/live-preview.js");
const TOOL_STORAGE: &str = include_str!("../../../prototype/tool-storage.cjs");
const TOOL_UI: &str = include_str!("../../../prototype/tool-library-ui.js");

struct Request {
    method: String,
    path: String,
    host: String,
    origin: String,
    kind: String,
    body: String,
}

fn read_request(stream: &mut TcpStream) -> std::io::Result<Request> {
    let bad = || std::io::Error::new(std::io::ErrorKind::InvalidData, "Invalid HTTP request");
    let mut data = Vec::new();
    let mut buf = [0; 1024];
    let end = loop {
        let n = stream.read(&mut buf)?;
        if n == 0 {
            return Err(bad());
        }
        data.extend_from_slice(&buf[..n]);
        if let Some(i) = data.windows(4).position(|w| w == b"\r\n\r\n") {
            if i > 8192 {
                return Err(bad());
            }
            break i + 4;
        }
        if data.len() > 8192 {
            return Err(bad());
        }
    };
    let head = std::str::from_utf8(&data[..end]).map_err(|_| bad())?;
    let mut lines = head.split("\r\n");
    let first = lines.next().ok_or_else(bad)?;
    let words: Vec<_> = first.split_whitespace().collect();
    if words.len() != 3 || words[2] != "HTTP/1.1" {
        return Err(bad());
    }
    let mut req = Request {
        method: words[0].into(),
        path: words[1].into(),
        host: String::new(),
        origin: String::new(),
        kind: String::new(),
        body: String::new(),
    };
    let mut length = None;
    for line in lines.filter(|s| !s.is_empty()) {
        let (key, value) = line.split_once(':').ok_or_else(bad)?;
        let value = value.trim();
        match key.to_ascii_lowercase().as_str() {
            "host" => {
                if !req.host.is_empty() {
                    return Err(bad());
                }
                req.host = value.into();
            }
            "origin" => {
                if !req.origin.is_empty() {
                    return Err(bad());
                }
                req.origin = value.into();
            }
            "content-type" => req.kind = value.into(),
            "content-length" => {
                if length.is_some() {
                    return Err(bad());
                }
                length = Some(value.parse::<usize>().map_err(|_| bad())?);
            }
            "transfer-encoding" => return Err(bad()),
            _ => {}
        }
    }
    let length = length.unwrap_or(0);
    if length > 1024 {
        return Err(bad());
    }
    while data.len() < end + length {
        let n = stream.read(&mut buf)?;
        if n == 0 {
            return Err(bad());
        }
        data.extend_from_slice(&buf[..n]);
    }
    req.body = std::str::from_utf8(&data[end..end + length])
        .map_err(|_| bad())?
        .into();
    Ok(req)
}

fn respond(stream: &mut TcpStream, status: &str, kind: &str, body: &str) -> std::io::Result<()> {
    write!(
        stream,
        "HTTP/1.1 {status}\r\nContent-Type: {kind}; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nContent-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'\r\nConnection: close\r\n\r\n{body}",
        body.len()
    )
}

fn calculate(body: &str, cancelled: impl FnMut() -> bool) -> Result<String, String> {
    let mut values = body
        .split_whitespace()
        .map(str::parse::<f64>)
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "InvalidNumbers")?;
    if values.len() == 7 {
        values.extend([1.0, 20.0, 800.0, 200.0]);
    }
    let [
        width,
        length,
        height,
        depth,
        diameter,
        stepdown,
        stepover,
        number,
        cutting_length,
        cutting_feed,
        plunge_feed,
    ] = values.as_slice()
    else {
        return Err("ExpectedElevenNumbers".into());
    };
    if !number.is_finite() || *number < 1.0 || *number > 9999.0 || number.fract() != 0.0 {
        return Err("InvalidToolNumber".into());
    }
    if !depth.is_finite() || *depth <= 0.0 {
        return Err("InvalidDepth".into());
    }
    let setup = Setup {
        stock: StockBox {
            min: Point3 {
                x: 0.0,
                y: 0.0,
                z: 0.0,
            },
            max: Point3 {
                x: *width,
                y: *length,
                z: *height,
            },
        },
        clearance_z: height + 5.0,
    };
    let op = Facing {
        bottom_z: height - depth,
        stepdown: *stepdown,
        stepover: *stepover,
        cutting_feed: *cutting_feed,
        plunge_feed: *plunge_feed,
    };
    let selected = fertigungsstudio_cam_core::tools::MillingTool::new(
        *number as u16,
        format!("T{}", *number as u16),
        FlatTool {
            diameter: *diameter,
            cutting_length: *cutting_length,
        },
        *cutting_feed,
        *plunge_feed,
    )
    .map_err(|e| format!("{e:?}"))?;
    let p = selected
        .face(setup, op, cancelled)
        .map_err(|e| e.to_string())?;
    let mut out = format!(
        "{{\"format\":\"fertigungsstudio-facing-v1\",\"units\":\"mm\",\"stock\":{{\"min\":[0,0,0],\"max\":[{width},{length},{height}]}},\"tool_diameter\":{diameter},\"bottom_z\":{},\"clearance_z\":{},\"start\":[{},{},{}],\"moves\":[",
        op.bottom_z, setup.clearance_z, p.start.x, p.start.y, p.start.z
    );
    use std::fmt::Write as _;
    // Tool metadata travels with the result; no inference from current UI values.
    for (i, m) in p.moves.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        let kind = if m.motion == Motion::Rapid {
            "rapid"
        } else {
            "feed"
        };
        write!(
            out,
            "{{\"to\":[{},{},{}],\"motion\":\"{kind}\"}}",
            m.to.x, m.to.y, m.to.z
        )
        .map_err(|_| "FormatError")?;
    }
    write!(out,"],\"tool_number\":{number},\"cutting_length\":{cutting_length},\"cutting_feed\":{cutting_feed},\"plunge_feed\":{plunge_feed}}}").map_err(|_|"FormatError")?;
    Ok(out)
}

fn handle(stream: &mut TcpStream, host: &str, generation: &AtomicU64) -> std::io::Result<()> {
    stream.set_read_timeout(Some(Duration::from_secs(3)))?;
    stream.set_write_timeout(Some(Duration::from_secs(3)))?;
    let req = match read_request(stream) {
        Ok(r) => r,
        Err(_) => return respond(stream, "400 Bad Request", "text/plain", "InvalidRequest"),
    };
    if req.host != host {
        return respond(stream, "403 Forbidden", "text/plain", "InvalidHost");
    }
    if req.method == "GET" && req.path == "/" {
        let page = PAGE.replace("</html>", &format!("<script>{TOOL_STORAGE}</script><script>{LIVE}</script><script>{{{TOOL_UI}}}</script></html>"));
        return respond(stream, "200 OK", "text/html", &page);
    }
    if req.method != "POST"
        || req.origin != format!("http://{host}")
        || req.kind != "application/x-fertigungsstudio"
    {
        return respond(stream, "403 Forbidden", "text/plain", "SameOriginRequired");
    }
    if req.path == "/api/cancel" {
        generation.fetch_add(1, Ordering::Relaxed);
        return respond(stream, "200 OK", "text/plain", "Cancelled");
    }
    if !matches!(
        req.path.as_str(),
        "/api/facing" | "/api/contour" | "/api/pocket" | "/api/drilling"
    ) {
        return respond(stream, "404 Not Found", "text/plain", "NotFound");
    }
    let mine = generation.fetch_add(1, Ordering::Relaxed).wrapping_add(1);
    let result = if req.path == "/api/facing" {
        calculate(&req.body, || generation.load(Ordering::Relaxed) != mine)
    } else {
        milling_routes::calculate(&req.path, &req.body, || {
            generation.load(Ordering::Relaxed) != mine
        })
    };
    match result {
        Ok(json) if generation.load(Ordering::Relaxed) == mine => {
            respond(stream, "200 OK", "application/json", &json)
        }
        Ok(_) => respond(stream, "409 Conflict", "text/plain", "Cancelled"),
        Err(e) => respond(
            stream,
            if e == Error::Cancelled.to_string() {
                "409 Conflict"
            } else {
                "422 Unprocessable Entity"
            },
            "text/plain",
            &e,
        ),
    }
}

fn run() -> std::io::Result<()> {
    // Stable origin retains browser-local tools across normal restarts.
    let ephemeral = std::env::args().skip(1).any(|a| a == "--ephemeral");
    let listener = TcpListener::bind(if ephemeral {
        "127.0.0.1:0"
    } else {
        "127.0.0.1:47631"
    })?;
    let host = listener.local_addr()?.to_string();
    println!(
        "Fertigungsstudio local preview: http://{host}/\nStop with Ctrl+C. No CNC connection."
    );
    let generation = Arc::new(AtomicU64::new(0));
    let active = Arc::new(AtomicUsize::new(0));
    for stream in listener.incoming() {
        let mut stream = stream?;
        if active.fetch_add(1, Ordering::Relaxed) >= 8 {
            active.fetch_sub(1, Ordering::Relaxed);
            continue;
        }
        let active = Arc::clone(&active);
        let generation = Arc::clone(&generation);
        let host = host.clone();
        std::thread::spawn(move || {
            let _ = handle(&mut stream, &host, &generation);
            active.fetch_sub(1, Ordering::Relaxed);
        });
    }
    Ok(())
}

fn main() -> std::process::ExitCode {
    match run() {
        Ok(()) => std::process::ExitCode::SUCCESS,
        Err(e) => {
            let _ = writeln!(std::io::stderr(), "Preview server failed: {e}");
            std::process::ExitCode::FAILURE
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn calculate_valid_invalid_and_cancelled() {
        let json = calculate("20 10 5 2.5 6 1 3", || false).unwrap_or_default();
        assert!(json.contains("fertigungsstudio-facing-v1"));
        assert_eq!(json.matches("\"motion\"").count(), 60);
        assert!(calculate("bad", || false).is_err());
        assert!(calculate("20 10 5 -1 6 1 3", || false).is_err());
        assert_eq!(
            calculate("20 10 5 2.5 6 1 3", || true),
            Err("Cancelled".into())
        );
    }
}

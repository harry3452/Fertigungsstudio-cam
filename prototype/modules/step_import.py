#!/usr/bin/env python3
"""STEP -> binary STL preview using external Open CASCADE (OCP) installation.

Fertigungsstudio CAM independent helper, Apache-2.0.
The helper converts real STEP B-rep geometry; it does not generate NC code.
It has no arbitrary output paths: the caller supplies two fixed paths in a
private temporary directory. No subprocesses, scripts or STEP expressions run.
"""
import os
import sys
from pathlib import Path

MAX_INPUT = 8_000_000
MAX_OUTPUT = 8_000_000


def convert(source: Path, target: Path, topology_path: Path | None = None) -> tuple[int, int]:
    try:
        from OCP.STEPControl import STEPControl_Reader
        from OCP.IFSelect import IFSelect_RetDone
        from OCP.BRepMesh import BRepMesh_IncrementalMesh
        from OCP.BRepCheck import BRepCheck_Analyzer
        from OCP.StlAPI import StlAPI_Writer
        from OCP.TopAbs import TopAbs_FACE
        from OCP.TopExp import TopExp_Explorer
        from OCP.BRepBndLib import BRepBndLib
        from OCP.Bnd import Bnd_Box
    except ImportError as error:
        raise RuntimeError(
            "Open CASCADE fehlt. Python 3 und cadquery-ocp installieren: py -3 -m pip install cadquery-ocp"
        ) from error

    size = source.stat().st_size
    if not 1 <= size <= MAX_INPUT:
        raise ValueError("STEP-Datei ist leer oder größer als 8 MB.")
    # Reject non-STEP payloads before invoking native CAD code.
    with source.open("rb") as f:
        header = f.read(1024)
    if b"ISO-10303-21" not in header.upper():
        raise ValueError("Keine gültige STEP Part-21-Datei (ISO-10303-21).")

    reader = STEPControl_Reader()
    if reader.ReadFile(str(source)) != IFSelect_RetDone:
        raise ValueError("Open CASCADE konnte die STEP-Datei nicht lesen.")
    if reader.TransferRoots() < 1:
        raise ValueError("Keine übertragbare STEP-Geometrie gefunden.")
    shape = reader.OneShape()
    if shape.IsNull():
        raise ValueError("STEP-Datei enthält keine 3D-Geometrie.")
    count = 0
    explorer = TopExp_Explorer(shape, TopAbs_FACE)
    while explorer.More():
        count += 1
        if count > 50_000:
            raise ValueError("STEP-Modell enthält zu viele Flächen.")
        explorer.Next()
    if not count:
        raise ValueError("STEP-Modell enthält keine Flächen.")
    if not BRepCheck_Analyzer(shape).IsValid():
        raise ValueError("STEP-BRep-Geometrie ist ungültig oder nicht geschlossen.")
    bb = Bnd_Box()
    BRepBndLib.Add_s(shape, bb)
    xmin, ymin, zmin, xmax, ymax, zmax = bb.Get()
    extent = max(xmax-xmin, ymax-ymin, zmax-zmin)
    if not 0.00001 <= extent <= 100_000:
        raise ValueError("STEP-Modellabmessungen sind ungültig.")
    # Preview deflection: finer than 0.05 mm, but never smaller than 0.005 mm.
    # Exact analytic geometry is preserved in the original STEP bytes.
    mesh = BRepMesh_IncrementalMesh(shape, min(0.05, max(0.005, extent/3000.0)),
                                    False, 0.25, True)
    mesh.Perform()
    if not mesh.IsDone():
        raise ValueError("Die STEP-Flächen konnten nicht trianguliert werden.")
    writer = StlAPI_Writer()
    writer.ASCIIMode = False
    if not writer.Write(shape, str(target)):
        raise ValueError("STL-Vorschau konnte nicht erzeugt werden.")
    output = target.stat().st_size
    if output < 134 or output > MAX_OUTPUT or (output-84) % 50:
        raise ValueError("Die STL-Vorschau ist beschädigt oder größer als 8 MB.")
    if topology_path is not None:
        import json
        from step_topology import extract
        topology = extract(shape, target)
        topology_path.write_text(json.dumps(topology,ensure_ascii=False,separators=(',',':'),allow_nan=False),encoding='utf-8')
    return count, output


def main() -> int:
    if len(sys.argv) not in (3,4):
        print("Aufruf: step_import.py Eingabe.step Vorschau.stl [Topologie.json]", file=sys.stderr)
        return 2
    try:
        source, target = map(Path, sys.argv[1:3])
        convert(source, target, Path(sys.argv[3]) if len(sys.argv)==4 else None)
        return 0
    except Exception as error:
        print(str(error)[:500].replace("\n", " "), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

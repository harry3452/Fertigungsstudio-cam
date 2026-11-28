#!/usr/bin/env python3
"""STEP B-Rep conversion to STL preview and selectable CAD topology.
Independent Fertigungsstudio CAM helper. No NC output.
"""
import sys
from pathlib import Path
from OCP.STEPControl import STEPControl_Reader
from OCP.IFSelect import IFSelect_RetDone
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.BRepCheck import BRepCheck_Analyzer
from OCP.StlAPI import StlAPI_Writer
from OCP.TopAbs import TopAbs_FACE
from OCP.TopExp import TopExp_Explorer
from OCP.BRepBndLib import BRepBndLib
from OCP.Bnd import Bnd_Box

MAX_INPUT = 8_000_000
MAX_OUTPUT = 8_000_000

def convert(source: Path, target: Path, topology_path: Path | None = None):
    size = source.stat().st_size
    if not 1 <= size <= MAX_INPUT:
        raise ValueError("STEP-Datei ist leer oder groesser als 8 MB.")
    with source.open("rb") as stream:
        if b"ISO-10303-21" not in stream.read(1024).upper():
            raise ValueError("Keine gueltige STEP Part-21-Datei.")
    reader = STEPControl_Reader()
    if reader.ReadFile(str(source)) != IFSelect_RetDone:
        raise ValueError("Open CASCADE konnte STEP nicht lesen.")
    if reader.TransferRoots() < 1:
        raise ValueError("Keine uebertragbare STEP-Geometrie.")
    shape = reader.OneShape()
    if shape.IsNull():
        raise ValueError("Keine 3D-Geometrie.")
    faces = 0
    explorer = TopExp_Explorer(shape, TopAbs_FACE)
    while explorer.More():
        faces += 1
        if faces > 50000:
            raise ValueError("Zu viele STEP-Flaechen.")
        explorer.Next()
    if not faces or not BRepCheck_Analyzer(shape).IsValid():
        raise ValueError("STEP-BRep-Geometrie ungueltig.")
    bb = Bnd_Box()
    BRepBndLib.Add_s(shape, bb)
    xmin, ymin, zmin, xmax, ymax, zmax = bb.Get()
    extent = max(xmax-xmin, ymax-ymin, zmax-zmin)
    if not 0.00001 <= extent <= 100000:
        raise ValueError("STEP-Modellabmessungen ungueltig.")
    mesh = BRepMesh_IncrementalMesh(shape, min(0.05,max(0.005, extent/3000.0)), False, 0.25, True)
    mesh.Perform()
    if not mesh.IsDone():
        raise ValueError("STEP konnte nicht trianguliert werden.")
    writer = StlAPI_Writer()
    writer.ASCIIMode = False
    if not writer.Write(shape, str(target)):
        raise ValueError("Vorschau konnte nicht erzeugt werden.")
    length = target.stat().st_size
    if length < 134 or length > MAX_OUTPUT or (length-84)%50:
        raise ValueError("Vorschau ungueltig oder zu gross.")
    if topology_path:
        import json
        from step_topology import extract
        t = extract(shape, target)
        topology_path.write_text(json.dumps(t,ensure_ascii=False,separators=(",",":"),allow_nan=False),encoding="utf-8")
    return faces,length

def main():
    if len(sys.argv) not in (3,4):
        print("Aufruf: fst-step-import Eingabe.step Vorschau.stl [Topologie.json]",file=sys.stderr)
        return 2
    try:
        convert(Path(sys.argv[1]),Path(sys.argv[2]),Path(sys.argv[3]) if len(sys.argv)==4 else None)
        return 0
    except Exception as exc:
        print(str(exc)[:500].replace("\n"," "),file=sys.stderr)
        return 1

if __name__ == "__main__":
    raise SystemExit(main())

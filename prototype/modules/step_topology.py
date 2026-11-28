"""Extract selectable Open CASCADE STEP B-Rep faces and planar wires.

Identifiers are stable within the imported STEP shape and its stored topology
snapshot, not persistent topology names across a change to the source CAD file.
The points attached to wires are a DISPLAY / 2.5D path approximation;
underlying geometry types, analytic values and face/wire IDs are preserved.
Apache-2.0, independently authored for Fertigungsstudio CAM.
"""
import math
import json
import struct
from pathlib import Path

MAX_FACES = 2000
MAX_TRIANGLES = 25000
MAX_WIRES = 4000
MAX_POINTS = 40000
MAX_JSON = 4_000_000


def roundvec(p):
    return [round(float(x), 9) for x in p]


def extract(shape, preview_path: Path):
    from OCP.TopAbs import TopAbs_FACE, TopAbs_WIRE, TopAbs_EDGE, TopAbs_REVERSED
    from OCP.TopExp import TopExp, TopExp_Explorer
    from OCP.TopoDS import TopoDS
    from OCP.TopTools import TopTools_IndexedMapOfShape
    from OCP.TopLoc import TopLoc_Location
    from OCP.BRep import BRep_Tool
    from OCP.BRepAdaptor import BRepAdaptor_Surface, BRepAdaptor_Curve
    from OCP.BRepTools import BRepTools_WireExplorer
    from OCP.GeomAbs import GeomAbs_Plane, GeomAbs_Line, GeomAbs_Circle

    # Normalize to the actual float32 STL preview bounds. The browser uses
    # exactly these bounds, which avoids a CAD/STL tolerance misalignment.
    data = preview_path.read_bytes()
    if len(data) < 134 or (len(data) - 84) % 50 or struct.unpack_from('<I', data, 80)[0] * 50 + 84 != len(data):
        raise ValueError('STEP-Vorschau hat ein ungültiges STL-Format.')
    meshmin = [math.inf] * 3
    for offset in range(84, len(data), 50):
        for i in range(3):
            x, y, z = struct.unpack_from('<fff', data, offset + 12 + i * 12)
            for k, val in enumerate((x, y, z)):
                meshmin[k] = min(meshmin[k], val)
    if not all(math.isfinite(x) for x in meshmin):
        raise ValueError('STEP-Vorschaudaten enthalten ungültige Punkte.')
    def local(p):
        return [round(float(v) - meshmin[i], 9) for i, v in enumerate(p)]

    faces_map = TopTools_IndexedMapOfShape()
    edges_map = TopTools_IndexedMapOfShape()
    TopExp.MapShapes_s(shape, TopAbs_FACE, faces_map)
    TopExp.MapShapes_s(shape, TopAbs_EDGE, edges_map)
    if not 1 <= faces_map.Extent() <= MAX_FACES:
        raise ValueError('Zu viele STEP-Flächen für die präzise Auswahl.')
    faces = []
    wires = []
    ntri = 0
    npoints = 0
    for face_index in range(1, faces_map.Extent() + 1):
        face = TopoDS.Face_s(faces_map.FindKey(face_index))
        surface = BRepAdaptor_Surface(face)
        plane = surface.GetType() == GeomAbs_Plane
        normal = None
        z = None
        if plane:
            pl = surface.Plane()
            n = list(pl.Axis().Direction().Coord())
            if face.Orientation() == TopAbs_REVERSED:
                n = [-v for v in n]
            normal = roundvec(n)
            if abs(n[0]) < 1e-7 and abs(n[1]) < 1e-7 and abs(abs(n[2])-1) < 1e-7:
                z = local(pl.Location().Coord())[2]
        location = TopLoc_Location()
        tri = BRep_Tool.Triangulation_s(face, location)
        tris = []
        if tri is not None:
            transform = location.Transformation()
            if tri.NbTriangles() > MAX_TRIANGLES - ntri:
                raise ValueError('STEP-Modell hat zu viele Vorschau-Dreiecke.')
            for ix in range(1, tri.NbTriangles()+1):
                ixes = tri.Triangle(ix).Get()
                ps = [local(tri.Node(k).Transformed(transform).Coord()) for k in ixes]
                tris.append(ps)
            ntri += len(tris)
        face_id = f'F{face_index}'
        face_wires = []
        expl = TopExp_Explorer(face, TopAbs_WIRE)
        while expl.More():
            if len(wires) >= MAX_WIRES:
                raise ValueError('STEP-Modell hat zu viele Kantenringe.')
            wire = TopoDS.Wire_s(expl.Current())
            edge_walk = BRepTools_WireExplorer(wire)
            ring = []
            segments = []
            while edge_walk.More():
                edge = TopoDS.Edge_s(edge_walk.Current())
                curve = BRepAdaptor_Curve(edge)
                a, b = curve.FirstParameter(),curve.LastParameter()
                if not math.isfinite(a) or not math.isfinite(b) or a==b:
                    raise ValueError('STEP-Kurve ist nicht endlich parametrisiert.')
                curve_type = curve.GetType()
                if curve_type == GeomAbs_Line:
                    steps = 1
                    kind = 'line'
                elif curve_type == GeomAbs_Circle:
                    cir = curve.Circle()
                    steps = min(192,max(24, math.ceil(abs(b-a)*max(cir.Radius(),1)/0.18)))
                    kind = 'circle'
                else:
                    steps = 64
                    kind = 'other'
                points = [local(curve.Value(a+(b-a)*i/steps).Coord()) for i in range(steps+1)]
                if edge.Orientation() == TopAbs_REVERSED:
                    points.reverse()
                if ring and math.dist(ring[-1],points[0]) > 0.0001:
                    raise ValueError('STEP-Wire enthält eine offene oder nicht verbundene Kante.')
                ring.extend(points if not ring else points[1:])
                eid = edges_map.FindIndex(edge)
                if eid < 1:
                    raise ValueError('STEP-Kante konnte nicht zugeordnet werden.')
                meta = {'id':f'E{eid}', 'kind':kind}
                if kind == 'circle':
                    cir=curve.Circle()
                    meta['center'] = local(cir.Location().Coord())
                    meta['radius'] = round(cir.Radius(),9)
                segments.append(meta)
                npoints += len(points)
                if npoints>MAX_POINTS:
                    raise ValueError('STEP-Konturen sind zu umfangreich für diese Testversion.')
                edge_walk.Next()
            if ring and math.dist(ring[0],ring[-1]) < 0.0001:
                ring.pop()
            # Closed, planar, horizontal B-rep wire, safe for 2.5D contour picking.
            xy = len(ring)>=3 and max(p[2] for p in ring)-min(p[2] for p in ring)<0.00002
            wid=f'{face_id}-W{len(face_wires)+1}'
            entity={'id':wid,'faceId':face_id,'edgeIds':[s['id'] for s in segments],
                    'segments':segments,'points':ring,'horizontal':bool(xy),
                    'z':round(ring[0][2],9) if xy else None}
            wires.append(entity)
            face_wires.append(wid)
            expl.Next()
        faces.append({'id':face_id,'surface':'plane' if plane else 'other',
                      'normal':normal,'z':z,'triangles':tris,'wireIds':face_wires})
    doc={'format':'fertigungsstudio-step-topology-v1','source':'occt-brep',
         'meshMin':roundvec(meshmin),'faces':faces,'wires':wires,
         'note':'CAD-Topologie exakt identifiziert; Kurvenpunkte sind approximiert, kein NC-Code.'}
    encoded=json.dumps(doc,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode('utf-8')
    if len(encoded)>MAX_JSON:
        raise ValueError('STEP-Topologie überschreitet 4 MB.')
    return doc

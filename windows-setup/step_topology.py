"""STEP OCCT B-Rep face and planar wire extraction.
Topology IDs are stable only for the saved snapshot of the imported shape.
"""
import json, math, struct
from pathlib import Path
MAX_FACES=2000
MAX_TRIANGLES=25000
MAX_WIRES=4000
MAX_POINTS=40000
MAX_JSON=4000000
def roundvec(p): return [round(float(x),9) for x in p]
def extract(shape, preview_path:Path):
    from OCP.TopAbs import TopAbs_FACE,TopAbs_WIRE,TopAbs_EDGE,TopAbs_REVERSED
    from OCP.TopExp import TopExp,TopExp_Explorer
    from OCP.TopoDS import TopoDS
    from OCP.TopTools import TopTools_IndexedMapOfShape
    from OCP.TopLoc import TopLoc_Location
    from OCP.BRep import BRep_Tool
    from OCP.BRepAdaptor import BRepAdaptor_Surface,BRepAdaptor_Curve
    from OCP.BRepTools import BRepTools_WireExplorer
    from OCP.GeomAbs import GeomAbs_Plane,GeomAbs_Line,GeomAbs_Circle
    data=preview_path.read_bytes()
    if len(data)<134 or (len(data)-84)%50 or struct.unpack_from('<I',data,80)[0]*50+84!=len(data):
        raise ValueError('STEP-Vorschau hat ein ungueltiges STL-Format.')
    meshmin=[math.inf]*3
    for offset in range(84,len(data),50):
        for i in range(3):
            p=struct.unpack_from('<fff',data,offset+12+i*12)
            for k,v in enumerate(p): meshmin[k]=min(meshmin[k],v)
    if not all(math.isfinite(x) for x in meshmin):raise ValueError('Ungueltige Vorschaupunkte.')
    def local(p): return [round(float(v)-meshmin[i],9) for i,v in enumerate(p)]
    fmap=TopTools_IndexedMapOfShape()
    emap=TopTools_IndexedMapOfShape()
    TopExp.MapShapes_s(shape,TopAbs_FACE,fmap)
    TopExp.MapShapes_s(shape,TopAbs_EDGE,emap)
    if not 1<=fmap.Extent()<=MAX_FACES:raise ValueError('Zu viele STEP-Flaechen.')
    faces=[];wires=[];ntri=0;npoints=0
    for fi in range(1,fmap.Extent()+1):
        face=TopoDS.Face_s(fmap.FindKey(fi))
        surface=BRepAdaptor_Surface(face)
        plane=surface.GetType()==GeomAbs_Plane
        normal=None;z=None
        if plane:
            pl=surface.Plane()
            n=list(pl.Axis().Direction().Coord())
            if face.Orientation()==TopAbs_REVERSED:n=[-v for v in n]
            normal=roundvec(n)
            if abs(n[0])<1e-7 and abs(n[1])<1e-7 and abs(abs(n[2])-1)<1e-7:
                z=local(pl.Location().Coord())[2]
        loc=TopLoc_Location()
        tri=BRep_Tool.Triangulation_s(face,loc)
        tris=[]
        if tri is not None:
            transf=loc.Transformation()
            if tri.NbTriangles()>MAX_TRIANGLES-ntri:raise ValueError('Zu viele STEP-Dreiecke.')
            for ix in range(1,tri.NbTriangles()+1):
                indexes=tri.Triangle(ix).Get()
                tris.append([local(tri.Node(k).Transformed(transf).Coord()) for k in indexes])
            ntri+=len(tris)
        fid=f'F{fi}'
        fw=[]
        expl=TopExp_Explorer(face,TopAbs_WIRE)
        while expl.More():
            if len(wires)>=MAX_WIRES:raise ValueError('Zu viele STEP-Kantenringe.')
            wire=TopoDS.Wire_s(expl.Current())
            walk=BRepTools_WireExplorer(wire)
            ring=[];segs=[]
            while walk.More():
                edge=TopoDS.Edge_s(walk.Current())
                curve=BRepAdaptor_Curve(edge)
                a,b=curve.FirstParameter(),curve.LastParameter()
                if not math.isfinite(a) or not math.isfinite(b) or a==b:
                    raise ValueError('STEP-Kurve nicht endlich parametrisiert.')
                ct=curve.GetType()
                if ct==GeomAbs_Line:
                    steps=1;kind='line'
                elif ct==GeomAbs_Circle:
                    cir=curve.Circle()
                    steps=min(192,max(24,math.ceil(abs(b-a)*max(cir.Radius(),1)/0.18)))
                    kind='circle'
                else:
                    steps=64;kind='other'
                points=[local(curve.Value(a+(b-a)*i/steps).Coord()) for i in range(steps+1)]
                if edge.Orientation()==TopAbs_REVERSED:points.reverse()
                if ring and math.dist(ring[-1],points[0])>0.0001:
                    raise ValueError('Offene STEP-Kante.')
                ring.extend(points if not ring else points[1:])
                eid=emap.FindIndex(edge)
                if eid<1:raise ValueError('STEP-Kante nicht zugeordnet.')
                meta={'id':f'E{eid}','kind':kind}
                if kind=='circle':
                    cir=curve.Circle()
                    meta['center']=local(cir.Location().Coord())
                    meta['radius']=round(cir.Radius(),9)
                segs.append(meta)
                npoints+=len(points)
                if npoints>MAX_POINTS:raise ValueError('Zu viele STEP-Konturpunkte.')
                walk.Next()
            if ring and math.dist(ring[0],ring[-1])<0.0001:ring.pop()
            xy=len(ring)>=3 and max(p[2] for p in ring)-min(p[2] for p in ring)<0.00002
            wid=f'{fid}-W{len(fw)+1}'
            wires.append({'id':wid,'faceId':fid,'edgeIds':[s['id'] for s in segs],
                          'segments':segs,'points':ring,'horizontal':bool(xy),
                          'z':round(ring[0][2],9) if xy else None})
            fw.append(wid)
            expl.Next()
        faces.append({'id':fid,'surface':'plane' if plane else 'other',
                      'normal':normal,'z':z,'triangles':tris,'wireIds':fw})
    doc={'format':'fertigungsstudio-step-topology-v1','source':'occt-brep',
         'meshMin':roundvec(meshmin),'faces':faces,'wires':wires,
         'note':'CAD-Topologie exakt identifiziert; Fahrsegmente angenaehert, kein NC-Code.'}
    if len(json.dumps(doc,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode('utf-8'))>MAX_JSON:
        raise ValueError('STEP-Topologie groesser als 4 MB.')
    return doc

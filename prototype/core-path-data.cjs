// Original interchange validator. Drawing checks are not collision certification.
(function(root) {
  function validate(d) {
    const finite = n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1000000;
    const point = p => Array.isArray(p) && p.length === 3 && p.every(finite);
    if (!d || d.units !== 'mm') throw Error('Unbekanntes Bahnformat oder Einheit.');
    if (d.format === 'fertigungsstudio-facing-v1') {
      if (d.operation !== undefined && d.operation !== 'facing') throw Error('Falsche Operationskennung.');
    } else if (d.format === 'fertigungsstudio-toolpath-v1') {
      if (!['contour','pocket','drilling'].includes(d.operation)) throw Error('Unbekannte Bearbeitung.');
    } else {
      throw Error('Unbekanntes Bahnformat.');
    }
    if (!d.stock || !point(d.stock.min) || !point(d.stock.max) || !d.stock.max.every((v,i)=>v>d.stock.min[i])) throw Error('Ungültiges Rohteil.');
    if (!finite(d.tool_diameter) || d.tool_diameter <= 0 || !finite(d.bottom_z) || !finite(d.clearance_z) || d.clearance_z<=d.stock.max[2] || d.bottom_z<d.stock.min[2] || d.bottom_z>=d.stock.max[2]) throw Error('Ungültiges Werkzeug oder Höhen.');
    if(d.tool_number!==undefined&&(!Number.isInteger(d.tool_number)||d.tool_number<1||d.tool_number>9999))throw Error('Ungültige Werkzeugnummer.');
    for(const key of ['cutting_length','cutting_feed','plunge_feed'])if(d[key]!==undefined&&(!finite(d[key])||d[key]<=0))throw Error('Ungültige Werkzeugdaten.');
    if (!point(d.start) || d.start[2] !== d.clearance_z || !Array.isArray(d.moves) || d.moves.length<1 || d.moves.length>100000) throw Error('Ungültiger Start oder zu viele Bewegungen.');
    let prev=d.start;
    for (const m of d.moves) {
      if (!m || !point(m.to) || !['rapid','feed'].includes(m.motion) || m.to[2]<d.bottom_z || m.to[2]>d.clearance_z) throw Error('Ungültige Bewegung.');
      if (m.motion==='rapid' && ((m.to[0]!==prev[0] || m.to[1]!==prev[1]) ? (prev[2]!==d.clearance_z || m.to[2]!==d.clearance_z) : m.to[2]<prev[2])) throw Error('Ungültige Eilganghöhe.');
      prev=m.to;
    }
    if (prev[2]!==d.clearance_z) throw Error('Rückzug am Bahnende fehlt.');

    // WCS metadata is optional but, when present, must mathematically match
    // the validated local Rust path (including directions and all motions).
    if(d.work_coordinates!==undefined){
      const w=d.work_coordinates;
      if(!w||!['G54','G55','G56','G57','G58','G59'].includes(w.system)
        ||!point(w.origin_local)||![0,90,180,270].includes(w.rotation_degrees)
        ||typeof w.reverse_z!=='boolean'||!point(w.start)
        ||!Array.isArray(w.moves)||w.moves.length!==d.moves.length)
        throw Error('Ungültige Werkstückkoordinaten.');
      if(w.origin_local.some((v,i)=>v<d.stock.min[i]||v>d.stock.max[i]))
        throw Error('Werkstücknullpunkt außerhalb des Rohteils.');
      const basis={0:[1,0],90:[0,1],180:[-1,0],270:[0,-1]}[w.rotation_degrees],sign=w.reverse_z?-1:1;
      const transform=p=>{
        const x=p[0]-w.origin_local[0],y=p[1]-w.origin_local[1],z=p[2]-w.origin_local[2];
        return [basis[0]*x+basis[1]*y,sign*(-basis[1]*x+basis[0]*y),sign*z];
      };
      const close=(a,b)=>a.every((v,j)=>Math.abs(v-b[j])<1e-7);
      if(!close(w.start,transform(d.start)))throw Error('Werkstückstartpunkt stimmt nicht.');
      for(let i=0;i<d.moves.length;i++){
        const m=w.moves[i];
        if(!m||!point(m.to)||m.motion!==d.moves[i].motion||!close(m.to,transform(d.moves[i].to)))
          throw Error('Werkstückbewegung stimmt nicht.');
      }
    }

    // Return only the understood fields; file values are never inserted as markup.
    return d;
  }
  root.CamPathData={validate};
  if(typeof module!=='undefined')module.exports={validate};
})(globalThis);

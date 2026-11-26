// Original interchange validator. Drawing checks are not collision certification.
(function(root) {
  function validate(d) {
    const finite = n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1000000;
    const point = p => Array.isArray(p) && p.length === 3 && p.every(finite);
    if (!d || d.format !== 'fertigungsstudio-facing-v1' || d.units !== 'mm') throw Error('Unbekanntes Bahnformat oder Einheit.');
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
    // Return only the understood fields; file values are never inserted as markup.
    return d;
  }
  root.CamPathData={validate};
  if(typeof module!=='undefined')module.exports={validate};
})(globalThis);

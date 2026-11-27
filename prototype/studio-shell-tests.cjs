const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const read=n=>fs.readFileSync(require('node:path').join(__dirname,n),'utf8');
const script=read('studio-shell.js'),html=read('fertigungsstudio-kacheln.html');
new vm.Script(script);
for(const word of ['Datei','Setup','Werkzeugliste','Fräsen','3D Fräsen','Drehen','Laser','Sim','Post','Materialverwaltung','Programm beenden','origin-x','origin-y','origin-z','origin-reverse','save-stock','save-origin','tool-holder','tool-vc','tool-feed','studioRapid','studioCut','studioLead'])assert.ok(script.includes(word),'Feature missing '+word);
for(const word of ['studio-ready','studio-shell','studio-menu-tile','studio-tree','studio-scene'])assert.ok(read('studio-shell.css').includes(word),'Style missing '+word);
assert.ok(html.includes("host.id='studioShell'"));
assert.ok(html.includes('FertigungsstudioStudio'));
assert.ok(html.includes('studio-origin-edge'));
assert.ok(script.includes('studio-tool-illustration'));assert.ok(script.includes('tool-threadpitch'));assert.ok(script.includes('closeStudio'));assert.ok(script.includes('restoring previous preview'));
assert.ok(script.includes('setFacingLauncher'));
assert.ok(script.includes('setContourLauncher'));
assert.ok(script.includes("['Innenkontur','contour']"));
assert.ok(html.includes('FertigungsstudioContourModel'));
assert.ok(html.includes('2D-Konturfräsen · echte Rust-Berechnung'));
assert.ok(html.includes('contour-direction'));
assert.ok(html.includes('contour-margin-x'));
assert.ok(script.includes('studioExportPath'));
assert.ok(html.includes('FertigungsstudioToolpath'));
assert.ok(html.includes('FertigungsstudioFacingModel'));
assert.ok(html.includes('Planfräsen · echte Rust-Berechnung'));
assert.ok(html.includes('Zickzack · halbrunde Wendekurve'));

assert.ok(html.includes('face-strategy'));
assert.ok(html.includes('face-spindle'));


assert.ok(html.includes('studioWcsReadout'));
assert.ok(html.includes('attachWorkCoordinates'));
assert.ok(html.includes('Ungültige Werkstückkoordinaten'));

assert.ok(html.includes('FertigungsstudioPathView'));
assert.ok(html.includes('studioView2D'));
assert.ok(html.includes('studioView3D'));
assert.ok(read('index.html').includes('ISO_YAW=-Math.PI/4'));
assert.ok(read('index.html').includes('ISO_PITCH=Math.acos(1/Math.sqrt(3))'));
assert.ok(read('studio-shell.js').includes("globalThis.FertigungsstudioPathView?.view3D();"));
assert.ok(read('studio-shell.js').includes('enterSimulation:enterIsometricSimulation'));
assert.ok(read('studio-path-view.js').includes("switchMode('3d'); // The default"));
assert.ok(read('build-ribbon.cjs').includes('globalThis.FertigungsstudioStudio?.enterSimulation()'));
console.log('Studio shell integration checks passed.');
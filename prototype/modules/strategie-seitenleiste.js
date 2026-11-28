// Fertigungsstudio CAM – Bearbeitungsdialoge links andocken.
// Die originale Geometrie-, Parameter- und Rust-Werkzeugbahnberechnung bleibt unverändert.
// Kontur-, Plan- und Taschenbearbeitung sind nichtmodal: 3D-Kanten bleiben anklickbar.
(() => {
  'use strict';

  const studio = globalThis.FertigungsstudioStudio;
  const dialog = document.getElementById('studioDialog');
  const main = document.querySelector('#studioShell .studio-main');
  const scene = document.getElementById('studioScene');
  const tree = main && main.querySelector(':scope > .studio-tree');
  if (!studio || !dialog || !main || !scene || !tree) return;

  const originalShow = studio.showDialog.bind(studio);
  const originalClose = studio.closeDialog.bind(studio);
  const parent = dialog.parentNode;

  const style = document.createElement('style');
  style.id = 'studio-operation-sidebar-style';
  style.textContent = `
    .studio-operation-sidebar {
      flex: 0 0 clamp(330px, 28vw, 405px);
      width: clamp(330px, 28vw, 405px);
      min-width: 0;
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--studio-panel);
      border-right: 1px solid var(--studio-line);
      color: var(--studio-ink);
    }
    .studio-operation-sidebar[hidden] { display: none !important; }
    .studio-operation-toolbar {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 11px;
      border-bottom: 1px solid var(--studio-line);
      gap: 8px;
    }
    .studio-operation-toolbar strong {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1px;
      color: var(--studio-muted);
    }
    .studio-operation-toolbar button,
    .studio-operation-expand {
      padding: 6px 9px;
      border: 1px solid var(--studio-line);
      border-radius: 6px;
      background: transparent;
      color: var(--studio-ink);
      cursor: pointer;
    }
    .studio-operation-sidebar .studio-modal[open] {
      position: relative;
      inset: auto;
      display: block;
      box-sizing: border-box;
      flex: 1 1 auto;
      min-height: 0;
      max-height: none;
      width: 100%;
      max-width: none;
      margin: 0;
      padding: 14px 13px 22px;
      overflow: auto;
      border: 0;
      border-radius: 0;
      background: var(--studio-panel);
      box-shadow: none;
    }
    .studio-operation-sidebar .studio-modal h2 { font-size: 15px; margin-bottom: 0; }
    .studio-operation-sidebar .studio-modal .studio-modal-grid,
    .studio-operation-sidebar .studio-op-pane .studio-modal-grid {
      grid-template-columns: minmax(0, 1fr);
      gap: 9px;
    }
    .studio-operation-sidebar .studio-op-tabs {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 4px;
    }
    .studio-operation-sidebar .studio-op-tabs button {
      white-space: normal;
      min-width: 0;
      min-height: 39px;
      font-size: 12px;
      line-height: 1.2;
      padding: 8px 5px;
    }
    .studio-operation-sidebar .studio-modal-actions { display: flex; flex-wrap: wrap; gap: 6px; }
    .studio-operation-sidebar .studio-modal-actions button { flex: 1 1 125px; }
    .studio-operation-sidebar .studio-op-note { padding: 9px; }
    .studio-operation-sidebar .studio-modal label,
    .studio-operation-sidebar .studio-modal p { overflow-wrap: anywhere; }
    .studio-operation-sidebar .studio-modal input,
    .studio-operation-sidebar .studio-modal select { max-width: 100%; }
    .studio-operation-sidebar.is-minimized { flex-basis: 46px; width: 46px; }
    .studio-operation-sidebar.is-minimized .studio-modal,
    .studio-operation-sidebar.is-minimized .studio-operation-toolbar { display: none !important; }
    .studio-operation-expand {
      display: none;
      margin: 9px auto;
      padding: 8px;
      writing-mode: vertical-rl;
      white-space: nowrap;
    }
    .studio-operation-sidebar.is-minimized .studio-operation-expand { display: block; }
    /* Dauerhafte Dreiteilung: links Strategie – Mitte 3D – rechts Bearbeitungsbaum. */
    .studio-main > .studio-operation-sidebar { order: 1; }
    .studio-main > .studio-scene { order: 2; min-width: 0; }
    .studio-main > .studio-tree {
      order: 3;
      border-right: none;
      border-left: 1px solid var(--studio-line);
    }
    .studio-main.operation-panel-open .studio-tree { width: 210px; }
    @media (max-width: 1120px) {
      .studio-main.operation-panel-open .studio-tree { width: 165px; padding: 10px 7px; }
      .studio-operation-sidebar { flex-basis: 325px; width: 325px; }
    }
    @media (max-width: 820px) {
      .studio-main.operation-panel-open .studio-tree { display: block; width: 140px; padding: 10px 6px; }
      .studio-operation-sidebar { flex-basis: min(300px, 38vw); width: min(300px, 38vw); }
    }
    @media (max-width: 580px) {
      .studio-main.operation-panel-open .studio-tree { width: 116px; }
      .studio-operation-sidebar { flex-basis: min(205px, 40vw); width: min(205px, 40vw); }
      .studio-operation-sidebar .studio-op-tabs { grid-template-columns: 1fr; }
    }
  `;
  document.head.appendChild(style);

  const panel = document.createElement('aside');
  panel.id = 'studioOperationSidebar';
  panel.className = 'studio-operation-sidebar';
  panel.setAttribute('aria-label', 'Einstellungen der Bearbeitungsstrategie');
  panel.hidden = true;
  panel.innerHTML = `
    <div class="studio-operation-toolbar">
      <strong>BEARBEITUNGSSTRATEGIE</strong>
      <button type="button" id="studioOperationMinimize" title="Seitenleiste minimieren" aria-label="Seitenleiste minimieren">−</button>
    </div>
    <button type="button" class="studio-operation-expand" id="studioOperationExpand" title="Einstellungen aufklappen">Einstellungen anzeigen</button>
  `;
  // Baum dauerhaft rechts; auch ohne offene Strategie sichtbar.
  // Keine inhaltlichen Änderungen an Bearbeitungen oder Simulation.
  main.insertBefore(panel, scene);
  main.appendChild(tree);

  const layout = () => {
    if (typeof globalThis.resize === 'function') requestAnimationFrame(globalThis.resize);
    window.dispatchEvent(new Event('resize'));
  };
  const collapse = (minimized) => {
    panel.classList.toggle('is-minimized', minimized);
    document.getElementById('studioOperationMinimize').setAttribute('aria-expanded', String(!minimized));
    layout();
  };
  document.getElementById('studioOperationMinimize').addEventListener('click', () => collapse(true));
  document.getElementById('studioOperationExpand').addEventListener('click', () => collapse(false));

  const isOperation = title =>
    title.startsWith('Planfräsen ·') ||
    title.startsWith('2D-Konturfräsen') ||
    title.startsWith('Taschenfräsen ·') ||
    title.startsWith('Bohren ·');

  studio.showDialog = function(title, html) {
    const docked = isOperation(String(title));
    // A single shared dialog is reused by the Studio. Close it before switching
    // between the docked, nonmodal editor and ordinary modal dialogs.
    if (dialog.open) dialog.close();
    if (docked) {
      panel.hidden = false;
      panel.classList.remove('is-minimized');
      panel.appendChild(dialog);
      main.classList.add('operation-panel-open');
      // The existing dialog builder must still run: it owns the real input
      // elements, their IDs and the tab formatting for contour/facing.
      const showModal = dialog.showModal;
      dialog.showModal = function() { return HTMLDialogElement.prototype.show.call(this); };
      try { originalShow(title, html); }
      finally { dialog.showModal = showModal; }
    } else {
      panel.hidden = true;
      panel.classList.remove('is-minimized');
      main.classList.remove('operation-panel-open');
      parent.appendChild(dialog);
      originalShow(title, html);
    }
    layout();
  };

  function undock() {
    panel.hidden = true;
    panel.classList.remove('is-minimized');
    main.classList.remove('operation-panel-open');
    // Legacy Setup/Tool dialogs call their private showDialog() directly;
    // they must always find their dialog back at the original parent.
    if (panel.contains(dialog)) parent.appendChild(dialog);
    layout();
  }

  studio.closeDialog = function() {
    originalClose();
    // A model-edge pick hides the settings but leaves the 3D canvas completely
    // available. The operation reopens the dock after a successful pick.
    undock();
  };

  dialog.addEventListener('close', () => {
    // A delayed close event must not hide a dialog reopened by a picker callback.
    if (!dialog.open && panel.contains(dialog)) undock();
  });

  // The existing Studio calls ordinary dialogs through private local
  // functions. Close/undock before navigating to a different menu item.
  document.addEventListener('click', event => {
    if (!panel.contains(dialog) || !dialog.open) return;
    if (event.target.closest('#studioMenuPopup button, .studio-menu-tile, #studioOperations button')) {
      studio.closeDialog();
    }
  }, true);

  // Escape closes a modeless settings dialog; it is not allowed to leave
  // an invisible, keyboard-focussed operation panel behind.
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && panel.contains(dialog) && dialog.open) {
      studio.closeDialog();
    }
  });

  globalThis.FertigungsstudioOperationSidebar = {
    isOpen: () => !panel.hidden && dialog.open,
    isMinimized: () => panel.classList.contains('is-minimized'),
    minimize: () => collapse(true),
    expand: () => collapse(false)
  };
})();

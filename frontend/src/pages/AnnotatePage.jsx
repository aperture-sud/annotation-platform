import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getPage, getPageBoxes, createBox, updateBox, deleteBox, exportPage, renamePage, IMAGE_BASE_URL,
} from '../api/client.js';
import ImageCanvas from '../components/ImageCanvas.jsx';
import BoxList from '../components/BoxList.jsx';
import TagDropdown from '../components/TagDropdown.jsx';
import TagForm from '../components/TagForm.jsx';
import UniversalKeyboard from '../components/UniversalKeyboard.jsx';
import FormulaKeyboard from '../components/FormulaKeyboard.jsx';
import Renderer from '../components/Renderer.jsx';

const PANEL_WIDTH = 340;

const S = {
  root: { display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' },

  topbar: {
    display: 'flex', alignItems: 'center', height: '48px', padding: '0 12px',
    backgroundColor: '#fff', borderBottom: '1px solid #e2e4e7',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)', flexShrink: 0, gap: '3px',
    overflowX: 'auto',
  },
  title: {
    fontSize: '13px', color: '#666', fontWeight: 500,
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '220px',
  },
  spacer: { flex: 1, minWidth: '6px' },
  sep: { width: '1px', height: '20px', backgroundColor: '#e2e4e7', flexShrink: 0, margin: '0 5px' },

  body: { display: 'flex', flex: 1, overflow: 'hidden' },

  canvasAreaBase: {
    flexShrink: 0, display: 'flex', flexDirection: 'column',
  },
  canvasTitle: {
    padding: '0 14px', height: '34px', display: 'flex', alignItems: 'center',
    borderBottom: '1px solid #d4d4d4', fontSize: '13px', fontWeight: 600,
    color: '#333', flexShrink: 0, backgroundColor: '#f2f2f2',
  },
  canvasBody: {
    flex: 1, overflow: 'hidden', padding: '12px', backgroundColor: '#e8e8e8',
  },

  rightPanel: {
    width: `${PANEL_WIDTH}px`, flexShrink: 0, backgroundColor: '#fff',
    borderLeft: '1px solid #d4d4d4', boxShadow: '-3px 0 12px rgba(0,0,0,0.07)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  panelSection: { borderBottom: '1px solid #eee', overflowY: 'auto' },

  rendererPanel: {
    flex: 1, minWidth: 0, backgroundColor: '#e8e8e8',
    borderLeft: '1px solid #d4d4d4', boxShadow: '-2px 0 8px rgba(0,0,0,0.05)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  rendererTitle: {
    padding: '0 14px', height: '34px', display: 'flex', alignItems: 'center',
    borderBottom: '1px solid #d8d8d8', fontSize: '11px', fontWeight: 700,
    color: '#444', letterSpacing: '0.08em', textTransform: 'uppercase',
    flexShrink: 0, backgroundColor: '#f2f2f2',
  },

  banner: (color) => ({
    padding: '6px 14px', backgroundColor: color, color: '#fff',
    fontSize: '12px', fontWeight: 500,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
  }),
  bannerBtn: {
    background: 'none', border: '1px solid rgba(255,255,255,0.55)',
    color: '#fff', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer', fontSize: '11px',
  },
};

export default function AnnotatePage() {
  const { pageId } = useParams();
  const navigate = useNavigate();
  const [page, setPage] = useState(null);
  const [boxes, setBoxes] = useState([]);
  const [selectedBoxId, setSelectedBoxId] = useState(null);
  const [tagPickingFor, setTagPickingFor] = useState(null);
  const [addingChildFor, setAddingChildFor] = useState(null);
  const [polyMode, setPolyMode] = useState(false);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [showFormulas, setShowFormulas] = useState(false);
  const [showRenderer, setShowRenderer] = useState(false);
  const [transliterate, setTransliterate] = useState(false);
  const [canvasColumnWidth, setCanvasColumnWidth] = useState(null);
  const [pageTitle, setPageTitle] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const canvasRef = useRef(null);

  const handleIdealWidth = useCallback((w) => {
    setCanvasColumnWidth((prev) => {
      const r = Math.round(w);
      return prev === r ? prev : r;
    });
  }, []);

  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  function recordAction(undoFn, redoFn) {
    undoStack.current.push({ undo: undoFn, redo: redoFn });
    redoStack.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }

  const handleUndo = useCallback(async () => {
    const action = undoStack.current.pop();
    if (!action) return;
    await action.undo();
    redoStack.current.push(action);
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(true);
  }, []);

  const handleRedo = useCallback(async () => {
    const action = redoStack.current.pop();
    if (!action) return;
    await action.redo();
    undoStack.current.push(action);
    setCanUndo(true);
    setCanRedo(redoStack.current.length > 0);
  }, []);

  useEffect(() => { loadPage(); }, [pageId]);

  async function loadPage() {
    try {
      const [pg, bxs] = await Promise.all([getPage(pageId), getPageBoxes(pageId)]);
      setPage(pg);
      setPageTitle(pg.display_name || `p.${pg.page_number}`);
      setBoxes(bxs);
    } catch (e) {
      console.error('Failed to load page', e);
    }
  }

  async function commitTitle(val) {
    const trimmed = val.trim();
    if (!trimmed) return;
    setPageTitle(trimmed);
    setEditingTitle(false);
    try { await renamePage(pageId, trimmed); } catch (e) { console.error('Rename failed', e); }
  }

  useEffect(() => {
    function onKey(e) {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); }
      if (ctrl && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); handleRedo(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleUndo, handleRedo]);

  const handleBoxCreated = useCallback(async (coords) => {
    try {
      const maxOrder = boxes.reduce((max, b) => b.reading_order != null ? Math.max(max, b.reading_order) : max, 0);
      const payload = {
        page_id: Number(pageId), ...coords, reading_order: maxOrder + 1,
        ...(addingChildFor ? { parent_box_id: addingChildFor } : {}),
      };
      const newBox = await createBox(payload);
      setBoxes((prev) => [...prev, newBox]);
      setSelectedBoxId(newBox.id);
      setTagPickingFor(newBox.id);
      setAddingChildFor(null);
      setPolyMode(false);

      let trackedBox = newBox;
      recordAction(
        async () => {
          await deleteBox(trackedBox.id);
          setBoxes((prev) => prev.filter((b) => b.id !== trackedBox.id));
          setSelectedBoxId((s) => s === trackedBox.id ? null : s);
          setTagPickingFor((t) => t === trackedBox.id ? null : t);
        },
        async () => {
          const { id: _, created_at, ...data } = trackedBox;
          const recreated = await createBox(data);
          trackedBox = recreated;
          setBoxes((prev) => [...prev, recreated]);
          setSelectedBoxId(recreated.id);
        },
      );
    } catch (e) {
      console.error('Failed to create box', e);
    }
  }, [pageId, addingChildFor, boxes]);

  const handleBoxSelect = useCallback((id) => {
    setSelectedBoxId(id);
    setAddingChildFor(null);
    const box = boxes.find((b) => b.id === id);
    setTagPickingFor(box && !box.tag_category ? id : null);
  }, [boxes]);

  const handleBoxDeselect = useCallback(() => {
    setSelectedBoxId(null);
    setTagPickingFor(null);
    setAddingChildFor(null);
  }, []);

  const handleBoxDelete = useCallback(async (id) => {
    try {
      function collectDescendants(boxId) {
        const children = boxes.filter((b) => b.parent_box_id === boxId);
        return children.flatMap((c) => [...collectDescendants(c.id), c]);
      }
      const rootBox = boxes.find((b) => b.id === id);
      if (!rootBox) return;
      const descendants = collectDescendants(id);
      const allToDelete = [...descendants, rootBox];
      const deletedIds = new Set(allToDelete.map((b) => b.id));

      for (const box of allToDelete) await deleteBox(box.id);
      setBoxes((prev) => prev.filter((b) => !deletedIds.has(b.id)));
      if (deletedIds.has(selectedBoxId)) {
        setSelectedBoxId(null); setTagPickingFor(null); setAddingChildFor(null);
      }

      let trackedDeleted = allToDelete.map((b) => ({ ...b }));
      recordAction(
        async () => {
          const idMap = {};
          for (const b of [...trackedDeleted].reverse()) {
            const { id: oldId, created_at, ...data } = b;
            if (data.parent_box_id && idMap[data.parent_box_id] !== undefined)
              data.parent_box_id = idMap[data.parent_box_id];
            const newBox = await createBox(data);
            idMap[oldId] = newBox.id;
            setBoxes((prev) => [...prev, newBox]);
          }
          trackedDeleted = trackedDeleted.map((b) => ({
            ...b, id: idMap[b.id] ?? b.id,
            parent_box_id: b.parent_box_id && idMap[b.parent_box_id] !== undefined
              ? idMap[b.parent_box_id] : b.parent_box_id,
          }));
        },
        async () => {
          for (const b of trackedDeleted) { try { await deleteBox(b.id); } catch {} }
          const ids = new Set(trackedDeleted.map((b) => b.id));
          setBoxes((prev) => prev.filter((b) => !ids.has(b.id)));
        },
      );
    } catch (e) {
      console.error('Failed to delete box', e);
    }
  }, [selectedBoxId, boxes]);

  const handleBoxGeomUpdate = useCallback(async (id, coords) => {
    try {
      const oldBox = boxes.find((b) => b.id === id);
      const updated = await updateBox(id, coords);
      setBoxes((prev) => prev.map((b) => (b.id === id ? updated : b)));
      if (oldBox) {
        const oldCoords = { x: oldBox.x, y: oldBox.y, width: oldBox.width, height: oldBox.height, rotation: oldBox.rotation };
        recordAction(
          async () => { const r = await updateBox(id, oldCoords); setBoxes((prev) => prev.map((b) => b.id === id ? r : b)); },
          async () => { const r = await updateBox(id, coords);    setBoxes((prev) => prev.map((b) => b.id === id ? r : b)); },
        );
      }
    } catch (e) { console.error('Failed to update box geometry', e); }
  }, [boxes]);

  function handleTagPicked(tagType) {
    const id = tagPickingFor;
    if (!id) return;
    setBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, tag_category: tagType } : b)));
    setTagPickingFor(null);
  }

  function handleBoxUpdated(updatedBox) {
    const oldBox = boxes.find((b) => b.id === updatedBox.id);
    setBoxes((prev) => prev.map((b) => (b.id === updatedBox.id ? updatedBox : b)));
    if (oldBox) {
      const snap = { ...oldBox }, newSnap = { ...updatedBox };
      const fields = ['tag_category', 'tag_data', 'content_text', 'reading_order', 'confidence'];
      const extract = (b) => Object.fromEntries(fields.map((f) => [f, b[f]]));
      recordAction(
        async () => { const r = await updateBox(snap.id, extract(snap)); setBoxes((prev) => prev.map((b) => b.id === snap.id ? r : b)); },
        async () => { const r = await updateBox(newSnap.id, extract(newSnap)); setBoxes((prev) => prev.map((b) => b.id === newSnap.id ? r : b)); },
      );
    }
  }

  async function handleExport() {
    try {
      const text = await exportPage(pageId);
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${pageTitle || `page_${pageId}`}.txt`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { console.error('Export failed', e); }
  }

  const selectedBox = boxes.find((b) => b.id === selectedBoxId) || null;
  const parentOfSelected = selectedBox?.parent_box_id ? boxes.find((b) => b.id === selectedBox.parent_box_id) : null;
  const imageUrl = page ? `${IMAGE_BASE_URL}/${page.image_path}` : null;

  return (
    <div style={S.root}>
      {/* ── Topbar ────────────────────────────────────────────────────────── */}
      <div style={S.topbar}>
        <button className="tb-btn" onClick={() => navigate('/')}>← Home</button>
        <div style={S.sep} />
        {editingTitle ? (
          <input
            autoFocus
            defaultValue={pageTitle}
            style={{ ...S.title, border: '1px solid #ccc', borderRadius: '3px', padding: '2px 6px', outline: 'none', maxWidth: '220px' }}
            onBlur={(e) => commitTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commitTitle(e.target.value); if (e.key === 'Escape') setEditingTitle(false); }}
          />
        ) : (
          <span style={{ ...S.title, cursor: 'text' }} title="Click to rename" onClick={() => setEditingTitle(true)}>
            {pageTitle || 'Loading…'}
          </span>
        )}
        <div style={S.spacer} />

        {/* Drawing tools */}
        <button
          className={`tb-btn${polyMode ? ' on-poly' : ''}`}
          onClick={() => setPolyMode((v) => !v)}
          title="Polygon drawing mode"
        >
          ⬡ Polygon
        </button>
        <button
          className={`tb-btn${showKeyboard ? ' on-keys' : ''}`}
          onClick={() => setShowKeyboard((v) => !v)}
          title="Symbol keyboard"
        >
          ⌨ Keys
        </button>
        <button
          className={`tb-btn${showFormulas ? ' on-keys' : ''}`}
          onClick={() => setShowFormulas((v) => !v)}
          title="Formula keyboard — Chemistry, Physics, Math"
        >
          🧪 Formulas
        </button>
        <button
          className={`tb-btn${transliterate ? ' on-kn' : ''}`}
          onClick={() => setTransliterate((v) => !v)}
          title="Kannada transliteration on textareas"
        >
          ಕ Kannada
        </button>

        <div style={S.sep} />

        {/* History */}
        <button className="tb-btn" onClick={handleUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">↩ Undo</button>
        <button className="tb-btn" onClick={handleRedo} disabled={!canRedo} title="Redo (Ctrl+Y)">↪ Redo</button>

        <div style={S.sep} />

        {/* View */}
        <button
          className={`tb-btn${showRenderer ? ' on-preview' : ''}`}
          onClick={() => setShowRenderer((v) => !v)}
          title="Toggle live preview"
        >
          ☰ Preview
        </button>

        <div style={S.sep} />

        <button className="tb-btn btn-export" onClick={handleExport}>↓ Export</button>
      </div>

      {/* ── Mode banners ──────────────────────────────────────────────────── */}
      {polyMode && (
        <div style={S.banner('#c2185b')}>
          <span>Polygon mode — click points, double-click or click first point to close</span>
          <button style={S.bannerBtn} onClick={() => setPolyMode(false)}>Cancel</button>
        </div>
      )}
      {addingChildFor && (
        <div style={S.banner('#e65100')}>
          <span>
            Nested inside: <strong>{boxes.find((b) => b.id === addingChildFor)?.tag_category || `#${addingChildFor}`}</strong>
            {' '}— draw a box on the canvas
          </span>
          <button style={S.bannerBtn} onClick={() => setAddingChildFor(null)}>Cancel</button>
        </div>
      )}

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div style={{ ...S.body, position: 'relative' }}>

        {/* Canvas column */}
        <div style={{ ...S.canvasAreaBase, width: canvasColumnWidth ? `${canvasColumnWidth}px` : undefined, flex: canvasColumnWidth ? undefined : 1 }}>
          <div style={S.canvasTitle}>{pageTitle || 'Source'}</div>
          <div style={S.canvasBody}>
            {imageUrl && (
              <ImageCanvas
                ref={canvasRef}
                imageUrl={imageUrl}
                boxes={boxes}
                selectedBoxId={selectedBoxId}
                childMode={!!addingChildFor}
                childParentBox={addingChildFor ? boxes.find((b) => b.id === addingChildFor) : null}
                polyMode={polyMode}
                onBoxCreated={handleBoxCreated}
                onBoxSelect={handleBoxSelect}
                onBoxDeselect={handleBoxDeselect}
                onBoxDelete={handleBoxDelete}
                onBoxGeomUpdate={handleBoxGeomUpdate}
                onIdealWidth={handleIdealWidth}
              />
            )}
          </div>
        </div>

        {/* Symbol keyboard overlay */}
        {showKeyboard && (
          <div style={{
            position: 'absolute', right: PANEL_WIDTH + (showFormulas ? 300 : 0), top: 0, bottom: 0, width: 220,
            backgroundColor: '#fff', overflowY: 'auto',
            borderLeft: '1px solid #d4d4d4', boxShadow: '-3px 0 10px rgba(0,0,0,0.08)', zIndex: 5,
          }}>
            <UniversalKeyboard />
          </div>
        )}

        {/* Formula keyboard overlay */}
        {showFormulas && (
          <div style={{
            position: 'absolute', right: PANEL_WIDTH, top: 0, bottom: 0, width: 300,
            backgroundColor: '#fff', display: 'flex', flexDirection: 'column',
            borderLeft: '1px solid #d4d4d4', boxShadow: '-3px 0 10px rgba(0,0,0,0.08)', zIndex: 5,
          }}>
            <FormulaKeyboard />
          </div>
        )}

        {/* Right annotation panel */}
        <div style={S.rightPanel}>

          {selectedBox && tagPickingFor === selectedBox.id && (
            <div style={{ ...S.panelSection, padding: '12px' }}>
              <TagDropdown onPick={handleTagPicked} onCancel={() => setTagPickingFor(null)} />
            </div>
          )}

          {selectedBox && !tagPickingFor && selectedBox.tag_category && (
            <div style={{ ...S.panelSection, flex: 1, overflowY: 'auto' }}>
              <div style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid #eee', flexWrap: 'wrap' }}>
                <button className="panel-link" style={{ color: '#2196F3' }} onClick={() => setTagPickingFor(selectedBox.id)}>Change tag</button>
                <span style={{ color: '#ddd' }}>|</span>
                <button
                  className="panel-link" style={{ color: '#e65100' }}
                  onClick={() => { setAddingChildFor(selectedBox.id); setSelectedBoxId(null); setTagPickingFor(null); }}
                >
                  + Nested
                </button>
                <span style={{ color: '#ddd' }}>|</span>
                <button className="panel-link" style={{ color: '#999' }} onClick={handleBoxDeselect}>Deselect</button>
              </div>

              {parentOfSelected && (
                <div style={{ padding: '4px 12px', fontSize: '11px', color: '#888', backgroundColor: '#fffde7', borderBottom: '1px solid #eee' }}>
                  ↳ inside{' '}
                  <span style={{ color: '#e65100', cursor: 'pointer', textDecoration: 'underline' }} onClick={() => handleBoxSelect(parentOfSelected.id)}>
                    {parentOfSelected.tag_category || `#${parentOfSelected.id}`}
                  </span>
                </div>
              )}

              <TagForm box={selectedBox} onUpdate={handleBoxUpdated} transliterate={transliterate} />
            </div>
          )}

          {selectedBox && !tagPickingFor && !selectedBox.tag_category && (
            <div style={{ padding: '12px', color: '#888', fontSize: '13px' }}>
              Select a tag type above to start annotating.
            </div>
          )}

          <div style={{ flex: 1, overflowY: 'auto', borderTop: selectedBox ? '1px solid #eee' : 'none' }}>
            <BoxList boxes={boxes} selectedBoxId={selectedBoxId} onSelect={handleBoxSelect} onDelete={handleBoxDelete} />
          </div>
        </div>

        {/* Renderer panel */}
        {showRenderer && (
          <div style={S.rendererPanel}>
            <div style={S.rendererTitle}>Live Preview</div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <Renderer boxes={boxes} selectedBoxId={selectedBoxId} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

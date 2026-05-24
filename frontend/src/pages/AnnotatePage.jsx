import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getPage, getPageBoxes, createBox, updateBox, deleteBox, exportPage, IMAGE_BASE_URL,
} from '../api/client.js';
import ImageCanvas from '../components/ImageCanvas.jsx';
import BoxList from '../components/BoxList.jsx';
import TagDropdown from '../components/TagDropdown.jsx';
import TagForm from '../components/TagForm.jsx';

const PANEL_WIDTH = 340;

const styles = {
  root: { display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' },
  topbar: {
    display: 'flex', alignItems: 'center', padding: '8px 16px',
    backgroundColor: '#1e1e2e', color: '#fff', gap: '8px', flexShrink: 0, flexWrap: 'wrap',
  },
  topbarTitle: { fontWeight: '600', fontSize: '14px', flex: 1 },
  body: { display: 'flex', flex: 1, overflow: 'hidden' },
  canvasArea: { flex: 1, overflow: 'hidden', backgroundColor: '#222', position: 'relative' },
  rightPanel: {
    width: `${PANEL_WIDTH}px`, flexShrink: 0, backgroundColor: '#fff',
    borderLeft: '1px solid #ddd', display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  panelSection: { borderBottom: '1px solid #eee', overflowY: 'auto' },
  topbarBtn: {
    padding: '5px 12px', fontSize: '12px', border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: '4px', color: '#fff', backgroundColor: 'transparent', cursor: 'pointer',
    flexShrink: 0,
  },
  topbarBtnDisabled: {
    padding: '5px 12px', fontSize: '12px', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '4px', color: 'rgba(255,255,255,0.3)', backgroundColor: 'transparent',
    cursor: 'default', flexShrink: 0,
  },
  hint: { fontSize: '11px', color: 'rgba(255,255,255,0.5)' },
  childBanner: {
    padding: '6px 12px', backgroundColor: '#FF9800', color: '#fff',
    fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    flexShrink: 0,
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
  const canvasRef = useRef(null);

  // Undo/redo stacks — each entry: { undo: async fn, redo: async fn }
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
      setBoxes(bxs);
    } catch (e) {
      console.error('Failed to load page', e);
    }
  }

  // Keyboard shortcuts
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
      // Assign next reading order immediately at creation
      const maxOrder = boxes.reduce((max, b) => b.reading_order != null ? Math.max(max, b.reading_order) : max, 0);
      const payload = {
        page_id: Number(pageId),
        ...coords,
        reading_order: maxOrder + 1,
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
          // undo: delete the box
          await deleteBox(trackedBox.id);
          setBoxes((prev) => prev.filter((b) => b.id !== trackedBox.id));
          setSelectedBoxId((s) => s === trackedBox.id ? null : s);
          setTagPickingFor((t) => t === trackedBox.id ? null : t);
        },
        async () => {
          // redo: re-create the box
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
    if (box && !box.tag_category) {
      setTagPickingFor(id);
    } else {
      setTagPickingFor(null);
    }
  }, [boxes]);

  const handleBoxDeselect = useCallback(() => {
    setSelectedBoxId(null);
    setTagPickingFor(null);
    setAddingChildFor(null);
  }, []);

  const handleBoxDelete = useCallback(async (id) => {
    try {
      // Collect all descendants recursively (deepest first so deletion order is leaf→root)
      function collectDescendants(boxId) {
        const children = boxes.filter((b) => b.parent_box_id === boxId);
        return children.flatMap((c) => [...collectDescendants(c.id), c]);
      }

      const rootBox = boxes.find((b) => b.id === id);
      if (!rootBox) return;

      const descendants = collectDescendants(id);
      const allToDelete = [...descendants, rootBox]; // children first, root last
      const deletedIds = new Set(allToDelete.map((b) => b.id));

      for (const box of allToDelete) {
        await deleteBox(box.id);
      }

      setBoxes((prev) => prev.filter((b) => !deletedIds.has(b.id)));
      if (deletedIds.has(selectedBoxId)) {
        setSelectedBoxId(null);
        setTagPickingFor(null);
        setAddingChildFor(null);
      }

      let trackedDeleted = allToDelete.map((b) => ({ ...b }));

      recordAction(
        async () => {
          // Undo: restore in reverse order (root first, then children) so parents precede children
          const idMap = {};
          for (const b of [...trackedDeleted].reverse()) {
            const { id: oldId, created_at, ...data } = b;
            if (data.parent_box_id && idMap[data.parent_box_id] !== undefined) {
              data.parent_box_id = idMap[data.parent_box_id];
            }
            const newBox = await createBox(data);
            idMap[oldId] = newBox.id;
            setBoxes((prev) => [...prev, newBox]);
          }
          // Update tracked IDs for subsequent redo
          trackedDeleted = trackedDeleted.map((b) => ({
            ...b,
            id: idMap[b.id] ?? b.id,
            parent_box_id: (b.parent_box_id && idMap[b.parent_box_id] !== undefined)
              ? idMap[b.parent_box_id]
              : b.parent_box_id,
          }));
        },
        async () => {
          // Redo: delete all again
          for (const b of trackedDeleted) {
            try { await deleteBox(b.id); } catch {}
          }
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
        const newCoords = coords;
        recordAction(
          async () => {
            const restored = await updateBox(id, oldCoords);
            setBoxes((prev) => prev.map((b) => (b.id === id ? restored : b)));
          },
          async () => {
            const reapplied = await updateBox(id, newCoords);
            setBoxes((prev) => prev.map((b) => (b.id === id ? reapplied : b)));
          },
        );
      }
    } catch (e) {
      console.error('Failed to update box geometry', e);
    }
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
      const snapshot = { ...oldBox };
      const newSnapshot = { ...updatedBox };
      recordAction(
        async () => {
          const restored = await updateBox(snapshot.id, {
            tag_category: snapshot.tag_category,
            tag_data: snapshot.tag_data,
            content_text: snapshot.content_text,
            reading_order: snapshot.reading_order,
            confidence: snapshot.confidence,
          });
          setBoxes((prev) => prev.map((b) => (b.id === snapshot.id ? restored : b)));
        },
        async () => {
          const reapplied = await updateBox(newSnapshot.id, {
            tag_category: newSnapshot.tag_category,
            tag_data: newSnapshot.tag_data,
            content_text: newSnapshot.content_text,
            reading_order: newSnapshot.reading_order,
            confidence: newSnapshot.confidence,
          });
          setBoxes((prev) => prev.map((b) => (b.id === newSnapshot.id ? reapplied : b)));
        },
      );
    }
  }

  async function handleExport() {
    try {
      const text = await exportPage(pageId);
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `page_${pageId}_export.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Export failed', e);
    }
  }

  const selectedBox = boxes.find((b) => b.id === selectedBoxId) || null;
  const parentOfSelected = selectedBox?.parent_box_id
    ? boxes.find((b) => b.id === selectedBox.parent_box_id)
    : null;
  const imageUrl = page ? `${IMAGE_BASE_URL}/${page.image_path}` : null;

  return (
    <div style={styles.root}>
      {/* Top bar */}
      <div style={styles.topbar}>
        <button style={styles.topbarBtn} onClick={() => navigate('/')}>← Home</button>
        <span style={styles.topbarTitle}>
          {page ? `Page ${page.page_number} — ${page.image_path}` : 'Loading…'}
        </span>
        <span style={styles.hint}>Draw · Click · Delete · Ctrl+Z/Y</span>
        <button
          style={canUndo ? styles.topbarBtn : styles.topbarBtnDisabled}
          onClick={handleUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
        >
          ↩ Undo
        </button>
        <button
          style={canRedo ? styles.topbarBtn : styles.topbarBtnDisabled}
          onClick={handleRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Y)"
        >
          ↪ Redo
        </button>
        <button
          style={{ ...styles.topbarBtn, ...(polyMode ? { backgroundColor: '#E91E63', borderColor: '#E91E63' } : {}) }}
          onClick={() => setPolyMode((v) => !v)}
          title="Polygon drawing mode — click points, double-click or click first point to close"
        >
          {polyMode ? 'Polygon ON' : 'Polygon'}
        </button>
        <button style={styles.topbarBtn} onClick={handleExport}>Export</button>
      </div>

      {/* Polygon mode banner */}
      {polyMode && (
        <div style={{ ...styles.childBanner, backgroundColor: '#E91E63' }}>
          <span>Polygon mode — click points on canvas, double-click or click first point to close</span>
          <button
            onClick={() => setPolyMode(false)}
            style={{ background: 'none', border: '1px solid rgba(255,255,255,0.6)', color: '#fff', borderRadius: '3px', padding: '2px 8px', cursor: 'pointer', fontSize: '11px' }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Child mode banner */}
      {addingChildFor && (
        <div style={styles.childBanner}>
          <span>
            Drawing nested tag inside: <strong>{boxes.find(b => b.id === addingChildFor)?.tag_category || `box #${addingChildFor}`}</strong>
            &nbsp;— draw a rectangle on the canvas
          </span>
          <button
            onClick={() => setAddingChildFor(null)}
            style={{ background: 'none', border: '1px solid rgba(255,255,255,0.6)', color: '#fff', borderRadius: '3px', padding: '2px 8px', cursor: 'pointer', fontSize: '11px' }}
          >
            Cancel
          </button>
        </div>
      )}

      <div style={styles.body}>
        {/* Canvas */}
        <div style={styles.canvasArea}>
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
            />
          )}
        </div>

        {/* Right panel */}
        <div style={styles.rightPanel}>

          {/* Tag picker */}
          {selectedBox && tagPickingFor === selectedBox.id && (
            <div style={{ ...styles.panelSection, padding: '12px' }}>
              <TagDropdown onPick={handleTagPicked} onCancel={() => setTagPickingFor(null)} />
            </div>
          )}

          {/* Tag form */}
          {selectedBox && !tagPickingFor && selectedBox.tag_category && (
            <div style={{ ...styles.panelSection, flex: 1, overflowY: 'auto' }}>
              {/* Panel toolbar */}
              <div style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid #eee', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setTagPickingFor(selectedBox.id)}
                  style={{ fontSize: '11px', color: '#2196F3', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Change tag
                </button>
                <span style={{ color: '#ddd' }}>|</span>
                <button
                  onClick={() => {
                    setAddingChildFor(selectedBox.id);
                    setSelectedBoxId(null);
                    setTagPickingFor(null);
                  }}
                  style={{ fontSize: '11px', color: '#FF9800', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  + Nested tag
                </button>
                <span style={{ color: '#ddd' }}>|</span>
                <button
                  onClick={handleBoxDeselect}
                  style={{ fontSize: '11px', color: '#888', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Deselect
                </button>
              </div>

              {/* Parent breadcrumb */}
              {parentOfSelected && (
                <div style={{ padding: '4px 12px', fontSize: '11px', color: '#888', backgroundColor: '#fffde7', borderBottom: '1px solid #eee' }}>
                  ↳ nested inside{' '}
                  <span
                    style={{ color: '#FF9800', cursor: 'pointer', textDecoration: 'underline' }}
                    onClick={() => handleBoxSelect(parentOfSelected.id)}
                  >
                    {parentOfSelected.tag_category || `box #${parentOfSelected.id}`}
                  </span>
                </div>
              )}

              <TagForm box={selectedBox} onUpdate={handleBoxUpdated} />
            </div>
          )}

          {selectedBox && !tagPickingFor && !selectedBox.tag_category && (
            <div style={{ padding: '12px', color: '#666', fontSize: '13px' }}>
              Select a tag type above to start annotating.
            </div>
          )}

          {/* Box list */}
          <div style={{ flex: 1, overflowY: 'auto', borderTop: selectedBox ? '1px solid #ddd' : 'none' }}>
            <BoxList
              boxes={boxes}
              selectedBoxId={selectedBoxId}
              onSelect={handleBoxSelect}
              onDelete={handleBoxDelete}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

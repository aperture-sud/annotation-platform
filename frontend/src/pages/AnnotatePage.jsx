import { useState, useEffect, useCallback } from 'react';
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
    backgroundColor: '#1e1e2e', color: '#fff', gap: '16px', flexShrink: 0,
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
  },
  hint: { fontSize: '11px', color: 'rgba(255,255,255,0.5)' },
  // Child mode banner
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
  // When set, the next box drawn on canvas becomes a child of this box id
  const [addingChildFor, setAddingChildFor] = useState(null);

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

  const handleBoxCreated = useCallback(async (coords) => {
    try {
      const payload = {
        page_id: Number(pageId),
        ...coords,
        ...(addingChildFor ? { parent_box_id: addingChildFor } : {}),
      };
      const newBox = await createBox(payload);
      setBoxes((prev) => [...prev, newBox]);
      setSelectedBoxId(newBox.id);
      setTagPickingFor(newBox.id);
      setAddingChildFor(null);
    } catch (e) {
      console.error('Failed to create box', e);
    }
  }, [pageId, addingChildFor]);

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
      await deleteBox(id);
      setBoxes((prev) => prev.filter((b) => b.id !== id));
      if (selectedBoxId === id) {
        setSelectedBoxId(null);
        setTagPickingFor(null);
        setAddingChildFor(null);
      }
    } catch (e) {
      console.error('Failed to delete box', e);
    }
  }, [selectedBoxId]);

  const handleBoxGeomUpdate = useCallback(async (id, coords) => {
    try {
      const updated = await updateBox(id, coords);
      setBoxes((prev) => prev.map((b) => (b.id === id ? updated : b)));
    } catch (e) {
      console.error('Failed to update box geometry', e);
    }
  }, []);

  function handleTagPicked(tagType) {
    const id = tagPickingFor;
    if (!id) return;
    setBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, tag_category: tagType } : b)));
    setTagPickingFor(null);
  }

  function handleBoxUpdated(updatedBox) {
    setBoxes((prev) => prev.map((b) => (b.id === updatedBox.id ? updatedBox : b)));
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
        <span style={styles.hint}>Draw to annotate · Click to select · Delete to remove</span>
        <button style={styles.topbarBtn} onClick={handleExport}>Export</button>
      </div>

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
              imageUrl={imageUrl}
              boxes={boxes}
              selectedBoxId={selectedBoxId}
              childMode={!!addingChildFor}
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

import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getPage, getMaskBoxes, applyMasks, IMAGE_BASE_URL } from '../api/client.js';

const TOOLS = ['rect', 'polygon'];

export default function MaskPage() {
  const { pageName } = useParams();
  const navigate = useNavigate();

  const [page,      setPage]      = useState(null);
  const [imgLoaded, setImgLoaded] = useState(false);

  // History for undo/redo: each entry is a shapes array
  const [history,  setHistory]  = useState([[]]);
  const [histIdx,  setHistIdx]  = useState(0);

  const [tool,     setTool]     = useState('rect');
  const [selected, setSelected] = useState(null);
  const [drawing,  setDrawing]  = useState(null);  // rect: {x,y,w,h}
  const [polyPts,  setPolyPts]  = useState([]);    // polygon in-progress points
  const [submitting, setSubmitting] = useState(false);
  const [rotating,   setRotating]  = useState(false);
  const [rotPreview, setRotPreview] = useState(null); // {id, rotation} during drag

  const imgRef      = useRef(null);
  const overlayRef  = useRef(null);
  const startRef    = useRef(null);
  const rotateCxRef = useRef(0);
  const rotateCyRef = useRef(0);

  const shapes = history[histIdx];

  function pushHistory(newShapes) {
    const next = [...history.slice(0, histIdx + 1), newShapes];
    setHistory(next);
    setHistIdx(next.length - 1);
  }

  function undo() {
    if (histIdx > 0) { setHistIdx(h => h - 1); setSelected(null); }
  }

  function redo() {
    if (histIdx < history.length - 1) { setHistIdx(h => h + 1); setSelected(null); }
  }

  useEffect(() => {
    getPage(pageName)
      .then(setPage)
      .catch(() => navigate('/masker'));
  }, [pageName]);

  // Load saved masks once image dimensions are known
  useEffect(() => {
    if (!imgLoaded || !page) return;
    getMaskBoxes(pageName).then(saved => {
      if (!saved || !saved.length) return;
      const el = imgRef.current;
      if (!el) return;
      const scaleX = el.offsetWidth  / el.naturalWidth;
      const scaleY = el.offsetHeight / el.naturalHeight;
      const loaded = saved.map((s, i) => ({
        id: Date.now() + i,
        type: 'polygon',
        points: s.points.map(p => ({ x: p.x * scaleX, y: p.y * scaleY })),
      }));
      setHistory([loaded]);
      setHistIdx(0);
    }).catch(() => {});
  }, [imgLoaded, page]);

  useEffect(() => {
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selected !== null) deleteSelected();
      }
      if (e.key === 'Escape') { setPolyPts([]); setDrawing(null); setSelected(null); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [histIdx, history, selected, polyPts]);

  function deleteSelected() {
    if (selected === null) return;
    pushHistory(shapes.filter(s => s.id !== selected));
    setSelected(null);
  }

  function getPos(e) {
    const el = overlayRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: cx - rect.left, y: cy - rect.top };
  }

  // Convert display coords to image pixel coords
  function toPixel(pts) {
    const el = imgRef.current;
    if (!el) return pts;
    const sx = el.naturalWidth  / el.offsetWidth;
    const sy = el.naturalHeight / el.offsetHeight;
    return pts.map(p => ({ x: p.x * sx, y: p.y * sy }));
  }

  // Rect corners with rotation
  function rectPoints(s) {
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
    const a = ((s.rotation || 0) * Math.PI) / 180;
    const cos = Math.cos(a), sin = Math.sin(a);
    return [
      { x: s.x, y: s.y }, { x: s.x + s.w, y: s.y },
      { x: s.x + s.w, y: s.y + s.h }, { x: s.x, y: s.y + s.h },
    ].map(p => ({
      x: cx + (p.x - cx) * cos - (p.y - cy) * sin,
      y: cy + (p.x - cx) * sin + (p.y - cy) * cos,
    }));
  }

  function pointsToSvg(pts) {
    return pts.map(p => `${p.x},${p.y}`).join(' ');
  }

  // ── Rotation handle ─────────────────────────────────────────────────────────

  function rotHandlePos(s) {
    const cx = s.x + s.w / 2;
    const cy = s.y + s.h / 2;
    const a  = ((s.rotation || 0) * Math.PI) / 180;
    const OFFSET = 28;
    return {
      x: cx + (s.h / 2 + OFFSET) * Math.sin(a),
      y: cy - (s.h / 2 + OFFSET) * Math.cos(a),
    };
  }

  function onRotateHandleDown(e, s) {
    e.stopPropagation();
    e.preventDefault();
    rotateCxRef.current = s.x + s.w / 2;
    rotateCyRef.current = s.y + s.h / 2;
    setRotating(true);
  }

  // ── Mouse handlers ──────────────────────────────────────────────────────────

  function onMouseDown(e) {
    if (e.button === 2) return;
    if (rotating) return;
    const pos = getPos(e);

    if (tool === 'rect') {
      setSelected(null);
      startRef.current = pos;
      setDrawing({ x: pos.x, y: pos.y, w: 0, h: 0, rotation: 0 });
    }
    // polygon: handled in onClick
  }

  function onMouseMove(e) {
    const pos = getPos(e);

    if (rotating && selected !== null) {
      const cx    = rotateCxRef.current;
      const cy    = rotateCyRef.current;
      const angle = Math.atan2(pos.y - cy, pos.x - cx) * 180 / Math.PI + 90;
      const norm  = ((angle % 360) + 360) % 360;
      setRotPreview({ id: selected, rotation: norm });
      return;
    }

    if (tool === 'rect' && startRef.current) {
      const x = Math.min(startRef.current.x, pos.x);
      const y = Math.min(startRef.current.y, pos.y);
      const w = Math.abs(pos.x - startRef.current.x);
      const h = Math.abs(pos.y - startRef.current.y);
      setDrawing({ x, y, w, h, rotation: 0 });
    }
  }

  function onMouseUp() {
    if (rotating) {
      setRotating(false);
      if (rotPreview && rotPreview.id === selected) {
        pushHistory(shapes.map(s => s.id === selected ? { ...s, rotation: rotPreview.rotation } : s));
      }
      setRotPreview(null);
      return;
    }
    if (tool === 'rect' && startRef.current && drawing) {
      startRef.current = null;
      if (drawing.w > 4 && drawing.h > 4) {
        pushHistory([...shapes, { id: Date.now(), type: 'rect', ...drawing }]);
      }
      setDrawing(null);
    }
  }

  function onOverlayClick(e) {
    if (tool !== 'polygon') return;
    const pos = getPos(e);
    // Close polygon if clicking near first point
    if (polyPts.length >= 3) {
      const first = polyPts[0];
      const dist = Math.hypot(pos.x - first.x, pos.y - first.y);
      if (dist < 12) {
        pushHistory([...shapes, { id: Date.now(), type: 'polygon', points: polyPts }]);
        setPolyPts([]);
        return;
      }
    }
    setPolyPts(prev => [...prev, pos]);
  }

  function onOverlayDblClick(e) {
    if (tool !== 'polygon') return;
    e.preventDefault();
    if (polyPts.length >= 3) {
      pushHistory([...shapes, { id: Date.now(), type: 'polygon', points: polyPts }]);
    }
    setPolyPts([]);
  }

  const selectedShape = shapes.find(s => s.id === selected);

  // ── Save / Submit ────────────────────────────────────────────────────────────

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const pixelShapes = shapes.map(s => ({
        points: toPixel(s.type === 'rect' ? rectPoints(s) : s.points),
      }));
      await applyMasks(pageName, pixelShapes);
      navigate('/masker');
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed to submit.');
    } finally {
      setSubmitting(false);
    }
  }

  const imageUrl = page ? `${IMAGE_BASE_URL}/${page.image_path}` : null;
  const overlayW = imgRef.current?.offsetWidth  || 0;
  const overlayH = imgRef.current?.offsetHeight || 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', backgroundColor: '#1a1a1a' }}>

      {/* Topbar */}
      <div style={S.topbar}>
        <button className="tb-btn" onClick={() => navigate('/masker')}>← Back</button>
        <span style={S.title}>{pageName}</span>

        <div style={S.sep} />

        {/* Tool selector */}
        {TOOLS.map(t => (
          <button key={t} className="tb-btn" onClick={() => { setTool(t); setPolyPts([]); }}
            style={{ fontWeight: tool === t ? 700 : 400, color: tool === t ? '#1565C0' : undefined }}>
            {t === 'rect' ? 'Rectangle' : 'Polygon'}
          </button>
        ))}

        <div style={S.sep} />

        {/* Undo/redo */}
        <button className="tb-btn" onClick={undo} disabled={histIdx === 0} title="Undo (Ctrl+Z)">↩</button>
        <button className="tb-btn" onClick={redo} disabled={histIdx >= history.length - 1} title="Redo (Ctrl+Y)">↪</button>

        <div style={S.sep} />

        {selectedShape?.type === 'rect' && (
          <span style={{ fontSize: '12px', color: '#888', minWidth: '36px', textAlign: 'center' }}>
            {Math.round((rotating && rotPreview?.id === selected ? rotPreview.rotation : selectedShape.rotation) || 0)}°
          </span>
        )}

        {selected !== null && (
          <button className="tb-btn" style={{ color: '#c62828' }} onClick={deleteSelected}>
            Delete
          </button>
        )}

        <span style={{ fontSize: '12px', color: '#888', marginLeft: '4px' }}>
          {shapes.length} mask{shapes.length !== 1 ? 's' : ''}
        </span>

        <div style={S.sep} />
        <button className="tb-btn btn-export" onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Submitting…' : 'Done'}
        </button>
      </div>

      {/* Canvas area */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '16px' }}>
        <div style={{ position: 'relative', display: 'inline-block', userSelect: 'none' }}>

          {imageUrl && (
            <img
              ref={imgRef}
              src={imageUrl}
              alt={pageName}
              style={{ display: 'block', maxHeight: 'calc(100vh - 80px)', maxWidth: '100%' }}
              draggable={false}
              onLoad={() => setImgLoaded(true)}
            />
          )}

          {/* SVG overlay */}
          {imgLoaded && (
            <svg
              ref={overlayRef}
              style={{ position: 'absolute', inset: 0, cursor: rotating ? 'grabbing' : 'crosshair', overflow: 'visible' }}
              width={overlayW}
              height={overlayH}
              onMouseDown={tool === 'rect' ? onMouseDown : undefined}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
              onClick={onOverlayClick}
              onDoubleClick={onOverlayDblClick}
            >
              {/* Completed shapes */}
              {shapes.map(s => {
                const live = (rotating && rotPreview && rotPreview.id === s.id)
                  ? { ...s, rotation: rotPreview.rotation }
                  : s;
                const pts = live.type === 'rect' ? rectPoints(live) : live.points;
                const isSelected = s.id === selected;
                return (
                  <polygon
                    key={s.id}
                    points={pointsToSvg(pts)}
                    fill={isSelected ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.85)'}
                    stroke={isSelected ? '#2196F3' : '#000'}
                    strokeWidth={isSelected ? 2 : 1}
                    style={{ cursor: 'pointer' }}
                    onClick={e => { e.stopPropagation(); setSelected(s.id === selected ? null : s.id); }}
                  />
                );
              })}

              {/* Rotation handle for selected rect */}
              {selectedShape?.type === 'rect' && (() => {
                const s   = (rotating && rotPreview?.id === selected)
                  ? { ...selectedShape, rotation: rotPreview.rotation }
                  : selectedShape;
                const cx  = s.x + s.w / 2;
                const cy  = s.y + s.h / 2;
                const θ   = (s.rotation || 0) * Math.PI / 180;
                const tx  = cx + (s.h / 2) * Math.sin(θ);
                const ty  = cy - (s.h / 2) * Math.cos(θ);
                const hp  = rotHandlePos(s);
                return (
                  <g>
                    <line x1={tx} y1={ty} x2={hp.x} y2={hp.y}
                      stroke="#2196F3" strokeWidth={1.5} strokeDasharray="3 2" pointerEvents="none" />
                    <circle cx={hp.x} cy={hp.y} r={7}
                      fill="#fff" stroke="#2196F3" strokeWidth={2}
                      style={{ cursor: 'grab' }}
                      onMouseDown={e => onRotateHandleDown(e, s)} />
                  </g>
                );
              })()}

              {/* In-progress rect */}
              {drawing && (
                <rect
                  x={drawing.x} y={drawing.y} width={drawing.w} height={drawing.h}
                  fill="rgba(0,0,0,0.45)"
                  stroke="#fff"
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
              )}

              {/* In-progress polygon */}
              {polyPts.length > 0 && (
                <>
                  {polyPts.length >= 2 && (
                    <polyline
                      points={pointsToSvg(polyPts)}
                      fill="none"
                      stroke="#fff"
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                    />
                  )}
                  {polyPts.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r={i === 0 ? 7 : 4}
                      fill={i === 0 ? 'rgba(33,150,243,0.6)' : '#fff'}
                      stroke={i === 0 ? '#2196F3' : '#aaa'}
                      strokeWidth={1}
                    />
                  ))}
                </>
              )}
            </svg>
          )}
        </div>
      </div>

      <div style={{ padding: '6px 16px', backgroundColor: '#111', color: '#666', fontSize: '11px', flexShrink: 0 }}>
        {tool === 'rect'
          ? 'Drag to draw a rectangle. Select a shape to rotate or delete it.'
          : 'Click to add polygon points. Click the first point (blue) or double-click to close.'}
        {' · Ctrl+Z undo · Ctrl+Y redo · Del removes selected'}
      </div>
    </div>
  );
}

const S = {
  topbar: {
    display: 'flex', alignItems: 'center', height: '48px', padding: '0 12px',
    backgroundColor: '#fff', borderBottom: '1px solid #e2e4e7',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)', flexShrink: 0, gap: '4px', flexWrap: 'nowrap', overflowX: 'auto',
  },
  title: { fontSize: '13px', color: '#444', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' },
  sep: { width: '1px', height: '20px', backgroundColor: '#e2e4e7', flexShrink: 0, margin: '0 2px' },
};

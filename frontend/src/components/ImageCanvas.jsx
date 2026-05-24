import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Line, Circle, Transformer } from 'react-konva';
import useImage from 'use-image';
import { getTagColour } from '../tags/tagSchemas.js';

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function useStageSize(containerRef) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return size;
}

function convexHull(pts) {
  if (pts.length < 3) return pts;
  const sorted = [...pts].sort((a, b) => a.x !== b.x ? a.x - b.x : a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

function minBoundingRect(pts) {
  const hull = convexHull(pts);
  if (hull.length === 0) return null;
  if (hull.length === 1) return { cx: hull[0].x, cy: hull[0].y, w: 2, h: 2, angle: 0 };
  if (hull.length === 2) {
    const [a, b] = hull;
    return { cx: (a.x+b.x)/2, cy: (a.y+b.y)/2, w: Math.hypot(b.x-a.x, b.y-a.y), h: 4, angle: Math.atan2(b.y-a.y, b.x-a.x) };
  }
  let minArea = Infinity, best = null;
  const n = hull.length;
  for (let i = 0; i < n; i++) {
    const a = hull[i], b = hull[(i + 1) % n];
    const edgeDx = b.x - a.x, edgeDy = b.y - a.y;
    const edgeLen = Math.hypot(edgeDx, edgeDy);
    if (edgeLen === 0) continue;
    const ux = edgeDx / edgeLen, uy = edgeDy / edgeLen;
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const p of hull) {
      const dx = p.x - a.x, dy = p.y - a.y;
      const u = dx * ux + dy * uy, v = dx * (-uy) + dy * ux;
      if (u < minU) minU = u; if (u > maxU) maxU = u;
      if (v < minV) minV = v; if (v > maxV) maxV = v;
    }
    const w = maxU - minU, h = maxV - minV, area = w * h;
    if (area < minArea) {
      minArea = area;
      const midU = (minU + maxU) / 2, midV = (minV + maxV) / 2;
      best = {
        cx: a.x + midU * ux + midV * (-uy),
        cy: a.y + midU * uy + midV * ux,
        w, h, angle: Math.atan2(edgeDy, edgeDx),
      };
    }
  }
  return best;
}

const ImageCanvas = forwardRef(function ImageCanvas({
  imageUrl, boxes, selectedBoxId, childMode, childParentBox, polyMode,
  onBoxCreated, onBoxSelect, onBoxDeselect, onBoxDelete, onBoxGeomUpdate,
}, ref) {
  const containerRef = useRef(null);
  const stageSize = useStageSize(containerRef);
  const [konvaImage, imageStatus] = useImage(imageUrl, 'anonymous');

  const isDrawingRef = useRef(false);
  const drawStartRef = useRef(null);
  const [drawBox, setDrawBox] = useState(null);

  // Polygon state — keep ref in sync so callbacks are never stale
  const [polyPoints, setPolyPoints] = useState([]);
  const polyPointsRef = useRef([]);
  const [polyMouse, setPolyMouse] = useState(null);

  const transformerRef = useRef(null);
  const rectRefsMap = useRef({});

  // ── Layout ───────────────────────────────────────────────────────────────
  const { width: sw, height: sh } = stageSize;
  let displayW = 0, displayH = 0, offsetX = 0, offsetY = 0;
  if (konvaImage && sw > 0 && sh > 0) {
    const iw = konvaImage.naturalWidth || konvaImage.width;
    const ih = konvaImage.naturalHeight || konvaImage.height;
    if (iw > 0 && ih > 0) {
      const imgAspect = iw / ih, ctrAspect = sw / sh;
      if (imgAspect > ctrAspect) { displayW = sw; displayH = sw / imgAspect; }
      else { displayH = sh; displayW = sh * imgAspect; }
      offsetX = (sw - displayW) / 2;
      offsetY = (sh - displayH) / 2;
    }
  }

  // Always-current refs so callbacks never capture stale values
  const layoutRef = useRef({ displayW, displayH, offsetX, offsetY });
  layoutRef.current = { displayW, displayH, offsetX, offsetY };
  const onBoxCreatedRef = useRef(onBoxCreated);
  onBoxCreatedRef.current = onBoxCreated;

  function pctToStage(x, y, w, h) {
    return { x: offsetX + x * displayW, y: offsetY + y * displayH, w: w * displayW, h: h * displayH };
  }

  // Parent box stage bounds for child mode constraint
  const parentStageBounds = childParentBox
    ? pctToStage(childParentBox.x, childParentBox.y, childParentBox.width, childParentBox.height)
    : null;

  // ── Expose finish polygon to parent via ref ───────────────────────────────
  useImperativeHandle(ref, () => ({
    finishPolygon: () => finishPolygon(polyPointsRef.current),
    clearPolygon: () => { polyPointsRef.current = []; setPolyPoints([]); setPolyMouse(null); },
    polyPointCount: () => polyPointsRef.current.length,
  }));

  // ── Transformer ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!transformerRef.current) return;
    const node = rectRefsMap.current[selectedBoxId];
    transformerRef.current.nodes(node ? [node] : []);
    transformerRef.current.getLayer()?.batchDraw();
  }, [selectedBoxId, boxes]);

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e) {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedBoxId) {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
        onBoxDelete(selectedBoxId);
      }
      if (e.key === 'Escape') {
        polyPointsRef.current = [];
        setPolyPoints([]);
        setPolyMouse(null);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedBoxId, onBoxDelete]);

  useEffect(() => {
    polyPointsRef.current = [];
    setPolyPoints([]);
    setPolyMouse(null);
  }, [polyMode]);

  // ── Polygon finish ────────────────────────────────────────────────────────
  const finishPolygon = useCallback((pts) => {
    if (pts.length < 3) return;
    const rect = minBoundingRect(pts);
    if (!rect) return;
    const { displayW: dW, displayH: dH, offsetX: oX, offsetY: oY } = layoutRef.current;
    const minPx = Math.min(dW, dH) * 0.005;
    if (rect.w < minPx || rect.h < minPx) return;
    const centerX = (rect.cx - oX) / dW;
    const centerY = (rect.cy - oY) / dH;
    const wPct = rect.w / dW;
    const hPct = rect.h / dH;
    const rotDeg = (rect.angle * 180) / Math.PI;
    onBoxCreatedRef.current({
      x: centerX - wPct / 2,
      y: centerY - hPct / 2,
      width: wPct,
      height: hPct,
      rotation: rotDeg,
    });
    polyPointsRef.current = [];
    setPolyPoints([]);
    setPolyMouse(null);
  }, []);

  // ── Stage handlers ────────────────────────────────────────────────────────
  const handleStageMouseDown = useCallback((e) => {
    const clickedOnStage = e.target === e.target.getStage();
    const clickedOnImage = e.target.className === 'Image';
    const clickedOnRect = e.target.className === 'Rect';

    // In polyMode: add points on click
    if (polyMode) {
      if (!clickedOnStage && !clickedOnImage) return;
      const pos = e.target.getStage().getPointerPosition();
      const pts = polyPointsRef.current;

      // Click near first point → close
      if (pts.length >= 3) {
        const dist = Math.hypot(pos.x - pts[0].x, pos.y - pts[0].y);
        if (dist < 20) { finishPolygon(pts); return; }
      }

      const newPts = [...pts, { x: pos.x, y: pos.y }];
      polyPointsRef.current = newPts;
      setPolyPoints(newPts);
      return;
    }

    // In childMode: allow clicking anywhere including over boxes
    if (childMode) {
      const pos = e.target.getStage().getPointerPosition();
      let { x, y } = pos;
      if (parentStageBounds) {
        x = clamp(x, parentStageBounds.x, parentStageBounds.x + parentStageBounds.w);
        y = clamp(y, parentStageBounds.y, parentStageBounds.y + parentStageBounds.h);
      }
      isDrawingRef.current = true;
      drawStartRef.current = { x, y };
      setDrawBox({ x, y, w: 0, h: 0 });
      return;
    }

    // Normal mode: only draw on background
    if (!clickedOnStage && !clickedOnImage) return;
    onBoxDeselect();
    const pos = e.target.getStage().getPointerPosition();
    isDrawingRef.current = true;
    drawStartRef.current = pos;
    setDrawBox({ x: pos.x, y: pos.y, w: 0, h: 0 });
  }, [polyMode, childMode, onBoxDeselect, finishPolygon, parentStageBounds]);

  const handleStageMouseMove = useCallback((e) => {
    const pos = e.target.getStage().getPointerPosition();
    if (polyMode) { setPolyMouse(pos); return; }
    if (!isDrawingRef.current) return;
    let { x, y } = pos;
    if (childMode && parentStageBounds) {
      x = clamp(x, parentStageBounds.x, parentStageBounds.x + parentStageBounds.w);
      y = clamp(y, parentStageBounds.y, parentStageBounds.y + parentStageBounds.h);
    }
    const sx = drawStartRef.current.x, sy = drawStartRef.current.y;
    setDrawBox({ x: Math.min(sx, x), y: Math.min(sy, y), w: Math.abs(x - sx), h: Math.abs(y - sy) });
  }, [polyMode, childMode, parentStageBounds]);

  const handleStageMouseUp = useCallback(() => {
    if (polyMode || !isDrawingRef.current) return;
    isDrawingRef.current = false;
    const db = drawBox;
    setDrawBox(null);
    const { displayW: dW, displayH: dH, offsetX: oX, offsetY: oY } = layoutRef.current;
    const minPx = Math.min(dW, dH) * 0.005;
    if (!db || db.w < minPx || db.h < minPx) return;
    const tlX = clamp((db.x - oX) / dW, 0, 1);
    const tlY = clamp((db.y - oY) / dH, 0, 1);
    const brX = clamp((db.x + db.w - oX) / dW, 0, 1);
    const brY = clamp((db.y + db.h - oY) / dH, 0, 1);
    onBoxCreatedRef.current({ x: tlX, y: tlY, width: brX - tlX, height: brY - tlY });
  }, [drawBox, polyMode]);

  // ── Transform / drag end ──────────────────────────────────────────────────
  const handleTransformEnd = useCallback((boxId) => {
    const node = rectRefsMap.current[boxId];
    if (!node) return;
    const scaleX = node.scaleX(), scaleY = node.scaleY();
    node.scaleX(1); node.scaleY(1);
    const newW = node.width() * scaleX, newH = node.height() * scaleY;
    const cx = node.x(), cy = node.y();
    const { displayW: dW, displayH: dH, offsetX: oX, offsetY: oY } = layoutRef.current;
    onBoxGeomUpdate(boxId, {
      x: (cx - newW / 2 - oX) / dW,
      y: (cy - newH / 2 - oY) / dH,
      width: newW / dW,
      height: newH / dH,
      rotation: node.rotation(),
    });
  }, [onBoxGeomUpdate]);

  const handleDragEnd = useCallback((boxId) => {
    const node = rectRefsMap.current[boxId];
    if (!node) return;
    const box = boxes.find((b) => b.id === boxId);
    if (!box) return;
    const cx = node.x(), cy = node.y();
    const { displayW: dW, displayH: dH, offsetX: oX, offsetY: oY } = layoutRef.current;
    const hw = box.width * dW / 2, hh = box.height * dH / 2;
    onBoxGeomUpdate(boxId, {
      x: (cx - hw - oX) / dW, y: (cy - hh - oY) / dH,
      width: box.width, height: box.height, rotation: box.rotation ?? 0,
    });
  }, [boxes, onBoxGeomUpdate]);

  // ── Render ────────────────────────────────────────────────────────────────
  const polyLinePoints = polyPoints.flatMap((p) => [p.x, p.y]);
  if (polyMouse && polyPoints.length > 0) polyLinePoints.push(polyMouse.x, polyMouse.y);

  const btnBase = {
    padding: '6px 14px', fontSize: '12px', border: 'none', borderRadius: '4px',
    cursor: 'pointer', fontWeight: '600',
  };

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      {sw > 0 && sh > 0 && (
        <Stage
          width={sw} height={sh}
          onMouseDown={handleStageMouseDown}
          onMouseMove={handleStageMouseMove}
          onMouseUp={handleStageMouseUp}
          onTouchStart={handleStageMouseDown}
          onTouchMove={handleStageMouseMove}
          onTouchEnd={handleStageMouseUp}
          style={{ cursor: 'crosshair' }}
        >
          <Layer>
            {konvaImage && displayW > 0 && (
              <KonvaImage image={konvaImage} x={offsetX} y={offsetY} width={displayW} height={displayH} listening={true} />
            )}

            {/* Parent box highlight in child mode */}
            {childMode && childParentBox && parentStageBounds && (() => {
              const { x, y, w, h } = parentStageBounds;
              const cx = x + w / 2, cy = y + h / 2;
              return (
                <Rect
                  x={cx} y={cy} width={w} height={h}
                  offsetX={w / 2} offsetY={h / 2}
                  rotation={childParentBox.rotation ?? 0}
                  stroke="#FF9800" strokeWidth={3} dash={[8, 4]}
                  fill="rgba(255,152,0,0.06)" listening={false}
                />
              );
            })()}

            {boxes.map((box) => {
              const { x, y, w, h } = pctToStage(box.x, box.y, box.width, box.height);
              const isSelected = box.id === selectedBoxId;
              const colour = getTagColour(box.tag_category);
              const rotDeg = box.rotation ?? 0;
              const cx = x + w / 2, cy = y + h / 2;
              return (
                <Rect
                  key={box.id}
                  ref={(node) => { if (node) rectRefsMap.current[box.id] = node; else delete rectRefsMap.current[box.id]; }}
                  x={cx} y={cy} width={w} height={h}
                  offsetX={w / 2} offsetY={h / 2}
                  rotation={rotDeg}
                  stroke={colour} strokeWidth={isSelected ? 3 : 2}
                  fill={isSelected ? `${colour}22` : `${colour}11`}
                  // In childMode rects don't intercept clicks — clicks fall to stage for drawing
                  listening={!childMode && !polyMode}
                  draggable={isSelected && !childMode && !polyMode}
                  onClick={(e) => { e.cancelBubble = true; onBoxSelect(box.id); }}
                  onTap={(e) => { e.cancelBubble = true; onBoxSelect(box.id); }}
                  onDragEnd={() => handleDragEnd(box.id)}
                  onTransformEnd={() => handleTransformEnd(box.id)}
                />
              );
            })}

            {/* In-progress rect */}
            {drawBox && drawBox.w > 2 && drawBox.h > 2 && (
              <Rect
                x={drawBox.x} y={drawBox.y} width={drawBox.w} height={drawBox.h}
                stroke={childMode ? '#FF9800' : '#fff'} strokeWidth={childMode ? 2 : 1}
                dash={[4, 4]} fill={childMode ? 'rgba(255,152,0,0.08)' : 'rgba(255,255,255,0.05)'}
                listening={false}
              />
            )}

            {/* Polygon in progress */}
            {polyMode && polyLinePoints.length >= 4 && (
              <Line points={polyLinePoints} stroke="#E91E63" strokeWidth={2} dash={[6, 3]} listening={false} />
            )}
            {polyMode && polyPoints.map((p, i) => (
              <Circle key={i} x={p.x} y={p.y} radius={i === 0 ? 8 : 5}
                fill={i === 0 ? '#E91E63' : '#fff'} stroke="#E91E63" strokeWidth={2} listening={false} />
            ))}

            <Transformer
              ref={transformerRef}
              rotateEnabled={true} keepRatio={false}
              boundBoxFunc={(old, nw) => (nw.width < 5 || nw.height < 5 ? old : nw)}
            />
          </Layer>
        </Stage>
      )}

      {/* Polygon overlay controls */}
      {polyMode && (
        <div style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 8, alignItems: 'center', pointerEvents: 'all' }}>
          <span style={{ color: '#fff', fontSize: '12px', backgroundColor: 'rgba(0,0,0,0.6)', padding: '4px 10px', borderRadius: 4 }}>
            {polyPoints.length === 0
              ? 'Click to place points'
              : polyPoints.length < 3
              ? `${polyPoints.length} point${polyPoints.length > 1 ? 's' : ''} — need at least 3`
              : `${polyPoints.length} points — click ● or Finish`}
          </span>
          {polyPoints.length >= 3 && (
            <button style={{ ...btnBase, backgroundColor: '#E91E63', color: '#fff' }}
              onClick={() => finishPolygon(polyPointsRef.current)}>
              Finish
            </button>
          )}
          {polyPoints.length > 0 && (
            <button style={{ ...btnBase, backgroundColor: '#555', color: '#fff' }}
              onClick={() => {
                const prev = polyPointsRef.current.slice(0, -1);
                polyPointsRef.current = prev;
                setPolyPoints(prev);
              }}>
              Undo pt
            </button>
          )}
        </div>
      )}

      {imageStatus === 'loading' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: '14px' }}>
          Loading image…
        </div>
      )}
    </div>
  );
});

export default ImageCanvas;

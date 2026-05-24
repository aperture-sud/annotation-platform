import { useState, useRef, useEffect, useCallback } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Transformer } from 'react-konva';
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

export default function ImageCanvas({
  imageUrl,
  boxes,
  selectedBoxId,
  childMode,
  onBoxCreated,
  onBoxSelect,
  onBoxDeselect,
  onBoxDelete,
  onBoxGeomUpdate,
}) {
  const containerRef = useRef(null);
  const stageSize = useStageSize(containerRef);
  const [konvaImage, imageStatus] = useImage(imageUrl, 'anonymous');

  // Drawing state
  const isDrawingRef = useRef(false);
  const drawStartRef = useRef(null);
  const [drawBox, setDrawBox] = useState(null); // { x, y, w, h } in stage pixels

  // Transformer refs
  const transformerRef = useRef(null);
  const rectRefsMap = useRef({});

  // ── Layout calculation ────────────────────────────────────────────────────
  const { width: sw, height: sh } = stageSize;
  let displayW = 0, displayH = 0, offsetX = 0, offsetY = 0;

  if (konvaImage && sw > 0 && sh > 0) {
    const iw = konvaImage.naturalWidth || konvaImage.width;
    const ih = konvaImage.naturalHeight || konvaImage.height;
    if (iw > 0 && ih > 0) {
      const imgAspect = iw / ih;
      const ctrAspect = sw / sh;
      if (imgAspect > ctrAspect) {
        displayW = sw;
        displayH = sw / imgAspect;
      } else {
        displayH = sh;
        displayW = sh * imgAspect;
      }
      offsetX = (sw - displayW) / 2;
      offsetY = (sh - displayH) / 2;
    }
  }

  // pct ↔ stage-pixel conversions
  function pctToStage(x, y, w, h) {
    return {
      x: offsetX + x * displayW,
      y: offsetY + y * displayH,
      w: w * displayW,
      h: h * displayH,
    };
  }

  function stageToPercent(sx, sy) {
    return {
      x: clamp((sx - offsetX) / displayW, 0, 1),
      y: clamp((sy - offsetY) / displayH, 0, 1),
    };
  }

  // ── Transformer wiring ────────────────────────────────────────────────────
  useEffect(() => {
    if (!transformerRef.current) return;
    const node = rectRefsMap.current[selectedBoxId];
    if (node) {
      transformerRef.current.nodes([node]);
    } else {
      transformerRef.current.nodes([]);
    }
    transformerRef.current.getLayer()?.batchDraw();
  }, [selectedBoxId, boxes]);

  // ── Keyboard delete ───────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e) {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedBoxId) {
        // Don't fire when focus is in a form input
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
        onBoxDelete(selectedBoxId);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedBoxId, onBoxDelete]);

  // ── Drawing handlers ──────────────────────────────────────────────────────
  const handleStageMouseDown = useCallback((e) => {
    // Only draw on the background (image or empty stage)
    const clickedOnStage = e.target === e.target.getStage();
    const clickedOnImage = e.target.className === 'Image';
    if (!clickedOnStage && !clickedOnImage) return;

    onBoxDeselect();
    const pos = e.target.getStage().getPointerPosition();
    isDrawingRef.current = true;
    drawStartRef.current = pos;
    setDrawBox({ x: pos.x, y: pos.y, w: 0, h: 0 });
  }, [onBoxDeselect]);

  const handleStageMouseMove = useCallback((e) => {
    if (!isDrawingRef.current) return;
    const pos = e.target.getStage().getPointerPosition();
    const sx = drawStartRef.current.x;
    const sy = drawStartRef.current.y;
    setDrawBox({
      x: Math.min(sx, pos.x),
      y: Math.min(sy, pos.y),
      w: Math.abs(pos.x - sx),
      h: Math.abs(pos.y - sy),
    });
  }, []);

  const handleStageMouseUp = useCallback(() => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    const db = drawBox;
    setDrawBox(null);

    // Ignore tiny boxes (< 1% of image dimension)
    const minPx = Math.min(displayW, displayH) * 0.005;
    if (!db || db.w < minPx || db.h < minPx) return;

    const topLeft = stageToPercent(db.x, db.y);
    const botRight = stageToPercent(db.x + db.w, db.y + db.h);
    onBoxCreated({
      x: topLeft.x,
      y: topLeft.y,
      width: botRight.x - topLeft.x,
      height: botRight.y - topLeft.y,
    });
  }, [drawBox, displayW, displayH, offsetX, offsetY, onBoxCreated]);

  // ── Transform end — commit new geometry ───────────────────────────────────
  const handleTransformEnd = useCallback((boxId) => {
    const node = rectRefsMap.current[boxId];
    if (!node) return;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    node.scaleX(1);
    node.scaleY(1);

    const newX = node.x();
    const newY = node.y();
    const newW = node.width() * scaleX;
    const newH = node.height() * scaleY;

    const tl = stageToPercent(newX, newY);
    const br = stageToPercent(newX + newW, newY + newH);
    onBoxGeomUpdate(boxId, {
      x: tl.x, y: tl.y,
      width: br.x - tl.x,
      height: br.y - tl.y,
    });
  }, [displayW, displayH, offsetX, offsetY, onBoxGeomUpdate]);

  const handleDragEnd = useCallback((boxId) => {
    const node = rectRefsMap.current[boxId];
    if (!node) return;
    const tl = stageToPercent(node.x(), node.y());
    const box = boxes.find((b) => b.id === boxId);
    if (!box) return;
    const br = stageToPercent(node.x() + box.width * displayW, node.y() + box.height * displayH);
    onBoxGeomUpdate(boxId, {
      x: tl.x, y: tl.y,
      width: br.x - tl.x,
      height: br.y - tl.y,
    });
  }, [boxes, displayW, displayH, offsetX, offsetY, onBoxGeomUpdate]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      {sw > 0 && sh > 0 && (
        <Stage
          width={sw}
          height={sh}
          onMouseDown={handleStageMouseDown}
          onMouseMove={handleStageMouseMove}
          onMouseUp={handleStageMouseUp}
          onTouchStart={handleStageMouseDown}
          onTouchMove={handleStageMouseMove}
          onTouchEnd={handleStageMouseUp}
          style={{ cursor: childMode ? 'cell' : 'crosshair' }}
        >
          <Layer>
            {/* Background image */}
            {konvaImage && displayW > 0 && (
              <KonvaImage
                image={konvaImage}
                x={offsetX}
                y={offsetY}
                width={displayW}
                height={displayH}
                listening={true}
              />
            )}

            {/* Existing boxes */}
            {boxes.map((box) => {
              const { x, y, w, h } = pctToStage(box.x, box.y, box.width, box.height);
              const isSelected = box.id === selectedBoxId;
              const colour = getTagColour(box.tag_category);
              return (
                <Rect
                  key={box.id}
                  ref={(node) => { if (node) rectRefsMap.current[box.id] = node; else delete rectRefsMap.current[box.id]; }}
                  x={x} y={y} width={w} height={h}
                  stroke={colour}
                  strokeWidth={isSelected ? 3 : 2}
                  fill={isSelected ? `${colour}22` : `${colour}11`}
                  draggable={isSelected}
                  onClick={(e) => { e.cancelBubble = true; onBoxSelect(box.id); }}
                  onTap={(e) => { e.cancelBubble = true; onBoxSelect(box.id); }}
                  onDragEnd={() => handleDragEnd(box.id)}
                  onTransformEnd={() => handleTransformEnd(box.id)}
                />
              );
            })}

            {/* Currently drawn box */}
            {drawBox && drawBox.w > 2 && drawBox.h > 2 && (
              <Rect
                x={drawBox.x} y={drawBox.y}
                width={drawBox.w} height={drawBox.h}
                stroke={childMode ? '#FF9800' : '#ffffff'}
                strokeWidth={childMode ? 2 : 1}
                dash={[4, 4]}
                fill={childMode ? 'rgba(255,152,0,0.08)' : 'rgba(255,255,255,0.05)'}
                listening={false}
              />
            )}

            {/* Transformer for selected box */}
            <Transformer
              ref={transformerRef}
              rotateEnabled={false}
              keepRatio={false}
              boundBoxFunc={(oldBox, newBox) =>
                newBox.width < 5 || newBox.height < 5 ? oldBox : newBox
              }
            />
          </Layer>
        </Stage>
      )}

      {imageStatus === 'loading' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: '14px' }}>
          Loading image…
        </div>
      )}
    </div>
  );
}

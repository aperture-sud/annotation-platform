import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Cropper from 'react-easy-crop';
import { uploadFiles } from '../api/client.js';

// ── Perspective warp math ─────────────────────────────────────────────────────

function matMul3(A, B) {
  const C = [[0,0,0],[0,0,0],[0,0,0]];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      for (let k = 0; k < 3; k++)
        C[i][j] += A[i][k] * B[k][j];
  return C;
}

function matAdj3(m) {
  return [
    [ m[1][1]*m[2][2]-m[1][2]*m[2][1], m[0][2]*m[2][1]-m[0][1]*m[2][2], m[0][1]*m[1][2]-m[0][2]*m[1][1] ],
    [ m[1][2]*m[2][0]-m[1][0]*m[2][2], m[0][0]*m[2][2]-m[0][2]*m[2][0], m[0][2]*m[1][0]-m[0][0]*m[1][2] ],
    [ m[1][0]*m[2][1]-m[1][1]*m[2][0], m[0][1]*m[2][0]-m[0][0]*m[2][1], m[0][0]*m[1][1]-m[0][1]*m[1][0] ],
  ];
}

// Maps unit square [0,0],[1,0],[1,1],[0,1] → quad pts (TL,TR,BR,BL)
function squareToQuad(pts) {
  const [p0, p1, p2, p3] = pts;
  const dx1 = p1[0]-p2[0], dy1 = p1[1]-p2[1];
  const dx2 = p3[0]-p2[0], dy2 = p3[1]-p2[1];
  const sx = p0[0]-p1[0]+p2[0]-p3[0], sy = p0[1]-p1[1]+p2[1]-p3[1];
  const d = dx1*dy2 - dx2*dy1;
  const g = (sx*dy2 - dx2*sy) / d;
  const h = (dx1*sy - sx*dy1) / d;
  return [
    [p1[0]-p0[0]+g*p1[0], p3[0]-p0[0]+h*p3[0], p0[0]],
    [p1[1]-p0[1]+g*p1[1], p3[1]-p0[1]+h*p3[1], p0[1]],
    [g, h, 1],
  ];
}

function applyH(H, x, y) {
  const w = H[2][0]*x + H[2][1]*y + H[2][2];
  return [(H[0][0]*x + H[0][1]*y + H[0][2])/w, (H[1][0]*x + H[1][1]*y + H[1][2])/w];
}

function createImageEl(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.addEventListener('load', () => res(img));
    img.addEventListener('error', rej);
    img.src = url;
  });
}

// src4pts: [[x,y],…] in image-pixel coords, order TL TR BR BL
// Returns a Blob of the warped A4 image
async function perspectiveWarp(imageSrc, src4pts) {
  const image = await createImageEl(imageSrc);
  const iw = image.naturalWidth, ih = image.naturalHeight;

  // A4 at 150 DPI
  const outW = 1240, outH = 1754;
  const dstPts = [[0,0],[outW,0],[outW,outH],[0,outH]];

  // H maps dst → src (inverse, for sampling)
  const H1 = squareToQuad(src4pts.map(([x,y]) => [x/iw, y/ih]));
  const H2 = squareToQuad(dstPts.map(([x,y]) => [x/outW, y/outH]));
  const Hinv = matMul3(
    squareToQuad(src4pts.map(([x,y]) => [x,y])),
    matAdj3(squareToQuad(dstPts))
  );
  // Simpler: build H directly (dst→src)
  const Hfwd = matMul3(squareToQuad(src4pts), matAdj3(squareToQuad(dstPts)));

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = iw; srcCanvas.height = ih;
  srcCanvas.getContext('2d').drawImage(image, 0, 0);
  const srcPx = srcCanvas.getContext('2d').getImageData(0, 0, iw, ih).data;

  const dstCanvas = document.createElement('canvas');
  dstCanvas.width = outW; dstCanvas.height = outH;
  const dstCtx = dstCanvas.getContext('2d');
  const dstImg = dstCtx.createImageData(outW, outH);
  const dst = dstImg.data;

  for (let dy = 0; dy < outH; dy++) {
    for (let dx = 0; dx < outW; dx++) {
      const [sx, sy] = applyH(Hfwd, dx, dy);
      const fx = Math.floor(sx), fy = Math.floor(sy);
      if (fx < 0 || fy < 0 || fx >= iw-1 || fy >= ih-1) continue;
      const ax = sx-fx, ay = sy-fy;
      const i00 = (fy*iw+fx)*4, i10 = (fy*iw+fx+1)*4;
      const i01 = ((fy+1)*iw+fx)*4, i11 = ((fy+1)*iw+fx+1)*4;
      const di = (dy*outW+dx)*4;
      for (let c = 0; c < 3; c++) {
        dst[di+c] = Math.round(
          srcPx[i00+c]*(1-ax)*(1-ay) + srcPx[i10+c]*ax*(1-ay) +
          srcPx[i01+c]*(1-ax)*ay   + srcPx[i11+c]*ax*ay
        );
      }
      dst[di+3] = 255;
    }
  }
  dstCtx.putImageData(dstImg, 0, 0);
  return new Promise((res, rej) =>
    dstCanvas.toBlob(b => b ? res(b) : rej(new Error('Empty canvas')), 'image/jpeg', 0.9)
  );
}

// ── Crop + brightness/contrast helpers ────────────────────────────────────────

async function getCroppedBlob(imageSrc, pixelCrop, rotation, brightness, contrast) {
  const image = await createImageEl(imageSrc);
  const { naturalWidth: iw, naturalHeight: ih } = image;
  const maxDim = Math.max(iw, ih);
  const safeArea = Math.ceil(2 * ((maxDim / 2) * Math.sqrt(2)));

  const c1 = document.createElement('canvas');
  c1.width = safeArea; c1.height = safeArea;
  const ctx1 = c1.getContext('2d');
  ctx1.translate(safeArea/2, safeArea/2);
  ctx1.rotate((rotation * Math.PI) / 180);
  ctx1.translate(-iw/2, -ih/2);
  const bv = ((brightness + 100) / 100).toFixed(3);
  const cv = ((contrast  + 100) / 100).toFixed(3);
  ctx1.filter = `brightness(${bv}) contrast(${cv})`;
  ctx1.drawImage(image, 0, 0);

  const imgData = ctx1.getImageData(0, 0, safeArea, safeArea);
  const crop = pixelCrop || { x: 0, y: 0, width: iw, height: ih };
  const c2 = document.createElement('canvas');
  c2.width = Math.max(1, crop.width);
  c2.height = Math.max(1, crop.height);
  const ctx2 = c2.getContext('2d');
  const offsetX = (safeArea - iw) / 2;
  const offsetY = (safeArea - ih) / 2;
  ctx2.putImageData(imgData, -(offsetX + crop.x), -(offsetY + crop.y));

  return new Promise((res, rej) =>
    c2.toBlob(b => b ? res(b) : rej(new Error('Empty canvas')), 'image/jpeg', 0.88)
  );
}

// ── Polygon → min-bounding-rect helpers ──────────────────────────────────────

function convexHullPts(pts) {
  if (pts.length < 3) return pts;
  const sorted = [...pts].sort((a, b) => a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]);
  const cross = (o, a, b) => (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0]);
  const lower = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length-2], lower[lower.length-1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = sorted.length-1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length-2], upper[upper.length-1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

// Returns 4 corners of min bounding rect: [TL, TR, BR, BL] in image pixel coords
function polyTo4Corners(pts) {
  const hull = convexHullPts(pts);
  if (hull.length < 2) return null;
  const n = hull.length;
  let minArea = Infinity, best = null;

  for (let i = 0; i < n; i++) {
    const a = hull[i], b = hull[(i+1)%n];
    const edgeDx = b[0]-a[0], edgeDy = b[1]-a[1];
    const edgeLen = Math.hypot(edgeDx, edgeDy);
    if (edgeLen === 0) continue;
    const ux = edgeDx/edgeLen, uy = edgeDy/edgeLen;
    let minU=Infinity, maxU=-Infinity, minV=Infinity, maxV=-Infinity;
    for (const p of hull) {
      const dx=p[0]-a[0], dy=p[1]-a[1];
      const u=dx*ux+dy*uy, v=dx*(-uy)+dy*ux;
      if (u<minU) minU=u; if (u>maxU) maxU=u;
      if (v<minV) minV=v; if (v>maxV) maxV=v;
    }
    const area = (maxU-minU)*(maxV-minV);
    if (area < minArea) {
      minArea = area;
      // Centre of the rect
      const midU=(minU+maxU)/2, midV=(minV+maxV)/2;
      const cx = a[0]+midU*ux+midV*(-uy);
      const cy = a[1]+midU*uy+midV*ux;
      const hw=(maxU-minU)/2, hh=(maxV-minV)/2;
      // 4 corners in TL, TR, BR, BL order
      best = [
        [cx - hw*ux - hh*(-uy), cy - hw*uy - hh*ux], // TL
        [cx + hw*ux - hh*(-uy), cy + hw*uy - hh*ux], // TR
        [cx + hw*ux + hh*(-uy), cy + hw*uy + hh*ux], // BR
        [cx - hw*ux + hh*(-uy), cy - hw*uy + hh*ux], // BL
      ];
    }
  }
  return best;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S = {
  page: { display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#111', color: '#fff' },
  topbar: { display: 'flex', alignItems: 'center', padding: '10px 16px', backgroundColor: '#1e1e2e', gap: '12px', flexShrink: 0 },
  topbarTitle: { flex: 1, fontWeight: '600', fontSize: '14px' },
  counter: { fontSize: '13px', color: '#aaa' },
  backBtn: { padding: '6px 14px', border: '1px solid #555', borderRadius: '4px', backgroundColor: 'transparent', color: '#fff', cursor: 'pointer', fontSize: '13px' },

  captureArea: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '20px', padding: '32px' },
  bigBtn: { padding: '18px 36px', fontSize: '18px', borderRadius: '10px', border: 'none', cursor: 'pointer', fontWeight: '700', minWidth: '220px' },
  bigBtnPrimary: { backgroundColor: '#2196F3', color: '#fff' },
  bigBtnSecondary: { backgroundColor: '#333', color: '#fff' },

  editRoot: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  cropWrapper: { flex: 1, position: 'relative' },
  controls: { backgroundColor: '#1a1a2a', padding: '10px 16px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '7px', overflowY: 'auto', maxHeight: '40vh' },
  controlRow: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' },
  controlLabel: { fontSize: '12px', color: '#aaa', minWidth: '80px' },
  slider: { flex: 1, minWidth: '120px', accentColor: '#2196F3' },
  smallBtn: { padding: '5px 12px', fontSize: '12px', borderRadius: '4px', border: '1px solid #555', backgroundColor: '#2a2a3a', color: '#fff', cursor: 'pointer' },
  smallBtnActive: { backgroundColor: '#2196F3', borderColor: '#2196F3' },
  actionRow: { display: 'flex', gap: '10px', padding: '10px 16px', backgroundColor: '#111', flexShrink: 0, flexWrap: 'wrap' },
  actionBtn: { flex: 1, padding: '12px', fontSize: '14px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', minWidth: '100px' },

  thumbStrip: { backgroundColor: '#1a1a2a', overflowX: 'auto', flexShrink: 0 },
  thumbStripInner: { display: 'flex', gap: '8px', padding: '8px 16px' },
  thumbWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', flexShrink: 0, position: 'relative' },
  thumb: { width: '56px', height: '72px', objectFit: 'cover', borderRadius: '4px', border: '2px solid transparent', cursor: 'pointer', display: 'block' },
  thumbName: { fontSize: '10px', color: '#ccc', width: '72px', textAlign: 'center', background: 'none', border: 'none', borderBottom: '1px solid #444', outline: 'none', padding: '1px 2px' },
  thumbDelete: { position: 'absolute', top: '-6px', right: '-6px', width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#F44336', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 },

  // Perspective mode
  perspRoot: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  perspImgArea: { flex: 1, position: 'relative', overflow: 'hidden', backgroundColor: '#000' },
  perspImg: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', userSelect: 'none', pointerEvents: 'none' },
  perspSvg: { position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', touchAction: 'none' },
  perspControls: { backgroundColor: '#1a1a2a', padding: '10px 16px', flexShrink: 0, display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' },
  perspInfo: { flex: 1, fontSize: '12px', color: '#aaa' },
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function ScannerPage() {
  const navigate = useNavigate();

  // 'capture' | 'edit' | 'perspective'
  const [mode, setMode] = useState('capture');
  const [imageSrc, setImageSrc] = useState(null);

  // Committed pages: [{blob, thumbUrl, name}]
  const [pages, setPages] = useState([]);
  const [editingIdx, setEditingIdx] = useState(null);

  // Crop / rotate / filter state
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [aspectRatio, setAspectRatio] = useState(null);
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(20);

  // Perspective mode state
  const [perspCorners, setPerspCorners] = useState([[0.05,0.05],[0.95,0.05],[0.95,0.95],[0.05,0.95]]);
  const perspDraggingRef = useRef(null);
  const perspImgAreaRef = useRef(null);
  const perspImgRef = useRef(null);
  const [perspProcessing, setPerspProcessing] = useState(false);

  // Polygon crop mode state
  const [polyPts, setPolyPts] = useState([]); // [[fx,fy],…] in display-fraction space
  const polyImgAreaRef = useRef(null);
  const polyImgRef = useRef(null);
  const [polyProcessing, setPolyProcessing] = useState(false);

  const [uploading, setUploading] = useState(false);
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);

  const onCropComplete = useCallback((_, pixels) => setCroppedAreaPixels(pixels), []);

  function resetEditState(file) {
    if (!file) return;
    setImageSrc(URL.createObjectURL(file));
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setCroppedAreaPixels(null);
    setBrightness(0);
    setContrast(20);
    setPerspCorners([[0.05,0.05],[0.95,0.05],[0.95,0.95],[0.05,0.95]]);
    setPolyPts([]);
    setMode('edit');
  }

  // Polygon crop helpers
  function getPolyImageDisplayRect() {
    const container = polyImgAreaRef.current;
    const img = polyImgRef.current;
    if (!container || !img) return null;
    const cw = container.clientWidth, ch = container.clientHeight;
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (!iw || !ih) return null;
    const scale = Math.min(cw/iw, ch/ih);
    return { x: (cw-iw*scale)/2, y: (ch-ih*scale)/2, w: iw*scale, h: ih*scale };
  }

  function svgToPolyFrac(svgX, svgY) {
    const r = getPolyImageDisplayRect();
    if (!r) return null;
    return [
      Math.max(0, Math.min(1, (svgX - r.x) / r.w)),
      Math.max(0, Math.min(1, (svgY - r.y) / r.h)),
    ];
  }

  function polyFracToSVG([fx, fy]) {
    const r = getPolyImageDisplayRect();
    if (!r) return [0, 0];
    return [r.x + fx * r.w, r.y + fy * r.h];
  }

  function handlePolySvgClick(e) {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const svgX = e.clientX - rect.left;
    const svgY = e.clientY - rect.top;
    const pt = svgToPolyFrac(svgX, svgY);
    if (!pt) return;

    // Close if clicking near first point (>= 3 pts placed)
    if (polyPts.length >= 3) {
      const [f0x, f0y] = polyFracToSVG(polyPts[0]);
      const dist = Math.hypot(svgX - f0x, svgY - f0y);
      if (dist < 15) { applyPolyCrop(); return; }
    }
    setPolyPts((prev) => [...prev, pt]);
  }

  async function applyPolyCrop() {
    if (polyPts.length < 3 || !imageSrc) return;
    setPolyProcessing(true);
    try {
      const img = polyImgRef.current || await createImageEl(imageSrc);
      const iw = img.naturalWidth, ih = img.naturalHeight;
      // Convert fraction points to image pixel coords
      const pxPts = polyPts.map(([fx, fy]) => [fx * iw, fy * ih]);
      const corners = polyTo4Corners(pxPts);
      if (!corners) throw new Error('Could not compute bounding rectangle');
      const blob = await perspectiveWarp(imageSrc, corners);
      const newUrl = URL.createObjectURL(blob);
      setImageSrc(newUrl);
      setPolyPts([]);
      setMode('edit');
    } catch (e) {
      console.error('Polygon crop failed', e);
      alert('Polygon crop failed: ' + e.message);
    } finally {
      setPolyProcessing(false);
    }
  }

  function handleCameraChange(e) { resetEditState(e.target.files[0]); e.target.value = ''; }
  function handleGalleryChange(e) { resetEditState(e.target.files[0]); e.target.value = ''; }

  function setDocMode() { setBrightness(20); setContrast(60); }

  async function processCurrentPage() {
    if (!imageSrc) return null;
    const blob = await getCroppedBlob(imageSrc, croppedAreaPixels, rotation, brightness, contrast);
    const thumbUrl = URL.createObjectURL(blob);
    return { blob, thumbUrl, name: `Page ${pages.length + 1}` };
  }

  async function handleAddAnother() {
    const pg = await processCurrentPage();
    if (!pg) return;
    if (editingIdx !== null) {
      setPages((prev) => { const a = [...prev]; a[editingIdx] = { ...a[editingIdx], blob: pg.blob, thumbUrl: pg.thumbUrl }; return a; });
      setEditingIdx(null);
    } else {
      setPages((prev) => [...prev, { ...pg, name: `Page ${prev.length + 1}` }]);
    }
    setImageSrc(null);
    setMode('capture');
  }

  async function handleDone() {
    const pg = await processCurrentPage();
    if (!pg) return;
    const allPages = editingIdx !== null
      ? pages.map((p, i) => (i === editingIdx ? { ...p, blob: pg.blob, thumbUrl: pg.thumbUrl } : p))
      : [...pages, { ...pg, name: `Page ${pages.length + 1}` }];
    setUploading(true);
    try {
      const files = allPages.map((p, i) =>
        new File([p.blob], `${p.name || `page_${i+1}`}.jpg`, { type: 'image/jpeg' })
      );
      await uploadFiles(files);
      navigate('/');
    } catch (e) {
      console.error('Upload failed', e);
      alert('Upload failed. Is the backend running?');
    } finally {
      setUploading(false);
    }
  }

  function handleRetake() { setImageSrc(null); setMode('capture'); }

  function handleEditThumb(idx) {
    const pg = pages[idx];
    if (!pg) return;
    setImageSrc(pg.thumbUrl);
    setCrop({ x: 0, y: 0 }); setZoom(1); setRotation(0);
    setCroppedAreaPixels(null); setBrightness(0); setContrast(20);
    setPerspCorners([[0.05,0.05],[0.95,0.05],[0.95,0.95],[0.05,0.95]]);
    setPolyPts([]);
    setEditingIdx(idx);
    setMode('edit');
  }

  function handleDeleteThumb(idx) {
    setPages((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleRenamePage(idx, name) {
    setPages((prev) => prev.map((p, i) => (i === idx ? { ...p, name } : p)));
  }

  // ── Perspective mode ─────────────────────────────────────────────────────

  // Get the displayed image rect within the perspImgArea
  function getImageDisplayRect() {
    const container = perspImgAreaRef.current;
    const img = perspImgRef.current;
    if (!container || !img) return null;
    const cw = container.clientWidth, ch = container.clientHeight;
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (!iw || !ih) return null;
    const scale = Math.min(cw/iw, ch/ih);
    const dw = iw*scale, dh = ih*scale;
    return { x: (cw-dw)/2, y: (ch-dh)/2, w: dw, h: dh };
  }

  // Convert display-fraction [0-1] to SVG pixel coords
  function cornerToSVG([fx, fy]) {
    const r = getImageDisplayRect();
    if (!r) return [0, 0];
    return [r.x + fx*r.w, r.y + fy*r.h];
  }

  function svgToCorner(svgX, svgY) {
    const r = getImageDisplayRect();
    if (!r) return [0, 0];
    return [
      Math.max(0, Math.min(1, (svgX - r.x) / r.w)),
      Math.max(0, Math.min(1, (svgY - r.y) / r.h)),
    ];
  }

  function perspPointerDown(e, idx) {
    e.preventDefault();
    perspDraggingRef.current = idx;
    e.currentTarget.closest('svg').setPointerCapture(e.pointerId);
  }

  function perspPointerMove(e) {
    if (perspDraggingRef.current === null) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const svgX = e.clientX - rect.left;
    const svgY = e.clientY - rect.top;
    const corner = svgToCorner(svgX, svgY);
    setPerspCorners((prev) => prev.map((c, i) => i === perspDraggingRef.current ? corner : c));
  }

  function perspPointerUp() { perspDraggingRef.current = null; }

  async function applyPerspectiveWarp() {
    if (!imageSrc) return;
    setPerspProcessing(true);
    try {
      const img = perspImgRef.current || await createImageEl(imageSrc);
      const iw = img.naturalWidth, ih = img.naturalHeight;
      const src4 = perspCorners.map(([fx, fy]) => [fx*iw, fy*ih]);
      const blob = await perspectiveWarp(imageSrc, src4);
      const newUrl = URL.createObjectURL(blob);
      setImageSrc(newUrl);
      setPerspCorners([[0.05,0.05],[0.95,0.05],[0.95,0.95],[0.05,0.95]]);
      setMode('edit');
    } catch (e) {
      console.error('Perspective warp failed', e);
      alert('Warp failed: ' + e.message);
    } finally {
      setPerspProcessing(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const filterStyle = `brightness(${((brightness+100)/100).toFixed(2)}) contrast(${((contrast+100)/100).toFixed(2)})`;
  const totalPages = pages.length + (mode === 'edit' && editingIdx === null ? 1 : 0);
  const currentPageNum = editingIdx !== null ? editingIdx + 1 : pages.length + 1;

  return (
    <div style={S.page}>
      {/* Top bar */}
      <div style={S.topbar}>
        <button style={S.backBtn} onClick={() => navigate('/')}>← Home</button>
        <span style={S.topbarTitle}>Scanner</span>
        {(mode === 'edit' || mode === 'perspective') && (
          <span style={S.counter}>
            Page {currentPageNum}{totalPages > 1 ? ` of ${totalPages}` : ''}
          </span>
        )}
      </div>

      {/* ── CAPTURE MODE ── */}
      {mode === 'capture' && (
        <div style={S.captureArea}>
          <div style={{ textAlign: 'center', color: '#aaa', marginBottom: '8px', fontSize: '15px' }}>
            {pages.length > 0
              ? `${pages.length} page${pages.length > 1 ? 's' : ''} captured. Add another or finish.`
              : 'Capture or upload an image of an answer sheet.'}
          </div>

          <button style={{ ...S.bigBtn, ...S.bigBtnPrimary }} onClick={() => cameraRef.current?.click()}>
            📷 Open Camera
          </button>
          <button style={{ ...S.bigBtn, ...S.bigBtnSecondary }} onClick={() => galleryRef.current?.click()}>
            🖼 Upload from Gallery
          </button>

          {pages.length > 0 && (
            <button
              style={{ ...S.bigBtn, backgroundColor: '#4CAF50', color: '#fff' }}
              onClick={async () => {
                setUploading(true);
                try {
                  const files = pages.map((p, i) =>
                    new File([p.blob], `${p.name || `page_${i+1}`}.jpg`, { type: 'image/jpeg' })
                  );
                  await uploadFiles(files);
                  navigate('/');
                } catch (e) {
                  alert('Upload failed. Is the backend running?');
                } finally {
                  setUploading(false);
                }
              }}
              disabled={uploading}
            >
              {uploading ? 'Uploading…' : `✓ Done (${pages.length} pages)`}
            </button>
          )}

          <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleCameraChange} />
          <input ref={galleryRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleGalleryChange} />

          {/* Thumbnail strip in capture mode */}
          {pages.length > 0 && (
            <div style={{ ...S.thumbStrip, width: '100%', maxWidth: '600px' }}>
              <div style={S.thumbStripInner}>
                {pages.map((pg, idx) => (
                  <div key={idx} style={S.thumbWrap}>
                    <img
                      src={pg.thumbUrl}
                      alt={pg.name}
                      style={{ ...S.thumb, borderColor: 'transparent' }}
                      onClick={() => handleEditThumb(idx)}
                      title="Re-edit"
                    />
                    <button style={S.thumbDelete} onClick={() => handleDeleteThumb(idx)} title="Remove">✕</button>
                    <input
                      style={S.thumbName}
                      value={pg.name}
                      onChange={(e) => handleRenamePage(idx, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── PERSPECTIVE MODE ── */}
      {mode === 'perspective' && imageSrc && (
        <div style={S.perspRoot}>
          <div ref={perspImgAreaRef} style={S.perspImgArea}>
            <img ref={perspImgRef} src={imageSrc} style={S.perspImg} alt="perspective" draggable={false} />
            <svg
              style={S.perspSvg}
              onPointerMove={perspPointerMove}
              onPointerUp={perspPointerUp}
            >
              {/* Filled quad */}
              <polygon
                points={perspCorners.map(c => cornerToSVG(c).join(',')).join(' ')}
                fill="rgba(33,150,243,0.12)"
                stroke="#2196F3"
                strokeWidth="2"
                strokeDasharray="6 4"
              />
              {/* Corner handles */}
              {perspCorners.map((c, i) => {
                const [cx, cy] = cornerToSVG(c);
                const labels = ['TL','TR','BR','BL'];
                return (
                  <g key={i}>
                    <circle
                      cx={cx} cy={cy} r={16}
                      fill="rgba(33,150,243,0.15)"
                      stroke="#2196F3"
                      strokeWidth={2}
                      style={{ cursor: 'grab', touchAction: 'none' }}
                      onPointerDown={(e) => perspPointerDown(e, i)}
                    />
                    <text x={cx} y={cy+4} textAnchor="middle" fontSize="11" fill="#fff" style={{ pointerEvents: 'none', userSelect: 'none' }}>
                      {labels[i]}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div style={S.perspControls}>
            <span style={S.perspInfo}>
              Drag corners to the paper edges. Apply warps to A4.
            </span>
            <button
              style={{ ...S.smallBtn, backgroundColor: '#555' }}
              onClick={() => setMode('edit')}
            >
              Cancel
            </button>
            <button
              style={{ ...S.smallBtn, backgroundColor: '#2196F3', borderColor: '#2196F3' }}
              onClick={applyPerspectiveWarp}
              disabled={perspProcessing}
            >
              {perspProcessing ? 'Warping…' : 'Apply Warp →'}
            </button>
          </div>
        </div>
      )}

      {/* ── POLYGON CROP MODE ── */}
      {mode === 'polygon' && imageSrc && (
        <div style={S.perspRoot}>
          <div ref={polyImgAreaRef} style={S.perspImgArea}>
            <img ref={polyImgRef} src={imageSrc} style={S.perspImg} alt="polygon crop" draggable={false} />
            <svg
              style={{ ...S.perspSvg, cursor: 'crosshair' }}
              onClick={handlePolySvgClick}
            >
              {/* Polygon outline */}
              {polyPts.length >= 2 && (
                <polyline
                  points={polyPts.map((p) => polyFracToSVG(p).join(',')).join(' ')}
                  fill="none" stroke="#E91E63" strokeWidth="2" strokeDasharray="6 3"
                />
              )}
              {/* Closing line preview when >= 3 pts */}
              {polyPts.length >= 3 && (() => {
                const first = polyFracToSVG(polyPts[0]);
                const last = polyFracToSVG(polyPts[polyPts.length - 1]);
                return <line x1={last[0]} y1={last[1]} x2={first[0]} y2={first[1]} stroke="#E91E63" strokeWidth="1.5" strokeDasharray="4 4" opacity={0.5} />;
              })()}
              {/* Vertex dots */}
              {polyPts.map((p, i) => {
                const [cx, cy] = polyFracToSVG(p);
                return (
                  <circle key={i} cx={cx} cy={cy} r={i === 0 ? 8 : 5}
                    fill={i === 0 ? '#E91E63' : '#fff'} stroke="#E91E63" strokeWidth="2" />
                );
              })}
            </svg>
          </div>

          <div style={S.perspControls}>
            <span style={S.perspInfo}>
              Click to place polygon points. Click the first point (pink) or press Apply to crop.
              {polyPts.length > 0 && ` ${polyPts.length} point${polyPts.length > 1 ? 's' : ''} placed.`}
            </span>
            {polyPts.length > 0 && (
              <button style={{ ...S.smallBtn, backgroundColor: '#555' }} onClick={() => setPolyPts((prev) => prev.slice(0, -1))}>
                ↩ Undo pt
              </button>
            )}
            <button style={{ ...S.smallBtn, backgroundColor: '#555' }} onClick={() => { setPolyPts([]); setMode('edit'); }}>
              Cancel
            </button>
            <button
              style={{ ...S.smallBtn, backgroundColor: '#E91E63', borderColor: '#E91E63', opacity: polyPts.length < 3 ? 0.5 : 1 }}
              onClick={applyPolyCrop}
              disabled={polyPts.length < 3 || polyProcessing}
            >
              {polyProcessing ? 'Cropping…' : 'Apply Polygon Crop →'}
            </button>
          </div>
        </div>
      )}

      {/* ── EDIT MODE ── */}
      {mode === 'edit' && imageSrc && (
        <div style={S.editRoot}>
          {/* Crop area — CSS filter applied to the media for live preview */}
          <div style={S.cropWrapper}>
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={aspectRatio}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              style={{
                containerStyle: { background: '#000' },
                mediaStyle: { filter: filterStyle },
              }}
            />
          </div>

          {/* Controls */}
          <div style={S.controls}>
            {/* Aspect ratio */}
            <div style={S.controlRow}>
              <span style={S.controlLabel}>Aspect</span>
              {[
                { label: 'Free', val: null },
                { label: 'A4', val: 210/297 },
                { label: 'Square', val: 1 },
                { label: 'A4 Land.', val: 297/210 },
              ].map(({ label, val }) => (
                <button
                  key={label}
                  style={{ ...S.smallBtn, ...(aspectRatio === val ? S.smallBtnActive : {}) }}
                  onClick={() => setAspectRatio(val)}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Perspective / Polygon crop */}
            <div style={S.controlRow}>
              <span style={S.controlLabel}>Crop</span>
              <button
                style={S.smallBtn}
                onClick={() => setMode('perspective')}
                title="Drag 4 corners to straighten a trapezoid paper to A4"
              >
                ⬡ Trapezoid Fix
              </button>
              <button
                style={{ ...S.smallBtn, borderColor: '#E91E63', color: '#E91E63' }}
                onClick={() => { setPolyPts([]); setMode('polygon'); }}
                title="Draw a polygon around the document to crop it"
              >
                ⬠ Polygon Crop
              </button>
            </div>

            {/* Rotate */}
            <div style={S.controlRow}>
              <span style={S.controlLabel}>Rotate</span>
              <button style={S.smallBtn} onClick={() => setRotation((r) => r - 90)}>↺ 90°</button>
              <button style={S.smallBtn} onClick={() => setRotation((r) => r + 90)}>↻ 90°</button>
              <input
                type="range" min={-45} max={45} step={0.5}
                value={rotation % 360 > 180 ? rotation-360 : (rotation % 360 < -180 ? rotation+360 : rotation % 360)}
                onChange={(e) => {
                  const base = Math.round(rotation/90)*90;
                  setRotation(base + Number(e.target.value));
                }}
                style={S.slider}
              />
              <span style={{ fontSize: '11px', color: '#aaa', minWidth: '36px' }}>{(rotation % 360).toFixed(0)}°</span>
            </div>

            {/* Brightness */}
            <div style={S.controlRow}>
              <span style={S.controlLabel}>Brightness</span>
              <input
                type="range" min={-100} max={100} value={brightness}
                onChange={(e) => setBrightness(Number(e.target.value))}
                style={S.slider}
              />
              <span style={{ fontSize: '11px', color: '#aaa', minWidth: '36px' }}>{brightness > 0 ? `+${brightness}` : brightness}</span>
            </div>

            {/* Contrast */}
            <div style={S.controlRow}>
              <span style={S.controlLabel}>Contrast</span>
              <input
                type="range" min={-100} max={100} value={contrast}
                onChange={(e) => setContrast(Number(e.target.value))}
                style={S.slider}
              />
              <span style={{ fontSize: '11px', color: '#aaa', minWidth: '36px' }}>{contrast > 0 ? `+${contrast}` : contrast}</span>
              <button style={S.smallBtn} onClick={setDocMode} title="Optimise for handwriting">📄 Doc</button>
            </div>

            {/* Zoom */}
            <div style={S.controlRow}>
              <span style={S.controlLabel}>Zoom</span>
              <input
                type="range" min={1} max={4} step={0.05} value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                style={S.slider}
              />
              <span style={{ fontSize: '11px', color: '#aaa', minWidth: '32px' }}>{zoom.toFixed(2)}×</span>
            </div>
          </div>

          {/* Action buttons */}
          <div style={S.actionRow}>
            <button style={{ ...S.actionBtn, backgroundColor: '#333', color: '#fff' }} onClick={handleRetake}>
              Retake
            </button>
            <button style={{ ...S.actionBtn, backgroundColor: '#555', color: '#fff' }} onClick={handleAddAnother}>
              + Save &amp; Add Page
            </button>
            <button
              style={{ ...S.actionBtn, backgroundColor: '#2196F3', color: '#fff' }}
              onClick={handleDone}
              disabled={uploading}
            >
              {uploading ? 'Uploading…' : 'Save & Done →'}
            </button>
          </div>

          {/* Thumbnail strip */}
          {pages.length > 0 && (
            <div style={S.thumbStrip}>
              <div style={S.thumbStripInner}>
                {pages.map((pg, idx) => (
                  <div key={idx} style={S.thumbWrap}>
                    <img
                      src={pg.thumbUrl}
                      alt={pg.name}
                      style={{ ...S.thumb, borderColor: editingIdx === idx ? '#2196F3' : 'transparent' }}
                      onClick={() => handleEditThumb(idx)}
                      title="Re-edit"
                    />
                    <button style={S.thumbDelete} onClick={() => handleDeleteThumb(idx)} title="Remove">✕</button>
                    <input
                      style={S.thumbName}
                      value={pg.name}
                      onChange={(e) => handleRenamePage(idx, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { uploadFiles, detectCorners } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

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

// ── Value knob (brightness / contrast) ───────────────────────────────────────

function ValueKnob({ value, onChange, min, max, label, color = '#FF9800' }) {
  const svgRef  = useRef(null);
  const dragRef = useRef(null);
  const SIZE = 88, CX = 44, CY = 44, R = 34;

  const t      = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const sweepDeg = t * 270 - 135;          // -135…135, measured from top
  const rad      = (sweepDeg - 90) * Math.PI / 180;

  // Arc track endpoints (270° arc, -135° and +135° from top in SVG coords)
  const arcStartRad = (-135 - 90) * Math.PI / 180;
  const arcEndRad   = ( 135 - 90) * Math.PI / 180;
  const Rtr = R - 6;
  const sx = CX + Rtr * Math.cos(arcStartRad);
  const sy = CY + Rtr * Math.sin(arcStartRad);
  const ex = CX + Rtr * Math.cos(arcEndRad);
  const ey = CY + Rtr * Math.sin(arcEndRad);
  const arcD = `M ${sx} ${sy} A ${Rtr} ${Rtr} 0 1 1 ${ex} ${ey}`;

  function ptrAngle(e) {
    const rect = svgRef.current.getBoundingClientRect();
    return Math.atan2(e.clientY - rect.top - CY, e.clientX - rect.left - CX) * 180 / Math.PI + 90;
  }
  function onPointerDown(e) {
    e.preventDefault();
    svgRef.current.setPointerCapture(e.pointerId);
    dragRef.current = { startAngle: ptrAngle(e), startValue: value };
  }
  function onPointerMove(e) {
    if (!dragRef.current) return;
    let delta = ptrAngle(e) - dragRef.current.startAngle;
    if (delta >  180) delta -= 360;
    if (delta < -180) delta += 360;
    onChange(Math.max(min, Math.min(max, dragRef.current.startValue + delta / 270 * (max - min))));
  }
  function onPointerUp() { dragRef.current = null; }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
      <svg ref={svgRef} width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}
        style={{ cursor: 'grab', touchAction: 'none', userSelect: 'none' }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      >
        <circle cx={CX} cy={CY} r={R} fill="#2a2a3a" stroke="#555" strokeWidth="1.5" />
        <path d={arcD} fill="none" stroke="#444" strokeWidth="4" strokeLinecap="round" />
        <circle cx={sx} cy={sy} r={2.5} fill="#555" />
        <circle cx={ex} cy={ey} r={2.5} fill="#555" />
        {/* Center (default = 1.0) tick at top */}
        <circle cx={CX} cy={CY - Rtr} r={2} fill="#777" />
        <line x1={CX} y1={CY} x2={CX + (R-6) * Math.cos(rad)} y2={CY + (R-6) * Math.sin(rad)}
          stroke={color} strokeWidth="3" strokeLinecap="round" />
        <circle cx={CX} cy={CY} r={4} fill={color} />
      </svg>
      <div style={{ fontSize: '11px', color: '#aaa', textAlign: 'center', lineHeight: 1.3 }}>
        <div style={{ fontSize: '10px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
        <div style={{ fontVariantNumeric: 'tabular-nums' }}>{value.toFixed(2)}</div>
      </div>
    </div>
  );
}

// ── Rotation knob ─────────────────────────────────────────────────────────────

function RotationKnob({ value, onChange }) {
  const svgRef   = useRef(null);
  const dragRef  = useRef(null);
  const SIZE = 112, CX = 56, CY = 56, R = 46;
  const rad  = ((value - 90) * Math.PI) / 180;

  function ptrAngle(e) {
    const rect = svgRef.current.getBoundingClientRect();
    return Math.atan2(e.clientY - rect.top - CY, e.clientX - rect.left - CX) * 180 / Math.PI;
  }
  function onPointerDown(e) {
    e.preventDefault();
    svgRef.current.setPointerCapture(e.pointerId);
    dragRef.current = { startAngle: ptrAngle(e), startValue: value };
  }
  function onPointerMove(e) {
    if (!dragRef.current) return;
    let delta = ptrAngle(e) - dragRef.current.startAngle;
    if (delta >  180) delta -= 360;
    if (delta < -180) delta += 360;
    onChange(dragRef.current.startValue + delta);
  }
  function onPointerUp() { dragRef.current = null; }

  let display = value % 360;
  if (display >  180) display -= 360;
  if (display < -180) display += 360;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
      <svg ref={svgRef} width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}
        style={{ cursor: 'grab', touchAction: 'none', userSelect: 'none' }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      >
        <circle cx={CX} cy={CY} r={R} fill="#2a2a3a" stroke="#555" strokeWidth="1.5" />
        {[0,45,90,135,180,225,270,315].map(a => {
          const ar = (a - 90) * Math.PI / 180;
          const major = a % 90 === 0;
          const r1 = major ? R - 10 : R - 6;
          return <line key={a}
            x1={CX + r1 * Math.cos(ar)} y1={CY + r1 * Math.sin(ar)}
            x2={CX + R  * Math.cos(ar)} y2={CY + R  * Math.sin(ar)}
            stroke={major ? '#888' : '#555'} strokeWidth={major ? 2 : 1}
          />;
        })}
        {/* indicator */}
        <line x1={CX} y1={CY} x2={CX + (R-5)*Math.cos(rad)} y2={CY + (R-5)*Math.sin(rad)}
          stroke="#2196F3" strokeWidth="3" strokeLinecap="round" />
        <circle cx={CX} cy={CY} r={5} fill="#2196F3" />
        {/* 0° mark */}
        <circle cx={CX} cy={CY - R + 5} r={2.5} fill="#888" />
      </svg>
      <div style={{ color: '#aaa', fontSize: '12px', fontVariantNumeric: 'tabular-nums', minWidth: '48px', textAlign: 'center' }}>
        {display.toFixed(1)}°
      </div>
    </div>
  );
}

// ── Classification config ─────────────────────────────────────────────────────

const MEDIUMS  = [{ val: 'english_medium', label: 'English Medium' }, { val: 'kannada_medium', label: 'Kannada Medium' }];
const CLASSES  = [{ val: 'class_8', label: 'Class 8' }, { val: 'class_9', label: 'Class 9' }, { val: 'class_10', label: 'Class 10' }];
const SUBJECTS = [
  { val: 'english',       label: 'English' },
  { val: 'kannada',       label: 'Kannada' },
  { val: 'science',       label: 'Science' },
  { val: 'social_science',label: 'Social Science' },
  { val: 'maths',         label: 'Maths' },
];

// ── Styles ────────────────────────────────────────────────────────────────────

const S = {
  page: { display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#f5f6f8', color: '#1a1a1a' },
  topbar: { display: 'flex', alignItems: 'center', padding: '10px 16px', backgroundColor: '#fff', borderBottom: '1px solid #e4e4e4', gap: '12px', flexShrink: 0 },
  topbarTitle: { flex: 1, fontWeight: '600', fontSize: '14px', color: '#1a1a1a' },
  counter: { fontSize: '13px', color: '#aaa' },
  backBtn: { padding: '6px 14px', border: '1px solid #ddd', borderRadius: '4px', backgroundColor: 'transparent', color: '#555', cursor: 'pointer', fontSize: '13px' },

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
  setupArea: { flex: 1, display: 'flex', flexDirection: 'column', padding: '28px 20px', gap: '24px', overflowY: 'auto' },
  setupLabel: { fontSize: '12px', color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '2px' },
  chipRow: { display: 'flex', flexWrap: 'wrap', gap: '10px' },
  chip: { padding: '11px 18px', borderRadius: '8px', border: '1px solid #e0e0e0', backgroundColor: '#fff', color: '#444', cursor: 'pointer', fontSize: '14px', fontWeight: 500 },
  chipActive: { border: '1px solid #2196F3', backgroundColor: '#e3f2fd', color: '#0d47a1' },
  proceedBtn: { padding: '16px', fontSize: '16px', fontWeight: 700, border: 'none', borderRadius: '10px', cursor: 'pointer', marginTop: '8px' },
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function ScannerPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const homeRoute = user?.role === 'pictaker' ? '/pictaker' : '/';

  // 'setup' | 'capture' | 'edit' | 'perspective' | 'polygon' | 'detecting' | 'warp_preview'
  const [mode, setMode] = useState('setup');

  // Classification
  const [medium,  setMedium]  = useState('');
  const [cls,     setCls]     = useState('');
  const [subject, setSubject] = useState('');
  const [imageSrc, setImageSrc] = useState(null);

  // Committed pages: [{blob, thumbUrl, name}]
  const [pages, setPages] = useState([]);
  const [editingIdx, setEditingIdx] = useState(null);

  // Rotation / brightness / contrast
  const [rotation, setRotation] = useState(0);
  const [rotHistory, setRotHistory] = useState([]);
  const [brightness, setBrightness] = useState(1.0);
  const [contrast,   setContrast]   = useState(1.0);

  // Original image before any warp (so "Change Warp" can restart from it)
  const [preWarpSrc, setPreWarpSrc] = useState(null);

  function changeRotation(val) {
    setRotHistory(h => [...h.slice(-19), rotation]);
    setRotation(typeof val === 'function' ? val(rotation) : val);
  }
  function undoRotation() {
    setRotHistory(h => {
      if (!h.length) return h;
      setRotation(h[h.length - 1]);
      return h.slice(0, -1);
    });
  }

  // Perspective mode state
  const [perspCorners, setPerspCorners] = useState([[0.05,0.05],[0.95,0.05],[0.95,0.95],[0.05,0.95]]);
  const [perspHistory, setPerspHistory] = useState([]);  // stack of previous corner states
  const perspDraggingRef = useRef(null);
  const perspImgAreaRef = useRef(null);
  const perspImgRef = useRef(null);
  const [perspProcessing, setPerspProcessing] = useState(false);
  const [perspImgReady, setPerspImgReady] = useState(false);
  const [origSrc, setOrigSrc] = useState(null);      // pre-warp image for re-adjust
  const [warpedSrc, setWarpedSrc] = useState(null);  // warp result shown as suggestion

  // Polygon crop mode state
  const [polyPts, setPolyPts] = useState([]); // [[fx,fy],…] in display-fraction space
  const polyImgAreaRef = useRef(null);
  const polyImgRef = useRef(null);
  const [polyProcessing, setPolyProcessing] = useState(false);

  const [uploading, setUploading] = useState(false);
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);

  useEffect(() => { setPerspImgReady(false); }, [imageSrc]);

  async function loadImageWithDetection(file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setImageSrc(url);
    setPreWarpSrc(url);
    setOrigSrc(null);
    setWarpedSrc(null);
    setRotation(0);
    setBrightness(1.0);
    setContrast(1.0);
    setPolyPts([]);
    setEditingIdx(null);
    setMode('detecting');
    try {
      const corners = await detectCorners(file);
      setPerspCorners(corners);
    } catch {
      setPerspCorners([[0.05,0.05],[0.95,0.05],[0.95,0.95],[0.05,0.95]]);
    }
    setMode('perspective');
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

  function handleCameraChange(e) { const f = e.target.files[0]; e.target.value = ''; loadImageWithDetection(f); }
  function handleGalleryChange(e) { const f = e.target.files[0]; e.target.value = ''; loadImageWithDetection(f); }

  async function processCurrentPage() {
    if (!imageSrc) return null;
    const image = await createImageEl(imageSrc);
    const iw = image.naturalWidth, ih = image.naturalHeight;
    const rad = (rotation * Math.PI) / 180;
    const cosA = Math.abs(Math.cos(rad)), sinA = Math.abs(Math.sin(rad));
    const outW = Math.round(iw * cosA + ih * sinA);
    const outH = Math.round(iw * sinA + ih * cosA);
    const canvas = document.createElement('canvas');
    canvas.width = outW; canvas.height = outH;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, outW, outH);
    ctx.translate(outW / 2, outH / 2);
    ctx.rotate(rad);
    ctx.filter = `brightness(${brightness}) contrast(${contrast})`;
    ctx.drawImage(image, -iw / 2, -ih / 2);
    const blob = await new Promise((res, rej) =>
      canvas.toBlob(b => b ? res(b) : rej(new Error('canvas empty')), 'image/jpeg', 0.88)
    );
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
      await uploadFiles(files, { medium, cls, subject });
      navigate('/pictaker');
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
    setPreWarpSrc(pg.thumbUrl);
    setRotation(0);
    setRotHistory([]);
    setBrightness(1.0);
    setContrast(1.0);
    setPerspCorners([[0.05,0.05],[0.95,0.05],[0.95,0.95],[0.05,0.95]]);
    setPerspHistory([]);
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
    setPerspHistory(h => [...h.slice(-19), perspCorners]); // save before drag
    perspDraggingRef.current = idx;
    e.currentTarget.closest('svg').setPointerCapture(e.pointerId);
  }

  function undoPerspCorners() {
    setPerspHistory(h => {
      if (!h.length) return h;
      setPerspCorners(h[h.length - 1]);
      return h.slice(0, -1);
    });
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
      const ref = perspImgRef.current;
      const img = (ref && ref.naturalWidth > 0) ? ref : await createImageEl(imageSrc);
      const iw = img.naturalWidth, ih = img.naturalHeight;
      const src4 = perspCorners.map(([fx, fy]) => [fx*iw, fy*ih]);
      const blob = await perspectiveWarp(imageSrc, src4);
      const newUrl = URL.createObjectURL(blob);
      setOrigSrc(imageSrc);
      setWarpedSrc(newUrl);
      setMode('warp_preview');
    } catch (e) {
      console.error('Perspective warp failed', e);
      alert('Warp failed: ' + e.message);
    } finally {
      setPerspProcessing(false);
    }
  }

  async function acceptWarp() {
    setImageSrc(warpedSrc);
    setOrigSrc(null);
    setWarpedSrc(null);
    setPerspCorners([[0.05,0.05],[0.95,0.05],[0.95,0.95],[0.05,0.95]]);
    setPerspHistory([]);
    setRotation(0);
    setRotHistory([]);
    setBrightness(1.0);
    setContrast(1.0);
    setMode('edit');
  }

  function readjustWarp() {
    setImageSrc(origSrc);
    // Keep warpedSrc/origSrc so perspective mode can offer "Back to preview"
    // and so re-applying warp still has access to the original
    setMode('perspective');
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const totalPages = pages.length + (mode === 'edit' && editingIdx === null ? 1 : 0);
  const currentPageNum = editingIdx !== null ? editingIdx + 1 : pages.length + 1;

  return (
    <div style={S.page}>
      {/* Top bar */}
      <div style={S.topbar}>
        <button style={S.backBtn} onClick={() => navigate(homeRoute)}>← Home</button>
        <span style={S.topbarTitle}>
          {mode === 'setup' ? 'Select subject' : [medium, cls, subject].filter(Boolean).map((v) => v.replace(/_/g, ' ')).join(' · ')}
        </span>
        {mode !== 'setup' && (
          <button style={{ ...S.backBtn, fontSize: '11px' }} onClick={() => setMode('setup')}>Change</button>
        )}
        {(mode === 'edit' || mode === 'perspective') && (
          <span style={S.counter}>
            Page {currentPageNum}{totalPages > 1 ? ` of ${totalPages}` : ''}
          </span>
        )}
      </div>

      {/* ── SETUP MODE ── */}
      {mode === 'setup' && (
        <div style={S.setupArea}>
          <div>
            <div style={S.setupLabel}>Medium</div>
            <div style={S.chipRow}>
              {MEDIUMS.map(({ val, label }) => (
                <button key={val} style={{ ...S.chip, ...(medium === val ? S.chipActive : {}) }}
                  onClick={() => setMedium(medium === val ? '' : val)}>{label}</button>
              ))}
            </div>
          </div>
          <div>
            <div style={S.setupLabel}>Class</div>
            <div style={S.chipRow}>
              {CLASSES.map(({ val, label }) => (
                <button key={val} style={{ ...S.chip, ...(cls === val ? S.chipActive : {}) }}
                  onClick={() => setCls(cls === val ? '' : val)}>{label}</button>
              ))}
            </div>
          </div>
          <div>
            <div style={S.setupLabel}>Subject</div>
            <div style={S.chipRow}>
              {SUBJECTS.map(({ val, label }) => (
                <button key={val} style={{ ...S.chip, ...(subject === val ? S.chipActive : {}) }}
                  onClick={() => setSubject(subject === val ? '' : val)}>{label}</button>
              ))}
            </div>
          </div>
          <button
            style={{
              ...S.proceedBtn,
              backgroundColor: medium && cls && subject ? '#2196F3' : '#efefef',
              color: medium && cls && subject ? '#fff' : '#aaa',
              border: medium && cls && subject ? '1px solid #1976D2' : '1px solid #e0e0e0',
              boxShadow: medium && cls && subject ? '0 4px 14px rgba(33,150,243,0.35)' : '0 1px 3px rgba(0,0,0,0.08)',
              transform: medium && cls && subject ? 'translateY(-1px)' : 'none',
            }}
            disabled={!medium || !cls || !subject}
            onClick={() => setMode('capture')}
          >
            {medium && cls && subject ? 'Continue →' : 'Select medium, class and subject'}
          </button>
        </div>
      )}

      {/* ── DETECTING MODE ── */}
      {mode === 'detecting' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', position: 'relative' }}>
          {imageSrc && <img src={imageSrc} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', opacity: 0.4 }} />}
          <div style={{ position: 'relative', fontSize: '15px', fontWeight: 600, color: '#333' }}>Detecting document boundary…</div>
        </div>
      )}

      {/* ── WARP PREVIEW MODE ── */}
      {mode === 'warp_preview' && warpedSrc && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, position: 'relative', backgroundColor: '#000', overflow: 'hidden' }}>
            <img
              src={warpedSrc}
              alt="warp preview"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </div>
          <div style={{ backgroundColor: '#1a1a2a', padding: '10px 16px', display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0 }}>
            <span style={{ flex: 1, fontSize: '12px', color: '#aaa' }}>
              Warp applied. Accept or go back to adjust the corners.
            </span>
            <button style={{ ...S.smallBtn, backgroundColor: '#555' }} onClick={readjustWarp}>
              Warp manually
            </button>
            <button style={{ ...S.smallBtn, backgroundColor: '#4CAF50', borderColor: '#4CAF50' }} onClick={acceptWarp}>
              Accept →
            </button>
          </div>
        </div>
      )}

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
                  await uploadFiles(files, { medium, cls, subject });
                  navigate('/pictaker');
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
          <input ref={galleryRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleGalleryChange} />

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
            <img
              ref={perspImgRef}
              src={imageSrc}
              style={S.perspImg}
              alt="perspective"
              draggable={false}
              onLoad={() => setPerspImgReady(true)}
            />
            {!perspImgReady && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: '13px' }}>
                Loading…
              </div>
            )}
            {perspImgReady && (
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
                {/* Corner handles — larger touch target on mobile */}
                {perspCorners.map((c, i) => {
                  const [cx, cy] = cornerToSVG(c);
                  const labels = ['TL','TR','BR','BL'];
                  return (
                    <g key={i}>
                      {/* Invisible large tap target */}
                      <circle
                        cx={cx} cy={cy} r={28}
                        fill="transparent"
                        style={{ touchAction: 'none', cursor: 'grab' }}
                        onPointerDown={(e) => perspPointerDown(e, i)}
                      />
                      <circle
                        cx={cx} cy={cy} r={14}
                        fill="rgba(33,150,243,0.25)"
                        stroke="#2196F3"
                        strokeWidth={2.5}
                        style={{ pointerEvents: 'none' }}
                      />
                      <text x={cx} y={cy+4} textAnchor="middle" fontSize="11" fill="#fff" style={{ pointerEvents: 'none', userSelect: 'none' }}>
                        {labels[i]}
                      </text>
                    </g>
                  );
                })}
              </svg>
            )}
          </div>

          <div style={S.perspControls}>
            <span style={S.perspInfo}>
              {warpedSrc ? 'Drag corners to re-warp.' : 'Drag corners to the paper edges.'}
            </span>
            <button style={{ ...S.smallBtn, backgroundColor: '#555' }} onClick={undoPerspCorners} disabled={!perspHistory.length}>
              ↩ Undo
            </button>
            <button
              style={{ ...S.smallBtn, backgroundColor: '#555' }}
              onClick={() => warpedSrc ? setMode('warp_preview') : setMode('edit')}
            >
              {warpedSrc ? '← Preview' : 'Cancel'}
            </button>
            <button
              style={{ ...S.smallBtn, backgroundColor: '#2196F3', borderColor: '#2196F3' }}
              onClick={applyPerspectiveWarp}
              disabled={perspProcessing || !perspImgReady}
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
          {/* Image preview */}
          <div style={{ flex: 1, minHeight: 0, backgroundColor: '#000', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img
              src={imageSrc}
              alt="preview"
              style={{
                maxWidth: '100%', maxHeight: '100%', objectFit: 'contain',
                transform: `rotate(${rotation}deg)`, transformOrigin: 'center',
                filter: `brightness(${brightness}) contrast(${contrast})`,
                userSelect: 'none', display: 'block',
              }}
            />
          </div>

          {/* Knobs row: brightness | rotation | contrast */}
          <div style={{ backgroundColor: '#1a1a2a', padding: '10px 16px', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
              <ValueKnob value={brightness} onChange={setBrightness} min={0.5} max={2.0} label="Brightness" color="#FFC107" />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <button style={S.smallBtn} onClick={() => changeRotation(r => r - 90)}>↺ 90°</button>
                  <RotationKnob value={rotation} onChange={changeRotation} />
                  <button style={S.smallBtn} onClick={() => changeRotation(r => r + 90)}>↻ 90°</button>
                </div>
              </div>
              <ValueKnob value={contrast} onChange={setContrast} min={0.5} max={2.5} label="Contrast" color="#29B6F6" />
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
              <button style={S.smallBtn} onClick={() => {
                const src = preWarpSrc || imageSrc;
                setImageSrc(src);
                setPerspCorners([[0.05,0.05],[0.95,0.05],[0.95,0.95],[0.05,0.95]]);
                setPerspHistory([]);
                setMode('perspective');
              }}>Change Warp</button>
              <button style={S.smallBtn} onClick={undoRotation} disabled={!rotHistory.length}>↩ Undo</button>
              <button style={{ ...S.smallBtn, marginLeft: 'auto' }} onClick={() => { setRotHistory([]); setRotation(0); setBrightness(1.0); setContrast(1.0); }}>Reset</button>
            </div>
          </div>

          {/* Action buttons */}
          <div style={S.actionRow}>
            <button style={{ ...S.actionBtn, backgroundColor: '#333', color: '#fff' }} onClick={handleRetake}>Retake</button>
            <button style={{ ...S.actionBtn, backgroundColor: '#555', color: '#fff' }} onClick={handleAddAnother}>+ Add Page</button>
            <button style={{ ...S.actionBtn, backgroundColor: '#2196F3', color: '#fff' }} onClick={handleDone} disabled={uploading}>
              {uploading ? 'Uploading…' : 'Save & Done →'}
            </button>
          </div>

          {/* Thumbnail strip */}
          {pages.length > 0 && (
            <div style={S.thumbStrip}>
              <div style={S.thumbStripInner}>
                {pages.map((pg, idx) => (
                  <div key={idx} style={S.thumbWrap}>
                    <img src={pg.thumbUrl} alt={pg.name}
                      style={{ ...S.thumb, borderColor: editingIdx === idx ? '#2196F3' : 'transparent' }}
                      onClick={() => handleEditThumb(idx)} title="Re-edit"
                    />
                    <button style={S.thumbDelete} onClick={() => handleDeleteThumb(idx)} title="Remove">✕</button>
                    <input style={S.thumbName} value={pg.name}
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

import axios from 'axios';

const BACKEND = import.meta.env.VITE_API_URL || '';

const API = axios.create({ baseURL: BACKEND });

API.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

API.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const IMAGE_BASE_URL   = `${BACKEND}/uploads`;
export const RAW_BASE_URL     = `${BACKEND}/raw`;
export const MASKED_BASE_URL  = `${BACKEND}/masked`;

function _isRect(pts) {
  if (pts.length !== 4) return false;
  const vecs = pts.map((p, i) => {
    const n = pts[(i + 1) % 4];
    return [n[0] - p[0], n[1] - p[1]];
  });
  for (let i = 0; i < 4; i++) {
    const a = vecs[i];
    const b = vecs[(i + 1) % 4];
    if (Math.abs(a[0] * b[0] + a[1] * b[1]) > 1e-6) return false;
  }
  return true;
}

function _rectToCoords(x, y, w, h, rot) {
  const rad = rot * Math.PI / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const corners = [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ];
  return corners.map(([dx, dy]) => [
    cx + dx * cos - dy * sin,
    cy + dx * sin + dy * cos,
  ]);
}

export function coordsToCoordinates(box) {
  let pts;
  if (box.polygon_points && box.polygon_points.length > 0) {
    try {
      pts = typeof box.polygon_points === 'string' ? JSON.parse(box.polygon_points) : box.polygon_points;
    } catch {
      pts = [];
    }
  } else {
    pts = _rectToCoords(box.x, box.y, box.width, box.height, box.rotation || 0);
  }
  return JSON.stringify(pts);
}

export function normalizeBox(raw) {
  let pts;
  try {
    pts = JSON.parse(raw.coordinates || '[]');
  } catch {
    pts = [];
  }

  let x = 0, y = 0, width = 0, height = 0, rotation = 0, polygon_points = null;

  if (_isRect(pts)) {
    const dx = pts[1][0] - pts[0][0];
    const dy = pts[1][1] - pts[0][1];
    rotation = Math.atan2(dy, dx) * 180 / Math.PI;
    width = Math.sqrt(dx * dx + dy * dy);
    const dxh = pts[3][0] - pts[0][0];
    const dyh = pts[3][1] - pts[0][1];
    height = Math.sqrt(dxh * dxh + dyh * dyh);
    const cx = (pts[0][0] + pts[1][0] + pts[2][0] + pts[3][0]) / 4;
    const cy = (pts[0][1] + pts[1][1] + pts[2][1] + pts[3][1]) / 4;
    x = cx - width / 2;
    y = cy - height / 2;
  } else if (pts.length > 0) {
    polygon_points = JSON.stringify(pts);
  }

  return {
    ...raw,
    parent_box_id: raw.parent_id ?? null,
    tag_data: raw.tag_attributes,
    x,
    y,
    width,
    height,
    rotation,
    polygon_points,
  };
}

export async function loginUser(username, password) {
  const { data } = await API.post('/login', { username, password });
  return data;
}

export async function getMyUploads() {
  const { data } = await API.get('/my-uploads');
  return data;
}

export async function deletePage(pageName) {
  const { data } = await API.delete(`/pages/${encodeURIComponent(pageName)}`);
  return data;
}

export async function getRawImage(pageName) {
  const { data } = await API.get(`/pages/${encodeURIComponent(pageName)}/raw`, { responseType: 'blob' });
  return data;
}

export async function replacePageImage(pageName, file, corners = null) {
  const form = new FormData();
  form.append('file', file);
  if (corners) form.append('corners_json', JSON.stringify(corners));
  const { data } = await API.patch(`/pages/${encodeURIComponent(pageName)}/image`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function listUsers() {
  const { data } = await API.get('/users');
  return data;
}

export async function createUser(username, password, role) {
  const { data } = await API.post('/users', { username, password, role });
  return data;
}

export async function deleteUser(username) {
  const { data } = await API.delete(`/users/${encodeURIComponent(username)}`);
  return data;
}

export async function detectCorners(file) {
  const form = new FormData();
  form.append('file', file);
  const { data } = await API.post('/detect-corners', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.corners;
}

export async function uploadFiles(files, opts = {}) {
  const form = new FormData();
  files.forEach((f) => form.append('files', f));
  if (opts.medium)       form.append('medium', opts.medium);
  if (opts.cls)          form.append('cls', opts.cls);
  if (opts.subject)      form.append('subject', opts.subject);
  if (opts.cornersArray) form.append('corners_json', JSON.stringify(opts.cornersArray));
  const { data } = await API.post('/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function getDocuments() {
  const { data } = await API.get('/documents');
  return data;
}

export async function renameDocument(oldName, newName) {
  const { data } = await API.patch(`/documents/${encodeURIComponent(oldName)}`, { display_name: newName });
  return data;
}

export async function deleteDocument(name) {
  const { data } = await API.delete(`/documents/${encodeURIComponent(name)}`);
  return data;
}

export async function getPage(pageName) {
  const { data } = await API.get(`/pages/${encodeURIComponent(pageName)}`);
  return data;
}

export async function renamePage(pageName, newName, replace = false) {
  try {
    const { data } = await API.patch(`/pages/${encodeURIComponent(pageName)}`, {
      display_name: newName,
      replace,
    });
    return { ok: true, data };
  } catch (err) {
    if (err.response?.status === 409) {
      return { ok: false, conflict: true, message: err.response.data.detail };
    }
    throw err;
  }
}

export async function getPageBoxes(pageName) {
  const { data } = await API.get(`/pages/${encodeURIComponent(pageName)}/boxes`);
  return data.map(normalizeBox);
}

export async function createBox(pageName, boxData) {
  const { data } = await API.post(`/pages/${encodeURIComponent(pageName)}/boxes`, boxData);
  return normalizeBox(data);
}

export async function updateBox(pageName, boxId, boxData) {
  const { data } = await API.put(`/pages/${encodeURIComponent(pageName)}/boxes/${boxId}`, boxData);
  return normalizeBox(data);
}

export async function deleteBox(pageName, boxId) {
  const { data } = await API.delete(`/pages/${encodeURIComponent(pageName)}/boxes/${boxId}`);
  return data;
}

export async function exportPage(pageName) {
  const { data } = await API.get(`/export/${encodeURIComponent(pageName)}`);
  return data;
}

export async function exportPageJson(pageName) {
  const { data } = await API.get(`/export/${encodeURIComponent(pageName)}/json`);
  return data;
}

export async function getMyPages() {
  const { data } = await API.get('/my-pages');
  return data;
}

export async function getAnnotationRequests() {
  const { data } = await API.get('/annotation-requests');
  return data;
}

export async function createAnnotationRequest(payload) {
  const { data } = await API.post('/annotation-requests', payload);
  return data;
}

export async function approveAnnotationRequest(id) {
  const { data } = await API.patch(`/annotation-requests/${id}/approve`);
  return data;
}

export async function rejectAnnotationRequest(id) {
  const { data } = await API.patch(`/annotation-requests/${id}/reject`);
  return data;
}

export async function submitPage(pageName) {
  const { data } = await API.patch(`/pages/${encodeURIComponent(pageName)}/submit`);
  return data;
}

export async function withdrawPage(pageName) {
  const { data } = await API.patch(`/pages/${encodeURIComponent(pageName)}/withdraw`);
  return data;
}

export async function getManagerPages() {
  const { data } = await API.get('/manager/pages');
  return data;
}

export async function approveManagerPage(pageName) {
  const { data } = await API.patch(`/manager/pages/${encodeURIComponent(pageName)}/approve`);
  return data;
}

export async function sendBackPage(pageName, note) {
  const { data } = await API.patch(`/manager/pages/${encodeURIComponent(pageName)}/send-back`, { note });
  return data;
}

export async function flagAdminPage(pageName, note) {
  const { data } = await API.patch(`/manager/pages/${encodeURIComponent(pageName)}/flag-admin`, { note });
  return data;
}

export async function getAdminUploads() {
  const { data } = await API.get('/admin/uploads');
  return data;
}

export async function approveUpload(pageName) {
  const { data } = await API.patch(`/admin/pages/${encodeURIComponent(pageName)}/approve-upload`);
  return data;
}

export async function flagUpload(pageName, note) {
  const { data } = await API.patch(`/admin/pages/${encodeURIComponent(pageName)}/flag-upload`, { note });
  return data;
}

export async function unflagUpload(pageName) {
  const { data } = await API.patch(`/admin/pages/${encodeURIComponent(pageName)}/unflag-upload`);
  return data;
}

export async function getMaskingRequests() {
  const { data } = await API.get('/masking-requests');
  return data;
}

export async function createMaskingRequest(quantity) {
  const { data } = await API.post('/masking-requests', { quantity });
  return data;
}

export async function approveMaskingRequest(id) {
  const { data } = await API.patch(`/masking-requests/${id}/approve`);
  return data;
}

export async function rejectMaskingRequest(id) {
  const { data } = await API.patch(`/masking-requests/${id}/reject`);
  return data;
}

export async function getMyMaskingPages() {
  const { data } = await API.get('/my-masking-pages');
  return data;
}

export async function getMaskBoxes(pageName) {
  const { data } = await API.get(`/pages/${encodeURIComponent(pageName)}/mask-boxes`);
  return data;
}

export async function saveMasks(pageName, shapes) {
  const { data } = await API.post(`/pages/${encodeURIComponent(pageName)}/save-masks`, { shapes });
  return data;
}

export async function applyMasks(pageName, shapes) {
  const { data } = await API.post(`/pages/${encodeURIComponent(pageName)}/apply-masks`, { shapes });
  return data;
}

export async function getManagerMaskingPages() {
  const { data } = await API.get('/manager/masking-pages');
  return data;
}

export async function approveMaskingPage(pageName) {
  const { data } = await API.patch(`/manager/masking-pages/${encodeURIComponent(pageName)}/approve`);
  return data;
}

export async function sendBackMaskingPage(pageName, note) {
  const { data } = await API.patch(`/manager/masking-pages/${encodeURIComponent(pageName)}/send-back`, { note });
  return data;
}

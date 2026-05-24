import axios from 'axios';

const BACKEND = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8000`;

const API = axios.create({ baseURL: BACKEND });

export const IMAGE_BASE_URL = `${BACKEND}/uploads`;

export async function uploadFiles(files) {
  const form = new FormData();
  files.forEach((f) => form.append('files', f));
  const { data } = await API.post('/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function getDocuments() {
  const { data } = await API.get('/documents');
  return data;
}

export async function getDocument(id) {
  const { data } = await API.get(`/documents/${id}`);
  return data;
}

export async function renameDocument(id, displayName) {
  const { data } = await API.patch(`/documents/${id}`, { display_name: displayName });
  return data;
}

export async function deleteDocument(id) {
  const { data } = await API.delete(`/documents/${id}`);
  return data;
}

export async function getPage(id) {
  const { data } = await API.get(`/pages/${id}`);
  return data;
}

export async function getPageBoxes(pageId) {
  const { data } = await API.get(`/pages/${pageId}/boxes`);
  return data;
}

export async function createBox(boxData) {
  const { data } = await API.post('/boxes', boxData);
  return data;
}

export async function updateBox(id, boxData) {
  const { data } = await API.put(`/boxes/${id}`, boxData);
  return data;
}

export async function deleteBox(id) {
  const { data } = await API.delete(`/boxes/${id}`);
  return data;
}

export async function exportPage(pageId) {
  const { data } = await API.get(`/export/${pageId}`);
  return data;
}

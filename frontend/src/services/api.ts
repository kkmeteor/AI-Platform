import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

// Automatically attach X-User-Role header from localStorage
api.interceptors.request.use((config) => {
  const role = localStorage.getItem('role') || 'user';
  config.headers['X-User-Role'] = role;
  return config;
});

export interface Skill {
  id: number;
  name: string;
  description: string;
  author: string;
  version: string;
  tags: string[];
  created_at: string;
  download_count: number;
  file_path: string;
  is_readonly: boolean;
  is_pinned: boolean;
}

export interface SkillListResponse {
  items: Skill[];
  total: number;
  page: number;
  page_size: number;
}

export interface SkillListParams {
  search?: string;
  page?: number;
  page_size?: number;
}

export async function fetchSkills(params: SkillListParams = {}): Promise<SkillListResponse> {
  const res = await api.get<SkillListResponse>('/skills', { params });
  return res.data;
}

export interface UploadSkillPayload {
  name: string;
  description?: string;
  author?: string;
  version?: string;
  tags?: string;
  file_base64: string;
  file_name: string;
}

export async function uploadSkill(payload: UploadSkillPayload): Promise<Skill> {
  const res = await api.post<Skill>('/skills', payload);
  return res.data;
}

export function getDownloadUrl(id: number): string {
  return `/api/skills/${id}/download`;
}

export async function deleteSkill(id: number): Promise<void> {
  await api.delete(`/skills/${id}`);
}

export async function togglePinSkill(id: number, isPinned: boolean): Promise<Skill> {
  const res = await api.patch<Skill>(`/skills/${id}/pin`, { is_pinned: isPinned });
  return res.data;
}

export function isAdmin(): boolean {
  return localStorage.getItem('role') === 'admin';
}

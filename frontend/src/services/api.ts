import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
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

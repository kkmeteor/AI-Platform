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

// ── Dify App types ──

export interface DifyAppTag {
  name: string;
  type: string;
}

export interface DifyApp {
  id: string;
  name: string;
  description: string;
  mode: string;
  tags: DifyAppTag[];
}

export interface DifyAppsResponse {
  data: DifyApp[];
  page: number;
  limit: number;
  total: number;
}

export async function fetchDifyApps(): Promise<DifyAppsResponse> {
  const res = await api.get<DifyAppsResponse>('/dify/apps');
  return res.data;
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

// ── Dify Chat Apps (for dynamic session cards) ──

export interface DifyChatApp {
  id: string;
  name: string;
  description: string;
  icon: string;
  icon_background: string;
  access_token: string;
  mode: string;
}

export async function fetchDifyChatApps(): Promise<DifyChatApp[]> {
  const res = await api.get<DifyChatApp[]>('/dify/chat-apps');
  return res.data;
}

export function isAdmin(): boolean {
  return localStorage.getItem('role') === 'admin';
}

// ── MCP Server ──

export interface McpTool {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpServer {
  id: number;
  name: string;
  url: string;
  transport: string;
  headers: string;
  timeout: number;
  sse_read_timeout: number;
  is_active: boolean;
  tools: McpTool[];
  created_at: string | null;
  updated_at: string | null;
}

export interface McpServerCreate {
  name: string;
  url: string;
  transport?: string;
  headers?: string;
  timeout?: number;
  sse_read_timeout?: number;
}

export interface McpServerUpdate {
  name?: string;
  url?: string;
  transport?: string;
  headers?: string;
  timeout?: number;
  sse_read_timeout?: number;
}

export async function fetchMcpServers(): Promise<McpServer[]> {
  const res = await api.get<McpServer[]>('/mcp');
  return res.data;
}

export async function createMcpServer(data: McpServerCreate): Promise<McpServer> {
  const res = await api.post<McpServer>('/mcp', data);
  return res.data;
}

export async function updateMcpServer(id: number, data: McpServerUpdate): Promise<McpServer> {
  const res = await api.put<McpServer>(`/mcp/${id}`, data);
  return res.data;
}

export async function deleteMcpServer(id: number): Promise<void> {
  await api.delete(`/mcp/${id}`);
}

export async function refreshMcpServer(id: number): Promise<McpServer> {
  const res = await api.post<McpServer>(`/mcp/${id}/refresh`);
  return res.data;
}

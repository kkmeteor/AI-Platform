import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

// Automatically attach JWT token from localStorage
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 responses - clear token and redirect to login.
// A flag prevents multiple concurrent 401s from triggering duplicate redirects.
let isRedirectingToLogin = false;

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !isRedirectingToLogin) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('role');
      // Redirect to login page if not already there.
      // The flag only guards the actual navigation: it is set right before
      // redirecting (which reloads the page and resets module state), and is
      // left untouched when already on the login page so that a later 401
      // after a successful SPA login is still handled.
      if (!window.location.search.includes('section=login')) {
        isRedirectingToLogin = true;
        window.location.href = '/?section=login';
      }
    }
    return Promise.reject(error);
  }
);

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

export function canEdit(): boolean {
  const role = localStorage.getItem('role');
  return role === 'admin' || role === 'editor';
}

// ── Auth ──

export interface UserInfo {
  id: number;
  username: string;
  display_name: string | null;
  email: string | null;
  role: string;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: UserInfo;
}

export async function login(data: LoginRequest): Promise<LoginResponse> {
  const res = await api.post<LoginResponse>('/auth/login', data);
  // A failed login attempt may have set the redirect flag while the user was
  // already on the login page; reset it so subsequent 401s are not swallowed.
  isRedirectingToLogin = false;
  return res.data;
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout');
}

export async function fetchCurrentUser(): Promise<UserInfo> {
  const res = await api.get<UserInfo>('/auth/me');
  return res.data;
}

// ── User Management ──

export interface UserListResponse {
  items: UserInfo[];
  total: number;
}

export interface LoginLog {
  id: number;
  user_id: number | null;
  username: string;
  login_time: string | null;
  ip_address: string | null;
  success: boolean;
  message: string | null;
}

export interface LoginLogListResponse {
  items: LoginLog[];
  total: number;
}

export async function fetchUsers(params: { search?: string; page?: number; page_size?: number } = {}): Promise<UserListResponse> {
  const res = await api.get<UserListResponse>('/users', { params });
  return res.data;
}

export async function updateUserRole(userId: number, role: string): Promise<UserInfo> {
  const res = await api.put<UserInfo>(`/users/${userId}/role`, { role });
  return res.data;
}

export async function updateUserStatus(userId: number, isActive: boolean): Promise<UserInfo> {
  const res = await api.put<UserInfo>(`/users/${userId}/status`, { is_active: isActive });
  return res.data;
}

export async function fetchLoginLogs(params: { username?: string; success?: boolean; page?: number; page_size?: number } = {}): Promise<LoginLogListResponse> {
  const res = await api.get<LoginLogListResponse>('/users/login-logs', { params });
  return res.data;
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
  command: string | null;
  args: string | null;
  env: string | null;
  timeout: number;
  sse_read_timeout: number;
  is_active: boolean;
  tools: McpTool[];
  tools_cached_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface McpServerCreate {
  name: string;
  url?: string;
  transport?: string;
  headers?: string;
  command?: string;
  args?: string;
  env?: string;
  timeout?: number;
  sse_read_timeout?: number;
}

export interface McpServerUpdate {
  name?: string;
  url?: string;
  transport?: string;
  headers?: string;
  command?: string;
  args?: string;
  env?: string;
  timeout?: number;
  sse_read_timeout?: number;
}

export async function fetchMcpServers(): Promise<McpServer[]> {
  const res = await api.get<McpServer[]>('/mcp');
  return res.data;
}

export async function fetchMcpServersStatus(): Promise<McpServer[]> {
  // stdio servers may take up to 30s for cold start (uvx first-run download)
  const res = await api.get<McpServer[]>('/mcp/status', { timeout: 60000 });
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

// ── Dify Datasets (Knowledge Bases) ──

export interface DifyDataset {
  id: string;
  name: string;
  description: string;
  permission: string;
  data_source_type: string;
  indexing_technique: string;
  app_count: number;
  document_count: number;
  word_count: number;
  created_by: string;
  author_name: string;
  created_at: number;
  updated_by: string;
  updated_at: number;
  embedding_model: string;
  embedding_model_provider: string;
}

export interface DifyDatasetsResponse {
  data: DifyDataset[];
  has_more: boolean;
  limit: number;
  page: number;
  total: number;
}

export async function fetchDifyDatasets(): Promise<DifyDatasetsResponse> {
  const res = await api.get<DifyDatasetsResponse>('/dify/datasets');
  return res.data;
}

/**
 * Fetch all datasets via Dify public API (Bearer token auth).
 */
export async function fetchAllDatasets(): Promise<DifyDatasetsResponse> {
  const res = await api.get<DifyDatasetsResponse>('/dify/all-datasets');
  return res.data;
}

// ── Dify App Detail ──

export async function fetchDifyAppDetail(appId: string): Promise<any> {
  const res = await api.get(`/dify/apps/${appId}`);
  return res.data;
}

// ── Dify App Workflow (published) ──

export async function fetchDifyAppWorkflow(appId: string): Promise<any> {
  const res = await api.get(`/dify/apps/${appId}/workflow/publish`);
  return res.data;
}

// ── Portal Links ──

export type PortalLinkScope = 'personal' | 'public';

export interface PortalLink {
  id: number;
  name: string;
  url: string;
  icon: string;
  description: string | null;
  background_image: string | null;
  category: string;
  sort_order: number;
  is_builtin: boolean;
  scope: PortalLinkScope;
  owner_id: number | null;
  owner_name: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface PortalLinkCreate {
  name: string;
  url: string;
  icon?: string;
  description?: string;
  background_image?: string;
  scope?: PortalLinkScope;
}

export interface PortalLinkUpdate {
  name?: string;
  url?: string;
  icon?: string;
  description?: string;
  background_image?: string;
  scope?: PortalLinkScope;
}

export async function fetchPortalLinks(): Promise<PortalLink[]> {
  const res = await api.get<PortalLink[]>('/portal/links');
  return res.data;
}

export async function createPortalLink(data: PortalLinkCreate): Promise<PortalLink> {
  const res = await api.post<PortalLink>('/portal/links', data);
  return res.data;
}

export async function updatePortalLink(id: number, data: PortalLinkUpdate): Promise<PortalLink> {
  const res = await api.put<PortalLink>(`/portal/links/${id}`, data);
  return res.data;
}

export async function deletePortalLink(id: number): Promise<void> {
  await api.delete(`/portal/links/${id}`);
}

export async function uploadPortalBackground(linkId: number, file: File): Promise<PortalLink> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await api.post<PortalLink>(`/portal/links/${linkId}/background`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function deletePortalBackground(linkId: number): Promise<PortalLink> {
  const res = await api.delete<PortalLink>(`/portal/links/${linkId}/background`);
  return res.data;
}

// ── Test Machines ──

export interface TestMachine {
  id: number;
  name: string;
  ip_address: string;
  teamviewer_id: string | null;
  rdp_username: string | null;
  status: 'busy' | 'idle' | 'unknown' | 'offline';
  locked: boolean;
  tags: string[];
  occupier_user_id: number | null;
  occupier_username: string | null;
  occupied_at: string | null;
  expires_at: string | null;
  remaining_seconds: number | null;
  auto_renew: boolean | null;
  // Agent probe metadata (reported by is-busy.py heartbeat)
  hostname: string | null;
  last_seen_at: string | null;
  last_idle_seconds: number | null;
  last_rdp_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface TestMachineCreate {
  name: string;
  ip_address: string;
  teamviewer_id?: string;
  rdp_username?: string;
  status?: string;
  locked?: boolean;
  tags?: string[];
}

export interface TestMachineUpdate {
  name?: string;
  ip_address?: string;
  teamviewer_id?: string;
  rdp_username?: string;
  status?: string;
  locked?: boolean;
  tags?: string[];
}

export interface TestMachineLog {
  id: number;
  machine_id: number;
  machine_name: string | null;
  user_id: number | null;
  username: string | null;
  action: string;
  detail: string | null;
  created_at: string | null;
}

export interface TestMachineLogListResponse {
  items: TestMachineLog[];
  total: number;
}

export async function fetchTestMachines(): Promise<TestMachine[]> {
  const res = await api.get<TestMachine[]>('/test-machines');
  return res.data;
}

export async function createTestMachine(data: TestMachineCreate): Promise<TestMachine> {
  const res = await api.post<TestMachine>('/test-machines', data);
  return res.data;
}

export async function updateTestMachine(id: number, data: TestMachineUpdate): Promise<TestMachine> {
  const res = await api.put<TestMachine>(`/test-machines/${id}`, data);
  return res.data;
}

export async function deleteTestMachine(id: number): Promise<void> {
  await api.delete(`/test-machines/${id}`);
}

export async function occupyTestMachine(id: number, durationMinutes: number, autoRenew = false): Promise<TestMachine> {
  const res = await api.post<TestMachine>(`/test-machines/${id}/occupy`, {
    duration_minutes: durationMinutes,
    auto_renew: autoRenew,
  });
  return res.data;
}

export async function releaseTestMachine(id: number): Promise<TestMachine> {
  const res = await api.post<TestMachine>(`/test-machines/${id}/release`);
  return res.data;
}

export async function heartbeatTestMachine(id: number): Promise<TestMachine> {
  const res = await api.post<TestMachine>(`/test-machines/${id}/heartbeat`);
  return res.data;
}

export async function fetchTestMachineLogs(params: { machine_id?: number; page?: number; page_size?: number } = {}): Promise<TestMachineLogListResponse> {
  const res = await api.get<TestMachineLogListResponse>('/test-machines/logs', { params });
  return res.data;
}

// ── Test Results ──

export interface TestResultRun {
  id: number;
  build_number: string;
  hardware_version: string | null;
  software_version: string | null;
  sdk_version: string | null;
  test_type: string;
  description: string | null;
  target_amount: number | null;
  current_done: number;
  failed_count: number;
  test_machine: string;
  created_at: string | null;
  updated_at: string | null;
}

export interface TestResultBuildGroup {
  build_number: string;
  hardware_version: string | null;
  software_version: string | null;
  sdk_version: string | null;
  runs: TestResultRun[];
}

export interface TestResultBuildListResponse {
  items: TestResultBuildGroup[];
  total: number;
}

export interface TestResultBuildListParams {
  build_number?: string;
  test_type?: string;
  test_machine?: string;
  page?: number;
  page_size?: number;
}

export async function fetchTestResultBuilds(params: TestResultBuildListParams = {}): Promise<TestResultBuildListResponse> {
  const res = await api.get<TestResultBuildListResponse>('/test-results/builds', { params });
  return res.data;
}

// ── File Manager (LAN SMB share) ──

export interface FileEntry {
  name: string;
  is_dir: boolean;
  size: number | null;
  modified_at: string | null;
}

export interface FileListResponse {
  path: string;
  parent: string | null;
  items: FileEntry[];
}

export async function fetchFileList(path: string = ''): Promise<FileListResponse> {
  const res = await api.get<FileListResponse>('/files/list', { params: { path } });
  return res.data;
}

// Downloads go through a plain browser link (not axios) so large files are not
// subject to the axios 30s timeout.
export function getFileDownloadUrl(path: string): string {
  return `/api/files/download?path=${encodeURIComponent(path)}`;
}

export function getZipDownloadUrl(path: string): string {
  return `/api/files/download-zip?path=${encodeURIComponent(path)}`;
}

export function getFilePreviewUrl(path: string): string {
  return `/api/files/preview?path=${encodeURIComponent(path)}`;
}

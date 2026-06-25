import axios from "axios";

const BASE = "http://localhost:8000";

const api = axios.create({
  baseURL: BASE,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("nyx_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export interface Agent {
  id: string;
  hostname: string;
  username: string;
  os: string;
  arch: string;
  ip: string;
  sleep: string;
  jitter: string;
  is_active: boolean;
  last_seen: string;
  created_at: string;
}

export interface Task {
  id: string;
  agent_id: string;
  command: string;
  output: string;
  status: "pending" | "running" | "completed" | "failed";
  created_at: string;
  completed_at: string | null;
}

export const login = (username: string, password: string) => {
  const form = new URLSearchParams({ username, password });
  return axios.post<{ access_token: string }>(`${BASE}/api/auth/token`, form).then((r) => r.data);
};

export const getAgents = () => api.get<Agent[]>("/api/agents/").then((r) => r.data);
export const getAgentTasks = (id: string) => api.get<Task[]>(`/api/agents/${id}/tasks`).then((r) => r.data);
export const createTask = (agent_id: string, command: string) =>
  api.post<Task>("/api/tasks/", { agent_id, command }).then((r) => r.data);

export const createAgentWS = (agentId: string) =>
  new WebSocket(`ws://localhost:8000/ws/agents/${agentId}`);

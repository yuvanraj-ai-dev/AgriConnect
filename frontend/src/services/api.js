import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  timeout: 75000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = 'Bearer ' + token;
  return config;
});

api.interceptors.response.use((response) => {
  if (response.config.headers.Authorization) window.dispatchEvent(new Event('agri-session-active'));
  return response;
}, (error) => {
  if (error.response?.data?.code === 'SESSION_EXPIRED' &&
      error.config?.headers.Authorization === 'Bearer ' + localStorage.getItem('token')) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.replace('/login?expired=1');
  }
  return Promise.reject(error);
});

export default api;

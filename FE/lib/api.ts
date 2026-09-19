import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  withCredentials: true,
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const data = error.response?.data;
    if (typeof window !== 'undefined') {
      // /auth/me is also used on public pages (e.g. /pricing) just to detect
      // login state — a 401 there means "logged out", not "kick to /login".
      // Protected pages redirect themselves when getCurrentUser() is null.
      const isAuthProbe = error.config?.url?.includes('/auth/me');
      if (status === 401 && !isAuthProbe) {
        window.location.href = '/login';
      } else if (status === 403 && data?.code === 'UPGRADE_REQUIRED') {
        // Global backstop: any gated call surfaces an upgrade prompt without
        // every page needing its own handler. Call sites still get the reject.
        window.dispatchEvent(
          new CustomEvent('rm:upgrade-required', {
            detail: { message: data.message, requiredPlan: data.requiredPlan },
          })
        );
      }
    }
    return Promise.reject(error);
  }
);

export default api;

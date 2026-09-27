// Helper method to make authenticated fetch requests

let isRefreshing = false;
let refreshPromise = null;

// options.redirectOnAuthFailure (default true): when a request gets 401 and the token refresh also fails, the user is
// sent to /login. Passive session probes (e.g. AuthContext's initial /api/auth/me on every page load) pass `false`
// so that PUBLIC routes such as /verify stay reachable while logged out; protected routes are guarded by ProtectedRoute.
export const apiFetch = async (endpoint, options = {}) => {
    const { headers, redirectOnAuthFailure = true, ...restOptions } = options;
    const isFormData = restOptions.body instanceof FormData;
    const defaultHeaders = isFormData ? {} : {
        'Content-Type': 'application/json',
    };

    let res = await fetch(endpoint, {
        ...restOptions,
        credentials: 'include',
        headers: {
            ...defaultHeaders,
            ...headers,
        },
    });

    let isJson = res.headers.get('content-type')?.includes('application/json');
    let data = isJson ? await res.json() : null;

    if (!res.ok) {
        if (res.status === 401 && !options._retry) {
            options._retry = true;

            if (!isRefreshing) {
                isRefreshing = true;
                refreshPromise = fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
                    .then(r => r.json())
                    .catch(e => null)
                    .finally(() => {
                        isRefreshing = false;
                    });
            }

            const refreshData = await refreshPromise;
            
            if (refreshData && refreshData.success) {
                // Retry request with cookies implicitly included
                res = await fetch(endpoint, {
                    ...restOptions,
                    credentials: 'include',
                    headers: {
                        ...defaultHeaders,
                        ...headers,
                    },
                });
                
                isJson = res.headers.get('content-type')?.includes('application/json');
                data = isJson ? await res.json() : null;
            } else {
                if (redirectOnAuthFailure && window.location.pathname !== '/login') {
                    window.location.href = '/login';
                }
            }
        }

        if (!res.ok) {
            const error = new Error((data && data.message) || res.statusText);
            // Expose the real HTTP status + parsed body so callers can branch on the
            // actual response shape instead of fragile message string-matching.
            error.status = res.status;
            error.data = data;
            throw error;
        }
    }

    return data;
};

const api = {
    get: async (endpoint, options) => ({ data: await apiFetch(endpoint, { ...options, method: 'GET' }) }),
    post: async (endpoint, body, options) => ({ data: await apiFetch(endpoint, { ...options, method: 'POST', body: JSON.stringify(body) }) }),
    put: async (endpoint, body, options) => ({ data: await apiFetch(endpoint, { ...options, method: 'PUT', body: JSON.stringify(body) }) }),
    delete: async (endpoint, options) => ({ data: await apiFetch(endpoint, { ...options, method: 'DELETE' }) }),
};

export default api;

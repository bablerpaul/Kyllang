// Helper method to make authenticated fetch requests

export const apiFetch = async (endpoint, options = {}) => {
    const token = localStorage.getItem('certificate_portal_token');

    const defaultHeaders = {
        'Content-Type': 'application/json',
    };

    if (token) {
        defaultHeaders['Authorization'] = `Bearer ${token}`;
    }

    const { headers, ...restOptions } = options;

    const res = await fetch(endpoint, {
        ...restOptions,
        headers: {
            ...defaultHeaders,
            ...headers,
        },
    });

    const isJson = res.headers.get('content-type')?.includes('application/json');
    const data = isJson ? await res.json() : null;

    if (!res.ok) {
        const error = (data && data.message) || res.statusText;
        throw new Error(error);
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

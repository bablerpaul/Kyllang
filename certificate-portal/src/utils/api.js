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

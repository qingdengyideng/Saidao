const { API_BASE_URL, N8N_BASE_URL, TOKEN_KEY } = window.SaidaoConfig;

async function request(url, {
    method = 'GET',
    body,
    withAuth = false,
    fromN8N = false,
    headers = {},
    showLoading: useLoading = true
} = {}) {
    if (useLoading && typeof window.showLoading === 'function') {
        window.showLoading();
    }

    try {
        const fingerprint = typeof window.getFingerprint === 'function'
            ? await window.getFingerprint()
            : '';

        const finalHeaders = {
            Accept: 'application/json',
            fp: fingerprint,
            ...headers
        };

        const isFormData = body instanceof FormData;
        if (body && !isFormData) {
            finalHeaders['Content-Type'] = 'application/json';
        }

        if (withAuth) {
            const token = localStorage.getItem(TOKEN_KEY);
            if (token) {
                finalHeaders.Authorization = token;
            }
        }

        const baseUrl = fromN8N ? N8N_BASE_URL : API_BASE_URL;
        const response = await fetch(`${baseUrl}${url}`, {
            method,
            credentials: 'include',
            headers: finalHeaders,
            body: isFormData ? body : JSON.stringify(body)
        });

        const result = await response.json();

        if (response.status === 401) {
            if (typeof window.openLoginModal === 'function') {
                window.openLoginModal();
            }
            if (window.Toast?.show) {
                window.Toast.show('请先登录', 'error');
            }
            throw new Error('请先登录');
        }

        if (!response.ok) {
            const message = result.message || '请求失败';
            if (window.Toast?.show) {
                window.Toast.show(message, 'error');
            }
            throw new Error(message);
        }

        return result;
    } finally {
        if (useLoading && typeof window.hideLoading === 'function') {
            window.hideLoading();
        }
    }
}

window.request = request;
window.ApiEndpoints = {
    saidao: () => request('/saidao/', { withAuth: true }),
    showUserDetail: (userId) => request(`/user/${userId}`),
    currentUser: () => request('/user/', { withAuth: true }),
    login: (data) => request('/user/login', { method: 'POST', body: data }),
    register: (data) => request('/user/register', { method: 'POST', body: data }),
    forgotPassword: (data) => request('/user/forgotPassword', { method: 'POST', body: data }),
    profileUpdate: (data) => request('/user/update', { method: 'POST', body: data, withAuth: true }),
    chatBan: (data) => request('/user/chatBan', { method: 'POST', body: data, withAuth: true }),
    sendVerificationCode: (data) => request('/user/sendVerificationCode', { method: 'POST', body: data }),
    updateOptions: (data) => request('/saidao/options', { method: 'POST', body: data, withAuth: true }),
    updateSaidaoTag: (data) => request('/saidao/tag', { method: 'POST', body: data, withAuth: true }),
    uploadImages: (data) => request('/api/image/upload', { method: 'POST', body: data, withAuth: true }),
    queryEmojis: (group) => request(`/emoji/${group}`, { withAuth: true }),
    uploadEmojis: (data) => request('/emoji/upload', { method: 'POST', body: data, withAuth: true }),
    testWebhook: (data) => request('/webhook/testWebhook', { method: 'POST', body: data, withAuth: true, fromN8N: true }),
    getCaptcha: () => request('/user/captcha')
};

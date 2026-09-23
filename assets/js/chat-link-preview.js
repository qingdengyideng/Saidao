(function (global) {
    'use strict';

    const WARNING_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='white' d='M7 2.1a1 1 0 0 1 2 0v6.2a1 1 0 0 1-2 0V2.1Zm1 11.8a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Z'/%3E%3C/svg%3E";

    function normalize(preview) {
        if (typeof preview?.url !== 'string' || typeof preview?.title !== 'string') return null;
        const title = Array.from(preview.title.trim()).slice(0, 512).join('');
        if (!title || preview.url.length > 4096 || !/^https?:\/\//i.test(preview.url)) return null;
        return { url: preview.url, title };
    }

    function create(container) {
        // Retain recent results across history reloads and events arriving before their message.
        const previews = new Map();

        function updateScroll(title) {
            const text = title.firstElementChild;
            const distance = Math.max(0, text.offsetWidth - title.clientWidth);
            text.style.setProperty('--link-preview-distance', `${-distance}px`);
            text.classList.toggle('is-scrolling', title.clientWidth > 0 && distance > 1);
        }

        // One observer per chat container; removed messages are never retained.
        const resizeObserver = new ResizeObserver(() => {
            container.querySelectorAll('.message-link-preview-title').forEach(updateScroll);
        });
        resizeObserver.observe(container);

        function apply(data, messageElement) {
            const preview = previews.get(String(data.messageId)) || normalize(data.linkPreview);
            if (!preview) return;
            data.linkPreview = preview;
            const bubble = messageElement?.querySelector('.message-text');
            if (!bubble) return;
            let hint = bubble.querySelector('.message-link-preview');
            if (!hint) {
                hint = bubble.ownerDocument.createElement('div');
                hint.className = 'message-link-preview';
                const icon = bubble.ownerDocument.createElement('img');
                icon.className = 'message-link-preview-icon';
                icon.alt = '';
                icon.src = WARNING_ICON;
                const copy = bubble.ownerDocument.createElement('span');
                copy.className = 'message-link-preview-copy';
                const title = bubble.ownerDocument.createElement('span');
                title.className = 'message-link-preview-title';
                const titleText = bubble.ownerDocument.createElement('span');
                titleText.className = 'message-link-preview-title-text';
                title.append(titleText);
                const separator = bubble.ownerDocument.createElement('span');
                separator.className = 'message-link-preview-separator';
                separator.textContent = '｜';
                const caution = bubble.ownerDocument.createElement('span');
                caution.className = 'message-link-preview-caution';
                caution.textContent = '请谨慎访问';
                copy.append(title, separator, caution);
                hint.append(icon, copy);
                bubble.append(hint);
            }
            hint.querySelector('.message-link-preview-title-text').textContent = `· ${preview.title}`;
            hint.querySelector('.message-link-preview-title').title = preview.title;
            updateScroll(hint.querySelector('.message-link-preview-title'));
        }

        function receive(data) {
            const preview = normalize(data.linkPreview);
            if (!data.messageId || !preview) return;
            const id = String(data.messageId);
            previews.delete(id);
            previews.set(id, preview);
            if (previews.size > 1000) previews.delete(previews.keys().next().value);
            const message = container.querySelector(`.chat-message[data-message-id="${CSS.escape(id)}"]`);
            if (message?._messageData) apply(message._messageData, message);
        }

        return { apply, receive, clear: () => previews.clear() };
    }

    global.ChatLinkPreview = { create };
})(typeof window !== 'undefined' ? window : globalThis);

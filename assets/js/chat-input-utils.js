(function (global) {
    function shouldSendOnChatKeydown(event) {
        return event.key === 'Enter' && event.ctrlKey !== true;
    }

    function shouldInsertLineBreakOnChatKeydown(event) {
        return event.key === 'Enter' && event.ctrlKey === true;
    }

    function getAutoGrowMetrics({ scrollHeight, minHeight, maxHeight }) {
        const height = Math.max(minHeight, Math.min(scrollHeight, maxHeight));

        return {
            height,
            overflowY: scrollHeight > maxHeight ? 'auto' : 'hidden',
        };
    }

    const api = {
        shouldSendOnChatKeydown,
        shouldInsertLineBreakOnChatKeydown,
        getAutoGrowMetrics,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    global.ChatInputUtils = api;
})(typeof window !== 'undefined' ? window : globalThis);

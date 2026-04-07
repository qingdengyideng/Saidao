window.SaidaoConfig = Object.freeze({
    API_BASE_URL: 'https://api.saidao.cc',
    N8N_BASE_URL: 'https://n8n.saidao.cc',
    WS_BASE_URL: 'wss://api.saidao.cc',
    TOKEN_KEY: 'ACCESS_TOKEN'
});

window.SaidaoState = {
    isLoggedIn: false,
    currentUser: null,
    currentStatus: 'live',
    chatExpanded: false,
    emojiExpanded: false,
    currentEmojiGroup: 'vip',
    chatWidth: 540,
    webhookType: '',
    isMobile: window.innerWidth <= 768,
    faction: '',
    canEditSaidaoTag: false
};

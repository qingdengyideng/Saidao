const state = window.SaidaoState;
const { WS_BASE_URL } = window.SaidaoConfig;
const ApiEndpoints = window.ApiEndpoints;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const byId = (id) => document.getElementById(id);
const on = (target, event, handler, options) => target?.addEventListener(event, handler, options);
const ChatInputUtils = window.ChatInputUtils;
const setActiveItem = (items, current, activeClass = 'active') => {
    items.forEach((item) => item.classList.toggle(activeClass, item === current));
};
const setModalOpen = (id, isOpen) => byId(id)?.classList.toggle('active', isOpen);
const BLOCK_IMAGE_MESSAGES_KEY = 'blockImageMessages';
const HOT_WORDS_COLLAPSED_KEY = 'chatHotWordsCollapsed';
const CHAT_FILTER_RULES_KEY = 'chatFilterRulesV1';
const CHAT_VIDEO_WINDOW_STATE_KEY = 'chatVideoWindowState';
const BLOCK_GAME_LIVE_KEY = 'blockGameLive';
const AI_LABEL_HINT = 'AI标签由模型识别直播画面自动生成，可能存在误判。';
let chatFilterRules = createEmptyChatFilterRules();
const blockedUserNameCache = new Map();
const chatMessageBuffer = [];
const CHAT_MESSAGE_BUFFER_LIMIT = 500;
let hotWordSearchState = {
    word: '',
    cursor: null
};

// 检测设备类型
function detectDeviceType() {
    state.isMobile = window.innerWidth <= 768;
}

let streamersData = [];
let dailyReportsData = [];
const emojiData = {};
let tagEditorTarget = null;
let activeStreamerPreview = null;

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function getStreamerStreamType(url) {
    const path = String(url || '').split('#')[0].split('?')[0].toLowerCase();
    if (path.endsWith('.m3u8')) return 'hls';
    if (path.endsWith('.flv')) return 'flv';
    return '';
}

function stopStreamerPreview() {
    const preview = activeStreamerPreview;
    if (!preview) return;

    activeStreamerPreview = null;
    preview.layer.classList.remove('is-previewing', 'is-preview-loading');
    preview.hls?.destroy();
    if (preview.flvPlayer) {
        try {
            preview.flvPlayer.pause();
            preview.flvPlayer.unload();
            preview.flvPlayer.destroy();
        } catch (_) {
            // The stream may already be disconnected.
        }
    }
    preview.video.pause();
    preview.video.removeAttribute('src');
    preview.video.load();
    preview.video.remove();
}

function startStreamerPreview(card, streamer) {
    const streamUrl = String(streamer?.streamUrl || '').trim();
    const streamType = getStreamerStreamType(streamUrl);
    if (streamer?.status !== 'live' || !streamType || activeStreamerPreview?.card === card) return;

    stopStreamerPreview();
    const layer = $('.streamer-cover-layer', card);
    if (!layer) return;

    const video = document.createElement('video');
    video.className = 'streamer-card-preview';
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.preload = 'none';

    const preview = { card, layer, video, hls: null, flvPlayer: null };
    activeStreamerPreview = preview;
    layer.classList.add('is-previewing', 'is-preview-loading');
    layer.appendChild(video);
    video.addEventListener('playing', () => {
        if (activeStreamerPreview === preview) {
            layer.classList.remove('is-preview-loading');
        }
    }, { once: true });
    video.addEventListener('error', () => {
        if (activeStreamerPreview === preview) stopStreamerPreview();
    });

    if (streamType === 'flv') {
        const flvLib = window.mpegts?.isSupported?.() ? window.mpegts : null;
        if (!flvLib) return stopStreamerPreview();
        preview.flvPlayer = flvLib.createPlayer({ type: 'flv', url: streamUrl, isLive: true }, {
            enableWorker: true,
            enableStashBuffer: false,
            lazyLoad: false
        });
        preview.flvPlayer.attachMediaElement(video);
        preview.flvPlayer.load();
        video.play().catch(() => {});
        return;
    }

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = streamUrl;
        video.play().catch(() => {});
        return;
    }

    if (!window.Hls?.isSupported?.()) return stopStreamerPreview();
    preview.hls = new window.Hls({ lowLatencyMode: true, backBufferLength: 30 });
    preview.hls.loadSource(streamUrl);
    preview.hls.attachMedia(video);
    preview.hls.on(window.Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
    preview.hls.on(window.Hls.Events.ERROR, (_, data) => {
        if (data.fatal && activeStreamerPreview === preview) stopStreamerPreview();
    });
}

function initializeApp() {
    applyDarkMode();
    detectDeviceType();
    setViewportHeightVar();
    applyStoredChatImageFilter();
    syncGameFilterUi();
    setHotWordsCollapsed(isHotWordsCollapsed());
    loadChatFilterRules();
    initEventListeners();
    initializeFactionSelection();
    initializeEmojiPreviewDelegation();
    fetchStreamers();
    fetchDailyReports();
    fetchNotice();
    checkIsLogin();
    showPendingAllocationCredentials();
    setupWebSocket();
    updateUIState();

    const chatSidebar = byId('chatSidebar');
    chatSidebar.style.width = `${state.chatWidth}px`;

    if (!state.isMobile) {
        chatSidebar.classList.remove('collapsed');
        state.chatExpanded = true;
    }

        syncChatSpaceReservation();

    on(window, 'resize', handleResize);
    on(window, 'orientationchange', setViewportHeightVar);
    on(window, 'pagehide', stopStreamerPreview);
}

function handleResize() {
    if (handleResize._raf) return;
    handleResize._raf = requestAnimationFrame(() => {
        handleResize._raf = null;
        detectDeviceType();
        setViewportHeightVar();
        updateNoticeScroll();
        const chatSidebar = byId('chatSidebar');
        if (state.isMobile && !chatSidebar.classList.contains('collapsed')) {
            chatSidebar.style.width = '100%';
        }
        syncChatSpaceReservation();
    });
}

function setViewportHeightVar() {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
}

function syncChatInputHeight(input = byId('chatInput')) {
    if (!input) return;

    const styles = window.getComputedStyle(input);
    const minHeight = parseFloat(styles.minHeight) || input.clientHeight;
    const maxHeight = parseFloat(styles.maxHeight) || input.scrollHeight;

    input.style.height = 'auto';

    const { height, overflowY } = ChatInputUtils.getAutoGrowMetrics({
        scrollHeight: input.scrollHeight,
        minHeight,
        maxHeight,
    });

    input.style.height = `${height}px`;
    input.style.overflowY = overflowY;
}

function initializeFactionSelection() {
    const factionOptions = $$('.faction-option-row');
    const selectedFactionInput = byId('selectedFaction');

    factionOptions.forEach((option) => {
        on(option, 'click', () => {
            const faction = option.dataset.faction;
            const radioInput = $('input[type="radio"]', option);

            setActiveItem(factionOptions, option, 'selected');
            radioInput.checked = true;
            selectedFactionInput.value = faction;
        });
    });
}

function initializeEmojiPreviewDelegation() {
    on(document, 'click', (event) => {
        const image = event.target.closest('img.chat-emoji');
        if (!image) return;

        event.preventDefault();
        const imgSrc = image.src || image.getAttribute('data-src');
        (window.showImagePreview || showImagePreview)?.(imgSrc);
    });
}

function isImageMessagesBlocked() {
    return localStorage.getItem(BLOCK_IMAGE_MESSAGES_KEY) === 'true';
}

function createEmptyChatFilterRules() {
    return { blockedUserIds: [], blockedNicknames: [], blockedIpGeos: [], keywordPatterns: [] };
}

function normalizeChatFilterRules(value) {
    const uniqueLines = (items) => [...new Set((Array.isArray(items) ? items : [])
        .map((item) => String(item ?? '').trim()).filter(Boolean))];
    return {
        blockedUserIds: uniqueLines(value?.blockedUserIds).filter((id) => /^\d+$/.test(id) && id !== '0'),
        blockedNicknames: uniqueLines(value?.blockedNicknames),
        blockedIpGeos: uniqueLines(value?.blockedIpGeos),
        keywordPatterns: uniqueLines(value?.keywordPatterns)
    };
}

function readStoredChatFilterRules() {
    try {
        return normalizeChatFilterRules(JSON.parse(localStorage.getItem(CHAT_FILTER_RULES_KEY) || '{}'));
    } catch {
        return createEmptyChatFilterRules();
    }
}

function getChatMessageText(content) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = content || '';
    return wrapper.innerText || wrapper.textContent || '';
}

function shouldFilterChatMessage(data) {
    if (!data || data.type && data.type !== 'user') return false;
    const uid = String(data.uid ?? '0');
    if (uid !== '0' && chatFilterRules.blockedUserIds.includes(uid)) return true;
    if (uid === '0' && chatFilterRules.blockedNicknames.includes(String(data.uname || '').trim())) return true;
    if (chatFilterRules.blockedIpGeos.includes(String(data.ipGeo || '').trim())) return true;
    const text = getChatMessageText(data.content);
    return chatFilterRules.keywordPatterns.some((pattern) => {
        try {
            return new RegExp(pattern, 'i').test(text);
        } catch {
            return false;
        }
    });
}

let rerenderChatFromBuffer = () => {};

function bufferChatMessage(data, position = 'append') {
    if (!data) return;
    const messageId = data.messageId ? String(data.messageId) : '';
    if (messageId && chatMessageBuffer.some((item) => item.id === messageId)) {
        return;
    }
    const entry = { id: messageId, data };
    if (position === 'prepend') {
        chatMessageBuffer.unshift(entry);
        if (chatMessageBuffer.length > CHAT_MESSAGE_BUFFER_LIMIT) chatMessageBuffer.pop();
    } else {
        chatMessageBuffer.push(entry);
        if (chatMessageBuffer.length > CHAT_MESSAGE_BUFFER_LIMIT) chatMessageBuffer.shift();
    }
}

function applyChatFilterRules() {
    rerenderChatFromBuffer();
}

async function loadChatFilterRules() {
    chatFilterRules = readStoredChatFilterRules();
    if (state.isLoggedIn) {
        try {
            const result = await ApiEndpoints.chatFilterConfig();
            chatFilterRules = normalizeChatFilterRules(result.data);
            localStorage.setItem(CHAT_FILTER_RULES_KEY, JSON.stringify(chatFilterRules));
        } catch (error) {
            console.warn('加载聊天室屏蔽设置失败:', error);
        }
    }
    applyChatFilterRules();
}

async function saveChatFilterRules(rules) {
    chatFilterRules = normalizeChatFilterRules(rules);
    localStorage.setItem(CHAT_FILTER_RULES_KEY, JSON.stringify(chatFilterRules));
    if (state.isLoggedIn) await ApiEndpoints.updateChatFilterConfig(chatFilterRules);
    applyChatFilterRules();
}

async function openChatFilterModal() {
    byId('blockedKeywordPatterns').value = chatFilterRules.keywordPatterns.join('\n');
    syncGameFilterUi();
    setModalOpen('chatFilterModal', true);
    await renderBlockedUsersList();
}

function closeChatFilterModal() {
    setModalOpen('chatFilterModal', false);
}

function getChatFilterRulesFromForm() {
    const keywordPatterns = byId('blockedKeywordPatterns').value.split('\n').map((line) => line.trim()).filter(Boolean);
    for (const pattern of keywordPatterns) new RegExp(pattern, 'i');
    return { ...chatFilterRules, keywordPatterns };
}

async function renderBlockedUsersList() {
    const list = byId('blockedUsersList');
    if (!list) return;
    list.textContent = '正在加载已屏蔽用户...';
    const userNames = await Promise.all(chatFilterRules.blockedUserIds.map(async (id) => {
        if (blockedUserNameCache.has(id)) return blockedUserNameCache.get(id);
        try {
            const result = await ApiEndpoints.showUserDetail(id);
            const name = String(result.data?.name || '用户已不存在');
            blockedUserNameCache.set(id, name);
            return name;
        } catch {
            return '用户已不存在';
        }
    }));
    const users = [
        ...chatFilterRules.blockedUserIds.map((id, index) => ({ type: 'id', value: id, label: userNames[index] })),
        ...chatFilterRules.blockedNicknames.map((name) => ({ type: 'nickname', value: name, label: name })),
        ...chatFilterRules.blockedIpGeos.map((geo) => ({ type: 'ipGeo', value: geo, label: `IP属地：${geo}` }))
    ];
    if (!users.length) {
        list.textContent = '暂无屏蔽用户';
        return;
    }
    list.replaceChildren(...users.map((user) => {
        const item = document.createElement('span');
        item.className = 'chat-filter-user';
        item.textContent = user.label;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.title = '取消屏蔽';
        remove.setAttribute('aria-label', `取消屏蔽 ${user.label}`);
        remove.innerHTML = '<i class="fas fa-times"></i>';
        remove.addEventListener('click', async () => {
            const rules = { ...chatFilterRules };
            if (user.type === 'id') rules.blockedUserIds = rules.blockedUserIds.filter((id) => id !== user.value);
            else if (user.type === 'nickname') rules.blockedNicknames = rules.blockedNicknames.filter((name) => name !== user.value);
            else rules.blockedIpGeos = rules.blockedIpGeos.filter((geo) => geo !== user.value);
            try {
                await saveChatFilterRules(rules);
                openChatFilterModal();
            } catch (error) {
                Toast.show(error.message || '更新屏蔽设置失败', 'error');
            }
        });
        item.appendChild(remove);
        return item;
    }));
}

async function handleSaveChatFilterRules() {
    try {
        await saveChatFilterRules(getChatFilterRulesFromForm());
        closeChatFilterModal();
        Toast.show('屏蔽设置已保存', 'success');
    } catch (error) {
        Toast.show(error.message || '屏蔽规则格式无效', 'error');
    }
}

function applyStoredChatImageFilter() {
    const checkbox = byId('blockImageMessages');
    if (checkbox) {
        checkbox.checked = isImageMessagesBlocked();
    }
}

function isHotWordsCollapsed() {
    return localStorage.getItem(HOT_WORDS_COLLAPSED_KEY) === 'true';
}

function setHotWordsCollapsed(collapsed) {
    const container = byId('chatHotWords');
    const toggle = byId('chatHotWordsToggle');

    if (container && container.dataset.hasHotWords === 'true') {
        container.hidden = collapsed;
        container.dataset.collapsed = String(collapsed);
    }
    if (toggle) {
        toggle.setAttribute('aria-expanded', String(!collapsed));
        toggle.setAttribute('title', collapsed ? '展开 Hot 模块' : '收起 Hot 模块');
        toggle.classList.toggle('is-collapsed', collapsed);
    }
    localStorage.setItem(HOT_WORDS_COLLAPSED_KEY, String(collapsed));
}

function handleBlockImageMessagesChange(event) {
    const blocked = event.target.checked;
    localStorage.setItem(BLOCK_IMAGE_MESSAGES_KEY, String(blocked));

    $$('.chat-message.image-message').forEach((messageElement) => {
        if (blocked) {
            hideChatImageMessage(messageElement);
        } else {
            showChatImageMessage(messageElement);
        }
    });
}

function isPureImageMessageContent(content) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = content || '';

    const meaningfulNodes = Array.from(wrapper.childNodes).filter((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            return node.textContent.trim() !== '';
        }

        if (node.nodeType !== Node.ELEMENT_NODE) {
            return false;
        }

        return node.tagName !== 'BR' || node.textContent.trim() !== '';
    });

    if (meaningfulNodes.length !== 1) {
        return false;
    }

    const onlyNode = meaningfulNodes[0];
    return onlyNode.nodeType === Node.ELEMENT_NODE
        && onlyNode.matches('img');
}

function getFirstImageSrc(content) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = content || '';
    const image = wrapper.querySelector('img');
    return image?.getAttribute('src') || image?.getAttribute('data-src') || '';
}

function markImageLoaded(image) {
    if (!image) return;
    const previewContent = image.closest('.image-preview-content');

    if (image.complete && image.naturalWidth > 0) {
        image.classList.add('is-loaded');
        previewContent?.classList.add('is-loaded');
        return;
    }

    image.addEventListener('load', () => {
        image.classList.add('is-loaded');
        previewContent?.classList.add('is-loaded');
    }, { once: true });
}

function ensureChatImageHiddenTip(messageElement) {
    let tip = messageElement.querySelector(':scope > .chat-image-hidden-tip');
    if (tip) {
        return tip;
    }

    tip = document.createElement('button');
    tip.type = 'button';
    tip.className = 'chat-image-hidden-tip';
    tip.textContent = '图片消息已隐藏';
    tip.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        showChatImageMessage(messageElement);
    });
    messageElement.appendChild(tip);
    return tip;
}

function hideChatImageMessage(messageElement) {
    if (!messageElement) return;

    ensureChatImageHiddenTip(messageElement);
    messageElement.classList.add('image-hidden');
}

function showChatImageMessage(messageElement) {
    if (!messageElement) return;

    messageElement.classList.remove('image-hidden');
    messageElement.querySelector(':scope > .chat-image-hidden-tip')?.remove();
    const image = messageElement.querySelector('.message-text img');
    markImageLoaded(image);
}

function renderHotWords(words) {
    const container = byId('chatHotWords');
    if (!container) return;

    const visibleWords = (Array.isArray(words) ? words : [])
        .filter((word) => word && String(word.text || '').trim())
        .slice(0, 8);

    if (!visibleWords.length) {
        container.hidden = true;
        container.dataset.hasHotWords = 'false';
        container.dataset.collapsed = String(isHotWordsCollapsed());
        container.innerHTML = '';
        return;
    }

    container.dataset.hasHotWords = 'true';
    container.innerHTML = visibleWords.map((word) => {
        const text = String(word.text).trim();
        const count = Number(word.count) || 0;
        return `
            <button class="hotword-chip" type="button" data-word="${escapeHtml(text)}" title="定位包含 ${escapeHtml(text)} 的消息">
                <span class="hotword-chip-label">${escapeHtml(text)}</span>
                <span class="hotword-chip-count">${count}</span>
            </button>
        `;
    }).join('');
    setHotWordsCollapsed(isHotWordsCollapsed());
}

function toggleHotWordsCollapsed() {
    const container = byId('chatHotWords');
    const collapsed = container?.dataset.collapsed === 'true' || isHotWordsCollapsed();
    setHotWordsCollapsed(!collapsed);
}

function getMessageSearchText(messageElement) {
    const content = messageElement?.dataset?.content;
    if (content) {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = content;
        return wrapper.innerText || wrapper.textContent || '';
    }

    return messageElement?.querySelector('.message-text')?.innerText || '';
}

function clearHotWordHighlights(root = document) {
    root.querySelectorAll('mark.hotword-match').forEach((mark) => {
        mark.replaceWith(document.createTextNode(mark.textContent));
    });
    root.normalize();
}

function highlightHotWordInMessage(messageElement, word) {
    const messageText = messageElement?.querySelector('.message-text');
    if (!messageText || !word) return;

    clearHotWordHighlights(messageText);

    const keyword = String(word);
    const keywordLower = keyword.toLowerCase();
    const walker = document.createTreeWalker(messageText, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) {
        textNodes.push(node);
    }

    textNodes.forEach((textNode) => {
        const value = textNode.nodeValue || '';
        const index = value.toLowerCase().indexOf(keywordLower);
        if (index < 0) return;

        const range = document.createRange();
        range.setStart(textNode, index);
        range.setEnd(textNode, index + keyword.length);

        const mark = document.createElement('mark');
        mark.className = 'hotword-match';
        range.surroundContents(mark);
    });
}

function focusHotWordMessage(word) {
    const keyword = String(word || '').trim().toLowerCase();
    if (!keyword) return;

    clearHotWordHighlights();

    const messages = getChatMessageNodes();
    const matches = messages.filter((messageElement) => (
        getMessageSearchText(messageElement).toLowerCase().includes(keyword)
    ));

    if (!matches.length) {
        hotWordSearchState = { word: '', cursor: null };
        Toast.show('当前聊天记录中未找到该热词', 'info');
        return;
    }

    const previousCursor = hotWordSearchState.word === keyword ? hotWordSearchState.cursor : null;
    const previousIndex = previousCursor
        ? matches.findIndex((messageElement) => messageElement === previousCursor)
        : -1;
    const nextIndex = previousIndex > 0 ? previousIndex - 1 : matches.length - 1;
    const target = matches[nextIndex];
    hotWordSearchState = { word: keyword, cursor: target };

    target.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
    });

    highlightHotWordInMessage(target, word);
    target.classList.add('message-highlight');
    setTimeout(() => {
        target.classList.remove('message-highlight');
    }, 2000);
}

document.addEventListener('DOMContentLoaded', initializeApp);

// 初始化事件监听器
function initEventListeners() {
    const input = byId('chatInput');
    const filterTabs = $$('.filter-tab');
    const emojiTabs = $$('.emoji-tab');
    const webhookOptions = $$('.webhook-option');
    const cardsGrid = byId('cardsGrid');

    on(byId('loginBtn'), 'click', openLoginModal);
    on(byId('userAvatar'), 'click', openProfileModal);
    on(byId('sponsorBtn'), 'click', () => {
        window.location.href = 'sponsor.html';
    });
    on(byId('collapseChat'), 'click', toggleChat);
    on(byId('closeChat'), 'click', toggleChat);
    on(byId('refreshBtn'), 'click', (event) => {
        event.preventDefault();
        fetchStreamers();
    });
    on(byId('blockImageMessages'), 'change', handleBlockImageMessagesChange);
    on(byId('blockGameLive'), 'change', handleBlockGameLiveChange);
    on(byId('blockGameLiveHelp'), 'click', showGameFilterHint);
    on(byId('blockGameLiveHelp'), 'keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            showGameFilterHint();
        }
    });
    on(byId('openChatFilterModal'), 'click', openChatFilterModal);
    on(byId('chatHotWordsToggle'), 'click', (event) => {
        event.preventDefault();
        toggleHotWordsCollapsed();
    });
    on(byId('chatHotWords'), 'click', (event) => {
        const chip = event.target.closest('.hotword-chip');
        if (!chip) return;
        focusHotWordMessage(chip.dataset.word);
    });

        [
            ['closeLoginModal', closeLoginModal],
            ['closeAllocationResult', closeAllocationResult],
            ['finishAllocation', closeAllocationResult],
            ['closeCaptchaModal', closeCaptchaModal],
            ['confirmCaptchaBtn', confirmAllocationCaptcha],
            ['openChangePassword', openChangePasswordModal],
            ['closeChangePassword', closeChangePasswordModal],
            ['closeProfileModal', closeProfileModal],
            ['closeUserDetailModal', closeUserDetailModal],
            ['closeTagEditorModal', closeTagEditor],
            ['closeChatFilterModal', closeChatFilterModal],
            ['saveChatFilterRules', handleSaveChatFilterRules],
            ['clearChatFilterRules', async () => {
                await saveChatFilterRules(createEmptyChatFilterRules());
                openChatFilterModal();
            }],
            ['tagEditorCancelBtn', closeTagEditor],
            ['allocateAccount', openAllocationCaptcha],
            ['copyAllocationCredentials', copyAllocationCredentials],
            ['testWebhookBtn', handleTestWebhook],
            ['emojiPickerToggle', toggleEmojiSection],
            ['emojiToggle', sendMessage],
            ['voiceToggle', toggleVoiceRecording],
            ['voiceRecordingPanel', toggleVoiceRecording],
            ['logoutBtn', handleLogout],
        ].forEach(([id, handler]) => on(byId(id), 'click', handler));

        [
            ['loginForm', handleLogin],
            ['changePasswordForm', handleChangePassword],
            ['profileForm', handleProfileUpdate],
            ['tagEditorForm', handleTagEditorSubmit],
            ['avatarFileInput', handleChangeAvatar, 'change'],
        ].forEach(([id, handler, event = 'submit']) => on(byId(id), event, handler));

    on(byId('changeAvatarBtn'), 'click', (event) => {
        event.preventDefault();
        byId('avatarFileInput').click();
    });

    on(input, 'input', handleChatInput);
    on(byId('tagEditorInput'), 'input', syncTagPreview);
    syncChatInputHeight(input);
    on(input, 'keydown', (event) => {
        if (ChatInputUtils.shouldInsertLineBreakOnChatKeydown(event)) {
            event.preventDefault();
            input.setRangeText('\n', input.selectionStart, input.selectionEnd, 'end');
            input.dispatchEvent(new Event('input', { bubbles: true }));
            return;
        }

        if (!ChatInputUtils.shouldSendOnChatKeydown(event)) return;
        event.preventDefault();
        sendMessage();
    });

    filterTabs.forEach((tab) => {
        on(tab, 'click', () => {
            setActiveItem(filterTabs, tab);
            state.currentStatus = tab.dataset.status;
            
            // 控制显示/隐藏
            const cardsContainer = document.querySelector('.cards-container');
            const videoRoomContainer = document.getElementById('videoRoomContainer');
            
            if (tab.dataset.status === 'videoRoom') {
                // 显示点播室，隐藏卡片容器
                if (cardsContainer) cardsContainer.hidden = true;
                if (videoRoomContainer) {
                    videoRoomContainer.hidden = false;
                    // 初始化点播室
                    if (window.VideoRoomManager) {
                        VideoRoomManager.init();
                    }
                }
            } else {
                // 显示卡片容器，隐藏点播室
                if (cardsContainer) cardsContainer.hidden = false;
                if (videoRoomContainer) videoRoomContainer.hidden = true;
                
                if (tab.dataset.status === 'dailyReport') {
                    markDailyReportsSeen();
                }
                renderStreamerCards();
            }
        });
    });

    emojiTabs.forEach((tab) => {
        on(tab, 'click', () => {
            setActiveItem(emojiTabs, tab);
            state.currentEmojiGroup = tab.dataset.group;
            renderEmojis();
        });
    });

    webhookOptions.forEach((option) => {
        on(option, 'click', () => {
            setActiveItem(webhookOptions, option, 'selected');
            state.webhookType = option.dataset.type;
            byId('selectedWebhook').value = state.webhookType;
            byId('webhookUrlContainer').style.display = 'block';
            byId('testWebhookBtn').style.display = 'flex';
            byId('webhookUrl').value = '';
            byId('webhookUrl').placeholder = getWebhookPlaceholder(option.dataset.type);
        });
    });

    if (cardsGrid) {
        on(cardsGrid, 'click', (event) => {
            const reportCard = event.target.closest('.report-card');
            if (reportCard) {
                const link = reportCard.dataset.link;
                if (link) {
                    window.open(link, '_blank', 'noopener');
                }
                return;
            }

            const tagTrigger = event.target.closest('.streamer-tag.is-editable');
            if (tagTrigger) {
                event.stopPropagation();
                const card = tagTrigger.closest('.streamer-card');
                const streamerId = Number(card?.dataset?.id);
                const streamer = streamersData.find(s => s.id === streamerId);
                if (streamer && state.currentUser?.canEditSaidaoTag === true) {
                    openTagEditor(streamer);
                }
                return;
            }

            const aiHelp = event.target.closest('.streamer-ai-help');
            if (aiHelp) {
                event.stopPropagation();
                Toast.show(aiHelp.dataset.hint || AI_LABEL_HINT, 'info', 6000);
                return;
            }

            const settingsBtn = event.target.closest('.settings-btn');
            if (settingsBtn) {
                event.stopPropagation();
                const card = settingsBtn.closest('.streamer-card');
                const settingsDropdown = card?.querySelector('.settings-dropdown');
                if (!settingsDropdown) return;
                document.querySelectorAll('.settings-dropdown.active').forEach(dropdown => {
                    if (dropdown !== settingsDropdown) dropdown.classList.remove('active');
                });
                settingsDropdown.classList.toggle('active');
                return;
            }

            const cardContent = event.target.closest('.card-content');
            if (cardContent && state.isMobile) {
                const card = cardContent.closest('.streamer-card');
                const streamer = streamersData.find(item => item.id === Number(card?.dataset?.id));
                if (activeStreamerPreview?.card === card) {
                    stopStreamerPreview();
                } else {
                    startStreamerPreview(card, streamer);
                }
                return;
            }

            const coverArea = event.target.closest('.streamer-cover-area');
            if (coverArea) {
                const card = coverArea.closest('.streamer-card');
                const url = card?.dataset?.url;
                const streamerId = Number(card?.dataset?.id);
                const streamer = streamersData.find(s => s.id === streamerId);
                if (streamerId && streamer?.status === 'live') {
                    ApiEndpoints.clickSaidao(streamerId).catch(() => {});
                }
                if (url) {
                    window.open(url, '_blank');
                }
            }
        });

        on(cardsGrid, 'change', async (event) => {
            const toggle = event.target.closest('.toggle-switch input');
            if (!toggle) return;
            const streamerId = parseInt(toggle.dataset.id);
            const streamer = streamersData.find(s => s.id === streamerId);
            if (streamer) {
                streamer.notificationEnabled = toggle.checked;
                console.log(`更新主播 ${streamerId} 通知设置: ${toggle.checked}`);
                const result = await ApiEndpoints.updateOptions({'saidaoId': streamerId, 'notShow': streamer.notificationEnabled});
                if (result.code === '0' && streamer.notificationEnabled) {
                    Toast.show('已置底并屏蔽开播消息', 'success');
                }
                await fetchStreamers();
            }
        });
    }

    if (!state.isMobile) {
        initChatResize();
    }

    $$('.modal').forEach((modal) => {
        on(modal, 'click', (event) => {
            if (event.target === modal) {
                if (modal.id === 'tagEditorModal') {
                    closeTagEditor();
                } else {
                    modal.classList.remove('active');
                }
            }
        });
    });

    on(document, 'click', (event) => {
        const hasOpen = document.querySelectorAll('.settings-dropdown.active');
        if (!hasOpen.length) return;
        if (event.target.closest('.settings-btn') || event.target.closest('.settings-dropdown')) return;
        hasOpen.forEach(dropdown => dropdown.classList.remove('active'));
    });
}

function getWebhookPlaceholder(type) {
    const channelLabelMap = {
        dingtalk: '钉钉',
        wechat: '企微',
        feishu: '飞书'
    };

    return `请输入${channelLabelMap[type] || 'Webhook'} Webhook地址`;
}

function normalizeContentAnalysis(analysis) {
    if (!analysis || typeof analysis !== 'object') {
        return null;
    }
    return {
        isGame: analysis.is_game === true,
        gameName: analysis.game_name || null,
        liveType: analysis.live_type || 'unknown',
        isOutdoor: analysis.is_outdoor === true,
        isVirtual: analysis.is_virtual === true,
        screenOrientation: analysis.screen_orientation || 'unknown',
        streamerStatus: analysis.streamer_status || 'unknown',
        overallConfidence: Number(analysis.overall_confidence) || 0,
        gameConfidence: Number(analysis.game_confidence) || 0,
        liveTypeLabel: analysis.live_type_label || '未知',
        streamerStatusLabel: analysis.streamer_status_label || '未知',
        screenOrientationLabel: analysis.screen_orientation_label || '未知',
        aiLabel: analysis.ai_label || 'AI标签：未知'
    };
}

function shouldBlockGameLive() {
    return localStorage.getItem(BLOCK_GAME_LIVE_KEY) === 'true';
}

// 仅对直播中的卡片生效，未开播的卡片不受 AI 判定影响
function isGameLiveStreamer(streamer) {
    return streamer?.status === 'live' && streamer?.contentAnalysis?.isGame === true;
}

// 被判定为游戏直播的数量，未开播的不计入
function countGameLiveStreamers() {
    return streamersData.filter(isGameLiveStreamer).length;
}

// 开关状态与右侧数量都从内存数据实时推导，避免与列表不一致
function syncGameFilterUi() {
    const checkbox = byId('blockGameLive');
    if (checkbox) {
        checkbox.checked = shouldBlockGameLive();
    }

    const counter = byId('gameFilterCount');
    if (!counter) return;

    const count = countGameLiveStreamers();
    const active = shouldBlockGameLive() && count > 0;
    counter.textContent = active ? `已屏蔽 ${count}` : '';
    counter.hidden = !active;
}

function handleBlockGameLiveChange(event) {
    localStorage.setItem(BLOCK_GAME_LIVE_KEY, String(event.target.checked));
    renderStreamerCards();
}

function showGameFilterHint() {
    Toast.show(AI_LABEL_HINT, 'info', 6000);
}

function renderAiLabel(contentAnalysis) {
    if (!contentAnalysis || !contentAnalysis.aiLabel) {
        return '';
    }
    const isGame = contentAnalysis.isGame === true;
    const hint = isGame 
        ? '如需屏蔽游戏直播，可在聊天室的「屏蔽设置」中开启「屏蔽游戏直播」开关。'
        : AI_LABEL_HINT;
    const helpIcon = isGame 
        ? `<i class="fas fa-circle-question streamer-ai-help" data-hint="${escapeHtml(hint)}" title="点击查看说明"></i>`
        : '';
    return `<span class="streamer-ai-label" title="${escapeHtml(hint)}">${escapeHtml(contentAnalysis.aiLabel)}${helpIcon}</span>`;
}

        function renderStreamerTag(streamer, canEditTag) {
            const tag = String(streamer.tag || '').trim();
            if (!tag && !canEditTag) {
                return '';
            }

            const tagLabel = tag || '添加标签+';
            const tagTag = tag ? '点击编辑标签' : '点击添加标签';

            if (canEditTag) {
                return tag
                    ? `
                        <button type="button" class="streamer-tag streamer-tag-filled is-editable" title="${tagTag}">
                            <span class="streamer-tag-pill">${escapeHtml(tagLabel)}</span>
                        </button>
                    `
                    : `
                        <button type="button" class="streamer-tag streamer-tag-empty is-editable" title="${tagTag}">
                            <span class="streamer-tag-pill">${escapeHtml(tagLabel)}</span>
                        </button>
                    `;
            }

            return `
                <span class="streamer-tag streamer-tag-filled" aria-label="主播标签">
                    <span class="streamer-tag-pill">${escapeHtml(tagLabel)}</span>
                </span>
            `;
        }

        // 渲染主播卡片
        function renderStreamerCards() {
            // 数量与开关状态跟随最新数据，日报 tab 也要保持同步
            syncGameFilterUi();

            if (state.currentStatus === 'dailyReport') {
                renderDailyReportCards();
                return;
            }
            const container = document.getElementById('cardsGrid');
            stopStreamerPreview();
            container.innerHTML = '';

            const canEditTag = state.currentUser?.canEditSaidaoTag === true;
            const blockGameLive = shouldBlockGameLive();
            const filteredStreamers = (state.currentStatus === 'live'
                ? streamersData.filter(s => s.status === 'live' && !s.notificationEnabled)
                : streamersData
            ).filter(s => !(blockGameLive && isGameLiveStreamer(s)));

            if (filteredStreamers.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">
                            <i class="fas fa-video-slash"></i>
                        </div>
                        <h3>全网无播</h3>
                        <p>当前没有${state.currentStatus === 'live' ? '直播中' : ''}的主播</p>
                    </div>
                `;
                return;
            }

            filteredStreamers.forEach(streamer => {
                const useAvatarCover = streamer.status !== 'live' || !streamer.cover;
                const card = document.createElement('div');
                card.className = 'streamer-card';
                card.dataset.id = streamer.id;
                card.dataset.url = streamer.url || '';
                card.innerHTML = `
                    <div class="streamer-cover-area">
                        <div class="streamer-cover-layer${useAvatarCover ? ' is-fallback is-avatar-muted' : ''}">
                            <div class="streamer-cover-fallback">
                                <img src="${escapeHtml(streamer.avatar || '')}" alt="">
                            </div>
                            ${!useAvatarCover
                                ? `<img src="${escapeHtml(streamer.cover)}" alt="${escapeHtml(streamer.name)}的直播封面" class="streamer-cover" onerror="this.closest('.streamer-cover-layer').classList.add('is-fallback', 'is-avatar-muted'); this.remove();">`
                                : ''}
                            ${streamer.status === 'live'
                                ? `<span class="streamer-live-badge">LIVE</span><span class="streamer-cover-start-time"><i class="far fa-clock"></i>${escapeHtml(streamer.startTime || '')}</span>`
                                : '<span class="streamer-offline-badge">未开播</span>'}
                            ${streamer.tag
                                ? (canEditTag
                                    ? `<button type="button" class="streamer-tag streamer-cover-tag is-editable" title="点击编辑标签">${escapeHtml(streamer.tag)}</button>`
                                    : `<span class="streamer-cover-tag">${escapeHtml(streamer.tag)}</span>`)
                                : ''}
                        </div>
                    </div>
                    <div class="card-content">
                        <div class="streamer-identity-avatar">
                            <img src="${escapeHtml(streamer.avatar || '')}" alt="${escapeHtml(streamer.name)}">
                        </div>
                        <div class="streamer-title-row">
                            <div class="streamer-name-heat-row">
                                <h3 class="streamer-name">${escapeHtml(streamer.name)}</h3>
                                ${streamer.status === 'live' && streamer.hotScore > 0
                                    ? `<span class="hot-indicator"><span class="hot-score-value"><i class="fas fa-fire"></i>${Math.ceil(streamer.hotScore)}</span></span>`
                                    : ''}
                            </div>
                            <div class="streamer-meta">
                                <span class="streamer-channel"><i class="fas fa-satellite-dish"></i>${escapeHtml(streamer.channel || '未知渠道')}</span>
                            </div>
                        </div>
                        <div class="streamer-ai-row"></div>
                        <div class="card-actions streamer-card-actions">
                            <div class="card-settings">
                                <button class="settings-btn" aria-label="更多设置" title="更多设置">
                                    <i class="fas fa-ellipsis-v"></i>
                                </button>
                                <div class="settings-dropdown">
                                    <div class="notification-toggle">
                                        <span>不想看TA</span>
                                        <label class="toggle-switch">
                                            <input type="checkbox" ${streamer.notificationEnabled ? 'checked' : ''} data-id="${streamer.id}">
                                            <span class="toggle-slider"></span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;

                container.appendChild(card);

                // 填充 AI 标签并标记内容区，有标签时增加底部 padding 腾出空间
                const aiRow = $('.streamer-ai-row', card);
                const cardContent = $('.card-content', card);
                if (aiRow) {
                    const aiHtml = renderAiLabel(streamer.contentAnalysis);
                    aiRow.innerHTML = aiHtml;
                    if (cardContent && aiHtml) {
                        cardContent.classList.add('has-ai-label');
                    }
                }

                const coverArea = $('.streamer-cover-area', card);
                on(coverArea, 'pointerenter', () => {
                    if (!state.isMobile) startStreamerPreview(card, streamer);
                });
                on(coverArea, 'pointerleave', () => {
                    if (activeStreamerPreview?.card === card) stopStreamerPreview();
                });
            });
        }


        // 渲染表情
        // 用于缓存已经加载过的表情数据
        const emojiCache = {};

        async function renderEmojis() {
            const container = document.getElementById('emojiContainer');
            const group = state.currentEmojiGroup;

            // 清空容器
            container.innerHTML = '';

            // 如果是VIP分组，添加上传按钮
            if (group === 'vip') {
                const uploadBtn = document.createElement('div');
                uploadBtn.className = 'emoji-upload-btn';
                uploadBtn.innerHTML = '<div class="upload-plus">+</div>';
                uploadBtn.title = '支持JPG/PNG/GIF/WEBP，最大2MB';

                uploadBtn.addEventListener('click', async () => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';

                    input.onchange = async (e) => {
                        const file = e.target.files[0];
                        if (!file) return;

                        // 文件大小验证
                        if (file.size > 2 * 1024 * 1024) {
                            alert('文件大小不能超过2MB');
                            return;
                        }

                        // 上传文件
                        const formData = new FormData();
                        formData.append('file', file);

                        const result = await ApiEndpoints.uploadEmojis(formData);
                        if (result.code === '0') {
                            Toast.show('上传成功', 'success')
                        }
                        // 清除缓存并重新渲染
                        delete emojiCache[group];
                        await renderEmojis();
                    };

                    input.click();
                });

                container.appendChild(uploadBtn);
            }

            // 如果缓存中有当前group的内容，直接渲染
            if (emojiCache[group]) {
                emojiCache[group].forEach(node => container.appendChild(node));
                return;
            }

            // 获取数据并渲染
            const result = await ApiEndpoints.queryEmojis(group);
            const nodes = [];

            result.data.forEach(emoji => {
                let node;

                if (group === 'animation') {
                    node = document.createElement('video');
                    node.src = emoji.url;
                    node.className = 'emoji-item';
                    node.playsInline = true;
                    node.alt = emoji.name;
                    node.autoplay = false;
                    node.muted = true;
                    node.title = emoji.name;

                    node.addEventListener('mouseenter', () => {
                        if (node.paused) {
                            node.currentTime = 0;
                            node.play().catch(() => {});
                        }
                    });

                    node.addEventListener('mouseleave', () => {
                        node.pause();
                        node.currentTime = 0;
                    });

                    node.addEventListener('click', () => insertEmoji(emoji));
                } else {
                    node = document.createElement('img');
                    node.src = emoji.url;
                    node.className = `emoji-item ${group}`;
                    if (group !== 'vip') {
                        node.alt = emoji.name;
                        node.title = emoji.name;
                    }
                    node.addEventListener('click', () => insertEmoji(emoji));
                }

                container.appendChild(node);
                nodes.push(node);
            });

            // 缓存DOM节点
            emojiCache[group] = nodes;
        }

        // 更新UI状态
        function updateUIState() {
            const loginBtn = byId('loginBtn');
            const userAvatar = byId('userAvatar');
            const chatInput = byId('chatInput');

            chatInput.disabled = false;
            chatInput.placeholder = '来嘟两句呗...';

            if (state.isLoggedIn) {
                loginBtn.style.display = 'none';
                userAvatar.style.display = 'block';
                userAvatar.src = state.currentUser.avatar;
            } else {
                loginBtn.style.display = 'flex';
                userAvatar.style.display = 'none';
            }
        }

        // 切换聊天室显示/隐藏
        function toggleChat() {
            const chatSidebar = byId('chatSidebar');
            const chatToggleIcon = $('i', byId('collapseChat'));

            state.chatExpanded = !state.chatExpanded;

            if (state.chatExpanded) {
                chatSidebar.classList.remove('collapsed');
                chatToggleIcon.className = 'fas fa-comment-dots';

                // 移动端展开聊天室时，设置宽度为100%
                if (state.isMobile) {
                    chatSidebar.style.width = '100%';
                }
            } else {
                chatSidebar.classList.add('collapsed');
                chatToggleIcon.className = 'fas fa-comment-dots';
            }

            syncChatSpaceReservation();
        }

        function syncChatSpaceReservation() {
            const chatSidebar = byId('chatSidebar');
            const chatOpenOnDesktop = !state.isMobile
                && chatSidebar
                && !chatSidebar.classList.contains('collapsed');
            const chatWidth = chatSidebar?.getBoundingClientRect().width || state.chatWidth;

            document.documentElement.classList.toggle('chat-space-active', chatOpenOnDesktop);
            document.documentElement.style.setProperty('--chat-sidebar-width', `${chatWidth}px`);
        }

        // 切换表情面板
        function toggleEmojiSection() {
            const emojiSection = byId('emojiSection');
            const emojiToggleIcon = $('i', byId('emojiPickerToggle'));

            state.emojiExpanded = !state.emojiExpanded;

            if (state.emojiExpanded) {
                emojiSection.classList.add('expanded');
                emojiToggleIcon.className = 'fas fa-smile';
                renderEmojis();
            } else {
                emojiSection.classList.remove('expanded');
                emojiToggleIcon.className = 'far fa-smile';
            }
        }

        function closeEmojiSection() {
            if (!state.emojiExpanded) return;
            const emojiSection = byId('emojiSection');
            const emojiToggleIcon = $('i', byId('emojiPickerToggle'));
            emojiSection.classList.remove('expanded');
            emojiToggleIcon.className = 'far fa-smile';
            state.emojiExpanded = false;
         }

        let voiceRecorder = null;
        let voiceChunks = [];
        let voiceStream = null;
        let voiceStartedAt = 0;
        let voiceTimer = null;
        let voiceDraft = null;
        let voiceDraftAudio = null;
        let isVoiceUploading = false;
        const VOICE_MIN_SECONDS = 1;
        const VOICE_MAX_SECONDS = 60;

        function isVoiceRecording() {
            return voiceRecorder && voiceRecorder.state === 'recording';
        }

        function updateVoiceRecordingUi(recording, uploading = isVoiceUploading) {
            const button = byId('voiceToggle');
            const time = byId('voiceRecordingTime');
            const shell = byId('chatInputShell');
            const recordingPanel = byId('voiceRecordingPanel');
            const emojiButton = byId('emojiPickerToggle');
            button?.classList.toggle('recording', recording);
            button?.classList.toggle('uploading', uploading);
            button?.toggleAttribute('disabled', uploading);
            shell?.classList.toggle('recording', recording);
            if (recordingPanel) recordingPanel.hidden = !recording;
            emojiButton?.classList.toggle('hidden-during-voice', recording || Boolean(voiceDraft));
            if (time && recording) time.textContent = '0:00';
        }

        function syncChatComposerState() {
            const chatInput = byId('chatInput');
            const shell = byId('chatInputShell');
            const sendButton = byId('emojiToggle');
            const showVoiceEntry = window.ChatInputUtils.shouldShowVoiceEntry({
                value: chatInput?.value || '',
                hasVoiceDraft: Boolean(voiceDraft),
            });
            shell?.classList.toggle('has-text', !showVoiceEntry && !voiceDraft);
            shell?.classList.toggle('has-voice-draft', Boolean(voiceDraft));
            byId('emojiPickerToggle')?.classList.toggle('hidden-during-voice', Boolean(voiceDraft) || isVoiceRecording());
            if (sendButton) {
                sendButton.disabled = isVoiceUploading || (!voiceDraft && (chatInput?.value.trim() || '') === '');
            }
        }

        function stopVoiceTracks() {
            voiceStream?.getTracks().forEach((track) => track.stop());
            voiceStream = null;
        }

        function clearVoiceTimer() {
            if (voiceTimer) {
                clearInterval(voiceTimer);
                voiceTimer = null;
            }
        }

        async function toggleVoiceRecording() {
            if (isVoiceUploading) {
                return;
            }
            if (isVoiceRecording()) {
                voiceRecorder.stop();
                return;
            }
            await startVoiceRecording();
        }

        async function startVoiceRecording() {
            clearVoiceDraft();
            if (!state.isLoggedIn) {
                openLoginModal();
                Toast.show('请先登录后发送语音', 'error');
                return;
            }

            if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
                Toast.show('当前浏览器不支持录音', 'error');
                return;
            }

            if (!socket || socket.readyState !== WebSocket.OPEN) {
                Toast.show('聊天室连接中，请稍后再试', 'error');
                return;
            }

            try {
                const mimeType = window.ChatVoiceUtils.getSupportedVoiceMimeType();
                voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                voiceChunks = [];
                voiceRecorder = new MediaRecorder(voiceStream, mimeType ? { mimeType } : undefined);
                voiceStartedAt = Date.now();

                voiceRecorder.addEventListener('dataavailable', (event) => {
                    if (event.data && event.data.size > 0) {
                        voiceChunks.push(event.data);
                    }
                });
                voiceRecorder.addEventListener('stop', handleVoiceRecordingStop, { once: true });
                voiceRecorder.start();
                updateVoiceRecordingUi(true);
                startVoiceTimer();
            } catch (error) {
                console.error('录音失败:', error);
                voiceRecorder = null;
                voiceChunks = [];
                stopVoiceTracks();
                updateVoiceRecordingUi(false);
                Toast.show('无法使用麦克风，请检查权限', 'error');
            }
        }

        function startVoiceTimer() {
            clearVoiceTimer();
            voiceTimer = setInterval(() => {
                const seconds = (Date.now() - voiceStartedAt) / 1000;
                const time = byId('voiceRecordingTime');
                if (time) {
                    time.textContent = window.ChatVoiceUtils.formatVoiceDuration(seconds);
                }
                if (seconds >= VOICE_MAX_SECONDS && isVoiceRecording()) {
                    voiceRecorder.stop();
                }
            }, 250);
        }

        async function handleVoiceRecordingStop() {
            clearVoiceTimer();
            updateVoiceRecordingUi(false);
            stopVoiceTracks();

            const duration = (Date.now() - voiceStartedAt) / 1000;
            const mimeType = voiceRecorder?.mimeType || 'audio/webm';
            const chunks = voiceChunks;
            voiceRecorder = null;
            voiceChunks = [];

            if (duration < VOICE_MIN_SECONDS) {
                Toast.show('录音时间太短', 'error');
                return;
            }

            const blob = new Blob(chunks, { type: mimeType });
            await setVoiceDraft(blob, duration);
        }

        async function setVoiceDraft(blob, estimatedDuration) {
            const { duration, waveform } = await getVoiceBlobMeta(blob, estimatedDuration);
            const audioUrl = URL.createObjectURL(blob);
            voiceDraft = { blob, duration, waveform, audioUrl };
            renderVoiceDraft();
            syncChatComposerState();
            closeEmojiSection();
        }

        function clearVoiceDraft() {
            if (voiceDraftAudio) {
                voiceDraftAudio.pause();
                voiceDraftAudio = null;
            }
            if (voiceDraft?.audioUrl) {
                URL.revokeObjectURL(voiceDraft.audioUrl);
            }
            voiceDraft = null;
            const draft = byId('voiceDraft');
            if (draft) {
                draft.hidden = true;
                draft.innerHTML = '';
            }
            syncChatComposerState();
        }

        function renderVoiceDraft() {
            const draft = byId('voiceDraft');
            if (!draft || !voiceDraft) return;
            draft.hidden = false;
            if (isVoiceUploading) {
                draft.classList.add('uploading');
                draft.innerHTML = `
                    <span class="voice-upload-spinner" aria-hidden="true"></span>
                    <span class="voice-upload-text">正在发送...</span>
                `;
                return;
            }

            draft.classList.remove('uploading');
            draft.innerHTML = `
                <button class="voice-draft-play" type="button" aria-label="试听语音">
                    <i class="fas fa-play"></i>
                </button>
                <span class="voice-draft-label">试听</span>
                <span class="voice-draft-duration">${window.ChatVoiceUtils.formatVoiceDurationSeconds(voiceDraft.duration)}</span>
                <button class="voice-draft-send" type="button" aria-label="发送语音">
                    发送
                </button>
                <button class="voice-draft-cancel" type="button" aria-label="取消语音">
                    <i class="fas fa-times"></i>
                </button>
            `;
            on(draft.querySelector('.voice-draft-play'), 'click', toggleVoiceDraftPlayback);
            on(draft.querySelector('.voice-draft-send'), 'click', sendVoiceDraft);
            on(draft.querySelector('.voice-draft-cancel'), 'click', clearVoiceDraft);
        }

        function toggleVoiceDraftPlayback() {
            if (!voiceDraft) return;
            const button = byId('voiceDraft')?.querySelector('.voice-draft-play');
            if (!voiceDraftAudio) {
                voiceDraftAudio = new Audio(voiceDraft.audioUrl);
                voiceDraftAudio.addEventListener('ended', () => {
                    button?.classList.remove('playing');
                    button?.querySelector('i')?.classList.replace('fa-pause', 'fa-play');
                });
            }

            if (voiceDraftAudio.paused) {
                voiceDraftAudio.play().then(() => {
                    button?.classList.add('playing');
                    button?.querySelector('i')?.classList.replace('fa-play', 'fa-pause');
                }).catch(() => Toast.show('试听失败', 'error'));
            } else {
                voiceDraftAudio.pause();
                button?.classList.remove('playing');
                button?.querySelector('i')?.classList.replace('fa-pause', 'fa-play');
            }
        }

        async function sendVoiceBlob(blob, duration) {
            try {
                const waveform = voiceDraft?.waveform || await buildVoiceWaveform(blob);
                const formData = new FormData();
                formData.append('file', blob, `voice-${Date.now()}.webm`);
                const result = await ApiEndpoints.uploadVoice(formData);
                const audioUrl = result?.data?.url;
                if (!audioUrl) {
                    throw new Error('voice upload returned empty url');
                }

                const newMessage = {
                    type: 'voice',
                    audioUrl,
                    duration: Math.round(duration * 10) / 10,
                    waveform,
                };
                if (currentQuote) {
                    newMessage.reply = currentQuote;
                }
                
                if (!pendingMessage) {
                    pendingMessage = newMessage;
                    socket.send(JSON.stringify(newMessage));
                }
                
                clearQuote();
                clearVoiceDraft();
            } catch (error) {
                console.error('发送语音失败:', error);
                Toast.show('语音发送失败', 'error');
            }
        }

        async function sendVoiceDraft() {
            if (!voiceDraft || isVoiceUploading) return;
            isVoiceUploading = true;
            updateVoiceRecordingUi(false, true);
            syncChatComposerState();
            renderVoiceDraft();
            try {
                await sendVoiceBlob(voiceDraft.blob, voiceDraft.duration);
            } finally {
                isVoiceUploading = false;
                updateVoiceRecordingUi(false, false);
                syncChatComposerState();
                if (voiceDraft) {
                    renderVoiceDraft();
                }
            }
        }

        async function getVoiceBlobMeta(blob, fallbackDuration) {
            try {
                const arrayBuffer = await blob.arrayBuffer();
                const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
                if (!AudioContextCtor) {
                    return {
                        duration: Math.max(VOICE_MIN_SECONDS, Math.min(fallbackDuration, VOICE_MAX_SECONDS)),
                        waveform: window.ChatVoiceUtils.clampWaveform([], 32),
                    };
                }
                const audioContext = new AudioContextCtor();
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
                const samples = audioBuffer.getChannelData(0);
                await audioContext.close?.();
                return {
                    duration: Math.max(VOICE_MIN_SECONDS, Math.min(audioBuffer.duration, VOICE_MAX_SECONDS)),
                    waveform: window.ChatVoiceUtils.buildWaveformFromSamples(samples, 32),
                };
            } catch (error) {
                console.warn('读取语音信息失败:', error);
                return {
                    duration: Math.max(VOICE_MIN_SECONDS, Math.min(fallbackDuration, VOICE_MAX_SECONDS)),
                    waveform: window.ChatVoiceUtils.clampWaveform([], 32),
                };
            }
        }

        async function buildVoiceWaveform(blob) {
            try {
                const arrayBuffer = await blob.arrayBuffer();
                const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
                if (!AudioContextCtor) {
                    return window.ChatVoiceUtils.clampWaveform([], 32);
                }
                const audioContext = new AudioContextCtor();
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
                const samples = audioBuffer.getChannelData(0);
                await audioContext.close?.();
                return window.ChatVoiceUtils.buildWaveformFromSamples(samples, 32);
            } catch (error) {
                console.warn('生成语音频谱失败:', error);
                return window.ChatVoiceUtils.clampWaveform([], 32);
            }
        }

        // 插入表情到聊天输入框
        function insertEmoji(emoji) {
            clearVoiceDraft();

            if (emoji && emoji.hasOwnProperty('clickSend') && emoji.clickSend) {
                const newMessage = {
                    type: 'chat',
                    content: `[${emoji.name}]`,
                };

                if (!pendingMessage) {
                    pendingMessage = newMessage;
                    socket.send(JSON.stringify(newMessage));
                }
                
                closeEmojiSection();
                return;
            }

            const chatInput = byId('chatInput');
            chatInput.value += `[${emoji.name}]`;
            syncChatInputHeight(chatInput);
            chatInput.focus();
            syncChatComposerState();
        }

        // 处理聊天输入
        function handleChatInput() {
            if (this.value.trim() !== '') {
                clearVoiceDraft();
            }
            syncChatComposerState();
            syncChatInputHeight(this);
        }

        let currentVoiceAudio = null;
        let currentVoiceButton = null;

        function renderVoiceMessage(data) {
            const width = window.ChatVoiceUtils.getVoiceBubbleWidth(data.duration);

            return `
                <div class="voice-message" data-audio-url="${escapeHtml(data.audioUrl || '')}" style="--voice-width:${width}px">
                    <button class="voice-play-btn" type="button" aria-label="播放语音">
                        <i class="fas fa-play"></i>
                    </button>
                    <div class="voice-signal" aria-hidden="true">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                    <span class="voice-duration">${window.ChatVoiceUtils.formatVoiceDurationSeconds(data.duration)}</span>
                </div>
            `;
        }

        // 语音播放逻辑已迁移到容器事件委托中的 handleVoicePlayClick

        // 显示用户详情
        async function showUserDetail(userId) {

            const result = await ApiEndpoints.showUserDetail(userId);
            const userDetail = result.data;

            byId('detailName').textContent = userDetail.name;
            byId('detailAvatar').src = userDetail.avatar;
            byId('detailBio').textContent = userDetail.bio;
            byId('detailUserId').textContent = `用户ID: ${userDetail.id}`;
            byId('detailRegistrationTime').textContent = `注册时间: ${new Date(userDetail.registerDate).toLocaleDateString()}`;

            on(byId('detailAvatar'), 'click', () => showImagePreview(userDetail.avatar));

            setModalOpen('userDetailModal', true);
        }

        // 初始化聊天室宽度拖拽
        function initChatResize() {
            const resizeHandle = document.getElementById('chatResizeHandle');
            const chatSidebar = document.getElementById('chatSidebar');
            let isResizing = false;

            resizeHandle.addEventListener('mousedown', function(e) {
                isResizing = true;
                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
            });

            function handleMouseMove(e) {
                if (!isResizing) return;

                const newWidth = window.innerWidth - e.clientX;
                if (newWidth >= 250 && newWidth <= 600) {
                    state.chatWidth = newWidth;
                    chatSidebar.style.width = newWidth + 'px';
                    syncChatSpaceReservation();
                }
            }

            function handleMouseUp() {
                isResizing = false;
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            }
        }

        // 模态框相关函数
        function openModal(id) {
            closeAllModals();
            setModalOpen(id, true);
        }

        function closeModal(id) {
            setModalOpen(id, false);
        }

        function openLoginModal() {
            openModal('loginModal');
        }

        function closeLoginModal() {
            closeModal('loginModal');
        }

        function openChangePasswordModal() {
            openModal('changePasswordModal');
        }

        function closeChangePasswordModal() {
            closeModal('changePasswordModal');
        }

        function closeAllocationResult() {
            closeModal('allocationResultModal');
        }

        function openProfileModal() {
            closeAllModals();
            // 加载当前用户数据
            if (state.currentUser) {
                byId('profileName').value = state.currentUser.name;
                byId('profileBio').value = state.currentUser.bio || '';
                byId('profileAvatar').src = state.currentUser.avatar;

                on(byId('profileAvatar'), 'click', () => showImagePreview(state.currentUser.avatar));

                if (state.currentUser.webhookType) {
                    const option = $(`.webhook-option[data-type="${state.currentUser.webhookType}"]`);
                    if (option) {
                        option.click();
                        byId('webhookUrl').value = state.currentUser.webhookUrl || '';
                    }
                }

                // 根据 currentUser.faction 设置选择的阵营
                if (state.currentUser.faction) {
                    const selectedFaction = state.currentUser.faction;
                    const factionOption = $(`.faction-option-row[data-faction="${selectedFaction}"]`);
                    if (factionOption) {
                        factionOption.classList.add('selected');
                        factionOption.querySelector('input[type="radio"]').checked = true;
                        byId('selectedFaction').value = selectedFaction;
                    }
                }
            }
            setModalOpen('profileModal', true);
        }

        function closeProfileModal() {
            closeModal('profileModal');
        }

        function handleLogout() {
            localStorage.removeItem(window.SaidaoConfig.TOKEN_KEY);
            window.location.reload();
        }

        function closeUserDetailModal() {
            closeModal('userDetailModal');
        }

        function openTagEditor(streamer) {
            if (!streamer || state.currentUser?.canEditSaidaoTag !== true) {
                return;
            }

            tagEditorTarget = streamer;
            byId('tagEditorTitle').textContent = streamer.name;
            byId('tagEditorInput').value = streamer.tag || '';
            byId('tagEditorHint').textContent = streamer.tag ? '点击保存会更新为新的唯一标签。留空可清空标签。' : '当前主播还没有标签，输入后即可保存。';
            byId('tagEditorPreview').innerHTML = `
                <i class="fas fa-tag"></i>
                <span>${escapeHtml(streamer.tag || '添加一个标签')}</span>
            `;
            setModalOpen('tagEditorModal', true);
            byId('tagEditorInput').focus();
        }

        function closeTagEditor() {
            tagEditorTarget = null;
            closeModal('tagEditorModal');
        }

        function syncTagPreview() {
            const input = byId('tagEditorInput');
            const preview = byId('tagEditorPreview');
            if (!input || !preview) return;
            const value = input.value.trim();
            preview.innerHTML = `
                <i class="fas fa-tag"></i>
                <span>${escapeHtml(value || '添加一个标签')}</span>
            `;
        }

        function applySaidaoTagUpdate(payload) {
            const saidaoId = Number(payload?.saidaoId);
            if (!saidaoId) return;

            const tag = String(payload?.tag || '').trim();
            const streamer = streamersData.find(item => Number(item.id) === saidaoId);
            if (streamer) {
                streamer.tag = tag;
            }

            if (tagEditorTarget && Number(tagEditorTarget.id) === saidaoId) {
                tagEditorTarget.tag = tag;
                const input = byId('tagEditorInput');
                const hint = byId('tagEditorHint');
                const preview = byId('tagEditorPreview');
                if (input) input.value = tag;
                if (hint) {
                    hint.textContent = tag ? '点击保存会更新为新的唯一标签。留空可清空标签。' : '当前主播还没有标签，输入后即可保存。';
                }
                if (preview) {
                    preview.innerHTML = `
                        <i class="fas fa-tag"></i>
                        <span>${escapeHtml(tag || '添加一个标签')}</span>
                    `;
                }
            }
        }

        function applySaidaoCoverUpdate(payload) {
            let update;
            try {
                update = typeof payload?.content === 'string'
                    ? JSON.parse(payload.content)
                    : payload?.content;
            } catch (error) {
                console.warn('解析赛道封面更新消息失败', error);
                return;
            }

            const uid = String(update?.uid || '');
            if (!uid) return;

            const streamer = streamersData.find(item => String(item.uid) === uid);
            if (!streamer) return;

            streamer.cover = String(update?.cover || '').trim();
            updateStreamerCardCover(streamer);
        }

        function updateStreamerCardCover(streamer) {
            const card = document.querySelector(`.streamer-card[data-id="${streamer.id}"]`);
            const layer = card && $('.streamer-cover-layer', card);
            if (!layer) return;

            $('.streamer-cover', layer)?.remove();
            if (streamer.status !== 'live' || !streamer.cover) {
                layer.classList.add('is-fallback', 'is-avatar-muted');
                return;
            }

            const cover = document.createElement('img');
            cover.className = 'streamer-cover';
            cover.src = streamer.cover;
            cover.alt = `${streamer.name}的直播封面`;
            cover.onerror = () => {
                layer.classList.add('is-fallback', 'is-avatar-muted');
                cover.remove();
            };
            $('.streamer-cover-fallback', layer)?.insertAdjacentElement('afterend', cover);
            layer.classList.remove('is-fallback', 'is-avatar-muted');
        }

        function applySaidaoContentAnalysisUpdate(payload) {
            const uid = String(payload?.uid || '');
            const analysis = payload?.contentAnalysis;
            if (!uid || !analysis) return;

            const streamer = streamersData.find(item => String(item.uid) === uid);
            if (!streamer) return;

            const wasGameLive = isGameLiveStreamer(streamer);
            streamer.contentAnalysis = normalizeContentAnalysis(analysis);
            const isGameLive = isGameLiveStreamer(streamer);

            // 屏蔽结果发生翻转时，卡片需要整体增删，走全量重渲染
            if (shouldBlockGameLive() && wasGameLive !== isGameLive) {
                renderStreamerCards();
                return;
            }

            const card = document.querySelector(`.streamer-card[data-id="${streamer.id}"]`);
            const aiRow = card && $('.streamer-ai-row', card);
            const cardContent = card && $('.card-content', card);
            if (aiRow && cardContent) {
                const aiHtml = renderAiLabel(streamer.contentAnalysis);
                aiRow.innerHTML = aiHtml;
                cardContent.classList.toggle('has-ai-label', Boolean(aiHtml));
            }
        }

        function applyHotScoreUpdate(scores) {
            if (!scores || !scores.length) return;

            scores.forEach(({ saidaoId, hotScore, level }) => {
                const streamer = streamersData.find(s => s.id === saidaoId);
                if (streamer) {
                    streamer.hotScore = hotScore;
                }

                const card = document.querySelector(`.streamer-card[data-id="${saidaoId}"]`);
                if (!card) return;

                let indicator = card.querySelector('.hot-indicator');
                if (hotScore > 0) {
                    if (indicator) {
                        indicator.innerHTML = `🔥<span class="hot-score-value">${Math.ceil(streamer.hotScore)}</span>`;
                    } else {
                        indicator = document.createElement('span');
                        indicator.className = 'hot-indicator';
                        indicator.innerHTML = `🔥<span class="hot-score-value">${Math.ceil(streamer.hotScore)}</span>`;
                        const nameRow = card.querySelector('.streamer-name-heat-row');
                        if (nameRow) nameRow.appendChild(indicator);
                    }
                } else if (indicator) {
                    indicator.remove();
                }
            });

            // 根据热度值重排序卡片
            reorderCardsByHotScore();
        }

        function reorderCardsByHotScore() {
            const container = document.getElementById('cardsGrid');
            if (!container) return;

            const cards = Array.from(container.querySelectorAll('.streamer-card'));
            if (cards.length <= 1) return;

            cards.sort((a, b) => {
                const idA = Number(a.dataset.id);
                const idB = Number(b.dataset.id);
                const streamerA = streamersData.find(s => s.id === idA);
                const streamerB = streamersData.find(s => s.id === idB);
                const scoreA = streamerA?.hotScore || 0;
                const scoreB = streamerB?.hotScore || 0;
                return scoreB - scoreA;
            });

            cards.forEach(card => container.appendChild(card));
        }

        async function handleTagEditorSubmit(event) {
            event.preventDefault();

            if (!tagEditorTarget) {
                return;
            }

            const input = byId('tagEditorInput');
            const saveBtn = byId('tagEditorSaveBtn');
            const tag = input.value.trim();

            saveBtn.disabled = true;
            try {
                const result = await ApiEndpoints.updateSaidaoTag({
                    saidaoId: tagEditorTarget.id,
                    tag
                });

                if (result.code === '0') {
                    Toast.show(tag ? '标签已更新' : '标签已清空', 'success');
                    closeTagEditor();
                } else {
                    Toast.show(result.message || '标签更新失败', 'error');
                }
            } finally {
                saveBtn.disabled = false;
            }
        }

        function closeAllModals() {
            tagEditorTarget = null;
            $$('.modal').forEach(modal => {
                modal.classList.remove('active');
            });
        }

        async function checkIsLogin() {
            const result = await ApiEndpoints.currentUser();
            const data = result.data
            if (data !== null && data.user !== null) {
                state.isLoggedIn = true;
                state.currentUser = {
                    id: data.user.id,
                    name: data.user.name,
                    email: data.user.email,
                    avatar: data.user.avatar,
                    bio: data.user.bio || '这个人很懒，什么都没写',
                    webhookType: data.user.webhookType,
                    webhookUrl: data.user.webhookUrl,
                    faction: data.user.faction,
                    canChatBan: data.user.canChatBan === true,
                    canEditSaidaoTag: data.user.canEditSaidaoTag === true
                };

                updateUIState();
                renderStreamerCards();
                closeLoginModal();
                await loadChatFilterRules();
            }
        }

        // 表单处理函数
        async function handleLogin(e) {
            e.preventDefault();

            const email = document.getElementById('loginAccount').value;
            const password = document.getElementById('loginPassword').value;

            if (!email || !password) {
                Toast.show('请输入账号或邮箱和密码', 'warning');
                return;
            }

            const result = await ApiEndpoints.login({ email, password });
            const { token, user } = result.data;
            localStorage.setItem(TOKEN_KEY, token);
            Toast.show('登录成功', 'success');

            window.location.reload();

        }
        let allocationCaptchaId = '';

        async function openAllocationCaptcha() {
            const result = await ApiEndpoints.getCaptcha();
            if (result.code !== '0') return;

            allocationCaptchaId = result.data.captchaId;
            byId('captchaCode').value = '';
            byId('captchaImage').src = result.data.base64Image;
            openModal('captchaModal');
        }

        function closeCaptchaModal() {
            closeModal('captchaModal');
        }

        async function confirmAllocationCaptcha() {
            const captchaValue = byId('captchaCode').value.trim();
            if (!captchaValue) {
                Toast.show('请输入验证码', 'warning');
                return;
            }

            const captchaId = allocationCaptchaId;
            const result = await ApiEndpoints.allocate({ captchaId, captchaValue });
            closeCaptchaModal();
            const { account, password, token } = result.data;
            localStorage.setItem(TOKEN_KEY, token);
            sessionStorage.setItem('allocationCredentials', JSON.stringify({ account, password }));
            window.location.reload();
        }

        function showPendingAllocationCredentials() {
            const value = sessionStorage.getItem('allocationCredentials');
            if (!value) return;

            sessionStorage.removeItem('allocationCredentials');
            try {
                const { account, password } = JSON.parse(value);
                byId('allocatedAccount').textContent = account;
                byId('allocatedPassword').textContent = password;
                openModal('allocationResultModal');
            } catch (_) {
                sessionStorage.removeItem('allocationCredentials');
            }
        }

        async function copyAllocationCredentials() {
            const credentials = `账号：${byId('allocatedAccount').textContent}\n密码：${byId('allocatedPassword').textContent}`;
            try {
                await navigator.clipboard.writeText(credentials);
                Toast.show('账号密码已复制', 'success');
            } catch (_) {
                Toast.show('复制失败，请手动保存', 'error');
            }
        }

        async function handleChangePassword(event) {
            event.preventDefault();
            const oldPassword = byId('oldPassword').value;
            const newPassword = byId('changedPassword').value;
            const confirmPassword = byId('changedConfirmPassword').value;
            if (newPassword.length < 6) {
                Toast.show('新密码至少6位', 'warning');
                return;
            }
            if (newPassword !== confirmPassword) {
                Toast.show('两次输入的密码不一致', 'error');
                return;
            }
            const result = await ApiEndpoints.changePassword({ oldPassword, newPassword, confirmPassword });
            if (result.code === '0') {
                closeChangePasswordModal();
                Toast.show('密码已修改', 'success');
            }
        }

        async function handleProfileUpdate(e) {
            e.preventDefault();

            const name = document.getElementById('profileName').value;
            const bio = document.getElementById('profileBio').value;
            const webhookType = document.getElementById('selectedWebhook').value;
            const webhookUrl = document.getElementById('webhookUrl').value;
            const avatar = document.getElementById('profileAvatar').src;
            const faction = document.getElementById('selectedFaction').value;
            const url = webhookUrl.trim();

            if (url !== '') {
                const validPrefixes = [
                    "https://qyapi.weixin.qq.com/cgi-bin/webhook/send",
                    "https://oapi.dingtalk.com/robot/send",
                    "https://open.feishu.cn/open-apis/bot"
                ];

                const isValidUrl = validPrefixes.some(prefix => url.startsWith(prefix));
                if (!isValidUrl) {
                    Toast.show('请填写正确的 Webhook 地址，可见上方链接教程', 'error');
                    return;
                }
            }

            const result = await ApiEndpoints.profileUpdate({ name, bio, webhookType, webhookUrl: url, avatar, faction })
            if (result.code === '0') {
                // Toast.show('个人资料更新成功', 'success');
                // setTimeout(() => {
                    window.location.reload();
                // }, 1000);
            }

        }

        async function handleTestWebhook(e) {
            e.preventDefault();

            const type = document.getElementById('selectedWebhook').value;
            const url = document.getElementById('webhookUrl').value;
            if (!type || !url) {
                Toast.show('请填写完整的 Webhook 地址', 'warning');
                return;
            }

            const validPrefixes = [
                "https://qyapi.weixin.qq.com/cgi-bin/webhook/send",
                "https://oapi.dingtalk.com/robot/send",
                "https://open.feishu.cn/open-apis/bot"
            ];

            const isValidUrl = validPrefixes.some(prefix => url.startsWith(prefix));
            if (!isValidUrl) {
                Toast.show('请填写正确的 Webhook 地址，可见上方链接教程', 'error');
                return;
            }

            const result = await ApiEndpoints.testWebhook({ type: type, url: url.trim() });
            if (result.code !== '0') {
                Toast.show('消息发送失败：' + result.message, 'error');
            } else {
                Toast.show('消息发送成功，请查收消息！', 'success');
            }

        }

        async function handleChangeAvatar(e) {
            e.preventDefault();

            const fileInput = document.getElementById('avatarFileInput');

            // 触发文件选择
            if (!fileInput.files || fileInput.files.length === 0) {
                fileInput.click();
                return;
            }

            const file = fileInput.files[0];

            // 1. 校验是否为图片
            if (!file.type.startsWith('image/')) {
                alert('只能上传图片文件');
                fileInput.value = '';
                return;
            }

            // 2. 校验大小（2MB）
            const MAX_SIZE = 2 * 1024 * 1024;
            if (file.size > MAX_SIZE) {
                alert('图片大小不能超过 2MB');
                fileInput.value = '';
                return;
            }

            // 3. 构造 multipart/form-data
            const formData = new FormData();
            formData.append('file', file);

            const uploadResult = await ApiEndpoints.uploadImages(formData);
            const avatarUrl = uploadResult.data?.url;

            if (!avatarUrl) {
                alert('未获取到头像地址');
                return;
            }

            // 5. 更新本地状态 & 页面头像
            state.currentUser.avatar = avatarUrl;
            document.getElementById('profileAvatar').src = avatarUrl;

            // 清空 file input，避免无法重复选择同一文件
            fileInput.value = '';
        }

        async function fetchNotice() {
            try {
                const result = await ApiEndpoints.notice();
                const notice = String(result.data || '').trim();
                const noticeText = byId('noticeText');
                const noticeBar = byId('noticeBar');
                const noticeIcon = byId('noticeIcon');
                noticeText.textContent = notice;
                noticeBar.hidden = !notice;
                noticeIcon.hidden = !notice;
                requestAnimationFrame(updateNoticeScroll);
            } catch (_) {
                byId('noticeBar').hidden = true;
                byId('noticeIcon').hidden = true;
            }
        }

        function updateNoticeScroll() {
            const noticeText = byId('noticeText');
            const viewport = noticeText?.parentElement;
            if (!viewport || byId('noticeBar')?.hidden || !noticeText.textContent.trim()) {
                noticeText?.classList.remove('is-scrolling');
                return;
            }

            noticeText.classList.remove('is-scrolling');
            const shouldScroll = noticeText.offsetWidth > viewport.clientWidth;
            noticeText.classList.toggle('is-scrolling', shouldScroll);
        }

        async function fetchStreamers() {

            const result = await ApiEndpoints.saidao();
            streamersData = result.data.map(item => ({
                id: item.id,
                uid: item.uid,
                name: item.name,
                channel: item.channel,
                startTime: item.startTime,
                status: Number(item.status) === 1 ? 'live' : 'ended',
                avatar: item.avatar,
                url: item.url,
                streamUrl: item.streamUrl,
                cover: item.cover,
                notificationEnabled: item.notShow,
                tag: item.tag || '',
                hotScore: item.hotScore || 0,
                contentAnalysis: normalizeContentAnalysis(item.contentAnalysis)
            }));

            renderStreamerCards();
        }

        // ==================== 抽象日报 ====================
        const DAILY_REPORT_LAST_SEEN_ID = 'DAILY_REPORT_LAST_SEEN_ID';

        function getDailyReportLastSeenId() {
            return Number(localStorage.getItem(DAILY_REPORT_LAST_SEEN_ID)) || 0;
        }

        function setDailyReportLastSeenId(id) {
            localStorage.setItem(DAILY_REPORT_LAST_SEEN_ID, String(id || 0));
        }

        function getDailyReportsMaxId() {
            return dailyReportsData.reduce((max, r) => Math.max(max, Number(r.id) || 0), 0);
        }

        function refreshReportTabDot() {
            const dot = document.getElementById('reportTabDot');
            if (!dot) return;
            const hasUpdate = getDailyReportsMaxId() > getDailyReportLastSeenId();
            dot.hidden = !hasUpdate;
        }

        async function fetchDailyReports() {
            try {
                const result = await ApiEndpoints.dailyReportList();
                dailyReportsData = (result?.data || []).map(item => ({
                    id: item.id,
                    title: item.title,
                    link: item.link,
                    cover: item.cover,
                    updateTime: item.update_time
                }));
            } catch (e) {
                console.error('获取抽象日报失败', e);
                dailyReportsData = dailyReportsData || [];
            }
            refreshReportTabDot();
            if (state.currentStatus === 'dailyReport') {
                renderDailyReportCards();
            }
        }

        function formatReportTime(unixSeconds) {
            const ts = Number(unixSeconds);
            if (!ts) return '';
            const d = new Date(ts * 1000);
            const pad = (n) => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        }

        function renderDailyReportCards() {
            const container = document.getElementById('cardsGrid');
            if (!container) return;
            container.innerHTML = '';

            if (dailyReportsData.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">
                            <i class="fas fa-newspaper"></i>
                        </div>
                        <h3>暂无日报</h3>
                        <p>还没有发布抽象日报</p>
                    </div>
                `;
                return;
            }

            dailyReportsData.forEach(report => {
                const card = document.createElement('div');
                card.className = 'report-card';
                card.dataset.id = report.id;
                card.dataset.link = report.link || '';
                card.innerHTML = `
                    <div class="report-card-cover"${report.cover ? ` style="background-image:url('${escapeHtml(report.cover)}')"` : ''}></div>
                    <div class="report-card-content">
                        <h3 class="report-card-title">${escapeHtml(report.title)}</h3>
                        <div class="report-card-time"><i class="far fa-clock"></i> ${escapeHtml(formatReportTime(report.updateTime))}</div>
                    </div>
                `;
                container.appendChild(card);
            });
        }

        function markDailyReportsSeen() {
            setDailyReportLastSeenId(getDailyReportsMaxId());
            refreshReportTabDot();
        }

        // toast.js
        const Toast = (() => {
            const container = document.getElementById('toast-container');

            function show(message, type = 'info', duration = 3000) {
                const toast = document.createElement('div');
                toast.className = `toast ${type}`;
                toast.textContent = message;

                container.appendChild(toast);

                // 动画显示
                requestAnimationFrame(() => toast.classList.add('show'));

                // 自动消失
                setTimeout(() => {
                    toast.classList.remove('show');
                    toast.addEventListener('transitionend', () => toast.remove());
                }, duration);
            }

            return { show };
        })();
        window.Toast = Toast;

        const container = document.getElementById('chatBody');
        container.innerHTML = '';

        let socket = null;
        let chatReconnectTimer = null;
        const CHAT_STICKY_BOTTOM_THRESHOLD = 700;
        const CHAT_BOTTOM_SCROLL_EPSILON = 200;
        const CHAT_HISTORY_TOP_THRESHOLD = 80;
        const CHAT_MESSAGE_LIMIT = 1000;
        const renderedMessageIds = new Set();
        let chatFollowMode = true;
        let chatScrollRaf = null;
        let chatScrollListenerRaf = null;
        let isLoadingHistory = false;
        let hasMoreHistory = true;
        let historyLoadingIndicator = null;
        let chatVideoModal = null;

        function isChatNearBottom(threshold = CHAT_STICKY_BOTTOM_THRESHOLD) {
            return container.scrollHeight - container.scrollTop - container.clientHeight <= threshold;
        }

        function shouldAppendStickToBottom(options, position) {
            if (options.stickToBottom !== undefined && options.stickToBottom !== null) {
                return options.stickToBottom;
            }

            return position === 'append' && (chatFollowMode || isChatNearBottom(CHAT_BOTTOM_SCROLL_EPSILON));
        }

        function followChatBottom() {
            chatFollowMode = true;
            hideNewMessageAlert();
            scheduleChatScrollToBottom();
        }

        function syncChatFollowMode() {
            chatFollowMode = isChatNearBottom(CHAT_BOTTOM_SCROLL_EPSILON);
            if (chatFollowMode) {
                hideNewMessageAlert();
            }
        }

        function clearChatReconnectTimer() {
            if (chatReconnectTimer) {
                clearTimeout(chatReconnectTimer);
                chatReconnectTimer = null;
            }
        }

        function closeChatSocket({ preventReconnect = false } = {}) {
            if (!socket) {
                return;
            }

            if (preventReconnect) {
                socket.__skipReconnect = true;
            }

            try {
                socket.close();
            } catch (error) {
                console.warn('关闭聊天室连接失败:', error);
            }

            socket = null;
        }

        function trackRenderedMessage(messageId) {
            if (!messageId) {
                return true;
            }

            const normalizedId = String(messageId);
            if (renderedMessageIds.has(normalizedId)) {
                return false;
            }

            renderedMessageIds.add(normalizedId);
            return true;
        }

        function scrollChatToBottom() {
            container.scrollTop = container.scrollHeight;
        }

        function scheduleChatScrollToBottom() {
            if (!chatFollowMode || chatScrollRaf) {
                return;
            }

            chatScrollRaf = requestAnimationFrame(() => {
                chatScrollRaf = null;
                if (chatFollowMode) {
                    scrollChatToBottom();
                }
            });
        }

        function getChatMessageNodes() {
            return Array.from(container.querySelectorAll('.chat-message'));
        }

        function getFirstChatMessageNode() {
            return container.querySelector('.chat-message');
        }

        function forgetRenderedMessage(messageElement) {
            const messageId = messageElement?.dataset?.messageId;
            if (messageId) {
                renderedMessageIds.delete(String(messageId));
            }
        }

        function removeChatMessage(messageElement) {
            if (!messageElement) return;

            forgetRenderedMessage(messageElement);
            messageElement.remove();
        }

        function trimChatMessages(preferRemoveFrom = 'top') {
            let messages = getChatMessageNodes();
            while (messages.length > CHAT_MESSAGE_LIMIT) {
                const target = preferRemoveFrom === 'bottom' ? messages.pop() : messages.shift();
                removeChatMessage(target);
            }
        }

        function resetChatMessages() {
            container.querySelectorAll('.chat-message').forEach((messageElement) => {
                messageElement.remove();
            });
            renderedMessageIds.clear();
            hasMoreHistory = true;
            hideNewMessageAlert();
            hideMentionAlert();
            closeMessageContextMenu();
            if (chatScrollRaf) {
                cancelAnimationFrame(chatScrollRaf);
                chatScrollRaf = null;
            }
        }

        // 屏蔽规则变化后，基于消息缓冲重新渲染，使取消屏蔽能恢复消息
        rerenderChatFromBuffer = function rerenderChatFromBufferImpl() {
            const wasFollowing = chatFollowMode;
            container.querySelectorAll('.chat-message').forEach((messageElement) => {
                messageElement.remove();
            });
            renderedMessageIds.clear();
            chatMessageBuffer.forEach((entry) => {
                addMessageToChat(entry.data, { skipBuffer: true, suppressAlert: true, stickToBottom: false });
            });
            if (wasFollowing) {
                followChatBottom();
            }
        };

        function addMessageToChat(data, options = {}) {
            if (!options.skipBuffer) {
                bufferChatMessage(data, options.position || 'append');
            }
            if (shouldFilterChatMessage(data)) {
                return null;
            }
            const isPureImageMessage = isPureImageMessageContent(data.content);

            if (!trackRenderedMessage(data.messageId)) {
                return null;
            }

            // 历史消息中的已删除内容不再渲染占位提示
            if (data.deleted === true) {
                return null;
            }

            const suppressAlert = options.suppressAlert ?? false;
            const position = options.position || 'append';
            const shouldStickToBottom = shouldAppendStickToBottom(options, position);
            const messageElement = document.createElement('div');
            messageElement.className = 'chat-message message-element';

            // 如果有引用回复，在消息上方添加引用块
            let quoteHTML = '';
            if (data.replyTo) {
                const replyContent = data.replyTo.content || '';
                const isImageQuote = /<img\b/i.test(replyContent);
                const imageQuoteSrc = isImageQuote ? getFirstImageSrc(replyContent) : '';
                const imageQuoteAttr = imageQuoteSrc ? ` data-image-src="${escapeHtml(imageQuoteSrc)}"` : '';
                const quoteText = isImageQuote
                    ? '<span class="quote-image-hidden">图片消息已隐藏</span>'
                    : `${replyContent.substring(0, 50)}${replyContent.length > 50 ? '...' : ''}`;

                quoteHTML = `
                    <div class="message-quote${isImageQuote ? ' image-quote' : ''}" data-message-id="${data.replyTo.messageId}"${imageQuoteAttr} style="
                        background-color: var(--bg-color);
                        border-left: 3px solid var(--primary-light);
                        border-radius: var(--radius-sm);
                        padding: 6px 10px 6px 8px;
                        margin-bottom: 6px;
                        font-size: 12px;
                        color: var(--text-secondary);
                        cursor: pointer;
                    ">
                        <div style="display:flex; align-items:center; gap:6px;">
                            <span style="color: var(--primary-color); font-weight:500;">
                                ${data.replyTo.uname}:
                            </span>
                            <span style="color: var(--text-light);">
                                ${quoteText}
                            </span>
                        </div>
                    </div>
                    `;
                // 点击引用块可以跳转（如果后端支持并下发了 messageId）
                // 跳转逻辑需要额外实现，例如滚动到该消息并高亮，这里先占位
            }

            // 处理消息内容中的@高亮 (假设 content 中 @用户名 已被后端处理或保持原样)
            let processedContent = data.content;
            // 简易前端高亮：将 @用户名 替换为带样式的span
            // 更佳实践应由后端在 content 中标记，或下发 mentions 数组由前端渲染时处理
            if (data.mentions && data.mentions.length > 0) {
                // 这里示例一个简单的文本替换，实际应根据 mentions 和用户列表进行更精确的匹配和替换
                processedContent = processedContent.replace(/@(\S+)/g, '<span class="mention" style="color: #020df4; font-weight: 500;">@$1</span>');
            }


            // 根据 faction 值生成标签HTML
            let factionHTML = '';
            if (data.faction === 'ya') {
                factionHTML = '<span class="faction-tag tooth">牙</span>';
            } else if (data.faction === 'juan') {
                factionHTML = '<span class="faction-tag volume">卷</span>';
            } else if (data.faction === 'AI') {
                factionHTML = '<span class="faction-tag ai">AI</span>';
            }

            // 如果服务端返回了 ipGeo
            let ipGeo = '';
            if (data.uid !== 0 && data.ipGeo) {
                ipGeo = 'IP属地：' + data.ipGeo
            }

            const messageBodyHTML = data.messageKind === 'voice'
                ? renderVoiceMessage(data)
                : processedContent;

            messageElement.innerHTML = `
                <div class="avatar-container">
                    <img src="${escapeHtml(data.avatar || '')}" alt="${escapeHtml(data.uname || '')}" class="message-avatar" data-user-id="${escapeHtml(data.uid ?? '')}" loading="lazy" decoding="async">
                    ${factionHTML}
                </div>
                <div class="message-content">
                    <div class="message-header">
                        <span class="message-user">${data.uname}</span>
                        <span class="message-time">${data.timestamp}</span>
                    </div>
                    <div class="message-footer">
                        ${ipGeo}
                    </div>
                    <div class="message-text${data.messageKind === 'voice' ? ' voice-bubble' : ''}" title="点击打开消息菜单">${messageBodyHTML}</div>
                    ${quoteHTML}
                </div>
            `;

            // 头像点击通过容器事件委托处理（见 chatBody 委托监听），此处不再逐条绑定

            if (position === 'prepend') {
                container.insertBefore(messageElement, options.beforeNode || getFirstChatMessageNode());
            } else {
                container.appendChild(messageElement);
            }
            trimChatMessages(position === 'prepend' ? 'bottom' : 'top');

            // 判断是否是纯图片消息（chat-emoji vip）
            const messageText = messageElement.querySelector('.message-text');
            const imageEmoji = messageText.querySelector('img');

            if (messageText.querySelector('.chat-video-card')) {
                messageText.classList.add('video-card-message');
            }

            if (isPureImageMessage && imageEmoji) {
                // 标记为图片消息
                messageElement.classList.add('image-message');

                // 去掉气泡，只保留图片
                messageText.classList.add('image-only');
                markImageLoaded(imageEmoji);
                imageEmoji.addEventListener('load', () => {
                    if (shouldStickToBottom) {
                        followChatBottom();
                    }
                }, { once: true });
                if (isImageMessagesBlocked()) {
                    hideChatImageMessage(messageElement);
                }
            }

            if (data.messageId) {
                messageElement.dataset.messageId = data.messageId;
                messageElement.dataset.uid = data.uid;
                messageElement.dataset.uname = data.uname;
            }
            messageElement.dataset.content = data.content || '';

            if (data.mentionedMe === true && data.messageId) {
                showMentionAlert(data.messageId);
            }

            // 将消息数据挂到节点上，供容器事件委托读取（替代逐条 addEventListener）
            messageElement._messageData = data;

            if (shouldStickToBottom) {
                followChatBottom();
            } else if (!suppressAlert) {
                showNewMessageAlert();
            }

            return messageElement;
        }

        let mentionAlert = null;
        let latestMentionMessageId = null;

        function showMentionAlert(messageId) {
            latestMentionMessageId = messageId;

            if (mentionAlert === null) {
                mentionAlert = document.createElement('div');
                mentionAlert.className = 'new-message-alert mention-alert';
                mentionAlert.style.zIndex = '9999'; // 高于普通新消息提示

                mentionAlert.innerHTML = `
                    <button class="new-message-btn">
                        有人@我
                    </button>
                `;

                mentionAlert.querySelector('.new-message-btn')
                    .addEventListener('click', function () {

                        jumpToMessage(latestMentionMessageId);
                        hideMentionAlert();
                    });

                (byId('chatSidebar') || container).appendChild(mentionAlert);
            }
        }

        function jumpToMessage(messageId) {

            const target = document.querySelector(
                `.chat-message[data-message-id="${messageId}"]`
            );

            if (!target) {
                console.warn('未找到被@的消息:', messageId);
                return;
            }

            const offsetTop = target.offsetTop - container.offsetTop;

            container.scrollTo({
                top: offsetTop - container.clientHeight / 2,
                behavior: 'smooth'
            });

            // 高亮
            target.classList.add('message-highlight');
            setTimeout(() => {
                target.classList.remove('message-highlight');
            }, 2000);
        }

        function hideMentionAlert() {
            if (mentionAlert) {
                mentionAlert.remove();
                mentionAlert = null;
                latestMentionMessageId = null;
            }
        }

        document.addEventListener('click', function (e) {
            const quoteEl = e.target.closest('.message-quote');
            if (!quoteEl) return;

            const imageSrc = quoteEl.getAttribute('data-image-src');
            if (quoteEl.classList.contains('image-quote')) {
                if (imageSrc) {
                    showImagePreview(imageSrc);
                }
                return;
            }

            const messageId = quoteEl.getAttribute('data-message-id');
            if (!messageId) return;

            const target = document.querySelector(
                `.chat-message[data-message-id="${messageId}"]`
            );
            if (!target) {
                console.warn('未找到目标消息:', messageId);
                return;
            }

            // 平滑滚动到目标
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });

            // 高亮动画
            target.classList.add('message-highlight');
            setTimeout(() => {
                target.classList.remove('message-highlight');
            }, 2000);
        });

        let currentContextMenu = null;
        let currentContextMenuCloseHandler = null;

        // 通过容器事件委托统一处理消息交互
        // 只在 chatBody 上绑定固定几个监听器，替代每条消息逐个 addEventListener

        function getMessageDataFromNode(node) {
            const messageEl = node?.closest?.('.chat-message');
            return messageEl?._messageData || null;
        }

        function setupMessageDelegation() {
            // 消息、头像、语音与视频播放按钮（点击委托）
            container.addEventListener('click', function (e) {
                const avatar = e.target.closest('.message-avatar');
                if (avatar) {
                    showUserDetail(parseInt(avatar.dataset.userId));
                    return;
                }

                const playButton = e.target.closest('.voice-play-btn');
                if (playButton) {
                    handleVoicePlayClick(playButton);
                    return;
                }

                const videoPlayButton = e.target.closest('.chat-video-play');
                if (videoPlayButton) {
                    e.preventDefault();
                    playChatVideo(videoPlayButton);
                    return;
                }

                const videoCard = e.target.closest('.chat-video-title')?.closest('.chat-video-card');
                if (videoCard?.dataset.sourceUrl) {
                    window.open(videoCard.dataset.sourceUrl, '_blank', 'noopener');
                    return;
                }

                const bubble = e.target.closest('.message-text');
                if (!bubble || e.target.closest('.message-quote, .chat-video-card, .voice-play-btn, img')) return;

                const selection = window.getSelection?.();
                if (selection && !selection.isCollapsed) return;

                const data = getMessageDataFromNode(bubble);
                if (data) showMessageContextMenu(e, data);
            });
        }

        // 处理语音播放按钮点击（从节点上读取语音状态，无需逐条绑定）
        function handleVoicePlayClick(playButton) {
            const voiceMessage = playButton.closest('.chat-message')?.querySelector('.voice-message');
            if (!voiceMessage) return;

            const audioUrl = voiceMessage.dataset.audioUrl;
            if (!audioUrl) return;

            if (currentVoiceAudio && currentVoiceButton !== playButton) {
                currentVoiceAudio.pause();
                currentVoiceButton?.closest('.voice-message')?.classList.remove('playing');
                currentVoiceButton?.classList.remove('playing');
                currentVoiceButton?.querySelector('i')?.classList.replace('fa-pause', 'fa-play');
            }

            if (!voiceMessage._audio) {
                voiceMessage._audio = new Audio(audioUrl);
                voiceMessage._audio.addEventListener('ended', () => {
                    voiceMessage.classList.remove('playing');
                    playButton.classList.remove('playing');
                    playButton.querySelector('i')?.classList.replace('fa-pause', 'fa-play');
                });
            }

            const audio = voiceMessage._audio;
            if (audio.paused) {
                audio.play().then(() => {
                    currentVoiceAudio = audio;
                    currentVoiceButton = playButton;
                    voiceMessage.classList.add('playing');
                    playButton.classList.add('playing');
                    playButton.querySelector('i')?.classList.replace('fa-play', 'fa-pause');
                }).catch(() => Toast.show('语音播放失败', 'error'));
            } else {
                audio.pause();
                voiceMessage.classList.remove('playing');
                playButton.classList.remove('playing');
                playButton.querySelector('i')?.classList.replace('fa-pause', 'fa-play');
            }
        }

        function closeChatVideoModal() {
            chatVideoModal?.querySelector('video')?.pause();
            if (document.fullscreenElement === chatVideoModal?.querySelector('.chat-video-modal-panel')) {
                document.exitFullscreen?.().catch?.(() => {});
            }
            chatVideoModal?.remove();
            chatVideoModal = null;
        }

        function playChatVideo(playButton) {
            const videoUrl = playButton.dataset.videoUrl;
            const title = playButton.closest('.chat-video-card')?.querySelector('.chat-video-title')?.textContent?.trim()
                || playButton.getAttribute('aria-label')
                || '视频播放';
            if (!videoUrl) return;

            closeChatVideoModal();
            chatVideoModal = document.createElement('div');
            chatVideoModal.className = 'chat-video-modal';
            chatVideoModal.innerHTML = `
                <div class="chat-video-modal-panel" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
                    <div class="chat-video-modal-toolbar">
                        <span class="chat-video-modal-drag-handle"><i class="fas fa-grip-horizontal"></i>${escapeHtml(title)}</span>
                        <span class="chat-video-modal-actions">
                            <button class="chat-video-modal-fullscreen" type="button" aria-label="全屏播放"><i class="fas fa-expand"></i></button>
                            <button class="chat-video-modal-close" type="button" aria-label="关闭视频"><i class="fas fa-times"></i></button>
                        </span>
                    </div>
                    <video class="chat-video-player" controls autoplay playsinline preload="metadata">
                        <source src="${escapeHtml(videoUrl)}" type="video/mp4">
                        当前浏览器不支持视频播放。
                    </video>
                    <span class="chat-video-modal-resize-handle" aria-hidden="true"></span>
                </div>
            `;
            const panel = chatVideoModal.querySelector('.chat-video-modal-panel');
            const dragHandle = chatVideoModal.querySelector('.chat-video-modal-drag-handle');
            const resizeHandle = chatVideoModal.querySelector('.chat-video-modal-resize-handle');
            let dragState = null;
            let resizeState = null;

            try {
                const savedState = JSON.parse(localStorage.getItem(CHAT_VIDEO_WINDOW_STATE_KEY) || 'null');
                if (savedState && Number.isFinite(savedState.left) && Number.isFinite(savedState.top) && Number.isFinite(savedState.width)) {
                    panel.style.width = `${Math.max(240, Math.min(window.innerWidth * 0.9, savedState.width))}px`;
                    const height = panel.offsetHeight;
                    panel.style.left = `${Math.max(8, Math.min(window.innerWidth - panel.offsetWidth - 8, savedState.left))}px`;
                    panel.style.top = `${Math.max(8, Math.min(window.innerHeight - height - 8, savedState.top))}px`;
                    panel.style.right = 'auto';
                }
            } catch {
                localStorage.removeItem(CHAT_VIDEO_WINDOW_STATE_KEY);
            }

            const saveWindowState = () => {
                if (document.fullscreenElement) return;
                const rect = panel.getBoundingClientRect();
                localStorage.setItem(CHAT_VIDEO_WINDOW_STATE_KEY, JSON.stringify({
                    left: Math.round(rect.left),
                    top: Math.round(rect.top),
                    width: Math.round(rect.width)
                }));
            };

            dragHandle.addEventListener('pointerdown', (event) => {
                if (event.button !== 0 || document.fullscreenElement) return;
                const rect = panel.getBoundingClientRect();
                dragState = { offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
                dragHandle.setPointerCapture?.(event.pointerId);
                event.preventDefault();
            });
            resizeHandle.addEventListener('pointerdown', (event) => {
                if (event.button !== 0 || document.fullscreenElement) return;
                const rect = panel.getBoundingClientRect();
                resizeState = { width: rect.width, startX: event.clientX };
                resizeHandle.setPointerCapture?.(event.pointerId);
                event.preventDefault();
            });
            const updateWindowPosition = (event) => {
                event.preventDefault();
                if (dragState) {
                    const left = Math.max(8, Math.min(window.innerWidth - panel.offsetWidth - 8, event.clientX - dragState.offsetX));
                    const top = Math.max(8, Math.min(window.innerHeight - panel.offsetHeight - 8, event.clientY - dragState.offsetY));
                    panel.style.left = `${left}px`;
                    panel.style.top = `${top}px`;
                    panel.style.right = 'auto';
                    panel.style.bottom = 'auto';
                }
                if (resizeState) {
                    const width = Math.max(240, Math.min(window.innerWidth * 0.9, resizeState.width + event.clientX - resizeState.startX));
                    panel.style.width = `${width}px`;
                }
            };
            dragHandle.addEventListener('pointermove', updateWindowPosition, { passive: false });
            resizeHandle.addEventListener('pointermove', updateWindowPosition, { passive: false });
            panel.addEventListener('pointerup', () => {
                saveWindowState();
                dragState = null;
                resizeState = null;
            });
            panel.addEventListener('pointercancel', () => {
                dragState = null;
                resizeState = null;
            });
            chatVideoModal.querySelector('.chat-video-modal-fullscreen').addEventListener('click', () => {
                if (document.fullscreenElement === panel) {
                    document.exitFullscreen?.();
                } else {
                    panel.requestFullscreen?.().catch?.(() => panel.classList.add('is-fullscreen'));
                }
            });
            chatVideoModal.addEventListener('click', (event) => {
                if (event.target.closest('.chat-video-modal-close')) {
                    closeChatVideoModal();
                }
            });
            document.body.appendChild(chatVideoModal);
        }

        setupMessageDelegation();

        // 显示菜单
        function showMessageContextMenu(event, messageData) {
            closeMessageContextMenu(); // 先关闭已有菜单

            const menu = document.createElement('div');
            menu.className = 'message-context-menu';
            menu.style.position = 'fixed';
            const pageX = typeof event.pageX === 'number' ? event.pageX : event.clientX + window.scrollX;
            const pageY = typeof event.pageY === 'number' ? event.pageY : event.clientY + window.scrollY;
            menu.style.left = pageX + 'px';
            menu.style.top = pageY + 'px';
            menu.style.backgroundColor = 'var(--card-color)';
            menu.style.border = '1px solid var(--border-color)';
            menu.style.borderRadius = 'var(--radius-sm)';
            menu.style.boxShadow = 'var(--shadow-medium)';
            menu.style.zIndex = '1000';
            menu.style.padding = '4px 0';
            menu.style.minWidth = '100px';

            const copyItem = document.createElement('div');
            copyItem.className = 'context-menu-item';
            copyItem.textContent = '复制';
            styleMenuItem(copyItem);
            copyItem.addEventListener('click', async () => {
                await copyMessageToClipboard(messageData);
                closeMessageContextMenu();
            });
            menu.appendChild(copyItem);

            // “引用”菜单项
            const quoteItem = document.createElement('div');
            quoteItem.className = 'context-menu-item';
            quoteItem.textContent = '引用';
            styleMenuItem(quoteItem);
            quoteItem.addEventListener('click', () => {
                setQuoteMessage(messageData);
                closeMessageContextMenu();
            });
            menu.appendChild(quoteItem);

            // “@用户”菜单项
            const mentionItem = document.createElement('div');
            mentionItem.className = 'context-menu-item';
            mentionItem.textContent = `@${messageData.uname}`;
            styleMenuItem(mentionItem);
            mentionItem.addEventListener('click', () => {
                mentionUser(messageData.uname, messageData.uid);
                closeMessageContextMenu();
            });
            menu.appendChild(mentionItem);

            const blockItem = document.createElement('div');
            blockItem.className = 'context-menu-item';
            blockItem.textContent = Number(messageData.uid) === 0 ? `屏蔽 ${messageData.uname}` : '屏蔽此用户';
            styleMenuItem(blockItem);
            blockItem.addEventListener('click', async () => {
                const rules = { ...chatFilterRules };
                if (Number(messageData.uid) === 0) rules.blockedNicknames = [...rules.blockedNicknames, messageData.uname];
                else rules.blockedUserIds = [...rules.blockedUserIds, String(messageData.uid)];
                try {
                    await saveChatFilterRules(rules);
                    Toast.show('已屏蔽该用户', 'success');
                } catch (error) {
                    Toast.show(error.message || '保存屏蔽设置失败', 'error');
                } finally {
                    closeMessageContextMenu();
                }
            });
            menu.appendChild(blockItem);

            const ipGeo = String(messageData.ipGeo || '').trim();
            if (ipGeo && !chatFilterRules.blockedIpGeos.includes(ipGeo)) {
                const blockIpGeoItem = document.createElement('div');
                blockIpGeoItem.className = 'context-menu-item';
                blockIpGeoItem.textContent = `屏蔽 IP 属地：${ipGeo}`;
                styleMenuItem(blockIpGeoItem);
                blockIpGeoItem.addEventListener('click', async () => {
                    try {
                        await saveChatFilterRules({
                            ...chatFilterRules,
                            blockedIpGeos: [...chatFilterRules.blockedIpGeos, ipGeo]
                        });
                        Toast.show(`已屏蔽 IP 属地：${ipGeo}`, 'success');
                    } catch (error) {
                        Toast.show(error.message || '保存屏蔽设置失败', 'error');
                    } finally {
                        closeMessageContextMenu();
                    }
                });
                menu.appendChild(blockIpGeoItem);
            }

            const extraMenuItems = [];
            const canBan = state.currentUser?.canChatBan === true
                && Number(messageData.uid) !== Number(state.currentUser?.id);
            if (canBan) {
                const ban1hItem = document.createElement('div');
                ban1hItem.className = 'context-menu-item';
                ban1hItem.textContent = '封禁1小时';
                styleMenuItem(ban1hItem);
                ban1hItem.style.color = '#d4380d';
                ban1hItem.addEventListener('click', async () => {
                    try {
                        await banChatUser(messageData, 3600);
                    } finally {
                        closeMessageContextMenu();
                    }
                });
                menu.appendChild(ban1hItem);
                extraMenuItems.push(ban1hItem);

                const ban7dItem = document.createElement('div');
                ban7dItem.className = 'context-menu-item';
                ban7dItem.textContent = '封禁7天';
                styleMenuItem(ban7dItem);
                ban7dItem.style.color = '#d4380d';
                ban7dItem.addEventListener('click', async () => {
                    try {
                        await banChatUser(messageData, 604800);
                    } finally {
                        closeMessageContextMenu();
                    }
                });
                menu.appendChild(ban7dItem);
                extraMenuItems.push(ban7dItem);
            }

            // “删除消息”菜单项：有 chatBan 权限即可删除任意消息
            const canDelete = state.currentUser?.canChatBan === true && !!messageData.messageId;
            if (canDelete) {
                const deleteItem = document.createElement('div');
                deleteItem.className = 'context-menu-item';
                deleteItem.textContent = '删除';
                styleMenuItem(deleteItem);
                deleteItem.style.color = '#d4380d';
                deleteItem.addEventListener('click', async () => {
                    try {
                        await deleteChatMessage(messageData);
                    } finally {
                        closeMessageContextMenu();
                    }
                });
                menu.appendChild(deleteItem);
                extraMenuItems.push(deleteItem);
            }

            // 悬停效果
            [copyItem, quoteItem, mentionItem, blockItem, ...extraMenuItems].forEach(item => {
                item.addEventListener('mouseenter', () => item.style.backgroundColor = 'var(--bg-color)');
                item.addEventListener('mouseleave', () => item.style.backgroundColor = '');
            });

            document.body.appendChild(menu);
            currentContextMenu = menu;
            currentContextMenuCloseHandler = clickOutsideMenu;

            // 点击空白区域关闭菜单
            setTimeout(() => { // 延迟绑定，避免立即触发自身点击
                if (currentContextMenu === menu && currentContextMenuCloseHandler === clickOutsideMenu) {
                    document.addEventListener('click', clickOutsideMenu);
                }
            }, 0);

            function clickOutsideMenu(e) {
                if (!menu.contains(e.target)) {
                    closeMessageContextMenu();
                }
            }
        }

        // 公共样式函数
        function styleMenuItem(item) {
            item.style.padding = '8px 12px';
            item.style.cursor = 'pointer';
            item.style.color = 'var(--text-primary)';
            item.style.fontSize = '14px';
        }

        // 关闭菜单
        function closeMessageContextMenu() {
            if (currentContextMenuCloseHandler) {
                document.removeEventListener('click', currentContextMenuCloseHandler);
                currentContextMenuCloseHandler = null;
            }

            if (currentContextMenu) {
                currentContextMenu.remove();
                currentContextMenu = null;
            }
        }

        function getCopyableMessageText(messageData) {
            const wrapper = document.createElement('div');
            wrapper.innerHTML = messageData?.content || '';

            wrapper.querySelectorAll('img').forEach((img) => {
                const alt = (img.getAttribute('alt') || '图片').trim();
                img.replaceWith(document.createTextNode(`[${alt}]`));
            });

            return (wrapper.innerText || wrapper.textContent || '').trim();
        }

        async function copyMessageToClipboard(messageData) {
            const text = getCopyableMessageText(messageData);

            if (!text) {
                Toast.show('没有可复制的内容', 'error');
                return;
            }

            try {
                if (navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(text);
                } else {
                    const textarea = document.createElement('textarea');
                    textarea.value = text;
                    textarea.readOnly = true;
                    textarea.style.position = 'fixed';
                    textarea.style.opacity = '0';
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand('copy');
                    textarea.remove();
                }

                Toast.show('已复制', 'success');
            } catch (error) {
                console.error('复制失败:', error);
                Toast.show('复制失败', 'error');
            }
        }

        const style = document.createElement('style');
        style.textContent = `
            .message-element {
                -webkit-user-select: text;
                user-select: text;
                -webkit-touch-callout: auto;
            }
            `;
        document.head.appendChild(style);


        // 消息交互已由 setupMessageDelegation 的容器事件委托统一处理，无需在此逐条绑定

        // 全局状态，记录当前引用的消息
        let currentQuote = null;

        // 设置引用消息
        function setQuoteMessage(messageData) {
            const quoteContent = messageData.content || '';
            const quotePreviewText = /<img\b/i.test(quoteContent)
                ? '图片消息已隐藏'
                : `${quoteContent.substring(0, 50)}${quoteContent.length > 50 ? '...' : ''}`;

            currentQuote = {
                messageId: messageData.messageId,
                uid: messageData.uid,
                uname: messageData.uname,
                content: quoteContent
            };

            // 显示预览
            const preview = document.getElementById('quotePreview');
            preview.innerHTML = `
                <div class="quote-preview-content">
                    <div class="quote-header">
                        <span style="font-weight:500; color: var(--primary-color);">引用 ${messageData.uname}:</span>
                        <button class="quote-cancel-btn"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="quote-text">${escapeHtml(quotePreviewText)}</div>
                </div>
            `;
            preview.style.display = 'block';

            // 点击关闭按钮取消引用
            preview.querySelector('.quote-cancel-btn').addEventListener('click', clearQuote);

            // 输入框自动聚焦并填入 @username
            const chatInput = document.getElementById('chatInput');
            chatInput.value = `@${messageData.uname} `;
            syncChatInputHeight(chatInput);
            chatInput.focus();
            syncChatComposerState();
        }

        // 清除引用
        function clearQuote() {
            currentQuote = null;
            const preview = document.getElementById('quotePreview');
            preview.style.display = 'none';
            preview.innerHTML = '';
        }

        // 简单的HTML转义，防止预览内容破坏结构
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // 处理@用户
        function mentionUser(uname, uid) {
            const chatInput = document.getElementById('chatInput');
            // 检查输入框末尾是否已经是空格或为空，避免拼接错误
            const currentValue = chatInput.value.trim();
            const separator = currentValue && !currentValue.endsWith(' ') ? ' ' : '';
            chatInput.value = `${currentValue}${separator}@${uname} `;
            syncChatInputHeight(chatInput);
            chatInput.focus();
            syncChatComposerState();
            // 注意：这里仅在前端输入框添加了文本，实际被@的UID列表需要在发送时从 currentQuote 或解析输入框内容获得。
            // 更优解：在发送时，解析输入框内容中的 @用户名，并将其转换为UID（需要后端或本地映射支持）。
            // 简易方案：仅当通过右键菜单触发@时，将UID存入一个全局 Set，发送时附带。
        }

        async function banChatUser(messageData, banSeconds) {
            if (!state.currentUser?.canChatBan) {
                return;
            }

            const targetUserId = Number(messageData?.uid ?? 0);
            const targetUserName = messageData?.uname || '';
            if (targetUserId === Number(state.currentUser?.id)) {
                Toast.show('不能封禁自己', 'warning');
                return;
            }

            if (targetUserId === 0 && !targetUserName) {
                Toast.show('无法定位游客用户', 'error');
                return;
            }

            const result = await ApiEndpoints.chatBan({
                userId: targetUserId,
                uname: targetUserName,
                banSeconds
            });

            if (result.code === '0') {
                const label = banSeconds === 3600 ? '1小时' : '7天';
                Toast.show(`已封禁${label}`, 'success');
            }
        }

        // 删除聊天消息（需 chatBan 权限），后端软删除并广播 messageDeleted
        async function deleteChatMessage(messageData) {
            if (!state.currentUser?.canChatBan) {
                return;
            }
            const messageId = messageData?.messageId;
            if (!messageId) {
                Toast.show('无法定位该消息', 'error');
                return;
            }

            const result = await ApiEndpoints.messageDelete(messageId);
            if (result.code === '0') {
                Toast.show('已删除', 'success');
            }
        }

        // 将已存在的消息节点直接移除
        function markChatMessageDeleted(messageId) {
            if (!messageId) return;
            const node = container.querySelector(
                `.chat-message[data-message-id="${messageId}"]`
            );
            if (!node) return;
            node.remove();
        }

        function addSystemMessageToChat(data, options = {}) {
            if (data.messageId && !trackRenderedMessage(data.messageId)) {
                return null;
            }

            const messageElement = document.createElement('div');
            messageElement.className = 'chat-message system-message';
            const suppressAlert = options.suppressAlert ?? false;
            const position = options.position || 'append';
            const shouldStickToBottom = shouldAppendStickToBottom(options, position);

            messageElement.innerHTML = `
            <div class="system-content">
                <div class="system-text">${data.content}</div>
                ${data.timestamp ? `<span class="message-time">${data.timestamp}</span>` : ''}
            </div>
        `;

            if (data.messageId) {
                messageElement.dataset.messageId = data.messageId;
            }

            // 给开播通知中的链接绑定点击上报
            messageElement.querySelectorAll('a[href]').forEach(link => {
                link.addEventListener('click', () => {
                    const href = link.getAttribute('href');
                    const streamer = streamersData.find(s => s.url && href.includes(s.url));
                    if (streamer) {
                        ApiEndpoints.clickSaidao(streamer.id).catch(() => {});
                    }
                });
            });

            if (position === 'prepend') {
                container.insertBefore(messageElement, options.beforeNode || getFirstChatMessageNode());
            } else {
                container.appendChild(messageElement);
            }
            trimChatMessages(position === 'prepend' ? 'bottom' : 'top');

            if (shouldStickToBottom) {
                followChatBottom();
            } else if (!suppressAlert) {
                showNewMessageAlert();
            }

            return messageElement;
        }

        // 新消息提示相关变量
        let newMessageCount = 0;
        let newMessageAlert = null;

        // 显示新消息提示按钮
        function showNewMessageAlert() {
            newMessageCount++;

            if (!newMessageAlert) {
                newMessageAlert = document.createElement('div');
                newMessageAlert.className = 'new-message-alert';
                newMessageAlert.innerHTML = `
                    <button class="new-message-btn">
                        有新消息 (${newMessageCount})
                    </button>
                `;

                // 添加点击事件
                newMessageAlert.querySelector('.new-message-btn').addEventListener('click', function() {
                    chatFollowMode = true;
                    scheduleChatScrollToBottom();
                    hideNewMessageAlert();
                });

                // 添加到侧栏，避免跟随聊天内容滚动导致不可见
                (byId('chatSidebar') || container).appendChild(newMessageAlert)
            } else {
                // 更新已有提示的计数
                newMessageAlert.querySelector('.new-message-btn').textContent = `有新消息 (${newMessageCount})`;
            }
        }

        // 隐藏新消息提示按钮
        function hideNewMessageAlert() {
            if (newMessageAlert) {
                newMessageAlert.remove();
                newMessageAlert = null;
                newMessageCount = 0;
            }
        }

        function getTopMessageId() {
            return container.querySelector('.chat-message[data-message-id]')?.dataset.messageId || '';
        }

        function normalizeHistoryMessages(result) {
            const body = result?.data ?? result?.body ?? result;
            if (Array.isArray(body)) return body;
            if (Array.isArray(body?.messages)) return body.messages;
            if (Array.isArray(body?.data)) return body.data;
            return [];
        }

        function showHistoryLoadingIndicator() {
            if (historyLoadingIndicator) return;

            historyLoadingIndicator = document.createElement('div');
            historyLoadingIndicator.className = 'chat-history-loading';
            historyLoadingIndicator.innerHTML = `
                <span class="chat-history-spinner"></span>
                <span>正在加载历史消息</span>
            `;
            container.appendChild(historyLoadingIndicator);
        }

        function hideHistoryLoadingIndicator() {
            historyLoadingIndicator?.remove();
            historyLoadingIndicator = null;
        }

        async function loadOlderMessages() {
            if (isLoadingHistory || !hasMoreHistory) return;

            const topMessageId = getTopMessageId();
            if (!topMessageId) return;

            isLoadingHistory = true;
            showHistoryLoadingIndicator();
            const previousScrollHeight = container.scrollHeight;
            const previousScrollTop = container.scrollTop;
            const anchorNode = getFirstChatMessageNode();

            try {
                const result = await ApiEndpoints.messageHistory(topMessageId);
                const messages = normalizeHistoryMessages(result);
                if (!messages.length) {
                    hasMoreHistory = false;
                    return;
                }

                let addedCount = 0;
                messages.forEach(msg => {
                    const addOptions = {
                        stickToBottom: false,
                        suppressAlert: true,
                        position: 'prepend',
                        beforeNode: anchorNode
                    };
                    const added = msg.type === 'status'
                        ? addSystemMessageToChat(msg, addOptions)
                        : addMessageToChat(msg, addOptions);
                    if (added) addedCount++;
                });

                if (addedCount === 0) {
                    hasMoreHistory = false;
                }

                container.scrollTop = container.scrollHeight - previousScrollHeight + previousScrollTop;
            } catch (error) {
                console.error('加载历史消息失败:', error);
                Toast.show('历史消息加载失败', 'error');
            } finally {
                isLoadingHistory = false;
                hideHistoryLoadingIndicator();
            }
        }

        // 监听容器滚动，当用户滚动到底部时隐藏提示，滚动到顶部时加载历史消息
        // 用 rAF 节流，避免移动端惯性滚动时每帧都触发回调及强制重排
        container.addEventListener('scroll', function() {
            if (chatScrollListenerRaf) {
                return;
            }
            chatScrollListenerRaf = requestAnimationFrame(function() {
                chatScrollListenerRaf = null;
                syncChatFollowMode();
                if (container.scrollTop <= CHAT_HISTORY_TOP_THRESHOLD) {
                    loadOlderMessages();
                }
            });
        }, { passive: true });

        async function setupWebSocket() {
            clearChatReconnectTimer();
            closeChatSocket({ preventReconnect: true });

            const token = localStorage.getItem(TOKEN_KEY);
            const fp = await getFingerprint();

            const currentSocket = new WebSocket(`${WS_BASE_URL}/ws/chat?token=${encodeURIComponent(token || '')}&fp=${encodeURIComponent(fp)}`);
            socket = currentSocket;

            currentSocket.addEventListener('open', () => {
                if (socket !== currentSocket) return;
                console.log('WebSocket连接已建立');
            });

            currentSocket.addEventListener('message', (event) => {
                if (socket !== currentSocket) return;
                const data = JSON.parse(event.data);

                if (data.type === 'captchaRequired') {
                    handleCaptchaRequired();
                    return;
                }

                // 消息发送成功，清空 pendingMessage
                if (data.type === 'user' && pendingMessage) {
                    pendingMessage = null;
                }

                if (data.type === 'user') {
                    // 添加消息到聊天室
                    addMessageToChat(data);
                } else if (data.type === 'history') {
                    resetChatMessages();
                    // 添加消息到聊天室
                    data.messages.forEach(msg => {
                        if (msg.type === 'status' || msg.type === 'dailyReportUpdate') {
                            addSystemMessageToChat(msg, {
                                stickToBottom: false,
                                suppressAlert: true
                            });
                        } else {
                            addMessageToChat(msg, {
                                stickToBottom: false,
                                suppressAlert: true
                            });
                        }
                    });
                    chatFollowMode = true;
                    scheduleChatScrollToBottom();
                } else if (data.type === 'error') {
                    Toast.show(data.content, 'error');
                } else if (data.type === 'system') {
                    addSystemMessageToChat(data);
                } else if (data.type === 'onlineCount') {
                    const onlineCount = document.getElementById('onlineCount');
                    onlineCount.textContent = `${data.count}人在线`;
                } else if (data.type === 'hotWords') {
                    renderHotWords(data.words);
                } else if (data.type === 'status') {
                    addSystemMessageToChat(data);
                    fetchStreamers()
                } else if (data.type === 'dailyReportUpdate') {
                    addSystemMessageToChat(data);
                    fetchDailyReports();
                } else if (data.type === 'saidaoTagUpdated') {
                    applySaidaoTagUpdate(data);
                } else if (data.type === 'saidaoCoverUpdated') {
                    applySaidaoCoverUpdate(data);
                } else if (data.type === 'saidaoContentAnalysisUpdated') {
                    applySaidaoContentAnalysisUpdate(data);
                } else if (data.type === 'hotScoreUpdate') {
                    applyHotScoreUpdate(data.scores);
                } else if (data.type === 'clear') {
                    resetChatMessages();
                } else if (data.type === 'messageDeleted') {
                    markChatMessageDeleted(data.messageId);
                } else if (data.type === 'dailyReportUpdate') {
                    fetchDailyReports();
                }
                
                // 处理视频点播相关消息
                if (window.VideoRoomManager && [
                    'videoVoting', 'videoVoteUpdate', 'videoApproved', 'videoRejected',
                    'videoPlay', 'videoPlayEnd', 'videoFailed',
                    'videoSkipped', 'videoDeleted'
                ].includes(data.type)) {
                    VideoRoomManager.handleWsMessage(data);
                }
            });

            currentSocket.addEventListener('close', () => {
                if (socket === currentSocket) {
                    socket = null;
                }

                if (currentSocket.__skipReconnect) {
                    return;
                }

                console.log('WebSocket连接已关闭');
                clearChatReconnectTimer();
                chatReconnectTimer = setTimeout(() => {
                    if (!socket) {
                        setupWebSocket();
                    }
                }, 3000);
            });

            currentSocket.addEventListener('error', (event) => {
                if (socket !== currentSocket) return;
                console.error('WebSocket错误:', event);
                // addSystemMessage('连接发生错误');
            });
        }

        window.addEventListener('beforeunload', () => {
            clearChatReconnectTimer();
            closeChatSocket({ preventReconnect: true });
        });

        // 发送消息
        let pendingMessage = null;

        async function handleCaptchaRequired() {
            if (!window.SlidingCaptcha) {
                console.warn('[Captcha] pendingMessage 为空，跳过');
                return;
            }
            
            console.log('[Captcha] 开始处理验证码，pendingMessage:', pendingMessage);
            
            try {
                const fp = await getFingerprint();
                console.log('[Captcha] fp:', fp);
                
                const ticket = await window.SlidingCaptcha.getTicket(fp);
                console.log('[Captcha] 获取到 ticket:', ticket);
                
                if (!pendingMessage) {
                    closeChatSocket({ preventReconnect: true });
                    setupWebSocket();
                    return;
                }
                if (socket && socket.readyState === WebSocket.OPEN) {
                    const retryMessage = { ...pendingMessage, captchaTicket: ticket };
                    console.log('[Captcha] 重新发送消息:', retryMessage);
                    socket.send(JSON.stringify(retryMessage));
                } else {
                    console.error('[Captcha] socket 未连接');
                }
            } catch (error) {
                console.error('[Captcha] 验证码处理失败:', error);
                Toast.show('验证码验证失败，请重试', 'error');
                pendingMessage = null;
            }
        }

        function sendMessage() {
            if (voiceDraft) {
                sendVoiceDraft();
                return;
            }

            const chatInput = document.getElementById('chatInput');
            const message = chatInput.value.trim();

            if (!message) return;
            if (!socket || socket.readyState !== WebSocket.OPEN) {
                Toast.show('聊天室连接中，请稍后再试', 'error');
                return;
            }

            const newMessage = {
                type: 'chat',
                content: message,
            };

            if (currentQuote) {
                newMessage.reply = currentQuote;
            }

            // 保存待发送消息，等待验证或成功后清理
            if (!pendingMessage) {
                pendingMessage = newMessage;
                socket.send(JSON.stringify(newMessage));
                
                // 清空输入框
                chatInput.value = '';
                syncChatInputHeight(chatInput);
                syncChatComposerState();
                clearQuote();
                closeEmojiSection();
            }
        }


        // 注册 Service Worker
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/service-workV3.js')
                    .then(registration => {
                        console.log('Service Worker 注册成功:', registration);
                    })
                    .catch(error => {
                        console.log('Service Worker 注册失败:', error);
                    });
            });
        }

        // PWA安装功能
        let deferredPrompt;
        const installButton = document.getElementById('installButton');

        // 监听beforeinstallprompt事件
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            installButton.style.display = 'flex';
        });

        // 安装按钮点击事件
        installButton.addEventListener('click', async () => {
            if (!deferredPrompt) {
                alert('安装功能暂时不可用');
                return;
            }

            try {
                // 显示系统安装对话框
                deferredPrompt.prompt();

                // 等待用户选择
                const { outcome } = await deferredPrompt.userChoice;

                if (outcome === 'accepted') {
                    installButton.style.display = 'none';
                    Toast.show('应用已成功安装到桌面！', 'success');
                } else {
                    Toast.show('已取消安装', 'info');
                    // 用户拒绝后，可以设置一个延迟后再次显示按钮
                    setTimeout(() => {
                        if (deferredPrompt) {
                            installButton.style.display = 'flex';
                        }
                    }, 10000); // 10秒后再显示
                }
            } catch (error) {
                console.error('安装出错:', error);
                Toast.show('安装失败，请重试', 'error');
            }
        });

        // 监听应用已安装事件
        window.addEventListener('appinstalled', () => {
            console.log('应用已通过其他方式安装');
            // 隐藏安装按钮
            installButton.style.display = 'none';
            // 清除deferredPrompt
            deferredPrompt = null;
        });

        function showLoading() {
            const loading = document.getElementById('global-loading');
            if (!loading) return;
            loading.hidden = false;
        }

        function hideLoading() {
            const loading = document.getElementById('global-loading');
            if (loading) loading.hidden = true;
        }

        let isImagePreviewOpen = false;
        function showImagePreview(src) {

            if (isImagePreviewOpen) return;
            isImagePreviewOpen = true;
            let scale = 1;
            let offsetX = 0;
            let offsetY = 0;
            let dragStartX = 0;
            let dragStartY = 0;
            let startOffsetX = 0;
            let startOffsetY = 0;
            let isDraggingImage = false;
            let hasDraggedImage = false;

            const preview = document.createElement("div");
            preview.className = "image-preview-overlay";

            const content = document.createElement("div");
            content.className = "image-preview-content";

            const img = document.createElement("img");
            img.src = src;
            img.alt = "preview";

            const toolbar = document.createElement("div");
            toolbar.className = "image-preview-toolbar";
            toolbar.innerHTML = `
                <button type="button" class="image-preview-action" data-action="zoom-out" aria-label="缩小">
                    <i class="fas fa-minus"></i>
                </button>
                <button type="button" class="image-preview-action" data-action="reset" aria-label="恢复原始大小">100%</button>
                <button type="button" class="image-preview-action" data-action="zoom-in" aria-label="放大">
                    <i class="fas fa-plus"></i>
                </button>
                <button type="button" class="image-preview-action image-preview-close" data-action="close" aria-label="关闭">
                    <i class="fas fa-times"></i>
                </button>
            `;

            content.appendChild(img);
            content.appendChild(toolbar);
            preview.appendChild(content);
            document.body.appendChild(preview);

            const applyTransform = () => {
                if (scale <= 1) {
                    offsetX = 0;
                    offsetY = 0;
                }

                img.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0) scale(${scale})`;
                img.classList.toggle('can-drag', scale > 1);
                toolbar.querySelector('[data-action="reset"]').textContent = `${Math.round(scale * 100)}%`;
            };

            const closePreview = () => {
                preview.remove();
                document.removeEventListener('keydown', handleKeydown);
                isImagePreviewOpen = false;
            };

            const zoomBy = (delta) => {
                scale = Math.min(4, Math.max(0.25, Number((scale + delta).toFixed(2))));
                applyTransform();
            };

            const resetZoom = () => {
                scale = 1;
                offsetX = 0;
                offsetY = 0;
                applyTransform();
            };

            function handleKeydown(event) {
                if (event.key === 'Escape') {
                    closePreview();
                } else if (event.key === '+' || event.key === '=') {
                    zoomBy(0.25);
                } else if (event.key === '-') {
                    zoomBy(-0.25);
                } else if (event.key === '0') {
                    resetZoom();
                }
            }

            img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true });
            if (img.complete && img.naturalWidth > 0) {
                img.classList.add('is-loaded');
            }

            applyTransform();

            preview.addEventListener("click", (e) => {
                if (e.target.closest('.image-preview-toolbar')) return;
                if (hasDraggedImage) {
                    hasDraggedImage = false;
                    return;
                }

                closePreview();
            });

            img.addEventListener('pointerdown', (event) => {
                event.preventDefault();
                event.stopPropagation();
                isDraggingImage = scale > 1;
                hasDraggedImage = false;
                dragStartX = event.clientX;
                dragStartY = event.clientY;
                startOffsetX = offsetX;
                startOffsetY = offsetY;
                img.classList.toggle('is-dragging', isDraggingImage);
                img.setPointerCapture?.(event.pointerId);
            });

            img.addEventListener('pointermove', (event) => {
                if (!isDraggingImage) return;

                const deltaX = event.clientX - dragStartX;
                const deltaY = event.clientY - dragStartY;
                if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
                    hasDraggedImage = true;
                }

                offsetX = startOffsetX + deltaX;
                offsetY = startOffsetY + deltaY;
                applyTransform();
            });

            img.addEventListener('pointerup', (event) => {
                img.releasePointerCapture?.(event.pointerId);
                img.classList.remove('is-dragging');
                isDraggingImage = false;
            });

            img.addEventListener('pointercancel', (event) => {
                img.releasePointerCapture?.(event.pointerId);
                img.classList.remove('is-dragging');
                isDraggingImage = false;
            });

            toolbar.addEventListener('click', (event) => {
                event.stopPropagation();
                const button = event.target.closest('[data-action]');
                if (!button) return;

                const action = button.dataset.action;
                if (action === 'zoom-in') {
                    zoomBy(0.25);
                } else if (action === 'zoom-out') {
                    zoomBy(-0.25);
                } else if (action === 'reset') {
                    resetZoom();
                } else if (action === 'close') {
                    closePreview();
                }
            });

            preview.addEventListener('wheel', (event) => {
                event.preventDefault();
                zoomBy(event.deltaY < 0 ? 0.1 : -0.1);
            }, { passive: false });

            document.addEventListener('keydown', handleKeydown);
        }

        async function getFingerprint() {
            return new Promise((resolve, reject) => {
                const storedFingerprint = localStorage.getItem('fingerprint');
                if (storedFingerprint) {
                    resolve(storedFingerprint);
                } else {
                    FingerprintJS.load().then(fp => {
                        fp.get().then(result => {
                            const fingerprint = result.visitorId;
                            localStorage.setItem('fingerprint', fingerprint);
                            resolve(fingerprint);
                        }).catch(error => {
                            console.warn('指纹生成失败，降级使用 UUID', error);
                            const uuid = generateUUID();
                            localStorage.setItem('fingerprint', uuid);
                            resolve(uuid);
                        });
                    }).catch(error => {
                        console.warn('FingerprintJS 加载失败，降级使用 UUID', error);
                        const uuid = generateUUID();
                        localStorage.setItem('fingerprint', uuid);
                        resolve(uuid);
                    });
                }
            });
        }

        function generateUUID() {
            if (typeof crypto !== 'undefined' && crypto.randomUUID) {
                return crypto.randomUUID();
            }
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                const r = Math.random() * 16 | 0;
                const v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        }

        // 应用深色模式
        function applyDarkMode() {
            const darkMode = localStorage.getItem('darkMode') === 'true';

            // 在 HTML 元素上设置 data-theme 属性，应用深色模式
            if (darkMode) {
                document.documentElement.setAttribute('data-theme', 'dark');
            }

            // 设置深色模式按钮的初始状态
            const darkModeToggle = document.getElementById('darkModeToggle');
            darkModeToggle.checked = darkMode;

            // 更新深色模式按钮图标
            updateDarkModeButton(darkMode);
        }

        // 切换深色模式
        document.getElementById('darkModeToggleBtn').addEventListener('click', function() {
            const darkModeToggle = document.getElementById('darkModeToggle');
            const darkMode = darkModeToggle.checked;
            const newDarkMode = !darkMode;

            // 保存深色模式状态到本地存储
            localStorage.setItem('darkMode', newDarkMode);

            // 切换主题色
            if (newDarkMode) {
                document.documentElement.setAttribute('data-theme', 'dark');
            } else {
                document.documentElement.removeAttribute('data-theme');
            }

            // 更新按钮样式
            updateDarkModeButton(newDarkMode);

            // 更新复选框状态
            darkModeToggle.checked = newDarkMode;
        });

        // 更新深色模式按钮样式
        function updateDarkModeButton(isDarkMode) {
            const darkModeToggleBtn = document.getElementById('darkModeToggleBtn');
            const moonIcon = darkModeToggleBtn.querySelector('i');
            if (isDarkMode) {
                moonIcon.classList.remove('fa-moon');
                moonIcon.classList.add('fa-sun');  // 切换为太阳图标
            } else {
                moonIcon.classList.remove('fa-sun');
                moonIcon.classList.add('fa-moon');  // 切换为月亮图标
            }
        }

        function refreshCurrentTab() {
            const status = getCurrentStatus();
            loadData(status);

            // 给刷新按钮一个瞬间的动效：图标旋转 + 额外类 (快速移除)
            refreshBtn.classList.add('clicked');
            setTimeout(() => {
                refreshBtn.classList.remove('clicked');
            }, 300);
        }


/**
 * 聊天室模块（工厂化）
 *
 * 设计目标：
 *  - 把聊天 socket、收发、语音、表情、引用回复、历史加载等能力封装为工厂，
 *    供 index.html / player.html 各自创建独立实例，互不干扰。
 *  - 每个实例独占自己的 socket（满足"两个 socket 连接共存"的需求）。
 *  - 所有 DOM 查询基于传入的 root，避免和外部 DOM 冲突。
 *
 * 使用：
 *   const room = ChatRoom.create({
 *       root: document.getElementById('playerChatSidebar'),
 *       onUnauthenticated: () => Toast.show('请到首页登录后再发送', 'error'),
 *       enableHotWords: false,
 *       enableHistoryLoad: true,
 *       onChatMessage: (data) => danmaku.add(data),
 *       onStatusUpdate: (data) => fetchStreamers(),
 *       onSaidaoTagUpdated: (data) => applySaidaoTagUpdate(data),
 *       onHotScoreUpdate: (scores) => applyHotScoreUpdate(scores)
 *   });
 *   room.connect();
 *   room.disconnect();
 */
(function (global) {
    const { WS_BASE_URL, TOKEN_KEY } = global.SaidaoConfig || {};

    const CHAT_STICKY_BOTTOM_THRESHOLD = 700;
    const CHAT_BOTTOM_SCROLL_EPSILON = 200;
    const CHAT_HISTORY_TOP_THRESHOLD = 80;
    const CHAT_MESSAGE_LIMIT = 1000;
    const VOICE_MIN_SECONDS = 1;
    const VOICE_MAX_SECONDS = 60;
    const CHAT_VIDEO_WINDOW_STATE_KEY = 'chatVideoWindowState';

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char]));
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

        if (meaningfulNodes.length !== 1) return false;
        const onlyNode = meaningfulNodes[0];
        return onlyNode.nodeType === Node.ELEMENT_NODE && onlyNode.matches('img');
    }

    function getFirstImageSrc(content) {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = content || '';
        const image = wrapper.querySelector('img');
        return image?.getAttribute('src') || image?.getAttribute('data-src') || '';
    }

    function markImageLoaded(image) {
        if (!image) return;
        if (image.complete && image.naturalWidth > 0) {
            image.classList.add('is-loaded');
            return;
        }
        image.addEventListener('load', () => image.classList.add('is-loaded'), { once: true });
    }

    /** 构造一个聊天室实例 */
    function create(options = {}) {
        const root = options.root;
        if (!root) {
            throw new Error('ChatRoom.create: root 不能为空');
        }

        const ApiEndpoints = global.ApiEndpoints;
        const ChatInputUtils = global.ChatInputUtils;
        const ChatVoiceUtils = global.ChatVoiceUtils;
        const Toast = global.Toast || { show: (msg) => console.log('[Toast]', msg) };

        // ====== 配置项 ======
        const enableHotWords = options.enableHotWords !== false;
        const enableHistoryLoad = options.enableHistoryLoad !== false;
        const enableImageFilter = options.enableImageFilter !== false;
        const enableContextMenu = options.enableContextMenu !== false;
        const onUnauthenticated = options.onUnauthenticated || (() => Toast.show('请先登录', 'error'));
        const onChatMessage = options.onChatMessage || (() => {});
        const onSystemMessage = options.onSystemMessage || (() => {});
        const onStatusUpdate = options.onStatusUpdate || (() => {});
        const onSaidaoTagUpdated = options.onSaidaoTagUpdated || (() => {});
        const onHotScoreUpdate = options.onHotScoreUpdate || (() => {});
        const onError = options.onError || ((data) => Toast.show(data.content || '聊天室错误', 'error'));
        const showImagePreview = options.showImagePreview || global.showImagePreview || (() => {});
        const showUserDetail = options.showUserDetail || (async (userId) => {
            try {
                const result = await ApiEndpoints?.showUserDetail(userId);
                console.log('用户详情:', result?.data);
            } catch (error) {
                console.error('获取用户详情失败:', error);
            }
        });
        const isLoggedIn = options.isLoggedIn || (() => Boolean(localStorage.getItem(TOKEN_KEY)));

        // ====== DOM 引用（基于 root 的局部查询） ======
        const $ = (selector) => root.querySelector(selector);
        const container = $('.chat-body');
        if (!container) {
            throw new Error('ChatRoom.create: root 内必须包含 .chat-body 元素');
        }
        container.innerHTML = '';

        // ====== 闭包内的状态 ======
        let socket = null;
        let chatReconnectTimer = null;
        let chatScrollRaf = null;
        let chatScrollListenerRaf = null;
        let chatResizeObserver = null;
        let chatFollowMode = true;
        let isLoadingHistory = false;
        let hasMoreHistory = enableHistoryLoad;
        let historyLoadingIndicator = null;
        let connected = false;

        const renderedMessageIds = new Set();
        const observedChatNodes = new Set();

        // 表情缓存
        const emojiCache = {};
        let currentEmojiGroup = options.defaultEmojiGroup || 'vip';

        // 引用 / @
        let currentQuote = null;

        // 语音
        let voiceRecorder = null;
        let voiceChunks = [];
        let voiceStream = null;
        let voiceStartedAt = 0;
        let voiceTimer = null;
        let voiceDraft = null;
        let voiceDraftAudio = null;
        let isVoiceUploading = false;

        // 当前播放中的语音消息
        let currentVoiceAudio = null;
        let currentVoiceButton = null;
        let chatVideoModal = null;

        // 新消息提示
        let newMessageCount = 0;
        let newMessageAlert = null;

        // @我提示
        let mentionAlert = null;
        let latestMentionMessageId = null;

        // 上下文菜单
        let currentContextMenu = null;
        let currentContextMenuCloseHandler = null;
        let longPressTimer = null;
        let longPressStart = null;

        // ====== 工具：获取指纹 ======
        async function getFingerprint() {
            if (typeof global.getFingerprint === 'function') {
                return await global.getFingerprint();
            }
            const stored = localStorage.getItem('fingerprint');
            if (stored) return stored;

            return new Promise((resolve) => {
                const fallback = () => {
                    const uuid = (typeof crypto !== 'undefined' && crypto.randomUUID)
                        ? crypto.randomUUID()
                        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
                            const r = Math.random() * 16 | 0;
                            const v = c === 'x' ? r : (r & 0x3 | 0x8);
                            return v.toString(16);
                        });
                    localStorage.setItem('fingerprint', uuid);
                    resolve(uuid);
                };

                if (typeof global.FingerprintJS === 'undefined') {
                    fallback();
                    return;
                }

                try {
                    global.FingerprintJS.load().then((fp) => {
                        fp.get().then((result) => {
                            const fingerprint = result.visitorId;
                            localStorage.setItem('fingerprint', fingerprint);
                            resolve(fingerprint);
                        }).catch(fallback);
                    }).catch(fallback);
                } catch (error) {
                    fallback();
                }
            });
        }

        // ====== 滚动 / 跟随 ======
        function isChatNearBottom(threshold = CHAT_STICKY_BOTTOM_THRESHOLD) {
            return container.scrollHeight - container.scrollTop - container.clientHeight <= threshold;
        }

        function shouldAppendStickToBottom(opts, position) {
            if (opts.stickToBottom !== undefined && opts.stickToBottom !== null) {
                return opts.stickToBottom;
            }
            return position === 'append' && (chatFollowMode || isChatNearBottom(CHAT_BOTTOM_SCROLL_EPSILON));
        }

        function scrollChatToBottom() {
            container.scrollTop = container.scrollHeight;
        }

        function scheduleChatScrollToBottom() {
            if (!chatFollowMode || chatScrollRaf) return;
            chatScrollRaf = requestAnimationFrame(() => {
                chatScrollRaf = null;
                if (chatFollowMode) {
                    scrollChatToBottom();
                }
            });
        }

        function followChatBottom() {
            chatFollowMode = true;
            hideNewMessageAlert();
            scheduleChatScrollToBottom();
        }

        function syncChatFollowMode() {
            chatFollowMode = isChatNearBottom(CHAT_BOTTOM_SCROLL_EPSILON);
            if (chatFollowMode) hideNewMessageAlert();
        }

        // ====== 消息节点管理 ======
        function trackRenderedMessage(messageId) {
            if (!messageId) return true;
            const normalizedId = String(messageId);
            if (renderedMessageIds.has(normalizedId)) return false;
            renderedMessageIds.add(normalizedId);
            return true;
        }

        function getChatMessageNodes() {
            return Array.from(container.querySelectorAll('.chat-message'));
        }

        function getFirstChatMessageNode() {
            return container.querySelector('.chat-message');
        }

        function observeChatNode(node) {
            if (!chatResizeObserver || !node) return;
            chatResizeObserver.observe(node);
            observedChatNodes.add(node);
        }

        function unobserveChatNode(node) {
            if (!chatResizeObserver || !node) return;
            if (observedChatNodes.has(node)) {
                chatResizeObserver.unobserve(node);
                observedChatNodes.delete(node);
            }
        }

        function clearChatObservers() {
            if (!chatResizeObserver) return;
            observedChatNodes.forEach((node) => chatResizeObserver.unobserve(node));
            observedChatNodes.clear();
        }

        function forgetRenderedMessage(messageElement) {
            const messageId = messageElement?.dataset?.messageId;
            if (messageId) renderedMessageIds.delete(String(messageId));
        }

        function removeChatMessage(messageElement) {
            if (!messageElement) return;
            unobserveChatNode(messageElement);
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
            container.querySelectorAll('.chat-message').forEach((el) => {
                unobserveChatNode(el);
                el.remove();
            });
            renderedMessageIds.clear();
            hasMoreHistory = enableHistoryLoad;
            hideNewMessageAlert();
            hideMentionAlert();
            closeMessageContextMenu();
            if (chatScrollRaf) {
                cancelAnimationFrame(chatScrollRaf);
                chatScrollRaf = null;
            }
        }

        if (global.ResizeObserver) {
            chatResizeObserver = new ResizeObserver(() => {
                if (chatFollowMode) scheduleChatScrollToBottom();
            });
        }

        // ====== 图片消息隐藏 ======
        const BLOCK_IMAGE_MESSAGES_KEY = 'blockImageMessages';

        function isImageMessagesBlocked() {
            return localStorage.getItem(BLOCK_IMAGE_MESSAGES_KEY) === 'true';
        }

        function ensureChatImageHiddenTip(messageElement) {
            let tip = messageElement.querySelector(':scope > .chat-image-hidden-tip');
            if (tip) return tip;
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

        // ====== 渲染语音消息 ======
        function renderVoiceMessage(data) {
            const width = ChatVoiceUtils.getVoiceBubbleWidth(data.duration);
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
                    <span class="voice-duration">${ChatVoiceUtils.formatVoiceDurationSeconds(data.duration)}</span>
                </div>
            `;
        }

        // ====== 添加普通消息 ======
        function addMessageToChat(data, opts = {}) {
            const isPureImage = isPureImageMessageContent(data.content);

            if (!trackRenderedMessage(data.messageId)) return null;

            const suppressAlert = opts.suppressAlert ?? false;
            const position = opts.position || 'append';
            const shouldStickToBottom = shouldAppendStickToBottom(opts, position);
            const messageElement = document.createElement('div');
            messageElement.className = 'chat-message message-element';

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
            }

            let processedContent = data.content;
            if (data.mentions && data.mentions.length > 0) {
                processedContent = processedContent.replace(/@(\S+)/g, '<span class="mention" style="color: #020df4; font-weight: 500;">@$1</span>');
            }

            let factionHTML = '';
            if (data.faction === 'ya') {
                factionHTML = '<span class="faction-tag tooth">牙</span>';
            } else if (data.faction === 'juan') {
                factionHTML = '<span class="faction-tag volume">卷</span>';
            } else if (data.faction === 'AI') {
                factionHTML = '<span class="faction-tag ai">AI</span>';
            }

            let ipGeo = '';
            if (data.uid !== 0 && data.ipGeo) {
                ipGeo = 'IP属地：' + data.ipGeo;
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
                    <div class="message-text${data.messageKind === 'voice' ? ' voice-bubble' : ''}">${messageBodyHTML}</div>
                    ${quoteHTML}
                </div>
            `;

            if (position === 'prepend') {
                container.insertBefore(messageElement, opts.beforeNode || getFirstChatMessageNode());
            } else {
                container.appendChild(messageElement);
            }
            observeChatNode(messageElement);
            trimChatMessages(position === 'prepend' ? 'bottom' : 'top');

            const messageText = messageElement.querySelector('.message-text');
            const imageEmoji = messageText?.querySelector('img');

            if (messageText?.querySelector('.chat-video-card')) {
                messageText.classList.add('video-card-message');
            }

            if (isPureImage && imageEmoji) {
                messageElement.classList.add('image-message');
                messageText.classList.add('image-only');
                markImageLoaded(imageEmoji);
                imageEmoji.addEventListener('load', () => {
                    if (shouldStickToBottom) followChatBottom();
                }, { once: true });
                if (enableImageFilter && isImageMessagesBlocked()) {
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

            messageElement._messageData = data;

            if (shouldStickToBottom) {
                followChatBottom();
            } else if (!suppressAlert) {
                showNewMessageAlert();
            }

            // 通过回调通知外部（如弹幕层、桥接到 player 弹幕）
            try { onChatMessage(data, messageElement); } catch (err) { console.warn(err); }

            return messageElement;
        }

        // ====== 系统消息 ======
        function addSystemMessageToChat(data, opts = {}) {
            if (data.messageId && !trackRenderedMessage(data.messageId)) return null;

            const messageElement = document.createElement('div');
            messageElement.className = 'chat-message system-message';
            const suppressAlert = opts.suppressAlert ?? false;
            const position = opts.position || 'append';
            const shouldStickToBottom = shouldAppendStickToBottom(opts, position);

            messageElement.innerHTML = `
                <div class="system-content">
                    <div class="system-text">${data.content}</div>
                    ${data.timestamp ? `<span class="message-time">${data.timestamp}</span>` : ''}
                </div>
            `;

            if (data.messageId) {
                messageElement.dataset.messageId = data.messageId;
            }

            if (position === 'prepend') {
                container.insertBefore(messageElement, opts.beforeNode || getFirstChatMessageNode());
            } else {
                container.appendChild(messageElement);
            }
            observeChatNode(messageElement);
            trimChatMessages(position === 'prepend' ? 'bottom' : 'top');

            if (shouldStickToBottom) {
                followChatBottom();
            } else if (!suppressAlert) {
                showNewMessageAlert();
            }

            try { onSystemMessage(data, messageElement); } catch (err) { console.warn(err); }

            return messageElement;
        }

        // ====== 新消息提示 ======
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
                newMessageAlert.querySelector('.new-message-btn').addEventListener('click', () => {
                    chatFollowMode = true;
                    scheduleChatScrollToBottom();
                    hideNewMessageAlert();
                });
                root.appendChild(newMessageAlert);
            } else {
                newMessageAlert.querySelector('.new-message-btn').textContent = `有新消息 (${newMessageCount})`;
            }
        }

        function hideNewMessageAlert() {
            if (newMessageAlert) {
                newMessageAlert.remove();
                newMessageAlert = null;
                newMessageCount = 0;
            }
        }

        // ====== @我提示 ======
        function showMentionAlert(messageId) {
            latestMentionMessageId = messageId;
            if (mentionAlert === null) {
                mentionAlert = document.createElement('div');
                mentionAlert.className = 'new-message-alert mention-alert';
                mentionAlert.style.zIndex = '9999';
                mentionAlert.innerHTML = `
                    <button class="new-message-btn">有人@我</button>
                `;
                mentionAlert.querySelector('.new-message-btn').addEventListener('click', () => {
                    jumpToMessage(latestMentionMessageId);
                    hideMentionAlert();
                });
                root.appendChild(mentionAlert);
            }
        }

        function hideMentionAlert() {
            if (mentionAlert) {
                mentionAlert.remove();
                mentionAlert = null;
                latestMentionMessageId = null;
            }
        }

        function jumpToMessage(messageId) {
            const target = container.querySelector(`.chat-message[data-message-id="${messageId}"]`);
            if (!target) return;
            const offsetTop = target.offsetTop - container.offsetTop;
            container.scrollTo({
                top: offsetTop - container.clientHeight / 2,
                behavior: 'smooth'
            });
            target.classList.add('message-highlight');
            setTimeout(() => target.classList.remove('message-highlight'), 2000);
        }

        // ====== 引用消息 ======
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

            const preview = $('.quote-preview');
            if (preview) {
                preview.innerHTML = `
                    <div class="quote-preview-content">
                        <div class="quote-header">
                            <span style="font-weight:500; color: var(--primary-color);">引用 ${escapeHtml(messageData.uname)}:</span>
                            <button class="quote-cancel-btn"><i class="fas fa-times"></i></button>
                        </div>
                        <div class="quote-text">${escapeHtml(quotePreviewText)}</div>
                    </div>
                `;
                preview.style.display = 'block';
                preview.querySelector('.quote-cancel-btn').addEventListener('click', clearQuote);
            }

            const chatInput = $('.chat-input');
            if (chatInput) {
                chatInput.value = `@${messageData.uname} `;
                syncChatInputHeight(chatInput);
                chatInput.focus();
                syncChatComposerState();
            }
        }

        function clearQuote() {
            currentQuote = null;
            const preview = $('.quote-preview');
            if (preview) {
                preview.style.display = 'none';
                preview.innerHTML = '';
            }
        }

        function mentionUser(uname) {
            const chatInput = $('.chat-input');
            if (!chatInput) return;
            const currentValue = chatInput.value.trim();
            const separator = currentValue && !currentValue.endsWith(' ') ? ' ' : '';
            chatInput.value = `${currentValue}${separator}@${uname} `;
            syncChatInputHeight(chatInput);
            chatInput.focus();
            syncChatComposerState();
        }

        // ====== 输入框联动 ======
        function syncChatInputHeight(input) {
            if (!input) return;
            input.style.height = 'auto';
            const computedStyle = global.getComputedStyle(input);
            const minHeight = parseFloat(computedStyle.minHeight) || 0;
            const maxHeight = parseFloat(computedStyle.maxHeight) || Number.POSITIVE_INFINITY;
            const { height, overflowY } = ChatInputUtils.getAutoGrowMetrics({
                scrollHeight: input.scrollHeight,
                minHeight,
                maxHeight
            });
            input.style.height = `${height}px`;
            input.style.overflowY = overflowY;
        }

        function syncChatComposerState() {
            const chatInput = $('.chat-input');
            const shell = $('.chat-input-shell');
            const sendButton = $('.chat-send-toggle');
            const showVoiceEntry = ChatInputUtils.shouldShowVoiceEntry({
                value: chatInput?.value || '',
                hasVoiceDraft: Boolean(voiceDraft),
            });
            shell?.classList.toggle('has-text', !showVoiceEntry && !voiceDraft);
            shell?.classList.toggle('has-voice-draft', Boolean(voiceDraft));
            $('.emoji-picker-toggle')?.classList.toggle('hidden-during-voice', Boolean(voiceDraft) || isVoiceRecording());
            if (sendButton) {
                sendButton.disabled = isVoiceUploading || (!voiceDraft && (chatInput?.value.trim() || '') === '');
            }
        }

        function handleChatInput(event) {
            const input = event.currentTarget;
            if (input.value.trim() !== '') {
                clearVoiceDraft();
            }
            syncChatComposerState();
            syncChatInputHeight(input);
        }

        // ====== 发送文本 ======
        function sendMessage() {
            if (voiceDraft) {
                sendVoiceDraft();
                return;
            }

            const chatInput = $('.chat-input');
            const message = chatInput?.value.trim();
            if (!message) return;

            if (!socket || socket.readyState !== WebSocket.OPEN) {
                Toast.show('聊天室连接中，请稍后再试', 'error');
                return;
            }

            const newMessage = { type: 'chat', content: message };
            if (currentQuote) newMessage.reply = currentQuote;

            socket.send(JSON.stringify(newMessage));

            chatInput.value = '';
            syncChatInputHeight(chatInput);
            syncChatComposerState();
            clearQuote();
            closeEmojiSection();
        }

        // ====== 表情 ======
        async function renderEmojis() {
            const emojiContainer = $('.emoji-container');
            if (!emojiContainer) return;
            const group = currentEmojiGroup;

            emojiContainer.innerHTML = '';

            if (group === 'vip') {
                const uploadBtn = document.createElement('div');
                uploadBtn.className = 'emoji-upload-btn';
                uploadBtn.innerHTML = '<div class="upload-plus">+</div>';
                uploadBtn.title = '支持JPG/PNG/GIF/WEBP，最大2MB';
                uploadBtn.addEventListener('click', () => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = async (e) => {
                        const file = e.target.files[0];
                        if (!file) return;
                        if (file.size > 2 * 1024 * 1024) {
                            Toast.show('文件大小不能超过2MB', 'error');
                            return;
                        }
                        const formData = new FormData();
                        formData.append('file', file);
                        try {
                            const result = await ApiEndpoints.uploadEmojis(formData);
                            if (result.code === '0') Toast.show('上传成功', 'success');
                            delete emojiCache[group];
                            await renderEmojis();
                        } catch (error) {
                            console.error('上传表情失败:', error);
                        }
                    };
                    input.click();
                });
                emojiContainer.appendChild(uploadBtn);
            }

            if (emojiCache[group]) {
                emojiCache[group].forEach((node) => emojiContainer.appendChild(node));
                return;
            }

            try {
                const result = await ApiEndpoints.queryEmojis(group);
                const nodes = [];
                result.data.forEach((emoji) => {
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
                    emojiContainer.appendChild(node);
                    nodes.push(node);
                });
                emojiCache[group] = nodes;
            } catch (error) {
                console.error('加载表情失败:', error);
            }
        }

        function insertEmoji(emoji) {
            clearVoiceDraft();

            if (emoji && emoji.clickSend) {
                if (!socket || socket.readyState !== WebSocket.OPEN) {
                    Toast.show('聊天室连接中，请稍后再试', 'error');
                    return;
                }
                const newMessage = { type: 'chat', content: `[${emoji.name}]` };
                socket.send(JSON.stringify(newMessage));
                closeEmojiSection();
                return;
            }

            const chatInput = $('.chat-input');
            if (!chatInput) return;
            chatInput.value += `[${emoji.name}]`;
            syncChatInputHeight(chatInput);
            chatInput.focus();
            syncChatComposerState();
        }

        function toggleEmojiSection() {
            const section = $('.emoji-section');
            const toggleIcon = $('.emoji-picker-toggle i');
            if (!section) return;
            const expanded = section.classList.toggle('expanded');
            if (toggleIcon) toggleIcon.className = expanded ? 'fas fa-keyboard' : 'far fa-smile';
            if (expanded) {
                renderEmojis();
            }
        }

        function closeEmojiSection() {
            const section = $('.emoji-section');
            const toggleIcon = $('.emoji-picker-toggle i');
            if (!section || !section.classList.contains('expanded')) return;
            section.classList.remove('expanded');
            if (toggleIcon) toggleIcon.className = 'far fa-smile';
        }

        // ====== 语音录制 ======
        function isVoiceRecording() {
            return voiceRecorder && voiceRecorder.state === 'recording';
        }

        function updateVoiceRecordingUi(recording, uploading = isVoiceUploading) {
            const button = $('.voice-toggle');
            const time = $('.voice-recording-time');
            const shell = $('.chat-input-shell');
            const recordingPanel = $('.voice-recording-panel');
            const emojiButton = $('.emoji-picker-toggle');
            button?.classList.toggle('recording', recording);
            button?.classList.toggle('uploading', uploading);
            button?.toggleAttribute('disabled', uploading);
            shell?.classList.toggle('recording', recording);
            if (recordingPanel) recordingPanel.hidden = !recording;
            emojiButton?.classList.toggle('hidden-during-voice', recording || Boolean(voiceDraft));
            if (time && recording) time.textContent = '0:00';
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
            if (isVoiceUploading) return;
            if (isVoiceRecording()) {
                voiceRecorder.stop();
                return;
            }
            await startVoiceRecording();
        }

        async function startVoiceRecording() {
            clearVoiceDraft();
            if (!isLoggedIn()) {
                onUnauthenticated();
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
                const mimeType = ChatVoiceUtils.getSupportedVoiceMimeType();
                voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                voiceChunks = [];
                voiceRecorder = new MediaRecorder(voiceStream, mimeType ? { mimeType } : undefined);
                voiceStartedAt = Date.now();

                voiceRecorder.addEventListener('dataavailable', (event) => {
                    if (event.data && event.data.size > 0) voiceChunks.push(event.data);
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
                const time = $('.voice-recording-time');
                if (time) time.textContent = ChatVoiceUtils.formatVoiceDuration(seconds);
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
            if (voiceDraft?.audioUrl) URL.revokeObjectURL(voiceDraft.audioUrl);
            voiceDraft = null;
            const draft = $('.voice-draft');
            if (draft) {
                draft.hidden = true;
                draft.innerHTML = '';
            }
            syncChatComposerState();
        }

        function renderVoiceDraft() {
            const draft = $('.voice-draft');
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
                <span class="voice-draft-duration">${ChatVoiceUtils.formatVoiceDurationSeconds(voiceDraft.duration)}</span>
                <button class="voice-draft-send" type="button" aria-label="发送语音">发送</button>
                <button class="voice-draft-cancel" type="button" aria-label="取消语音">
                    <i class="fas fa-times"></i>
                </button>
            `;
            draft.querySelector('.voice-draft-play')?.addEventListener('click', toggleVoiceDraftPlayback);
            draft.querySelector('.voice-draft-send')?.addEventListener('click', sendVoiceDraft);
            draft.querySelector('.voice-draft-cancel')?.addEventListener('click', clearVoiceDraft);
        }

        function toggleVoiceDraftPlayback() {
            if (!voiceDraft) return;
            const button = $('.voice-draft .voice-draft-play');
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
                if (!audioUrl) throw new Error('voice upload returned empty url');

                const newMessage = {
                    type: 'voice',
                    audioUrl,
                    duration: Math.round(duration * 10) / 10,
                    waveform,
                };
                if (currentQuote) newMessage.reply = currentQuote;

                if (!socket || socket.readyState !== WebSocket.OPEN) {
                    Toast.show('聊天室连接中，请稍后再试', 'error');
                    return;
                }
                socket.send(JSON.stringify(newMessage));
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
                if (voiceDraft) renderVoiceDraft();
            }
        }

        async function getVoiceBlobMeta(blob, fallbackDuration) {
            try {
                const arrayBuffer = await blob.arrayBuffer();
                const AudioContextCtor = global.AudioContext || global.webkitAudioContext;
                if (!AudioContextCtor) {
                    return {
                        duration: Math.max(VOICE_MIN_SECONDS, Math.min(fallbackDuration, VOICE_MAX_SECONDS)),
                        waveform: ChatVoiceUtils.clampWaveform([], 32),
                    };
                }
                const audioContext = new AudioContextCtor();
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
                const samples = audioBuffer.getChannelData(0);
                await audioContext.close?.();
                return {
                    duration: Math.max(VOICE_MIN_SECONDS, Math.min(audioBuffer.duration, VOICE_MAX_SECONDS)),
                    waveform: ChatVoiceUtils.buildWaveformFromSamples(samples, 32),
                };
            } catch (error) {
                console.warn('读取语音信息失败:', error);
                return {
                    duration: Math.max(VOICE_MIN_SECONDS, Math.min(fallbackDuration, VOICE_MAX_SECONDS)),
                    waveform: ChatVoiceUtils.clampWaveform([], 32),
                };
            }
        }

        async function buildVoiceWaveform(blob) {
            try {
                const arrayBuffer = await blob.arrayBuffer();
                const AudioContextCtor = global.AudioContext || global.webkitAudioContext;
                if (!AudioContextCtor) return ChatVoiceUtils.clampWaveform([], 32);
                const audioContext = new AudioContextCtor();
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
                const samples = audioBuffer.getChannelData(0);
                await audioContext.close?.();
                return ChatVoiceUtils.buildWaveformFromSamples(samples, 32);
            } catch (error) {
                console.warn('生成语音频谱失败:', error);
                return ChatVoiceUtils.clampWaveform([], 32);
            }
        }

        // ====== 语音播放（容器事件委托） ======
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

        function playChatVideo(playButton) {
            const videoUrl = playButton.dataset.videoUrl;
            const title = playButton.closest('.chat-video-card')?.querySelector('.chat-video-title')?.textContent?.trim()
                || playButton.getAttribute('aria-label')
                || '视频播放';
            if (!videoUrl) return;

            chatVideoModal?.remove();
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
                    chatVideoModal.remove();
                    chatVideoModal = null;
                }
            });
            document.body.appendChild(chatVideoModal);
        }

        // ====== 上下文菜单 ======
        function styleMenuItem(item) {
            item.style.padding = '8px 12px';
            item.style.cursor = 'pointer';
            item.style.color = 'var(--text-primary)';
            item.style.fontSize = '14px';
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

        function showMessageContextMenu(event, messageData) {
            if (!enableContextMenu) return;
            closeMessageContextMenu();

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

            const quoteItem = document.createElement('div');
            quoteItem.className = 'context-menu-item';
            quoteItem.textContent = '引用';
            styleMenuItem(quoteItem);
            quoteItem.addEventListener('click', () => {
                setQuoteMessage(messageData);
                closeMessageContextMenu();
            });
            menu.appendChild(quoteItem);

            const mentionItem = document.createElement('div');
            mentionItem.className = 'context-menu-item';
            mentionItem.textContent = `@${messageData.uname}`;
            styleMenuItem(mentionItem);
            mentionItem.addEventListener('click', () => {
                mentionUser(messageData.uname);
                closeMessageContextMenu();
            });
            menu.appendChild(mentionItem);

            [copyItem, quoteItem, mentionItem].forEach((item) => {
                item.addEventListener('mouseenter', () => item.style.backgroundColor = 'var(--bg-color)');
                item.addEventListener('mouseleave', () => item.style.backgroundColor = '');
            });

            document.body.appendChild(menu);
            currentContextMenu = menu;
            currentContextMenuCloseHandler = clickOutsideMenu;

            setTimeout(() => {
                if (currentContextMenu === menu && currentContextMenuCloseHandler === clickOutsideMenu) {
                    document.addEventListener('click', clickOutsideMenu);
                }
            }, 0);

            function clickOutsideMenu(e) {
                if (!menu.contains(e.target)) closeMessageContextMenu();
            }
        }

        function getMessageDataFromNode(node) {
            const messageEl = node?.closest?.('.chat-message');
            return messageEl?._messageData || null;
        }

        function clearLongPressTimer() {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
            longPressStart = null;
        }

        // ====== 历史消息 ======
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
            if (!enableHistoryLoad || isLoadingHistory || !hasMoreHistory) return;
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
                messages.forEach((msg) => {
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

                if (addedCount === 0) hasMoreHistory = false;
                container.scrollTop = container.scrollHeight - previousScrollHeight + previousScrollTop;
            } catch (error) {
                console.error('加载历史消息失败:', error);
                Toast.show('历史消息加载失败', 'error');
            } finally {
                isLoadingHistory = false;
                hideHistoryLoadingIndicator();
            }
        }

        // ====== WebSocket 生命周期 ======
        function clearChatReconnectTimer() {
            if (chatReconnectTimer) {
                clearTimeout(chatReconnectTimer);
                chatReconnectTimer = null;
            }
        }

        function closeChatSocket({ preventReconnect = false } = {}) {
            if (!socket) return;
            if (preventReconnect) socket.__skipReconnect = true;
            try { socket.close(); } catch (error) { console.warn('关闭聊天室连接失败:', error); }
            socket = null;
        }

        async function setupWebSocket() {
            clearChatReconnectTimer();
            closeChatSocket({ preventReconnect: true });

            const token = localStorage.getItem(TOKEN_KEY) || '';
            const fp = await getFingerprint();

            const currentSocket = new WebSocket(`${WS_BASE_URL}/ws/chat?token=${encodeURIComponent(token)}&fp=${encodeURIComponent(fp)}`);
            socket = currentSocket;

            currentSocket.addEventListener('open', () => {
                if (socket !== currentSocket) return;
                console.log('[ChatRoom] WebSocket 已连接');
                connected = true;
            });

            currentSocket.addEventListener('message', (event) => {
                if (socket !== currentSocket) return;
                let data;
                try { data = JSON.parse(event.data); } catch (e) { return; }

                if (data.type === 'user') {
                    addMessageToChat(data);
                } else if (data.type === 'history') {
                    resetChatMessages();
                    data.messages.forEach((msg) => {
                        if (msg.type === 'status') {
                            addSystemMessageToChat(msg, { stickToBottom: false, suppressAlert: true });
                        } else {
                            addMessageToChat(msg, { stickToBottom: false, suppressAlert: true });
                        }
                    });
                    chatFollowMode = true;
                    scheduleChatScrollToBottom();
                } else if (data.type === 'error') {
                    onError(data);
                } else if (data.type === 'system') {
                    addSystemMessageToChat(data);
                } else if (data.type === 'onlineCount') {
                    const onlineCount = $('.online-count');
                    if (onlineCount) onlineCount.textContent = `${data.count}人在线`;
                } else if (data.type === 'hotWords') {
                    // 暂只在 index 处理，由外部桥接
                } else if (data.type === 'status') {
                    addSystemMessageToChat(data);
                    try { onStatusUpdate(data); } catch (e) { console.warn(e); }
                } else if (data.type === 'saidaoTagUpdated') {
                    try { onSaidaoTagUpdated(data); } catch (e) { console.warn(e); }
                } else if (data.type === 'hotScoreUpdate') {
                    try { onHotScoreUpdate(data.scores); } catch (e) { console.warn(e); }
                } else if (data.type === 'clear') {
                    resetChatMessages();
                }
            });

            currentSocket.addEventListener('close', () => {
                if (socket === currentSocket) socket = null;
                connected = false;
                if (currentSocket.__skipReconnect) return;
                console.log('[ChatRoom] WebSocket 已关闭，准备重连');
                clearChatReconnectTimer();
                chatReconnectTimer = setTimeout(() => {
                    if (!socket) setupWebSocket();
                }, 3000);
            });

            currentSocket.addEventListener('error', (event) => {
                if (socket !== currentSocket) return;
                console.error('[ChatRoom] WebSocket 错误:', event);
            });
        }

        // ====== 事件绑定 ======
        function bindEvents() {
            // 输入框
            const chatInput = $('.chat-input');
            if (chatInput) {
                chatInput.addEventListener('input', handleChatInput);
                syncChatInputHeight(chatInput);
                chatInput.addEventListener('keydown', (event) => {
                    if (ChatInputUtils.shouldInsertLineBreakOnChatKeydown(event)) {
                        event.preventDefault();
                        chatInput.setRangeText('\n', chatInput.selectionStart, chatInput.selectionEnd, 'end');
                        chatInput.dispatchEvent(new Event('input', { bubbles: true }));
                        return;
                    }
                    if (!ChatInputUtils.shouldSendOnChatKeydown(event)) return;
                    event.preventDefault();
                    sendMessage();
                });
            }

            $('.chat-send-toggle')?.addEventListener('click', sendMessage);
            $('.emoji-picker-toggle')?.addEventListener('click', toggleEmojiSection);
            $('.voice-toggle')?.addEventListener('click', toggleVoiceRecording);
            $('.voice-recording-panel')?.addEventListener('click', toggleVoiceRecording);

            // 表情 Tab 切换
            root.querySelectorAll('.emoji-tab').forEach((tab) => {
                tab.addEventListener('click', () => {
                    root.querySelectorAll('.emoji-tab').forEach((item) => item.classList.toggle('active', item === tab));
                    currentEmojiGroup = tab.dataset.group;
                    renderEmojis();
                });
            });

            // 图片屏蔽
            const blockCheckbox = $('#blockImageMessages, .chat-image-filter input[type=checkbox]');
            if (blockCheckbox && enableImageFilter) {
                blockCheckbox.checked = isImageMessagesBlocked();
                blockCheckbox.addEventListener('change', (event) => {
                    const blocked = event.target.checked;
                    localStorage.setItem(BLOCK_IMAGE_MESSAGES_KEY, String(blocked));
                    container.querySelectorAll('.chat-message.image-message').forEach((messageElement) => {
                        if (blocked) hideChatImageMessage(messageElement);
                        else showChatImageMessage(messageElement);
                    });
                });
            }

            // 容器事件委托：头像点击 / 语音与视频播放 / 右键菜单 / 长按
            container.addEventListener('click', (e) => {
                const avatar = e.target.closest('.message-avatar');
                if (avatar) {
                    showUserDetail(parseInt(avatar.dataset.userId));
                    return;
                }
                const playButton = e.target.closest('.voice-play-btn');
                if (playButton) handleVoicePlayClick(playButton);

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

                const quoteEl = e.target.closest('.message-quote');
                if (quoteEl) {
                    const imageSrc = quoteEl.getAttribute('data-image-src');
                    if (quoteEl.classList.contains('image-quote')) {
                        if (imageSrc) showImagePreview(imageSrc);
                        return;
                    }
                    const messageId = quoteEl.getAttribute('data-message-id');
                    if (!messageId) return;
                    const target = container.querySelector(`.chat-message[data-message-id="${messageId}"]`);
                    if (!target) return;
                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    target.classList.add('message-highlight');
                    setTimeout(() => target.classList.remove('message-highlight'), 2000);
                }
            });

            container.addEventListener('contextmenu', (e) => {
                const data = getMessageDataFromNode(e.target);
                if (!data) return;
                e.preventDefault();
                showMessageContextMenu(e, data);
            });

            container.addEventListener('touchstart', (e) => {
                const messageEl = e.target.closest('.chat-message');
                if (!messageEl || !messageEl._messageData) return;
                const touch = e.touches && e.touches[0];
                if (!touch) return;
                clearLongPressTimer();
                longPressStart = { x: touch.clientX, y: touch.clientY };
                const data = messageEl._messageData;
                longPressTimer = setTimeout(() => showMessageContextMenu(touch, data), 500);
            }, { passive: true });

            container.addEventListener('touchmove', (e) => {
                if (!longPressStart) return;
                const touch = e.touches && e.touches[0];
                if (!touch) return;
                const dx = Math.abs(touch.clientX - longPressStart.x);
                const dy = Math.abs(touch.clientY - longPressStart.y);
                if (dx > 10 || dy > 10) clearLongPressTimer();
            }, { passive: true });
            container.addEventListener('touchend', clearLongPressTimer);
            container.addEventListener('touchcancel', clearLongPressTimer);

            // 滚动监听
            container.addEventListener('scroll', () => {
                if (chatScrollListenerRaf) return;
                chatScrollListenerRaf = requestAnimationFrame(() => {
                    chatScrollListenerRaf = null;
                    syncChatFollowMode();
                    if (enableHistoryLoad && container.scrollTop <= CHAT_HISTORY_TOP_THRESHOLD) {
                        loadOlderMessages();
                    }
                });
            }, { passive: true });

            // 表情图片预览委托
            document.addEventListener('click', (event) => {
                const image = event.target.closest('img.chat-emoji');
                if (!image || !container.contains(image)) return;
                event.preventDefault();
                const imgSrc = image.src || image.getAttribute('data-src');
                showImagePreview(imgSrc);
            });
        }

        // ====== 公开 API ======
        function connect() {
            if (connected) return;
            setupWebSocket();
        }

        function disconnect() {
            clearChatReconnectTimer();
            closeChatSocket({ preventReconnect: true });
            clearChatObservers();
            connected = false;
        }

        function isConnected() {
            return Boolean(socket) && socket.readyState === WebSocket.OPEN;
        }

        // 初始化
        bindEvents();
        if (options.autoConnect !== false) {
            connect();
        }

        return {
            root,
            connect,
            disconnect,
            isConnected,
            sendMessage,
            sendVoiceDraft,
            clearVoiceDraft,
            clearQuote,
            renderEmojis,
            insertEmoji,
            addMessageToChat,
            addSystemMessageToChat,
            resetChatMessages
        };
    }

    global.ChatRoom = { create };
})(typeof window !== 'undefined' ? window : globalThis);

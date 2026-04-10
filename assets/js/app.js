const state = window.SaidaoState;
const { WS_BASE_URL } = window.SaidaoConfig;
const ApiEndpoints = window.ApiEndpoints;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const byId = (id) => document.getElementById(id);
const on = (target, event, handler, options) => target?.addEventListener(event, handler, options);
const setActiveItem = (items, current, activeClass = 'active') => {
    items.forEach((item) => item.classList.toggle(activeClass, item === current));
};
const setModalOpen = (id, isOpen) => byId(id)?.classList.toggle('active', isOpen);

// 检测设备类型
function detectDeviceType() {
    state.isMobile = window.innerWidth <= 768;
}

let streamersData = [];
const emojiData = {};
let tagEditorTarget = null;

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function initializeApp() {
    applyDarkMode();
    detectDeviceType();
    setViewportHeightVar();
    initEventListeners();
    initializeFactionSelection();
    initializeEmojiPreviewDelegation();
    fetchStreamers();
    checkIsLogin();
    setupWebSocket();
    updateUIState();

    const chatSidebar = byId('chatSidebar');
    chatSidebar.style.width = `${state.chatWidth}px`;

    if (!state.isMobile) {
        chatSidebar.classList.remove('collapsed');
        state.chatExpanded = true;
    }

    on(window, 'resize', handleResize);
    on(window, 'orientationchange', setViewportHeightVar);
}

function handleResize() {
    if (handleResize._raf) return;
    handleResize._raf = requestAnimationFrame(() => {
        handleResize._raf = null;
        detectDeviceType();
        setViewportHeightVar();
        const chatSidebar = byId('chatSidebar');
        if (state.isMobile && !chatSidebar.classList.contains('collapsed')) {
            chatSidebar.style.width = '100%';
        }
        syncCardAnimationsWithChatState();
    });
}

function setViewportHeightVar() {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
}

function initializeFactionSelection() {
    const factionOptions = $$('.faction-option-row');
    const selectedFactionInput = byId('selectedFaction');
    const yaAnimationContainer = byId('yaAnimation');
    const juanAnimationContainer = byId('juanAnimation');

    const allowFactionAnimation = !window.__LIMITED_MOTION__;
    const yaAnimation = allowFactionAnimation && yaAnimationContainer
        ? lottie.loadAnimation({
            container: yaAnimationContainer,
            renderer: 'svg',
            loop: true,
            autoplay: true,
            path: '/animation/Tooth.json'
        })
        : null;

    const juanAnimation = allowFactionAnimation && juanAnimationContainer
        ? lottie.loadAnimation({
            container: juanAnimationContainer,
            renderer: 'svg',
            loop: true,
            autoplay: true,
            path: '/animation/Piggy.json'
        })
        : null;

    const playFactionAnimation = (faction) => {
        if (faction === 'ya' && yaAnimation) {
            yaAnimation.play();
            juanAnimation?.stop();
            return;
        }

        if (faction === 'juan' && juanAnimation) {
            juanAnimation.play();
            yaAnimation?.stop();
        }
    };

    factionOptions.forEach((option) => {
        on(option, 'click', () => {
            const faction = option.dataset.faction;
            const radioInput = $('input[type="radio"]', option);

            setActiveItem(factionOptions, option, 'selected');
            radioInput.checked = true;
            selectedFactionInput.value = faction;
            if (allowFactionAnimation) {
                playFactionAnimation(faction);
            }
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

        [
            ['closeLoginModal', closeLoginModal],
            ['closeRegisterModal', closeRegisterModal],
            ['closeForgotModal', closeForgotPasswordModal],
            ['closeProfileModal', closeProfileModal],
            ['closeUserDetailModal', closeUserDetailModal],
            ['closeTagEditorModal', closeTagEditor],
            ['tagEditorCancelBtn', closeTagEditor],
            ['switchToRegister', switchToRegister],
            ['switchToLogin', switchToLogin],
            ['forgotPassword', openForgotPasswordModal],
            ['testWebhookBtn', handleTestWebhook],
            ['emojiToggle', toggleEmojiSection],
            ['sendBtn', sendMessage],
            ['logoutBtn', handleLogout],
        ].forEach(([id, handler]) => on(byId(id), 'click', handler));

        [
            ['loginForm', handleLogin],
            ['registerForm', handleRegister],
            ['forgotPasswordForm', handleForgotPassword],
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
    on(input, 'keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        sendMessage();
    });

    filterTabs.forEach((tab) => {
        on(tab, 'click', () => {
            setActiveItem(filterTabs, tab);
            state.currentStatus = tab.dataset.status;
            renderStreamerCards();
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

            const enterBtn = event.target.closest('.enter-btn');
            if (enterBtn) {
                event.stopPropagation();
                const card = enterBtn.closest('.streamer-card');
                const url = card?.dataset?.url;
                const streamerId = Number(card?.dataset?.id);
                if (streamerId) {
                    ApiEndpoints.clickSaidao(streamerId).catch(() => {});
                }
                if (url) {
                    window.open(url, '_blank');
                }
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

            const avatarSection = event.target.closest('.avatar-section');
            if (avatarSection) {
                const card = avatarSection.closest('.streamer-card');
                const url = card?.dataset?.url;
                const streamerId = Number(card?.dataset?.id);
                if (streamerId) {
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
            destroyAllLotties();
            const container = document.getElementById('cardsGrid');
            container.innerHTML = '';

            const canEditTag = state.currentUser?.canEditSaidaoTag === true;
            const filteredStreamers = state.currentStatus === 'live'
                ? streamersData.filter(s => s.status === 'live' && !s.notificationEnabled)
                : streamersData;

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
                const card = document.createElement('div');
                card.className = 'streamer-card';
                card.dataset.id = streamer.id;
                card.dataset.url = streamer.url || '';
                card.dataset.tagEditable = canEditTag ? 'true' : 'false';
                card.innerHTML = `
                    <div class="${streamer.status === 'live' ? 'live-badge' : 'offline-badge'}">
                        ${streamer.status === 'live' ? '' : '未开播'}
                    </div>
                    <div class="avatar-section ${streamer.status === 'live' ? 'has-cover' : ''}">
                        ${streamer.status === 'live'
                                    ? `<div class="cover-container"></div>`
                                    : ''
                                }
                        <div class="avatar-stack">
                            <div class="avatar-frame">
                                <img src="${escapeHtml(streamer.avatar)}" alt="${escapeHtml(streamer.name)}" class="streamer-avatar">
                            </div>
                        </div>
                    </div>
                    <div class="card-content">
                        <div class="streamer-title-row">
                            <div class="streamer-name-heat-row">
                                <h3 class="streamer-name">${escapeHtml(streamer.name)}</h3>
                                ${streamer.status === 'live' && streamer.hotScore > 0
                                        ? `<span class="hot-indicator"><span class="hot-score-value">🔥${Math.ceil(streamer.hotScore)}</span></span>`
                                        : ''}
                            </div>
                            ${renderStreamerTag(streamer, canEditTag)}
                        </div>
                        <div class="streamer-info">
                            <div><i class="fas fa-satellite-dish"></i>渠道: ${escapeHtml(streamer.channel)}</div>
                            <div><i class="far fa-clock"></i>开播时间: ${escapeHtml(streamer.startTime)}</div>
                        </div>
                        <div class="card-actions">
                            <button class="btn btn-primary enter-btn" style="padding: 7px 14px; font-size: 13px;">进入直播间</button>
                            <div class="card-settings">
                                <button class="settings-btn">
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
                initLiveAnimations(card, streamer);
            });

            syncCardAnimationsWithChatState();
        }

        const LOTTIE_POOL = [];

        function initLiveAnimations(card, streamer) {
            if (!card || streamer.status !== 'live') return;

            const liveBadge = card.querySelector('.live-badge');
            if (liveBadge) {
                createLottie({
                    container: liveBadge,
                    renderer: 'canvas',
                    loop: true,
                    autoplay: false,
                    path: '/animation/Live.json'
                });
            }

            const cover = card.querySelector('.cover-container');
            if (cover) {
                const list = ['Background', 'Animated', 'florallanding', 'UnderwaterTurtle', 'Chinesenewyear', 'train'];
                const name = cover.dataset.bgAnim
                    || (cover.dataset.bgAnim = list[Math.floor(Math.random() * list.length)]);

                if (name === 'Chinesenewyear'  ) {
                    cover.style.backgroundColor = '#aa1414';
                }

                createLottie({
                    container: cover,
                    renderer: 'canvas',
                    loop: true,
                    autoplay: false,
                    path: `/animation/${name}.json`,
                    rendererSettings: {
                        clearCanvas: true,
                        progressiveLoad: true,
                        preserveAspectRatio: 'xMidYMid slice'
                    }
                });
            }
        }

        function createLottie(options) {
            const anim = lottie.loadAnimation(options);
            LOTTIE_POOL.push(anim);
            return anim;
        }

        function shouldPauseCardAnimations() {
            return state.isMobile && state.chatExpanded;
        }

        function syncCardAnimationsWithChatState() {
            const shouldPause = shouldPauseCardAnimations();

            LOTTIE_POOL.forEach((anim) => {
                if (!anim) return;

                if (shouldPause) {
                    anim.pause?.();
                } else {
                    anim.play?.();
                }
            });
        }

        function destroyAllLotties() {
            while (LOTTIE_POOL.length) {
                const anim = LOTTIE_POOL.pop();
                anim.destroy();
            }
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
            const sendBtn = byId('sendBtn');
            const chatInput = byId('chatInput');

            chatInput.disabled = false;
            chatInput.placeholder = '来嘟两句呗...';

            if (state.isLoggedIn) {
                loginBtn.style.display = 'none';
                userAvatar.style.display = 'block';
                userAvatar.src = state.currentUser.avatar;

                sendBtn.disabled = false;
            } else {
                loginBtn.style.display = 'flex';
                userAvatar.style.display = 'none';
                sendBtn.disabled = true;
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

            syncCardAnimationsWithChatState();
        }

        // 切换表情面板
        function toggleEmojiSection() {
            const emojiSection = byId('emojiSection');
            const emojiToggleIcon = $('i', byId('emojiToggle'));

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
            const emojiToggleIcon = $('i', byId('emojiToggle'));
            emojiSection.classList.remove('expanded');
            emojiToggleIcon.className = 'far fa-smile';
            state.emojiExpanded = false;
         }

        // 插入表情到聊天输入框
        function insertEmoji(emoji) {

            if (emoji && emoji.hasOwnProperty('clickSend') && emoji.clickSend) {
                const newMessage = {
                    type: 'chat',
                    content: `[${emoji.name}]`,
                };

                socket.send(JSON.stringify(newMessage));
                closeEmojiSection();
                return;
            }

            const chatInput = byId('chatInput');
            chatInput.value += `[${emoji.name}]`;
            chatInput.focus();
            const sendBtn = byId('sendBtn');
            sendBtn.disabled = false;
        }

        // 处理聊天输入
        function handleChatInput() {
            const sendBtn = byId('sendBtn');
            sendBtn.disabled = this.value.trim() === '';
        }

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

        function openRegisterModal() {
            openModal('registerModal');
        }

        function closeRegisterModal() {
            closeModal('registerModal');
        }

        function openForgotPasswordModal() {
            openModal('forgotPasswordModal');
        }

        function closeForgotPasswordModal() {
            closeModal('forgotPasswordModal');
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

            const card = document.querySelector(`.streamer-card[data-id="${saidaoId}"]`);
            if (card) {
                const cardStreamer = streamer || {
                    id: saidaoId,
                    name: card.querySelector('.streamer-name')?.textContent || '',
                    tag
                };
                const titleRow = card.querySelector('.streamer-title-row');
                if (titleRow) {
                    const canEditTag = state.currentUser?.canEditSaidaoTag === true;
                    const existingIndicator = titleRow.querySelector('.hot-indicator');
                    const hotHtml = existingIndicator ? `<span class="hot-indicator">${existingIndicator.innerHTML}</span>` : '';
                    titleRow.innerHTML = `
                        <div class="streamer-name-heat-row">
                            <h3 class="streamer-name">${escapeHtml(cardStreamer.name)}</h3>
                            ${hotHtml}
                        </div>
                        ${renderStreamerTag(cardStreamer, canEditTag)}
                    `;
                }
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

        function switchToRegister() {
            closeLoginModal();
            openRegisterModal();
        }

        function switchToLogin() {
            closeRegisterModal();
            openLoginModal();
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
            }
        }

        // 表单处理函数
        async function handleLogin(e) {
            e.preventDefault();

            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;

            if (!email || !password) {
                Toast.show('请输入邮箱和密码', 'warning');
                return;
            }

            const result = await ApiEndpoints.login({ email, password });
            const { token, user } = result.data;
            localStorage.setItem(TOKEN_KEY, token);
            Toast.show('登录成功', 'success');

            window.location.reload();

        }


        async function handleRegister(e) {
            e.preventDefault();

            const email = document.getElementById('registerEmail').value;
            const password = document.getElementById('registerPassword').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            const verificationCode = document.getElementById('verificationCode').value;

            if (password !== confirmPassword) {
                Toast.show('两次输入的密码不一致', 'error');
                return;
            }

            const result = await ApiEndpoints.register({ email, password, confirmPassword, verificationCode });
            const { token, user } = result.data;

            localStorage.setItem(TOKEN_KEY, token);
            Toast.show('注册成功', 'success')
            window.location.reload();

        }

        async function handleForgotPassword(e) {
            e.preventDefault();

            const email = document.getElementById('forgotEmail').value;
            const code = document.getElementById('forgotCode').value;
            const newPassword = document.getElementById('newPassword').value;

            const result = await ApiEndpoints.forgotPassword({ email, code, newPassword });
            if (result.code === '0') {
                Toast.show('密码重置成功', 'success');
                closeForgotPasswordModal();
                openLoginModal();
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

        async function sendVerificationCode() {
            const email = document.getElementById('registerEmail').value;
            if (!email) {
                alert('请输入邮箱地址');
                return;
            }

            const result = await ApiEndpoints.sendVerificationCode({ email, scene: 'register'});
            if (result.code === '0') {
                Toast.show('验证码发送成功', 'success');
            }

            const btn = document.getElementById('sendCodeBtn');
            btn.disabled = true;
            btn.textContent = '60秒后重试';

            let count = 60;
            const timer = setInterval(() => {
                count--;
                btn.textContent = count + '秒后重试';

                if (count <= 0) {
                    clearInterval(timer);
                    btn.disabled = false;
                    btn.textContent = '发送验证码';
                }
            }, 1000);

            console.log('发送验证码到:', email);
        }

        // 倒计时函数
        async function startCountdown(elementId) {
            const btn = document.getElementById(elementId);
            btn.disabled = true;
            btn.textContent = '60秒后重试';

            let count = 60;
            const timer = setInterval(() => {
                count--;
                btn.textContent = count + '秒后重试';

                if (count <= 0) {
                    clearInterval(timer);
                    btn.disabled = false;
                    btn.textContent = '发送验证码';
                }
            }, 1000);
        }

        async function sendForgotCode() {
            const email = document.getElementById('forgotEmail').value;
            if (!email) {
                Toast.show('请输入邮箱地址', 'error');
                return;
            }

            const result = await ApiEndpoints.sendVerificationCode({ email, scene: 'forgot_password'});
            if (result.code === '0') {
                Toast.show('验证码发送成功', 'success');
            }

            const btn = document.getElementById('sendForgotCodeBtn');
            btn.disabled = true;
            btn.textContent = '60秒后重试';

            let count = 60;
            const timer = setInterval(() => {
                count--;
                btn.textContent = count + '秒后重试';

                if (count <= 0) {
                    clearInterval(timer);
                    btn.disabled = false;
                    btn.textContent = '发送验证码';
                }
            }, 1000);

            console.log('发送找回密码验证码到:', email);
        }

        async function fetchStreamers() {

            const result = await ApiEndpoints.saidao();
            streamersData = result.data.map(item => ({
                id: item.id,
                name: item.name,
                channel: item.channel,
                startTime: item.startTime,
                status: item.status === 1 ? 'live' : 'ended',
                avatar: item.avatar,
                url: item.url,
                cover: item.cover,
                notificationEnabled: item.notShow,
                tag: item.tag || '',
                hotScore: item.hotScore || 0
            }));

            renderStreamerCards();
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
        const CHAT_STICKY_BOTTOM_THRESHOLD = 300;
        const CHAT_BOTTOM_SCROLL_EPSILON = 24;
        const renderedMessageIds = new Set();
        const observedChatNodes = new Set();
        let chatFollowMode = true;
        let chatScrollRaf = null;
        let chatResizeObserver = null;

        function isChatNearBottom(threshold = CHAT_STICKY_BOTTOM_THRESHOLD) {
            return container.scrollHeight - container.scrollTop - container.clientHeight <= threshold;
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

        function observeChatNode(node) {
            if (!chatResizeObserver || !node) {
                return;
            }

            chatResizeObserver.observe(node);
            observedChatNodes.add(node);
        }

        function unobserveChatNode(node) {
            if (!chatResizeObserver || !node) {
                return;
            }

            if (observedChatNodes.has(node)) {
                chatResizeObserver.unobserve(node);
                observedChatNodes.delete(node);
            }
        }

        function clearChatObservers() {
            if (!chatResizeObserver) {
                return;
            }

            observedChatNodes.forEach((node) => {
                chatResizeObserver.unobserve(node);
            });
            observedChatNodes.clear();
        }

        if (window.ResizeObserver) {
            chatResizeObserver = new ResizeObserver(() => {
                if (chatFollowMode) {
                    scheduleChatScrollToBottom();
                }
            });
        }

        function trimChatMessages() {
            // Unlimited chat history: keep all rendered messages.
        }

        function resetChatMessages() {
            container.querySelectorAll('.chat-message').forEach((messageElement) => {
                unobserveChatNode(messageElement);
                messageElement.remove();
            });
            renderedMessageIds.clear();
            hideNewMessageAlert();
            hideMentionAlert();
            closeMessageContextMenu();
            if (chatScrollRaf) {
                cancelAnimationFrame(chatScrollRaf);
                chatScrollRaf = null;
            }
        }

        function addMessageToChat(data, options = {}) {
            if (!trackRenderedMessage(data.messageId)) {
                return;
            }

            const shouldStickToBottom = options.stickToBottom ?? chatFollowMode;
            const suppressAlert = options.suppressAlert ?? false;
            const messageElement = document.createElement('div');
            messageElement.className = 'chat-message message-element';

            // 如果有引用回复，在消息上方添加引用块
            let quoteHTML = '';
            if (data.replyTo) {
                const replyContent = data.replyTo.content || '';
                const isImageQuote = /<img\b/i.test(replyContent);
                const quoteText = isImageQuote
                    ? replyContent.replace(
                        /<img\b([^>]*)>/i,
                        '<img$1 style="width:30%; height:30%; object-fit:contain; display:block;">'
                    )
                    : `${replyContent.substring(0, 50)}${replyContent.length > 50 ? '...' : ''}`;

                quoteHTML = `
                    <div class="message-quote" data-message-id="${data.replyTo.messageId}" style="
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

            messageElement.innerHTML = `
                <div class="avatar-container">
                    <img src="${data.avatar}" alt="${data.uname}" class="message-avatar" data-user-id="${data.uid}">
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
                    <div class="message-text">${processedContent}</div>
                    ${quoteHTML}
                </div>
            `;

            // 添加头像点击事件
            const avatar = messageElement.querySelector('.message-avatar');
            avatar.addEventListener('click', function () {
                console.log('点击头像，用户ID:', this.dataset.userId)
                showUserDetail(parseInt(this.dataset.userId));
            });

            container.appendChild(messageElement);
            observeChatNode(messageElement);
            trimChatMessages();

            // 判断是否是图片消息（chat-emoji vip）
            const messageText = messageElement.querySelector('.message-text');
            const imageEmoji = messageText.querySelector('img.chat-emoji.vip');

            if (imageEmoji) {
                // 标记为图片消息
                messageElement.classList.add('image-message');

                // 去掉气泡，只保留图片
                messageText.classList.add('image-only');
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

            // 绑定右键/长按菜单
            bindMessageContextMenu(messageElement, data);

            if (shouldStickToBottom) {
                scheduleChatScrollToBottom();
            } else if (!suppressAlert) {
                showNewMessageAlert();
            }
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

                container.appendChild(mentionAlert);
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
        let touchTimer = null;
        let currentContextMenuCloseHandler = null;

        // 主入口：绑定元素
        function bindMessageContextMenu(messageElement, messageData) {
            // PC 右键
            messageElement.addEventListener('contextmenu', function(e) {
                e.preventDefault();
                showMessageContextMenu(e, messageData);
            });

            // 移动端长按
            messageElement.addEventListener('touchstart', function(e) {
                const touch = e.touches && e.touches[0];
                if (!touch) return;
                const startX = touch.clientX;
                const startY = touch.clientY;
                if (touchTimer) clearTimeout(touchTimer);
                touchTimer = setTimeout(() => {
                    showMessageContextMenu(touch, messageData); // 使用第一个触点
                }, 500); // 500ms 长按
                messageElement._touchStart = { x: startX, y: startY };
            }, { passive: true });

            messageElement.addEventListener('touchmove', function(e) {
                const touch = e.touches && e.touches[0];
                if (!touch || !messageElement._touchStart) return;
                const dx = Math.abs(touch.clientX - messageElement._touchStart.x);
                const dy = Math.abs(touch.clientY - messageElement._touchStart.y);
                if (dx > 10 || dy > 10) {
                    clearTouchTimer();
                }
            }, { passive: true });

            messageElement.addEventListener('touchend', clearTouchTimer);
            messageElement.addEventListener('touchcancel', clearTouchTimer);

            function clearTouchTimer() {
                if (touchTimer) {
                    clearTimeout(touchTimer);
                    touchTimer = null;
                }
                messageElement._touchStart = null;
            }
        }

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

            // 悬停效果
            [copyItem, quoteItem, mentionItem, ...extraMenuItems].forEach(item => {
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


        const messageElements = document.querySelectorAll('.message-element');
        messageElements.forEach(el => {
            bindMessageContextMenu(el, {
                uname: el.dataset.uname,
                uid: el.dataset.uid,
                content: el.dataset.content
            });
        });

        // 全局状态，记录当前引用的消息
        let currentQuote = null;

        // 设置引用消息
        function setQuoteMessage(messageData) {
            currentQuote = {
                messageId: messageData.messageId,
                uid: messageData.uid,
                uname: messageData.uname,
                content: messageData.content
            };

            // 显示预览
            const preview = document.getElementById('quotePreview');
            preview.innerHTML = `
                <div class="quote-preview-content">
                    <div class="quote-header">
                        <span style="font-weight:500; color: var(--primary-color);">引用 ${messageData.uname}:</span>
                        <button class="quote-cancel-btn"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="quote-text">${escapeHtml(messageData.content.substring(0, 50))}${messageData.content.length > 50 ? '...' : ''}</div>
                </div>
            `;
            preview.style.display = 'block';

            // 点击关闭按钮取消引用
            preview.querySelector('.quote-cancel-btn').addEventListener('click', clearQuote);

            // 输入框自动聚焦并填入 @username
            const chatInput = document.getElementById('chatInput');
            chatInput.value = `@${messageData.uname} `;
            chatInput.focus();
            document.getElementById('sendBtn').disabled = false;
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
            chatInput.focus();
            document.getElementById('sendBtn').disabled = false;
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

        function addSystemMessageToChat(data, options = {}) {
            const messageElement = document.createElement('div');
            messageElement.className = 'chat-message system-message';
            const shouldStickToBottom = options.stickToBottom ?? chatFollowMode;
            const suppressAlert = options.suppressAlert ?? false;

            messageElement.innerHTML = `
            <div class="system-content">
                <div class="system-text">${data.content}</div>
                ${data.timestamp ? `<span class="message-time">${data.timestamp}</span>` : ''}
            </div>
        `;

            container.appendChild(messageElement);
            observeChatNode(messageElement);
            trimChatMessages();

            if (shouldStickToBottom) {
                scheduleChatScrollToBottom();
            } else if (!suppressAlert) {
                showNewMessageAlert();
            }
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

                // 添加到容器
                container.appendChild(newMessageAlert)
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

        // 监听容器滚动，当用户滚动到底部时隐藏提示
        container.addEventListener('scroll', function() {
            syncChatFollowMode();
        });

        async function setupWebSocket() {
            clearChatReconnectTimer();
            closeChatSocket({ preventReconnect: true });

            const token = localStorage.getItem(TOKEN_KEY);
            const fp = await getFingerprint();

            const currentSocket = new WebSocket(`${WS_BASE_URL}/ws/chat?token=${encodeURIComponent(token)}&fp=${fp}`);
            socket = currentSocket;

            currentSocket.addEventListener('open', () => {
                if (socket !== currentSocket) return;
                console.log('WebSocket连接已建立');
            });

            currentSocket.addEventListener('message', (event) => {
                if (socket !== currentSocket) return;
                const data = JSON.parse(event.data);

                if (data.type === 'user') {
                    // 添加消息到聊天室
                    addMessageToChat(data);
                } else if (data.type === 'history') {
                    resetChatMessages();
                    // 添加消息到聊天室
                    data.messages.forEach(msg => {
                        if (msg.type === 'status') {
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
                } else if (data.type === 'status') {
                    addSystemMessageToChat(data);
                    fetchStreamers()
                } else if (data.type === 'saidaoTagUpdated') {
                    applySaidaoTagUpdate(data);
                } else if (data.type === 'hotScoreUpdate') {
                    applyHotScoreUpdate(data.scores);
                } else if (data.type === 'clear') {
                    resetChatMessages();
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
            clearChatObservers();
        });

        // 发送消息
        function sendMessage() {
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

            socket.send(JSON.stringify(newMessage));

            chatInput.value = '';
            document.getElementById('sendBtn').disabled = true;
            clearQuote();
            closeEmojiSection();
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

        if (!window.__LIMITED_MOTION__) {
            lottie.loadAnimation({
                container: document.getElementById('logo-container'),
                renderer: 'canvas',
                loop: true,
                autoplay: true,
                path: '/animation/SpringFestival.json'
            });
        }

        let loadingAnimation = null;

        function initLoading() {
            if (window.__LIMITED_MOTION__) return;
            if (loadingAnimation) return;

            loadingAnimation = lottie.loadAnimation({
                container: document.getElementById('lottie-container'),
                renderer: 'canvas',
                loop: true,
                autoplay: false,
                path: '/animation/SandyLoading.json'
            });
        }

        function showLoading() {
            initLoading();
            if (!loadingAnimation) return;
            document.getElementById('global-loading').style.display = 'flex';
            loadingAnimation.play();
        }

        function hideLoading() {
            document.getElementById('global-loading').style.display = 'none';
            if (!loadingAnimation) return;
            loadingAnimation.stop();
        }

        let isImagePreviewOpen = false;
        function showImagePreview(src) {

            if (isImagePreviewOpen) return;
            isImagePreviewOpen = true;

            // 创建遮罩层
            let preview = document.createElement("div");
            preview.className = "image-preview-overlay";
            preview.innerHTML = `
                <div class="image-preview-content">
                    <img src="${src}" alt="preview">
                </div>
            `;
            document.body.appendChild(preview);

            const img = preview.querySelector('img');

            // 设置图片的样式
            img.style.maxWidth = "80vw";
            img.style.maxHeight = "80vh";
            img.style.objectFit = "contain";
            img.style.display = "block";
            img.style.margin = "auto"; // 居中显示

            // 点击遮罩层区域时，关闭预览
            preview.addEventListener("click", (e) => {
                if (e.target === preview) {
                    document.body.removeChild(preview);
                    isImagePreviewOpen = false;
                }
            });
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

        let captchaId = '';
        let currentScene = ''; // 'register' 或 'forgot'
        let currentEmail = '';
        const sceneBtnMap = {
            forgot_password: 'sendForgotCodeBtn',
            register: 'sendCodeBtn'
        };

        // 显示图形验证码模态框
        async function showCaptchaModal(scene, email) {
            currentScene = scene;
            currentEmail = email;

            // 获取验证码
            const result = await ApiEndpoints.getCaptcha({ type: 'digit' });
            if (result.code === '0') {
                document.getElementById('captchaCode').value = '';
                captchaId = result.data.captchaId;
                document.getElementById('captchaImage').src = result.data.base64Image;
                document.getElementById('captchaModal').style.display = 'block';
            } else {
                Toast.show('获取验证码失败', 'error');
            }
        }

        // 隐藏验证码模态框
        function hideCaptchaModal() {
            document.getElementById('captchaModal').style.display = 'none';
        }

        // 确认验证码
        async function confirmCaptcha() {
            const captchaValue = document.getElementById('captchaCode').value.trim();
            if (!captchaValue) {
                Toast.show('请输入验证码', 'error');
                return;
            }

            hideCaptchaModal();

            // 发送验证码
            const result = await ApiEndpoints.sendVerificationCode({
                email: currentEmail,
                scene: currentScene,
                captchaId: captchaId,
                captchaValue: captchaValue
            });

            if (result.code === '0') {
                await startCountdown(sceneBtnMap[currentScene])
                Toast.show('验证码发送成功', 'success');
            } else {
                Toast.show(result.message || '发送失败', 'error');
            }

        }

        // 注册发送验证码按钮点击
        document.getElementById('sendCodeBtn').onclick = async function() {
            const email = document.getElementById('registerEmail').value.trim();
            if (!email) {
                Toast.show('请输入邮箱地址', 'error');
                return;
            }
            await showCaptchaModal('register', email);
        };

        // 忘记密码发送验证码按钮点击
        document.getElementById('sendForgotCodeBtn').onclick = async function() {
            const email = document.getElementById('forgotEmail').value.trim();
            if (!email) {
                Toast.show('请输入邮箱地址', 'error');
                return;
            }
            await showCaptchaModal('forgot_password', email);
        };

        // 验证码图片点击刷新
        document.getElementById('captchaImage').onclick = async function() {
            const result = await ApiEndpoints.getCaptcha({ type: 'digit' });
            if (result.code === '0') {
                captchaId = result.data.captchaId;
                document.getElementById('captchaImage').src = result.data.base64Image;
                document.getElementById('captchaCode').value = '';
            }
        };

        // 确认按钮点击
        document.getElementById('confirmCaptchaBtn').onclick = confirmCaptcha;

        // 关闭按钮点击
        // document.getElementById('closeCaptchaModal').onclick = hideCaptchaModal;

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


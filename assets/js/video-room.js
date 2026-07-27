/**
 * 视频点播室管理器
 */
(function(global) {
    'use strict';

    const VideoRoomManager = {
        // 状态
        currentVideoId: null,
        currentVideoUrl: null,
        currentVideoDuration: 0,
        currentVideo: null,
        playStartTime: 0,
        playlist: [],
        votingList: [],
        userVotes: new Map(), // videoRequestId -> 'approve' | 'reject'
        votingCountdownTimer: null,
        votingTimeoutRefreshAt: 0,
        
        // DOM 元素
        videoPlayer: null,
        videoRoomEmpty: null,
        playlistContainer: null,
        votingContainer: null,
        bvidInput: null,
        submitButton: null,
        userVotesStorageKey: 'video-room-votes',
        
        // 初始化
        init() {
            this.videoPlayer = document.getElementById('videoRoomPlayer');
            this.videoRoomEmpty = document.getElementById('videoRoomEmpty');
            this.playlistContainer = document.getElementById('videoPlaylist');
            this.votingContainer = document.getElementById('videoVoting');
            this.bvidInput = document.getElementById('bvidInput');
            this.submitButton = document.getElementById('submitBvid');
            
            if (!this.videoPlayer || !this.playlistContainer || !this.votingContainer) {
                console.warn('视频点播室 DOM 元素未找到');
                return;
            }
            
            this.loadUserVotes();
            this.setupEventListeners();
            this.fetchList();
        },
        
        // 设置事件监听
        setupEventListeners() {
            // 提交 BV 号
            if (this.submitButton) {
                this.submitButton.addEventListener('click', () => this.handleSubmit());
            }
            
            // 回车提交
            if (this.bvidInput) {
                this.bvidInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        this.handleSubmit();
                    }
                });
            }

            [this.playlistContainer, this.votingContainer].forEach(container => {
                container?.addEventListener('click', event => this.openBilibiliVideo(event));
            });
            
            // 视频播放器事件
            if (this.videoPlayer) {
                this.videoPlayer.addEventListener('error', () => {
                    const err = this.videoPlayer.error;
                    // src 为空时不报错（切换视频/停止时会触发）
                    if (!this.videoPlayer.src || !err) return;
                    
                    const codeMap = {
                        1: '加载被中断',
                        2: '网络错误',
                        3: '解码失败',
                        4: '视频源不支持或无法访问'
                    };
                    console.error('视频加载错误:', codeMap[err.code] || '未知错误', err);
                    global.Toast?.show('视频加载失败：' + (codeMap[err.code] || '未知错误'), 'error');
                });
                
                this.videoPlayer.addEventListener('ended', () => {
                    console.log('视频播放结束');
                });
            }

            this.startVotingCountdown();
        },
        
        // 提交 BV 号
        async handleSubmit() {
            const bvid = this.bvidInput?.value?.trim();
            if (!bvid) {
                global.Toast?.show('请输入BV号', 'warning');
                return;
            }
            
            // 简单校验 BV 号格式
            if (!bvid.startsWith('BV') || bvid.length < 10) {
                global.Toast?.show('BV号格式不正确', 'error');
                return;
            }
            
            try {
                this.submitButton.disabled = true;
                this.submitButton.textContent = '提交中...';
                
                await global.ApiEndpoints.videoRequestSubmit({ bvid });
                
                global.Toast?.show('视频已提交，进入投票环节', 'success');
                this.bvidInput.value = '';
                
                // 刷新列表
                setTimeout(() => this.fetchList(), 500);
            } catch (e) {
                global.Toast?.show(e.message || '提交失败', 'error');
            } finally {
                this.submitButton.disabled = false;
                this.submitButton.textContent = '提交点播';
            }
        },
        
        // 投票
        async vote(videoRequestId, voteType) {
            try {
                await global.ApiEndpoints.videoRequestVote({ videoRequestId, voteType });
                
                // 记录本地投票状态
                this.userVotes.set(videoRequestId, voteType);
                this.persistUserVote(videoRequestId, voteType);
                
                global.Toast?.show('投票成功', 'success');
                
                // 重新渲染投票列表
                this.renderVotingList();
            } catch (e) {
                global.Toast?.show(e.message || '投票失败', 'error');
            }
        },
        
        // 获取列表
        async fetchList() {
            try {
                const result = await global.ApiEndpoints.videoRequestList();
                const data = result?.data || {};
                
                this.playlist = data.playlist || [];
                this.votingList = data.voting || [];
                this.currentVideo = data.current || null;
                
                this.renderPlaylist();
                this.renderVotingList();
                this.startVotingCountdown();
                
                // 如果有当前播放的视频，但本地没有播放，则开始播放
                if (data.current && this.currentVideoId !== data.current.id) {
                    // 播放位置由服务端下发的 currentTime 决定
                    this.playVideo(
                        data.current.id,
                        data.current.videoUrl,
                        data.current.duration,
                        data.currentTime || 0
                    );
                }
            } catch (e) {
                console.error('获取视频列表失败', e);
            }
        },
        
        // 渲染播放列表
        renderPlaylist() {
            const items = this.currentVideo
                ? [this.currentVideo, ...this.playlist.filter(item => item.id !== this.currentVideo.id)]
                : this.playlist;
            const count = items.length;
            document.getElementById('playlistCount').textContent = count;
            
            if (count === 0) {
                this.playlistContainer.innerHTML = '<div class="empty-hint">播放队列为空</div>';
                return;
            }
            
            this.playlistContainer.innerHTML = items.map((item, index) => {
                const isPlaying = this.currentVideo && item.id === this.currentVideo.id;
                return `
                <div class="video-playlist-item${isPlaying ? ' is-playing' : ''}" data-id="${item.id}" data-bvid="${this.escapeAttr(item.bvid)}">
                    <div class="video-rank">${index + 1}</div>
                    <div class="video-cover-wrap">
                        <img class="video-cover" src="${this.escapeAttr(item.coverUrl)}" alt="${this.escapeAttr(item.title)}">
                        ${isPlaying ? '<span class="video-playing-badge"><i class="fas fa-play"></i> 播放中</span>' : ''}
                    </div>
                    <div class="video-info">
                        <div class="video-title">${this.escapeHtml(item.title)}</div>
                        <div class="video-meta">
                            <span>${this.escapeHtml(item.uploaderName)}</span>
                            <span>${this.formatDuration(item.duration)}</span>
                        </div>
                        <div class="video-requester">点播：${this.escapeHtml(item.requesterName)}</div>
                    </div>
                </div>
                `;
            }).join('');
        },
        
        // 渲染投票列表
        renderVotingList() {
            const count = this.votingList.length;
            document.getElementById('votingCount').textContent = count;
            
            if (count === 0) {
                this.votingContainer.innerHTML = '<div class="empty-hint">暂无投票中的视频</div>';
                return;
            }
            
            this.votingContainer.innerHTML = this.votingList.map(item => {
                const userVote = this.userVotes.get(item.id);
                const hasVoted = !!userVote;
                
                return `
                    <div class="video-voting-item" data-id="${item.id}" data-bvid="${this.escapeAttr(item.bvid)}">
                        <img class="video-cover" src="${this.escapeAttr(item.coverUrl)}" alt="${this.escapeAttr(item.title)}">
                        <div class="video-info">
                            <div class="video-title">${this.escapeHtml(item.title)}</div>
                            <div class="video-meta">
                                <span>${this.escapeHtml(item.uploaderName)}</span>
                                <span>${this.formatDuration(item.duration)}</span>
                            </div>
                            <div class="video-requester">点播：${this.escapeHtml(item.requesterName)}</div>
                            <div class="video-vote-stats">
                                <span class="vote-approve">👍 ${item.voteApprove}</span>
                                <span class="vote-reject">👎 ${item.voteReject}</span>
                                <span class="vote-time">${this.formatTimeLeft(item.votingStartAt)}</span>
                            </div>
                        </div>
                        <div class="video-vote-actions">
                            ${hasVoted ? `
                                <div class="voted-badge">已投${userVote === 'approve' ? '赞成' : '反对'}</div>
                            ` : `
                                <button class="btn-vote btn-approve" onclick="VideoRoomManager.vote(${item.id}, 'approve')">赞成</button>
                                <button class="btn-vote btn-reject" onclick="VideoRoomManager.vote(${item.id}, 'reject')">反对</button>
                            `}
                        </div>
                    </div>
                `;
            }).join('');
        },

        openBilibiliVideo(event) {
            if (event.target.closest('button')) return;

            const item = event.target.closest('[data-bvid]');
            const bvid = item?.dataset.bvid;
            if (!bvid) return;

            window.open(`https://www.bilibili.com/video/${encodeURIComponent(bvid)}/`, '_blank', 'noopener,noreferrer');
        },

        startVotingCountdown() {
            if (this.votingCountdownTimer) {
                clearInterval(this.votingCountdownTimer);
                this.votingCountdownTimer = null;
            }

            if (!this.votingList.length) return;

            this.votingCountdownTimer = setInterval(() => {
                if (!this.votingList.length) {
                    clearInterval(this.votingCountdownTimer);
                    this.votingCountdownTimer = null;
                    return;
                }

                // 只更新倒计时文本，避免重建列表导致封面图片重复加载。
                this.votingContainer.querySelectorAll('.video-voting-item').forEach(itemElement => {
                    const item = this.votingList.find(votingItem => String(votingItem.id) === itemElement.dataset.id);
                    const timeElement = itemElement.querySelector('.vote-time');
                    if (item && timeElement) {
                        timeElement.textContent = this.formatTimeLeft(item.votingStartAt);
                    }
                });

                if (this.votingList.some(item => {
                    const secondsLeft = this.getVotingSecondsLeft(item.votingStartAt);
                    return secondsLeft !== null && secondsLeft <= 0;
                }) && Date.now() - this.votingTimeoutRefreshAt >= 5000) {
                    this.votingTimeoutRefreshAt = Date.now();
                    this.fetchList();
                }
            }, 1000);
        },
        
        // 播放视频
        playVideo(videoRequestId, videoUrl, duration, currentTime) {
            const sourceUrl = typeof videoUrl === 'string' ? videoUrl.trim() : '';
            if (!sourceUrl) {
                console.error('视频 URL 为空，无法播放');
                global.Toast?.show('视频地址无效', 'error');
                return;
            }

            this.currentVideoId = videoRequestId;
            this.currentVideoUrl = sourceUrl;
            this.currentVideoDuration = duration;

            // 隐藏"暂无正在播放的视频"提示，显示播放器
            if (this.videoRoomEmpty) this.videoRoomEmpty.hidden = true;
            if (!this.videoPlayer) {
                console.error('videoPlayer 元素不存在');
                return;
            }

            const player = this.videoPlayer;
            player.hidden = false;
            // 先清理旧媒体状态，再加载新的带签名 URL，避免复用旧的 MediaSource 状态。
            player.pause();
            player.removeAttribute('src');
            player.load();
            player.src = sourceUrl;
            player.load();

            const seekTo = () => {
                // seek 到服务端下发的进度（超出时长则忽略）
                if (Number.isFinite(currentTime) && currentTime > 0
                    && Number.isFinite(player.duration) && player.duration > currentTime) {
                    player.currentTime = currentTime;
                }

                // 自动播放降级：有声 → 静音 → 等用户手动点击
                player.muted = false;
                player.play()
                    .catch(() => {
                        player.muted = true;
                        return player.play();
                    })
                    .catch(e => {
                        console.warn('自动播放失败，等待用户手动点击播放:', e && e.name);
                    });

                player.removeEventListener('loadedmetadata', seekTo);
            };
            player.addEventListener('loadedmetadata', seekTo);
        },
        
        // 同步播放进度（已移除，不再需要）
        syncProgress(videoRequestId, serverTime) {
            // 功能已移除
        },
        
        // 停止播放
        stopVideo() {
            this.currentVideoId = null;
            this.currentVideoUrl = null;
            this.currentVideo = null;
            
            if (this.videoPlayer) {
                this.videoPlayer.pause();
                this.videoPlayer.src = '';
                this.videoPlayer.hidden = true;
            }
            
            if (this.videoRoomEmpty) {
                this.videoRoomEmpty.hidden = false;
            }

            this.renderPlaylist();
        },

        // 处理 WebSocket 消息
        handleWsMessage(data) {
            switch (data.type) {
                case 'videoVoting':
                    // 新视频进入投票
                    this.votingList.unshift(data.videoRequest);
                    if (this.votingList.length > 10) {
                        this.votingList.pop();
                    }
                    this.renderVotingList();
                    global.Toast?.show(`新视频《${data.videoRequest.title}》进入投票`, 'info');
                    break;
                    
                case 'videoVoteUpdate':
                    // 投票数更新
                    const voting = this.votingList.find(v => v.id === data.videoRequestId);
                    if (voting) {
                        voting.voteApprove = data.voteApprove;
                        voting.voteReject = data.voteReject;
                        this.renderVotingList();
                    }
                    break;
                    
                case 'videoApproved':
                    // 视频投票通过，加入播放列表
                    this.fetchList();
                    setTimeout(() => this.fetchList(), 500);
                    global.Toast?.show(`视频《${data.videoRequest.title}》投票通过`, 'success');
                    break;
                    
                case 'videoRejected':
                    // 视频投票被拒绝
                    this.fetchList();
                    break;
                    
                case 'videoPlay':
                    // 开始播放视频
                    // 部分旧消息不携带 URL，交给列表接口获取当前视频的真实地址。
                    if (data.videoUrl || data.url) {
                        this.playVideo(data.videoRequestId, data.videoUrl || data.url, data.duration, data.currentTime);
                    } else {
                        this.currentVideoId = null;
                    }
                    global.Toast?.show(`正在播放：${data.title}`, 'success');
                    this.fetchList(); // 更新列表
                    break;
                    
                case 'videoSync':
                    // 已移除进度同步功能
                    break;
                    
                case 'videoPlayEnd':
                    // 播放队列为空
                    this.stopVideo();
                    break;
                    
                case 'videoFailed':
                    // 视频播放失败
                    global.Toast?.show(`视频《${data.title}》播放失败`, 'error');
                    break;
                    
                case 'videoSkipped':
                    // 管理员跳过
                    global.Toast?.show(`视频《${data.title}》已被跳过`, 'info');
                    this.fetchList();
                    break;
                    
                case 'videoDeleted':
                    // 管理员删除
                    global.Toast?.show(`视频《${data.title}》已被删除`, 'info');
                    this.fetchList();
                    break;
            }
        },
        
        // 工具方法：格式化时长
        formatDuration(seconds) {
            if (!seconds) return '0:00';
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        },
        
        // 工具方法：格式化剩余时间
        formatTimeLeft(votingStartAt) {
            const left = this.getVotingSecondsLeft(votingStartAt);
            if (left === null) return '计算中';
            
            if (left <= 0) return '即将结束';
            
            const mins = Math.floor(left / 60);
            const secs = left % 60;
            return `剩余 ${mins}:${secs.toString().padStart(2, '0')}`;
        },

        getVotingSecondsLeft(votingStartAt) {
            if (!votingStartAt) return null;

            const startTime = new Date(votingStartAt).getTime();
            if (!Number.isFinite(startTime)) return null;

            return Math.max(0, Math.ceil((startTime + 2 * 60 * 1000 - Date.now()) / 1000));
        },

        loadUserVotes() {
            try {
                const storedVotes = JSON.parse(localStorage.getItem(this.userVotesStorageKey) || '{}');
                Object.entries(storedVotes).forEach(([videoRequestId, voteType]) => {
                    if (voteType === 'approve' || voteType === 'reject') {
                        this.userVotes.set(Number(videoRequestId), voteType);
                    }
                });
            } catch (e) {
                console.warn('读取本地投票记录失败', e);
            }
        },

        persistUserVote(videoRequestId, voteType) {
            try {
                const storedVotes = JSON.parse(localStorage.getItem(this.userVotesStorageKey) || '{}');
                storedVotes[videoRequestId] = voteType;
                localStorage.setItem(this.userVotesStorageKey, JSON.stringify(storedVotes));
            } catch (e) {
                console.warn('保存本地投票记录失败', e);
            }
        },
        
        // 工具方法：转义 HTML
        escapeHtml(text) {
            if (!text) return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        },
        
        // 工具方法：转义属性值
        escapeAttr(text) {
            if (!text) return '';
            return text.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        }
    };
    
    // 导出到全局
    global.VideoRoomManager = VideoRoomManager;
    
})(window);

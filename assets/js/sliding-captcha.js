(function (global) {
    let activePromise = null;

    function requestCaptcha(fp) {
        const { API_BASE_URL } = global.SaidaoConfig;
        return fetch(`${API_BASE_URL}/captcha/slider`, {
            headers: { Accept: 'application/json', fp },
            credentials: 'include'
        }).then(readResponse);
    }

    function verifyCaptcha(fp, challengeId, x) {
        const { API_BASE_URL } = global.SaidaoConfig;
        return fetch(`${API_BASE_URL}/captcha/slider/verify`, {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json', fp },
            credentials: 'include',
            body: JSON.stringify({ challengeId, x })
        }).then(readResponse);
    }

    async function readResponse(response) {
        const result = await response.json();
        if (!response.ok || result.code !== '0') {
            throw new Error(result.message || '滑动验证失败');
        }
        return result.data;
    }

    function getTicket(fp) {
        console.log('[SlidingCaptcha] getTicket 被调用, fp:', fp);
        if (!activePromise) {
            console.log('[SlidingCaptcha] 创建新的验证码流程');
            activePromise = runCaptcha(fp).finally(() => {
                console.log('[SlidingCaptcha] 验证码流程结束');
                activePromise = null;
            });
        } else {
            console.log('[SlidingCaptcha] 使用现有的验证码流程');
        }
        return activePromise;
    }

    async function runCaptcha(fp) {
        console.log('[SlidingCaptcha] runCaptcha 开始, fp:', fp);
        const challenge = await requestCaptcha(fp);
        console.log('[SlidingCaptcha] 获取到 challenge:', challenge);
        if (!challenge || !challenge.challengeId) {
            console.log('[SlidingCaptcha] 验证码已禁用，返回 bypass');
            return 'bypass';
        }
        if (!Number.isFinite(Number(challenge.pieceY))) {
            throw new Error('滑动验证码服务版本过旧，请重启后端服务');
        }
        console.log('[SlidingCaptcha] 创建验证码弹窗');
        const root = document.createElement('div');
        root.className = 'sliding-captcha-overlay';
        root.innerHTML = `
            <div class="sliding-captcha-dialog" role="dialog" aria-modal="true" aria-label="滑动验证">
                <div class="sliding-captcha-header">
                    <strong>完成滑动验证</strong>
                    <span>拖动滑块完成拼图</span>
                </div>
                <div class="sliding-captcha-board">
                    <img class="sliding-captcha-background" alt="滑动验证码背景">
                    <img class="sliding-captcha-piece" alt="滑块">
                </div>
                <div class="sliding-captcha-track">
                    <div class="sliding-captcha-progress"></div>
                    <button class="sliding-captcha-handle" type="button" aria-label="拖动滑块">›</button>
                    <span class="sliding-captcha-hint">向右拖动滑块</span>
                </div>
                <div class="sliding-captcha-status" role="status"></div>
            </div>`;
        document.body.appendChild(root);

        const board = root.querySelector('.sliding-captcha-board');
        const background = root.querySelector('.sliding-captcha-background');
        const piece = root.querySelector('.sliding-captcha-piece');
        const track = root.querySelector('.sliding-captcha-track');
        const progress = root.querySelector('.sliding-captcha-progress');
        const handle = root.querySelector('.sliding-captcha-handle');
        const hint = root.querySelector('.sliding-captcha-hint');
        const status = root.querySelector('.sliding-captcha-status');
        background.src = challenge.background;
        piece.src = challenge.piece;

        await new Promise((resolve) => {
            if (background.complete) resolve();
            else background.addEventListener('load', resolve, { once: true });
        });

        const maxDisplayX = Math.max(1, board.clientWidth - piece.offsetWidth);
        const scale = challenge.width / board.clientWidth;
        piece.style.inset = 'auto';
        piece.style.left = '0px';
        piece.style.top = `${Number(challenge.pieceY) * board.clientHeight / challenge.height}px`;
        let dragging = false;
        let startX = 0;
        let currentX = 0;

        return new Promise((resolve) => {
            const move = (event) => {
                if (!dragging) return;
                currentX = Math.max(0, Math.min(maxDisplayX, event.clientX - startX));
                piece.style.transform = `translateX(${currentX}px)`;
                handle.style.transform = `translateX(${currentX}px)`;
                progress.style.width = `${currentX + handle.offsetWidth / 2}px`;
                hint.hidden = true;
            };

            const end = async () => {
                if (!dragging) return;
                dragging = false;
                document.removeEventListener('pointermove', move);
                document.removeEventListener('pointerup', end);
                handle.disabled = true;
                status.textContent = '正在验证...';
                try {
                    const ticket = await verifyCaptcha(fp, challenge.challengeId, Math.round(currentX * scale));
                    status.textContent = '验证成功';
                    root.classList.add('is-success');
                    setTimeout(() => root.remove(), 180);
                    resolve(ticket);
                } catch (error) {
                    status.textContent = error.message || '验证失败，请重试';
                    root.classList.add('is-failed');
                    setTimeout(() => root.remove(), 500);
                    resolve(await runCaptcha(fp));
                }
            };

            handle.addEventListener('pointerdown', (event) => {
                dragging = true;
                startX = event.clientX - currentX;
                handle.setPointerCapture?.(event.pointerId);
                document.addEventListener('pointermove', move);
                document.addEventListener('pointerup', end, { once: true });
            });
        });
    }

    global.SlidingCaptcha = { getTicket };
    console.log('[SlidingCaptcha] 模块已加载，getTicket 已绑定到 window.SlidingCaptcha');
})(window);

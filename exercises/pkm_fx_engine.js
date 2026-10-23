/**
 * PKM FX Engine - Trình quản lý hiệu ứng kỹ năng chiến đấu Pokémon chuyên biệt
 */
const FXEngine = {
    /**
     * Khởi tạo và kích hoạt hiệu ứng Lốc xoáy tại mục tiêu (3D Whirlwind)
     * @param {HTMLElement} targetEl - DOM Element của Pokémon bị tấn công
     * @param {number} duration - Thời gian duy trì hiệu ứng (ms)
     */
    async spawnTornado(targetEl, duration = 2000) {
        if (!targetEl) return;

        let viewport = document.querySelector('.fx-viewport');
        if (!viewport) {
            viewport = document.createElement('div');
            viewport.className = 'fx-viewport';
            (document.getElementById('arena') || document.body).appendChild(viewport);
        }

        const rect = targetEl.getBoundingClientRect();
        const arenaRect = viewport.getBoundingClientRect();

        const core = document.createElement('div');
        core.className = 'tornado-core';
        core.style.left = `${rect.left - arenaRect.left + rect.width / 2}px`;
        core.style.top = `${rect.bottom - arenaRect.top}px`; 
        viewport.appendChild(core);

        setTimeout(() => {
            const arenaContainer = document.getElementById('arena') || document.body;
            arenaContainer.classList.add('arena-quake');
            setTimeout(() => arenaContainer.classList.remove('arena-quake'), duration - 400);
        }, 200);

        const totalParticles = 75;
        const spawnInterval = duration / totalParticles;
        let spawnedCount = 0;

        const spawner = setInterval(() => {
            if (spawnedCount >= totalParticles) {
                clearInterval(spawner);
                return;
            }

            const particle = document.createElement('div');
            particle.className = 'tornado-wind-particle';

            const startRadius = Math.random() * 15 + 10;
            const endRadius = Math.random() * 90 + 70;
            const riseHeight = -(Math.random() * 180 + 260);
            const rotateDeg = (Math.random() > 0.5 ? 1 : -1) * (Math.random() * 720 + 1080);
            const maxOpacity = Math.random() * 0.3 + 0.6;
            const endScale = Math.random() * 1.8 + 1.2;

            particle.style.setProperty('--start-radius', `${startRadius}px`);
            particle.style.setProperty('--end-radius', `${endRadius}px`);
            particle.style.setProperty('--rise-height', `${riseHeight}px`);
            particle.style.setProperty('--rotate-deg', `${rotateDeg}deg`);
            particle.style.setProperty('--max-opacity', maxOpacity);
            particle.style.setProperty('--end-scale', endScale);

            const particleLifetime = Math.random() * 500 + 900;
            particle.style.animationDuration = `${particleLifetime}ms`;

            core.appendChild(particle);
            spawnedCount++;

            setTimeout(() => particle.remove(), particleLifetime);
        }, spawnInterval);

        return new Promise((resolve) => {
            setTimeout(() => {
                core.remove();
                resolve();
            }, duration + 800);
        });
    },

    /**
     * Khởi tạo và kích hoạt hiệu ứng Bị Đốt dạng mảng lửa CHÁY TẠI CHỖ (Rooted Roaring Anime Flames)
     * @param {HTMLElement} targetEl - DOM Element của Pokémon dính chiêu đốt lửa
     * @param {number} duration - Thời gian duy trì hiệu ứng bốc cháy (ms)
     */
    async spawnBurn(targetEl, duration = 2500) {
        if (!targetEl) return;

        if (window.getComputedStyle(targetEl).position === 'static') {
            targetEl.style.position = 'relative';
        }

        const container = document.createElement('div');
        container.className = 'pkm-flame-container';

        container.innerHTML = `
            <div class="pkm-flame-soft-glow"></div>
            <div class="pkm-flame-morph">
                <svg viewBox="0 0 160 220" style="width:100%; height:100%; overflow:visible;">
                    <defs>
                        <!-- Gradient lớp ngoài: Đỏ cam nhạt dịu mắt -->
                        <linearGradient id="outerFlameGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stop-color="#F26330" />
                            <stop offset="100%" stop-color="#D94A1B" />
                        </linearGradient>

                        <!-- Gradient lõi trong: Trắng nhạt hòa quyện với Cam nhạt (kem ấm) -->
                        <linearGradient id="innerCoreGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stop-color="#FFFDF9" />
                            <stop offset="45%" stop-color="#FFF2E3" />
                            <stop offset="100%" stop-color="#FFDFC2" />
                        </linearGradient>

                        <!-- Bộ lọc mép lửa gợn sóng mượt mà tự nhiên -->
                        <filter id="smooth-fire-warp" x="-20%" y="-20%" width="140%" height="140%">
                            <feTurbulence type="fractalNoise" baseFrequency="0.018 0.035" numOctaves="2" result="noise">
                                <animate attributeName="baseFrequency" dur="0.6s" values="0.015 0.03; 0.025 0.05; 0.015 0.03" repeatCount="indefinite" />
                            </feTurbulence>
                            <feDisplacementMap in="SourceGraphic" in2="noise" scale="7" xChannelSelector="R" yChannelSelector="G" />
                        </filter>
                    </defs>

                    <g filter="url(#smooth-fire-warp)">
                        <!-- LỚP 1 (NGOÀI): ĐỎ CAM NHẠT VỚI VIỀN ĐỎ CAM TRẦM -->
                        <path d="M 80,210 
                                 C 35,200 15,160 25,115 
                                 C 30,80 15,50 45,15 
                                 C 60,35 70,60 85,80 
                                 C 100,40 120,15 135,35 
                                 C 145,65 130,95 145,125 
                                 C 155,165 130,205 80,210 Z" 
                              fill="url(#outerFlameGrad)" 
                              stroke="#B83A12" 
                              stroke-width="2" 
                              stroke-linejoin="round"/>

                        <!-- LỚP 2 (TRONG): LÕI TRẮNG NHẠT PHA CAM NHẠT (KEM ẤM) -->
                        <path d="M 80,200 
                                 C 50,190 32,155 40,120 
                                 C 44,90 32,68 55,38 
                                 C 66,52 74,72 85,92 
                                 C 96,60 110,38 122,52 
                                 C 130,75 118,100 128,125 
                                 C 136,155 115,195 80,200 Z" 
                              fill="url(#innerCoreGrad)" 
                              opacity="0.95"/>
                    </g>
                </svg>
            </div>
        `;

        targetEl.appendChild(container);

        return new Promise((resolve) => {
            setTimeout(() => {
                container.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
                container.style.opacity = '0';
                container.style.transform = 'translateX(-50%) scale(0.5)';

                setTimeout(() => {
                    container.remove();
                    resolve();
                }, 300);
            }, duration);
        });
    }
};
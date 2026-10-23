/**
 * ==========================================
 * PKM_GEAR.JS - Dữ liệu & hình vẽ 24 món đồ
 * Dùng chung cho: pkm_store.html, pkm_items.html, pkm_battle.js
 * ==========================================
 */

window.GearSystem = {

    // =============================================
    // DỮ LIỆU GỐC
    // =============================================
    RANKS: [
        { id: 'silver', name: 'Bạc',  bonus: 0.02, color: '#bdc3c7', priceMult: 1   },
        { id: 'gold',   name: 'Vàng', bonus: 0.03, color: '#f1c40f', priceMult: 2.5 },
        { id: 'red',    name: 'Đỏ',   bonus: 0.04, color: '#e74c3c', priceMult: 5   },
        { id: 'orange', name: 'Cam',  bonus: 0.05, color: '#f39c12', priceMult: 10  },
    ],

    TYPES: [
        { id: 'weapon',  name: 'Quả Cầu',   stat: 'atk', label: 'Tấn công' },
        { id: 'armor',   name: 'Giáp thân', stat: 'def', label: 'Phòng thủ' },
        { id: 'helmet',  name: 'Giáp mũ',   stat: 'hp',  label: 'Sinh lực'  },
        { id: 'gloves',  name: 'Găng tay',  stat: 'atk', label: 'Tấn công' },
        { id: 'earring', name: 'Khuyên tai',stat: 'def', label: 'Phòng thủ' },
        { id: 'shoes',   name: 'Giày',       stat: 'hp',  label: 'Sinh lực'  },
        { id: 'cloak',  name: 'Áo choàng', stat: 'sAtk', label: 'Kỹ năng' },
        { id: 'belt',   name: 'Thắt lưng', stat: 'sAtk', label: 'Kỹ năng' },
    ],

    // =============================================
    // TẠO DANH SÁCH 24 MÓN
    // =============================================
    get ALL_ITEMS() {
        const items = [];
        this.TYPES.forEach(type => {
            this.RANKS.forEach(rank => {
                items.push({
                    id:        `${type.id}_${rank.id}`,
                    name:      `${type.name} ${rank.name}`,
                    typeName:  type.name,
                    typeId:    type.id,
                    rankId:    rank.id,
                    rankName:  rank.name,
                    stat:      type.stat,
                    label:     type.label,
                    bonus:     rank.bonus,
                    color:     rank.color,
                    price:     Math.floor(100 * rank.priceMult),
                });
            });
        });
        return items;
    },

    // =============================================
    // SVG ICON CHO TỪNG MÓN (type_rank)
    // =============================================
    ICONS: {

        // ---------- WEAPON (Quả Cầu Pokémon) ----------
        'weapon_silver': `
            <circle cx="32" cy="32" r="22" fill="url(#sv_w)" stroke="#888" stroke-width="1"/>
            <path d="M10 32 Q32 32 54 32" stroke="#555" stroke-width="2.5" fill="none"/>
            <circle cx="32" cy="32" r="6" fill="#eee" stroke="#999" stroke-width="1.5"/>
            <circle cx="32" cy="32" r="3" fill="#ccc"/>`,

        'weapon_gold': `
            <circle cx="32" cy="32" r="22" fill="url(#gv_w)" stroke="#c8960a" stroke-width="1.5"/>
            <path d="M10 32 Q32 32 54 32" stroke="#8B6914" stroke-width="2.5" fill="none"/>
            <circle cx="32" cy="32" r="7" fill="#fff8dc" stroke="#c8960a" stroke-width="2"/>
            <circle cx="32" cy="32" r="3.5" fill="#f1c40f"/>
            <circle cx="24" cy="21" r="3" fill="rgba(255,255,255,0.4)"/>`,

        'weapon_red': `
            <circle cx="32" cy="32" r="22" fill="url(#rv_w)" stroke="#900" stroke-width="1.5"/>
            <path d="M10 32 Q32 32 54 32" stroke="#600" stroke-width="2.5" fill="none"/>
            <circle cx="32" cy="32" r="7" fill="#fff" stroke="#c00" stroke-width="2"/>
            <circle cx="32" cy="32" r="3.5" fill="#ff4444"/>
            <line x1="10" y1="26" x2="54" y2="26" stroke="rgba(0,0,0,0.3)" stroke-width="1"/>
            <line x1="10" y1="38" x2="54" y2="38" stroke="rgba(0,0,0,0.3)" stroke-width="1"/>
            <circle cx="24" cy="21" r="3" fill="rgba(255,255,255,0.5)"/>`,

        'weapon_orange': `
            <circle cx="32" cy="32" r="22" fill="url(#ov_w)" stroke="#f39c12" stroke-width="2"/>
            <path d="M10 32 Q32 32 54 32" stroke="#603000" stroke-width="3" fill="none"/>
            <circle cx="32" cy="32" r="8" fill="#fff3e0" stroke="#f39c12" stroke-width="2.5"/>
            <circle cx="32" cy="32" r="4" fill="#ff8c00"/>
            <text x="32" y="26" text-anchor="middle" font-family="sans-serif" font-size="9" fill="rgba(255,255,255,0.9)" font-weight="bold">M</text>
            <circle cx="19" cy="19" r="2" fill="#ffe066"/>
            <circle cx="45" cy="19" r="2" fill="#ffe066"/>
            <circle cx="15" cy="35" r="1.5" fill="#ffe066"/>
            <circle cx="49" cy="35" r="1.5" fill="#ffe066"/>
            <circle cx="24" cy="21" r="4" fill="rgba(255,255,255,0.4)"/>`,

        // ---------- ARMOR (Giáp thân) ----------
        'armor_silver': `
            <path d="M32 10 L50 19 L50 40 Q50 54 32 59 Q14 54 14 40 L14 19 Z" fill="url(#sv_w)" stroke="#888" stroke-width="1"/>
            <line x1="32" y1="10" x2="32" y2="59" stroke="#888" stroke-width="1"/>`,

        'armor_gold': `
            <path d="M32 10 L50 19 L50 40 Q50 54 32 59 Q14 54 14 40 L14 19 Z" fill="url(#gv_w)" stroke="#c8960a" stroke-width="1.5"/>
            <line x1="32" y1="10" x2="32" y2="59" stroke="#c8960a" stroke-width="1.5"/>
            <ellipse cx="32" cy="35" rx="8" ry="10" fill="rgba(255,255,255,0.15)"/>`,

        'armor_red': `
            <path d="M32 8 L52 18 L52 42 Q52 56 32 62 Q12 56 12 42 L12 18 Z" fill="url(#rv_w)" stroke="#900" stroke-width="1.5"/>
            <line x1="32" y1="8" x2="32" y2="62" stroke="#900" stroke-width="1.5"/>
            <path d="M20 24 L44 24" stroke="rgba(255,200,200,0.5)" stroke-width="1.5"/>
            <path d="M18 33 L46 33" stroke="rgba(255,200,200,0.5)" stroke-width="1.5"/>
            <circle cx="32" cy="35" r="5" fill="rgba(255,255,255,0.2)"/>`,

        'armor_orange': `
            <path d="M32 7 L54 18 L54 43 Q54 58 32 64 Q10 58 10 43 L10 18 Z" fill="url(#ov_w)" stroke="#c05000" stroke-width="2"/>
            <line x1="32" y1="7" x2="32" y2="64" stroke="#c05000" stroke-width="2"/>
            <path d="M20 22 L44 22" stroke="rgba(255,220,150,0.6)" stroke-width="2"/>
            <path d="M18 31 L46 31" stroke="rgba(255,220,150,0.6)" stroke-width="2"/>
            <path d="M18 40 L46 40" stroke="rgba(255,220,150,0.6)" stroke-width="1.5"/>
            <circle cx="32" cy="35" r="6" fill="rgba(255,255,255,0.25)"/>
            <circle cx="32" cy="35" r="3" fill="rgba(255,180,0,0.5)"/>`,

        // ---------- HELMET (Giáp mũ) ----------
        'helmet_silver': `
            <path d="M12 46 Q12 18 32 13 Q52 18 52 46 Z" fill="url(#sv_w)" stroke="#888" stroke-width="1"/>
            <rect x="9" y="44" width="46" height="8" rx="4" fill="#aaa"/>`,

        'helmet_gold': `
            <path d="M11 47 Q11 16 32 11 Q53 16 53 47 Z" fill="url(#gv_w)" stroke="#c8960a" stroke-width="1.5"/>
            <rect x="8" y="45" width="48" height="9" rx="4" fill="#c8960a"/>
            <path d="M23 16 Q32 12 41 16" stroke="rgba(255,255,255,0.4)" stroke-width="2" fill="none"/>`,

        'helmet_red': `
            <path d="M10 48 Q10 14 32 10 Q54 14 54 48 Z" fill="url(#rv_w)" stroke="#900" stroke-width="1.5"/>
            <rect x="7" y="46" width="50" height="9" rx="4" fill="#900"/>
            <line x1="32" y1="10" x2="32" y2="48" stroke="rgba(255,200,200,0.4)" stroke-width="2"/>
            <path d="M21 15 Q32 11 43 15" stroke="rgba(255,255,255,0.4)" stroke-width="2" fill="none"/>`,

        'helmet_orange': `
            <path d="M9 49 Q9 12 32 8 Q55 12 55 49 Z" fill="url(#ov_w)" stroke="#c05000" stroke-width="2"/>
            <rect x="6" y="47" width="52" height="10" rx="5" fill="#c05000"/>
            <line x1="32" y1="8" x2="32" y2="49" stroke="rgba(255,220,150,0.5)" stroke-width="2"/>
            <path d="M19 14 Q32 9 45 14" stroke="rgba(255,255,255,0.5)" stroke-width="2" fill="none"/>
            <circle cx="32" cy="27" r="5" fill="rgba(255,200,0,0.4)"/>
            <polygon points="32,4 29,11 35,11" fill="#f39c12"/>`,

        // ---------- GLOVES (Găng tay) ----------
        'gloves_silver': `
            <rect x="17" y="28" width="12" height="25" rx="3" fill="url(#sv_w)" stroke="#888" stroke-width="1"/>
            <rect x="31" y="22" width="12" height="31" rx="3" fill="url(#sv_w)" stroke="#888" stroke-width="1"/>
            <rect x="45" y="26" width="10" height="27" rx="3" fill="url(#sv_w)" stroke="#888" stroke-width="1"/>
            <rect x="15" y="50" width="42" height="12" rx="4" fill="#aaa"/>`,

        'gloves_gold': `
            <rect x="15" y="26" width="13" height="27" rx="3" fill="url(#gv_w)" stroke="#c8960a" stroke-width="1.5"/>
            <rect x="30" y="19" width="13" height="34" rx="3" fill="url(#gv_w)" stroke="#c8960a" stroke-width="1.5"/>
            <rect x="45" y="23" width="11" height="30" rx="3" fill="url(#gv_w)" stroke="#c8960a" stroke-width="1.5"/>
            <rect x="13" y="49" width="46" height="13" rx="5" fill="#c8960a"/>`,

        'gloves_red': `
            <rect x="13" y="24" width="14" height="29" rx="4" fill="url(#rv_w)" stroke="#900" stroke-width="1.5"/>
            <rect x="29" y="17" width="14" height="36" rx="4" fill="url(#rv_w)" stroke="#900" stroke-width="1.5"/>
            <rect x="45" y="21" width="12" height="32" rx="4" fill="url(#rv_w)" stroke="#900" stroke-width="1.5"/>
            <rect x="11" y="48" width="48" height="13" rx="5" fill="#900"/>
            <line x1="11" y1="54" x2="59" y2="54" stroke="rgba(255,200,200,0.3)" stroke-width="1"/>`,

        'gloves_orange': `
            <rect x="12" y="22" width="15" height="31" rx="5" fill="url(#ov_w)" stroke="#c05000" stroke-width="2"/>
            <rect x="29" y="14" width="15" height="39" rx="5" fill="url(#ov_w)" stroke="#c05000" stroke-width="2"/>
            <rect x="46" y="19" width="12" height="34" rx="5" fill="url(#ov_w)" stroke="#c05000" stroke-width="2"/>
            <rect x="10" y="47" width="50" height="14" rx="6" fill="#c05000"/>
            <line x1="10" y1="53" x2="60" y2="53" stroke="rgba(255,180,0,0.4)" stroke-width="1.5"/>
            <circle cx="35" cy="55" r="3" fill="rgba(255,220,100,0.5)"/>`,

        // ---------- EARRING (Khuyên tai) ----------
        'earring_silver': `
            <circle cx="32" cy="22" r="9" fill="none" stroke="#bdc3c7" stroke-width="3"/>
            <line x1="32" y1="31" x2="32" y2="48" stroke="#aaa" stroke-width="2.5"/>
            <circle cx="32" cy="52" r="5" fill="url(#sv_w)"/>`,

        'earring_gold': `
            <circle cx="32" cy="20" r="10" fill="none" stroke="#f1c40f" stroke-width="3.5"/>
            <line x1="32" y1="30" x2="32" y2="46" stroke="#c8960a" stroke-width="3"/>
            <circle cx="32" cy="51" r="7" fill="url(#gv_w)" stroke="#c8960a" stroke-width="1"/>
            <circle cx="29" cy="47" r="2" fill="rgba(255,255,255,0.5)"/>`,

        'earring_red': `
            <circle cx="32" cy="19" r="11" fill="none" stroke="#e74c3c" stroke-width="3.5"/>
            <line x1="32" y1="30" x2="32" y2="44" stroke="#c00" stroke-width="3"/>
            <polygon points="32,60 25,46 39,46" fill="url(#rv_w)" stroke="#900" stroke-width="1"/>
            <circle cx="29" cy="48" r="2" fill="rgba(255,255,255,0.5)"/>`,

        'earring_orange': `
            <circle cx="32" cy="18" r="12" fill="none" stroke="#f39c12" stroke-width="4"/>
            <line x1="32" y1="30" x2="32" y2="43" stroke="#c05000" stroke-width="3.5"/>
            <polygon points="32,61 24,45 40,45" fill="url(#ov_w)" stroke="#c05000" stroke-width="1.5"/>
            <circle cx="28" cy="47" r="2.5" fill="rgba(255,255,255,0.6)"/>
            <circle cx="32" cy="18" r="4" fill="rgba(255,200,0,0.3)"/>
            <circle cx="32" cy="55" r="2" fill="#ffe066"/>`,

        // ---------- SHOES (Giày) ----------
        'shoes_silver': `
            <path d="M12 51 Q12 29 23 24 L40 24 L44 35 Q50 35 54 41 L54 51 Z" fill="url(#sv_w)" stroke="#888" stroke-width="1"/>
            <rect x="12" y="50" width="42" height="7" rx="3" fill="#aaa"/>`,

        'shoes_gold': `
            <path d="M11 52 Q11 27 22 22 L41 22 L46 33 Q52 33 56 40 L56 52 Z" fill="url(#gv_w)" stroke="#c8960a" stroke-width="1.5"/>
            <rect x="11" y="51" width="45" height="8" rx="3" fill="#c8960a"/>
            <line x1="27" y1="22" x2="27" y2="43" stroke="rgba(255,255,255,0.3)" stroke-width="1.5"/>
            <line x1="35" y1="22" x2="35" y2="46" stroke="rgba(255,255,255,0.3)" stroke-width="1.5"/>`,

        'shoes_red': `
            <path d="M10 53 Q10 25 21 20 L42 20 L48 32 Q55 32 57 40 L57 53 Z" fill="url(#rv_w)" stroke="#900" stroke-width="1.5"/>
            <rect x="10" y="52" width="47" height="8" rx="3" fill="#900"/>
            <line x1="25" y1="20" x2="25" y2="43" stroke="rgba(255,200,200,0.4)" stroke-width="1.5"/>
            <line x1="33" y1="20" x2="33" y2="46" stroke="rgba(255,200,200,0.4)" stroke-width="1.5"/>
            <line x1="41" y1="22" x2="41" y2="46" stroke="rgba(255,200,200,0.4)" stroke-width="1.5"/>`,

        'shoes_orange': `
            <path d="M9 54 Q9 23 20 18 L43 18 L50 31 Q57 31 59 40 L59 54 Z" fill="url(#ov_w)" stroke="#c05000" stroke-width="2"/>
            <rect x="9" y="53" width="50" height="9" rx="4" fill="#c05000"/>
            <line x1="24" y1="18" x2="24" y2="43" stroke="rgba(255,220,150,0.5)" stroke-width="2"/>
            <line x1="32" y1="18" x2="32" y2="47" stroke="rgba(255,220,150,0.5)" stroke-width="2"/>
            <line x1="40" y1="20" x2="40" y2="47" stroke="rgba(255,220,150,0.5)" stroke-width="2"/>
            <circle cx="20" cy="56" r="3" fill="rgba(255,200,0,0.5)"/>
            <circle cx="48" cy="56" r="3" fill="rgba(255,200,0,0.5)"/>`,
        'cloak_silver': `<path d="M20 10 Q32 18 44 10 L50 55 Q32 60 14 55 Z" fill="url(#sv_w)" stroke="#888" stroke-width="1"/>`,
        'cloak_gold':   `<path d="M20 10 Q32 18 44 10 L50 55 Q32 60 14 55 Z" fill="url(#gv_w)" stroke="#c8960a" stroke-width="1.5"/>`,
        'cloak_red':    `<path d="M20 10 Q32 18 44 10 L50 55 Q32 60 14 55 Z" fill="url(#rv_w)" stroke="#900" stroke-width="1.5"/>`,
        'cloak_orange': `<path d="M20 10 Q32 18 44 10 L50 55 Q32 60 14 55 Z" fill="url(#ov_w)" stroke="#c05000" stroke-width="2"/>`,

        'belt_silver': `<rect x="10" y="27" width="44" height="10" rx="3" fill="url(#sv_w)" stroke="#888" stroke-width="1"/><rect x="28" y="22" width="8" height="20" rx="2" fill="#aaa"/>`,
        'belt_gold':   `<rect x="10" y="27" width="44" height="10" rx="3" fill="url(#gv_w)" stroke="#c8960a" stroke-width="1.5"/><rect x="28" y="22" width="8" height="20" rx="2" fill="#c8960a"/>`,
        'belt_red':    `<rect x="10" y="27" width="44" height="10" rx="3" fill="url(#rv_w)" stroke="#900" stroke-width="1.5"/><rect x="28" y="22" width="8" height="20" rx="2" fill="#900"/>`,
        'belt_orange': `<rect x="10" y="27" width="44" height="10" rx="3" fill="url(#ov_w)" stroke="#c05000" stroke-width="2"/><rect x="28" y="22" width="8" height="20" rx="2" fill="#c05000"/>`,
    },

    // =============================================
    // DEFS SVG CHUNG (gradient, cần nhúng vào mỗi SVG)
    // =============================================
    SVG_DEFS: `
        <defs>
            <linearGradient id="sv_w" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#d8d8d8"/>
                <stop offset="100%" stop-color="#909090"/>
            </linearGradient>
            <linearGradient id="gv_w" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#ffe066"/>
                <stop offset="100%" stop-color="#c8960a"/>
            </linearGradient>
            <linearGradient id="rv_w" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#ff7070"/>
                <stop offset="100%" stop-color="#b01010"/>
            </linearGradient>
            <linearGradient id="ov_w" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#ffb840"/>
                <stop offset="100%" stop-color="#c05000"/>
            </linearGradient>
        </defs>`,

    // =============================================
    // HÀM TẠO SVG ICON
    // =============================================
    getIcon(typeId, rankId, size = 64) {
        const iconContent = this.ICONS[`${typeId}_${rankId}`] || '';
        return `
            <svg viewBox="0 0 64 64" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
                ${this.SVG_DEFS}
                ${iconContent}
            </svg>`;
    },

    // =============================================
    // HÀM TẠO CARD ĐẦY ĐỦ (dùng trong store, items)
    // =============================================
    renderCard(item, options = {}) {
        const {
            showPrice = true,
            showBonus = true,
            isOwned = false,
            isEquipped = false,
            onClick = ''
        } = options;

        const rankColors = {
            silver: '#bdc3c7',
            gold:   '#f1c40f',
            red:    '#e74c3c',
            orange: '#f39c12',
        };

        const color = rankColors[item.rankId] || '#fff';
        const icon  = this.getIcon(item.typeId, item.rankId, 56);

        return `
            <div class="gear-card rank-${item.rankId} ${isEquipped ? 'equipped' : ''} ${isOwned ? 'owned' : ''}"
                 data-id="${item.id}"
                 onclick="${onClick}"
                 style="border-top: 4px solid ${color};">
                <div class="gear-icon">${icon}</div>
                <div class="gear-name" style="color:${color}">${item.name}</div>
                ${showBonus ? `<div class="gear-bonus">${item.label} +${item.bonus * 100}%</div>` : ''}
                ${showPrice ? `<div class="gear-price">${item.price} DV</div>` : ''}
                ${isEquipped ? '<div class="gear-badge equipped-badge">ĐÃ MẶC</div>' : ''}
                ${isOwned && !isEquipped ? '<div class="gear-badge owned-badge">SỞ HỮU</div>' : ''}
            </div>`;
    },

    // =============================================
    // CSS CHUNG (nhúng 1 lần vào <head>)
    // =============================================
    CSS: `
        .gear-card {
            background: #252535;
            border-radius: 10px;
            padding: 12px 8px 10px;
            text-align: center;
            border: 1px solid #333;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
            position: relative;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 5px;
        }
        .gear-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 8px 20px rgba(0,0,0,0.4);
        }
        .gear-card:active { transform: scale(0.96); }
        .gear-card.equipped {
            background: #1a2a1a;
            box-shadow: 0 0 12px rgba(46,204,113,0.3);
        }
        .gear-icon svg { display: block; margin: 0 auto; }
        .gear-name {
            font-size: 12px;
            font-weight: 800;
            line-height: 1.2;
        }
        .gear-bonus {
            font-size: 10px;
            color: #aaa;
        }
        .gear-price {
            font-size: 11px;
            color: #f1c40f;
            font-weight: 700;
        }
        .gear-badge {
            font-size: 9px;
            font-weight: 900;
            padding: 2px 8px;
            border-radius: 10px;
            text-transform: uppercase;
        }
        .equipped-badge { background: #2ecc71; color: #000; }
        .owned-badge    { background: #2c3e50; color: #aaa; }

        .rank-silver { border-top-color: #bdc3c7 !important; }
        .rank-gold   { border-top-color: #f1c40f !important; }
        .rank-red    { border-top-color: #e74c3c !important; }
        .rank-orange { border-top-color: #f39c12 !important; }
    `,

    // =============================================
    // HÀM TIỆN ÍCH
    // =============================================
    getItem(id) {
        return this.ALL_ITEMS.find(i => i.id === id) || null;
    },

    getEquippedBonus() {
        const equipped  = JSON.parse(localStorage.getItem('pkm_equipped')) || {};
        let bonusAtk = 0, bonusDef = 0, bonusHP = 0;

        Object.values(equipped).forEach(id => {
            const item = this.getItem(id);
            if (!item) return;
            if (item.stat === 'atk') bonusAtk += item.bonus;
            if (item.stat === 'def') bonusDef += item.bonus;
            if (item.stat === 'hp')  bonusHP  += item.bonus;
        });

        return { bonusAtk, bonusDef, bonusHP };
    },

    injectCSS() {
        if (document.getElementById('gear-system-css')) return;
        const style = document.createElement('style');
        style.id = 'gear-system-css';
        style.innerHTML = this.CSS;
        document.head.appendChild(style);
    }
};

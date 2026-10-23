/**
 * ==========================================================
 * PKM TYPE CHART — Bảng khắc hệ 18 hệ, tải 1 lần & cache localStorage
 * ==========================================================
 * window.PkmTypeChart.ensureLoaded()          -> tải/nạp bảng (idempotent)
 * window.PkmTypeChart.isSuperEffective(a, b)  -> hệ a có khắc hệ b không?
 * window.PkmTypeChart.pickCounterId(defType)  -> {id, type} 1 Pokémon
 *   thuộc hệ NGẪU NHIÊN trong số các hệ khắc defType.
 * ==========================================================
 */
window.PkmTypeChart = (() => {
    const ALL_TYPES = [
        'normal','fire','water','electric','grass','ice','fighting','poison',
        'ground','flying','psychic','bug','rock','ghost','dragon','dark','steel','fairy'
    ];
    const CACHE_KEY = 'pkm_type_chart_v1';
    let chart = null;
    let loadingPromise = null;

    async function fetchTypeData(typeName) {
        const res = await fetch(`https://pokeapi.co/api/v2/type/${typeName}`);
        const data = await res.json();
        const superEffectiveAgainst = (data.damage_relations?.double_damage_to || []).map(t => t.name);
        const pokemonIds = (data.pokemon || [])
            .map(p => {
                const m = p.pokemon.url.match(/\/pokemon\/(\d+)\//);
                return m ? parseInt(m[1]) : null;
            })
            .filter(id => id && id <= 649); // giữ trong khoảng Gen 1-5 cho ổn định hình ảnh
        return { superEffectiveAgainst, pokemonIds };
    }

    async function buildChart() {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                if (parsed && parsed.__version === 1) return parsed.data;
            } catch (e) { /* cache hỏng, fetch lại */ }
        }

        const result = {};
        await Promise.all(ALL_TYPES.map(async (t) => {
            try {
                result[t] = await fetchTypeData(t);
            } catch (e) {
                result[t] = { superEffectiveAgainst: [], pokemonIds: [] };
            }
        }));

        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ __version: 1, data: result }));
        } catch (e) { /* localStorage đầy, bỏ qua cache */ }

        return result;
    }

    async function ensureLoaded() {
        if (chart) return chart;
        if (!loadingPromise) loadingPromise = buildChart();
        chart = await loadingPromise;
        return chart;
    }

    function isSuperEffective(attackerType, defenderType) {
        if (!chart || !attackerType || !defenderType) return false;
        const entry = chart[attackerType];
        return !!(entry && entry.superEffectiveAgainst.includes(defenderType));
    }
    // Trả về mảng các hệ mà `type` khắc (super effective against) —
    // dùng để hiển thị trong màn xem trước đội hình.
    function getCounters(type) {
        if (!chart || !chart[type]) return [];
        return chart[type].superEffectiveAgainst.slice();
    }

    async function pickCounterId(defenderType) {
        await ensureLoaded();
        const counteringTypes = ALL_TYPES.filter(t =>
            chart[t] && chart[t].superEffectiveAgainst.includes(defenderType) && chart[t].pokemonIds.length > 0
        );

        if (counteringTypes.length === 0) {
            return { id: Math.floor(Math.random() * 649) + 1, type: 'normal' };
        }

        const chosenType = counteringTypes[Math.floor(Math.random() * counteringTypes.length)];
        const idPool = chart[chosenType].pokemonIds;
        const chosenId = idPool[Math.floor(Math.random() * idPool.length)];
        return { id: chosenId, type: chosenType };
    }

    return { ensureLoaded, isSuperEffective, pickCounterId, getCounters };
})();
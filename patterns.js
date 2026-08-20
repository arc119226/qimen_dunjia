/**
 * 奇門遁甲格局判斷模組
 *
 * 本模組不參與排盤，只讀取排好的盤局並判斷格局。
 *
 * 設計原則
 * ========================================================================
 *
 * 1. 純函數，只吃盤面。所有判斷都是 chartToObject() 結果的函數，不依賴排盤
 *    是怎麼算出來的。轉盤排的盤與飛盤排的盤，只要格式相同就都能判。
 *
 * 2. 每條格局都帶出處。典籍對同一格局的條件常有出入，沒有出處就無從裁決。
 *    出處記到「書名 + 篇名 + 原文」的粒度。
 *
 * 3. 異說並列，不代為擇一。遇到各書條件不同者，逐一產出判定結果並以 `讀法`
 *    標明，由呼叫端依自己遵循的流派過濾。六儀擊刑即為一例：寬式（任一六儀
 *    落刑宮）與嚴式（僅值符之儀）出現率相差近四倍。
 *
 * 4. 能推導的就推導，並在測試中與典籍明列的表核對。如門迫由門與宮的五行相克
 *    推得，而《法竅》〈論八門迫制〉的逐條列舉則作為測試基準。
 */

import {
    LUOSHU_BAGUA,
    PALACE,
    ELEMENT_OVERCOMES,
    PALACE_ELEMENTS,
    DOOR_ELEMENTS,
    GAN_ELEMENTS,
    QIMEN_STARS,
    ZHONG_SUBSTITUTE
} from './constants.js';

// ============================================================================
// 出處
// ============================================================================

const SOURCES = Object.freeze({
    法竅_門迫: Object.freeze({
        書: '奇門法竅',
        篇: '論八門迫制',
        文: '宮制其門不為迫，門制其宮門迫凶。吉門被迫吉減去，凶遇門迫凶更凶。'
    }),
    寶鑑_擊刑: Object.freeze({
        書: '奇門寶鑑御定',
        篇: '釋六儀擊刑',
        文: '甲子直符加三宮、子刑卯也。甲戌加二宮、戌刑未也。甲申加八宮、申刑寅也。'
            + '甲午加九宮、午刑午也。甲辰加四宮、辰刑辰也。甲寅加四宮、寅刑巳也。'
    }),
    法竅_擊刑: Object.freeze({
        書: '奇門法竅',
        篇: '論六儀擊刑',
        文: '甲子直符臨三宮，子刑卯也，為無理之刑…甲午直符臨九宮，午自刑也，為高大之刑。'
    }),
    統宗_得使: Object.freeze({
        書: '奇門遁甲統宗',
        篇: '奇門四十格',
        文: '三奇得使：乙奇加甲午甲戌，丙奇加甲子甲申，丁奇加甲寅甲辰。'
    }),
    釣叟_五不遇: Object.freeze({
        書: '煙波釣叟歌',
        篇: '（《遁甲演義》錄為黃帝陰符經）',
        文: '五不遇時龍不精，號為日月損光明，時干來克日干上，甲日須知時忌庚。'
    }),
    旨歸_伏吟: Object.freeze({
        書: '奇門旨歸',
        篇: '卷五 十干克應',
        文: '六甲加六戊，謂天盤戊加地盤戊是為伏吟，凡事閉塞，靜守為吉。'
    }),
    釣叟_反吟: Object.freeze({
        書: '煙波釣叟歌',
        篇: '（《奇門旨歸》卷二錄本）',
        文: '就中伏吟為最凶，天蓬加著地天蓬，天蓬若到天英上，須知即是返吟宮。'
    })
});

// ============================================================================
// 判定用的小工具
// ============================================================================

/** 該宮索引的後天八卦名 */
const palaceName = index => LUOSHU_BAGUA[index];

/** a 是否克 b */
const overcomes = (a, b) => ELEMENT_OVERCOMES[a] === b;

/** 對宮：洛書數相加為十 */
const OPPOSITE_PALACE = Object.freeze({
    巽: '乾', 乾: '巽', 離: '坎', 坎: '離',
    坤: '艮', 艮: '坤', 震: '兌', 兌: '震'
});

/** 六儀所遁之甲 */
const YI_TO_JIA = Object.freeze({
    戊: '甲子', 己: '甲戌', 庚: '甲申', 辛: '甲午', 壬: '甲辰', 癸: '甲寅'
});

/**
 * 建立一則判定結果
 *
 * @param {string} 格 - 格局名稱
 * @param {string} 吉凶 - 吉／凶／中性
 * @param {string|null} 宮 - 落宮；全盤性者為 null
 * @param {string} 細節 - 該例的具體條件
 * @param {Object} 出處 - SOURCES 中的一項
 * @param {string} [讀法] - 有異說時標明所依讀法
 * @returns {Object} 判定結果
 */
function finding(格, 吉凶, 宮, 細節, 出處, 讀法) {
    const result = { 格, 吉凶, 宮, 細節, 出處: [出處] };
    if (讀法) result.讀法 = 讀法;
    return result;
}

// ============================================================================
// 各條格局
// ============================================================================

/**
 * 伏吟：天盤與地盤全同
 *
 * 時干（甲遁後為符首）與符首同宮時，取值起點等於放置起點，天盤不動。
 * 每旬有二時如此：旬首之甲時（甲遁符首）與符首本身之時。
 *
 * @param {Object} chart - 盤局物件
 * @returns {Array<Object>} 判定結果
 */
export function detectFuYin(chart) {
    const same = chart['天盤'].every((gan, index) => gan === chart['地盤'][index]);
    if (!same) return [];
    return [finding('伏吟', '凶', null, '天盤與地盤全同，時干與符首同宮', SOURCES.旨歸_伏吟)];
}

/**
 * 反吟：值符星飛至本位之對宮
 *
 * 轉盤為剛性環轉，值符到對宮則八星俱到對宮。天禽居中不動，
 * 以其寄宮之星（天芮）定位。
 *
 * @param {Object} chart - 盤局物件
 * @returns {Array<Object>} 判定結果
 */
export function detectFanYin(chart) {
    const zhongStar = QIMEN_STARS[PALACE.ZHONG];
    const star = chart['值符'] === zhongStar ? QIMEN_STARS[ZHONG_SUBSTITUTE] : chart['值符'];
    const home = palaceName(QIMEN_STARS.indexOf(star));
    const landed = chart['值符落宮'];
    if (OPPOSITE_PALACE[home] !== landed) return [];
    return [finding('反吟', '凶', landed,
        `值符${chart['值符']}由本位${home}宮飛至對宮${landed}宮`, SOURCES.釣叟_反吟)];
}

/**
 * 門迫：門克宮
 *
 * 《法竅》：門制其宮則為迫，宮制其門不為迫。此處只產出「迫」，
 * 宮克門者不列（原文明言不為迫）。
 *
 * @param {Object} chart - 盤局物件
 * @returns {Array<Object>} 判定結果
 */
export function detectMenPo(chart) {
    const results = [];
    chart['天門'].forEach((door, index) => {
        if (!door) return;
        const doorElement = DOOR_ELEMENTS[door];
        const palaceElement = PALACE_ELEMENTS[index];
        if (!overcomes(doorElement, palaceElement)) return;
        results.push(finding('門迫', '凶', palaceName(index),
            `${door}（${doorElement}）臨${palaceName(index)}宮（${palaceElement}），門克宮`,
            SOURCES.法竅_門迫));
    });
    return results;
}

/**
 * 五不遇時：時干克日干
 *
 * @param {Object} chart - 盤局物件
 * @returns {Array<Object>} 判定結果
 */
export function detectWuBuYu(chart) {
    const dayGan = chart['日柱'][0];
    const hourGan = chart['時干'];
    if (!overcomes(GAN_ELEMENTS[hourGan], GAN_ELEMENTS[dayGan])) return [];
    return [finding('五不遇時', '凶', null,
        `時干${hourGan}（${GAN_ELEMENTS[hourGan]}）克日干${dayGan}（${GAN_ELEMENTS[dayGan]}）`,
        SOURCES.釣叟_五不遇)];
}

/**
 * 三奇得使：天盤三奇加於地盤特定六儀之上
 *
 * 乙加甲午（辛）甲戌（己）、丙加甲子（戊）甲申（庚）、丁加甲寅（癸）甲辰（壬）。
 */
const DE_SHI = Object.freeze({
    乙: ['辛', '己'],
    丙: ['戊', '庚'],
    丁: ['癸', '壬']
});

/**
 * @param {Object} chart - 盤局物件
 * @returns {Array<Object>} 判定結果
 */
export function detectSanQiDeShi(chart) {
    const results = [];
    for (const [qi, yis] of Object.entries(DE_SHI)) {
        const index = chart['天盤'].indexOf(qi);
        if (index === -1) continue;
        const di = chart['地盤'][index];
        if (!yis.includes(di)) continue;
        results.push(finding('三奇得使', '吉', palaceName(index),
            `天盤${qi}奇加地盤${di}（${YI_TO_JIA[di]}）於${palaceName(index)}宮`,
            SOURCES.統宗_得使));
    }
    return results;
}

/**
 * 六儀擊刑：六儀落於刑其地支之宮
 *
 * 戊（甲子）子刑卯故忌震三，己（甲戌）戌刑未故忌坤二，庚（甲申）申刑寅故忌艮八，
 * 辛（甲午）午自刑故忌離九，壬（甲辰）辰自刑、癸（甲寅）寅刑巳，二者俱忌巽四。
 *
 * 判定範圍有異說，兩種讀法皆產出並以「讀法」標明：
 * - 寬式：天盤任一六儀落刑宮
 * - 嚴式：僅值符所帶之儀（即本旬符首）落刑宮。《法竅》〈論六儀擊刑〉逐條皆云
 *   「甲子直符臨三宮」，字面即此讀法
 *
 * 兩者出現率相差近四倍，故不代為擇一。
 */
const JI_XING = Object.freeze({
    戊: '震', 己: '坤', 庚: '艮', 辛: '離', 壬: '巽', 癸: '巽'
});

const JI_XING_NOTE = Object.freeze({
    戊: '子刑卯，無理之刑',
    己: '戌刑未，恃勢之刑',
    庚: '申刑寅，無恩之刑',
    辛: '午自刑，高大之刑',
    壬: '辰自刑',
    癸: '寅刑巳'
});

/**
 * @param {Object} chart - 盤局物件
 * @returns {Array<Object>} 判定結果
 */
export function detectLiuYiJiXing(chart) {
    const results = [];
    for (const [yi, palace] of Object.entries(JI_XING)) {
        const index = chart['天盤'].indexOf(yi);
        if (index === -1 || palaceName(index) !== palace) continue;
        const detail = `天盤${yi}（${YI_TO_JIA[yi]}）臨${palace}宮，${JI_XING_NOTE[yi]}`;
        results.push(finding('六儀擊刑', '凶', palace, detail,
            SOURCES.寶鑑_擊刑, '寬式（任一六儀）'));
        if (yi === chart['符首']) {
            results.push(finding('六儀擊刑', '凶', palace, detail,
                SOURCES.法竅_擊刑, '嚴式（值符之儀）'));
        }
    }
    return results;
}

// ============================================================================
// 總入口
// ============================================================================

/** 目前已實作的判定器 */
const DETECTORS = Object.freeze([
    detectFuYin,
    detectFanYin,
    detectMenPo,
    detectWuBuYu,
    detectSanQiDeShi,
    detectLiuYiJiXing
]);

/**
 * 判斷盤局中出現的格局
 *
 * @param {Object} chart - chartToObject() 的結果
 * @returns {Array<Object>} 判定結果陣列，每則含 格／吉凶／宮／細節／出處，
 *                          有異說者另含 讀法
 *
 * @example
 * const chart = chartToObject(generateChartByDatetime('2024011510'));
 * for (const item of detectPatterns(chart)) {
 *     console.log(item.格, item.宮 || '（全盤）', item.細節);
 * }
 */
export function detectPatterns(chart) {
    return DETECTORS.flatMap(detect => detect(chart));
}

export default {
    detectPatterns,
    detectFuYin,
    detectFanYin,
    detectMenPo,
    detectWuBuYu,
    detectSanQiDeShi,
    detectLiuYiJiXing
};

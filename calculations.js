/**
 * 奇門遁甲盤局運算模組
 * 
 * 本模組實現奇門遁甲的五層盤局運算：
 * 1. 地盤（三奇六儀靜態分布）
 * 2. 天盤（天干動態位移）
 * 3. 八門（門戶飛布）
 * 4. 九星（星曜飛布）
 * 5. 八神（神煞飛布）
 * 
 * 各層共享洛書九宮框架，但各自獨立運算後疊加
 */

import {
    PALACE,
    ZHONG_SUBSTITUTE,
    FLY_PATH,
    DIRECTION_ARROWS,
    HETU_BAGUA,
    LUOSHU_BAGUA,
    FLYING_STARS,
    FLYING_STAR_CHARTS,
    QIMEN_STARS,
    EIGHT_DOORS_ORIGINAL,
    EIGHT_DOORS_SEQUENCE,
    EIGHT_GODS_YANG,
    EIGHT_GODS_YIN,
    DIPAN_YANG,
    DIPAN_YIN
} from './constants.js';

import {
    rotateMapping,
    generatePutSequence,
    normalizeZhongPalace,
    resolveJiaHiding
} from './utils.js';

// ============================================================================
// 基礎盤面：河圖與洛書
// ============================================================================

/**
 * 取得河圖（先天八卦）排列
 * @returns {Array<string>} 先天八卦九宮分布
 */
export function getHeTu() {
    return [...HETU_BAGUA];
}

/**
 * 取得洛書（後天八卦）排列
 * @returns {Array<string>} 後天八卦九宮分布
 */
export function getLuoShu() {
    return [...LUOSHU_BAGUA];
}

// ============================================================================
// 飛星系統
// ============================================================================

/**
 * 計算飛星盤
 * 
 * 根據入中宮的星數，計算九宮各位置的飛星分布
 * 
 * @param {number} centerStar - 入中宮的星數（1-9）
 * @returns {Array<string>} 九宮各位置的飛星名稱
 */
export function calculateFlyingStars(centerStar) {
    const starNumbers = FLYING_STAR_CHARTS[centerStar];
    if (!starNumbers) {
        throw new Error(`無效的中宮星數：${centerStar}，必須為 1-9`);
    }
    return starNumbers.map(num => FLYING_STARS[num]);
}

// ============================================================================
// 第一層：地盤（三奇六儀）
// ============================================================================

/**
 * 取得地盤配置
 * 
 * 地盤是三奇六儀在九宮中的固定分布，根據陰陽局與局數確定
 * 
 * @param {boolean} isYang - 是否為陽局
 * @param {number} gameNumber - 局數（1-9）
 * @returns {Array<string>} 九宮各位置的天干
 */
export function getDiPan(isYang, gameNumber) {
    const diPanConfig = isYang ? DIPAN_YANG : DIPAN_YIN;
    const result = diPanConfig[gameNumber];
    if (!result) {
        throw new Error(`無效的局數：${gameNumber}，必須為 1-9`);
    }
    return [...result];
}

// ============================================================================
// 第二層：天盤（天干飛布）
// ============================================================================

/**
 * 計算天盤
 * 
 * 天盤代表天干隨時辰推移的動態位移。
 * 運算邏輯：以時干位置為放置起點、符首位置為取值起點，
 * 沿順時針軌跡將地盤天干旋轉映射至天盤。
 * 
 * @param {boolean} isYang - 是否為陽局
 * @param {string} tianGan - 當前時干（已處理甲遁）
 * @param {string} fuShou - 符首
 * @param {Array<string>} diPan - 地盤配置
 * @returns {Array<string>} 天盤九宮分布
 */
export function calculateTianPan(isYang, tianGan, fuShou, diPan) {
    const targetIndex = diPan.indexOf(tianGan);
    const sourceIndex = diPan.indexOf(fuShou);
    
    // 陽局與陰局使用相同的順時針軌跡
    // 原程式碼中陰陽局的天盤運算邏輯相同
    return rotateMapping(diPan, FLY_PATH.CLOCKWISE, sourceIndex, targetIndex);
}

// ============================================================================
// 第三層：八門
// ============================================================================

/**
 * 取得八門本位
 * @returns {Array<string>} 八門原始九宮分布
 */
export function getOriginalDoors() {
    return [...EIGHT_DOORS_ORIGINAL];
}

/**
 * 確定值使門
 * 
 * 值使門是當前時段主事的門戶。
 * 確定方式：在地盤上定位符首所在宮位，該宮位的原始八門即為值使門。
 * 
 * @param {string} fuShou - 符首
 * @param {Array<string>} diPan - 地盤配置
 * @returns {string} 值使門名稱
 */
export function getZhiShiDoor(fuShou, diPan) {
    let doorIndex = diPan.indexOf(fuShou);
    doorIndex = normalizeZhongPalace(doorIndex);
    return EIGHT_DOORS_ORIGINAL[doorIndex];
}

/**
 * 計算八門飛布
 * 
 * 八門飛布的運算分為兩步：
 * 1. 計算值使門此刻應落入的宮位
 * 2. 從該宮位開始，沿順時針軌跡依序安排其餘七門
 * 
 * @param {boolean} isYang - 是否為陽局
 * @param {string} zhiShiDoor - 值使門
 * @param {number} flyStep - 飛布步數（0-9）
 * @param {string} fuShou - 符首
 * @param {Array<string>} diPan - 地盤配置
 * @returns {Array<string>} 八門飛布後的九宮分布
 */
export function calculateEightDoors(isYang, zhiShiDoor, flyStep, fuShou, diPan) {
    // 確定符首在地盤上的位置作為飛布起點
    const startIndex = diPan.indexOf(fuShou);
    
    // 選擇飛布軌跡（陽局順飛、陰局逆飛）
    const flyIndex = isYang ? FLY_PATH.DOOR_YANG : FLY_PATH.DOOR_YIN;
    
    // 處理飛布步數超過九宮數量的情況
    const normalizedFlyStep = flyStep % flyIndex.length;
    
    // 生成放置順序
    const putSequence = generatePutSequence(flyIndex, startIndex);
    
    // 計算值使門應落入的宮位
    let zhiShiTargetIndex = putSequence[normalizedFlyStep];
    zhiShiTargetIndex = normalizeZhongPalace(zhiShiTargetIndex);
    
    // 從值使門目標宮位開始，沿順時針軌跡安排八門
    const doorPutSequence = generatePutSequence(FLY_PATH.CLOCKWISE, zhiShiTargetIndex);
    
    // 從值使門開始，按固定順序排列八門
    const zhiShiIndexInSequence = EIGHT_DOORS_SEQUENCE.indexOf(zhiShiDoor);
    const doorOrder = [
        ...EIGHT_DOORS_SEQUENCE.slice(zhiShiIndexInSequence),
        ...EIGHT_DOORS_SEQUENCE.slice(0, zhiShiIndexInSequence)
    ];
    
    // 將八門填入對應宮位
    const result = new Array(9).fill('');
    for (let i = 0; i < doorPutSequence.length; i++) {
        result[doorPutSequence[i]] = doorOrder[i];
    }
    
    return result;
}

// ============================================================================
// 第四層：九星
// ============================================================================

/**
 * 取得九星本位
 * @returns {Array<string>} 九星原始九宮分布
 */
export function getOriginalStars() {
    return [...QIMEN_STARS];
}

/**
 * 確定值符星
 * 
 * 值符星是當前時段主事的星曜。
 * 確定方式：在地盤上定位符首所在宮位，該宮位的原始九星即為值符星。
 * 
 * @param {string} fuShou - 符首
 * @param {Array<string>} diPan - 地盤配置
 * @returns {string} 值符星名稱
 */
export function getZhiFuStar(fuShou, diPan) {
    const starIndex = diPan.indexOf(fuShou);
    return QIMEN_STARS[starIndex];
}

/**
 * 確定值符星落宮
 * 
 * 計算值符星此刻應落入的宮位名稱
 * 
 * @param {string} tianGan - 當前時干（已處理甲遁）
 * @param {Array<string>} diPan - 地盤配置
 * @returns {string} 落宮的後天八卦名稱
 */
export function getZhiFuPosition(tianGan, diPan) {
    const positionIndex = diPan.indexOf(tianGan);
    return LUOSHU_BAGUA[positionIndex];
}

/**
 * 計算九星飛布
 * 
 * 九星飛布的運算邏輯與天盤相同：
 * 以時干位置為放置起點、值符星本位為取值起點，
 * 沿順時針軌跡將九星旋轉映射。
 * 
 * @param {string} zhiFuStar - 值符星
 * @param {string} tianGan - 當前時干（已處理甲遁）
 * @param {Array<string>} diPan - 地盤配置
 * @returns {Array<string>} 九星飛布後的九宮分布
 */
export function calculateNineStars(zhiFuStar, tianGan, diPan) {
    const targetIndex = diPan.indexOf(tianGan);
    const sourceIndex = QIMEN_STARS.indexOf(zhiFuStar);
    
    return rotateMapping(QIMEN_STARS, FLY_PATH.CLOCKWISE, sourceIndex, targetIndex);
}

/**
 * 取得天禽寄宮方向
 * 
 * 天禽居中宮，中宮無門，故需標示其寄託於何宮。
 * 傳統上天禽寄於天芮所在之宮。
 * 
 * @param {Array<string>} nineStars - 九星飛布結果
 * @returns {string} 天禽寄宮的方向箭頭
 */
export function getTianQinDirection(nineStars) {
    const tianRuiIndex = nineStars.indexOf('天芮');
    return DIRECTION_ARROWS[tianRuiIndex];
}

// ============================================================================
// 第五層：八神
// ============================================================================

/**
 * 計算八神飛布
 * 
 * 八神飛布的特點：
 * 1. 以時辰天干位置為值符神起點（非符首）
 * 2. 陽局順飛、陰局逆飛
 * 3. 陰陽局使用不同的八神組合
 * 
 * @param {boolean} isYang - 是否為陽局
 * @param {string} tianGan - 當前時干（已處理甲遁）
 * @param {Array<string>} diPan - 地盤配置
 * @returns {Array<string>} 八神飛布後的九宮分布
 */
export function calculateEightGods(isYang, tianGan, diPan) {
    // 確定時干在地盤上的位置作為值符神起點
    let headIndex = diPan.indexOf(tianGan);
    headIndex = normalizeZhongPalace(headIndex);
    
    // 選擇八神組合與飛布軌跡
    const gods = isYang ? EIGHT_GODS_YANG : EIGHT_GODS_YIN;
    const flyPath = isYang ? FLY_PATH.CLOCKWISE : FLY_PATH.COUNTER_CLOCKWISE;
    
    // 生成放置順序
    const putSequence = generatePutSequence(flyPath, headIndex);
    
    // 將八神填入對應宮位
    const result = new Array(9).fill('');
    for (let i = 0; i < putSequence.length; i++) {
        result[putSequence[i]] = gods[i];
    }
    
    return result;
}

// ============================================================================
// 輔助查詢函數
// ============================================================================

/**
 * 取得方向箭頭
 * 
 * @param {number} palaceIndex - 宮位索引
 * @returns {string} 方向箭頭符號
 */
export function getDirectionArrow(palaceIndex) {
    return DIRECTION_ARROWS[palaceIndex] || '';
}

/**
 * 查詢值使門落宮
 * 
 * @param {string} zhiShiDoor - 值使門
 * @param {Array<string>} eightDoors - 八門飛布結果
 * @returns {string} 落宮的後天八卦名稱
 */
export function getZhiShiPosition(zhiShiDoor, eightDoors) {
    const doorIndex = eightDoors.indexOf(zhiShiDoor);
    return LUOSHU_BAGUA[doorIndex];
}

// ============================================================================
// 拆補法定局
// ============================================================================

/**
 * 簡繁轉換表（節氣名稱用）
 * lunar-javascript 輸出簡體，需轉為繁體以匹配常數表
 */
const SIMPLIFIED_TO_TRADITIONAL = {
    '谷雨': '穀雨',
    '惊蛰': '驚蟄',
    '处暑': '處暑'
};

/**
 * 簡體轉繁體
 * @param {string} str - 輸入字串
 * @returns {string} 轉換後的繁體字串
 */
function s2t(str) {
    if (!str) return str;
    let result = str;
    for (const [simplified, traditional] of Object.entries(SIMPLIFIED_TO_TRADITIONAL)) {
        result = result.replace(new RegExp(simplified, 'g'), traditional);
    }
    return result;
}

/**
 * 拆補法定局
 * 
 * 拆補法是奇門遁甲中最經典的定局方法，其核心原理為：
 * 1. 以節氣交接時刻為嚴格分界點
 * 2. 從節氣交接開始，每5天為一元（上元、中元、下元）
 * 3. 「拆」：將跨節氣的旬拆開，節氣前用舊局、節氣後用新局
 * 4. 「補」：節氣後的天數直接補入新局計算
 * 
 * 與置閏法的區別：
 * - 拆補法嚴格按節氣分界，不考慮符頭
 * - 置閏法考慮符頭（甲子、己卯等）與節氣的配合，有超神、接氣、置閏等處理
 * 
 * @param {Object} solar - lunar-javascript 的 Solar 對象
 * @param {Object} jieQiJuShu - 節氣局數配置表
 * @param {Array<string>} yuanNames - 三元名稱陣列
 * @returns {Object} 定局結果
 *   - jieQiName: 當前節氣名稱
 *   - yuan: 三元索引 (0=上元, 1=中元, 2=下元)
 *   - yuanName: 三元名稱
 *   - isYang: 是否為陽遁
 *   - yinYang: '陽' 或 '陰'
 *   - gameNumber: 局數 (1-9)
 *   - daysSinceJieQi: 距離節氣交接的天數
 */
export function calculateJuByChaiBu(solar, jieQiJuShu, yuanNames) {
    const lunar = solar.getLunar();
    
    // 獲取當前所在節氣
    const currentJieQi = lunar.getPrevJieQi();
    const jieQiName = s2t(currentJieQi.getName());
    
    // 獲取節氣交接的精確時間（Solar 對象）
    const jieQiSolar = currentJieQi.getSolar();
    
    // 使用儒略日計算精確天數差
    const currentJD = solar.getJulianDay();
    const jieQiJD = jieQiSolar.getJulianDay();
    const daysDiff = currentJD - jieQiJD;
    
    // 判斷三元
    // 上元：第0-4天（daysDiff 在 [0, 5) 範圍）
    // 中元：第5-9天（daysDiff 在 [5, 10) 範圍）
    // 下元：第10-14天（daysDiff 在 [10, 15) 範圍）
    let yuan;
    if (daysDiff < 5) {
        yuan = 0; // 上元
    } else if (daysDiff < 10) {
        yuan = 1; // 中元
    } else {
        yuan = 2; // 下元
    }
    
    // 查表獲取局數配置
    const config = jieQiJuShu[jieQiName];
    if (!config) {
        throw new Error(`未知的節氣：${jieQiName}`);
    }
    
    return {
        jieQiName,
        yuan,
        yuanName: yuanNames[yuan],
        isYang: config.yang,
        yinYang: config.yang ? '陽' : '陰',
        gameNumber: config.ju[yuan],
        daysSinceJieQi: Math.floor(daysDiff)
    };
}

export default {
    getHeTu,
    getLuoShu,
    calculateFlyingStars,
    getDiPan,
    calculateTianPan,
    getOriginalDoors,
    getZhiShiDoor,
    calculateEightDoors,
    getOriginalStars,
    getZhiFuStar,
    getZhiFuPosition,
    calculateNineStars,
    getTianQinDirection,
    calculateEightGods,
    getDirectionArrow,
    getZhiShiPosition,
    calculateJuByChaiBu
};

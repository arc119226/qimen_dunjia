/**
 * 奇門遁甲通用工具函數
 * 
 * 本模組提供重複使用的核心運算邏輯，包括：
 * - 陣列旋轉（飛布運算的基礎）
 * - 索引轉換（處理中宮替代）
 * - 旬首與符首查詢
 */

import {
    PALACE,
    ZHONG_SUBSTITUTE,
    SIX_XUNS,
    XUN_HEADS,
    XUN_TO_HEAD,
    XUN_TO_KONGWANG_DIRECTION
} from './constants.js';

// ============================================================================
// 陣列旋轉工具
// ============================================================================

/**
 * 從指定起點旋轉陣列
 * 
 * 此函數是飛布運算的核心工具。將陣列從 startIndex 位置開始重新排列，
 * 使 startIndex 成為新陣列的第一個元素，其餘元素依序接續。
 * 
 * @param {Array} array - 要旋轉的陣列
 * @param {number} startIndex - 起始索引
 * @returns {Array} 旋轉後的新陣列
 * 
 * @example
 * rotateArrayFromIndex([0, 1, 2, 3, 4], 2) // 返回 [2, 3, 4, 0, 1]
 */
export function rotateArrayFromIndex(array, startIndex) {
    if (!Array.isArray(array) || array.length === 0) {
        return [];
    }
    
    const normalizedIndex = startIndex % array.length;
    return [
        ...array.slice(normalizedIndex),
        ...array.slice(0, normalizedIndex)
    ];
}

/**
 * 根據飛布軌跡生成放置順序
 * 
 * 給定飛布軌跡和起始宮位，計算元素應當放置的宮位順序。
 * 此函數用於天盤、八門、九星、八神的飛布運算。
 * 
 * @param {Array<number>} flyPath - 飛布軌跡陣列
 * @param {number} startPalaceIndex - 起始宮位在九宮中的索引
 * @returns {Array<number>} 放置順序陣列
 */
export function generatePutSequence(flyPath, startPalaceIndex) {
    const pathIndex = flyPath.indexOf(startPalaceIndex);
    if (pathIndex === -1) {
        // 若起始宮位不在軌跡中（如中宮），使用替代宮位
        const substituteIndex = flyPath.indexOf(ZHONG_SUBSTITUTE);
        return rotateArrayFromIndex(flyPath, substituteIndex);
    }
    return rotateArrayFromIndex(flyPath, pathIndex);
}

/**
 * 根據飛布軌跡進行旋轉映射
 * 
 * 此函數實現天盤與九星的核心運算邏輯：
 * 以 targetIndex 為放置起點、sourceIndex 為取值起點，
 * 沿飛布軌跡將來源陣列的元素映射至結果陣列。
 * 
 * @param {Array} sourceArray - 來源陣列（如地盤或原始九星）
 * @param {Array<number>} flyPath - 飛布軌跡
 * @param {number} sourceStartIndex - 取值起點（如符首位置）
 * @param {number} targetStartIndex - 放置起點（如時干位置）
 * @returns {Array} 映射後的結果陣列
 */
export function rotateMapping(sourceArray, flyPath, sourceStartIndex, targetStartIndex) {
    // 處理中宮替代
    const normalizedSourceStart = sourceStartIndex === PALACE.ZHONG 
        ? ZHONG_SUBSTITUTE 
        : sourceStartIndex;
    const normalizedTargetStart = targetStartIndex === PALACE.ZHONG 
        ? ZHONG_SUBSTITUTE 
        : targetStartIndex;
    
    // 生成取值與放置順序
    const getSequence = generatePutSequence(flyPath, normalizedSourceStart);
    const putSequence = generatePutSequence(flyPath, normalizedTargetStart);
    
    // 執行映射
    const result = new Array(9).fill('');
    for (let i = 0; i < getSequence.length; i++) {
        const sourceIndex = getSequence[i];
        const targetIndex = putSequence[i];
        result[targetIndex] = sourceArray[sourceIndex];
    }
    
    // 中宮保持原值
    result[PALACE.ZHONG] = sourceArray[PALACE.ZHONG];
    
    return result;
}

// ============================================================================
// 索引轉換工具
// ============================================================================

/**
 * 處理中宮替代
 * 
 * 當索引為中宮時，返回替代宮位（坤宮）
 * 此為奇門遁甲的標準處理方式
 * 
 * @param {number} index - 原始宮位索引
 * @returns {number} 處理後的宮位索引
 */
export function normalizeZhongPalace(index) {
    return index === PALACE.ZHONG ? ZHONG_SUBSTITUTE : index;
}

/**
 * 在陣列中查找元素並處理中宮替代
 * 
 * @param {Array} array - 要搜尋的陣列
 * @param {*} element - 要查找的元素
 * @returns {number} 處理過中宮替代的索引
 */
export function findIndexWithZhongNormalization(array, element) {
    const index = array.indexOf(element);
    return normalizeZhongPalace(index);
}

// ============================================================================
// 旬首與符首查詢
// ============================================================================

/**
 * 根據干支時辰查詢所屬旬首
 * 
 * 六十甲子分為六旬，此函數判斷給定干支屬於哪一旬，
 * 並返回該旬的旬首（甲子、甲戌、甲申、甲午、甲辰、甲寅之一）
 * 
 * @param {string} ganzhi - 干支時辰（如「丙寅」）
 * @returns {string|null} 旬首，若無法匹配則返回 null
 */
export function getXunHead(ganzhi) {
    for (const xunHead of XUN_HEADS) {
        if (SIX_XUNS[xunHead].includes(ganzhi)) {
            return xunHead;
        }
    }
    return null;
}

/**
 * 根據旬首查詢符首
 * 
 * 符首即甲所遁藏的六儀
 * 甲子遁戊、甲戌遁己、甲申遁庚、甲午遁辛、甲辰遁壬、甲寅遁癸
 * 
 * @param {string} xunHead - 旬首
 * @returns {string|undefined} 符首天干
 */
export function getFuShou(xunHead) {
    return XUN_TO_HEAD[xunHead];
}

/**
 * 計算飛布步數
 * 
 * 計算當前時辰距離旬首已過了多少個時辰（0-9）
 * 此步數用於八門飛布運算
 * 
 * @param {string} xunHead - 旬首
 * @param {string} currentTime - 當前干支時辰
 * @returns {number} 飛布步數（0-9）
 */
export function calculateFlyStep(xunHead, currentTime) {
    const xunArray = SIX_XUNS[xunHead];
    if (!xunArray) {
        return 0;
    }
    return xunArray.indexOf(currentTime);
}

/**
 * 查詢孤虛方位
 * 
 * 根據干支查詢該時空的孤虛方位
 * 用於「坐孤擊虛」的戰術決策
 * 
 * @param {string} ganzhi - 干支
 * @returns {Array<string>|undefined} 孤虛方位陣列
 */
export function getKongWangDirection(ganzhi) {
    const xunHead = getXunHead(ganzhi);
    return xunHead ? XUN_TO_KONGWANG_DIRECTION[xunHead] : undefined;
}

// ============================================================================
// 天干處理工具
// ============================================================================

/**
 * 處理甲遁邏輯
 * 
 * 當時干為甲時，以符首取代之進行運算
 * 此為「遁甲」概念的核心實現
 * 
 * @param {string} tianGan - 當前時干
 * @param {string} fuShou - 符首
 * @returns {string} 用於運算的天干（甲則返回符首，否則返回原值）
 */
export function resolveJiaHiding(tianGan, fuShou) {
    return tianGan === '甲' ? fuShou : tianGan;
}

/**
 * 從干支中提取天干
 * 
 * @param {string} ganzhi - 干支字串（如「甲子」）
 * @returns {string} 天干
 */
export function extractTianGan(ganzhi) {
    return ganzhi.substring(0, 1);
}

/**
 * 從干支中提取地支
 * 
 * @param {string} ganzhi - 干支字串（如「甲子」）
 * @returns {string} 地支
 */
export function extractDiZhi(ganzhi) {
    return ganzhi.substring(1, 2);
}

export default {
    rotateArrayFromIndex,
    generatePutSequence,
    rotateMapping,
    normalizeZhongPalace,
    findIndexWithZhongNormalization,
    getXunHead,
    getFuShou,
    calculateFlyStep,
    getKongWangDirection,
    resolveJiaHiding,
    extractTianGan,
    extractDiZhi
};

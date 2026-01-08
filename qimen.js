/**
 * 奇門遁甲排盤主控模組
 * 
 * 本模組是整套系統的核心調度器，負責：
 * 1. 接收時間參數（年月日時的干支）
 * 2. 計算旬首、符首等時間樞紐
 * 3. 依序調用各層運算模組
 * 4. 整合所有結果並輸出完整盤局
 * 
 * 使用方式：
 * const result = generateQimenChart(dateTimeString, [年柱, 月柱, 日柱, 時柱, 局數, 陰陽]);
 */

import { Solar } from 'lunar-javascript';

import {
    getXunHead,
    getFuShou,
    calculateFlyStep,
    getKongWangDirection,
    resolveJiaHiding,
    extractTianGan
} from './utils.js';

import { JIEQI_JUSHU, YUAN_NAMES } from './constants.js';

import {
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
    getZhiShiPosition,
    calculateJuByChaiBu
} from './calculations.js';

// ============================================================================
// 輸入參數驗證
// ============================================================================

/**
 * 驗證輸入參數
 * 
 * @param {Array} data - 輸入資料陣列
 * @throws {Error} 若參數無效則拋出錯誤
 */
function validateInput(data) {
    if (!Array.isArray(data) || data.length < 6) {
        throw new Error('輸入資料格式錯誤：必須包含 [年柱, 月柱, 日柱, 時柱, 局數, 陰陽]');
    }
    
    const [yearPillar, monthPillar, dayPillar, timePillar, gameNumber, yinYang] = data;
    
    // 驗證干支格式（應為兩個字）
    [yearPillar, monthPillar, dayPillar, timePillar].forEach((pillar, index) => {
        if (typeof pillar !== 'string' || pillar.length !== 2) {
            const pillarNames = ['年柱', '月柱', '日柱', '時柱'];
            throw new Error(`${pillarNames[index]}格式錯誤：必須為兩個字的干支（如「甲子」）`);
        }
    });
    
    // 驗證局數
    if (!Number.isInteger(gameNumber) || gameNumber < 1 || gameNumber > 9) {
        throw new Error('局數必須為 1-9 的整數');
    }
    
    // 驗證陰陽
    if (yinYang !== '陰' && yinYang !== '陽') {
        throw new Error('陰陽必須為「陰」或「陽」');
    }
}

// ============================================================================
// 四柱資訊提取
// ============================================================================

/**
 * 提取四柱天干
 * 
 * @param {string} yearPillar - 年柱
 * @param {string} monthPillar - 月柱
 * @param {string} dayPillar - 日柱
 * @param {string} timePillar - 時柱
 * @returns {Object} 四柱天干物件
 */
function extractFourPillarGans(yearPillar, monthPillar, dayPillar, timePillar) {
    return {
        yearGan: extractTianGan(yearPillar),
        monthGan: extractTianGan(monthPillar),
        dayGan: extractTianGan(dayPillar),
        timeGan: extractTianGan(timePillar)
    };
}

/**
 * 計算四柱孤虛方位
 * 
 * @param {string} yearPillar - 年柱
 * @param {string} monthPillar - 月柱
 * @param {string} dayPillar - 日柱
 * @param {string} timePillar - 時柱
 * @returns {Object} 四柱孤虛方位物件
 */
function calculateFourPillarKongWang(yearPillar, monthPillar, dayPillar, timePillar) {
    return {
        yearKongWang: getKongWangDirection(yearPillar),
        monthKongWang: getKongWangDirection(monthPillar),
        dayKongWang: getKongWangDirection(dayPillar),
        timeKongWang: getKongWangDirection(timePillar)
    };
}

// ============================================================================
// 主控函數
// ============================================================================

/**
 * 生成奇門遁甲盤局
 * 
 * 此函數是整套系統的入口點，接收時間參數並輸出完整的奇門盤局。
 * 
 * @param {string} dateTimeString - 日期時間字串（用於標識，如「2024010112」）
 * @param {Array} data - 輸入資料 [年柱, 月柱, 日柱, 時柱, 局數, 陰陽]
 * @returns {Map} 完整的盤局結果
 * 
 * @example
 * const result = generateQimenChart('2024010112', ['甲辰', '丙寅', '戊午', '庚申', 5, '陽']);
 */
export function generateQimenChart(dateTimeString, data) {
    // 1. 參數驗證
    validateInput(data);
    
    // 2. 解析輸入參數
    const [yearPillar, monthPillar, dayPillar, timePillar, gameNumber, yinYangStr] = data;
    const isYang = yinYangStr === '陽';
    
    // 3. 提取四柱天干
    const { yearGan, monthGan, dayGan, timeGan } = 
        extractFourPillarGans(yearPillar, monthPillar, dayPillar, timePillar);
    
    // 4. 計算時間樞紐：旬首與符首
    const xunHead = getXunHead(timePillar);
    const fuShou = getFuShou(xunHead);
    
    // 5. 處理甲遁邏輯：若時干為甲，以符首取代之
    const effectiveTimeGan = resolveJiaHiding(timeGan, fuShou);
    
    // 6. 計算基礎盤面
    const heTu = getHeTu();
    const luoShu = getLuoShu();
    const flyingStars = calculateFlyingStars(gameNumber);
    
    // 7. 第一層：地盤
    const diPan = getDiPan(isYang, gameNumber);
    
    // 8. 第二層：天盤
    const tianPan = calculateTianPan(isYang, effectiveTimeGan, fuShou, diPan);
    
    // 9. 第三層：八門
    const originalDoors = getOriginalDoors();
    const zhiShiDoor = getZhiShiDoor(fuShou, diPan);
    const flyStep = calculateFlyStep(xunHead, timePillar);
    const eightDoors = calculateEightDoors(isYang, zhiShiDoor, flyStep, fuShou, diPan);
    const zhiShiPosition = getZhiShiPosition(zhiShiDoor, eightDoors);
    
    // 10. 第四層：九星
    const originalStars = getOriginalStars();
    const zhiFuStar = getZhiFuStar(fuShou, diPan);
    const zhiFuPosition = getZhiFuPosition(effectiveTimeGan, diPan);
    const nineStars = calculateNineStars(zhiFuStar, effectiveTimeGan, diPan);
    const tianQinDirection = getTianQinDirection(nineStars);
    
    // 11. 第五層：八神
    const eightGods = calculateEightGods(isYang, effectiveTimeGan, diPan);
    
    // 12. 計算四柱孤虛
    const { yearKongWang, monthKongWang, dayKongWang, timeKongWang } = 
        calculateFourPillarKongWang(yearPillar, monthPillar, dayPillar, timePillar);
    
    // 13. 封裝結果
    const resultMap = new Map();
    
    // 四柱資訊
    resultMap.set('年柱', yearPillar);
    resultMap.set('年孤虛', yearKongWang);
    resultMap.set('月柱', monthPillar);
    resultMap.set('月孤虛', monthKongWang);
    resultMap.set('日柱', dayPillar);
    resultMap.set('日孤虛', dayKongWang);
    resultMap.set('時柱', timePillar);
    resultMap.set('時孤虛', timeKongWang);
    resultMap.set('時干', timeGan);
    
    // 局數與陰陽
    resultMap.set('陰陽', yinYangStr);
    resultMap.set('局數', gameNumber);
    
    // 時間樞紐
    resultMap.set('旬首', xunHead);
    resultMap.set('符首', fuShou);
    resultMap.set('值使', zhiShiDoor);
    resultMap.set('值符', zhiFuStar);
    resultMap.set('值符落宮', zhiFuPosition);
    resultMap.set('值使落宮', zhiShiPosition);
    resultMap.set('飛步', flyStep);
    
    // 基礎盤面
    resultMap.set('河圖', heTu);
    resultMap.set('方位', luoShu);
    resultMap.set('九宮', flyingStars);
    
    // 五層盤局
    resultMap.set('地盤', diPan);
    resultMap.set('地門', originalDoors);
    resultMap.set('天盤', tianPan);
    resultMap.set('天門', eightDoors);
    resultMap.set('原星', originalStars);
    resultMap.set('九星', nineStars);
    resultMap.set('天禽寄宮', tianQinDirection);
    resultMap.set('八神', eightGods);
    
    return resultMap;
}

/**
 * 將盤局結果轉換為物件格式
 * 
 * 某些情況下使用物件比 Map 更方便，此函數提供轉換功能
 * 
 * @param {Map} resultMap - generateQimenChart 的輸出
 * @returns {Object} 物件格式的盤局結果
 */
export function chartToObject(resultMap) {
    const result = {};
    for (const [key, value] of resultMap) {
        result[key] = value;
    }
    return result;
}

/**
 * 將盤局結果轉換為 JSON 字串
 *
 * @param {Map} resultMap - generateQimenChart 的輸出
 * @param {number} indent - 縮排空格數（預設為 2）
 * @returns {string} JSON 字串
 */
export function chartToJSON(resultMap, indent = 2) {
    return JSON.stringify(chartToObject(resultMap), null, indent);
}

// ============================================================================
// 便捷起盤函數
// ============================================================================

/**
 * 解析日期時間字串
 *
 * @param {string} datetime - 日期時間字串，格式：yyyyMMddHH
 * @returns {Object} 解析後的年月日時
 * @throws {Error} 若格式無效則拋出錯誤
 */
function parseDatetime(datetime) {
    if (typeof datetime !== 'string' || datetime.length !== 10) {
        throw new Error('日期時間格式錯誤：必須為 yyyyMMddHH 格式（10 位數字）');
    }

    const year = parseInt(datetime.substring(0, 4), 10);
    const month = parseInt(datetime.substring(4, 6), 10);
    const day = parseInt(datetime.substring(6, 8), 10);
    const hour = parseInt(datetime.substring(8, 10), 10);

    // 驗證數值範圍
    if (isNaN(year) || year < 1 || year > 9999) {
        throw new Error('年份無效：必須為 1-9999');
    }
    if (isNaN(month) || month < 1 || month > 12) {
        throw new Error('月份無效：必須為 1-12');
    }
    if (isNaN(day) || day < 1 || day > 31) {
        throw new Error('日期無效：必須為 1-31');
    }
    if (isNaN(hour) || hour < 0 || hour > 23) {
        throw new Error('小時無效：必須為 0-23');
    }

    return { year, month, day, hour };
}

/**
 * 從 Solar 物件生成盤局
 *
 * @param {Solar} solar - lunar-javascript 的 Solar 物件
 * @param {string} label - 盤局標識
 * @returns {Object} 包含盤局和定局資訊的物件
 */
function generateChartFromSolar(solar, label) {
    const lunar = solar.getLunar();

    // 取得四柱（使用精確計算，考慮節氣交接）
    const yearPillar = lunar.getYearInGanZhiExact();
    const monthPillar = lunar.getMonthInGanZhiExact();
    const dayPillar = lunar.getDayInGanZhiExact();
    const timePillar = lunar.getTimeInGanZhi();

    // 拆補法定局
    const juResult = calculateJuByChaiBu(solar, JIEQI_JUSHU, YUAN_NAMES);

    // 組合輸入參數
    const data = [
        yearPillar,
        monthPillar,
        dayPillar,
        timePillar,
        juResult.gameNumber,
        juResult.yinYang
    ];

    // 生成盤局
    const chart = generateQimenChart(label, data);

    return {
        chart,
        juResult,
        solar,
        lunar
    };
}

/**
 * 從日期時間字串直接起盤
 *
 * 此函數自動完成：
 * 1. 解析日期時間
 * 2. 計算四柱（年月日時干支）
 * 3. 使用拆補法確定局數和陰陽遁
 * 4. 生成完整盤局
 *
 * @param {string} datetime - 日期時間字串，格式：yyyyMMddHH（24小時制，HH 為 0-23）
 * @returns {Map} 完整的盤局結果，額外包含節氣、三元等定局資訊
 *
 * @example
 * // 2024年1月15日上午10時
 * const chart = generateChartByDatetime('2024011510');
 * const obj = chartToObject(chart);
 * console.log(obj['節氣']);  // 小寒
 * console.log(obj['三元']);  // 中元
 * console.log(obj['局數']);  // 8
 */
export function generateChartByDatetime(datetime) {
    // 解析日期時間
    const { year, month, day, hour } = parseDatetime(datetime);

    // 建立 Solar 物件
    const solar = Solar.fromYmdHms(year, month, day, hour, 0, 0);

    // 生成盤局
    const { chart, juResult } = generateChartFromSolar(solar, datetime);

    // 附加定局資訊到結果
    chart.set('節氣', juResult.jieQiName);
    chart.set('三元', juResult.yuanName);
    chart.set('節後天數', juResult.daysSinceJieQi);

    return chart;
}

/**
 * 依據當前時間起盤
 *
 * 此函數使用系統當前時間自動起盤，適用於即時占卜。
 *
 * @returns {Map} 完整的盤局結果，額外包含節氣、三元等定局資訊
 *
 * @example
 * const chart = generateChartNow();
 * const obj = chartToObject(chart);
 * console.log(obj['年柱'], obj['月柱'], obj['日柱'], obj['時柱']);
 * console.log(obj['節氣'], obj['三元'], obj['局數']);
 */
export function generateChartNow() {
    const now = new Date();

    // 格式化為 yyyyMMddHH
    const datetime =
        now.getFullYear().toString() +
        (now.getMonth() + 1).toString().padStart(2, '0') +
        now.getDate().toString().padStart(2, '0') +
        now.getHours().toString().padStart(2, '0');

    return generateChartByDatetime(datetime);
}

export default {
    generateQimenChart,
    generateChartByDatetime,
    generateChartNow,
    chartToObject,
    chartToJSON
};

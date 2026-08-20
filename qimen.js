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
 * const result = generateQimenChart({ 年柱, 月柱, 日柱, 時柱, 局數, 陰陽 });
 */

import { Solar } from 'lunar-javascript';

import {
    getXunHead,
    getFuShou,
    calculateFlyStep,
    getXunKongWang,
    getGuXu,
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
    isZhiShiInCenter,
    isZhiFuInCenter,
    calculateEightDoors,
    getOriginalStars,
    getZhiFuStar,
    getZhiFuStarPosition,
    calculateNineStars,
    getTianQinDirection,
    calculateEightGods,
    getZhiShiPosition,
    calculateJuByChaiBu
} from './calculations.js';

// ============================================================================
// 輸入正規化與驗證
// ============================================================================

/** 四柱物件的鍵名順序，同時也是舊式位置陣列的順序 */
const PILLAR_KEYS = ['年柱', '月柱', '日柱', '時柱', '局數', '陰陽'];

/**
 * 將呼叫端的輸入正規化為內部使用的位置陣列
 *
 * 支援兩種形式：
 * - 具名物件（建議）：generateQimenChart({ 年柱, 月柱, 日柱, 時柱, 局數, 陰陽 })
 * - 位置陣列（舊式）：generateQimenChart(label, [年柱, 月柱, 日柱, 時柱, 局數, 陰陽])
 *
 * 舊式的第一個參數從未被使用過——它既不參與運算，也不出現在結果中。
 * 位置陣列還有個實際風險：日柱與時柱寫反不會報錯，只會安靜地產出另一張盤。
 *
 * @param {Object|string|Array} first - 四柱物件，或（舊式）標識字串
 * @param {Array} [second] - （舊式）四柱位置陣列
 * @returns {Array} 內部使用的位置陣列
 */
function normalizeChartInput(first, second) {
    if (Array.isArray(second)) return second;   // 舊式 (label, data)
    if (Array.isArray(first)) return first;     // 直接傳陣列
    if (first && typeof first === 'object') {
        return PILLAR_KEYS.map(key => first[key]);
    }
    throw new Error(
        '輸入格式錯誤：請傳入 { 年柱, 月柱, 日柱, 時柱, 局數, 陰陽 } 物件'
    );
}

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
    
    // 驗證干支格式與有效性
    const pillarNames = ['年柱', '月柱', '日柱', '時柱'];
    [yearPillar, monthPillar, dayPillar, timePillar].forEach((pillar, index) => {
        if (typeof pillar !== 'string' || pillar.length !== 2) {
            throw new Error(`${pillarNames[index]}格式錯誤：必須為兩個字的干支（如「甲子」）`);
        }
        // 僅檢查長度不足以擋下「甲乙」這類非法組合：查不到旬首會讓符首成為 undefined，
        // 後續 indexOf 全部回傳 -1，最終產出一張看似完整、實則無意義的盤而不報錯。
        if (getXunHead(pillar) === null) {
            throw new Error(`${pillarNames[index]}不是有效的干支：${pillar}（必須為六十甲子之一）`);
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
 * 計算四柱的旬空與孤虛
 *
 * 兩者是不同的概念，須分別給出：
 *
 * - 旬空：該柱所屬旬的兩個空亡地支之方位（孤），及其對沖方（虛）。
 *   《奇門遁甲統宗》稱之為「旬孤」。
 * - 孤虛：統宗〈孤虛〉「年月日時俱以前一位空亡為孤，孤沖為虛。
 *   如子年亥為孤，巳為虛」——逐支推算，與該柱屬於哪一旬無關。
 *
 * 舊版只輸出旬空亡的方位，卻掛上「孤虛」之名，且缺少「虛」。
 *
 * @param {Array<string>} pillars - [年柱, 月柱, 日柱, 時柱]
 * @returns {Array<Object>} 各柱的 { xunKong, guXu }
 */
function calculatePillarVoids(pillars) {
    return pillars.map(pillar => ({
        xunKong: getXunKongWang(pillar),
        guXu: getGuXu(pillar)
    }));
}

// ============================================================================
// 主控函數
// ============================================================================

/**
 * 生成奇門遁甲盤局
 *
 * 此函數是整套系統的入口點，接收四柱與局數並輸出完整的奇門盤局。
 *
 * @param {Object} pillars - 四柱與局數
 * @param {string} pillars.年柱 - 年柱干支
 * @param {string} pillars.月柱 - 月柱干支
 * @param {string} pillars.日柱 - 日柱干支
 * @param {string} pillars.時柱 - 時柱干支
 * @param {number} pillars.局數 - 局數 1-9
 * @param {string} pillars.陰陽 - 「陽」或「陰」
 * @returns {Map} 完整的盤局結果
 *
 * @example
 * const result = generateQimenChart({
 *     年柱: '甲辰', 月柱: '丙寅', 日柱: '戊午', 時柱: '庚申',
 *     局數: 5, 陰陽: '陽'
 * });
 *
 * @example <caption>舊式簽名仍可使用，但不建議</caption>
 * const result = generateQimenChart('2024010112', ['甲辰', '丙寅', '戊午', '庚申', 5, '陽']);
 */
export function generateQimenChart(pillars, legacyData) {
    // 1. 輸入正規化與驗證
    const data = normalizeChartInput(pillars, legacyData);
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
    const flyingStars = calculateFlyingStars(gameNumber, isYang);
    
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
    // 落宮因寄坤而看不出「值使在五宮」，另立旗標供格局判斷使用
    const zhiShiInCenter = isZhiShiInCenter(isYang, flyStep, fuShou, diPan);
    
    // 10. 第四層：九星
    const originalStars = getOriginalStars();
    const zhiFuStar = getZhiFuStar(fuShou, diPan);
    const nineStars = calculateNineStars(zhiFuStar, effectiveTimeGan, diPan);
    // 落宮由九星飛布結果反查，確保與「九星」陣列永遠一致
    const zhiFuPosition = getZhiFuStarPosition(zhiFuStar, nineStars);
    const zhiFuInCenter = isZhiFuInCenter(effectiveTimeGan, diPan);
    const tianQinDirection = getTianQinDirection(nineStars);
    
    // 11. 第五層：八神
    const eightGods = calculateEightGods(isYang, effectiveTimeGan, diPan);
    
    // 12. 計算四柱旬空與孤虛
    const fourPillars = [yearPillar, monthPillar, dayPillar, timePillar];
    const voids = calculatePillarVoids(fourPillars);
    
    // 13. 封裝結果
    const resultMap = new Map();
    
    // 四柱資訊
    const PILLAR_LABELS = ['年', '月', '日', '時'];
    fourPillars.forEach((pillar, index) => {
        const label = PILLAR_LABELS[index];
        resultMap.set(label + '柱', pillar);
        resultMap.set(label + '旬空', voids[index].xunKong);
        resultMap.set(label + '孤虛', voids[index].guXu);
    });
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
    resultMap.set('值符入中', zhiFuInCenter);
    resultMap.set('值使落宮', zhiShiPosition);
    resultMap.set('值使入中', zhiShiInCenter);
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
 * 取得指定年月的實際天數（西曆閏年規則）
 *
 * @param {number} year - 西元年
 * @param {number} month - 月份 1-12
 * @returns {number} 該月天數
 */
function getDaysInMonth(year, month) {
    const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const daysPerMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return daysPerMonth[month - 1];
}

/**
 * 解析日期時間字串
 *
 * @param {string} datetime - 日期時間字串，格式：yyyyMMddHH
 * @returns {Object} 解析後的年月日時
 * @throws {Error} 若格式無效則拋出錯誤
 */
function parseDatetime(datetime) {
    // 必須是純數字：先前用 parseInt 逐段解析，'2024011X10' 會被靜默當成 2024-01-01
    if (typeof datetime !== 'string' || !/^[0-9]{10}$/.test(datetime)) {
        throw new Error('日期時間格式錯誤：必須為 yyyyMMddHH 格式（10 位數字）');
    }

    const year = parseInt(datetime.substring(0, 4), 10);
    const month = parseInt(datetime.substring(4, 6), 10);
    const day = parseInt(datetime.substring(6, 8), 10);
    const hour = parseInt(datetime.substring(8, 10), 10);

    // 驗證數值範圍
    if (year < 1 || year > 9999) {
        throw new Error('年份無效：必須為 1-9999');
    }
    if (month < 1 || month > 12) {
        throw new Error('月份無效：必須為 1-12');
    }
    // 依實際月份天數檢查，否則 2 月 31 日會被靜默進位到 3 月
    const maxDay = getDaysInMonth(year, month);
    if (day < 1 || day > maxDay) {
        throw new Error(`日期無效：${year} 年 ${month} 月僅有 ${maxDay} 天，收到 ${day}`);
    }
    if (hour < 0 || hour > 23) {
        throw new Error('小時無效：必須為 0-23');
    }

    return { year, month, day, hour };
}

/**
 * 從 Solar 物件生成盤局
 *
 * @param {Solar} solar - lunar-javascript 的 Solar 物件
 * @returns {Object} 包含盤局和定局資訊的物件
 */
function generateChartFromSolar(solar) {
    const lunar = solar.getLunar();

    // 取得四柱（使用精確計算，考慮節氣交接）
    const yearPillar = lunar.getYearInGanZhiExact();
    const monthPillar = lunar.getMonthInGanZhiExact();
    const dayPillar = lunar.getDayInGanZhiExact();
    const timePillar = lunar.getTimeInGanZhi();

    // 拆補法定局
    const juResult = calculateJuByChaiBu(solar, JIEQI_JUSHU, YUAN_NAMES);

    // 生成盤局
    const chart = generateQimenChart({
        年柱: yearPillar,
        月柱: monthPillar,
        日柱: dayPillar,
        時柱: timePillar,
        局數: juResult.gameNumber,
        陰陽: juResult.yinYang
    });

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
    const { chart, juResult } = generateChartFromSolar(solar);

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

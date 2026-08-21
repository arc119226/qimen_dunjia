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

import { JIEQI_JUSHU, YUAN_NAMES, TIME_BASIS, CALENDAR_BASIS } from './constants.js';

import {
    calculateJuByFuTou,
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
    getTianQinPosition,
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
    resultMap.set('天禽落宮', getTianQinPosition(nineStars));

    // 中宮之儀隨天禽出宮——《欽定古今圖書集成》〈釋時悖格〉：「六丙在五宮，
    // 寄坤二宮，以直符天芮加時干，即六丙下臨六丁於四宮，此名時悖也。」
    // 轉盤的天盤是八宮剛性環轉，中宮不在環上，故中宮沒有自己的天盤干；
    // 其地盤之儀的去向由此欄位表達，判斷層據以不對中宮發格。
    resultMap.set('中宮寄干', Object.freeze({
        干: diPan[4],
        落宮: getTianQinPosition(nineStars)
    }));
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
 * 夜子時：日柱換日之界的兩派
 *
 * 夜間十一時至十二時（子時前半）究竟算**當日**還是**次日**，兩派並存，
 * 而這不是邊角——它佔全部時辰的十二分之一（8.3%），且日柱一翻，
 * 旬首、符首、值符、值使、拆補法的節後天數全部連鎖改變，是整張盤改。
 *
 * 兩派給的是**兩張完全不同的盤**，無法像格局的異說那樣在同一輸出中並列，
 * 故比照定局法作為選項處理，並在輸出中自陳所用者。
 *
 * 時柱隨日柱而變（五鼠遁「甲己還加甲，乙庚丙作初，丙辛從戊起，
 * 丁壬庚子居，戊癸壬子頭」）。以 2024-01-15 23:00 為例：
 *
 *   次日派：日柱己卯、時柱甲子（己日子時，甲己還加甲）
 *   當日派：日柱戊寅、時柱壬子（戊日子時，戊癸壬子頭）
 *
 * lunar-javascript 的 `getTimeInGanZhi()` 綁在 `getDayInGanZhiExact()` 上，
 * 故當日派的時干須另行由五鼠遁推得。
 */
const YE_ZI_SHI_SCHOOLS = Object.freeze(['次日', '當日']);

/** 五鼠遁：日干 → 子時之干 */
const WU_SHU_DUN = Object.freeze({
    甲: '甲', 己: '甲', 乙: '丙', 庚: '丙', 丙: '戊',
    辛: '戊', 丁: '庚', 壬: '庚', 戊: '壬', 癸: '壬'
});

const TEN_GANS = Object.freeze(['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸']);
const TWELVE_ZHIS = Object.freeze(['子', '丑', '寅', '卯', '辰', '巳',
                                   '午', '未', '申', '酉', '戌', '亥']);

/** 由日干與時支推時柱（五鼠遁） */
function timePillarFrom(dayGan, hourZhi) {
    const start = WU_SHU_DUN[dayGan];
    if (!start) throw new Error(`未知的日干：${dayGan}`);
    const offset = TWELVE_ZHIS.indexOf(hourZhi);
    if (offset < 0) throw new Error(`未知的時支：${hourZhi}`);
    return TEN_GANS[(TEN_GANS.indexOf(start) + offset) % 10] + hourZhi;
}

/**
 * 依所選之派取日柱與時柱
 *
 * @param {Object} lunar - lunar-javascript 的 Lunar 對象
 * @param {string} school - '次日'（預設）或 '當日'
 * @returns {{日柱: string, 時柱: string, 夜子時: string, 換日: boolean}}
 */
function resolveDayAndTimePillar(lunar, school) {
    if (!YE_ZI_SHI_SCHOOLS.includes(school)) {
        throw new Error(`未知的夜子時流派：${school}（可用：${YE_ZI_SHI_SCHOOLS.join('、')}）`);
    }

    // 兩者相異，即代表所問時刻落在夜子時（夜間十一時至十二時）
    const nextDay = lunar.getDayInGanZhiExact();
    const sameDay = lunar.getDayInGanZhiExact2();
    const inNightZi = nextDay !== sameDay;

    if (school === '次日' || !inNightZi) {
        return {
            日柱: nextDay,
            時柱: lunar.getTimeInGanZhi(),
            夜子時: school,
            落於夜子時: inNightZi
        };
    }

    // 當日派：日柱不進位，時柱亦須改由當日之干起五鼠遁
    const hourZhi = lunar.getTimeInGanZhi()[1];
    return {
        日柱: sameDay,
        時柱: timePillarFrom(sameDay[0], hourZhi),
        夜子時: school,
        落於夜子時: true
    };
}

/**
 * 定局法：由選項挑選定局函數
 *
 * 拆補法（預設）自節氣交接時刻起算天數；符頭法以甲己日為符頭、行超神接氣置閏，
 * 是九部典籍的主流。兩者對同一時刻幾乎總是給出不同局數，故必須明示所用者。
 */
const JU_METHODS = Object.freeze({
    拆補: calculateJuByChaiBu,
    符頭: calculateJuByFuTou
});

/**
 * 從 Solar 物件生成盤局
 *
 * @param {Solar} solar - lunar-javascript 的 Solar 物件
 * @param {Object} [options] - 選項
 * @param {string} [options.定局法] - 「拆補」（預設）或「符頭」
 * @param {string} [options.夜子時] - 「次日」（預設）或「當日」
 * @returns {Object} 包含盤局和定局資訊的物件
 */
function generateChartFromSolar(solar, options = {}) {
    const lunar = solar.getLunar();

    // 取得四柱（使用精確計算，考慮節氣交接）
    const yearPillar = lunar.getYearInGanZhiExact();
    const monthPillar = lunar.getMonthInGanZhiExact();
    // 夜子時的日柱換日之界有兩派，兩派給的是兩張完全不同的盤，故作為選項
    const nightZi = resolveDayAndTimePillar(lunar, options.夜子時 || '次日');
    const dayPillar = nightZi.日柱;
    const timePillar = nightZi.時柱;

    // 定局
    const methodName = options.定局法 || '拆補';
    const method = JU_METHODS[methodName];
    if (!method) {
        throw new Error(`未知的定局法：${methodName}（可用：${Object.keys(JU_METHODS).join('、')}）`);
    }
    const juResult = method(solar, JIEQI_JUSHU, YUAN_NAMES);

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
        nightZi,
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
 * @param {Object} [options] - 選項
 * @param {string} [options.定局法] - 「拆補」（預設，自節氣交接時刻起算）或
 *                                    「符頭」（甲己符頭，超神接氣置閏，典籍主流）
 * @param {string} [options.夜子時] - 夜間十一時至十二時的日柱歸屬：
 *                                    「次日」（預設）或「當日」。兩派給出兩張不同的盤
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
export function generateChartByDatetime(datetime, options = {}) {
    // 解析日期時間
    const { year, month, day, hour } = parseDatetime(datetime);

    // 建立 Solar 物件
    const solar = Solar.fromYmdHms(year, month, day, hour, 0, 0);

    // 生成盤局
    const { chart, juResult, nightZi } = generateChartFromSolar(solar, options);

    // 附加定局資訊到結果
    chart.set('節氣', juResult.jieQiName);
    chart.set('三元', juResult.yuanName);
    chart.set('定局法', juResult.定局法 || '拆補');
    chart.set('夜子時', nightZi.夜子時);
    chart.set('落於夜子時', nightZi.落於夜子時);

    // 基準自陳：這張盤的節氣取自哪一種曆、輸入被當成哪一種時。
    // 兩者都不改動任何一格盤面，但不宣告，使用者就無從得知自己拿到的是什麼。
    chart.set('時間基準', TIME_BASIS);
    chart.set('曆法基準', CALENDAR_BASIS);
    if (juResult.定局法 === '符頭') {
        chart.set('符頭', juResult.符頭);
        chart.set('上元符頭', juResult.上元符頭);
        chart.set('超接', juResult.超接);
        chart.set('超接天數', juResult.超接天數);
        chart.set('閏局', juResult.閏局);
    } else {
        chart.set('節後天數', juResult.daysSinceJieQi);
    }

    return chart;
}

/**
 * 依據當前時間起盤
 *
 * 此函數使用系統當前時間自動起盤，適用於即時占卜。
 *
 * @param {Object} [options] - 選項，同 generateChartByDatetime
 * @param {string|number} [options.時區] - 目標時區，如 'UTC+8'、'+8'、8。
 *                                        未指定則取本機牆上時鐘（行為不變），
 *                                        並在「時鐘來源」自陳其與盤面基準的落差
 * @returns {Map} 完整的盤局結果，額外包含節氣、三元等定局資訊
 *
 * @example
 * const chart = generateChartNow();
 * const obj = chartToObject(chart);
 * console.log(obj['年柱'], obj['月柱'], obj['日柱'], obj['時柱']);
 * console.log(obj['節氣'], obj['三元'], obj['局數']);
 */
export function generateChartNow(options = {}) {
    const now = new Date();
    const source = resolveNowClock(now, options.時區);

    const chart = generateChartByDatetime(source.datetime, options);
    chart.set('時鐘來源', source.來源);
    return chart;
}

/**
 * 決定「現在」該取哪一個牆上時刻
 *
 * 不設猜測性預設：未指定 `時區` 時，維持原有行為（直接取本機牆上時鐘），
 * 並在輸出中自陳其與盤面基準的落差。**只陳述不代為換算**——多數流派
 * 對境外起課用當地時間定時辰，逕自換成 UTC+8 等於替使用者選了一派。
 *
 * 指定 `時區` 時（如 `'UTC+8'`、`'UTC-5'`、`8`、`-5`），則把當下這一瞬間
 * 換算到該時區的牆上時刻。這是明示的選擇，故不再有「落差」可言。
 *
 * @param {Date} now - 當下時刻
 * @param {string|number} [zone] - 目標時區，如 'UTC+8' 或 8
 */
function resolveNowClock(now, zone) {
    if (zone === undefined || zone === null) {
        return { datetime: formatWallClock(now), 來源: describeLocalClock(now) };
    }

    const offsetMinutes = parseUtcOffset(zone);
    // 由 UTC 加上目標偏移，得該時區的牆上時刻
    const shifted = new Date(now.getTime() + offsetMinutes * 60000);
    return {
        datetime: formatWallClockUtc(shifted),
        來源: Object.freeze({
            來源: '指定時區',
            指定時區: formatUtcOffset(offsetMinutes),
            盤面基準: formatUtcOffset(CHART_UTC_OFFSET_MINUTES),
            與盤面基準時差: (offsetMinutes - CHART_UTC_OFFSET_MINUTES) / 60,
            一致: offsetMinutes === CHART_UTC_OFFSET_MINUTES,
            警告: offsetMinutes === CHART_UTC_OFFSET_MINUTES
                ? null
                : `所指定的 ${formatUtcOffset(offsetMinutes)} 與盤面基準 ` +
                  `${formatUtcOffset(CHART_UTC_OFFSET_MINUTES)} 不同。節氣交接時刻算在` +
                  `盤面基準，故所排之盤是「該時區牆上時刻」被當成盤面基準時刻的結果——` +
                  `這是您明示的選擇，非程式所猜。`
        })
    };
}

/** 解析 'UTC+8'、'+8'、'8'、8、'UTC-05:30' 等寫法，回傳相對 UTC 的分鐘數 */
function parseUtcOffset(zone) {
    if (typeof zone === 'number') {
        if (!Number.isFinite(zone) || Math.abs(zone) > 14) {
            throw new Error(`時區偏移超出範圍：${zone}（應在 -14 至 +14 之間）`);
        }
        return Math.round(zone * 60);
    }
    if (typeof zone !== 'string') {
        throw new Error(`無法解析的時區：${JSON.stringify(zone)}`);
    }
    const matched = /^(?:UTC|GMT)?\s*([+-]?)(\d{1,2})(?::?(\d{2}))?$/i.exec(zone.trim());
    if (!matched) {
        throw new Error(
            `無法解析的時區：「${zone}」。可用寫法如 'UTC+8'、'+8'、'8'、'UTC-05:30'，或直接給數字 8。`
        );
    }
    const sign = matched[1] === '-' ? -1 : 1;
    const hours = Number(matched[2]);
    const minutes = matched[3] ? Number(matched[3]) : 0;
    if (hours > 14 || minutes > 59) {
        throw new Error(`時區偏移超出範圍：「${zone}」（應在 -14:00 至 +14:00 之間）`);
    }
    return sign * (hours * 60 + minutes);
}

/** 取本機牆上時刻，格式化為 yyyyMMddHH */
function formatWallClock(date) {
    return date.getFullYear().toString() +
        (date.getMonth() + 1).toString().padStart(2, '0') +
        date.getDate().toString().padStart(2, '0') +
        date.getHours().toString().padStart(2, '0');
}

/** 取 UTC 各欄位，格式化為 yyyyMMddHH（用於已位移過的時刻） */
function formatWallClockUtc(date) {
    return date.getUTCFullYear().toString() +
        (date.getUTCMonth() + 1).toString().padStart(2, '0') +
        date.getUTCDate().toString().padStart(2, '0') +
        date.getUTCHours().toString().padStart(2, '0');
}

/** 盤面基準時區相對 UTC 的分鐘數（東經 120 度標準時） */
const CHART_UTC_OFFSET_MINUTES = 8 * 60;

/** 格式化為 UTC±HH:MM */
function formatUtcOffset(minutes) {
    const sign = minutes < 0 ? '-' : '+';
    const absolute = Math.abs(minutes);
    const hours = Math.floor(absolute / 60).toString().padStart(2, '0');
    const rest = (absolute % 60).toString().padStart(2, '0');
    return `UTC${sign}${hours}:${rest}`;
}

/**
 * 自陳本機時鐘與盤面基準的落差
 *
 * generateChartNow 取的是本機牆上時鐘，而節氣交接時刻算在 UTC+8。
 * 兩者不一致時，等於把本地時間當成北京時間排盤——實測同一物理瞬間，
 * UTC 與 UTC+8 得到的日柱與時柱皆不同。
 *
 * 此處只**陳述**不校正：換算成 UTC+8 等於代使用者選了一派
 * （多數流派對境外起課用當地時間定時辰），與本專案「異說並列，不代為擇一」
 * 的原則相違。要指定時區者，請自行換算後改用 generateChartByDatetime。
 */
function describeLocalClock(date) {
    // getTimezoneOffset() 給的是「UTC 減本機」的分鐘數，取負號才是本機相對 UTC 的偏移
    const localOffsetMinutes = -date.getTimezoneOffset();
    const differenceHours = (localOffsetMinutes - CHART_UTC_OFFSET_MINUTES) / 60;
    const consistent = differenceHours === 0;

    return Object.freeze({
        來源: '本機時鐘',
        本機時區: formatUtcOffset(localOffsetMinutes),
        盤面基準: formatUtcOffset(CHART_UTC_OFFSET_MINUTES),
        與盤面基準時差: differenceHours,
        一致: consistent,
        警告: consistent
            ? null
            : `本機時區為 ${formatUtcOffset(localOffsetMinutes)}，` +
              `與盤面基準 ${formatUtcOffset(CHART_UTC_OFFSET_MINUTES)} 相差 ` +
              `${differenceHours} 小時。本機牆上時刻已被直接當成盤面基準時刻排盤，` +
              `日柱與時柱可能與該物理瞬間在盤面基準下的干支不符。` +
              `欲指定時區者，請自行換算後改用 generateChartByDatetime。`
    });
}

export default {
    generateQimenChart,
    generateChartByDatetime,
    generateChartNow,
    chartToObject,
    chartToJSON
};

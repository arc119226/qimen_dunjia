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

import { Solar } from 'lunar-javascript';

import {
    PALACE,
    ZHONG_SUBSTITUTE,
    JIEQI_JUSHU,
    JIEQI_ALIAS,
    FLY_PATH,
    DIRECTION_ARROWS,
    HETU_BAGUA,
    LUOSHU_BAGUA,
    FLYING_STARS,
    FLYING_STAR_CHARTS_YANG,
    FLYING_STAR_CHARTS_YIN,
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
 * 根據入中宮的星數，沿洛書宮位順序（5→6→7→8→9→1→2→3→4宮）飛布，
 * 陽遁順飛、陰遁逆飛。
 *
 * 舊版只有一張固定的逆飛表，連陽遁也套用逆飛盤，導致 5 入中時得到的是
 * 洛書的 180 度反轉而非洛書本身。
 *
 * @param {number} centerStar - 入中宮的星數（1-9）
 * @param {boolean} isYang - 是否為陽局（陽遁順飛、陰遁逆飛）
 * @returns {Array<string>} 九宮各位置的飛星名稱
 */
export function calculateFlyingStars(centerStar, isYang) {
    if (typeof isYang !== 'boolean') {
        throw new Error('calculateFlyingStars 需指定 isYang：陽遁順飛、陰遁逆飛');
    }
    const charts = isYang ? FLYING_STAR_CHARTS_YANG : FLYING_STAR_CHARTS_YIN;
    const starNumbers = charts[centerStar];
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
 * @param {boolean} isYang - 是否為陽局（未使用，僅為維持既有簽名而保留，見下方說明）
 * @param {string} tianGan - 當前時干（已處理甲遁）
 * @param {string} fuShou - 符首
 * @param {Array<string>} diPan - 地盤配置
 * @returns {Array<string>} 天盤九宮分布
 */
export function calculateTianPan(isYang, tianGan, fuShou, diPan) {
    const targetIndex = diPan.indexOf(tianGan);
    const sourceIndex = diPan.indexOf(fuShou);
    
    // 陽局與陰局使用相同的順時針軌跡：轉盤法中天盤是整環剛性旋轉，
    // 陰陽的差異已經編碼在地盤（DIPAN_YANG / DIPAN_YIN）本身，
    // 故此處不需要 isYang。參數保留是為了不破壞既有呼叫端簽名。
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
 * 計算值使門飛抵的宮位（未經中宮替代）
 *
 * 值使自符首宮起飛，陽局順飛、陰局逆飛，步數為該時辰在旬中的序數。
 * 飛布軌跡含中宮，故回傳值可能是中宮——《景祐遁甲符應經》〈釋二遁直符合於中宮〉：
 * 「初辰起，在一宮，歷五時，至戊辰在中宮」，中宮確為飛行途中的一站。
 *
 * 步數超過九宮數時取模，故旬中第十時回到起點，
 * 即〈釋二遁踰於五七歸於九一〉所謂「起於一，終於九，歸於一」。
 *
 * @param {boolean} isYang - 是否為陽局
 * @param {number} flyStep - 飛布步數（0-9）
 * @param {string} fuShou - 符首
 * @param {Array<string>} diPan - 地盤配置
 * @returns {number} 值使落宮索引（未替代，可能為中宮）
 */
export function getZhiShiTargetIndex(isYang, flyStep, fuShou, diPan) {
    const startIndex = diPan.indexOf(fuShou);
    const flyIndex = isYang ? FLY_PATH.DOOR_YANG : FLY_PATH.DOOR_YIN;
    const putSequence = generatePutSequence(flyIndex, startIndex);
    return putSequence[flyStep % flyIndex.length];
}

/**
 * 判斷值使是否飛抵中宮
 *
 * 中宮無門無方位，本專案依《統宗》《寶鑑》「中五合於坤二」寄坤回報落宮，
 * 因此「值使在五宮」這個狀態無法從落宮欄位看出來。但典籍以此斷事：
 *   《景祐符應經》〈釋陰陽二遁〉：「凡直使在五宮之時，利客不利主。」
 *   《奇門旨歸》卷三十八：「值使簾官泊中…但恐中五為半陰半陽之宮，只中副榜」（記錄應驗）
 * 故另立此旗標，供格局判斷使用。
 *
 * @param {boolean} isYang - 是否為陽局
 * @param {number} flyStep - 飛布步數（0-9）
 * @param {string} fuShou - 符首
 * @param {Array<string>} diPan - 地盤配置
 * @returns {boolean} 值使是否飛抵中宮
 */
export function isZhiShiInCenter(isYang, flyStep, fuShou, diPan) {
    return getZhiShiTargetIndex(isYang, flyStep, fuShou, diPan) === PALACE.ZHONG;
}

/**
 * 判斷值符是否飛入中宮
 *
 * 值符隨時干移宮，時干落中宮時值符即入中。與 isZhiShiInCenter 同理，
 * 落宮欄位因寄坤而看不出此狀態。
 *   《奇門旨歸》卷三十八：「值符泊中客也…值使泊坎、我也，受中宮土克」
 *
 * @param {string} tianGan - 當前時干（已處理甲遁）
 * @param {Array<string>} diPan - 地盤配置
 * @returns {boolean} 值符是否飛入中宮
 */
export function isZhiFuInCenter(tianGan, diPan) {
    return diPan.indexOf(tianGan) === PALACE.ZHONG;
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
    // 計算值使門飛抵的宮位，再處理中宮替代
    const zhiShiTargetIndex = normalizeZhongPalace(
        getZhiShiTargetIndex(isYang, flyStep, fuShou, diPan)
    );
    
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
 * 查詢時干在地盤上的宮位名稱
 *
 * @deprecated 請改用 getZhiFuStarPosition(zhiFuStar, nineStars)。
 * 本函數回傳的是「時干在地盤的宮位」，但 calculateNineStars 內部經 rotateMapping
 * 做過中宮正規化（中 → 坤），兩者在時干落中宮時會不一致——會出現「值符落宮＝中，
 * 但該宮實際的九星並非值符星」這種自相矛盾的輸出。保留匯出僅為相容性。
 *
 * @param {string} tianGan - 當前時干（已處理甲遁）
 * @param {Array<string>} diPan - 地盤配置
 * @returns {string} 時干所在宮位的後天八卦名稱
 */
export function getZhiFuPosition(tianGan, diPan) {
    const positionIndex = diPan.indexOf(tianGan);
    return LUOSHU_BAGUA[positionIndex];
}

/**
 * 確定值符星落宮
 *
 * 從九星飛布結果反查值符星的實際位置，保證與九星陣列自洽。
 * 此作法與 getZhiShiPosition（值使門落宮）對稱。
 *
 * 天禽的特殊處理：
 * 天禽居中宮而中宮無方位，傳統上寄坤二宮，於轉盤中與天芮同宮。九星飛布的
 * 結果恆將天禽留在中宮（見 rotateMapping），故值符為天禽時不能直接用它在
 * 陣列中的位置定落宮，須改取其寄宮之星（天芮）所在。
 *
 * 此非任意選擇——兩部經典都要求八神值符與九星值符同宮：
 *   《奇門遁甲統宗》：「小值符加大值符法：以最上盤之值符加於九星值符所臨之宮」
 *   《遁甲發凡》：「小直符加大直符。以八詐門之直符，加於九星直符所臨之宮」
 * 八神值符依時干落宮（見 calculateEightGods），若此處回傳「中」，
 * 則符首落中宮的盤（18 局中有 12 局，約占全部盤的 11%）必然自相矛盾。
 *
 * @param {string} zhiFuStar - 值符星
 * @param {Array<string>} nineStars - 九星飛布結果
 * @returns {string} 落宮的後天八卦名稱
 */
export function getZhiFuStarPosition(zhiFuStar, nineStars) {
    // 中宮之星（天禽）寄於替代宮之星（天芮）
    const lookupStar = zhiFuStar === QIMEN_STARS[PALACE.ZHONG]
        ? QIMEN_STARS[ZHONG_SUBSTITUTE]
        : zhiFuStar;
    return LUOSHU_BAGUA[nineStars.indexOf(lookupStar)];
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
 * 註：本模組內部未使用（天禽寄宮直接查 DIRECTION_ARROWS），
 * 匯出僅供外部呼叫端使用。
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
 * 正規化節氣名稱（簡體 → 繁體）
 *
 * lunar-javascript 輸出簡體節氣名，JIEQI_JUSHU 以繁體為 key，需先正規化。
 *
 * 此處刻意採「整個名稱查表」而非子字串替換：部分匹配無法在漏掉某個節氣時
 * 發出任何訊號，先前正是因此漏掉「小满」「芒种」，導致每年約 32 天無法起盤。
 * 別名表本身定義於 constants.js 的 JIEQI_ALIAS。
 *
 * @param {string} name - 節氣名稱（簡體或繁體皆可）
 * @returns {string} 繁體節氣名稱；未收錄者原樣返回，交由呼叫端拋出明確錯誤
 */
function normalizeJieQiName(name) {
    if (!name) return name;
    return JIEQI_ALIAS[name] ?? name;
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
    const jieQiName = normalizeJieQiName(currentJieQi.getName());
    
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

// ============================================================================
// 符頭法定局（超神接氣置閏）
// ============================================================================

/**
 * 上元符頭：甲子、己卯、甲午、己酉四日，每十五日一見
 *
 * 《奇門寶鑒御定》：「考古法以甲子、己卯、甲午、己酉為符頭者，緣尊甲以制奇門，
 * 故立符以定元首也。是以符頭為體，節氣為用。」
 *
 * 這四日皆值子午卯酉，正合《統宗》〈定三元法〉「符頭所臨之支值子午卯酉則為上元」。
 * 自上元符頭起十五日為一循環，五日一元（「五日都來換一元」）。
 */
const SHANG_YUAN_FU_TOU = Object.freeze(['甲子', '己卯', '甲午', '己酉']);

/**
 * 置閏的節氣：芒種與大雪
 *
 * 《遁甲演義》：「置閏定在芒種、大雪之後。設遇小滿、小雪二氣之交，
 * **雖超九日、十日，不可置閏**。蓋奇以冬夏二至，陽極陰終。」
 * 又：「閏奇若不居芒種，便是陰終大雪時。」
 * 《寶鑒御定》：「遇芒種大雪，重用本氣三元。」三書一致。
 */
const LEAP_JIE_QI = Object.freeze(['芒種', '大雪']);

/**
 * 置閏的觸發日差
 *
 * 典籍作「九日」，但用的是**含頭計數**：《統宗》康熙五十七年例，
 * 上元符頭甲子在五月十六、夏至在五月廿四，曆日相差八日而原文作
 * 「乃超過九日矣」；《演義》丙午年例「四月初五日是甲子，已在立夏前九日矣」，
 * 初五至十三亦相差八日。故本實作的日差門檻為 8。
 *
 * 《演義》另指出這個窗口只有三天：「超越經旬或九朝，或過十一日無饒。
 * 閏奇額在斯三日，更不加前與後稍。」——因閏只在芒種、大雪落下，
 * 觸發後須等到下一個芒種或大雪，故實際日差可達十一（含頭十二）。
 *
 * 本專案輸出的「超接天數」是**曆日之差**，非含頭計數；
 * 讀典籍時請記得其數大一。
 */
const LEAP_TRIGGER_GAP = 8;

/**
 * 《奇門遁甲秘笈大全》另記一個閾值，因無規則與算例而未實作
 *
 * 原文：「夫閏奇者，有過九日而後閏者，有過十四日而值閏者，各有決例。」
 * 該書只報告兩派並存，未給十四日一派的完整規則，亦無算例可驗，
 * 故依本專案的收錄門檻（自帶算例）記載而不實作。
 */
export const FU_TOU_LEAP_THRESHOLD_VARIANT = Object.freeze({
    書: '奇門遁甲秘笈大全',
    文: '夫閏奇者，有過九日而後閏者，有過十四日而值閏者，各有決例。',
    未實作之由: '該書只報告兩派並存，未給「過十四日」一派的完整規則，亦無算例可驗。'
});

/**
 * 《統宗》所記的正授，用以驗證推算出的鏈
 *
 * 原文：「直至康熙五十八年六月二十三日立秋，而甲子符頭恰當日，是為正授，
 * 本日即是陰遁二局。」該日為 1719-08-08。
 *
 * **這是外部檢查，不是建構輸入**：下方的鏈由純規則自任意早期起點走出，
 * 若規則正確，該日必落在立秋且日差為零。test.js 斷言此事。
 */
export const FU_TOU_ZHENG_SHOU_ANCHOR = Object.freeze({
    西曆: '1719-08-08',
    節氣: '立秋',
    符頭: '甲子',
    書: '奇門遁甲統宗',
    文: '直至康熙五十八年六月二十三日立秋，而甲子符頭恰當日，是為正授，本日即是陰遁二局。'
});

/** 取某日之儒略日整數（以當地零時為界） */
function toDayNumber(solar) {
    return Math.floor(solar.getJulianDay() - 0.5) + 0.5;
}

/** 自某日起，找出最近的上元符頭（含當日）。四符頭每十五日一見，故至多前推十四日 */
function firstShangYuanOnOrAfter(dayNumber) {
    for (let step = 0; step < 15; step++) {
        const ganZhi = Solar.fromJulianDay(dayNumber + step).getLunar().getDayInGanZhiExact();
        if (SHANG_YUAN_FU_TOU.includes(ganZhi)) return dayNumber + step;
    }
    throw new Error('找不到上元符頭：十五日內未見甲子、己卯、甲午、己酉');
}

/** 取一段年份內全部節氣，依日期排序 */
function jieQiSequence(fromYear, toYear) {
    const found = new Map();
    for (let year = fromYear; year <= toYear; year++) {
        for (const month of [2, 5, 8, 11]) {
            const table = Solar.fromYmdHms(year, month, 15, 12, 0, 0).getLunar().getJieQiTable();
            for (const [rawName, jieQiSolar] of Object.entries(table)) {
                const name = normalizeJieQiName(rawName);
                if (!JIEQI_JUSHU[name]) continue;
                found.set(toDayNumber(jieQiSolar), name);
            }
        }
    }
    return [...found.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([day, name]) => ({ day, name }));
}

/**
 * 走出符頭循環與節氣的對應鏈
 *
 * 每個上元符頭循環統領一個節氣，循環依序前推。因符頭循環固定十五日、
 * 節氣平均十五點二一八日，節氣漸漸落到符頭之後（超神）；當**下一個節氣**
 * 已遠在符頭之後八日以上（典籍作九日，含頭計數），且**當前節氣為芒種或大雪**時，
 * 不取下一個節氣，而重用本節氣的三元——這就是置閏。
 *
 * 《統宗》康熙五十七年例把這一步寫得最清楚：「自十六甲子至二十四壬申，
 * 已超九日，**為期大遠**。故十六日甲子不作夏至上局，而為芒種閏奇上局。」
 * 觸發的是**候選節氣**（夏至）的日差，而閏落在**當前節氣**（芒種）。
 *
 * 遇小滿、小雪則不閏（《演義》「雖超九日、十日，不可置閏」），故日差可續增，
 * 待下一個芒種或大雪方閏。
 */
function buildFuTouChain(sequence, startDayNumber, startIndex, untilDayNumber) {
    const chain = [];
    let dayNumber = startDayNumber;
    let index = startIndex;
    let previousIndex = null;

    while (dayNumber <= untilDayNumber) {
        let isLeap = false;
        if (previousIndex !== null) {
            const candidate = previousIndex + 1;
            const candidateGap = candidate < sequence.length
                ? sequence[candidate].day - dayNumber
                : Infinity;
            if (candidateGap >= LEAP_TRIGGER_GAP && LEAP_JIE_QI.includes(sequence[previousIndex].name)) {
                index = previousIndex;          // 重用本氣三元
                isLeap = true;
            } else {
                index = candidate;
            }
        }
        if (index >= sequence.length) break;
        chain.push({
            符頭日: dayNumber,
            節氣索引: index,
            節氣: sequence[index].name,
            日差: sequence[index].day - dayNumber,
            閏局: isLeap
        });
        previousIndex = index;
        dayNumber += 15;
    }
    return chain;
}

/** 鏈的起點年份。取遠早於常用範圍者，使查詢時多半可直接命中快取 */
const CHAIN_DEFAULT_FROM_YEAR = 1700;

/** 已算出的鏈（惰性建立，按需擴充） */
let fuTouChainCache = null;

/**
 * 取得涵蓋指定日期的鏈
 *
 * 起步索引以「日差落在 [-6, 觸發值) 之內」的啟發式選出。實測起步索引偏移
 * −1 至 +2 皆收斂到同一條鏈（因錯誤的起步會使日差落在有效帶之外，
 * 而置閏規則會把它拉回），且《統宗》所記的正授可外部驗證整條鏈，見 test.js。
 */
function getFuTouChain(targetDayNumber) {
    const targetYear = Solar.fromJulianDay(targetDayNumber).getYear();
    const fromYear = Math.min(CHAIN_DEFAULT_FROM_YEAR, targetYear - 20);
    const toYear = targetYear + 2;

    if (fuTouChainCache
        && fuTouChainCache.fromYear <= fromYear
        && fuTouChainCache.toYear >= toYear) {
        return fuTouChainCache.chain;
    }

    const sequence = jieQiSequence(fromYear - 1, toYear + 1);
    const startDayNumber = firstShangYuanOnOrAfter(
        toDayNumber(Solar.fromYmdHms(fromYear, 1, 1, 12, 0, 0))
    );
    let startIndex = -1;
    for (let i = 0; i < sequence.length; i++) {
        const gap = sequence[i].day - startDayNumber;
        if (gap >= -6 && gap < LEAP_TRIGGER_GAP) { startIndex = i; break; }
    }
    if (startIndex < 0) throw new Error('無法決定符頭鏈的起步節氣');

    const until = toDayNumber(Solar.fromYmdHms(toYear, 12, 31, 12, 0, 0));
    const chain = buildFuTouChain(sequence, startDayNumber, startIndex, until);
    fuTouChainCache = { fromYear, toYear, chain };
    return chain;
}

/** 供測試取用整條鏈 */
export function getFuTouChainForRange(fromYear, toYear) {
    const sequence = jieQiSequence(fromYear - 1, toYear + 1);
    const startDayNumber = firstShangYuanOnOrAfter(
        toDayNumber(Solar.fromYmdHms(fromYear, 1, 1, 12, 0, 0))
    );
    let startIndex = -1;
    for (let i = 0; i < sequence.length; i++) {
        const gap = sequence[i].day - startDayNumber;
        if (gap >= -6 && gap < LEAP_TRIGGER_GAP) { startIndex = i; break; }
    }
    const until = toDayNumber(Solar.fromYmdHms(toYear, 12, 31, 12, 0, 0));
    return buildFuTouChain(sequence, startDayNumber, startIndex, until);
}

/**
 * 符頭法定局（超神接氣置閏）
 *
 * 這是九部典籍的主流定局法，與本專案預設的拆補法並行提供。《寶鑒御定》
 * 記錄了兩派之爭：李氏主拆補而斥超閏，寶鑒斥拆補「以亂符頭」「殊違尊甲之旨」。
 * 本專案不代為擇一，兩法俱備。
 *
 * 演算法（日粒度）：
 *   1. 回溯至統領該日的上元符頭 U（甲子／己卯／甲午／己酉，至多十四日）
 *   2. 元 = ⌊(所問日 − U) ÷ 5⌋，即上元、中元、下元
 *   3. 該循環所用之節氣，由 buildFuTouChain 走出的鏈決定——**置閏綁在芒種與大雪**，
 *      而非落在算術上被迫重複的那個節氣
 *
 * 驗證：《統宗》康熙五十六至五十八年的完整算例十個檢核點、
 * 《法竅》〈論拆局補局〉兩則算例七個檢核點，皆逐日重現，見 test.js。
 * 《統宗》所記的正授（康熙五十八年立秋）另作為整條鏈的外部錨點。
 *
 * 已知從缺：**時粒度的疊局**。《法竅》該例謂「子丑二時與寅初之三刻，
 * 卻是己酉上元符頭統領，法當疊」，本實作為日粒度，該日全日歸於同一元；
 * 故 1962-09-08 白露交於寅初三刻，《法竅》作「符先節後，法當用超」
 * 而本專案作「正授」。test.js 以斷言釘住此一分歧。
 *
 * @param {Object} solar - lunar-javascript 的 Solar 對象
 * @param {Object} jieQiJuShu - 節氣局數配置表
 * @param {Array<string>} yuanNames - 三元名稱陣列
 * @returns {Object} 定局結果，另含符頭與超接資訊
 */
export function calculateJuByFuTou(solar, jieQiJuShu, yuanNames) {
    const target = toDayNumber(solar);
    const chain = getFuTouChain(target);

    // 鏈依符頭日遞增，故以二分取最後一個不遲於所問之日者
    let low = 0;
    let high = chain.length - 1;
    let found = -1;
    while (low <= high) {
        const mid = (low + high) >> 1;
        if (chain[mid].符頭日 <= target) { found = mid; low = mid + 1; }
        else high = mid - 1;
    }
    if (found < 0) throw new Error('符頭鏈未涵蓋所問之日');
    const cycle = chain[found];

    const elapsed = target - cycle.符頭日;
    const yuan = Math.floor(elapsed / 5);
    if (yuan < 0 || yuan > 2) {
        throw new Error(`三元越界：距上元符頭 ${elapsed} 日`);
    }

    const config = jieQiJuShu[cycle.節氣];
    if (!config) throw new Error(`未知的節氣：${cycle.節氣}`);

    // 節氣在符頭之後為超神（符先節後），之前為接氣（節先符後），同日為正授
    let chaoJie;
    if (cycle.日差 === 0) chaoJie = '正授';
    else if (cycle.日差 > 0) chaoJie = '超神';
    else chaoJie = '接氣';

    const shangYuanFuTou = Solar.fromJulianDay(cycle.符頭日)
        .getLunar().getDayInGanZhiExact();
    const yuanFuTou = Solar.fromJulianDay(cycle.符頭日 + yuan * 5)
        .getLunar().getDayInGanZhiExact();

    return {
        jieQiName: cycle.節氣,
        yuan,
        yuanName: yuanNames[yuan],
        isYang: config.yang,
        yinYang: config.yang ? '陽' : '陰',
        gameNumber: config.ju[yuan],
        定局法: '符頭',
        上元符頭: shangYuanFuTou,
        符頭: yuanFuTou,
        超接: chaoJie,
        超接天數: Math.abs(cycle.日差),
        閏局: cycle.閏局
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
    getZhiShiTargetIndex,
    isZhiShiInCenter,
    isZhiFuInCenter,
    calculateEightDoors,
    getOriginalStars,
    getZhiFuStar,
    getZhiFuPosition,
    getZhiFuStarPosition,
    calculateNineStars,
    getTianQinDirection,
    calculateEightGods,
    getDirectionArrow,
    getZhiShiPosition,
    calculateJuByChaiBu,
    calculateJuByFuTou
};

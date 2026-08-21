/**
 * 奇門遁甲排盤系統
 * 
 * 統一入口點模組，匯出所有公開 API
 * 
 * @module qimen-dunjia
 * @version 3.0.0
 * @author Refactored with improved maintainability
 * 
 * 系統架構說明：
 * ================================================================================
 * 
 * 本系統將特定時刻的干支資訊轉化為多層次的空間分布圖，用於時空決策分析。
 * 
 * 理論基礎：
 * - 河圖（先天八卦）：宇宙形成前的理想秩序，強調陰陽對立配對
 * - 洛書（後天八卦）：萬物形成後的實際運作，對應八方位與四季
 * 
 * 盤局結構（由內而外）：
 * 1. 地盤：三奇六儀的靜態分布，根據局數確定
 * 2. 天盤：天干隨時辰的動態位移
 * 3. 八門：門戶飛布，代表地理空間的吉凶屬性
 * 4. 九星：星曜飛布，代表天象對人事的影響
 * 5. 八神：神煞飛布，代表超自然力量的介入
 * 
 * 核心概念：
 * - 旬首：六十甲子分六旬，每旬的起始甲日
 * - 符首：甲所遁藏的六儀（戊己庚辛壬癸）
 * - 值符：當前主事的九星
 * - 值使：當前主事的八門
 * - 甲遁：甲不顯於盤面，以符首代之
 * 
 * ================================================================================
 */

// 匯出常數
export {
    // 節氣局數配置（拆補法用）
    JIEQI_JUSHU,
    JIEQI_ALIAS,
    TIME_BASIS,
    CALENDAR_BASIS,
    YUAN_NAMES,
    
    // 九宮索引
    PALACE,
    ZHONG_SUBSTITUTE,
    
    // 飛布軌跡
    FLY_PATH,
    DIRECTION_ARROWS,
    DIRECTIONS,
    
    // 河圖洛書
    HETU_BAGUA,
    LUOSHU_BAGUA,
    
    // 飛星系統
    LUOSHU_NUMBERS,
    FLYING_STARS,
    FLYING_STAR_CHARTS_YANG,
    FLYING_STAR_CHARTS_YIN,
    FLYING_STAR_CHARTS,
    
    // 奇門九星
    QIMEN_STARS,
    TIANQIN_INDEX,
    
    // 八門
    EIGHT_DOORS_ORIGINAL,
    EIGHT_DOORS_SEQUENCE,
    
    // 八神
    EIGHT_GODS_YANG,
    EIGHT_GODS_YIN,
    
    // 五行
    ELEMENT_OVERCOMES,
    ELEMENT_GENERATES,
    ZHI_ELEMENTS,
    JIEQI_TO_GUA,
    PALACE_ELEMENTS,
    DOOR_ELEMENTS,
    STAR_ELEMENTS,
    GAN_ELEMENTS,

    // 地支與方位
    EARTHLY_BRANCHES,
    ZHI_DIRECTIONS,

    // 六甲系統
    XUN_HEADS,
    SIX_XUNS,
    XUN_TO_HEAD,
    XUN_TO_KONGWANG_ZHI,
    XUN_TO_KONGWANG_DIRECTION,
    
    // 地盤配置
    DIPAN_YANG,
    DIPAN_YIN
} from './constants.js';

// 匯出工具函數
export {
    // 陣列操作
    rotateArrayFromIndex,
    generatePutSequence,
    rotateMapping,
    
    // 索引處理
    normalizeZhongPalace,
    findIndexWithZhongNormalization,
    
    // 旬首符首查詢
    getXunHead,
    getFuShou,
    calculateFlyStep,
    getKongWangDirection,
    getOppositeZhi,
    getXunKongWang,
    getGuXu,
    
    // 天干處理
    resolveJiaHiding,
    extractTianGan,
    extractDiZhi
} from './utils.js';

// 匯出運算函數
export {
    // 基礎盤面
    getHeTu,
    getLuoShu,
    calculateFlyingStars,
    
    // 地盤
    getDiPan,
    
    // 天盤
    calculateTianPan,
    
    // 八門
    getOriginalDoors,
    getZhiShiDoor,
    getZhiShiTargetIndex,
    isZhiShiInCenter,
    isZhiFuInCenter,
    calculateEightDoors,
    
    // 九星
    getOriginalStars,
    getZhiFuStar,
    getZhiFuPosition,
    getZhiFuStarPosition,
    calculateNineStars,
    getTianQinDirection,
    
    // 八神
    calculateEightGods,
    
    // 輔助查詢
    getDirectionArrow,
    getZhiShiPosition,
    
    // 定局
    calculateJuByChaiBu,
    calculateJuByFuTou,
    getFuTouChainForRange,
    FU_TOU_ZHENG_SHOU_ANCHOR,
    FU_TOU_LEAP_THRESHOLD_VARIANT
} from './calculations.js';

// 匯出格局判斷
export {
    detectPatterns,
    detectFuYin,
    detectFanYin,
    detectMenPo,
    detectWuBuYu,
    detectSanQiDeShi,
    detectSanQiRuMu,
    detectSanDun,
    detectLiuYiJiXing,
    detectJieLuKongWang,
    detectShiGanKeYing,
    assessVigor,
    VIGOR_READINGS,
    VIGOR_READINGS_NOT_ADOPTED
} from './patterns.js';

// 匯出主控函數
export {
    generateQimenChart,
    generateChartByDatetime,
    generateChartNow,
    chartToObject,
    chartToJSON
} from './qimen.js';

// 預設匯出：主控函數
export { generateQimenChart as default } from './qimen.js';

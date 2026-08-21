/**
 * 奇門遁甲系統測試模組
 *
 * 執行方式：node test.js（或 npm test）
 *
 * 設計原則：每個測試都必須「斷言」而非只是印出結果。
 * 舊版的盤局測試只要不拋例外就算通過，因此 v2.1.0 帶著「小滿／芒種期間
 * 完全無法起盤」的缺陷仍顯示「21 個測試全過」。任何不比對期望值的測試
 * 都只證明了程式不會 crash。
 */

import { readFileSync, existsSync } from 'fs';
import { Solar } from 'lunar-javascript';
import { verifyAllCitations, BOOK_FILES, NOT_A_SINGLE_FILE } from './scripts/verify-citations.mjs';
import {
    generateQimenChart,
    generateChartByDatetime,
    generateChartNow,
    chartToObject,
    JIEQI_JUSHU,
    LUOSHU_BAGUA,
    DIRECTION_ARROWS,
    LUOSHU_NUMBERS,
    QIMEN_STARS,
    PALACE,
    ZHONG_SUBSTITUTE,
    SIX_XUNS,
    EARTHLY_BRANCHES,
    ZHI_DIRECTIONS,
    EIGHT_DOORS_ORIGINAL,
    FLYING_STARS,
    EIGHT_GODS_YANG,
    EIGHT_GODS_YIN,
    DIPAN_YANG,
    DIPAN_YIN,
    XUN_TO_KONGWANG_ZHI,
    XUN_TO_KONGWANG_DIRECTION,
    getGuXu,
    getXunKongWang,
    getOppositeZhi,
    getDiPan,
    calculateTianPan,
    calculateNineStars,
    calculateEightGods,
    calculateEightDoors,
    getFuShou,
    getXunHead,
    ELEMENT_OVERCOMES,
    PALACE_ELEMENTS,
    DOOR_ELEMENTS,
    detectPatterns,
    detectLiuYiJiXing,
    detectWuBuYu,
    detectMenPo,
    detectFuYin,
    detectFanYin,
    SOURCES,
    getFuTouChainForRange,
    FU_TOU_ZHENG_SHOU_ANCHOR,
    FU_TOU_LEAP_THRESHOLD_VARIANT,
    ELEMENT_GENERATES,
    detectSanQiRuMu,
    detectSanDun,
    detectJieLuKongWang,
    detectShiGanKeYing,
    // 供斷語逐格比對
    assessVigor,
    VIGOR_READINGS,
    VIGOR_READINGS_NOT_ADOPTED,
    ZHI_ELEMENTS,
    FLYING_STAR_CHARTS_YANG,
    FLYING_STAR_CHARTS_YIN,
    calculateFlyingStars
} from './index.js';

const VERSION = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;

// ============================================================================
// 極簡測試框架
// ============================================================================

let passed = 0;
let failed = 0;
const failures = [];

function record(name, errors) {
    if (errors.length === 0) {
        passed++;
        console.log('  ✓ ' + name);
    } else {
        failed++;
        console.log('  ✗ ' + name);
        for (const e of errors) {
            console.log('      ' + e);
            failures.push(name + '：' + e);
        }
    }
}

/** 收集式斷言：一個測試內的所有錯誤都會被列出，而非第一個就中斷 */
function createAsserter() {
    const errors = [];
    return {
        errors,
        equal(actual, expected, label) {
            if (actual !== expected) {
                errors.push(`${label}：預期 ${JSON.stringify(expected)}，實際 ${JSON.stringify(actual)}`);
            }
        },
        deepEqual(actual, expected, label) {
            if (JSON.stringify(actual) !== JSON.stringify(expected)) {
                errors.push(`${label}：`);
                errors.push('  預期 ' + JSON.stringify(expected));
                errors.push('  實際 ' + JSON.stringify(actual));
            }
        },
        ok(condition, label) {
            if (!condition) errors.push(label);
        }
    };
}

/** 截斷過長的錯誤列表，但一定要說明略去了幾項——無聲上限會讓失敗看起來比實際小 */
function truncate(items, limit) {
    if (items.length <= limit) return items;
    return [...items.slice(0, limit), `（另有 ${items.length - limit} 項未列出）`];
}

function section(title) {
    console.log('');
    console.log('▓'.repeat(64));
    console.log(title);
    console.log('▓'.repeat(64));
}

/**
 * 落宮自洽性
 *
 * 1. 值符落宮必須真的是值符星所在之宮。天禽居中宮不動、寄坤與天芮同宮，
 *    故值符為天禽時以天芮定位。
 * 2. 八神值符必須與九星值符同宮——兩部經典皆明文要求：
 *    《奇門遁甲統宗》「小值符加大值符法：以最上盤之值符加於九星值符所臨之宮」
 *    《遁甲發凡》「小直符加大直符。以八詐門之直符，加於九星直符所臨之宮」
 * 3. 值使落宮必須真的是值使門所在之宮。
 */
function assertPositionsSelfConsistent(t, obj, prefix) {
    const zhongStar = QIMEN_STARS[PALACE.ZHONG];              // 天禽
    const substituteStar = QIMEN_STARS[ZHONG_SUBSTITUTE];     // 天芮
    const lookupStar = obj['值符'] === zhongStar ? substituteStar : obj['值符'];
    const starPalace = LUOSHU_BAGUA[obj['九星'].indexOf(lookupStar)];
    t.equal(obj['值符落宮'], starPalace, `${prefix}值符落宮應與九星陣列一致（天禽寄坤取天芮）`);

    const godPalace = LUOSHU_BAGUA[obj['八神'].indexOf('值符')];
    t.equal(obj['值符落宮'], godPalace, `${prefix}八神值符應與九星值符同宮`);

    const doorPalace = LUOSHU_BAGUA[obj['天門'].indexOf(obj['值使'])];
    t.equal(obj['值使落宮'], doorPalace, `${prefix}值使落宮應與天門陣列一致`);
}

function printGrid(name, array) {
    const cell = v => (v || '　').toString().padEnd(4, '　');
    console.log('      ' + name + '：');
    console.log('        ' + cell(array[0]) + ' ' + cell(array[1]) + ' ' + cell(array[2]));
    console.log('        ' + cell(array[3]) + ' ' + cell(array[4]) + ' ' + cell(array[5]));
    console.log('        ' + cell(array[6]) + ' ' + cell(array[7]) + ' ' + cell(array[8]));
}

// ============================================================================
// 第一部分：盤局黃金值
// ============================================================================
/**
 * 每個案例的期望值都經人工依傳統規則核算過，例如「陽局測試 - 局數1」：
 *   壬戌屬甲寅旬（第9個）→ 符首癸、飛步8
 *   陽1局地盤癸在乾宮 → 值符天心、值使開門
 *   時干壬落中宮 → 依中宮寄坤，值符天心實際飛入坤宮（舊版誤報為「中」）
 *   值使自乾宮順飛九宮8步 → 5宮（中）→ 寄坤
 */
const chartTestCases = [
    {
        name: '陽局測試 - 局數5（時干庚）',
        input: { 年柱: '甲辰', 月柱: '丙寅', 日柱: '戊午', 時柱: '庚申', 局數: 5, 陰陽: '陽' },
        expected: {
            旬首: '甲寅', 符首: '癸', 飛步: 6,
            值符: '天蓬', 值符落宮: '兌',
            值使: '休門', 值使落宮: '兌',
            地盤: ['乙', '壬', '丁', '丙', '戊', '庚', '辛', '癸', '己'],
            天盤: ['丁', '庚', '己', '壬', '戊', '癸', '乙', '丙', '辛'],
            天門: ['死門', '驚門', '開門', '景門', '', '休門', '杜門', '傷門', '生門'],
            九星: ['天芮', '天柱', '天心', '天英', '天禽', '天蓬', '天輔', '天沖', '天任'],
            八神: ['朱雀', '九地', '九天', '勾陳', '', '值符', '六合', '太陰', '騰蛇']
        }
    },
    {
        name: '陰局測試 - 局數3（時干辛，陰遁逆飛）',
        input: { 年柱: '癸卯', 月柱: '乙丑', 日柱: '丁巳', 時柱: '辛亥', 局數: 3, 陰陽: '陰' },
        expected: {
            旬首: '甲辰', 符首: '壬', 飛步: 7,
            值符: '天任', 值符落宮: '離',
            值使: '生門', 值使落宮: '坎',
            地盤: ['乙', '辛', '己', '戊', '丙', '癸', '壬', '庚', '丁'],
            天盤: ['庚', '壬', '戊', '丁', '丙', '乙', '癸', '己', '辛'],
            天門: ['景門', '死門', '驚門', '杜門', '', '開門', '傷門', '生門', '休門'],
            九星: ['天蓬', '天任', '天沖', '天心', '天禽', '天輔', '天柱', '天芮', '天英'],
            八神: ['騰蛇', '值符', '九天', '太陰', '', '九地', '六合', '白虎', '玄武']
        }
    },
    {
        name: '甲遁測試 - 時干為甲（應以符首辛代之）',
        input: { 年柱: '甲子', 月柱: '丙寅', 日柱: '戊辰', 時柱: '甲午', 局數: 7, 陰陽: '陽' },
        expected: {
            旬首: '甲午', 符首: '辛', 飛步: 0,
            值符: '天蓬', 值符落宮: '坎',
            值使: '休門', 值使落宮: '坎',
            // 旬首時辰：取值起點＝放置起點，故天盤與九星均為本位不動
            地盤: ['丁', '庚', '壬', '癸', '丙', '戊', '己', '辛', '乙'],
            天盤: ['丁', '庚', '壬', '癸', '丙', '戊', '己', '辛', '乙'],
            天門: ['杜門', '景門', '死門', '傷門', '', '驚門', '生門', '休門', '開門'],
            九星: ['天輔', '天英', '天芮', '天沖', '天禽', '天柱', '天任', '天蓬', '天心'],
            八神: ['六合', '勾陳', '朱雀', '太陰', '', '九地', '騰蛇', '值符', '九天']
        }
    },
    {
        name: '陽局測試 - 局數1（時干壬落中宮，中宮寄坤回歸測試）',
        input: { 年柱: '乙丑', 月柱: '丁卯', 日柱: '己未', 時柱: '壬戌', 局數: 1, 陰陽: '陽' },
        expected: {
            旬首: '甲寅', 符首: '癸', 飛步: 8,
            值符: '天心', 值符落宮: '坤',   // 舊版誤報為「中」
            值使: '開門', 值使落宮: '坤',
            地盤: ['辛', '乙', '己', '庚', '壬', '丁', '丙', '戊', '癸'],
            天盤: ['己', '丁', '癸', '乙', '壬', '戊', '辛', '庚', '丙'],
            天門: ['死門', '驚門', '開門', '景門', '', '休門', '杜門', '傷門', '生門'],
            九星: ['天芮', '天柱', '天心', '天英', '天禽', '天蓬', '天輔', '天沖', '天任'],
            八神: ['九地', '九天', '值符', '朱雀', '', '騰蛇', '勾陳', '六合', '太陰']
        }
    },
    {
        name: '陰局測試 - 局數9（飛步9，值使繞滿九宮回到符首宮）',
        input: { 年柱: '丙寅', 月柱: '庚午', 日柱: '壬申', 時柱: '癸酉', 局數: 9, 陰陽: '陰' },
        expected: {
            旬首: '甲子', 符首: '戊', 飛步: 9,
            值符: '天英', 值符落宮: '巽',
            值使: '景門', 值使落宮: '離',
            地盤: ['癸', '戊', '丙', '丁', '壬', '庚', '己', '乙', '辛'],
            天盤: ['戊', '丙', '庚', '癸', '壬', '辛', '丁', '己', '乙'],
            天門: ['杜門', '景門', '死門', '傷門', '', '驚門', '生門', '休門', '開門'],
            九星: ['天英', '天芮', '天柱', '天輔', '天禽', '天心', '天沖', '天任', '天蓬'],
            八神: ['值符', '九天', '九地', '騰蛇', '', '玄武', '太陰', '六合', '白虎']
        }
    }
];

function runChartTest(testCase) {
    const t = createAsserter();
    let obj = null;

    try {
        obj = chartToObject(generateQimenChart(testCase.input));
    } catch (error) {
        record(testCase.name, ['拋出例外：' + error.message]);
        return;
    }

    for (const [key, expected] of Object.entries(testCase.expected)) {
        if (Array.isArray(expected)) {
            t.deepEqual(obj[key], expected, key);
        } else {
            t.equal(obj[key], expected, key);
        }
    }

    assertPositionsSelfConsistent(t, obj, '');

    record(testCase.name, t.errors);

    if (t.errors.length > 0) {
        console.log('      實際盤局：');
        for (const layer of ['地盤', '天盤', '天門', '九星', '八神']) {
            printGrid(layer, obj[layer]);
        }
    }
}

// ============================================================================
// 第二部分：generateChartByDatetime API
// ============================================================================

const datetimeTestCases = [
    {
        name: '陽遁 - 小寒（2024-01-15 10時）',
        datetime: '2024011510',
        expected: { 節氣: '小寒', 三元: '中元', 陰陽: '陽', 局數: 8 }
    },
    {
        name: '陰遁 - 小暑（2024-07-08 14時）',
        datetime: '2024070814',
        expected: { 節氣: '小暑', 陰陽: '陰' }
    },
    {
        name: '節氣交接 - 立春（2024-02-04 17時，交接於 16:27）',
        datetime: '2024020417',
        expected: { 節氣: '立春', 陰陽: '陽' }
    },
    {
        name: '三元 - 上元（小寒交接當日）',
        datetime: '2024010608',
        expected: { 節氣: '小寒', 三元: '上元', 節後天數: 0 }
    },
    {
        name: '三元 - 中元（小寒後第6日 08時）',
        datetime: '2024011108',
        expected: { 節氣: '小寒', 三元: '中元' }
    },
    {
        name: '三元分界以交接「時刻」為準（小寒交接 04:49，同日 03 時仍屬上元）',
        datetime: '2024011103',
        expected: { 節氣: '小寒', 三元: '上元' }
    },
    // 以下五個節氣曾因簡繁對照表不完整而失效：
    // 小滿／芒種在 Node 端直接拋「未知的節氣」，
    // 驚蟄／穀雨／處暑在網頁端被靜默略過而回退到前一個節氣。
    {
        name: '簡繁回歸 - 小滿（曾拋「未知的節氣：小满」）',
        datetime: '2024052512',
        expected: { 節氣: '小滿', 陰陽: '陽' }
    },
    {
        name: '簡繁回歸 - 芒種（曾拋「未知的節氣：芒种」）',
        datetime: '2024061012',
        expected: { 節氣: '芒種', 陰陽: '陽' }
    },
    {
        name: '簡繁回歸 - 驚蟄',
        datetime: '2024031012',
        expected: { 節氣: '驚蟄', 陰陽: '陽' }
    },
    {
        name: '簡繁回歸 - 穀雨',
        datetime: '2024042512',
        expected: { 節氣: '穀雨', 陰陽: '陽' }
    },
    {
        name: '簡繁回歸 - 處暑',
        datetime: '2024082512',
        expected: { 節氣: '處暑', 陰陽: '陰' }
    },
    {
        name: '邊界 - 早子時（2024-03-15 0時）',
        datetime: '2024031500',
        expected: {}
    },
    {
        name: '邊界 - 晚子時（2024-03-15 23時）',
        datetime: '2024031523',
        expected: {}
    }
];

const REQUIRED_FIELDS = [
    '年柱', '月柱', '日柱', '時柱', '陰陽', '局數',
    '節氣', '三元', '節後天數',
    '地盤', '天盤', '天門', '九星', '八神', '值符', '值使'
];

function runDatetimeTest(testCase) {
    const t = createAsserter();
    let obj = null;

    try {
        obj = chartToObject(generateChartByDatetime(testCase.datetime));
    } catch (error) {
        record(testCase.name, ['拋出例外：' + error.message]);
        return;
    }

    for (const [key, expected] of Object.entries(testCase.expected)) {
        t.equal(obj[key], expected, key);
    }

    for (const field of REQUIRED_FIELDS) {
        t.ok(obj[field] !== undefined && obj[field] !== null, '缺少必要欄位：' + field);
    }

    t.ok(typeof obj['時柱'] === 'string' && obj['時柱'].length === 2, '時柱應為兩字干支，實際：' + obj['時柱']);
    t.ok(obj['局數'] >= 1 && obj['局數'] <= 9, '局數超出 1-9：' + obj['局數']);

    assertPositionsSelfConsistent(t, obj, '');

    record(testCase.name, t.errors);
}

// ============================================================================
// 第三部分：全年節氣覆蓋
// ============================================================================
/**
 * 逐日掃過整個 2024 年（閏年，366 天）。
 *
 * 這一節直接攔截「節氣名稱查表失敗」這一類缺陷：任何一個節氣只要漏了
 * 簡繁對照就會在這裡拋錯，或使該節氣名從結果集合中缺席。
 */
function runFullYearCoverage() {
    const t = createAsserter();
    const seen = new Set();
    const thrown = [];
    let count = 0;

    for (let month = 1; month <= 12; month++) {
        const daysInMonth = new Date(2024, month, 0).getDate();
        for (let day = 1; day <= daysInMonth; day++) {
            const datetime = '2024' + String(month).padStart(2, '0') + String(day).padStart(2, '0') + '12';
            try {
                const obj = chartToObject(generateChartByDatetime(datetime));
                seen.add(obj['節氣']);
                count++;
                if (!JIEQI_JUSHU[obj['節氣']]) {
                    t.errors.push(datetime + ' 回傳未收錄的節氣名：' + obj['節氣']);
                }
            } catch (error) {
                thrown.push(datetime + '：' + error.message);
            }
        }
    }

    for (const item of truncate(thrown, 10)) {
        t.errors.push('拋出例外 ' + item);
    }

    const expectedNames = Object.keys(JIEQI_JUSHU);
    const missing = expectedNames.filter(name => !seen.has(name));
    t.ok(missing.length === 0, '全年掃描未涵蓋以下節氣：' + missing.join('、'));

    record(`全年 366 天逐日起盤（成功 ${count} 天，涵蓋 ${seen.size}/24 個節氣）`, t.errors);
}

/** 抽樣各時辰，確認一日之內十二時辰都能起盤且落宮自洽 */
function runHourCoverage() {
    const t = createAsserter();
    let count = 0;

    for (const date of ['20240115', '20240610', '20240721', '20241221']) {
        for (let hour = 0; hour <= 23; hour++) {
            const datetime = date + String(hour).padStart(2, '0');
            try {
                const obj = chartToObject(generateChartByDatetime(datetime));
                assertPositionsSelfConsistent(t, obj, datetime + ' ');
                count++;
            } catch (error) {
                t.errors.push(datetime + ' 拋出例外：' + error.message);
            }
        }
    }

    record(`四個日期 × 24 小時共 ${count} 個時辰的落宮自洽性`, truncate(t.errors, 10));
}

// ============================================================================
// 第三部分之二：飛星盤
// ============================================================================
/**
 * 兩張飛星盤各有 9 列共 162 個數字，手抄容易出錯（舊版整張表方向就是反的）。
 * 這裡用飛布公式覆核每一格，並確認陽遁 5 入中就是洛書本身。
 */
function runFlyingStarTest() {
    const t = createAsserter();
    const wrap = x => ((x - 1) % 9 + 9) % 9 + 1;

    t.deepEqual(LUOSHU_NUMBERS, [4, 9, 2, 3, 5, 7, 8, 1, 6], '洛書數應為 4 9 2 / 3 5 7 / 8 1 6');

    for (let center = 1; center <= 9; center++) {
        // 順飛：宮位星數 = 入中星數 + (該宮洛書數 - 5)；逆飛則相減
        t.deepEqual(
            FLYING_STAR_CHARTS_YANG[center],
            LUOSHU_NUMBERS.map(n => wrap(center + (n - 5))),
            `陽遁順飛 ${center} 入中`
        );
        t.deepEqual(
            FLYING_STAR_CHARTS_YIN[center],
            LUOSHU_NUMBERS.map(n => wrap(center - (n - 5))),
            `陰遁逆飛 ${center} 入中`
        );
    }

    // 5 入中的陽遁盤必須就是洛書
    t.deepEqual(FLYING_STAR_CHARTS_YANG[5], LUOSHU_NUMBERS, '陽遁 5 入中應等於洛書本身');

    // 陰陽必須給出不同結果（舊版兩者相同，因為只有一張逆飛表）
    t.ok(
        calculateFlyingStars(5, true).join() !== calculateFlyingStars(5, false).join(),
        '陽遁與陰遁的飛星盤應不同'
    );

    // 未指定陰陽應拋錯，避免又靜默套用單一方向
    try {
        calculateFlyingStars(5);
        t.errors.push('未指定 isYang 時應拋出錯誤');
    } catch (error) {
        t.ok(error.message.includes('isYang'), '錯誤訊息應提到 isYang，實際：' + error.message);
    }

    record('飛星盤：兩張表共 162 格與飛布公式相符，且隨陰陽順逆', t.errors);
}

// ============================================================================
// 第三部分之三：旬空與孤虛
// ============================================================================
/**
 * 依《奇門遁甲統宗》〈孤虛〉與〈年家孤虛方位〉驗證。
 * 統宗原文：「年月日時俱以前一位空亡為孤，孤沖為虛。如子年亥為孤，巳為虛。」
 */
function runVoidTest() {
    const t = createAsserter();

    // 統宗〈年家孤虛方位〉逐支列出的孤與虛
    const GU  = '亥子丑寅卯辰巳午未申酉戌'.split('');
    const XU  = '巳午未申酉戌亥子丑寅卯辰'.split('');
    EARTHLY_BRANCHES.forEach((zhi, i) => {
        // 孤虛只取地支推算，天干不參與，故此處天干僅為佔位
        const result = getGuXu('甲' + zhi);
        t.equal(result?.孤, ZHI_DIRECTIONS[GU[i]], `${zhi}之孤應為${GU[i]}`);
        t.equal(result?.虛, ZHI_DIRECTIONS[XU[i]], `${zhi}之虛應為${XU[i]}`);
    });
    t.ok(EARTHLY_BRANCHES.every(z => getOppositeZhi(getOppositeZhi(z)) === z), '對沖兩次應回到原支');

    record('孤虛：統宗〈年家孤虛方位〉十二支逐一相符', t.errors);
}

/** 旬空亡的兩支必須是該旬用不到的兩支，方位須與地支方位表一致 */
function runXunKongTest() {
    const t = createAsserter();

    for (const [xunHead, ganzhiList] of Object.entries(SIX_XUNS)) {
        const used = new Set(ganzhiList.map(gz => gz[1]));
        const missing = EARTHLY_BRANCHES.filter(z => !used.has(z));
        t.deepEqual(XUN_TO_KONGWANG_ZHI[xunHead], missing, `${xunHead}旬空亡地支`);
        t.deepEqual(
            XUN_TO_KONGWANG_DIRECTION[xunHead],
            missing.map(z => ZHI_DIRECTIONS[z]),
            `${xunHead}旬空亡方位`
        );
        const xk = getXunKongWang(xunHead);
        t.deepEqual(xk?.孤, missing.map(z => ZHI_DIRECTIONS[z]), `${xunHead}旬孤`);
        t.deepEqual(xk?.虛, missing.map(z => ZHI_DIRECTIONS[getOppositeZhi(z)]), `${xunHead}旬虛`);
    }
    // 同旬十個干支的旬空相同，但孤虛各不相同（兩者是不同概念）
    const xunKongs = new Set(SIX_XUNS['甲子'].map(gz => JSON.stringify(getXunKongWang(gz))));
    const guXus = new Set(SIX_XUNS['甲子'].map(gz => JSON.stringify(getGuXu(gz))));
    t.ok(xunKongs.size === 1, '同旬十干支的旬空應相同，實得 ' + xunKongs.size + ' 種');
    t.ok(guXus.size === 10, '同旬十干支的孤虛應逐支不同，實得 ' + guXus.size + ' 種');

    record('旬空：六旬空亡地支與方位可由 SIX_XUNS 完全反推', t.errors);
}

// ============================================================================
// 第三部分之四：經典例題
// ============================================================================
/**
 * 以五部典籍中「逐宮明列」或「逐時演算」的段落作為回歸基準。
 * 這些是外部權威給定的答案，比自產的黃金值更能防止整體性的錯誤。
 *
 * 出處：
 *   《奇門遁甲統宗》〈以旬首取符使法〉〈值符加時干法〉〈值使飛宮〉
 *   《遁甲演義》〈八門九星逐時移宮訣〉、卷一起例
 *   《奇門遁甲元靈經》卷一〈奇門起例〉兩則
 *   《奇門寶鑑御定》〈釋六儀遁六甲〉
 *   《遁甲發凡》
 *   煙波釣叟歌（《演義》錄為〈黃帝陰符經〉）
 */

const PALACE_NUMBERS = { 巽: 4, 離: 9, 坤: 2, 震: 3, 中: 5, 兌: 7, 艮: 8, 坎: 1, 乾: 6 };
const palaceIndexOf = number => LUOSHU_NUMBERS.indexOf(number);
const wrap9 = x => ((x - 1) % 9 + 9) % 9 + 1;

/** 以新式具名物件建立盤局；年月日柱不影響盤面，統一填甲子 */
function buildChart(時柱, 局數, 陰陽) {
    return chartToObject(generateQimenChart({
        年柱: '甲子', 月柱: '甲子', 日柱: '甲子', 時柱, 局數, 陰陽
    }));
}

function classicChart(shi, ju, yinYang) {
    return buildChart(shi, ju, yinYang);
}

/** 三元步進：陽遁每元 -3、陰遁每元 +3（模九）。兩處已知異文皆違反此規則 */
function runJuStepTest() {
    const t = createAsserter();
    for (const [name, cfg] of Object.entries(JIEQI_JUSHU)) {
        const step = cfg.yang ? -3 : 3;
        t.equal(wrap9(cfg.ju[0] + step), cfg.ju[1], name + ' 上元→中元');
        t.equal(wrap9(cfg.ju[1] + step), cfg.ju[2], name + ' 中元→下元');
    }
    record('局數表：24 節氣皆合三元步進規則（陽 -3／陰 +3）', t.errors);
}

/** 地盤：九干依 戊己庚辛壬癸丁丙乙 自局數宮起、陽順陰逆連續排布 */
function runDiPanRuleTest() {
    const t = createAsserter();
    const SEQ = ['戊', '己', '庚', '辛', '壬', '癸', '丁', '丙', '乙'];
    const derive = (ju, isYang) => {
        const out = new Array(9);
        SEQ.forEach((gan, i) => { out[palaceIndexOf(wrap9(isYang ? ju + i : ju - i))] = gan; });
        return out;
    };
    for (let ju = 1; ju <= 9; ju++) {
        t.deepEqual(DIPAN_YANG[ju], derive(ju, true), '陽遁' + ju + '局');
        t.deepEqual(DIPAN_YIN[ju], derive(ju, false), '陰遁' + ju + '局');
    }
    record('地盤：18 局 162 格皆可由「順布六儀逆布三奇」規則反推', t.errors);
}

/** 煙波釣叟歌：「直符前三六合位，前二太陰君須記。直符後一名九天，後二宮神名九地。」 */
function runEightGodsVerseTest() {
    const t = createAsserter();
    for (const [gods, label] of [[EIGHT_GODS_YANG, '陽遁'], [EIGHT_GODS_YIN, '陰遁']]) {
        t.equal(gods[3], '六合', label + '直符前三');
        t.equal(gods[2], '太陰', label + '直符前二');
        t.equal(gods[7], '九天', label + '直符後一');
        t.equal(gods[6], '九地', label + '直符後二');
    }
    record('八神：煙波釣叟歌所述四個相對位置皆相符', t.errors);
}

/** 《演義》〈八門九星逐時移宮訣〉陽遁一局逐時實例 */
function runYanyiHourTest() {
    const t = createAsserter();
    const at = (arr, gua) => arr[['巽','離','坤','震','中','兌','艮','坎','乾'].indexOf(gua)];

    // 甲子時：蓬星一宮、休門一宮；丙奇與生門同宮在艮；乙奇在離；丁奇在兌
    const jz = classicChart('甲子', 1, '陽');
    t.equal(at(jz['九星'], '坎'), '天蓬', '甲子時天蓬在坎');
    t.equal(at(jz['天門'], '坎'), '休門', '甲子時休門在坎');
    t.equal(at(jz['天盤'], '艮'), '丙', '甲子時丙奇在艮');
    t.equal(at(jz['天門'], '艮'), '生門', '甲子時艮宮為生門');
    t.equal(at(jz['天盤'], '離'), '乙', '甲子時乙奇在離');
    t.equal(at(jz['天盤'], '兌'), '丁', '甲子時丁奇在兌');

    // 乙丑時：蓬星在九，休門在二宮；休門與丙奇同在坤二；乙奇在坎；丁奇在震
    const yc = classicChart('乙丑', 1, '陽');
    t.equal(at(yc['九星'], '離'), '天蓬', '乙丑時天蓬在離');
    t.equal(at(yc['天門'], '坤'), '休門', '乙丑時休門在坤');
    t.equal(at(yc['天盤'], '坤'), '丙', '乙丑時丙奇在坤');
    t.equal(at(yc['天盤'], '坎'), '乙', '乙丑時乙奇在坎');
    t.equal(at(yc['天盤'], '震'), '丁', '乙丑時丁奇在震');

    // 丙寅時：蓬星在八宮，休門在三宮；休門與丙奇在震；乙奇在二宮；丁奇在六宮
    const by = classicChart('丙寅', 1, '陽');
    t.equal(at(by['九星'], '艮'), '天蓬', '丙寅時天蓬在艮');
    t.equal(at(by['天門'], '震'), '休門', '丙寅時休門在震');
    t.equal(at(by['天盤'], '震'), '丙', '丙寅時丙奇在震');
    t.equal(at(by['天盤'], '坤'), '乙', '丙寅時乙奇在坤');
    t.equal(at(by['天盤'], '乾'), '丁', '丙寅時丁奇在乾');

    record('《演義》陽遁一局甲子／乙丑／丙寅三時的天盤三奇與八門', t.errors);
}

/** 《元靈經》卷一兩則起例 */
function runYuanlingTest() {
    const t = createAsserter();

    // 例一 陽遁九局丙辰時：甲寅符頭，中宮之癸為值符 → 天禽加兌；借坤宮死門加兌為值使
    const a = classicChart('丙辰', 9, '陽');
    t.equal(a['旬首'], '甲寅', '例一旬首');
    t.equal(a['符首'], '癸', '例一符首');
    t.equal(a['值符'], '天禽', '例一值符');
    t.equal(a['值符落宮'], '兌', '例一值符落宮（天禽加兌）');
    // 原文即作「天禽加兌」，故天禽所寄之宮本身就是典籍給的黃金值。
    // 此前無人斷言它——把 calculations.js 的 indexOf('天芮') 改成 indexOf('天蓬')，
    // 全套測試照樣是綠的。
    t.equal(a['天禽落宮'], '兌', '例一天禽落宮（原文「天禽加兌」）');
    // 箭頭欄位與宮名欄位必須指向同一宮——兩種表示法不得各說各話
    t.equal(a['天禽寄宮'], DIRECTION_ARROWS[LUOSHU_BAGUA.indexOf(a['天禽落宮'])],
            '例一天禽寄宮之箭頭應與其落宮一致');
    t.equal(a['值使'], '死門', '例一值使（借坤宮死門）');
    t.equal(a['值使落宮'], '兌', '例一值使落宮');

    // 例二 陰遁八局辛未時：甲子符頭，艮宮戊為值符；自艮宮逆數至辛未在坎，艮宮生門加坎
    // 註：原文「天任加中」屬飛盤法，本專案為轉盤法故落坤，此處不做斷言（見報告）
    const b = classicChart('辛未', 8, '陰');
    t.equal(b['旬首'], '甲子', '例二旬首');
    t.equal(b['符首'], '戊', '例二符首');
    t.equal(b['值符'], '天任', '例二值符');
    t.equal(b['值使'], '生門', '例二值使');
    t.equal(b['值使落宮'], '坎', '例二值使落宮');

    record('《元靈經》兩則起例（符首落中宮／時干落中宮）', t.errors);
}

/**
 * 《景祐遁甲符應經》（錄於《欽定古今圖書集成》術數部彙考十九）
 *
 * 此本為宋代文獻，早於統宗、演義諸本，且文中直接附有盤面圖。
 * 圖為傳統直排，純文字化後每一「行」其實是一「列」且由右列先寫，
 * 故下方以 [坤兌乾]／[離中坎]／[巽震艮] 三列還原。
 */
const YINGJING_GRIDS = [
    { isYang: true,  ju: 3, shi: '丁亥', rows: [['乙','壬','辛'], ['丁','庚','丙'], ['己','戊','癸']] },
    { isYang: false, ju: 3, shi: '壬辰', rows: [['己','癸','丁'], ['辛','丙','庚'], ['乙','戊','壬']] },
    { isYang: true,  ju: 5, shi: '丙午', rows: [['丁','庚','己'], ['壬','戊','癸'], ['乙','丙','辛']] },
    { isYang: true,  ju: 5, shi: '己亥', rows: [['丁','庚','己'], ['壬','戊','癸'], ['乙','丙','辛']] },
    { isYang: false, ju: 6, shi: '丁丑', rows: [['壬','乙','戊'], ['丁','己','癸'], ['庚','辛','丙']] }
];
const GRID_SLOTS = [[2, 5, 8], [1, 4, 7], [0, 3, 6]];

function runYingjingGridTest() {
    const t = createAsserter();
    for (const g of YINGJING_GRIDS) {
        const restored = new Array(9);
        g.rows.forEach((row, r) => row.forEach((gan, c) => { restored[GRID_SLOTS[r][c]] = gan; }));
        const table = g.isYang ? DIPAN_YANG : DIPAN_YIN;
        t.deepEqual(restored, table[g.ju], `${g.isYang ? '陽' : '陰'}${g.ju}局（${g.shi}時）盤面圖`);
    }
    record('《景祐符應經》五張盤面圖共 45 格逐格相符', t.errors);
}

/** 〈釋九星所主〉同時給出星、宮、門三者的對應 */
function runYingjingStarDoorTest() {
    const t = createAsserter();
    const TABLE = [
        ['天蓬', 1, '休門'], ['天芮', 2, '死門'], ['天沖', 3, '傷門'], ['天輔', 4, '杜門'],
        ['天禽', 5, ''],     ['天心', 6, '開門'], ['天柱', 7, '驚門'], ['天任', 8, '生門'], ['天英', 9, '景門']
    ];
    for (const [star, palace, door] of TABLE) {
        const index = LUOSHU_NUMBERS.indexOf(palace);
        t.equal(QIMEN_STARS[index], star, `${palace}宮之星`);
        t.equal(EIGHT_DOORS_ORIGINAL[index], door, `${palace}宮之門`);
    }
    record('《景祐符應經》〈釋九星所主〉星—宮—門三者對照', t.errors);
}

/** 值使飛宮的三條敘述：起宮異門、出於四六、踰於五七歸於九一 */
function runYingjingZhiShiTest() {
    const t = createAsserter();
    const palaceNumber = gua => ({ 巽:4, 離:9, 坤:2, 震:3, 中:5, 兌:7, 艮:8, 坎:1, 乾:6 })[gua];
    const zhiShiAt = (shi, ju, yinYang) =>
        palaceNumber(buildChart(shi, ju, yinYang)['值使落宮']);

    // 〈釋天乙直使起宮異門〉冬至後陽使起一宮休門；夏至後陰使起九宮景門
    t.ok(JIEQI_JUSHU['冬至'].yang && JIEQI_JUSHU['冬至'].ju[0] === 1, '冬至上元為陽遁一局');
    t.ok(!JIEQI_JUSHU['夏至'].yang && JIEQI_JUSHU['夏至'].ju[0] === 9, '夏至上元為陰遁九局');
    const dongzhi = buildChart('甲子', 1, '陽');
    t.equal(dongzhi['值使'], '休門', '冬至上元甲子時值使');
    t.equal(zhiShiAt('甲子', 1, '陽'), 1, '冬至上元甲子時值使在一宮');
    const xiazhi = buildChart('甲子', 9, '陰');
    t.equal(xiazhi['值使'], '景門', '夏至上元甲子時值使');
    t.equal(zhiShiAt('甲子', 9, '陰'), 9, '夏至上元甲子時值使在九宮');

    // 〈釋二遁出於四六〉子時至巳時，陽使出於六，陰使出於四
    t.equal(zhiShiAt('己巳', 1, '陽'), 6, '陽遁一局巳時值使出於六宮');
    t.equal(zhiShiAt('己巳', 9, '陰'), 4, '陰遁九局巳時值使出於四宮');

    // 〈釋二遁踰於五七歸於九一〉陽使起一終九歸一；陰使起九終一歸九
    t.equal(zhiShiAt('壬申', 1, '陽'), 9, '陽遁一局第九時至九宮');
    t.equal(zhiShiAt('癸酉', 1, '陽'), 1, '陽遁一局第十時歸一宮');
    t.equal(zhiShiAt('壬申', 9, '陰'), 1, '陰遁九局第九時至一宮');
    t.equal(zhiShiAt('癸酉', 9, '陰'), 9, '陰遁九局第十時歸九宮');

    record('《景祐符應經》值使飛宮三則（起宮異門／出於四六／踰五七歸九一）', t.errors);
}

/** 〈釋九天九地太陰六合〉陰陽兩局的四個相對位置互為鏡像 */
function runYingjingGodsTest() {
    const t = createAsserter();
    t.equal(EIGHT_GODS_YANG[7], '九天', '陽遁後一九天');
    t.equal(EIGHT_GODS_YANG[6], '九地', '陽遁後二九地');
    t.equal(EIGHT_GODS_YANG[2], '太陰', '陽遁前二太陰');
    t.equal(EIGHT_GODS_YANG[3], '六合', '陽遁前三六合');
    // 陰遁逆布，索引 +7／+6 分別落在順向的前一／前二
    t.equal(EIGHT_GODS_YIN[7], '九天', '陰遁前一九天');
    t.equal(EIGHT_GODS_YIN[6], '九地', '陰遁前二九地');
    t.equal(EIGHT_GODS_YIN[2], '太陰', '陰遁後二太陰');
    t.equal(EIGHT_GODS_YIN[3], '六合', '陰遁後三六合');
    record('《景祐符應經》〈釋九天九地太陰六合〉陰陽兩局相對位置', t.errors);
}

/** 〈釋伏吟〉「凡六甲之時，直門符皆是伏吟」 */
function runFuYinTest() {
    const t = createAsserter();
    let count = 0;
    for (const yinYang of ['陽', '陰']) {
        for (let ju = 1; ju <= 9; ju++) {
            for (const shi of ['甲子', '甲戌', '甲申', '甲午', '甲辰', '甲寅']) {
                const o = buildChart(shi, ju, yinYang);
                t.deepEqual(o['天盤'], o['地盤'], `${yinYang}${ju}局${shi}時應為伏吟`);
                count++;
            }
        }
    }
    record(`《景祐符應經》〈釋伏吟〉六甲時天盤等於地盤（${count} 例）`, t.errors.slice(0, 5));
}

/**
 * 《奇門旨歸》（清光緒十九年，朱浩文撰）卷三十八〈占驗課〉
 *
 * 作者的實戰案例記錄，每課都註明局數、日時與值符值使落宮，
 * 是外部給定的答案。中宮的處理有流派差異：原文把值符值使停在中宮，
 * 本專案依統宗、寶鑑「中五合於坤二」寄坤回報，故以 zhongAsKun 標記。
 *
 * 「癸酉日庚午時」一課的時柱與日柱不合五鼠遁（癸日午時應為戊午），
 * 校正為戊午後，原文「符使同泊兌」「癸加戊」三處敘述全部吻合，
 * 故以校正後的時柱納入。
 */
const ZHIGUI_CASES = [
    { ju: 4, yinYang: '陰', shi: '甲申', fu: '坤', use: '坤' },
    { ju: 3, yinYang: '陽', shi: '庚辰', fu: '中', use: '坎', zhongAsKun: true },
    { ju: 2, yinYang: '陽', shi: '辛巳', fu: '中', use: '坎', zhongAsKun: true },
    { ju: 2, yinYang: '陽', shi: '丙申', fu: '離', use: null },
    { ju: 8, yinYang: '陽', shi: '乙卯', fu: '兌', use: '中', zhongAsKun: true },
    { ju: 5, yinYang: '陽', shi: '癸酉', fu: '坎', use: null },
    { ju: 8, yinYang: '陽', shi: '丙辰', fu: '乾', use: '乾' },
    { ju: 8, yinYang: '陽', shi: '壬辰', fu: '震', use: null },
    { ju: 3, yinYang: '陰', shi: '壬申', fu: '艮', use: '巽' },
    { ju: 7, yinYang: '陽', shi: '乙酉', fu: '乾', use: '坎' },
    { ju: 7, yinYang: '陽', shi: '戊午', fu: '兌', use: '兌' },
    { ju: 3, yinYang: '陰', shi: '甲午', fu: '離', use: '離' },
    { ju: 7, yinYang: '陽', shi: '己巳', fu: null, use: '震' },
    { ju: 7, yinYang: '陰', shi: '丁酉', fu: '坎', use: '坎' },
    { ju: 9, yinYang: '陰', shi: '丙戌', fu: '坤', use: '中', zhongAsKun: true },
    { ju: 4, yinYang: '陽', shi: '乙巳', fu: '震', use: '離' },
    { ju: 6, yinYang: '陰', shi: '甲辰', fu: '坤', use: '坤' },
    { ju: 7, yinYang: '陰', shi: '己酉', fu: null, use: '兌' },
    { ju: 1, yinYang: '陰', shi: '丁卯', fu: null, use: '兌' },
    { ju: 9, yinYang: '陰', shi: '戊辰', fu: '離', use: '中', zhongAsKun: true },
    { ju: 8, yinYang: '陽', shi: '辛未', fu: null, use: '乾' },
    { ju: 3, yinYang: '陰', shi: '丙寅', fu: '中', use: '坎', zhongAsKun: true }
];

function runZhiguiCaseTest() {
    const t = createAsserter();
    const expect = (stated, actual, zhongAsKun) =>
        stated === actual || (zhongAsKun && stated === '中' && actual === '坤');

    let checked = 0;
    for (const c of ZHIGUI_CASES) {
        const o = buildChart(c.shi, c.ju, c.yinYang);
        const label = `${c.yinYang}${c.ju}局${c.shi}時`;
        if (c.fu) {
            t.ok(expect(c.fu, o['值符落宮'], c.zhongAsKun),
                 `${label} 值符落宮：原文 ${c.fu}，專案 ${o['值符落宮']}`);
            checked++;
            // 原文說值符泊中者，值符入中旗標必須為真
            if (c.fu === '中') {
                t.equal(o['值符入中'], true, `${label} 原文謂值符泊中，值符入中應為 true`);
                checked++;
            }
        }
        if (c.use) {
            t.ok(expect(c.use, o['值使落宮'], c.zhongAsKun),
                 `${label} 值使落宮：原文 ${c.use}，專案 ${o['值使落宮']}`);
            checked++;
            if (c.use === '中') {
                t.equal(o['值使入中'], true, `${label} 原文謂值使泊中，值使入中應為 true`);
                checked++;
            }
        }
    }
    record(`《旨歸》卷三十八占驗課 ${ZHIGUI_CASES.length} 課共 ${checked} 項落宮敘述`, t.errors);
}

/**
 * 五鼠遁／五虎遁：驗證 lunar-javascript 產出的時柱與月柱合乎古法
 *
 * 四柱由 lunar-javascript 提供，本專案並未自行推算；此測試把這個外部相依
 * 綁到《旨歸》卷一所載的規則上，若換版或換套件導致四柱錯誤會立即發現。
 */
function runPillarRuleTest() {
    const t = createAsserter();
    const GAN = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
    const ZHI = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
    // 五鼠遁（日起時例）：甲己還加甲，乙庚丙作初，丙辛起戊子，丁壬庚子居，戊癸推壬子
    const ZI_GAN = { 甲:'甲', 己:'甲', 乙:'丙', 庚:'丙', 丙:'戊', 辛:'戊', 丁:'庚', 壬:'庚', 戊:'壬', 癸:'壬' };
    // 五虎遁（年起月例）：甲己之年丙作初，乙庚之歲戊為頭，丙辛須向庚寅起，丁壬壬寅順行流，戊癸正月始從甲寅
    const YIN_GAN = { 甲:'丙', 己:'丙', 乙:'戊', 庚:'戊', 丙:'庚', 辛:'庚', 丁:'壬', 壬:'壬', 戊:'甲', 癸:'甲' };

    let count = 0;
    for (const datetime of ['2023031507', '2023072114', '2024011523', '2024060900', '2025022809', '2025111119']) {
        const o = chartToObject(generateChartByDatetime(datetime));
        const day = o['日柱'], hour = o['時柱'], year = o['年柱'], month = o['月柱'];
        const hourExpect = GAN[(GAN.indexOf(ZI_GAN[day[0]]) + ZHI.indexOf(hour[1])) % 10] + hour[1];
        t.equal(hour, hourExpect, datetime + ' 時柱應合五鼠遁');
        const monthExpect = GAN[(GAN.indexOf(YIN_GAN[year[0]]) + (ZHI.indexOf(month[1]) - 2 + 12) % 12) % 10] + month[1];
        t.equal(month, monthExpect, datetime + ' 月柱應合五虎遁');
        count++;
    }
    record(`四柱合五鼠遁與五虎遁（${count} 個時刻）`, t.errors);
}

/**
 * 《奇門遁甲秘笈大全》（明·劉基，洪武四年）
 *
 * 卷首把宮號、五行、飛星色、九星列在同一張表裡：
 * 「坎，水、一白、天蓬；坤，土、二黑、天芮…離，火、九紫、天英」
 * 這等於獨立給出了五黃入中的飛星盤就是洛書本身。
 */
function runMijiTableTest() {
    const t = createAsserter();
    const TABLE = [
        [1, '天蓬', '一白'], [2, '天芮', '二黑'], [3, '天沖', '三碧'],
        [4, '天輔', '四綠'], [5, '天禽', '五黃'], [6, '天心', '六白'],
        [7, '天柱', '七赤'], [8, '天任', '八白'], [9, '天英', '九紫']
    ];
    for (const [palace, star, color] of TABLE) {
        const index = LUOSHU_NUMBERS.indexOf(palace);
        t.equal(QIMEN_STARS[index], star, palace + '宮之星');
        t.ok(FLYING_STARS[palace].startsWith(color), palace + ' 應為' + color);
        t.equal(FLYING_STAR_CHARTS_YANG[5][index], palace, '五黃入中時' + palace + '宮之飛星數');
    }
    record('《秘笈大全》宮號／五行／飛星色／九星對照，並印證五黃入中即洛書', t.errors);
}

/**
 * 《奇門法竅》〈論伏吟反吟〉
 *
 * 「六十時中星伏，惟六時——甲子直符戊辰時、甲戌直符己卯時、甲申直符庚寅時、
 *   甲午直符辛丑時、甲辰直符壬子時、甲寅直符癸亥時」
 * 「凡六癸時為門伏，陰陽兩局皆同」
 *
 * 法竅所列的六個星伏時，其時干恰為該旬符首；旨歸與景祐所列的六甲時則是
 * 甲遁符首後落在同一宮。兩者是同一現象的兩半，本專案兩組皆為伏吟。
 */
function runFaqiaoFuYinTest() {
    const t = createAsserter();
    const build = buildChart;

    let starCount = 0, doorCount = 0;
    for (const yinYang of ['陽', '陰']) {
        for (let ju = 1; ju <= 9; ju++) {
            // 星伏：法竅所列六時（時干即符首）
            for (const shi of ['戊辰', '己卯', '庚寅', '辛丑', '壬子', '癸亥']) {
                const o = build(shi, ju, yinYang);
                t.deepEqual(o['天盤'], o['地盤'], `${yinYang}${ju}局${shi}時應為星伏`);
                starCount++;
            }
            // 門伏：六癸時，值使繞滿九宮回到符首本宮
            for (const shi of ['癸酉', '癸未', '癸巳', '癸卯', '癸丑', '癸亥']) {
                const o = build(shi, ju, yinYang);
                const diPan = getDiPan(yinYang === '陽', ju);
                const home = LUOSHU_BAGUA[diPan.indexOf(getFuShou(getXunHead(shi)))];
                t.equal(o['值使落宮'], home === '中' ? '坤' : home,
                        `${yinYang}${ju}局${shi}時值使應回符首本宮`);
                doorCount++;
            }
        }
    }
    record(`《法竅》星伏六時（${starCount} 例）與六癸時門伏（${doorCount} 例）`, t.errors.slice(0, 5));
}

/**
 * 《奇門法竅》〈論孤虛〉
 *
 * 「其法，即旬中空亡也，如甲子旬，孤在戌亥，虛在辰巳之類」
 * 「六甲旬亥酉未巳卯丑為陰虛，戌申午辰寅子為陽孤，
 *   對而擊其衝，分陽孤擊陽虛，陰孤擊陰虛」
 *
 * 注意：法竅以「孤虛」指旬空亡（即本專案的 年旬空 等欄位），
 * 而統宗〈孤虛〉是逐支推算（本專案的 年孤虛 等欄位）。兩說並存，
 * 本專案兩者皆提供。
 */
function runFaqiaoGuXuTest() {
    const t = createAsserter();
    const YANG_ZHI = ['子', '寅', '辰', '午', '申', '戌'];

    for (const [xunHead, kongZhi] of Object.entries(XUN_TO_KONGWANG_ZHI)) {
        const xk = getXunKongWang(xunHead);
        t.deepEqual(xk.孤, kongZhi.map(z => ZHI_DIRECTIONS[z]), xunHead + ' 孤即旬空亡之方');
        t.deepEqual(xk.虛, kongZhi.map(z => ZHI_DIRECTIONS[getOppositeZhi(z)]), xunHead + ' 虛即孤之對沖');
        // 每旬空亡兩支恰為一陽一陰，且陣列首位為陽支
        t.ok(YANG_ZHI.includes(kongZhi[0]) && !YANG_ZHI.includes(kongZhi[1]),
             xunHead + ' 空亡兩支應為一陽一陰且陽支在前，實得 ' + kongZhi.join(''));
        // 陽孤配陽虛、陰孤配陰虛：孤[i] 與 虛[i] 陰陽須相同
        kongZhi.forEach((z, i) => {
            t.ok(YANG_ZHI.includes(z) === YANG_ZHI.includes(getOppositeZhi(z)),
                 `${xunHead} 第${i + 1}位孤虛陰陽應一致`);
        });
    }
    record('《法竅》孤虛即旬空亡，且陽孤配陽虛、陰孤配陰虛', t.errors);
}

// ============================================================================
// 第三部分之五：API 形狀與中宮旗標
// ============================================================================

/**
 * generateQimenChart 支援兩種輸入形式，兩者必須完全等價。
 *
 * 具名物件為建議形式：位置陣列不會在日柱時柱寫反時報錯，只會安靜地產出另一張盤。
 * 舊式簽名的第一個參數（標識字串）從未參與運算，保留僅為相容。
 */
function runApiShapeTest() {
    const t = createAsserter();
    const SAMPLES = [
        ['甲辰', '丙寅', '戊午', '庚申', 5, '陽'],
        ['癸卯', '乙丑', '丁巳', '辛亥', 3, '陰'],
        ['甲子', '丙寅', '戊辰', '甲午', 7, '陽']
    ];
    for (const [年柱, 月柱, 日柱, 時柱, 局數, 陰陽] of SAMPLES) {
        const byObject = chartToObject(generateQimenChart({ 年柱, 月柱, 日柱, 時柱, 局數, 陰陽 }));
        const byLegacy = chartToObject(generateQimenChart('legacy-label', [年柱, 月柱, 日柱, 時柱, 局數, 陰陽]));
        t.deepEqual(byLegacy, byObject, `${時柱}時 兩種輸入形式應等價`);
    }
    // 缺欄位或型別錯誤時要有明確訊息
    for (const bad of [undefined, null, 42, '只有字串']) {
        try {
            generateQimenChart(bad);
            t.errors.push(`輸入 ${JSON.stringify(bad)} 應拋出錯誤`);
        } catch (error) {
            t.ok(error.message.includes('格式'), '錯誤訊息應提及格式，實際：' + error.message);
        }
    }
    record('API 形狀：具名物件與舊式位置陣列等價', t.errors);
}

/**
 * 值符入中／值使入中
 *
 * 中宮無門無方位，落宮一律寄坤回報，因此「在五宮」這個狀態從落宮欄位看不出來。
 * 但典籍以此斷事（《景祐符應經》「凡直使在五宮之時，利客不利主」、
 * 《奇門旨歸》「中五為半陰半陽之宮，只中副榜」並記錄應驗），故另立旗標。
 */
function runCenterFlagTest() {
    const t = createAsserter();
    const ALL_SHI = Object.values(SIX_XUNS).flat();

    let total = 0, fuCount = 0, shiCount = 0, bothCount = 0;
    for (const yinYang of ['陽', '陰']) {
        for (let ju = 1; ju <= 9; ju++) {
            for (const shi of ALL_SHI) {
                const o = buildChart(shi, ju, yinYang);
                total++;
                if (o['值符入中']) {
                    fuCount++;
                    t.equal(o['值符落宮'], '坤', `${yinYang}${ju}局${shi}時 值符入中時落宮應寄坤`);
                }
                if (o['值使入中']) {
                    shiCount++;
                    t.equal(o['值使落宮'], '坤', `${yinYang}${ju}局${shi}時 值使入中時落宮應寄坤`);
                }
                if (o['值符入中'] && o['值使入中']) bothCount++;
            }
        }
    }
    // 18 局中有 12 局的中宮放六儀，每局六旬中有一旬的符首落中宮
    t.equal(total, 1080, '盤面總數');
    t.equal(fuCount, 120, '值符入中的盤數');
    t.equal(shiCount, 120, '值使入中的盤數');
    t.equal(bothCount, 28, '兩者同時發生的盤數');

    // 《景祐符應經》：陽遁一局自一宮起，歷五時至戊辰在中宮
    const yingjing = buildChart('戊辰', 1, '陽');
    t.equal(yingjing['值使入中'], true, '景祐例（陽一局戊辰時）值使應入中');
    t.equal(yingjing['值使落宮'], '坤', '同例落宮仍寄坤');

    // 《元靈經》例二：陰遁八局辛未時，時干辛在中宮，原文「天任加中」
    const yuanling = buildChart('辛未', 8, '陰');
    t.equal(yuanling['值符入中'], true, '元靈經例二（陰八局辛未時）值符應入中');
    t.equal(yuanling['值符'], '天任', '同例值符仍為天任');

    record(`中宮旗標：${total} 種盤中值符入中 ${fuCount} 例、值使入中 ${shiCount} 例`, t.errors.slice(0, 5));
}

// ============================================================================
// 第三部分之六：格局判斷
// ============================================================================
/**
 * patterns.js 是純函數，只吃 chartToObject() 的結果，不依賴排盤怎麼算出來。
 * 測試分三類：
 *   1. 與典籍明列的表核對（門迫）
 *   2. 與典籍的實戰案例核對（《旨歸》卷三十八明寫格名的三課）
 *   3. 結構與統計性質（每則判定都要有出處；異說須並列）
 */

/**
 * 《奇門法竅》卷一賦文之註逐條列出的門迫（門克宮）與宮迫（宮克門）
 *
 * 「門迫者，開驚二門臨震巽二宮，金克木也；休門臨離宮，水克火也；
 *   生死二門臨坎宮，土克水也；傷杜二門臨坤艮二宮，木克土也；
 *   景門臨乾兌二宮，火克金也，此門克宮也。」
 *
 * 「宮迫者，謂開驚兩門臨離宮，火克金也；休門臨坤艮二宮，土克水也；
 *   生死兩門臨震巽二宮，木克土也；傷杜兩門臨乾兌二宮，金克木也；
 *   景門臨坎宮，水克火也，此宮克門也。」（原文明言此不為迫）
 */
const FAQIAO_MEN_PO = [
    ['開門', '震'], ['開門', '巽'], ['驚門', '震'], ['驚門', '巽'],
    ['休門', '離'],
    ['生門', '坎'], ['死門', '坎'],
    ['傷門', '坤'], ['傷門', '艮'], ['杜門', '坤'], ['杜門', '艮'],
    ['景門', '乾'], ['景門', '兌']
];

const FAQIAO_GONG_KE_MEN = [
    ['開門', '離'], ['驚門', '離'],
    ['休門', '坤'], ['休門', '艮'],
    ['生門', '震'], ['生門', '巽'], ['死門', '震'], ['死門', '巽'],
    ['傷門', '乾'], ['傷門', '兌'], ['杜門', '乾'], ['杜門', '兌'],
    ['景門', '坎']
];

/** 由五行相克推導門迫，與《法竅》明列的表逐對核對 */
function runMenPoTableTest() {
    const t = createAsserter();
    const palaceOf = gua => LUOSHU_BAGUA.indexOf(gua);

    const derivedPo = [];
    const derivedGongKe = [];
    for (const door of Object.keys(DOOR_ELEMENTS)) {
        for (const gua of LUOSHU_BAGUA) {
            if (gua === '中') continue;
            const doorElement = DOOR_ELEMENTS[door];
            const palaceElement = PALACE_ELEMENTS[palaceOf(gua)];
            if (ELEMENT_OVERCOMES[doorElement] === palaceElement) derivedPo.push([door, gua]);
            if (ELEMENT_OVERCOMES[palaceElement] === doorElement) derivedGongKe.push([door, gua]);
        }
    }
    const sortPairs = pairs => pairs.map(p => p.join('')).sort();
    t.deepEqual(sortPairs(derivedPo), sortPairs(FAQIAO_MEN_PO), '門克宮（迫）的組合');
    t.deepEqual(sortPairs(derivedGongKe), sortPairs(FAQIAO_GONG_KE_MEN), '宮克門（不為迫）的組合');
    t.equal(derivedPo.length, 13, '門迫組合數');

    record('門迫：由五行推導的組合與《法竅》卷一賦文之註明列者完全相同', t.errors);
}

/**
 * 《奇門旨歸》卷三十八占驗課中明寫格名的三課
 *
 * 這是最強的一類測試——格名由典籍的作者自己標出，非本專案自產。
 */
const ZHIGUI_PATTERN_CASES = [
    {
        名: '五不遇時',
        課: '陽八局 丙午日壬辰時',
        原文: '此時幹克日乾為五不遇，奇門最忌之格',
        日柱: '丙午', 時柱: '壬辰', 局數: 8, 陰陽: '陽',
        宮: null
    },
    {
        名: '門迫',
        課: '陽七局 甲戌日己巳時',
        原文: '值使同驚門泊震宮為門迫',
        日柱: '甲戌', 時柱: '己巳', 局數: 7, 陰陽: '陽',
        宮: '震'
    },
    {
        名: '伏吟',
        課: '陰三局 丙午日甲午時',
        原文: '此課初看伏吟，亦似不動之象',
        日柱: '丙午', 時柱: '甲午', 局數: 3, 陰陽: '陰',
        宮: null
    }
];

function runZhiguiPatternTest() {
    const t = createAsserter();
    for (const c of ZHIGUI_PATTERN_CASES) {
        const chart = chartToObject(generateQimenChart({
            年柱: '甲子', 月柱: '甲子', 日柱: c.日柱, 時柱: c.時柱,
            局數: c.局數, 陰陽: c.陰陽
        }));
        const found = detectPatterns(chart).filter(f => f.格 === c.名);
        t.ok(found.length > 0, `${c.課} 應判出「${c.名}」（原文：${c.原文}）`);
        if (found.length > 0 && c.宮) {
            t.ok(found.some(f => f.宮 === c.宮),
                 `${c.課} 的${c.名}應落於${c.宮}宮，實得 ${found.map(f => f.宮).join('、')}`);
        }
    }
    record(`《旨歸》占驗課明寫格名的 ${ZHIGUI_PATTERN_CASES.length} 課皆能判出`, t.errors);
}

/** 六儀擊刑的兩種讀法：嚴式必為寬式的子集，且出現率相差近四倍 */
function runJiXingReadingTest() {
    const t = createAsserter();
    const ALL_SHI = Object.values(SIX_XUNS).flat();
    let total = 0, loose = 0, strict = 0, strictNotLoose = 0;

    for (const yinYang of ['陽', '陰']) {
        for (let ju = 1; ju <= 9; ju++) {
            for (const shi of ALL_SHI) {
                const chart = buildChart(shi, ju, yinYang);
                const items = detectLiuYiJiXing(chart);
                const hasLoose = items.some(f => f.讀法 && f.讀法.startsWith('寬式'));
                const hasStrict = items.some(f => f.讀法 && f.讀法.startsWith('嚴式'));
                total++;
                if (hasLoose) loose++;
                if (hasStrict) strict++;
                if (hasStrict && !hasLoose) strictNotLoose++;
                // 每則都必須標明讀法
                for (const f of items) {
                    t.ok(!!f.讀法, `${yinYang}${ju}局${shi}時 六儀擊刑的判定應標明讀法`);
                }
            }
        }
    }
    t.equal(total, 1080, '盤面總數');
    t.equal(strictNotLoose, 0, '嚴式必為寬式的子集');
    t.ok(loose > strict * 2, `寬式應遠多於嚴式，實得寬式 ${loose}、嚴式 ${strict}`);

    record(`六儀擊刑異說並列：寬式 ${loose} 例、嚴式 ${strict} 例（嚴式為寬式子集）`, t.errors.slice(0, 5));
}

/** 判定結果的結構完整性，以及兩項可獨立驗算的出現率 */
function runPatternStructureTest() {
    const t = createAsserter();
    const VALID_JIXIONG = ['吉', '凶', '中性'];
    const PALACES = LUOSHU_BAGUA;

    let charts = 0, wuBuYu = 0, fuYin = 0;
    for (let month = 1; month <= 12; month++) {
        const daysInMonth = new Date(2024, month, 0).getDate();
        for (let day = 1; day <= daysInMonth; day += 3) {
            for (const hour of [1, 7, 13, 19]) {
                const datetime = '2024' + String(month).padStart(2, '0')
                    + String(day).padStart(2, '0') + String(hour).padStart(2, '0');
                const chart = chartToObject(generateChartByDatetime(datetime));
                charts++;
                const items = detectPatterns(chart);
                for (const f of items) {
                    t.ok(['格局', '十干克應'].includes(f.類), datetime + ' 類別無效：' + f.類);
                    t.ok(typeof f.格 === 'string' && f.格.length > 0, datetime + ' 判定缺少格名');
                    t.ok(VALID_JIXIONG.includes(f.吉凶), datetime + ' 吉凶值無效：' + f.吉凶);
                    t.ok(f.宮 === null || PALACES.includes(f.宮), datetime + ' 宮位無效：' + f.宮);
                    t.ok(Array.isArray(f.出處) && f.出處.length > 0, datetime + ' 判定缺少出處');
                    for (const src of f.出處) {
                        t.ok(!!src.書 && !!src.篇 && !!src.文, datetime + ' 出處欄位不完整');
                    }
                }
                if (items.some(f => f.格 === '五不遇時')) wuBuYu++;
                // 限定盤面層級的伏吟：十干克應的戊戊格典籍亦名伏吟，但那是逐宮判定
                if (items.some(f => f.類 === '格局' && f.格 === '伏吟')) fuYin++;
            }
        }
    }
    // 五不遇時的出現率不在此處斷言——它由 runWuBuYuTableTest 以典籍的十組定式
    // 全枚舉比對，那才是外部依據。原先那條「應占 20%」的期望值是從被測程式的
    // 錯誤邏輯推導出來的，在缺陷存在時數學上不可能變紅。此處只留統計供閱讀。
    const ratio = wuBuYu / charts;
    // 每旬十時中有二時伏吟（旬首甲時與符首本身之時）
    const fuYinRatio = fuYin / charts;
    t.ok(Math.abs(fuYinRatio - 0.2) < 0.03,
         `伏吟出現率應約為 20%（每旬十時中二時），實得 ${(fuYinRatio * 100).toFixed(1)}%`);

    record(`格局判定結構完整性（${charts} 張盤），五不遇時 ${(ratio * 100).toFixed(1)}%、伏吟 ${(fuYinRatio * 100).toFixed(1)}%`,
           t.errors.slice(0, 5));
}

/**
 * 三奇入墓：乙與丙各書一致，丁奇有異說故兩讀法並列
 */
function runSanQiRuMuTest() {
    const t = createAsserter();
    const ALL_SHI = Object.values(SIX_XUNS).flat();

    let total = 0, unanimous = 0, dingGen = 0, dingQian = 0;
    for (const yinYang of ['陽', '陰']) {
        for (let ju = 1; ju <= 9; ju++) {
            for (const shi of ALL_SHI) {
                const chart = buildChart(shi, ju, yinYang);
                total++;
                for (const item of detectSanQiRuMu(chart)) {
                    t.equal(item.格, '三奇入墓', '格名');
                    t.equal(item.吉凶, '凶', '三奇入墓應為凶');
                    if (item.讀法) {
                        if (item.讀法.startsWith('丁墓艮八')) dingGen++;
                        else if (item.讀法.startsWith('丁墓乾六')) dingQian++;
                        // 有異說者必為丁奇
                        t.ok(item.細節.includes('丁奇'), '標明讀法者應為丁奇：' + item.細節);
                    } else {
                        unanimous++;
                        // 各書一致者出處應有三部
                        t.equal(item.出處.length, 3, '乙丙入墓應載於三部文獻：' + item.細節);
                    }
                }
            }
        }
    }
    t.equal(total, 1080, '盤面總數');
    // 乙臨坤、丙臨乾各約九分之一，合計約九分之二
    t.ok(Math.abs(unanimous / total - 2 / 9) < 0.02,
         `乙丙入墓應約占九分之二，實得 ${(unanimous / total * 100).toFixed(1)}%`);
    // 兩種丁奇讀法各約九分之一，且不應相差懸殊
    t.ok(Math.abs(dingGen - dingQian) < total * 0.02,
         `兩種丁奇讀法出現次數應相近，實得艮八 ${dingGen}、乾六 ${dingQian}`);

    // 黃金案例：2024-01-01 14 時，甲子日辛未時，陽遁四局，天盤乙臨坤
    const sample = chartToObject(generateChartByDatetime('2024010114'));
    const found = detectSanQiRuMu(sample);
    t.ok(found.some(f => f.宮 === '坤' && f.細節.includes('乙奇')),
         '2024-01-01 14時應判出乙奇臨坤入墓');

    record(`三奇入墓：乙丙一致 ${unanimous} 例，丁奇兩讀法各 ${dingGen}／${dingQian} 例`, t.errors.slice(0, 5));
}

/**
 * 天遁、地遁、人遁
 *
 * 三部文獻條件一致，且天遁地遁都要求天盤之奇壓在特定地盤干之上，
 * 不是只看門與奇同宮。此處以實際時刻為黃金案例，並驗證嚴格條件確實成立。
 */
const SAN_DUN_CASES = [
    { 名: '天遁', datetime: '2024010218', 宮: '坎', 門: '生門', 奇: '丙', 地盤: '丁' },
    { 名: '地遁', datetime: '2024010616', 宮: '震', 門: '開門', 奇: '乙', 地盤: '己' },
    { 名: '人遁', datetime: '2024010312', 宮: '坎', 門: '休門', 奇: '丁', 神: '太陰' }
];

function runSanDunTest() {
    const t = createAsserter();
    const palaceIndex = gua => LUOSHU_BAGUA.indexOf(gua);

    for (const c of SAN_DUN_CASES) {
        const chart = chartToObject(generateChartByDatetime(c.datetime));
        const found = detectSanDun(chart).filter(f => f.格 === c.名);
        t.ok(found.length > 0, `${c.datetime} 應判出${c.名}`);
        if (!found.length) continue;
        t.ok(found.some(f => f.宮 === c.宮), `${c.名}應落於${c.宮}宮`);
        // 逐項核對嚴格條件
        const i = palaceIndex(c.宮);
        t.equal(chart['天門'][i], c.門, `${c.名}該宮之門`);
        t.equal(chart['天盤'][i], c.奇, `${c.名}該宮之天盤`);
        if (c.地盤) t.equal(chart['地盤'][i], c.地盤, `${c.名}該宮之地盤`);
        if (c.神) t.equal(chart['八神'][i], c.神, `${c.名}該宮之八神`);
        t.equal(found[0].吉凶, '吉', `${c.名}應為吉`);
    }

    // 全域檢查：每一則天遁與地遁都必須滿足地盤條件，不得只憑門奇同宮
    let checked = 0;
    for (const yinYang of ['陽', '陰']) {
        for (let ju = 1; ju <= 9; ju++) {
            for (const shi of Object.values(SIX_XUNS).flat()) {
                const chart = buildChart(shi, ju, yinYang);
                for (const f of detectSanDun(chart)) {
                    const i = palaceIndex(f.宮);
                    if (f.格 === '天遁') t.equal(chart['地盤'][i], '丁', '天遁必須下加地盤丁');
                    if (f.格 === '地遁') t.equal(chart['地盤'][i], '己', '地遁必須下加地盤己');
                    if (f.格 === '人遁') t.equal(chart['八神'][i], '太陰', '人遁必須與太陰同宮');
                    checked++;
                }
            }
        }
    }
    record(`三遁：三則黃金案例與全盤 ${checked} 例的嚴格條件`, t.errors.slice(0, 5));
}

/**
 * 截路空亡
 *
 * 表中所列諸時，其時干皆為壬或癸（水阻其路）。反之則不然——戊癸日的戌亥時
 * 因十干配十二支繞回，時干亦為壬癸，卻不在典籍所列表中。此測試同時驗證
 * 正向性質與「不以時干壬癸代之」這個刻意的取捨。
 */
function runJieLuKongWangTest() {
    const t = createAsserter();
    const GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
    const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
    const ZI_GAN = { 甲: '甲', 己: '甲', 乙: '丙', 庚: '丙', 丙: '戊', 辛: '戊', 丁: '庚', 壬: '庚', 戊: '壬', 癸: '壬' };
    const hourGan = (dayGan, zhi) => GAN[(GAN.indexOf(ZI_GAN[dayGan]) + ZHI.indexOf(zhi)) % 10];

    // 元靈經所列之表
    const TABLE = {
        甲: ['申', '酉'], 己: ['申', '酉'], 乙: ['午', '未'], 庚: ['午', '未'],
        丙: ['辰', '巳'], 辛: ['辰', '巳'], 丁: ['寅', '卯'], 壬: ['寅', '卯'],
        戊: ['子', '丑'], 癸: ['子', '丑']
    };
    // 表中每一格的時干都必須是壬或癸
    for (const [dayGan, hours] of Object.entries(TABLE)) {
        for (const zhi of hours) {
            t.ok(['壬', '癸'].includes(hourGan(dayGan, zhi)),
                 `${dayGan}日${zhi}時的時干應為壬癸，實得 ${hourGan(dayGan, zhi)}`);
        }
    }
    // 戊癸日的戌亥時干亦為壬癸，但不在表中——刻意不以時干壬癸代替查表
    for (const dayGan of ['戊', '癸']) {
        for (const zhi of ['戌', '亥']) {
            t.ok(['壬', '癸'].includes(hourGan(dayGan, zhi)), `${dayGan}日${zhi}時的時干確為壬癸`);
            t.ok(!TABLE[dayGan].includes(zhi), `${dayGan}日${zhi}時不在元靈經所列表中`);
        }
    }

    // 實際盤面：出現率應恰為十二分之二
    let charts = 0, hit = 0;
    for (let month = 1; month <= 12; month++) {
        const daysInMonth = new Date(2024, month, 0).getDate();
        for (let day = 1; day <= daysInMonth; day += 2) {
            for (let hour = 0; hour < 24; hour += 2) {
                const datetime = '2024' + String(month).padStart(2, '0')
                    + String(day).padStart(2, '0') + String(hour).padStart(2, '0');
                const chart = chartToObject(generateChartByDatetime(datetime));
                charts++;
                const found = detectJieLuKongWang(chart);
                if (found.length) {
                    hit++;
                    t.ok(['壬', '癸'].includes(chart['時干']),
                         `${datetime} 判為截路空亡，其時干應為壬癸，實得 ${chart['時干']}`);
                }
            }
        }
    }
    t.ok(Math.abs(hit / charts - 2 / 12) < 0.02,
         `截路空亡出現率應約為十二分之二，實得 ${(hit / charts * 100).toFixed(1)}%`);

    // 黃金案例：2024-01-01 16 時，甲子日壬申時
    const sample = chartToObject(generateChartByDatetime('2024010116'));
    t.equal(sample['時柱'], '壬申', '樣本時柱');
    t.ok(detectJieLuKongWang(sample).length > 0, '甲日申時應判為截路空亡');

    record(`截路空亡：表中諸時皆為壬癸時，${charts} 張盤中 ${hit} 例（${(hit / charts * 100).toFixed(1)}%）`,
           t.errors.slice(0, 5));
}

/**
 * 十干克應（81 格）
 *
 * 本表由《旨歸》卷五與《秘笈大全》〈十干剋應訣〉建成，《法竅》之異名另行收錄。
 * 最重要的一項驗證是拿《統宗》〈奇門四十格〉來對——統宗未參與建表，其中十則
 * 屬十干克應者可作為完全獨立的外部基準。
 */

/** 《奇門遁甲統宗》〈奇門四十格〉中屬十干克應的十則 */
const TONGZONG_FORTY = [
    { 格: '戊丙', 名: '青龍返首', 原文: '龍回首　甲值符加地盤丙奇' },
    { 格: '丙戊', 名: '飛鳥跌穴', 原文: '鳥跌穴　丙奇加地盤甲值符' },
    { 格: '乙辛', 名: '青龍逃走', 原文: '龍逃走　乙奇遇辛' },
    { 格: '辛乙', 名: '白虎猖狂', 原文: '虎猖狂　辛遇乙奇' },
    { 格: '丁癸', 名: '朱雀投江', 原文: '雀投江　丁奇見癸' },
    { 格: '庚癸', 名: '大格', 原文: '大格　庚臨六癸' },
    { 格: '庚己', 名: '刑格', 原文: '刑格　庚臨六己' },
    { 格: '庚壬', 名: '小格', 原文: '小格　庚臨壬' },
    { 格: '庚丙', 名: '太白入熒', 原文: '太白入熒　六庚加丙奇又庚加卯日時酉丁' },
    { 格: '庚戊', 名: '太白天乙伏宮', 原文: '伏宮　庚臨值符' },
    // 原先漏收，而它正是能抓出錯的那一則：統宗、旨歸、秘笈、寶鑒四書皆作
    // 「夭矯／妖矯」，惟《法竅》作「妖蹻」，而主表原採法竅之名。
    // 漏掉這一則，「與本表逐格相符」才成立。
    { 格: '癸丁', 名: '螣蛇夭矯', 原文: '蛇妖矯　癸見丁奇', 統宗簡稱: true },
    // 統宗此名與其賦文「六丙加庚熒入白」並存，與本表「熒入太白」名異而位同，
    // 故比對異名而非主名
    { 格: '丙庚', 名: '熒入太白', 原文: '火入金鄉　丙奇加六庚金又丙奇加驚用值符之庚辛',
      統宗簡稱: true }
];

function runShiGanKeYingTest() {
    const t = createAsserter();
    const GAN9 = ['乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
    const VALID = ['吉', '凶', '中性'];

    // 表格完整性：九干相加共 81 格，甲不上盤故不列
    const seen = new Set();
    let good = 0, bad = 0, neutral = 0;
    for (const top of GAN9) {
        for (const bottom of GAN9) {
            const chart = { 天盤: [top], 地盤: [bottom] };
            // 藉判定器本身取值，避免測試直接依賴內部表
            const found = detectShiGanKeYing({
                天盤: [top, '', '', '', '', '', '', '', ''],
                地盤: [bottom, '', '', '', '', '', '', '', '']
            });
            t.equal(found.length, 1, `${top}加${bottom} 應有一則判定`);
            if (!found.length) continue;
            const item = found[0];
            seen.add(top + bottom);
            t.ok(typeof item.格 === 'string' && item.格.length >= 2,
                 `${top}加${bottom} 格名應為兩字以上，實得 ${item.格}`);
            t.equal(item.類, '十干克應', `${top}加${bottom} 類別`);
            t.ok(VALID.includes(item.吉凶), `${top}加${bottom} 吉凶值無效：${item.吉凶}`);
            t.ok(item.出處.length >= 2,
                 `${top}加${bottom} 應至少載旨歸與秘笈兩處出處`);
            if (item.吉凶 === '吉') good++; else if (item.吉凶 === '凶') bad++; else neutral++;
        }
    }
    t.equal(seen.size, 81, '九干相加應為 81 格');
    t.ok(good > 0 && bad > 0 && neutral > 0, '三種吉凶取值皆應出現');

    // 甲不上盤，故表中不應有甲
    for (const other of GAN9.concat(['甲'])) {
        for (const pair of [['甲', other], [other, '甲']]) {
            const found = detectShiGanKeYing({
                天盤: [pair[0], '', '', '', '', '', '', '', ''],
                地盤: [pair[1], '', '', '', '', '', '', '', '']
            });
            t.equal(found.length, 0, `${pair[0]}加${pair[1]} 不應在表中（甲不上盤）`);
        }
    }

    record(`十干克應：81 格完整（吉 ${good}、凶 ${bad}、中性 ${neutral}），甲不入表`, t.errors.slice(0, 5));
}

/** 與《統宗》〈奇門四十格〉交叉驗證——統宗未參與建表 */
function runTongzongFortyTest() {
    const t = createAsserter();
    for (const c of TONGZONG_FORTY) {
        const [top, bottom] = [...c.格];
        const found = detectShiGanKeYing({
            天盤: [top, '', '', '', '', '', '', '', ''],
            地盤: [bottom, '', '', '', '', '', '', '', '']
        });
        t.equal(found.length, 1, `${c.格} 應有判定`);
        if (!found.length) continue;
        // 統宗多用簡稱（龍回首、鳥跌穴、虎猖狂…），故 c.名 記的是本表之名，
        // 這一項驗的主要是**格位**（哪一干加哪一干）；名的外部錨定另見
        // runBaojianXiongAnchorTest。統宗簡稱與本表明顯異名者標 統宗簡稱。
        t.equal(found[0].格, c.名, `${c.格}（統宗：${c.原文}）`);

        // 統宗所書之名若與本表主名不同，必須出現在異名裡——
        // 否則「與統宗相符」只驗到格位而未驗到名
        if (c.統宗簡稱) {
            const tongzongName = c.原文.split('　')[0];
            const names = [found[0].格, ...(found[0].異名 || []).map(v => v.名)];
            t.ok(names.includes(tongzongName),
                 `${c.格}：統宗作「${tongzongName}」，應見於主名或異名，實得 ${names.join('、')}`);
        }
    }
    record(`《統宗》〈奇門四十格〉中 ${TONGZONG_FORTY.length} 則十干克應與本表相符`, t.errors);
}

/** 實際盤面：每盤九宮各得一格，中宮因天地盤同干必為同干相加 */
function runKeYingOnChartsTest() {
    const t = createAsserter();
    const ALL_SHI = Object.values(SIX_XUNS).flat();
    let charts = 0, findings = 0, withAlt = 0;

    for (const yinYang of ['陽', '陰']) {
        for (let ju = 1; ju <= 9; ju++) {
            for (const shi of ALL_SHI) {
                const chart = buildChart(shi, ju, yinYang);
                const items = detectShiGanKeYing(chart);
                charts++;
                findings += items.length;
                t.equal(items.length, 9, `${yinYang}${ju}局${shi}時 應九宮各一格`);
                // 中宮天地盤恆同干（rotateMapping 保留中宮），故必為同干相加
                const center = items.find(f => f.宮 === '中');
                t.ok(!!center, '中宮應有判定');
                if (center) {
                    t.equal(chart['天盤'][4], chart['地盤'][4], '中宮天地盤應同干');
                }
                for (const f of items) if (f.異名) withAlt++;
            }
        }
    }
    t.equal(charts, 1080, '盤面總數');
    t.equal(findings, 9720, '判定總數應為 1080 × 9');
    t.ok(withAlt > 0, '應有帶異名者');

    record(`十干克應於 ${charts} 張盤共 ${findings} 則，其中 ${withAlt} 則帶法竅異名`, t.errors.slice(0, 5));
}

/**
 * 旺相休囚
 *
 * 語料中互不相容者至少七家，本專案收其中有完整算例的四家。收錄的門檻是
 * 「自帶算例，可用其算例反驗其對照表」——見 runVigorReadingExampleTest。
 *
 * 八門旺相則依《統宗》〈八節應八門旺相〉的八節輪轉，其冬至一節列出全部八門。
 */

/** 找出月支屬該五行的一個日期時刻（月柱由節氣定，故以實際起盤取得） */
function findChartWithMonthElement(element) {
    for (let month = 1; month <= 12; month++) {
        for (let day = 5; day <= 25; day += 5) {
            const datetime = '2024' + String(month).padStart(2, '0') + String(day).padStart(2, '0') + '12';
            const chart = chartToObject(generateChartByDatetime(datetime));
            if (ZHI_ELEMENTS[chart['月柱'][1]] === element) return chart;
        }
    }
    return null;
}

/**
 * 四家的天蓬水星算例——每一家都自帶，故可用算例反驗其對照表
 *
 * 這是收錄一家的門檻：對照表是自「規則」那句話讀出來的，而算例是獨立的一組
 * 月份，兩者相符才算讀對。四家逐字照抄如下，皆為天蓬（水星）的五格：
 *
 *  甲《寶鑒御定》〈釋氣應〉：
 *    「如水星旺於寅卯月、相於亥子月、休於四五月、囚於辰戌丑未月、廢於申酉月是也。」
 *  乙《法竅》卷一〈煙波釣叟賦注釋〉：
 *    「如天蓬水星，旺於亥子月，水同類也；相於寅卯月，水生木也；廢於申酉月，
 *      金生水也；休於巳午月，水克火也；囚於辰戌丑未月，土克水也。」
 *  丙《統宗》卷之一〈九星旺相〉：
 *    「如天蓬水星，正二月旺，十月十一月相，七月八月死，三六九十二月囚，四五月废。」
 *  丁《圖書集成》〈釋九星休旺〉引《三元經》：
 *    「假如天蓬星是水星，旺於寅卯月，相於亥子月，死於申酉月，囚於辰戌丑未月，
 *      休於巳午月是也。」
 *
 * 月份對五行：寅卯＝木、巳午（四五月）＝火、申酉（七八月）＝金、
 * 亥子（十、十一月）＝水、辰戌丑未（三六九十二月）＝土。
 */
const TIANPENG_WORKED_EXAMPLES = [
    {
        讀法: '煙波釣叟歌通行本',
        算例: { 木: '旺', 水: '相', 火: '休', 土: '囚', 金: '廢' }
    },
    {
        讀法: '法竅注本（旺相互易）',
        算例: { 水: '旺', 木: '相', 金: '廢', 火: '休', 土: '囚' }
    },
    {
        讀法: '統宗卷一〈九星旺相〉',
        算例: { 木: '旺', 水: '相', 金: '死', 土: '囚', 火: '廢' }
    },
    {
        讀法: '三元經（圖書集成本）',
        算例: { 木: '旺', 水: '相', 金: '死', 土: '囚', 火: '休' }
    }
];

/** 《法竅》卷一注文的五組星二十五格——收錄門檻最高的一家，全表可驗 */
const FAQIAO_VIGOR = [
    { 星: '天蓬', 五行: '水', 旺: '水', 相: '木', 廢: '金', 休: '火', 囚: '土' },
    { 星: '天英', 五行: '火', 旺: '火', 相: '土', 廢: '木', 休: '金', 囚: '水' },
    { 星: '天沖', 五行: '木', 旺: '木', 相: '火', 廢: '水', 休: '土', 囚: '金' },
    { 星: '天輔', 五行: '木', 旺: '木', 相: '火', 廢: '水', 休: '土', 囚: '金' },
    { 星: '天心', 五行: '金', 旺: '金', 相: '水', 廢: '土', 休: '木', 囚: '火' },
    { 星: '天柱', 五行: '金', 旺: '金', 相: '水', 廢: '土', 休: '木', 囚: '火' },
    { 星: '天芮', 五行: '土', 旺: '土', 相: '金', 廢: '火', 休: '水', 囚: '木' },
    { 星: '天禽', 五行: '土', 旺: '土', 相: '金', 廢: '火', 休: '水', 囚: '木' },
    { 星: '天任', 五行: '土', 旺: '土', 相: '金', 廢: '火', 休: '水', 囚: '木' }
];

/**
 * 每一家的對照表都必須被它自己的算例證實
 *
 * 對照表是從「規則」那句話讀出來的（如《寶鑒》「皆以我生之月為旺，我同之月為相…」），
 * 算例則是獨立的一組月份。兩者相符，才證明那句話被讀對了。
 * 這一則測試不碰盤面，只驗表與算例是否自洽。
 */
function runVigorReadingExampleTest() {
    const t = createAsserter();
    const relationOf = (own, month) => {
        if (own === month) return '同類';
        if (ELEMENT_GENERATES[own] === month) return '我生';
        if (ELEMENT_GENERATES[month] === own) return '生我';
        if (ELEMENT_OVERCOMES[own] === month) return '我克';
        if (ELEMENT_OVERCOMES[month] === own) return '克我';
        return null;
    };

    t.equal(VIGOR_READINGS.length, TIANPENG_WORKED_EXAMPLES.length,
            '收錄的每一家都必須有天蓬算例——這是收錄的門檻');

    for (const worked of TIANPENG_WORKED_EXAMPLES) {
        const reading = VIGOR_READINGS.find(r => r.讀法 === worked.讀法);
        t.ok(!!reading, `應有讀法「${worked.讀法}」`);
        if (!reading) continue;

        const seen = new Set();
        for (const [monthElement, expected] of Object.entries(worked.算例)) {
            const relation = relationOf('水', monthElement);   // 天蓬屬水
            t.ok(relation !== null, `水對${monthElement}月的關係`);
            t.equal(reading.對照[relation], expected,
                    `${worked.讀法}：天蓬（水）於${monthElement}月，算例作「${expected}」`);
            seen.add(relation);
        }
        t.equal(seen.size, 5, `${worked.讀法}：天蓬算例應涵蓋全部五種關係`);
        t.equal(Object.keys(reading.對照).length, 5, `${worked.讀法}：對照表應為五格`);
    }

    // 四家互不相同——若有兩家完全一樣，就不該分列
    const signatures = VIGOR_READINGS.map(r =>
        ['同類', '我生', '生我', '我克', '克我'].map(k => r.對照[k]).join(''));
    t.equal(new Set(signatures).size, VIGOR_READINGS.length,
            `四家的對照表應互不相同，實得 ${signatures.join('、')}`);

    // 「旺」與「相」在各家之間確實互換——這正是不可只取一家的理由
    const tongLei = VIGOR_READINGS.map(r => r.對照.同類);
    t.ok(tongLei.includes('旺') && tongLei.includes('相'),
         `同類一格在各家之間應兼有旺與相，實得 ${tongLei.join('、')}`);

    // 出處必須逐字釘住。只斷言「非空」或「夠長」擋不住把引文改掉一半——
    // 而出處原文正是整個判斷層可信度的載體。
    const EXPECTED_SOURCES = {
        '煙波釣叟歌通行本': {
            書: '奇門寶鑒御定',
            篇: '釋氣應',
            文: '九星蓬水、英火、衝輔木、任芮禽土、柱心金，皆以我生之月為旺，' +
                '我同之月為相，我克之月為休，克我之月為囚，生我之月為廢。' +
                '如水星旺於寅卯月、相於亥子月、休於四五月、囚於辰戌丑未月、' +
                '廢於申酉月是也。'
        },
        '法竅注本（旺相互易）': {
            書: '奇門法竅',
            篇: '卷一．煙波釣叟賦注釋',
            文: '與我同行即為旺，我生之月誠為相，廢於父母休於財，囚於鬼兮真不妄。' +
                '……經云：「我生之月為相，同類之月為旺，生我之月為廢，' +
                '我克之月為休，克我之月為囚。」'
        },
        '統宗卷一〈九星旺相〉': {
            書: '奇門遁甲統宗',
            篇: '卷之一．九星旺相',
            文: '九星旺于子月，相于本月，死于父母月，囚于鬼月，废于妻月。' +
                '如天蓬水星，正二月旺，十月十一月相，七月八月死，三六九十二月囚，四五月废。'
        },
        '三元經（圖書集成本）': {
            書: '欽定古今圖書集成博物彙編藝術典',
            篇: '釋九星休旺（引《三元經》）',
            文: '九星各旺於我生月，相於同類月，死於生我月，囚於官鬼月，休於財月。' +
                '……假如天蓬星是水星，旺於寅卯月，相於亥子月，死於申酉月，' +
                '囚於辰戌丑未月，休於巳午月是也。'
        }
    };
    for (const reading of VIGOR_READINGS) {
        const expected = EXPECTED_SOURCES[reading.讀法];
        t.ok(!!expected, `${reading.讀法} 應在出處黃金表中`);
        if (!expected) continue;
        t.equal(reading.出處.書, expected.書, `${reading.讀法} 出處之書`);
        t.equal(reading.出處.篇, expected.篇, `${reading.讀法} 出處之篇`);
        t.equal(reading.出處.文, expected.文, `${reading.讀法} 出處原文須逐字相符`);
    }

    // 未收的三家須記明理由，不得靜默丟棄
    t.equal(VIGOR_READINGS_NOT_ADOPTED.length, 3, '未收的家數');
    // 未收之由也要釘住關鍵字——它是「為何不收」的唯一記載，
    // 改成空話等於把判斷的依據抹掉
    const EXPECTED_REASONS = {
        '三元經（演義本）': '全無算例',
        '秘笈卷二十三〈論十方星將生剋〉': '全無算例',
        '演義〈五行旺相休囚〉方位式': '不以月令而以方位立說'
    };
    for (const reading of VIGOR_READINGS_NOT_ADOPTED) {
        t.ok(!!reading.未收之由 && reading.未收之由.length > 10,
             `${reading.讀法} 應記明未收之由`);
        const keyword = EXPECTED_REASONS[reading.讀法];
        t.ok(!!keyword, `${reading.讀法} 應在未收清單中`);
        t.ok(!!keyword && reading.未收之由.startsWith(keyword),
             `${reading.讀法} 未收之由應以「${keyword}」起`);
        t.ok(!VIGOR_READINGS.some(r => r.讀法 === reading.讀法),
             `${reading.讀法} 不應同時出現在收錄清單`);
    }

    record(`九星旺相四家，各以自帶的天蓬算例反驗其對照表`, truncate(t.errors, 10));
}



function runVigorTest() {
    const t = createAsserter();
    const ELEMENTS = ['木', '火', '土', '金', '水'];

    // 先直接核對地支五行本身。若不先驗這一步，下方以 ZHI_ELEMENTS 挑選月份的作法
    // 會變成循環驗證——表寫錯了也只是挑到別的月份，測試照樣通過。
    // 分組取自《法竅》〈論九星旺相〉的算例月份：
    //   「旺於亥子月，水同類也；相於寅卯月，水生木也；廢於申酉月，金生水也；
    //     休於巳午月，水克火也；囚於辰戌丑未月，土克水也。」
    const FAQIAO_MONTH_GROUPS = {
        水: ['亥', '子'], 木: ['寅', '卯'], 金: ['申', '酉'],
        火: ['巳', '午'], 土: ['辰', '戌', '丑', '未']
    };
    for (const [element, branches] of Object.entries(FAQIAO_MONTH_GROUPS)) {
        for (const zhi of branches) {
            t.equal(ZHI_ELEMENTS[zhi], element, `${zhi}月應屬${element}（法竅算例）`);
        }
    }
    t.equal(Object.keys(ZHI_ELEMENTS).length, 12, '十二地支俱全，不多不少');

    // 為五種月令各取一張真盤
    const byElement = {};
    for (const element of ELEMENTS) {
        const chart = findChartWithMonthElement(element);
        t.ok(!!chart, `應能找到月令屬${element}的盤`);
        if (chart) byElement[element] = chart;
    }

    // 《法竅》二十五格（九星去重後為五組五行）
    for (const spec of FAQIAO_VIGOR) {
        for (const state of ['旺', '相', '廢', '休', '囚']) {
            const chart = byElement[spec[state]];
            if (!chart) continue;
            const entry = assessVigor(chart).九星.find(s => s.星 === spec.星);
            t.ok(!!entry, `盤中應有${spec.星}`);
            if (!entry) continue;
            t.equal(entry.五行, spec.五行, `${spec.星}之五行`);
            const faqiao = entry.諸家.find(x => x.讀法 === '法竅注本（旺相互易）');
            t.ok(!!faqiao, `${spec.星} 應有法竅注本一讀`);
            if (faqiao) {
                t.equal(faqiao.狀態, state,
                    `法竅注本：${spec.星}（${spec.五行}）於${spec[state]}月應為${state}`);
            }
        }
    }

    // 諸家並列：每顆星都要給滿四家，且克我一格四家一致作囚
    for (const element of ELEMENTS) {
        for (const entry of assessVigor(byElement[element]).九星) {
            t.equal(entry.諸家.length, VIGOR_READINGS.length,
                    `${entry.星} 應並列四家`);
            for (const school of entry.諸家) {
                t.ok(!!school.讀法 && !!school.狀態, `${entry.星} 的讀法與狀態`);
                t.ok(!!school.出處 && !!school.出處.文, `${entry.星}（${school.讀法}）應帶出處`);
            }
            if (entry.關係 === '克我') {
                const states = new Set(entry.諸家.map(x => x.狀態));
                t.deepEqual([...states], ['囚'], '克我一格四家應一致作囚');
            }
        }
    }

    record('九星旺相：四家並列，法竅注本二十五格逐格核對', t.errors.slice(0, 5));
}

/**
 * 八門旺相：《統宗》〈八節應八門旺相〉
 *
 * 「冬至：休門旺，生門絕，傷門胎，杜門沐，景門死，死門囚，驚門休，開門廢。
 *   立春生門旺，春分傷門旺，立夏杜門旺，夏至景門旺，立秋死門旺，
 *   秋分驚門旺，立冬開門旺，冬至周而復始。」
 */
const TONGZONG_DOOR_DONGZHI = {
    休門: '旺', 生門: '絕', 傷門: '胎', 杜門: '沐',
    景門: '死', 死門: '囚', 驚門: '休', 開門: '廢'
};

const TONGZONG_PROSPEROUS_DOOR = {
    冬至: '休門', 立春: '生門', 春分: '傷門', 立夏: '杜門',
    夏至: '景門', 立秋: '死門', 秋分: '驚門', 立冬: '開門'
};

function runDoorVigorTest() {
    const t = createAsserter();

    // 冬至一節，八門狀態逐一核對
    let dongzhiChart = null;
    for (const datetime of ['2024122212', '2024122512', '2024123012']) {
        const chart = chartToObject(generateChartByDatetime(datetime));
        if (chart['節氣'] === '冬至') { dongzhiChart = chart; break; }
    }
    t.ok(!!dongzhiChart, '應能取得冬至節的盤');
    if (dongzhiChart) {
        const vigor = assessVigor(dongzhiChart);
        t.equal(vigor.八節.卦, '坎', '冬至屬坎卦');
        t.equal(vigor.八節.旺門, '休門', '冬至休門旺');
        t.equal(vigor.八門.length, 8, '八門各有狀態');
        for (const entry of vigor.八門) {
            t.equal(entry.狀態, TONGZONG_DOOR_DONGZHI[entry.門],
                `冬至 ${entry.門} 應為${TONGZONG_DOOR_DONGZHI[entry.門]}`);
        }
    }

    // 八節各自的旺門
    const found = {};
    for (let month = 1; month <= 12; month++) {
        for (let day = 3; day <= 28; day += 5) {
            const datetime = '2024' + String(month).padStart(2, '0') + String(day).padStart(2, '0') + '12';
            const chart = chartToObject(generateChartByDatetime(datetime));
            const vigor = assessVigor(chart);
            if (!vigor.八節) continue;
            const gua = vigor.八節.卦;
            if (!found[gua]) found[gua] = vigor;
        }
    }
    const GUA_TO_JIE = { 坎: '冬至', 艮: '立春', 震: '春分', 巽: '立夏', 離: '夏至', 坤: '立秋', 兌: '秋分', 乾: '立冬' };
    t.equal(Object.keys(found).length, 8, '全年應涵蓋八節');
    for (const [gua, vigor] of Object.entries(found)) {
        t.equal(vigor.八節.旺門, TONGZONG_PROSPEROUS_DOOR[GUA_TO_JIE[gua]],
            `${GUA_TO_JIE[gua]}（${gua}卦）之旺門`);
        // 每節八門恰各得一種狀態，無重複
        const states = vigor.八門.map(d => d.狀態);
        t.equal(new Set(states).size, 8, `${GUA_TO_JIE[gua]} 八門狀態應各不相同`);
    }

    record('八門旺相：冬至八門逐一相符，八節旺門各如統宗所列', t.errors.slice(0, 5));
}

/** 手動起盤無節氣，八門旺相應為 null 而非臆測 */
function runVigorFallbackTest() {
    const t = createAsserter();
    const manual = buildChart('庚申', 5, '陽');
    const vigor = assessVigor(manual);
    t.equal(vigor.八門, null, '無節氣時八門旺相應為 null');
    t.equal(vigor.八節, null, '無節氣時八節應為 null');
    t.ok(!!vigor.月令, '月柱仍在，月令應可判定');
    t.equal(vigor.九星.length, 9, '九星旺相不依賴節氣');
    record('無節氣的手動盤：八門旺相從缺而非臆測', t.errors);
}

// ============================================================================
// 第四部分：輸入驗證
// ============================================================================

const datetimeValidationCases = [
    { name: '長度不足', input: '202401', expectedError: '格式' },
    { name: '長度過長', input: '20240115100000', expectedError: '格式' },
    { name: '非字串', input: 2024011510, expectedError: '格式' },
    { name: '含非數字字元', input: '2024011X10', expectedError: '格式' },
    { name: '含空白', input: '2024 11510', expectedError: '格式' },
    { name: '月份超過 12', input: '2024130110', expectedError: '月份' },
    { name: '月份為 0', input: '2024000110', expectedError: '月份' },
    { name: '日期超過 31', input: '2024013210', expectedError: '日期' },
    { name: '日期為 0', input: '2024010010', expectedError: '日期' },
    { name: '不存在的日期（2024-02-31）', input: '2024023110', expectedError: '日期' },
    { name: '不存在的日期（2023-02-29 非閏年）', input: '2023022910', expectedError: '日期' },
    { name: '小時超過 23', input: '2024011524', expectedError: '小時' }
];

function runDatetimeValidationTest(testCase) {
    const t = createAsserter();
    try {
        generateChartByDatetime(testCase.input);
        t.errors.push('應該拋出錯誤但沒有');
    } catch (error) {
        t.ok(
            error.message.includes(testCase.expectedError),
            `錯誤訊息應包含「${testCase.expectedError}」，實際：${error.message}`
        );
    }
    record('datetime 驗證 - ' + testCase.name, t.errors);
}

const pillarValidationCases = [
    { name: '時柱非干支（ZZ）', input: ['甲子', '甲子', '甲子', 'ZZ', 5, '陽'], expectedError: '時柱' },
    { name: '時柱干支不合法（甲乙）', input: ['甲子', '甲子', '甲子', '甲乙', 5, '陽'], expectedError: '時柱' },
    { name: '年柱長度錯誤', input: ['甲', '甲子', '甲子', '甲子', 5, '陽'], expectedError: '年柱' },
    { name: '日柱非六十甲子（甲丑）', input: ['甲子', '甲子', '甲丑', '甲子', 5, '陽'], expectedError: '日柱' },
    { name: '局數超出範圍', input: ['甲子', '甲子', '甲子', '甲子', 10, '陽'], expectedError: '局數' },
    { name: '局數非整數', input: ['甲子', '甲子', '甲子', '甲子', 5.5, '陽'], expectedError: '局數' },
    { name: '陰陽值無效', input: ['甲子', '甲子', '甲子', '甲子', 5, 'X'], expectedError: '陰陽' },
    { name: '參數個數不足', input: ['甲子', '甲子', '甲子'], expectedError: '格式' }
];

function runPillarValidationTest(testCase) {
    const t = createAsserter();
    try {
        // 此區刻意沿用舊式 (label, 陣列) 簽名，一併涵蓋相容路徑
        generateQimenChart('legacy', testCase.input);
        t.errors.push('應該拋出錯誤但沒有（會產出一張看似完整、實則無意義的盤）');
    } catch (error) {
        t.ok(
            error.message.includes(testCase.expectedError),
            `錯誤訊息應包含「${testCase.expectedError}」，實際：${error.message}`
        );
    }
    record('四柱驗證 - ' + testCase.name, t.errors);
}

// ============================================================================
// 第五部分：generateChartNow
// ============================================================================

function runNowTest() {
    const t = createAsserter();
    let result = null;

    try {
        result = generateChartNow();
    } catch (error) {
        record('generateChartNow', ['拋出例外：' + error.message]);
        return;
    }

    t.ok(result instanceof Map, '回傳值應為 Map');

    const obj = chartToObject(result);
    for (const field of REQUIRED_FIELDS) {
        t.ok(result.has(field), '缺少必要欄位：' + field);
    }
    t.ok(['陰', '陽'].includes(obj['陰陽']), '陰陽值無效：' + obj['陰陽']);
    t.ok(obj['局數'] >= 1 && obj['局數'] <= 9, '局數超出 1-9：' + obj['局數']);
    t.ok(!!JIEQI_JUSHU[obj['節氣']], '節氣未收錄：' + obj['節氣']);

    assertPositionsSelfConsistent(t, obj, '');

    record(`generateChartNow（${obj['節氣']} ${obj['三元']} ${obj['陰陽']}遁${obj['局數']}局）`, t.errors);
}

// ============================================================================
// 第六部分：兩個 API 的一致性
// ============================================================================

function runConsistencyTest() {
    const t = createAsserter();
    const datetime = '2024011510';

    const obj1 = chartToObject(generateChartByDatetime(datetime));
    const obj2 = chartToObject(generateQimenChart({
        年柱: obj1['年柱'], 月柱: obj1['月柱'], 日柱: obj1['日柱'],
        時柱: obj1['時柱'], 局數: obj1['局數'], 陰陽: obj1['陰陽']
    }));

    const scalarFields = ['年柱', '月柱', '日柱', '時柱', '陰陽', '局數',
                          '旬首', '符首', '值符', '值使', '值符落宮', '值使落宮', '飛步'];
    for (const field of scalarFields) {
        t.equal(obj2[field], obj1[field], field);
    }

    for (const field of ['地盤', '天盤', '天門', '九星', '八神']) {
        t.deepEqual(obj2[field], obj1[field], field);
    }

    record('generateChartByDatetime 與 generateQimenChart 結果一致', t.errors);
}

// ============================================================================
// 定局法：拆補與符頭
// ============================================================================

/**
 * 《奇門法竅》〈論拆局補局〉的兩則算例
 *
 * 原文所繫年份為「歲在丙申」，然其所述干支序列（丙子→戊寅→己卯→甲申→己丑）
 * 與該文的曆日日序不能兩全；干支序列自身完全自洽（己卯＋5＝甲申＋5＝己丑），
 * 故以干支反查真實曆日，取立春交於丙子日、白露交於己酉日者為驗。
 *
 * 算例一原文：「當是先年大寒下元…系甲戌下局之符頭統領…十二日己卯…作立春上元；
 *   十七日甲申…作立春中元；二十二日己丑…作立春下局」
 * 算例二原文：「七月二十九日甲午…作處暑上局；初四日己亥…處暑中局；
 *   初九日甲辰…處暑下局；十四日己酉寅初三刻白露」
 */
const FA_QIAO_JU_CASES = [
    {
        名: '算例一：立春交於丙子日（1974）',
        起: [1974, 2, 1],
        期望: {
            丙子: { 節氣: '大寒', 三元: '下元', 符頭: '甲戌' },
            丁丑: { 節氣: '大寒', 三元: '下元', 符頭: '甲戌' },
            戊寅: { 節氣: '大寒', 三元: '下元', 符頭: '甲戌' },
            己卯: { 節氣: '立春', 三元: '上元', 符頭: '己卯' },
            甲申: { 節氣: '立春', 三元: '中元', 符頭: '甲申' },
            己丑: { 節氣: '立春', 三元: '下元', 符頭: '己丑' }
        }
    },
    {
        名: '算例二：白露交於己酉日（1962）',
        起: [1962, 8, 20],
        期望: {
            甲午: { 節氣: '處暑', 三元: '上元', 符頭: '甲午' },
            己亥: { 節氣: '處暑', 三元: '中元', 符頭: '己亥' },
            甲辰: { 節氣: '處暑', 三元: '下元', 符頭: '甲辰' },
            己酉: { 節氣: '白露', 三元: '上元', 符頭: '己酉' }
        }
    }
];

function ymdhToString(year, month, day) {
    return `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}12`;
}

function addDays([year, month, day], offset) {
    const date = new Date(Date.UTC(year, month - 1, day + offset));
    return [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
}

/** 《法竅》兩則算例：符頭法必須逐日重現其節氣、三元與符頭 */
function runFaQiaoJuTests() {
    for (const kase of FA_QIAO_JU_CASES) {
        const t = createAsserter();
        const seen = new Set();

        for (let offset = 0; offset < 30; offset++) {
            const [y, m, d] = addDays(kase.起, offset);
            const obj = chartToObject(
                generateChartByDatetime(ymdhToString(y, m, d), { 定局法: '符頭' })
            );
            const expected = kase.期望[obj['日柱']];
            if (!expected) continue;
            seen.add(obj['日柱']);

            const where = `${y}-${m}-${d} 日柱${obj['日柱']}`;
            t.equal(obj['節氣'], expected.節氣, `${where} 節氣`);
            t.equal(obj['三元'], expected.三元, `${where} 三元`);
            t.equal(obj['符頭'], expected.符頭, `${where} 符頭`);
            t.equal(obj['定局法'], '符頭', `${where} 定局法`);
        }

        for (const ganZhi of Object.keys(kase.期望)) {
            t.ok(seen.has(ganZhi), `三十日內未遇日柱 ${ganZhi}，算例未能完整比對`);
        }

        record(`《法竅》${kase.名}`, truncate(t.errors, 12));
    }
}

/**
 * 《奇門遁甲統宗》康熙五十六至五十八年的完整置閏算例
 *
 * 這是九部書中唯一帶絕對紀年、可直接執行的置閏算例。原文（統宗〈置閏法〉）：
 *
 *   「五十七年五月二十四日壬申卯初二度交夏至節，十六日即為甲子上元，
 *     乃超過九日矣，宜先於芒種節上置閏。蓋五月初一己酉即為芒種上局，
 *     初六日為芒種中局，十一日為芒種下局。至十六日為芒種上中下三局已足矣。
 *     自十六甲子至二十四壬申，已超九日，為期大遠。故十六日甲子**不作夏至上局**，
 *     而為芒種閏奇上局，二十一日己巳作芒種閏奇中局，二十六日甲戌作芒種閏奇下局。
 *     至六月初一日戊寅閏奇方終，六月初二日己卯始得為夏至上局。斯乃謂之接氣。
 *     直至康熙五十八年六月二十三日立秋，而甲子符頭恰當日，是為正授，
 *     本日即是陰遁二局。上元至七月初九日庚辰處暑即超一日矣。」
 *
 * 十四組農曆日期與干支已逐一核對無誤，故此算例可執行。
 * 舊實作（置閏落在算術上被迫重複的節氣）在此十個檢核點錯五個，
 * 且芒種為陽遁、夏至為陰遁，錯的不只是局數而是陰陽遁翻面。
 */
const TONGZONG_LEAP_CASE = [
    { 西曆: [1718, 5, 30], 節氣: '芒種', 三元: '上元', 註: '五月初一己酉，芒種上局' },
    { 西曆: [1718, 6, 4], 節氣: '芒種', 三元: '中元', 註: '初六日，芒種中局' },
    { 西曆: [1718, 6, 9], 節氣: '芒種', 三元: '下元', 註: '十一日，芒種下局' },
    { 西曆: [1718, 6, 14], 節氣: '芒種', 三元: '上元', 閏局: true, 註: '十六日甲子，不作夏至上局而為芒種閏奇上局' },
    { 西曆: [1718, 6, 19], 節氣: '芒種', 三元: '中元', 閏局: true, 註: '二十一日己巳，芒種閏奇中局' },
    { 西曆: [1718, 6, 24], 節氣: '芒種', 三元: '下元', 閏局: true, 註: '二十六日甲戌，芒種閏奇下局' },
    { 西曆: [1718, 6, 29], 節氣: '夏至', 三元: '上元', 註: '六月初二己卯，始得為夏至上局' },
    { 西曆: [1718, 7, 4], 節氣: '夏至', 三元: '中元' },
    { 西曆: [1719, 8, 8], 節氣: '立秋', 三元: '上元', 超接: '正授', 陰陽: '陰', 局數: 2,
      註: '甲子符頭恰當日，是為正授，本日即是陰遁二局' },
    { 西曆: [1719, 8, 24], 節氣: '處暑', 三元: '上元', 註: '七月初九日庚辰處暑' }
];

/** 《統宗》康熙算例逐點比對 */
function runTongzongLeapCaseTest() {
    const t = createAsserter();
    for (const kase of TONGZONG_LEAP_CASE) {
        const [y, m, d] = kase.西曆;
        const datetime = `${y}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}12`;
        const obj = chartToObject(generateChartByDatetime(datetime, { 定局法: '符頭' }));
        const where = `${y}-${m}-${d}${kase.註 ? '（' + kase.註 + '）' : ''}`;

        t.equal(obj['節氣'], kase.節氣, `${where} 節氣`);
        t.equal(obj['三元'], kase.三元, `${where} 三元`);
        if (kase.閏局 !== undefined) t.equal(obj['閏局'], kase.閏局, `${where} 閏局`);
        if (kase.超接 !== undefined) t.equal(obj['超接'], kase.超接, `${where} 超接`);
        if (kase.陰陽 !== undefined) t.equal(obj['陰陽'], kase.陰陽, `${where} 陰陽遁`);
        if (kase.局數 !== undefined) t.equal(obj['局數'], kase.局數, `${where} 局數`);
    }
    record(`《統宗》康熙 56–58 年置閏算例（${TONGZONG_LEAP_CASE.length} 個檢核點）`,
           truncate(t.errors, 12));
}

/**
 * 《統宗》所記的正授，是整條符頭鏈的外部錨點
 *
 * 鏈由純規則自 1700 年附近的任意起點走出，並未把這個日期餵進去；
 * 若規則正確，康熙五十八年立秋（1719-08-08）必落在正授。
 * 這是「宣告須可證偽」的同一個模式——錨點是檢查，不是建構輸入。
 */
function runFuTouAnchorTest() {
    const t = createAsserter();
    const anchor = FU_TOU_ZHENG_SHOU_ANCHOR;
    t.equal(anchor.西曆, '1719-08-08', '錨點日期');

    const [y, m, d] = anchor.西曆.split('-').map(Number);
    const obj = chartToObject(generateChartByDatetime(
        `${y}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}12`, { 定局法: '符頭' }));

    t.equal(obj['節氣'], anchor.節氣, '錨點之節氣');
    t.equal(obj['超接'], '正授', '錨點必為正授——鏈若走錯，此處必不為零');
    t.equal(obj['超接天數'], 0, '錨點之日差');
    t.equal(obj['上元符頭'], anchor.符頭, '錨點之上元符頭');
    t.equal(obj['三元'], '上元', '錨點之三元');
    // 《統宗》：「本日即是陰遁二局」
    t.equal(obj['陰陽'], '陰', '錨點之陰陽遁');
    t.equal(obj['局數'], 2, '錨點之局數');

    record('符頭鏈的外部錨點：《統宗》康熙五十八年立秋正授', t.errors);
}

/**
 * 置閏必落在芒種或大雪，且不得跳過任何節氣
 *
 * 《演義》：「置閏定在芒種、大雪之後。設遇小滿、小雪二氣之交，
 * 雖超九日、十日，不可置閏。」《寶鑒》：「遇芒種大雪，重用本氣三元。」
 * 又《統宗》：「俾三元之次序不紊耳。」——故節氣不得被跳過。
 *
 * 舊實作（置閏落在算術上被迫重複的節氣）在兩百年間把閏散在夏季各節氣，
 * 大雪一次也沒有，且跳過二十一個節氣，全在冬季。
 */
function runFuTouChainInvariantTest() {
    const t = createAsserter();
    const chain = getFuTouChainForRange(1800, 2100);
    t.ok(chain.length > 7000, `1800–2100 應有七千個以上的符頭循環，實得 ${chain.length}`);

    const leapNames = new Set();
    const gaps = [];
    let leaps = 0;
    let skipped = 0;

    for (let i = 0; i < chain.length; i++) {
        gaps.push(chain[i].日差);
        if (chain[i].閏局) {
            leaps++;
            leapNames.add(chain[i].節氣);
            t.equal(chain[i].節氣, chain[i - 1] ? chain[i - 1].節氣 : null,
                    `閏局須與前一循環同節氣（重用本氣三元）`);
        }
        if (i > 0) {
            const advance = chain[i].節氣索引 - chain[i - 1].節氣索引;
            t.ok(advance === 0 || advance === 1,
                 `循環間的節氣推進量只能是 0（閏）或 1，實得 ${advance}`);
            if (advance > 1) skipped += advance - 1;
        }
    }

    t.deepEqual([...leapNames].sort(), ['大雪', '芒種'],
                `置閏只應落在芒種與大雪，實得 ${[...leapNames].join('、')}`);
    t.equal(skipped, 0, '不得跳過任何節氣（統宗「俾三元之次序不紊」）');

    // 漂移滿十五日需 15 ÷ (365.2422/24 − 15) ≈ 68.7 個節氣 ≈ 2.86 年
    const yearsPerLeap = 301 / leaps;
    t.ok(yearsPerLeap > 2.5 && yearsPerLeap < 3.3,
         `置閏頻率應近理論值 2.86 年，實得每 ${yearsPerLeap.toFixed(2)} 年一閏（${leaps} 次）`);

    // 觸發值為日差 8（典籍作九日，含頭計數）；因閏須待芒種或大雪，
    // 日差可續增至十一。《演義》：「超越經旬或九朝，或過十一日無饒。」
    t.ok(Math.max(...gaps) >= 8, `超神極值應達觸發值以上，實得 ${Math.max(...gaps)}`);
    t.ok(Math.max(...gaps) <= 11,
         `超神極值不應超過十一日（《演義》「或過十一日無饒」），實得 ${Math.max(...gaps)}`);
    t.ok(Math.min(...gaps) >= -9,
         `接氣極值：置閏退十五日，故不應低於 -9，實得 ${Math.min(...gaps)}`);

    record(`符頭鏈不變式（1800–2100，${chain.length} 循環，閏 ${leaps} 次落於 ${[...leapNames].join('、')}）`,
           truncate(t.errors, 10));
}

/**
 * 時粒度的疊局未實作——把這個已知從缺釘在數字上
 *
 * 《法竅》〈論拆局補局〉的原文本身即以時刻定義：一段文字裡疊局出現三次，
 * 如「子丑二時與寅初之三刻，卻是己酉上元符頭統領，法當疊作處暑上局補之」。
 * 本實作為日粒度，該日全日歸於同一元。
 *
 * 可觀測的後果：1962-09-08 白露交於寅初三刻（約 03:45），《法竅》作
 * 「符先節後，法當用超」，而本專案因符頭與節氣同日而作「正授」。
 * 此測試斷言該分歧確實存在——若日後實作了疊局，這一則會變紅，
 * 那正是提醒你回來改文件的時候。
 */
function runFuTouKnownGapTest() {
    const t = createAsserter();

    const obj = chartToObject(generateChartByDatetime('1962090812', { 定局法: '符頭' }));
    t.equal(obj['節氣'], '白露', '1962-09-08 之節氣');
    t.equal(obj['超接'], '正授',
            '日粒度下白露與符頭同日故作正授；《法竅》以時粒度作「符先節後，法當用超」');

    // 全日同元：疊局若實作，同日不同時辰會分屬兩元
    const hours = ['00', '02', '04', '12', '22'];
    const yuans = new Set();
    for (const hour of hours) {
        yuans.add(chartToObject(generateChartByDatetime('19620908' + hour, { 定局法: '符頭' }))['三元']);
    }
    t.equal(yuans.size, 1,
            `日粒度實作下，同一日各時辰應同屬一元，實得 ${[...yuans].join('、')}`);

    // 《秘笈》另記的閾值須留有記載，不得靜默丟棄
    t.ok(!!FU_TOU_LEAP_THRESHOLD_VARIANT.文.includes('過十四日'),
         '《秘笈》「過十四日」一說應留有記載');
    t.ok(FU_TOU_LEAP_THRESHOLD_VARIANT.未實作之由.length > 10,
         '未實作之由須記明');

    record('符頭法的已知從缺：時粒度疊局，與《秘笈》的第二閾值', t.errors);
}

/**
 * 兩派定局法的分歧
 *
 * 《寶鑒御定》記錄了這場爭論：李氏主拆補而斥超閏，寶鑒斥拆補
 * 「以亂符頭」「殊違尊甲之旨」。本專案不代為擇一，兩法俱備，
 * 但必須量出分歧有多大——若兩法結果幾乎相同，這個選項就沒有存在意義；
 * 實測九成以上時刻局數不同，故它確實是兩套盤，不是兩個名字。
 */
function runJuMethodDivergenceTest() {
    const t = createAsserter();
    let same = 0;
    let different = 0;

    for (let month = 1; month <= 12; month++) {
        for (let day = 1; day <= 28; day++) {
            const datetime = ymdhToString(2024, month, day);
            const chaiBu = chartToObject(generateChartByDatetime(datetime));
            const fuTou = chartToObject(generateChartByDatetime(datetime, { 定局法: '符頭' }));

            if (chaiBu['局數'] === fuTou['局數'] && chaiBu['陰陽'] === fuTou['陰陽']) same++;
            else different++;

            t.equal(chaiBu['定局法'], '拆補', `${datetime} 預設定局法`);
            t.equal(fuTou['定局法'], '符頭', `${datetime} 指定定局法`);
        }
    }

    const rate = different / (same + different);
    t.ok(rate > 0.8, `2024 年兩法分歧率僅 ${(rate * 100).toFixed(1)}%，低於預期——選項恐已失效`);
    t.equal(same + different, 336, '取樣日數');

    record(`拆補與符頭之分歧（2024 全年 336 時，${(rate * 100).toFixed(1)}% 局數不同）`, truncate(t.errors, 8));
}

/** 定局法選項不得破壞既有行為，未知定局法必須拋錯而非默默取預設 */
function runJuMethodOptionTests() {
    const t = createAsserter();
    const datetime = '2024011510';

    const implicit = chartToObject(generateChartByDatetime(datetime));
    const explicit = chartToObject(generateChartByDatetime(datetime, {}));
    const named = chartToObject(generateChartByDatetime(datetime, { 定局法: '拆補' }));

    for (const key of ['節氣', '三元', '局數', '陰陽', '節後天數', '定局法']) {
        t.equal(explicit[key], implicit[key], `傳空物件不得改變 ${key}`);
        t.equal(named[key], implicit[key], `明寫「拆補」不得改變 ${key}`);
    }
    t.equal(implicit['定局法'], '拆補', '預設定局法為拆補');
    t.equal(implicit['符頭'], undefined, '拆補法不應輸出符頭欄位');
    t.equal(implicit['閏局'], undefined, '拆補法不應輸出閏局欄位');

    const fuTou = chartToObject(generateChartByDatetime(datetime, { 定局法: '符頭' }));
    t.equal(fuTou['節後天數'], undefined, '符頭法不應輸出節後天數——該欄位是拆補法的量度');
    t.ok(typeof fuTou['超接天數'] === 'number', '符頭法應輸出超接天數');
    t.ok(typeof fuTou['閏局'] === 'boolean', '符頭法應輸出閏局旗標');

    let threw = null;
    try {
        generateChartByDatetime(datetime, { 定局法: '飛盤' });
    } catch (error) {
        threw = error.message;
    }
    t.ok(threw !== null, '未知定局法必須拋錯');
    t.ok(threw !== null && threw.includes('飛盤'), '錯誤訊息應指出所傳的定局法');

    // 符頭法所出之盤必須與手動起盤一致——定局法只換局數，不換排盤規則
    const manual = chartToObject(generateQimenChart({
        年柱: fuTou['年柱'], 月柱: fuTou['月柱'], 日柱: fuTou['日柱'], 時柱: fuTou['時柱'],
        局數: fuTou['局數'], 陰陽: fuTou['陰陽']
    }));
    for (const key of ['地盤', '天盤', '天門', '九星', '八神', '值符', '值使']) {
        t.deepEqual(fuTou[key], manual[key], `符頭法盤面 ${key} 應與手動起盤一致`);
    }

    record('定局法選項（預設不變、未知拋錯、盤面一致）', truncate(t.errors, 10));
}

// ============================================================================
// 判斷層的入口守衛
// ============================================================================

/**
 * 守衛的價值不在 DX，在可信度
 *
 * 修正前 `detectFanYin({})` 不拋錯，而是憑空產出一則「反吟・凶」，
 * 細節寫著「值符undefined由本位undefined宮飛至對宮undefined宮」，
 * 且該假判斷帶著一條查證屬實的煙波釣叟歌引文。對一個以「每則判斷帶出處、
 * 不亂講」為賣點的專案，發出**附真實出處的假凶格**是可信度層級的缺陷。
 *
 * 測試斷言**錯誤訊息的內容**而非只斷言有拋錯——若只斷言拋錯，
 * 拿掉守衛之後仍會拋 TypeError，變異測試照樣是綠的。
 */
function throwsWith(fn) {
    try {
        fn();
        return null;
    } catch (error) {
        return error.message;
    }
}

/** 各判定器所需的欄位——與 patterns.js 的守衛互為對照 */
const DETECTOR_REQUIRED_FIELDS = [
    { 名: 'detectFuYin', fn: detectFuYin, 欄位: ['天盤', '地盤'] },
    { 名: 'detectFanYin', fn: detectFanYin, 欄位: ['值符', '值符落宮'] },
    { 名: 'detectMenPo', fn: detectMenPo, 欄位: ['天門'] },
    { 名: 'detectWuBuYu', fn: detectWuBuYu, 欄位: ['日柱', '時干', '時柱'] },
    { 名: 'detectSanQiRuMu', fn: detectSanQiRuMu, 欄位: ['天盤'] },
    { 名: 'detectSanDun', fn: detectSanDun, 欄位: ['天盤', '地盤', '天門', '八神'] },
    { 名: 'detectLiuYiJiXing', fn: detectLiuYiJiXing, 欄位: ['天盤', '符首'] },
    { 名: 'detectJieLuKongWang', fn: detectJieLuKongWang, 欄位: ['日柱', '時干', '時柱'] },
    { 名: 'detectShiGanKeYing', fn: detectShiGanKeYing, 欄位: ['天盤', '地盤'] },
    { 名: 'assessVigor', fn: assessVigor, 欄位: ['九星'] }
];

// ============================================================================
// 引文核對
// ============================================================================

/**
 * 讓出處可被證偽
 *
 * 「每則判斷帶出處」是本專案的第一原則，但在此之前，**唯一的檢查是
 * 「書、篇、文三欄非空」**——原文改成「（原文從缺）」、書名篇名改成假名，
 * 測試都不會紅。這些字串是整個判斷層可信度的載體，卻是全專案最無法被
 * 證偽的部分。
 *
 * `scripts/verify-citations.mjs` 把每一條引文拿去語料中回查。語料是公有領域
 * 古籍的純文字檔、不在本 repo，故此測試**在語料存在時才跑，不存在時明白跳過**
 * ——跳過會印在報告上，不會被誤當成通過。
 *
 * **它釘得住什麼、釘不住什麼：**
 *   釘得住：抄寫忠實度——引文是否真的出自所引之書。
 *   釘不住：引文為真但**不支持程式據以實作的解讀**。門迫的篇名誤植、
 *           旺相的孤證異文，都是引文為真而解讀有誤，那只能靠人讀。
 */
// ============================================================================
// 五層運算的入口守衛
// ============================================================================

/**
 * 這五個函數是公開 API，README 教使用者直接呼叫
 *
 * 但它們原本完全不擋錯：傳入不在地盤上的干（最典型的就是「甲」）時，
 * `indexOf` 回 -1，被下游靜默當成中宮處理，產出一張**看起來完整、
 * 實際錯位**的盤。主 API `generateQimenChart` 早有完整驗證，
 * 缺口正在使用者被教著走的那條路上。
 */
function runLayerGuardTest() {
    const t = createAsserter();
    const diPan = getDiPan(true, 5);

    const throwsWith = fn => {
        try { fn(); return null; } catch (e) { return e.message; }
    };

    // 一、甲不上盤——這是典籍的不變量，先驗它本身
    // 《寶鑒御定》〈釋六儀遁六甲〉：六甲遁於六儀之下
    let plates = 0;
    for (const isYang of [true, false]) {
        for (let ju = 1; ju <= 9; ju++) {
            const plate = getDiPan(isYang, ju);
            plates++;
            t.equal(plate.length, 9, `${isYang ? '陽' : '陰'}遁${ju}局應為九格`);
            t.equal(plate.indexOf('甲'), -1,
                    `${isYang ? '陽' : '陰'}遁${ju}局的地盤不應有甲（六甲遁於六儀之下）`);
        }
    }
    t.equal(plates, 18, '十八局俱應檢查');

    // 二、傳入甲時，錯誤訊息要點明甲遁——那是最可能的原因
    for (const [名, 呼叫] of [
        ['calculateTianPan', () => calculateTianPan(true, '甲', '戊', diPan)],
        ['calculateNineStars', () => calculateNineStars('天蓬', '甲', diPan)],
        ['calculateEightGods', () => calculateEightGods(true, '甲', diPan)]
    ]) {
        const message = throwsWith(呼叫);
        t.ok(message !== null, `${名} 傳入甲應拋錯，而非靜默產出錯位的盤`);
        if (!message) continue;
        t.ok(message.includes(名), `${名} 的錯誤訊息應指名自己`);
        t.ok(message.includes('甲遁'), `${名} 的錯誤訊息應點明甲遁，那是最可能的原因`);
        // 訊息的價值在於告訴人怎麼辦，故解法指引也要釘住
        t.ok(message.includes('符首'), `${名} 的錯誤訊息應指出解法（以符首代之）`);
    }

    // 三、符首亦須在盤上
    const fuShouBad = throwsWith(() => calculateTianPan(true, '戊', '甲', diPan));
    t.ok(fuShouBad !== null && fuShouBad.includes('符首'), '符首不在盤上應拋錯並指名');
    const doorBad = throwsWith(() => calculateEightDoors(true, '休門', 3, '甲', diPan));
    t.ok(doorBad !== null && doorBad.includes('符首'), '八門：符首不在盤上應拋錯');

    // 四、九星與八門之名須合法
    const starBad = throwsWith(() => calculateNineStars('天霸', '戊', diPan));
    t.ok(starBad !== null && starBad.includes('九星'), '非九星之名應拋錯');
    const gateBad = throwsWith(() => calculateEightDoors(true, '吉門', 3, '戊', diPan));
    t.ok(gateBad !== null && gateBad.includes('八門'), '非八門之名應拋錯');

    // 五、地盤形狀
    for (const bad of [null, undefined, '戊', ['戊'], new Array(8).fill('戊')]) {
        const message = throwsWith(() => calculateTianPan(true, '戊', '戊', bad));
        t.ok(message !== null, `地盤為 ${JSON.stringify(bad)} 應拋錯`);
        t.ok(message !== null && message.includes('九格'),
             `地盤形狀的錯誤訊息應說明應為九格`);
    }

    // 六、正常路徑一格未動——守衛不得改變任何既有輸出
    let charts = 0;
    for (const isYang of [true, false]) {
        for (let ju = 1; ju <= 9; ju++) {
            const plate = getDiPan(isYang, ju);
            for (const gan of plate) {
                t.ok(Array.isArray(calculateTianPan(isYang, gan, plate[0], plate)),
                     `陽陰${ju}局 ${gan} 的天盤應照常產出`);
                charts++;
            }
        }
    }
    t.equal(charts, 162, '十八局各九干，共一百六十二組皆應照常運算');

    record(`五層運算入口守衛（十八局皆無甲，${charts} 組正常路徑無回歸）`,
           truncate(t.errors, 10));
}

function runCitationTest() {
    const t = createAsserter();

    // 一、不依賴語料的結構檢查：每一條都要有書、篇、文
    const entries = Object.entries(SOURCES);
    t.ok(entries.length >= 19, `SOURCES 應有十九條以上，實得 ${entries.length}`);
    for (const [key, source] of entries) {
        t.ok(!!source.書 && !!source.篇 && !!source.文, `${key} 的書篇文三欄應齊備`);
        t.ok(Object.isFrozen(source), `${key} 應凍結`);
        // 有校記必有核對片段，反之亦然——宣告了出入就必須留下可核對的部分
        t.equal(Boolean(source.校記), Boolean(source.核對片段),
                `${key} 的校記與核對片段須成對出現`);
    }

    // 二、同一部書不得有兩種寫法。此前 SOURCES 中「奇門寶鑑御定」與
    //     「奇門寶鑒御定」並存，指的是同一部書——正是核對器抓出來的。
    const books = [...new Set(entries.map(([, s]) => s.書))];
    const CORPUS_BOOKS = Object.keys(BOOK_FILES).concat(NOT_A_SINGLE_FILE);
    for (const book of books) {
        t.ok(CORPUS_BOOKS.includes(book),
             `書名「${book}」不在語料檔對照表中——同一部書是否有兩種寫法？`);
    }

    // 三、語料存在時，逐條回查
    const corpus = process.env.QIMEN_CORPUS || 'C:/gitcode/doc';
    const hasCorpus = existsSync(`${corpus}/奇門遁甲統宗.txt`);
    if (!hasCorpus) {
        record(`引文核對（結構檢查 ${entries.length} 條；語料不在 ${corpus}，逐條回查已跳過）`,
               t.errors);
        return;
    }

    const results = verifyAllCitations(corpus);
    const bad = results.filter(r => r.狀態 === '不符' || r.狀態 === '失敗');
    for (const r of truncate(bad, 8)) {
        t.errors.push(typeof r === 'string' ? r
            : `${r.key}：${r.狀態}　${r.說明}${r.未命中 ? '　未命中：' + r.未命中[0] : ''}`);
    }
    const missing = results.filter(r => r.狀態 === '無語料');
    t.equal(missing.length, 0,
            `有語料目錄卻找不到部分書：${missing.map(r => r.key).join('、')}`);

    const tally = {};
    for (const r of results) tally[r.狀態] = (tally[r.狀態] || 0) + 1;
    record(`引文核對（${Object.entries(tally).map(([k, v]) => `${k} ${v}`).join('、')}）`,
           t.errors);
}

function runJudgementGuardTest() {
    const t = createAsserter();

    // 一、把起盤函數的 Map 直接丟進來——最容易犯的一階錯
    const mapMessage = throwsWith(() => detectPatterns(generateChartByDatetime('2024011510')));
    t.ok(mapMessage !== null, 'detectPatterns 收到 Map 應拋錯');
    t.ok(mapMessage !== null && mapMessage.includes('chartToObject'),
         `錯誤訊息應指出解法 chartToObject，實得：${mapMessage}`);
    t.ok(mapMessage !== null && mapMessage.includes('Map'),
         `錯誤訊息應指出收到的是 Map，實得：${mapMessage}`);

    // 二、不得自動把 Map 轉成物件——那會把 Map 固化成第二種合法輸入形狀
    t.ok(throwsWith(() => detectPatterns(new Map())) !== null,
         '空 Map 亦應拋錯，而非被默默轉換');

    // 三、型別不對
    for (const [input, 描述] of [[null, 'null'], [undefined, 'undefined'],
                                  [[], '陣列'], ['盤', 'string']]) {
        const message = throwsWith(() => detectPatterns(input));
        t.ok(message !== null, `detectPatterns(${描述}) 應拋錯`);
        t.ok(message !== null && message.includes('detectPatterns'),
             `${描述} 的錯誤訊息應指名判定器`);
    }

    // 四、逐一驗每個判定器：缺欄位時必須拋錯，且訊息要指名缺的是哪一欄
    for (const spec of DETECTOR_REQUIRED_FIELDS) {
        const message = throwsWith(() => spec.fn({}));
        t.ok(message !== null, `${spec.名}({}) 應拋錯而非產出判定`);
        if (message === null) continue;
        t.ok(message.includes(spec.名), `${spec.名} 的錯誤訊息應指名自己`);
        for (const field of spec.欄位) {
            t.ok(message.includes(field),
                 `${spec.名} 的錯誤訊息應指出缺少「${field}」，實得：${message}`);
        }
    }

    // 五、缺一欄也要擋——不能只擋全空
    const partial = throwsWith(() => detectFanYin({ 值符: '天蓬' }));
    t.ok(partial !== null, '只給一半欄位仍應拋錯');
    t.ok(partial !== null && partial.includes('值符落宮') && !partial.includes('「值符」'),
         `錯誤訊息應只列真正缺的那一欄，實得：${partial}`);

    // 六、正常路徑不受影響
    const chart = chartToObject(generateChartByDatetime('2024011510'));
    t.ok(detectPatterns(chart).length > 0, '正常盤面應照常判定');
    t.ok(assessVigor(chart).九星.length === 9, '正常盤面的旺相應照常評估');

    // 七、以部分盤面做單元測試仍可行——守衛只檢查該判定器實際會讀的欄位
    t.ok(Array.isArray(detectMenPo({ 天門: chart['天門'] })),
         '只給天門即可單獨測門迫');
    t.ok(Array.isArray(detectWuBuYu({ 日柱: '甲子', 時干: '庚', 時柱: '庚午' })),
         '只給日柱時干時柱即可單獨測五不遇時');

    record(`判斷層入口守衛（${DETECTOR_REQUIRED_FIELDS.length} 個判定器逐一驗）`,
           truncate(t.errors, 10));
}

// ============================================================================
// 十干克應的斷語與外部錨點
// ============================================================================

/**
 * 八十一格的斷語，逐字抄自《奇門旨歸》卷五〈十干克應〉
 *
 * **這份表的證偽力有其上限，須說明白。** 它與 patterns.js 的主表同一抄錄來源，
 * 故它擋得住**日後的竄改**（原先 88% 的斷語可以被靜默改掉而測試全綠），
 * 卻擋不住**原始抄錯**——抄錯會同時出現在兩處。
 *
 * 真正獨立於本專案抄錄的錨點只有兩處，見下方兩則測試：
 *   1. 《寶鑒御定》明列四格主凶——這是典籍**自己**標的吉凶，四書中唯一一處
 *   2. 《統宗》〈奇門四十格〉——未參與建表，其中十一則屬十干克應
 *
 * 語料原貌照錄不改：乙己「土掩暗眛」（眛 U+771B，疑當作昧）、
 * 丁己「奸私□冤」（旨歸原文缺字，《秘笈》作「讎」）、丁丙「樂里生悲」。
 */
/**
 * 八十一格的格名與吉凶：[格名, 吉凶]
 *
 * 格名抄自《奇門旨歸》卷五（六格經更正，見 KE_YING_NAME_CORRECTIONS）；
 * 吉凶則是**本專案據斷語所判**，非典籍所標——四部書皆無吉凶標籤。
 * 故此表釘住的是「不得被靜默竄改」，其正確性另由兩處外部錨點驗：
 * 《寶鑒》明列的四格凶，與《統宗》〈奇門四十格〉的十二則。
 */
const ZHIGUI_KE_YING_NAMES = {
    乙乙: ['日奇伏吟', '凶'],
    乙丙: ['奇儀順生', '中性'],
    乙丁: ['奇儀相佐', '吉'],
    乙戊: ['利陰害陽', '凶'],
    乙己: ['日奇入霧', '凶'],
    乙庚: ['日奇被刑', '凶'],
    乙辛: ['青龍逃走', '凶'],
    乙壬: ['日奇入地', '凶'],
    乙癸: ['華蓋青龍', '吉'],

    丙乙: ['日月並行', '吉'],
    丙丙: ['月奇孛師', '凶'],
    丙丁: ['星奇朱雀', '吉'],
    丙戊: ['飛鳥跌穴', '吉'],
    丙己: ['火孛入刑', '凶'],
    丙庚: ['熒入太白', '凶'],
    丙辛: ['謀事成就', '吉'],
    丙壬: ['火入天羅', '凶'],
    丙癸: ['華蓋孛師', '凶'],

    丁乙: ['人遁', '吉'],
    丁丙: ['星隨月轉', '吉'],
    丁丁: ['奇入太陰', '吉'],
    丁戊: ['青龍轉光', '吉'],
    丁己: ['火入勾陳', '凶'],
    丁庚: ['年月日時格', '凶'],
    丁辛: ['朱雀入獄', '凶'],
    丁壬: ['五神互合', '吉'],
    丁癸: ['朱雀投江', '凶'],

    戊乙: ['青龍合靈', '中性'],
    戊丙: ['青龍返首', '吉'],
    戊丁: ['青龍耀明', '吉'],
    戊戊: ['伏吟', '中性'],
    戊己: ['貴人入獄', '凶'],
    戊庚: ['值符飛宮', '凶'],
    戊辛: ['青龍折足', '中性'],
    戊壬: ['龍入天牢', '凶'],
    戊癸: ['青龍華蓋', '吉'],

    己乙: ['墓神不明', '中性'],
    己丙: ['火孛地戶', '凶'],
    己丁: ['朱雀入墓', '中性'],
    己戊: ['犬遇青龍', '中性'],
    己己: ['地戶逢鬼', '凶'],
    己庚: ['刑格', '凶'],
    己辛: ['游魂入墓', '凶'],
    己壬: ['地網高張', '凶'],
    己癸: ['地刑玄武', '凶'],

    庚乙: ['太白蓬星', '中性'],
    庚丙: ['太白入熒', '凶'],
    庚丁: ['亭亭之格', '凶'],
    庚戊: ['太白天乙伏宮', '凶'],
    庚己: ['刑格', '凶'],
    庚庚: ['太白同宮', '凶'],
    庚辛: ['白虎乾格', '凶'],
    庚壬: ['小格', '凶'],
    庚癸: ['大格', '凶'],

    辛乙: ['白虎猖狂', '凶'],
    辛丙: ['乾合孛師', '凶'],
    辛丁: ['獄神得奇', '吉'],
    辛戊: ['困龍被傷', '凶'],
    辛己: ['入獄自刑', '凶'],
    辛庚: ['白虎出力', '凶'],
    辛辛: ['伏吟天庭', '凶'],
    辛壬: ['凶蛇入獄', '凶'],
    辛癸: ['天牢華蓋', '凶'],

    壬乙: ['小蛇', '凶'],
    壬丙: ['水蛇入火', '凶'],
    壬丁: ['干合蛇刑', '凶'],
    壬戊: ['蛇化龍', '吉'],
    壬己: ['凶蛇入獄', '凶'],
    壬庚: ['太白擒蛇', '吉'],
    壬辛: ['螣蛇相纏', '凶'],
    壬壬: ['蛇入地羅', '凶'],
    壬癸: ['幼女奸淫', '中性'],

    癸乙: ['華蓋蓬星', '吉'],
    癸丙: ['華蓋孛師', '吉'],
    癸丁: ['螣蛇夭矯', '凶'],
    癸戊: ['天乙會合', '吉'],
    癸己: ['華蓋地戶', '凶'],
    癸庚: ['太白入網', '凶'],
    癸辛: ['網蓋天牢', '凶'],
    癸壬: ['複見螣蛇', '凶'],
    癸癸: ['天網四張', '凶'],
};

const ZHIGUI_KE_YING_JUDGEMENTS = {
    乙乙: '不宜謁貴求名，只可安分守身。',
    乙丙: '吉星遷官進職，凶星夫妻別離。',
    乙丁: '文書事吉，百事可為。',
    乙戊: '門逢凶迫、財破人傷。',
    乙己: '土掩暗眛，門凶宅必凶，得三奇開門為地遁。',
    乙庚: '爭訟財產夫妻懷私。',
    乙辛: '奴僕拐帶六畜皆傷。',
    乙壬: '尊卑悖亂，官訟是非。',
    乙癸: '宜遁跡修道，隱匿藏形，躲災避難為吉。',

    丙乙: '公私謀為皆吉。',
    丙丙: '文書逼迫，破耗遺失。',
    丙丁: '貴人文書吉利，常人平靜，得三吉門為天遁。',
    丙戊: '謀為百事洞徹。',
    丙己: '囚人刑杖，文書不行，吉門得吉，凶門轉凶。',
    丙庚: '門戶破壞，盜賊耗失。',
    丙辛: '病人不凶。',
    丙壬: '為客不利。是非頗多。',
    丙癸: '陰人害事，災禍頻生。',

    丁乙: '貴人加官進爵，常人婚姻財喜。',
    丁丙: '貴人越級高升，常人樂里生悲。',
    丁丁: '文書即至，喜事遂心。',
    丁戊: '官人升遷，常人咸昌。',
    丁己: '奸私□冤，事因女人。',
    丁庚: '文書阻隔，行人必歸。',
    丁辛: '罪人釋囚，官人失位。',
    丁壬: '貴人恩詔，訟獄公平。',
    丁癸: '文書口舌俱消，音信沉溺。',

    戊乙: '門吉事吉，門凶事凶。',
    戊丙: '動作大利，若逢迫墓擊刑，吉事成凶。',
    戊丁: '謁貴求名吉利，若值墓迫招是招非。',
    戊戊: '凡事閉塞。靜守為吉。',
    戊己: '公私皆不利。',
    戊庚: '吉事不吉，凶事更凶。',
    戊辛: '吉門生助尚可謀為，若逢凶門，主拐帶失財有足疾。',
    戊壬: '凡陰陽皆不利。',
    戊癸: '吉格，門吉招福，門凶多乖。',

    己乙: '地戶蓬星，宜遁跡隱形為利。',
    己丙: '陽人冤冤相害，陰人必致淫污。',
    己丁: '文狀詞訟，先曲後直。',
    己戊: '門吉謀為遂意，上人見喜，門凶枉勞心機。',
    己己: '病者死，百事不遂。',
    己庚: '求名詞訟先動者不利，陰星有謀害之情。',
    己辛: '大人鬼魅，小人家先為崇凶。',
    己壬: '狡童佚女，奸情殺傷。',
    己癸: '男女疾病垂危，詞訟有囚獄之凶。',

    庚乙: '退吉進凶。',
    庚丙: '占賊必來，為客利進，為主破財。',
    庚丁: '因私暱起官司，門吉有救。',
    庚戊: '百事不可謀為凶。',
    庚己: '官司被重刑。',
    庚庚: '官災橫禍，兄弟雷攻。',
    庚辛: '遠行車折馬死。',
    庚壬: '遠行迷失道路，男女音信嗟呀。',
    庚癸: '行人至，官司止，生產母子俱傷大凶。',

    辛乙: '人亡家敗，遠行多殃，尊長不喜，車船俱傷。',
    辛丙: '熒出現，占雨無，占晴旱，占事必因財致訟。',
    辛丁: '經商獲倍利，囚人逢赦宥。',
    辛戊: '官司破財，屈抑越分，妄動禍殃。',
    辛己: '奴僕背主，訟訴難伸。',
    辛庚: '刀刃相接，主客相殘，宜退讓，強進血濺衣衫。',
    辛辛: '公廢私就，訟獄自罹罪名。',
    辛壬: '兩男爭女，訟事不息，先動失理。',
    辛癸: '日月失明，誤入天網，動止乖張。',

    壬乙: '女八柔順男子嗟呀，占孕生子祿馬光華。',
    壬丙: '官災刑禁，絡繹不絕。',
    壬丁: '文書牽連，貴人匆匆，女吉男凶。',
    壬戊: '男人發達，女產嬰童。',
    壬己: '大禍將至，順守斯吉，詞訟主理曲。',
    壬庚: '刑獄公平，剖邪正。',
    壬辛: '縱得吉門亦不能安，若有謀望被人欺瞞。',
    壬壬: '外人纏繞，內事索索，星門俱吉，庶免蹉跎。',
    壬癸: '家有醜聲，門星俱吉，轉為福亨吉。',

    癸乙: '貴人祿位加增，常人平安。',
    癸丙: '貴賤逢之，上人見喜。',
    癸丁: '文書官司，火焚莫逃。',
    癸戊: '吉格財喜，婚姻吉人贊助成合。門凶迫制，反招官非。',
    癸己: '男女占之音信皆阻，躲避災難為吉。',
    癸庚: '以暴爭訟立平。',
    癸辛: '占訟、占病死罪莫逃。',
    癸壬: '嫁娶重婚，不保年華。',
    癸癸: '行人失伴，病訟皆傷。',
};

/**
 * 《寶鑒御定》所標的四格凶——四書中唯一由典籍自己標吉凶之處
 *
 * 原文：「螣蛇夭矯、朱雀投江、青龍逃走、白虎猖狂已上四格俱主凶，不宜舉事。」
 *
 * 本專案的 `吉凶` 欄是據斷語推導的，不是抄來的；這四格是唯一能拿典籍的
 * 明文標籤去驗那個推導的地方。修正前 辛乙「白虎猖狂」標中性，
 * 正是被這一條抓出來的。
 */
const BAOJIAN_FOUR_XIONG = [
    { 格: '癸丁', 名: '螣蛇夭矯' },
    { 格: '丁癸', 名: '朱雀投江' },
    { 格: '乙辛', 名: '青龍逃走' },
    { 格: '辛乙', 名: '白虎猖狂' }
];

/** 逐格取判定 */
function keYingOf(top, bottom) {
    const empty = ['', '', '', '', '', '', '', '', ''];
    const items = detectShiGanKeYing({
        天盤: [top, ...empty.slice(1)],
        地盤: [bottom, ...empty.slice(1)]
    });
    return items.length ? items[0] : null;
}

/** 八十一格的斷語與出處 */
function runKeYingJudgementTest() {
    const t = createAsserter();
    const GAN9 = ['乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
    let counted = 0;

    for (const top of GAN9) {
        for (const bottom of GAN9) {
            const key = top + bottom;
            const expected = ZHIGUI_KE_YING_JUDGEMENTS[key];
            t.ok(typeof expected === 'string' && expected.length > 0,
                 `${key} 黃金表應有斷語`);
            const item = keYingOf(top, bottom);
            t.ok(item !== null, `${key} 應有判定`);
            if (!item || !expected) continue;
            counted++;

            t.equal(item.斷語, expected, `${key} 斷語`);

            // 格名與吉凶同樣須釘住——原先 81 格中只有十則有外部對照，
            // 其餘七十一格的格名與吉凶可以被靜默改成任何東西而測試全綠
            const nameEntry = ZHIGUI_KE_YING_NAMES[key];
            t.ok(Array.isArray(nameEntry), `${key} 黃金表應有格名與吉凶`);
            if (nameEntry) {
                t.equal(item.格, nameEntry[0], `${key} 格名`);
                t.equal(item.吉凶, nameEntry[1], `${key} 吉凶`);
            }

            // 出處的第一則必須帶**該格自己的**斷語，而非全表共用的節首摘要。
            // 「每則判斷帶出處原文」是專案第二原則，原先在數量最大的這一類上並未成立。
            t.equal(item.出處[0].文, expected, `${key} 出處應帶該格斷語`);
            t.equal(item.出處[0].書, '奇門旨歸', `${key} 第一出處之書`);
            t.ok(!item.出處.some(src => /（逐格詳列）$/.test(src.文)),
                 `${key} 出處不得為節首摘要佔位文字`);
        }
    }

    t.equal(counted, 81, '八十一格俱應比對到');
    t.equal(Object.keys(ZHIGUI_KE_YING_JUDGEMENTS).length, 81, '斷語黃金表應為八十一格，不多不少');
    t.equal(Object.keys(ZHIGUI_KE_YING_NAMES).length, 81, '格名黃金表應為八十一格，不多不少');

    record(`十干克應 81 格逐格比對（格名、吉凶、斷語、出處）`, truncate(t.errors, 10));
}

/** 《寶鑒》明列的四格凶——獨立於本專案抄錄的吉凶錨點 */
function runBaojianXiongAnchorTest() {
    const t = createAsserter();
    for (const c of BAOJIAN_FOUR_XIONG) {
        const item = keYingOf(c.格[0], c.格[1]);
        t.ok(item !== null, `${c.格} 應有判定`);
        if (!item) continue;
        t.equal(item.吉凶, '凶',
                `${c.格}（${c.名}）——《寶鑒御定》「已上四格俱主凶，不宜舉事」`);
        const names = [item.格, ...(item.異名 || []).map(v => v.名)];
        t.ok(names.some(n => n === c.名 || n.replace('騰', '螣').replace('妖', '夭') === c.名),
             `${c.格} 之名應含或近於《寶鑒》所稱的「${c.名}」，實得 ${names.join('、')}`);
    }
    record('《寶鑒》明列四格主凶（獨立於本專案抄錄的吉凶錨點）', t.errors);
}

/**
 * 六格的格名出處更正
 *
 * 《旨歸》卷五與《秘笈》〈十干剋應訣〉並無這些名，它們出自《法竅》〈十干加時斷〉。
 * 原先主表採法竅之名卻掛旨歸＋秘笈的出處，等於給那兩部書安上它們沒說過的話。
 */
const KE_YING_NAME_CORRECTIONS = [
    { 格: '壬乙', 應為: '小蛇', 法竅: '奇神游海' },
    { 格: '壬丙', 應為: '水蛇入火', 法竅: '水蛇入火宮' },
    { 格: '壬丁', 應為: '干合蛇刑', 法竅: '玉女合獄神' },
    { 格: '癸乙', 應為: '華蓋蓬星', 法竅: '蓬星華蓋' },
    { 格: '癸丁', 應為: '螣蛇夭矯', 法竅: '騰蛇妖蹻' }
];

function runKeYingNameSourceTest() {
    const t = createAsserter();

    for (const c of KE_YING_NAME_CORRECTIONS) {
        const item = keYingOf(c.格[0], c.格[1]);
        t.ok(item !== null, `${c.格} 應有判定`);
        if (!item) continue;
        t.equal(item.格, c.應為, `${c.格} 主名應採《旨歸》《秘笈》所載者`);
        const alt = (item.異名 || []).map(v => v.名);
        t.ok(alt.includes(c.法竅),
             `${c.格} 的《法竅》之名「${c.法竅}」應移入異名，實得 ${alt.join('、') || '（無）'}`);
        t.equal(item.出處[0].書, '奇門旨歸', `${c.格} 出處`);
    }

    // 庚壬：《旨歸》《秘笈》於此格根本未立名，只給斷語。
    // 其「小格」之名另有出處，必須一併掛出，否則等於憑空給那兩部書安上一個名。
    const gengRen = keYingOf('庚', '壬');
    t.ok(gengRen !== null, '庚壬 應有判定');
    if (gengRen) {
        t.equal(gengRen.格, '小格', '庚壬 之名');
        t.equal(gengRen.出處.length, 3, '庚壬 應另掛格名的出處');
        const nameSource = gengRen.出處[gengRen.出處.length - 1];
        t.equal(nameSource.書, '奇門遁甲統宗', '庚壬 格名的出處之書');
        t.equal(nameSource.篇, '奇門四十格', '庚壬 格名的出處之篇');
        t.ok(nameSource.文.includes('庚臨壬'), '庚壬 格名的出處原文應含「庚臨壬」');
    }

    // 其餘八十格只掛旨歸與秘笈兩處
    let three = 0;
    for (const top of ['乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸']) {
        for (const bottom of ['乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸']) {
            const item = keYingOf(top, bottom);
            if (item && item.出處.length > 2) three++;
        }
    }
    t.equal(three, 1, '僅庚壬一格需另掛格名出處');

    record('十干克應格名出處更正（六格）', truncate(t.errors, 10));
}

/**
 * 門宮關係的三種輸出：門迫、宮迫、和義
 *
 * 兩張十三對表都由五行相克推導後與《法竅》卷一賦文之註逐對核對（見上），
 * 此處驗的是**判定器真的把兩個方向都吐出來了**——專案原先只吐門克宮一半，
 * 而那一半所據的賦文，其註在下一行就把另一半也命了名。
 */
function runMenGongRelationTest() {
    const t = createAsserter();
    const palaceOf = gua => LUOSHU_BAGUA.indexOf(gua);

    // 以逐對表直接構造盤面，驗判定器對每一對的輸出
    const check = (door, gua, 格, 吉凶, 關係, 主客) => {
        const doors = new Array(9).fill('');
        doors[palaceOf(gua)] = door;
        const items = detectMenPo({ 天門: doors });
        t.equal(items.length, 1, `${door}臨${gua}宮應恰有一則判定`);
        if (!items.length) return;
        t.equal(items[0].格, 格, `${door}臨${gua}宮的格`);
        t.equal(items[0].吉凶, 吉凶, `${door}臨${gua}宮的吉凶`);
        t.equal(items[0].宮, gua, `${door}臨${gua}宮的宮位`);
        t.equal(items[0].關係, 關係, `${door}臨${gua}宮的關係`);
        t.equal(items[0].主客, 主客, `${door}臨${gua}宮的主客`);
        t.ok(items[0].出處.length === 1 && items[0].出處[0].篇 === '卷一（賦文之註）',
             `${door}臨${gua}宮應掛賦文之註而非〈論八門迫制〉`);
    };

    for (const [door, gua] of FAQIAO_MEN_PO) check(door, gua, '門迫', '凶', '門克宮', '客克主');
    for (const [door, gua] of FAQIAO_GONG_KE_MEN) check(door, gua, '宮迫', '凶', '宮克門', '主克客');

    t.equal(FAQIAO_MEN_PO.length, 13, '門克宮應為十三對');
    t.equal(FAQIAO_GONG_KE_MEN.length, 13, '宮克門應為十三對');

    // 和義：宮生門。《法竅》卷一賦文「宮若生門則為義」，
    // 〈論八門迫制〉稱「和義」——「凶門和義，其凶不凶；吉門和義，其吉益吉」
    const heYi = [];
    for (const door of Object.keys(DOOR_ELEMENTS)) {
        for (const gua of LUOSHU_BAGUA) {
            if (gua === '中') continue;
            if (ELEMENT_GENERATES[PALACE_ELEMENTS[palaceOf(gua)]] === DOOR_ELEMENTS[door]) {
                heYi.push([door, gua]);
            }
        }
    }
    t.ok(heYi.length > 0, '宮生門的組合不應為空');
    // 和義為吉：《法竅》〈論八門迫制〉「凶門和義，其凶不凶；吉門和義，其吉益吉」
    for (const [door, gua] of heYi) check(door, gua, '和義', '吉', '宮生門', '主生客');

    // 三者互斥：同一宮不得同時中兩則
    let multi = 0;
    for (const door of Object.keys(DOOR_ELEMENTS)) {
        for (const gua of LUOSHU_BAGUA) {
            if (gua === '中') continue;
            const doors = new Array(9).fill('');
            doors[palaceOf(gua)] = door;
            if (detectMenPo({ 天門: doors }).length > 1) multi++;
        }
    }
    t.equal(multi, 0, '門迫、宮迫、和義三者互斥，同一宮不得並見');

    // 門生宮與比和不立格名——《法竅》〈論門宮生克〉雖論門生宮（客生主）卻未命名，
    // 依專案慣例不代為命名
    let named = 0;
    for (const door of Object.keys(DOOR_ELEMENTS)) {
        for (const gua of LUOSHU_BAGUA) {
            if (gua === '中') continue;
            const doorElement = DOOR_ELEMENTS[door];
            const palaceElement = PALACE_ELEMENTS[palaceOf(gua)];
            const isMenShengGong = ELEMENT_GENERATES[doorElement] === palaceElement;
            const isSame = doorElement === palaceElement;
            if (!isMenShengGong && !isSame) continue;
            const doors = new Array(9).fill('');
            doors[palaceOf(gua)] = door;
            if (detectMenPo({ 天門: doors }).length > 0) named++;
        }
    }
    t.equal(named, 0, '門生宮與比和典籍未立格名，不應產出判定');

    record(`門宮關係：門迫 ${FAQIAO_MEN_PO.length} 對、宮迫 ${FAQIAO_GONG_KE_MEN.length} 對、和義 ${heYi.length} 對`,
           truncate(t.errors, 10));
}

// ============================================================================
// 五不遇時
// ============================================================================

/**
 * 《遁甲演義》葛洪注所列的十組干支定式
 *
 * 原文：「甲日庚午時，乙日辛巳時，丙日壬辰時，丁日癸卯時，戊日甲寅時，
 * 己日乙丑時，庚日丙子時，辛日丁酉時，壬日戊申時，癸日己未時，
 * 乃時干克日干，陽克陽干，陰克陰干，名為主本不和，極凶。」
 *
 * 《奇門寶鑒御定》〈釋五不遇時〉以完全不同的方法得到同一組：
 * 「其法以庚加午逆行，越過戌亥，為時之定局。」下方的
 * runWuBuYuConstructionTest 直接跑這個構造法，證實兩者相同。
 *
 * 這是抄自典籍的黃金值，不得由程式輸出反推。
 */
const YANYI_WU_BU_YU = Object.freeze({
    甲: '庚午', 乙: '辛巳', 丙: '壬辰', 丁: '癸卯', 戊: '甲寅',
    己: '乙丑', 庚: '丙子', 辛: '丁酉', 壬: '戊申', 癸: '己未'
});

/** 五鼠遁：日干 → 子時之干。「甲己還加甲，乙庚丙作初，丙辛從戊起，丁壬庚子居，戊癸壬子頭」 */
const WU_SHU_DUN = Object.freeze({
    甲: '甲', 己: '甲', 乙: '丙', 庚: '丙', 丙: '戊',
    辛: '戊', 丁: '庚', 壬: '庚', 戊: '壬', 癸: '壬'
});

const TEN_GANS = Object.freeze(['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸']);
const TWELVE_ZHIS = Object.freeze(['子', '丑', '寅', '卯', '辰', '巳',
                                   '午', '未', '申', '酉', '戌', '亥']);
const YANG_GANS = Object.freeze(['甲', '丙', '戊', '庚', '壬']);

/**
 * 《寶鑒》的構造法必須生成《演義》所列的同一組
 *
 * 兩部書用完全不同的方法描述同一件事：《演義》直接列表，《寶鑒》給
 * 「庚加午逆行，越過戌亥」的作圖法。若兩者相同，這張表就有兩個獨立的書證；
 * 這一則測試就是在驗那個「獨立」。
 */
function runWuBuYuConstructionTest() {
    const t = createAsserter();

    // 以庚加午，逆行，越過戌亥
    const built = [];
    let zhiIndex = TWELVE_ZHIS.indexOf('午');
    let ganIndex = TEN_GANS.indexOf('庚');
    for (let guard = 0; guard < 40 && built.length < 10; guard++) {
        const zhi = TWELVE_ZHIS[zhiIndex];
        if (zhi !== '戌' && zhi !== '亥') {
            built.push(TEN_GANS[ganIndex] + zhi);
            ganIndex = (ganIndex + 1) % 10;
        }
        zhiIndex = (zhiIndex + 11) % 12;   // 逆行
    }

    const listed = TEN_GANS.map(gan => YANYI_WU_BU_YU[gan]);
    t.deepEqual(built, listed,
                '《寶鑒》「庚加午逆行，越過戌亥」所生成者，應與《演義》葛洪注所列十組相同');

    record('《寶鑒》構造法與《演義》列表相符（兩書獨立互證）', t.errors);
}

/**
 * 十日干 × 十二時支 全一百二十格，逐格比對典籍
 *
 * 取代了原先那條「五不遇時應占 20%」的斷言——其期望值是從被測程式的錯誤邏輯
 * 推導出來的（註解寫「十干中恰有兩干克日干」），正是專案原則 5 所禁止的事，
 * 而且在缺陷存在時數學上不可能變紅。
 */
function runWuBuYuTableTest() {
    const t = createAsserter();
    const isYang = gan => YANG_GANS.includes(gan);

    // 《法竅》讀法只論干不論支，較定式多出的兩格
    const FAQIAO_EXTRA = ['己日乙亥', '庚日丙戌'];

    let dingShiHits = 0;
    let polarHits = 0;
    const unexpected = [];

    for (const dayGan of TEN_GANS) {
        for (let z = 0; z < 12; z++) {
            const hourGan = TEN_GANS[(TEN_GANS.indexOf(WU_SHU_DUN[dayGan]) + z) % 10];
            const hourPillar = hourGan + TWELVE_ZHIS[z];
            const label = dayGan + '日' + hourPillar;

            const items = detectWuBuYu({
                日柱: dayGan + '子', 時干: hourGan, 時柱: hourPillar
            });
            const dingShi = items.filter(f => f.讀法 && f.讀法.startsWith('干支定式'));
            const polar = items.filter(f => f.讀法 && f.讀法.startsWith('陽克陽'));

            // 干支定式：恰為典籍所列的那一格
            const shouldDingShi = YANYI_WU_BU_YU[dayGan] === hourPillar;
            t.equal(dingShi.length, shouldDingShi ? 1 : 0, label + ' 干支定式讀法');
            if (shouldDingShi) dingShiHits++;

            // 同性讀法：定式十格 ＋ 法竅多出的兩格
            const shouldPolar = shouldDingShi || FAQIAO_EXTRA.includes(label);
            t.equal(polar.length, shouldPolar ? 1 : 0, label + ' 陽克陽陰克陰讀法');
            if (shouldPolar) polarHits++;

            // 同性限制不可省：凡陰陽異性者，兩種讀法都不得觸發
            if (items.length > 0 && isYang(hourGan) !== isYang(dayGan)) {
                unexpected.push(label);
            }
        }
    }

    t.equal(dingShiHits, 10, '干支定式在一百二十格中應恰中十格');
    t.equal(polarHits, 12, '同性讀法應中十二格（定式十格加法竅多出的兩格）');
    t.equal(unexpected.length, 0,
            '陰陽異性者不得觸發，實觸發：' + unexpected.slice(0, 5).join('、'));

    // 定式必為同性讀法的子集——若不然，兩者就不是同一件事的寬嚴之別
    for (const [dayGan, pillar] of Object.entries(YANYI_WU_BU_YU)) {
        t.equal(isYang(pillar[0]), isYang(dayGan),
                dayGan + '日' + pillar + '時：定式所列者必為同性相克');
    }

    // 每則判定都必須帶讀法與出處——異說並列而不代為擇一
    const sample = detectWuBuYu({ 日柱: '甲子', 時干: '庚', 時柱: '庚午' });
    t.equal(sample.length, 2, '甲日庚午時：兩種讀法皆應觸發');
    for (const item of sample) {
        t.ok(typeof item.讀法 === 'string' && item.讀法.length > 0, '判定應標明讀法');
        t.ok(item.出處.length === 1 && !!item.出處[0].文, '判定應帶出處原文');
    }
    const books = sample.map(f => f.出處[0].書).sort();
    t.deepEqual(books, ['奇門法竅', '遁甲演義'], '兩種讀法應各有其書');

    record('五不遇時全枚舉（120 格：定式中 ' + dingShiHits + ' 格、同性中 ' + polarHits + ' 格）',
           truncate(t.errors, 10));
}

// ============================================================================
// 夜子時：日柱換日之界的兩派
// ============================================================================

/**
 * 夜子時佔全部時辰的十二分之一，而日柱一翻，整張盤都變
 *
 * 專案原本用 `getDayInGanZhiExact()`（夜子算次日）而未言明，等於替使用者
 * 選了一派。這與六儀擊刑那種學術性異說不同——它影響 8.3% 的時辰，
 * 且旬首、符首、值符、值使全部連鎖改變。
 *
 * 兩派給的是**兩張完全不同的盤**，無法在同一輸出中並列，故比照定局法
 * 作為選項，並在輸出中自陳所用者。
 */

/** 五鼠遁：日干 → 子時之干。「甲己還加甲，乙庚丙作初，丙辛從戊起，丁壬庚子居，戊癸壬子頭」 */
const YE_ZI_WU_SHU_DUN = {
    甲: '甲', 己: '甲', 乙: '丙', 庚: '丙', 丙: '戊',
    辛: '戊', 丁: '庚', 壬: '庚', 戊: '壬', 癸: '壬'
};

const SIXTY_JIAZI_GANS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const SIXTY_JIAZI_ZHIS = ['子', '丑', '寅', '卯', '辰', '巳',
                          '午', '未', '申', '酉', '戌', '亥'];

/** 干支在六十甲子中的序 */
function jiaZiIndex(ganZhi) {
    const gan = SIXTY_JIAZI_GANS.indexOf(ganZhi[0]);
    const zhi = SIXTY_JIAZI_ZHIS.indexOf(ganZhi[1]);
    for (let i = 0; i < 60; i++) {
        if (i % 10 === gan && i % 12 === zhi) return i;
    }
    return -1;
}

/**
 * 《法竅》卷二〈論拆局補局〉的三個刻數算例——可用算術判定換日之界
 *
 * 九部書**查無明文**：沒有任何一部書寫出「子初屬前日」「子正方換日」之類的
 * 定義句，「夜子」二字全語料只出現一次。兩派都是自用例反推的。
 *
 * 但《法竅》這三段是**可被算術檢驗**的——它自報時辰與刻數，只有一種換日法
 * 對得上。這比《統宗》那種紀日寫法的旁證硬得多，也是本專案以「次日派」
 * 為預設的依據。
 *
 * 時刻對照（時憲書九十六刻制，一時辰＝八刻＝二小時，一刻＝十五分）由
 * 《奇門旨歸》卷三十八「果於十點鐘亥正生女」校準：亥正＝22:00，
 * 故亥時 21:00–23:00、子初 23:00、子正 00:00。
 */
const FAQIAO_HOUR_ARITHMETIC = [
    {
        原文: '二十二日己丑，自子時起至二十四日辛卯辰初一刻止，計二十八時零一刻',
        // 己丑之子時起 → 辛卯辰初一刻（該曆日 07:15，己丑曆日之後二日）
        終: 2 * 1440 + 7 * 60 + 15,
        子初起: -60,        // 前一曆日 23:00
        子正起: 0,          // 己丑曆日 00:00
        時: 28, 刻: 1
    },
    {
        原文: '子丑二時與寅初之三刻……雖少二時零三刻',
        終: 3 * 60 + 45,    // 寅初三刻 03:45
        子初起: -60,
        子正起: 0,
        時: 2, 刻: 3
    },
    {
        原文: '甲子日之子丑寅卯辰五時',
        終: 9 * 60,         // 五個整時辰終於巳時之始 09:00，非終於節氣時刻
        子初起: -60,
        子正起: 0,
        時: 5, 刻: 0
    }
];

// ============================================================================
// 輸出欄位的完整清單
// ============================================================================

/**
 * 輸出即公開 API，故欄位增刪必須是刻意的
 *
 * 原先只有一份十六欄的 `REQUIRED_FIELDS` 且僅檢查非空，而實際輸出為
 * 三十六／四十四／四十八欄——也就是說「欄位被增刪」**完全不會被察覺**。
 * 對一個已發布到 npm 的套件，那是實質風險。
 *
 * 此處改為三份**精確清單**並以集合相等斷言：多一欄、少一欄都會紅。
 * 新增欄位時必須同時改這裡，那正是本測試的用意——讓它成為一個
 * 刻意的動作，而非某次改動的副產物。
 */
const CHART_FIELDS_MANUAL = [
    '年柱', '年旬空', '年孤虛', '月柱', '月旬空', '月孤虛',
    '日柱', '日旬空', '日孤虛', '時柱', '時旬空', '時孤虛',
    '時干', '陰陽', '局數',
    '旬首', '符首', '值使', '值符',
    '值符落宮', '值符入中', '值使落宮', '值使入中', '飛步',
    '河圖', '方位', '九宮',
    '地盤', '地門', '天盤', '天門', '原星', '九星',
    '天禽寄宮', '天禽落宮', '八神'
];

/** 自動起盤在手動之外另加的欄位 */
const CHART_FIELDS_AUTO_EXTRA = [
    '節氣', '三元', '定局法', '夜子時', '落於夜子時',
    '時間基準', '曆法基準'
];

/** 拆補法專屬 */
const CHART_FIELDS_CHAIBU_EXTRA = ['節後天數'];

/** 符頭法專屬 */
const CHART_FIELDS_FUTOU_EXTRA = ['符頭', '上元符頭', '超接', '超接天數', '閏局'];

// ============================================================================
// generateChartNow 的時區選項
// ============================================================================

/**
 * 不設猜測性預設
 *
 * 未指定 `時區` 時維持原有行為（取本機牆上時鐘），並在「時鐘來源」自陳其與
 * 盤面基準的落差——**只陳述不代為換算**，因為多數流派對境外起課用當地時間
 * 定時辰，逕自換成 UTC+8 等於替使用者選了一派。
 *
 * 指定 `時區` 則把當下這一瞬間換算到該時區的牆上時刻。那是明示的選擇。
 */

/** 由當下時刻算出某時區的牆上時刻，格式 yyyyMMddHH */
function wallClockAt(offsetHours, at) {
    const shifted = new Date(at.getTime() + offsetHours * 3600000);
    return shifted.getUTCFullYear().toString() +
        String(shifted.getUTCMonth() + 1).padStart(2, '0') +
        String(shifted.getUTCDate()).padStart(2, '0') +
        String(shifted.getUTCHours()).padStart(2, '0');
}

function runNowTimezoneTest() {
    const t = createAsserter();

    // 一、未指定時區：行為不變，且自陳來源為本機時鐘
    const implicit = chartToObject(generateChartNow());
    t.equal(implicit['時鐘來源'].來源, '本機時鐘', '未指定時區時的來源');
    t.ok(/^UTC[+-]\d{2}:\d{2}$/.test(implicit['時鐘來源'].本機時區),
         `本機時區格式：${implicit['時鐘來源'].本機時區}`);

    // 二、同一時區的各種寫法必須等價
    const forms = [['UTC+8', 8], ['+8', 8], ['8', 8], [8, 8], ['UTC-5', -5], [-5, -5]];
    for (const [written, hours] of forms) {
        const obj = chartToObject(generateChartNow({ 時區: written }));
        t.equal(obj['時鐘來源'].來源, '指定時區', `${JSON.stringify(written)} 的來源`);
        t.equal(obj['時鐘來源'].指定時區,
                `UTC${hours < 0 ? '-' : '+'}${String(Math.abs(hours)).padStart(2, '0')}:00`,
                `${JSON.stringify(written)} 應解析為 ${hours} 時`);
        t.equal(obj['時鐘來源'].與盤面基準時差, hours - 8,
                `${JSON.stringify(written)} 與盤面基準的時差`);
        t.equal(obj['時鐘來源'].一致, hours === 8,
                `${JSON.stringify(written)} 的一致旗標`);
    }

    // 三、半時時區
    const half = chartToObject(generateChartNow({ 時區: 'UTC+05:30' }));
    t.equal(half['時鐘來源'].指定時區, 'UTC+05:30', '半時時區應能解析');
    t.equal(half['時鐘來源'].與盤面基準時差, -2.5, '半時時區的時差');

    // 四、換算必須算對：指定時區所得之盤，須等同於以該時區牆上時刻直接起盤。
    //     跨越整點時「現在」會移動，故前後各取一次，兩次相同才比對。
    for (const hours of [8, 0, -5]) {
        const before = wallClockAt(hours, new Date());
        const viaNow = chartToObject(generateChartNow({ 時區: hours }));
        const after = wallClockAt(hours, new Date());
        if (before !== after) continue;          // 恰好跨過整點，略過本輪
        const direct = chartToObject(generateChartByDatetime(before));
        for (const field of ['年柱', '月柱', '日柱', '時柱', '節氣', '三元', '局數']) {
            t.equal(viaNow[field], direct[field],
                    `UTC${hours >= 0 ? '+' : ''}${hours}：與直接起盤的 ${field} 應相同`);
        }
    }

    // 五、不一致時必須警告，一致時不得警告
    const foreign = chartToObject(generateChartNow({ 時區: -5 }));
    t.ok(typeof foreign['時鐘來源'].警告 === 'string'
         && foreign['時鐘來源'].警告.includes('UTC-05:00'),
         '不一致時的警告應指名所指定的時區');
    t.ok(typeof foreign['時鐘來源'].警告 === 'string'
         && foreign['時鐘來源'].警告.includes('明示'),
         '警告應點明這是使用者明示的選擇，非程式所猜');
    const local = chartToObject(generateChartNow({ 時區: 8 }));
    t.equal(local['時鐘來源'].警告, null, '一致時不應有警告');

    // 六、無法解析者須拋錯而非默默取本機
    for (const bad of ['Asia/Taipei', 'UTC+99', '', {}, null === undefined ? 0 : 'abc']) {
        let threw = null;
        try {
            generateChartNow({ 時區: bad });
        } catch (error) {
            threw = error.message;
        }
        t.ok(threw !== null, `無法解析的時區 ${JSON.stringify(bad)} 應拋錯`);
        t.ok(threw !== null && threw.includes('時區'),
             `${JSON.stringify(bad)} 的錯誤訊息應提到時區`);
    }

    record('generateChartNow 的時區選項（不設猜測性預設）', truncate(t.errors, 10));
}

function runChartFieldsTest() {
    const t = createAsserter();
    const sorted = list => [...list].sort();

    const manual = chartToObject(generateQimenChart({
        年柱: '甲辰', 月柱: '丙寅', 日柱: '戊午', 時柱: '庚申', 局數: 5, 陰陽: '陽'
    }));
    t.deepEqual(sorted(Object.keys(manual)), sorted(CHART_FIELDS_MANUAL),
                '手動起盤的欄位集合');

    const chaiBu = chartToObject(generateChartByDatetime('2024011510'));
    t.deepEqual(sorted(Object.keys(chaiBu)),
                sorted([...CHART_FIELDS_MANUAL, ...CHART_FIELDS_AUTO_EXTRA,
                        ...CHART_FIELDS_CHAIBU_EXTRA]),
                '拆補法自動起盤的欄位集合');

    const fuTou = chartToObject(generateChartByDatetime('2024011510', { 定局法: '符頭' }));
    t.deepEqual(sorted(Object.keys(fuTou)),
                sorted([...CHART_FIELDS_MANUAL, ...CHART_FIELDS_AUTO_EXTRA,
                        ...CHART_FIELDS_FUTOU_EXTRA]),
                '符頭法自動起盤的欄位集合');

    // 兩法互斥的欄位不得互相滲入
    for (const field of CHART_FIELDS_CHAIBU_EXTRA) {
        t.equal(fuTou[field], undefined, `符頭法不應有拆補法專屬的「${field}」`);
    }
    for (const field of CHART_FIELDS_FUTOU_EXTRA) {
        t.equal(chaiBu[field], undefined, `拆補法不應有符頭法專屬的「${field}」`);
    }

    // 每一欄都要有值——集合相等擋得住增刪，擋不住某欄變成 undefined
    for (const [名, obj] of [['手動', manual], ['拆補', chaiBu], ['符頭', fuTou]]) {
        for (const [field, value] of Object.entries(obj)) {
            t.ok(value !== undefined && value !== null,
                 `${名}起盤的「${field}」不應為空`);
        }
    }

    // generateChartNow 另加時鐘來源，且僅此一欄之差
    const now = chartToObject(generateChartNow());
    const extra = Object.keys(now).filter(k => !chaiBu.hasOwnProperty(k));
    t.deepEqual(extra, ['時鐘來源'], 'generateChartNow 應只多出時鐘來源一欄');

    record(`輸出欄位精確清單（手動 ${CHART_FIELDS_MANUAL.length}、拆補 ` +
           `${CHART_FIELDS_MANUAL.length + CHART_FIELDS_AUTO_EXTRA.length + 1}、符頭 ` +
           `${CHART_FIELDS_MANUAL.length + CHART_FIELDS_AUTO_EXTRA.length + 5} 欄）`,
           truncate(t.errors, 10));
}

function runNightZiClassicalArithmeticTest() {
    const t = createAsserter();
    const 時辰 = 120;
    const 刻 = 15;

    for (const kase of FAQIAO_HOUR_ARITHMETIC) {
        const expected = kase.時 * 時辰 + kase.刻 * 刻;

        // 子初法（次日派）：該日之子時起於前一曆日二十三時
        const byZiChu = kase.終 - kase.子初起;
        t.equal(byZiChu, expected,
                `子初法應得「${kase.時}時${kase.刻}刻」——${kase.原文}`);

        // 子正法（當日派）：該日始於零時
        const byZiZheng = kase.終 - kase.子正起;
        t.ok(byZiZheng !== expected,
             `子正法不應對得上「${kase.時}時${kase.刻}刻」，否則此算例無從判別兩派——${kase.原文}`);

        // 兩法之差恰為一小時，即夜子那半個時辰
        t.equal(byZiChu - byZiZheng, 60,
                `兩法之差應恰為夜子那一小時——${kase.原文}`);
    }

    t.equal(FAQIAO_HOUR_ARITHMETIC.length, 3, '《法竅》三個算例俱應比對');

    // 程式的預設（次日派）必須真的把二十三時歸入次日之日柱——
    // 這正是上列算術所要求的換日之界
    const late = chartToObject(generateChartByDatetime('2024011523'));
    const nextNoon = chartToObject(generateChartByDatetime('2024011612'));
    t.equal(late['夜子時'], '次日', '預設應為次日派');
    t.equal(late['日柱'], nextNoon['日柱'],
            '次日派：一月十五日二十三時的日柱，應與一月十六日者相同');

    const sameDaySchool = chartToObject(generateChartByDatetime('2024011523', { 夜子時: '當日' }));
    const sameNoon = chartToObject(generateChartByDatetime('2024011512'));
    t.equal(sameDaySchool['日柱'], sameNoon['日柱'],
            '當日派：一月十五日二十三時的日柱，應與同日午時者相同');

    record('《法竅》三個刻數算例：只有子初法（次日派）對得上', truncate(t.errors, 8));
}

function runNightZiTest() {
    const t = createAsserter();

    // 一、非夜子時：兩派必須完全相同，連五層盤面都不得有一格之差
    for (const hour of ['00', '02', '06', '12', '18', '22']) {
        const datetime = '20240115' + hour;
        const next = chartToObject(generateChartByDatetime(datetime, { 夜子時: '次日' }));
        const same = chartToObject(generateChartByDatetime(datetime, { 夜子時: '當日' }));
        t.equal(same['落於夜子時'], false, `${hour} 時不應標為夜子時`);
        for (const field of ['日柱', '時柱', '旬首', '符首', '值符', '值使']) {
            t.equal(same[field], next[field], `${hour} 時兩派的 ${field} 應相同`);
        }
        for (const field of ['地盤', '天盤', '天門', '九星', '八神']) {
            t.deepEqual(same[field], next[field], `${hour} 時兩派的 ${field} 應相同`);
        }
    }

    // 二、夜子時：日柱恰差一日，時柱依各自之日干起五鼠遁
    let nightCount = 0;
    for (let month = 1; month <= 12; month++) {
        for (const day of [3, 11, 19, 27]) {
            const datetime = `2024${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}23`;
            const next = chartToObject(generateChartByDatetime(datetime, { 夜子時: '次日' }));
            const same = chartToObject(generateChartByDatetime(datetime, { 夜子時: '當日' }));
            const where = `${datetime}`;
            nightCount++;

            t.equal(next['落於夜子時'], true, `${where} 應標為夜子時`);
            t.equal(same['落於夜子時'], true, `${where} 應標為夜子時`);

            // 日柱恰差一日
            const gap = (jiaZiIndex(next['日柱']) - jiaZiIndex(same['日柱']) + 60) % 60;
            t.equal(gap, 1, `${where} 次日派的日柱應恰為當日派的次一日`);

            // 時支必為子，時干依各自之日干起五鼠遁
            for (const [school, obj] of [['次日', next], ['當日', same]]) {
                t.equal(obj['時柱'][1], '子', `${where}（${school}）時支應為子`);
                t.equal(obj['時柱'][0], YE_ZI_WU_SHU_DUN[obj['日柱'][0]],
                        `${where}（${school}）時干應由日干${obj['日柱'][0]}起五鼠遁`);
                t.equal(obj['夜子時'], school, `${where} 應自陳所用之派`);
            }

            // 兩派確實給出不同的盤——若相同，這個選項就沒有存在意義
            t.ok(next['旬首'] !== same['旬首'] || next['符首'] !== same['符首']
                 || next['值符'] !== same['值符'] || next['值使'] !== same['值使'],
                 `${where} 兩派應給出不同的時間樞紐`);
        }
    }
    t.equal(nightCount, 48, '夜子時取樣數');

    // 三、預設為次日——行為不變，升級不破壞既有使用者
    const implicit = chartToObject(generateChartByDatetime('2024011523'));
    const explicit = chartToObject(generateChartByDatetime('2024011523', { 夜子時: '次日' }));
    t.equal(implicit['夜子時'], '次日', '預設應為次日派');
    for (const field of ['日柱', '時柱', '旬首', '符首', '值符', '值使']) {
        t.equal(implicit[field], explicit[field], `預設與明寫「次日」的 ${field} 應相同`);
    }

    // 四、定局不受夜子時之選影響——拆補與符頭皆以時刻／曆日為準，非以日柱
    for (const 定局法 of ['拆補', '符頭']) {
        const next = chartToObject(generateChartByDatetime('2024011523', { 定局法, 夜子時: '次日' }));
        const same = chartToObject(generateChartByDatetime('2024011523', { 定局法, 夜子時: '當日' }));
        for (const field of ['節氣', '三元', '陰陽', '局數']) {
            t.equal(same[field], next[field],
                    `${定局法}法的 ${field} 不應隨夜子時之選改變`);
        }
    }

    // 五、未知流派須拋錯而非默默取預設
    let threw = null;
    try {
        generateChartByDatetime('2024011523', { 夜子時: '早子' });
    } catch (error) {
        threw = error.message;
    }
    t.ok(threw !== null, '未知的夜子時流派應拋錯');
    t.ok(threw !== null && threw.includes('早子'), '錯誤訊息應指出所傳之值');
    t.ok(threw !== null && threw.includes('次日') && threw.includes('當日'),
         '錯誤訊息應列出可用的流派');

    record(`夜子時兩派（${nightCount} 個夜子時取樣，日柱恰差一日、時柱各依五鼠遁）`,
           truncate(t.errors, 10));
}

// ============================================================================
// 基準自陳
// ============================================================================

/**
 * 自陳若不能被證偽，就只是裝飾
 *
 * 「節氣取定氣」「輸入視為 UTC+8」這兩句話寫在輸出裡，等於對使用者作出承諾。
 * 若無人驗證它們是否屬實，日後換掉曆法引擎或時區框架時，這兩句話會靜默變成謊言——
 * 而且是掛在每一張盤上的謊言。故以下兩則測試都以**外部事實**錨定，
 * 不從被測程式反推：時區以通行天文年曆的至分點時刻驗，
 * 曆法以節氣間距的離散度驗（平氣等分、定氣不等分）。
 */

/** 基準自陳欄位的形狀與適用範圍 */
function runBasisDeclarationTest() {
    const t = createAsserter();

    const auto = chartToObject(generateChartByDatetime('2024011510'));
    t.ok(auto['時間基準'] !== undefined, '自動起盤應帶時間基準');
    t.ok(auto['曆法基準'] !== undefined, '自動起盤應帶曆法基準');
    // 欄位若整個不見，後續逐項比對會拋 TypeError 而讓整份報告消失——
    // 崩潰的測試給的資訊比乾淨回報少，故此處先收工再說
    if (!auto['時間基準'] || !auto['曆法基準']) {
        record('基準自陳：欄位形狀與適用範圍', t.errors);
        return;
    }
    t.equal(auto['時間基準'].時區, 'UTC+8', '時間基準所宣告的時區');
    t.equal(auto['時間基準'].時制, '牆上時鐘', '時間基準所宣告的時制');
    t.equal(auto['時間基準'].夏令時間, '未校正', '夏令時間');
    t.equal(auto['時間基準'].真太陽時, '未校正', '真太陽時');
    t.equal(auto['曆法基準'].節氣, '定氣', '曆法基準所宣告的節氣算法');
    t.ok(Object.isFrozen(auto['時間基準']), '時間基準應凍結');
    t.ok(Object.isFrozen(auto['曆法基準']), '曆法基準應凍結');
    t.equal(auto['時鐘來源'], undefined,
            'generateChartByDatetime 的時刻由呼叫端指定，不應自陳時鐘來源');

    // 「夏令時間：未校正」同樣可證偽。臺灣一九七五年行夏令時間，牆鐘早實際時刻
    // 一小時；若程式有校正，一九七五年六月十五日十五時的輸入會被移成十四時（未時）
    // 而非申時。宣告未校正，就必須逐字採用輸入的時刻。
    if (auto['時間基準'].夏令時間 === '未校正') {
        const inDst = chartToObject(generateChartByDatetime('1975061515'));
        t.equal(inDst['時柱'][1], '申',
                '宣告未校正夏令時間，則 1975-06-15 15 時應直接取申時，不得平移為未時');
    }

    // 手動起盤不推節氣，故兩項基準皆不適用——不該給出無從成立的承諾
    const manual = chartToObject(generateQimenChart({
        年柱: '甲辰', 月柱: '丙寅', 日柱: '戊午', 時柱: '庚申', 局數: 5, 陰陽: '陽'
    }));
    t.equal(manual['時間基準'], undefined, '手動起盤不應帶時間基準');
    t.equal(manual['曆法基準'], undefined, '手動起盤不應帶曆法基準');

    record('基準自陳：欄位形狀與適用範圍', t.errors);
}

/**
 * 時間基準宣告 UTC+8——以天文年曆的至分點時刻證實
 *
 * 至分點是可獨立查證的天文事實。若排盤引擎所用的時區框架不是 UTC+8，
 * 這三則的差距會等於時區差（以小時計），絕不可能落在一分鐘之內。
 */
const SOLAR_TERM_UTC_ANCHORS = [
    { 節氣: '春分', 月: 3, utc: '2024-03-20 03:06' },
    { 節氣: '夏至', 月: 6, utc: '2024-06-20 20:51' },
    { 節氣: '秋分', 月: 9, utc: '2024-09-22 12:44' }
];

function runTimeBasisAnchorTest() {
    const t = createAsserter();
    const declared = chartToObject(generateChartByDatetime('2024011510'))['時間基準'];
    t.ok(Boolean(declared), '自動起盤應帶時間基準');
    if (!declared) { record('時間基準宣告', t.errors); return; }

    // 期望值由**宣告本身**推導，而非寫死八小時。如此改動宣告（例如改成 UTC+9）
    // 會使期望值一併移動而與引擎不符，測試立刻變紅；寫死則只驗得到引擎，
    // 驗不到「宣告與現實相符」這件事——而那正是自陳的全部意義。
    const declaredOffset = /^UTC([+-])(\d{1,2})$/.exec(declared.時區);
    t.ok(Boolean(declaredOffset), `時間基準的時區格式：${declared.時區}`);
    if (!declaredOffset) { record('時間基準宣告', t.errors); return; }
    const offsetHours = Number(declaredOffset[2]) * (declaredOffset[1] === '-' ? -1 : 1);

    const table = new Map();
    for (const month of [2, 5, 8, 11]) {
        const lunar = Solar.fromYmdHms(2024, month, 15, 12, 0, 0).getLunar();
        for (const [name, solar] of Object.entries(lunar.getJieQiTable())) {
            if (solar.getYear() === 2024) table.set(name, solar);
        }
    }

    for (const anchor of SOLAR_TERM_UTC_ANCHORS) {
        const solar = table.get(anchor.節氣);
        t.ok(Boolean(solar), `節氣表中應有 ${anchor.節氣}`);
        if (!solar) continue;

        const [date, time] = anchor.utc.split(' ');
        const [year, month, day] = date.split('-').map(Number);
        const [hour, minute] = time.split(':').map(Number);
        // 天文值為 UTC，故期望值加上宣告的時區偏移
        const expected = Date.UTC(year, month - 1, day, hour + offsetHours, minute);
        const actual = Date.UTC(solar.getYear(), solar.getMonth() - 1, solar.getDay(),
                                solar.getHour(), solar.getMinute());
        const driftMinutes = Math.round((actual - expected) / 60000);

        t.ok(Math.abs(driftMinutes) <= 2,
             `${anchor.節氣} 應為天文值 ${anchor.utc} UTC 加 ${offsetHours} 小時` +
             `（依所宣告的 ${declared.時區}），實差 ${driftMinutes} 分——` +
             `若相差以小時計，代表宣告與引擎實際所用的時區框架不符`);
    }

    record(`時間基準宣告 ${declared.時區}（以 ${SOLAR_TERM_UTC_ANCHORS.length} 個至分點天文時刻證實）`,
           t.errors);
}

/**
 * 曆法基準宣告定氣——以節氣間距的離散度證實
 *
 * 平氣把回歸年均分二十四份，相鄰節氣間距恆為 365.2422 ÷ 24 = 15.2184 日；
 * 定氣取視太陽黃經每十五度，因地球軌道為橢圓，間距在近日點約 14.7 日、
 * 遠日點約 15.7 日。故只需看間距是否等長，即可分辨二者，
 * 無須任何來自被測程式的期望值。
 */
function runCalendarBasisAnchorTest() {
    const t = createAsserter();
    const declared = chartToObject(generateChartByDatetime('2024011510'))['曆法基準'];
    t.ok(Boolean(declared), '自動起盤應帶曆法基準');
    if (!declared) { record('曆法基準宣告', t.errors); return; }
    t.ok(['定氣', '平氣'].includes(declared.節氣), `曆法基準的節氣算法：${declared.節氣}`);

    const julianDays = new Set();
    for (const month of [2, 5, 8, 11]) {
        const lunar = Solar.fromYmdHms(2024, month, 15, 12, 0, 0).getLunar();
        for (const solar of Object.values(lunar.getJieQiTable())) {
            if (solar.getYear() === 2024) julianDays.add(solar.getJulianDay());
        }
    }
    const sorted = [...julianDays].sort((a, b) => a - b);
    const gaps = [];
    for (let i = 1; i < sorted.length; i++) {
        const gap = sorted[i] - sorted[i - 1];
        if (gap > 10 && gap < 20) gaps.push(gap);   // 濾掉跨年造成的斷點
    }

    t.ok(gaps.length >= 20, `2024 年應取得二十個以上的相鄰節氣間距，實得 ${gaps.length}`);

    const MEAN_GAP = 365.2422 / 24;                  // 平氣的恆定間距
    const shortest = Math.min(...gaps);
    const longest = Math.max(...gaps);
    const spread = longest - shortest;

    // 依**宣告**分支：宣告平氣就驗間距等長，宣告定氣就驗間距不等長。
    // 如此兩個方向都被鎖住——引擎換了會紅，宣告改了也會紅。
    if (declared.節氣 === '平氣') {
        t.ok(spread < 0.05,
             `宣告平氣，則節氣間距應等長，實得全距 ${spread.toFixed(3)} 日`);
        t.ok(Math.abs(shortest - MEAN_GAP) < 0.05,
             `宣告平氣，則間距應恆為 ${MEAN_GAP.toFixed(4)} 日，實得最短 ${shortest.toFixed(3)} 日`);
    } else {
        t.ok(spread > 0.5,
             `宣告定氣，則節氣間距應不等長，實得全距 ${spread.toFixed(3)} 日——` +
             `若趨近於零，代表引擎實為平氣而輸出仍宣告定氣`);
        t.ok(shortest < MEAN_GAP - 0.3,
             `近日點間距應明顯短於平氣的 ${MEAN_GAP.toFixed(4)} 日，實得最短 ${shortest.toFixed(3)} 日`);
        t.ok(longest > MEAN_GAP + 0.3,
             `遠日點間距應明顯長於平氣的 ${MEAN_GAP.toFixed(4)} 日，實得最長 ${longest.toFixed(3)} 日`);
    }

    record(`曆法基準宣告${declared.節氣}（節氣間距 ${shortest.toFixed(2)}–${longest.toFixed(2)} 日，平氣應恆為 ${MEAN_GAP.toFixed(2)}）`,
           t.errors);
}

/**
 * generateChartNow 的時鐘自陳
 *
 * 它取的是本機牆上時鐘，而節氣算在 UTC+8。此處只驗自陳的算術自洽，
 * 不驗盤面——因為在非 UTC+8 的機器上盤面本來就會不同，那正是要自陳的事。
 */
function runLocalClockDeclarationTest() {
    const t = createAsserter();
    const clock = chartToObject(generateChartNow())['時鐘來源'];

    t.ok(clock !== undefined, 'generateChartNow 應自陳時鐘來源');
    if (!clock) { record('generateChartNow 時鐘自陳', t.errors); return; }

    t.equal(clock.來源, '本機時鐘', '時鐘來源');
    t.equal(clock.盤面基準, 'UTC+08:00', '盤面基準時區');
    t.ok(Object.isFrozen(clock), '時鐘來源應凍結');

    // 算術自洽：時差必須等於本機偏移減去盤面基準的八小時
    const localOffsetHours = -new Date().getTimezoneOffset() / 60;
    t.equal(clock.與盤面基準時差, localOffsetHours - 8, '與盤面基準時差');
    t.equal(clock.一致, clock.與盤面基準時差 === 0, '一致旗標應與時差相符');

    // 警告的有無必須與一致旗標連動——不一致卻不警告，等於沒有自陳
    if (clock.一致) {
        t.equal(clock.警告, null, '一致時不應給出警告');
    } else {
        t.ok(typeof clock.警告 === 'string' && clock.警告.includes(clock.本機時區),
             '不一致時的警告應指名本機時區');
        t.ok(typeof clock.警告 === 'string' && clock.警告.includes('generateChartByDatetime'),
             '不一致時的警告應指出可行的替代作法');
    }

    // UTC±HH:MM 格式
    t.ok(/^UTC[+-]\d{2}:\d{2}$/.test(clock.本機時區), `本機時區格式：${clock.本機時區}`);

    record(`generateChartNow 時鐘自陳（本機 ${clock.本機時區}，時差 ${clock.與盤面基準時差} 小時）`,
           t.errors);
}

// ============================================================================
// 執行所有測試
// ============================================================================

function runAllTests() {
    console.log('奇門遁甲系統測試');
    console.log('版本：' + VERSION);
    console.log('測試時間：' + new Date().toISOString());

    section('第一部分：盤局黃金值');
    chartTestCases.forEach(runChartTest);

    section('第二部分：generateChartByDatetime API');
    datetimeTestCases.forEach(runDatetimeTest);

    section('第三部分：全年節氣與時辰覆蓋');
    runFullYearCoverage();
    runHourCoverage();

    section('第三部分之二：飛星盤');
    runFlyingStarTest();

    section('第三部分之三：旬空與孤虛');
    runVoidTest();
    runXunKongTest();

    section('第三部分之四：經典例題');
    runJuStepTest();
    runDiPanRuleTest();
    runEightGodsVerseTest();
    runYanyiHourTest();
    runYuanlingTest();
    runYingjingGridTest();
    runYingjingStarDoorTest();
    runYingjingZhiShiTest();
    runYingjingGodsTest();
    runFuYinTest();
    runZhiguiCaseTest();
    runPillarRuleTest();
    runMijiTableTest();
    runFaqiaoFuYinTest();
    runFaqiaoGuXuTest();

    section('第三部分之五：API 形狀與中宮旗標');
    runApiShapeTest();
    runCenterFlagTest();

    section('第三部分之六：格局判斷');
    runMenPoTableTest();
    runZhiguiPatternTest();
    runJiXingReadingTest();
    runPatternStructureTest();
    runSanQiRuMuTest();
    runSanDunTest();
    runJieLuKongWangTest();
    runShiGanKeYingTest();
    runTongzongFortyTest();
    runKeYingOnChartsTest();
    runVigorReadingExampleTest();
    runVigorTest();
    runDoorVigorTest();
    runVigorFallbackTest();

    section('第三部分之七：定局法');
    runFaQiaoJuTests();
    runJuMethodOptionTests();
    runJuMethodDivergenceTest();
    runTongzongLeapCaseTest();
    runFuTouAnchorTest();
    runFuTouChainInvariantTest();
    runFuTouKnownGapTest();

    runMenGongRelationTest();

    runJudgementGuardTest();
    runCitationTest();
    runLayerGuardTest();
    runKeYingJudgementTest();
    runBaojianXiongAnchorTest();
    runKeYingNameSourceTest();

    section('第三部分之七之二：五不遇時');
    runWuBuYuConstructionTest();
    runWuBuYuTableTest();

    runNowTimezoneTest();
    runChartFieldsTest();
    runNightZiClassicalArithmeticTest();
    runNightZiTest();

    section('第三部分之八：基準自陳');
    runBasisDeclarationTest();
    runTimeBasisAnchorTest();
    runCalendarBasisAnchorTest();
    runLocalClockDeclarationTest();

    section('第四部分：輸入驗證');
    datetimeValidationCases.forEach(runDatetimeValidationTest);
    pillarValidationCases.forEach(runPillarValidationTest);

    section('第五部分：generateChartNow API');
    runNowTest();

    section('第六部分：一致性測試');
    runConsistencyTest();

    console.log('');
    console.log('='.repeat(64));
    console.log('測試摘要');
    console.log('='.repeat(64));
    console.log(`總計：${passed + failed} 個測試`);
    console.log(`通過：${passed} 個`);
    console.log(`失敗：${failed} 個`);

    if (failed === 0) {
        console.log('');
        console.log('✓ 所有測試通過！');
    } else {
        console.log('');
        console.log(`✗ 有 ${failed} 個測試失敗：`);
        for (const item of failures) {
            console.log('  - ' + item);
        }
        process.exit(1);
    }
}

runAllTests();

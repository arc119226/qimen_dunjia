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

import { readFileSync } from 'fs';
import {
    generateQimenChart,
    generateChartByDatetime,
    generateChartNow,
    chartToObject,
    JIEQI_JUSHU,
    LUOSHU_BAGUA,
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
    getFuShou,
    getXunHead,
    ELEMENT_OVERCOMES,
    PALACE_ELEMENTS,
    DOOR_ELEMENTS,
    detectPatterns,
    detectLiuYiJiXing,
    detectSanQiRuMu,
    detectSanDun,
    detectJieLuKongWang,
    detectShiGanKeYing,
    assessVigor,
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
 * 《奇門法竅》〈論八門迫制〉逐條列出的門迫與非迫
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

    record('門迫：由五行推導的組合與《法竅》〈論八門迫制〉明列者完全相同', t.errors);
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
    // 十干中恰有兩干克日干，故五不遇時應占五分之一
    const ratio = wuBuYu / charts;
    t.ok(Math.abs(ratio - 0.2) < 0.02,
         `五不遇時出現率應約為 20%（十干中兩干克日干），實得 ${(ratio * 100).toFixed(1)}%`);
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
    { 格: '庚丙', 名: '太白入熒', 原文: '太白入熒　六庚加丙奇' },
    { 格: '庚戊', 名: '太白天乙伏宮', 原文: '伏宮　庚臨值符' }
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
            t.equal(item.出處.length, 2, `${top}加${bottom} 應載旨歸與秘笈兩處出處`);
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
        t.equal(found[0].格, c.名, `${c.格}（統宗：${c.原文}）`);
    }
    record(`《統宗》〈奇門四十格〉中十則十干克應與本表相符`, t.errors);
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
 * 《法竅》〈論九星旺相〉逐一列出五組星的五種月令狀態，共二十五格；
 * 《統宗》〈九星旺相〉另給天蓬一組五格，恰與法竅的旺相互換。
 * 兩家皆有完整算例，故並列而不擇一。
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

/** 《法竅》〈論九星旺相〉五組星共二十五格 */
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

/** 《統宗》〈九星旺相〉天蓬一組：旺於我生、相於同類，恰與法竅互換 */
const TONGZONG_TIANPENG = { 旺: '木', 相: '水', 死: '金', 廢: '火', 囚: '土' };

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
            t.equal(entry.法竅, state,
                `法竅：${spec.星}（${spec.五行}）於${spec[state]}月應為${state}`);
        }
    }

    // 《統宗》天蓬一組
    for (const [state, element] of Object.entries(TONGZONG_TIANPENG)) {
        const chart = byElement[element];
        if (!chart) continue;
        const entry = assessVigor(chart).九星.find(s => s.星 === '天蓬');
        t.equal(entry.統宗, state, `統宗：天蓬（水）於${element}月應為${state}`);
    }

    // 兩家恰在同類與我生上互換，克我則一致作囚
    for (const element of ELEMENTS) {
        for (const entry of assessVigor(byElement[element]).九星) {
            if (entry.關係 === '同類') {
                t.equal(entry.法竅, '旺', '同類：法竅作旺');
                t.equal(entry.統宗, '相', '同類：統宗作相');
            }
            if (entry.關係 === '我生') {
                t.equal(entry.法竅, '相', '我生：法竅作相');
                t.equal(entry.統宗, '旺', '我生：統宗作旺');
            }
            if (entry.關係 === '克我') {
                t.equal(entry.法竅, '囚', '克我：兩家皆作囚');
                t.equal(entry.統宗, '囚', '克我：兩家皆作囚');
            }
        }
    }

    record('九星旺相：《法竅》二十五格與《統宗》天蓬五格，兩家並列', t.errors.slice(0, 5));
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
    runVigorTest();
    runDoorVigorTest();
    runVigorFallbackTest();

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

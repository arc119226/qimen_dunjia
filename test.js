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
        input: ['甲辰', '丙寅', '戊午', '庚申', 5, '陽'],
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
        input: ['癸卯', '乙丑', '丁巳', '辛亥', 3, '陰'],
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
        input: ['甲子', '丙寅', '戊辰', '甲午', 7, '陽'],
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
        input: ['乙丑', '丁卯', '己未', '壬戌', 1, '陽'],
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
        input: ['丙寅', '庚午', '壬申', '癸酉', 9, '陰'],
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
        obj = chartToObject(generateQimenChart('test', testCase.input));
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

function classicChart(shi, ju, yinYang) {
    return chartToObject(generateQimenChart('classic', ['甲子', '甲子', '甲子', shi, ju, yinYang]));
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
        palaceNumber(chartToObject(generateQimenChart('yj', ['甲子','甲子','甲子', shi, ju, yinYang]))['值使落宮']);

    // 〈釋天乙直使起宮異門〉冬至後陽使起一宮休門；夏至後陰使起九宮景門
    t.ok(JIEQI_JUSHU['冬至'].yang && JIEQI_JUSHU['冬至'].ju[0] === 1, '冬至上元為陽遁一局');
    t.ok(!JIEQI_JUSHU['夏至'].yang && JIEQI_JUSHU['夏至'].ju[0] === 9, '夏至上元為陰遁九局');
    const dongzhi = chartToObject(generateQimenChart('yj', ['甲子','甲子','甲子','甲子', 1, '陽']));
    t.equal(dongzhi['值使'], '休門', '冬至上元甲子時值使');
    t.equal(zhiShiAt('甲子', 1, '陽'), 1, '冬至上元甲子時值使在一宮');
    const xiazhi = chartToObject(generateQimenChart('yj', ['甲子','甲子','甲子','甲子', 9, '陰']));
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
                const o = chartToObject(generateQimenChart('yj', ['甲子','甲子','甲子', shi, ju, yinYang]));
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
        const o = chartToObject(generateQimenChart('zg', ['甲子','甲子','甲子', c.shi, c.ju, c.yinYang]));
        const label = `${c.yinYang}${c.ju}局${c.shi}時`;
        if (c.fu) {
            t.ok(expect(c.fu, o['值符落宮'], c.zhongAsKun),
                 `${label} 值符落宮：原文 ${c.fu}，專案 ${o['值符落宮']}`);
            checked++;
        }
        if (c.use) {
            t.ok(expect(c.use, o['值使落宮'], c.zhongAsKun),
                 `${label} 值使落宮：原文 ${c.use}，專案 ${o['值使落宮']}`);
            checked++;
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
    const build = (shi, ju, yinYang) =>
        chartToObject(generateQimenChart('fq', ['甲子','甲子','甲子', shi, ju, yinYang]));

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
        generateQimenChart('test', testCase.input);
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
    const obj2 = chartToObject(generateQimenChart(datetime, [
        obj1['年柱'], obj1['月柱'], obj1['日柱'], obj1['時柱'], obj1['局數'], obj1['陰陽']
    ]));

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

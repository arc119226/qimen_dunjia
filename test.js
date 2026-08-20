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
    XUN_TO_KONGWANG_ZHI,
    XUN_TO_KONGWANG_DIRECTION,
    getGuXu,
    getXunKongWang,
    getOppositeZhi,
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

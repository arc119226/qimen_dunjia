/**
 * 奇門遁甲系統測試模組
 *
 * 本模組用於驗證重構後的系統與原始邏輯產出相同結果。
 * 執行方式：node test.js
 */

import {
    generateQimenChart,
    generateChartByDatetime,
    generateChartNow,
    chartToObject
} from './index.js';

// ============================================================================
// 測試案例
// ============================================================================

const testCases = [
    {
        name: '陽局測試 - 局數5',
        input: ['甲辰', '丙寅', '戊午', '庚申', 5, '陽'],
        description: '陽遁五局，時干庚'
    },
    {
        name: '陰局測試 - 局數3',
        input: ['癸卯', '乙丑', '丁巳', '辛亥', 3, '陰'],
        description: '陰遁三局，時干辛'
    },
    {
        name: '甲遁測試 - 時干為甲',
        input: ['甲子', '丙寅', '戊辰', '甲午', 7, '陽'],
        description: '陽遁七局，時干甲（應以符首辛代之）'
    },
    {
        name: '陽局測試 - 局數1',
        input: ['乙丑', '丁卯', '己未', '壬戌', 1, '陽'],
        description: '陽遁一局，時干壬'
    },
    {
        name: '陰局測試 - 局數9',
        input: ['丙寅', '庚午', '壬申', '癸酉', 9, '陰'],
        description: '陰遁九局，時干癸'
    }
];

// ============================================================================
// 測試執行函數
// ============================================================================

/**
 * 執行單一測試案例
 */
function runTestCase(testCase, index) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`測試 ${index + 1}：${testCase.name}`);
    console.log(`說明：${testCase.description}`);
    console.log(`輸入：${JSON.stringify(testCase.input)}`);
    console.log('='.repeat(60));
    
    try {
        const result = generateQimenChart(`test_${index}`, testCase.input);
        const obj = chartToObject(result);
        
        console.log('\n【基本資訊】');
        console.log(`  年柱：${obj['年柱']}  月柱：${obj['月柱']}  日柱：${obj['日柱']}  時柱：${obj['時柱']}`);
        console.log(`  陰陽：${obj['陰陽']}  局數：${obj['局數']}`);
        console.log(`  時干：${obj['時干']}`);
        
        console.log('\n【時間樞紐】');
        console.log(`  旬首：${obj['旬首']}`);
        console.log(`  符首：${obj['符首']}`);
        console.log(`  值符：${obj['值符']} → 落宮：${obj['值符落宮']}`);
        console.log(`  值使：${obj['值使']} → 落宮：${obj['值使落宮']}`);
        console.log(`  飛步：${obj['飛步']}`);
        
        console.log('\n【孤虛方位】');
        console.log(`  年孤虛：${obj['年孤虛']?.join('、') || '無'}`);
        console.log(`  月孤虛：${obj['月孤虛']?.join('、') || '無'}`);
        console.log(`  日孤虛：${obj['日孤虛']?.join('、') || '無'}`);
        console.log(`  時孤虛：${obj['時孤虛']?.join('、') || '無'}`);
        
        console.log('\n【盤局結構】');
        printNineGrid('地盤', obj['地盤']);
        printNineGrid('天盤', obj['天盤']);
        printNineGrid('八門', obj['天門']);
        printNineGrid('九星', obj['九星']);
        console.log(`  天禽寄宮：${obj['天禽寄宮']}`);
        printNineGrid('八神', obj['八神']);
        
        console.log('\n✓ 測試通過');
        return true;
    } catch (error) {
        console.error(`\n✗ 測試失敗：${error.message}`);
        console.error(error.stack);
        return false;
    }
}

/**
 * 以九宮格形式印出陣列
 */
function printNineGrid(name, array) {
    const padded = array.map(item => (item || '　').toString().padEnd(4, '　'));
    console.log(`  ${name}：`);
    console.log(`    ${padded[0]} ${padded[1]} ${padded[2]}`);
    console.log(`    ${padded[3]} ${padded[4]} ${padded[5]}`);
    console.log(`    ${padded[6]} ${padded[7]} ${padded[8]}`);
}

// ============================================================================
// generateChartByDatetime 測試案例
// ============================================================================

const datetimeTestCases = [
    {
        name: '陽遁測試 - 冬至後（小寒）',
        datetime: '2024011510',
        expected: {
            yinYang: '陽',
            jieQi: '小寒'
        },
        description: '2024年1月15日10時，小寒節氣，應為陽遁'
    },
    {
        name: '陰遁測試 - 夏至後（小暑）',
        datetime: '2024070814',
        expected: {
            yinYang: '陰',
            jieQi: '小暑'
        },
        description: '2024年7月8日14時，小暑節氣，應為陰遁'
    },
    {
        name: '節氣交接測試 - 立春',
        datetime: '2024020417',
        expected: {
            yinYang: '陽',
            jieQi: '立春'
        },
        description: '2024年2月4日17時，立春節氣（立春交接於16:27）'
    },
    {
        name: '三元測試 - 上元',
        datetime: '2024010608',
        expected: {
            yuan: '上元',
            jieQi: '小寒'
        },
        description: '2024年1月6日（小寒後第1天），應為上元'
    },
    {
        name: '三元測試 - 中元',
        datetime: '2024011108',
        expected: {
            yuan: '中元',
            jieQi: '小寒'
        },
        description: '2024年1月11日（小寒後約第6天），應為中元'
    },
    {
        name: '邊界測試 - 子時（0點）',
        datetime: '2024031500',
        expected: {
            hasTimePillar: true
        },
        description: '2024年3月15日0時，測試子時處理'
    },
    {
        name: '邊界測試 - 亥時（23點）',
        datetime: '2024031523',
        expected: {
            hasTimePillar: true
        },
        description: '2024年3月15日23時，測試亥時處理'
    }
];

/**
 * 執行 generateChartByDatetime 測試
 */
function runDatetimeTest(testCase, index) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`日期時間 API 測試 ${index + 1}：${testCase.name}`);
    console.log(`說明：${testCase.description}`);
    console.log(`輸入：${testCase.datetime}`);
    console.log('='.repeat(60));

    try {
        const result = generateChartByDatetime(testCase.datetime);
        const obj = chartToObject(result);

        console.log('\n【基本資訊】');
        console.log(`  年柱：${obj['年柱']}  月柱：${obj['月柱']}  日柱：${obj['日柱']}  時柱：${obj['時柱']}`);
        console.log(`  陰陽：${obj['陰陽']}  局數：${obj['局數']}`);

        console.log('\n【定局資訊】');
        console.log(`  節氣：${obj['節氣']}`);
        console.log(`  三元：${obj['三元']}`);
        console.log(`  節後天數：${obj['節後天數']}`);

        // 驗證預期結果
        let allPassed = true;
        const expected = testCase.expected;

        if (expected.yinYang && obj['陰陽'] !== expected.yinYang) {
            console.log(`\n✗ 陰陽不符：預期 ${expected.yinYang}，實際 ${obj['陰陽']}`);
            allPassed = false;
        }

        if (expected.jieQi && obj['節氣'] !== expected.jieQi) {
            console.log(`\n✗ 節氣不符：預期 ${expected.jieQi}，實際 ${obj['節氣']}`);
            allPassed = false;
        }

        if (expected.yuan && obj['三元'] !== expected.yuan) {
            console.log(`\n✗ 三元不符：預期 ${expected.yuan}，實際 ${obj['三元']}`);
            allPassed = false;
        }

        if (expected.hasTimePillar && (!obj['時柱'] || obj['時柱'].length !== 2)) {
            console.log(`\n✗ 時柱無效：${obj['時柱']}`);
            allPassed = false;
        }

        // 驗證盤局完整性
        const requiredFields = ['地盤', '天盤', '天門', '九星', '八神', '值符', '值使'];
        for (const field of requiredFields) {
            if (!obj[field]) {
                console.log(`\n✗ 缺少必要欄位：${field}`);
                allPassed = false;
            }
        }

        if (allPassed) {
            console.log('\n✓ 測試通過');
            return true;
        } else {
            return false;
        }
    } catch (error) {
        console.error(`\n✗ 測試失敗：${error.message}`);
        console.error(error.stack);
        return false;
    }
}

// ============================================================================
// 輸入驗證測試
// ============================================================================

const validationTestCases = [
    {
        name: '格式錯誤 - 長度不足',
        datetime: '202401',
        shouldThrow: true,
        expectedError: '格式'
    },
    {
        name: '格式錯誤 - 長度過長',
        datetime: '20240115100000',
        shouldThrow: true,
        expectedError: '格式'
    },
    {
        name: '格式錯誤 - 非字串',
        datetime: 2024011510,
        shouldThrow: true,
        expectedError: '格式'
    },
    {
        name: '月份無效 - 超過12',
        datetime: '2024130110',
        shouldThrow: true,
        expectedError: '月份'
    },
    {
        name: '月份無效 - 為0',
        datetime: '2024000110',
        shouldThrow: true,
        expectedError: '月份'
    },
    {
        name: '日期無效 - 超過31',
        datetime: '2024013210',
        shouldThrow: true,
        expectedError: '日期'
    },
    {
        name: '小時無效 - 超過23',
        datetime: '2024011524',
        shouldThrow: true,
        expectedError: '小時'
    }
];

/**
 * 執行輸入驗證測試
 */
function runValidationTest(testCase, index) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`驗證測試 ${index + 1}：${testCase.name}`);
    console.log(`輸入：${testCase.datetime}`);
    console.log('='.repeat(60));

    try {
        generateChartByDatetime(testCase.datetime);

        if (testCase.shouldThrow) {
            console.log('\n✗ 測試失敗：應該拋出錯誤但沒有');
            return false;
        } else {
            console.log('\n✓ 測試通過');
            return true;
        }
    } catch (error) {
        if (testCase.shouldThrow) {
            if (error.message.includes(testCase.expectedError)) {
                console.log(`\n✓ 測試通過：正確拋出錯誤 - ${error.message}`);
                return true;
            } else {
                console.log(`\n✗ 測試失敗：錯誤訊息不符`);
                console.log(`  預期包含：${testCase.expectedError}`);
                console.log(`  實際訊息：${error.message}`);
                return false;
            }
        } else {
            console.log(`\n✗ 測試失敗：不應該拋出錯誤`);
            console.error(error.message);
            return false;
        }
    }
}

// ============================================================================
// generateChartNow 測試
// ============================================================================

/**
 * 執行 generateChartNow 測試
 */
function runNowTest() {
    console.log(`\n${'='.repeat(60)}`);
    console.log('即時起盤 API 測試：generateChartNow');
    console.log('='.repeat(60));

    try {
        const result = generateChartNow();
        const obj = chartToObject(result);

        console.log('\n【當前時間盤局】');
        console.log(`  年柱：${obj['年柱']}  月柱：${obj['月柱']}  日柱：${obj['日柱']}  時柱：${obj['時柱']}`);
        console.log(`  陰陽：${obj['陰陽']}  局數：${obj['局數']}`);
        console.log(`  節氣：${obj['節氣']}  三元：${obj['三元']}`);

        // 驗證返回值類型
        if (!(result instanceof Map)) {
            console.log('\n✗ 返回值類型錯誤：應為 Map');
            return false;
        }

        // 驗證必要欄位存在
        const requiredFields = [
            '年柱', '月柱', '日柱', '時柱',
            '陰陽', '局數', '節氣', '三元',
            '地盤', '天盤', '天門', '九星', '八神'
        ];

        for (const field of requiredFields) {
            if (!result.has(field)) {
                console.log(`\n✗ 缺少必要欄位：${field}`);
                return false;
            }
        }

        // 驗證陰陽值有效
        if (!['陰', '陽'].includes(obj['陰陽'])) {
            console.log(`\n✗ 陰陽值無效：${obj['陰陽']}`);
            return false;
        }

        // 驗證局數範圍
        if (obj['局數'] < 1 || obj['局數'] > 9) {
            console.log(`\n✗ 局數範圍無效：${obj['局數']}`);
            return false;
        }

        console.log('\n✓ 測試通過');
        return true;
    } catch (error) {
        console.error(`\n✗ 測試失敗：${error.message}`);
        console.error(error.stack);
        return false;
    }
}

// ============================================================================
// 一致性測試：比對 generateChartByDatetime 與 generateQimenChart
// ============================================================================

/**
 * 驗證兩個 API 對相同時間產生相同結果
 */
function runConsistencyTest() {
    console.log(`\n${'='.repeat(60)}`);
    console.log('一致性測試：generateChartByDatetime vs generateQimenChart');
    console.log('='.repeat(60));

    try {
        // 使用 generateChartByDatetime
        const datetime = '2024011510';
        const result1 = generateChartByDatetime(datetime);
        const obj1 = chartToObject(result1);

        // 手動使用 generateQimenChart（使用相同參數）
        const data = [
            obj1['年柱'],
            obj1['月柱'],
            obj1['日柱'],
            obj1['時柱'],
            obj1['局數'],
            obj1['陰陽']
        ];
        const result2 = generateQimenChart(datetime, data);
        const obj2 = chartToObject(result2);

        console.log('\n【比對結果】');

        // 比對關鍵欄位
        const fieldsToCompare = [
            '年柱', '月柱', '日柱', '時柱',
            '陰陽', '局數', '旬首', '符首',
            '值符', '值使', '值符落宮', '值使落宮'
        ];

        let allMatch = true;
        for (const field of fieldsToCompare) {
            const v1 = obj1[field];
            const v2 = obj2[field];
            const match = JSON.stringify(v1) === JSON.stringify(v2);

            if (!match) {
                console.log(`  ✗ ${field}：${v1} ≠ ${v2}`);
                allMatch = false;
            }
        }

        // 比對陣列欄位
        const arrayFields = ['地盤', '天盤', '天門', '九星', '八神'];
        for (const field of arrayFields) {
            const v1 = JSON.stringify(obj1[field]);
            const v2 = JSON.stringify(obj2[field]);

            if (v1 !== v2) {
                console.log(`  ✗ ${field} 不一致`);
                allMatch = false;
            }
        }

        if (allMatch) {
            console.log('  所有欄位一致');
            console.log('\n✓ 測試通過');
            return true;
        } else {
            console.log('\n✗ 測試失敗：結果不一致');
            return false;
        }
    } catch (error) {
        console.error(`\n✗ 測試失敗：${error.message}`);
        console.error(error.stack);
        return false;
    }
}

// ============================================================================
// 執行所有測試
// ============================================================================

function runAllTests() {
    console.log('奇門遁甲系統測試');
    console.log('版本：重構版 2.0.0');
    console.log(`測試時間：${new Date().toISOString()}`);

    let passed = 0;
    let failed = 0;

    // 原有測試案例
    console.log('\n\n' + '▓'.repeat(60));
    console.log('第一部分：原有 generateQimenChart 測試');
    console.log('▓'.repeat(60));

    for (let i = 0; i < testCases.length; i++) {
        if (runTestCase(testCases[i], i)) {
            passed++;
        } else {
            failed++;
        }
    }

    // generateChartByDatetime 測試
    console.log('\n\n' + '▓'.repeat(60));
    console.log('第二部分：generateChartByDatetime API 測試');
    console.log('▓'.repeat(60));

    for (let i = 0; i < datetimeTestCases.length; i++) {
        if (runDatetimeTest(datetimeTestCases[i], i)) {
            passed++;
        } else {
            failed++;
        }
    }

    // 輸入驗證測試
    console.log('\n\n' + '▓'.repeat(60));
    console.log('第三部分：輸入驗證測試');
    console.log('▓'.repeat(60));

    for (let i = 0; i < validationTestCases.length; i++) {
        if (runValidationTest(validationTestCases[i], i)) {
            passed++;
        } else {
            failed++;
        }
    }

    // generateChartNow 測試
    console.log('\n\n' + '▓'.repeat(60));
    console.log('第四部分：generateChartNow API 測試');
    console.log('▓'.repeat(60));

    if (runNowTest()) {
        passed++;
    } else {
        failed++;
    }

    // 一致性測試
    console.log('\n\n' + '▓'.repeat(60));
    console.log('第五部分：一致性測試');
    console.log('▓'.repeat(60));

    if (runConsistencyTest()) {
        passed++;
    } else {
        failed++;
    }

    // 測試摘要
    console.log(`\n${'='.repeat(60)}`);
    console.log('測試摘要');
    console.log('='.repeat(60));
    console.log(`總計：${passed + failed} 個測試`);
    console.log(`通過：${passed} 個`);
    console.log(`失敗：${failed} 個`);

    if (failed === 0) {
        console.log('\n✓ 所有測試通過！');
    } else {
        console.log(`\n✗ 有 ${failed} 個測試失敗`);
        process.exit(1);
    }
}

// 執行測試
runAllTests();

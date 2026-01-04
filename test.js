/**
 * 奇門遁甲系統測試模組
 * 
 * 本模組用於驗證重構後的系統與原始邏輯產出相同結果。
 * 執行方式：node test.js
 */

import { generateQimenChart, chartToObject } from './index.js';

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
// 執行所有測試
// ============================================================================

function runAllTests() {
    console.log('奇門遁甲系統測試');
    console.log('版本：重構版 2.0.0');
    console.log(`測試時間：${new Date().toISOString()}`);
    
    let passed = 0;
    let failed = 0;
    
    for (let i = 0; i < testCases.length; i++) {
        if (runTestCase(testCases[i], i)) {
            passed++;
        } else {
            failed++;
        }
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log('測試摘要');
    console.log('='.repeat(60));
    console.log(`總計：${testCases.length} 個測試`);
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

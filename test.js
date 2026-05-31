const http = require('http');
const db = require('./database');

const BASE_URL = 'http://localhost:3002';

let totalAssertions = 0;
let passedAssertions = 0;
let failedAssertions = 0;
const failureDetails = [];

function assert(condition, testName, detail) {
  totalAssertions++;
  if (condition) {
    passedAssertions++;
    console.log(`  ✅ PASS: ${testName}`);
  } else {
    failedAssertions++;
    const msg = detail || '断言条件为 false';
    failureDetails.push({ testName, detail: msg });
    console.log(`  ❌ FAIL: ${testName} — ${msg}`);
  }
}

function assertEqual(actual, expected, testName) {
  totalAssertions++;
  const pass = actual === expected;
  if (pass) {
    passedAssertions++;
    console.log(`  ✅ PASS: ${testName}`);
  } else {
    failedAssertions++;
    const msg = `期望 ${expected}, 实际 ${actual}`;
    failureDetails.push({ testName, detail: msg });
    console.log(`  ❌ FAIL: ${testName} — ${msg}`);
  }
}

function assertApprox(actual, expected, tolerance, testName) {
  totalAssertions++;
  const diff = Math.abs(actual - expected);
  const pass = diff <= tolerance;
  if (pass) {
    passedAssertions++;
    console.log(`  ✅ PASS: ${testName}`);
  } else {
    failedAssertions++;
    const msg = `期望 ≈${expected} (±${tolerance}), 实际 ${actual}, 偏差 ${diff}`;
    failureDetails.push({ testName, detail: msg });
    console.log(`  ❌ FAIL: ${testName} — ${msg}`);
  }
}

function assertGreaterThan(a, b, testName) {
  totalAssertions++;
  const pass = a > b;
  if (pass) {
    passedAssertions++;
    console.log(`  ✅ PASS: ${testName} (${a} > ${b})`);
  } else {
    failedAssertions++;
    const msg = `期望 ${a} > ${b}, 但不满足`;
    failureDetails.push({ testName, detail: msg });
    console.log(`  ❌ FAIL: ${testName} — ${msg}`);
  }
}

function httpPost(path, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = http.request(options, (res) => {
      let chunks = '';
      res.on('data', (chunk) => { chunks += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(chunks) });
        } catch (e) {
          resolve({ status: res.statusCode, data: chunks });
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function httpGet(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    http.get(url, (res) => {
      let chunks = '';
      res.on('data', (chunk) => { chunks += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(chunks) });
        } catch (e) {
          resolve({ status: res.statusCode, data: chunks });
        }
      });
    }).on('error', reject);
  });
}

const defaultConfig = {
  spring_constant: 25000,
  damping_coefficient: 1500,
  max_air_pressure: 1000000,
  min_air_volume: 0.001,
  max_air_volume: 0.01,
  piston_area: 0.015,
  unsprung_mass: 45,
  max_height: 0.5,
  min_height: 0.2
};

async function testTemperatureEffect() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('测试1: 温度从0°C到40°C变化时车身高度是否变化');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const temp0C = 273.15;
  const temp20C = 293.15;
  const temp40C = 313.15;

  const result0C = db.calculateSuspensionState({
    config: defaultConfig,
    input: { inflation: 0.5, payload: 500, temperature: temp0C }
  });
  const result20C = db.calculateSuspensionState({
    config: defaultConfig,
    input: { inflation: 0.5, payload: 500, temperature: temp20C }
  });
  const result40C = db.calculateSuspensionState({
    config: defaultConfig,
    input: { inflation: 0.5, payload: 500, temperature: temp40C }
  });

  console.log(`\n  0°C  → 高度: ${(result0C.height * 1000).toFixed(2)} mm, 压力: ${(result0C.pressure / 1000).toFixed(2)} kPa`);
  console.log(`  20°C → 高度: ${(result20C.height * 1000).toFixed(2)} mm, 压力: ${(result20C.pressure / 1000).toFixed(2)} kPa`);
  console.log(`  40°C → 高度: ${(result40C.height * 1000).toFixed(2)} mm, 压力: ${(result40C.pressure / 1000).toFixed(2)} kPa`);

  assert(
    result0C.height !== result40C.height,
    '0°C与40°C高度应不同',
    `0°C高度=${result0C.height}, 40°C高度=${result40C.height}, 二者相等`
  );

  assertGreaterThan(
    result40C.height,
    result0C.height,
    '40°C车身高度应大于0°C车身高度（热胀升压）'
  );

  assertGreaterThan(
    result40C.pressure,
    result0C.pressure,
    '40°C气囊压力应大于0°C气囊压力'
  );

  assertGreaterThan(
    result40C.height,
    result20C.height,
    '40°C车身高度应大于20°C'
  );

  assertGreaterThan(
    result20C.height,
    result0C.height,
    '20°C车身高度应大于0°C'
  );

  const heightDiffFullRange = (result40C.height - result0C.height) * 1000;
  assertGreaterThan(
    heightDiffFullRange,
    0,
    `0→40°C全温区高度差应 >0mm (实际: ${heightDiffFullRange.toFixed(2)}mm)`
  );

  const resultViaAPI_0C = await httpPost('/api/calculate', {
    config: defaultConfig,
    input: { inflation: 0.5, payload: 500, temperature: temp0C }
  });
  const resultViaAPI_40C = await httpPost('/api/calculate', {
    config: defaultConfig,
    input: { inflation: 0.5, payload: 500, temperature: temp40C }
  });

  assertEqual(resultViaAPI_0C.status, 200, 'API调用0°C返回状态码200');
  assertEqual(resultViaAPI_40C.status, 200, 'API调用40°C返回状态码200');

  assertGreaterThan(
    resultViaAPI_40C.data.height,
    resultViaAPI_0C.data.height,
    'API: 40°C返回高度应大于0°C'
  );

  assertApprox(
    resultViaAPI_0C.data.temperature,
    temp0C,
    0.01,
    'API返回0°C温度字段正确'
  );
  assertApprox(
    resultViaAPI_40C.data.temperature,
    temp40C,
    0.01,
    'API返回40°C温度字段正确'
  );

  const extremeCold = db.calculateSuspensionState({
    config: defaultConfig,
    input: { inflation: 0.5, payload: 500, temperature: 233.15 }
  });
  const extremeHot = db.calculateSuspensionState({
    config: defaultConfig,
    input: { inflation: 0.5, payload: 500, temperature: 333.15 }
  });

  assertGreaterThan(
    extremeHot.height,
    extremeCold.height,
    '极端温度: 60°C高度应大于-40°C'
  );
}

async function testPayloadCompression() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('测试2: 载荷从500到1500kg变化时悬架压缩量是否增加');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const result500 = db.calculateSuspensionState({
    config: defaultConfig,
    input: { inflation: 0.5, payload: 500, temperature: 293.15 }
  });
  const result1000 = db.calculateSuspensionState({
    config: defaultConfig,
    input: { inflation: 0.5, payload: 1000, temperature: 293.15 }
  });
  const result1500 = db.calculateSuspensionState({
    config: defaultConfig,
    input: { inflation: 0.5, payload: 1500, temperature: 293.15 }
  });

  console.log(`\n  500kg  → 高度: ${(result500.height * 1000).toFixed(2)} mm, 压缩率: ${(result500.compressionRatio * 100).toFixed(1)}%, 非线性因子: ${result500.nonlinearFactor.toFixed(3)}`);
  console.log(`  1000kg → 高度: ${(result1000.height * 1000).toFixed(2)} mm, 压缩率: ${(result1000.compressionRatio * 100).toFixed(1)}%, 非线性因子: ${result1000.nonlinearFactor.toFixed(3)}`);
  console.log(`  1500kg → 高度: ${(result1500.height * 1000).toFixed(2)} mm, 压缩率: ${(result1500.compressionRatio * 100).toFixed(1)}%, 非线性因子: ${result1500.nonlinearFactor.toFixed(3)}`);

  assertGreaterThan(
    result500.height,
    result1000.height,
    '500kg车身高度应大于1000kg'
  );

  assertGreaterThan(
    result1000.height,
    result1500.height,
    '1000kg车身高度应大于1500kg'
  );

  const compression500 = 0.3 - result500.height;
  const compression1000 = 0.3 - result1000.height;
  const compression1500 = 0.3 - result1500.height;

  assertGreaterThan(
    compression1000,
    compression500,
    `1000kg压缩量应大于500kg (1000kg: ${compression1000.toFixed(4)}m, 500kg: ${compression500.toFixed(4)}m)`
  );

  assertGreaterThan(
    compression1500,
    compression1000,
    `1500kg压缩量应大于1000kg (1500kg: ${compression1500.toFixed(4)}m, 1000kg: ${compression1000.toFixed(4)}m)`
  );

  assertGreaterThan(
    result1500.compressionRatio,
    result500.compressionRatio,
    '1500kg压缩比率应大于500kg'
  );

  assertGreaterThan(
    result1500.nonlinearFactor,
    result500.nonlinearFactor,
    '1500kg非线性因子应大于500kg'
  );

  assertGreaterThan(
    result1500.stiffness,
    result500.stiffness,
    '1500kg系统刚度应大于500kg（非线性增刚）'
  );

  const stiffnessDiff500_1000 = result1000.stiffness - result500.stiffness;
  assert(
    stiffnessDiff500_1000 > 0,
    `低载荷区间(500→1000)刚度有增加 [增量: ${stiffnessDiff500_1000.toFixed(1)}]`,
    `刚度增量 <=0`
  );

  const linearConfig = { ...defaultConfig };
  const result1000_linear = (() => {
    const { spring_constant, min_air_volume, max_air_volume, piston_area, unsprung_mass, max_height, min_height } = linearConfig;
    const currentVolume = min_air_volume + (max_air_volume - min_air_volume) * 0.5;
    const basePressure = 101325;
    const airPressure = basePressure * (max_air_volume / currentVolume);
    const springForce = spring_constant * 0.1;
    const airForce = (airPressure - basePressure) * piston_area;
    const totalUpwardForce = springForce + airForce;
    const weightForce = (unsprung_mass + 1000) * 9.81;
    const netForce = totalUpwardForce - weightForce;
    const displacement = netForce / spring_constant;
    return 0.3 + displacement;
  })();

  assertGreaterThan(
    result1000.height,
    result1000_linear,
    `非线性模型下1000kg高度应大于纯线性模型高度，体现非线性增刚抵抗压缩 [非线性: ${(result1000.height * 1000).toFixed(1)}mm, 线性: ${(result1000_linear * 1000).toFixed(1)}mm]`
  );

  const result1500_linear = (() => {
    const { spring_constant, min_air_volume, max_air_volume, piston_area, unsprung_mass } = linearConfig;
    const currentVolume = min_air_volume + (max_air_volume - min_air_volume) * 0.5;
    const basePressure = 101325;
    const airPressure = basePressure * (max_air_volume / currentVolume);
    const springForce = spring_constant * 0.1;
    const airForce = (airPressure - basePressure) * piston_area;
    const totalUpwardForce = springForce + airForce;
    const weightForce = (unsprung_mass + 1500) * 9.81;
    const netForce = totalUpwardForce - weightForce;
    const displacement = netForce / spring_constant;
    return 0.3 + displacement;
  })();

  const nonlinearLift1000 = result1000.height - result1000_linear;
  const nonlinearLift1500 = result1500.height - result1500_linear;
  assertGreaterThan(
    nonlinearLift1500,
    nonlinearLift1000,
    `1500kg下非线性增刚"托举"量应大于1000kg，体现非线性随载荷增强 [1500kg: ${(nonlinearLift1500 * 1000).toFixed(1)}mm, 1000kg: ${(nonlinearLift1000 * 1000).toFixed(1)}mm]`
  );

  assertGreaterThan(
    result1500.nonlinearFactor,
    1.0,
    `1500kg非线性因子应 >1.0 (实际: ${result1500.nonlinearFactor.toFixed(3)})`
  );

  const resultViaAPI_500 = await httpPost('/api/calculate', {
    config: defaultConfig,
    input: { inflation: 0.5, payload: 500, temperature: 293.15 }
  });
  const resultViaAPI_1500 = await httpPost('/api/calculate', {
    config: defaultConfig,
    input: { inflation: 0.5, payload: 1500, temperature: 293.15 }
  });

  assertGreaterThan(
    resultViaAPI_500.data.height,
    resultViaAPI_1500.data.height,
    'API: 500kg高度应大于1500kg'
  );

  assertGreaterThan(
    resultViaAPI_1500.data.nonlinearFactor,
    resultViaAPI_500.data.nonlinearFactor,
    'API: 1500kg非线性因子应大于500kg'
  );

  assertGreaterThan(
    resultViaAPI_1500.data.compressionRatio,
    resultViaAPI_500.data.compressionRatio,
    'API: 1500kg压缩比率应大于500kg'
  );
}

async function testSnapshotLevelingData() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('测试3: 后端高度快照是否已增加调平时间数值');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const snapshotWithLeveling = {
    front_left_height: 0.28,
    front_right_height: 0.28,
    rear_left_height: 0.28,
    rear_right_height: 0.28,
    front_left_pressure: 150000,
    front_right_pressure: 150000,
    rear_left_pressure: 150000,
    rear_right_pressure: 150000,
    payload: 800,
    vehicle_speed: 0,
    temperature: 303.15,
    inflation_level: 0.6,
    stiffness: 35000,
    leveling_time: 1.25,
    response_speed: 0.08,
    overshoot: 3.5,
    settling_time: 2.1,
    nonlinear_factor: 1.35,
    compression_ratio: 0.22
  };

  const createResult = await httpPost('/api/snapshots', snapshotWithLeveling);
  assertEqual(createResult.status, 201, '创建带调平数据的快照返回201');

  assert(
    createResult.data.leveling_time !== null && createResult.data.leveling_time !== undefined,
    '返回快照包含leveling_time字段',
    `leveling_time值为: ${createResult.data.leveling_time}`
  );

  assertApprox(
    createResult.data.leveling_time,
    1.25,
    0.01,
    'leveling_time值正确 (1.25s)'
  );

  assertApprox(
    createResult.data.response_speed,
    0.08,
    0.001,
    'response_speed值正确 (0.08 m/s)'
  );

  assertApprox(
    createResult.data.overshoot,
    3.5,
    0.01,
    'overshoot值正确 (3.5%)'
  );

  assertApprox(
    createResult.data.settling_time,
    2.1,
    0.01,
    'settling_time值正确 (2.1s)'
  );

  assertApprox(
    createResult.data.temperature,
    303.15,
    0.01,
    'temperature值正确 (303.15K)'
  );

  assertApprox(
    createResult.data.inflation_level,
    0.6,
    0.01,
    'inflation_level值正确 (0.6)'
  );

  assertApprox(
    createResult.data.nonlinear_factor,
    1.35,
    0.01,
    'nonlinear_factor值正确 (1.35)'
  );

  assertApprox(
    createResult.data.compression_ratio,
    0.22,
    0.01,
    'compression_ratio值正确 (0.22)'
  );

  const snapshotId = createResult.data.id;

  const listResult = await httpGet('/api/snapshots?limit=10');
  assertEqual(listResult.status, 200, '获取快照列表返回200');

  const found = listResult.data.find(s => s.id === snapshotId);
  assert(found !== undefined, '快照列表中能找到刚创建的快照', '未找到对应快照');

  if (found) {
    assert(
      found.leveling_time !== null && found.leveling_time !== undefined,
      '列表快照包含leveling_time',
      `leveling_time值为: ${found.leveling_time}`
    );
    assertApprox(found.leveling_time, 1.25, 0.01, '列表快照leveling_time值正确');
    assertApprox(found.response_speed, 0.08, 0.001, '列表快照response_speed值正确');
    assertApprox(found.overshoot, 3.5, 0.01, '列表快照overshoot值正确');
    assertApprox(found.settling_time, 2.1, 0.01, '列表快照settling_time值正确');
  }

  const snapshotNoLeveling = {
    front_left_height: 0.30,
    front_right_height: 0.30,
    rear_left_height: 0.30,
    rear_right_height: 0.30,
    front_left_pressure: 120000,
    front_right_pressure: 120000,
    rear_left_pressure: 120000,
    rear_right_pressure: 120000,
    payload: 500,
    vehicle_speed: 0
  };

  const noLevelResult = await httpPost('/api/snapshots', snapshotNoLeveling);
  assertEqual(noLevelResult.status, 201, '创建无调平数据的快照返回201');

  assert(
    noLevelResult.data.temperature !== null && noLevelResult.data.temperature !== undefined,
    '无调平数据快照仍包含temperature字段（默认值）',
    `temperature为: ${noLevelResult.data.temperature}`
  );

  assert(
    noLevelResult.data.leveling_time === null,
    '无调平数据快照leveling_time为null',
    `leveling_time为: ${noLevelResult.data.leveling_time}`
  );

  assertApprox(
    noLevelResult.data.nonlinear_factor,
    1.0,
    0.01,
    '无调平数据快照nonlinear_factor默认值为1.0'
  );

  assertApprox(
    noLevelResult.data.compression_ratio,
    0.0,
    0.01,
    '无调平数据快照compression_ratio默认值为0.0'
  );

  assert(
    typeof noLevelResult.data.leveling_time === 'object' || noLevelResult.data.leveling_time === null,
    'leveling_time字段类型可识别为null（未执行调平）',
    `leveling_time类型: ${typeof noLevelResult.data.leveling_time}, 值: ${noLevelResult.data.leveling_time}`
  );

  assert(
    typeof createResult.data.leveling_time === 'number',
    '有调平数据时leveling_time字段类型为number',
    `leveling_time类型: ${typeof createResult.data.leveling_time}`
  );
}

async function runAllTests() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  汽车空气悬架高度控制模拟 — Bug修复验证测试         ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  try {
    await testTemperatureEffect();
    await testPayloadCompression();
    await testSnapshotLevelingData();
  } catch (err) {
    console.error('\n💥 测试执行出错:', err.message);
    console.error(err.stack);
  }

  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  测试结果汇总                                       ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`  总断言数: ${totalAssertions}`);
  console.log(`  通过: ${passedAssertions} ✅`);
  console.log(`  失败: ${failedAssertions} ❌`);
  console.log(`  通过率: ${((passedAssertions / totalAssertions) * 100).toFixed(1)}%`);

  if (failureDetails.length > 0) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('❌ 失败用例明细:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    failureDetails.forEach((f, i) => {
      console.log(`  ${i + 1}. [${f.testName}]`);
      console.log(`     原因: ${f.detail}`);
    });
  } else {
    console.log('\n🎉 所有断言均通过，3个Bug修复验证成功！');
  }

  process.exit(failedAssertions > 0 ? 1 : 0);
}

runAllTests();

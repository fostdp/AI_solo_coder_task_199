const http = require('http');
const db = require('./database');
const SuspensionDynamics = require('./suspension-dynamics');

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

async function testSuspensionDynamicsClass() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('测试1: SuspensionDynamics 核心类功能验证');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const dyn = new SuspensionDynamics(defaultConfig);

  console.log('\n  --- 气动属性计算 ---');
  const airProps = dyn.calculateAirProperties(0.5, 293.15);
  assert(airProps.volume > 0, '气囊体积 > 0', `体积=${airProps.volume}`);
  assert(airProps.pressure > 0, '气囊压力 > 0', `压力=${airProps.pressure}`);
  assert(airProps.massOfAir > 0, '空气质量 > 0', `质量=${airProps.massOfAir}`);
  assert(airProps.density > 0, '空气密度 > 0', `密度=${airProps.density}`);

  console.log('\n  --- 平衡状态计算 ---');
  const state = dyn.calculateEquilibriumState({ inflation: 0.5, payload: 500, temperature: 293.15 });
  assert(state.height > 0, '车身高度 > 0', `高度=${state.height}`);
  assert(state.stiffness > 0, '系统刚度 > 0', `刚度=${state.stiffness}`);
  assert(state.nonlinearFactor >= 1.0, `非线性因子 ≥1.0 (实际: ${state.nonlinearFactor.toFixed(3)})`);
  assert(state.converged === true, '迭代计算收敛', `迭代次数=${state.iterations}`);
  assert(state.naturalFrequency > 0, `固有频率 > 0 (实际: ${state.naturalFrequency.toFixed(2)} Hz)`);
  assert(state.dampingRatio > 0, `阻尼比 > 0 (实际: ${state.dampingRatio.toFixed(3)})`);
  assert(state.temperature === 293.15, '温度字段正确');
  assert(state.totalMass > 0, `系统总质量 > 0 (实际: ${state.totalMass} kg)`);

  console.log('\n  --- 温度影响验证 ---');
  const state0C = dyn.calculateEquilibriumState({ inflation: 0.5, payload: 500, temperature: 273.15 });
  const state40C = dyn.calculateEquilibriumState({ inflation: 0.5, payload: 500, temperature: 313.15 });
  console.log(`    0°C  → 高度: ${(state0C.height * 1000).toFixed(2)} mm, 压力: ${(state0C.pressure / 1000).toFixed(1)} kPa`);
  console.log(`    40°C → 高度: ${(state40C.height * 1000).toFixed(2)} mm, 压力: ${(state40C.pressure / 1000).toFixed(1)} kPa`);
  assertGreaterThan(state40C.height, state0C.height, '40°C高度 > 0°C（PV=nRT温度效应）');
  assertGreaterThan(state40C.pressure, state0C.pressure, '40°C压力 > 0°C');

  console.log('\n  --- 非线性验证 ---');
  const state500 = dyn.calculateEquilibriumState({ inflation: 0.5, payload: 500, temperature: 293.15 });
  const state1500 = dyn.calculateEquilibriumState({ inflation: 0.5, payload: 1500, temperature: 293.15 });
  console.log(`    500kg  → 非线性因子: ${state500.nonlinearFactor.toFixed(3)}, 刚度: ${state500.stiffness.toFixed(0)} N/m`);
  console.log(`    1500kg → 非线性因子: ${state1500.nonlinearFactor.toFixed(3)}, 刚度: ${state1500.stiffness.toFixed(0)} N/m`);
  assertGreaterThan(state1500.nonlinearFactor, state500.nonlinearFactor, '1500kg非线性因子 > 500kg');
  assertGreaterThan(state1500.stiffness, state500.stiffness, '1500kg系统刚度 > 500kg');

  const linearConfig = { ...defaultConfig };
  const state1000_linear = (() => {
    const { spring_constant, min_air_volume, max_air_volume, piston_area, unsprung_mass } = linearConfig;
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
  const state1000 = dyn.calculateEquilibriumState({ inflation: 0.5, payload: 1000, temperature: 293.15 });
  assertGreaterThan(
    state1000.height,
    state1000_linear,
    `非线性模型高度 > 纯线性模型 (非线性: ${(state1000.height*1000).toFixed(1)}mm, 线性: ${(state1000_linear*1000).toFixed(1)}mm)`
  );

  console.log('\n  --- 调平性能仿真 ---');
  const perf = dyn.calculateLevelingPerformance(0.2, 0.3, 0.3, 0.7, 800, 293.15);
  console.log(`    调平时间: ${perf.levelingTime?.toFixed(3) || 'null'} s`);
  console.log(`    响应速度: ${perf.responseSpeed?.toFixed(4) || 'null'} m/s`);
  console.log(`    超调量: ${perf.overshoot?.toFixed(2) || '0'}%`);
  assert(perf.finalHeight !== undefined, '仿真返回最终高度');
  assert(perf.totalTime > 0, `总仿真时间 > 0 (${perf.totalTime.toFixed(2)}s)`);

  console.log('\n  --- 目标充气量计算 ---');
  const required = dyn.calculateRequiredInflation(0.3, 800, 293.15);
  console.log(`    800kg载荷下达到0.3m高度需要充气: ${(required*100).toFixed(1)}%`);
  assert(required >= 0 && required <= 1, `计算的充气量在 [0,1] 范围内 (实际: ${required.toFixed(3)})`);

  console.log('\n  --- 动力学步进仿真 ---');
  let simState = { height: 0.2, velocity: 0 };
  const stepResult = dyn.simulateStep(simState, { inflation: 0.7, payload: 800, temperature: 293.15 }, 0.01);
  assert(stepResult.height !== undefined, '步进返回高度');
  assert(stepResult.velocity !== undefined, '步进返回速度');
  assert(stepResult.acceleration !== undefined, '步进返回加速度');

  console.log('\n  --- 状态方程 ---');
  const equations = dyn.getStateEquation('all');
  assert(equations.ideal !== undefined, '理想气体状态方程存在');
  assert(equations.forceBalance !== undefined, '力平衡方程存在');
  assert(equations.nonlinearStiffness !== undefined, '非线性刚度方程存在');
  assert(equations.dynamics !== undefined, '动力学方程存在');
  assert(equations.ideal.formula === 'PV = nRT', '理想气体公式正确');
}

async function testTemperatureEffect() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('测试2: 温度从0°C到40°C变化时车身高度是否变化');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const temp0C = 273.15;
  const temp20C = 293.15;
  const temp40C = 313.15;

  const result0C = await httpPost('/api/calculate', {
    config: defaultConfig,
    input: { inflation: 0.5, payload: 500, temperature: temp0C }
  });
  const result20C = await httpPost('/api/calculate', {
    config: defaultConfig,
    input: { inflation: 0.5, payload: 500, temperature: temp20C }
  });
  const result40C = await httpPost('/api/calculate', {
    config: defaultConfig,
    input: { inflation: 0.5, payload: 500, temperature: temp40C }
  });

  console.log(`\n  0°C  → 高度: ${(result0C.data.height * 1000).toFixed(2)} mm, 压力: ${(result0C.data.pressure / 1000).toFixed(2)} kPa`);
  console.log(`  20°C → 高度: ${(result20C.data.height * 1000).toFixed(2)} mm, 压力: ${(result20C.data.pressure / 1000).toFixed(2)} kPa`);
  console.log(`  40°C → 高度: ${(result40C.data.height * 1000).toFixed(2)} mm, 压力: ${(result40C.data.pressure / 1000).toFixed(2)} kPa`);

  assert(
    result0C.data.height !== result40C.data.height,
    '0°C与40°C高度应不同',
    `0°C高度=${result0C.data.height}, 40°C高度=${result40C.data.height}`
  );

  assertGreaterThan(result40C.data.height, result0C.data.height, '40°C高度 > 0°C（PV=nRT）');
  assertGreaterThan(result40C.data.pressure, result0C.data.pressure, '40°C压力 > 0°C');
  assertGreaterThan(result40C.data.height, result20C.data.height, '40°C高度 > 20°C');
  assertGreaterThan(result20C.data.height, result0C.data.height, '20°C高度 > 0°C');

  const heightDiff = (result40C.data.height - result0C.data.height) * 1000;
  assertGreaterThan(heightDiff, 0, `0→40°C高度差 > 0 (${heightDiff.toFixed(2)}mm)`);

  assertEqual(result0C.status, 200, 'API返回200');
  assertApprox(result0C.data.temperature, temp0C, 0.01, '返回温度字段正确（0°C）');
  assertApprox(result40C.data.temperature, temp40C, 0.01, '返回温度字段正确（40°C）');

  const airProps = await httpPost('/api/calculate/air-properties', { inflation: 0.5, temperature: temp20C });
  assertEqual(airProps.status, 200, '气动属性API返回200');
  assert(airProps.data.volume > 0, '返回体积 > 0');
  assert(airProps.data.pressure > 0, '返回压力 > 0');
  assert(airProps.data.density > 0, '返回密度 > 0');

  const reqInflation = await httpPost('/api/calculate/required-inflation', {
    config: defaultConfig,
    targetHeight: 0.3,
    payload: 800,
    temperature: 293.15
  });
  assertEqual(reqInflation.status, 200, '目标充气量API返回200');
  assert(reqInflation.data.requiredInflation >= 0 && reqInflation.data.requiredInflation <= 1, '返回充气量在有效范围');

  const stateEq = await httpGet('/api/state-equation');
  assertEqual(stateEq.status, 200, '状态方程API返回200');
  assert(stateEq.data.ideal !== undefined, '返回理想气体方程');
  assert(stateEq.data.ideal.formula === 'PV = nRT', '状态方程公式正确');
}

async function testPayloadCompression() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('测试3: 载荷500→1500kg压缩量增加');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const result500 = await httpPost('/api/calculate', {
    config: defaultConfig,
    input: { inflation: 0.5, payload: 500, temperature: 293.15 }
  });
  const result1000 = await httpPost('/api/calculate', {
    config: defaultConfig,
    input: { inflation: 0.5, payload: 1000, temperature: 293.15 }
  });
  const result1500 = await httpPost('/api/calculate', {
    config: defaultConfig,
    input: { inflation: 0.5, payload: 1500, temperature: 293.15 }
  });

  console.log(`\n  500kg  → 高度: ${(result500.data.height * 1000).toFixed(2)} mm, 压缩率: ${(result500.data.compressionRatio * 100).toFixed(1)}%, 非线性: ${result500.data.nonlinearFactor.toFixed(3)}`);
  console.log(`  1000kg → 高度: ${(result1000.data.height * 1000).toFixed(2)} mm, 压缩率: ${(result1000.data.compressionRatio * 100).toFixed(1)}%, 非线性: ${result1000.data.nonlinearFactor.toFixed(3)}`);
  console.log(`  1500kg → 高度: ${(result1500.data.height * 1000).toFixed(2)} mm, 压缩率: ${(result1500.data.compressionRatio * 100).toFixed(1)}%, 非线性: ${result1500.data.nonlinearFactor.toFixed(3)}`);

  assertGreaterThan(result500.data.height, result1000.data.height, '500kg高度 > 1000kg');
  assertGreaterThan(result1000.data.height, result1500.data.height, '1000kg高度 > 1500kg');

  const comp500 = 0.3 - result500.data.height;
  const comp1000 = 0.3 - result1000.data.height;
  const comp1500 = 0.3 - result1500.data.height;

  assertGreaterThan(comp1000, comp500, `1000kg压缩量 > 500kg (${(comp1000*1000).toFixed(1)}mm > ${(comp500*1000).toFixed(1)}mm)`);
  assertGreaterThan(comp1500, comp1000, `1500kg压缩量 > 1000kg (${(comp1500*1000).toFixed(1)}mm > ${(comp1000*1000).toFixed(1)}mm)`);

  assertGreaterThan(result1500.data.compressionRatio, result500.data.compressionRatio, '1500kg压缩率 > 500kg');
  assertGreaterThan(result1500.data.nonlinearFactor, result500.data.nonlinearFactor, '1500kg非线性因子 > 500kg');
  assertGreaterThan(result1500.data.stiffness, result500.data.stiffness, '1500kg刚度 > 500kg');

  const stiffDiff500_1000 = result1000.data.stiffness - result500.data.stiffness;
  assertGreaterThan(stiffDiff500_1000, 0, `500→1000kg刚度增量 > 0 (${stiffDiff500_1000.toFixed(1)})`);

  const state1000 = result1000.data;
  const state1000_linear = (() => {
    const { spring_constant, min_air_volume, max_air_volume, piston_area, unsprung_mass } = defaultConfig;
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
    state1000.height,
    state1000_linear,
    `非线性"托举"效果 (非线性: ${(state1000.height*1000).toFixed(1)}mm, 线性: ${(state1000_linear*1000).toFixed(1)}mm)`
  );

  const nlLift500 = result500.data.height - (() => {
    const wc = (45 + 500) * 9.81;
    const upf = 25000 * 0.1 + (result500.data.pressure - 101325) * 0.015;
    return 0.3 + (upf - wc) / 25000;
  })();

  const nlLift1500 = result1500.data.height - (() => {
    const wc = (45 + 1500) * 9.81;
    const upf = 25000 * 0.1 + (result1500.data.pressure - 101325) * 0.015;
    return 0.3 + (upf - wc) / 25000;
  })();

  assertGreaterThan(
    nlLift1500,
    nlLift500,
    `高载荷非线性托举量更大 (1500kg: ${(nlLift1500*1000).toFixed(1)}mm, 500kg: ${(nlLift500*1000).toFixed(1)}mm)`
  );

  assertGreaterThan(result1500.data.nonlinearFactor, 1.0, `1500kg非线性因子 >1.0 (${result1500.data.nonlinearFactor.toFixed(3)})`);

  const simulateStep = await httpPost('/api/simulate/step', {
    config: defaultConfig,
    currentState: { height: 0.2, velocity: 0 },
    input: { inflation: 0.7, payload: 800, temperature: 293.15 },
    dt: 0.01
  });
  assertEqual(simulateStep.status, 200, '动力学步进API返回200');
  assert(simulateStep.data.height !== undefined, '返回高度');
  assert(simulateStep.data.acceleration !== undefined, '返回加速度');
}

async function testSnapshotLevelingData() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('测试4: 后端高度快照含调平时间数值');
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
    compression_ratio: 0.22,
    natural_frequency: 1.8,
    damping_ratio: 0.45,
    air_mass: 0.012,
    air_density: 1.4
  };

  const createResult = await httpPost('/api/snapshots', snapshotWithLeveling);
  assertEqual(createResult.status, 201, '创建带调平数据的快照返回201');

  assert(createResult.data.leveling_time !== null, '包含leveling_time', `值为: ${createResult.data.leveling_time}`);
  assertApprox(createResult.data.leveling_time, 1.25, 0.01, 'leveling_time值正确');
  assertApprox(createResult.data.response_speed, 0.08, 0.001, 'response_speed值正确');
  assertApprox(createResult.data.overshoot, 3.5, 0.01, 'overshoot值正确');
  assertApprox(createResult.data.settling_time, 2.1, 0.01, 'settling_time值正确');
  assertApprox(createResult.data.temperature, 303.15, 0.01, 'temperature值正确');
  assertApprox(createResult.data.nonlinear_factor, 1.35, 0.01, 'nonlinear_factor值正确');
  assertApprox(createResult.data.compression_ratio, 0.22, 0.01, 'compression_ratio值正确');
  assertApprox(createResult.data.natural_frequency, 1.8, 0.01, 'natural_frequency值正确');
  assertApprox(createResult.data.damping_ratio, 0.45, 0.01, 'damping_ratio值正确');
  assertApprox(createResult.data.air_mass, 0.012, 0.001, 'air_mass值正确');
  assertApprox(createResult.data.air_density, 1.4, 0.01, 'air_density值正确');

  const listResult = await httpGet('/api/snapshots?limit=10');
  assertEqual(listResult.status, 200, '获取快照列表返回200');

  const found = listResult.data.find(s => s.id === createResult.data.id);
  assert(found !== undefined, '列表中找到刚创建的快照');

  if (found) {
    assertApprox(found.leveling_time, 1.25, 0.01, '列表leveling_time正确');
    assertApprox(found.response_speed, 0.08, 0.001, '列表response_speed正确');
    assertApprox(found.natural_frequency, 1.8, 0.01, '列表natural_frequency正确');
  }

  const perfReq = {
    initialHeight: 0.2,
    targetHeight: 0.3,
    payload: 800,
    temperature: 293.15,
    inflationStart: 0.3,
    inflationEnd: 0.7,
    config: defaultConfig
  };

  const perfResult = await httpPost('/api/leveling-performance', perfReq);
  assertEqual(perfResult.status, 201, '调平性能记录API返回201');
  assert(perfResult.data.id !== undefined, '返回记录ID');
  assert(perfResult.data.leveling_time !== undefined || perfResult.data.leveling_time === null, '包含leveling_time字段');
  assertApprox(perfResult.data.initial_height, 0.2, 0.01, '初始高度正确');
  assertApprox(perfResult.data.target_height, 0.3, 0.01, '目标高度正确');

  const perfList = await httpGet('/api/leveling-performance?limit=5');
  assertEqual(perfList.status, 200, '调平性能列表API返回200');
  assert(Array.isArray(perfList.data), '返回数组');

  const calcPerf = await httpPost('/api/calculate/leveling-performance', perfReq);
  assertEqual(calcPerf.status, 200, '计算调平性能API返回200');
  assert(calcPerf.data.levelingTime !== undefined, '返回levelingTime');
  assert(calcPerf.data.responseSpeed !== undefined, '返回responseSpeed');
}

async function runAllTests() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  悬架动力学框架重构验证测试                          ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  try {
    await testSuspensionDynamicsClass();
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
    console.log('\n🎉 所有断言均通过，悬架动力学框架重构验证成功！');
  }

  process.exit(failedAssertions > 0 ? 1 : 0);
}

runAllTests();

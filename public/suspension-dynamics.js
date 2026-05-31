class SuspensionDynamics {
  constructor(config) {
    this.setConfig(config);
    this._g = 9.81;
    this._R = 287;
    this._referenceTemperature = 293.15;
    this._atmosphericPressure = 101325;
    this._maxIterations = 15;
    this._convergenceTolerance = 1e-6;
  }

  setConfig(config) {
    this.config = {
      springConstant: config.spring_constant || config.springConstant || 25000,
      dampingCoefficient: config.damping_coefficient || config.dampingCoefficient || 1500,
      maxAirPressure: config.max_air_pressure || config.maxAirPressure || 1000000,
      minAirVolume: config.min_air_volume || config.minAirVolume || 0.001,
      maxAirVolume: config.max_air_volume || config.maxAirVolume || 0.01,
      pistonArea: config.piston_area || config.pistonArea || 0.015,
      unsprungMass: config.unsprung_mass || config.unsprungMass || 45,
      maxHeight: config.max_height || config.maxHeight || 0.5,
      minHeight: config.min_height || config.minHeight || 0.2,
      referenceDisplacement: 0.1,
      nonlinearExponent: 2.0,
      nonlinearCoefficient: 2.5,
      volumeCompressionFactor: 0.3
    };
  }

  getConfig() {
    return {
      spring_constant: this.config.springConstant,
      damping_coefficient: this.config.dampingCoefficient,
      max_air_pressure: this.config.maxAirPressure,
      min_air_volume: this.config.minAirVolume,
      max_air_volume: this.config.maxAirVolume,
      piston_area: this.config.pistonArea,
      unsprung_mass: this.config.unsprungMass,
      max_height: this.config.maxHeight,
      min_height: this.config.minHeight
    };
  }

  calculateAirProperties(inflationLevel, temperature) {
    const { minAirVolume, maxAirVolume } = this.config;
    const volume = minAirVolume + (maxAirVolume - minAirVolume) * inflationLevel;
    const n = (this._atmosphericPressure * maxAirVolume) / (this._R * this._referenceTemperature);
    const pressure = (n * this._R * temperature) / volume;

    return {
      volume,
      pressure,
      massOfAir: n * 0.02897,
      density: (n * 0.02897) / volume
    };
  }

  calculateEquilibriumState(input) {
    const { inflation, payload, temperature } = {
      inflation: 0.5,
      payload: 500,
      temperature: this._referenceTemperature,
      ...input
    };

    const { springConstant, pistonArea, unsprungMass, maxHeight, minHeight,
            referenceDisplacement, nonlinearExponent, nonlinearCoefficient,
            volumeCompressionFactor } = this.config;

    const airProps = this.calculateAirProperties(inflation, temperature);

    const springForce = springConstant * referenceDisplacement;
    const airForce = (airProps.pressure - this._atmosphericPressure) * pistonArea;
    const totalUpwardForce = springForce + airForce;
    const totalMass = unsprungMass + payload;
    const weightForce = totalMass * this._g;

    let rideHeight = this.config.maxHeight * 0.6;
    let effectiveStiffness = springConstant;
    let nonlinearFactor = 1.0;
    let compressionRatio = 0.0;
    let iterations = 0;
    let converged = false;

    while (iterations < this._maxIterations && !converged) {
      const prevHeight = rideHeight;
      const netForce = totalUpwardForce - weightForce;
      const displacement = netForce / effectiveStiffness;

      rideHeight = (maxHeight * 0.6) + displacement;
      rideHeight = Math.max(minHeight, Math.min(maxHeight, rideHeight));

      compressionRatio = Math.max(0, Math.min(1, (maxHeight - rideHeight) / (maxHeight - minHeight)));
      nonlinearFactor = 1 + nonlinearCoefficient * Math.pow(compressionRatio, nonlinearExponent);

      const airStiffness = (airProps.pressure * pistonArea) / Math.max(rideHeight, 0.05);
      effectiveStiffness = springConstant + airStiffness * nonlinearFactor;

      if (Math.abs(rideHeight - prevHeight) < this._convergenceTolerance) {
        converged = true;
      }
      iterations++;
    }

    const effectiveVolume = airProps.volume * (1 - volumeCompressionFactor * compressionRatio);
    const effectiveAirForce = airForce * nonlinearFactor;
    const airStiffness = (airProps.pressure * pistonArea) / Math.max(rideHeight, 0.05);
    const naturalFrequency = Math.sqrt(effectiveStiffness / Math.max(totalMass, 1)) / (2 * Math.PI);
    const dampingRatio = this.config.dampingCoefficient / (2 * Math.sqrt(effectiveStiffness * totalMass));

    return {
      height: rideHeight,
      pressure: airProps.pressure,
      volume: effectiveVolume,
      stiffness: effectiveStiffness,
      springForce,
      airForce: effectiveAirForce,
      displacement: (totalUpwardForce - weightForce) / effectiveStiffness,
      temperature,
      nonlinearFactor,
      compressionRatio,
      airStiffness,
      airMass: airProps.massOfAir,
      airDensity: airProps.density,
      naturalFrequency,
      dampingRatio,
      iterations,
      converged,
      totalMass,
      weightForce,
      upwardForce: totalUpwardForce,
      netForce: totalUpwardForce - weightForce
    };
  }

  simulateStep(currentState, input, dt) {
    const { velocity, height } = currentState;
    const target = this.calculateEquilibriumState(input);

    const springForce = this.config.springConstant * (height - this.config.maxHeight * 0.6);
    const dampingForce = this.config.dampingCoefficient * velocity;
    const totalMass = this.config.unsprungMass + (input.payload || 500);
    const weightForce = totalMass * this._g;
    const airProps = this.calculateAirProperties(input.inflation || 0.5, input.temperature || this._referenceTemperature);
    const airForce = (airProps.pressure - this._atmosphericPressure) * this.config.pistonArea;

    const netForce = airForce + this.config.springConstant * this.config.referenceDisplacement
                    - springForce - dampingForce - weightForce;

    const acceleration = netForce / totalMass;
    const newVelocity = velocity + acceleration * dt;
    const newHeight = height + newVelocity * dt;

    const clampedHeight = Math.max(this.config.minHeight, Math.min(this.config.maxHeight, newHeight));

    return {
      height: clampedHeight,
      velocity: newVelocity,
      acceleration,
      targetHeight: target.height,
      springForce,
      dampingForce,
      airForce,
      netForce
    };
  }

  calculateLevelingPerformance(initialHeight, targetHeight, inflationStart, inflationEnd,
                               payload, temperature, dt = 0.01) {
    let time = 0;
    let state = { height: initialHeight, velocity: 0, acceleration: 0 };
    const settlingThreshold = 0.001;
    const responseThreshold = 0.02 * Math.abs(targetHeight - initialHeight);

    let peakHeight = initialHeight;
    let levelingTime = null;
    let responseTime = null;
    let settlingTime = null;
    let firstWithinThreshold = null;

    const maxTime = 10;
    while (time < maxTime) {
      const inflationProgress = Math.min(1, time / 1.5);
      const currentInflation = inflationStart + (inflationEnd - inflationStart) * inflationProgress;

      state = this.simulateStep(
        state,
        { inflation: currentInflation, payload, temperature },
        dt
      );

      time += dt;

      if ((targetHeight > initialHeight && state.height > peakHeight) ||
          (targetHeight < initialHeight && state.height < peakHeight)) {
        peakHeight = state.height;
      }

      const withinResponse = Math.abs(state.height - initialHeight) >= responseThreshold;
      if (withinResponse && responseTime === null) {
        responseTime = time;
      }

      const withinSettling = Math.abs(state.height - targetHeight) < settlingThreshold;
      if (withinSettling && firstWithinThreshold === null) {
        firstWithinThreshold = time;
      }

      if (withinSettling && levelingTime === null) {
        levelingTime = time;
      }

      if (!withinSettling) {
        settlingTime = null;
      } else if (settlingTime === null && firstWithinThreshold !== null) {
        settlingTime = firstWithinThreshold;
      }

      if (levelingTime !== null && settlingTime !== null && time > levelingTime + 0.5) {
        break;
      }
    }

    const totalDisplacement = Math.abs(targetHeight - initialHeight);
    const overshoot = totalDisplacement > 0
      ? Math.max(0, (Math.abs(peakHeight - targetHeight) / totalDisplacement) * 100)
      : 0;
    const responseSpeed = totalDisplacement > 0 && responseTime !== null
      ? totalDisplacement / responseTime
      : null;

    return {
      levelingTime,
      settlingTime,
      responseTime,
      responseSpeed,
      overshoot,
      peakHeight,
      finalHeight: state.height,
      targetHeight,
      totalTime: time
    };
  }

  calculateRequiredInflation(targetHeight, payload, temperature) {
    const { springConstant, pistonArea, unsprungMass, minAirVolume, maxAirVolume } = this.config;
    const springForce = springConstant * this.config.referenceDisplacement;
    const totalMass = unsprungMass + payload;
    const weightForce = totalMass * this._g;

    const requiredNetForce = weightForce - springForce;
    const requiredPressureDiff = requiredNetForce / pistonArea;
    const requiredPressure = requiredPressureDiff + this._atmosphericPressure;

    const n = (this._atmosphericPressure * maxAirVolume) / (this._R * this._referenceTemperature);
    const requiredVolume = (n * this._R * temperature) / requiredPressure;

    let inflation = (requiredVolume - minAirVolume) / (maxAirVolume - minAirVolume);
    inflation = Math.max(0, Math.min(1, inflation));

    return inflation;
  }

  getStateEquation(type = 'ideal') {
    const equations = {
      ideal: {
        name: '理想气体状态方程',
        formula: 'PV = nRT',
        variables: {
          P: '气囊绝对压力 (Pa)',
          V: '气囊体积 (m³)',
          n: '气体物质的量 (mol)',
          R: `气体常数 (${this._R} J/(mol·K))`,
          T: '热力学温度 (K)'
        },
        description: '基于理想气体定律描述气囊压力、体积和温度的关系'
      },
      forceBalance: {
        name: '力平衡方程',
        formula: 'k*x0 + (P - P0)*A = (m_s + m_u)*g',
        variables: {
          k: '弹簧刚度 (N/m)',
          x0: `弹簧预压缩量 (${this.config.referenceDisplacement} m)`,
          P: '气囊压力 (Pa)',
          P0: `大气压 (${this._atmosphericPressure} Pa)`,
          A: '活塞面积 (m²)',
          m_s: '簧上质量 (kg)',
          m_u: `非簧载质量 (${this.config.unsprungMass} kg)`,
          g: `重力加速度 (${this._g} m/s²)`
        },
        description: '悬架系统的静态力平衡条件'
      },
      nonlinearStiffness: {
        name: '非线性刚度模型',
        formula: `k_eff = k_spring + k_air·(1 + ${this.config.nonlinearCoefficient}·r^${this.config.nonlinearExponent})`,
        variables: {
          k_eff: '有效刚度 (N/m)',
          k_spring: '机械弹簧刚度 (N/m)',
          k_air: '气动刚度 (N/m)',
          r: '压缩比率 (0-1)'
        },
        description: '考虑气囊几何非线性的等效刚度计算'
      },
      dynamics: {
        name: '动力学方程',
        formula: 'm·ẍ + c·ẋ + k·x = F_air(t)',
        variables: {
          m: '系统总质量 (kg)',
          c: '阻尼系数 (N·s/m)',
          k: '等效刚度 (N/m)',
          x: '位移 (m)',
          F_air: '气囊推力 (N)'
        },
        description: '悬架调平过程的二阶微分方程'
      }
    };

    return type === 'all' ? equations : (equations[type] || equations.ideal);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SuspensionDynamics;
}
if (typeof window !== 'undefined') {
  window.SuspensionDynamics = SuspensionDynamics;
}

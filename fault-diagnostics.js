const SuspensionDynamics = require('./suspension-dynamics');

class FaultDiagnostics {
  constructor(config) {
    this.dynamics = new SuspensionDynamics(config);
    this.thresholds = {
      minPressure: 120000,
      maxPressure: 800000,
      minHeight: 0.18,
      maxHeight: 0.52,
      pressureDeviationWarning: 0.15,
      pressureDeviationError: 0.30,
      heightDeviationWarning: 0.02,
      heightDeviationError: 0.05,
      temperatureMin: 233.15,
      temperatureMax: 353.15,
      responseTimeWarning: 3.0,
      responseTimeError: 5.0,
      stiffnessLow: 20000,
      stiffnessHigh: 100000
    };
  }

  setThresholds(thresholds) {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }

  diagnosePressure(pressure, expectedPressure = null) {
    const issues = [];
    const warnings = [];

    if (pressure < this.thresholds.minPressure) {
      issues.push({
        type: 'error',
        code: 'PRESSURE_TOO_LOW',
        severity: 'critical',
        message: `气囊压力过低: ${(pressure / 1000).toFixed(1)} kPa`,
        recommendation: '检查气泵和管路是否漏气'
      });
    }

    if (pressure > this.thresholds.maxPressure) {
      issues.push({
        type: 'error',
        code: 'PRESSURE_TOO_HIGH',
        severity: 'critical',
        message: `气囊压力过高: ${(pressure / 1000).toFixed(1)} kPa`,
        recommendation: '检查压力传感器和泄压阀'
      });
    }

    if (expectedPressure !== null) {
      const deviation = Math.abs(pressure - expectedPressure) / expectedPressure;
      if (deviation > this.thresholds.pressureDeviationError) {
        issues.push({
          type: 'error',
          code: 'PRESSURE_DEVIATION_HIGH',
          severity: 'high',
          message: `压力偏差过大: ${(deviation * 100).toFixed(1)}%`,
          recommendation: '气囊可能泄漏或传感器故障'
        });
      } else if (deviation > this.thresholds.pressureDeviationWarning) {
        warnings.push({
          type: 'warning',
          code: 'PRESSURE_DEVIATION_WARNING',
          severity: 'medium',
          message: `压力偏差偏高: ${(deviation * 100).toFixed(1)}%`,
          recommendation: '建议检查系统密封性'
        });
      }
    }

    return { issues, warnings };
  }

  diagnoseHeight(height, targetHeight = null) {
    const issues = [];
    const warnings = [];

    if (height < this.thresholds.minHeight) {
      issues.push({
        type: 'error',
        code: 'HEIGHT_TOO_LOW',
        severity: 'high',
        message: `车身高度过低: ${(height * 1000).toFixed(0)} mm`,
        recommendation: '悬架系统可能失效，请勿高速行驶'
      });
    }

    if (height > this.thresholds.maxHeight) {
      issues.push({
        type: 'error',
        code: 'HEIGHT_TOO_HIGH',
        severity: 'high',
        message: `车身高度过高: ${(height * 1000).toFixed(0)} mm`,
        recommendation: '重心过高，过弯风险增加'
      });
    }

    if (targetHeight !== null) {
      const deviation = Math.abs(height - targetHeight);
      if (deviation > this.thresholds.heightDeviationError) {
        issues.push({
          type: 'error',
          code: 'HEIGHT_DEVIATION_HIGH',
          severity: 'medium',
          message: `高度偏差过大: ${(deviation * 1000).toFixed(1)} mm`,
          recommendation: '自动调平功能异常'
        });
      } else if (deviation > this.thresholds.heightDeviationWarning) {
        warnings.push({
          type: 'warning',
          code: 'HEIGHT_DEVIATION_WARNING',
          severity: 'low',
          message: `高度偏差偏高: ${(deviation * 1000).toFixed(1)} mm`,
          recommendation: '系统调平中...'
        });
      }
    }

    return { issues, warnings };
  }

  diagnoseTemperature(temperature) {
    const issues = [];
    const warnings = [];

    if (temperature < this.thresholds.temperatureMin) {
      warnings.push({
        type: 'warning',
        code: 'TEMPERATURE_TOO_LOW',
        severity: 'medium',
        message: `环境温度过低: ${(temperature - 273.15).toFixed(1)}°C`,
        recommendation: '低温下气泵性能可能下降'
      });
    }

    if (temperature > this.thresholds.temperatureMax) {
      issues.push({
        type: 'error',
        code: 'TEMPERATURE_TOO_HIGH',
        severity: 'medium',
        message: `环境温度过高: ${(temperature - 273.15).toFixed(1)}°C`,
        recommendation: '高温下注意气泵过热保护'
      });
    }

    return { issues, warnings };
  }

  diagnoseStiffness(stiffness) {
    const issues = [];
    const warnings = [];

    if (stiffness < this.thresholds.stiffnessLow) {
      issues.push({
        type: 'error',
        code: 'STIFFNESS_TOO_LOW',
        severity: 'high',
        message: `系统刚度过低: ${stiffness.toFixed(0)} N/m`,
        recommendation: '操控性下降，请勿激烈驾驶'
      });
    }

    if (stiffness > this.thresholds.stiffnessHigh) {
      warnings.push({
        type: 'warning',
        code: 'STIFFNESS_TOO_HIGH',
        severity: 'low',
        message: `系统刚度偏高: ${stiffness.toFixed(0)} N/m`,
        recommendation: '舒适性可能下降'
      });
    }

    return { issues, warnings };
  }

  diagnoseLevelingPerformance(performance) {
    const issues = [];
    const warnings = [];

    if (performance.levelingTime !== null) {
      if (performance.levelingTime > this.thresholds.responseTimeError) {
        issues.push({
          type: 'error',
          code: 'LEVELING_TOO_SLOW',
          severity: 'medium',
          message: `调平响应过慢: ${performance.levelingTime.toFixed(2)}s`,
          recommendation: '气泵流量可能不足'
        });
      } else if (performance.levelingTime > this.thresholds.responseTimeWarning) {
        warnings.push({
          type: 'warning',
          code: 'LEVELING_SLOW',
          severity: 'low',
          message: `调平响应偏慢: ${performance.levelingTime.toFixed(2)}s`,
          recommendation: '系统响应正常'
        });
      }
    }

    if (performance.overshoot !== null && performance.overshoot > 15) {
      warnings.push({
        type: 'warning',
        code: 'OVERSHOOT_HIGH',
        severity: 'low',
        message: `调平超调量偏高: ${performance.overshoot.toFixed(1)}%`,
        recommendation: '阻尼特性可能需要优化'
      });
    }

    return { issues, warnings };
  }

  diagnoseCornerBalance(heightFL, heightFR, heightRL, heightRR) {
    const issues = [];
    const warnings = [];

    const avgHeight = (heightFL + heightFR + heightRL + heightRR) / 4;
    const frontDiff = Math.abs(heightFL - heightFR);
    const rearDiff = Math.abs(heightRL - heightRR);
    const sideLeftDiff = Math.abs((heightFL + heightRL) / 2 - avgHeight);
    const sideRightDiff = Math.abs((heightFR + heightRR) / 2 - avgHeight);

    if (frontDiff > 0.015) {
      warnings.push({
        type: 'warning',
        code: 'FRONT_UNBALANCE',
        severity: 'low',
        message: `前轴高度差: ${(frontDiff * 1000).toFixed(1)} mm`,
        recommendation: '检查左右载荷分布'
      });
    }

    if (rearDiff > 0.015) {
      warnings.push({
        type: 'warning',
        code: 'REAR_UNBALANCE',
        severity: 'low',
        message: `后轴高度差: ${(rearDiff * 1000).toFixed(1)} mm`,
        recommendation: '检查左右载荷分布'
      });
    }

    if (Math.max(sideLeftDiff, sideRightDiff) > 0.02) {
      issues.push({
        type: 'error',
        code: 'SIDE_UNBALANCE',
        severity: 'medium',
        message: `车身侧倾明显`,
        recommendation: '悬架系统可能存在单侧故障'
      });
    }

    return { issues, warnings };
  }

  fullDiagnosis(state, targetHeight = null) {
    const allIssues = [];
    const allWarnings = [];

    const pressureResult = this.diagnosePressure(state.pressure);
    const heightResult = this.diagnoseHeight(state.height, targetHeight);
    const tempResult = this.diagnoseTemperature(state.temperature);
    const stiffnessResult = this.diagnoseStiffness(state.stiffness);

    allIssues.push(...pressureResult.issues, ...heightResult.issues, ...tempResult.issues, ...stiffnessResult.issues);
    allWarnings.push(...pressureResult.warnings, ...heightResult.warnings, ...tempResult.warnings, ...stiffnessResult.warnings);

    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    allIssues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
    allWarnings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    const overallStatus = allIssues.length > 0 ? 'error' : (allWarnings.length > 0 ? 'warning' : 'normal');

    return {
      status: overallStatus,
      issues: allIssues,
      warnings: allWarnings,
      issueCount: allIssues.length,
      warningCount: allWarnings.length,
      timestamp: Date.now(),
      stateSnapshot: {
        height: state.height,
        pressure: state.pressure,
        temperature: state.temperature,
        stiffness: state.stiffness
      }
    };
  }

  getMaintenanceTips(status) {
    const tips = [];

    if (status === 'normal') {
      tips.push('系统运行正常');
      tips.push('建议每6个月检查气路密封性');
    } else if (status === 'warning') {
      tips.push('存在预警信号，建议关注相关参数');
      tips.push('下次保养时检查气囊状态');
    } else {
      tips.push('⚠️ 存在故障，请尽快检修');
      tips.push('避免高速行驶和激烈驾驶');
    }

    tips.push('定期检查空气干燥器状态');
    tips.push('保持储气筒排水清洁');

    return tips;
  }
}

module.exports = FaultDiagnostics;

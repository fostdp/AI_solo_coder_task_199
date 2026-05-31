class AirSuspensionSimulator {
  constructor() {
    this.suspensionCanvas = document.getElementById('suspensionCanvas');
    this.suspensionCtx = this.suspensionCanvas.getContext('2d');
    this.gaugeCanvas = document.getElementById('heightGauge');
    this.gaugeCtx = this.gaugeCanvas.getContext('2d');
    this.historyCanvas = document.getElementById('historyChart');
    this.historyCtx = this.historyCanvas.getContext('2d');

    this.dynamics = new SuspensionDynamics({
      spring_constant: 25000,
      damping_coefficient: 1500,
      max_air_pressure: 1000000,
      min_air_volume: 0.001,
      max_air_volume: 0.01,
      piston_area: 0.015,
      unsprung_mass: 45,
      max_height: 0.5,
      min_height: 0.2
    });

    this.state = {
      inflation: 0.5,
      payload: 500,
      temperature: 293.15,
      targetHeight: 0.3,
      currentHeight: 0.3,
      velocity: 0,
      pressure: 101325,
      stiffness: 25000,
      nonlinearFactor: 1.0,
      compressionRatio: 0.0,
      naturalFrequency: 0,
      dampingRatio: 0,
      airMass: 0,
      airDensity: 0,
      airBubbles: [],
      levelStartTime: null,
      peakHeight: null,
      settled: false
    };

    this.equilibriumState = null;
    this.diagnosisState = { status: 'normal', issues: [], warnings: [] };
    this.heightHistory = [];
    this.maxHistoryPoints = 100;
    this.autoLeveling = false;
    this.animationTime = 0;
    this.levelingMetrics = {
      levelingTime: null,
      responseSpeed: null,
      overshoot: null,
      settlingTime: null
    };

    this.initElements();
    this.initEventListeners();
    this.calculateState();
    this.runDiagnostics();
    this.loadSnapshots();
    this.loadMaintenanceTips();
    this.animate();

    setInterval(() => this.recordHeight(), 500);
    setInterval(() => this.runDiagnostics(), 2000);
  }

  initElements() {
    this.systemStatus = document.getElementById('systemStatus');
    this.statusDot = this.systemStatus.querySelector('.status-dot');
    this.statusText = this.systemStatus.querySelector('.status-text');
    
    this.inflationSlider = document.getElementById('inflationSlider');
    this.inflationValue = document.getElementById('inflationValue');
    this.payloadSlider = document.getElementById('payloadSlider');
    this.payloadValue = document.getElementById('payloadValue');
    this.temperatureSlider = document.getElementById('temperatureSlider');
    this.temperatureValue = document.getElementById('temperatureValue');
    this.heightDisplay = document.getElementById('heightDisplay');
    this.pressureDisplay = document.getElementById('pressureDisplay');
    this.stiffnessDisplay = document.getElementById('stiffnessDisplay');
    this.temperatureDisplay = document.getElementById('temperatureDisplay');
    this.nonlinearDisplay = document.getElementById('nonlinearDisplay');
    this.compressionDisplay = document.getElementById('compressionDisplay');
    this.gaugeValue = document.getElementById('gaugeValue');
    this.diagnosticsBadge = document.getElementById('diagnosticsBadge');
    this.faultSection = document.getElementById('faultSection');
    this.faultList = document.getElementById('faultList');
    this.warningSection = document.getElementById('warningSection');
    this.warningList = document.getElementById('warningList');
    this.normalMessage = document.getElementById('normalMessage');
    this.maintenanceTips = document.getElementById('maintenanceTips');
    this.snapshotList = document.getElementById('snapshotList');

    this.springConstantInput = document.getElementById('springConstant');
    this.maxPressureInput = document.getElementById('maxPressure');
    this.pistonAreaInput = document.getElementById('pistonArea');
  }

  initEventListeners() {
    this.inflationSlider.addEventListener('input', (e) => {
      this.state.inflation = e.target.value / 100;
      this.inflationValue.textContent = `${e.target.value}%`;
      this.calculateState();
    });

    this.payloadSlider.addEventListener('input', (e) => {
      this.state.payload = parseFloat(e.target.value);
      this.payloadValue.textContent = `${e.target.value} kg`;
      this.calculateState();
    });

    this.temperatureSlider.addEventListener('input', (e) => {
      const celsius = parseFloat(e.target.value);
      this.state.temperature = celsius + 273.15;
      this.temperatureValue.textContent = `${celsius} °C`;
      this.calculateState();
    });

    this.springConstantInput.addEventListener('change', (e) => {
      const config = this.dynamics.getConfig();
      config.spring_constant = parseFloat(e.target.value);
      this.dynamics.setConfig(config);
      this.calculateState();
    });

    this.maxPressureInput.addEventListener('change', (e) => {
      const config = this.dynamics.getConfig();
      config.max_air_pressure = parseFloat(e.target.value) * 1000;
      this.dynamics.setConfig(config);
      this.calculateState();
    });

    this.pistonAreaInput.addEventListener('change', (e) => {
      const config = this.dynamics.getConfig();
      config.piston_area = parseFloat(e.target.value) / 10000;
      this.dynamics.setConfig(config);
      this.calculateState();
    });

    document.getElementById('autoLevelBtn').addEventListener('click', () => this.startAutoLeveling());
    document.getElementById('saveSnapshotBtn').addEventListener('click', () => this.saveSnapshot());
    document.getElementById('resetBtn').addEventListener('click', () => this.reset());
  }

  calculateState() {
    const airProps = this.dynamics.calculateAirProperties(this.state.inflation, this.state.temperature);
    this.equilibriumState = this.dynamics.calculateEquilibriumState({
      inflation: this.state.inflation,
      payload: this.state.payload,
      temperature: this.state.temperature
    });

    this.state.targetHeight = this.equilibriumState.height;
    this.state.pressure = this.equilibriumState.pressure;
    this.state.stiffness = this.equilibriumState.stiffness;
    this.state.nonlinearFactor = this.equilibriumState.nonlinearFactor;
    this.state.compressionRatio = this.equilibriumState.compressionRatio;
    this.state.naturalFrequency = this.equilibriumState.naturalFrequency;
    this.state.dampingRatio = this.equilibriumState.dampingRatio;
    this.state.airMass = this.equilibriumState.airMass;
    this.state.airDensity = this.equilibriumState.airDensity;

    this.updateDisplay();
    this.updateAirBubbles(this.state.inflation);
  }

  updateAirBubbles(inflation) {
    const targetCount = Math.floor(inflation * 20);

    while (this.state.airBubbles.length < targetCount) {
      this.state.airBubbles.push({
        x: Math.random(),
        y: Math.random(),
        size: 2 + Math.random() * 4,
        speed: 0.5 + Math.random() * 1.5,
        phase: Math.random() * Math.PI * 2
      });
    }

    while (this.state.airBubbles.length > targetCount) {
      this.state.airBubbles.pop();
    }
  }

  updateDisplay() {
    const heightMm = this.state.currentHeight * 1000;
    this.heightDisplay.textContent = `车身高度: ${heightMm.toFixed(1)} mm`;
    this.pressureDisplay.textContent = `气囊压力: ${(this.state.pressure / 1000).toFixed(1)} kPa`;
    this.stiffnessDisplay.textContent = `系统刚度: ${this.state.stiffness.toFixed(0)} N/m`;
    this.temperatureDisplay.textContent = `温度: ${(this.state.temperature - 273.15).toFixed(1)} °C`;
    this.nonlinearDisplay.textContent = `${this.state.nonlinearFactor.toFixed(2)}x`;
    this.compressionDisplay.textContent = `${(this.state.compressionRatio * 100).toFixed(1)}%`;
    this.gaugeValue.textContent = `${heightMm.toFixed(0)} mm`;
  }

  runDiagnostics() {
    fetch('/api/diagnose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        state: {
          height: this.state.currentHeight,
          pressure: this.state.pressure,
          temperature: this.state.temperature,
          stiffness: this.state.stiffness
        },
        targetHeight: 0.3,
        config: this.dynamics.getConfig()
      })
    })
    .then(res => res.json())
    .then(result => {
      this.diagnosisState = result;
      this.updateDiagnosticsUI();
    })
    .catch(err => console.error('诊断失败:', err));
  }

  updateDiagnosticsUI() {
    const { status, issues, warnings } = this.diagnosisState;

    this.statusDot.className = `status-dot status-${status}`;
    this.statusText.textContent = status === 'normal' ? '系统正常' : status === 'warning' ? '存在预警' : '存在故障';

    this.diagnosticsBadge.className = `diagnostics-badge status-${status}`;
    this.diagnosticsBadge.textContent = status === 'normal' ? '正常' : status === 'warning' ? '预警' : '故障';

    if (issues.length > 0) {
      this.faultSection.style.display = 'block';
      this.faultList.innerHTML = issues.map(issue => `
        <div class="fault-item">
          <div class="fault-code">${issue.code}</div>
          <div class="fault-message">${issue.message}</div>
          ${issue.recommendation ? `<div class="fault-recommendation">💡 ${issue.recommendation}</div>` : ''}
        </div>
      `).join('');
    } else {
      this.faultSection.style.display = 'none';
    }

    if (warnings.length > 0) {
      this.warningSection.style.display = 'block';
      this.warningList.innerHTML = warnings.map(warning => `
        <div class="warning-item">
          <div class="warning-code">${warning.code}</div>
          <div class="warning-message">${warning.message}</div>
          ${warning.recommendation ? `<div class="warning-recommendation">💡 ${warning.recommendation}</div>` : ''}
        </div>
      `).join('');
    } else {
      this.warningSection.style.display = 'none';
    }

    this.normalMessage.style.display = (issues.length === 0 && warnings.length === 0) ? 'block' : 'none';
  }

  loadMaintenanceTips() {
    fetch(`/api/maintenance-tips?status=${this.diagnosisState.status}`)
      .then(res => res.json())
      .then(tips => {
        this.maintenanceTips.innerHTML = tips.map(tip => `<li>${tip}</li>`).join('');
      })
      .catch(err => console.error('加载维护建议失败:', err));
  }

  recordHeight() {
    this.heightHistory.push({
      height: this.state.currentHeight,
      targetHeight: this.state.targetHeight,
      time: Date.now()
    });

    if (this.heightHistory.length > this.maxHistoryPoints) {
      this.heightHistory.shift();
    }

    if (this.heightHistory.length % 10 === 0) {
      fetch('/api/height-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          height: this.state.currentHeight,
          target_height: this.state.targetHeight,
          pressure: this.state.pressure,
          temperature: this.state.temperature,
          inflation: this.state.inflation,
          payload: this.state.payload
        })
      }).catch(() => {});
    }
  }

  startAutoLeveling() {
    this.autoLeveling = true;
    const targetHeight = 0.3;
    const initialHeight = this.state.currentHeight;
    const initialInflation = this.state.inflation;
    const heightDiff = targetHeight - initialHeight;

    const requiredInflation = this.dynamics.calculateRequiredInflation(
      targetHeight,
      this.state.payload,
      this.state.temperature
    );

    this.state.levelStartTime = Date.now();
    this.state.peakHeight = initialHeight;
    this.state.settled = false;
    this.levelingMetrics = {
      levelingTime: null,
      responseSpeed: null,
      overshoot: null,
      settlingTime: null
    };

    this.levelCheckInterval = setInterval(() => {
      const currentDiff = Math.abs(this.state.currentHeight - targetHeight);

      if (heightDiff > 0 && this.state.currentHeight > this.state.peakHeight) {
        this.state.peakHeight = this.state.currentHeight;
      } else if (heightDiff < 0 && this.state.currentHeight < this.state.peakHeight) {
        this.state.peakHeight = this.state.currentHeight;
      }

      if (currentDiff < 0.001 && !this.state.settled) {
        const elapsed = (Date.now() - this.state.levelStartTime) / 1000;
        this.levelingMetrics.settlingTime = elapsed;
        this.state.settled = true;
      }

      if (currentDiff < Math.abs(heightDiff) * 0.02 && this.levelingMetrics.responseSpeed === null) {
        const elapsed = (Date.now() - this.state.levelStartTime) / 1000;
        this.levelingMetrics.levelingTime = elapsed;
        this.levelingMetrics.responseSpeed = Math.abs(heightDiff) / elapsed;

        if (Math.abs(this.state.peakHeight - targetHeight) > Math.abs(heightDiff) * 0.05) {
          this.levelingMetrics.overshoot = Math.abs(this.state.peakHeight - targetHeight) / Math.abs(heightDiff) * 100;
        }
      }
    }, 50);

    if (Math.abs(heightDiff) > 0.001) {
      const newInflation = Math.max(0, Math.min(1, requiredInflation));
      this.inflationSlider.value = newInflation * 100;
      this.inflationValue.textContent = `${(newInflation * 100).toFixed(0)}%`;
      this.state.inflation = newInflation;
      this.calculateState();

      fetch('/api/leveling-performance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initialHeight,
          targetHeight,
          payload: this.state.payload,
          temperature: this.state.temperature,
          inflationStart: initialInflation,
          inflationEnd: newInflation,
          config: this.dynamics.getConfig()
        })
      });
    }

    setTimeout(() => {
      this.autoLeveling = false;
      if (this.levelCheckInterval) {
        clearInterval(this.levelCheckInterval);
      }
    }, 3000);
  }

  async saveSnapshot() {
    const snapshot = {
      front_left_height: this.state.currentHeight,
      front_right_height: this.state.currentHeight,
      rear_left_height: this.state.currentHeight,
      rear_right_height: this.state.currentHeight,
      front_left_pressure: this.state.pressure,
      front_right_pressure: this.state.pressure,
      rear_left_pressure: this.state.pressure,
      rear_right_pressure: this.state.pressure,
      payload: this.state.payload,
      vehicle_speed: 0,
      temperature: this.state.temperature,
      inflation_level: this.state.inflation,
      stiffness: this.state.stiffness,
      leveling_time: this.levelingMetrics.levelingTime,
      response_speed: this.levelingMetrics.responseSpeed,
      overshoot: this.levelingMetrics.overshoot,
      settling_time: this.levelingMetrics.settlingTime,
      nonlinear_factor: this.state.nonlinearFactor,
      compression_ratio: this.state.compressionRatio,
      natural_frequency: this.state.naturalFrequency,
      damping_ratio: this.state.dampingRatio,
      air_mass: this.state.airMass,
      air_density: this.state.airDensity
    };

    try {
      const response = await fetch('/api/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot)
      });

      if (response.ok) {
        this.loadSnapshots();
      }
    } catch (error) {
      console.error('保存快照失败:', error);
    }
  }

  async loadSnapshots() {
    try {
      const response = await fetch('/api/snapshots');
      const snapshots = await response.json();

      if (snapshots.length === 0) {
        this.snapshotList.innerHTML = '<p class="empty-text">暂无快照数据</p>';
        return;
      }

      this.snapshotList.innerHTML = snapshots.map(s => `
        <div class="snapshot-item" data-id="${s.id}">
          <div class="time">${new Date(s.created_at).toLocaleString('zh-CN')}</div>
          <div class="data">
            <div>高度: <span>${(s.front_left_height * 1000).toFixed(0)} mm</span></div>
            <div>载荷: <span>${s.payload} kg</span></div>
            <div>压力: <span>${(s.front_left_pressure / 1000).toFixed(0)} kPa</span></div>
            <div>温度: <span>${(s.temperature - 273.15).toFixed(1)}°C</span></div>
            ${s.leveling_time ? `<div>调平: <span>${s.leveling_time.toFixed(2)}s</span></div>` : ''}
          </div>
        </div>
      `).join('');

      this.snapshotList.querySelectorAll('.snapshot-item').forEach(item => {
        item.addEventListener('click', () => {
          const id = item.dataset.id;
          const snapshot = snapshots.find(s => s.id == id);
          if (snapshot) {
            this.loadSnapshot(snapshot);
          }
        });
      });
    } catch (error) {
      console.error('加载快照失败:', error);
    }
  }

  loadSnapshot(snapshot) {
    this.state.payload = snapshot.payload;
    this.state.temperature = snapshot.temperature;
    this.payloadSlider.value = snapshot.payload;
    this.payloadValue.textContent = `${snapshot.payload} kg`;
    this.temperatureSlider.value = snapshot.temperature - 273.15;
    this.temperatureValue.textContent = `${(snapshot.temperature - 273.15).toFixed(0)} °C`;
    this.calculateState();
  }

  reset() {
    this.state.inflation = 0.5;
    this.state.payload = 500;
    this.state.temperature = 293.15;
    this.inflationSlider.value = 50;
    this.inflationValue.textContent = '50%';
    this.payloadSlider.value = 500;
    this.payloadValue.textContent = '500 kg';
    this.temperatureSlider.value = 20;
    this.temperatureValue.textContent = '20 °C';
    this.levelingMetrics = {
      levelingTime: null,
      responseSpeed: null,
      overshoot: null,
      settlingTime: null
    };
    this.heightHistory = [];
    this.calculateState();
  }

  animate() {
    this.animationTime += 0.016;

    const heightDiff = this.state.targetHeight - this.state.currentHeight;
    const damping = 0.95;
    const springForce = heightDiff * 200;
    this.state.velocity += springForce * 0.016;
    this.state.velocity *= damping;
    this.state.currentHeight += this.state.velocity;

    this.state.currentHeight = Math.max(
      this.dynamics.config.minHeight,
      Math.min(this.dynamics.config.maxHeight, this.state.currentHeight)
    );

    this.updateDisplay();
    this.drawSuspension();
    this.drawGauge();
    this.drawHistory();

    requestAnimationFrame(() => this.animate());
  }

  drawGauge() {
    const ctx = this.gaugeCtx;
    const width = this.gaugeCanvas.width;
    const height = this.gaugeCanvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = 80;

    ctx.clearRect(0, 0, width, height);

    const minHeight = 0.2;
    const maxHeight = 0.5;
    const currentValue = Math.max(minHeight, Math.min(maxHeight, this.state.currentHeight));
    const angle = ((currentValue - minHeight) / (maxHeight - minHeight)) * Math.PI - Math.PI / 2;

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, -Math.PI / 2, Math.PI / 2, false);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 15;
    ctx.lineCap = 'round';
    ctx.stroke();

    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, '#4ade80');
    gradient.addColorStop(0.5, '#4a9eff');
    gradient.addColorStop(1, '#f59e0b');

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, -Math.PI / 2, angle, false);
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 15;
    ctx.stroke();

    const colors = ['#f87171', '#fbbf24', '#4ade80', '#fbbf24', '#f87171'];
    for (let i = 0; i < 5; i++) {
      const tickAngle = -Math.PI / 2 + (i / 4) * Math.PI;
      const innerR = radius + 20;
      const outerR = radius + 28;
      ctx.beginPath();
      ctx.moveTo(centerX + Math.cos(tickAngle) * innerR, centerY + Math.sin(tickAngle) * innerR);
      ctx.lineTo(centerX + Math.cos(tickAngle) * outerR, centerY + Math.sin(tickAngle) * outerR);
      ctx.strokeStyle = colors[i];
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.moveTo(0, -radius + 25);
    ctx.lineTo(-6, 20);
    ctx.lineTo(6, 20);
    ctx.closePath();
    ctx.fillStyle = '#4a9eff';
    ctx.shadowColor = '#4a9eff';
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.restore();

    ctx.beginPath();
    ctx.arc(centerX, centerY, 12, 0, Math.PI * 2);
    ctx.fillStyle = '#1a1a2e';
    ctx.fill();
    ctx.strokeStyle = '#4a9eff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(centerX, centerY, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#4a9eff';
    ctx.fill();
  }

  drawHistory() {
    const ctx = this.historyCtx;
    const width = this.historyCanvas.width;
    const height = this.historyCanvas.height;
    const padding = { top: 15, bottom: 25, left: 50, right: 20 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, 0, width, height);

    const gridColor = 'rgba(255, 255, 255, 0.1)';
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;

    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (i / 4) * chartHeight;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      const value = 500 - i * 75;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '10px Arial';
      ctx.textAlign = 'right';
      ctx.fillText(`${value}`, padding.left - 5, y + 3);
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.textAlign = 'center';
    ctx.fillText('时间 →', (padding.left + width - padding.right) / 2, height - 5);

    if (this.heightHistory.length < 2) return;

    const minHeight = 0.2;
    const maxHeight = 0.5;

    const areaGradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
    areaGradient.addColorStop(0, 'rgba(74, 158, 255, 0.3)');
    areaGradient.addColorStop(1, 'rgba(74, 158, 255, 0.0)');

    ctx.beginPath();
    ctx.moveTo(padding.left, height - padding.bottom);

    this.heightHistory.forEach((point, i) => {
      const x = padding.left + (i / (this.maxHistoryPoints - 1)) * chartWidth;
      const normalizedY = (point.height - minHeight) / (maxHeight - minHeight);
      const y = height - padding.bottom - normalizedY * chartHeight;
      ctx.lineTo(x, y);
    });

    ctx.lineTo(padding.left + ((this.heightHistory.length - 1) / (this.maxHistoryPoints - 1)) * chartWidth, height - padding.bottom);
    ctx.closePath();
    ctx.fillStyle = areaGradient;
    ctx.fill();

    ctx.beginPath();
    this.heightHistory.forEach((point, i) => {
      const x = padding.left + (i / (this.maxHistoryPoints - 1)) * chartWidth;
      const normalizedY = (point.height - minHeight) / (maxHeight - minHeight);
      const y = height - padding.bottom - normalizedY * chartHeight;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.strokeStyle = '#4a9eff';
    ctx.lineWidth = 2;
    ctx.stroke();

    const targetY = height - padding.bottom - ((0.3 - minHeight) / (maxHeight - minHeight)) * chartHeight;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(padding.left, targetY);
    ctx.lineTo(width - padding.right, targetY);
    ctx.strokeStyle = 'rgba(74, 222, 128, 0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);

    const lastPoint = this.heightHistory[this.heightHistory.length - 1];
    const lastX = padding.left + ((this.heightHistory.length - 1) / (this.maxHistoryPoints - 1)) * chartWidth;
    const lastNormalizedY = (lastPoint.height - minHeight) / (maxHeight - minHeight);
    const lastY = height - padding.bottom - lastNormalizedY * chartHeight;

    ctx.beginPath();
    ctx.arc(lastX, lastY, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#4a9eff';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  drawSuspension() {
    const ctx = this.suspensionCtx;
    const width = this.suspensionCanvas.width;
    const height = this.suspensionCanvas.height;

    ctx.clearRect(0, 0, width, height);

    this.drawBackground();

    const groundY = height - 50;
    const heightPixels = this.state.currentHeight * 800;
    const chassisY = groundY - heightPixels - 100;

    this.drawGround(groundY);
    this.drawWheel(150, groundY, chassisY);
    this.drawWheel(850, groundY, chassisY);
    this.drawAirSuspension(150, groundY, chassisY, 'left');
    this.drawAirSuspension(850, groundY, chassisY, 'right');
    this.drawChassis(chassisY);
    this.drawPayload(chassisY);
  }

  drawBackground() {
    const ctx = this.suspensionCtx;
    const width = this.suspensionCanvas.width;
    const height = this.suspensionCanvas.height;

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#1a1a2e');
    gradient.addColorStop(0.6, '#16213e');
    gradient.addColorStop(1, '#0f3460');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    for (let i = 0; i < 50; i++) {
      const x = (i * 73) % width;
      const y = (i * 37) % (height * 0.6);
      ctx.beginPath();
      ctx.arc(x, y, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawGround(y) {
    const ctx = this.suspensionCtx;
    const width = this.suspensionCanvas.width;

    const groundGradient = ctx.createLinearGradient(0, y, 0, this.suspensionCanvas.height);
    groundGradient.addColorStop(0, '#2d4a22');
    groundGradient.addColorStop(0.3, '#1e3a15');
    groundGradient.addColorStop(1, '#0d1f0a');
    ctx.fillStyle = groundGradient;
    ctx.fillRect(0, y, width, this.suspensionCanvas.height - y);

    ctx.strokeStyle = '#4a7c3a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();

    ctx.strokeStyle = '#5a9c4a';
    ctx.lineWidth = 1;
    for (let i = 0; i < width; i += 15) {
      ctx.beginPath();
      ctx.moveTo(i, y);
      ctx.lineTo(i + 5, y - 8);
      ctx.stroke();
    }
  }

  drawWheel(x, groundY, chassisY) {
    const ctx = this.suspensionCtx;
    const wheelRadius = 45;
    const wheelY = groundY - wheelRadius;

    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(x, wheelY, wheelRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#333';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, wheelY, wheelRadius - 10, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#666';
    ctx.beginPath();
    ctx.arc(x, wheelY, 15, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#888';
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(x, wheelY);
      ctx.lineTo(x + Math.cos(angle) * 12, wheelY + Math.sin(angle) * 12);
      ctx.stroke();
    }
  }

  drawAirSuspension(x, groundY, chassisY, side) {
    const ctx = this.suspensionCtx;
    const wheelY = groundY - 45;

    const airBagTop = chassisY + 30;
    const airBagBottom = wheelY - 30;
    const airBagHeight = airBagBottom - airBagTop;

    const inflation = this.state.inflation;
    const bagWidth = 40 + inflation * 20;
    const bagTopWidth = 30 + inflation * 15;

    ctx.strokeStyle = '#2a4a6a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, airBagTop - 10);
    ctx.lineTo(x, airBagBottom + 10);
    ctx.stroke();

    const compressionIntensity = this.state.compressionRatio;
    const r = Math.floor(74 + compressionIntensity * 181);
    const g = Math.floor(158 - compressionIntensity * 100);
    const b = Math.floor(255 - compressionIntensity * 150);
    const bagColor = `rgb(${r}, ${g}, ${b})`;
    const bagColorDark = `rgb(${Math.floor(r*0.6)}, ${Math.floor(g*0.6)}, ${Math.floor(b*0.6)})`;

    const bagGradient = ctx.createRadialGradient(x, (airBagTop + airBagBottom) / 2, 0, x, (airBagTop + airBagBottom) / 2, bagWidth);
    bagGradient.addColorStop(0, bagColor);
    bagGradient.addColorStop(0.5, bagColorDark);
    bagGradient.addColorStop(1, '#1a2a3a');
    ctx.fillStyle = bagGradient;
    ctx.strokeStyle = '#1a3a5a';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(x - bagTopWidth / 2, airBagTop);

    const segments = 8;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const y = airBagTop + t * airBagHeight;
      const bulge = Math.sin(t * Math.PI) * bagWidth / 2;
      ctx.lineTo(x - bagTopWidth / 2 - bulge, y);
    }

    for (let i = segments; i >= 0; i--) {
      const t = i / segments;
      const y = airBagTop + t * airBagHeight;
      const bulge = Math.sin(t * Math.PI) * bagWidth / 2;
      ctx.lineTo(x + bagTopWidth / 2 + bulge, y);
    }

    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.rect(x - bagWidth, airBagTop, bagWidth * 2, airBagHeight);
    ctx.clip();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    this.state.airBubbles.forEach((bubble, i) => {
      const bx = x + (bubble.x - 0.5) * bagWidth * 1.5;
      const by = airBagTop + bubble.y * airBagHeight + Math.sin(this.animationTime * bubble.speed + bubble.phase) * 5;
      ctx.beginPath();
      ctx.arc(bx, by, bubble.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();

    const springTop = airBagTop - 25;
    const springBottom = airBagBottom + 25;
    const springCoils = 8;
    const springWidth = 20;

    ctx.strokeStyle = '#8b7355';
    ctx.lineWidth = 4;
    ctx.beginPath();

    for (let i = 0; i <= springCoils * 2; i++) {
      const t = i / (springCoils * 2);
      const y = springTop + t * (springBottom - springTop);
      const xOffset = Math.sin(t * Math.PI * springCoils) * springWidth;
      if (i === 0) {
        ctx.moveTo(x + xOffset, y);
      } else {
        ctx.lineTo(x + xOffset, y);
      }
    }
    ctx.stroke();

    ctx.strokeStyle = '#b8860b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= springCoils * 2; i++) {
      const t = i / (springCoils * 2);
      const y = springTop + t * (springBottom - springTop);
      const xOffset = Math.sin(t * Math.PI * springCoils) * springWidth;
      if (i === 0) {
        ctx.moveTo(x + xOffset, y);
      } else {
        ctx.lineTo(x + xOffset, y);
      }
    }
    ctx.stroke();
  }

  drawChassis(y) {
    const ctx = this.suspensionCtx;
    const width = this.suspensionCanvas.width;

    const chassisGradient = ctx.createLinearGradient(0, y, 0, y + 60);
    chassisGradient.addColorStop(0, '#e63946');
    chassisGradient.addColorStop(0.5, '#c1121f');
    chassisGradient.addColorStop(1, '#780000');
    ctx.fillStyle = chassisGradient;
    ctx.strokeStyle = '#5a0000';
    ctx.lineWidth = 3;

    ctx.beginPath();
    ctx.moveTo(100, y + 60);
    ctx.lineTo(120, y + 20);
    ctx.lineTo(200, y);
    ctx.lineTo(800, y);
    ctx.lineTo(880, y + 20);
    ctx.lineTo(900, y + 60);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.beginPath();
    ctx.moveTo(220, y + 5);
    ctx.lineTo(780, y + 5);
    ctx.lineTo(780, y + 25);
    ctx.lineTo(220, y + 25);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#1a1a2e';
    ctx.beginPath();
    ctx.moveTo(250, y + 8);
    ctx.lineTo(450, y + 8);
    ctx.lineTo(440, y + 35);
    ctx.lineTo(260, y + 35);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(550, y + 8);
    ctx.lineTo(750, y + 8);
    ctx.lineTo(740, y + 35);
    ctx.lineTo(560, y + 35);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(100, 180, 255, 0.6)';
    ctx.beginPath();
    ctx.moveTo(265, y + 12);
    ctx.lineTo(445, y + 12);
    ctx.lineTo(438, y + 30);
    ctx.lineTo(270, y + 30);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(555, y + 12);
    ctx.lineTo(745, y + 12);
    ctx.lineTo(738, y + 30);
    ctx.lineTo(565, y + 30);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.arc(130, y + 40, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(870, y + 40, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ff4444';
    ctx.beginPath();
    ctx.arc(210, y + 40, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(790, y + 40, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  drawPayload(chassisY) {
    const ctx = this.suspensionCtx;
    const payloadRatio = this.state.payload / 2000;
    const payloadHeight = payloadRatio * 40;

    if (payloadHeight > 5) {
      const payloadGradient = ctx.createLinearGradient(0, chassisY - payloadHeight, 0, chassisY);
      payloadGradient.addColorStop(0, '#8b4513');
      payloadGradient.addColorStop(1, '#654321');
      ctx.fillStyle = payloadGradient;
      ctx.strokeStyle = '#3d2914';
      ctx.lineWidth = 2;

      ctx.fillRect(300, chassisY - payloadHeight, 400, payloadHeight);
      ctx.strokeRect(300, chassisY - payloadHeight, 400, payloadHeight);

      ctx.strokeStyle = '#5a3a1a';
      ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(300 + i * 100, chassisY - payloadHeight);
        ctx.lineTo(300 + i * 100, chassisY);
        ctx.stroke();
      }

      ctx.fillStyle = '#333';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`${this.state.payload} kg`, 500, chassisY - payloadHeight / 2 + 5);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new AirSuspensionSimulator();
});

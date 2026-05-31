const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const SuspensionDynamics = require('./suspension-dynamics');
const FaultDiagnostics = require('./fault-diagnostics');

const dbPath = path.join(__dirname, 'suspension.db');
const db = new sqlite3.Database(dbPath);

let dynamics = null;
let diagnostics = null;

function initDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS suspension_params (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          spring_constant REAL NOT NULL,
          damping_coefficient REAL NOT NULL,
          max_air_pressure REAL NOT NULL,
          min_air_volume REAL NOT NULL,
          max_air_volume REAL NOT NULL,
          piston_area REAL NOT NULL,
          unsprung_mass REAL NOT NULL,
          max_height REAL NOT NULL,
          min_height REAL NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS height_snapshots (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          front_left_height REAL NOT NULL,
          front_right_height REAL NOT NULL,
          rear_left_height REAL NOT NULL,
          rear_right_height REAL NOT NULL,
          front_left_pressure REAL NOT NULL,
          front_right_pressure REAL NOT NULL,
          rear_left_pressure REAL NOT NULL,
          rear_right_pressure REAL NOT NULL,
          payload REAL NOT NULL,
          vehicle_speed REAL NOT NULL,
          temperature REAL DEFAULT 293.15,
          inflation_level REAL DEFAULT 0.5,
          stiffness REAL NOT NULL DEFAULT 25000,
          leveling_time REAL,
          response_speed REAL,
          overshoot REAL,
          settling_time REAL,
          nonlinear_factor REAL DEFAULT 1.0,
          compression_ratio REAL DEFAULT 0.0,
          natural_frequency REAL,
          damping_ratio REAL,
          air_mass REAL,
          air_density REAL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS leveling_performance (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          initial_height REAL NOT NULL,
          target_height REAL NOT NULL,
          payload REAL NOT NULL,
          temperature REAL NOT NULL,
          initial_inflation REAL NOT NULL,
          final_inflation REAL NOT NULL,
          leveling_time REAL,
          settling_time REAL,
          response_time REAL,
          response_speed REAL,
          overshoot REAL,
          peak_height REAL,
          final_height REAL,
          total_time REAL NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS fault_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          code TEXT NOT NULL,
          type TEXT NOT NULL,
          severity TEXT NOT NULL,
          message TEXT NOT NULL,
          recommendation TEXT,
          height REAL,
          pressure REAL,
          temperature REAL,
          stiffness REAL,
          acknowledged BOOLEAN DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS warning_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          code TEXT NOT NULL,
          severity TEXT NOT NULL,
          message TEXT NOT NULL,
          recommendation TEXT,
          height REAL,
          pressure REAL,
          temperature REAL,
          stiffness REAL,
          acknowledged BOOLEAN DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS height_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          height REAL NOT NULL,
          target_height REAL,
          pressure REAL,
          temperature REAL,
          inflation REAL,
          payload REAL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.get('SELECT COUNT(*) as count FROM suspension_params', (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        
        if (row.count === 0) {
          db.run(`
            INSERT INTO suspension_params 
            (name, spring_constant, damping_coefficient, max_air_pressure, 
             min_air_volume, max_air_volume, piston_area, unsprung_mass, 
             max_height, min_height)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            '默认配置',
            25000,
            1500,
            1000000,
            0.001,
            0.01,
            0.015,
            45,
            0.5,
            0.2
          ], (err) => {
            if (err) reject(err);
            else {
              getSuspensionParamById(1).then(param => {
                dynamics = new SuspensionDynamics(param);
                diagnostics = new FaultDiagnostics(param);
                resolve();
              }).catch(reject);
            }
          });
        } else {
          getSuspensionParamById(1).then(param => {
            dynamics = new SuspensionDynamics(param);
            diagnostics = new FaultDiagnostics(param);
            resolve();
          }).catch(reject);
        }
      });
    });
  });
}

function getDynamics(config) {
  if (config) {
    return new SuspensionDynamics(config);
  }
  return dynamics;
}

function getDiagnostics(config) {
  if (config) {
    return new FaultDiagnostics(config);
  }
  return diagnostics;
}

function getSuspensionParams() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM suspension_params ORDER BY created_at DESC', (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function getSuspensionParamById(id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM suspension_params WHERE id = ?', [id], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function createSuspensionParam(params) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT INTO suspension_params 
      (name, spring_constant, damping_coefficient, max_air_pressure, 
       min_air_volume, max_air_volume, piston_area, unsprung_mass, 
       max_height, min_height)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run([
      params.name,
      params.spring_constant,
      params.damping_coefficient,
      params.max_air_pressure,
      params.min_air_volume,
      params.max_air_volume,
      params.piston_area,
      params.unsprung_mass,
      params.max_height,
      params.min_height
    ], function(err) {
      if (err) {
        reject(err);
        return;
      }
      getSuspensionParamById(this.lastID).then(resolve).catch(reject);
    });
    
    stmt.finalize();
  });
}

function updateSuspensionParam(id, params) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      UPDATE suspension_params 
      SET name = ?, spring_constant = ?, damping_coefficient = ?, 
          max_air_pressure = ?, min_air_volume = ?, max_air_volume = ?,
          piston_area = ?, unsprung_mass = ?, max_height = ?, min_height = ?
      WHERE id = ?
    `);
    
    stmt.run([
      params.name,
      params.spring_constant,
      params.damping_coefficient,
      params.max_air_pressure,
      params.min_air_volume,
      params.max_air_volume,
      params.piston_area,
      params.unsprung_mass,
      params.max_height,
      params.min_height,
      id
    ], function(err) {
      if (err) {
        reject(err);
        return;
      }
      if (this.changes > 0) {
        getSuspensionParamById(id).then(param => {
          if (id === 1) {
            dynamics = new SuspensionDynamics(param);
          }
          resolve(param);
        }).catch(reject);
      } else {
        resolve(null);
      }
    });
    
    stmt.finalize();
  });
}

function deleteSuspensionParam(id) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM suspension_params WHERE id = ?', [id], function(err) {
      if (err) reject(err);
      else resolve({ changes: this.changes });
    });
  });
}

function getHeightSnapshots(limit = 100) {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM height_snapshots ORDER BY created_at DESC LIMIT ?', [limit], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function createHeightSnapshot(snapshot) {
  return new Promise((resolve, reject) => {
    const dyn = getDynamics(snapshot.config);
    const state = snapshot.state || dyn.calculateEquilibriumState({
      inflation: snapshot.inflation_level,
      payload: snapshot.payload,
      temperature: snapshot.temperature
    });

    const stmt = db.prepare(`
      INSERT INTO height_snapshots 
      (front_left_height, front_right_height, rear_left_height, rear_right_height,
       front_left_pressure, front_right_pressure, rear_left_pressure, rear_right_pressure,
       payload, vehicle_speed, temperature, inflation_level, stiffness,
       leveling_time, response_speed, overshoot, settling_time,
       nonlinear_factor, compression_ratio, natural_frequency, damping_ratio,
       air_mass, air_density)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run([
      snapshot.front_left_height || state.height,
      snapshot.front_right_height || state.height,
      snapshot.rear_left_height || state.height,
      snapshot.rear_right_height || state.height,
      snapshot.front_left_pressure || state.pressure,
      snapshot.front_right_pressure || state.pressure,
      snapshot.rear_left_pressure || state.pressure,
      snapshot.rear_right_pressure || state.pressure,
      snapshot.payload,
      snapshot.vehicle_speed || 0,
      snapshot.temperature || state.temperature,
      snapshot.inflation_level,
      snapshot.stiffness || state.stiffness,
      snapshot.leveling_time || null,
      snapshot.response_speed || null,
      snapshot.overshoot || null,
      snapshot.settling_time || null,
      snapshot.nonlinear_factor || state.nonlinearFactor,
      snapshot.compression_ratio || state.compressionRatio,
      snapshot.natural_frequency || state.naturalFrequency,
      snapshot.damping_ratio || state.dampingRatio,
      snapshot.air_mass || state.airMass,
      snapshot.air_density || state.airDensity
    ], function(err) {
      if (err) {
        reject(err);
        return;
      }
      db.get('SELECT * FROM height_snapshots WHERE id = ?', [this.lastID], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    stmt.finalize();
  });
}

function calculateSuspensionState(params) {
  const dyn = getDynamics(params.config);
  return dyn.calculateEquilibriumState(params.input);
}

function calculateAirProperties(params) {
  const dyn = getDynamics(params.config);
  return dyn.calculateAirProperties(params.inflation, params.temperature);
}

function calculateLevelingPerformance(params) {
  const dyn = getDynamics(params.config);
  return dyn.calculateLevelingPerformance(
    params.initialHeight,
    params.targetHeight,
    params.inflationStart,
    params.inflationEnd,
    params.payload,
    params.temperature,
    params.dt
  );
}

function calculateRequiredInflation(params) {
  const dyn = getDynamics(params.config);
  return dyn.calculateRequiredInflation(
    params.targetHeight,
    params.payload,
    params.temperature
  );
}

function saveLevelingPerformance(performance, params) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT INTO leveling_performance
      (initial_height, target_height, payload, temperature,
       initial_inflation, final_inflation,
       leveling_time, settling_time, response_time, response_speed,
       overshoot, peak_height, final_height, total_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run([
      params.initialHeight,
      params.targetHeight,
      params.payload,
      params.temperature,
      params.inflationStart,
      params.inflationEnd,
      performance.levelingTime,
      performance.settlingTime,
      performance.responseTime,
      performance.responseSpeed,
      performance.overshoot,
      performance.peakHeight,
      performance.finalHeight,
      performance.totalTime
    ], function(err) {
      if (err) {
        reject(err);
        return;
      }
      db.get('SELECT * FROM leveling_performance WHERE id = ?', [this.lastID], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    stmt.finalize();
  });
}

function getLevelingPerformance(limit = 50) {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM leveling_performance ORDER BY created_at DESC LIMIT ?', [limit], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function getStateEquation(type = 'all') {
  return getDynamics().getStateEquation(type);
}

function runDiagnosis(params) {
  const diag = getDiagnostics(params.config);
  return diag.fullDiagnosis(params.state, params.targetHeight);
}

function addFaultLog(issue, stateSnapshot) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT INTO fault_logs
      (code, type, severity, message, recommendation,
       height, pressure, temperature, stiffness)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run([
      issue.code,
      issue.type || 'error',
      issue.severity,
      issue.message,
      issue.recommendation,
      stateSnapshot?.height,
      stateSnapshot?.pressure,
      stateSnapshot?.temperature,
      stateSnapshot?.stiffness
    ], function(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, ...issue });
    });
    stmt.finalize();
  });
}

function addWarningLog(warning, stateSnapshot) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT INTO warning_logs
      (code, severity, message, recommendation,
       height, pressure, temperature, stiffness)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run([
      warning.code,
      warning.severity,
      warning.message,
      warning.recommendation,
      stateSnapshot?.height,
      stateSnapshot?.pressure,
      stateSnapshot?.temperature,
      stateSnapshot?.stiffness
    ], function(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, ...warning });
    });
    stmt.finalize();
  });
}

function getFaultLogs(limit = 50, includeAcknowledged = false) {
  return new Promise((resolve, reject) => {
    const query = includeAcknowledged
      ? 'SELECT * FROM fault_logs ORDER BY created_at DESC LIMIT ?'
      : 'SELECT * FROM fault_logs WHERE acknowledged = 0 ORDER BY created_at DESC LIMIT ?';
    db.all(query, [limit], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function getWarningLogs(limit = 50, includeAcknowledged = false) {
  return new Promise((resolve, reject) => {
    const query = includeAcknowledged
      ? 'SELECT * FROM warning_logs ORDER BY created_at DESC LIMIT ?'
      : 'SELECT * FROM warning_logs WHERE acknowledged = 0 ORDER BY created_at DESC LIMIT ?';
    db.all(query, [limit], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function acknowledgeFault(id) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE fault_logs SET acknowledged = 1 WHERE id = ?', [id], function(err) {
      if (err) reject(err);
      else resolve({ changed: this.changes });
    });
  });
}

function acknowledgeWarning(id) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE warning_logs SET acknowledged = 1 WHERE id = ?', [id], function(err) {
      if (err) reject(err);
      else resolve({ changed: this.changes });
    });
  });
}

function addHeightHistory(record) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT INTO height_history
      (height, target_height, pressure, temperature, inflation, payload)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run([
      record.height,
      record.target_height,
      record.pressure,
      record.temperature,
      record.inflation,
      record.payload
    ], function(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, ...record });
    });
    stmt.finalize();
  });
}

function getHeightHistory(limit = 100) {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM height_history ORDER BY created_at DESC LIMIT ?', [limit], (err, rows) => {
      if (err) reject(err);
      else resolve(rows.reverse());
    });
  });
}

function getMaintenanceTips(status) {
  return getDiagnostics().getMaintenanceTips(status);
}

module.exports = {
  initDatabase,
  getSuspensionParams,
  getSuspensionParamById,
  createSuspensionParam,
  updateSuspensionParam,
  deleteSuspensionParam,
  getHeightSnapshots,
  createHeightSnapshot,
  calculateSuspensionState,
  calculateAirProperties,
  calculateLevelingPerformance,
  calculateRequiredInflation,
  saveLevelingPerformance,
  getLevelingPerformance,
  getStateEquation,
  getDynamics,
  getDiagnostics,
  runDiagnosis,
  addFaultLog,
  addWarningLog,
  getFaultLogs,
  getWarningLogs,
  acknowledgeFault,
  acknowledgeWarning,
  addHeightHistory,
  getHeightHistory,
  getMaintenanceTips
};

const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = 3002;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/params', async (req, res) => {
  try {
    const params = await db.getSuspensionParams();
    res.json(params);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/params/:id', async (req, res) => {
  try {
    const param = await db.getSuspensionParamById(req.params.id);
    if (param) {
      res.json(param);
    } else {
      res.status(404).json({ error: 'Parameter set not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/params', async (req, res) => {
  try {
    const newParam = await db.createSuspensionParam(req.body);
    res.status(201).json(newParam);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/params/:id', async (req, res) => {
  try {
    const updated = await db.updateSuspensionParam(req.params.id, req.body);
    if (updated) {
      res.json(updated);
    } else {
      res.status(404).json({ error: 'Parameter set not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/params/:id', async (req, res) => {
  try {
    const result = await db.deleteSuspensionParam(req.params.id);
    if (result.changes > 0) {
      res.json({ message: 'Deleted successfully' });
    } else {
      res.status(404).json({ error: 'Parameter set not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/snapshots', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const snapshots = await db.getHeightSnapshots(limit);
    res.json(snapshots);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/snapshots', async (req, res) => {
  try {
    const snapshot = await db.createHeightSnapshot(req.body);
    res.status(201).json(snapshot);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/calculate', (req, res) => {
  try {
    const result = db.calculateSuspensionState(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/calculate/air-properties', (req, res) => {
  try {
    const result = db.calculateAirProperties(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/calculate/leveling-performance', (req, res) => {
  try {
    const result = db.calculateLevelingPerformance(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/calculate/required-inflation', (req, res) => {
  try {
    const result = db.calculateRequiredInflation(req.body);
    res.json({ requiredInflation: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/leveling-performance', async (req, res) => {
  try {
    const performance = db.calculateLevelingPerformance(req.body);
    const saved = await db.saveLevelingPerformance(performance, req.body);
    res.status(201).json(saved);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/leveling-performance', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const records = await db.getLevelingPerformance(limit);
    res.json(records);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/state-equation', (req, res) => {
  try {
    const type = req.query.type || 'all';
    const equations = db.getStateEquation(type);
    res.json(equations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/diagnose', (req, res) => {
  try {
    const result = db.runDiagnosis(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/faults', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const includeAcknowledged = req.query.includeAcknowledged === 'true';
    const faults = await db.getFaultLogs(limit, includeAcknowledged);
    res.json(faults);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/faults/:id/acknowledge', async (req, res) => {
  try {
    const result = await db.acknowledgeFault(parseInt(req.params.id));
    if (result.changed > 0) {
      res.json({ message: '已确认' });
    } else {
      res.status(404).json({ error: '未找到该故障记录' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/warnings', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const includeAcknowledged = req.query.includeAcknowledged === 'true';
    const warnings = await db.getWarningLogs(limit, includeAcknowledged);
    res.json(warnings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/warnings/:id/acknowledge', async (req, res) => {
  try {
    const result = await db.acknowledgeWarning(parseInt(req.params.id));
    if (result.changed > 0) {
      res.json({ message: '已确认' });
    } else {
      res.status(404).json({ error: '未找到该预警记录' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/height-history', async (req, res) => {
  try {
    const result = await db.addHeightHistory(req.body);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/height-history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const history = await db.getHeightHistory(limit);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/maintenance-tips', (req, res) => {
  try {
    const status = req.query.status || 'normal';
    const tips = db.getMaintenanceTips(status);
    res.json(tips);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/simulate/step', (req, res) => {
  try {
    const dyn = db.getDynamics(req.body.config);
    const result = dyn.simulateStep(req.body.currentState, req.body.input, req.body.dt || 0.01);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

db.initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`空气悬架模拟器运行在 http://localhost:${PORT}`);
    console.log(`API 端点:`);
    console.log(`  POST /api/calculate`);
    console.log(`  POST /api/calculate/air-properties`);
    console.log(`  POST /api/calculate/leveling-performance`);
    console.log(`  POST /api/calculate/required-inflation`);
    console.log(`  POST /api/simulate/step`);
    console.log(`  GET  /api/state-equation`);
    console.log(`  GET/POST /api/leveling-performance`);
  });
}).catch(err => {
  console.error('数据库初始化失败:', err);
});

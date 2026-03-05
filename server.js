/* ==================================================
   server.js — WD Manutenções
   ================================================== */

const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const fs       = require('fs');
const database = require('./database');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ==================================================
   MIDDLEWARE
   ================================================== */
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  methods: ['GET','POST','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const PUBLIC_DIR  = path.join(__dirname, '..', 'public');
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

// Cria pasta uploads se não existir
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

app.use(express.static(PUBLIC_DIR));
app.use('/uploads', express.static(UPLOADS_DIR));

/* ==================================================
   HELPERS
   ================================================== */
function requireAdmin(adminId, res, onSuccess) {
  if (!adminId) {
    return res.status(401).json({ error: 'admin_id não informado' });
  }
  database.getUserById(adminId, (err, user) => {
    if (err)                    return res.status(500).json({ error: 'Erro interno' });
    if (!user)                  return res.status(403).json({ error: 'Usuário não encontrado' });
    if (user.role !== 'admin')  return res.status(403).json({ error: 'Acesso negado' });
    onSuccess(user);
  });
}

function sanitizeInput(str) {
  if (typeof str !== 'string') return str;
  return str.trim().slice(0, 500); // limite de tamanho
}

/* ==================================================
   ROTAS DE AUTENTICAÇÃO
   ================================================== */

// Cadastro
app.post('/api/register', (req, res) => {
  const name     = sanitizeInput(req.body.name);
  const email    = sanitizeInput(req.body.email);
  const password = req.body.password; // não sanitiza senha (pode ter chars especiais)

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres' });
  }
  // Validação básica de email
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Email inválido' });
  }

  database.registerUser(name, email, password, (err, user) => {
    if (err) {
      if (err.message?.includes('UNIQUE')) {
        return res.status(400).json({ error: 'Este email já está cadastrado' });
      }
      console.error('Register error:', err);
      return res.status(500).json({ error: 'Erro ao criar usuário' });
    }
    res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  });
});

// Login
app.post('/api/login', (req, res) => {
  const email    = sanitizeInput(req.body.email);
  const password = req.body.password;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios' });
  }

  database.verifyLogin(email, password, (err, user) => {
    if (err)   return res.status(500).json({ error: 'Erro interno' });
    if (!user) return res.status(401).json({ error: 'Email ou senha inválidos' });

    res.json({
      success: true,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  });
});

/* ==================================================
   ROTAS DE PONTO
   ================================================== */

// Registrar ponto
app.post('/api/record', (req, res) => {
  const { user_id, user_name, user_email, type, photo, latitude, longitude, address } = req.body;

  if (!user_id || !user_name || !type) {
    return res.status(400).json({ error: 'Dados incompletos (user_id, user_name, type)' });
  }

  const validTypes = ['entrada', 'saida_almoco', 'retorno_almoco', 'saida'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: 'Tipo inválido' });
  }

  const now          = new Date();
  let   photoFilename = null;

  // Salva foto se enviada
  if (photo && typeof photo === 'string' && photo.startsWith('data:image')) {
    try {
      const base64 = photo.replace(/^data:image\/\w+;base64,/, '');
      const buf    = Buffer.from(base64, 'base64');
      photoFilename = `photo-${Date.now()}-${user_id}.jpg`;
      fs.writeFileSync(path.join(UPLOADS_DIR, photoFilename), buf);
    } catch (e) {
      console.error('Erro ao salvar foto:', e.message);
    }
  }

  const record = {
    user_id:    Number(user_id),
    user_name:  sanitizeInput(user_name),
    user_email: sanitizeInput(user_email || ''),
    type,
    photo:      photoFilename,
    latitude:   latitude  ? parseFloat(latitude)  : null,
    longitude:  longitude ? parseFloat(longitude) : null,
    address:    sanitizeInput(address || ''),
    date:       now.toLocaleDateString('pt-BR'),
    time:       now.toLocaleTimeString('pt-BR'),
    timestamp:  now.getTime()
  };

  database.insertRecord(record, (err, result) => {
    if (err) {
      console.error('insertRecord error:', err);
      return res.status(500).json({ error: 'Erro ao registrar ponto' });
    }
    res.json({ success: true, id: result.lastID, data: record });
  });
});

// Listar todos os registros
app.get('/api/records', (req, res) => {
  database.getAllRecords((err, records) => {
    if (err) return res.status(500).json({ error: 'Erro ao buscar registros' });
    res.json({ records });
  });
});

// Registros por usuário
app.get('/api/records/user/:id', (req, res) => {
  const userId = parseInt(req.params.id);
  if (isNaN(userId)) return res.status(400).json({ error: 'ID inválido' });

  database.getRecordsByUserId(userId, (err, records) => {
    if (err) return res.status(500).json({ error: 'Erro ao buscar registros' });
    res.json({ records });
  });
});

// Estatísticas
app.get('/api/stats', (req, res) => {
  database.getStats((err, stats) => {
    if (err) return res.status(500).json({ error: 'Erro' });
    const users = [...new Set(stats.all_records.map(r => r.user_name))].sort();
    res.json({
      total_records:   stats.total_records,
      today_records:   stats.today_records,
      total_employees: stats.total_employees,
      users
    });
  });
});

/* ==================================================
   ROTAS ADMIN — USUÁRIOS
   ================================================== */

// Listar usuários (apenas admin)
app.get('/api/users', (req, res) => {
  const adminId = parseInt(req.query.admin_id);
  requireAdmin(adminId, res, () => {
    database.getAllUsers((err, users) => {
      if (err) return res.status(500).json({ error: 'Erro' });
      res.json({ users });
    });
  });
});

// Excluir usuário (apenas admin)
app.delete('/api/users/:id', (req, res) => {
  const { admin_id } = req.body;
  const targetId     = parseInt(req.params.id);

  if (isNaN(targetId)) return res.status(400).json({ error: 'ID inválido' });

  requireAdmin(admin_id, res, adminUser => {
    if (Number(adminUser.id) === targetId) {
      return res.status(400).json({ error: 'Não pode excluir sua própria conta' });
    }

    database.getUserById(targetId, (err, target) => {
      if (err)   return res.status(500).json({ error: 'Erro' });
      if (!target) return res.status(404).json({ error: 'Usuário não encontrado' });
      if (target.role === 'admin') return res.status(400).json({ error: 'Não pode excluir admin' });

      database.deleteUserAndRecords(targetId, (dErr, result) => {
        if (dErr) return res.status(500).json({ error: 'Erro ao excluir' });
        res.json({ success: true, deleted: result.deleted });
      });
    });
  });
});

// Limpar todos os registros (apenas admin)
app.delete('/api/records', (req, res) => {
  const { admin_id } = req.body;
  requireAdmin(admin_id, res, () => {
    database.clearAllRecords((err, result) => {
      if (err) return res.status(500).json({ error: 'Erro ao limpar' });
      res.json({ success: true, deleted: result.deleted });
    });
  });
});

/* ==================================================
   FALLBACK → SPA
   ================================================== */
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
    res.sendFile(path.join(PUBLIC_DIR, 'login.html'));
  } else {
    res.status(404).json({ error: 'Não encontrado' });
  }
});

/* ==================================================
   START
   ================================================== */
app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log('║   WD Manutenções — Sistema de Ponto  ║');
  console.log(`║   http://localhost:${PORT}              ║`);
  console.log('╚══════════════════════════════════════╝');
  console.log('');
});

module.exports = app;

/* ============================================================
   server.js — WD Manutenções v3 FINAL
   ============================================================ */
'use strict';

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const DB      = require('./database');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ─── middleware ─── */
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','OPTIONS'] }));
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

const PUBLIC = path.join(__dirname, '..', 'public');
app.use(express.static(PUBLIC));

/* ─── helpers ─── */
const sanitize = s => typeof s === 'string' ? s.trim().slice(0, 500) : s;

function requireAdmin(adminId, res, next) {
  if (!adminId) return res.status(401).json({ error: 'Não autenticado' });
  DB.getUserById(Number(adminId))
    .then(u => {
      if (!u || u.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
      next(u);
    })
    .catch(() => res.status(500).json({ error: 'Erro interno' }));
}

/* ============================================================
   AUTH
   ============================================================ */
app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: 'Preencha todos os campos' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Senha mínimo 6 caracteres' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: 'Email inválido' });

  try {
    const user = await DB.registerUser({ name: sanitize(name), email, password });
    res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (e) {
    if (e.message?.includes('UNIQUE'))
      return res.status(400).json({ error: 'Email já cadastrado' });
    console.error(e);
    res.status(500).json({ error: 'Erro ao cadastrar' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email e senha obrigatórios' });

  try {
    const user = await DB.verifyLogin(email, password);
    if (!user) return res.status(401).json({ error: 'Email ou senha inválidos' });
    res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno' });
  }
});

/* ============================================================
   REGISTROS DE PONTO
   ============================================================ */
app.post('/api/record', async (req, res) => {
  const { user_id, user_name, user_email, type, photo, latitude, longitude, address } = req.body;

  if (!user_id || !user_name || !type)
    return res.status(400).json({ error: 'Dados incompletos' });

  const valid = ['entrada','saida_almoco','retorno_almoco','saida'];
  if (!valid.includes(type))
    return res.status(400).json({ error: 'Tipo inválido' });

  const now = new Date();
  try {
    const result = await DB.insertRecord({
      user_id:    Number(user_id),
      user_name:  sanitize(user_name),
      user_email: sanitize(user_email || ''),
      type,
      photo_data: photo || null,   // guarda base64 direto no banco
      latitude:   latitude  ? parseFloat(latitude)  : null,
      longitude:  longitude ? parseFloat(longitude) : null,
      address:    sanitize(address || ''),
      date:       now.toLocaleDateString('pt-BR'),
      time:       now.toLocaleTimeString('pt-BR'),
      ts:         now.getTime(),
    });
    res.json({ success: true, id: result.id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao registrar ponto' });
  }
});

/* lista todos os registros (sem foto — leve) */
app.get('/api/records', async (req, res) => {
  try {
    const records = await DB.getAllRecords();
    res.json({ records });
  } catch (e) {
    res.status(500).json({ error: 'Erro' });
  }
});

/* registros de 1 usuário (sem foto) */
app.get('/api/records/user/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });
  try {
    const records = await DB.getRecordsByUser(id);
    res.json({ records });
  } catch (e) {
    res.status(500).json({ error: 'Erro' });
  }
});

/* 1 registro COM foto */
app.get('/api/record/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });
  try {
    const record = await DB.getRecordById(id);
    if (!record) return res.status(404).json({ error: 'Não encontrado' });
    res.json({ record });
  } catch (e) {
    res.status(500).json({ error: 'Erro' });
  }
});

/* editar 1 registro (admin) — corrige type / date / time */
app.put('/api/record/:id', async (req, res) => {
  const { admin_id, type, date, time } = req.body;
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

  const validTypes = ['entrada','saida_almoco','retorno_almoco','saida'];
  if (type && !validTypes.includes(type))
    return res.status(400).json({ error: 'Tipo inválido' });

  requireAdmin(admin_id, res, async () => {
    try {
      await DB.updateRecord(id, { type, date, time });
      res.json({ success: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Erro ao editar' });
    }
  });
});

/* excluir 1 registro (admin) */
app.delete('/api/record/:id', async (req, res) => {
  const { admin_id } = req.body;
  requireAdmin(admin_id, res, async () => {
    try {
      await DB.deleteRecord(parseInt(req.params.id));
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: 'Erro ao excluir' });
    }
  });
});

/* excluir TODOS os registros (admin) */
app.delete('/api/records', async (req, res) => {
  const { admin_id } = req.body;
  requireAdmin(admin_id, res, async () => {
    try {
      const r = await DB.clearAllRecords();
      res.json({ success: true, deleted: r.deleted });
    } catch (e) {
      res.status(500).json({ error: 'Erro ao limpar' });
    }
  });
});

/* estatísticas */
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await DB.getStats();
    res.json(stats);
  } catch (e) {
    res.status(500).json({ error: 'Erro' });
  }
});

/* ============================================================
   USUÁRIOS (admin)
   ============================================================ */
app.get('/api/users', async (req, res) => {
  requireAdmin(req.query.admin_id, res, async () => {
    try {
      const users = await DB.getAllUsers();
      res.json({ users });
    } catch (e) {
      res.status(500).json({ error: 'Erro' });
    }
  });
});

app.delete('/api/users/:id', async (req, res) => {
  const { admin_id } = req.body;
  const targetId = parseInt(req.params.id);
  if (isNaN(targetId)) return res.status(400).json({ error: 'ID inválido' });

  requireAdmin(admin_id, res, async admin => {
    if (admin.id === targetId)
      return res.status(400).json({ error: 'Não pode excluir a própria conta' });
    try {
      await DB.deactivateUser(targetId);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: 'Erro ao excluir' });
    }
  });
});

/* ─── SPA fallback ─── */
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api'))
    res.sendFile(path.join(PUBLIC, 'login.html'));
  else
    res.status(404).json({ error: 'Rota não encontrada' });
});

/* ─── START ─── */
DB.init(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🟡 WD Manutenções rodando em http://localhost:${PORT}\n`);
  });
});

module.exports = app;
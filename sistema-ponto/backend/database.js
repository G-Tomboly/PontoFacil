const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

// Cria/conecta ao banco de dados
const db = new sqlite3.Database('./timecard.db', (err) => {
    if (err) {
        console.error('Erro ao conectar ao banco:', err);
    } else {
        console.log('✓ Conectado ao banco de dados SQLite');
        initDatabase();
    }
});

// Inicializa as tabelas
function initDatabase() {
    // Tabela de usuários
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'employee',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) {
            console.error('Erro ao criar tabela users:', err);
        } else {
            createDefaultAdmin();
        }
    });

    // Tabela de registros de ponto
    db.run(`
        CREATE TABLE IF NOT EXISTS records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            user_name TEXT NOT NULL,
            user_email TEXT NOT NULL,
            type TEXT NOT NULL,
            photo TEXT,
            latitude REAL,
            longitude REAL,
            address TEXT,
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `, (err) => {
        if (err) {
            console.error('Erro ao criar tabela records:', err);
        } else {
            console.log('✓ Tabelas criadas/verificadas com sucesso');
        }
    });
}

// Cria admin padrão
function createDefaultAdmin() {
    const adminEmail = 'admin@wdmanutencoes.com';
    const adminPassword = 'admin123';
    
    db.get('SELECT * FROM users WHERE email = ?', [adminEmail], (err, row) => {
        if (!row) {
            const hashedPassword = bcrypt.hashSync(adminPassword, 10);
            db.run(
                'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
                ['Administrador', adminEmail, hashedPassword, 'admin'],
                (err) => {
                    if (!err) {
                        console.log('');
                        console.log('✓ Usuário admin criado');
                        console.log('  Email: admin@wdmanutencoes.com');
                        console.log('  Senha: admin123');
                        console.log('  ⚠️  MUDE A SENHA EM PRODUÇÃO!');
                        console.log('');
                    }
                }
            );
        }
    });
}

// Funções auxiliares
const database = {
    // Registra novo usuário
    registerUser: (name, email, password, callback) => {
        const hashedPassword = bcrypt.hashSync(password, 10);
        db.run(
            'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
            [name, email, hashedPassword, 'employee'],
            function(err) {
                if (err) {
                    callback(err, null);
                } else {
                    callback(null, { id: this.lastID, name, email, role: 'employee' });
                }
            }
        );
    },

    // Verifica login
    verifyLogin: (email, password, callback) => {
        db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
            if (err) {
                callback(err, null);
            } else if (!user) {
                callback(null, null);
            } else {
                const isValid = bcrypt.compareSync(password, user.password);
                callback(null, isValid ? user : null);
            }
        });
    },

    // Busca usuário por ID
    getUserById: (id, callback) => {
        db.get('SELECT id, name, email, role FROM users WHERE id = ?', [id], callback);
    },

    // Insere registro de ponto
    insertRecord: (data, callback) => {
        console.log('Inserindo registro no banco:', data);
        
        const sql = `
            INSERT INTO records (user_id, user_name, user_email, type, photo, latitude, longitude, address, date, time, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const params = [
            data.user_id,
            data.user_name,
            data.user_email || '',
            data.type,
            data.photo || null,
            data.latitude || null,
            data.longitude || null,
            data.address || null,
            data.date,
            data.time,
            data.timestamp
        ];
        
        console.log('Parâmetros SQL:', params);
        
        db.run(sql, params, function(err) {
            if (err) {
                console.error('Erro ao inserir no banco:', err);
                callback(err);
            } else {
                console.log('Registro inserido com sucesso! ID:', this.lastID);
                callback(null, { lastID: this.lastID });
            }
        });
    },

    // Busca todos os registros
    getAllRecords: (callback) => {
        db.all('SELECT * FROM records ORDER BY timestamp DESC', [], callback);
    },

    // Busca registros por data
    getRecordsByDate: (date, callback) => {
        db.all('SELECT * FROM records WHERE date = ? ORDER BY timestamp DESC', [date], callback);
    },

    // Busca registros por usuário ID
    getRecordsByUserId: (userId, callback) => {
        db.all('SELECT * FROM records WHERE user_id = ? ORDER BY timestamp DESC', [userId], callback);
    },

    // Busca registros por período
    getRecordsByPeriod: (startDate, endDate, callback) => {
        db.all(
            'SELECT * FROM records WHERE date BETWEEN ? AND ? ORDER BY timestamp DESC',
            [startDate, endDate],
            callback
        );
    },

    // Estatísticas
    getStats: (callback) => {
        db.all('SELECT * FROM records ORDER BY timestamp DESC', [], (err, records) => {
            if (err) {
                callback(err, null);
                return;
            }

            const today = new Date().toLocaleDateString('pt-BR');
            const todayRecords = records.filter(r => r.date === today);
            
            db.all('SELECT COUNT(*) as count FROM users WHERE role = "employee"', [], (err, result) => {
                const employeeCount = result && result[0] ? result[0].count : 0;
                
                callback(null, {
                    total_records: records.length,
                    today_records: todayRecords.length,
                    total_employees: employeeCount,
                    all_records: records
                });
            });
        });
    }
};

module.exports = database;
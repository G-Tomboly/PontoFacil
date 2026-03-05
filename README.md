# WD Manutenções — Sistema de Ponto v2.0

## Estrutura do Projeto

```
wd-sistema/
├── public/                  ← Frontend (servido pelo Express)
│   ├── assets/logo.svg
│   ├── css/style.css
│   ├── js/
│   │   ├── pwa.js
│   │   ├── login.js
│   │   ├── app.js
│   │   └── admin.js
│   ├── login.html
│   ├── index.html
│   ├── admin.html
│   ├── service-worker.js
│   └── manifest.webmanifest
├── server/
│   ├── server.js            ← Entry point
│   └── database.js
├── uploads/                 ← Fotos (criado automaticamente)
├── package.json
├── render.yaml
└── .gitignore
```

## Rodar Localmente

```bash
npm install
npm start
# Acesse: http://localhost:3000
```

## Deploy no Render.com

### Passo a Passo Completo

1. **Crie uma conta** em https://render.com (gratuito)

2. **Suba o código no GitHub**
   ```bash
   git init
   git add .
   git commit -m "WD Manutenções v2.0"
   # Crie um repositório no GitHub e faça push:
   git remote add origin https://github.com/seu-usuario/wd-manutencoes.git
   git push -u origin main
   ```

3. **No painel do Render**, clique em **"New +"** → **"Web Service"**

4. **Conecte seu repositório GitHub**

5. **Configure o serviço:**
   - **Name:** wd-manutencoes-ponto
   - **Region:** Ohio (US East) ou São Paulo se disponível
   - **Branch:** main
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free

6. **Variáveis de Ambiente** (clique em "Advanced" → "Add Environment Variable"):
   ```
   NODE_ENV         = production
   ADMIN_EMAIL      = admin@wdmanutencoes.com   (ou seu email)
   ADMIN_PASSWORD   = SuaSenhaForte@2026        (MUDE ISSO!)
   DB_PATH          = /opt/render/project/src/timecard.db
   ```

7. Clique em **"Create Web Service"**

8. Aguarde o deploy (~2 minutos). Seu app estará em:
   `https://wd-manutencoes-ponto.onrender.com`

### Notas Importantes sobre o Render (Plano Gratuito)

- O servidor **hiberna após 15 minutos** sem uso. A primeira requisição após hibernação
  pode demorar ~30 segundos. Isso é normal no plano gratuito.
- O banco SQLite é **persistente** no Render (não apaga entre deploys se usar DB_PATH correto).
- Para evitar hibernação, use o **Render Cron** ou um serviço como UptimeRobot para fazer
  ping a cada 10 minutos em `/api/stats`.
- O plano gratuito tem **750 horas/mês** — suficiente para uso contínuo.

### Para Produção Séria

Use o plano **Starter ($7/mês)** que não hiberna, ou migre para PostgreSQL (gratuito no Render)
substituindo o SQLite.

## Credenciais Padrão

- **Admin:** admin@wdmanutencoes.com / admin123
- ⚠️ **MUDE A SENHA** antes de colocar em produção via variável `ADMIN_PASSWORD`

## Funcionalidades

- ✅ Login/Cadastro de colaboradores
- ✅ Registro de ponto com foto (câmera)
- ✅ Geolocalização com endereço
- ✅ Modo offline completo (Service Worker + IndexedDB + localStorage)
- ✅ Sincronização automática ao reconectar
- ✅ Painel admin com Dashboard, Colaboradores, Registros, Relatórios
- ✅ Espelho de Ponto mensal (CLT) com adicionais de Sábado (+50%) e Domingo/Feriado (+100%)
- ✅ Exportação CSV
- ✅ Modal de confirmação customizado (sem window.confirm feio)
- ✅ Feriados nacionais 2025-2027 pré-configurados
- ✅ Proteção XSS em toda manipulação de DOM
- ✅ PWA instalável (Add to Home Screen)
- ✅ Design responsivo mobile-first

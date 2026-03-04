# Offline + acesso de conta e administração

## Logo
Conforme solicitado, a logo voltou para o comportamento da versão inicial (sem ícone customizado com fundo preto).

## O que funciona offline agora

### 1) Acesso à conta offline
- Após um login online válido, o app salva dados locais do usuário.
- Sem internet, é possível entrar na conta com credenciais previamente salvas no dispositivo.
- O `app.js` também recupera sessão por `localStorage` para manter acesso após recarga.

### 2) Registro de ponto offline
- Sem internet, os registros são salvos em fila local.
- Ao voltar a conexão, sincronizam automaticamente com a API.

### 3) Consulta offline básica
- O Service Worker mantém cache do app shell e de GETs principais (`/api/stats` e `/api/records...`) com fallback em cache.

## Administração adicionada

### Limpar todos os registros
- O painel admin agora tem ação para remover todos os registros de ponto.

### Gerenciar contas
- Na aba de colaboradores, o admin pode excluir contas de funcionários (com remoção dos registros da conta).

## Validação recomendada
1. Fazer login online.
2. Desligar internet.
3. Entrar novamente na conta.
4. Registrar ponto offline.
5. Reativar internet e verificar sincronização.
6. No admin, testar limpar registros e excluir uma conta de colaborador.

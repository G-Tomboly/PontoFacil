# Logo do app com fundo preto + funcionamento offline

## 1) Logo instalada no celular/Desktop (PWA)

Foi adicionado um ícone específico do app:
- `sistema-ponto/backend/public/assets/app-icon.svg`

Esse arquivo coloca:
- **fundo preto** (`#000`),
- sua **logo branca por cima**.

O manifesto do PWA já aponta para esse ícone, então ao instalar o app ele usa essa versão com contraste melhor.

> Se o app já estava instalado, desinstale e instale novamente para atualizar o ícone.

---

## 2) O que agora funciona offline (passo a passo)

### 2.1 App shell offline (telas e arquivos)
O Service Worker cacheia os arquivos principais:
- `login.html`, `index.html`, `admin.html`, CSS e JS.

Assim o app abre mesmo sem internet (depois da primeira visita online).

### 2.2 Dados GET offline
Também foi adicionado cache de chamadas GET da API:
- `/api/stats`
- `/api/records...`

Estratégia: tenta rede primeiro; se falhar, devolve cache.

### 2.3 Registro de ponto offline (POST)
Quando não há internet:
1. o registro é salvo em fila local (`localStorage`),
2. aparece como pendente,
3. ao voltar conexão, sincroniza automaticamente.

### 2.4 Login offline
No primeiro login online válido, o app salva credenciais offline deste dispositivo.
Depois, sem internet, se email/senha baterem com o cache local, o login entra em modo offline.

---

## 3) Limite real de “100% offline”

Sem backend online não existe sincronização global instantânea entre dispositivos.
O que está implementado é o máximo prático para esse projeto sem reescrever arquitetura:
- usar local no dispositivo enquanto offline,
- sincronizar quando voltar internet.

---

## 4) Como validar rápido

1. Abra online e faça login.
2. Registre um ponto online.
3. Desligue internet (modo avião / devtools offline).
4. Faça novo registro (deve salvar pendente).
5. Ligue internet novamente.
6. Aguarde sincronizar automático.


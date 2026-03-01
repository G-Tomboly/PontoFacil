# Como subir no VS Code, jogar para `main` e colocar no ar no Render

## 1) Abrir e rodar no VS Code

No terminal (na raiz do repo):

```bash
cd sistema-ponto/backend
npm install
npm start
```

Abra no navegador:
- `http://localhost:3000/login.html`

---

## 2) Enviar sua branch para o GitHub

Ainda no terminal da raiz do repositório:

```bash
git status
git add .
git commit -m "seu commit"
git push origin work
```

> Troque `work` pelo nome real da sua branch, se for outro.

---

## 3) Jogar para a `main`

Você pode fazer de 2 jeitos.

### Jeito A (recomendado): Pull Request
1. Vá no GitHub do projeto.
2. Abra PR de `work` -> `main`.
3. Revise e clique em **Merge**.

### Jeito B (terminal)

```bash
git checkout main
git pull origin main
git merge work
git push origin main
```

---

## 4) Deploy no Render

1. Entre no Render e clique em **New +** -> **Web Service**.
2. Conecte o repo do GitHub.
3. Configure:
   - **Root Directory**: `sistema-ponto/backend`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: `Node`
4. Salve e faça deploy.

Se já existe serviço criado:
- Garanta que ele aponta para branch `main`.
- Clique em **Manual Deploy** -> **Deploy latest commit**.

---

## 5) Ajustes importantes no Render

- A porta já está correta no código (`process.env.PORT || 3000`).
- Não precisa expor `localhost` no front.
- Para atualizar: sempre faça push na `main` (ou branch configurada no serviço).

---

## 6) PWA (instalar como app)

Com HTTPS do Render, o navegador já permite instalar:
- Chrome/Edge: botão de instalar na barra de endereço.
- Android: menu -> **Instalar app**.
- Desktop: ícone de instalação na URL.


# Logo nova e funcionamento offline (passo a passo)

## 1) Como trocar sua logo

Hoje o sistema usa:
- `sistema-ponto/backend/public/assets/logo.svg`

### Opção A (mais simples)
1. Crie a nova imagem com fundo (PNG recomendado, ex.: `logo.png`).
2. Salve em: `sistema-ponto/backend/public/assets/logo.png`.
3. Troque as referências `logo.svg` para `logo.png` nos HTMLs e no `manifest.webmanifest`.

### Opção B (manter SVG)
- Se quiser manter SVG, abra o arquivo e adicione um fundo no próprio desenho.

## 2) O que já foi feito para ajudar visualmente a logo branca

Mesmo com logo transparente, foi aplicado:
- fundo em gradiente atrás da logo,
- borda suave,
- espaçamento interno,
- `object-fit: contain`.

Assim a logo branca aparece melhor no tema escuro.

## 3) Offline de verdade: como está funcionando

Implementado no app do funcionário (`public/js/app.js`):
- Se estiver sem internet, o registro de ponto é salvo localmente em fila (`localStorage`).
- Quando a internet volta, os registros pendentes são sincronizados automaticamente com a API.
- A tela de “Meus registros de hoje” mostra também os itens pendentes de sincronização.
- Registros já buscados online ficam em cache local para visualização offline.

## 4) Limitação importante

- Login/cadastro novo ainda dependem do servidor.
- O modo offline cobre principalmente: **registrar ponto** e **ver registros já carregados/cacheados**.

## 5) Como evoluir para offline avançado (opcional)

Para ficar ainda mais robusto:
- migrar fila de `localStorage` para `IndexedDB` (suporta volume maior),
- usar `Background Sync` quando disponível,
- criptografar dados sensíveis salvos offline.

# VideoGrab — extensão Chrome + backend na nuvem

Baixador de vídeos/áudio (YouTube, Instagram, TikTok e +1000 sites via `yt-dlp`).
A extensão do Chrome faz tudo pelo **popup**, processando no **servidor na nuvem** —
**não precisa rodar nada local**.

## Arquitetura

```
Extensão Chrome (popup)  ──HTTPS──►  Backend FastAPI na nuvem (Docker + FFmpeg)
   escolhe qualidade                  baixa com yt-dlp, converte/recorta,
   mostra progresso                   serve o arquivo uma vez e apaga
```

- `extension/` — extensão MV3 (popup completo de download).
- `app.py` — API FastAPI (modo nuvem ativado por `CLOUD_MODE=true`).
- `Dockerfile` / `render.yaml` — deploy.

---

## 1. Subir o backend na nuvem (grátis)

### Opção A — Render (recomendado, via `render.yaml`)

1. Suba este projeto para um repositório no **GitHub**.
2. No [Render](https://render.com) → **New +** → **Blueprint** → conecte o repo.
3. O Render lê o `render.yaml` e cria o serviço Docker sozinho.
4. Aguarde o build e copie a URL gerada, ex.: `https://videograb-xxxx.onrender.com`.

### Opção B — Railway

1. Suba o repo no GitHub.
2. No [Railway](https://railway.app) → **New Project** → **Deploy from GitHub repo**.
3. O Railway detecta o `Dockerfile` automaticamente e injeta `$PORT`.
4. Em **Variables**, adicione `CLOUD_MODE=true`.
5. Gere um domínio público em **Settings → Networking** e copie a URL.

> ⚠️ No plano gratuito o serviço hiberna após inatividade e leva ~30–50s para
> acordar na primeira requisição (cold start). É normal.

---

## 2. Apontar a extensão para a sua URL

Edite **dois** arquivos com a URL do passo anterior (sem barra no final):

1. `extension/config.js`:
   ```js
   const VIDEOGRAB_SERVER = "https://videograb-xxxx.onrender.com";
   ```
2. `extension/manifest.json` → `host_permissions`:
   ```json
   "host_permissions": ["https://videograb-xxxx.onrender.com/*"]
   ```

---

## 3. Instalar a extensão

1. Chrome → `chrome://extensions`
2. Ative o **Modo do desenvolvedor** (canto superior direito).
3. **Carregar sem compactação** → selecione a pasta `extension/`.
4. Abra um vídeo, clique no ícone do VideoGrab (ou botão direito → *Baixar com VideoGrab*),
   escolha a qualidade e baixe.

---

## Uso

- **Popup**: clique no ícone — ele já detecta a URL da aba ativa, busca as
  qualidades e baixa pelo `chrome.downloads`.
- **Menu de contexto**: botão direito numa página/link → *Baixar com VideoGrab*.
- **Recorte**: o link “✂️ Recortar trecho” abre o editor web completo na nuvem.

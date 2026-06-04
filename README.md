# VideoGrab — baixador de vídeos (extensão Chrome + servidor local)

Baixe vídeos e áudio do **YouTube, Instagram, TikTok e +1000 sites** (via `yt-dlp`),
direto pelo popup de uma extensão do Chrome. O processamento roda num pequeno
**servidor local** no seu PC — assim o YouTube funciona em **resolução máxima** (até 4K)
sem precisar de login nem de servidor na nuvem.

```
Extensão Chrome (popup)  ──►  Servidor local (FastAPI + yt-dlp + FFmpeg)
  escolhe a qualidade          baixa, junta video+audio e entrega o arquivo
```

---

## 🚀 Instalação rápida (Windows) — 3 passos

### 1. Baixe o projeto
- Acesse **https://github.com/Galipe/VideoGrab**
- Botão verde **`Code` → `Download ZIP`** e extraia onde quiser (ex.: `C:\VideoGrab`).

### 2. Rode o instalador
- Dê **duplo-clique em `INSTALAR.bat`**.

  Ele faz **tudo sozinho**: instala o Python (se faltar), o FFmpeg, as dependências,
  pergunta se quer iniciar junto com o Windows, sobe o servidor e já abre o Chrome
  na página de extensões.

  > Se for a primeira vez instalando o Python, o instalador vai pedir para você
  > **fechar e rodar o `INSTALAR.bat` de novo** — é normal, só rodar uma segunda vez.

### 3. Carregue a extensão no Chrome (1 vez só)
Na aba `chrome://extensions` que abriu sozinha:
1. Ative o **"Modo do desenvolvedor"** (canto superior direito).
2. Clique em **"Carregar sem compactação"**.
3. Selecione a pasta **`extension`** (a que abriu no Explorer).

**Pronto!** Abra um vídeo, clique no ícone do VideoGrab, escolha a qualidade e baixe.

---

## Como usar no dia a dia

- **Popup**: clique no ícone do VideoGrab — ele detecta a URL da aba, busca as
  qualidades e baixa pelo Chrome.
- **Menu de contexto**: botão direito numa página/link → *Baixar com VideoGrab*.
- O servidor fica rodando **oculto** em segundo plano (se você ativou a
  inicialização automática). Não aparece janela nenhuma.

---

## Arquivos úteis

| Arquivo | Para que serve |
|---|---|
| `INSTALAR.bat` | Instalador automático (use este na primeira vez). |
| `start.bat` | Inicia o servidor mostrando uma janela (bom para ver erros). |
| `start_hidden.vbs` | Inicia o servidor **oculto** (sem janela). |
| `stop.bat` | Para o servidor oculto. |
| `instalar_autostart.ps1` | (Re)configura o início automático com o Windows. |
| `remover_autostart.ps1` | Remove o início automático. |

---

## Perguntas frequentes

**Só aparece 360p para baixar.**
Instale o **FFmpeg** (o `INSTALAR.bat` faz isso). As resoluções acima de 720p no
YouTube vêm com vídeo e áudio separados e precisam do FFmpeg para serem unidas.

**A extensão diz que não conseguiu conectar.**
O servidor precisa estar rodando. Rode o `start.bat` (ou reinicie o PC, se você
ativou o início automático).

**Posso usar em outro PC?**
Sim — basta repetir os 3 passos acima nesse outro PC.

---

## Para desenvolvedores (deploy na nuvem — opcional)

O projeto também roda na nuvem (Docker). `app.py` ativa o modo nuvem com
`CLOUD_MODE=true`; há `Dockerfile` e `render.yaml` prontos. Observação: em IP de
datacenter o YouTube costuma exigir login/cookies (`YTDLP_COOKIES`), por isso o
**uso local é o recomendado**.

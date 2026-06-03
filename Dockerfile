FROM python:3.11-slim

# Instala dependências do sistema (FFmpeg para recortar/converter e Curl para status checks)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Define o diretório de trabalho
WORKDIR /app

# Copia as dependências do Python e as instala
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia os arquivos do código do app e do frontend
COPY app.py .
COPY frontend/ ./frontend/

# Cria a pasta de downloads e define permissões abertas para o container
RUN mkdir -p downloads && chmod 777 downloads

# Configura variáveis de ambiente padrões da nuvem
ENV CLOUD_MODE=true
ENV PORT=7878

# Expõe a porta padrão
EXPOSE 7878

# Inicia o app usando o Uvicorn.
# Usa shell form para que $PORT (injetado por Render/Railway) seja expandido;
# cai para 7878 quando rodando localmente via Docker.
CMD uvicorn app:app --host 0.0.0.0 --port ${PORT:-7878}

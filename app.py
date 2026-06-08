import asyncio
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
import urllib.error
import urllib.parse
import uuid
import webbrowser

# Sob pythonw (modo oculto) sys.stdout/sys.stderr são None — qualquer print()
# quebraria. Redireciona para devnull para que todo o código possa imprimir à vontade.
if sys.stdout is None:
    sys.stdout = open(os.devnull, "w", encoding="utf-8")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w", encoding="utf-8")

# Fix Unicode output on Windows.
for _stream in (sys.stdout, sys.stderr):
    if getattr(_stream, "encoding", None) != "utf-8":
        try:
            _stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass

from pathlib import Path
from typing import Optional

import uvicorn
import yt_dlp
from fastapi import FastAPI, HTTPException, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI(title="VideoGrab API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── State ──────────────────────────────────────────────────────────────────────
downloads: dict[str, dict] = {}  # id -> {status, progress, speed, eta, filename}
IS_LOCAL = os.environ.get("CLOUD_MODE") != "true"
if IS_LOCAL:
    DEFAULT_DOWNLOAD_DIR = str(Path.home() / "Downloads" / "VideoGrab")
else:
    DEFAULT_DOWNLOAD_DIR = os.path.join(os.getcwd(), "downloads")
os.makedirs(DEFAULT_DOWNLOAD_DIR, exist_ok=True)

def _cleanup_old_files_thread():
    while True:
        try:
            now = time.time()
            if os.path.exists(DEFAULT_DOWNLOAD_DIR):
                for filename in os.listdir(DEFAULT_DOWNLOAD_DIR):
                    filepath = os.path.join(DEFAULT_DOWNLOAD_DIR, filename)
                    if os.path.isfile(filepath) and os.path.getmtime(filepath) < now - 1800:
                        try:
                            os.remove(filepath)
                        except Exception:
                            pass
        except Exception as e:
            print("Erro na limpeza de arquivos:", e)
        time.sleep(300)

if not IS_LOCAL:
    threading.Thread(target=_cleanup_old_files_thread, daemon=True).start()

# Preview URL cache: video_url -> (direct_cdn_url, expiry_timestamp)
_preview_cache: dict[str, tuple[str, float]] = {}

# ── FFmpeg detection ───────────────────────────────────────────────────────────
def _find_ffmpeg() -> Optional[str]:
    """Return path to ffmpeg bin directory, or None if not found."""
    found = shutil.which("ffmpeg")
    if found:
        return str(Path(found).parent)
    winget_base = (
        Path.home()
        / "AppData" / "Local" / "Microsoft" / "WinGet" / "Packages"
        / "Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe"
    )
    if winget_base.exists():
        for candidate in sorted(winget_base.glob("ffmpeg-*/bin/ffmpeg.exe"), reverse=True):
            return str(candidate.parent)
    for p in [
        Path(r"C:\ffmpeg\bin\ffmpeg.exe"),
        Path(r"C:\Program Files\ffmpeg\bin\ffmpeg.exe"),
        Path(r"C:\Program Files (x86)\ffmpeg\bin\ffmpeg.exe"),
        Path.home() / "ffmpeg" / "bin" / "ffmpeg.exe",
    ]:
        if p.exists():
            return str(p.parent)
    return None

FFMPEG_LOCATION = _find_ffmpeg()

# ── YouTube anti-bot (cookies / clientes alternativos) ──────────────────────────
# Em IPs de datacenter (Render, etc.) o YouTube costuma exigir login
# ("Sign in to confirm you're not a bot"). Para contornar:
#   1. Tentamos clientes alternativos do YouTube (android/tv/web_safari).
#   2. Se YTDLP_COOKIES (conteúdo do cookies.txt) ou YTDLP_COOKIEFILE (caminho)
#      estiver definido como variável de ambiente, usamos os cookies.
# IMPORTANTE: defina YTDLP_COOKIES como SECRET no host — nunca comite cookies no repo.

def _get_cookiefile() -> Optional[str]:
    content = os.environ.get("YTDLP_COOKIES")
    if content:
        path = os.path.join(tempfile.gettempdir(), "vg_cookies.txt")
        # Reescreve se o conteúdo do env mudou
        if not os.path.exists(path) or open(path, encoding="utf-8").read() != content:
            with open(path, "w", encoding="utf-8") as f:
                f.write(content)
        return path
    path = os.environ.get("YTDLP_COOKIEFILE")
    if path and os.path.exists(path):
        return path
    return None

def _common_ydl_opts() -> dict:
    """Opções compartilhadas por info/preview/download para driblar o bloqueio
    do YouTube em servidores na nuvem."""
    opts: dict = {}
    cf = _get_cookiefile()
    if cf:
        # Com cookies, deixamos o yt-dlp escolher o cliente padrão (mais confiável).
        opts["cookiefile"] = cf
    elif not IS_LOCAL:
        # SÓ na nuvem (IP de datacenter): força clientes alternativos para driblar o
        # bloqueio anti-bot. Esses clientes costumam LIMITAR as resoluções (ex.: 360p).
        # Localmente (IP residencial) não precisamos disso, então deixamos os defaults
        # do yt-dlp, que retornam todas as resoluções (720p/1080p/4K/...).
        opts["extractor_args"] = {"youtube": {"player_client": ["tv", "android", "web_safari"]}}
    return opts

# ── Models ─────────────────────────────────────────────────────────────────────

class InfoRequest(BaseModel):
    url: str

class DownloadRequest(BaseModel):
    url: str
    format_type: str           # "video" | "audio"
    quality: str               # e.g. "1080", "720", "audio_320"
    output_dir: Optional[str] = None
    trim_start: Optional[float] = None   # seconds
    trim_end: Optional[float] = None     # seconds

# ── Helpers ────────────────────────────────────────────────────────────────────

def get_ydl_opts_info():
    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "noplaylist": True,
        "format": "bestvideo+bestaudio/best",
    }
    opts.update(_common_ydl_opts())
    return opts

def sanitize(text: str) -> str:
    return re.sub(r"[^\w\s\-\(\)\[\]áàâãéèêíïóôõöúüçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÜÇÑ]", "", text).strip()

def format_duration(seconds: Optional[int]) -> str:
    if not seconds:
        return "–"
    h = seconds // 3600
    m = (seconds % 3600) // 60
    s = seconds % 60
    if h:
        return f"{h}:{m:02}:{s:02}"
    return f"{m}:{s:02}"

def extract_formats(info: dict) -> dict:
    """Return available video resolutions and audio qualities from info dict."""
    formats = info.get("formats", [])
    heights = set()
    for f in formats:
        h = f.get("height")
        if h and f.get("vcodec", "none") != "none":
            heights.add(h)

    video_options = []
    for h in sorted(heights, reverse=True):
        label_map = {2160: "4K (2160p)", 1440: "1440p", 1080: "1080p FHD",
                     720: "720p HD", 480: "480p", 360: "360p", 240: "240p", 144: "144p"}
        label = label_map.get(h, f"{h}p")
        video_options.append({"value": str(h), "label": label})

    if not video_options:
        video_options = [{"value": "best", "label": "Melhor qualidade disponível"}]

    audio_options = [
        {"value": "audio_320", "label": "MP3 320 kbps (Alta qualidade)"},
        {"value": "audio_192", "label": "MP3 192 kbps (Boa qualidade)"},
        {"value": "audio_128", "label": "MP3 128 kbps (Padrão)"},
    ]

    return {"video": video_options, "audio": audio_options}


def _extract_preview_url(info: dict) -> Optional[str]:
    """Extract a low-quality progressive MP4 URL for in-browser preview.

    Progressive means both audio and video in one stream, which is required
    for the HTML5 <video> element to play without MSE.
    """
    formats = info.get("formats", [])
    # Progressive = has both video and audio in one stream
    progressive = [
        f for f in formats
        if f.get("ext") == "mp4"
        and f.get("vcodec", "none") != "none"
        and f.get("acodec", "none") != "none"
        and f.get("url")
    ]
    if progressive:
        # Prefer around 360-480p for fast preview
        progressive.sort(key=lambda f: abs((f.get("height") or 0) - 400))
        return progressive[0]["url"]
    # Fallback: any format with both video and audio
    combined = [
        f for f in formats
        if f.get("vcodec", "none") != "none"
        and f.get("acodec", "none") != "none"
        and f.get("url")
    ]
    if combined:
        combined.sort(key=lambda f: abs((f.get("height") or 0) - 400))
        return combined[0]["url"]
    return info.get("url")


# ── Endpoints ──────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return FileResponse("frontend/index.html")


@app.post("/api/info")
async def get_info(req: InfoRequest):
    """Fetch video metadata without downloading."""
    try:
        with yt_dlp.YoutubeDL(get_ydl_opts_info()) as ydl:
            info = ydl.extract_info(req.url, download=False)
    except yt_dlp.utils.DownloadError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao buscar informações: {str(e)}")

    thumbnail = info.get("thumbnail") or ""
    thumbs = info.get("thumbnails", [])
    if thumbs:
        preferred = [t for t in thumbs if t.get("width", 0) >= 300 and t.get("width", 0) <= 800]
        if preferred:
            thumbnail = preferred[-1].get("url", thumbnail)

    # Cache preview URL for the proxy endpoint
    preview_url = _extract_preview_url(info)
    preview_available = preview_url is not None
    if preview_url:
        _preview_cache[req.url] = (preview_url, time.time() + 1800)  # 30 min TTL

    return {
        "title": sanitize(info.get("title", "Sem título")),
        "uploader": info.get("uploader") or info.get("channel") or "–",
        "duration": format_duration(info.get("duration")),
        "duration_seconds": info.get("duration"),
        "thumbnail": thumbnail,
        "platform": info.get("extractor_key", "unknown"),
        "view_count": info.get("view_count"),
        "formats": extract_formats(info),
        "preview_available": preview_available,
    }


@app.get("/api/preview")
def preview_proxy(url: str = "", request: Request = None):
    """Proxy a low-quality video stream for in-browser preview with seeking.

    This is a sync endpoint so FastAPI runs it in a threadpool,
    allowing the blocking urllib calls without freezing the event loop.
    """
    cached = _preview_cache.get(url)
    if not cached or cached[1] < time.time():
        # Try to extract on the fly if not cached
        try:
            with yt_dlp.YoutubeDL(get_ydl_opts_info()) as ydl:
                info = ydl.extract_info(url, download=False)
            direct = _extract_preview_url(info)
            if not direct:
                raise HTTPException(400, "Nenhum formato de preview disponível para este vídeo")
            _preview_cache[url] = (direct, time.time() + 1800)
            cached = _preview_cache[url]
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(400, "Erro ao obter preview. Busque as informações do vídeo primeiro.")

    direct_url = cached[0]

    # Build upstream request, forwarding Range header for seeking
    upstream_headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    }
    if request:
        range_hdr = request.headers.get("range")
        if range_hdr:
            upstream_headers["Range"] = range_hdr

    req = urllib.request.Request(direct_url, headers=upstream_headers)
    try:
        resp = urllib.request.urlopen(req)
    except urllib.error.HTTPError as e:
        raise HTTPException(e.code, f"Upstream error: {e.reason}")

    response_headers = {
        "Content-Type": resp.headers.get("Content-Type", "video/mp4"),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=3600",
    }
    for hdr_name in ["Content-Length", "Content-Range"]:
        val = resp.headers.get(hdr_name)
        if val:
            response_headers[hdr_name] = val

    def stream_chunks():
        try:
            while True:
                chunk = resp.read(65536)
                if not chunk:
                    break
                yield chunk
        finally:
            resp.close()

    return StreamingResponse(stream_chunks(), status_code=resp.status, headers=response_headers)


@app.post("/api/download")
async def start_download(req: DownloadRequest):
    """Start a download in background and return a download ID."""
    download_id = str(uuid.uuid4())
    output_dir = req.output_dir or DEFAULT_DOWNLOAD_DIR
    os.makedirs(output_dir, exist_ok=True)

    downloads[download_id] = {
        "status": "starting",
        "progress": 0,
        "speed": "",
        "eta": "",
        "filename": "",
        "error": "",
    }

    thread = threading.Thread(
        target=_run_download,
        args=(download_id, req.url, req.format_type, req.quality, output_dir,
              req.trim_start, req.trim_end),
        daemon=True,
    )
    thread.start()

    return {"id": download_id}


def _progress_hook(download_id: str):
    def hook(d):
        state = downloads[download_id]
        if d["status"] == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            downloaded = d.get("downloaded_bytes", 0)
            pct = int(downloaded / total * 100) if total else 0
            speed = d.get("_speed_str", "").strip()
            eta = d.get("_eta_str", "").strip()
            state.update({
                "status": "downloading",
                "progress": pct,
                "speed": speed,
                "eta": eta,
            })
        elif d["status"] == "finished":
            state.update({"status": "processing", "progress": 99})
            filename = d.get("filename", "")
            state["filename"] = filename
    return hook


def _run_download(download_id: str, url: str, format_type: str, quality: str,
                  output_dir: str, trim_start: Optional[float] = None,
                  trim_end: Optional[float] = None):
    state = downloads[download_id]
    try:
        outtmpl = os.path.join(output_dir, "%(title)s.%(ext)s")

        # Re-check FFmpeg at download time
        ffmpeg_loc = _find_ffmpeg()
        has_ffmpeg = ffmpeg_loc is not None
        wants_trim = trim_start is not None or trim_end is not None

        if wants_trim and not has_ffmpeg:
            state.update({"status": "error", "error": "FFmpeg é necessário para recortar vídeos. Instale o FFmpeg."})
            return

        if format_type == "audio":
            bitrate = quality.replace("audio_", "")
            if has_ffmpeg:
                ydl_opts = {
                    "format": "bestaudio/best",
                    "outtmpl": outtmpl,
                    "noplaylist": True,
                    "quiet": True,
                    "no_warnings": True,
                    "ffmpeg_location": ffmpeg_loc,
                    "progress_hooks": [_progress_hook(download_id)],
                    "postprocessors": [{
                        "key": "FFmpegExtractAudio",
                        "preferredcodec": "mp3",
                        "preferredquality": bitrate,
                    }],
                }
            else:
                ydl_opts = {
                    "format": "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best",
                    "outtmpl": outtmpl,
                    "noplaylist": True,
                    "quiet": True,
                    "no_warnings": True,
                    "progress_hooks": [_progress_hook(download_id)],
                }
                state["warning"] = "FFmpeg nao encontrado: audio salvo em formato nativo (m4a/webm). Instale FFmpeg para converter para MP3."
        else:
            # Video
            if has_ffmpeg:
                if quality == "best":
                    fmt = "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best"
                else:
                    fmt = (
                        f"bestvideo[height<={quality}][ext=mp4]+bestaudio[ext=m4a]"
                        f"/bestvideo[height<={quality}]+bestaudio"
                        f"/best[height<={quality}]/best"
                    )
                ydl_opts = {
                    "format": fmt,
                    "outtmpl": outtmpl,
                    "noplaylist": True,
                    "quiet": True,
                    "no_warnings": True,
                    "merge_output_format": "mp4",
                    "ffmpeg_location": ffmpeg_loc,
                    "progress_hooks": [_progress_hook(download_id)],
                }
            else:
                if quality == "best":
                    fmt = "best[ext=mp4]/best"
                else:
                    fmt = (
                        f"best[height<={quality}][ext=mp4]"
                        f"/best[height<={quality}]"
                        f"/best[ext=mp4]/best"
                    )
                ydl_opts = {
                    "format": fmt,
                    "outtmpl": outtmpl,
                    "noplaylist": True,
                    "quiet": True,
                    "no_warnings": True,
                    "progress_hooks": [_progress_hook(download_id)],
                }
                state["warning"] = "FFmpeg nao encontrado: usando formato pre-mesclado (qualidade pode ser limitada). Instale FFmpeg para qualidade maxima."

        # Aplica cookies / clientes alternativos do YouTube em qualquer branch acima
        ydl_opts.update(_common_ydl_opts())

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            filename = None
            if info:
                req_downloads = info.get('requested_downloads', [])
                if req_downloads:
                    filename = req_downloads[-1].get('filepath')
                if not filename:
                    filename = info.get('_filename')
            
            final_filename = filename or state.get("filename")
            if final_filename:
                state["filename"] = final_filename

        # ── Trim step ──────────────────────────────────────────
        if wants_trim and has_ffmpeg:
            state.update({"status": "trimming", "progress": 99})
            downloaded_file = state.get("filename", "")

            # For audio with postprocessor, the extension changed to .mp3
            if format_type == "audio" and has_ffmpeg:
                base_no_ext = os.path.splitext(downloaded_file)[0]
                mp3_file = base_no_ext + ".mp3"
                if os.path.exists(mp3_file):
                    downloaded_file = mp3_file

            if downloaded_file and os.path.exists(downloaded_file):
                base, ext = os.path.splitext(downloaded_file)
                trimmed_file = f"{base}_clip{ext}"

                ffmpeg_exe = os.path.join(ffmpeg_loc, "ffmpeg.exe")

                # Use input seeking (-ss before -i) for speed, -t for duration
                cmd = [ffmpeg_exe]
                if trim_start is not None and trim_start > 0:
                    cmd += ["-ss", str(trim_start)]
                cmd += ["-i", downloaded_file]
                if trim_end is not None:
                    duration = (trim_end - (trim_start or 0))
                    cmd += ["-t", str(duration)]
                cmd += ["-c", "copy", "-avoid_negative_ts", "make_zero", "-y", trimmed_file]

                result = subprocess.run(cmd, capture_output=True, text=True)
                if result.returncode != 0:
                    # Fallback: try with re-encoding if stream copy fails
                    cmd_re = [ffmpeg_exe]
                    if trim_start is not None and trim_start > 0:
                        cmd_re += ["-ss", str(trim_start)]
                    cmd_re += ["-i", downloaded_file]
                    if trim_end is not None:
                        cmd_re += ["-t", str(trim_end - (trim_start or 0))]
                    cmd_re += ["-y", trimmed_file]
                    subprocess.run(cmd_re, capture_output=True, text=True, check=True)

                # Replace original with trimmed version
                os.remove(downloaded_file)
                os.rename(trimmed_file, downloaded_file)

        state.update({"status": "done", "progress": 100, "output_dir": output_dir})

    except Exception as e:
        state.update({"status": "error", "error": str(e)})


@app.get("/api/progress/{download_id}")
async def get_progress(download_id: str):
    """SSE stream for download progress."""
    if download_id not in downloads:
        raise HTTPException(status_code=404, detail="Download not found")

    async def event_stream():
        while True:
            state = downloads.get(download_id, {})
            status = state.get("status", "unknown")
            data = json.dumps(state)
            yield f"data: {data}\n\n"
            if status in ("done", "error"):
                break
            await asyncio.sleep(0.5)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.get("/api/open-folder")
async def open_folder(path: str = None):
    """Open a folder or select a file in Windows Explorer."""
    target = path or DEFAULT_DOWNLOAD_DIR
    target = os.path.normpath(target)
    if os.path.exists(target):
        if os.path.isdir(target):
            os.startfile(target)
        else:
            # It's a file, open its directory and select the file
            subprocess.Popen(f'explorer /select,"{target}"')
    return {"ok": True}


@app.get("/api/default-dir")
async def default_dir():
    return {"path": DEFAULT_DOWNLOAD_DIR}


@app.get("/api/download-file/{download_id}")
async def download_file(download_id: str, background_tasks: BackgroundTasks):
    if download_id not in downloads:
        raise HTTPException(status_code=404, detail="Download não encontrado")
    
    state = downloads[download_id]
    if state.get("status") != "done":
        raise HTTPException(status_code=400, detail="O download ainda não foi concluído")
        
    filepath = state.get("filename")
    if not filepath or not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado no servidor")
        
    basename = os.path.basename(filepath)
    safe_name = urllib.parse.quote(basename)
    
    # Schedule deletion after download completion to save space
    background_tasks.add_task(os.remove, filepath)
    
    return FileResponse(
        path=filepath,
        filename=basename,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{safe_name}"}
    )


@app.get("/api/status")
async def app_status():
    ffmpeg = _find_ffmpeg()
    return {
        "ffmpeg": ffmpeg is not None,
        "ffmpeg_path": ffmpeg,
        "local_mode": IS_LOCAL,
    }


# ── Static files ───────────────────────────────────────────────────────────────
app.mount("/static", StaticFiles(directory="frontend"), name="static")

# Also serve index.html for any unmatched route
@app.get("/{full_path:path}")
async def serve_frontend(full_path: str):
    fp = Path("frontend") / full_path
    if fp.exists() and fp.is_file():
        return FileResponse(str(fp))
    return FileResponse("frontend/index.html")


# ── Entry point ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    public_mode = "--public" in sys.argv or not IS_LOCAL
    host = "0.0.0.0" if public_mode else "127.0.0.1"
    port = int(os.environ.get("PORT", 7878))
    print("\n*** VideoGrab iniciando ***")
    print("Pasta de downloads:", DEFAULT_DOWNLOAD_DIR)
    if not IS_LOCAL:
        print(f"Modo nuvem ativo — ouvindo na porta {port}\n")
    elif public_mode:
        print("Modo publico ativo — aguarde o link do Cloudflare Tunnel\n")
    else:
        # --no-browser: usado pelo autostart oculto para não abrir uma aba a cada boot
        no_browser = "--no-browser" in sys.argv or os.environ.get("VG_NO_BROWSER") == "1"
        if no_browser:
            print(f"Servidor local em http://localhost:{port} (modo oculto)\n")
        else:
            print(f"Abrindo http://localhost:{port}\n")
            threading.Timer(1.5, lambda: webbrowser.open(f"http://localhost:{port}")).start()
    uvicorn.run(app, host=host, port=port, log_level="warning")

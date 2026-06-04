/* ──────────────────────────────────────────────
   VideoGrab — config.js
   ÚNICO lugar para definir a URL do servidor.

   🖥️  MODO LOCAL (atual): rode o servidor com start.bat e use a URL abaixo.
       O YouTube funciona sem conta/cookies porque sai do seu IP residencial.

   ☁️  MODO NUVEM: troque pela URL do deploy (ex.: Render) e atualize também
       "host_permissions" no manifest.json para o mesmo endereço.
       (Obs.: na nuvem o YouTube exige cookies; outras plataformas funcionam.)
   ────────────────────────────────────────────── */

const VIDEOGRAB_SERVER = "http://localhost:7878";

// Backup do servidor na nuvem (para voltar, troque a linha acima por esta):
// const VIDEOGRAB_SERVER = "https://videograb-kbqc.onrender.com";

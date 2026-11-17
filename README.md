[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/kingcritket/gta6-bot/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/kingcritket/gta6-bot/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Port Vela

Game crime open-world (three.js) untuk bounty make.fun **"Make GTA 6"** (gta6-01): kota pelabuhan Port Vela yang bisa dijelajahi dengan jalan kaki dan mobil, lengkap dengan traffic, pejalan kaki, sistem wanted + polisi, combat, 5 misi cerita, HUD + minimap, save, dan suara sintetis — semuanya berjalan offline dari file statis, tanpa network request.

## Main

```sh
node serve.ts
```

Lalu buka http://localhost:8080 di desktop browser.

## Kontrol

- **WASD** bergerak / menyetir · **Shift** lari
- **E** curi mobil & keluar dari mobil
- **F** / klik menembak · **R** isi ulang
- **P** jeda · drag mouse memutar kamera · roda mouse zoom

## Cerita

Kau Rook, pendatang baru dengan utang dan ambisi. Mara, mekanik bengkel pelabuhan, memberimu lima pekerjaan: curi mobil pertama, antar paket ke dermaga, kabur dari kejaran polisi, rebut Plaza Vela dari geng Kobra, dan satu skor terakhir di Bank Vela. Selesaikan kelimanya dan Port Vela jadi milikmu.

## Misi

1. **Roda Pertama** — curi mobil, antar ke Bengkel Mara ($500)
2. **Paket Dermaga** — ambil paket, antar ke titik antar ($900)
3. **Panas di Strip** — kabur sampai wanted padam ($1.200)
4. **Perebutan Plaza** — kalahkan 4 anggota geng Kobra ($1.800)
5. **Skor Terakhir** — rampok Bank Vela, kabur dari polisi ($5.000)

## Struktur

- `game/index.html` — halaman game + HUD
- `game/src/` — sumber game: `main.js` (loop), `world.js` (simulasi), `city.js` (tata kota), `render.js` (three.js), `missions.js` (5 misi), `hud.js` (HUD + minimap), `input.js`, `audio.js` (suara sintetis), `shots.js` (staging screenshot), `rng.js`
- `game/vendor/three/three.module.min.js` — three.js r160 (vendored)
- `screenshots/` — 3 render asli game (`?shot=start|play|end&seed=1`)
- `main.ts` — program entry (Node 22): menyalin game + screenshot ke output dan menulis `dossier.json`
- `serve.ts` — server statis lokal untuk `game/`

Lisensi: MIT. Referral: `97vd661v`.

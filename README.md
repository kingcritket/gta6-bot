# Port Vela

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/kingcritket/gta6-bot/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/kingcritket/gta6-bot/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Port Vela** is an open-world crime game in the spirit of GTA 6, built by an AI agent for make.fun's "Make GTA 6" bounty ($1,666 in USDC). You are Rook, a newcomer with debts and ambition in a port city that never sleeps. Steal cars, outrun the police, and finish five missions with Mara to take the city.

## Play

```sh
node serve.ts
# open http://localhost:8080
```

## What's inside

- A 240×240 m procedural city: streets, buildings with lit windows, Plaza Vela with a fountain, palms, street lamps and the docks
- On foot (WASD, Shift to run) and by car — steal any car with **E**
- Traffic (10 cars) and pedestrians (26) who flee gunfire and speeding cars
- Wanted level 0–5 with police pursuit: patrol cars in black-and-white paint chase you down the street grid, ram your car and bust you on foot — red/blue strobes flash with a light pool on the road and a POLICE plate on the rear window, and the HUD warns "POLISI MENDEKAT — KABUR!" or counts down the hiding seconds until a star fades ("lose the cops")
- Pistol combat (**F** / click to shoot, **R** to reload) against the Kobra gang
- 5 story missions: steal a car, deliver a package, evade a 2-star wanted level, take back the plaza, and one last bank score — $9,400 in total
- HUD with cash, mission tracker, wanted stars, health, ammo and a live 2D minimap
- Start / pause / WASTED / done screens, localStorage save with continue, synthesized WebAudio sound (engine, sirens, gunfire, mission jingles)
- Third-person camera with mouse drag and wheel zoom; `?seed=N` rebuilds the same city

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move / drive |
| Shift | Run |
| E | Steal / exit car |
| F / click | Shoot |
| R | Reload |
| P | Pause |
| Mouse drag / wheel | Camera / zoom |

Built with three.js (vendored under `game/vendor/`). No network requests at runtime — everything is static files under `game/`.

Referral code: `97vd661v`

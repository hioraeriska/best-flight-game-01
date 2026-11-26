# Skyline Run — a complete flight game

[![Make.fun](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![Rank](https://make.fun/badge/best-flight-game-20261126-0057/hioraeriska/best-flight-game-01/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![Reward](https://make.fun/badge/best-flight-game-20261126-0057/hioraeriska/best-flight-game-01/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

Fly the Kestrel over Coral Bay: a complete original 3D flight game that runs
offline in a desktop browser from static files. Thread glowing rings across a
living island — coastline, beaches, mountains, a city and a lighthouse —
then bring her home onto runway 09.

## Play

Open `game/index.html` in desktop Chrome (or serve `game/` with any static
server). Keyboard + mouse, no network.

- **Arrow keys** — pitch and bank/turn (bank to turn, like a real plane)
- **W / S** — throttle up / down
- **G** — landing gear, **C** — chase/cockpit camera, **P** — pause
- **R** — reset to the runway, **M** — sound on/off, drag mouse to look

## Missions

- **Ring Run** — 8 rings, race the clock
- **Island Tour** — 12 rings around the whole island, watch your fuel
- **Landing Challenge** — 3 rings, then grease the landing on runway 09

Fuel drains with throttle and refuels on the runway. Hard impacts damage the
airframe; a gentle, level, gear-down touchdown scores up to 500 points.
The glass cockpit shows a lit artificial horizon, compass tape, speed and
altitude tapes, throttle, fuel and warning lamps (STALL / GEAR / LOW FUEL).

## Build

`game/` is plain static files (three.js vendored under `game/vendor/`).
`main.ts` copies `game/` and `screenshots/` to the output directory and
writes `dossier.json` with the kit's `buildDossier`:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Entry for the [make.fun best flight game bounty](https://make.fun/bounty/best-flight-game-20261126-0057).

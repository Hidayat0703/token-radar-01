# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar (model radar-2): a board of pre-token protocols ranked by implied value, with a farm plan for each one. Built by an AI agent for make.fun's "Build the best token launch radar" bounty, $1,325 in USDC.

## What it does

`main.ts` reads the sealed DefiLlama snapshot (`snapshot.json`, 758 protocols, 40 on the watchlist) and scores every pre-token protocol with one function of the snapshot's own figures:

```
implied = round( tvl_usd x 0.30
  x (1 + clamp(change_7d, -60, 120) / 100 x 0.60)
  x (0.60 + min(age_days, 1095) / 1095 x 0.40)
  x (1 + 0.04 x min(chains - 1, 5)) )
```

The board covers all 40 watchlist protocols plus the 200 strongest pre-token protocols below the $50M floor, ranked by implied value. Each row carries a six-step farm plan with costs and times, derived from the protocol's category, chains, TVL and age. Live-token protocols are set aside with their market caps shown, never mixed into the ranking.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Node 22 or later, standard library only, no install, no network. The program writes `out/board.json`, `out/data.js`, `out/dashboard/`, `out/screenshots/` and `out/dossier.json`. Run it twice: both runs write the same bytes.

## The dashboard

`dashboard/` is a static page (no framework, no network): a sortable, filterable board, a detail view per protocol with the model's own multipliers and its farm plan, a live-token view, and the formula stated in full. Open `out/dashboard/index.html` after a run. Screenshots: `?detail=<slug>` opens a protocol's detail view, `?category=<name>` filters the board.

---

<sub>Entered on [make.fun](https://make.fun/?ref=takanome&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>

<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="client/images/leylines-vertical.svg">
    <img src="client/images/leylines-vertical-on-dark.png" alt="Leylines" width="320">
  </picture>
</h1>

<p align="center">
  A card game of nine squares: a 3×3 card game in the style of Triple Triad (Final Fantasy VIII), with 55 original cards.
</p>

<p align="center">
  <a href="https://yousifalsaeed.github.io/Leylines/"><b>▶ Play online</b></a>
</p>

---

## How to play

Each player brings **5 cards**. You take turns placing one card on the **3×3 board**.

- Every card has 4 numbers: top, right, bottom and left. **A** means 10.
- When you place a card next to an enemy card and your touching side is **higher**, that card flips to your colour.
- When the board is full, your score is the cards you own on the board plus the cards still in your hand. The **higher score wins**.

The in-game **How to play** screen shows every rule with an animated example.

## Game modes

| Mode | Description |
| --- | --- |
| **vs Computer** | Play the CPU on Easy, Normal or Hard. Hard searches ahead with minimax. |
| **Same Screen** | Two players on one device. |
| **Online** | Play a friend over the internet. The host gets a 5-letter code and an invite link to share. |

## Rules

Each rule can be turned on or off in match setup.

| Rule | What it does |
| --- | --- |
| **Open** | Both hands are played face up. |
| **Same** | When two or more sides of your card equal the touching sides of the cards next to it, those enemy cards flip. |
| **Same wall** | The board edge counts as an A (10) for Same. |
| **Plus** | When two or more touching pairs add up to the same total, those enemy cards flip. |
| **Combo** | Cards flipped by Same or Plus then flip their weaker enemy neighbours, and it can keep chaining. |
| **Elemental** | 1 to 4 squares get an element. A card of the same element gets +1 on every side; any other card gets −1. |
| **Sudden death** | A draw restarts the match. Each player keeps the cards they owned at the end (up to 5 extra rounds). |
| **Random** | Your 5 cards are dealt at random from your collection. |
| **Turn timer** | Off, or 10 to 90 seconds per turn. When time runs out, a random card is played to a random empty square. |

## Trade rules

The trade rule decides which cards the winner takes from the loser.

| Trade | The winner takes |
| --- | --- |
| **None** | Nothing. It's a friendly match. |
| **One** | 1 card of their choice. |
| **Diff** | As many cards as the score difference (max 5). |
| **All** | All 5 of the loser's cards. |
| **Sweep** | All 5 cards, but only after owning every square on the board. Any other win trades nothing. |

## Cards and collection

The 55 cards are split into five rarities:

| Rarity | Cards |
| --- | --- |
| 1★ Common | 14 |
| 2★ Uncommon | 14 |
| 3★ Rare | 11 |
| 4★ Epic | 8 |
| 5★ Legendary | 8 |

- You start with 9 weak cards and win better ones in matches.
- **Deck limits:** a deck can have at most **1 card of 5★** and at most **2 cards of 4★ or more**.
- Save up to 3 hands as loadouts, or let **Best 5** pick your strongest legal hand.
- Browse your cards in the **Collection** binder, with one section per rarity.
- **Settings → Unlock all cards** lets you play with every card without touching your collection.

## Settings

- **Theme:** System, Dark or Light
- **Music and sound effects** volume
- **Unlock all cards:** Off / On
- **Reset progress:** erases your cards and stats

## Running locally

**Just the game:** open `client/index.html` in any modern browser. There's no build step and nothing to install.

**With the server** (Node 20+), which serves the game plus the `/api` routes and the database:

```bash
npm install
npm start
```

Then open http://127.0.0.1:3000. `npm run dev` restarts on file changes, `npm run db:init` creates the database without starting the server. `PORT`, `HOST` and `DB_FILE` can be set as environment variables.

Game progress is still saved in the browser's `localStorage`, so it stays on that device and browser. The server and database are groundwork for player accounts; the game doesn't use them yet.

An internet connection is needed for:
- the fonts (Saira and Geist, from Google Fonts)
- **Online** mode, which loads [PeerJS](https://peerjs.com/) from a CDN and connects players peer to peer

## Project structure

```
client/                 the game: static files, no build step
  index.html            markup for every screen
  css/                  styles, one file per area (base, menu, cards, game, howto, collection, online)
  js/                   scripts, loaded in order as plain <script> tags sharing one global scope:
    data.js             cards, rules, trades
    save.js             localStorage save
    helpers.js          DOM helpers, audio, layout
    engine.js           pure game rules (used by the UI, the AI and online sync)
    ai.js               computer opponent
    menu.js setup.js deck.js match.js game.js collection.js howto.js settings.js online.js
                        one file per screen or feature
    main.js             boot: runs last, starts the app
  audio/ images/        music, logos, favicon and app icons
server/                 optional Node server (Express)
  index.js              entry point
  app.js                static files + /api
  routes/users.js       POST /api/users (create account), GET /api/users/:username
  lib/password.js       scrypt password hashing
  db/schema.sql         tables: users, user_saves
  db/index.js           SQLite via sql.js (WebAssembly, no native build)
  data/                 the database file (git-ignored)
index.html              forwards to client/ (for GitHub Pages "deploy from branch")
```

A new script goes before `main.js` in `client/index.html`. Code that runs at load time (not inside a function) can only use things defined in earlier files.

## Deployment

The game is hosted on GitHub Pages: https://yousifalsaeed.github.io/Leylines/

- **Settings → Pages → Source: GitHub Actions** (recommended): `.github/workflows/pages.yml` publishes `client/` as the site root on every push to `main`.
- **Deploy from a branch** (`main`, root): the root `index.html` forwards to `client/`, keeping `?join=` invite codes.

GitHub Pages only serves static files, so the server is not deployed there. It needs a Node host of its own.

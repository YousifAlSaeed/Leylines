<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="images/leylines-vertical.svg">
    <img src="images/leylines-vertical-on-dark.png" alt="Leylines" width="320">
  </picture>
</h1>

<p align="center">
  A card game of nine squares: a single-file 3×3 card game in the style of Triple Triad (Final Fantasy VIII), with 55 original cards.
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

Open `index.html` in any modern browser. There's no build step and nothing to install.

Everything is saved in the browser's `localStorage`, so progress stays on that device and browser.

An internet connection is needed for:
- the fonts (Saira and Geist, from Google Fonts)
- **Online** mode, which loads [PeerJS](https://peerjs.com/) from a CDN and connects players peer to peer

## Project structure

```
index.html        the whole game: markup, styles and scripts
audio/theme.mp3   background music
images/          logos, favicon and app icons
```

## Deployment

The game is hosted on GitHub Pages from the `main` branch:
https://yousifalsaeed.github.io/project-a/

# Changelog

The version shows next to the title on the menu. It lives in
`client/js/version.js`, `package.json` and the top entry below; `npm test`
fails if they don't match. How to bump it is in `CLAUDE.md`.

Versions before 0.6.0 were worked out afterwards from the commit history.

## 0.22.0 (2026-10-10)
- New Bank timer, like a chess clock: each player gets 1 to 5 minutes for the whole match, and every card you play adds 2 seconds back. Choose what running out does: a random card is played for you, or you lose the match
- The per-turn timer has the same choice now: a random card, or you lose the match
- Match setup is simpler: Difficulty, Timer, Match length and Trade are now short rows that show what is picked. Tap a row to change it. The timer can be Off, Per turn or Bank
- On a computer, the rule cards in Match setup are bigger and line up with the boxes on the left, and each card says what its rule does

## 0.21.1 (2026-10-10)
- Badges on your profile are now a card for each group, with a dot where shards wait and a gold frame once a group is complete. Tap a group to see its badges: what each one takes, how close you are, and a Claim button for the ones whose shards wait
- Profile order: on a computer, Badges sits on the right and Account on the left. On a phone: Showcase, Record, History, Collection, Badges, Account

## 0.21.0 (2026-10-10)
- Badges reworked: 51 badges in 10 groups (25 new ones for the tutorial, packs, friends, emotes, series, the Reverse, Chaos and Random rules, Trade: All, Win them back, the dailies, the Store and higher levels)
- Every badge now pays shards: Bronze 20, Silver 50, Gold 120, Prism 300. Earned badges glow on your profile: tap one to claim its shards. Badges you already had can be claimed too
- A dot on your profile box shows when badges have shards waiting
- Tap a badge you don't have yet to see how close you are (like 11/50)

## 0.20.0 (2026-10-10)
- New: **Win them back**. When the CPU takes your cards in Solo, you can play it again right away. It swaps its weakest cards for the ones it took, so you can win them back. Win and the trade rule says how many of them you take back (only your own cards). Lose and it takes more
- With Trade One or Diff, a second loss gives you a **Last chance**: the CPU holds every card it took. Win and they all come back. Lose and it takes that many more. With Diff there's no Last chance if that's more than 5 cards
- With Trade All you get one try: win and all 5 come back, lose and it takes 5 more
- A draw on a try lets you play it again for the same cards

## 0.19.18 (2026-10-10)
- Fixed: on a phone, the Daily Puzzle's goal and the Review's notes could cover the numbers on the board's top row. They now always end just above the board
- Fixed: on a narrow computer window, the emote tray could open off the right edge of the screen

## 0.19.17 (2026-10-10)
- One colour for each rarity, the same everywhere: 1★ bronze, 2★ silver, 3★ gold, 4★ violet (a deeper, stronger one) and 5★ prism, a rainbow. 5★ cards no longer glow gold when a pack opens (that looked like a 3★); "5★ Legendary" and the 5★ tag are written in the rainbow

## 0.19.16 (2026-10-10)
- Fixed: turning on alerts from the menu card could leave the card stuck on screen (seen in Brave). The card now closes as soon as you tap Turn on, and if the browser never answers, the game gives up after a minute and says what to do. In Brave it explains the setting to turn on ("Use Google services for push messaging")

## 0.19.15 (2026-10-10)
- Crossroads on computers gets the same 4-player-chess layout: every hand touches its side of the board, and each player has a corner with their big glowing score (in 2v2, their team's), name, avatar and clock (the CPUs' clocks stay empty). The side players' corners turn to face them, and their clocks sit between their info and the next hand. The top player is top-left, the right player top-right, the left player bottom-left and you bottom-right. Phones keep their layout

## 0.19.14 (2026-10-10)
- New game layout on computers, like 4-player chess: the CPU's cards above the board and yours below, both centred on it. Each player gets a corner: the other player top-left, you bottom-right, with a big glowing score, your name and avatar, and a clock (left empty for the CPU, or when there's no turn timer). Phones and tablets keep their layouts

## 0.19.13 (2026-10-10)
- Choosing cards for a match: Play gets its own big row at the bottom, and Best 5, Clear and Save hand sit above it as wider buttons with words

## 0.19.12 (2026-10-10)
- Opening a pack in light mode: the background is light too, instead of always dark

## 0.19.11 (2026-10-10)
- Daily Puzzle: the goal ("Flip 4 red cards with one card") stays on screen while you think, instead of disappearing after a second
- Daily Puzzle: missed it? **See why** shows your move and the answer on the board, with what each one flipped and why

## 0.19.10 (2026-10-10)
- **Review a game.** After a game, the result popup has a Review button. Step through every move on the board: who played what, and why cards flipped, with tags like "3 + 5 = 8" on the edges that did it (Same, Plus, Combo, and plain captures). In a Best of 3 or 5, pick the match at the top. Back to results takes you back to the popup

## 0.19.9 (2026-10-10)
- Important popups give you 3 seconds to read before the main button works: leaving a match, signing out, deleting a loadout, removing a friend or player, buying in the Night Market, taking or sparing cards, and the news when you lost cards. The button counts down 3, 2, 1. Cancel, Stay and Escape still work right away

## 0.19.8 (2026-10-10)
- Night Market: the Merchant doesn't sell 5★ cards any more. The top card is always a 4★

## 0.19.7 (2026-10-10)
- Settings → Alerts: the Test button is gone for players. Only developer accounts still have it

## 0.19.6 (2026-10-10)
- The "You're playing as a guest" reminder is now a popup you can close with Later, instead of a box on the menu. It shows after your first match, then again every 10 matches

## 0.19.5 (2026-10-10)
- Match history only shows Solo and online games now. Daily games aren't saved there, and old ones are cleared out
- Daily games don't count as wins, losses or draws on your record any more (they still give XP)

## 0.19.4 (2026-10-10)
- Fixed: closing a pack with X before tearing it opened it anyway. Now the pack stays in your list, unopened. The cards inside stay the same, so opening it again later shows the same ones

## 0.19.3 (2026-10-10)
- Crossroads: when the host leaves, the game ends for everyone, whether the seats are friends or CPUs. That's the Leave button, going back to the menu, or closing or reloading the game; the others see "The host left, so the match is over." A host can't resume a game any more, so nothing is left waiting on the menu
- If the host's connection just drops, the others wait a minute (it can be a short glitch), with a countdown, then the match ends

## 0.19.2 (2026-10-10)
- Fixed: a dragged card could stay stuck on the screen, even on the menu, if a second finger touched the screen during a drag (or the browser missed the release). Holds for the card picker, 1v1 and Crossroads
- 1v1 on phones: the score numbers glow in each player's colour, like they do on wider screens
- Crossroads room on a computer: Ready / Start sits under the rules with no dark strip behind it, and floats at the bottom of a short window until you scroll to it

## 0.19.1 (2026-10-10)
- Crossroads: flips animate again, one after another like 1v1 (Same! / Plus! / Combo! first, the colour turns halfway). They were being cut off before they could play. The host waits for each move's animation before a CPU moves, and the turn timer doesn't run while you watch one
- Crossroads Free-for-all: turns go round the table from a random first player, like 2v2. The first player no longer moves on each round, which felt like a skipped turn
- Crossroads room: the turn timer is the same slider as 1v1 (off, or 10 to 90 seconds), the **Random** rule is there, and the host can invite friends while a seat is open or a CPU's
- Crossroads results: everyone gets **Back to room**, not just the host, and it takes the whole table back. Fixed: after the first match, players who weren't the host didn't see the result screen

## 0.19.0 (2026-10-09)
- New: **Crossroads**, online games for 4 players, being tested. **Host a game** now asks: **1v1** or **Crossroads**. Friends join with the code in the usual Join box. Four seats on a 4×4 board: everyone places 4 cards and keeps 1. The host picks the mode:
  - **2v2**: two teams, turns switch team every move, partners never flip each other and see each other's hands
  - **Free-for-all**: everyone for themselves, each in their own colour (picked in the room from 6, the same on everyone's screen). The first player moves one seat each round, so everyone opens once and closes once and nobody plays twice in a row. The result shows places 1st to 4th; tied players share a place
- Empty seats can be **CPU Easy** (plays like a casual player: some turns it thinks a move ahead, some it doesn't) or **CPU Normal** (a move ahead, sometimes two, and about 1 turn in 10 it slips)
- The host can move players to the other team in 2v2 (**Switch team**) and **Remove** a player from the room
- New rule for Crossroads, **Ley lines** (off unless the host turns it on): fill a row or column with your (team's) cards and it seals, so those cards can't be flipped again
- A player who drops out has a minute to come back before a CPU plays their cards; they can rejoin from the menu at any point and take their seat back. A host whose app closes can **Resume** the match from the menu
- Crossroads has no trades and pays no XP or shards while it's being tested

## 0.18.1 (2026-10-06)
- Tutorial: the Next lesson button is smaller, just big enough for its text

## 0.18.0 (2026-10-05)
- New rule **Reverse**: lower numbers win. A 1 beats a 2, and X is the weakest. Same and Plus work as usual
- New rule **Three open**: 3 random cards in each hand are face up for both players. 👁 marks the cards both of you can see
- **Sweep** is now a rule card instead of a trade rule: win owning the whole board and you take all 5 cards, whatever the trade. It's off when the trade is None. If you played with trade Sweep, you now have trade One with the Sweep card on
- How to play: a new Reverse tab with an example, and Three open and Sweep added to the Hands and Trade tabs

## 0.17.14 (2026-10-05)
- iPhone home-screen app: the strip behind the clock now matches the top of each screen (the night sky on the Night Market), and the page fades into it. Everything starts a little lower, so iPhone's blur under the clock no longer softens the logo or headings
- Fixed a thin line at the bottom left of the rules screen, under the **Choose cards** button

## 0.17.13 (2026-10-05)
- iPhone home-screen app on iOS 27: the strip along the bottom can't be removed (iOS keeps it for itself), so every screen now fades softly into it instead of ending in a hard line. Pop-ups too
- Fixed: going back to the main menu didn't always refresh it, and a match didn't always resize to fit when it started

## 0.17.12 (2026-10-05)
- New order for the mode tabs: **Solo · Daily · Online · Couch**. Playing on your own comes first, then playing with others

## 0.17.11 (2026-10-05)
- New names for two modes: **vs Computer** is now **Solo**, and **Same screen** is now **Couch**, each with a new icon: one player for Solo, two side by side for Couch
- The mode icons now show on phones too (all but the narrowest)

## 0.17.10 (2026-10-05)
- iPhone home-screen app: no more plain bar along the bottom of every screen. The game now reaches the bottom edge, and the clock and battery get their own strip at the top. To get this, remove Leylines from your home screen and add it again

## 0.17.9 (2026-10-05)
- Night Market on phones: the market fits the screen with no scrolling. On smaller screens the Merchant's cards shrink a little to make room
- Night Market in light mode: the iPhone's top blur and bottom strip stay night-dark instead of showing a pale band

## 0.17.8 (2026-10-05)
- On phones, the big **Sudden Death!** banner now fits on screen instead of running off the edge. Long player names in "… goes first" fit too

## 0.17.7 (2026-10-05)
- No more turn timer in the Daily. Take your time on the Duel, the Puzzle and the Gauntlet
- vs Computer now has its own turn timer, and it starts off. Turn it on in the rules if you like the pressure. Online and Same screen keep the timer you set

## 0.17.6 (2026-10-04)
- Signed in and played a few matches? A small tip on the main menu offers to turn on alerts, so you never miss an invite. **Not now** asks again in 3 days; ✕ hides it for good

## 0.17.5 (2026-10-04)
- Settings no longer shows an empty Alerts row when the server has alerts turned off
- When your phone or computer blocks alerts, the game now says so and tells you where to turn them on, instead of "Registration failed - permission denied"

## 0.17.4 (2026-10-04)
- Gauntlet: before a new run after your first one, the game says what it pays. If your first run already earned today's shards, it tells you the new run gives no rewards

## 0.17.3 (2026-10-04)
- The Alerts switch in Settings now always shows up. Once alerts are on, a **Test** button sends one to check they reach you
- Minimising the game no longer makes you go offline. Friends see you as **Away**, can still invite you, and you get an alert if you turned them on

## 0.17.2 (2026-10-04)
- How to play: **Sudden death** now has its own tab with an example. After a draw, your new hand is every card in your colour, so cards you flipped come with you
- How to play's tabs are back in one row you can swipe, with the arrow

## 0.17.1 (2026-10-04)
- How to play no longer scrolls. Every tab is short, Tips has its own tab, and the other rules are split into Hands, Board, Match and Trade. On a phone the tabs sit in two rows

## 0.17.0 (2026-10-04)
- **New main menu layout.** The six buttons are now one size and in a new order: Friends, Leaderboard, Collection, Night Market, Packs and How to play. On a phone the whole menu fits on one screen, with no scrolling
- The Store is now called the **Night Market**, and its button shows when the stock changes
- Your shards now sit on the right of your player card
- The menu buttons share one look, with simple line icons (Packs has a new one)

## 0.16.1 (2026-10-04)
- Tutorial: when two number tags show at once, both stay bright, and the lit numbers on a card no longer bump into each other

## 0.16.0 (2026-10-04)
- **New: a tutorial.** New players get 4 quick lessons on the real board: capture, Same, Plus and Combo. Finish them for a free Arcane pack, or skip it any time. Replay it from How to play
- **How to play is simpler.** 5 tabs instead of 15: Basics, Same, Plus, Combo and More. The examples now show which numbers touch (like 8 = 8 or 2 + 3 = 5), plus a move that doesn't work, and each rule has a Try it button

## 0.15.0 (2026-10-04)
- **The Store on a phone opens on the night sky.** Tap a star to bring up the market on that stop, then swipe left and right between the Merchant, the deal, the Pack Counter and the Shard well. Swipe past the first or the last stop to go back to the sky

## 0.14.1 (2026-10-04)
- Signing out now gives this device a fresh start. Your progress stays safe on your account, ready for when you sign in again
- Online matches with a guest in them are played without card bets. The waiting room says why. Both players need an account to play for cards
- Guests see a reminder on the menu after their first match: their progress is saved on this device only
- Signing in on a device with guest progress now warns you first that it will be replaced

## 0.14.0 (2026-10-04)
- **Alerts.** Turn them on in Settings to hear about invites, friend requests and matches you left, even with the game closed. On iPhone and iPad, add Leylines to your home screen first
- Friends with alerts on can be invited even when their game is closed. Invites now wait 2 minutes for an answer

## 0.13.0 (2026-10-04)
- **The Store is now the Night Market.** Four stops under a starry sky: the Merchant's cards, the deal of the night, the Pack Counter and the Shard well, with a countdown to midnight. On a wide screen they sit side by side; on a phone, tap a star on the sky map to open that stop. Pull the panel down to see just the sky, with no names or buttons and your phone's time and date in place of the countdown (a clean screenshot or wallpaper). Tap the sky to bring back the top bar, or any star to bring the panel back

## 0.12.2 (2026-10-04)
- Small fixes

## 0.12.1 (2026-10-04)
- Invites, friend requests and friends coming online now show up instantly
- The Invite button reacts straight away, and your friend gets the invite in a blink
- Friends count as online on any screen, not just the main menu. They only drop off while they're in a match or the game is in the background

## 0.12.0 (2026-10-04)
- **Invite friends to a match.** Friends who are on the main menu show up under Friends and in your room. Tap **Invite** and they get a pop-up to join
- When you leave a match, you now find out within seconds if your opponent took your cards or spared you. No more reloading
- Friend requests and answers show up within seconds too

## 0.11.0 (2026-10-04)
- **Diff** trade rule changed: the winner still takes as many cards as the score difference, but only from the loser's cards they flipped. Cards they didn't flip are greyed out

## 0.10.2 (2026-10-04)
- The alpha note now says your collection could be reset too

## 0.10.1 (2026-10-04)
- Wide screens: the card you pick slides out and the stack opens around it, so the next card is easy to tap
- Wide screens: big scores under each player's cards, level with the bottom of the board, with a little pop when they change

## 0.10.0 (2026-10-04)
A cleaner Play card.
- Every mode on the Play card now has the same layout: a picture, quick facts, and the buttons at the bottom
- vs Computer, Online and Daily show the same bar above their buttons: XP, shards, and shards left today (or packs left in Daily)
- Daily on the Play card: a stamp for each challenge lights up when it's done, and only the next challenge is pink
- Same screen: **Quick play** starts right away with the same rules and cards as your last game, or pick new rules and cards

## 0.9.1 (2026-10-04)
- On iPhone Safari, a small guide shows how to add Leylines to your home screen and play it like an app (close it and it stays away for 30 days)

## 0.9.0 (2026-10-04)
- What's new: tap the version next to the menu title to see the latest changes, and scroll for older versions

## 0.8.0 (2026-10-04)
A real leveling system.
- Level road repeats every 10 levels: Leyline at levels ending in 5, Mythic at levels ending in 0 from Lv 20 (Lv 10 is a Leyline; all 4★ milestones), 4 small packs between (Spark, Arcane from Lv 21)
- XP depends on the opponent: CPU Easy 20 / Normal 40 / Hard 60 a win, Daily Duel 50, Gauntlet Boss 80, online 60 (20 for a loss)
- Leaving a match early gives no XP; the Daily Puzzle now gives 50 XP
- Spare packs are your level's small pack
- 5★ guarantee needs 50 points (was 40)
- Daily pack: the day 7 box no longer shows a light line on its bottom and right edges

## 0.7.1 (2026-10-04)
- 5★ guarantee uses points: Spark +1, Arcane +3, Leyline +5, Mythic +10; the pack that reaches 40 ends with a 5★ (your old count stays, now out of 40)
- A 5★ guarantee bar on the Packs screen and in the Store, instead of the wrong "packs to go" count

## 0.7.0 (2026-10-04)
The Store and Ley Shards.
- Ley Shards: earned from CPU and online matches (up to 250 a day) and the Daily tab; everyone starts with 150
- Store tile on the menu, beside Packs
- Wandering Merchant: 4 cards and a discounted pack, new every day; one card is one you haven't found yet
- Pack Counter: buy any pack tier with shards (one Mythic a week)
- Gauntlet's daily reward is now 75 shards instead of 100 XP; Daily Duel and Daily Puzzle also pay shards
- Match results show the shards you earned

## 0.6.5 (2026-10-04)
- Choosing 5 cards before a match now uses the Collection binder: rarity tabs, pages, tap a card to add it, Play in the hand tray

## 0.6.4 (2026-10-04)
- New link picture for shared links: drawn from the real game cards (10 shows as X), made by `node tools/og-image.js`

## 0.6.3 (2026-10-04)
- Daily pack, Daily tab and spares use the server's clock, so changing the device's date no longer gives extra dailies
- The game day now resets at midnight Arabia time (UTC+3) for every player
- Saves that claimed dailies in the future wait one day instead
- Packs tile no longer shows a "0" when there's nothing to open

## 0.6.2 (2026-10-04)
- Same screen: pick only from cards this account has found (even lost ones), up to 5 copies of each

## 0.6.1 (2026-10-04)
- NEW tag on cards you've never found when taking cards after a win

## 0.6.0 (2026-10-04)
Friends, leaderboard and the Daily tab.
- Friends: requests, friend list and profiles
- Leaderboard with streaks (online matches only)
- Match history on the profile
- Daily tab: Daily Duel, Daily Puzzle and Gauntlet
- Leaving early costs cards; online players can spare
- Alpha notice on the menu
- The account's progress always wins over the device's
- Version number next to the title

## 0.5.0 (2026-10-02)
Series, iPhone app and emotes.
- Best-of series (single, best of 3, best of 5)
- Online waiting room
- Chaos rule
- Protected player emails, security headers, forgot password
- Automatic tests
- Home-screen app on iPhone
- Online players can come back after dropping out
- Quick emotes
- 10 shows as X on cards

## 0.4.0 (2026-10-01)
Accounts and the server.
- Game split into client, server and database
- Accounts with cloud save (Postgres on Neon)
- Player profiles: level, badges, avatar, showcase
- Card packs: one per level, a daily pack, tear-to-open reveals

## 0.3.0 (2026-09-30)
Collection and decks. The game becomes Leylines.
- Deck picker with saved loadouts
- Card binder collection with page turns
- Rarity (1★ Common to 5★ Legendary) and deck limits
- Music and volume sliders
- Sweep trade rule
- Renamed from Project A to Leylines, with the logo kit

## 0.2.0 (2026-09-29)
Online play and the redesign.
- Online play with names, HOST/GUEST tags and reconnects
- Turn timer
- Full UI redesign, settings and How to play
- Rule cards in match setup

## 0.1.0 (2026-09-29)
- First playable card game (Project A)

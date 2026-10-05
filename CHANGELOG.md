# Changelog

The version shows next to the title on the menu. It lives in
`client/js/version.js`, `package.json` and the top entry below; `npm test`
fails if they don't match. How to bump it is in `CLAUDE.md`.

Versions before 0.6.0 were worked out afterwards from the commit history.

## 0.17.14 (2026-10-05)
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

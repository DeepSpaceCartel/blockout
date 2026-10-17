<title>Run the phone app</title>

# Run the phone app

`apps/mobile` is Blockout as a React Native app, built with Expo, for phones and tablets. It's not the web page in a frame: the board, dice and keypad are native. It plays by the same rules as the web game (`@blockout/engine/match`), and keeps the same save (`@blockout/progress`), synced with the account when you sign in.

**What's in it:** everything in the web game's multiplication, except the other games (addition, fractions and the rest):

- you against the CPU, or 2 to 4 players on one phone; every difficulty, Expert levels and timers, boards up to 24 × 24, real dice, and drawing, tapping or auto placing
- practice, with its tables, question counts and timers
- the Shop, achievements, stickers, stats, the daily check-in, settings and the Wardrobe
- signing in with Google (through Keycloak), with the save synced with the web game
- for a student: homework, joining a class, grown-up codes, and live classes (the whole class's games, pairs and tournaments)
- for a teacher: My classes (roster, homework, planned tournaments, teacher codes) and hosting a live class
- for a grown-up: My kids; for an admin, the admin page

The rules, words and rewards are shared with the web game (`@blockout/engine`, `@blockout/progress`), so both play the same.

## Try it in Expo Go

1. Install **Expo Go** on the phone, from the App Store or Google Play. The app uses Expo SDK 57, the newest one the App Store's Expo Go runs. (Expo Go runs one SDK at a time: move the app to a newer SDK only once the stores' Expo Go supports it, or a phone shows "Project is incompatible with this version of Expo Go".)
2. In the dev container, start the app with a tunnel. The phone can't reach the container directly:
   ```sh
   npm run tunnel --workspace @blockout/mobile
   ```
3. In a terminal, Expo shows a QR code: scan it with the phone's camera (iPhone) or with Expo Go (Android). Without a terminal, the address is the manifest's host, `exp://<something>.exp.direct`: in Expo Go, **Enter URL manually**.

Changes to the code reload the app on the phone by themselves.

**An Expo account on both ends:** Expo Go only opens a project from a tunnel when the dev server signs its manifest, so sign in once with the same free account (expo.dev) on both:

- **Expo CLI:** `npx expo login`, in `apps/mobile`. It's kept in `~/.expo/state.json`, so do it again after the dev container is rebuilt. Or set `EXPO_TOKEN` to an access token from expo.dev.
- **Expo Go:** its **Settings** tab.

Without them, Expo Go says "You need to be signed in to Expo Go and Expo CLI to open your project". With them, the tunnel's address carries the account's name (`exp://<id>-<account>-8081.exp.direct`).

The "React Native DevTools" error when the dev server starts is about the desktop debugger, which needs GTK libraries the dev container doesn't have. It doesn't affect the app.

## Signing in

The app signs in as its own Keycloak client, **`blockout-mobile`**: public, with PKCE, in the system browser. On iOS it uses a private browser session, so a shared iPad never stays signed in. Its access tokens name `blockout` as their audience, so the server accepts them like the web game's.

The chart sets the client up: `keycloak.mobile.redirectUrls` lists the addresses Keycloak may send the app back to.

| Address | For |
|---|---|
| `blockout://*` | The app built with its own scheme (`app.json` › `scheme`) |
| `exp://*` | Expo Go. Its addresses change with the network, so this allows any of them: **development only**, never in production |
| `http://localhost:8081/*` | The app's web build, for automated checks |

The app finds the server and the client in `app.json` › `extra` (`server`, `keycloakClientId`).

## Check it without a phone

The same code runs in a browser through `react-native-web`, so Playwright can play it:

```sh
cd apps/mobile && npx expo export --platform web --output-dir /tmp/mobile-web
```

Check both a big and a small phone: 390 × 844 and 375 × 667 (iPhone SE). Nothing on the answer screen may fall below the bottom edge.

In the web build only, `window.BLOCKOUT_FAST = true` (set before the page loads) makes every wait 20 times shorter. `window.BlockoutMobile` holds the running `match` and the `Match` functions, so a test can find where a rectangle fits and then draw it with the mouse.

## How it's built

| File | What |
|---|---|
| `src/App.js` | The menu or the game, the save, signing in, and the bonus and achievement banners |
| `src/Game.js` | A game: turns from `@blockout/engine/match`, on screens sized to the phone (nothing scrolls). **Roll:** big dice, then "Draw it ›", which also moves on by itself after a moment. **Board:** drawing, the CPU's turn (its rectangle grows, it explains the counting) and the results. **Answer:** the question and the keypad. **Help:** "Help me count" (or two wrong answers): the rectangle on its own, its rows lighting up with the running total, then "I know it! ›" back to the answer; the time spent counting doesn't count against the bonuses |
| `src/Board.js` | The board in SVG (`react-native-svg`); a drag (`PanResponder`) draws a rectangle |
| `src/account.js` | Signing in (`expo-auth-session`), tokens in `expo-secure-store`, the API, saving and syncing |
| `src/sync.js`, `src/rewards.js`, `src/boardMath.js` | The parts with no React Native in them, tested with `node --test` |

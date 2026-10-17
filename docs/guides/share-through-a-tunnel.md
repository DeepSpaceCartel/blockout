<title>Share through a tunnel</title>

# Share the game through a Cloudflare tunnel

When students' devices can't reach your computer directly.

1. Start a quick tunnel and note the `https://….trycloudflare.com` address it prints:
   ```sh
   cloudflared tunnel --url http://localhost:8080
   ```
2. Start (or restart) Blockout with that address, so join links and QR codes use it:
   ```sh
   npm start -- --public-url https://<name>.trycloudflare.com
   ```
3. Check it: open the tunnel address; `…/api/health` should answer `{"ok":true,…}`.

The address changes every time the tunnel restarts; repeat step 2 with the new one. Live classes work through the tunnel even though it buffers event streams: the game falls back to long polling after a few seconds.

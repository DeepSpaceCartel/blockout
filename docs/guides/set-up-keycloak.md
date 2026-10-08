<title>Switch sign-in to Keycloak</title>

# Switch sign-in to Keycloak

Keycloak replaces the practice "dev sign-in" with real accounts, and lets people sign in with Google. Guests can still play everything except hosting a class.

This guide runs Keycloak in the Kubernetes cluster that the dev workspace runs in, and reaches it on `http://localhost:8180` through a port-forward. That's for development: only the browser of the person running the port-forward can sign in. A classroom needs Keycloak on a public HTTPS address (see [On a public server](#on-a-public-server)).

## What runs where

| Piece | Where | What it's for |
|---|---|---|
| Keycloak 26 (Helm chart `codecentric/keycloakx`) | namespace `keycloak` | Sign-in, accounts and roles; sends people on to Google |
| Postgres 17 | namespace `keycloak`, a 10 GB volume | Keycloak's data: users, roles, the realm |
| Secrets `keycloak-admin`, `keycloak-db`, `google-oauth` | namespace `keycloak` | Random passwords, and the Google client secret. Never in the repo. |
| The `blockout` realm | `deploy/keycloak/realm-blockout.json` | The `blockout` client, the roles, Google sign-in, an 8-hour token lifespan |
| The port-forward | the workspace (`npm run keycloak`) | Makes Keycloak `http://localhost:8180` in the workspace and, through VS Code, in your browser |

Everything is in [`deploy/keycloak/`](https://github.com/alexanderilyin/blockout/tree/v0.3.0/deploy/keycloak): `install.sh`, the chart's `values.yaml`, `postgres.yaml` and the realm.

Sign-in goes Blockout → Keycloak → Google and back. Blockout only knows the Keycloak client `blockout`; only Keycloak knows the Google client.

## Before you start: a Google OAuth client

Once per Google Cloud project. Skip it if the client already exists, but keep its secret at hand.

1. In [Google Cloud Console](https://console.cloud.google.com/auth/clients), open **Clients** › **Create client**, type **Web application**.
2. **Authorized JavaScript origins:** leave empty.
3. **Authorized redirect URIs:** `http://localhost:8180/realms/blockout/broker/google/endpoint`
4. Create it, and copy the **client secret**. The client ID is already in `realm-blockout.json`; if you made a new client, put its ID there (`identityProviders[0].config.clientId`).
5. While the app's **Audience** is in Testing, add every Google account that should sign in as a **test user**.

## Install, or reinstall after a cluster rebuild

You need `kubectl` and `helm` with access to the cluster (the dev container has both).

```sh
deploy/keycloak/install.sh
```

It creates the namespace and Secrets, starts Postgres, loads the realm and installs Keycloak, then waits until it's ready (a few minutes the first time). When there's no `google-oauth` Secret yet, it asks for the Google client secret; `GOOGLE_CLIENT_SECRET=… deploy/keycloak/install.sh` gives it without asking.

It's safe to run again: it keeps the Secrets and the data, so rerun it after changing `values.yaml` or the chart version.

## Use it

1. **Forward Keycloak** to `localhost:8180` and leave it running:
   ```sh
   npm run keycloak
   ```
   The port-forward stops when Keycloak restarts (for example after `install.sh`); run it again.
2. **Start Blockout with Keycloak sign-in:**
   ```sh
   BLOCKOUT_AUTH=keycloak \
   KEYCLOAK_ISSUER=http://localhost:8180/realms/blockout \
   KEYCLOAK_CLIENT_ID=blockout \
   npm start
   ```
3. **Sign in:** open `http://localhost:8080`, then **Sign in** › **Sign in** › **Google**. Check `http://localhost:8080/api/auth/config` shows `"provider":"keycloak"` if it doesn't send you to Keycloak.

Blockout must be on `http://localhost:8080` or `http://localhost:5173`: those are the only addresses Keycloak sends people back to.

**Signing out** of Blockout also signs out of Keycloak, so the next **Sign in** on a shared Chromebook asks again instead of quietly being the same child. It doesn't sign out of Google (only Google can, and then for all of Google in that browser), but Google always shows its account chooser (the Google provider's `prompt` is `select_account`), so picking another account is one tap. After signing out of a Google account, Blockout offers **Also sign out of Google**, which opens Google's sign-out in a new tab. It knows the account came from Google from the `identity_provider` claim that the `blockout` client adds to the ID token.

## Make someone a teacher or a parent

Google accounts arrive without a role. Blockout makes a school-domain account (`@iusd.org`) a student and anyone else a parent. To make someone a teacher:

1. Open the admin console, `http://localhost:8180/admin`, user `admin`. The password:
   ```sh
   kubectl -n keycloak get secret keycloak-admin -o jsonpath='{.data.password}' | base64 -d
   ```
2. Switch to the **blockout** realm, then **Users** › the person › **Role mapping** › **Assign role** › `teacher`.
3. They sign out of Blockout and in again.

They need to have signed in once first, so that Keycloak has their account.

## Change the realm

`realm-blockout.json` is only read when Keycloak starts with **no** `blockout` realm: after a cluster rebuild, or a fresh install. On a running Keycloak, an existing realm is left alone.

- **To change a running Keycloak,** use the admin console, and make the same change in `realm-blockout.json` so the next rebuild has it.
- **To start the realm over from the file** (this deletes every account in it): delete the realm in the admin console (**Realm settings** › **Action** › **Delete**), run `install.sh` (it loads the new file), then `kubectl -n keycloak rollout restart statefulset/keycloak-keycloakx`.

## Change the Google client secret

The realm refers to it as `${vault.google-secret}`: Keycloak reads it from the `google-oauth` Secret, mounted in its pod, and never stores it.

```sh
kubectl -n keycloak create secret generic google-oauth --from-literal=secret='<new secret>' \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl -n keycloak rollout restart statefulset/keycloak-keycloakx
```

## Remove it

```sh
helm uninstall keycloak -n keycloak
kubectl delete namespace keycloak
```

This deletes the Secrets and the database volume too, so every account. Reinstall with `install.sh`.

## When it goes wrong

| What you see | Why, and the fix |
|---|---|
| The browser can't reach `localhost:8180` | The port-forward isn't running: `npm run keycloak`. Or VS Code isn't forwarding 8180: add it in the **Ports** panel. |
| Keycloak says **Invalid parameter: redirect_uri** | Blockout isn't on `localhost:8080` or `:5173`. |
| Google says **redirect_uri_mismatch** | The redirect URI in Google Cloud Console isn't exactly `http://localhost:8180/realms/blockout/broker/google/endpoint`. |
| Google says **Access blocked** or the app isn't verified | Add your Google account as a test user (Audience). |
| Back in Blockout, "Sign-in token is from somewhere else" | `KEYCLOAK_ISSUER` isn't exactly `http://localhost:8180/realms/blockout`. |
| Signed out after a while | Tokens last 8 hours, and Blockout doesn't refresh them yet: sign in again. |
| `install.sh` waits and then fails | `kubectl -n keycloak get pods` and `kubectl -n keycloak logs keycloak-keycloakx-0`. Keycloak restarts once if Postgres is still starting; that's fine. |

## On a public server

For classrooms, Keycloak needs a public HTTPS hostname, and so does Blockout:

- Set `KC_HOSTNAME` in `values.yaml` to Keycloak's public address, and expose it (in this cluster: a listener on the shared gateway, the certificate and a DNS record).
- In `realm-blockout.json` and in the running realm, add Blockout's public address to the `blockout` client's redirect URIs and web origins.
- In Google Cloud Console, add `https://<keycloak>/realms/blockout/broker/google/endpoint` as a redirect URI.
- To let only school accounts in, set the Google provider's **Hosted domain** (for example `iusd.org`). That also stops parents with other Google accounts from signing in.
- Start Blockout with `KEYCLOAK_ISSUER=https://<keycloak>/realms/blockout`.

See [ADR-0002](../decisions/0002-swappable-sign-in.md) for how sign-in is built.

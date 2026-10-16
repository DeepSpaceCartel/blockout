<title>Switch sign-in to Keycloak</title>

# Switch sign-in to Keycloak

Keycloak replaces the practice "dev sign-in" with real accounts, and lets people sign in with Google. Guests can still play everything except hosting a class.

Keycloak is part of the `blockout` chart: installing Blockout installs it ([Deploy to a cluster](deploy.md)). In the workspace cluster it's at `https://id.deepspacecartel.com`, and development servers on `localhost` sign in there too.

## What runs where

| Piece | Where | What it's for |
|---|---|---|
| Keycloak 26 (the `codecentric/keycloakx` chart) | StatefulSet `blockout-keycloakx` | Sign-in, accounts and roles; sends people on to Google |
| Postgres 17 | StatefulSet `blockout-keycloak-db`, a 10 GB volume | Keycloak's data: users, roles, the realm |
| Secrets `blockout-keycloak-admin`, `blockout-keycloak-db`, `blockout-keycloak-google` | the release's namespace | Random passwords made by the chart, and the Google client secret (`keycloak.google.clientSecret`). Never in the repo. |
| The `blockout` realm | `deploy/blockout/files/realm-blockout.json` | The `blockout` client, the roles, Google sign-in, token lifespans |
| The realm job | Job `blockout-keycloak-realm`, after each install and upgrade | Keeps the realm in line (see [Change the realm](#change-the-realm)) |

Sign-in goes Blockout → Keycloak → Google and back. Blockout only knows the Keycloak client `blockout`; only Keycloak knows the Google client.

## A Google OAuth client

Once per Google Cloud project. Skip it if the client already exists, but keep its secret at hand.

1. In [Google Cloud Console](https://console.cloud.google.com/auth/clients), open **Clients** › **Create client**, type **Web application**.
2. **Authorized JavaScript origins:** leave empty.
3. **Authorized redirect URIs:** `https://<keycloak>/realms/blockout/broker/google/endpoint`, for example `https://id.deepspacecartel.com/realms/blockout/broker/google/endpoint`.
4. Create it, and copy the **client secret** into your secrets file (`keycloak.google.clientSecret`). The client ID is already in `realm-blockout.json`; if you made a new client, put its ID there (`identityProviders[0].config.clientId`).
5. While the app's **Audience** is in Testing, add every Google account that should sign in as a **test user**.

## Sign in from a development server

The workspace's Keycloak accepts `http://localhost:8080` and `http://localhost:5173` (`keycloak.extraRedirectUrls` in `values-workspace.yaml`):

```sh
BLOCKOUT_AUTH=keycloak \
KEYCLOAK_ISSUER=https://id.deepspacecartel.com/realms/blockout \
KEYCLOAK_CLIENT_ID=blockout \
npm start
```

Then open `http://localhost:8080`, **Sign in** › **Sign in** › **Google**. Check that `http://localhost:8080/api/auth/config` shows `"provider":"keycloak"` if it doesn't send you to Keycloak.

**Signing out** of Blockout also signs out of Keycloak, so the next **Sign in** on a shared Chromebook asks again instead of quietly being the same child. It doesn't sign out of Google (only Google can, and then for all of Google in that browser), but Google always shows its account chooser (the Google provider's `prompt` is `select_account`), so picking another account is one tap. After signing out of a Google account, Blockout offers **Also sign out of Google**, which opens Google's sign-out in a new tab. It knows the account came from Google from the `identity_provider` claim that the `blockout` client adds to the ID token.

## The admin console

It isn't public. Forward it and leave the forward running:

```sh
npm run keycloak          # http://localhost:8180/admin, user admin
kubectl -n blockout get secret blockout-keycloak-admin -o jsonpath='{.data.password}' | base64 -d
```

## Make someone an admin

Blockout keeps everyone's role itself: anyone who signs in is a student, and one-time codes make teachers and grown-ups ([Admins](admins.md)). Keycloak only says who's an **admin**:

1. Open [the admin console](#the-admin-console) and switch to the **blockout** realm.
2. **Users** › the person › **Role mapping** › **Assign role** › `admin`.
3. They sign out of Blockout and in again, and find **Admin** on their account page (or go to `/admin/`).

They need to have signed in once first, so that Keycloak has their account. Taking the role away works the same way, and counts from their next token (15 minutes at most).

## Change the realm

`realm-blockout.json` is only read when Keycloak starts with **no** `blockout` realm: on the first install, or with an empty database. After every install and upgrade, the realm job brings the realm in line, new or existing:

- **The `blockout` client** accepts only Blockout's addresses (`publicUrl` and `keycloak.extraRedirectUrls`) to send people back to.
- **The `admin` realm role** exists.
- **Brute-force protection** is on, and passwords are at least 10 characters.
- **Mail:** with `keycloak.smtp` (`host`, `port`, `from`, `user`, `password`, or `existingSecret`), Keycloak checks new accounts' email addresses and lets people reset passwords. Without it, both are off, because nothing could send the mail.

For anything else, change the running realm in the admin console, and make the same change in `realm-blockout.json` so a fresh install has it.

**Who can sign in:** with **User registration** on (the realm's `registrationAllowed`), anyone can make an account, and Google lets anyone with a Google account in. That's safe because a new account is only a student until a teacher's or a grown-up's code changes it ([ADR-0008](../decisions/0008-roles-in-blockout.md)). To let only school accounts in through Google, set the Google provider's **Hosted domain** (for example `iusd.org`); that also keeps out grown-ups with other Google accounts.

## Change the Google client secret

The realm refers to it as `${vault.google-secret}`: Keycloak reads it from the `blockout-keycloak-google` Secret, mounted in its pod, and never stores it. Put the new one in your secrets file, upgrade, and restart Keycloak (it reads the file when it starts):

```sh
deploy/blockout/install.sh <version> -f secrets.yaml
kubectl -n blockout rollout restart statefulset/blockout-keycloakx
```

Restart it the same way after changing `keycloak.url`.

## When it goes wrong

| What you see | Why, and the fix |
|---|---|
| Keycloak says **Invalid parameter: redirect_uri** | Blockout's address isn't `publicUrl` or in `keycloak.extraRedirectUrls`. Add it and upgrade. |
| Google says **redirect_uri_mismatch** | The redirect URI in Google Cloud Console isn't exactly `https://<keycloak>/realms/blockout/broker/google/endpoint`. |
| Google says **Access blocked** or the app isn't verified | Add your Google account as a test user (Audience). |
| Back in Blockout, "Sign-in token is from somewhere else" | `KEYCLOAK_ISSUER` (the chart's issuer) isn't exactly `<keycloak.url>/realms/blockout`. |
| Signed out after a while | Access tokens last 15 minutes and Blockout renews them with the refresh token, until the Keycloak session ends (8 hours idle, 10 at most): then sign in again. |
| The install waits and then fails | `kubectl -n blockout get pods`, then `kubectl -n blockout logs blockout-keycloakx-0`, and the realm job's log: `kubectl -n blockout logs job/blockout-keycloak-realm`. Keycloak restarts once if Postgres is still starting; that's fine. |

See [ADR-0002](../decisions/0002-swappable-sign-in.md) for how sign-in is built.

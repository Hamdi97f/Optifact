# opt/build/

⚠️ **Do not delete this folder.**

The Netlify site is configured with **Base directory = `/opt/build`** in the UI.
This folder exists only to satisfy that setting so the deploy doesn't fail with
`Base directory does not exist: /opt/build`.

The real project lives at the repo root. The `netlify.toml` in this folder
delegates the build back to the root (`cd ../.. && npm ci && npm run build`)
and publishes `../../dist`.

If you ever clear the Base directory field in the Netlify UI, this folder can
be removed and the root-level `netlify.toml` will take over.

# Charlotte's PhD – personal project tracker

A static website (no backend, no build step). Open `index.html` through any web server.
Without OneDrive it still works fully and saves to the browser on that device; with OneDrive it
syncs automatically and can be opened from any computer.

## Run it
- Quick local use: in this folder run `python3 -m http.server 8080`, then open http://localhost:8080/
- Anywhere/any computer: upload the folder to a static host (GitHub Pages, Azure Static Web Apps, Netlify…).
  The site contains only code and quotes – never your data or any secret. Microsoft sign-in needs
  `https://` or `http://localhost`.

## Connect OneDrive (one-time, ~5 minutes, free)
1. Go to https://entra.microsoft.com → Identity → Applications → App registrations → **New registration**.
2. Name: `Charlotte's PhD`. Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**.
3. Redirect URI: platform **Single-page application (SPA)**, value = the exact address you open the site at
   (e.g. `http://localhost:8080/` or `https://yourname.github.io/phd/`). Settings → Data & OneDrive sync shows the exact value.
   You can add several (one per address you use).
4. After creating, copy the **Application (client) ID**.
5. Open the site → ⚙ Settings → Data & OneDrive sync → paste the client ID → *Save & connect* → sign in and accept
   the permission "Access your files" (`Files.ReadWrite`).
   (Or put the ID in `config.js` so it is pre-filled on every device.)
6. Repeat step 5 on your other computers (client ID is stored per browser unless it is in `config.js`).

Your data is one file: **OneDrive › CharlottePhD › phd-data.json**. A client ID is not a secret (public PKCE client);
no tokens are stored in site files. If your McGill account blocks "user consent" for new apps, either sign in with a
personal Microsoft account, or ask McGill IT to approve the app.

## How safe syncing works
- Every change is saved to the browser instantly and uploaded ~1 second later.
- Uploads are conditional on the file's ETag. If another computer changed the file, the app downloads it,
  merges item-by-item (newest edit wins per task/goal/project/to-do; deletions are remembered), then uploads.
- The header chip shows *Saved to OneDrive / Saving / Offline / Sync failed – retry*; click it to retry.
- Settings also has **Download JSON backup**, **Restore from backup**, and **Export to Excel** (Projects, Goals, Tasks, To-do sheets).

## Rules implemented
- Goal % = average of its tasks (not started 0, in progress 50, completed 100). Project % = completed tasks ÷ all tasks.
- Task deadline colours: >21 days normal, 15–21 yellow, 8–14 orange, ≤7 red, overdue red + "Overdue by N days"; completed tasks show "Completed <date>".
- A project at 100% moves to the Archive automatically; Restore returns it, and adding an incomplete task also returns it.
- Quote of the day: 400 quotes stored in `quotes.js` (from the MIT-licensed npm packages `success-motivational-quotes` and
  `inspirational-quotes`), one per day in a fixed shuffled order (same on every device, no repeats for 400 days).

## Files
`index.html`, `css/style.css`, `js/*.js` (util, model, sync, gantt, ui-common, export, app), `quotes.js`, `config.js`, `vendor/` (MSAL.js, SheetJS).

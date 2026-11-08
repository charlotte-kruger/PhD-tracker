# Charlotte's PhD – personal project tracker

A static website: no server, no account, no OneDrive. All data is saved automatically in your browser
(localStorage) after every change. Excel export and JSON backup are available any time in the header / Settings.

## Put it on GitHub Pages
1. Create a **public** repository (e.g. `phd`) on github.com.
2. Add file → Upload files → drag in everything inside this folder (index.html, css/, js/, vendor/, quotes.js, README.md) → Commit.
3. Settings → Pages → Source: *Deploy from a branch* → Branch `main`, folder `/ (root)` → Save.
4. After ~1–2 minutes open `https://YOURUSERNAME.github.io/phd/` (bookmark it).

The repository contains only code and quotes. Your project data never leaves your browser.

## Important about browser storage
Data belongs to one browser profile on one computer at the address you use. It does not follow you to another browser/computer,
and clearing site data deletes it. So: use the same address and browser every time, and now and then use
Settings → Data & backup → **Download JSON backup** (restore with *Restore from backup*). Use **Export to Excel** for a readable report.

## Rules implemented
- Goal % = average of its tasks (not started 0, in progress 50, completed 100). Project % = completed tasks ÷ all tasks.
- Task deadline colours: >21 days normal, 15–21 yellow, 8–14 orange, ≤7 red, overdue red + "Overdue by N days".
- A project at 100% moves to the Archive; Restore returns it; adding an incomplete task also returns it.
- 400 quotes in `quotes.js` (from MIT-licensed npm packages `success-motivational-quotes` and `inspirational-quotes`), one per day.

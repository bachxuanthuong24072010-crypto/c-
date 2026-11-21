CODING C++ - PWA FIX v5

Fixes included:
- Added Android install icons: 192x192, 512x512, and 512x512 maskable.
- Updated manifest with id, scope, start_url, standalone display, and icons.
- Bumped Service Worker cache to v5 and included app icons in precache.
- Bumped app CSS/JS query versions to v5.
- Updated reset-cache helper.

How to use:
1. Replace the matching files in your desktop project with this package.
2. Commit and push the changes to GitHub if you also want to update the GitHub Pages site.
3. On the phone, update the Termux project files too (or pull the new GitHub commit), then run npm start again.
4. Open http://127.0.0.1:8787/reset-cache.html in Chrome, let it redirect, then open the main page.
5. In Chrome menu, choose Install app. If not shown, check Site settings and Chrome's app install UI after a reload.

Reminder: Coding C++'s compiler still runs in Termux. Keep the Termux server active while using RUN/STOP.

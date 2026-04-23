Auto Claimer
============

What this is
------------
This little app logs into Epic Games Store, Amazon Prime Gaming, and GOG once a
day and claims any free games for you automatically.

How to use
----------
1. Right-click the downloaded AutoClaimer-0.1.0.zip -> "Extract All..." -> pick
   somewhere permanent (Documents is a good spot). Don't run it from inside the
   zip - extract first.
2. Open the extracted "AutoClaimer-0.1.0" folder.
3. Double-click "Auto Claimer.exe".
4. Windows will warn "Windows protected your PC / unrecognized app" - click
   "More info" then "Run anyway". This is normal for unsigned apps.
5. A welcome window opens. For each store:
   - Click "Log in", a browser pops up.
   - Log in with your account.
   - The browser will close itself when done.
6. Pick a daily run time (default 3 AM is fine for most people).
7. Done! It runs in your system tray (bottom-right of taskbar).

Don't move the folder after you've logged in
--------------------------------------------
Auto Claimer remembers where it lives so Windows can auto-start it on login.
If you move the folder later, open the app and re-save your settings so it
updates the auto-start location.

To open the dashboard later
---------------------------
Click the small Auto Claimer icon in your system tray.

To turn it off
--------------
Right-click the tray icon -> Exit.

To uninstall
------------
1. Quit it (right-click tray -> Exit).
2. Delete the whole "Auto Claimer" folder.
3. (Optional) Open "Task Manager" -> "Startup apps" and disable "Auto Claimer"
   if it's still listed.

Where your stuff lives
----------------------
Login cookies and claim history are stored in the "data" folder inside the
"Auto Claimer" folder. Your passwords are NOT stored anywhere - only browser
session cookies, same as if you'd logged into the websites in a normal browser.

Help / questions
----------------
Ask your friend who gave this to you.

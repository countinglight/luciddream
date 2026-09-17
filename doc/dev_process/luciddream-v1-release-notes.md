# LucidDream v1 — release notes

For beta testers. v1 is a beta release; these notes describe what to expect and what is known to be
unfinished. Last updated 2026-09-16.

## What changed in the hardening build

- **The screen stays dark.** A running night no longer keeps the phone's screen on. It lights only
  when you wake it yourself, by pressing a button or picking the phone up.
- **Nights that the phone cut short are shown as Interrupted.** If the phone stopped the app during
  the night (battery, a system kill, a crash), Nights shows the night as _Interrupted_, with the last
  time the app was known to be running, instead of showing it as still in progress.
- **Stop works immediately**, including while a night is still starting.
- **Scripts are checked when you add them.** A script with a mistake is refused at the moment you add
  it, with a message naming the script and the problem. Previously it was accepted and failed only
  when the night began. A spelling mistake in a script option (for example `wiatt` instead of `wait`)
  is now reported instead of silently ignored.
- **Library addresses must start with `https://`.** Addresses starting with `http://` are no longer
  accepted. If you saved one earlier, add it again with `https://`.
- **Delete frees the space.** Deleting a night or a library item now removes its files from the
  phone.
- **Voice interrupt keeps nothing.** The temporary microphone file it needs is deleted when the
  night ends, including after an interrupted night.
- **A problem shows a recovery screen** with a _Try again_ button, instead of a blank screen.

## Known limitations

- **Android: other audio pauses when a night starts.** To keep playing reliably with the screen off,
  Android requires LucidDream to take exclusive audio focus, so the _Audio focus_ setting is not
  applied on Android. The effect is limited to the moment the night starts: music or other audio
  playing at that moment pauses instead of getting quieter. Alarms and calls later in the night
  still take priority as usual.
- **Period presets are short.** `$short`, `$medium` and `$long` default to 5 seconds, 20 seconds and
  5 minutes, so scripts can be tried quickly during testing. They are not night-length values. You
  can change them in Settings. v2 will change the defaults.
- **Logs are larger than before.** Every event is now recorded, whatever the logging categories are
  set to; the categories only choose what is shown and exported. If log size causes you problems,
  please file an issue.
- **Some Android phones stop apps overnight regardless.** If nights end early, set LucidDream's
  battery setting to _Unrestricted_ in the phone's app settings.
- **Adding a script from a web address needs a connection at that moment**, because the script is
  downloaded and checked when you add it.

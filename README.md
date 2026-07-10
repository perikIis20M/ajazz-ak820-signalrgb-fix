**Description:**
```
Community fix for SignalRGB misidentifying the Ajazz AK820 as a Glorious GMMK 2 96%
```


# Ajazz AK820 Fix for SignalRGB

Community fix for a bug where SignalRGB misidentifies the **Ajazz AK820** (wired) 
as a **Glorious GMMK 2 96%**, because both keyboards share the same USB VID/PID 
(`0x320F` / `0x505B`). This causes the RGB to never initialize, with the console 
spamming:

```
hid.write.error - WriteFile: (0x00000001) Incorrect function
```

## What this fixes

- Narrows device matching so the AK820 is no longer confused with the GMMK 2 96%
- Adds a proper LED layout/model entry for the AK820, since none existed
- Fixes the RGB data buffer size sent to the keyboard
- Adds a small packet delay for stability

## Installation

1. Download `Ajazz_AK820_EVISION.js` from this repo
2. Place it in:
   ```
   %userprofile%\Documents\WhirlwindFX\Plugins
   ```
   (create the `Plugins` folder if it doesn't exist)
3. Fully restart SignalRGB
4. Your AK820 should now be detected correctly. If not, go to the device's settings 
   in SignalRGB and manually set **Forced Model** to `AK820`.

## Disclaimer

This is an unofficial, community-made fix, not affiliated with SignalRGB/WhirlwindFX 
or Ajazz. Use at your own risk. It worked for my AK820 (wired, standard, non-Pro/MAX) 
but I can't guarantee it works for every unit or firmware revision.

## Credits

me

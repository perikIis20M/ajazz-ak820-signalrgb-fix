**Description:**
```
Community fix for SignalRGB misidentifying the Ajazz AK820 as a Glorious GMMK 2 96%.
SignalRGB 2.5.74+ users must disable the bundled SRGBmods/qmk-plugins add-on.
```


# Ajazz AK820 Fix for SignalRGB

Community fix for a bug where SignalRGB misidentifies the **Ajazz AK820** (wired) 
as a **Glorious GMMK 2 96%**, because both keyboards share the same USB VID/PID 
(`0x320F` / `0x505B`). This causes the RGB to never initialize, with the console 
spamming:

```
hid.write.error - WriteFile: (0x00000001) Incorrect function
```

> [!IMPORTANT]
> SignalRGB 2.5.74 automatically enables
> `https://github.com/SRGBmods/qmk-plugins`. That add-on also claims USB ID
> `0x320F:0x505B` for the Glorious GMMK 2 96% and can override this AK820 plugin.
> Disable that add-on using the instructions below.

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
3. In SignalRGB, open **Settings → Add-ons**
4. Find `https://github.com/SRGBmods/qmk-plugins` and turn **Add-on Enabled** off
5. Fully restart SignalRGB when prompted
6. Your AK820 should now be detected correctly. If not, go to the device's settings
   in SignalRGB and manually set **Forced Model** to `AK820`.

Disabling `SRGBmods/qmk-plugins` may also disable SignalRGB support supplied by that
add-on for other QMK keyboards.

## Disclaimer

This is an unofficial, community-made fix, not affiliated with SignalRGB/WhirlwindFX 
or Ajazz. Use at your own risk. It worked for my AK820 (wired, standard, non-Pro/MAX) 
but I can't guarantee it works for every unit or firmware revision.

## Credits

me

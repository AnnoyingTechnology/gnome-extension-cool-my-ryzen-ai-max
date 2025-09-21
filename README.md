# Cool down your Ryzen AI Max

Depending on your AMD pstate (active or guided), your APU (Ryzen AI Max+ PRO 385/390/395) may have a PPT hovering around 13~15W or 9~12W while idle. 

On laptop this induces annoying wamrth in the laptop. 
Switching to the _"Power Saver"_ power profiler won't get you much lower (you may reach 7~8W with `p_state=active`).

## What is does

This extension forces the iGPU to its lower power mode instead of auto and allows the CPU to relax down to 1Ghz instead of the default 2Ghz floor in _"Power Saver"_;

Toggling this extension while on 
- "Balanced" power profile gets you **4W PPT**.
- "Power Saver" power profile gets you down to **3W PPT**.

When you untoggle the this extension, the iGPU returns to its default `auto` and the CPU floor rises to its defaults `2Ghz`.

Note that the CPU support frequencies down to 625Mhz but there isn't much to gain by going this low, and the scheduler/governor doesn't want to go so low anyways.

Toggling the extension will prompt you for authentication as it requires root privileges, which is fine if you have a fingerprint reader.

## How it does it

- `/sys/devices/system/cpu/cpu*/cpufreq` is forced to 1Ghz or 2Ghz
- `/sys/class/drm/card0/device/power_dpm_force_performance_level` is forced to `low`

This could probably work on other AMD APUs but to my knowledge older 780M-based APUs are very well capable to reach 1.5W PPT on their own. 

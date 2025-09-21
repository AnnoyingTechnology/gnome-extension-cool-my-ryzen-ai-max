// extension.js
import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const POWER_DPM_PATH = '/sys/class/drm/card0/device/power_dpm_force_performance_level';

// CPU min frequency values in kHz
const MIN_KHZ_POWERSAVE = 1000000; // 1 GHz
const MIN_KHZ_NORMAL    = 2000000; // 2 GHz

const PowerSaverIndicator = GObject.registerClass(
class PowerSaverIndicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, 'Power Saver');

        // Indicator icon
        this._icon = new St.Icon({
            icon_name: 'power-profile-power-saver-symbolic',
            style_class: 'system-status-icon',
        });
        this.add_child(this._icon);

        // Toggle item
        this._toggle = new PopupMenu.PopupSwitchMenuItem('Power Saver', false);
        this._toggle.connect('toggled', this._onToggle.bind(this));
        this.menu.addMenuItem(this._toggle);

        // Initialize UI only (no pkexec on startup)
        this._updateState();
    }

    _getCurrentState() {
        try {
            const file = Gio.File.new_for_path(POWER_DPM_PATH);
            const [success, contents] = file.load_contents(null);
            if (success) {
                const currentLevel = new TextDecoder().decode(contents).trim();
                return currentLevel === 'low';
            }
        } catch (e) {
            log('Error reading power DPM state: ' + e.message);
        }
        return false;
    }

    _updateState() {
        const isPowerSaver = this._getCurrentState();
        this._toggle.setToggleState(isPowerSaver);

        if (isPowerSaver) {
            this._icon.icon_name = 'power-profile-power-saver-symbolic';
            this._icon.add_style_class_name('power-saver-active');
        } else {
            this._icon.icon_name = 'power-profile-performance-symbolic';
            this._icon.remove_style_class_name('power-saver-active');
        }
    }

    _onToggle(item) {
        const newLevel = item.state ? 'low' : 'auto';
        const minKhz = item.state ? MIN_KHZ_POWERSAVE : MIN_KHZ_NORMAL;
        this._applyPowerAndCpu(newLevel, minKhz);
    }

    /**
     * Apply GPU performance level and CPU min frequency in a single pkexec call.
     * Exactly one elevation prompt per toggle.
     */
    _applyPowerAndCpu(level, minKhz) {
        // Use a portable /bin/sh script (no bashisms) and avoid bare globs that may not match
        const cmdString = `
            set -eu
            echo '${level}' > '${POWER_DPM_PATH}'
            for d in /sys/devices/system/cpu/cpu*/cpufreq; do
                [ -d "$d" ] || continue
                f="$d/scaling_min_freq"
                [ -w "$f" ] || continue
                echo '${minKhz}' > "$f" || true
            done
        `;

        const command = ['pkexec', 'sh', '-c', cmdString];

        try {
            const proc = Gio.Subprocess.new(
                command,
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
            );

            proc.communicate_utf8_async(null, null, (p, res) => {
                try {
                    const [, stdout, stderr] = p.communicate_utf8_finish(res);

                    if (p.get_successful()) {
                        // Refresh UI shortly after kernel/sysfs updates
                        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
                            this._updateState();
                            return GLib.SOURCE_REMOVE;
                        });
                    } else {
                        log('Failed to set power/cpu min freq: ' + stderr);
                        this._updateState();
                        Main.notify('Error', 'Failed to change GPU/CPU settings. Authentication may have been cancelled.');
                    }
                } catch (e) {
                    log('Error applying power/cpu settings: ' + e.message);
                    this._updateState();
                }
            });
        } catch (e) {
            log('Error executing pkexec: ' + e.message);
            this._updateState();
            Main.notify('Error', 'Failed to execute privileged command.');
        }
    }

    destroy() {
        super.destroy();
    }
});

export default class PowerSaverExtension {
    constructor() {
        this._indicator = null;
    }

    enable() {
        this._indicator = new PowerSaverIndicator();
        Main.panel.addToStatusArea('power-saver', this._indicator);
    }

    disable() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }
}

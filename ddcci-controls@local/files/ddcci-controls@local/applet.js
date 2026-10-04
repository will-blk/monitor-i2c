const Applet = imports.ui.applet;
const PopupMenu = imports.ui.popupMenu;
const Util = imports.misc.util;
const St = imports.gi.St;

const UUID = "ddcci-controls@local";
const VCP_BRIGHTNESS = "10";
const VCP_CONTRAST = "12";
const VCP_COLOR_PRESET = "14";
const VCP_INPUT = "60";
const VCP_PICTURE_MODE = "DC";
const VCP_POWER = "D6";

function log(message, level) {
    const text = "[" + UUID + "] " + message;
    if (level === "error") {
        global.logError(text);
    } else if (level === "warning") {
        global.logWarning(text);
    } else {
        global.log(text);
    }
}

function run(command) {
    return new Promise(function(resolve) {
        Util.spawnCommandLineAsyncIO(command, function(stdout, stderr, exitCode) {
            resolve({ stdout: stdout || "", stderr: stderr || "", exitCode: exitCode });
        });
    });
}

function currentValue(output) {
    const match = output.match(/current value\s*=\s*(\d+)/i);
    return match ? parseInt(match[1], 10) : null;
}

function parseCapabilities(output) {
    const result = {
        model: "Não especificado",
        mccsVersion: "Não especificada",
        brightness: false,
        contrast: false,
        pictureModes: [],
        colorPresets: [],
        inputSources: [],
        powerModes: []
    };
    let currentFeature = null;

    output.split("\n").forEach(function(line) {
        let match = line.match(/^\s*Model:\s*(.+)$/);
        if (match) {
            result.model = match[1].trim();
            return;
        }
        match = line.match(/^\s*MCCS version:\s*(.+)$/i);
        if (match) {
            result.mccsVersion = match[1].trim();
            return;
        }

        match = line.match(/^\s*Feature:\s*([0-9A-Fa-f]{2})\s*\(([^)]+)\)/);
        if (match) {
            currentFeature = match[1].toUpperCase();
            if (currentFeature === VCP_BRIGHTNESS) result.brightness = true;
            if (currentFeature === VCP_CONTRAST) result.contrast = true;
            return;
        }

        if (currentFeature === VCP_PICTURE_MODE) {
            match = line.match(/^\s*([0-9A-Fa-f]{2}):\s*(.+)$/);
            if (match) {
                result.pictureModes.push({
                    value: match[1].toUpperCase(),
                    label: match[2].trim()
                });
            }
        }

        if (currentFeature === VCP_COLOR_PRESET || currentFeature === VCP_INPUT || currentFeature === VCP_POWER) {
            match = line.match(/^\s*([0-9A-Fa-f]{2}):\s*(.+)$/);
            if (!match) return;
            const option = { value: match[1].toUpperCase(), label: match[2].trim() };
            if (currentFeature === VCP_COLOR_PRESET) result.colorPresets.push(option);
            if (currentFeature === VCP_INPUT) result.inputSources.push(option);
            if (currentFeature === VCP_POWER) result.powerModes.push(option);
        }
    });

    return result;
}

async function detectDisplays() {
    const detected = await run("ddcutil detect");
    if (detected.exitCode !== 0 && detected.stdout.indexOf("Display ") === -1) {
        throw new Error(detected.stderr || "ddcutil detect falhou");
    }

    const displays = [];
    let display = null;
    detected.stdout.split("\n").forEach(function(line) {
        let match = line.match(/^Display\s+(\d+)$/);
        if (match) {
            if (display) displays.push(display);
            display = {
                index: parseInt(match[1], 10),
                name: "Display " + match[1],
                bus: null
            };
            return;
        }

        if (!display) return;
        match = line.match(/^\s*Model:\s*(.+)$/);
        if (match) display.name = match[1].trim();
        match = line.match(/^\s*I2C bus:\s*\/dev\/i2c-(\d+)$/);
        if (match) display.bus = parseInt(match[1], 10);
    });
    if (display) displays.push(display);

    for (let i = 0; i < displays.length; i++) {
        const item = displays[i];
        const capabilities = await run("ddcutil capabilities --display=" + item.index);
        item.capabilities = parseCapabilities(capabilities.stdout + "\n" + capabilities.stderr);
        // Some monitors report "Model: Not specified" in capabilities,
        // although ddcutil detect already has the useful display name.
        if (!item.capabilities.model || item.capabilities.model.toLowerCase() === "not specified") {
            item.capabilities.model = item.name;
        }
        item.brightness = await readVcp(item, VCP_BRIGHTNESS);
        item.contrast = await readVcp(item, VCP_CONTRAST);
        item.colorPreset = await readVcp(item, VCP_COLOR_PRESET);
        item.inputSource = await readVcp(item, VCP_INPUT);
        item.pictureMode = await readVcp(item, VCP_PICTURE_MODE);
        item.powerMode = await readVcp(item, VCP_POWER);
    }
    return displays;
}

async function readVcp(display, feature) {
    const result = await run("ddcutil --display=" + display.index + " getvcp " + feature);
    return currentValue(result.stdout);
}

function setVcp(display, feature, value) {
    return run("ddcutil --display=" + display.index + " setvcp " + feature + " " + value);
}

function setControlsSensitive(display, sensitive) {
    if (display.brightnessSlider) display.brightnessSlider.setSensitive(sensitive);
    if (display.contrastSlider) display.contrastSlider.setSensitive(sensitive);
    if (display.colorPresetMenu) display.colorPresetMenu.setSensitive(sensitive);
    if (display.inputMenu) display.inputMenu.setSensitive(sensitive);
    if (display.pictureMenu) display.pictureMenu.setSensitive(sensitive);
    if (display.powerMenu) display.powerMenu.setSensitive(sensitive);
}

async function applyNumericValue(display, feature, value, property, slider) {
    if (display.controlsBusy) return;

    display.controlsBusy = true;
    setControlsSensitive(display, false);
    const result = await setVcp(display, feature, value);
    if (result.exitCode !== 0) {
        log("Falha ao alterar VCP " + feature + " do display " + display.index + ": " + result.stderr, "warning");
    } else {
        // Read back the value so the slider reflects what the monitor accepted.
        const appliedValue = await readVcp(display, feature);
        if (appliedValue !== null) {
            display[property] = appliedValue;
            slider.setValue(appliedValue / 100);
        }
    }
    display.controlsBusy = false;
    setControlsSensitive(display, true);
}

function pictureModeForValue(display, value) {
    return display.capabilities.pictureModes.find(function(mode) {
        return parseInt(mode.value, 16) === value;
    });
}

function updatePictureModeLabel(display) {
    if (!display.pictureMenu) return;
    const mode = pictureModeForValue(display, display.pictureMode);
    display.pictureMenu.label.set_text(mode ? "Modo de imagem: " + mode.label : "Modo de imagem");
}

async function applyPictureMode(display, mode) {
    if (display.controlsBusy) return;

    display.controlsBusy = true;
    setControlsSensitive(display, false);
    const result = await setVcp(display, VCP_PICTURE_MODE, parseInt(mode.value, 16));
    if (result.exitCode !== 0) {
        log("Falha ao alterar o modo de imagem do display " + display.index + ": " + result.stderr, "warning");
    } else {
        const appliedValue = await readVcp(display, VCP_PICTURE_MODE);
        if (appliedValue !== null) {
            display.pictureMode = appliedValue;
            updatePictureModeLabel(display);
        }
    }
    display.controlsBusy = false;
    setControlsSensitive(display, true);
}

function optionForValue(options, value) {
    return options.find(function(option) {
        return parseInt(option.value, 16) === value;
    });
}

function updateChoiceLabel(display, menuProperty, title, options, value) {
    const menu = display[menuProperty];
    if (!menu) return;
    const option = optionForValue(options, value);
    menu.label.set_text(option ? title + ": " + option.label : title);
}

async function applyChoice(display, feature, option, property, menuProperty, title, options) {
    if (display.controlsBusy) return;

    display.controlsBusy = true;
    setControlsSensitive(display, false);
    const result = await setVcp(display, feature, parseInt(option.value, 16));
    if (result.exitCode !== 0) {
        log("Falha ao alterar VCP " + feature + " do display " + display.index + ": " + result.stderr, "warning");
    } else {
        const appliedValue = await readVcp(display, feature);
        if (appliedValue !== null) {
            display[property] = appliedValue;
            updateChoiceLabel(display, menuProperty, title, options, appliedValue);
        }
    }
    display.controlsBusy = false;
    setControlsSensitive(display, true);
}

function addSlider(menu, label, value, enabled, callback) {
    const title = new PopupMenu.PopupMenuItem(label, { reactive: false });
    menu.addMenuItem(title);
    const slider = new PopupMenu.PopupSliderMenuItem((value === null ? 50 : value) / 100);
    slider.setSensitive(enabled);
    // Apply only after the user releases the handle. The callback disables
    // the slider until ddcutil writes and reads back the new value.
    slider.connect("drag-end", function(item) {
        if (enabled) callback(Math.round(item.value * 100), slider);
    });
    menu.addMenuItem(slider);
    return slider;
}

function addPictureMode(menu, display) {
    if (!display.capabilities.pictureModes.length) return;

    const submenu = new PopupMenu.PopupSubMenuMenuItem("Modo de imagem");
    display.pictureMenu = submenu;
    menu.addMenuItem(submenu);
    updatePictureModeLabel(display);
    display.capabilities.pictureModes.forEach(function(mode) {
        const item = new PopupMenu.PopupMenuItem(mode.label);
        item.connect("activate", function() {
            applyPictureMode(display, mode);
        });
        submenu.menu.addMenuItem(item);
    });
}

function addChoiceMenu(menu, display, title, feature, options, property, menuProperty) {
    if (!options.length) return;

    const submenu = new PopupMenu.PopupSubMenuMenuItem(title);
    display[menuProperty] = submenu;
    menu.addMenuItem(submenu);
    updateChoiceLabel(display, menuProperty, title, options, display[property]);
    options.forEach(function(option) {
        const item = new PopupMenu.PopupMenuItem(option.label);
        item.connect("activate", function() {
            applyChoice(display, feature, option, property, menuProperty, title, options);
        });
        submenu.menu.addMenuItem(item);
    });
}

function addReadOnlyInfo(menu, display) {
    const info = display.capabilities;
    const rows = [
        "Modelo: " + info.model,
        "Barramento I²C: " + (display.bus === null ? "não informado" : "/dev/i2c-" + display.bus),
        "MCCS: " + info.mccsVersion
    ];
    rows.forEach(function(row) {
        menu.addMenuItem(new PopupMenu.PopupMenuItem(row, { reactive: false }));
    });
    menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
}

class DDCControlsApplet extends Applet.TextIconApplet {
    constructor(orientation, panelHeight, instanceId) {
        super(orientation, panelHeight, instanceId);
        this.displays = [];
        this.detecting = false;
        this.set_applet_icon_symbolic_name("video-display-symbolic");
        this.set_applet_tooltip("Controles DDC/CI do monitor");

        this.menu = new Applet.AppletPopupMenu(this, orientation);
        this.menuManager = new PopupMenu.PopupMenuManager(this);
        this.menuManager.addMenu(this.menu);
        this.updateDisplays();
    }

    on_applet_clicked() {
        this.refreshCurrentValues();
        this.menu.toggle();
    }

    on_applet_added_to_panel() {
        if (!this.detecting) this.updateDisplays();
    }

    async updateDisplays() {
        if (this.detecting) return;
        this.detecting = true;
        try {
            this.displays = await detectDisplays();
            this.rebuildMenu();
        } catch (error) {
            log(String(error), "warning");
            this.rebuildMenu(error.message || "Não foi possível executar o ddcutil.");
        }
        this.detecting = false;
    }

    async refreshCurrentValues() {
        if (this.detecting || this.displays.length === 0) return;
        for (let i = 0; i < this.displays.length; i++) {
            const display = this.displays[i];
            if (display.controlsBusy) continue;
            const brightness = await readVcp(display, VCP_BRIGHTNESS);
            const contrast = await readVcp(display, VCP_CONTRAST);
            const colorPreset = await readVcp(display, VCP_COLOR_PRESET);
            const inputSource = await readVcp(display, VCP_INPUT);
            const pictureMode = await readVcp(display, VCP_PICTURE_MODE);
            const powerMode = await readVcp(display, VCP_POWER);
            if (brightness !== null) {
                display.brightness = brightness;
                if (display.brightnessSlider) display.brightnessSlider.setValue(brightness / 100);
            }
            if (contrast !== null) {
                display.contrast = contrast;
                if (display.contrastSlider) display.contrastSlider.setValue(contrast / 100);
            }
            if (colorPreset !== null) {
                display.colorPreset = colorPreset;
                updateChoiceLabel(display, "colorPresetMenu", "Preset de cor", display.capabilities.colorPresets, colorPreset);
            }
            if (inputSource !== null) {
                display.inputSource = inputSource;
                updateChoiceLabel(display, "inputMenu", "Entrada", display.capabilities.inputSources, inputSource);
            }
            if (pictureMode !== null) {
                display.pictureMode = pictureMode;
                updatePictureModeLabel(display);
            }
            if (powerMode !== null) {
                display.powerMode = powerMode;
                updateChoiceLabel(display, "powerMenu", "Energia", display.capabilities.powerModes, powerMode);
            }
        }
    }

    rebuildMenu(errorMessage) {
        this.menu.removeAll();
        if (errorMessage || this.displays.length === 0) {
            const message = errorMessage || "Nenhum monitor DDC/CI encontrado.";
            this.menu.addMenuItem(new PopupMenu.PopupMenuItem(message, { reactive: false }));
        }

        this.displays.forEach(function(display) {
            addReadOnlyInfo(this.menu, display);

            display.brightnessSlider = addSlider(this.menu, "Brilho", display.brightness, display.capabilities.brightness, function(value, slider) {
                display.brightness = value;
                applyNumericValue(display, VCP_BRIGHTNESS, value, "brightness", slider);
            });
            display.contrastSlider = addSlider(this.menu, "Contraste", display.contrast, display.capabilities.contrast, function(value, slider) {
                display.contrast = value;
                applyNumericValue(display, VCP_CONTRAST, value, "contrast", slider);
            });
            addChoiceMenu(this.menu, display, "Preset de cor", VCP_COLOR_PRESET, display.capabilities.colorPresets, "colorPreset", "colorPresetMenu");
            addChoiceMenu(this.menu, display, "Entrada", VCP_INPUT, display.capabilities.inputSources, "inputSource", "inputMenu");
            addPictureMode(this.menu, display);
            addChoiceMenu(this.menu, display, "Energia", VCP_POWER, display.capabilities.powerModes, "powerMode", "powerMenu");
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }, this);

        const reload = new PopupMenu.PopupMenuItem("Detectar monitores novamente");
        reload.connect("activate", this.updateDisplays.bind(this));
        this.menu.addMenuItem(reload);
    }
}

function main(metadata, orientation, panelHeight, instanceId) {
    return new DDCControlsApplet(orientation, panelHeight, instanceId);
}

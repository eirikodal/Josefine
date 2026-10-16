-- =====================================================
-- Josefine Hyprland Dev Config (Nested on Desktop)
-- Simulert 1520x720 skjerm for rask lokal testing
-- =====================================================

------------------
---- MONITORS ----
------------------
-- Tvinger den virtuelle Wayland-skjermen til nøyaktig 1520x720@60
hl.monitor({
    output    = "",
    mode      = "1520x720@60",
    position  = "0x0",
    scale     = 1,
    transform = 0,
})

-------------------------------
---- ENVIRONMENT VARIABLES ----
-------------------------------
hl.env("XDG_CURRENT_DESKTOP", "Hyprland")
hl.env("XDG_SESSION_TYPE", "wayland")
hl.env("XDG_SESSION_DESKTOP", "Hyprland")
hl.env("QT_QPA_PLATFORM", "wayland;xcb")
hl.env("QT_WAYLAND_DISABLE_WINDOWDECORATION", "1")
hl.env("GDK_BACKEND", "wayland,x11")
hl.env("MOZ_ENABLE_WAYLAND", "1")

-----------------------
---- LOOK AND FEEL ----
-----------------------
hl.config({
    general = {
        gaps_in     = 12,
        gaps_out    = 12,
        border_size = 2,
        col = {
            active_border   = { colors = { "rgba(ff79c6ee)", "rgba(bd93f9ee)" }, angle = 45 },
            inactive_border = "rgba(6272a4aa)",
        },
        layout = "dwindle",
    },

    decoration = {
        rounding = 12,
        blur = {
            enabled = false,
        },
    },

    animations = {
        enabled = true,
    },

    dwindle = {
        preserve_split = true,
    },

    misc = {
        background_color = "0x000000ff",
        disable_hyprland_logo = true,
        disable_splash_rendering = true,
    },
})

----------------------
---- WINDOW RULES ----
----------------------
hl.window_rule({
    name           = "suppress-maximize",
    match          = { class = ".*" },
    suppress_event = "maximize",
})

------------------
---- KEYBINDS ----
------------------
-- Bruker ALT i stedet for SUPER her for å unngå kollisjon med vertens Hyprland-snarveier.
-- Merk: Chromium må ha separat --user-data-dir for å unngå at den kobler til vertens eksisterende nettleser-instans.
hl.bind("ALT + Return", hl.dsp.exec_cmd("ghostty || foot || alacritty"))
hl.bind("ALT + B", hl.dsp.exec_cmd("chromium --user-data-dir=/tmp/josefine-browser"))
hl.bind("ALT + Q", hl.dsp.window.close())
hl.bind("ALT + SHIFT + M", hl.dsp.exit())

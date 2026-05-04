import { createSystem, defaultConfig } from "@chakra-ui/react"
import { badgeRecipe } from "./theme/badge.recipe"
import { buttonRecipe } from "./theme/button.recipe"
import { tableRecipe } from "./theme/table.recipe"

export const system = createSystem(defaultConfig, {
  preflight: false,

  globalCss: {
    html: {
      fontSize: "16px",
      fontFamily: "Poppins, sans-serif",
    },
    h1: {
      fontFamily: "Poppins, sans-serif",
    },
    h2: {
      fontFamily: "Poppins, sans-serif",
    },
    body: {
      fontSize: "0.875rem",
      fontFamily: "Poppins, sans-serif",
      margin: 0,
      padding: 0,
    },
    ".main-link": {
      color: "ui.main",
      fontWeight: "bold",
    },
  },
  theme: {
    semanticTokens: {
      colors: {
        danger: { value: "#BE123C" },
        success: { value: "#65A30D" },
        alert: { value: "#EAB308" },
        faintforeground: { value: "neutral-400" },
        menuactive: { value: "#DDE8EA" },
        brand: {
          solid: { value: "cyan-600" },
          fg: { value: "#737373" },
        },
        primary: { value: "#155E75" },
        secondary: { value: "#FFFFFF" },
        background: { value: "#FFFFFF" },
        background2: { value: "#E2E8F0" },
        foreground: { value: "#737373" },
        shiftcodes: {
          day: { value: "#06B6D4" },
          am: { value: "cyan.500" },
          night: { value: "#164E63" },
          pm: { value: "cyan.700" },
          do: { value: "neutral.400" },
          al: { value: "slate.400" },
        },
        requestcodes: {
          shiftreq: { value: "cyan.600" },
          leavereq: { value: "teal.600" },
          roster: { value: "cyan.700" },
          probation: { value: "yellow.500" },
        },
        periodbadge: {
          currentBg: { value: "#DCFCE7" },
          currentText: { value: "#166534" },
          upcomingBg: { value: "#DBEAFE" },
          upcomingText: { value: "#1D4ED8" },
        },
        ui: {
          main: { value: "#155E75" },
        },
      },
    },
    recipes: {
      button: buttonRecipe,
      badge: badgeRecipe,
    },
    slotRecipes: {
      table: tableRecipe,
    },
  },
})

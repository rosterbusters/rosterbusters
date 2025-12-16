import { createSystem, defaultConfig } from "@chakra-ui/react"
import { buttonRecipe } from "./theme/button.recipe"

export const system = createSystem(defaultConfig, {
  globalCss: {
    html: {
      fontSize: "16px",
    },
    body: {
      fontSize: "0.875rem",
      margin: 0,
      padding: 0,
    },
    ".main-link": {
      color: "ui.main",
      fontWeight: "bold",
    },
  },
  theme: {
    breakpoints:{
      mobile:'0px',
      desktop:'640px'
    },
    semanticTokens: {
      colors: {
      danger:{value:'rose-700'},
      success:{value:'lime-600'},
      faintforeground:{value:'neutral-400'},
      menuactive:{value:'#DDE8EA'},
      brand:{
        solid:{value:'cyan-600'},
        fg:{value:'#737373'}
      },
      primary: { value: '#155E75' },
      secondary: { value: '#FFFFFF' },
      background: { value: '#FFFFFF' },
      foreground: { value: '#737373' },
        shiftcodes:{
          day:{value:'cyan.600'},
          am:{value:'cyan.500'},
          night:{value:'cyan.900'},
          pm:{value:'cyan.700'},
          do:{value:'neutral.400'},
          al:{value:'slate.400'}
        },
        requestcodes:{
          shiftreq:{value:'cyan.600'},
          leavereq:{value:'blue.500'},
          roster:{value:'cyan.600'},
          probation:{value:'yellow.500'}
        },
        ui: {
          main: { value: "#155E75" },
        },
      },
    },
    recipes: {
      button: buttonRecipe,
    },
  },
})

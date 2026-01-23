import { defineRecipe } from "@chakra-ui/react"
import type { RecipeVariantProps } from "@chakra-ui/react"
import {system} from "../theme"

export const badgeRecipe = defineRecipe({
  base: {
    display: "flex",
  },
  variants: {
    variant: {
      shiftRequest:{bgColor:"cyan.600", color:"white"},
      roster:{bgColor:"cyan.500", color:"white"},
    },
  },
})
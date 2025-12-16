import { defineRecipe } from "@chakra-ui/react"

export const buttonRecipe = defineRecipe({
  base: {
    fontWeight: "bold",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    colorPalette: "primary",
  },
  variants: {
    variant: {
      solid:{
        bg:"primary",
        color:'white',
        _hover: {
          bg: "gray.100",
        },
      },
      outline:{
        bg:"white",
        color:'primary',
        _hover: {
          bg: "gray.100",
        },
      },
      ghost: {
        bg: "transparent",
        _hover: {
          bg: "gray.100",
        },
      },
    },
  },
})

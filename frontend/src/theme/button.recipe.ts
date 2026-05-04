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
      solid: {
        bg: "primary",
        color: "white",
        fontWeight: "normal",
        _hover: {
          bg: "cyan.800",
        },
      },
      outline: {
        bg: "white",
        color: "primary",
        fontWeight: "normal",
        _hover: {
          bg: "gray.100",
        },
      },
      outlinegrey: {
        bg: "white",
        color: "gray.600",
        fontWeight: "normal",
        borderWidth: "1px",
        borderStyle: "solid",
        borderColor: "gray.300",
        _hover: {
          bg: "gray.50",
          borderColor: "gray.400",
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

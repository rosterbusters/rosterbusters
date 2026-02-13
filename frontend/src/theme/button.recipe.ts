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
        fontWeight:'normal',
        _hover: {
          bg: "cyan.800",
        },
      },
      outline:{
        bg:"white",
        color:'primary',
        fontWeight:'normal',
        _hover: {
          bg: "gray.100",
        },
      },
      outlinegrey:{
        bg:"white",
        color:'foreground',
        fontWeight:'normal',
        borderWidth:"1px",
        borderColor:"border",
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

import { defineRecipe } from "@chakra-ui/react";
import type { RecipeVariantProps } from "@chakra-ui/react";
import { system } from "../theme";

export const badgeRecipe = defineRecipe({
  base: {
    display: "flex",
  },
  variants: {
    variant: {
      shiftRequest: { bgColor: "cyan.600", color: "white" },
      roster: { bgColor: "cyan.500", color: "white" },
      requests: { bgColor: "#DDE8EA", color: "#155E75" },
      AShift: { bgColor: "cyan.500", color: "white" },
      AShiftOutline: {
        borderColor: "cyan.500",
        borderWidth: "3px",
        color: "cyan.500",
      },
      NShift: { bgColor: "#164E63", color: "white" },
      NShiftOutline: {
        borderColor: "#164E63",
        borderWidth: "3px",
        color: "#164E63",
      },
      DShift: { bgColor: "#0891B2", color: "white" },
      DShiftOutline: {
        borderColor: "#0891B2",
        borderWidth: "3px",
        color: "#0891B2",
      },
      PShift: { bgColor: "#0E7490", color: "white" },
      PShiftOutline: {
        borderColor: "#0E7490",
        borderWidth: "3px",
        color: "#0E7490",
      },
      DOShift: { bgColor: "#A3A3A3", color: "white" },
      DOShiftOutline: {
        borderColor: "#A3A3A3",
        borderWidth: "3px",
        color: "#A3A3A3",
      },
      ALShift: { bgColor: "#94A3B8", color: "white" },
      ALShiftOutline: {
        borderColor: "#94A3B8",
        borderWidth: "3px",
        color: "#94A3B8",
      },
    },
  },
});

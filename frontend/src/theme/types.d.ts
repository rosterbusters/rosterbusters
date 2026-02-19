import "styled-components";
import type { RecipeVariantProps } from "@chakra-ui/react";
import { buttonRecipe } from "./button.recipe";
import { badgeRecipe } from "./badge.recipe";

type ButtonVariants = RecipeVariantProps<typeof buttonRecipe>["variant"] | "outlinegrey";
type BadgeVariants = RecipeVariantProps<typeof badgeRecipe>["variant"] | "requests";

// Module augmentation for Chakra UI theme types
declare module "@chakra-ui/react" {
  interface ButtonProps {
    variant?: ButtonVariants;
  }
  interface BadgeProps {
    variant?: BadgeVariants;
  }
}
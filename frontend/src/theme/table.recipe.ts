import { defineSlotRecipe } from "@chakra-ui/react"

export const tableRecipe = defineSlotRecipe({
  slots: [
    "root",
    "header",
    "body",
    "row",
    "cell",
    "columnHeader",
    "caption",
    "footer",
  ],
  base: {
    root: {
      width: "full",
      textAlign: "start",
      borderCollapse: "collapse",
    },
    row: {
      bg: "bg",
    },
    columnHeader: {
      fontWeight: "semibold",
      textAlign: "start",
      borderBottomWidth: "1px",
      borderColor: "#E7E7E7",
    },
    cell: {
      borderBottomWidth: "1px",
      borderColor: "#E7E7E7",
    },
  },
  variants: {
    size: {
      sm: {
        root: { fontSize: "sm" },
        columnHeader: { px: "2", py: "1.5" },
        cell: { px: "2", py: "1.5" },
      },
      md: {
        root: { fontSize: "md" },
        columnHeader: { px: "3", py: "2" },
        cell: { px: "3", py: "2" },
      },
    },
    interactive: {
      true: {
        row: {
          _hover: { bg: "bg.muted" },
        },
      },
    },
    stickyHeader: {
      true: {
        columnHeader: {
          position: "sticky",
          top: 0,
          bg: "bg",
          zIndex: 1,
        },
      },
    },
  },
  defaultVariants: {
    size: "md",
  },
})

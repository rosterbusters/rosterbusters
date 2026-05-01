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
      currentPeriod: {
        bgColor: "periodbadge.currentBg",
        color: "periodbadge.currentText",
        borderRadius: "full",
        px: 2,
      },
      upcomingPeriod: {
        bgColor: "periodbadge.upcomingBg",
        color: "periodbadge.upcomingText",
        borderRadius: "full",
        px: 2,
      },
      AShift: { bgColor: "cyan.500", color: "white" },
      AShiftOutline: {
        bgColor: "white",
        borderColor: "cyan.500",
        borderWidth: "3px",
        color: "cyan.500",
      },
      AShiftSolid: {
        bgColor: "cyan.500",
        color: "white",
      },
      NShift: { bgColor: "#164E63", color: "white" },
      NShiftOutline: {
        bgColor: "white",
        borderColor: "#164E63",
        borderWidth: "3px",
        color: "#164E63",
      },
      NShiftSolid: {
        bgColor: "#164E63",
        color: "white",
      },
      DShift: { bgColor: "#0891B2", color: "white" },
      DShiftOutline: {
        bgColor: "white",
        borderColor: "#0891B2",
        borderWidth: "3px",
        color: "#0891B2",
      },
      DShiftSolid: {
        bgColor: "#0891B2",
        color: "white",
      },
      PShift: { bgColor: "#0E7490", color: "white" },
      PShiftOutline: {
        bgColor: "white",
        borderColor: "#0E7490",
        borderWidth: "3px",
        color: "#0E7490",
      },
      PShiftSolid: {
        bgColor: "#0E7490",
        color: "white",
      },
      DOShift: { bgColor: "#A3A3A3", color: "white" },
      DOShiftOutline: {
        bgColor: "white",
        borderColor: "#A3A3A3",
        borderWidth: "3px",
        color: "#A3A3A3",
      },
      DOShiftSolid: {
        bgColor: "#A3A3A3",
        color: "white",
      },
      ALShift: { bgColor: "#64748B", color: "white" },
      ALShiftOutline: {
        bgColor: "white",
        borderColor: "#64748B",
        borderWidth: "3px",
        color: "#64748B",
      },
      ALShiftSolid: {
        bgColor: "#64748B",
        color: "white",
      },

      probation: { bgColor: "#D97706", color: "white" },

      // --- Leave types (gray/slate, distinct from DO/RD) ---
      MCShift: { bgColor: "#475569", color: "white" },
      MCShiftSolid: { bgColor: "#475569", color: "white" },
      MCShiftOutline: { bgColor: "white", borderColor: "#475569", borderWidth: "3px", color: "#475569" },

      CCLShift: { bgColor: "#334155", color: "white" },
      CCLShiftSolid: { bgColor: "#334155", color: "white" },
      CCLShiftOutline: { bgColor: "white", borderColor: "#334155", borderWidth: "3px", color: "#334155" },

      MLShift: { bgColor: "#52525B", color: "white" },
      MLShiftSolid: { bgColor: "#52525B", color: "white" },
      MLShiftOutline: { bgColor: "white", borderColor: "#52525B", borderWidth: "3px", color: "#52525B" },

      EMLShift: { bgColor: "#3F3F46", color: "white" },
      EMLShiftSolid: { bgColor: "#3F3F46", color: "white" },
      EMLShiftOutline: { bgColor: "white", borderColor: "#3F3F46", borderWidth: "3px", color: "#3F3F46" },

      MarShift: { bgColor: "#27272A", color: "white" },
      MarShiftSolid: { bgColor: "#27272A", color: "white" },
      MarShiftOutline: { bgColor: "white", borderColor: "#27272A", borderWidth: "3px", color: "#27272A" },

      FCLShift: { bgColor: "#6B7280", color: "white" },
      FCLShiftSolid: { bgColor: "#6B7280", color: "white" },
      FCLShiftOutline: { bgColor: "white", borderColor: "#6B7280", borderWidth: "3px", color: "#6B7280" },

      SPLShift: { bgColor: "#4B5563", color: "white" },
      SPLShiftSolid: { bgColor: "#4B5563", color: "white" },
      SPLShiftOutline: { bgColor: "white", borderColor: "#4B5563", borderWidth: "3px", color: "#4B5563" },

      CLShift: { bgColor: "#374151", color: "white" },
      CLShiftSolid: { bgColor: "#374151", color: "white" },
      CLShiftOutline: { bgColor: "white", borderColor: "#374151", borderWidth: "3px", color: "#374151" },

      BDLShift: { bgColor: "#1F2937", color: "white" },
      BDLShiftSolid: { bgColor: "#1F2937", color: "white" },
      BDLShiftOutline: { bgColor: "white", borderColor: "#1F2937", borderWidth: "3px", color: "#1F2937" },

      BCLShift: { bgColor: "#71717A", color: "white" },
      BCLShiftSolid: { bgColor: "#71717A", color: "white" },
      BCLShiftOutline: { bgColor: "white", borderColor: "#71717A", borderWidth: "3px", color: "#71717A" },

      URGShift: { bgColor: "#18181B", color: "white" },
      URGShiftSolid: { bgColor: "#18181B", color: "white" },
      URGShiftOutline: { bgColor: "white", borderColor: "#18181B", borderWidth: "3px", color: "#18181B" },

      UPLShift: { bgColor: "#0F172A", color: "white" },
      UPLShiftSolid: { bgColor: "#0F172A", color: "white" },
      UPLShiftOutline: { bgColor: "white", borderColor: "#0F172A", borderWidth: "3px", color: "#0F172A" },

      PHShift: { bgColor: "#5E6673", color: "white" },
      PHShiftSolid: { bgColor: "#5E6673", color: "white" },
      PHShiftOutline: { bgColor: "white", borderColor: "#5E6673", borderWidth: "3px", color: "#5E6673" },

      // --- Rest Day ---
      RDShift: { bgColor: "#737373", color: "white" },
      RDShiftSolid: { bgColor: "#737373", color: "white" },
      RDShiftOutline: { bgColor: "white", borderColor: "#737373", borderWidth: "3px", color: "#737373" },

      "RD-AShift": { bgColor: "#737373", color: "white" },
      "RD-AShiftSolid": { bgColor: "#737373", color: "white" },
      "RD-AShiftOutline": { bgColor: "white", borderColor: "#737373", borderWidth: "3px", color: "#737373" },

      "RD-DShift": { bgColor: "#737373", color: "white" },
      "RD-DShiftSolid": { bgColor: "#737373", color: "white" },
      "RD-DShiftOutline": { bgColor: "white", borderColor: "#737373", borderWidth: "3px", color: "#737373" },

      "RD-NShift": { bgColor: "#737373", color: "white" },
      "RD-NShiftSolid": { bgColor: "#737373", color: "white" },
      "RD-NShiftOutline": { bgColor: "white", borderColor: "#737373", borderWidth: "3px", color: "#737373" },

      "RD-PShift": { bgColor: "#737373", color: "white" },
      "RD-PShiftSolid": { bgColor: "#737373", color: "white" },
      "RD-PShiftOutline": { bgColor: "white", borderColor: "#737373", borderWidth: "3px", color: "#737373" },

      // --- Holiday ---
      HOLShift: { bgColor: "#78716C", color: "white" },
      HOLShiftSolid: { bgColor: "#78716C", color: "white" },
      HOLShiftOutline: { bgColor: "white", borderColor: "#78716C", borderWidth: "3px", color: "#78716C" },

      "HOL-AShift": { bgColor: "#78716C", color: "white" },
      "HOL-AShiftSolid": { bgColor: "#78716C", color: "white" },
      "HOL-AShiftOutline": { bgColor: "white", borderColor: "#78716C", borderWidth: "3px", color: "#78716C" },

      "HOL-DShift": { bgColor: "#78716C", color: "white" },
      "HOL-DShiftSolid": { bgColor: "#78716C", color: "white" },
      "HOL-DShiftOutline": { bgColor: "white", borderColor: "#78716C", borderWidth: "3px", color: "#78716C" },

      "HOL-NShift": { bgColor: "#78716C", color: "white" },
      "HOL-NShiftSolid": { bgColor: "#78716C", color: "white" },
      "HOL-NShiftOutline": { bgColor: "white", borderColor: "#78716C", borderWidth: "3px", color: "#78716C" },

      "HOL-PShift": { bgColor: "#78716C", color: "white" },
      "HOL-PShiftSolid": { bgColor: "#78716C", color: "white" },
      "HOL-PShiftOutline": { bgColor: "white", borderColor: "#78716C", borderWidth: "3px", color: "#78716C" },

      // --- Day Off OT variants ---
      "DO-AShift": { bgColor: "#A3A3A3", color: "white" },
      "DO-AShiftSolid": { bgColor: "#A3A3A3", color: "white" },
      "DO-AShiftOutline": { bgColor: "white", borderColor: "#A3A3A3", borderWidth: "3px", color: "#A3A3A3" },

      "DO-DShift": { bgColor: "#A3A3A3", color: "white" },
      "DO-DShiftSolid": { bgColor: "#A3A3A3", color: "white" },
      "DO-DShiftOutline": { bgColor: "white", borderColor: "#A3A3A3", borderWidth: "3px", color: "#A3A3A3" },

      "DO-NShift": { bgColor: "#A3A3A3", color: "white" },
      "DO-NShiftSolid": { bgColor: "#A3A3A3", color: "white" },
      "DO-NShiftOutline": { bgColor: "white", borderColor: "#A3A3A3", borderWidth: "3px", color: "#A3A3A3" },

      "DO-PShift": { bgColor: "#A3A3A3", color: "white" },
      "DO-PShiftSolid": { bgColor: "#A3A3A3", color: "white" },
      "DO-PShiftOutline": { bgColor: "white", borderColor: "#A3A3A3", borderWidth: "3px", color: "#A3A3A3" },

      // --- AM shift variants ---
      "A-ADDShift": { bgColor: "cyan.500", color: "white" },
      "A-ADDShiftSolid": { bgColor: "cyan.500", color: "white" },
      "A-ADDShiftOutline": { bgColor: "white", borderColor: "cyan.500", borderWidth: "3px", color: "cyan.500" },

      "A-OShift": { bgColor: "cyan.500", color: "white" },
      "A-OShiftSolid": { bgColor: "cyan.500", color: "white" },
      "A-OShiftOutline": { bgColor: "white", borderColor: "cyan.500", borderWidth: "3px", color: "cyan.500" },

      "A-12Shift": { bgColor: "cyan.500", color: "white" },
      "A-12ShiftSolid": { bgColor: "cyan.500", color: "white" },
      "A-12ShiftOutline": { bgColor: "white", borderColor: "cyan.500", borderWidth: "3px", color: "cyan.500" },

      // --- PM shift variant ---
      "P-ADDShift": { bgColor: "#0E7490", color: "white" },
      "P-ADDShiftSolid": { bgColor: "#0E7490", color: "white" },
      "P-ADDShiftOutline": { bgColor: "white", borderColor: "#0E7490", borderWidth: "3px", color: "#0E7490" },

      // --- Night shift variants ---
      "N-12Shift": { bgColor: "#164E63", color: "white" },
      "N-12ShiftSolid": { bgColor: "#164E63", color: "white" },
      "N-12ShiftOutline": { bgColor: "white", borderColor: "#164E63", borderWidth: "3px", color: "#164E63" },

      "N-OTShift": { bgColor: "#164E63", color: "white" },
      "N-OTShiftSolid": { bgColor: "#164E63", color: "white" },
      "N-OTShiftOutline": { bgColor: "white", borderColor: "#164E63", borderWidth: "3px", color: "#164E63" },

      "N-PHShift": { bgColor: "#164E63", color: "white" },
      "N-PHShiftSolid": { bgColor: "#164E63", color: "white" },
      "N-PHShiftOutline": { bgColor: "white", borderColor: "#164E63", borderWidth: "3px", color: "#164E63" },

      // --- Office / Training / Special ---
      OHShift: { bgColor: "#7A8BA0", color: "white" },
      OHShiftSolid: { bgColor: "#7A8BA0", color: "white" },
      OHShiftOutline: { bgColor: "white", borderColor: "#7A8BA0", borderWidth: "3px", color: "#7A8BA0" },

      INHTShift: { bgColor: "#6A7A8C", color: "white" },
      INHTShiftSolid: { bgColor: "#6A7A8C", color: "white" },
      INHTShiftOutline: { bgColor: "white", borderColor: "#6A7A8C", borderWidth: "3px", color: "#6A7A8C" },

      "RTN-3Shift": { bgColor: "#5A6A7C", color: "white" },
      "RTN-3ShiftSolid": { bgColor: "#5A6A7C", color: "white" },
      "RTN-3ShiftOutline": { bgColor: "white", borderColor: "#5A6A7C", borderWidth: "3px", color: "#5A6A7C" },

      FDShift: { bgColor: "#57534E", color: "white" },
      FDShiftSolid: { bgColor: "#57534E", color: "white" },
      FDShiftOutline: { bgColor: "white", borderColor: "#57534E", borderWidth: "3px", color: "#57534E" },

      SDShift: { bgColor: "#44403C", color: "white" },
      SDShiftSolid: { bgColor: "#44403C", color: "white" },
      SDShiftOutline: { bgColor: "white", borderColor: "#44403C", borderWidth: "3px", color: "#44403C" },

      // --- PSA shifts ---
      "PSA-0813Shift": { bgColor: "#748090", color: "white" },
      "PSA-0813ShiftSolid": { bgColor: "#748090", color: "white" },
      "PSA-0813ShiftOutline": { bgColor: "white", borderColor: "#748090", borderWidth: "3px", color: "#748090" },

      "PSA-1630Shift": { bgColor: "#647080", color: "white" },
      "PSA-1630ShiftSolid": { bgColor: "#647080", color: "white" },
      "PSA-1630ShiftOutline": { bgColor: "white", borderColor: "#647080", borderWidth: "3px", color: "#647080" },

      "PSA-1730Shift": { bgColor: "#546070", color: "white" },
      "PSA-1730ShiftSolid": { bgColor: "#546070", color: "white" },
      "PSA-1730ShiftOutline": { bgColor: "white", borderColor: "#546070", borderWidth: "3px", color: "#546070" },

      "PSA-1715Shift": { bgColor: "#445060", color: "white" },
      "PSA-1715ShiftSolid": { bgColor: "#445060", color: "white" },
      "PSA-1715ShiftOutline": { bgColor: "white", borderColor: "#445060", borderWidth: "3px", color: "#445060" },

      "PSA-1800Shift": { bgColor: "#344050", color: "white" },
      "PSA-1800ShiftSolid": { bgColor: "#344050", color: "white" },
      "PSA-1800ShiftOutline": { bgColor: "white", borderColor: "#344050", borderWidth: "3px", color: "#344050" },

      // --- PSA non-working ---
      OFFShift: { bgColor: "#7C8087", color: "white" },
      OFFShiftSolid: { bgColor: "#7C8087", color: "white" },
      OFFShiftOutline: { bgColor: "white", borderColor: "#7C8087", borderWidth: "3px", color: "#7C8087" },

      RESTShift: { bgColor: "#94A3B8", color: "white" },
      RESTShiftSolid: { bgColor: "#94A3B8", color: "white" },
      RESTShiftOutline: { bgColor: "white", borderColor: "#94A3B8", borderWidth: "3px", color: "#94A3B8" },
    },
  },
});

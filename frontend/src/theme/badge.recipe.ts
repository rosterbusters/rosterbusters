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
      ALShift: { bgColor: "#94A3B8", color: "white" },
      ALShiftOutline: {
        bgColor: "white",
        borderColor: "#94A3B8",
        borderWidth: "3px",
        color: "#94A3B8",
      },
      ALShiftSolid: {
        bgColor: "#94A3B8",
        color: "white",
      },

      probation: { bgColor: "#D97706", color: "white" },

      // --- Leave types (gray/slate) ---
      MCShift: { bgColor: "#64748B", color: "white" },
      MCShiftSolid: { bgColor: "#64748B", color: "white" },
      MCShiftOutline: { bgColor: "white", borderColor: "#64748B", borderWidth: "3px", color: "#64748B" },

      CCLShift: { bgColor: "#6B7280", color: "white" },
      CCLShiftSolid: { bgColor: "#6B7280", color: "white" },
      CCLShiftOutline: { bgColor: "white", borderColor: "#6B7280", borderWidth: "3px", color: "#6B7280" },

      MLShift: { bgColor: "#475569", color: "white" },
      MLShiftSolid: { bgColor: "#475569", color: "white" },
      MLShiftOutline: { bgColor: "white", borderColor: "#475569", borderWidth: "3px", color: "#475569" },

      EMLShift: { bgColor: "#4B5563", color: "white" },
      EMLShiftSolid: { bgColor: "#4B5563", color: "white" },
      EMLShiftOutline: { bgColor: "white", borderColor: "#4B5563", borderWidth: "3px", color: "#4B5563" },

      MarShift: { bgColor: "#334155", color: "white" },
      MarShiftSolid: { bgColor: "#334155", color: "white" },
      MarShiftOutline: { bgColor: "white", borderColor: "#334155", borderWidth: "3px", color: "#334155" },

      FCLShift: { bgColor: "#374151", color: "white" },
      FCLShiftSolid: { bgColor: "#374151", color: "white" },
      FCLShiftOutline: { bgColor: "white", borderColor: "#374151", borderWidth: "3px", color: "#374151" },

      SPLShift: { bgColor: "#71717A", color: "white" },
      SPLShiftSolid: { bgColor: "#71717A", color: "white" },
      SPLShiftOutline: { bgColor: "white", borderColor: "#71717A", borderWidth: "3px", color: "#71717A" },

      CLShift: { bgColor: "#52525B", color: "white" },
      CLShiftSolid: { bgColor: "#52525B", color: "white" },
      CLShiftOutline: { bgColor: "white", borderColor: "#52525B", borderWidth: "3px", color: "#52525B" },

      BDLShift: { bgColor: "#3F3F46", color: "white" },
      BDLShiftSolid: { bgColor: "#3F3F46", color: "white" },
      BDLShiftOutline: { bgColor: "white", borderColor: "#3F3F46", borderWidth: "3px", color: "#3F3F46" },

      // --- Rest Day ---
      RDShift: { bgColor: "#737373", color: "white" },
      RDShiftSolid: { bgColor: "#737373", color: "white" },
      RDShiftOutline: { bgColor: "white", borderColor: "#737373", borderWidth: "3px", color: "#737373" },

      "RD-AShift": { bgColor: "#525252", color: "white" },
      "RD-AShiftSolid": { bgColor: "#525252", color: "white" },
      "RD-AShiftOutline": { bgColor: "white", borderColor: "#525252", borderWidth: "3px", color: "#525252" },

      "RD-DShift": { bgColor: "#404040", color: "white" },
      "RD-DShiftSolid": { bgColor: "#404040", color: "white" },
      "RD-DShiftOutline": { bgColor: "white", borderColor: "#404040", borderWidth: "3px", color: "#404040" },

      "RD-NShift": { bgColor: "#292929", color: "white" },
      "RD-NShiftSolid": { bgColor: "#292929", color: "white" },
      "RD-NShiftOutline": { bgColor: "white", borderColor: "#292929", borderWidth: "3px", color: "#292929" },

      "RD-PShift": { bgColor: "#616161", color: "white" },
      "RD-PShiftSolid": { bgColor: "#616161", color: "white" },
      "RD-PShiftOutline": { bgColor: "white", borderColor: "#616161", borderWidth: "3px", color: "#616161" },

      // --- Holiday ---
      HOLShift: { bgColor: "#78716C", color: "white" },
      HOLShiftSolid: { bgColor: "#78716C", color: "white" },
      HOLShiftOutline: { bgColor: "white", borderColor: "#78716C", borderWidth: "3px", color: "#78716C" },

      "HOL-AShift": { bgColor: "#57534E", color: "white" },
      "HOL-AShiftSolid": { bgColor: "#57534E", color: "white" },
      "HOL-AShiftOutline": { bgColor: "white", borderColor: "#57534E", borderWidth: "3px", color: "#57534E" },

      "HOL-DShift": { bgColor: "#44403C", color: "white" },
      "HOL-DShiftSolid": { bgColor: "#44403C", color: "white" },
      "HOL-DShiftOutline": { bgColor: "white", borderColor: "#44403C", borderWidth: "3px", color: "#44403C" },

      "HOL-NShift": { bgColor: "#292524", color: "white" },
      "HOL-NShiftSolid": { bgColor: "#292524", color: "white" },
      "HOL-NShiftOutline": { bgColor: "white", borderColor: "#292524", borderWidth: "3px", color: "#292524" },

      "HOL-PShift": { bgColor: "#6A6460", color: "white" },
      "HOL-PShiftSolid": { bgColor: "#6A6460", color: "white" },
      "HOL-PShiftOutline": { bgColor: "white", borderColor: "#6A6460", borderWidth: "3px", color: "#6A6460" },

      // --- Day Off OT variants ---
      "DO-AShift": { bgColor: "#8C8C8C", color: "white" },
      "DO-AShiftSolid": { bgColor: "#8C8C8C", color: "white" },
      "DO-AShiftOutline": { bgColor: "white", borderColor: "#8C8C8C", borderWidth: "3px", color: "#8C8C8C" },

      "DO-DShift": { bgColor: "#7A7A7A", color: "white" },
      "DO-DShiftSolid": { bgColor: "#7A7A7A", color: "white" },
      "DO-DShiftOutline": { bgColor: "white", borderColor: "#7A7A7A", borderWidth: "3px", color: "#7A7A7A" },

      "DO-NShift": { bgColor: "#686868", color: "white" },
      "DO-NShiftSolid": { bgColor: "#686868", color: "white" },
      "DO-NShiftOutline": { bgColor: "white", borderColor: "#686868", borderWidth: "3px", color: "#686868" },

      "DO-PShift": { bgColor: "#565656", color: "white" },
      "DO-PShiftSolid": { bgColor: "#565656", color: "white" },
      "DO-PShiftOutline": { bgColor: "white", borderColor: "#565656", borderWidth: "3px", color: "#565656" },

      // --- AM shift variants ---
      "A-ADDShift": { bgColor: "#7A9AB0", color: "white" },
      "A-ADDShiftSolid": { bgColor: "#7A9AB0", color: "white" },
      "A-ADDShiftOutline": { bgColor: "white", borderColor: "#7A9AB0", borderWidth: "3px", color: "#7A9AB0" },

      "A-OShift": { bgColor: "#6A8A9E", color: "white" },
      "A-OShiftSolid": { bgColor: "#6A8A9E", color: "white" },
      "A-OShiftOutline": { bgColor: "white", borderColor: "#6A8A9E", borderWidth: "3px", color: "#6A8A9E" },

      // --- PM shift variant ---
      "P-ADDShift": { bgColor: "#607D8B", color: "white" },
      "P-ADDShiftSolid": { bgColor: "#607D8B", color: "white" },
      "P-ADDShiftOutline": { bgColor: "white", borderColor: "#607D8B", borderWidth: "3px", color: "#607D8B" },

      // --- Night shift variants ---
      "N-12Shift": { bgColor: "#2D3748", color: "white" },
      "N-12ShiftSolid": { bgColor: "#2D3748", color: "white" },
      "N-12ShiftOutline": { bgColor: "white", borderColor: "#2D3748", borderWidth: "3px", color: "#2D3748" },

      "N-OTShift": { bgColor: "#3A4A5C", color: "white" },
      "N-OTShiftSolid": { bgColor: "#3A4A5C", color: "white" },
      "N-OTShiftOutline": { bgColor: "white", borderColor: "#3A4A5C", borderWidth: "3px", color: "#3A4A5C" },

      "N-PHShift": { bgColor: "#4A5568", color: "white" },
      "N-PHShiftSolid": { bgColor: "#4A5568", color: "white" },
      "N-PHShiftOutline": { bgColor: "white", borderColor: "#4A5568", borderWidth: "3px", color: "#4A5568" },

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

      FDShift: { bgColor: "#A1A1AA", color: "white" },
      FDShiftSolid: { bgColor: "#A1A1AA", color: "white" },
      FDShiftOutline: { bgColor: "white", borderColor: "#A1A1AA", borderWidth: "3px", color: "#A1A1AA" },

      SDShift: { bgColor: "#9CA3AF", color: "white" },
      SDShiftSolid: { bgColor: "#9CA3AF", color: "white" },
      SDShiftOutline: { bgColor: "white", borderColor: "#9CA3AF", borderWidth: "3px", color: "#9CA3AF" },

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
      OFFShift: { bgColor: "#9EA6B0", color: "white" },
      OFFShiftSolid: { bgColor: "#9EA6B0", color: "white" },
      OFFShiftOutline: { bgColor: "white", borderColor: "#9EA6B0", borderWidth: "3px", color: "#9EA6B0" },

      RESTShift: { bgColor: "#718096", color: "white" },
      RESTShiftSolid: { bgColor: "#718096", color: "white" },
      RESTShiftOutline: { bgColor: "white", borderColor: "#718096", borderWidth: "3px", color: "#718096" },
    },
  },
});

import { createListCollection } from "@chakra-ui/react";
export interface Shift {
  shiftCode:string,
  start: Date;
  end: Date;
}

// export const shiftCodes: Record<string, string>={
//     "A":"AM Shift",
//     "P":"PM Shift",
//     "D":"DAY Shift",
//     "DO":"DAY OFF",
//     "N":"NIGHT Shift",
//     "AL": "ANNUAL LEAVE"
// };
export const shiftCollection = createListCollection({
  items: [
    {
      value: "A",
      label: "AM",
      description: "0700-1530 (AM SHIFT)"
    },
    {
      value: "P",
      label: "PM",
      description: "1300-2130 (PM SHIFT)"
    },
    {
      value: "N",
      label: "NIGHT",
      description: "2030-0730 (NIGHT SHIFT)"
    },
    {
      value: "D",
      label: "DAY",
      description: "0700-1900 (DAY SHIFT)"
    },
    {
      value: "DO",
      label: "Day Off",
      description: "Day Off"
    },
    {
      value: "AL",
      label: "Annual Leave",
      description: "Annual Leave"
    }
  ]
});
// export const shiftCollection = createListCollection({
//   items: Object.entries(shiftCodes).map(([code, description]) => ({
//     label: description,  // "AM", "PM", "DAY", etc.
//     value: code          // "A", "P", "D", etc.
//   }))
// });
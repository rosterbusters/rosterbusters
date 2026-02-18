import { Badge } from "@chakra-ui/react"
interface CalendarRequestBlockProps{
    shift:string;
    owned?:boolean;
    nurseName?: string;
    onClick?: () => void;
}

export function CalendarRequestBlock({shift,owned,nurseName,onClick}:CalendarRequestBlockProps){

    return(
        <Badge
            textWrap="wrap"
            variant={owned?`${shift}ShiftSolid`:`${shift}ShiftOutline` as any}
            py={2}
            gap={2}
            onClick={onClick ? (e) => { e.stopPropagation(); onClick(); } : undefined}
            cursor={onClick ? "pointer" : undefined}
        >
            <Badge variant={`${shift}Shift` as any}>
            {shift}
            </Badge>
            {nurseName ?? ""}
        </Badge>
    )
}

import { Badge,Box } from "@chakra-ui/react"
interface CalendarRequestBlockProps{
    shift:string;
    owned?:boolean;
}

export function CalendarRequestBlock({shift,owned}:CalendarRequestBlockProps){
    
    return(
        <Badge textWrap="wrap" variant={`${shift}ShiftOutline` as any} py={2} gap={2}>
            <Badge variant={`${shift}Shift` as any}>
            {shift}
            </Badge>
            John Doe, Mary Sue
            </Badge>
    )
}
import { Badge,Box } from "@chakra-ui/react"
interface CalendarRequestBlockProps{
    shift:string;
}

export function CalendarRequestBlock({shift}:CalendarRequestBlockProps){
    
    return(
        <Badge textWrap="wrap" variant={`${shift}ShiftOutline` as any} py={2} gap={2}>
            <Badge variant={`${shift}Shift` as any}>
            {shift}
            </Badge>
            John Doe, Mary Sue
            </Badge>
    )
}
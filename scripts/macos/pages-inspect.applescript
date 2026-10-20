use framework "Foundation"
use scripting additions
on flag(valueToEncode)
    if valueToEncode then return "true"
    return "false"
end flag
on canonical(theText)
    set sourceText to current application's NSString's stringWithString:(theText as text)
    set sourceText to sourceText's stringByReplacingOccurrencesOfString:(return & linefeed) withString:linefeed
    set sourceText to sourceText's stringByReplacingOccurrencesOfString:return withString:linefeed
    set sourceText to sourceText's stringByReplacingOccurrencesOfString:(character id 12) withString:""
    return (sourceText's stringByTrimmingCharactersInSet:(current application's NSCharacterSet's whitespaceAndNewlineCharacterSet())) as text
end canonical
on run argv
    if (count of argv) is not 3 then error "INVALID_INPUT"
    set targetPath to item 1 of argv
    set expectedFirst to my canonical(item 2 of argv)
    set expectedSecond to my canonical(item 3 of argv)
    set matchedDoc to missing value
    set firstOK to false
    set secondOK to false
    tell application id "com.apple.iWork.Pages"
        with timeout of 10 seconds
            repeat 40 times
                repeat with candidate in documents
                    try
                        if (POSIX path of (file of candidate as alias)) is targetPath then
                            set matchedDoc to contents of candidate
                            exit repeat
                        end if
                    end try
                end repeat
                if matchedDoc is not missing value then exit repeat
                delay 0.2
            end repeat
            if matchedDoc is missing value then error "GENERATED_DOCUMENT_NOT_OPEN"
            set pageTotal to count of pages of matchedDoc
            set editableOK to document body of matchedDoc
            if pageTotal is 2 then
                set firstOK to (my canonical(body text of page 1 of matchedDoc) is expectedFirst)
                set secondOK to (my canonical(body text of page 2 of matchedDoc) is expectedSecond)
            end if
            set fontName to font of body text of matchedDoc as text
            set fontOK to ((fontName contains "AppleSDGothicNeo") or (fontName contains "Apple SD Gothic Neo"))
        end timeout
    end tell
    return "{\"pageCount\":" & pageTotal & ",\"pageContentMatches\":[" & my flag(firstOK) & "," & my flag(secondOK) & "],\"bodyEditable\":" & my flag(editableOK) & ",\"fontMatches\":" & my flag(fontOK) & "}"
end run

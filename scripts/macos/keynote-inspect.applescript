-- Read only inspection of the exact file created by the engine.
on flag(valueToEncode)
    if valueToEncode then return "true"
    return "false"
end flag
on run argv
    if (count of argv) is not 4 then error "INVALID_INPUT"
    set targetPath to item 1 of argv
    set expectedTitle to item 2 of argv
    set expectedBody to item 3 of argv
    set expectedNotes to item 4 of argv
    set matchedDoc to missing value
    tell application id "com.apple.iWork.Keynote"
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
        set slideTotal to count of slides of matchedDoc
        set sizeOK to (width of matchedDoc is 1920 and height of matchedDoc is 1080)
        tell slide 1 of matchedDoc
            set titleOK to ((object text of default title item as text) is expectedTitle)
            set bodyOK to ((object text of default body item as text) is expectedBody)
            set notesOK to ((presenter notes as text) is expectedNotes)
        end tell
    end tell
    return "{\"slideCount\":" & slideTotal & ",\"titleMatches\":" & my flag(titleOK) & ",\"bodyMatches\":" & my flag(bodyOK) & ",\"notesMatch\":" & my flag(notesOK) & ",\"dimensionsMatch\":" & my flag(sizeOK) & "}"
end run

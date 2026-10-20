-- Original source. Arguments are data, not executable AppleScript.
on run argv
    if (count of argv) is not 3 then error "INVALID_INPUT"
    set targetPath to item 1 of argv
    set firstPageText to item 2 of argv
    set secondPageText to item 3 of argv
    set createdDoc to missing value
    set saveAcknowledged to true
    tell application id "com.apple.iWork.Pages"
        with timeout of 15 seconds
            try
                set createdDoc to make new document with properties {document template:template id "Application/Blank/ISO"}
                set body text of createdDoc to firstPageText & (character id 12) & secondPageText
                set font of body text of createdDoc to "Apple SD Gothic Neo"
                set size of body text of createdDoc to 12
                set size of paragraph 1 of body text of createdDoc to 22
                set size of paragraph 2 of body text of createdDoc to 16
                if (count of pages of createdDoc) is 2 then set size of paragraph 1 of body text of page 2 of createdDoc to 16
                try
                    with timeout of 5 seconds
                        save createdDoc in POSIX file targetPath
                    end timeout
                on error errorText number errorNumber
                    if errorNumber is not -1712 then error errorText number errorNumber
                    set saveAcknowledged to false
                end try
                close createdDoc saving no
                if saveAcknowledged then return "{\"saveAcknowledged\":true}"
                return "{\"saveAcknowledged\":false}"
            on error errorText number errorNumber
                if createdDoc is not missing value then
                    try
                        close createdDoc saving no
                    end try
                end if
                error errorText number errorNumber
            end try
        end timeout
    end tell
end run

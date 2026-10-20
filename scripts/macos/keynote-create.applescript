-- Original implementation, fixed source. User content is argv data only.
on run argv
    if (count of argv) is not 4 then error "INVALID_INPUT"
    set targetPath to item 1 of argv
    set titleText to item 2 of argv
    set bodyText to item 3 of argv
    set notesText to item 4 of argv
    set createdDoc to missing value
    set saveAcknowledged to true
    tell application id "com.apple.iWork.Keynote"
        try
            set createdDoc to make new document with properties {width:1920, height:1080}
            log "EDUAPPLE_STAGE_CREATED"
            try
                with timeout of 5 seconds
                    save createdDoc in POSIX file targetPath
                end timeout
            on error errorText number errorNumber
                if errorNumber is not -1712 then error errorText number errorNumber
                set saveAcknowledged to false
                log "EDUAPPLE_STAGE_INITIAL_SAVE_REPLY_TIMEOUT"
            end try
            tell slide 1 of createdDoc
                set title showing to true
                set body showing to true
                set object text of default title item to titleText
                set object text of default body item to bodyText
                set presenter notes to notesText
            end tell
            log "EDUAPPLE_STAGE_CONTENT_SET"
            try
                with timeout of 5 seconds
                    save createdDoc
                end timeout
            on error errorText number errorNumber
                if errorNumber is not -1712 then error errorText number errorNumber
                set saveAcknowledged to false
                log "EDUAPPLE_STAGE_SAVE_REPLY_TIMEOUT"
            end try
            close createdDoc saving no
            log "EDUAPPLE_STAGE_CLOSED"
            if saveAcknowledged then return "{\"saveAcknowledged\":true}"
            return "{\"saveAcknowledged\":false}"
        on error errorText number errorNumber
            -- Only this new document may be closed; never touch other documents.
            if createdDoc is not missing value then
                try
                    close createdDoc saving no
                end try
            end if
            error errorText number errorNumber
        end try
    end tell
end run
